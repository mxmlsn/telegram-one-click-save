// Emoji packs definition
// Order: red, orange, yellow, green, blue, purple, black, white
const EMOJI_PACKS = {
  standard: ['🔴', '🟠', '🟡', '🟢', '🔵', '🟣', '⚫️', '⚪️'],
  hearts: ['❤️', '🧡', '💛', '💚', '💙', '💜', '🖤', '🤍'],
  cute: ['🍄', '🍊', '🐤', '🐸', '💧', '🔮', '🌚', '💭'],
  random: ['📌', '☢️', '📒', '🔋', '📪', '☮️', '🎥', '📁']
};

// Color ID to index mapping (for emoji pack lookup)
const COLOR_ID_TO_INDEX = {
  'red': 0,
  'orange': 1,
  'yellow': 2,
  'green': 3,
  'blue': 4,
  'purple': 5,
  'black': 6,
  'white': 7
};

// Default settings
const DEFAULT_SETTINGS = {
  botToken: '',
  chatId: '',
  addScreenshot: true,
  imageCompression: true,
  showLinkPreview: true,
  showSelectionIcon: true,
  iconColor: 'circle1',
  useHashtags: true,
  tagImage: '#image',
  tagLink: '#link',
  tagQuote: '#quote',
  enableQuickTags: true,
  sendWithColor: true,
  timerDuration: 4, // Timer duration in seconds (3-9)
  emojiPack: 'standard',
  // Fixed 8 tags default structure
  customTags: [
    { name: '', color: '#377CDE', id: 'blue' },
    { name: '', color: '#3D3D3B', id: 'black' },
    { name: '', color: '#4ED345', id: 'green' },
    { name: '', color: '#BB4FFF', id: 'purple' },
    { name: '', color: '#DEDEDE', id: 'white' },
    { name: '', color: '#E64541', id: 'red' },
    { name: '', color: '#EC9738', id: 'orange' },
    { name: '', color: '#FFDE42', id: 'yellow' }
  ]
};

// Get emoji for a tag based on selected pack
function getEmojiForTag(tag, emojiPack = 'standard') {
  if (!tag || !tag.id) return '';
  const index = COLOR_ID_TO_INDEX[tag.id];
  if (index === undefined) return '';
  const pack = EMOJI_PACKS[emojiPack] || EMOJI_PACKS.standard;
  return pack[index] || '';
}

// Update extension icon
function updateIcon(color) {
  chrome.action.setIcon({
    path: {
      16: `icons/icon-${color}-16.png`,
      48: `icons/icon-${color}-48.png`,
      128: `icons/icon-${color}-128.png`
    }
  });
}

// Listen for settings changes
chrome.storage.onChanged.addListener((changes) => {
  if (changes.iconColor) {
    updateIcon(changes.iconColor.newValue);
  }
});

// Set icon on startup
chrome.storage.local.get({ iconColor: 'circle1' }, (result) => {
  updateIcon(result.iconColor);
});

// Cache settings for instant toast display
let cachedSettings = null;

// Load settings into cache on startup
chrome.storage.local.get(DEFAULT_SETTINGS, (result) => {
  cachedSettings = { ...DEFAULT_SETTINGS, ...result };
});

// Update cache when settings change
chrome.storage.onChanged.addListener((changes) => {
  if (cachedSettings) {
    for (const key of Object.keys(changes)) {
      cachedSettings[key] = changes[key].newValue;
    }
  }
});

// Create context menu on install
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: 'pocketIt',
    title: 'Pocket it',
    contexts: ['page', 'frame', 'link', 'image', 'selection']
  });
});

// Handle context menu clicks
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  const clickTime = Date.now();
  console.log('[TG Saver] Context menu clicked at', clickTime);

  if (info.menuItemId !== 'pocketIt') return;

  // CRITICAL: Show toast IMMEDIATELY, before any async operations
  // Use cached settings for instant UI, load fresh settings in parallel
  const cachedTags = cachedSettings?.customTags;
  const quickTagsEnabled = cachedSettings?.enableQuickTags !== false;
  const hasNonEmptyTags = cachedTags && cachedTags.some(t => t.name && t.name.trim());

  // Start settings load in parallel (non-blocking)
  const settingsPromise = getSettings();

  // Show tag selection toast IMMEDIATELY if we have cached tags with names
  let tagSelectionPromise = null;
  if (quickTagsEnabled && hasNonEmptyTags) {
    tagSelectionPromise = showTagSelection(tab.id, cachedTags);
  } else {
    // No tags - show pending toast immediately
    showToast(tab.id, 'pending', 'Sending');
  }

  // Now wait for settings
  const settings = await settingsPromise;

  if (!settings.botToken || !settings.chatId) {
    chrome.runtime.openOptionsPage();
    return;
  }

  // Wait for tag selection if we started it
  let selectedTag = null;
  if (tagSelectionPromise) {
    selectedTag = await tagSelectionPromise;
    if (selectedTag === '__CANCELLED__') {
      return;
    }
  }

  // Handle different content types
  if (info.srcUrl) {
    // Image from context menu
    await sendImageDirect(info.srcUrl, tab.url, settings, tab.id, selectedTag);
  } else if (info.selectionText) {
    // Selected text
    await sendQuoteDirect(info.selectionText, tab.url, settings, tab.id, selectedTag);
  } else if (info.linkUrl) {
    // Link
    await sendLinkDirect(info.linkUrl, tab.url, settings, tab.id, selectedTag);
  } else {
    // Page click - detect media under cursor
    await sendImageFromPageDirect(tab, settings, selectedTag);
  }
});

// Handle toolbar icon click
chrome.action.onClicked.addListener(async (tab) => {
  const settings = await getSettings();

  if (!settings.botToken || !settings.chatId) {
    chrome.runtime.openOptionsPage();
    return;
  }

  await sendScreenshot(tab, settings);
});

// Pending requests waiting for tag selection
const pendingRequests = new Map();
const cancelledRequests = new Set();

// Handle messages from content script (selection icon)
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'sendQuoteFromSelection') {
    (async () => {
      const settings = await getSettings();

      if (!settings.botToken || !settings.chatId) {
        chrome.runtime.openOptionsPage();
        return;
      }

      const tabId = sender.tab?.id;
      await sendQuoteWithTabId(message.text, sender.tab.url, settings, tabId);
    })();
  } else if (message.action === 'getSettings') {
    getSettings().then(settings => {
      sendResponse({ showSelectionIcon: settings.showSelectionIcon });
    });
    return true; // async response
  } else if (message.action === 'tagSelected') {
    // Check if this request was cancelled
    if (cancelledRequests.has(message.requestId)) {
      cancelledRequests.delete(message.requestId);
      pendingRequests.delete(message.requestId);
      return;
    }

    const pending = pendingRequests.get(message.requestId);
    if (pending) {
      pendingRequests.delete(message.requestId);
      pending.resolve(message.selectedTag);
    }
  } else if (message.action === 'cancelSend') {
    // Mark request as cancelled
    cancelledRequests.add(message.requestId);
    const pending = pendingRequests.get(message.requestId);
    if (pending) {
      pendingRequests.delete(message.requestId);
      pending.resolve('__CANCELLED__'); // Special marker for cancelled requests
    }
  }
});

// Get settings from storage
async function getSettings() {
  const result = await chrome.storage.local.get(DEFAULT_SETTINGS);
  return { ...DEFAULT_SETTINGS, ...result };
}

// Format URL for display
function formatUrl(url) {
  let clean = url.replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/$/, '');

  if (clean.length <= 35) {
    return { text: clean, isLink: false, fullUrl: url };
  }

  const domain = clean.split('/')[0];
  return { text: domain, isLink: true, fullUrl: url };
}

// Build caption with URL
function buildCaption(url, tag, extraText = '', settings = {}, selectedTag = null) {
  const formatted = formatUrl(url);
  const useHashtags = settings.useHashtags !== false;
  const quoteMonospace = settings.quoteMonospace !== false;
  let caption = '';

  if (extraText) {
    if (quoteMonospace) {
      caption += `<code>${extraText.slice(0, 3900)}</code>\n\n`;
    } else {
      caption += `${extraText.slice(0, 3900)}\n\n`;
    }
  } else {
    // Add empty braille space + newline before tag for visual separation
    caption += '⠀\n';
  }

  // Build tag parts: [emoji] [selectedTag] | [typeTag] | [url]
  let parts = [];

  // Add selected custom tag if present
  if (selectedTag && selectedTag.name) {
    let tagText = `#${selectedTag.name}`;

    // Prepend emoji if enabled
    if (settings.sendWithColor) {
      const emoji = getEmojiForTag(selectedTag, settings.emojiPack);
      if (emoji) {
        tagText = `${emoji} ${tagText}`;
      }
    }

    parts.push(tagText);
  }

  // Add type tag if hashtags enabled
  if (useHashtags) {
    parts.push(tag);
  }

  // Add URL
  if (formatted.isLink) {
    parts.push(`<a href="${formatted.fullUrl}">${formatted.text}</a>`);
  } else {
    parts.push(formatted.text);
  }

  // Filter out any empty parts before joining
  caption += parts.filter(p => p && p.trim()).join(' | ');

  return caption;
}

// Show toast notification on page
async function showToast(tabId, state, message) {
  try {
    // Content script is already loaded via manifest.json
    // Just send the message
    await chrome.tabs.sendMessage(tabId, {
      action: 'showToast',
      state,
      message
    });
  } catch (e) {
    console.error('Failed to show toast:', e);
  }
}

// Show tag selection toast and wait for response
async function showTagSelection(tabId, customTags) {
  const requestId = Date.now().toString() + Math.random().toString(36).substr(2, 9);

  // Create promise that will be resolved when tag is selected
  const tagPromise = new Promise((resolve) => {
    pendingRequests.set(requestId, { resolve });

    // Timeout fallback (30 seconds - user may be hovering)
    setTimeout(() => {
      if (pendingRequests.has(requestId)) {
        pendingRequests.delete(requestId);
        resolve(null);
      }
    }, 30000);
  });

  // Send minimal message - content script uses its LOCAL cache for tags
  chrome.tabs.sendMessage(tabId, {
    action: 'preShowToast',
    requestId: requestId
  }).catch(() => {});

  return tagPromise;
}

// Send screenshot of current tab
async function sendScreenshot(tab, settings) {
  // Start capture immediately (non-blocking)
  const capturePromise = chrome.tabs.captureVisibleTab(null, { format: 'png' });

  // Show tag selection if custom tags exist and enabled (runs in parallel with capture)
  let selectedTag = null;
  if (settings.enableQuickTags && settings.customTags && settings.customTags.length > 0) {
    selectedTag = await showTagSelection(tab.id, settings.customTags);
    // Check if cancelled
    if (selectedTag === '__CANCELLED__') {
      return;
    }
  } else {
    await showToast(tab.id, 'pending', 'Sending');
  }

  // Wait for capture to complete
  const dataUrl = await capturePromise;

  if (!settings.addScreenshot) {
    // Send just the link without screenshot
    await sendMessage(tab.url, settings, selectedTag);
    await showToast(tab.id, 'success', 'Success');
    return;
  }

  const blob = await fetch(dataUrl).then(r => r.blob());
  const caption = buildCaption(tab.url, settings.tagLink, '', settings, selectedTag);

  await sendPhoto(blob, caption, settings);
  await showToast(tab.id, 'success', 'Success');
}

// Send image from context menu
async function sendImage(imageUrl, pageUrl, settings, tabId = null, selectedTag = null) {
  // tabId should always be provided by caller now
  if (!tabId) {
    console.error('sendImage called without tabId');
    return;
  }

  // SHOW TOAST IMMEDIATELY - before any async operations
  let tagSelectionShown = false;
  if (selectedTag === null && settings.enableQuickTags && settings.customTags && settings.customTags.length > 0 && tabId) {
    // Show tag selection toast instantly
    const tagPromise = showTagSelection(tabId, settings.customTags);
    tagSelectionShown = true;

    // Start fetching image in parallel (non-blocking)
    const blobPromise = fetch(imageUrl)
      .then(response => {
        if (!response.ok) throw new Error('Failed to fetch image');
        return response.blob();
      })
      .catch(e => {
        console.error('Image fetch error, using screenshot fallback:', e);
        return null; // Signal to use screenshot
      });

    // Wait for user to select tag
    selectedTag = await tagPromise;
    if (selectedTag === '__CANCELLED__') {
      return;
    }

    // Wait for image fetch to complete
    let blob = await blobPromise;
    let useScreenshot = false;

    // If fetch failed, take screenshot
    if (!blob && tabId) {
      useScreenshot = true;
      const screenshotDataUrl = await chrome.tabs.captureVisibleTab(null, { format: 'png' });
      blob = await fetch(screenshotDataUrl).then(r => r.blob());
    }

    const caption = buildCaption(pageUrl, settings.tagImage, '', settings, selectedTag);

    if (settings.imageCompression || useScreenshot) {
      await sendPhoto(blob, caption, settings);
    } else {
      await sendDocument(blob, caption, settings, imageUrl);
    }

    if (tabId) await showToast(tabId, 'success', 'Success');
  } else {
    // No tag selection - show pending toast instantly
    if (tabId && !selectedTag) {
      await showToast(tabId, 'pending', 'Sending');
    }

    // Fetch image
    let blob;
    let useScreenshot = false;

    try {
      const response = await fetch(imageUrl);
      if (!response.ok) throw new Error('Failed to fetch image');
      blob = await response.blob();
    } catch (e) {
      console.error('Image fetch error, using screenshot fallback:', e);
      useScreenshot = true;
    }

    // If fetch failed, take screenshot
    if (useScreenshot && tabId) {
      const screenshotDataUrl = await chrome.tabs.captureVisibleTab(null, { format: 'png' });
      blob = await fetch(screenshotDataUrl).then(r => r.blob());
    }

    const caption = buildCaption(pageUrl, settings.tagImage, '', settings, selectedTag);

    if (settings.imageCompression || useScreenshot) {
      await sendPhoto(blob, caption, settings);
    } else {
      await sendDocument(blob, caption, settings, imageUrl);
    }

    if (tabId) await showToast(tabId, 'success', 'Success');
  }
}

// Send image or video found under cursor (for sites like Instagram)
async function sendImageFromPage(tab, settings) {
  const tabId = tab.id;
  const isInstagram = tab.url.includes('instagram.com');

  // SHOW TAG SELECTION IMMEDIATELY - before detecting media type
  const tagSelectionPromise = (settings.enableQuickTags && settings.customTags && settings.customTags.length > 0)
    ? showTagSelection(tabId, settings.customTags)
    : Promise.resolve(null);

  // Find image or video under cursor via content script (runs in parallel)
  // Rule: only detect as image if clicked DIRECTLY on <img> or <video> element
  // (browser would show "Save image as" in context menu for these)
  // Exception: Instagram - images are hidden behind overlay divs
  const results = await chrome.scripting.executeScript({
    target: { tabId },
    func: (isInstagram) => {
      const el = window.__tgSaverLastRightClicked;
      if (!el) return { type: null };

      // For non-Instagram: STRICT mode
      // Only detect media if the clicked element IS the media or its direct wrapper
      if (!isInstagram) {
        // Check if clicked element is a video
        if (el.tagName === 'VIDEO') {
          return { type: 'video', src: el.src || el.currentSrc };
        }

        // Check if clicked element is an image
        if (el.tagName === 'IMG') {
          return { type: 'image', src: el.src };
        }

        // Not directly on media - treat as page click (send link/screenshot)
        return { type: null };
      }

      // Instagram: aggressive search (images hidden behind overlays)
      // Check for video first
      let video = el.closest('video') || el.querySelector('video');
      if (!video) {
        video = el.closest('[aria-label*="Video"], [role="group"]')?.querySelector('video');
      }
      if (!video) {
        let parent = el.parentElement;
        for (let i = 0; i < 5 && parent; i++) {
          video = parent.querySelector('video');
          if (video) break;
          parent = parent.parentElement;
        }
      }

      if (video) {
        return { type: 'video', src: video.src || video.currentSrc };
      }

      // Check for image
      let img = el.closest('img') || el.querySelector('img');
      if (!img) {
        img = el.closest('[class*="image"], [class*="photo"], [class*="media"]')?.querySelector('img');
      }
      if (!img) {
        let parent = el.parentElement;
        for (let i = 0; i < 5 && parent; i++) {
          img = parent.querySelector('img');
          if (img) break;
          parent = parent.parentElement;
        }
      }

      if (img) {
        return { type: 'image', src: img.src };
      }

      return { type: null };
    },
    args: [isInstagram]
  });

  const media = results[0]?.result;

  // Wait for tag selection to complete
  let selectedTag = await tagSelectionPromise;
  if (selectedTag === '__CANCELLED__') {
    return;
  }

  if (!media || !media.type) {
    // No media found - send screenshot + link
    await sendScreenshotWithTag(tab, settings, selectedTag);
    return;
  }

  if (media.type === 'video') {
    // For video: take screenshot and send with image tag
    await sendVideoAsScreenshot(tab, settings, selectedTag);
  } else {
    // For image: send as usual, pass selectedTag to avoid showing selection again
    await sendImageWithTag(media.src, tab.url, settings, tabId, selectedTag);
  }
}

// Send video as screenshot with #image tag
async function sendVideoAsScreenshot(tab, settings, selectedTag = null) {
  // Start capture immediately (non-blocking)
  const capturePromise = chrome.tabs.captureVisibleTab(null, { format: 'png' });

  // Show tag selection if custom tags exist and not already selected (runs in parallel)
  if (selectedTag === null && settings.enableQuickTags && settings.customTags && settings.customTags.length > 0) {
    selectedTag = await showTagSelection(tab.id, settings.customTags);
    // Check if cancelled
    if (selectedTag === '__CANCELLED__') {
      return;
    }
  } else if (!selectedTag) {
    await showToast(tab.id, 'pending', 'Sending');
  }

  // Wait for capture to complete
  const dataUrl = await capturePromise;
  const blob = await fetch(dataUrl).then(r => r.blob());

  const caption = buildCaption(tab.url, settings.tagImage, '', settings, selectedTag);

  await sendPhoto(blob, caption, settings);
  await showToast(tab.id, 'success', 'Success');
}

// Send screenshot with pre-selected tag (for sendImageFromPage flow)
async function sendScreenshotWithTag(tab, settings, selectedTag) {
  // Start capture immediately (non-blocking) if needed
  const capturePromise = settings.addScreenshot ? chrome.tabs.captureVisibleTab(null, { format: 'png' }) : null;

  if (!selectedTag) {
    await showToast(tab.id, 'pending', 'Sending');
  }

  if (!settings.addScreenshot) {
    await sendMessage(tab.url, settings, selectedTag);
    await showToast(tab.id, 'success', 'Success');
    return;
  }

  // Wait for capture to complete
  const dataUrl = await capturePromise;
  const blob = await fetch(dataUrl).then(r => r.blob());
  const caption = buildCaption(tab.url, settings.tagLink, '', settings, selectedTag);

  await sendPhoto(blob, caption, settings);
  await showToast(tab.id, 'success', 'Success');
}

// Send image with pre-selected tag (for sendImageFromPage flow)
async function sendImageWithTag(imageUrl, pageUrl, settings, tabId, selectedTag) {
  // SHOW TOAST FIRST - before any async operations
  if (!selectedTag) {
    // Show toast instantly, don't wait
    showToast(tabId, 'pending', 'Sending');
  }

  // Start fetching image (non-blocking)
  let blobPromise = fetch(imageUrl)
    .then(response => {
      if (!response.ok) throw new Error('Failed to fetch image');
      return response.blob();
    })
    .catch(e => {
      console.error('Image fetch error, using screenshot fallback:', e);
      return null; // Signal to use screenshot
    });

  // Wait for image fetch to complete
  let blob = await blobPromise;
  let useScreenshot = false;

  // If fetch failed, take screenshot
  if (!blob && tabId) {
    useScreenshot = true;
    const screenshotDataUrl = await chrome.tabs.captureVisibleTab(null, { format: 'png' });
    blob = await fetch(screenshotDataUrl).then(r => r.blob());
  }

  const caption = buildCaption(pageUrl, settings.tagImage, '', settings, selectedTag);

  if (settings.imageCompression || useScreenshot) {
    await sendPhoto(blob, caption, settings);
  } else {
    await sendDocument(blob, caption, settings, imageUrl);
  }

  if (tabId) await showToast(tabId, 'success', 'Success');
}

// Send quote from context menu
async function sendQuote(text, pageUrl, settings) {
  const tabId = (await chrome.tabs.query({ active: true, currentWindow: true }))[0]?.id;
  await sendQuoteWithTabId(text, pageUrl, settings, tabId);
}

// Send quote with explicit tabId (for selection icon)
async function sendQuoteWithTabId(text, pageUrl, settings, tabId) {
  // Show tag selection if custom tags exist
  let selectedTag = null;
  if (settings.enableQuickTags && settings.customTags && settings.customTags.length > 0 && tabId) {
    selectedTag = await showTagSelection(tabId, settings.customTags);
    // Check if cancelled
    if (selectedTag === '__CANCELLED__') {
      return;
    }
  } else if (tabId) {
    await showToast(tabId, 'pending', 'Sending');
  }

  const caption = buildCaption(pageUrl, settings.tagQuote, text, settings, selectedTag);
  await sendTextMessage(caption, settings);

  if (tabId) await showToast(tabId, 'success', 'Success');
}

// Send just a message (link without screenshot)
async function sendMessage(url, settings, selectedTag = null) {
  const caption = buildCaption(url, settings.tagLink, '', settings, selectedTag);
  await sendTextMessage(caption, settings);
}

// Telegram API: send text message
async function sendTextMessage(text, settings) {
  const response = await fetch(`https://api.telegram.org/bot${settings.botToken}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: settings.chatId,
      text: text,
      parse_mode: 'HTML',
      disable_web_page_preview: !settings.showLinkPreview
    })
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.description || 'Telegram API error');
  }

  return response.json();
}

// Telegram API: send photo
async function sendPhoto(blob, caption, settings) {
  const formData = new FormData();
  formData.append('chat_id', settings.chatId);
  formData.append('photo', blob, 'screenshot.png');
  formData.append('caption', caption);
  formData.append('parse_mode', 'HTML');

  const response = await fetch(`https://api.telegram.org/bot${settings.botToken}/sendPhoto`, {
    method: 'POST',
    body: formData
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.description || 'Telegram API error');
  }

  return response.json();
}

// Telegram API: send document (uncompressed)
async function sendDocument(blob, caption, settings, originalUrl) {
  const ext = originalUrl.split('.').pop()?.split('?')[0] || 'png';
  const filename = `image.${ext}`;

  const formData = new FormData();
  formData.append('chat_id', settings.chatId);
  formData.append('document', blob, filename);
  formData.append('caption', caption);
  formData.append('parse_mode', 'HTML');

  const response = await fetch(`https://api.telegram.org/bot${settings.botToken}/sendDocument`, {
    method: 'POST',
    body: formData
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.description || 'Telegram API error');
  }

  return response.json();
}

// ============ DIRECT FUNCTIONS (tag already selected) ============

// Send image directly (tag already selected via context menu handler)
async function sendImageDirect(imageUrl, pageUrl, settings, tabId, selectedTag) {
  // Start fetching image immediately
  const blobPromise = fetch(imageUrl)
    .then(response => {
      if (!response.ok) throw new Error('Failed to fetch image');
      return response.blob();
    })
    .catch(e => {
      console.error('Image fetch error, using screenshot fallback:', e);
      return null;
    });

  // Wait for image
  let blob = await blobPromise;
  let useScreenshot = false;

  if (!blob && tabId) {
    useScreenshot = true;
    const screenshotDataUrl = await chrome.tabs.captureVisibleTab(null, { format: 'png' });
    blob = await fetch(screenshotDataUrl).then(r => r.blob());
  }

  const caption = buildCaption(pageUrl, settings.tagImage, '', settings, selectedTag);

  if (settings.imageCompression || useScreenshot) {
    await sendPhoto(blob, caption, settings);
  } else {
    await sendDocument(blob, caption, settings, imageUrl);
  }

  if (tabId) await showToast(tabId, 'success', 'Success');
}

// Send quote directly (tag already selected via context menu handler)
async function sendQuoteDirect(text, pageUrl, settings, tabId, selectedTag) {
  const caption = buildCaption(pageUrl, settings.tagQuote, text, settings, selectedTag);
  await sendTextMessage(caption, settings);
  if (tabId) await showToast(tabId, 'success', 'Success');
}

// Send link directly (tag already selected via context menu handler)
async function sendLinkDirect(linkUrl, pageUrl, settings, tabId, selectedTag) {
  const caption = buildCaption(linkUrl, settings.tagLink, '', settings, selectedTag);
  await sendTextMessage(caption, settings);
  if (tabId) await showToast(tabId, 'success', 'Success');
}

// Send image from page directly (tag already selected via context menu handler)
async function sendImageFromPageDirect(tab, settings, selectedTag) {
  const tabId = tab.id;
  const isInstagram = tab.url.includes('instagram.com');

  // Find image or video under cursor via content script
  const results = await chrome.scripting.executeScript({
    target: { tabId },
    func: (isInstagram) => {
      const el = window.__tgSaverLastRightClicked;
      if (!el) return { type: null };

      if (!isInstagram) {
        if (el.tagName === 'VIDEO') {
          return { type: 'video', src: el.src || el.currentSrc };
        }
        if (el.tagName === 'IMG') {
          return { type: 'image', src: el.src };
        }
        return { type: null };
      }

      // Instagram: aggressive search
      let video = el.closest('video') || el.querySelector('video');
      if (!video) {
        video = el.closest('[aria-label*="Video"], [role="group"]')?.querySelector('video');
      }
      if (!video) {
        let parent = el.parentElement;
        for (let i = 0; i < 5 && parent; i++) {
          video = parent.querySelector('video');
          if (video) break;
          parent = parent.parentElement;
        }
      }

      if (video) {
        return { type: 'video', src: video.src || video.currentSrc };
      }

      let img = el.closest('img') || el.querySelector('img');
      if (!img) {
        img = el.closest('[class*="image"], [class*="photo"], [class*="media"]')?.querySelector('img');
      }
      if (!img) {
        let parent = el.parentElement;
        for (let i = 0; i < 5 && parent; i++) {
          img = parent.querySelector('img');
          if (img) break;
          parent = parent.parentElement;
        }
      }

      if (img) {
        return { type: 'image', src: img.src };
      }

      return { type: null };
    },
    args: [isInstagram]
  });

  const media = results[0]?.result;

  if (!media || !media.type) {
    // No media found - send screenshot + link
    await sendScreenshotDirect(tab, settings, selectedTag);
    return;
  }

  if (media.type === 'video') {
    // For video: take screenshot
    await sendVideoDirect(tab, settings, selectedTag);
  } else {
    // For image
    await sendImageDirect(media.src, tab.url, settings, tabId, selectedTag);
  }
}

// Send screenshot directly (tag already selected)
async function sendScreenshotDirect(tab, settings, selectedTag) {
  const capturePromise = settings.addScreenshot ? chrome.tabs.captureVisibleTab(null, { format: 'png' }) : null;

  if (!settings.addScreenshot) {
    await sendMessage(tab.url, settings, selectedTag);
    await showToast(tab.id, 'success', 'Success');
    return;
  }

  const dataUrl = await capturePromise;
  const blob = await fetch(dataUrl).then(r => r.blob());
  const caption = buildCaption(tab.url, settings.tagLink, '', settings, selectedTag);

  await sendPhoto(blob, caption, settings);
  await showToast(tab.id, 'success', 'Success');
}

// Send video as screenshot directly (tag already selected)
async function sendVideoDirect(tab, settings, selectedTag) {
  const dataUrl = await chrome.tabs.captureVisibleTab(null, { format: 'png' });
  const blob = await fetch(dataUrl).then(r => r.blob());
  const caption = buildCaption(tab.url, settings.tagImage, '', settings, selectedTag);

  await sendPhoto(blob, caption, settings);
  await showToast(tab.id, 'success', 'Success');
}

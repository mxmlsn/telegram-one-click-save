// Default settings
const DEFAULT_SETTINGS = {
  botToken: '',
  chatId: '',
  addScreenshot: true,
  imageCompression: true,
  showLinkPreview: true,
  showSelectionIcon: true,
  iconColor: 'blue',
  useHashtags: true,
  tagImage: '#image',
  tagLink: '#link',
  tagQuote: '#quote',
  enableQuickTags: true,
  sendWithColor: true,
  timerDuration: 4, // Timer duration in seconds (3-9)
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

// Emoji mapping for colors
const COLOR_EMOJIS = {
  '#377CDE': '🔵', // Blue
  '#3D3D3B': '⚫️', // Black
  '#4ED345': '🟢', // Green
  '#BB4FFF': '🟣', // Purple
  '#DEDEDE': '⚪️', // White
  '#E64541': '🔴', // Red
  '#EC9738': '🟠', // Orange
  '#FFDE42': '🟡'  // Yellow
};

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
chrome.storage.local.get({ iconColor: 'blue' }, (result) => {
  updateIcon(result.iconColor);
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
  const settings = await getSettings();

  if (!settings.botToken || !settings.chatId) {
    chrome.runtime.openOptionsPage();
    return;
  }

  if (info.menuItemId === 'pocketIt') {
    // If text is selected, send as quote
    if (info.selectionText) {
      await sendQuote(info.selectionText, tab.url, settings);
    } else if (info.srcUrl) {
      // If clicked on image element directly, use srcUrl
      await sendImage(info.srcUrl, tab.url, settings);
    } else {
      // Otherwise try to detect media under cursor or send link
      await sendImageFromPage(tab, settings);
    }
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
    if (settings.sendWithColor && selectedTag.color) {
      const emoji = COLOR_EMOJIS[selectedTag.color];
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

  try {
    // Content script is already loaded via manifest.json
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

    await chrome.tabs.sendMessage(tabId, {
      action: 'showTagSelection',
      customTags: customTags,
      requestId: requestId
    });

    return await tagPromise;
  } catch (e) {
    console.error('Failed to show tag selection:', e);
    return null;
  }
}

// Send screenshot of current tab
async function sendScreenshot(tab, settings) {
  // Show tag selection if custom tags exist and enabled
  let selectedTag = null;
  if (settings.enableQuickTags && settings.customTags && settings.customTags.length > 0) {
    selectedTag = await showTagSelection(tab.id, settings.customTags);
    // Check if cancelled
    if (selectedTag === '__CANCELLED__') {
      return;
    }
  } else {
    await showToast(tab.id, 'pending', 'Sending...');
  }

  const dataUrl = await chrome.tabs.captureVisibleTab(null, { format: 'png' });

  if (!settings.addScreenshot) {
    // Send just the link without screenshot
    await sendMessage(tab.url, settings, selectedTag);
    await showToast(tab.id, 'success', 'Sent!');
    return;
  }

  const blob = await fetch(dataUrl).then(r => r.blob());
  const caption = buildCaption(tab.url, settings.tagLink, '', settings, selectedTag);

  await sendPhoto(blob, caption, settings);
  await showToast(tab.id, 'success', 'Sent!');
}

// Send image from context menu
async function sendImage(imageUrl, pageUrl, settings, tabId = null, selectedTag = null) {
  if (!tabId) {
    const tab = (await chrome.tabs.query({ active: true, currentWindow: true }))[0];
    tabId = tab?.id;
  }

  // Show tag selection if custom tags exist and not already selected
  if (selectedTag === null && settings.enableQuickTags && settings.customTags && settings.customTags.length > 0 && tabId) {
    selectedTag = await showTagSelection(tabId, settings.customTags);
    // Check if cancelled
    if (selectedTag === '__CANCELLED__') {
      return;
    }
  } else if (tabId && !selectedTag) {
    await showToast(tabId, 'pending', 'Sending...');
  }

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

  if (useScreenshot && tabId) {
    const dataUrl = await chrome.tabs.captureVisibleTab(null, { format: 'png' });
    blob = await fetch(dataUrl).then(r => r.blob());
  }

  const caption = buildCaption(pageUrl, settings.tagImage, '', settings, selectedTag);

  if (settings.imageCompression || useScreenshot) {
    await sendPhoto(blob, caption, settings);
  } else {
    await sendDocument(blob, caption, settings, imageUrl);
  }

  if (tabId) await showToast(tabId, 'success', 'Sent!');
}

// Send image or video found under cursor (for sites like Instagram)
async function sendImageFromPage(tab, settings) {
  const tabId = tab.id;
  const isInstagram = tab.url.includes('instagram.com');

  // Show tag selection first if custom tags exist and enabled
  let selectedTag = null;
  if (settings.enableQuickTags && settings.customTags && settings.customTags.length > 0) {
    selectedTag = await showTagSelection(tabId, settings.customTags);
    // Check if cancelled
    if (selectedTag === '__CANCELLED__') {
      return;
    }
  }

  // Find image or video under cursor via content script
  const results = await chrome.scripting.executeScript({
    target: { tabId },
    func: (isInstagram) => {
      const lastRightClicked = window.__tgSaverLastRightClicked;
      if (!lastRightClicked) return { type: null };

      // Check for video first
      let video = lastRightClicked.closest('video') ||
        lastRightClicked.querySelector('video');

      // For Instagram: use aggressive search in parent elements
      if (isInstagram) {
        if (!video) {
          video = lastRightClicked.closest('[aria-label*="Video"], [role="group"]')?.querySelector('video');
        }
        if (!video) {
          let parent = lastRightClicked.parentElement;
          for (let i = 0; i < 5 && parent; i++) {
            video = parent.querySelector('video');
            if (video) break;
            parent = parent.parentElement;
          }
        }
      }

      if (video) {
        return { type: 'video', src: video.src || video.currentSrc };
      }

      // Check for image - strict mode for non-Instagram
      let img = lastRightClicked.closest('img') ||
        lastRightClicked.querySelector('img');

      // For Instagram: use aggressive search in parent elements
      if (isInstagram) {
        if (!img) {
          img = lastRightClicked.closest('[class*="image"], [class*="photo"], [class*="media"]')?.querySelector('img');
        }
        if (!img) {
          let parent = lastRightClicked.parentElement;
          for (let i = 0; i < 5 && parent; i++) {
            img = parent.querySelector('img');
            if (img) break;
            parent = parent.parentElement;
          }
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
  // Show tag selection if custom tags exist and not already selected
  if (selectedTag === null && settings.enableQuickTags && settings.customTags && settings.customTags.length > 0) {
    selectedTag = await showTagSelection(tab.id, settings.customTags);
    // Check if cancelled
    if (selectedTag === '__CANCELLED__') {
      return;
    }
  } else if (!selectedTag) {
    await showToast(tab.id, 'pending', 'Sending...');
  }

  const dataUrl = await chrome.tabs.captureVisibleTab(null, { format: 'png' });
  const blob = await fetch(dataUrl).then(r => r.blob());

  const caption = buildCaption(tab.url, settings.tagImage, '', settings, selectedTag);

  await sendPhoto(blob, caption, settings);
  await showToast(tab.id, 'success', 'Sent!');
}

// Send screenshot with pre-selected tag (for sendImageFromPage flow)
async function sendScreenshotWithTag(tab, settings, selectedTag) {
  if (!selectedTag) {
    await showToast(tab.id, 'pending', 'Sending...');
  }

  const dataUrl = await chrome.tabs.captureVisibleTab(null, { format: 'png' });

  if (!settings.addScreenshot) {
    await sendMessage(tab.url, settings, selectedTag);
    await showToast(tab.id, 'success', 'Sent!');
    return;
  }

  const blob = await fetch(dataUrl).then(r => r.blob());
  const caption = buildCaption(tab.url, settings.tagLink, '', settings, selectedTag);

  await sendPhoto(blob, caption, settings);
  await showToast(tab.id, 'success', 'Sent!');
}

// Send image with pre-selected tag (for sendImageFromPage flow)
async function sendImageWithTag(imageUrl, pageUrl, settings, tabId, selectedTag) {
  if (!selectedTag) {
    await showToast(tabId, 'pending', 'Sending...');
  }

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

  if (useScreenshot && tabId) {
    const dataUrl = await chrome.tabs.captureVisibleTab(null, { format: 'png' });
    blob = await fetch(dataUrl).then(r => r.blob());
  }

  const caption = buildCaption(pageUrl, settings.tagImage, '', settings, selectedTag);

  if (settings.imageCompression || useScreenshot) {
    await sendPhoto(blob, caption, settings);
  } else {
    await sendDocument(blob, caption, settings, imageUrl);
  }

  if (tabId) await showToast(tabId, 'success', 'Sent!');
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
    await showToast(tabId, 'pending', 'Sending...');
  }

  const caption = buildCaption(pageUrl, settings.tagQuote, text, settings, selectedTag);
  await sendTextMessage(caption, settings);

  if (tabId) await showToast(tabId, 'success', 'Sent!');
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

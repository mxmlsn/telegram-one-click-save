// Default settings
const DEFAULT_SETTINGS = {
  botToken: '',
  chatId: '',
  addScreenshot: true,
  imageCompression: true,
  showLinkPreview: true,
  showSelectionIcon: true,
  iconColor: 'blue',
  tagImage: '#image',
  tagLink: '#link',
  tagQuote: '#quote'
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

// Create context menus on install
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: 'sendToTelegram',
    title: 'Send to Telegram',
    contexts: ['page', 'frame', 'link', 'image']
  });

  chrome.contextMenus.create({
    id: 'sendQuote',
    title: 'Send quote to Telegram',
    contexts: ['selection']
  });
});

// Handle context menu clicks
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  const settings = await getSettings();

  if (!settings.botToken || !settings.chatId) {
    chrome.runtime.openOptionsPage();
    return;
  }

  if (info.menuItemId === 'sendToTelegram') {
    // If clicked on image element directly, use srcUrl
    if (info.srcUrl) {
      await sendImage(info.srcUrl, tab.url, settings);
    } else {
      // Otherwise try to detect media under cursor or send link
      await sendImageFromPage(tab, settings);
    }
  } else if (info.menuItemId === 'sendQuote') {
    await sendQuote(info.selectionText, tab.url, settings);
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
function buildCaption(url, tag, extraText = '') {
  const formatted = formatUrl(url);
  let caption = '';

  if (extraText) {
    caption += `<code>${extraText.slice(0, 3900)}</code>\n\n`;
  }

  if (formatted.isLink) {
    caption += `${tag} | <a href="${formatted.fullUrl}">${formatted.text}</a>`;
  } else {
    caption += `${tag} | ${formatted.text}`;
  }

  return caption;
}

// Show toast notification on page
async function showToast(tabId, state, message) {
  try {
    await chrome.scripting.insertCSS({
      target: { tabId },
      files: ['content.css']
    });

    await chrome.scripting.executeScript({
      target: { tabId },
      files: ['content.js']
    });

    await chrome.tabs.sendMessage(tabId, {
      action: 'showToast',
      state,
      message
    });
  } catch (e) {
    console.error('Failed to show toast:', e);
  }
}

// Send screenshot of current tab
async function sendScreenshot(tab, settings) {
  await showToast(tab.id, 'pending', 'Sending...');

  const dataUrl = await chrome.tabs.captureVisibleTab(null, { format: 'png' });

  if (!settings.addScreenshot) {
    // Send just the link without screenshot
    await sendMessage(tab.url, settings);
    await showToast(tab.id, 'success', 'Sent!');
    return;
  }

  const blob = await fetch(dataUrl).then(r => r.blob());
  const caption = buildCaption(tab.url, settings.tagLink);

  await sendPhoto(blob, caption, settings);
  await showToast(tab.id, 'success', 'Sent!');
}

// Send image from context menu
async function sendImage(imageUrl, pageUrl, settings, tabId = null) {
  if (!tabId) {
    const tab = (await chrome.tabs.query({ active: true, currentWindow: true }))[0];
    tabId = tab?.id;
  }

  if (tabId) await showToast(tabId, 'pending', 'Sending...');

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

  const caption = buildCaption(pageUrl, settings.tagImage);

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

  // Find image or video under cursor via content script
  const results = await chrome.scripting.executeScript({
    target: { tabId },
    func: () => {
      const lastRightClicked = window.__tgSaverLastRightClicked;
      if (!lastRightClicked) return { type: null };

      // Check for video first
      let video = lastRightClicked.closest('video') ||
                  lastRightClicked.querySelector('video') ||
                  lastRightClicked.closest('[aria-label*="Video"], [role="group"]')?.querySelector('video');

      if (!video) {
        let parent = lastRightClicked.parentElement;
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
      let img = lastRightClicked.closest('img') ||
                lastRightClicked.querySelector('img') ||
                lastRightClicked.closest('[class*="image"], [class*="photo"], [class*="media"]')?.querySelector('img');

      if (!img) {
        let parent = lastRightClicked.parentElement;
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
    }
  });

  const media = results[0]?.result;

  if (!media || !media.type) {
    // No media found - send screenshot + link
    await sendScreenshot(tab, settings);
    return;
  }

  if (media.type === 'video') {
    // For video: take screenshot and send with image tag
    await sendVideoAsScreenshot(tab, settings);
  } else {
    // For image: send as usual
    await sendImage(media.src, tab.url, settings, tabId);
  }
}

// Send video as screenshot with #image tag
async function sendVideoAsScreenshot(tab, settings) {
  await showToast(tab.id, 'pending', 'Sending...');

  const dataUrl = await chrome.tabs.captureVisibleTab(null, { format: 'png' });
  const blob = await fetch(dataUrl).then(r => r.blob());

  const caption = buildCaption(tab.url, settings.tagImage);

  await sendPhoto(blob, caption, settings);
  await showToast(tab.id, 'success', 'Sent!');
}

// Send quote from context menu
async function sendQuote(text, pageUrl, settings) {
  const tabId = (await chrome.tabs.query({ active: true, currentWindow: true }))[0]?.id;
  await sendQuoteWithTabId(text, pageUrl, settings, tabId);
}

// Send quote with explicit tabId (for selection icon)
async function sendQuoteWithTabId(text, pageUrl, settings, tabId) {
  if (tabId) await showToast(tabId, 'pending', 'Sending...');

  const caption = buildCaption(pageUrl, settings.tagQuote, text);
  await sendTextMessage(caption, settings);

  if (tabId) await showToast(tabId, 'success', 'Sent!');
}

// Send just a message (link without screenshot)
async function sendMessage(url, settings) {
  const caption = buildCaption(url, settings.tagLink);
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

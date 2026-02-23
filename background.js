// Background service worker — thin entry point
// All logic lives in src/ modules

import { DEFAULT_SETTINGS } from './src/shared/constants.js';
import { analyzeWithAI } from './src/ai/analyze.js';
import { patchNotionWithAI } from './src/api/notion.js';
import { sendImage, sendQuote, sendLink, sendPdf, sendScreenshot, sendFromPage } from './src/lib/senders.js';
import { isPdfUrl, isSvgUrl } from './src/lib/media.js';

// ─── Icon Management ────────────────────────────────────────────────────────

function updateIcon(color) {
  chrome.action.setIcon({
    path: {
      16: `icons/icon-${color}-16.png`,
      48: `icons/icon-${color}-48.png`,
      128: `icons/icon-${color}-128.png`
    }
  });
}

chrome.storage.onChanged.addListener((changes) => {
  if (changes.iconColor) updateIcon(changes.iconColor.newValue);
});

chrome.storage.local.get({ iconColor: 'circle1' }, (result) => {
  updateIcon(result.iconColor);
});

// ─── Settings Cache ─────────────────────────────────────────────────────────

let cachedSettings = null;

chrome.storage.local.get(DEFAULT_SETTINGS, (result) => {
  cachedSettings = { ...DEFAULT_SETTINGS, ...result };
});

chrome.storage.onChanged.addListener((changes) => {
  if (cachedSettings) {
    for (const key of Object.keys(changes)) {
      cachedSettings[key] = changes[key].newValue;
    }
  }
});

async function getSettings() {
  const result = await chrome.storage.local.get(DEFAULT_SETTINGS);
  return { ...DEFAULT_SETTINGS, ...result };
}

// ─── Toast Helper ───────────────────────────────────────────────────────────

async function showToast(tabId, state, message) {
  if (!tabId) return;
  try {
    await chrome.tabs.sendMessage(tabId, { action: 'showToast', state, message });
  } catch (e) {
    // Normal on some pages
  }
}

// ─── Tag Selection ──────────────────────────────────────────────────────────

const pendingRequests = new Map();
const cancelledRequests = new Set();

async function showTagSelection(tabId, customTags) {
  const requestId = Date.now().toString() + Math.random().toString(36).substring(2, 11);

  const tagPromise = new Promise((resolve) => {
    pendingRequests.set(requestId, { resolve });

    setTimeout(() => {
      if (pendingRequests.has(requestId)) {
        pendingRequests.delete(requestId);
        resolve(null);
      }
    }, 30000);
  });

  chrome.tabs.sendMessage(tabId, {
    action: 'preShowToast',
    requestId: requestId,
    customTags: customTags
  }).catch(() => {
    const pending = pendingRequests.get(requestId);
    if (pending) {
      pendingRequests.delete(requestId);
      pending.resolve(null);
    }
  });

  return tagPromise;
}

// ─── Context Menu ───────────────────────────────────────────────────────────

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: 'sendToTelegram',
    title: 'Send to Telegram',
    contexts: ['page', 'frame', 'link', 'image', 'selection']
  });
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId !== 'sendToTelegram') return;

  // Show toast IMMEDIATELY using cached settings
  const currentSettings = cachedSettings || DEFAULT_SETTINGS;
  const cachedTags = currentSettings.customTags;
  const quickTagsEnabled = currentSettings.enableQuickTags !== false;
  const hasNonEmptyTags = cachedTags && cachedTags.some(t => t.name && t.name.trim());

  // Start settings load in parallel
  const settingsPromise = getSettings();

  // Show tag selection toast immediately if enabled
  let tagSelectionPromise = null;
  if (quickTagsEnabled && hasNonEmptyTags) {
    tagSelectionPromise = showTagSelection(tab.id, cachedTags);
  } else {
    showToast(tab.id, 'pending', 'Sending');
  }

  const settings = await settingsPromise;

  if (!settings.botToken || !settings.chatId) {
    chrome.runtime.openOptionsPage();
    return;
  }

  // Wait for tag selection
  let selectedTag = null;
  try {
    if (tagSelectionPromise) {
      selectedTag = await tagSelectionPromise;
      if (selectedTag === '__CANCELLED__') return;
    }
  } catch (err) {
    console.error('[TG Saver] Tag selection error:', err);
  }

  try {
    if (isPdfUrl(tab.url)) {
      await sendPdf(tab.url, tab.url, settings, tab.id, selectedTag);
    } else if (info.srcUrl) {
      await sendImage(info.srcUrl, tab.url, settings, tab.id, selectedTag);
    } else if (!info.srcUrl && isSvgUrl(tab.url)) {
      // SVG opened as standalone page — no srcUrl from Chrome, use tab URL directly
      await sendImage(tab.url, tab.url, settings, tab.id, selectedTag);
    } else if (info.selectionText) {
      await sendQuote(info.selectionText, tab.url, settings, tab.id, selectedTag);
    } else if (info.linkUrl) {
      await sendLink(info.linkUrl, tab.url, settings, tab.id, selectedTag);
    } else {
      await sendFromPage(tab, settings, selectedTag);
    }
  } catch (err) {
    console.error('[TG Saver] Error in content handling flow:', err);
    showToast(tab.id, 'error', 'Error: ' + err.message);
  }
});

// ─── Toolbar Icon Click ─────────────────────────────────────────────────────

chrome.action.onClicked.addListener(async (tab) => {
  const settings = await getSettings();

  if (!settings.botToken || !settings.chatId) {
    chrome.runtime.openOptionsPage();
    return;
  }

  // Show tag selection for toolbar click too
  let selectedTag = null;
  const quickTagsEnabled = settings.enableQuickTags !== false;
  const hasNonEmptyTags = settings.customTags && settings.customTags.some(t => t.name && t.name.trim());

  if (quickTagsEnabled && hasNonEmptyTags) {
    selectedTag = await showTagSelection(tab.id, settings.customTags);
    if (selectedTag === '__CANCELLED__') return;
  } else {
    showToast(tab.id, 'pending', 'Sending');
  }

  if (isSvgUrl(tab.url)) {
    await sendImage(tab.url, tab.url, settings, tab.id, selectedTag);
  } else {
    await sendScreenshot(tab, settings, selectedTag);
  }
});

// ─── Message Handling ───────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'sendQuoteFromSelection') {
    (async () => {
      const settings = await getSettings();
      if (!settings.botToken || !settings.chatId) {
        chrome.runtime.openOptionsPage();
        return;
      }

      const tabId = sender.tab?.id;

      // Show tag selection for selection icon too
      let selectedTag = null;
      const quickTagsEnabled = settings.enableQuickTags !== false;
      const hasNonEmptyTags = settings.customTags && settings.customTags.some(t => t.name && t.name.trim());

      if (quickTagsEnabled && hasNonEmptyTags && tabId) {
        selectedTag = await showTagSelection(tabId, settings.customTags);
        if (selectedTag === '__CANCELLED__') return;
      } else if (tabId) {
        showToast(tabId, 'pending', 'Sending');
      }

      await sendQuote(message.text, sender.tab.url, settings, tabId, selectedTag);
    })();
  } else if (message.action === 'getSettings') {
    getSettings().then(settings => {
      sendResponse({ showSelectionIcon: settings.showSelectionIcon });
    });
    return true;
  } else if (message.action === 'tagSelected') {
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
    cancelledRequests.add(message.requestId);
    const pending = pendingRequests.get(message.requestId);
    if (pending) {
      pendingRequests.delete(message.requestId);
      pending.resolve('__CANCELLED__');
    }
  }
});

// ─── Viewer Fetch Relay ─────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.type === 'FETCH') {
    fetch(msg.url, msg.options || {})
      .then(async res => {
        const text = await res.text();
        sendResponse({ ok: res.ok, status: res.status, body: text });
      })
      .catch(err => sendResponse({ ok: false, status: 0, body: err.message }));
    return true;
  }

  if (msg.type === 'AI_ANALYZE') {
    chrome.storage.local.get(null, async (settings) => {
      const merged = { ...DEFAULT_SETTINGS, ...settings };
      const result = await analyzeWithAI(msg.item, merged);
      if (result && msg.notionPageId) {
        await patchNotionWithAI(msg.notionPageId, result, merged, msg.item.existingAiData);
      }
      sendResponse({ ok: !!result, result });
    });
    return true;
  }

  return false;
});

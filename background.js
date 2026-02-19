// Emoji packs definition
// Order: red, yellow, green, blue, purple, black, white
const EMOJI_PACKS = {
  circle: ['🔴', '🟡', '🟢', '🔵', '🟣', '⚫️', '⚪️'],
  heart: ['❤️', '💛', '💚', '💙', '💜', '🖤', '🤍'],
  soft: ['🍄', '🐤', '🐸', '💧', '🔮', '🌚', '💭']
};

// Color ID to index mapping (for emoji pack lookup)
const COLOR_ID_TO_INDEX = {
  'red': 0,
  'yellow': 1,
  'green': 2,
  'blue': 3,
  'purple': 4,
  'black': 5,
  'white': 6
};

// Default settings - synced with options.js
const DEFAULT_SETTINGS = {
  botToken: '',
  chatId: '',
  addScreenshot: true,
  imageCompression: true,
  showLinkPreview: false,
  showSelectionIcon: true,
  quoteMonospace: true,
  iconColor: 'circle1',
  useHashtags: true,
  tagImage: '#image',
  tagLink: '#link',
  tagQuote: '#text',
  enableQuickTags: true,
  sendWithColor: true,
  timerDuration: 4,
  emojiPack: 'circle',
  toastStyle: 'normal',
  themeLight: false,
  isConnected: false,
  customEmoji: ['🔴', '🟡', '🟢', '🔵', '🟣', '⚫️', '⚪️'],
  // Fixed 7 tags
  customTags: [
    { name: 'work', color: '#E64541', id: 'red' },
    { name: 'study', color: '#FFDE42', id: 'yellow' },
    { name: 'refs', color: '#4ED345', id: 'green' },
    { name: 'project1', color: '#377CDE', id: 'blue' },
    { name: '', color: '#BB4FFF', id: 'purple' },
    { name: '', color: '#3D3D3B', id: 'black' },
    { name: '', color: '#DEDEDE', id: 'white' }
  ],
  // Notion integration
  notionEnabled: false,
  notionToken: '',
  notionDbId: '30b6081f-3dc6-8148-871f-dfb6944ac36e',
  aiEnabled: false,
  aiProvider: 'google',
  aiApiKey: '',
  aiModel: 'gemini-2.0-flash',
  aiAutoOnSave: true,
  aiAutoInViewer: true
};

// Get emoji for a tag based on selected pack
function getEmojiForTag(tag, emojiPack = 'circle', customEmoji = []) {
  if (!tag || !tag.id) return '';
  const index = COLOR_ID_TO_INDEX[tag.id];
  if (index === undefined) return '';

  if (emojiPack === 'custom' && customEmoji && customEmoji.length > index) {
    return customEmoji[index] || '';
  }

  const pack = EMOJI_PACKS[emojiPack] || EMOJI_PACKS.circle;
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
    id: 'sendToTelegram',
    title: 'Send to Telegram',
    contexts: ['page', 'frame', 'link', 'image', 'selection']
  });

  chrome.contextMenus.create({
    id: 'separator-viewer',
    type: 'separator',
    contexts: ['page', 'frame', 'link', 'image', 'selection']
  });

  chrome.contextMenus.create({
    id: 'open-viewer',
    title: 'Open Viewer',
    contexts: ['page', 'frame', 'link', 'image', 'selection']
  });
});

// Handle context menu clicks
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  const clickTime = Date.now();
  console.log('[TG Saver] Context menu clicked at', clickTime);

  if (info.menuItemId === 'open-viewer') {
    try {
      const viewerUrl = chrome.runtime.getURL('viewer/index.html');
      const existing = await chrome.tabs.query({ url: viewerUrl + '*' });
      if (existing.length > 0) {
        await chrome.tabs.update(existing[0].id, { active: true });
        if (existing[0].windowId > 0) {
          await chrome.windows.update(existing[0].windowId, { focused: true });
        }
      } else {
        await chrome.tabs.create({ url: viewerUrl });
      }
    } catch (e) {
      console.error('[TG Saver] Failed to open viewer', e);
    }
    return;
  }

  if (info.menuItemId !== 'sendToTelegram') return;

  // CRITICAL: Show toast IMMEDIATELY, before any async operations
  // Use cached settings for instant UI, load fresh settings in parallel
  const currentSettings = cachedSettings || DEFAULT_SETTINGS;
  const cachedTags = currentSettings.customTags;
  const quickTagsEnabled = currentSettings.enableQuickTags !== false;
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
  try {
    if (tagSelectionPromise) {
      console.log('[TG Saver] Waiting for tag selection...');
      selectedTag = await tagSelectionPromise;
      console.log('[TG Saver] Tag selected:', selectedTag?.name || 'none');
      if (selectedTag === '__CANCELLED__') {
        console.log('[TG Saver] Request cancelled by user');
        return;
      }
    }
  } catch (err) {
    console.error('[TG Saver] Error während der Tag-Auswahl:', err);
  }

  try {
    // Handle different content types
    if (info.srcUrl) {
      console.log('[TG Saver] Handling image source:', info.srcUrl);
      await sendImageDirect(info.srcUrl, tab.url, settings, tab.id, selectedTag);
    } else if (info.selectionText) {
      console.log('[TG Saver] Handling selection text');
      await sendQuoteDirect(info.selectionText, tab.url, settings, tab.id, selectedTag);
    } else if (info.linkUrl) {
      console.log('[TG Saver] Handling link URL:', info.linkUrl);
      await sendLinkDirect(info.linkUrl, tab.url, settings, tab.id, selectedTag);
    } else {
      console.log('[TG Saver] Handling general page click');
      await sendImageFromPageDirect(tab, settings, selectedTag);
    }
  } catch (err) {
    console.error('[TG Saver] Error in content handling flow:', err);
    showToast(tab.id, 'error', 'Error: ' + err.message);
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

// Save entry to Notion database (fire-and-forget, never blocks main flow)
async function saveToNotion(data, settings) {
  if (!settings.notionEnabled || !settings.notionToken || !settings.notionDbId) return;

  const { type, sourceUrl, content, fileId, tagName } = data;
  const domain = sourceUrl
    ? sourceUrl.replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0]
    : '';

  const properties = {
    'URL': { title: [{ text: { content: domain || sourceUrl || '—' } }] },
    'Type': { select: { name: type } },
    'Date': { date: { start: new Date().toISOString() } }
  };

  if (sourceUrl) properties['Source URL'] = { url: sourceUrl };
  if (tagName) properties['Tag'] = { select: { name: tagName } };
  if (content) properties['Content'] = { rich_text: [{ text: { content: content.slice(0, 2000) } }] };
  if (fileId) properties['File ID'] = { rich_text: [{ text: { content: fileId } }] };

  try {
    const res = await fetch('https://api.notion.com/v1/pages', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${settings.notionToken}`,
        'Notion-Version': '2022-06-28',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ parent: { database_id: settings.notionDbId }, properties })
    });
    if (!res.ok) {
      const err = await res.json();
      console.warn('[TG Saver] Notion save failed:', err.message);
      return null;
    }
    const page = await res.json();
    return page.id || null;
  } catch (e) {
    console.warn('[TG Saver] Notion save error:', e);
    return null;
  }
}

// ─── AI Analysis ─────────────────────────────────────────────────────────────

const AI_PROMPT_IMAGE = `Analyze this photo/image and return ONLY valid JSON, no other text:
{
  "content_type": null,
  "content_type_secondary": null,
  "description": "detailed description: what is shown, composition, who/what is where, context",
  "materials": [],
  "color_palette": null,
  "text_on_image": "",
  "price": "",
  "author": "",
  "tweet_text": ""
}

Rules:
- content_type: This is a photo sent directly (not a link). The ONLY allowed non-null value is "product". Set "product" ONLY if a price (any currency symbol: $, €, £, ¥, ₽, etc.) is CLEARLY VISIBLE in the image next to a product. Otherwise content_type MUST be null. Do NOT set "video", "article", or "xpost" — these are impossible for a direct photo.
- content_type_secondary: null for direct photos (not applicable).
- description: 2-4 sentences in English, describe composition, objects, people, mood, setting. Be specific.
- materials: list of textures/materials visible (e.g. ["leather", "denim"]). Empty array if none.
- color_palette: pick EXACTLY ONE tag that best describes the dominant COLOR MOOD. Must be one of: "red", "orange", "yellow", "green", "blue", "purple", "pink", "brown", "white", "black", "bw". Use "bw" only for genuine black-and-white/monochrome photography. Null if unclear.
- text_on_image: transcribe ALL visible text verbatim, preserving original language. Empty string if no text.
- price: the main product price with currency symbol (e.g. "$129"). Empty string if not visible.
- author: empty string.
- tweet_text: empty string.
- All fields must be present. No markdown, no extra fields.`;

const AI_PROMPT_LINK = `Analyze this saved link and return ONLY valid JSON, no other text:
{
  "content_type": null,
  "content_type_secondary": null,
  "description": "detailed description: what is shown, composition, who/what is where, context",
  "materials": [],
  "color_palette": null,
  "text_on_image": "",
  "price": "",
  "author": "",
  "tweet_text": ""
}

Rules:
- content_type: set ONLY if confident, otherwise null. Must be one of:
  - "article" — URL is clearly an article/essay/instruction/journalism piece
  - "video" — URL is youtube.com/youtu.be/vimeo.com/instagram. OR screenshot shows video indicators: mute/unmute speaker icon, progress bar + playhead, play button overlay. Instagram posts with a mute/unmute icon are ALWAYS video.
  - "product" — ONLY if a price (any currency symbol: $, €, £, ¥, ₽, etc.) is CLEARLY VISIBLE in the screenshot next to a product. No visible price = null.
  - "xpost" — URL contains x.com or twitter.com
  - "tool" — URL is a digital tool, app, SaaS service, template marketplace, font foundry/specimen, browser extension, CLI utility, framework/library page, AI tool, online generator/converter, or a showcase/launch post ("I made X", "I built X", Product Hunt, etc.)
- content_type_secondary: If the content fits TWO categories, set the secondary one here. Same allowed values as content_type. Must be DIFFERENT from content_type (or null). Common cases:
  - xpost about a tool/app/SaaS → content_type="xpost", content_type_secondary="tool"
  - xpost about a product with price → content_type="xpost", content_type_secondary="product"
  - article reviewing a tool → content_type="article", content_type_secondary="tool"
  - video about a product → content_type="video", content_type_secondary="product"
  Set null if only one category applies.
- description: 2-4 sentences in English, describe composition, objects, people, mood, setting. Be specific.
- materials: list of textures/materials visible (e.g. ["leather", "denim"]). Empty array if none or no image.
- color_palette: pick EXACTLY ONE tag that best describes the dominant COLOR MOOD of the image (ignore UI chrome, white backgrounds of websites). Must be one of: "red", "orange", "yellow", "green", "blue", "purple", "pink", "brown", "white", "black", "bw". Use "bw" only for genuine black-and-white/monochrome photography. Null if no image.
- text_on_image: transcribe ALL visible text verbatim, preserving original language. Empty string if no text or no image.
- price: the main product price with currency symbol (e.g. "$129", "€49.99"). Empty string if not applicable.
- author: for xpost — @handle from screenshot. Empty string otherwise.
- tweet_text: for xpost — full tweet text from screenshot. Empty string otherwise.
- All fields must be present. No markdown, no extra fields.`;

async function fetchBase64(url) {
  const res = await fetch(url);
  const buffer = await res.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

async function callGemini(prompt, imageBase64OrNull, settings) {
  const model = settings.aiModel || 'gemini-2.0-flash';
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${settings.aiApiKey}`;
  const parts = [];
  if (imageBase64OrNull) {
    parts.push({ inline_data: { mime_type: 'image/jpeg', data: imageBase64OrNull } });
  }
  parts.push({ text: prompt });
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ contents: [{ parts }] })
  });
  if (!res.ok) {
    console.warn('[TG Saver] Gemini error:', res.status, await res.text());
    return null;
  }
  const data = await res.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text || null;
}

async function callAnthropic(messages, settings) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': settings.aiApiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json'
    },
    body: JSON.stringify({
      model: (settings.aiModel && !settings.aiModel.startsWith('gemini')) ? settings.aiModel : 'claude-haiku-4-5-20251001',
      max_tokens: 300,
      messages
    })
  });
  if (!res.ok) {
    console.warn('[TG Saver] Anthropic error:', res.status, await res.text());
    return null;
  }
  const data = await res.json();
  return data.content?.[0]?.text || null;
}

async function analyzeWithAI(item, settings) {
  if (!settings.aiEnabled || !settings.aiApiKey) return null;

  try {
    const provider = settings.aiProvider || 'google';
    let responseText = null;

    const isDirectImage = item.type === 'image';

    if (item.fileId && settings.botToken) {
      // Get Telegram image (direct photo)
      const fileRes = await fetch(
        `https://api.telegram.org/bot${settings.botToken}/getFile?file_id=${item.fileId}`
      );
      const fileData = await fileRes.json();
      if (fileData.ok) {
        const imgUrl = `https://api.telegram.org/file/bot${settings.botToken}/${fileData.result.file_path}`;
        const prompt = isDirectImage ? AI_PROMPT_IMAGE : AI_PROMPT_LINK;

        if (provider === 'google') {
          const base64 = await fetchBase64(imgUrl);
          responseText = await callGemini(prompt, base64, settings);
        } else {
          // Anthropic accepts image URLs directly
          const messages = [{
            role: 'user',
            content: [
              { type: 'image', source: { type: 'url', url: imgUrl } },
              { type: 'text', text: prompt }
            ]
          }];
          responseText = await callAnthropic(messages, settings);
        }
      }
    }

    if (responseText === null) {
      // Text/link fallback (no image, or image fetch failed)
      const context = [
        item.sourceUrl ? `URL: ${item.sourceUrl}` : '',
        item.content ? `Content: ${item.content.slice(0, 500)}` : '',
        item.tagName ? `User tag: ${item.tagName}` : ''
      ].filter(Boolean).join('\n');
      const fullPrompt = `${AI_PROMPT_LINK}\n\nContent to analyze:\n${context}`;

      if (provider === 'google') {
        responseText = await callGemini(fullPrompt, null, settings);
      } else {
        responseText = await callAnthropic(
          [{ role: 'user', content: fullPrompt }],
          settings
        );
      }
    }

    if (!responseText) return null;
    // Strip markdown code fences if model wrapped JSON in ```json ... ```
    const cleaned = responseText.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
    const parsed = JSON.parse(cleaned);

    // Hard guard: direct TG image can only be "product" or null
    if (isDirectImage && parsed.content_type !== 'product') {
      parsed.content_type = null;
    }

    return parsed;
  } catch (e) {
    console.warn('[TG Saver] AI parse error:', e);
    return null;
  }
}

async function patchNotionWithAI(pageId, aiResult, settings) {
  if (!pageId || !aiResult) return;

  const properties = {
    'ai_analyzed': { checkbox: true }
  };

  // Always write ai_type — explicitly null if no content_type, to clear stale values
  properties['ai_type'] = aiResult.content_type
    ? { select: { name: aiResult.content_type } }
    : { select: null };
  // Secondary AI type for hybrid content (e.g. xpost + tool)
  properties['ai_type_secondary'] = aiResult.content_type_secondary
    ? { select: { name: aiResult.content_type_secondary } }
    : { select: null };
  if (aiResult.description) {
    properties['ai_description'] = {
      rich_text: [{ text: { content: aiResult.description.slice(0, 2000) } }]
    };
  }
  const aiDataPayload = {};
  if (aiResult.materials?.length) aiDataPayload.materials = aiResult.materials;
  if (aiResult.color_palette) aiDataPayload.color_palette = aiResult.color_palette;
  if (aiResult.text_on_image) aiDataPayload.text_on_image = aiResult.text_on_image;
  if (aiResult.price) aiDataPayload.price = aiResult.price;
  if (aiResult.author) aiDataPayload.author = aiResult.author;
  if (aiResult.tweet_text) aiDataPayload.tweet_text = aiResult.tweet_text;
  if (Object.keys(aiDataPayload).length) {
    properties['ai_data'] = {
      rich_text: [{ text: { content: JSON.stringify(aiDataPayload).slice(0, 2000) } }]
    };
  }

  try {
    await fetch(`https://api.notion.com/v1/pages/${pageId}`, {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${settings.notionToken}`,
        'Notion-Version': '2022-06-28',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ properties })
    });
  } catch (e) {
    console.warn('[TG Saver] Notion AI patch error:', e);
  }
}

// Helper to escape HTML for Telegram
function escapeHTML(str) {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

// Format URL for display
function formatUrl(url) {
  if (!url) return { text: '', isLink: false, fullUrl: '' };
  let clean = url.replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/$/, '');

  if (clean.length <= 35) {
    return { text: escapeHTML(clean), isLink: false, fullUrl: url };
  }

  const domain = clean.split('/')[0];
  return { text: escapeHTML(domain), isLink: true, fullUrl: url };
}

// Build caption with URL
function buildCaption(url, tag, extraText = '', settings = {}, selectedTag = null) {
  console.log('[TG Saver] Building caption for:', { url, tag, extraTextLength: extraText?.length, selectedTag: selectedTag?.name });

  const useHashtags = settings.useHashtags !== false;
  const quoteMonospace = settings.quoteMonospace !== false;

  // Special formatting for links when screenshot is disabled
  if (tag === settings.tagLink && settings.addScreenshot === false && !extraText) {
    let caption = escapeHTML(url) + '\n\n';
    let parts = [];

    // Add selected custom tag
    if (selectedTag && selectedTag.name) {
      let tagText = `#${escapeHTML(selectedTag.name)}`;
      if (settings.sendWithColor) {
        const emoji = getEmojiForTag(selectedTag, settings.emojiPack, settings.customEmoji);
        if (emoji) tagText = `${emoji} ${tagText}`;
      }
      parts.push(tagText);
    }

    // Add type tag
    if (useHashtags && tag) {
      parts.push(escapeHTML(tag));
    }

    caption += parts.filter(p => p && p.trim()).join(' | ');
    return caption;
  }

  const formatted = formatUrl(url);
  let caption = '';

  if (extraText) {
    const escapedText = escapeHTML(extraText.slice(0, 3900));
    if (quoteMonospace) {
      caption += `<code>${escapedText}</code>\n\n`;
    } else {
      caption += `${escapedText}\n\n`;
    }
  } else {
    // Add empty braille space + newline before tag for visual separation
    caption += '⠀\n';
  }

  // Build tag parts: [emoji] [selectedTag] | [typeTag] | [url]
  let parts = [];

  // Add selected custom tag if present
  if (selectedTag && selectedTag.name) {
    let tagText = `#${escapeHTML(selectedTag.name)}`;

    // Prepend emoji if enabled
    if (settings.sendWithColor) {
      const emoji = getEmojiForTag(selectedTag, settings.emojiPack, settings.customEmoji);
      if (emoji) {
        tagText = `${emoji} ${tagText}`;
      }
    }

    parts.push(tagText);
  }

  // Add type tag if hashtags enabled
  if (useHashtags && tag) {
    parts.push(escapeHTML(tag));
  }

  // Add URL
  if (formatted.isLink) {
    parts.push(`<a href="${formatted.fullUrl}">${formatted.text}</a>`);
  } else if (formatted.text) {
    parts.push(formatted.text);
  }

  // Filter out any empty parts before joining
  const finalParts = parts.filter(p => p && p.trim()).join(' | ');
  caption += finalParts;

  console.log('[TG Saver] Final caption built');
  return caption;
}

// Show toast notification on page
async function showToast(tabId, state, message) {
  if (!tabId) return;
  console.log(`[TG Saver] Showing toast: ${state} - ${message}`);
  try {
    await chrome.tabs.sendMessage(tabId, {
      action: 'showToast',
      state,
      message
    });
  } catch (e) {
    console.warn('[TG Saver] Could not send message to tab (normal behavior on some pages):', e);
  }
}

// Show tag selection toast and wait for response
async function showTagSelection(tabId, customTags) {
  console.log('[TG Saver] Showing tag selection for tab:', tabId);
  const requestId = Date.now().toString() + Math.random().toString(36).substr(2, 9);

  // Create promise that will be resolved when tag is selected
  const tagPromise = new Promise((resolve) => {
    pendingRequests.set(requestId, { resolve });

    // Timeout fallback (30 seconds - user may be hovering)
    setTimeout(() => {
      if (pendingRequests.has(requestId)) {
        console.log('[TG Saver] Tag selection timeout for request:', requestId);
        pendingRequests.delete(requestId);
        resolve(null);
      }
    }, 30000);
  });

  // Send minimal message - pass cached tags to ensure they are available instantly
  chrome.tabs.sendMessage(tabId, {
    action: 'preShowToast',
    requestId: requestId,
    customTags: customTags // Pass tags explicitly!
  }).then(() => {
    console.log('[TG Saver] preShowToast message sent successfully');
  }).catch((err) => {
    console.warn('[TG Saver] Failed to send preShowToast message:', err);
    // If we can't send message, resolve with null to allow sending without tag
    const pending = pendingRequests.get(requestId);
    if (pending) {
      pendingRequests.delete(requestId);
      pending.resolve(null);
    }
  });

  return tagPromise;
}

// Send screenshot of current tab
async function sendScreenshot(tab, settings) {
  try {
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
      const notionPageId = await saveToNotion({ type: 'link', sourceUrl: tab.url, tagName: selectedTag?.name }, settings);
      if (settings.aiEnabled && settings.aiAutoOnSave && notionPageId) {
        analyzeWithAI({ type: 'link', sourceUrl: tab.url, fileId: null }, settings)
          .then(r => patchNotionWithAI(notionPageId, r, settings))
          .catch(e => console.warn('[TG Saver] AI on-save error:', e));
      }
      await showToast(tab.id, 'success', 'Success');
      return;
    }

    const blob = await fetch(dataUrl).then(r => r.blob());
    const caption = buildCaption(tab.url, settings.tagLink, '', settings, selectedTag);

    const result = await sendPhoto(blob, caption, settings);
    const notionPageId = await saveToNotion({ type: 'link', sourceUrl: tab.url, fileId: result?.fileId || null, tagName: selectedTag?.name }, settings);
    if (settings.aiEnabled && settings.aiAutoOnSave && notionPageId) {
      analyzeWithAI({ type: 'link', sourceUrl: tab.url, fileId: result?.fileId || null }, settings)
        .then(r => patchNotionWithAI(notionPageId, r, settings))
        .catch(e => console.warn('[TG Saver] AI on-save error:', e));
    }
    await showToast(tab.id, 'success', 'Success');
  } catch (err) {
    console.error('[TG Saver] Error in sendScreenshot:', err);
    showToast(tab.id, 'error', 'Error: ' + err.message);
  }
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
  try {
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
    const notionPageId = await saveToNotion({ type: 'quote', sourceUrl: pageUrl, content: text, tagName: selectedTag?.name }, settings);
    if (settings.aiEnabled && settings.aiAutoOnSave && notionPageId) {
      analyzeWithAI({ type: 'quote', sourceUrl: pageUrl, content: text }, settings)
        .then(r => patchNotionWithAI(notionPageId, r, settings))
        .catch(e => console.warn('[TG Saver] AI on-save error:', e));
    }

    if (tabId) await showToast(tabId, 'success', 'Success');
  } catch (err) {
    console.error('[TG Saver] Error in sendQuoteWithTabId:', err);
    if (tabId) showToast(tabId, 'error', 'Error: ' + err.message);
  }
}

// Send just a message (link without screenshot)
async function sendMessage(url, settings, selectedTag = null) {
  const caption = buildCaption(url, settings.tagLink, '', settings, selectedTag);
  await sendTextMessage(caption, settings);
}

// Telegram API: send text message
async function sendTextMessage(text, settings) {
  console.log('[TG Saver] Sending text message to Telegram...');
  try {
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
      console.error('[TG Saver] Telegram API error (text):', error);
      throw new Error(error.description || 'Telegram API error');
    }

    console.log('[TG Saver] Text message sent successfully');
    return response.json();
  } catch (err) {
    console.error('[TG Saver] Network error sending text:', err);
    throw err;
  }
}

// Compress image to fit within Telegram photo size limit (10 MB)
async function compressImageIfNeeded(blob) {
  const MAX_SIZE = 10 * 1024 * 1024; // 10 MB
  
  if (blob.size <= MAX_SIZE) {
    console.log('[TG Saver] Image size OK:', (blob.size / 1024 / 1024).toFixed(2), 'MB');
    return blob;
  }

  console.log('[TG Saver] Image too large:', (blob.size / 1024 / 1024).toFixed(2), 'MB - compressing...');

  // Create image from blob
  const img = new Image();
  const imgUrl = URL.createObjectURL(blob);
  
  await new Promise((resolve, reject) => {
    img.onload = resolve;
    img.onerror = reject;
    img.src = imgUrl;
  });

  // Try compression at different quality levels
  let quality = 0.9;
  let compressedBlob = blob;

  while (compressedBlob.size > MAX_SIZE && quality > 0.1) {
    const canvas = document.createElement('canvas');
    canvas.width = img.width;
    canvas.height = img.height;
    
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0);

    compressedBlob = await new Promise(resolve => {
      canvas.toBlob(resolve, 'image/jpeg', quality);
    });

    console.log('[TG Saver] Tried quality', quality, '→', (compressedBlob.size / 1024 / 1024).toFixed(2), 'MB');
    quality -= 0.1;
  }

  // If still too large, reduce dimensions
  if (compressedBlob.size > MAX_SIZE) {
    let scale = 0.9;
    
    while (compressedBlob.size > MAX_SIZE && scale > 0.3) {
      const canvas = document.createElement('canvas');
      canvas.width = Math.floor(img.width * scale);
      canvas.height = Math.floor(img.height * scale);
      
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

      compressedBlob = await new Promise(resolve => {
        canvas.toBlob(resolve, 'image/jpeg', 0.85);
      });

      console.log('[TG Saver] Tried scale', scale, '→', (compressedBlob.size / 1024 / 1024).toFixed(2), 'MB');
      scale -= 0.1;
    }
  }

  URL.revokeObjectURL(imgUrl);
  
  console.log('[TG Saver] Final compressed size:', (compressedBlob.size / 1024 / 1024).toFixed(2), 'MB');
  return compressedBlob;
}

// Telegram API: send photo
async function sendPhoto(blob, caption, settings) {
  console.log('[TG Saver] Sending photo to Telegram...');
  try {
    // Compress if needed to fit 10 MB limit
    const compressedBlob = await compressImageIfNeeded(blob);

    const formData = new FormData();
    formData.append('chat_id', settings.chatId);
    formData.append('photo', compressedBlob, 'screenshot.jpg');
    formData.append('caption', caption);
    formData.append('parse_mode', 'HTML');

    const response = await fetch(`https://api.telegram.org/bot${settings.botToken}/sendPhoto`, {
      method: 'POST',
      body: formData
    });

    if (!response.ok) {
      const error = await response.json();
      console.error('[TG Saver] Telegram API error (photo):', error);
      throw new Error(error.description || 'Telegram API error');
    }

    console.log('[TG Saver] Photo sent successfully');
    const result = await response.json();
    // Extract file_id of the largest photo variant for Notion storage
    const photos = result.result?.photo;
    const fileId = photos && photos.length > 0 ? photos[photos.length - 1].file_id : null;
    return { ...result, fileId };
  } catch (err) {
    console.error('[TG Saver] Network error sending photo:', err);
    throw err;
  }
}

// Telegram API: send document (uncompressed)
async function sendDocument(blob, caption, settings, originalUrl) {
  console.log('[TG Saver] Sending document to Telegram...');
  try {
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
      console.error('[TG Saver] Telegram API error (document):', error);
      throw new Error(error.description || 'Telegram API error');
    }

    console.log('[TG Saver] Document sent successfully');
    return response.json();
  } catch (err) {
    console.error('[TG Saver] Network error sending document:', err);
    throw err;
  }
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

  let fileId = null;
  if (settings.imageCompression || useScreenshot) {
    const result = await sendPhoto(blob, caption, settings);
    fileId = result?.fileId || null;
  } else {
    await sendDocument(blob, caption, settings, imageUrl);
  }

  const notionPageId = await saveToNotion({ type: 'image', sourceUrl: pageUrl, fileId, tagName: selectedTag?.name }, settings);
  if (settings.aiEnabled && settings.aiAutoOnSave && notionPageId) {
    analyzeWithAI({ type: 'image', sourceUrl: pageUrl, fileId }, settings)
      .then(r => patchNotionWithAI(notionPageId, r, settings))
      .catch(e => console.warn('[TG Saver] AI on-save error:', e));
  }

  if (tabId) await showToast(tabId, 'success', 'Success');
}

// Send quote directly (tag already selected via context menu handler)
async function sendQuoteDirect(text, pageUrl, settings, tabId, selectedTag) {
  const caption = buildCaption(pageUrl, settings.tagQuote, text, settings, selectedTag);
  await sendTextMessage(caption, settings);
  const notionPageId = await saveToNotion({ type: 'quote', sourceUrl: pageUrl, content: text, tagName: selectedTag?.name }, settings);
  if (settings.aiEnabled && settings.aiAutoOnSave && notionPageId) {
    analyzeWithAI({ type: 'quote', sourceUrl: pageUrl, content: text }, settings)
      .then(r => patchNotionWithAI(notionPageId, r, settings))
      .catch(e => console.warn('[TG Saver] AI on-save error:', e));
  }
  if (tabId) await showToast(tabId, 'success', 'Success');
}

// Send link directly (tag already selected via context menu handler)
async function sendLinkDirect(linkUrl, pageUrl, settings, tabId, selectedTag) {
  const caption = buildCaption(linkUrl, settings.tagLink, '', settings, selectedTag);
  await sendTextMessage(caption, settings);
  const notionPageId = await saveToNotion({ type: 'link', sourceUrl: linkUrl, tagName: selectedTag?.name }, settings);
  if (settings.aiEnabled && settings.aiAutoOnSave && notionPageId) {
    analyzeWithAI({ type: 'link', sourceUrl: linkUrl, fileId: null }, settings)
      .then(r => patchNotionWithAI(notionPageId, r, settings))
      .catch(e => console.warn('[TG Saver] AI on-save error:', e));
  }
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
    const notionPageId = await saveToNotion({ type: 'link', sourceUrl: tab.url, tagName: selectedTag?.name }, settings);
    if (settings.aiEnabled && settings.aiAutoOnSave && notionPageId) {
      analyzeWithAI({ type: 'link', sourceUrl: tab.url, fileId: null }, settings)
        .then(r => patchNotionWithAI(notionPageId, r, settings))
        .catch(e => console.warn('[TG Saver] AI on-save error:', e));
    }
    await showToast(tab.id, 'success', 'Success');
    return;
  }

  const dataUrl = await capturePromise;
  const blob = await fetch(dataUrl).then(r => r.blob());
  const caption = buildCaption(tab.url, settings.tagLink, '', settings, selectedTag);

  const result = await sendPhoto(blob, caption, settings);
  const notionPageId = await saveToNotion({ type: 'link', sourceUrl: tab.url, fileId: result?.fileId || null, tagName: selectedTag?.name }, settings);
  if (settings.aiEnabled && settings.aiAutoOnSave && notionPageId) {
    analyzeWithAI({ type: 'link', sourceUrl: tab.url, fileId: result?.fileId || null }, settings)
      .then(r => patchNotionWithAI(notionPageId, r, settings))
      .catch(e => console.warn('[TG Saver] AI on-save error:', e));
  }
  await showToast(tab.id, 'success', 'Success');
}

// Send video as screenshot directly (tag already selected)
async function sendVideoDirect(tab, settings, selectedTag) {
  const dataUrl = await chrome.tabs.captureVisibleTab(null, { format: 'png' });
  const blob = await fetch(dataUrl).then(r => r.blob());
  const caption = buildCaption(tab.url, settings.tagImage, '', settings, selectedTag);

  const result = await sendPhoto(blob, caption, settings);
  const notionPageId = await saveToNotion({ type: 'image', sourceUrl: tab.url, fileId: result?.fileId || null, tagName: selectedTag?.name }, settings);
  if (settings.aiEnabled && settings.aiAutoOnSave && notionPageId) {
    analyzeWithAI({ type: 'image', sourceUrl: tab.url, fileId: result?.fileId || null }, settings)
      .then(r => patchNotionWithAI(notionPageId, r, settings))
      .catch(e => console.warn('[TG Saver] AI on-save error:', e));
  }
  await showToast(tab.id, 'success', 'Success');
}

// ─── Viewer fetch relay ───────────────────────────────────────────────────────
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
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
        await patchNotionWithAI(msg.notionPageId, result, merged);
      }
      sendResponse({ ok: !!result, result });
    });
    return true;
  }

  return false;
});

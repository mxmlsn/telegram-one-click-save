// ─── Constants ────────────────────────────────────────────────────────────────
const NOTION_VERSION = '2022-06-28';

const AI_MODELS = {
  google: [
    { value: 'gemini-2.0-flash', label: 'Gemini 2.0 Flash (free)' },
    { value: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash (free)' }
  ],
  anthropic: [
    { value: 'claude-haiku-4-5-20251001', label: 'Claude Haiku (fast)' },
    { value: 'claude-sonnet-4-6', label: 'Claude Sonnet (smart)' }
  ]
};
const AI_DEFAULT_MODEL = { google: 'gemini-2.0-flash', anthropic: 'claude-haiku-4-5-20251001' };

// ─── State ────────────────────────────────────────────────────────────────────
const STATE = {
  items: [],
  imageMap: {},
  notionToken: '',
  notionDbId: '',
  botToken: '',
  aiEnabled: false,
  aiAutoInViewer: false,
  search: '',
  activeTypes: new Set(),
  activeColor: null,
  linkPlainOnly: false,
  layout: 'adaptive',   // adaptive | 4col | 3col
  align: 'masonry',     // masonry | center
  gap: 10,
  padding: 14
};

// ─── Display settings persistence ────────────────────────────────────────────
const DISPLAY_SETTINGS_KEY = 'viewerDisplaySettings';
let _displaySaveTimer = null;

function scheduleDisplaySave() {
  clearTimeout(_displaySaveTimer);
  _displaySaveTimer = setTimeout(() => {
    chrome.storage.local.set({ [DISPLAY_SETTINGS_KEY]: {
      layout: STATE.layout, align: STATE.align, gap: STATE.gap, padding: STATE.padding
    }});
  }, 3000);
}

function restoreDisplaySettings() {
  return new Promise(resolve => {
    chrome.storage.local.get(DISPLAY_SETTINGS_KEY, data => {
      const s = data[DISPLAY_SETTINGS_KEY];
      if (s) {
        if (s.layout) STATE.layout = s.layout;
        if (s.align) STATE.align = s.align;
        if (typeof s.gap === 'number') STATE.gap = s.gap;
        if (typeof s.padding === 'number') STATE.padding = s.padding;
      }
      resolve();
    });
  });
}


// ─── Chrome relay helpers ─────────────────────────────────────────────────────
function bgFetch(url, options = {}) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage({ type: 'FETCH', url, options }, response => {
      if (chrome.runtime.lastError) return reject(new Error(chrome.runtime.lastError.message));
      if (!response) return reject(new Error('No response from background'));
      resolve({
        ok: response.ok,
        status: response.status,
        json: () => Promise.resolve(JSON.parse(response.body)),
        text: () => Promise.resolve(response.body)
      });
    });
  });
}

function getSettings() {
  return new Promise(resolve => {
    chrome.storage.local.get(null, data => resolve(data || {}));
  });
}

// ─── Auth ────────────────────────────────────────────────────────────────────
async function init() {
  setupSettingsPanel();  // always wire up panel events first
  const settings = await getSettings();
  if (settings.notionToken && settings.notionDbId && settings.botToken) {
    STATE.notionToken = settings.notionToken;
    STATE.notionDbId = settings.notionDbId;
    STATE.botToken = settings.botToken;
    STATE.aiEnabled = !!(settings.aiEnabled && settings.aiApiKey);
    STATE.aiAutoInViewer = settings.aiAutoInViewer !== false;
    startApp();
  } else {
    openSettingsPanel();
  }
}

function disconnect() {
  chrome.storage.local.remove(
    ['notionToken', 'notionDbId', 'botToken', 'isConnected'],
    () => location.reload()
  );
}

// ─── App start ────────────────────────────────────────────────────────────────
const FIRST_BATCH_SIZE = 16;

async function startApp() {
  document.getElementById('search-pill').classList.remove('hidden');
  document.getElementById('toolbar').classList.remove('hidden');
  document.getElementById('display-bar').classList.remove('hidden');
  document.getElementById('grid-wrap').classList.remove('hidden');
  document.getElementById('ai-status').textContent = 'Loading…';

  await restoreDisplaySettings();
  setupToolbarEvents();
  setupDisplayBar();

  try {
    // 1. Fetch all items from Notion
    const pages = await fetchNotion();
    STATE.items = mergeMediaGroups(pages.map(parseItem));

    // 2. Load file URL cache
    const fileCache = await loadFileCache();

    // 3. Resolve images for the first batch (newest items) — show ASAP
    const firstItems = STATE.items.slice(0, FIRST_BATCH_SIZE);
    const firstMap = await resolveImagesBatch(firstItems, STATE.botToken, fileCache);
    Object.assign(STATE.imageMap, firstMap);

    // 4. Render immediately — first 16 with images, rest without
    applyFilters();
    document.getElementById('ai-status').textContent = '';

    // 5. Resolve remaining images in background, patch cards as they come
    const restItems = STATE.items.slice(FIRST_BATCH_SIZE).filter(i => i.fileId || i.fileIds?.length > 1);
    if (restItems.length > 0) {
      resolveRemainingImages(restItems, fileCache);
    } else {
      saveFileCache(fileCache);
    }

    if (STATE.aiEnabled && STATE.aiAutoInViewer) {
      runAiBackgroundProcessing();
    }
  } catch (e) {
    document.getElementById('ai-status').textContent = 'Error: ' + e.message;
    console.error('[Viewer] load error:', e);
  }
}

async function resolveRemainingImages(items, fileCache) {
  const now = Date.now();

  // Collect all unique fileIds (main + album extras)
  const allFileIds = new Set();
  for (const item of items) {
    if (item.fileId) allFileIds.add(item.fileId);
    if (item.fileIds?.length > 1) {
      for (const fid of item.fileIds) if (fid) allFileIds.add(fid);
    }
  }

  const toFetchIds = [];
  // Apply cached URLs first
  for (const fid of allFileIds) {
    const cached = fileCache[fid];
    if (cached && (now - cached.ts < FILE_CACHE_TTL)) {
      STATE.imageMap[fid] = cached.url;
    } else {
      toFetchIds.push(fid);
    }
  }

  // Set _resolvedImg from cache
  const cachedItems = [];
  for (const item of items) {
    if (item.fileId && STATE.imageMap[item.fileId]) {
      item._resolvedImg = STATE.imageMap[item.fileId];
      cachedItems.push(item);
    }
  }
  if (cachedItems.length) patchCardImages(cachedItems);

  // Fetch uncached in batches, patching cards after each batch
  const BATCH = 15;
  for (let i = 0; i < toFetchIds.length; i += BATCH) {
    const batch = toFetchIds.slice(i, i + BATCH);
    const urls = await Promise.all(batch.map(fid => resolveFileId(STATE.botToken, fid)));
    batch.forEach((fid, idx) => {
      if (urls[idx]) {
        STATE.imageMap[fid] = urls[idx];
        fileCache[fid] = { url: urls[idx], ts: now };
      }
    });
    // Patch cards that now have their main fileId resolved
    const resolved = items.filter(it =>
      it.fileId && STATE.imageMap[it.fileId] && !it._resolvedImg
    );
    for (const it of resolved) it._resolvedImg = STATE.imageMap[it.fileId];
    // Also re-render album cards that got new album images resolved in this batch
    const albumsToRepatch = items.filter(it =>
      it._resolvedImg && (it.fileIds?.length > 1 || it.albumMedia?.length > 1) && batch.some(fid => it.fileIds.includes(fid))
    );
    const toPatch = [...new Set([...resolved, ...albumsToRepatch])];
    if (toPatch.length) patchCardImages(toPatch);
    if (i + BATCH < toFetchIds.length) await new Promise(r => setTimeout(r, 200));
  }

  // Fallback: items whose fileId failed but have a thumbnailFileId — try thumbnail
  const fallbackItems = items.filter(it => !it._resolvedImg && it.ai_data?.thumbnailFileId && it.ai_data.thumbnailFileId !== it.fileId);
  if (fallbackItems.length > 0) {
    const thumbIds = [...new Set(fallbackItems.map(it => it.ai_data.thumbnailFileId))];
    const thumbUrls = await Promise.all(thumbIds.map(fid => resolveFileId(STATE.botToken, fid)));
    thumbIds.forEach((fid, idx) => {
      if (thumbUrls[idx]) {
        STATE.imageMap[fid] = thumbUrls[idx];
        fileCache[fid] = { url: thumbUrls[idx], ts: now };
      }
    });
    const thumbPatched = [];
    for (const item of fallbackItems) {
      const thumbFid = item.ai_data.thumbnailFileId;
      if (STATE.imageMap[thumbFid]) {
        item._resolvedImg = STATE.imageMap[thumbFid];
        STATE.imageMap[item.fileId] = STATE.imageMap[thumbFid];
        thumbPatched.push(item);
      }
    }
    if (thumbPatched.length) patchCardImages(thumbPatched);
  }

  saveFileCache(fileCache);
}

// ─── Notion fetch ─────────────────────────────────────────────────────────────
async function fetchNotion() {
  let results = [];
  let cursor;
  let page = 0;
  do {
    const body = { page_size: 100, sorts: [{ property: 'Date', direction: 'descending' }] };
    if (cursor) body.start_cursor = cursor;
    const res = await bgFetch(`https://api.notion.com/v1/databases/${STATE.notionDbId}/query`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${STATE.notionToken}`,
        'Notion-Version': NOTION_VERSION,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    });
    if (!res.ok) {
      let msg = 'Notion fetch failed';
      try { const d = await res.json(); msg = d.message || msg; } catch {}
      throw new Error(`${res.status}: ${msg}`);
    }
    const data = await res.json();
    results = results.concat(data.results);
    cursor = data.has_more ? data.next_cursor : undefined;
    page++;
  } while (cursor && page < 20);
  return results;
}

function parseItem(page) {
  const p = page.properties;
  let aiData = {};
  try { aiData = JSON.parse(p['ai_data']?.rich_text?.[0]?.text?.content || '{}'); } catch {}

  const rawFileId = p['File ID']?.rich_text?.[0]?.text?.content || '';
  const type = p['Type']?.select?.name || 'link';
  const isVideoType = type === 'video' || aiData.mediaType === 'video';
  const isPdfType = type === 'pdf' || aiData.mediaType === 'pdf';
  const isVideoNoteType = type === 'video_note' || aiData.mediaType === 'video_note';
  const isAudioType = type === 'audio' || aiData.mediaType === 'audio';
  const hasThumb = !!aiData.thumbnailFileId;

  // For video/PDF/video_note/audio: use thumbnail for display, keep original for playback
  // For images/documents: use full file (falls back to thumbnail in resolution pipeline)
  const isDocType = type === 'document';
  const needsThumbSwap = (isVideoType || isPdfType || isVideoNoteType || isAudioType) && hasThumb;
  const displayFileId = needsThumbSwap ? aiData.thumbnailFileId : rawFileId;
  const videoFileId = ((isVideoType || isVideoNoteType) && hasThumb) ? rawFileId : ((isVideoType || isVideoNoteType) ? rawFileId : '');
  const pdfFileId = (isPdfType && hasThumb) ? rawFileId : (isPdfType ? rawFileId : '');

  return {
    id: page.id,
    url: p['URL']?.title?.[0]?.text?.content || '',
    type,
    tag: p['Tag']?.select?.name || '',
    content: p['Content']?.rich_text?.[0]?.text?.content || '',
    fileId: displayFileId,
    videoFileId,
    pdfFileId,
    audioFileId: (isAudioType || type === 'voice' || aiData.mediaType === 'voice') ? rawFileId : '',
    sourceUrl: p['Source URL']?.url || '',
    date: p['Date']?.date?.start || '',
    ai_type: p['ai_type']?.select?.name || null,
    ai_type_secondary: p['ai_type_secondary']?.select?.name || null,
    ai_description: p['ai_description']?.rich_text?.[0]?.text?.content || '',
    ai_analyzed: p['ai_analyzed']?.checkbox || false,
    ai_data: aiData,
    fileIds: [],       // populated by mergeMediaGroups for albums
    _resolvedImg: null
  };
}

// ─── Media group merging (albums) ────────────────────────────────────────────
function mergeMediaGroups(items) {
  const groups = {};
  const result = [];
  for (const item of items) {
    const gid = item.ai_data?.mediaGroupId;
    if (gid) {
      const mediaEntry = {
        fileId: item.fileId,
        mediaType: item.ai_data?.mediaType || 'image',
        videoFileId: item.videoFileId || '',
        pdfFileId: item.pdfFileId || '',
      };
      if (!groups[gid]) {
        groups[gid] = item;
        // Always add media entry (even without fileId — PDF/video can still show badge)
        item.albumMedia = [mediaEntry];
        item.fileIds = item.fileId ? [item.fileId] : [];
        result.push(item);
      } else {
        // Merge into existing group item — always add media entry
        groups[gid].albumMedia.push(mediaEntry);
        if (item.fileId) {
          groups[gid].fileIds.push(item.fileId);
        }
        // Use content from whichever has it (caption is usually on first message)
        if (!groups[gid].content && item.content) {
          groups[gid].content = item.content;
        }
        // Merge HTML content flag
        if (item.ai_data?.htmlContent) {
          groups[gid].ai_data.htmlContent = true;
        }
        // Merge channel/forward metadata from any group member
        if (!groups[gid].ai_data.channelTitle && item.ai_data?.channelTitle) {
          groups[gid].ai_data.channelTitle = item.ai_data.channelTitle;
        }
        if (!groups[gid].ai_data.forwardFrom && item.ai_data?.forwardFrom) {
          groups[gid].ai_data.forwardFrom = item.ai_data.forwardFrom;
        }
      }
    } else {
      result.push(item);
    }
  }
  // Promote merged groups to tgpost so album rendering always triggers
  for (const item of result) {
    if (item.albumMedia?.length > 1 && item.type !== 'tgpost') {
      item.type = 'tgpost';
    }
  }
  return result;
}

// ─── Image resolution with cache ──────────────────────────────────────────────
const FILE_CACHE_KEY = 'tgFileUrlCache';
const FILE_CACHE_TTL = 50 * 60 * 1000; // 50 minutes (TG links live ~1hr)

async function loadFileCache() {
  return new Promise(resolve => {
    chrome.storage.local.get(FILE_CACHE_KEY, data => {
      resolve(data[FILE_CACHE_KEY] || {});
    });
  });
}

function saveFileCache(cache) {
  // Prune expired entries before saving
  const now = Date.now();
  const pruned = {};
  for (const [k, v] of Object.entries(cache)) {
    if (now - v.ts < FILE_CACHE_TTL) pruned[k] = v;
  }
  chrome.storage.local.set({ [FILE_CACHE_KEY]: pruned });
}

async function resolveFileId(tgToken, fileId) {
  if (!fileId) return null;
  try {
    const res = await fetch(`https://api.telegram.org/bot${tgToken}/getFile?file_id=${fileId}`);
    if (!res.ok) return null;
    const data = await res.json();
    if (!data.ok || !data.result?.file_path) return null;
    return `https://api.telegram.org/file/bot${tgToken}/${data.result.file_path}`;
  } catch { return null; }
}

// Resolve a batch of items, using cache where possible
async function resolveImagesBatch(items, tgToken, cache) {
  const now = Date.now();
  const toFetch = [];
  const map = {};

  // Collect all fileIds that need resolution (main + album extras)
  const allFileIds = new Set();
  for (const item of items) {
    if (item.fileId) allFileIds.add(item.fileId);
    if (item.fileIds?.length > 1) {
      for (const fid of item.fileIds) if (fid) allFileIds.add(fid);
    }
  }

  const toFetchIds = [];
  for (const fid of allFileIds) {
    const cached = cache[fid];
    if (cached && (now - cached.ts < FILE_CACHE_TTL)) {
      map[fid] = cached.url;
    } else {
      toFetchIds.push(fid);
    }
  }

  // Set _resolvedImg from cache for main items
  for (const item of items) {
    if (item.fileId && map[item.fileId]) {
      item._resolvedImg = map[item.fileId];
    }
  }

  // Fetch uncached in batches of 15
  const BATCH = 15;
  for (let i = 0; i < toFetchIds.length; i += BATCH) {
    const batch = toFetchIds.slice(i, i + BATCH);
    const urls = await Promise.all(batch.map(fid => resolveFileId(tgToken, fid)));
    batch.forEach((fid, idx) => {
      if (urls[idx]) {
        map[fid] = urls[idx];
        cache[fid] = { url: urls[idx], ts: now };
      }
    });
    if (i + BATCH < toFetchIds.length) await new Promise(r => setTimeout(r, 200));
  }

  // Set _resolvedImg for items resolved in this batch
  for (const item of items) {
    if (item.fileId && map[item.fileId] && !item._resolvedImg) {
      item._resolvedImg = map[item.fileId];
    }
  }

  // Fallback: items whose fileId failed but have a thumbnailFileId — try thumbnail
  const fallbackItems = items.filter(it => !it._resolvedImg && it.ai_data?.thumbnailFileId && it.ai_data.thumbnailFileId !== it.fileId);
  if (fallbackItems.length > 0) {
    const thumbIds = [...new Set(fallbackItems.map(it => it.ai_data.thumbnailFileId))];
    const thumbUrls = await Promise.all(thumbIds.map(fid => resolveFileId(tgToken, fid)));
    thumbIds.forEach((fid, idx) => {
      if (thumbUrls[idx]) {
        map[fid] = thumbUrls[idx];
        cache[fid] = { url: thumbUrls[idx], ts: now };
      }
    });
    for (const item of fallbackItems) {
      const thumbFid = item.ai_data.thumbnailFileId;
      if (map[thumbFid]) {
        item._resolvedImg = map[thumbFid];
        // Update fileId to thumbnail so rendering uses it
        STATE.imageMap[item.fileId] = map[thumbFid];
      }
    }
  }

  return map;
}

// Patch already-rendered cards with resolved image URLs
function patchCardImages(items) {
  for (const item of items) {
    if (!item._resolvedImg) continue;
    const card = document.querySelector(`.card[data-id="${item.id}"]`);
    if (!card) continue;
    // Replace the whole card HTML to get correct card type rendering
    card.outerHTML = renderCard(item);
    // Re-check xpost truncation on the new card
    const newCard = document.querySelector(`.card[data-id="${item.id}"]`);
    if (newCard && newCard.classList.contains('card-xpost')) {
      const textEl = newCard.querySelector('.xpost-text');
      if (textEl && textEl.scrollHeight > textEl.clientHeight + 2) {
        newCard.classList.add('xpost-truncated');
        if (newCard.classList.contains('xpost-collapsed')) textEl.classList.add('truncated-collapsed');
      }
    }
  }
}


// ─── Settings panel ───────────────────────────────────────────────────────────
function populateSpModels(provider, selectedModel) {
  const sel = document.getElementById('sp-ai-model');
  if (!sel) return;
  const models = AI_MODELS[provider] || AI_MODELS.google;
  sel.innerHTML = models.map(m =>
    `<option value="${m.value}"${m.value === selectedModel ? ' selected' : ''}>${m.label}</option>`
  ).join('');
}

async function openSettingsPanel() {
  const panel = document.getElementById('settings-panel');
  if (!panel) return;

  const s = await getSettings();
  document.getElementById('sp-notion-token').value = s.notionToken || '';
  document.getElementById('sp-db-id').value = s.notionDbId || '';
  document.getElementById('sp-tg-token').value = s.botToken || '';
  document.getElementById('sp-ai-enabled').checked = s.aiEnabled || false;

  const provider = s.aiProvider || 'google';
  document.getElementById('sp-ai-provider').value = provider;
  document.getElementById('sp-ai-key').value = s.aiApiKey || '';
  populateSpModels(provider, s.aiModel || AI_DEFAULT_MODEL[provider]);
  document.getElementById('sp-ai-onsave').checked = s.aiAutoOnSave !== false;
  document.getElementById('sp-ai-inviewer').checked = s.aiAutoInViewer !== false;

  panel.classList.remove('hidden');
}

function setupSettingsPanel() {
  document.getElementById('settings-btn')?.addEventListener('click', openSettingsPanel);
  document.getElementById('settings-overlay')?.addEventListener('click', closeSettingsPanel);
  document.getElementById('settings-close')?.addEventListener('click', closeSettingsPanel);

  // Eye toggle for secret fields
  document.querySelectorAll('.settings-reveal-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      btn.closest('.settings-secret-group').classList.toggle('revealed');
    });
  });

  document.getElementById('sp-ai-provider')?.addEventListener('change', e => {
    const provider = e.target.value;
    populateSpModels(provider, AI_DEFAULT_MODEL[provider]);
  });

  document.getElementById('sp-test-btn')?.addEventListener('click', async () => {
    const status = document.getElementById('sp-test-status');
    const key = document.getElementById('sp-ai-key').value.trim();
    const provider = document.getElementById('sp-ai-provider').value;
    if (!key) { status.textContent = 'Enter key first'; return; }
    status.textContent = 'Testing…';
    try {
      let res;
      if (provider === 'google') {
        const model = document.getElementById('sp-ai-model').value || 'gemini-2.0-flash';
        res = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`,
          { method: 'POST', headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ contents: [{ parts: [{ text: 'hi' }] }] }) }
        );
      } else {
        res = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
          body: JSON.stringify({ model: 'claude-haiku-4-5-20251001', max_tokens: 10, messages: [{ role: 'user', content: 'hi' }] })
        });
      }
      status.textContent = res.ok ? '✓ Connected' : `✗ Error ${res.status}`;
    } catch { status.textContent = '✗ Network error'; }
  });

  document.getElementById('sp-save-btn')?.addEventListener('click', async () => {
    const notionToken = document.getElementById('sp-notion-token').value.trim();
    const notionDbId = document.getElementById('sp-db-id').value.trim();
    const botToken = document.getElementById('sp-tg-token').value.trim();
    const aiEnabled = document.getElementById('sp-ai-enabled').checked;
    const aiProvider = document.getElementById('sp-ai-provider').value;
    const aiApiKey = document.getElementById('sp-ai-key').value.trim();
    const aiModel = document.getElementById('sp-ai-model').value;
    const aiAutoOnSave = document.getElementById('sp-ai-onsave').checked;
    const aiAutoInViewer = document.getElementById('sp-ai-inviewer').checked;

    await new Promise(resolve =>
      chrome.storage.local.set(
        { notionToken, notionDbId, botToken, aiEnabled, aiProvider, aiApiKey, aiModel, aiAutoOnSave, aiAutoInViewer },
        resolve
      )
    );

    closeSettingsPanel();

    if (notionToken && notionDbId && botToken) {
      location.reload();
    }
  });

  document.getElementById('sp-disconnect-btn')?.addEventListener('click', disconnect);
}

function closeSettingsPanel() {
  document.getElementById('settings-panel')?.classList.add('hidden');
}

// ─── Toolbar events ───────────────────────────────────────────────────────────
function setupToolbarEvents() {
  const searchPill = document.getElementById('search-pill');
  const searchInput = document.getElementById('search-input');

  searchInput.addEventListener('input', e => {
    STATE.search = e.target.value.toLowerCase();
    applyFilters();
  });

  // Collapse search pill on scroll, expand on click
  let scrollCollapsed = false;
  window.addEventListener('scroll', () => {
    const shouldCollapse = window.scrollY > 60;
    if (shouldCollapse === scrollCollapsed) return;
    scrollCollapsed = shouldCollapse;
    if (shouldCollapse && document.activeElement !== searchInput) {
      searchPill.classList.add('collapsed');
    } else if (!shouldCollapse) {
      searchPill.classList.remove('collapsed');
    }
  }, { passive: true });

  searchPill.addEventListener('click', () => {
    if (searchPill.classList.contains('collapsed')) {
      searchPill.classList.remove('collapsed');
      searchInput.focus();
    }
  });

  searchInput.addEventListener('blur', () => {
    if (window.scrollY > 60) {
      searchPill.classList.add('collapsed');
    }
  });

  // Create "plain" sub-pill for Link filter (initially hidden)
  const plainPill = document.createElement('button');
  plainPill.className = 'type-pill type-pill-sub';
  plainPill.dataset.type = 'link-plain';
  plainPill.textContent = 'plain';
  plainPill.style.display = 'none';
  const linkPill = document.querySelector('.type-pill[data-type="link"]');
  if (linkPill) linkPill.parentNode.insertBefore(plainPill, linkPill.nextSibling);

  plainPill.addEventListener('click', () => {
    STATE.linkPlainOnly = !STATE.linkPlainOnly;
    plainPill.classList.toggle('active', STATE.linkPlainOnly);
    applyFilters();
  });

  document.querySelectorAll('.type-pill').forEach(pill => {
    pill.addEventListener('click', () => {
      const type = pill.dataset.type;
      if (type === 'all') {
        STATE.activeTypes.clear();
        document.querySelectorAll('.type-pill').forEach(p => p.classList.remove('active'));
        pill.classList.add('active');
      } else {
        document.querySelector('.type-pill[data-type="all"]').classList.remove('active');
        if (STATE.activeTypes.has(type)) {
          STATE.activeTypes.delete(type);
          pill.classList.remove('active');
          if (STATE.activeTypes.size === 0) {
            document.querySelector('.type-pill[data-type="all"]').classList.add('active');
          }
        } else {
          STATE.activeTypes.add(type);
          pill.classList.add('active');
        }
      }
      // Toggle plain sub-pill visibility
      const showPlain = STATE.activeTypes.has('link');
      plainPill.style.display = showPlain ? '' : 'none';
      if (!showPlain) {
        STATE.linkPlainOnly = false;
        plainPill.classList.remove('active');
      }
      applyFilters();
    });
  });

  const colorBtn = document.getElementById('color-filter-btn');
  const colorDropdown = document.getElementById('color-dropdown');

  colorBtn.addEventListener('click', e => {
    e.stopPropagation();
    if (STATE.activeColor) {
      STATE.activeColor = null;
      colorBtn.style.background = '';
      colorBtn.classList.remove('filled');
      colorBtn.textContent = '+';
      applyFilters();
      return;
    }
    colorDropdown.classList.toggle('hidden');
  });

  document.querySelectorAll('.color-option-single').forEach(opt => {
    opt.addEventListener('click', e => {
      e.stopPropagation();
      const color = opt.dataset.color;
      STATE.activeColor = color;
      colorBtn.style.background = opt.style.background;
      colorBtn.classList.add('filled');
      colorDropdown.classList.add('hidden');
      applyFilters();
    });
  });

  document.addEventListener('click', () => {
    colorDropdown.classList.add('hidden');
  });

  document.getElementById('disconnect-btn')?.addEventListener('click', disconnect);
}

// ─── Display bar ──────────────────────────────────────────────────────────────
function setupDisplayBar() {
  // Restore UI from STATE
  document.querySelectorAll('#display-bar [data-layout]').forEach(b => {
    b.classList.toggle('active', b.dataset.layout === STATE.layout);
  });
  document.querySelectorAll('#display-bar [data-align]').forEach(b => {
    b.classList.toggle('active', b.dataset.align === STATE.align);
  });
  const gapRange = document.getElementById('gap-range');
  const gapVal = document.getElementById('gap-val');
  gapRange.value = STATE.gap;
  if (gapVal) gapVal.textContent = STATE.gap;
  const padRange = document.getElementById('padding-range');
  const padVal = document.getElementById('padding-val');
  padRange.value = STATE.padding;
  if (padVal) padVal.textContent = STATE.padding;

  // Layout buttons
  document.querySelectorAll('#display-bar [data-layout]').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#display-bar [data-layout]').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      STATE.layout = btn.dataset.layout;
      applyFilters();
      scheduleDisplaySave();
    });
  });

  // Gap range
  gapRange.addEventListener('input', () => {
    STATE.gap = parseInt(gapRange.value, 10);
    if (gapVal) gapVal.textContent = STATE.gap;
    applyGridMode();
    scheduleDisplaySave();
  });

  // Padding range (track only shows left of thumb)
  function updatePadFill() {
    const pct = (padRange.value - padRange.min) / (padRange.max - padRange.min) * 100;
    padRange.style.setProperty('--fill', pct + '%');
  }
  updatePadFill();
  padRange.addEventListener('input', () => {
    STATE.padding = parseInt(padRange.value, 10);
    if (padVal) padVal.textContent = STATE.padding;
    updatePadFill();
    applyGridMode();
    scheduleDisplaySave();
  });

  // Row alignment buttons
  document.querySelectorAll('#display-bar [data-align]').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#display-bar [data-align]').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      STATE.align = btn.dataset.align;
      applyFilters();
      scheduleDisplaySave();
    });
  });

  // Re-render on resize (column count may change in adaptive mode)
  let resizeTimer;
  window.addEventListener('resize', () => {
    if (STATE.align === 'masonry' && STATE.layout === 'adaptive') {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => applyFilters(), 150);
    }
  });

  applyGridMode();
}

function applyGridMode() {
  const m = document.getElementById('masonry');
  const wrap = document.getElementById('grid-wrap');
  if (!m) return;

  const gap = STATE.gap + 'px';
  m.style.setProperty('--grid-gap', gap);

  // Apply side padding
  const pad = STATE.padding + 'px';
  wrap.style.paddingLeft = pad;
  wrap.style.paddingRight = pad;

  // Reset mode classes
  m.classList.remove('mode-rows', 'rows-adaptive', 'rows-4col', 'rows-3col');

  if (STATE.align === 'center') {
    // Flex-wrap row layout
    m.classList.add('mode-rows');
    if (STATE.layout === '3col') m.classList.add('rows-3col');
    else if (STATE.layout === '4col') m.classList.add('rows-4col');
    else m.classList.add('rows-adaptive');
  }
  // Masonry mode: gap is handled by CSS flex gap on #masonry and .masonry-col
}

// ─── Filtering ────────────────────────────────────────────────────────────────
// Base types (from TG): image, link, quote
// AI types (content category): article, video, product, xpost
// Filtering: if base type selected → match item.type
//            if AI type selected → match item.ai_type
//            AND logic across base vs AI axes: item must satisfy both if both axes have selection
const BASE_TYPES = new Set(['image', 'gif', 'link', 'quote', 'pdf', 'tgpost', 'video', 'video_note', 'voice', 'audio']);
const AI_TYPES = new Set(['article', 'video', 'product', 'xpost', 'tool', 'pdf']);
const LINK_AI_OVERRIDES = new Set(['article', 'video', 'product', 'xpost', 'tool', 'pdf']);

function applyFilters() {
  let items = STATE.items;

  if (STATE.activeTypes.size > 0) {
    const activeBase = [...STATE.activeTypes].filter(t => BASE_TYPES.has(t));
    const activeAI = [...STATE.activeTypes].filter(t => AI_TYPES.has(t));

    // Types that exist in both BASE and AI sets (e.g. 'pdf') — use OR logic
    const dualTypes = activeBase.filter(t => activeAI.includes(t));
    const pureBase = activeBase.filter(t => !dualTypes.includes(t));
    const pureAI = activeAI.filter(t => !dualTypes.includes(t));
    const videoLinkRe = /(?:youtube\.com\/watch|youtu\.be\/|youtube\.com\/shorts\/|vimeo\.com\/)/;
    items = items.filter(item => {
      // Notion still stores old 'text' records — treat as 'quote'
      const itemBaseType = item.type === 'text' ? 'quote' : item.type;
      // For tgpost items with mediaType, also match the media type filter
      // (e.g. forwarded voice → type:'tgpost', mediaType:'voice' should match "voice" filter)
      let mediaType = item.ai_data?.mediaType || '';
      // Detect YouTube/Vimeo links as 'video' for filter matching
      if (!mediaType && videoLinkRe.test((item.sourceUrl || '') + ' ' + (item.content || ''))) {
        mediaType = 'video';
      }
      // Dual type match: item's base type, ai_type, or mediaType matches a dual type
      const dualMatch = dualTypes.length > 0 && (dualTypes.includes(itemBaseType) || dualTypes.includes(item.ai_type) || dualTypes.includes(item.ai_type_secondary) || dualTypes.includes(mediaType));
      // If only dual types are selected (no pure base/AI), just use dual match
      if (pureBase.length === 0 && pureAI.length === 0) {
        return dualMatch;
      }
      // If dual matches, always include
      if (dualMatch) return true;
      // Otherwise check pure base/AI filters
      const baseMatch = pureBase.length === 0 || pureBase.includes(itemBaseType) || pureBase.includes(mediaType);
      const aiMatch = pureAI.length === 0 || pureAI.includes(item.ai_type) || pureAI.includes(item.ai_type_secondary) || pureAI.includes(mediaType);
      return baseMatch && aiMatch;
    });
  }

  // Sub-filter: plain links only (no AI type override)
  if (STATE.linkPlainOnly) {
    items = items.filter(item => item.type === 'link' && !LINK_AI_OVERRIDES.has(item.ai_type));
  }

  if (STATE.activeColor) {
    // Map legacy AI tags → new filter tags so old records still match
    const COLOR_ALIASES = {
      purple: 'violet', orange: 'yellow',
    };
    const REVERSE_ALIASES = {};
    for (const [old, nw] of Object.entries(COLOR_ALIASES)) REVERSE_ALIASES[nw] = (REVERSE_ALIASES[nw] || []).concat(old);

    const target = STATE.activeColor;
    const alsoMatch = REVERSE_ALIASES[target] || []; // e.g. violet → ["purple"]

    // Black/white/bw: strict mode — only match truly monochromatic images
    const STRICT_COLORS = new Set(['black', 'white', 'bw']);
    const isStrict = STRICT_COLORS.has(target);

    items = items.filter(item => {
      const d = item.ai_data;
      if (!d) return false;

      if (isStrict) {
        // Strict: must be the dominant color (color_palette) or first in color_top3 or color_subject
        const palette = d.color_palette;
        const subject = d.color_subject;
        const top1 = d.color_top3?.[0];
        return palette === target || subject === target || top1 === target;
      }

      // Normal colors: match anywhere in color_top3
      if (d.color_top3?.length) {
        return d.color_top3.includes(target) || d.color_top3.some(c => COLOR_ALIASES[c] === target);
      }
      // Legacy fallback: match color_palette
      const cp = d.color_palette;
      return cp === target || alsoMatch.includes(cp);
    });
  }

  if (STATE.search) {
    items = items.filter(item => {
      const hay = [
        item.url, item.content, item.sourceUrl,
        item.ai_description,
        item.ai_data?.text_on_image || '',
        JSON.stringify(item.ai_data)
      ].join(' ').toLowerCase();
      return hay.includes(STATE.search);
    });
  }

  renderAll(items);
}

// ─── Card rendering ───────────────────────────────────────────────────────────
function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function showToast(msg, duration = 4000) {
  let container = document.getElementById('toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toast-container';
    container.style.cssText = 'position:fixed;bottom:24px;left:50%;transform:translateX(-50%);z-index:99999;display:flex;flex-direction:column;gap:8px;align-items:center';
    document.body.appendChild(container);
  }
  const el = document.createElement('div');
  el.style.cssText = 'background:rgba(30,30,30,0.95);color:#fff;padding:10px 20px;border-radius:10px;font-size:13px;max-width:360px;text-align:center;backdrop-filter:blur(10px);box-shadow:0 4px 12px rgba(0,0,0,0.3);transition:opacity .3s';
  el.innerHTML = msg;
  container.appendChild(el);
  setTimeout(() => { el.style.opacity = '0'; setTimeout(() => el.remove(), 300); }, duration);
}

function sanitizeHtml(html) {
  if (!html) return '';
  // Strip all tags except safe ones
  return html
    .replace(/<(?!\/?(?:a|b|i|u|s|code|pre)\b)[^>]*>/gi, '')
    .replace(/<a\s/gi, '<a target="_blank" rel="noopener" ');
}

function toTitleCase(str) {
  if (!str) return '';
  return str.replace(/\b\w+/g, w => w[0].toUpperCase() + w.slice(1).toLowerCase());
}

function getDomain(url) {
  try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return url || ''; }
}

const RULER_SVG = `<svg width="100%" viewBox="0 0 280 31" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M81.8652 21.2266C82.9651 21.2266 83.6975 21.4319 84.0615 21.8438C84.4295 22.2558 84.6133 22.8146 84.6133 23.5186C84.6132 24.0784 84.463 24.5142 84.1631 24.8262C83.8671 25.1381 83.4154 25.306 82.8076 25.3301C83.4195 25.3461 83.873 25.5047 84.1689 25.8047C84.4649 26.1007 84.6132 26.5261 84.6133 27.082C84.6133 27.838 84.4314 28.4267 84.0674 28.8467C83.7073 29.2625 82.973 29.4707 81.8652 29.4707C80.7813 29.4707 80.0489 29.244 79.6689 28.792C79.2932 28.336 79.1055 27.6361 79.1055 26.6924H80.3174C80.3174 27.5043 80.4433 28.0305 80.6953 28.2705C80.9473 28.5104 81.3393 28.6298 81.8711 28.6299C82.403 28.6299 82.7912 28.5142 83.0352 28.2822C83.2792 28.0502 83.4014 27.6081 83.4014 26.9561C83.4013 26.5041 83.2688 26.1925 83.0049 26.0205C82.7448 25.8446 82.269 25.7503 81.5771 25.7383V24.958C82.2688 24.942 82.7448 24.8402 83.0049 24.6523C83.2689 24.4603 83.4014 24.1441 83.4014 23.7041C83.4014 23.0762 83.2754 22.646 83.0234 22.4141C82.7754 22.1781 82.3911 22.0605 81.8711 22.0605C81.3592 22.0606 80.971 22.1865 80.707 22.4385C80.4472 22.6906 80.3174 23.2626 80.3174 24.1543H79.1055C79.1055 23.1503 79.2995 22.4124 79.6875 21.9404C80.0795 21.4644 80.8053 21.2266 81.8652 21.2266ZM226.868 21.2266C227.832 21.2266 228.505 21.428 228.885 21.832C229.265 22.232 229.454 22.7321 229.454 23.332C229.454 24.0239 229.24 24.5277 228.812 24.8438C228.699 24.9282 228.569 24.9997 228.424 25.0615C228.595 25.1345 228.75 25.2209 228.885 25.3242C229.345 25.6722 229.574 26.2087 229.574 26.9326C229.574 27.6804 229.373 28.2908 228.969 28.7627C228.565 29.2346 227.864 29.4707 226.868 29.4707C225.833 29.4707 225.12 29.2345 224.732 28.7627C224.344 28.2908 224.15 27.6804 224.15 26.9326C224.15 26.2086 224.383 25.6722 224.847 25.3242C224.981 25.2222 225.134 25.1369 225.304 25.0645C225.158 25.0036 225.027 24.9334 224.912 24.8506C224.484 24.5346 224.271 24.028 224.271 23.332C224.271 22.7321 224.454 22.232 224.822 21.832C225.19 21.4281 225.872 21.2266 226.868 21.2266ZM142.341 22.1318H138.345V24.4648C138.389 24.4306 138.434 24.3959 138.482 24.3643C139.006 24.0203 139.625 23.8486 140.337 23.8486C141.093 23.8487 141.644 24.0567 141.992 24.4727C142.34 24.8887 142.515 25.5706 142.515 26.5186C142.515 27.5544 142.31 28.3046 141.902 28.7686C141.494 29.2284 140.774 29.458 139.742 29.458C138.778 29.4579 138.103 29.234 137.715 28.7861C137.327 28.3381 137.133 27.7299 137.133 26.9619H138.345C138.349 27.5979 138.471 28.0364 138.711 28.2764C138.951 28.5162 139.313 28.6367 139.797 28.6367C140.277 28.6367 140.643 28.506 140.895 28.2461C141.15 27.9821 141.278 27.4121 141.278 26.5361C141.278 25.7402 141.156 25.2224 140.912 24.9824C140.668 24.7385 140.328 24.6162 139.893 24.6162C139.437 24.6162 139.066 24.73 138.782 24.958C138.534 25.154 138.392 25.4084 138.354 25.7207L138.345 25.8584H137.133V21.2861H142.341V22.1318ZM168.936 21.2266C169.939 21.2266 170.604 21.4645 170.928 21.9404C171.252 22.4163 171.413 22.9184 171.413 23.4463H170.195C170.187 23.0344 170.087 22.6984 169.896 22.4385C169.704 22.1745 169.383 22.042 168.936 22.042C168.44 22.042 168.05 22.2463 167.766 22.6543C167.562 22.9463 167.433 23.5694 167.375 24.5234C167.412 24.4926 167.449 24.4611 167.489 24.4307C167.977 24.0587 168.591 23.8721 169.331 23.8721C170.135 23.8721 170.705 24.0803 171.041 24.4961C171.377 24.9081 171.545 25.5844 171.545 26.5244C171.545 27.4803 171.363 28.208 170.999 28.708C170.639 29.2079 169.906 29.4579 168.798 29.458C167.714 29.458 166.996 29.166 166.644 28.582C166.296 27.9981 166.121 27.0343 166.121 25.6904C166.121 24.0185 166.315 22.8561 166.703 22.2041C167.095 21.5521 167.84 21.2266 168.936 21.2266ZM255.94 21.2266C257.016 21.2266 257.728 21.5262 258.076 22.126C258.424 22.726 258.599 23.6822 258.599 24.9941C258.599 26.678 258.405 27.8442 258.017 28.4922C257.629 29.1362 256.896 29.458 255.82 29.458C254.769 29.458 254.087 29.2125 253.774 28.7207C253.462 28.2288 253.307 27.7304 253.307 27.2266H254.524C254.536 27.6463 254.636 27.9881 254.824 28.252C255.016 28.5119 255.348 28.6426 255.82 28.6426C256.3 28.6426 256.68 28.4521 256.96 28.0723C257.163 27.7964 257.292 27.158 257.348 26.1572C257.31 26.1891 257.272 26.2225 257.23 26.2539C256.743 26.6259 256.129 26.8125 255.389 26.8125C254.585 26.8125 254.015 26.5941 253.679 26.1582C253.343 25.7182 253.175 25.026 253.175 24.082C253.175 23.1461 253.355 22.4361 253.715 21.9521C254.079 21.4683 254.821 21.2266 255.94 21.2266ZM24.0107 28.5342H25.8477V29.3867H20.9453V28.5342H22.7988V22.2705L20.9033 22.7021V21.79L23.0029 21.2744H24.0107V28.5342ZM112.592 26.5723H113.642V27.376H112.592V29.3867H111.386V27.376H107.989V26.5664L110.791 21.2861H112.592V26.5723ZM200.045 22.1318C199.209 23.2318 198.589 24.3662 198.185 25.5342C197.781 26.7022 197.579 27.9867 197.579 29.3867H196.265C196.265 27.9788 196.473 26.6764 196.889 25.4805C197.309 24.2845 197.927 23.1744 198.743 22.1504L198.749 22.1318H194.765V21.2861H200.045V22.1318ZM52.9229 21.2266C53.9627 21.2266 54.6624 21.4244 55.0225 21.8203C55.3824 22.2162 55.5624 22.696 55.5625 23.2598C55.5625 23.9437 55.3628 24.524 54.9629 25C54.5629 25.472 54.0348 25.9338 53.3789 26.3857C52.6949 26.8297 52.2052 27.2225 51.9092 27.5625C51.6132 27.9025 51.4649 28.2262 51.4648 28.5342H55.5566V29.3857H50.1807V28.6543C50.1807 28.1343 50.3626 27.6361 50.7266 27.1602C51.0945 26.6802 51.6749 26.2044 52.4668 25.7324C53.1828 25.2844 53.6725 24.8879 53.9365 24.5439C54.2045 24.196 54.3388 23.7724 54.3389 23.2725C54.3389 22.8285 54.2167 22.5178 53.9727 22.3418C53.7327 22.166 53.3826 22.0781 52.9229 22.0781C52.427 22.0781 52.0472 22.2182 51.7832 22.498C51.5192 22.778 51.3867 23.3061 51.3867 24.082H50.1689C50.169 23.1942 50.3649 22.4962 50.7568 21.9883C51.1528 21.4803 51.8749 21.2266 52.9229 21.2266ZM168.924 24.6221C168.456 24.6221 168.079 24.7499 167.795 25.0059C167.529 25.2459 167.378 25.5341 167.341 25.8691C167.344 27.0428 167.47 27.7968 167.718 28.1318C167.974 28.4678 168.355 28.6357 168.863 28.6357C169.375 28.6357 169.744 28.494 169.968 28.21C170.196 27.9219 170.31 27.3815 170.31 26.5898C170.31 25.7663 170.196 25.2323 169.968 24.9883C169.744 24.7444 169.396 24.6221 168.924 24.6221ZM226.868 25.4385C226.352 25.4385 225.971 25.5505 225.723 25.7744C225.479 25.9984 225.357 26.396 225.356 26.9678C225.356 27.5557 225.484 27.9802 225.74 28.2402C225.996 28.5002 226.372 28.6298 226.868 28.6299C227.36 28.6299 227.732 28.5002 227.984 28.2402C228.24 27.9802 228.368 27.5558 228.368 26.9678C228.368 26.3963 228.247 25.9984 228.003 25.7744C227.763 25.5504 227.384 25.4385 226.868 25.4385ZM109.214 26.5723H111.386V22.2207L109.214 26.5723ZM255.881 22.0605C255.369 22.0605 254.992 22.2023 254.752 22.4863C254.512 22.7704 254.393 23.3043 254.393 24.0879C254.393 24.8996 254.508 25.4278 254.74 25.6719C254.976 25.9159 255.331 26.0381 255.803 26.0381C256.267 26.038 256.643 25.914 256.931 25.666C257.203 25.4349 257.351 25.1532 257.38 24.8213C257.377 23.6447 257.253 22.8923 257.009 22.5645C256.765 22.2286 256.389 22.0607 255.881 22.0605ZM226.868 22.042C226.392 22.042 226.035 22.1485 225.795 22.3604C225.559 22.5684 225.44 22.8865 225.44 23.3145C225.44 23.8223 225.552 24.1826 225.776 24.3945C226.004 24.6024 226.368 24.706 226.868 24.7061C227.364 24.7061 227.724 24.6023 227.948 24.3945C228.172 24.1826 228.284 23.8223 228.284 23.3145C228.284 22.8865 228.167 22.5684 227.931 22.3604C227.695 22.1484 227.34 22.042 226.868 22.042ZM23.8955 16.4775H22.8955V0H23.8955V16.4775ZM52.8955 16.4775H51.8955V0H52.8955V16.4775ZM81.8955 16.4775H80.8955V0H81.8955V16.4775ZM110.896 16.4775H109.896V0H110.896V16.4775ZM139.896 16.4775H138.896V0H139.896V16.4775ZM168.896 16.4775H167.896V0H168.896V16.4775ZM197.896 16.4775H196.896V0H197.896V16.4775ZM226.896 16.4775H225.896V0H226.896V16.4775ZM255.896 16.4775H254.896V0H255.896V16.4775Z" fill="#2F2F2F" fill-opacity="0.76"/></svg>`;

function renderCard(item) {
  let imgUrl = item._resolvedImg || (item.fileId ? STATE.imageMap[item.fileId] : null);
  // For GIFs: prefer original animated URL over static Telegram thumbnail
  if ((item.type === 'image' || item.type === 'gif') && item.content) {
    const ext = item.content.split('?')[0].split('#')[0].split('.').pop()?.toLowerCase();
    if (ext === 'gif') {
      imgUrl = item.content; // animated GIF URL takes priority
    } else if (!imgUrl && ['jpg', 'jpeg', 'png', 'webp', 'svg'].includes(ext)) {
      imgUrl = item.content; // fallback for other formats only if no TG image
    }
  }
  const aiType = item.ai_type; // article | video | product | xpost | null
  const aiTypeSec = item.ai_type_secondary; // secondary AI type for hybrid cards
  const aiData = item.ai_data || {};
  const rawDomain = getDomain(item.sourceUrl || item.url);
  const domain = (rawDomain === 'stash.mxml.sn') ? '' : rawDomain;
  const itemUrlAsLink = /^https?:\/\//i.test(item.url) ? item.url : '';
  const url = item.sourceUrl || itemUrlAsLink || '';
  const isInstagramReel = /instagram\.com\/(reels?|reel)\//i.test(url);
  // image/gif/tgpost/video_note/voice/audio from TG keeps its base type — AI type cannot override it
  const KEEP_BASE_TYPES = ['image', 'gif', 'tgpost', 'video_note', 'voice', 'audio'];
  // Video notes always render as standalone circles (no tgpost card wrapper)
  const isVideoNoteTgpost = item.type === 'tgpost' && aiData.mediaType === 'video_note';
  const effectiveType = isVideoNoteTgpost ? 'video_note'
    : (item.type === 'document') ? 'image'
    : KEEP_BASE_TYPES.includes(item.type) ? item.type
    : (isInstagramReel ? 'video' : (aiType || item.type));

  const NO_AI_TYPES = ['quote', 'video_note', 'voice', 'audio', 'document'];
  const pendingDot = (!item.ai_analyzed && !NO_AI_TYPES.includes(item.type) && !NO_AI_TYPES.includes(aiData.mediaType || '')) ? '<div class="badge-pending"></div>' : '';

  // ── Video card ──
  if (effectiveType === 'video') {
    const ytMatch = url.match(/(?:youtube\.com\/watch\?.*v=|youtu\.be\/|youtube\.com\/shorts\/)([a-zA-Z0-9_-]{11})/);
    const vimeoMatch = !ytMatch && url.match(/vimeo\.com\/(?:.*\/)?(\d+)/);

    // YouTube: hqdefault always exists; try maxresdefault and fall back
    const ytId = ytMatch ? ytMatch[1] : null;
    const ytSrc = ytId ? `https://img.youtube.com/vi/${ytId}/maxresdefault.jpg` : null;
    const ytFallback = ytId ? `https://img.youtube.com/vi/${ytId}/hqdefault.jpg` : null;
    const videoImgUrl = ytSrc || imgUrl;

    const faviconUrl = domain
      ? `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=64`
      : '';
    const shareIcon = `<svg viewBox="0 0 24 24" fill="white"><path d="M7 5.5C7 4.4 8.26 3.74 9.19 4.34l10.5 6.5a1.75 1.75 0 0 1 0 3.02l-10.5 6.5C8.26 20.96 7 20.3 7 19.2V5.5z" stroke="white" stroke-width="1.5" stroke-linejoin="round"/></svg>`;

    // For Vimeo: fetch thumbnail async and patch img src after render
    const vimeoId = vimeoMatch ? vimeoMatch[1] : null;
    const vimeoImgId = vimeoId ? `vimeo-thumb-${item.id}` : null;
    if (vimeoId) {
      fetch(`https://vimeo.com/api/v2/video/${vimeoId}.json`)
        .then(r => r.json())
        .then(data => {
          const src = data[0]?.thumbnail_large || data[0]?.thumbnail_medium || '';
          if (!src) return;
          const el = document.getElementById(vimeoImgId);
          const glowEl = document.getElementById(vimeoImgId + '-glow');
          if (el) el.src = src;
          if (glowEl) glowEl.src = src;
        }).catch(() => {});
    }

    const thumbSrc = vimeoId ? (imgUrl || '') : (videoImgUrl || '');
    const ytOnload = ytSrc ? `onload="if(this.naturalWidth<=120)this.src='${ytFallback}'" onerror="this.src='${ytFallback}'"` : '';
    const thumbGlowAttr = ytOnload;
    const thumbImgAttr = ytOnload;

    // Direct TG video (no YouTube/Vimeo) — play inline via lightbox
    const isTgDirectVideo = !ytMatch && !vimeoMatch && (item.fileId || item.videoFileId) && !/^https?:\/\//i.test(url);
    const isLargeFile = (aiData.fileSize || 0) > 20 * 1024 * 1024;
    const playbackFileId = item.videoFileId || item.fileId;
    const cardAction = isTgDirectVideo ? 'video-play' : 'open';
    const cardUrl = isTgDirectVideo ? '' : url;
    const domainLabel = isTgDirectVideo ? 'Telegram video' : domain;

    const hasStorageUrl = !!aiData.storageUrl;
    let videoBadge;
    if (isTgDirectVideo && isLargeFile) {
      const sizeMB = Math.round((aiData.fileSize || 0) / 1024 / 1024);
      videoBadge = hasStorageUrl
        ? `<div class="video-badge video-badge-large">${sizeMB} MB · open in TG</div>`
        : `<div class="video-badge video-badge-large">${sizeMB} MB</div>`;
    } else if (isTgDirectVideo) {
      videoBadge = '<div class="video-badge video-badge-inline">inline</div>';
    } else {
      videoBadge = '<div class="video-badge video-badge-external">external</div>';
    }
    const sourceUrlAttr = item.sourceUrl ? ` data-source-url="${escapeHtml(item.sourceUrl)}"` : '';
    return `<div class="card card-video" data-id="${item.id}" data-action="${cardAction}" data-url="${escapeHtml(cardUrl)}"${isTgDirectVideo ? ` data-file-id="${escapeHtml(playbackFileId)}"` : ''}${sourceUrlAttr}>
      ${pendingDot}
      ${videoBadge}
      <div class="video-header">
        ${faviconUrl && !isTgDirectVideo ? `<img class="video-favicon" src="${escapeHtml(faviconUrl)}" alt="" onerror="this.style.display='none'">` : ''}
        <span class="video-domain">${escapeHtml(domainLabel)}</span>
        <button class="video-share-btn" data-action="${cardAction}" data-url="${escapeHtml(cardUrl)}" title="${isTgDirectVideo ? 'Play' : 'Open'}">${shareIcon}</button>
      </div>
      ${(thumbSrc || vimeoId) ? `<div class="video-preview">
        <div class="video-glow-wrap">
          <img class="video-glow" ${vimeoImgId ? `id="${vimeoImgId}-glow"` : ''} src="${escapeHtml(thumbSrc)}" loading="lazy" alt="" aria-hidden="true" ${thumbGlowAttr}>
          <div class="screenshot-crop" style="border-radius:11px"><img class="video-screenshot" ${vimeoImgId ? `id="${vimeoImgId}"` : ''} src="${escapeHtml(thumbSrc)}" loading="lazy" alt="" ${thumbImgAttr}></div>
        </div>
      </div>` : ''}
    </div>`;
  }

  // ── Product with image ──
  if (effectiveType === 'product' && imgUrl) {
    const rawPrice = aiData.price || '';
    const CURRENCY_MAP = { 'USD':'$','EUR':'€','GBP':'£','JPY':'¥','RUB':'₽','CNY':'¥','KRW':'₩','INR':'₹','BRL':'R$','AUD':'A$','CAD':'C$' };
    let formattedPrice = rawPrice;
    if (rawPrice) {
      // Extract number and currency word/symbol
      const numMatch = rawPrice.match(/[\d\s.,]+/);
      const num = numMatch ? numMatch[0].trim() : rawPrice;
      let sym = '';
      for (const [word, s] of Object.entries(CURRENCY_MAP)) {
        if (rawPrice.toUpperCase().includes(word)) { sym = s; break; }
      }
      // If no word match, check if starts with known symbol
      if (!sym) { const m = rawPrice.match(/^([^\d\s]+)/); sym = m ? m[1] : '$'; }
      formattedPrice = sym + num;
    }
    const PRODUCT_PALETTE = {
      red:    { bg: '#3D1A1A', border: 'rgba(140,50,50,0.5)',   price: '#C97A7A' },
      violet: { bg: '#313367', border: 'rgba(69,57,131,0.5)',   price: '#9392CA' },
      pink:   { bg: '#3D1A2E', border: 'rgba(140,50,100,0.5)',  price: '#CA7AAF' },
      yellow: { bg: '#3A3210', border: 'rgba(140,125,30,0.5)',  price: '#C9B860' },
      green:  { bg: '#1A2E15', border: 'rgba(50,110,45,0.5)',   price: '#7ABF72' },
      blue:   { bg: '#13213D', border: 'rgba(45,85,160,0.5)',   price: '#7A9FCA' },
      brown:  { bg: '#2E1F10', border: 'rgba(110,72,30,0.5)',   price: '#C4986A' },
      white:  { bg: '#2A2A2A', border: 'rgba(120,120,120,0.5)', price: '#C0C0C0' },
      black:  { bg: '#111111', border: 'rgba(70,70,70,0.5)',    price: '#909090' },
      bw:     { bg: '#1A1A1A', border: 'rgba(90,90,90,0.5)',    price: '#ABABAB' },
      // Legacy aliases
      orange: { bg: '#3A2410', border: 'rgba(140,85,30,0.5)',   price: '#C99060' },
      purple: { bg: '#313367', border: 'rgba(69,57,131,0.5)',   price: '#9392CA' },
    };
    const colorKey = aiData.color_subject || aiData.color_top3?.[0] || aiData.color_palette || 'violet';
    const theme = PRODUCT_PALETTE[colorKey] || PRODUCT_PALETTE.purple;
    const notchSvg = `<svg viewBox="-3 -3 101.0078 43.6777" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M47.5039 0C55.1408 0 61.3925 5.93081 61.9063 13.4374C61.944 13.9883 62.3881 14.4375 62.9404 14.4375H83.3887C89.8059 14.4377 95.0078 19.6404 95.0078 26.0576C95.0078 32.4749 89.8059 37.6775 83.3887 37.6777H11.6201C5.20275 37.6777 2.11322e-05 32.475 0 26.0576C0 19.6402 5.20274 14.4375 11.6201 14.4375H32.0674C32.6197 14.4375 33.0638 13.9883 33.1015 13.4373C33.6153 5.93083 39.8671 4.64136e-05 47.5039 0Z" fill="#080808" stroke="${theme.border}" stroke-width="4"/>
    </svg>`;
    return `<div class="card card-product-new" data-id="${item.id}" data-action="open" data-url="${escapeHtml(url)}" style="background:${theme.bg};border-color:${theme.border}">
      ${pendingDot}
      <div class="product-new-notch">${notchSvg}</div>
      <div class="product-new-header">
        ${rawPrice ? `<div class="product-new-price" style="color:${theme.price}">${escapeHtml(formattedPrice)}</div>` : (domain ? `<div class="product-new-domain" style="color:${theme.price}">${escapeHtml(domain)}</div>` : '')}
      </div>
      <div class="product-new-preview">
        <div class="screenshot-crop"><img class="product-new-screenshot" src="${escapeHtml(imgUrl)}" loading="lazy" alt=""></div>
      </div>
    </div>`;
  }

  // ── X Post ──
  if (effectiveType === 'xpost') {
    const tweetTextRaw = aiData.tweet_text || item.content || item.ai_description || '';
    const tweetText = escapeHtml(tweetTextRaw);
    const author = escapeHtml(aiData.author || '');
    const xpostSourceUrl = item.sourceUrl || '';
    const faviconUrl = domain ? `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=64` : '';
    const isHybridTool = aiTypeSec === 'tool';
    const hybridClass = isHybridTool ? ' card-xpost-tool' : '';
    const isCollapsed = !!(aiData.xpost_collapsed);
    const collapsedClass = isCollapsed ? ' xpost-collapsed' : '';
    const toggleIcon = isCollapsed
      ? `<svg width="14" height="14" viewBox="0 0 14 14"><circle cx="7" cy="7" r="5" stroke="rgba(255,255,255,0.4)" stroke-width="1.5" fill="none"/></svg>`
      : `<svg width="14" height="14" viewBox="0 0 14 14"><line x1="2" y1="7" x2="12" y2="7" stroke="rgba(255,255,255,0.4)" stroke-width="1.5" stroke-linecap="round"/></svg>`;
    // Store data for fullscreen overlay via data attributes
    return `<div class="card card-xpost${hybridClass}${collapsedClass}" data-id="${item.id}" data-action="xpost" data-source-url="${escapeHtml(xpostSourceUrl)}" data-tweet-text="${escapeHtml(tweetTextRaw)}" data-author="${author}" data-img="${escapeHtml(imgUrl || '')}">
      ${pendingDot}
      ${imgUrl ? `<button class="xpost-toggle" data-action="toggle-xpost" title="${isCollapsed ? 'Show screenshot' : 'Hide screenshot'}">${toggleIcon}</button>` : ''}
      <div class="xpost-header">
        ${faviconUrl ? `<span class="xpost-avatar-wrap" data-action="open" data-url="${escapeHtml(xpostSourceUrl)}"><img class="xpost-avatar xpost-avatar-orig" src="${escapeHtml(faviconUrl)}" alt="" onerror="this.parentElement.style.display='none'"><img class="xpost-avatar xpost-avatar-x" src="x-logo.png" alt=""></span>` : ''}
        ${author ? `<div class="xpost-author">${author}</div>` : ''}
      </div>
      ${tweetText ? `<div class="xpost-body"><div class="xpost-text">${tweetText}</div></div>` : ''}
      ${!isCollapsed && imgUrl ? `<div class="xpost-preview"><div class="xpost-screenshot-wrap"><img class="xpost-screenshot" src="${escapeHtml(imgUrl)}" loading="lazy" alt=""></div></div>` : ''}
      ${!isCollapsed && isHybridTool ? `<div class="xpost-tool-ruler">${RULER_SVG}</div>` : ''}
    </div>`;
  }

  // ── Tool card ──
  if (effectiveType === 'tool') {
    const toolUrl = item.sourceUrl || item.url || '';
    return `<div class="card card-tool" data-id="${item.id}" data-action="open" data-url="${escapeHtml(toolUrl)}">
      ${pendingDot}
      <div class="tool-ruler">${RULER_SVG}</div>
      ${imgUrl ? `<div class="tool-screen">
        <img class="tool-screenshot" src="${escapeHtml(imgUrl)}" loading="lazy" alt="">
      </div>` : ''}
      <div class="tool-domain">${escapeHtml(domain)}</div>
    </div>`;
  }

  // ── Link (base type = link, and not article/product/xpost/tool) ──
  if (item.type === 'link' && !LINK_AI_OVERRIDES.has(aiType)) {
    const linkUrl = item.sourceUrl || item.url || '';
    const faviconUrl = domain ? `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=64` : '';
    const arrowIcon = `<svg viewBox="0 0 36.738 36.7375" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M16.9528 14.1284C18.5149 12.5663 21.047 12.5663 22.6091 14.1284C24.1712 15.6905 24.1712 18.2226 22.6091 19.7847L6.82782 35.5659C5.26573 37.128 2.73367 37.128 1.17157 35.5659C-0.390524 34.0038 -0.390524 31.4718 1.17157 29.9097L16.9528 14.1284Z" fill="white"/><path d="M28.738 29.9131V9C28.738 8.44788 28.29 8.00026 27.738 8H6.82489C4.61575 8 2.82489 6.20914 2.82489 4C2.82489 1.79086 4.61575 0 6.82489 0H27.738C32.7083 0.00026285 36.738 4.0296 36.738 9V29.9131C36.7377 32.1218 34.9467 33.9128 32.738 33.9131C30.529 33.9131 28.7382 32.122 28.738 29.9131Z" fill="white"/></svg>`;
    return `<div class="card card-link-new" data-id="${item.id}" data-action="open" data-url="${escapeHtml(linkUrl)}">
      ${pendingDot}
      <div class="link-header">
        ${faviconUrl ? `<img class="link-favicon" src="${escapeHtml(faviconUrl)}" alt="" onerror="this.style.display='none'">` : ''}
        <span class="link-domain">${escapeHtml(domain)}</span>
        <button class="link-arrow-btn" data-action="open" data-url="${escapeHtml(linkUrl)}" title="Open">${arrowIcon}</button>
      </div>
      ${imgUrl ? `<div class="link-preview"><div class="screenshot-crop"><img class="link-screenshot" src="${escapeHtml(imgUrl)}" loading="lazy" alt=""></div></div>` : ''}
    </div>`;
  }

  // ── Article (AI-typed link with screenshot) — open book design ──
  if (effectiveType === 'article' || aiType === 'article') {
    const articleUrl = item.sourceUrl || item.url || '';
    const faviconUrl = domain ? `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=64` : '';
    const bookPages = imgUrl ? `<div class="article-book">
        <div class="article-book-shadow article-book-shadow-1">
          <div class="article-page article-page-left"><img src="${escapeHtml(imgUrl)}" loading="lazy" alt=""></div>
          <div class="article-page article-page-right"><img src="${escapeHtml(imgUrl)}" loading="lazy" alt=""></div>
        </div>
        <div class="article-book-main">
          <div class="article-page article-page-left"><img src="${escapeHtml(imgUrl)}" loading="lazy" alt=""></div>
          <div class="article-page article-page-right"><img src="${escapeHtml(imgUrl)}" loading="lazy" alt=""></div>
        </div>
      </div>` : '';
    return `<div class="card card-article" data-id="${item.id}" data-action="open" data-url="${escapeHtml(articleUrl)}">
      <div class="article-bg"></div>
      ${pendingDot}
      <div class="article-header">
        ${faviconUrl ? `<img class="article-favicon" src="${escapeHtml(faviconUrl)}" alt="">` : ''}
        <span class="article-domain">${escapeHtml(domain)}</span>
      </div>
      ${bookPages}
    </div>`;
  }

  // ── Video Note card (круглое видео) ──
  if (effectiveType === 'video_note') {
    const vnFileId = item.videoFileId || item.audioFileId || item.fileId;
    const authorLabel = aiData.forwardFrom || aiData.channelTitle || '';
    const vnSourceUrl = item.sourceUrl || '';
    const authorHtml = authorLabel
      ? (vnSourceUrl
          ? `<a class="videonote-author" data-action="open" data-url="${escapeHtml(vnSourceUrl)}">${escapeHtml(authorLabel)}</a>`
          : `<div class="videonote-author">${escapeHtml(authorLabel)}</div>`)
      : '';
    const duration = aiData.audioDuration || 0;
    const thumbUrl = imgUrl || '';
    const vnTranscript = aiData.transcript || '';
    const vnTranscriptBtn = vnTranscript
      ? `<button class="transcript-btn" data-action="toggle-transcript">Aa</button>`
      : '';
    const vnTranscriptHtml = vnTranscript
      ? `<div class="transcript-text hidden">${escapeHtml(vnTranscript)}</div>`
      : '';
    return `<div class="card card-videonote" data-id="${item.id}">
      ${pendingDot}
      ${vnTranscriptBtn}
      <div class="videonote-circle" data-action="videonote-play" data-file-id="${escapeHtml(vnFileId)}">
        <video class="videonote-video" muted loop playsinline preload="none"></video>
        <div class="videonote-play-icon"><svg viewBox="0 0 24 24" fill="white"><path d="M7 5.5C7 4.4 8.26 3.74 9.19 4.34l10.5 6.5a1.75 1.75 0 0 1 0 3.02l-10.5 6.5C8.26 20.96 7 20.3 7 19.2V5.5z"/></svg></div>
      </div>
      ${authorHtml}
      ${vnTranscriptHtml}
    </div>`;
  }

  // ── Voice message card ──
  if (effectiveType === 'voice') {
    const voiceFileId = item.audioFileId || item.fileId;
    const authorLabel = aiData.forwardFrom || aiData.channelTitle || '';
    const voiceSourceUrl = item.sourceUrl || '';
    const duration = aiData.audioDuration || 0;
    const durationStr = duration > 0 ? `${Math.floor(duration / 60)}:${String(duration % 60).padStart(2, '0')}` : '';
    const authorHtml = authorLabel
      ? (voiceSourceUrl
          ? `<a class="voice-author" data-action="open" data-url="${escapeHtml(voiceSourceUrl)}">${escapeHtml(authorLabel)}</a>`
          : `<div class="voice-author">${escapeHtml(authorLabel)}</div>`)
      : '';
    const voiceTranscript = aiData.transcript || '';
    const voiceTranscriptBtn = voiceTranscript
      ? `<button class="transcript-btn" data-action="toggle-transcript">Aa</button>`
      : '';
    const voiceTranscriptHtml = voiceTranscript
      ? `<div class="transcript-text hidden">${escapeHtml(voiceTranscript)}</div>`
      : '';
    return `<div class="card card-voice" data-id="${item.id}">
      ${pendingDot}
      ${voiceTranscriptBtn}
      <div class="voice-player" data-action="voice-play" data-file-id="${escapeHtml(voiceFileId)}">
        <button class="voice-play-btn"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M7 5.5C7 4.4 8.26 3.74 9.19 4.34l10.5 6.5a1.75 1.75 0 0 1 0 3.02l-10.5 6.5C8.26 20.96 7 20.3 7 19.2V5.5z"/></svg></button>
        <div class="voice-waveform"><div class="voice-progress"></div></div>
        <span class="voice-duration">${durationStr}</span>
      </div>
      ${authorHtml}
      ${voiceTranscriptHtml}
    </div>`;
  }

  // ── Audio file card (mp3, wav) ──
  if (effectiveType === 'audio') {
    const audioFileId = item.audioFileId || item.fileId;
    const title = aiData.audioTitle || item.content || 'Audio';
    const performer = aiData.audioPerformer || '';
    const duration = aiData.audioDuration || 0;
    const durationStr = duration > 0 ? `${Math.floor(duration / 60)}:${String(duration % 60).padStart(2, '0')}` : '';
    const authorLabel = aiData.forwardFrom || aiData.channelTitle || '';
    const coverUrl = imgUrl || '';
    const audioSourceUrl = item.sourceUrl || '';
    const authorHtml = authorLabel
      ? (audioSourceUrl
          ? `<a class="audio-source" data-action="open" data-url="${escapeHtml(audioSourceUrl)}">${escapeHtml(authorLabel)}</a>`
          : `<div class="audio-source">${escapeHtml(authorLabel)}</div>`)
      : '';
    return `<div class="card card-audio" data-id="${item.id}">
      ${pendingDot}
      ${coverUrl ? `<div class="audio-cover"><img src="${escapeHtml(coverUrl)}" loading="lazy" alt="" onerror="this.parentElement.remove()"></div>` : ''}
      <div class="audio-info">
        <div class="audio-title">${escapeHtml(title)}</div>
        ${performer ? `<div class="audio-performer">${escapeHtml(performer)}</div>` : ''}
      </div>
      <div class="audio-player" data-action="audio-play" data-file-id="${escapeHtml(audioFileId)}">
        <button class="audio-play-btn"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M7 5.5C7 4.4 8.26 3.74 9.19 4.34l10.5 6.5a1.75 1.75 0 0 1 0 3.02l-10.5 6.5C8.26 20.96 7 20.3 7 19.2V5.5z"/></svg></button>
        <div class="audio-progress-wrap"><div class="audio-progress"></div></div>
        <span class="audio-time">${durationStr}</span>
      </div>
      ${authorHtml}
    </div>`;
  }

  // ── PDF card (base type OR AI-detected) ──
  if (item.type === 'pdf' || effectiveType === 'pdf') {
    const pdfUrl = item.sourceUrl || item.url || '';
    const pdfFid = item.pdfFileId || item.fileId;
    const hasTgFile = pdfFid && !/^https?:\/\//i.test(pdfUrl);
    const pdfTitle = toTitleCase(aiData.title || item.content || pdfUrl.split('?')[0].split('/').pop() || 'document.pdf');
    // Only use imgUrl as preview if it's from a thumbnail (not the raw PDF binary)
    const hasPdfThumb = item.fileId && item.pdfFileId && item.fileId !== item.pdfFileId;
    const previewHtml = (hasPdfThumb && imgUrl)
      ? `<div class="pdf-blur-wrap"><img class="pdf-blur-img" src="${escapeHtml(imgUrl)}" loading="lazy" alt=""><div class="pdf-badge"><span class="pdf-badge-text">pdf</span></div></div>`
      : `<div style="padding:16px 16px 0"><div class="pdf-badge" style="position:relative;top:auto;left:auto;display:inline-block"><span class="pdf-badge-text">pdf</span></div></div>`;
    const cardAction = hasTgFile ? 'open-file' : 'open';
    const cardDataUrl = hasTgFile ? '' : pdfUrl;
    const pdfSourceAttr = item.sourceUrl ? ` data-source-url="${escapeHtml(item.sourceUrl)}"` : '';
    return `<div class="card card-pdf" data-id="${item.id}" data-action="${cardAction}" data-url="${escapeHtml(cardDataUrl)}"${hasTgFile ? ` data-file-id="${escapeHtml(pdfFid)}"` : ''}${pdfSourceAttr}>
      ${pendingDot}
      ${previewHtml}
      <div class="pdf-title">${escapeHtml(pdfTitle)}</div>
    </div>`;
  }

  // ── Telegram Post card (media + text) ──
  if (item.type === 'tgpost') {
    const sourceUrl = item.sourceUrl || itemUrlAsLink || '';
    const tgLabel = aiData.channelTitle || aiData.forwardFrom || domain;
    const textContent = item.content || item.ai_description || '';
    // Detect HTML content: explicit flag OR auto-detect <a href=, <b>, <i> tags in content
    const isHtml = aiData.htmlContent || /<(?:a\s+href=|b>|i>|u>|s>|code>)/.test(textContent);
    const isTruncated = textContent.length > 300;
    const displayText = isTruncated ? textContent.slice(0, 300) : textContent;
    const truncatedClass = isTruncated ? ' truncated' : '';
    const displayHtml = isHtml ? sanitizeHtml(displayText) : escapeHtml(displayText);
    const domainHtml = tgLabel
      ? (sourceUrl
        ? `<a class="quote-source-link" data-action="open" data-url="${escapeHtml(sourceUrl)}">${escapeHtml(tgLabel)}</a>`
        : `<span class="quote-source">${escapeHtml(tgLabel)}</span>`)
      : '';

    // Detect YouTube/Vimeo links in sourceUrl or text content for video preview
    const allText = sourceUrl + ' ' + textContent;
    const tgYtMatch = allText.match(/(?:youtube\.com\/watch\?.*v=|youtu\.be\/|youtube\.com\/shorts\/)([a-zA-Z0-9_-]{11})/);
    const tgVimeoMatch = !tgYtMatch && allText.match(/vimeo\.com\/(?:.*\/)?(\d+)/);

    // Album (multiple media)
    const albumMedia = item.albumMedia || [];
    const isAlbum = albumMedia.length > 1;
    let mediaHtml = '';
    if (isAlbum) {
      const albumItems = albumMedia.map(m => {
        const resolvedUrl = STATE.imageMap[m.fileId] || '';
        if (m.mediaType === 'pdf') {
          const pdfFid = m.pdfFileId || m.fileId;
          // Only use resolvedUrl as preview if it's from a thumbnail (not the raw PDF binary)
          const hasThumbnail = m.fileId && m.pdfFileId && m.fileId !== m.pdfFileId;
          const previewUrl = hasThumbnail ? resolvedUrl : '';
          return previewUrl
            ? `<div class="tgpost-album-item is-pdf" data-action="open-file" data-file-id="${escapeHtml(pdfFid)}"><img class="tgpost-album-img blur-preview" src="${escapeHtml(previewUrl)}" loading="lazy" alt=""><div class="pdf-badge"><span class="pdf-badge-text">pdf</span></div></div>`
            : `<div class="tgpost-album-item is-pdf" data-action="open-file" data-file-id="${escapeHtml(pdfFid)}"><div class="tgpost-album-img" style="background:#1a1a1a;display:flex;align-items:center;justify-content:center"><div class="pdf-badge" style="position:relative;top:auto;left:auto;transform:none"><span class="pdf-badge-text">pdf</span></div></div></div>`;
        }
        if (m.mediaType === 'video') {
          const playFileId = m.videoFileId || m.fileId;
          return resolvedUrl
            ? `<div class="tgpost-album-item is-video" data-action="video-play" data-file-id="${escapeHtml(playFileId)}"><img class="tgpost-album-img" src="${escapeHtml(resolvedUrl)}" loading="lazy" alt=""><div class="tgpost-play-icon"><svg viewBox="0 0 24 24" fill="white"><path d="M7 5.5C7 4.4 8.26 3.74 9.19 4.34l10.5 6.5a1.75 1.75 0 0 1 0 3.02l-10.5 6.5C8.26 20.96 7 20.3 7 19.2V5.5z"/></svg></div></div>`
            : `<div class="tgpost-album-item is-video" data-action="video-play" data-file-id="${escapeHtml(playFileId)}"><div class="tgpost-album-img" style="background:#1a1a1a;display:flex;align-items:center;justify-content:center"><div class="tgpost-play-icon" style="position:relative;top:auto;left:auto;transform:none"><svg viewBox="0 0 24 24" fill="white"><path d="M7 5.5C7 4.4 8.26 3.74 9.19 4.34l10.5 6.5a1.75 1.75 0 0 1 0 3.02l-10.5 6.5C8.26 20.96 7 20.3 7 19.2V5.5z"/></svg></div></div></div>`;
        }
        return resolvedUrl
          ? `<div class="tgpost-album-item" data-action="lightbox" data-img="${escapeHtml(resolvedUrl)}"><img class="tgpost-album-img" src="${escapeHtml(resolvedUrl)}" loading="lazy" alt=""></div>`
          : `<div class="tgpost-album-item"><div class="tgpost-album-img" style="background:#1a1a1a"></div></div>`;
      }).filter(Boolean);
      if (albumItems.length > 0) {
        // Calculate if last item needs to span remaining columns
        const cols = albumItems.length > 4 ? 3 : 2;
        const remainder = albumItems.length % cols;
        if (remainder !== 0) {
          const spanCols = cols - remainder + 1;
          // Replace last item's opening div to add grid-column span
          const lastIdx = albumItems.length - 1;
          albumItems[lastIdx] = albumItems[lastIdx].replace(
            /^<div class="tgpost-album-item/,
            `<div style="grid-column:span ${spanCols}" class="tgpost-album-item album-span-${spanCols}`
          );
        }
        const colClass = albumItems.length > 4 ? ' album-3col' : '';
        mediaHtml = `<div class="tgpost-album${colClass}">${albumItems.join('')}</div>`;
      }
    } else if (aiData.mediaType === 'pdf' && (item.pdfFileId || item.fileId)) {
      // PDF preview — must come before generic imgUrl check
      const pdfFid = item.pdfFileId || item.fileId;
      // Only use imgUrl as preview if it's from a thumbnail (not the raw PDF binary)
      const hasPdfThumb = item.fileId && item.pdfFileId && item.fileId !== item.pdfFileId;
      const pdfThumbUrl = hasPdfThumb ? (imgUrl || '') : '';
      mediaHtml = pdfThumbUrl
        ? `<div class="tgpost-pdf-preview" data-action="open-file" data-file-id="${escapeHtml(pdfFid)}"><div class="pdf-blur-wrap"><img class="pdf-blur-img" src="${escapeHtml(pdfThumbUrl)}" loading="lazy" alt=""><div class="pdf-badge"><span class="pdf-badge-text">pdf</span></div></div></div>`
        : `<div class="tgpost-pdf-badge" data-action="open-file" data-file-id="${escapeHtml(pdfFid)}"><div class="pdf-badge"><span class="pdf-badge-text">pdf</span></div></div>`;
    } else if (aiData.mediaType === 'video_note' && (item.videoFileId || item.fileId)) {
      // Video note (circle) embedded in tgpost
      const vnFid = item.videoFileId || item.fileId;
      const thumbUrl = imgUrl || '';
      mediaHtml = `<div class="tgpost-videonote">
        <div class="videonote-circle" data-action="videonote-play" data-file-id="${escapeHtml(vnFid)}">
          <video class="videonote-video" muted loop playsinline preload="none"></video>
          <div class="videonote-play-icon"><svg viewBox="0 0 24 24" fill="white"><path d="M7 5.5C7 4.4 8.26 3.74 9.19 4.34l10.5 6.5a1.75 1.75 0 0 1 0 3.02l-10.5 6.5C8.26 20.96 7 20.3 7 19.2V5.5z"/></svg></div>
        </div>
      </div>`;
    } else if (aiData.mediaType === 'voice' && (item.audioFileId || item.fileId)) {
      // Voice message embedded in tgpost
      const vFid = item.audioFileId || item.fileId;
      const duration = aiData.audioDuration || 0;
      const durationStr = duration > 0 ? `${Math.floor(duration / 60)}:${String(duration % 60).padStart(2, '0')}` : '';
      mediaHtml = `<div class="voice-player" data-action="voice-play" data-file-id="${escapeHtml(vFid)}" style="margin:12px 14px 0">
        <button class="voice-play-btn"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M7 5.5C7 4.4 8.26 3.74 9.19 4.34l10.5 6.5a1.75 1.75 0 0 1 0 3.02l-10.5 6.5C8.26 20.96 7 20.3 7 19.2V5.5z"/></svg></button>
        <div class="voice-waveform"><div class="voice-progress"></div></div>
        <span class="voice-duration">${durationStr}</span>
      </div>`;
    } else if (aiData.mediaType === 'audio' && (item.audioFileId || item.fileId)) {
      // Audio file embedded in tgpost
      const aFid = item.audioFileId || item.fileId;
      const title = aiData.audioTitle || '';
      const performer = aiData.audioPerformer || '';
      const duration = aiData.audioDuration || 0;
      const durationStr = duration > 0 ? `${Math.floor(duration / 60)}:${String(duration % 60).padStart(2, '0')}` : '';
      const coverUrl = imgUrl || '';
      mediaHtml = `<div style="padding:12px 14px 0">
        ${coverUrl ? `<div class="audio-cover" style="margin-bottom:8px"><img src="${escapeHtml(coverUrl)}" loading="lazy" alt="" onerror="this.parentElement.remove()"></div>` : ''}
        ${title ? `<div class="audio-title">${escapeHtml(title)}</div>` : ''}
        ${performer ? `<div class="audio-performer">${escapeHtml(performer)}</div>` : ''}
        <div class="audio-player" data-action="audio-play" data-file-id="${escapeHtml(aFid)}">
          <button class="audio-play-btn"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M7 5.5C7 4.4 8.26 3.74 9.19 4.34l10.5 6.5a1.75 1.75 0 0 1 0 3.02l-10.5 6.5C8.26 20.96 7 20.3 7 19.2V5.5z"/></svg></button>
          <div class="audio-progress-wrap"><div class="audio-progress"></div></div>
          <span class="audio-time">${durationStr}</span>
        </div>
      </div>`;
    } else if (imgUrl) {
      const tgImgLarge = (aiData.fileSize || 0) > 20 * 1024 * 1024;
      const tgImgStorage = aiData.storageUrl || '';
      if (tgImgLarge && tgImgStorage) {
        const sizeMB = Math.round((aiData.fileSize || 0) / 1024 / 1024);
        const arrowSvg = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M7 17L17 7"/><path d="M7 7h10v10"/></svg>`;
        mediaHtml = `<div class="largefile-inline" data-action="open" data-url="${escapeHtml(tgImgStorage)}">
          <div class="largefile-preview"><img class="largefile-thumb" src="${escapeHtml(imgUrl)}" loading="lazy" alt=""></div>
          <div class="largefile-footer"><span class="largefile-size">${sizeMB} MB</span><span class="largefile-arrow">${arrowSvg}</span></div>
        </div>`;
      } else {
        mediaHtml = `<img class="card-img" src="${escapeHtml(imgUrl)}" loading="lazy" alt="" data-action="lightbox" data-img="${escapeHtml(imgUrl)}">`;
      }
    } else if (tgYtMatch) {
      const ytId = tgYtMatch[1];
      const ytThumb = `https://img.youtube.com/vi/${ytId}/maxresdefault.jpg`;
      const ytFallback = `https://img.youtube.com/vi/${ytId}/hqdefault.jpg`;
      const ytUrl = `https://www.youtube.com/watch?v=${ytId}`;
      mediaHtml = `<div class="tgpost-video-preview" data-action="open" data-url="${escapeHtml(ytUrl)}">
        <img class="card-img" src="${escapeHtml(ytThumb)}" loading="lazy" alt="" onload="if(this.naturalWidth<=120)this.src='${ytFallback}'" onerror="this.src='${ytFallback}'">
        <div class="tgpost-play-icon"><svg viewBox="0 0 24 24" fill="white"><path d="M7 5.5C7 4.4 8.26 3.74 9.19 4.34l10.5 6.5a1.75 1.75 0 0 1 0 3.02l-10.5 6.5C8.26 20.96 7 20.3 7 19.2V5.5z"/></svg></div>
      </div>`;
    } else if (tgVimeoMatch) {
      const vimeoId = tgVimeoMatch[1];
      const vimeoImgId = `tgpost-vimeo-${item.id}`;
      const vimeoUrl = `https://vimeo.com/${vimeoId}`;
      fetch(`https://vimeo.com/api/v2/video/${vimeoId}.json`)
        .then(r => r.json())
        .then(data => {
          const src = data[0]?.thumbnail_large || data[0]?.thumbnail_medium || '';
          const el = document.getElementById(vimeoImgId);
          if (el && src) el.src = src;
        }).catch(() => {});
      mediaHtml = `<div class="tgpost-video-preview" data-action="open" data-url="${escapeHtml(vimeoUrl)}">
        <img class="card-img" id="${vimeoImgId}" src="" loading="lazy" alt="">
        <div class="tgpost-play-icon"><svg viewBox="0 0 24 24" fill="white"><path d="M7 5.5C7 4.4 8.26 3.74 9.19 4.34l10.5 6.5a1.75 1.75 0 0 1 0 3.02l-10.5 6.5C8.26 20.96 7 20.3 7 19.2V5.5z"/></svg></div>
      </div>`;
    } else if (aiData.mediaType === 'video' && item.fileId) {
      // Direct TG video in tgpost — show thumbnail or play icon
      const thumbUrl = imgUrl || '';
      mediaHtml = thumbUrl
        ? `<div class="tgpost-video-preview" data-action="video-play" data-file-id="${escapeHtml(item.videoFileId || item.fileId)}">
            <img class="card-img" src="${escapeHtml(thumbUrl)}" loading="lazy" alt="">
            <div class="tgpost-play-icon"><svg viewBox="0 0 24 24" fill="white"><path d="M7 5.5C7 4.4 8.26 3.74 9.19 4.34l10.5 6.5a1.75 1.75 0 0 1 0 3.02l-10.5 6.5C8.26 20.96 7 20.3 7 19.2V5.5z"/></svg></div>
          </div>`
        : `<div class="tgpost-video-preview" data-action="video-play" data-file-id="${escapeHtml(item.videoFileId || item.fileId)}">
            <div class="tgpost-play-icon" style="position:relative;top:auto;left:auto;transform:none;margin:16px auto"><svg viewBox="0 0 24 24" fill="white"><path d="M7 5.5C7 4.4 8.26 3.74 9.19 4.34l10.5 6.5a1.75 1.75 0 0 1 0 3.02l-10.5 6.5C8.26 20.96 7 20.3 7 19.2V5.5z"/></svg></div>
          </div>`;
    }

    const tgTranscript = aiData.transcript || '';
    const tgTranscriptBtn = (tgTranscript && ['voice', 'video_note'].includes(aiData.mediaType))
      ? `<button class="transcript-btn" data-action="toggle-transcript">Aa</button>`
      : '';
    const tgTranscriptHtml = (tgTranscript && ['voice', 'video_note'].includes(aiData.mediaType))
      ? `<div class="transcript-text hidden" style="padding:0 16px 8px">${escapeHtml(tgTranscript)}</div>`
      : '';
    return `<div class="card card-tgpost" data-id="${item.id}" data-action="quote" data-quote-text="${escapeHtml(textContent)}" data-source-url="${escapeHtml(sourceUrl)}" data-domain="${escapeHtml(tgLabel || 'telegram')}">
      ${pendingDot}
      ${tgTranscriptBtn}
      ${mediaHtml}
      <div class="tgpost-body">
        <div class="quote-text${truncatedClass}">${displayHtml}</div>
      </div>
      ${tgTranscriptHtml}
      <div class="quote-footer">
        ${domainHtml}
      </div>
    </div>`;
  }

  // ── GIF card ──
  if (item.type === 'gif' && imgUrl) {
    const sourceUrl = item.sourceUrl || itemUrlAsLink || '';
    const gifDomain = getDomain(sourceUrl);
    const downloadSvg = `<svg viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.75)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>`;
    const domainBtn = (sourceUrl && gifDomain)
      ? `<button class="img-domain-btn" data-action="open" data-url="${escapeHtml(sourceUrl)}">${escapeHtml(gifDomain)}</button>`
      : '';
    const downloadBtn = `<button class="img-download-btn" data-action="download" data-url="${escapeHtml(imgUrl)}">${downloadSvg}</button>`;
    return `<div class="card card-image card-gif" data-id="${item.id}" data-action="lightbox" data-img="${escapeHtml(imgUrl)}" data-url="${escapeHtml(sourceUrl)}">
      ${pendingDot}
      <img class="card-img" src="${escapeHtml(imgUrl)}" loading="lazy" alt="">
      <div class="img-hover-bar">${domainBtn}${downloadBtn}</div>
    </div>`;
  }

  // ── Has image (pure image — no AI type override) ──
  if (imgUrl) {
    const sourceUrl = item.sourceUrl || itemUrlAsLink || '';
    const imgDomain = getDomain(sourceUrl);
    const downloadSvg = `<svg viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.75)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>`;
    // Large images (>20MB): show thumbnail in smaller gray container, click opens TG
    const imgIsLarge = (aiData.fileSize || 0) > 20 * 1024 * 1024;
    const imgStorageUrl = aiData.storageUrl || '';
    if (imgIsLarge && imgStorageUrl) {
      const sizeMB = Math.round((aiData.fileSize || 0) / 1024 / 1024);
      const arrowSvg = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M7 17L17 7"/><path d="M7 7h10v10"/></svg>`;
      return `<div class="card card-largefile" data-id="${item.id}" data-action="open" data-url="${escapeHtml(imgStorageUrl)}">
        ${pendingDot}
        <div class="largefile-preview">
          <img class="largefile-thumb" src="${escapeHtml(imgUrl)}" loading="lazy" alt="">
        </div>
        <div class="largefile-footer">
          <span class="largefile-size">${sizeMB} MB</span>
          <span class="largefile-arrow">${arrowSvg}</span>
        </div>
      </div>`;
    }
    const domainBtn = (sourceUrl && imgDomain)
      ? `<button class="img-domain-btn" data-action="open" data-url="${escapeHtml(sourceUrl)}">${escapeHtml(imgDomain)}</button>`
      : '';
    const downloadBtn = `<button class="img-download-btn" data-action="download" data-url="${escapeHtml(imgUrl)}">${downloadSvg}</button>`;
    return `<div class="card card-image" data-id="${item.id}" data-action="lightbox" data-img="${escapeHtml(imgUrl)}" data-url="${escapeHtml(sourceUrl)}">
      ${pendingDot}
      <img class="card-img" src="${escapeHtml(imgUrl)}" loading="lazy" alt="">
      <div class="img-hover-bar">${domainBtn}${downloadBtn}</div>
    </div>`;
  }

  // ── Text / Quote ──
  const quoteTextRaw = item.content || item.ai_description || '';
  const isTruncated = quoteTextRaw.length > 460;
  const quoteTextDisplay = isTruncated ? quoteTextRaw.slice(0, 460) : quoteTextRaw;
  const quoteText = escapeHtml(quoteTextDisplay);
  const truncatedClass = isTruncated ? ' truncated' : '';
  const quoteSourceUrl = item.sourceUrl || itemUrlAsLink || '';
  const quoteDomain = (domain && domain !== 'telegram') ? domain : '';
  const quoteDomainHtml = quoteDomain
    ? (quoteSourceUrl
        ? `<a class="quote-source-link" data-action="open" data-url="${escapeHtml(quoteSourceUrl)}">${escapeHtml(quoteDomain)}</a>`
        : `<span class="quote-source">${escapeHtml(quoteDomain)}</span>`)
    : '<span></span>';
  return `<div class="card card-quote-new" data-id="${item.id}" data-action="quote" data-quote-text="${escapeHtml(quoteTextRaw)}" data-source-url="${escapeHtml(quoteSourceUrl)}" data-domain="${escapeHtml(quoteDomain)}">
    ${pendingDot}
    <div class="quote-body">
      <div class="quote-text${truncatedClass}">${quoteText}</div>
    </div>
    <div class="quote-footer">
      ${quoteDomainHtml}
    </div>
  </div>`;
}

function getColumnCount() {
  if (STATE.layout === '3col') return 3;
  if (STATE.layout === '4col') return 4;
  // adaptive — match CSS media queries
  const w = window.innerWidth;
  if (w <= 480) return 1;
  if (w <= 750) return 2;
  if (w <= 1100) return 3;
  if (w <= 1400) return 4;
  return 5;
}

function renderAll(items) {
  const masonry = document.getElementById('masonry');
  const empty = document.getElementById('empty-state');
  if (!masonry) return;
  if (!items.length) {
    masonry.innerHTML = '';
    empty.classList.remove('hidden');
    return;
  }
  empty.classList.add('hidden');
  const cards = items.map(renderCard);

  if (STATE.align === 'masonry') {
    // Build explicit column divs — distribute cards round-robin
    // so row reading order (left-to-right, top-to-bottom) is chronological.
    // Items come newest-first from Notion, so visual order:
    //   row 0 (top): items 0,1,2,3  (newest)
    //   row 1:       items 4,5,6,7
    //   ...
    //   last row (bottom): oldest items
    // Round-robin: item i goes to column (i % cols)
    const cols = getColumnCount();
    const columns = Array.from({ length: cols }, () => []);
    for (let i = 0; i < cards.length; i++) {
      columns[i % cols].push(cards[i]);
    }
    masonry.innerHTML = columns.map(col =>
      `<div class="masonry-col">${col.join('')}</div>`
    ).join('');
  } else {
    // Center mode — flat cards directly in masonry container
    masonry.innerHTML = cards.join('');
  }
  applyGridMode();

  // Mark truncated xpost cards for zoom-in cursor + collapsed fade
  masonry.querySelectorAll('.card-xpost').forEach(card => {
    const textEl = card.querySelector('.xpost-text');
    if (textEl && textEl.scrollHeight > textEl.clientHeight + 2) {
      card.classList.add('xpost-truncated');
      if (card.classList.contains('xpost-collapsed')) {
        textEl.classList.add('truncated-collapsed');
      }
    }
  });

  // Auto-load and play video notes (muted loop)
  masonry.querySelectorAll('.videonote-circle').forEach(async (circle) => {
    const fileId = circle.dataset.fileId;
    const video = circle.querySelector('.videonote-video');
    const playIcon = circle.querySelector('.videonote-play-icon');
    if (!fileId || !video || !STATE.botToken) return;
    const videoUrl = await resolveFileId(STATE.botToken, fileId);
    if (videoUrl) {
      video.src = videoUrl;
      video.muted = true;
      video.play().then(() => {
        if (playIcon) playIcon.style.display = 'none';
      }).catch(() => {});
    }
  });
}

// ─── Notion mutation helpers ──────────────────────────────────────────────────
async function deleteItem(pageId) {
  try {
    const res = await bgFetch(`https://api.notion.com/v1/pages/${pageId}`, {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${STATE.notionToken}`,
        'Notion-Version': NOTION_VERSION,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ archived: true })
    });
    if (!res.ok) { console.error('[Viewer] Delete failed:', res.status); return; }
  } catch (e) { console.error('[Viewer] Delete error:', e); return; }
  STATE.items = STATE.items.filter(item => item.id !== pageId);
  applyFilters();
}

async function changeItemType(pageId, newAiType, newSecondary) {
  const item = STATE.items.find(i => i.id === pageId);
  if (!item) return;

  const properties = { 'ai_analyzed': { checkbox: true } };

  if (newAiType !== null) {
    if (newAiType === 'link' || newAiType === '') {
      properties['ai_type'] = { select: null };
      item.ai_type = null;
    } else {
      properties['ai_type'] = { select: { name: newAiType } };
      item.ai_type = newAiType;
    }
    item.ai_analyzed = true;
  }

  if (newSecondary !== null) {
    if (newSecondary === '') {
      properties['ai_type_secondary'] = { select: null };
      item.ai_type_secondary = null;
    } else {
      properties['ai_type_secondary'] = { select: { name: newSecondary } };
      item.ai_type_secondary = newSecondary;
    }
  }

  try {
    const res = await bgFetch(`https://api.notion.com/v1/pages/${pageId}`, {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${STATE.notionToken}`,
        'Notion-Version': NOTION_VERSION,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ properties })
    });
    if (!res.ok) { console.error('[Viewer] Type change failed:', res.status); return; }
  } catch (e) { console.error('[Viewer] Type change error:', e); return; }

  const cardEl = document.querySelector(`.card[data-id="${pageId}"]`);
  if (cardEl) cardEl.outerHTML = renderCard(item);
}

async function toggleXpostCollapse(pageId) {
  const item = STATE.items.find(i => i.id === pageId);
  if (!item) return;

  const newCollapsed = !item.ai_data.xpost_collapsed;
  item.ai_data.xpost_collapsed = newCollapsed;

  // Optimistic re-render
  const cardEl = document.querySelector(`.card[data-id="${pageId}"]`);
  if (cardEl) {
    cardEl.outerHTML = renderCard(item);
    // Re-check truncation on the new card element
    const newCard = document.querySelector(`.card[data-id="${pageId}"]`);
    if (newCard) {
      const textEl = newCard.querySelector('.xpost-text');
      if (textEl && textEl.scrollHeight > textEl.clientHeight + 2) {
        newCard.classList.add('xpost-truncated');
        if (newCard.classList.contains('xpost-collapsed')) textEl.classList.add('truncated-collapsed');
      }
    }
  }

  // Persist to Notion
  const aiDataStr = JSON.stringify(item.ai_data);
  try {
    await bgFetch(`https://api.notion.com/v1/pages/${pageId}`, {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${STATE.notionToken}`,
        'Notion-Version': NOTION_VERSION,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        properties: {
          'ai_data': { rich_text: [{ text: { content: aiDataStr.slice(0, 2000) } }] }
        }
      })
    });
  } catch (e) {
    console.error('[Viewer] Toggle collapse error:', e);
    item.ai_data.xpost_collapsed = !newCollapsed;
    const revertCard = document.querySelector(`.card[data-id="${pageId}"]`);
    if (revertCard) {
      revertCard.outerHTML = renderCard(item);
      const rc = document.querySelector(`.card[data-id="${pageId}"]`);
      if (rc) {
        const t = rc.querySelector('.xpost-text');
        if (t && t.scrollHeight > t.clientHeight + 2) {
          rc.classList.add('xpost-truncated');
          if (rc.classList.contains('xpost-collapsed')) t.classList.add('truncated-collapsed');
        }
      }
    }
  }
}

// ─── Download helper ─────────────────────────────────────────────────────────
function downloadImage(url) {
  const ext = (url.match(/\.(jpe?g|png|gif|webp|svg)/i) || [])[1] || 'jpg';
  const name = 'image_' + Date.now() + '.' + ext;
  fetch(url)
    .then(r => r.blob())
    .then(blob => {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = name;
      a.click();
      URL.revokeObjectURL(a.href);
    })
    .catch(() => window.open(url, '_blank'));
}

// ─── Lightbox ─────────────────────────────────────────────────────────────────
function openLightbox(imgUrl, sourceUrl, opts) {
  const lb = document.getElementById('lightbox');
  const img = document.getElementById('lightbox-img');
  const video = document.getElementById('lightbox-video');
  const link = document.getElementById('lightbox-link');
  const dlBtn = document.getElementById('lightbox-download');

  const isVideo = opts && opts.video;
  img.classList.toggle('hidden', isVideo);
  video.classList.toggle('hidden', !isVideo);

  if (isVideo) {
    video.src = imgUrl;
    video.play().catch(() => {});
    img.src = '';
  } else {
    img.src = imgUrl;
    video.pause();
    video.src = '';
  }

  dlBtn.onclick = (e) => { e.stopPropagation(); downloadImage(imgUrl); };
  if (sourceUrl && /^https?:\/\//i.test(sourceUrl)) {
    link.href = sourceUrl;
    link.textContent = getDomain(sourceUrl);
    link.classList.remove('hidden');
  } else {
    link.classList.add('hidden');
  }
  lb.classList.remove('hidden');
}

function closeLightbox() {
  const lb = document.getElementById('lightbox');
  const video = document.getElementById('lightbox-video');
  lb.classList.add('hidden');
  document.getElementById('lightbox-img').src = '';
  video.pause();
  video.src = '';
}

// ─── Content overlay (shared) ────────────────────────────────────────────────
function openContentOverlay(innerHtml, opts) {
  const overlay = document.getElementById('content-overlay');
  const content = document.getElementById('overlay-content');
  content.innerHTML = innerHtml;
  overlay.classList.toggle('align-top', !!(opts && opts.alignTop));
  overlay.classList.remove('hidden');
  overlay.scrollTop = 0;
}

function closeContentOverlay() {
  const overlay = document.getElementById('content-overlay');
  overlay.classList.add('hidden');
  document.getElementById('overlay-content').innerHTML = '';
}

// ─── Event delegation (MV3 CSP forbids inline onclick) ───────────────────────
document.addEventListener('DOMContentLoaded', () => {
  // ── Masonry grid: single delegated click handler for all cards ──
  const masonry = document.getElementById('masonry');
  masonry.addEventListener('click', async e => {
    // Find the closest element with a data-action attribute
    const actionEl = e.target.closest('[data-action]');
    if (!actionEl) return;

    const action = actionEl.dataset.action;
    const url = actionEl.dataset.url || '';

    // "open" — direct navigation (links, videos, products, articles, domain btns, avatars)
    if (action === 'open' && url) {
      e.stopPropagation();
      window.open(url, '_blank');
      return;
    }

    // "download" — download image
    if (action === 'download' && url) {
      e.stopPropagation();
      downloadImage(url);
      return;
    }

    // "lightbox" — open image lightbox
    if (action === 'lightbox') {
      const imgSrc = actionEl.dataset.img || '';
      if (imgSrc) openLightbox(imgSrc, url);
      return;
    }

    // "open-file" — resolve TG file_id and open PDF in browser viewer
    if (action === 'open-file') {
      e.stopPropagation();
      const fileId = actionEl.dataset.fileId || actionEl.closest('[data-file-id]')?.dataset.fileId;
      if (fileId && STATE.botToken) {
        try {
          // Resolve file_id to get the file path
          const getFileRes = await fetch(`https://api.telegram.org/bot${STATE.botToken}/getFile?file_id=${fileId}`);
          const getFileData = await getFileRes.json();
          if (!getFileData.ok) throw new Error('getFile failed');
          const filePath = getFileData.result.file_path;

          // Fetch binary via CORS proxy with forced PDF Content-Type
          const proxyUrl = 'https://stash-cors-proxy.mxmlsn-co.workers.dev';
          const res = await fetch(proxyUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              service: 'telegram',
              token: STATE.botToken,
              path: `/file/${filePath}`,
              method: 'GET',
              binary: true,
              contentType: 'application/pdf'
            })
          });
          const buf = await res.arrayBuffer();
          const pdfBlob = new Blob([buf], { type: 'application/pdf' });
          window.open(URL.createObjectURL(pdfBlob), '_blank');
        } catch (err) {
          // Fallback: resolve and open directly (will likely download)
          const fileUrl = await resolveFileId(STATE.botToken, fileId);
          if (fileUrl) {
            window.open(fileUrl, '_blank');
          } else {
            // File too large for Bot API (>20MB) — try storageUrl or sourceUrl
            const card = actionEl.closest('.card[data-id]');
            const item = card ? STATE.items.find(i => i.id === card.dataset.id) : null;
            const fallbackUrl = item?.ai_data?.storageUrl || card?.dataset?.sourceUrl;
            if (fallbackUrl && /^https?:\/\//.test(fallbackUrl)) {
              showToast('Файл &gt;20 МБ — открываю в Telegram');
              window.open(fallbackUrl, '_blank');
            } else {
              showToast('Файл &gt;20 МБ — недоступен через Bot API');
            }
          }
        }
      }
      return;
    }

    // "video-play" — play TG video in lightbox
    if (action === 'video-play') {
      e.stopPropagation();
      let videoUrl = url;
      // If URL is empty/expired, re-resolve from fileId
      if (!videoUrl) {
        const fileId = actionEl.dataset.fileId || actionEl.closest('[data-file-id]')?.dataset.fileId;
        if (fileId && STATE.botToken) {
          videoUrl = await resolveFileId(STATE.botToken, fileId);
        }
      }
      if (videoUrl) {
        openLightbox(videoUrl, '', { video: true });
      } else {
        // File too large for Bot API (>20MB) — try storageUrl or sourceUrl
        const card = actionEl.closest('.card[data-id]');
        const item = card ? STATE.items.find(i => i.id === card.dataset.id) : null;
        const fallbackUrl = item?.ai_data?.storageUrl || card?.dataset?.sourceUrl;
        if (fallbackUrl && /^https?:\/\//.test(fallbackUrl)) {
          showToast('Видео &gt;20 МБ — открываю в Telegram');
          window.open(fallbackUrl, '_blank');
        } else {
          showToast('Видео &gt;20 МБ — недоступно через Bot API');
        }
      }
      return;
    }

    // "videonote-play" — toggle sound on circular video note
    // Muted loop by default. Click → restart with sound (plays once, then back to muted loop).
    // Click while unmuted → mute immediately (back to silent loop).
    if (action === 'videonote-play') {
      e.stopPropagation();
      const circle = actionEl.closest('.videonote-circle') || actionEl;
      const video = circle.querySelector('.videonote-video');
      const playIcon = circle.querySelector('.videonote-play-icon');
      if (!video) return;

      // If video not loaded yet (autoplay failed), load it first
      if (!video.src || video.readyState === 0) {
        const fileId = circle.dataset.fileId;
        if (fileId && STATE.botToken) {
          const videoUrl = await resolveFileId(STATE.botToken, fileId);
          if (videoUrl) video.src = videoUrl;
        }
      }

      if (!video.muted) {
        // Currently playing with sound → mute and continue looping
        video.muted = true;
        video.loop = true;
      } else {
        // Currently muted → restart from beginning with sound, play once
        video.currentTime = 0;
        video.muted = false;
        video.loop = false;
        // When this playthrough ends, go back to muted loop
        const onEnded = () => {
          video.removeEventListener('ended', onEnded);
          video.muted = true;
          video.loop = true;
          video.play().catch(() => {});
        };
        video.addEventListener('ended', onEnded);
        video.play().then(() => {
          if (playIcon) playIcon.style.display = 'none';
        }).catch(() => {});
      }
      return;
    }

    // "voice-play" — play/pause voice message inline
    if (action === 'voice-play') {
      e.stopPropagation();
      const playerEl = actionEl.closest('.voice-player') || actionEl;
      const fileId = playerEl.dataset.fileId;
      let audio = playerEl._audio;

      if (!audio) {
        // Create audio element on first play
        audio = new Audio();
        playerEl._audio = audio;
        const progressBar = playerEl.querySelector('.voice-progress');
        const durationEl = playerEl.querySelector('.voice-duration');

        audio.addEventListener('timeupdate', () => {
          if (audio.duration) {
            const pct = (audio.currentTime / audio.duration) * 100;
            if (progressBar) progressBar.style.width = pct + '%';
            if (durationEl) {
              const rem = Math.ceil(audio.duration - audio.currentTime);
              durationEl.textContent = `${Math.floor(rem / 60)}:${String(rem % 60).padStart(2, '0')}`;
            }
          }
        });
        audio.addEventListener('ended', () => {
          playerEl.classList.remove('is-playing');
          if (progressBar) progressBar.style.width = '0%';
        });

        // Seek on click
        const waveform = playerEl.querySelector('.voice-waveform');
        if (waveform) {
          waveform.addEventListener('click', (ev) => {
            ev.stopPropagation();
            if (audio.duration) {
              const rect = waveform.getBoundingClientRect();
              const pct = (ev.clientX - rect.left) / rect.width;
              audio.currentTime = pct * audio.duration;
            }
          });
        }

        // Resolve and set src
        if (fileId && STATE.botToken) {
          const audioUrl = await resolveFileId(STATE.botToken, fileId);
          if (audioUrl) audio.src = audioUrl;
        }
      }

      if (audio.paused) {
        // Pause any other playing audio
        document.querySelectorAll('.voice-player.is-playing, .audio-player.is-playing').forEach(p => {
          if (p !== playerEl && p._audio) { p._audio.pause(); p.classList.remove('is-playing'); }
        });
        audio.play().catch(() => {});
        playerEl.classList.add('is-playing');
      } else {
        audio.pause();
        playerEl.classList.remove('is-playing');
      }
      return;
    }

    // "audio-play" — play/pause audio file inline (via CORS proxy)
    if (action === 'audio-play') {
      e.stopPropagation();
      const playerEl = actionEl.closest('.audio-player') || actionEl;
      const fileId = playerEl.dataset.fileId;
      let audio = playerEl._audio;

      if (!audio) {
        audio = new Audio();
        playerEl._audio = audio;
        const progressBar = playerEl.querySelector('.audio-progress');
        const timeEl = playerEl.querySelector('.audio-time');

        audio.addEventListener('timeupdate', () => {
          if (audio.duration) {
            const pct = (audio.currentTime / audio.duration) * 100;
            if (progressBar) progressBar.style.width = pct + '%';
            if (timeEl) {
              const rem = Math.ceil(audio.duration - audio.currentTime);
              timeEl.textContent = `${Math.floor(rem / 60)}:${String(rem % 60).padStart(2, '0')}`;
            }
          }
        });
        audio.addEventListener('ended', () => {
          playerEl.classList.remove('is-playing');
          if (progressBar) progressBar.style.width = '0%';
        });

        // Seek on click
        const progressWrap = playerEl.querySelector('.audio-progress-wrap');
        if (progressWrap) {
          progressWrap.addEventListener('click', (ev) => {
            ev.stopPropagation();
            if (audio.duration) {
              const rect = progressWrap.getBoundingClientRect();
              const pct = (ev.clientX - rect.left) / rect.width;
              audio.currentTime = pct * audio.duration;
            }
          });
        }

        // Fetch via CORS proxy for audio files
        if (fileId && STATE.botToken) {
          try {
            const getFileRes = await fetch(`https://api.telegram.org/bot${STATE.botToken}/getFile?file_id=${fileId}`);
            const getFileData = await getFileRes.json();
            if (getFileData.ok) {
              const filePath = getFileData.result.file_path;
              const ext = filePath.split('.').pop()?.toLowerCase();
              const mimeMap = { mp3: 'audio/mpeg', wav: 'audio/wav', ogg: 'audio/ogg', m4a: 'audio/mp4', flac: 'audio/flac' };
              const mime = mimeMap[ext] || 'audio/mpeg';
              const proxyUrl = 'https://stash-cors-proxy.mxmlsn-co.workers.dev';
              const res = await fetch(proxyUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  service: 'telegram', token: STATE.botToken,
                  path: `/file/${filePath}`, method: 'GET',
                  binary: true, contentType: mime
                })
              });
              const buf = await res.arrayBuffer();
              const blob = new Blob([buf], { type: mime });
              audio.src = URL.createObjectURL(blob);
            }
          } catch (err) {
            // Fallback: direct URL
            const audioUrl = await resolveFileId(STATE.botToken, fileId);
            if (audioUrl) audio.src = audioUrl;
          }
        }
      }

      if (audio.paused) {
        document.querySelectorAll('.voice-player.is-playing, .audio-player.is-playing').forEach(p => {
          if (p !== playerEl && p._audio) { p._audio.pause(); p.classList.remove('is-playing'); }
        });
        audio.play().catch(() => {});
        playerEl.classList.add('is-playing');
      } else {
        audio.pause();
        playerEl.classList.remove('is-playing');
      }
      return;
    }

    // "toggle-transcript" — show/hide transcript text
    if (action === 'toggle-transcript') {
      e.stopPropagation();
      const card = actionEl.closest('.card[data-id]');
      if (!card) return;
      const transcriptEl = card.querySelector('.transcript-text');
      if (transcriptEl) {
        transcriptEl.classList.toggle('hidden');
        actionEl.classList.toggle('active');
      }
      return;
    }

    // "toggle-xpost" — collapse/expand xpost screenshot
    if (action === 'toggle-xpost') {
      e.stopPropagation();
      const card = actionEl.closest('.card[data-id]');
      if (card) toggleXpostCollapse(card.dataset.id);
      return;
    }

    // "xpost" — tweet card click: check truncation
    if (action === 'xpost') {
      const card = actionEl;
      const sourceUrl = card.dataset.sourceUrl || '';
      const textEl = card.querySelector('.xpost-text');
      const isTruncated = textEl && (textEl.scrollHeight > textEl.clientHeight + 2);

      if (!isTruncated && sourceUrl) {
        window.open(sourceUrl, '_blank');
      } else {
        // Open fullscreen overlay with full tweet
        const tweetText = card.dataset.tweetText || '';
        const author = card.dataset.author || '';
        const imgSrc = card.dataset.img || '';
        const domain = sourceUrl ? getDomain(sourceUrl) : '';
        const faviconUrl = domain ? `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=64` : '';

        const linkOpen = sourceUrl ? `<a href="${escapeHtml(sourceUrl)}" target="_blank" style="text-decoration:none;color:inherit;">` : '';
        const linkClose = sourceUrl ? '</a>' : '';

        let html = '<div class="overlay-tweet">';
        html += '<div class="overlay-tweet-header">';
        if (faviconUrl) html += `${linkOpen}<img class="overlay-tweet-avatar" src="${escapeHtml(faviconUrl)}" alt="">${linkClose}`;
        if (author) html += `${linkOpen}<div class="overlay-tweet-author">${escapeHtml(author)}</div>${linkClose}`;
        html += '</div>';
        if (tweetText) html += `<div class="overlay-tweet-text">${escapeHtml(tweetText)}</div>`;
        if (imgSrc) html += `${linkOpen}<img class="overlay-tweet-img" src="${escapeHtml(imgSrc)}" alt="">${linkClose}`;
        html += '</div>';
        openContentOverlay(html);
      }
      return;
    }

    // "quote" — open fullscreen quote overlay
    if (action === 'quote') {
      const card = actionEl;
      const quoteText = card.dataset.quoteText || '';
      const sourceUrl = card.dataset.sourceUrl || '';
      const domain = card.dataset.domain || '';

      // Check if this is a tgpost with HTML content
      const itemId = card.dataset.id;
      const item = STATE.items.find(i => i.id === itemId);
      const isHtml = item?.ai_data?.htmlContent || /<(?:a\s+href=|b>|i>|u>|s>|code>)/.test(quoteText);
      const textHtml = isHtml ? sanitizeHtml(quoteText) : escapeHtml(quoteText);

      let html = '<div class="overlay-quote">';
      html += '<div class="overlay-quote-body">';
      html += `<div class="overlay-quote-text">${textHtml}</div>`;
      html += '</div>';
      html += '<div class="overlay-quote-footer">';
      html += (domain && sourceUrl)
        ? `<a class="overlay-quote-source" href="${escapeHtml(sourceUrl)}" target="_blank">${escapeHtml(domain)}</a>`
        : (domain ? `<span class="overlay-quote-source">${escapeHtml(domain)}</span>` : '<span></span>');
      html += '</div>';
      html += '</div>';
      openContentOverlay(html, { alignTop: quoteText.length > 460 });
      return;
    }
  });

  // ── Lightbox close ──
  const lb = document.getElementById('lightbox');
  lb.addEventListener('click', e => {
    if (e.target === lb || e.target === document.getElementById('lightbox-img') || e.target === document.getElementById('lightbox-video')) {
      closeLightbox();
    }
  });

  // ── Content overlay close ──
  const co = document.getElementById('content-overlay');
  co.addEventListener('click', e => {
    if (e.target === co || e.target.classList.contains('overlay-close')) {
      closeContentOverlay();
    }
  });
  co.querySelector('.overlay-close').addEventListener('click', closeContentOverlay);

  // ── Custom context menu ──
  let ctxTargetItemId = null;
  const ctxMenu = document.getElementById('ctx-menu');

  masonry.addEventListener('contextmenu', e => {
    const card = e.target.closest('.card[data-id]');
    if (!card) return;
    e.preventDefault();
    ctxTargetItemId = card.dataset.id;

    // Highlight current type
    const item = STATE.items.find(i => i.id === ctxTargetItemId);
    if (item) {
      document.querySelectorAll('.ctx-type-item').forEach(el => {
        const val = el.dataset.typeValue;
        const isCurrent = (val === 'link' && !item.ai_type) || (val === item.ai_type);
        el.classList.toggle('ctx-current', isCurrent);
      });
      document.querySelectorAll('.ctx-sec-item').forEach(el => {
        const val = el.dataset.typeValue;
        el.classList.toggle('ctx-current', val === (item.ai_type_secondary || ''));
      });
    }

    // Position at cursor, clamp to viewport
    ctxMenu.classList.remove('hidden');
    let x = e.clientX, y = e.clientY;
    const rect = ctxMenu.getBoundingClientRect();
    if (x + rect.width > window.innerWidth) x = window.innerWidth - rect.width - 8;
    if (y + rect.height > window.innerHeight) y = window.innerHeight - rect.height - 8;
    ctxMenu.style.left = x + 'px';
    ctxMenu.style.top = y + 'px';
  });

  function closeCtxMenu() {
    ctxMenu.classList.add('hidden');
    ctxTargetItemId = null;
  }

  document.addEventListener('click', closeCtxMenu);
  window.addEventListener('scroll', closeCtxMenu, true);

  ctxMenu.addEventListener('click', async e => {
    const btn = e.target.closest('[data-ctx-action]');
    if (!btn || !ctxTargetItemId) return;
    const action = btn.dataset.ctxAction;
    const targetId = ctxTargetItemId;
    closeCtxMenu();

    if (action === 'delete') {
      await deleteItem(targetId);
    } else if (action === 'set-type') {
      await changeItemType(targetId, btn.dataset.typeValue, null);
    } else if (action === 'set-secondary') {
      await changeItemType(targetId, null, btn.dataset.typeValue);
    }
  });

  // ── Escape key closes any overlay ──
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      closeLightbox();
      closeContentOverlay();
      closeCtxMenu();
    }
  });
});

// ─── AI background processing ─────────────────────────────────────────────────
async function runAiBackgroundProcessing() {
  const pending = STATE.items.filter(item => !item.ai_analyzed && item.id && item.type !== 'quote');
  if (!pending.length) {
    document.getElementById('ai-status').textContent = '✓ All analyzed';
    setTimeout(() => { document.getElementById('ai-status').textContent = ''; }, 3000);
    return;
  }

  const aiStatus = document.getElementById('ai-status');
  let done = 0;
  const BATCH = 3;

  for (let i = 0; i < pending.length; i += BATCH) {
    const batch = pending.slice(i, i + BATCH);
    await Promise.all(batch.map(item => new Promise(resolve => {
      chrome.runtime.sendMessage({
        type: 'AI_ANALYZE',
        item: {
          type: item.type,
          fileId: item.fileId,
          sourceUrl: item.sourceUrl,
          content: item.content,
          tagName: item.tag
        },
        notionPageId: item.id
      }, response => {
        if (chrome.runtime.lastError) { resolve(); return; }
        if (response?.ok && response.result) {
          item.ai_type = response.result.content_type || item.ai_type;
          item.ai_type_secondary = response.result.content_type_secondary || item.ai_type_secondary;
          item.ai_description = response.result.description || item.ai_description;
          const r = response.result;
          const aiDataPayload = {};
          if (r.materials?.length) aiDataPayload.materials = r.materials;
          if (r.color_palette) aiDataPayload.color_palette = r.color_palette;
          if (r.color_subject) aiDataPayload.color_subject = r.color_subject;
          if (r.color_top3?.length) aiDataPayload.color_top3 = r.color_top3;
          if (r.text_on_image) aiDataPayload.text_on_image = r.text_on_image;
          if (r.price) aiDataPayload.price = r.price;
          if (r.author) aiDataPayload.author = r.author;
          if (r.tweet_text) aiDataPayload.tweet_text = r.tweet_text;
          item.ai_data = aiDataPayload;
          item.ai_analyzed = true;
          // Re-query fresh (applyFilters may have replaced innerHTML while batch was in-flight)
          const freshCard = document.querySelector(`.card[data-id="${item.id}"]`);
          if (freshCard) freshCard.outerHTML = renderCard(item);
        }
        done++;
        aiStatus.textContent = `Analyzing ${done}/${pending.length}…`;
        resolve();
      });
    })));
    if (i + BATCH < pending.length) await new Promise(r => setTimeout(r, 600));
  }

  aiStatus.textContent = `✓ ${done} analyzed`;
  setTimeout(() => { aiStatus.textContent = ''; }, 4000);
}

// ─── Bootstrap ───────────────────────────────────────────────────────────────
window.addEventListener('DOMContentLoaded', init);

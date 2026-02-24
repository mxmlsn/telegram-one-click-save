// ─── Constants ─────────────────────────────────────────────────────────────────
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

// ─── Shared Palettes & SVGs ──────────────────────────────────────────────────
const PRODUCT_PALETTE = {
  red:    { bg: '#3D1A1A', border: 'rgba(140,50,50,0.5)',   accent: '#C97A7A' },
  violet: { bg: '#313367', border: 'rgba(69,57,131,0.5)',   accent: '#9392CA' },
  pink:   { bg: '#3D1A2E', border: 'rgba(140,50,100,0.5)',  accent: '#CA7AAF' },
  yellow: { bg: '#3A3210', border: 'rgba(140,125,30,0.5)',  accent: '#C9B860' },
  green:  { bg: '#1A2E15', border: 'rgba(50,110,45,0.5)',   accent: '#7ABF72' },
  blue:   { bg: '#13213D', border: 'rgba(45,85,160,0.5)',   accent: '#7A9FCA' },
  brown:  { bg: '#2E1F10', border: 'rgba(110,72,30,0.5)',   accent: '#C4986A' },
  white:  { bg: '#2A2A2A', border: 'rgba(120,120,120,0.5)', accent: '#C0C0C0' },
  black:  { bg: '#111111', border: 'rgba(70,70,70,0.5)',    accent: '#909090' },
  bw:     { bg: '#1A1A1A', border: 'rgba(90,90,90,0.5)',    accent: '#ABABAB' },
  orange: { bg: '#3A2410', border: 'rgba(140,85,30,0.5)',   accent: '#C99060' },
  purple: { bg: '#313367', border: 'rgba(69,57,131,0.5)',   accent: '#9392CA' },
};
function getAccentColor(colorKey, fallback) {
  if (!colorKey) return fallback || '#5B68E0';
  return PRODUCT_PALETTE[colorKey]?.accent || fallback || '#5B68E0';
}
function getFileIconColor(ext) {
  const e = (ext || '').toLowerCase();
  // Adobe
  if (['psd', 'psb'].includes(e)) return '#31A8FF';
  if (['ai', 'eps'].includes(e)) return '#FF9A00';
  if (['indd', 'indt'].includes(e)) return '#FF3366';
  if (['xd'].includes(e)) return '#FF26BE';
  if (['ae', 'aep'].includes(e)) return '#9999FF';
  if (['pr', 'prproj'].includes(e)) return '#9999FF';
  if (['pdf'].includes(e)) return '#FF4444';
  // Figma / Sketch
  if (['fig', 'figma'].includes(e)) return '#A259FF';
  if (['sketch'].includes(e)) return '#F7B500';
  // 3D / CAD
  if (['blend', 'blender'].includes(e)) return '#E87D0D';
  if (['fbx', 'obj', 'stl', 'dae', 'gltf', 'glb'].includes(e)) return '#7EC8E3';
  if (['dwg', 'dxf'].includes(e)) return '#CC2222';
  // Archives
  if (['zip', 'rar', '7z', 'tar', 'gz', 'bz2'].includes(e)) return '#8A8A8A';
  // Code
  if (['js', 'ts', 'jsx', 'tsx'].includes(e)) return '#F7DF1E';
  if (['py'].includes(e)) return '#3572A5';
  if (['swift'].includes(e)) return '#F05138';
  if (['kt', 'kts'].includes(e)) return '#A97BFF';
  if (['rs'].includes(e)) return '#DEA584';
  if (['go'].includes(e)) return '#00ADD8';
  if (['rb'].includes(e)) return '#CC342D';
  if (['java'].includes(e)) return '#B07219';
  // Fonts
  if (['ttf', 'otf', 'woff', 'woff2'].includes(e)) return '#6B7280';
  // Video / Audio
  if (['mp4', 'mov', 'avi', 'mkv', 'webm'].includes(e)) return '#9B59B6';
  if (['mp3', 'wav', 'flac', 'aac', 'm4a'].includes(e)) return '#2ECC71';
  // Default
  return '#5B8DEF';
}
function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
// Build the HTML for a new-style file sheet card (rect + ext + name + corner)
function makeFileSheetHtml(color, ext, name) {
  const extHtml = ext ? `<span class="doc-sheet-ext">.${escapeHtml(ext)}</span>` : '';
  const nameHtml = name ? `<span class="doc-sheet-name">${escapeHtml(name)}</span>` : '';
  return `<div class="doc-sheet-wrap">
    <div class="doc-sheet" style="background:${color}">
      ${extHtml}
      ${nameHtml}
    </div>
    <div class="doc-corner-wrap" style="--sheet-color:${color}"></div>
  </div>`;
}
const TG_ICON_SVG = `<svg width="12" height="10" viewBox="0 0 12.3848 10.2636" fill="none" style="flex-shrink:0"><path fill-rule="evenodd" clip-rule="evenodd" d="M0.85139 4.41839L7.50196 1.55371C10.669 0.23644 11.327 0.00763 11.756 0.00008C11.8503-0.00158 12.0612 0.02179 12.1979 0.13266C12.3133 0.22627 12.345 0.35276 12.3602 0.44148C12.3754 0.53021 12.3943 0.73244 12.3793 0.89044C12.2076 2.69363 11.465 7.06966 11.0872 9.0893C10.9274 9.94392 10.6128 10.2305 10.3079 10.2585C9.64564 10.3194 9.14274 9.8208 8.50131 9.40036L5.95631 7.69083C4.83037 6.94889 5.56027 6.54108 6.20195 5.87463C6.36987 5.70015 9.28776 3.04613 9.34421 2.80537C9.35105 2.77526 9.35782 2.66305 9.29115 2.60375C9.22449 2.54445 9.12602 2.56497 9.05502 2.58087C8.95437 2.60372 7.35095 3.66352 4.24478 5.7603C3.78965 6.07284 3.37739 6.22512 3.00806 6.21714C2.60087 6.20834 1.81763 5.98692 1.23536 5.79763C0.521177 5.56549-0.0464449 5.44274 0.00300277 5.04849C0.0287301 4.84315 0.311526 4.63315 0.851367 4.41844Z" fill="white" fill-opacity="0.3"/></svg>`;

// ─── Default customTags (same as extension DEFAULT_SETTINGS) ─────────────────
const DEFAULT_CUSTOM_TAGS = [
  { name: 'work', color: '#E64541', id: 'red' },
  { name: 'study', color: '#FFDE42', id: 'yellow' },
  { name: 'refs', color: '#4ED345', id: 'green' },
  { name: 'project1', color: '#377CDE', id: 'blue' },
  { name: '', color: '#BB4FFF', id: 'purple' },
  { name: '', color: '#3D3D3B', id: 'black' },
  { name: '', color: '#DEDEDE', id: 'white' }
];

// ─── State ────────────────────────────────────────────────────────────────────
const STATE = {
  items: [],
  imageMap: {},
  notionToken: '',
  notionDbId: '',
  botToken: '',
  chatId: '',
  storageChannelId: '',
  customTags: [],
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

// Notion API PATCH helper — eliminates 6 duplicate header blocks
function notionPatch(pageId, body) {
  return bgFetch(`https://api.notion.com/v1/pages/${pageId}`, {
    method: 'PATCH',
    headers: {
      'Authorization': `Bearer ${STATE.notionToken}`,
      'Notion-Version': NOTION_VERSION,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
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
    STATE.chatId = settings.chatId || '';
    // Fetch tags from bot KV (single source of truth, synced by extension)
    let remoteTags = null;
    try {
      const tagsRes = await fetch('https://stash-telegram-bot.mxmlsn-co.workers.dev/api/tags', {
        headers: { 'Authorization': `Bearer ${settings.botToken}` }
      });
      if (tagsRes.ok) {
        const tagsConfig = await tagsRes.json();
        if (Array.isArray(tagsConfig.customTags) && tagsConfig.customTags.length > 0) {
          remoteTags = tagsConfig.customTags;
        }
        if (tagsConfig.storageChannelId) STATE.storageChannelId = tagsConfig.storageChannelId;
      }
    } catch (e) { console.warn('[Init] Failed to fetch tags from bot:', e.message); }
    STATE.customTags = remoteTags || DEFAULT_CUSTOM_TAGS;
    // AI is enabled if apiKey exists (aiEnabled toggle is optional — having a key implies intent)
    STATE.aiEnabled = !!settings.aiApiKey;
    STATE.aiAutoInViewer = settings.aiAutoInViewer !== false;
    console.log('[Init] chatId=%s, storageChannelId=%s, customTags=%d (remote=%s), aiEnabled=%s, aiAutoInViewer=%s',
      STATE.chatId ? 'set' : 'empty',
      STATE.storageChannelId || 'EMPTY',
      STATE.customTags.length,
      !!remoteTags,
      STATE.aiEnabled,
      STATE.aiAutoInViewer
    );
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
  document.getElementById('add-note-btn').classList.remove('hidden');
  document.getElementById('toolbar').classList.remove('hidden');
  document.getElementById('display-bar').classList.remove('hidden');
  document.getElementById('grid-wrap').classList.remove('hidden');
  document.getElementById('ai-status').textContent = 'Loading…';

  await restoreDisplaySettings();
  setupToolbarEvents();
  setupDisplayBar();
  setupDragDrop();
  setupNoteEditor();

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
    patchHeicPlaceholderSizes();

    // 5. Resolve remaining images in background, patch cards as they come
    const restItems = STATE.items.slice(FIRST_BATCH_SIZE).filter(i => i.fileId || i.fileIds?.length > 1);
    const imagesDonePromise = restItems.length > 0
      ? resolveRemainingImages(restItems, fileCache)
      : Promise.resolve(saveFileCache(fileCache));

    // 6. Repair corrupted ai_data (from previous truncation bug) — write salvaged data back to Notion
    repairCorruptedAiData();

    // 7. AI analysis — wait for images to finish, then analyze
    if (STATE.aiEnabled && STATE.aiAutoInViewer) {
      imagesDonePromise.then(() => runAiBackgroundProcessing());
    }
  } catch (e) {
    document.getElementById('ai-status').textContent = 'Error: ' + e.message;
    console.error('[Viewer] load error:', e);
  }
}

async function resolveRemainingImages(items, fileCache) {
  const now = Date.now();

  // Collect all unique fileIds (main + album extras + HEIC thumbnails)
  const allFileIds = new Set();
  for (const item of items) {
    if (item.fileId) allFileIds.add(item.fileId);
    if (item.fileIds?.length > 1) {
      for (const fid of item.fileIds) if (fid) allFileIds.add(fid);
    }
    const fname = item.ai_data?.fileName || '';
    if (/\.heic$/i.test(fname) && item.ai_data?.thumbnailFileId) {
      allFileIds.add(item.ai_data.thumbnailFileId);
    }
  }

  const toFetchIds = [];
  // Apply cached URLs first (validate URL has actual file_path, not just bot prefix)
  const validTgUrl = u => u && /\/bot[^/]+\/.+\/.+/.test(u);
  for (const fid of allFileIds) {
    const cached = fileCache[fid];
    if (cached && (now - cached.ts < FILE_CACHE_TTL) && validTgUrl(cached.url)) {
      STATE.imageMap[fid] = cached.url;
    } else {
      if (cached && !validTgUrl(cached.url)) { console.log('[cache] PURGE bad URL fid=...%s url=%s', fid.slice(-20), cached?.url?.slice(0, 80)); delete fileCache[fid]; }
      toFetchIds.push(fid);
    }
  }
  console.log('[resolveRemaining] cached=%d toFetch=%d', allFileIds.size - toFetchIds.length, toFetchIds.length);

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
    // Proxy SVGs in this batch before patching cards (so <img> gets blob URL, not raw TG URL)
    const svgInBatch = [...new Set([...resolved, ...albumsToRepatch])].filter(it =>
      /\.svg$/i.test(it.ai_data?.fileName || '') ||
      it.albumMedia?.some(m => /\.svg$/i.test(m.fileName || '') && STATE.imageMap[m.fileId])
    );
    if (svgInBatch.length) await proxySvgItems(svgInBatch, null);
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

  // HEIC conversion: run in background after page is rendered
  const heicItems = items.filter(it => {
    const fname = it.ai_data?.fileName || it.content || '';
    return /\.heic$/i.test(fname) && it._resolvedImg;
  });
  const heicAlbumItems = items.filter(it =>
    it.albumMedia?.some(m => /\.heic$/i.test(m.fileName || '') && STATE.imageMap[m.fileId])
  );
  const heicItemsAll = [...new Set([...heicItems, ...heicAlbumItems])];
  if (heicItemsAll.length > 0 && typeof heic2any !== 'undefined') {
    Promise.all(heicItemsAll.map(async it => {
      // Convert standalone HEIC
      const fname = it.ai_data?.fileName || it.content || '';
      if (/\.heic$/i.test(fname) && it._resolvedImg) {
        const { url: convUrl, width, height } = await maybeConvertHeic(it._resolvedImg, fname);
        if (convUrl !== it._resolvedImg) {
          it._resolvedImg = convUrl;
          STATE.imageMap[it.fileId] = convUrl;
          if (width && height) { it.ai_data = it.ai_data || {}; it.ai_data.imageWidth = width; it.ai_data.imageHeight = height; }
        }
      }
      // Convert HEIC entries inside albumMedia
      if (it.albumMedia) {
        for (const m of it.albumMedia) {
          const mfname = m.fileName || '';
          if (/\.heic$/i.test(mfname) && STATE.imageMap[m.fileId]) {
            const { url: convUrl, width, height } = await maybeConvertHeic(STATE.imageMap[m.fileId], mfname);
            if (convUrl !== STATE.imageMap[m.fileId]) {
              STATE.imageMap[m.fileId] = convUrl;
              if (width && height) { m.imageWidth = width; m.imageHeight = height; }
            }
          }
        }
      }
      return it;
    })).then(converted => patchCardImages(converted));
  }

  // SVG proxy: convert all resolved SVG URLs to blob URLs
  await proxySvgItems(items, null);
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
  const rawAiDataStr = p['ai_data']?.rich_text?.[0]?.text?.content || '';
  try { aiData = rawAiDataStr ? JSON.parse(rawAiDataStr) : {}; } catch {
    // Corrupted JSON (likely truncated by previous ai_data patch).
    // Try to salvage fields by closing the JSON at the last complete value.
    console.warn('[parseItem] Corrupted ai_data for page %s, attempting salvage…', page.id?.slice(0, 8));
    try {
      // Find last complete key-value pair by looking for last ',"' or '":' boundary
      let s = rawAiDataStr;
      // Remove trailing incomplete value: backtrack to last complete comma-separated entry
      const lastComma = s.lastIndexOf(',"');
      if (lastComma > 0) {
        s = s.slice(0, lastComma) + '}';
        aiData = JSON.parse(s);
        aiData._repaired = true;
        console.log('[parseItem] Salvaged %d fields from corrupted ai_data', Object.keys(aiData).length);
      }
    } catch {
      aiData = { _corrupted: true };
      console.warn('[parseItem] Could not salvage ai_data for page %s', page.id?.slice(0, 8));
    }
  }

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
      // Determine media type: ai_data.mediaType is authoritative, fall back to item.type
      const mType = item.ai_data?.mediaType
        || (['video', 'image', 'gif', 'pdf', 'audio', 'voice', 'video_note', 'document'].includes(item.type) ? item.type : 'image');
      const mediaEntry = {
        fileId: item.fileId,
        mediaType: mType,
        videoFileId: item.videoFileId || '',
        pdfFileId: item.pdfFileId || '',
        audioFileId: item.audioFileId || item.ai_data?.audioFileId || '',
        audioTitle: item.ai_data?.audioTitle || '',
        audioPerformer: item.ai_data?.audioPerformer || '',
        audioDuration: item.ai_data?.audioDuration || 0,
        audioFileName: item.ai_data?.audioFileName || '',
        audioContent: item.content || '',
        coverFileId: (mType === 'audio' && item.ai_data?.thumbnailFileId) ? item.ai_data.thumbnailFileId : '',
        fileName: item.ai_data?.fileName || '',
        storageUrl: item.ai_data?.storageUrl || '',
      };
      if (!groups[gid]) {
        groups[gid] = item;
        // Always add media entry (even without fileId — PDF/video can still show badge)
        item.albumMedia = [mediaEntry];
        item.fileIds = item.fileId ? [item.fileId] : [];
        item._groupPageIds = [item.id]; // track all Notion page IDs in this album
        // Add audio cover thumbnail for resolution
        if (mediaEntry.coverFileId) item.fileIds.push(mediaEntry.coverFileId);
        // If first item is a document and its content is just the filename, clear it
        // so a real caption from a later item can be picked up
        const firstIsDoc = mType === 'document' || mType === 'pdf';
        if (firstIsDoc && item.content && item.content.trim() === (item.ai_data?.fileName || '').trim()) {
          item.content = '';
        }
        result.push(item);
      } else {
        // Merge into existing group item — always add media entry
        groups[gid].albumMedia.push(mediaEntry);
        groups[gid]._groupPageIds.push(item.id); // track merged page ID
        if (item.fileId) {
          groups[gid].fileIds.push(item.fileId);
        }
        // Add audio cover thumbnail for resolution
        if (mediaEntry.coverFileId) groups[gid].fileIds.push(mediaEntry.coverFileId);
        // Use content from whichever has it — but skip if content is just the filename
        // (document/pdf items store the filename in content, not a user caption)
        const isDocItem = mType === 'document' || mType === 'pdf';
        const contentIsFilename = isDocItem && item.content && item.content.trim() === (item.ai_data?.fileName || '').trim();
        if (!groups[gid].content && item.content && !contentIsFilename) {
          groups[gid].content = item.content;
        }
        // Collect all unique captions — skip entries that are just filenames
        if (item.content && !contentIsFilename) {
          if (!groups[gid]._allCaptions) {
            groups[gid]._allCaptions = groups[gid].content ? [groups[gid].content] : [];
          }
          if (!groups[gid]._allCaptions.includes(item.content)) {
            groups[gid]._allCaptions.push(item.content);
          }
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
        if (!groups[gid].ai_data.forwardUserUrl && item.ai_data?.forwardUserUrl) {
          groups[gid].ai_data.forwardUserUrl = item.ai_data.forwardUserUrl;
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
    // Debug: log SVG albums
    if (item.albumMedia?.length > 0) {
      const svgs = item.albumMedia.filter(m => /\.svg$/i.test(m.fileName || ''));
      if (svgs.length) console.log('[SVG] mergeMediaGroups: album with %d items, %d SVGs, fileIds=%s, svgFids=%s',
        item.albumMedia.length, svgs.length, item.fileIds?.join(',')?.slice(0, 80), svgs.map(s => s.fileId.slice(-20)).join(','));
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
    if (!res.ok) { console.log('[resolve] FAIL status=%d fid=%s', res.status, fileId.slice(-20)); return null; }
    const data = await res.json();
    if (!data.ok || !data.result?.file_path) { console.log('[resolve] FAIL no file_path fid=%s', fileId.slice(-20)); return null; }
    const url = `https://api.telegram.org/file/bot${tgToken}/${data.result.file_path}`;
    console.log('[resolve] OK fid=...%s path=%s', fileId.slice(-20), data.result.file_path);
    return url;
  } catch (e) { console.log('[resolve] ERROR fid=%s %s', fileId.slice(-20), e.message); return null; }
}

// ─── File Upload Infrastructure ─────────────────────────────────────────────

async function compressImageIfNeeded(blob) {
  const MAX_SIZE = 10 * 1024 * 1024;
  if (blob.size <= MAX_SIZE) return blob;

  const img = new Image();
  const imgUrl = URL.createObjectURL(blob);
  await new Promise((resolve, reject) => { img.onload = resolve; img.onerror = reject; img.src = imgUrl; });

  let quality = 0.9;
  let compressedBlob = blob;
  while (compressedBlob.size > MAX_SIZE && quality > 0.1) {
    const canvas = document.createElement('canvas');
    canvas.width = img.width; canvas.height = img.height;
    canvas.getContext('2d').drawImage(img, 0, 0);
    compressedBlob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', quality));
    quality -= 0.1;
  }
  if (compressedBlob.size > MAX_SIZE) {
    let scale = 0.9;
    while (compressedBlob.size > MAX_SIZE && scale > 0.3) {
      const canvas = document.createElement('canvas');
      canvas.width = Math.floor(img.width * scale); canvas.height = Math.floor(img.height * scale);
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
      compressedBlob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.85));
      scale -= 0.1;
    }
  }
  URL.revokeObjectURL(imgUrl);
  return compressedBlob;
}

// Generate a JPEG thumbnail from the first page of a PDF using pdf.js
async function generatePdfThumbnail(pdfFile) {
  if (!window.pdfjsLib) {
    const mod = await import('https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.9.155/pdf.min.mjs');
    window.pdfjsLib = mod;
    mod.GlobalWorkerOptions.workerSrc =
      'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.9.155/pdf.worker.min.mjs';
  }
  const arrayBuffer = await pdfFile.arrayBuffer();
  const pdf = await window.pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  const page = await pdf.getPage(1);
  const viewport = page.getViewport({ scale: 1 });
  // Scale to max 320px on longest side (Telegram thumbnail limit)
  const maxDim = 320;
  const scale = Math.min(maxDim / viewport.width, maxDim / viewport.height, 1);
  const scaledViewport = page.getViewport({ scale });
  const canvas = document.createElement('canvas');
  canvas.width = Math.floor(scaledViewport.width);
  canvas.height = Math.floor(scaledViewport.height);
  await page.render({ canvasContext: canvas.getContext('2d'), viewport: scaledViewport }).promise;
  return new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.85));
}

// Extract width, height, duration from a video file via <video> element
function getVideoMetadata(videoFile) {
  return new Promise((resolve) => {
    const video = document.createElement('video');
    video.preload = 'metadata';
    video.muted = true;
    const url = URL.createObjectURL(videoFile);
    video.src = url;
    video.addEventListener('loadedmetadata', () => {
      const meta = { width: video.videoWidth, height: video.videoHeight, duration: video.duration };
      URL.revokeObjectURL(url);
      resolve(meta);
    });
    video.addEventListener('error', () => { URL.revokeObjectURL(url); resolve({}); });
    setTimeout(() => { URL.revokeObjectURL(url); resolve({}); }, 5000);
  });
}

async function uploadFileToTelegram(file, botToken, chatId) {
  console.log('[Upload] file=%s size=%d type=%s', file.name, file.size, file.type);
  const MAX_FILE_SIZE = 50 * 1024 * 1024;
  if (file.size > MAX_FILE_SIZE) throw new Error('File too large (max 50MB)');

  const mime = file.type || '';
  const formData = new FormData();
  formData.append('chat_id', chatId);
  formData.append('disable_notification', 'true');
  formData.append('caption', '[stash-viewer]'); // marker so bot skips duplicate processing

  // Result object — all upload paths populate fields matching bot's parser.js output
  const r = { fileId: null, type: 'document', thumbnailFileId: null,
    videoFileId: null, animationFileId: null,
    audioTitle: '', audioPerformer: '', audioDuration: 0,
    messageId: null, fileName: file.name || '' };

  if (mime === 'image/gif') {
    formData.append('animation', file, file.name || 'animation.gif');
    const res = await fetch(`https://api.telegram.org/bot${botToken}/sendAnimation`, { method: 'POST', body: formData });
    if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.description || 'sendAnimation failed'); }
    const data = await res.json();
    const anim = data.result?.animation;
    r.animationFileId = anim?.file_id || null;
    r.thumbnailFileId = anim?.thumbnail?.file_id || anim?.thumb?.file_id || null;
    r.fileId = r.thumbnailFileId || r.animationFileId;
    r.type = 'gif';
    r.messageId = data.result?.message_id || null;
    console.log('[Upload] sendAnimation OK animFileId=%s thumbFileId=%s', r.animationFileId?.slice(-20), r.thumbnailFileId?.slice(-20));
    return r;
  }

  if (['image/jpeg', 'image/png', 'image/webp'].includes(mime)) {
    const compressed = await compressImageIfNeeded(file);
    formData.append('photo', compressed, file.name || 'photo.jpg');
    const res = await fetch(`https://api.telegram.org/bot${botToken}/sendPhoto`, { method: 'POST', body: formData });
    if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.description || 'sendPhoto failed'); }
    const data = await res.json();
    const photos = data.result?.photo;
    r.fileId = photos?.length > 0 ? photos[photos.length - 1].file_id : null;
    r.type = 'image';
    r.messageId = data.result?.message_id || null;
    console.log('[Upload] sendPhoto OK fileId=%s', r.fileId ? r.fileId.slice(-20) : 'null');
    return r;
  }

  // Video files → sendVideo
  if (mime.startsWith('video/') || /\.(mp4|mov|avi|mkv|webm)$/i.test(file.name || '')) {
    formData.append('video', file, file.name || 'video.mp4');
    formData.append('supports_streaming', 'true');
    // Extract video dimensions + duration so Telegram displays correct aspect ratio
    try {
      const meta = await getVideoMetadata(file);
      if (meta.width) formData.append('width', String(meta.width));
      if (meta.height) formData.append('height', String(meta.height));
      if (meta.duration) formData.append('duration', String(Math.round(meta.duration)));
      console.log('[Upload] Video metadata: %dx%d, %ds', meta.width, meta.height, Math.round(meta.duration || 0));
    } catch (e) { console.warn('[Upload] Video metadata extraction failed:', e.message); }
    const res = await fetch(`https://api.telegram.org/bot${botToken}/sendVideo`, { method: 'POST', body: formData });
    if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.description || 'sendVideo failed'); }
    const data = await res.json();
    const vid = data.result?.video;
    r.videoFileId = vid?.file_id || null;
    r.thumbnailFileId = vid?.thumbnail?.file_id || vid?.thumb?.file_id || null;
    r.fileId = r.thumbnailFileId || r.videoFileId;
    r.type = 'video';
    r.messageId = data.result?.message_id || null;
    console.log('[Upload] sendVideo OK videoFileId=%s thumbFileId=%s', r.videoFileId?.slice(-20), r.thumbnailFileId?.slice(-20));
    return r;
  }

  // Audio files → sendAudio
  if (mime.startsWith('audio/') || /\.(mp3|wav|flac|m4a|ogg|aac)$/i.test(file.name || '')) {
    formData.append('audio', file, file.name || 'audio.mp3');
    const res = await fetch(`https://api.telegram.org/bot${botToken}/sendAudio`, { method: 'POST', body: formData });
    if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.description || 'sendAudio failed'); }
    const data = await res.json();
    const audio = data.result?.audio;
    r.fileId = audio?.file_id || null;
    r.thumbnailFileId = audio?.thumbnail?.file_id || audio?.thumb?.file_id || null;
    r.audioTitle = audio?.title || '';
    r.audioPerformer = audio?.performer || '';
    r.audioDuration = audio?.duration || 0;
    r.type = 'audio';
    r.messageId = data.result?.message_id || null;
    console.log('[Upload] sendAudio OK fileId=%s title=%s performer=%s', r.fileId?.slice(-20), r.audioTitle, r.audioPerformer);
    return r;
  }

  // SVG, PDF, and everything else → sendDocument
  const docType = mime === 'image/svg+xml' ? 'image'
    : mime === 'application/pdf' ? 'pdf'
    : mime.startsWith('image/') ? 'image'
    : mime.startsWith('video/') ? 'video'
    : 'document';
  formData.append('document', file, file.name || 'file');

  // For PDF: generate thumbnail from first page and attach it
  if (docType === 'pdf') {
    try {
      const thumbBlob = await generatePdfThumbnail(file);
      if (thumbBlob) {
        formData.append('thumbnail', thumbBlob, 'thumb.jpg');
        console.log('[Upload] PDF thumbnail generated, size=%d', thumbBlob.size);
      }
    } catch (e) { console.warn('[Upload] PDF thumbnail generation failed:', e.message); }
  }

  const res = await fetch(`https://api.telegram.org/bot${botToken}/sendDocument`, { method: 'POST', body: formData });
  if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.description || 'sendDocument failed'); }
  const data = await res.json();
  const doc = data.result?.document;
  r.fileId = doc?.file_id || null;
  r.thumbnailFileId = doc?.thumbnail?.file_id || doc?.thumb?.file_id || null;
  r.type = docType;
  r.messageId = data.result?.message_id || null;
  console.log('[Upload] sendDocument OK fileId=%s type=%s thumbId=%s', r.fileId?.slice(-20), docType, r.thumbnailFileId?.slice(-20));
  return r;
}

async function createNotionPage({ type, content, fileId, tagName, sourceUrl, aiData }) {
  const domain = sourceUrl
    ? sourceUrl.replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0]
    : 'viewer upload';

  const properties = {
    'URL': { title: [{ text: { content: domain } }] },
    'Type': { select: { name: type } },
    'Date': { date: { start: new Date().toISOString() } }
  };
  if (sourceUrl) properties['Source URL'] = { url: sourceUrl };
  if (tagName) properties['Tag'] = { select: { name: tagName } };
  if (content) properties['Content'] = { rich_text: [{ text: { content: content.slice(0, 2000) } }] };
  if (fileId) properties['File ID'] = { rich_text: [{ text: { content: fileId } }] };
  if (aiData && Object.keys(aiData).length) {
    properties['ai_data'] = { rich_text: [{ text: { content: JSON.stringify(aiData).slice(0, 2000) } }] };
  }

  const res = await bgFetch('https://api.notion.com/v1/pages', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${STATE.notionToken}`,
      'Notion-Version': NOTION_VERSION,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ parent: { database_id: STATE.notionDbId }, properties })
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error('Notion save failed: ' + (err.message || res.status));
  }
  const page = await res.json();
  console.log('[Notion] Page created id=%s', page.id?.slice(0, 8));
  return page.id || null;
}

// Forward large file (>20MB) to storage channel via copyMessage, store storageUrl in Notion
async function forwardToStorageChannel(messageId, notionPageId, aiData) {
  try {
    const storageChatId = STATE.storageChannelId;
    if (!storageChatId) { console.log('[Storage] No storageChannelId configured, skipping'); return; }

    const res = await fetch(`https://api.telegram.org/bot${STATE.botToken}/copyMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: storageChatId,
        from_chat_id: STATE.chatId,
        message_id: messageId,
        disable_notification: true
      })
    });
    const data = await res.json();
    if (!data.ok) { console.warn('[Storage] copyMessage failed:', data.description); return; }

    const channelId = String(storageChatId).replace(/^@/, '');
    const storageUrl = `https://t.me/${channelId}/${data.result.message_id}`;
    aiData.storageUrl = storageUrl;
    console.log('[Storage] Forwarded, storageUrl=%s', storageUrl);

    // Patch Notion with storageUrl
    await bgFetch(`https://api.notion.com/v1/pages/${notionPageId}`, {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${STATE.notionToken}`,
        'Notion-Version': NOTION_VERSION,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ properties: {
        'ai_data': { rich_text: [{ text: { content: JSON.stringify(aiData).slice(0, 2000) } }] }
      }})
    });
  } catch (e) {
    console.warn('[Storage] Forward error:', e.message);
  }
}

function addCardToGrid(item) {
  console.log('[Grid] addCard type=%s fileId=%s albumMedia=%d', item.type, item.fileId?.slice(-20) || 'none', item.albumMedia?.length || 0);
  STATE.items.unshift(item);
  const cardHtml = renderCard(item);
  const masonry = document.getElementById('masonry');
  if (!masonry) return;

  const empty = document.getElementById('empty-state');
  if (empty) empty.classList.add('hidden');

  if (STATE.align === 'masonry') {
    const cols = masonry.querySelectorAll('.masonry-col');
    if (cols.length === 0) { applyFilters(); return; }
    cols[0].insertAdjacentHTML('afterbegin', cardHtml);
  } else {
    masonry.insertAdjacentHTML('afterbegin', cardHtml);
  }
}

// Fetch SVG file through CORS proxy and return a blob URL
// Telegram may serve SVGs with wrong content-type, blocking <img> rendering
async function proxySvgFile(tgFileUrl) {
  try {
    if (!tgFileUrl || tgFileUrl.startsWith('blob:')) {
      console.log('[SVG] proxySvgFile SKIP: blob or empty', tgFileUrl?.slice(0, 80));
      return null;
    }
    const match = tgFileUrl.match(/^https:\/\/api\.telegram\.org\/file\/bot[^/]+\/(.+)/);
    if (!match) {
      console.log('[SVG] proxySvgFile SKIP: no file_path in URL', tgFileUrl?.slice(0, 120));
      return null;
    }
    const filePath = '/' + match[1];
    console.log('[SVG] proxySvgFile FETCHING:', filePath);
    const proxyUrl = 'https://stash-cors-proxy.mxmlsn-co.workers.dev';
    const res = await fetch(proxyUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        service: 'telegram',
        token: STATE.botToken,
        path: `/file${filePath}`,
        method: 'GET',
        binary: true,
        contentType: 'image/svg+xml'
      })
    });
    if (!res.ok) { console.log('[SVG] proxySvgFile FAIL: status', res.status); return null; }
    const buf = await res.arrayBuffer();
    console.log('[SVG] proxySvgFile OK:', buf.byteLength, 'bytes');
    if (buf.byteLength < 50) return null;
    const blob = new Blob([buf], { type: 'image/svg+xml' });
    return URL.createObjectURL(blob);
  } catch (e) {
    console.warn('[SVG] proxySvgFile ERROR:', e);
    return null;
  }
}

// Proxy all SVG entries (standalone + albumMedia) for a set of items, then re-render
async function proxySvgItems(items, mapObj) {
  const svgStandalone = items.filter(it => /\.svg$/i.test(it.ai_data?.fileName || '') && it._resolvedImg);
  const svgAlbumParents = items.filter(it =>
    it.albumMedia?.some(m => /\.svg$/i.test(m.fileName || '') && STATE.imageMap[m.fileId])
  );
  const svgItems = [...new Set([...svgStandalone, ...svgAlbumParents])];
  console.log('[SVG] proxySvgItems called: standalone=%d albumParents=%d total=%d', svgStandalone.length, svgAlbumParents.length, svgItems.length);
  if (!svgItems.length) return;
  await Promise.all(svgItems.map(async it => {
    // standalone
    if (/\.svg$/i.test(it.ai_data?.fileName || '') && it._resolvedImg) {
      console.log('[SVG] proxySvgItems standalone: fid=%s url=%s', it.fileId, it._resolvedImg?.slice(0, 80));
      const blobUrl = await proxySvgFile(it._resolvedImg);
      console.log('[SVG] proxySvgItems standalone result:', blobUrl ? 'OK' : 'FAIL');
      if (blobUrl) {
        it._resolvedImg = blobUrl;
        if (mapObj) mapObj[it.fileId] = blobUrl;
        STATE.imageMap[it.fileId] = blobUrl;
      }
    }
    // albumMedia
    if (it.albumMedia) {
      for (let idx = 0; idx < it.albumMedia.length; idx++) {
        const m = it.albumMedia[idx];
        const isSvg = /\.svg$/i.test(m.fileName || '');
        const url = STATE.imageMap[m.fileId] || '';
        if (isSvg) {
          console.log('[SVG] proxySvgItems album[%d]: fid=%s fname=%s hasUrl=%s isBlob=%s url=%s',
            idx, m.fileId, m.fileName, !!url, url.startsWith('blob:'), url.slice(0, 80));
        }
        if (isSvg && url && !url.startsWith('blob:')) {
          const blobUrl = await proxySvgFile(url);
          console.log('[SVG] proxySvgItems album[%d] result: %s', idx, blobUrl ? 'OK' : 'FAIL');
          if (blobUrl) {
            if (mapObj) mapObj[m.fileId] = blobUrl;
            STATE.imageMap[m.fileId] = blobUrl;
          }
        }
      }
    }
  }));
  patchCardImages(svgItems);
}

async function maybeConvertHeic(url, fileName) {
  if (!url) return { url };
  const isHeic = /\.heic$/i.test(fileName || '') || /\.heic($|\?)/i.test(url);
  if (!isHeic) { return { url }; }
  if (typeof heic2any === 'undefined') { console.warn('[HEIC] heic2any not loaded'); return { url }; }
  console.log('[HEIC] converting:', fileName, url.slice(0, 80));
  try {
    const proxyUrl = 'https://stash-cors-proxy.mxmlsn-co.workers.dev';
    const filePathMatch = url.match(/\/file\/bot[^/]+\/(.+)$/);
    let blob;
    if (filePathMatch) {
      const res = await fetch(proxyUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          service: 'telegram',
          token: STATE.botToken,
          path: `/file/${filePathMatch[1]}`,
          method: 'GET',
          binary: true,
          contentType: 'application/octet-stream'
        })
      });
      blob = await res.blob();
    } else {
      const res = await fetch(url);
      blob = await res.blob();
    }
    const pngBlob = await heic2any({ blob, toType: 'image/png', quality: 0.85 });
    const blobUrl = URL.createObjectURL(Array.isArray(pngBlob) ? pngBlob[0] : pngBlob);
    // Read real dimensions from converted image
    const dims = await new Promise(resolve => {
      const img = new Image();
      img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
      img.onerror = () => resolve({});
      img.src = blobUrl;
    });
    console.log('[HEIC] converted OK:', dims.width, 'x', dims.height);
    return { url: blobUrl, width: dims.width, height: dims.height };
  } catch(e) {
    console.error('[HEIC] conversion failed:', e);
    return { url };
  }
}

// Resolve a batch of items, using cache where possible
async function resolveImagesBatch(items, tgToken, cache) {
  const now = Date.now();
  const toFetch = [];
  const map = {};

  // Collect all fileIds that need resolution (main + album extras + HEIC thumbnails)
  const allFileIds = new Set();
  for (const item of items) {
    if (item.fileId) allFileIds.add(item.fileId);
    if (item.fileIds?.length > 1) {
      for (const fid of item.fileIds) if (fid) allFileIds.add(fid);
    }
    // Pre-resolve thumbnails for HEIC items so placeholder size is instant
    const fname = item.ai_data?.fileName || '';
    if (/\.heic$/i.test(fname) && item.ai_data?.thumbnailFileId) {
      allFileIds.add(item.ai_data.thumbnailFileId);
    }
  }

  const toFetchIds = [];
  const validTgUrl = u => u && /\/bot[^/]+\/.+\/.+/.test(u);
  for (const fid of allFileIds) {
    const cached = cache[fid];
    if (cached && (now - cached.ts < FILE_CACHE_TTL) && validTgUrl(cached.url)) {
      map[fid] = cached.url;
    } else {
      if (cached && !validTgUrl(cached.url)) delete cache[fid];
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

  // HEIC conversion: fire-and-forget, patches cards after page renders
  // Collect HEIC conversions for both standalone items and albumMedia entries
  const heicBatchItems = items.filter(it => {
    const fname = it.ai_data?.fileName || '';
    return /\.heic$/i.test(fname) && it._resolvedImg;
  });
  // Also collect album items that have HEIC in albumMedia
  const heicAlbumItems = items.filter(it =>
    it.albumMedia?.some(m => /\.heic$/i.test(m.fileName || '') && STATE.imageMap[m.fileId])
  );
  const heicItemsAll = [...new Set([...heicBatchItems, ...heicAlbumItems])];
  if (heicItemsAll.length > 0 && typeof heic2any !== 'undefined') {
    Promise.all(heicItemsAll.map(async it => {
      // Convert standalone HEIC
      const fname = it.ai_data?.fileName || '';
      if (/\.heic$/i.test(fname) && it._resolvedImg) {
        const { url: convUrl, width, height } = await maybeConvertHeic(it._resolvedImg, fname);
        if (convUrl !== it._resolvedImg) {
          it._resolvedImg = convUrl;
          map[it.fileId] = convUrl;
          STATE.imageMap[it.fileId] = convUrl;
          if (width && height) { it.ai_data = it.ai_data || {}; it.ai_data.imageWidth = width; it.ai_data.imageHeight = height; }
        }
      }
      // Convert HEIC entries inside albumMedia
      if (it.albumMedia) {
        for (const m of it.albumMedia) {
          const mfname = m.fileName || '';
          if (/\.heic$/i.test(mfname) && STATE.imageMap[m.fileId]) {
            const { url: convUrl, width, height } = await maybeConvertHeic(STATE.imageMap[m.fileId], mfname);
            if (convUrl !== STATE.imageMap[m.fileId]) {
              map[m.fileId] = convUrl;
              STATE.imageMap[m.fileId] = convUrl;
              if (width && height) { m.imageWidth = width; m.imageHeight = height; }
            }
          }
        }
      }
      return it;
    })).then(converted => patchCardImages(converted));
  }

  // SVG proxy: Telegram may serve SVGs with wrong content-type, so fetch through proxy.
  // Sync map → STATE.imageMap so proxySvgItems can see album entries' resolved URLs.
  Object.assign(STATE.imageMap, map);
  await proxySvgItems(items, map);

  return map;
}

// Patch already-rendered cards with resolved image URLs
function patchCardImages(items) {
  let hasVideoNotes = false;
  let hasSmallVideos = false;
  for (const item of items) {
    if (!item._resolvedImg) continue;
    const card = document.querySelector(`.card[data-id="${item.id}"]`);
    if (!card) continue;
    if (card.querySelector('.videonote-circle')) hasVideoNotes = true;
    const wasHeicPlaceholder = card.classList.contains('card-heic-placeholder');
    if (wasHeicPlaceholder) {
      // Mutate in-place: keep the card node so masonry doesn't reflow.
      // Swap classes, add img, wire up lightbox — no outerHTML replacement.
      const blobUrl = item._resolvedImg;
      const sourceUrl = item.sourceUrl || '';
      card.classList.remove('card-heic-placeholder');
      card.classList.add('card-image');
      // Keep aspect-ratio until img loads to prevent height collapse
      card.dataset.action = 'lightbox';
      card.dataset.img = blobUrl;
      card.dataset.url = sourceUrl;
      const downloadSvgHeic = `<svg viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.75)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>`;
      card.innerHTML = `<img class="card-img" src="${escapeHtml(blobUrl)}" alt="" style="opacity:0;transition:opacity 0.4s ease"><div class="img-hover-bar"><button class="img-download-btn" data-action="download" data-url="${escapeHtml(blobUrl)}">${downloadSvgHeic}</button></div>`;
      const img = card.querySelector('img');
      img.onload = () => {
        card.style.aspectRatio = '';  // release constraint only after img has size
        img.style.opacity = '1';
      };
      // Clean up data-thumb attrs
      delete card.dataset.thumbFid;
      delete card.dataset.thumbSized;
      continue;
    }
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
    // Check if new card has video notes or small autoplay videos
    if (!hasVideoNotes && newCard?.querySelector('.videonote-circle')) hasVideoNotes = true;
    if (!hasSmallVideos && newCard?.classList.contains('tgvideo-autoplay')) hasSmallVideos = true;
  }
  // Re-autoload video notes if any were re-rendered
  if (hasVideoNotes) autoloadVideoNotes();
  if (hasSmallVideos) autoloadSmallVideos();
  // Fix sizes for any newly rendered HEIC placeholders
  patchHeicPlaceholderSizes();
}

// Fix aspect-ratio of HEIC placeholders by loading their thumbnail
async function patchHeicPlaceholderSizes() {
  const placeholders = document.querySelectorAll('.card-heic-placeholder[data-thumb-fid]');
  if (!placeholders.length) return;
  for (const card of placeholders) {
    const thumbFid = card.dataset.thumbFid;
    if (!thumbFid || card.dataset.thumbSized) continue;
    card.dataset.thumbSized = '1';
    // Resolve thumbnail URL (may already be cached)
    let thumbUrl = STATE.imageMap[thumbFid];
    if (!thumbUrl) {
      thumbUrl = await resolveFileId(STATE.botToken, thumbFid);
      if (thumbUrl) STATE.imageMap[thumbFid] = thumbUrl;
    }
    if (!thumbUrl) continue;
    // Load thumbnail to get natural dimensions
    await new Promise(resolve => {
      const img = new Image();
      img.onload = () => {
        if (img.naturalWidth && img.naturalHeight) {
          card.style.aspectRatio = `${img.naturalWidth} / ${img.naturalHeight}`;
        }
        resolve();
      };
      img.onerror = resolve;
      img.src = thumbUrl;
    });
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
  document.getElementById('sp-chat-id').value = s.chatId || '';
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
    const chatId = document.getElementById('sp-chat-id').value.trim();
    const aiEnabled = document.getElementById('sp-ai-enabled').checked;
    const aiProvider = document.getElementById('sp-ai-provider').value;
    const aiApiKey = document.getElementById('sp-ai-key').value.trim();
    const aiModel = document.getElementById('sp-ai-model').value;
    const aiAutoOnSave = document.getElementById('sp-ai-onsave').checked;
    const aiAutoInViewer = document.getElementById('sp-ai-inviewer').checked;

    await new Promise(resolve =>
      chrome.storage.local.set(
        { notionToken, notionDbId, botToken, chatId, aiEnabled, aiProvider, aiApiKey, aiModel, aiAutoOnSave, aiAutoInViewer },
        resolve
      )
    );

    closeSettingsPanel();

    if (notionToken && notionDbId && botToken) {
      location.reload();
    }
  });

  document.getElementById('sp-disconnect-btn')?.addEventListener('click', disconnect);

  document.getElementById('sp-repair-btn')?.addEventListener('click', async () => {
    const btn = document.getElementById('sp-repair-btn');
    btn.disabled = true;
    btn.textContent = 'Repairing…';
    try {
      await runFullRepair();
    } catch (e) {
      console.error('[Repair] Error:', e);
      btn.textContent = 'Error';
      setTimeout(() => { btn.textContent = 'Repair data'; btn.disabled = false; }, 3000);
    }
  });
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
  // Strip all tags except safe ones (a, code, pre kept; b/i/u/s stripped but content preserved)
  return html
    .replace(/<\/?(?:b|i|u|s)\b[^>]*>/gi, '')
    .replace(/<(?!\/?(?:a|code|pre)\b)[^>]*>/gi, '')
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
    } else if (ext === 'svg') {
      imgUrl = item.content; // SVG original takes priority (like GIF)
    } else if (!imgUrl && ['jpg', 'jpeg', 'png', 'webp'].includes(ext)) {
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
  // image/gif/video/tgpost/video_note/voice/audio from TG keeps its base type — AI type cannot override it
  const KEEP_BASE_TYPES = ['image', 'gif', 'video', 'tgpost', 'video_note', 'voice', 'audio'];
  // Video notes always render as standalone circles (no tgpost card wrapper)
  const isVideoNoteTgpost = item.type === 'tgpost' && aiData.mediaType === 'video_note';
  const effectiveType = isVideoNoteTgpost ? 'video_note'
    : (item.type === 'document') ? 'document'
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

    // Direct TG video (no YouTube/Vimeo) — render as card-tgvideo (full-width thumb + play icon)
    const isTgDirectVideo = !ytMatch && !vimeoMatch && (item.fileId || item.videoFileId) && !/^https?:\/\//i.test(url);
    if (isTgDirectVideo) {
      const isLargeFile = (aiData.fileSize || 0) > 20 * 1024 * 1024;
      const isSmallVideo = !isLargeFile && (aiData.fileSize || 0) > 0 && (aiData.fileSize || 0) <= 5 * 1024 * 1024;
      console.log('[SmallVideo] render id=%s fileSize=%d isSmall=%s fid=...%s',
        item.id?.slice(0, 8), aiData.fileSize || 0, isSmallVideo,
        (item.videoFileId || item.fileId || '').slice(-20));
      const playbackFileId = item.videoFileId || item.fileId;
      const tgSourceUrlAttr = item.sourceUrl ? ` data-source-url="${escapeHtml(item.sourceUrl)}"` : '';
      const tgThumbUrl = imgUrl || '';
      const playIconSvg = `<svg viewBox="0 0 24 24" fill="white"><path d="M7 5.5C7 4.4 8.26 3.74 9.19 4.34l10.5 6.5a1.75 1.75 0 0 1 0 3.02l-10.5 6.5C8.26 20.96 7 20.3 7 19.2V5.5z"/></svg>`;
      // Small video inline element (muted autoplay loop, like video notes)
      const _userMuted = isSmallVideo && _getMutedVideoIds().has(playbackFileId);
      const smallVideoEl = isSmallVideo
        ? `<video class="tgvideo-inline" muted loop playsinline preload="none"></video>`
          + `<button class="tgvideo-toggle-btn" data-action="tgvideo-toggle" data-file-id="${escapeHtml(playbackFileId)}" title="Pause autoplay">`
          + `<svg class="tgvideo-icon-pause" viewBox="0 0 24 24" fill="white"><rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/></svg>`
          + `<svg class="tgvideo-icon-play" viewBox="0 0 24 24" fill="white"><path d="M7 5.5C7 4.4 8.26 3.74 9.19 4.34l10.5 6.5a1.75 1.75 0 0 1 0 3.02l-10.5 6.5C8.26 20.96 7 20.3 7 19.2V5.5z"/></svg>`
          + `</button>`
        : '';
      const smallVideoClass = isSmallVideo ? (' tgvideo-autoplay' + (_userMuted ? ' tgvideo-user-paused' : '')) : '';
      // Large file badge
      let tgVideoBadge = '';
      if (isLargeFile) {
        const sizeMB = Math.round((aiData.fileSize || 0) / 1024 / 1024);
        tgVideoBadge = aiData.storageUrl
          ? `<div class="video-badge video-badge-large">${sizeMB} MB · open in TG</div>`
          : `<div class="video-badge video-badge-large">${sizeMB} MB</div>`;
      }
      // Text + author from ai_data
      const tgVideoText = item.content || '';
      // forwardFrom only shown if sourceUrl exists (user has public username)
      // forwardUserUrl = profile link from ai_data; forwardFrom only shown if linkable
      const tgVideoUserUrl = aiData.forwardUserUrl || '';
      const tgVideoAuthor = aiData.channelTitle || aiData.forwardFrom || '';
      const tgVideoBodyHtml = tgVideoText.trim()
        ? `<div class="tgpost-body"><div class="quote-text">${escapeHtml(tgVideoText.length > 700 ? tgVideoText.slice(0, 700) : tgVideoText)}</div></div>`
        : '';
      const tgVideoLabelUrl = tgVideoUserUrl || item.sourceUrl || '';
      const tgVideoFooterHtml = tgVideoAuthor
        ? `<div class="quote-footer"><div class="tg-footer-left">${tgVideoLabelUrl ? TG_ICON_SVG : ''}${tgVideoLabelUrl ? `<a class="quote-source-link" data-action="open" data-url="${escapeHtml(tgVideoLabelUrl)}">${escapeHtml(tgVideoAuthor)}</a>` : `<span class="quote-source-link" data-action="stop">${escapeHtml(tgVideoAuthor)}</span>`}</div></div>`
        : '';
      const hasExtras = tgVideoBodyHtml || tgVideoFooterHtml;
      if (hasExtras) {
        // Render as tgpost-style card with video + text + author
        return `<div class="card card-tgpost tgpost-bg-video${smallVideoClass}" data-id="${item.id}" data-action="video-play" data-file-id="${escapeHtml(playbackFileId)}"${tgSourceUrlAttr}>
          ${pendingDot}
          ${tgVideoBadge}
          ${tgThumbUrl
            ? `<div class="tgpost-video-preview" data-action="video-play" data-file-id="${escapeHtml(playbackFileId)}">
                <img class="video-glow" src="${escapeHtml(tgThumbUrl)}" loading="lazy" alt="" aria-hidden="true">
                <img class="card-img" src="${escapeHtml(tgThumbUrl)}" loading="lazy" alt="">
                ${smallVideoEl}
                <div class="tgpost-play-icon">${playIconSvg}</div>
              </div>`
            : `<div class="tgpost-video-preview" data-action="video-play" data-file-id="${escapeHtml(playbackFileId)}">
                ${smallVideoEl}
                <div class="tgpost-play-icon" style="position:relative;top:auto;left:auto;transform:none;margin:16px auto">${playIconSvg}</div>
              </div>`}
          ${tgVideoBodyHtml}
          ${tgVideoFooterHtml}
        </div>`;
      }
      // No text/author — plain card-tgvideo
      return tgThumbUrl
        ? `<div class="card card-tgvideo${smallVideoClass}" data-id="${item.id}" data-action="video-play" data-file-id="${escapeHtml(playbackFileId)}"${tgSourceUrlAttr}>
          ${pendingDot}
          ${tgVideoBadge}
          <img class="video-glow" src="${escapeHtml(tgThumbUrl)}" loading="lazy" alt="" aria-hidden="true">
          <img class="card-img" src="${escapeHtml(tgThumbUrl)}" loading="lazy" alt="">
          ${smallVideoEl}
          <div class="tgpost-play-icon">${playIconSvg}</div>
        </div>`
        : `<div class="card card-tgvideo${smallVideoClass}" data-id="${item.id}" data-action="video-play" data-file-id="${escapeHtml(playbackFileId)}"${tgSourceUrlAttr}>
          ${pendingDot}
          ${tgVideoBadge}
          ${smallVideoEl}
          <div class="tgpost-play-icon" style="position:relative;top:auto;left:auto;transform:none;margin:40px auto">${playIconSvg}</div>
        </div>`;
    }

    // External video (YouTube/Vimeo/other links)
    const cardAction = 'open';
    const cardUrl = url;
    const domainLabel = domain;

    const videoBadge = '<div class="video-badge video-badge-external">external</div>';
    const sourceUrlAttr = item.sourceUrl ? ` data-source-url="${escapeHtml(item.sourceUrl)}"` : '';
    return `<div class="card card-video" data-id="${item.id}" data-action="${cardAction}" data-url="${escapeHtml(cardUrl)}"${sourceUrlAttr}>
      ${pendingDot}
      ${videoBadge}
      <div class="video-header">
        ${faviconUrl ? `<img class="video-favicon" src="${escapeHtml(faviconUrl)}" alt="" onerror="this.style.display='none'">` : ''}
        <span class="video-domain">${escapeHtml(domainLabel)}</span>
        <button class="video-share-btn" data-action="${cardAction}" data-url="${escapeHtml(cardUrl)}" title="Open">${shareIcon}</button>
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
      // Strip trailing .00 or ,00 (zero cents)
      const cleanNum = num.replace(/[.,]00$/, '');
      formattedPrice = sym + cleanNum;
    }
    const colorKey = aiData.color_subject || aiData.color_top3?.[0] || aiData.color_palette || 'violet';
    const theme = PRODUCT_PALETTE[colorKey] || PRODUCT_PALETTE.purple;
    const notchSvg = `<svg viewBox="-3 -3 101.0078 43.6777" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M47.5039 0C55.1408 0 61.3925 5.93081 61.9063 13.4374C61.944 13.9883 62.3881 14.4375 62.9404 14.4375H83.3887C89.8059 14.4377 95.0078 19.6404 95.0078 26.0576C95.0078 32.4749 89.8059 37.6775 83.3887 37.6777H11.6201C5.20275 37.6777 2.11322e-05 32.475 0 26.0576C0 19.6402 5.20274 14.4375 11.6201 14.4375H32.0674C32.6197 14.4375 33.0638 13.9883 33.1015 13.4373C33.6153 5.93083 39.8671 4.64136e-05 47.5039 0Z" fill="#080808" stroke="${theme.border}" stroke-width="4"/>
    </svg>`;
    return `<div class="card card-product-new" data-id="${item.id}" data-action="open" data-url="${escapeHtml(url)}" style="background:${theme.bg};border-color:${theme.border}">
      ${pendingDot}
      <div class="product-new-notch">${notchSvg}</div>
      <div class="product-new-header">
        ${rawPrice ? `<div class="product-new-price" style="color:${theme.accent}">${escapeHtml(formattedPrice)}</div>` : (domain ? `<div class="product-new-domain" style="color:${theme.accent}">${escapeHtml(domain)}</div>` : '')}
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
    const vnSourceUrl = item.sourceUrl || '';
    // forwardUserUrl = profile link from ai_data; forwardFrom only shown if linkable
    const vnUserUrl = aiData.forwardUserUrl || '';
    const authorLabel = aiData.forwardFrom || aiData.channelTitle || '';
    const authorLinkUrl = vnUserUrl || vnSourceUrl;
    const authorHtml = authorLabel
      ? (authorLinkUrl
        ? `<a class="videonote-author" data-action="open" data-url="${escapeHtml(authorLinkUrl)}">${escapeHtml(authorLabel)}</a>`
        : `<span class="videonote-author">${escapeHtml(authorLabel)}</span>`)
      : '';
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
      ${vnTranscriptHtml}
      ${authorHtml}
    </div>`;
  }

  // ── Voice message card ──
  if (effectiveType === 'voice') {
    const voiceFileId = item.audioFileId || item.fileId;
    const voiceSourceUrl = item.sourceUrl || '';
    // forwardUserUrl = profile link from ai_data; forwardFrom only shown if linkable
    const voiceUserUrl = aiData.forwardUserUrl || '';
    const authorLabel = aiData.forwardFrom || aiData.channelTitle || '';
    const duration = aiData.audioDuration || 0;
    const durationStr = duration > 0 ? `${Math.floor(duration / 60)}:${String(duration % 60).padStart(2, '0')}` : '';
    const authorLinkUrl = voiceUserUrl || voiceSourceUrl;
    const authorHtml = (authorLabel && authorLinkUrl)
      ? `<a class="voice-author" data-action="open" data-url="${escapeHtml(authorLinkUrl)}">${escapeHtml(authorLabel)}</a>`
      : '';
    const voiceTranscript = aiData.transcript || '';
    const voiceTranscriptBtn = voiceTranscript
      ? `<button class="transcript-btn" data-action="toggle-transcript">Aa</button>`
      : '';
    const voiceTranscriptHtml = voiceTranscript
      ? `<div class="transcript-text hidden">${escapeHtml(voiceTranscript)}</div>`
      : '';
    const voiceFooterHtml = authorLabel
      ? `<div class="quote-footer" style="padding:0 14px 10px"><div class="tg-footer-left">${authorLinkUrl ? TG_ICON_SVG : ''}<span class="quote-source-link">${escapeHtml(authorLabel)}</span></div></div>`
      : '';
    return `<div class="card card-voice" data-id="${item.id}">
      ${pendingDot}
      ${voiceTranscriptBtn}
      <div class="voice-player" data-action="voice-play" data-file-id="${escapeHtml(voiceFileId)}">
        <button class="voice-play-btn"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M7 5.5C7 4.4 8.26 3.74 9.19 4.34l10.5 6.5a1.75 1.75 0 0 1 0 3.02l-10.5 6.5C8.26 20.96 7 20.3 7 19.2V5.5z"/></svg></button>
        <div class="voice-waveform"><div class="voice-progress"></div></div>
        <span class="voice-duration">${durationStr}</span>
      </div>
      ${voiceTranscriptHtml}
      ${voiceFooterHtml}
    </div>`;
  }

  // ── Audio file card (mp3, wav) ──
  if (effectiveType === 'audio') {
    const audioFileId = item.audioFileId || item.fileId;
    const title = aiData.audioTitle || aiData.audioFileName || item.content || 'Audio';
    const performer = aiData.audioPerformer || '';
    const duration = aiData.audioDuration || 0;
    const durationStr = duration > 0 ? `${Math.floor(duration / 60)}:${String(duration % 60).padStart(2, '0')}` : '';
    const coverUrl = imgUrl || '';
    const audioSourceUrl = item.sourceUrl || '';
    // forwardUserUrl = profile link from ai_data; forwardFrom only shown if linkable
    const audioUserUrl = aiData.forwardUserUrl || '';
    const authorLabel = aiData.forwardFrom || aiData.channelTitle || '';
    const authorLinkUrl = audioUserUrl || audioSourceUrl;
    const authorHtml = (authorLabel && authorLinkUrl)
      ? `<a class="audio-source" data-action="open" data-url="${escapeHtml(authorLinkUrl)}">${escapeHtml(authorLabel)}</a>`
      : '';
    const audioAccent = getAccentColor(aiData.color_subject, '#18bb3e');
    const hasCoverClass = coverUrl ? ' audio-has-cover' : '';
    const audioFooterHtml = authorLabel
      ? `<div class="quote-footer" style="padding:0 14px 10px"><div class="tg-footer-left">${authorLinkUrl ? TG_ICON_SVG : ''}<span class="quote-source-link">${escapeHtml(authorLabel)}</span></div></div>`
      : '';
    return `<div class="card card-audio${hasCoverClass}" data-id="${item.id}" style="--audio-accent:${audioAccent}">
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
      ${audioFooterHtml}
    </div>`;
  }

  // ── PDF card (base type OR AI-detected) ──
  if (item.type === 'pdf' || effectiveType === 'pdf') {
    const pdfUrl = item.sourceUrl || item.url || '';
    const pdfFid = item.pdfFileId || item.fileId;
    const hasTgFile = pdfFid && !/^https?:\/\//i.test(pdfUrl);
    const pdfTextContent = item.content || '';
    const pdfAuthorLabel = aiData.channelTitle || aiData.forwardFrom || '';
    const pdfLabelUrl = aiData.forwardUserUrl || item.sourceUrl || '';
    // Use content as title only if there's no separate text body (i.e. content IS the filename)
    const pdfTitle = toTitleCase(aiData.title || (!pdfTextContent.includes(' ') ? pdfTextContent : '') || pdfUrl.split('?')[0].split('/').pop() || 'document.pdf');
    // Show preview: for TG files only if thumbnail differs from PDF fileId; for URL-based PDFs always show imgUrl
    const hasPdfThumb = hasTgFile ? (item.fileId && item.pdfFileId && item.fileId !== item.pdfFileId) : !!imgUrl;
    const pdfHeavyArrow = aiData.storageUrl
      ? `<svg class="pdf-badge-arrow" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M7 17L17 7"/><path d="M7 7h10v10"/></svg>`
      : '';
    const previewHtml = (hasPdfThumb && imgUrl)
      ? `<div class="pdf-blur-wrap"><img class="pdf-blur-img" src="${escapeHtml(imgUrl)}" loading="lazy" alt=""><div class="pdf-badge"><span class="pdf-badge-text">pdf</span>${pdfHeavyArrow}</div></div>`
      : `<div style="padding:16px 16px 0"><div class="pdf-badge" style="position:relative;top:auto;left:auto;display:inline-block"><span class="pdf-badge-text">pdf</span>${pdfHeavyArrow}</div></div>`;
    const cardAction = hasTgFile ? 'open-file' : 'open';
    const cardDataUrl = hasTgFile ? '' : pdfUrl;
    const pdfSourceAttr = item.sourceUrl ? ` data-source-url="${escapeHtml(item.sourceUrl)}"` : '';
    // Text body (caption) — show if content looks like actual text (has spaces), not just a filename
    const pdfBodyHtml = (pdfTextContent && pdfTextContent.includes(' '))
      ? `<div class="tgpost-body"><div class="quote-text">${escapeHtml(pdfTextContent.length > 700 ? pdfTextContent.slice(0, 700) : pdfTextContent)}</div></div>`
      : '';
    // Author footer
    const pdfFooterHtml = pdfAuthorLabel
      ? `<div class="quote-footer"><div class="tg-footer-left">${pdfLabelUrl ? TG_ICON_SVG : ''}<span class="quote-source-link">${escapeHtml(pdfAuthorLabel)}</span></div></div>`
      : '';
    return `<div class="card card-pdf" data-id="${item.id}" data-action="${cardAction}" data-url="${escapeHtml(cardDataUrl)}"${hasTgFile ? ` data-file-id="${escapeHtml(pdfFid)}"` : ''}${pdfSourceAttr}>
      ${pendingDot}
      ${previewHtml}
      <div class="pdf-title">${escapeHtml(pdfTitle)}</div>
      ${pdfBodyHtml}
      ${pdfFooterHtml}
    </div>`;
  }

  // ── Document file card (.psd, .ai, .zip etc) ──
  if (effectiveType === 'document') {
    const docFileName = aiData.fileName || item.content || 'file';
    const docExt = docFileName.includes('.') ? docFileName.split('.').pop() : '';
    const docBaseName = docExt ? docFileName.slice(0, -(docExt.length + 1)) : docFileName;
    const iconColor = getFileIconColor(docExt);
    const storageUrl = aiData.storageUrl || '';
    const docSourceUrl = item.sourceUrl || '';
    const docOpenUrl = storageUrl || docSourceUrl;
    const docAction = docOpenUrl ? 'open' : (item.fileId ? 'open-file' : '');
    const docActionUrl = docOpenUrl || '';
    const sourceUrlAttr = item.sourceUrl ? ` data-source-url="${escapeHtml(item.sourceUrl)}"` : '';
    const fileSheetHtml = makeFileSheetHtml(iconColor, docExt.toLowerCase(), docBaseName);
    return `<div class="card card-document" data-id="${item.id}"${docAction ? ` data-action="${docAction}"` : ''}${docActionUrl ? ` data-url="${escapeHtml(docActionUrl)}"` : ''}${item.fileId ? ` data-file-id="${escapeHtml(item.fileId)}"` : ''}${sourceUrlAttr}>
      ${pendingDot}
      ${fileSheetHtml}
    </div>`;
  }

  // ── Telegram Post card (dark theme, modular) ──
  if (item.type === 'tgpost') {
    const sourceUrl = item.sourceUrl || itemUrlAsLink || '';
    // forwardUserUrl = t.me/username (stored in ai_data by bot)
    const forwardUserUrl = aiData.forwardUserUrl || '';
    // forwardFrom always shown as label (clickable if forwardUserUrl exists, plain text otherwise)
    const forwardLabel = aiData.forwardFrom || '';
    const rawTgLabel = aiData.channelTitle || forwardLabel || domain;
    const tgLabel = (rawTgLabel && rawTgLabel !== 'telegram' && !/^t\.me$/i.test(rawTgLabel)) ? rawTgLabel : '';
    // Short-circuit: single image tgpost with no text → render as plain card-image
    const albumMedia = item.albumMedia || [];

    // For standalone document posts item.content is the filename — don't show as message text
    // But real user captions should always be shown
    const isStandaloneDoc = !albumMedia.length && aiData.mediaType === 'document';
    const contentMatchesFileName = aiData.fileName && item.content && item.content.trim() === aiData.fileName.trim();
    const isDocumentContent = (isStandaloneDoc && contentMatchesFileName)
      || contentMatchesFileName;
    const textContent = isDocumentContent ? '' : (item.content || '');
    const isSingleImage = !albumMedia.length && imgUrl
      && (!aiData.mediaType || aiData.mediaType === 'image')
      && !textContent.trim();
    const externalDomainCheck = getDomain(sourceUrl);
    const hasExternalLink = externalDomainCheck && !/^(t\.me|telegram)/i.test(externalDomainCheck);
    if (isSingleImage && !hasExternalLink) {
      const imgDomain = getDomain(sourceUrl);
      const downloadSvg = `<svg viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.75)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>`;
      const domainBtn = (sourceUrl && imgDomain)
        ? `<button class="img-domain-btn" data-action="open" data-url="${escapeHtml(sourceUrl)}">${escapeHtml(imgDomain)}</button>`
        : '';
      const downloadBtn = `<button class="img-download-btn" data-action="download" data-url="${escapeHtml(imgUrl)}">${downloadSvg}</button>`;
      const isSvgCard = imgUrl.split('?')[0].split('#')[0].toLowerCase().endsWith('.svg')
        || /\.svg$/i.test(aiData.fileName || '');
      const svgClass = isSvgCard ? ' card-svg' : '';
      return `<div class="card card-image${svgClass}" data-id="${item.id}" data-action="lightbox" data-img="${escapeHtml(imgUrl)}" data-url="${escapeHtml(sourceUrl)}">
        ${pendingDot}
        <img class="card-img" src="${escapeHtml(imgUrl)}" loading="lazy" alt="">
        <div class="img-hover-bar">${domainBtn}${downloadBtn}</div>
      </div>`;
    }

    // Short-circuit: inline TG video with no text → render as plain video card
    const isSingleVideo = !albumMedia.length && (aiData.mediaType === 'video' || item.videoFileId) && item.fileId && !textContent.trim() && !hasExternalLink;
    if (isSingleVideo) {
      const thumbUrl = imgUrl || '';
      const vfId = item.videoFileId || item.fileId;
      const isSmallSingle = (aiData.fileSize || 0) > 0 && (aiData.fileSize || 0) <= 5 * 1024 * 1024;
      const _userMutedSingle = isSmallSingle && _getMutedVideoIds().has(vfId);
      const smallSingleClass = isSmallSingle ? (' tgvideo-autoplay' + (_userMutedSingle ? ' tgvideo-user-paused' : '')) : '';
      const smallSingleEl = isSmallSingle
        ? `<video class="tgvideo-inline" muted loop playsinline preload="none"></video>`
          + `<button class="tgvideo-toggle-btn" data-action="tgvideo-toggle" data-file-id="${escapeHtml(vfId)}" title="Pause autoplay">`
          + `<svg class="tgvideo-icon-pause" viewBox="0 0 24 24" fill="white"><rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/></svg>`
          + `<svg class="tgvideo-icon-play" viewBox="0 0 24 24" fill="white"><path d="M7 5.5C7 4.4 8.26 3.74 9.19 4.34l10.5 6.5a1.75 1.75 0 0 1 0 3.02l-10.5 6.5C8.26 20.96 7 20.3 7 19.2V5.5z"/></svg>`
          + `</button>`
        : '';
      console.log('[SmallVideo] render-single id=%s fileSize=%d isSmall=%s fid=...%s',
        item.id?.slice(0, 8), aiData.fileSize || 0, isSmallSingle, vfId?.slice(-20));
      const playIconSvg = `<svg viewBox="0 0 24 24" fill="white"><path d="M7 5.5C7 4.4 8.26 3.74 9.19 4.34l10.5 6.5a1.75 1.75 0 0 1 0 3.02l-10.5 6.5C8.26 20.96 7 20.3 7 19.2V5.5z"/></svg>`;
      return thumbUrl
        ? `<div class="card card-tgvideo${smallSingleClass}" data-id="${item.id}" data-action="video-play" data-file-id="${escapeHtml(vfId)}" data-source-url="${escapeHtml(sourceUrl)}">
          ${pendingDot}
          <img class="card-img" src="${escapeHtml(thumbUrl)}" loading="lazy" alt="">
          ${smallSingleEl}
          <div class="tgpost-play-icon">${playIconSvg}</div>
        </div>`
        : `<div class="card card-tgvideo${smallSingleClass}" data-id="${item.id}" data-action="video-play" data-file-id="${escapeHtml(vfId)}" data-source-url="${escapeHtml(sourceUrl)}">
          ${pendingDot}
          ${smallSingleEl}
          <div class="tgpost-play-icon" style="position:relative;top:auto;left:auto;transform:none;margin:40px auto">${playIconSvg}</div>
        </div>`;
    }

    // Short-circuit: tgpost with PDF → render as card-pdf with text+author below
    if (aiData.mediaType === 'pdf' && (item.pdfFileId || item.fileId)) {
      const pdfFid = item.pdfFileId || item.fileId;
      const pdfThumbUrl = imgUrl || '';
      const pdfArrowSvg = `<svg class="pdf-badge-arrow" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M7 17L17 7"/><path d="M7 7h10v10"/></svg>`;
      const pdfArrow = aiData.storageUrl ? pdfArrowSvg : '';
      const pdfTitle = toTitleCase(aiData.title || aiData.fileName || '');
      const pdfPreviewHtml = pdfThumbUrl
        ? `<div class="pdf-blur-wrap"><img class="pdf-blur-img" src="${escapeHtml(pdfThumbUrl)}" loading="lazy" alt=""><div class="pdf-badge"><span class="pdf-badge-text">pdf</span>${pdfArrow}</div></div>`
        : `<div style="padding:16px 16px 0"><div class="pdf-badge" style="position:relative;top:auto;left:auto;display:inline-block"><span class="pdf-badge-text">pdf</span>${pdfArrow}</div></div>`;
      // Sanitize HTML in text (links, bold, italic etc)
      const pdfIsHtml = aiData.htmlContent || /<(?:a\s+href=|b>|i>|u>|s>|code>)/.test(textContent);
      const pdfDisplayText = textContent.length > 700 ? textContent.slice(0, 700) : textContent;
      const pdfDisplayHtml = pdfIsHtml ? sanitizeHtml(pdfDisplayText) : escapeHtml(pdfDisplayText);
      const hasPdfText = !!textContent.trim();
      const pdfBodyHtml = hasPdfText
        ? `<div class="tgpost-body pdf-text-collapsible"><div class="quote-text">${pdfDisplayHtml}</div></div>`
        : '';
      // Author footer — clickable, opens source post (not the PDF)
      const pdfFooterHtml = tgLabel
        ? `<div class="quote-footer pdf-text-collapsible"><div class="tg-footer-left">${(forwardUserUrl || sourceUrl) ? TG_ICON_SVG : ''}${sourceUrl ? `<a class="quote-source-link" data-action="open" data-url="${escapeHtml(sourceUrl)}">${escapeHtml(tgLabel)}</a>` : `<span class="quote-source-link">${escapeHtml(tgLabel)}</span>`}</div></div>`
        : '';
      // Toggle button (collapse/expand text) — only when text exists
      const pdfTextCollapsed = !!(aiData.pdf_text_collapsed);
      const pdfCollapsedClass = pdfTextCollapsed ? ' pdf-text-hidden' : '';
      const pdfToggleIcon = pdfTextCollapsed
        ? `<svg width="14" height="14" viewBox="0 0 14 14"><circle cx="7" cy="7" r="5" stroke="rgba(255,255,255,0.4)" stroke-width="1.5" fill="none"/></svg>`
        : `<svg width="14" height="14" viewBox="0 0 14 14"><line x1="2" y1="7" x2="12" y2="7" stroke="rgba(255,255,255,0.4)" stroke-width="1.5" stroke-linecap="round"/></svg>`;
      const pdfToggleBtn = hasPdfText
        ? `<button class="pdf-text-toggle" data-action="toggle-pdf-text">${pdfToggleIcon}</button>`
        : '';
      return `<div class="card card-pdf${pdfCollapsedClass}" data-id="${item.id}" data-action="open-file" data-file-id="${escapeHtml(pdfFid)}" data-source-url="${escapeHtml(sourceUrl)}">
        ${pendingDot}
        ${pdfToggleBtn}
        ${pdfPreviewHtml}
        ${pdfTitle ? `<div class="pdf-title">${escapeHtml(pdfTitle)}</div>` : ''}
        ${pdfBodyHtml}
        ${pdfFooterHtml}
      </div>`;
    }

    const isHtml = aiData.htmlContent || /<(?:a\s+href=|b>|i>|u>|s>|code>)/.test(textContent);
    const isTruncated = textContent.length > 700;
    const displayText = isTruncated ? textContent.slice(0, 700) : textContent;
    const truncatedClass = isTruncated ? ' truncated' : '';
    const displayHtml = isHtml ? sanitizeHtml(displayText) : escapeHtml(displayText);

    // Detect YouTube/Vimeo links
    const allText = sourceUrl + ' ' + textContent;
    const tgYtMatch = allText.match(/(?:youtube\.com\/watch\?.*v=|youtu\.be\/|youtube\.com\/shorts\/)([a-zA-Z0-9_-]{11})/);
    const tgVimeoMatch = !tgYtMatch && allText.match(/vimeo\.com\/(?:.*\/)?(\d+)/);

    // Background class by media type
    const mt = aiData.mediaType;
    const hasPrice = !!aiData.price;
    const hasYtOrVimeo = !!(tgYtMatch || tgVimeoMatch);
    const bgClass = hasPrice ? ' tgpost-paid'
      : mt === 'voice' ? ' tgpost-bg-voice'
      : mt === 'audio' ? (imgUrl ? ' tgpost-bg-audio-cover' : ' tgpost-bg-audio')
      : (mt === 'video' || mt === 'video_note' || hasYtOrVimeo) ? ' tgpost-bg-video'
      : mt === 'pdf' ? ' tgpost-bg-pdf'
      : '';

    // Link header (external URL, not t.me) — suppress for YouTube/Vimeo (rendered in media section)
    const externalDomain = getDomain(sourceUrl);
    const isExternalLink = externalDomain && !/^(t\.me|telegram)/i.test(externalDomain);
    const arrowIcon = `<svg viewBox="0 0 36.738 36.7375" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M16.9528 14.1284C18.5149 12.5663 21.047 12.5663 22.6091 14.1284C24.1712 15.6905 24.1712 18.2226 22.6091 19.7847L6.82782 35.5659C5.26573 37.128 2.73367 37.128 1.17157 35.5659C-0.390524 34.0038 -0.390524 31.4718 1.17157 29.9097L16.9528 14.1284Z" fill="white"/><path d="M28.738 29.9131V9C28.738 8.44788 28.29 8.00026 27.738 8H6.82489C4.61575 8 2.82489 6.20914 2.82489 4C2.82489 1.79086 4.61575 0 6.82489 0H27.738C32.7083 0.00026285 36.738 4.0296 36.738 9V29.9131C36.7377 32.1218 34.9467 33.9128 32.738 33.9131C30.529 33.9131 28.7382 32.122 28.738 29.9131Z" fill="white"/></svg>`;
    const showLinkHeader = isExternalLink && !tgYtMatch && !tgVimeoMatch;
    const linkHeaderHtml = showLinkHeader ? `<div class="tgpost-link-header">
      <img class="tgpost-link-favicon" src="https://www.google.com/s2/favicons?domain=${encodeURIComponent(externalDomain)}&sz=64" alt="" onerror="this.style.display='none'">
      <span class="tgpost-link-domain">${escapeHtml(externalDomain)}</span>
      <button class="tgpost-share-btn" data-action="open" data-url="${escapeHtml(sourceUrl)}">${arrowIcon}</button>
    </div>` : '';

    // Album (multiple media)
    // albumMedia already declared above in short-circuit check
    const isAlbum = albumMedia.length > 1;
    let mediaHtml = '';
    if (isAlbum) {
      const audioTracks = albumMedia.filter(m => m.mediaType === 'audio');
      if (audioTracks.length > 1) {
        const miniPlayers = audioTracks.map(m => {
          const aFid = m.audioFileId || m.fileId;
          const title = m.audioTitle || m.audioFileName || m.audioContent || 'Audio';
          const performer = m.audioPerformer || '';
          const dur = m.audioDuration || 0;
          const durStr = dur > 0 ? `${Math.floor(dur / 60)}:${String(dur % 60).padStart(2, '0')}` : '';
          const coverUrl = m.coverFileId ? (STATE.imageMap[m.coverFileId] || '') : '';
          const coverHtml = coverUrl
            ? `<img class="mini-audio-cover" src="${escapeHtml(coverUrl)}" loading="lazy" alt="">`
            : '';
          const hasCoverClass = coverUrl ? ' has-cover' : '';
          return `<div class="mini-audio-player audio-player" data-action="audio-play" data-file-id="${escapeHtml(aFid)}">
            <button class="mini-audio-btn${hasCoverClass}">
              ${coverHtml}
              <svg class="mini-audio-play-icon" viewBox="0 0 24 24" fill="currentColor"><path d="M7 5.5C7 4.4 8.26 3.74 9.19 4.34l10.5 6.5a1.75 1.75 0 0 1 0 3.02l-10.5 6.5C8.26 20.96 7 20.3 7 19.2V5.5z"/></svg>
            </button>
            <div class="mini-audio-info">
              <div class="mini-audio-label">${escapeHtml(title)}${performer ? ' — ' + escapeHtml(performer) : ''}</div>
              <div class="audio-progress-wrap"><div class="audio-progress"></div></div>
            </div>
            <span class="audio-time">${durStr}</span>
          </div>`;
        }).join('');
        mediaHtml = `<div class="audio-album-list">${miniPlayers}</div>`;
      } else {
      const albumItems = albumMedia.map((m, mi) => {
        const resolvedUrl = STATE.imageMap[m.fileId] || '';
        if (/\.svg$/i.test(m.fileName || '')) console.log('[SVG] RENDER album[%d] fid=%s fname=%s url=%s isBlob=%s', mi, m.fileId?.slice(-20), m.fileName, resolvedUrl.slice(0, 80), resolvedUrl.startsWith('blob:'));
        if (m.mediaType === 'pdf') {
          const pdfFid = m.pdfFileId || m.fileId;
          const hasThumbnail = m.fileId && m.pdfFileId && m.fileId !== m.pdfFileId;
          const previewUrl = hasThumbnail ? resolvedUrl : '';
          const albumPdfArrowSvg = `<svg class="pdf-badge-arrow" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M7 17L17 7"/><path d="M7 7h10v10"/></svg>`;
          const albumPdfArrow = aiData.storageUrl ? albumPdfArrowSvg : '';
          return previewUrl
            ? `<div class="tgpost-album-item is-pdf" data-action="open-file" data-file-id="${escapeHtml(pdfFid)}"><img class="tgpost-album-img blur-preview" src="${escapeHtml(previewUrl)}" loading="lazy" alt=""><div class="pdf-badge"><span class="pdf-badge-text">pdf</span>${albumPdfArrow}</div></div>`
            : `<div class="tgpost-album-item is-pdf" data-action="open-file" data-file-id="${escapeHtml(pdfFid)}"><div class="tgpost-album-img" style="background:#1a1a1a;display:flex;align-items:center;justify-content:center"><div class="pdf-badge" style="position:relative;top:auto;left:auto;transform:none"><span class="pdf-badge-text">pdf</span>${albumPdfArrow}</div></div></div>`;
        }
        if (m.mediaType === 'video') {
          const playFileId = m.videoFileId || m.fileId;
          return resolvedUrl
            ? `<div class="tgpost-album-item is-video" data-action="album-gallery" data-gallery-type="video" data-file-id="${escapeHtml(playFileId)}" data-thumb="${escapeHtml(resolvedUrl)}"><img class="tgpost-album-img" src="${escapeHtml(resolvedUrl)}" loading="lazy" alt=""><div class="tgpost-play-icon"><svg viewBox="0 0 24 24" fill="white"><path d="M7 5.5C7 4.4 8.26 3.74 9.19 4.34l10.5 6.5a1.75 1.75 0 0 1 0 3.02l-10.5 6.5C8.26 20.96 7 20.3 7 19.2V5.5z"/></svg></div></div>`
            : `<div class="tgpost-album-item is-video" data-action="album-gallery" data-gallery-type="video" data-file-id="${escapeHtml(playFileId)}"><div class="tgpost-album-img" style="background:#1a1a1a;display:flex;align-items:center;justify-content:center"><div class="tgpost-play-icon" style="position:relative;top:auto;left:auto;transform:none"><svg viewBox="0 0 24 24" fill="white"><path d="M7 5.5C7 4.4 8.26 3.74 9.19 4.34l10.5 6.5a1.75 1.75 0 0 1 0 3.02l-10.5 6.5C8.26 20.96 7 20.3 7 19.2V5.5z"/></svg></div></div></div>`;
        }
        if (m.mediaType === 'document') {
          const docFname = m.fileName || m.fileContent || '';
          const docExt = docFname.includes('.') ? docFname.split('.').pop() : '';
          const docBaseName = docExt ? docFname.slice(0, -(docExt.length + 1)) : docFname;
          const docColor = getFileIconColor(docExt);
          const docStorageUrl = m.storageUrl || aiData.storageUrl || '';
          const docAction = docStorageUrl ? `data-action="open" data-url="${escapeHtml(docStorageUrl)}"` : (m.fileId ? `data-action="open-file" data-file-id="${escapeHtml(m.fileId)}"` : '');
          return `<div class="tgpost-album-item is-document" ${docAction}><div class="tgpost-album-img tgpost-album-doc"><div class="album-doc-icon">${makeFileSheetHtml(docColor, docExt.toLowerCase(), docBaseName)}</div></div></div>`;
        }
        if (resolvedUrl) {
          const isHeicAlbum = /\.heic$/i.test(m.fileName || '');
          const isHeicConverted = resolvedUrl.startsWith('blob:');
          if (isHeicAlbum && !isHeicConverted) {
            return `<div class="tgpost-album-item tgpost-album-heic-placeholder"><div class="tgpost-album-img tgpost-album-heic-inner"><span class="heic-label">HEIC</span><span class="heic-converting">converting…</span></div></div>`;
          }
          return `<div class="tgpost-album-item" data-action="album-gallery" data-gallery-type="image" data-img="${escapeHtml(resolvedUrl)}"><img class="tgpost-album-img" src="${escapeHtml(resolvedUrl)}" loading="lazy" alt=""></div>`;
        }
        const isHeicAlbumNoUrl = /\.heic$/i.test(m.fileName || '');
        if (isHeicAlbumNoUrl) {
          return `<div class="tgpost-album-item tgpost-album-heic-placeholder"><div class="tgpost-album-img tgpost-album-heic-inner"><span class="heic-label">HEIC</span><span class="heic-converting">converting…</span></div></div>`;
        }
        return `<div class="tgpost-album-item"><div class="tgpost-album-img" style="background:#1a1a1a"></div></div>`;
      }).filter(Boolean);
      if (albumItems.length > 0) {
        const cols = albumItems.length > 4 ? 3 : 2;
        const remainder = albumItems.length % cols;
        if (remainder !== 0) {
          const spanCols = cols - remainder + 1;
          const lastIdx = albumItems.length - 1;
          albumItems[lastIdx] = albumItems[lastIdx].replace(
            /^<div class="tgpost-album-item/,
            `<div style="grid-column:span ${spanCols}" class="tgpost-album-item album-span-${spanCols}`
          );
        }
        const colClass = albumItems.length > 4 ? ' album-3col' : '';
        mediaHtml = `<div class="tgpost-album${colClass}">${albumItems.join('')}</div>`;
      }
      }
    } else if (aiData.mediaType === 'pdf' && (item.pdfFileId || item.fileId)) {
      // Reuse same structure as standalone card-pdf
      const pdfFid = item.pdfFileId || item.fileId;
      // Thumbnail: use imgUrl if available (resolved from fileId), or check if fileId differs from pdfFileId
      const pdfThumbUrl = imgUrl || '';
      const pdfArrowSvg = `<svg class="pdf-badge-arrow" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M7 17L17 7"/><path d="M7 7h10v10"/></svg>`;
      const pdfArrow = aiData.storageUrl ? pdfArrowSvg : '';
      // Title: use ai title or filename, NOT item.content (that's the post text)
      const pdfTitle = toTitleCase(aiData.title || aiData.fileName || '');
      const previewHtml = pdfThumbUrl
        ? `<div class="pdf-blur-wrap"><img class="pdf-blur-img" src="${escapeHtml(pdfThumbUrl)}" loading="lazy" alt=""><div class="pdf-badge"><span class="pdf-badge-text">pdf</span>${pdfArrow}</div></div>`
        : `<div style="padding:16px 14px 0"><div class="pdf-badge" style="position:relative;top:auto;left:auto;display:inline-block"><span class="pdf-badge-text">pdf</span>${pdfArrow}</div></div>`;
      mediaHtml = `<div class="tgpost-pdf-section" data-action="open-file" data-file-id="${escapeHtml(pdfFid)}">${previewHtml}${pdfTitle ? `<div class="pdf-title" style="padding:10px 16px 0">${escapeHtml(pdfTitle)}</div>` : ''}</div>`;
    } else if (aiData.mediaType === 'video_note' && (item.videoFileId || item.fileId)) {
      const vnFid = item.videoFileId || item.fileId;
      mediaHtml = `<div class="tgpost-videonote">
        <div class="videonote-circle" data-action="videonote-play" data-file-id="${escapeHtml(vnFid)}">
          <video class="videonote-video" muted loop playsinline preload="none"></video>
          <div class="videonote-play-icon"><svg viewBox="0 0 24 24" fill="white"><path d="M7 5.5C7 4.4 8.26 3.74 9.19 4.34l10.5 6.5a1.75 1.75 0 0 1 0 3.02l-10.5 6.5C8.26 20.96 7 20.3 7 19.2V5.5z"/></svg></div>
        </div>
      </div>`;
    } else if (aiData.mediaType === 'voice' && (item.audioFileId || item.fileId)) {
      const vFid = item.audioFileId || item.fileId;
      const duration = aiData.audioDuration || 0;
      const durationStr = duration > 0 ? `${Math.floor(duration / 60)}:${String(duration % 60).padStart(2, '0')}` : '';
      mediaHtml = `<div class="voice-player" data-action="voice-play" data-file-id="${escapeHtml(vFid)}" style="margin:14px 14px 0">
        <button class="voice-play-btn"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M7 5.5C7 4.4 8.26 3.74 9.19 4.34l10.5 6.5a1.75 1.75 0 0 1 0 3.02l-10.5 6.5C8.26 20.96 7 20.3 7 19.2V5.5z"/></svg></button>
        <div class="voice-waveform"><div class="voice-progress"></div></div>
        <span class="voice-duration">${durationStr}</span>
      </div>`;
    } else if (aiData.mediaType === 'audio' && (item.audioFileId || item.fileId)) {
      const aFid = item.audioFileId || item.fileId;
      const title = aiData.audioTitle || aiData.audioFileName || '';
      const performer = aiData.audioPerformer || '';
      const duration = aiData.audioDuration || 0;
      const durationStr = duration > 0 ? `${Math.floor(duration / 60)}:${String(duration % 60).padStart(2, '0')}` : '';
      const coverUrl = imgUrl || '';
      const audioAccent = getAccentColor(aiData.color_subject, '#18bb3e');
      mediaHtml = `<div style="padding:12px 14px 0;--audio-accent:${audioAccent}">
        ${coverUrl ? `<div class="audio-cover" style="margin-bottom:8px;border-radius:8px"><img src="${escapeHtml(coverUrl)}" loading="lazy" alt="" onerror="this.parentElement.remove()"></div>` : ''}
        ${title ? `<div class="audio-title">${escapeHtml(title)}</div>` : ''}
        ${performer ? `<div class="audio-performer">${escapeHtml(performer)}</div>` : ''}
        <div class="audio-player" data-action="audio-play" data-file-id="${escapeHtml(aFid)}">
          <button class="audio-play-btn"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M7 5.5C7 4.4 8.26 3.74 9.19 4.34l10.5 6.5a1.75 1.75 0 0 1 0 3.02l-10.5 6.5C8.26 20.96 7 20.3 7 19.2V5.5z"/></svg></button>
          <div class="audio-progress-wrap"><div class="audio-progress"></div></div>
          <span class="audio-time">${durationStr}</span>
        </div>
      </div>`;
    } else if (aiData.mediaType === 'document' && !imgUrl) {
      const docFileName = aiData.fileName || item.content || 'file';
      const docExt = docFileName.includes('.') ? docFileName.split('.').pop() : '';
      const docBaseName = docExt ? docFileName.slice(0, -(docExt.length + 1)) : docFileName;
      const docStorageUrl = aiData.storageUrl || '';
      const docOpenUrl2 = docStorageUrl || sourceUrl;
      const docAction = docOpenUrl2 ? `data-action="open" data-url="${escapeHtml(docOpenUrl2)}"` : (item.fileId ? `data-action="open-file" data-file-id="${escapeHtml(item.fileId)}"` : '');
      const docIconColor = getFileIconColor(docExt);
      mediaHtml = `<div class="tgpost-document" ${docAction}>
        ${makeFileSheetHtml(docIconColor, docExt.toLowerCase(), docBaseName)}
      </div>`;
    } else if (tgYtMatch) {
      // YouTube — glow-wrap screenshot (uses imgUrl from TG preview or YT thumbnail)
      const ytId = tgYtMatch[1];
      const ytThumb = imgUrl || `https://img.youtube.com/vi/${ytId}/maxresdefault.jpg`;
      const ytFallback = `https://img.youtube.com/vi/${ytId}/hqdefault.jpg`;
      const ytUrl = `https://www.youtube.com/watch?v=${ytId}`;
      const ytOnload = !imgUrl ? `onload="if(this.naturalWidth<=120)this.src='${ytFallback}'" onerror="this.src='${ytFallback}'"` : '';
      const ytShareIcon = `<svg viewBox="0 0 24 24" fill="white"><path d="M7 5.5C7 4.4 8.26 3.74 9.19 4.34l10.5 6.5a1.75 1.75 0 0 1 0 3.02l-10.5 6.5C8.26 20.96 7 20.3 7 19.2V5.5z" stroke="white" stroke-width="1.5" stroke-linejoin="round"/></svg>`;
      mediaHtml = `<div class="tgpost-yt-card" data-action="open" data-url="${escapeHtml(ytUrl)}">
        <div class="video-header">
          <img class="video-favicon" src="https://www.google.com/s2/favicons?domain=youtube.com&sz=64" alt="" onerror="this.style.display='none'">
          <span class="video-domain">youtube.com</span>
          <button class="video-share-btn" data-action="open" data-url="${escapeHtml(ytUrl)}" title="Open">${ytShareIcon}</button>
        </div>
        <div class="video-preview">
          <div class="video-glow-wrap">
            <img class="video-glow" src="${escapeHtml(ytThumb)}" loading="lazy" alt="" aria-hidden="true" ${ytOnload}>
            <div class="screenshot-crop" style="border-radius:11px"><img class="video-screenshot" src="${escapeHtml(ytThumb)}" loading="lazy" alt="" ${ytOnload}></div>
          </div>
        </div>
      </div>`;
    } else if (tgVimeoMatch) {
      const vimeoId = tgVimeoMatch[1];
      const vimeoImgId = `tgpost-vimeo-${item.id}`;
      const vimeoUrl = `https://vimeo.com/${vimeoId}`;
      const vimeoThumbSrc = imgUrl || '';
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
      const vimeoShareIcon = `<svg viewBox="0 0 24 24" fill="white"><path d="M7 5.5C7 4.4 8.26 3.74 9.19 4.34l10.5 6.5a1.75 1.75 0 0 1 0 3.02l-10.5 6.5C8.26 20.96 7 20.3 7 19.2V5.5z" stroke="white" stroke-width="1.5" stroke-linejoin="round"/></svg>`;
      mediaHtml = `<div class="tgpost-yt-card" data-action="open" data-url="${escapeHtml(vimeoUrl)}">
        <div class="video-header">
          <img class="video-favicon" src="https://www.google.com/s2/favicons?domain=vimeo.com&sz=64" alt="" onerror="this.style.display='none'">
          <span class="video-domain">vimeo.com</span>
          <button class="video-share-btn" data-action="open" data-url="${escapeHtml(vimeoUrl)}" title="Open">${vimeoShareIcon}</button>
        </div>
        <div class="video-preview">
          <div class="video-glow-wrap">
            <img class="video-glow" id="${vimeoImgId}-glow" src="${escapeHtml(vimeoThumbSrc)}" loading="lazy" alt="" aria-hidden="true">
            <div class="screenshot-crop" style="border-radius:11px"><img class="video-screenshot" id="${vimeoImgId}" src="${escapeHtml(vimeoThumbSrc)}" loading="lazy" alt=""></div>
          </div>
        </div>
      </div>`;
    } else if ((aiData.mediaType === 'video' || item.videoFileId) && item.fileId) {
      // Inline TG video — full-width thumbnail with play icon
      const thumbUrl = imgUrl || '';
      const playIconSvg = `<svg viewBox="0 0 24 24" fill="white"><path d="M7 5.5C7 4.4 8.26 3.74 9.19 4.34l10.5 6.5a1.75 1.75 0 0 1 0 3.02l-10.5 6.5C8.26 20.96 7 20.3 7 19.2V5.5z"/></svg>`;
      mediaHtml = thumbUrl
        ? `<div class="tgpost-video-preview" data-action="video-play" data-file-id="${escapeHtml(item.videoFileId || item.fileId)}">
            <img class="card-img" src="${escapeHtml(thumbUrl)}" loading="lazy" alt="">
            <div class="tgpost-play-icon">${playIconSvg}</div>
          </div>`
        : `<div class="tgpost-video-preview" data-action="video-play" data-file-id="${escapeHtml(item.videoFileId || item.fileId)}">
            <div class="tgpost-play-icon" style="position:relative;top:auto;left:auto;transform:none;margin:16px auto">${playIconSvg}</div>
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
    }

    // Transcript
    const tgTranscript = aiData.transcript || '';
    const tgTranscriptBtn = (tgTranscript && ['voice', 'video_note'].includes(aiData.mediaType))
      ? `<button class="transcript-btn" data-action="toggle-transcript">Aa</button>`
      : '';
    const tgTranscriptHtml = (tgTranscript && ['voice', 'video_note'].includes(aiData.mediaType))
      ? `<div class="transcript-text hidden" style="padding:0 16px 8px">${escapeHtml(tgTranscript)}</div>`
      : '';

    // Body text — suppress captions that are just filenames (document albums)
    const allCaptions = isDocumentContent ? [] : (item._allCaptions || []);
    let bodyHtml = '';
    if (allCaptions.length > 1) {
      const parts = allCaptions.map(cap => {
        const capIsHtml = aiData.htmlContent || /<(?:a\s+href=|b>|i>|u>|s>|code>)/.test(cap);
        return capIsHtml ? sanitizeHtml(cap) : escapeHtml(cap);
      });
      bodyHtml = `<div class="tgpost-body"><div class="quote-text">${parts.join('<br>')}</div></div>`;
    } else if (textContent) {
      bodyHtml = `<div class="tgpost-body"><div class="quote-text${truncatedClass}">${displayHtml}</div></div>`;
    }

    // Footer with TG icon + author + multi-hider
    // For user forwards → forwardUserUrl (profile link); for channels → sourceUrl (post link)
    const labelUrl = forwardUserUrl || sourceUrl;
    const domainHtml = tgLabel
      ? (labelUrl
        ? `<a class="quote-source-link" data-action="open" data-url="${escapeHtml(labelUrl)}">${escapeHtml(tgLabel)}</a>`
        : `<span class="quote-source-link" data-action="stop">${escapeHtml(tgLabel)}</span>`)
      : '';

    // Multi-hider: detect which sections exist
    const hidden = aiData.tgpost_hidden || {};
    const hasLink = !!linkHeaderHtml;
    const hasFiles = !!mediaHtml;
    const hasText = !!(textContent || '').trim();
    const sectionCount = [hasLink, hasFiles, hasText].filter(Boolean).length;
    const hiderDash = `<svg width="14" height="14" viewBox="0 0 14 14" fill="none"><line x1="3" y1="7" x2="11" y2="7" stroke="rgba(255,255,255,0.5)" stroke-width="1.5" stroke-linecap="round"/></svg>`;
    const hiderCircle = `<svg width="14" height="14" viewBox="0 0 14 14" fill="none"><circle cx="7" cy="7" r="4.5" stroke="rgba(255,255,255,0.5)" stroke-width="1.3" fill="none"/></svg>`;
    const hasHidden = hidden.link || hidden.files || hidden.text;
    const hiderDotIcon = `<svg width="16" height="16" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="5.5" stroke="rgba(255,255,255,0.4)" stroke-width="1.3"/>${hasHidden ? '<circle cx="8" cy="8" r="1.5" fill="rgba(255,255,255,0.4)"/>' : ''}</svg>`;
    const hiderDotHtml = sectionCount > 1 ? `<div class="tgpost-hider-dot" data-action="toggle-hider">
      ${hiderDotIcon}
      <div class="tgpost-hider-popup">
        ${hasLink ? `<div class="tgpost-hider-item${hidden.link ? ' hidden-section' : ''}" data-hider-section="link">${hidden.link ? hiderCircle : hiderDash}<span>link</span></div>` : ''}
        ${hasFiles ? `<div class="tgpost-hider-item${hidden.files ? ' hidden-section' : ''}" data-hider-section="files">${hidden.files ? hiderCircle : hiderDash}<span>files</span></div>` : ''}
        ${hasText ? `<div class="tgpost-hider-item${hidden.text ? ' hidden-section' : ''}" data-hider-section="text">${hidden.text ? hiderCircle : hiderDash}<span>text</span></div>` : ''}
      </div>
    </div>` : '';

    const showLink = !hidden.link;
    const showFiles = !hidden.files;
    const showText = !hidden.text;

    const quoteText = allCaptions.length > 1 ? allCaptions.join('\n') : textContent;
    const hasQuoteAction = !!(quoteText || '').trim();
    return `<div class="card card-tgpost${bgClass}" data-id="${item.id}"${hasQuoteAction ? ` data-action="quote" data-quote-text="${escapeHtml(quoteText)}"` : ''} data-source-url="${escapeHtml(sourceUrl)}" data-domain="${escapeHtml(tgLabel || 'telegram')}">
      ${pendingDot}
      ${tgTranscriptBtn}
      ${showLink ? linkHeaderHtml : ''}
      ${showFiles ? mediaHtml : ''}
      ${showText ? bodyHtml : ''}
      ${tgTranscriptHtml}
      ${(tgLabel || hiderDotHtml) ? `<div class="quote-footer">
        <div class="tg-footer-left">
          ${(tgLabel && labelUrl) ? TG_ICON_SVG : ''}
          ${domainHtml}
        </div>
        ${hiderDotHtml}
      </div>` : ''}
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
    // Telegram stores animations as mp4 — use <video> instead of <img>.
    // All TG gif items come from animation.file_id and are always mp4.
    // Only treat as static gif if the URL itself is a .gif (external animated gif).
    const isMp4Gif = !/\.gif($|\?)/i.test(imgUrl);
    const mediaEl = isMp4Gif
      ? `<video class="card-img" src="${escapeHtml(imgUrl)}" autoplay loop muted playsinline></video>`
      : `<img class="card-img" src="${escapeHtml(imgUrl)}" loading="lazy" alt="">`;
    // For mp4 gifs: open via video lightbox; for true .gif: image lightbox
    const lbAction = isMp4Gif ? 'gif-mp4-lightbox' : 'lightbox';
    return `<div class="card card-image card-gif" data-id="${item.id}" data-action="${lbAction}" data-img="${escapeHtml(imgUrl)}" data-url="${escapeHtml(sourceUrl)}" data-file-id="${escapeHtml(item.fileId || '')}">
      ${pendingDot}
      ${mediaEl}
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
    // HEIC: if not yet converted (no blob URL), show placeholder
    const isHeicFile = /\.heic$/i.test(aiData.fileName || '');
    const isConverted = imgUrl.startsWith('blob:');
    if (isHeicFile && !isConverted) {
      const heicW = aiData.thumbnailWidth || aiData.imageWidth || 0;
      const heicH = aiData.thumbnailHeight || aiData.imageHeight || 0;
      const heicRatioStyle = (heicW && heicH) ? ` style="aspect-ratio:${heicW}/${heicH}"` : '';
      // data-thumb-fid only needed as fallback for old records without stored dimensions
      const thumbFid = (!heicW && aiData.thumbnailFileId) ? ` data-thumb-fid="${escapeHtml(aiData.thumbnailFileId)}"` : '';
      return `<div class="card card-heic-placeholder" data-id="${item.id}"${heicRatioStyle}${thumbFid}>
        ${pendingDot}
        <div class="heic-icon"><svg viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.3)" stroke-width="1.5"><rect x="3" y="3" width="18" height="18" rx="3"/><path d="M3 9h18M9 21V9"/></svg></div>
        <div class="heic-label">HEIC</div>
        <div class="heic-converting">converting…</div>
      </div>`;
    }
    const domainBtn = (sourceUrl && imgDomain)
      ? `<button class="img-domain-btn" data-action="open" data-url="${escapeHtml(sourceUrl)}">${escapeHtml(imgDomain)}</button>`
      : '';
    const downloadBtn = `<button class="img-download-btn" data-action="download" data-url="${escapeHtml(imgUrl)}">${downloadSvg}</button>`;
    const isSvgCard = imgUrl.split('?')[0].split('#')[0].toLowerCase().endsWith('.svg')
      || /\.svg$/i.test(aiData.fileName || '');
    const svgClass = isSvgCard ? ' card-svg' : '';
    return `<div class="card card-image${svgClass}" data-id="${item.id}" data-action="lightbox" data-img="${escapeHtml(imgUrl)}" data-url="${escapeHtml(sourceUrl)}">
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
    const cols = getColumnCount();
    const columns = Array.from({ length: cols }, () => []);
    for (let i = 0; i < cards.length; i++) {
      columns[i % cols].push(cards[i]);
    }
    masonry.innerHTML = columns.map(col =>
      `<div class="masonry-col">${col.join('')}</div>`
    ).join('');
  } else {
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

  // Auto-load video notes
  autoloadVideoNotes();
  // Auto-load small TG videos (≤5MB muted loop)
  autoloadSmallVideos();
}

// ─── Muted-by-user persistence (localStorage) ───────────────────────────────
const _MUTED_VIDEOS_KEY = 'tgvideo_muted_ids';
function _getMutedVideoIds() {
  try { return new Set(JSON.parse(localStorage.getItem(_MUTED_VIDEOS_KEY) || '[]')); }
  catch { return new Set(); }
}
function _setVideoMuted(fileId) {
  const set = _getMutedVideoIds();
  set.add(fileId);
  localStorage.setItem(_MUTED_VIDEOS_KEY, JSON.stringify([...set]));
  console.log('[SmallVideo] muted by user fid=...%s, total=%d', fileId.slice(-20), set.size);
}
function _setVideoUnmuted(fileId) {
  const set = _getMutedVideoIds();
  set.delete(fileId);
  localStorage.setItem(_MUTED_VIDEOS_KEY, JSON.stringify([...set]));
  console.log('[SmallVideo] unmuted by user fid=...%s, total=%d', fileId.slice(-20), set.size);
}

// ─── Visibility-based play/pause for all autoplaying videos ─────────────────
// Single IntersectionObserver handles both video notes and small TG videos.
// rootMargin=200px starts playback before element scrolls into view — no visible seam.
const _videoVisibilityObserver = new IntersectionObserver((entries) => {
  for (const ioEntry of entries) {
    const el = ioEntry.target;
    const video = el._autoplayVideo;
    if (!video || !video.src) continue;

    if (ioEntry.isIntersecting) {
      // Skip user-paused videos
      if (el.classList?.contains('tgvideo-user-paused')) continue;
      if (video.paused && video.muted) {
        video.play().then(() => {
          console.log('[Visibility] play (visible) tag=%s', el._autoplayTag);
        }).catch(() => {});
      }
    } else {
      if (!video.paused && video.muted) {
        video.pause();
        console.log('[Visibility] pause (offscreen) tag=%s', el._autoplayTag);
      }
    }
  }
}, { rootMargin: '200px', threshold: 0.1 });

// Register an element+video pair with the visibility observer
function _observeAutoplayVideo(el, video, tag) {
  el._autoplayVideo = video;
  el._autoplayTag = tag;
  _videoVisibilityObserver.observe(el);
}

// ─── Video note autoload (survives DOM re-renders) ──────────────────────────
// Cache resolved URLs so re-renders don't re-fetch from Telegram API
const _vnUrlCache = {};

function autoloadVideoNotes() {
  const masonry = document.getElementById('masonry');
  if (!masonry || !STATE.botToken) return;
  const circles = masonry.querySelectorAll('.videonote-circle');
  if (!circles.length) return;

  const entries = [...circles]
    .filter(c => !c._vnLoading && !c._vnLoaded)
    .map(c => ({
      circle: c,
      fileId: c.dataset.fileId,
      video: c.querySelector('.videonote-video'),
      playIcon: c.querySelector('.videonote-play-icon'),
    }))
    .filter(e => e.fileId && e.video);
  if (!entries.length) return;

  const playVideo = (entry, url) => {
    const { video, playIcon, circle } = entry;
    video.preload = 'auto';
    video.src = url;
    video.muted = true;
    circle._vnLoaded = true;
    // Register with visibility observer — plays only when on screen
    _observeAutoplayVideo(circle, video, 'vn:' + entry.fileId.slice(-12));
    // Try initial play (observer will manage pause/resume on scroll)
    video.play().then(() => {
      if (playIcon) playIcon.style.display = 'none';
    }).catch(() => {
      const retry = () => {
        video.play().then(() => {
          if (playIcon) playIcon.style.display = 'none';
        }).catch(() => {});
        document.removeEventListener('click', retry);
        document.removeEventListener('scroll', retry);
      };
      document.addEventListener('click', retry, { once: true });
      document.addEventListener('scroll', retry, { once: true });
    });
  };

  // Split: cached (instant) vs uncached (need API call)
  const cached = [];
  const uncached = [];
  for (const e of entries) {
    e.circle._vnLoading = true;
    if (_vnUrlCache[e.fileId]) {
      cached.push(e);
    } else {
      uncached.push(e);
    }
  }

  // Play cached ones immediately
  for (const e of cached) playVideo(e, _vnUrlCache[e.fileId]);

  // Resolve uncached with concurrency limit
  if (uncached.length) {
    const CONCURRENCY = 3;
    let idx = 0;
    const worker = async () => {
      while (idx < uncached.length) {
        const entry = uncached[idx++];
        for (let attempt = 0; attempt < 2; attempt++) {
          try {
            const url = await resolveFileId(STATE.botToken, entry.fileId);
            if (url) {
              _vnUrlCache[entry.fileId] = url;
              playVideo(entry, url);
              break;
            }
          } catch { /* retry */ }
          if (attempt === 0) await new Promise(r => setTimeout(r, 500));
        }
      }
    };
    for (let i = 0; i < Math.min(CONCURRENCY, uncached.length); i++) worker();
  }
}

// ─── Small TG video autoplay (≤5MB, muted loop in grid) ─────────────────────
// Reuses _vnUrlCache for resolved file URLs
const _svAutoplayActive = new WeakSet(); // track which cards are already autoplaying

function autoloadSmallVideos() {
  const masonry = document.getElementById('masonry');
  if (!masonry || !STATE.botToken) return;
  const cards = masonry.querySelectorAll('.tgvideo-autoplay');
  if (!cards.length) return;
  console.log('[SmallVideo] autoloadSmallVideos: found %d tgvideo-autoplay cards', cards.length);

  const mutedIds = _getMutedVideoIds();
  const entries = [...cards]
    .filter(c => !_svAutoplayActive.has(c) && !c.classList.contains('tgvideo-user-paused'))
    .map(c => {
      const fileId = c.dataset.fileId
        || c.querySelector('[data-file-id]')?.dataset.fileId;
      const video = c.querySelector('.tgvideo-inline');
      const playIcon = c.querySelector('.tgpost-play-icon');
      const thumb = c.querySelector('.card-img');
      return { card: c, fileId, video, playIcon, thumb };
    })
    .filter(e => e.fileId && e.video && !mutedIds.has(e.fileId));

  if (!entries.length) {
    console.log('[SmallVideo] no new entries to autoload');
    return;
  }
  console.log('[SmallVideo] will autoload %d small videos', entries.length);

  const playVideo = (entry, url) => {
    const { video, playIcon, card } = entry;
    _svAutoplayActive.add(card);
    video.preload = 'auto';
    video.src = url;
    video.muted = true;
    console.log('[SmallVideo] set src for fid=...%s', entry.fileId.slice(-20));
    // Register with visibility observer — plays only when on screen
    _observeAutoplayVideo(card, video, 'sv:' + entry.fileId.slice(-12));
    video.play().then(() => {
      console.log('[SmallVideo] playing fid=...%s', entry.fileId.slice(-20));
      card.classList.add('tgvideo-playing');
      if (playIcon) playIcon.style.display = 'none';
    }).catch(err => {
      console.log('[SmallVideo] autoplay blocked for fid=...%s: %s', entry.fileId.slice(-20), err.message);
      // Retry on first user interaction
      const retry = () => {
        video.play().then(() => {
          console.log('[SmallVideo] retry play OK fid=...%s', entry.fileId.slice(-20));
          card.classList.add('tgvideo-playing');
          if (playIcon) playIcon.style.display = 'none';
        }).catch(() => {});
        document.removeEventListener('click', retry);
        document.removeEventListener('scroll', retry);
      };
      document.addEventListener('click', retry, { once: true });
      document.addEventListener('scroll', retry, { once: true });
    });
  };

  // Split: cached vs uncached
  const cached = [];
  const uncached = [];
  for (const e of entries) {
    if (_vnUrlCache[e.fileId]) {
      cached.push(e);
    } else {
      uncached.push(e);
    }
  }
  console.log('[SmallVideo] cached=%d uncached=%d', cached.length, uncached.length);

  for (const e of cached) playVideo(e, _vnUrlCache[e.fileId]);

  if (uncached.length) {
    const CONCURRENCY = 3;
    let idx = 0;
    const worker = async () => {
      while (idx < uncached.length) {
        const entry = uncached[idx++];
        for (let attempt = 0; attempt < 2; attempt++) {
          try {
            const url = await resolveFileId(STATE.botToken, entry.fileId);
            if (url) {
              _vnUrlCache[entry.fileId] = url;
              playVideo(entry, url);
              console.log('[SmallVideo] resolved fid=...%s', entry.fileId.slice(-20));
              break;
            }
          } catch (err) {
            console.log('[SmallVideo] resolve error fid=...%s attempt=%d: %s', entry.fileId.slice(-20), attempt, err.message);
          }
          if (attempt === 0) await new Promise(r => setTimeout(r, 500));
        }
      }
    };
    for (let i = 0; i < Math.min(CONCURRENCY, uncached.length); i++) worker();
  }
}

// ─── Notion mutation helpers ──────────────────────────────────────────────────
async function deleteItem(pageId) {
  const item = STATE.items.find(i => i.id === pageId);
  // Collect all Notion page IDs: album group pages + the main page
  const idsToDelete = item?._groupPageIds?.length ? item._groupPageIds : [pageId];
  const idsSet = new Set(idsToDelete);

  // ── Optimistic: dissolve animation + remove from state immediately ──
  const cardEl = document.querySelector(`.card[data-id="${pageId}"]`);
  // Remove from state right away so any concurrent applyFilters won't re-add it
  STATE.items = STATE.items.filter(item => !idsSet.has(item.id));

  if (cardEl) {
    cardEl.classList.add('card-dissolving');
    cardEl.addEventListener('animationend', () => {
      cardEl.remove();
      applyFilters();
    }, { once: true });
  } else {
    applyFilters();
  }

  // ── Background: archive in Notion (fire-and-forget) ──
  Promise.all(idsToDelete.map(id =>
    notionPatch(id, { archived: true })
  )).catch(e => console.error('[Viewer] Delete error:', e));
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
    const res = await notionPatch(pageId, { properties });
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
  try {
    await notionPatch(pageId, {
      properties: {
        'ai_data': { rich_text: [{ text: { content: JSON.stringify(item.ai_data).slice(0, 2000) } }] }
      }
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

async function togglePdfTextCollapse(pageId) {
  const item = STATE.items.find(i => i.id === pageId);
  if (!item) return;

  const newCollapsed = !item.ai_data.pdf_text_collapsed;
  item.ai_data.pdf_text_collapsed = newCollapsed;

  // Optimistic re-render
  const cardEl = document.querySelector(`.card[data-id="${pageId}"]`);
  if (cardEl) cardEl.outerHTML = renderCard(item);

  // Persist to Notion
  try {
    await notionPatch(pageId, {
      properties: {
        'ai_data': { rich_text: [{ text: { content: JSON.stringify(item.ai_data).slice(0, 2000) } }] }
      }
    });
  } catch (e) {
    console.error('[Viewer] Toggle PDF text error:', e);
    item.ai_data.pdf_text_collapsed = !newCollapsed;
    const revertCard = document.querySelector(`.card[data-id="${pageId}"]`);
    if (revertCard) revertCard.outerHTML = renderCard(item);
  }
}

async function renamePdfItem(pageId, newTitle) {
  const item = STATE.items.find(i => i.id === pageId);
  if (!item) return;

  const trimmed = newTitle.trim();
  if (!trimmed) return;

  const prev = item.ai_data.title;
  item.ai_data.title = trimmed;

  // Re-render card
  const cardEl = document.querySelector(`.card[data-id="${pageId}"]`);
  if (cardEl) cardEl.outerHTML = renderCard(item);

  // Persist to Notion
  try {
    const res = await notionPatch(pageId, {
      properties: {
        'ai_data': { rich_text: [{ text: { content: JSON.stringify(item.ai_data).slice(0, 2000) } }] }
      }
    });
    if (!res.ok) {
      console.error('[Viewer] Rename failed:', res.status);
      item.ai_data.title = prev;
      const revert = document.querySelector(`.card[data-id="${pageId}"]`);
      if (revert) revert.outerHTML = renderCard(item);
    }
  } catch (e) {
    console.error('[Viewer] Rename error:', e);
    item.ai_data.title = prev;
    const revert = document.querySelector(`.card[data-id="${pageId}"]`);
    if (revert) revert.outerHTML = renderCard(item);
  }
}

async function toggleTgpostSection(pageId, section) {
  const item = STATE.items.find(i => i.id === pageId);
  if (!item) return;

  const hidden = item.ai_data.tgpost_hidden || {};
  const newHidden = { ...hidden, [section]: !hidden[section] };

  // Count visible sections: must keep at least one visible
  const card = document.querySelector(`.card[data-id="${pageId}"]`);
  if (!card) return;
  const allSections = card.querySelectorAll('.tgpost-hider-item');
  const sectionKeys = Array.from(allSections).map(el => el.dataset.hiderSection);
  const visibleCount = sectionKeys.filter(k => !newHidden[k]).length;
  if (visibleCount < 1) return;

  item.ai_data.tgpost_hidden = newHidden;

  // Optimistic re-render
  if (card) card.outerHTML = renderCard(item);

  // Persist to Notion
  try {
    await notionPatch(pageId, {
      properties: {
        'ai_data': { rich_text: [{ text: { content: JSON.stringify(item.ai_data).slice(0, 2000) } }] }
      }
    });
  } catch (e) {
    console.error('[Viewer] Toggle tgpost section error:', e);
    // Rollback
    item.ai_data.tgpost_hidden = hidden;
    const revertCard = document.querySelector(`.card[data-id="${pageId}"]`);
    if (revertCard) revertCard.outerHTML = renderCard(item);
  }
}

// ─── Download helper ─────────────────────────────────────────────────────────
function downloadImage(url) {
  const ext = (url.match(/\.(jpe?g|png|gif|webp|svg)/i) || [])[1] || 'jpg';
  fetch(url)
    .then(r => r.blob())
    .then(blob => {
      // For blob URLs (e.g. proxied SVGs), detect type from blob instead of URL
      const actualExt = (blob.type === 'image/svg+xml') ? 'svg' : ext;
      const name = 'image_' + Date.now() + '.' + actualExt;
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = name;
      a.click();
      URL.revokeObjectURL(a.href);
    })
    .catch(() => window.open(url, '_blank'));
}

// ─── Lightbox ─────────────────────────────────────────────────────────────────
// Gallery state for lightbox navigation
const _gallery = { items: [], index: 0 };

function openLightbox(imgUrl, sourceUrl, opts) {
  const lb = document.getElementById('lightbox');
  const img = document.getElementById('lightbox-img');
  const video = document.getElementById('lightbox-video');
  const link = document.getElementById('lightbox-link');
  const dlBtn = document.getElementById('lightbox-download');

  // Gallery: if opts.gallery provided, store it; otherwise single item
  if (opts && opts.gallery && opts.gallery.length >= 1) {
    _gallery.items = opts.gallery;
    _gallery.index = opts.galleryIndex || 0;
  } else {
    const single = { url: imgUrl, sourceUrl };
    if (opts && opts.video) single.video = true;
    _gallery.items = [single];
    _gallery.index = 0;
  }

  _showLightboxItem();
  lb.classList.remove('hidden');
}

async function _showLightboxItem() {
  const img = document.getElementById('lightbox-img');
  const video = document.getElementById('lightbox-video');
  const link = document.getElementById('lightbox-link');
  const dlBtn = document.getElementById('lightbox-download');

  const item = _gallery.items[_gallery.index];
  if (!item) return;

  // Resolve video file_id on demand if not yet resolved
  if (item.video && !item.url && item.fileId && STATE.botToken) {
    const resolved = await resolveFileId(STATE.botToken, item.fileId);
    if (resolved) item.url = resolved;
  }

  const isVideo = item.video && item.url;
  img.classList.toggle('hidden', !!isVideo);
  video.classList.toggle('hidden', !isVideo);

  if (isVideo) {
    // Telegram Bot API doesn't support range requests needed for <video> streaming.
    // Fetch via CORS proxy and create a blob URL instead.
    video.src = '';
    video.loop = true;
    // gif-mp4: mute + no controls (behaves like a gif)
    if (item.isGifMp4) {
      video.muted = true;
      video.controls = false;
    } else {
      video.muted = false;
      video.controls = true;
    }
    try {
      const proxyUrl = 'https://stash-cors-proxy.mxmlsn-co.workers.dev';
      const proxyRes = await fetch(proxyUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          service: 'telegram',
          token: STATE.botToken,
          path: item.url.replace(/^https:\/\/api\.telegram\.org\/file\/bot[^/]+/, ''),
          method: 'GET',
          binary: true,
          contentType: 'video/mp4'
        })
      });
      if (proxyRes.ok) {
        const buf = await proxyRes.arrayBuffer();
        const blob = new Blob([buf], { type: 'video/mp4' });
        video.src = URL.createObjectURL(blob);
      } else {
        video.src = item.url;
      }
    } catch {
      video.src = item.url;
    }
    video.play().catch(() => {});
    img.src = '';
  } else if (item.video && !item.url && item.thumb) {
    // Video couldn't be resolved (>20MB) — show thumbnail
    img.src = item.thumb;
    video.pause();
    video.src = '';
  } else {
    img.src = item.url || '';
    video.pause();
    video.src = '';
  }

  dlBtn.onclick = (e) => { e.stopPropagation(); downloadImage(item.url); };
  if (item.sourceUrl && /^https?:\/\//i.test(item.sourceUrl)) {
    link.href = item.sourceUrl;
    link.textContent = getDomain(item.sourceUrl);
    link.classList.remove('hidden');
  } else {
    link.classList.add('hidden');
  }

  // Show/hide arrows
  const prevBtn = document.getElementById('lightbox-prev');
  const nextBtn = document.getElementById('lightbox-next');
  const counter = document.getElementById('lightbox-counter');
  if (prevBtn) prevBtn.classList.toggle('hidden', _gallery.items.length <= 1);
  if (nextBtn) nextBtn.classList.toggle('hidden', _gallery.items.length <= 1);
  if (counter) {
    if (_gallery.items.length > 1) {
      counter.textContent = `${_gallery.index + 1} / ${_gallery.items.length}`;
      counter.classList.remove('hidden');
    } else {
      counter.classList.add('hidden');
    }
  }
}

function lightboxPrev() {
  if (_gallery.items.length <= 1) return;
  _gallery.index = (_gallery.index - 1 + _gallery.items.length) % _gallery.items.length;
  _showLightboxItem();
}

function lightboxNext() {
  if (_gallery.items.length <= 1) return;
  _gallery.index = (_gallery.index + 1) % _gallery.items.length;
  _showLightboxItem();
}

function closeLightbox() {
  const lb = document.getElementById('lightbox');
  const video = document.getElementById('lightbox-video');
  lb.classList.add('hidden');
  document.getElementById('lightbox-img').src = '';
  video.pause();
  video.src = '';
  video.muted = false;
  video.controls = true;
  _gallery.items = [];
  _gallery.index = 0;
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

    // "stop" — absorb click, prevent bubbling to parent card action
    if (action === 'stop') {
      e.stopPropagation();
      return;
    }

    // "open" — direct navigation (links, videos, products, articles, domain btns, avatars)
    if (action === 'open' && url && /^https?:\/\//i.test(url)) {
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

    // "gif-mp4-lightbox" — open TG gif (stored as mp4) via video lightbox
    if (action === 'gif-mp4-lightbox') {
      const mp4Url = actionEl.dataset.img || '';
      const fileId = actionEl.dataset.fileId || '';
      if (mp4Url || fileId) {
        openLightbox('', url, { gallery: [{ url: mp4Url, fileId: fileId || '', video: true, thumb: '', sourceUrl: url, isGifMp4: true }] });
      }
      return;
    }

    // "album-gallery" — open unified gallery for album (images + videos)
    if (action === 'album-gallery') {
      e.stopPropagation();
      const album = actionEl.closest('.tgpost-album');
      if (!album) return;
      const siblings = album.querySelectorAll('[data-action="album-gallery"]');
      const gallery = [];
      let idx = 0;
      siblings.forEach((el, i) => {
        const gType = el.dataset.galleryType || 'image';
        if (gType === 'video') {
          gallery.push({ url: '', fileId: el.dataset.fileId || '', video: true, thumb: el.dataset.thumb || '', sourceUrl: '' });
        } else {
          gallery.push({ url: el.dataset.img || '', sourceUrl: '' });
        }
        if (el === actionEl) idx = i;
      });
      if (gallery.length === 0) return;
      // For the clicked item, if it's a video, resolve it now
      const clicked = gallery[idx];
      if (clicked.video && clicked.fileId && !clicked.url) {
        const resolved = await resolveFileId(STATE.botToken, clicked.fileId);
        if (resolved) clicked.url = resolved;
      }
      openLightbox(clicked.url, '', { gallery, galleryIndex: idx });
      return;
    }

    // "open-file" — resolve TG file_id and open file in browser
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
          const fileExt = (filePath.split('.').pop() || '').toLowerCase();
          const isPdf = fileExt === 'pdf';

          // Fetch binary via CORS proxy
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
              contentType: isPdf ? 'application/pdf' : 'application/octet-stream'
            })
          });
          const buf = await res.arrayBuffer();
          if (isPdf) {
            const pdfBlob = new Blob([buf], { type: 'application/pdf' });
            window.open(URL.createObjectURL(pdfBlob), '_blank');
          } else {
            // Non-PDF: trigger download
            const blob = new Blob([buf]);
            const a = document.createElement('a');
            a.href = URL.createObjectURL(blob);
            a.download = filePath.split('/').pop() || 'file';
            a.click();
            URL.revokeObjectURL(a.href);
          }
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

    // "tgvideo-toggle" — pause/resume autoplay on small inline video
    if (action === 'tgvideo-toggle') {
      e.stopPropagation();
      const fileId = actionEl.dataset.fileId;
      const card = actionEl.closest('.tgvideo-autoplay');
      if (!card || !fileId) return;
      const video = card.querySelector('.tgvideo-inline');
      const isPaused = card.classList.contains('tgvideo-user-paused');
      console.log('[SmallVideo] toggle fileId=...%s wasPaused=%s', fileId.slice(-20), isPaused);

      if (isPaused) {
        // Resume autoplay
        _setVideoUnmuted(fileId);
        card.classList.remove('tgvideo-user-paused');
        if (video && video.src) {
          video.muted = true;
          video.play().then(() => {
            card.classList.add('tgvideo-playing');
          }).catch(() => {});
        }
      } else {
        // Pause and remember
        _setVideoMuted(fileId);
        card.classList.add('tgvideo-user-paused');
        if (video) video.pause();
      }
      return;
    }

    // "video-play" — play TG video in lightbox
    // For small autoplaying videos (≤5MB): pause inline, open lightbox with sound
    if (action === 'video-play') {
      e.stopPropagation();
      const fileId = actionEl.dataset.fileId || actionEl.closest('[data-file-id]')?.dataset.fileId;
      const card = actionEl.closest('.card[data-id]') || actionEl.closest('.tgpost-video-preview')?.closest('.card[data-id]');
      const isAutoplay = card?.classList.contains('tgvideo-autoplay');
      console.log('[VideoPlay] action=video-play fileId=...%s isAutoplay=%s', fileId?.slice(-20), isAutoplay);

      // Pause inline autoplay video before opening lightbox
      if (isAutoplay) {
        const inlineVideo = card.querySelector('.tgvideo-inline');
        if (inlineVideo) {
          inlineVideo.pause();
          console.log('[VideoPlay] paused inline video');
        }
      }

      let videoUrl = url;
      // Try cached URL first (from autoplay resolution), then re-resolve
      if (!videoUrl && fileId && _vnUrlCache[fileId]) {
        videoUrl = _vnUrlCache[fileId];
        console.log('[VideoPlay] using cached URL for fid=...%s', fileId?.slice(-20));
      }
      if (!videoUrl && fileId && STATE.botToken) {
        console.log('[VideoPlay] resolving fid=...%s', fileId?.slice(-20));
        videoUrl = await resolveFileId(STATE.botToken, fileId);
      }
      if (videoUrl) {
        console.log('[VideoPlay] opening lightbox with video');
        openLightbox(videoUrl, '', { video: true });
        // Resume inline autoplay when lightbox closes
        if (isAutoplay) {
          const inlineVideo = card.querySelector('.tgvideo-inline');
          if (inlineVideo) {
            const observer = new MutationObserver(() => {
              const lb = document.getElementById('lightbox');
              if (lb?.classList.contains('hidden')) {
                observer.disconnect();
                inlineVideo.muted = true;
                inlineVideo.play().catch(() => {});
                console.log('[VideoPlay] resumed inline autoplay after lightbox close');
              }
            });
            observer.observe(document.getElementById('lightbox'), { attributes: true, attributeFilter: ['class'] });
          }
        }
      } else {
        // File too large for Bot API (>20MB) — try storageUrl or sourceUrl
        const item = card ? STATE.items.find(i => i.id === card.dataset.id) : null;
        const fallbackUrl = item?.ai_data?.storageUrl || card?.dataset?.sourceUrl;
        console.log('[VideoPlay] no URL resolved, fallback=%s', fallbackUrl?.slice(0, 60));
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

    // "toggle-pdf-text" — collapse/expand text in PDF card (persisted)
    if (action === 'toggle-pdf-text') {
      e.stopPropagation();
      const card = actionEl.closest('.card.card-pdf[data-id]');
      if (card) togglePdfTextCollapse(card.dataset.id);
      return;
    }

    // "toggle-xpost" — collapse/expand xpost screenshot
    if (action === 'toggle-xpost') {
      e.stopPropagation();
      const card = actionEl.closest('.card[data-id]');
      if (card) toggleXpostCollapse(card.dataset.id);
      return;
    }

    // "toggle-hider" — show/hide tgpost multi-hider popup, or toggle section
    if (action === 'toggle-hider') {
      e.stopPropagation();
      const hiderItem = e.target.closest('.tgpost-hider-item');
      if (hiderItem) {
        const section = hiderItem.dataset.hiderSection;
        const card = actionEl.closest('.card[data-id]');
        if (card && section) toggleTgpostSection(card.dataset.id, section);
        return;
      }
      const popup = actionEl.querySelector('.tgpost-hider-popup');
      if (popup) popup.classList.toggle('visible');
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

      // For user forwards, use forwardUserUrl as the label link
      const fwdUrl = item?.ai_data?.forwardUserUrl || '';
      const labelUrl = fwdUrl || sourceUrl;

      let html = '<div class="overlay-quote">';
      html += '<div class="overlay-quote-body">';
      html += `<div class="overlay-quote-text">${textHtml}</div>`;
      html += '</div>';
      html += '<div class="overlay-quote-footer">';
      html += (domain && labelUrl)
        ? `<a class="overlay-quote-source" href="${escapeHtml(labelUrl)}" target="_blank">${escapeHtml(domain)}</a>`
        : (domain ? `<span class="overlay-quote-source">${escapeHtml(domain)}</span>` : '<span></span>');
      html += '</div>';
      html += '</div>';
      openContentOverlay(html, { alignTop: quoteText.length > 460 });
      return;
    }
  });

  // ── Lightbox close + gallery navigation ──
  const lb = document.getElementById('lightbox');
  lb.addEventListener('click', e => {
    if (e.target === lb || e.target === document.getElementById('lightbox-img') || e.target === document.getElementById('lightbox-video')) {
      closeLightbox();
    }
  });
  document.getElementById('lightbox-prev')?.addEventListener('click', e => { e.stopPropagation(); lightboxPrev(); });
  document.getElementById('lightbox-next')?.addEventListener('click', e => { e.stopPropagation(); lightboxNext(); });

  // ── Content overlay close ──
  const co = document.getElementById('content-overlay');
  co.addEventListener('click', e => {
    if (e.target === co || e.target.classList.contains('overlay-close')) {
      closeContentOverlay();
    }
  });
  co.querySelector('.overlay-close').addEventListener('click', closeContentOverlay);

  // Handle link clicks inside content overlay (tg:// deep links, etc.)
  co.addEventListener('click', e => {
    const link = e.target.closest('a[href]');
    if (link) {
      e.preventDefault();
      e.stopPropagation();
      const href = link.getAttribute('href');
      if (href) window.open(href, '_blank');
    }
  });

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

    // Show Rename only for PDF cards
    const renameBtn = document.getElementById('ctx-rename-btn');
    if (renameBtn) {
      const isPdf = card.classList.contains('card-pdf');
      renameBtn.style.display = isPdf ? '' : 'none';
      renameBtn.previousElementSibling.style.display = isPdf ? '' : 'none'; // divider above rename
      renameBtn.nextElementSibling.style.display = isPdf ? '' : 'none'; // divider below rename
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

  document.addEventListener('click', e => {
    closeCtxMenu();
    // Close tgpost hider popups on outside click
    if (!e.target.closest('.tgpost-hider-dot')) {
      document.querySelectorAll('.tgpost-hider-popup.visible').forEach(p => p.classList.remove('visible'));
    }
  });
  window.addEventListener('scroll', closeCtxMenu, true);

  ctxMenu.addEventListener('click', async e => {
    const btn = e.target.closest('[data-ctx-action]');
    if (!btn || !ctxTargetItemId) return;
    const action = btn.dataset.ctxAction;
    const targetId = ctxTargetItemId;
    closeCtxMenu();

    if (action === 'rename') {
      const cardEl = document.querySelector(`.card[data-id="${targetId}"]`);
      if (!cardEl) return;
      const titleEl = cardEl.querySelector('.pdf-title');
      if (!titleEl) return;

      const currentText = titleEl.textContent.trim();
      const input = document.createElement('input');
      input.type = 'text';
      input.className = 'pdf-title-input';
      input.value = currentText;
      titleEl.replaceWith(input);
      input.focus();
      input.select();

      let committed = false;
      function commitRename() {
        if (committed) return;
        committed = true;
        const newTitle = input.value.trim();
        if (newTitle && newTitle !== currentText) {
          renamePdfItem(targetId, newTitle);
        } else {
          const div = document.createElement('div');
          div.className = 'pdf-title';
          div.textContent = currentText;
          input.replaceWith(div);
        }
      }

      input.addEventListener('keydown', e => {
        if (e.key === 'Enter') { e.preventDefault(); input.blur(); }
        if (e.key === 'Escape') {
          committed = true;
          const div = document.createElement('div');
          div.className = 'pdf-title';
          div.textContent = currentText;
          input.replaceWith(div);
        }
      });
      input.addEventListener('blur', commitRename, { once: true });

    } else if (action === 'delete') {
      await deleteItem(targetId);
    } else if (action === 'set-type') {
      await changeItemType(targetId, btn.dataset.typeValue, null);
    } else if (action === 'set-secondary') {
      await changeItemType(targetId, null, btn.dataset.typeValue);
    }
  });

  // ── Keyboard: Escape closes overlays, arrows navigate gallery ──
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      closeLightbox();
      closeContentOverlay();
      closeCtxMenu();
    } else if (e.key === 'ArrowLeft') {
      const lb = document.getElementById('lightbox');
      if (!lb.classList.contains('hidden')) { e.preventDefault(); lightboxPrev(); }
    } else if (e.key === 'ArrowRight') {
      const lb = document.getElementById('lightbox');
      if (!lb.classList.contains('hidden')) { e.preventDefault(); lightboxNext(); }
    }
  });
});

// ─── AI inline analysis (works in both extension and standalone) ──────────────

const AI_PROMPT_IMAGE = `Analyze this photo/image and return ONLY valid JSON, no other text:
{"content_type":null,"content_type_secondary":null,"title":"","description":"detailed description","materials":[],"color_palette":null,"color_subject":null,"color_top3":[],"text_on_image":"","price":"","author":"","tweet_text":""}

Rules:
- content_type: ONLY "product" (if purchasable item WITH visible price) or null. No other values for direct photos.
- content_type_secondary: null for direct photos.
- title: primary heading/title visible (under 80 chars). Empty if none.
- description: 2-4 sentences in English describing composition, objects, mood.
- materials: textures/materials visible. Empty array if none.
- color_palette: overall dominant color. Allowed: red,violet,pink,yellow,green,blue,brown,white,black,bw. Null if unclear.
- color_subject: main subject color (not background). Null if same as palette.
- color_top3: top 1-3 colors by area. Don't pad.
- text_on_image: ALL visible text verbatim. Empty if none.
- price: product price with currency (only if single hero product). Empty otherwise.
- author: empty. tweet_text: empty.
- All fields must be present. No markdown.`;

const AI_PROMPT_LINK = `Analyze this saved link and return ONLY valid JSON, no other text:
{"content_type":null,"content_type_secondary":null,"title":"","description":"detailed description","materials":[],"color_palette":null,"color_subject":null,"color_top3":[],"text_on_image":"","price":"","author":"","tweet_text":""}

Rules:
- content_type: "article","video","product","xpost","tool","pdf" or null.
- content_type_secondary: different from primary or null.
- title: primary heading (under 80 chars).
- description: 2-4 sentences in English.
- materials: textures visible. Empty array if none.
- color_palette/color_subject/color_top3: allowed values: red,violet,pink,yellow,green,blue,brown,white,black,bw.
- text_on_image: visible text verbatim.
- price: only for single hero product with visible price.
- author: @handle for xpost. tweet_text: tweet text for xpost.
- All fields must be present. No markdown.`;

const AI_PROMPT_PDF = `Analyze this PDF document and return ONLY valid JSON, no other text:
{"content_type":"pdf","content_type_secondary":null,"title":"","description":"detailed description: what the document is about, key topics, structure","materials":[],"color_palette":null,"color_subject":null,"color_top3":[],"text_on_image":"","price":"","author":"","tweet_text":""}

Rules:
- content_type: always "pdf".
- content_type_secondary: null unless the PDF is about a product/tool.
- title: document title from first page heading or cover (under 80 chars).
- description: 2-4 sentences summarizing the document content.
- text_on_image: first ~500 characters of visible text.
- author: document author if visible. Empty otherwise.
- color_palette/color_subject/color_top3: visual appearance of pages. Null/empty if plain text.
- All fields must be present. No markdown.`;

// Fetch a Telegram file as blob — uses CORS proxy in standalone mode
async function fetchTgFile(filePath) {
  const directUrl = `https://api.telegram.org/file/bot${STATE.botToken}/${filePath}`;
  // In extension mode, direct fetch works (service worker context or extension origin)
  // In standalone mode (polyfill), Telegram file downloads are CORS-blocked
  const isStandalone = typeof PROXY_URL !== 'undefined';
  if (isStandalone) {
    console.log('[AI] Fetching file via CORS proxy: %s', filePath);
    const mimeType = filePath.endsWith('.png') ? 'image/png'
      : filePath.endsWith('.gif') ? 'image/gif'
      : filePath.endsWith('.webp') ? 'image/webp'
      : 'image/jpeg';
    const res = await fetch(PROXY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        service: 'telegram',
        token: STATE.botToken,
        path: `/file/${filePath}`,
        method: 'GET',
        binary: true,
        contentType: mimeType
      })
    });
    if (!res.ok) throw new Error(`CORS proxy file fetch failed: ${res.status}`);
    return res.blob();
  } else {
    const res = await fetch(directUrl);
    if (!res.ok) throw new Error(`TG file fetch failed: ${res.status}`);
    return res.blob();
  }
}

async function viewerAnalyzeItem(item, settings) {
  console.log('[AI] viewerAnalyzeItem called, type=%s, fileId=%s, apiKey=%s, provider=%s',
    item.type, item.fileId ? item.fileId.slice(-15) : 'none',
    settings.aiApiKey ? 'set' : 'MISSING', settings.aiProvider || 'google');
  if (!settings.aiApiKey) { console.warn('[AI] No API key, skipping'); return null; }
  const provider = settings.aiProvider || 'google';
  const model = settings.aiModel || (provider === 'google' ? 'gemini-2.0-flash' : 'claude-haiku-4-5-20251001');
  const isPdf = item.type === 'pdf';
  const isDirectImage = item.type === 'image' || item.type === 'gif' || item.type === 'video';
  const prompt = isPdf ? AI_PROMPT_PDF : isDirectImage ? AI_PROMPT_IMAGE : AI_PROMPT_LINK;

  let responseText = null;

  // PDF: send full file to AI (not as image)
  if (isPdf) {
    try {
      let base64 = null;

      // Prefer local blob (avoids TG getFile 20MB limit)
      if (item._localBlob) {
        console.log('[AI] PDF analysis, using local blob (%dKB)', Math.round(item._localBlob.size / 1024));
        const buffer = await item._localBlob.arrayBuffer();
        const bytes = new Uint8Array(buffer);
        let binary = '';
        for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
        base64 = btoa(binary);
      } else if (item.fileId && STATE.botToken) {
        console.log('[AI] PDF analysis, fetching file via TG…');
        const fileRes = await fetch(`https://api.telegram.org/bot${STATE.botToken}/getFile?file_id=${item.fileId}`);
        const fileData = await fileRes.json();
        if (fileData.ok && fileData.result?.file_path) {
          const pdfBlob = await fetchTgFile(fileData.result.file_path);
          const buffer = await pdfBlob.arrayBuffer();
          const bytes = new Uint8Array(buffer);
          let binary = '';
          for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
          base64 = btoa(binary);
        }
      }

      if (base64) {
        console.log('[AI] PDF base64 ready, size=%dKB, sending to %s/%s', Math.round(base64.length / 1024), provider, model);

        if (provider === 'google') {
          const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${settings.aiApiKey}`;
          const res = await bgFetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ contents: [{ parts: [
              { inline_data: { mime_type: 'application/pdf', data: base64 } },
              { text: prompt }
            ] }] })
          });
          if (res.ok) {
            const data = await res.json();
            responseText = data.candidates?.[0]?.content?.parts?.[0]?.text || null;
          } else {
            console.warn('[AI] Gemini PDF error:', (await res.text()).slice(0, 300));
          }
        } else {
          const res = await bgFetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
              'x-api-key': settings.aiApiKey,
              'anthropic-version': '2023-06-01',
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              model, max_tokens: 300,
              messages: [{ role: 'user', content: [
                { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: base64 } },
                { type: 'text', text: prompt }
              ] }]
            })
          });
          if (res.ok) {
            const data = await res.json();
            responseText = data.content?.[0]?.text || null;
          } else {
            console.warn('[AI] Anthropic PDF error:', (await res.text()).slice(0, 300));
          }
        }
      }
    } catch (e) {
      console.warn('[AI] PDF analysis failed:', e.message);
    }
  }

  // Try to get image from Telegram fileId (non-PDF)
  if (!responseText && !isPdf && item.fileId && STATE.botToken) {
    try {
      console.log('[AI] Fetching file info from TG for fileId=...%s', item.fileId.slice(-15));
      const fileRes = await fetch(`https://api.telegram.org/bot${STATE.botToken}/getFile?file_id=${item.fileId}`);
      const fileData = await fileRes.json();
      console.log('[AI] TG getFile result: ok=%s, path=%s', fileData.ok, fileData.result?.file_path || 'none');
      if (fileData.ok && fileData.result?.file_path) {
        const ext = fileData.result.file_path.split('.').pop()?.toLowerCase();
        const IMAGE_EXTS = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'tiff', 'heic'];
        let base64 = null;
        let mimeType = null;

        if (IMAGE_EXTS.includes(ext)) {
          console.log('[AI] Fetching image as base64, ext=%s', ext);
          const imgBlob = await fetchTgFile(fileData.result.file_path);
          const buffer = await imgBlob.arrayBuffer();
          const bytes = new Uint8Array(buffer);
          let binary = '';
          for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
          base64 = btoa(binary);
          mimeType = ext === 'gif' ? 'image/gif' : ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : 'image/jpeg';
        } else if (ext === 'svg') {
          // SVG: rasterize to PNG via Canvas API (same approach as bot's Resvg)
          console.log('[AI] SVG detected, rasterizing via Canvas…');
          try {
            const svgBlob = await fetchTgFile(fileData.result.file_path);
            const svgText = await svgBlob.text();
            if (svgText.length > 50) {
              const blob = new Blob([svgText], { type: 'image/svg+xml' });
              const blobUrl = URL.createObjectURL(blob);
              const img = new Image();
              await new Promise((resolve, reject) => {
                img.onload = resolve;
                img.onerror = reject;
                img.src = blobUrl;
              });
              const canvas = document.createElement('canvas');
              const w = Math.min(img.naturalWidth || 800, 800);
              const h = img.naturalHeight ? Math.round(w * img.naturalHeight / img.naturalWidth) : 800;
              canvas.width = w;
              canvas.height = h;
              const ctx = canvas.getContext('2d');
              ctx.fillStyle = '#ffffff';
              ctx.fillRect(0, 0, w, h);
              ctx.drawImage(img, 0, 0, w, h);
              URL.revokeObjectURL(blobUrl);
              const dataUrl = canvas.toDataURL('image/png');
              base64 = dataUrl.split(',')[1];
              mimeType = 'image/png';
              console.log('[AI] SVG rasterized to PNG, base64 size=%dKB', Math.round(base64.length / 1024));
            }
          } catch (svgErr) {
            console.warn('[AI] SVG rasterization failed:', svgErr.message);
          }
        } else {
          console.log('[AI] File ext=%s is not a supported image, skipping image analysis', ext);
        }

        if (base64 && mimeType) {
          console.log('[AI] Image base64 ready, size=%dKB, sending to %s/%s', Math.round(base64.length / 1024), provider, model);

          if (provider === 'google') {
            const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${settings.aiApiKey}`;
            const res = await bgFetch(url, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ contents: [{ parts: [
                { inline_data: { mime_type: mimeType, data: base64 } },
                { text: prompt }
              ] }] })
            });
            console.log('[AI] Gemini response: ok=%s, status=%s', res.ok, res.status);
            if (res.ok) {
              const data = await res.json();
              responseText = data.candidates?.[0]?.content?.parts?.[0]?.text || null;
            } else {
              const errText = await res.text();
              console.warn('[AI] Gemini error:', errText.slice(0, 300));
            }
          } else {
            const res = await bgFetch('https://api.anthropic.com/v1/messages', {
              method: 'POST',
              headers: {
                'x-api-key': settings.aiApiKey,
                'anthropic-version': '2023-06-01',
                'Content-Type': 'application/json'
              },
              body: JSON.stringify({
                model, max_tokens: 300,
                messages: [{ role: 'user', content: [
                  { type: 'image', source: { type: 'base64', media_type: mimeType, data: base64 } },
                  { type: 'text', text: prompt }
                ] }]
              })
            });
            console.log('[AI] Anthropic response: ok=%s, status=%s', res.ok, res.status);
            if (res.ok) {
              const data = await res.json();
              responseText = data.content?.[0]?.text || null;
            } else {
              const errText = await res.text();
              console.warn('[AI] Anthropic error:', errText.slice(0, 300));
            }
          }
        }
      }
    } catch (e) {
      console.warn('[AI] Image analysis failed, falling back to text:', e);
    }
  } else {
    console.log('[AI] No fileId or botToken, skipping image path');
  }

  // Text fallback
  if (!responseText) {
    const context = [
      item.sourceUrl ? `URL: ${item.sourceUrl}` : '',
      item.content ? `Content: ${item.content.slice(0, 500)}` : '',
      item.tagName ? `User tag: ${item.tagName}` : ''
    ].filter(Boolean).join('\n');

    if (!context.trim()) {
      console.log('[AI] No image and no text context, nothing to analyze');
      return null;
    }

    const fullPrompt = `${AI_PROMPT_LINK}\n\nContent to analyze:\n${context}`;
    console.log('[AI] Text fallback, context length=%d, sending to %s/%s', context.length, provider, model);

    if (provider === 'google') {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${settings.aiApiKey}`;
      const res = await bgFetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ parts: [{ text: fullPrompt }] }] })
      });
      console.log('[AI] Gemini text response: ok=%s, status=%s', res.ok, res.status);
      if (res.ok) {
        const data = await res.json();
        responseText = data.candidates?.[0]?.content?.parts?.[0]?.text || null;
      } else {
        const errText = await res.text();
        console.warn('[AI] Gemini text error:', errText.slice(0, 300));
      }
    } else {
      const res = await bgFetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key': settings.aiApiKey,
          'anthropic-version': '2023-06-01',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model, max_tokens: 300,
          messages: [{ role: 'user', content: fullPrompt }]
        })
      });
      console.log('[AI] Anthropic text response: ok=%s, status=%s', res.ok, res.status);
      if (res.ok) {
        const data = await res.json();
        responseText = data.content?.[0]?.text || null;
      } else {
        const errText = await res.text();
        console.warn('[AI] Anthropic text error:', errText.slice(0, 300));
      }
    }
  }

  if (!responseText) { console.warn('[AI] No response text from AI'); return null; }

  try {
    const cleaned = responseText.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
    const parsed = JSON.parse(cleaned);
    if (isDirectImage && parsed.content_type !== 'product') parsed.content_type = null;
    if (isPdf) parsed.content_type = 'pdf'; // PDF is always PDF, AI can't override
    console.log('[AI] Parsed result: type=%s, desc=%s', parsed.content_type, (parsed.description || '').slice(0, 60));
    return parsed;
  } catch (e) {
    console.warn('[AI] Parse error:', e, responseText?.slice(0, 200));
    return null;
  }
}

async function patchNotionWithAI(pageId, aiResult, existingAiData) {
  if (!pageId || !aiResult) return;
  const properties = { 'ai_analyzed': { checkbox: true } };

  properties['ai_type'] = aiResult.content_type
    ? { select: { name: aiResult.content_type } }
    : { select: null };
  properties['ai_type_secondary'] = aiResult.content_type_secondary
    ? { select: { name: aiResult.content_type_secondary } }
    : { select: null };
  if (aiResult.description) {
    properties['ai_description'] = { rich_text: [{ text: { content: aiResult.description.slice(0, 2000) } }] };
  }

  const aiDataPayload = { ...(existingAiData || {}) };
  if (aiResult.title) aiDataPayload.title = aiResult.title;
  if (aiResult.materials?.length) aiDataPayload.materials = aiResult.materials;
  if (aiResult.color_palette) aiDataPayload.color_palette = aiResult.color_palette;
  if (aiResult.color_subject) aiDataPayload.color_subject = aiResult.color_subject;
  if (aiResult.color_top3?.length) aiDataPayload.color_top3 = aiResult.color_top3;
  if (aiResult.text_on_image) aiDataPayload.text_on_image = aiResult.text_on_image;
  if (aiResult.price) aiDataPayload.price = aiResult.price;
  if (aiResult.author) aiDataPayload.author = aiResult.author;
  if (aiResult.tweet_text) aiDataPayload.tweet_text = aiResult.tweet_text;

  if (Object.keys(aiDataPayload).length) {
    // Notion rich_text limit is 2000 chars. Truncate long text fields to fit,
    // never blindly slice JSON (that corrupts the structure and breaks parsing).
    const LIMIT = 2000;
    let json = JSON.stringify(aiDataPayload);
    if (json.length > LIMIT) {
      // Progressively trim long text fields (least critical first)
      const trimFields = ['text_on_image', 'tweet_text', 'title'];
      for (const field of trimFields) {
        if (!aiDataPayload[field]) continue;
        const excess = json.length - LIMIT;
        if (excess <= 0) break;
        const maxLen = Math.max(0, aiDataPayload[field].length - excess - 50);
        aiDataPayload[field] = maxLen > 0 ? aiDataPayload[field].slice(0, maxLen) + '…' : '';
        json = JSON.stringify(aiDataPayload);
      }
    }
    // If still over limit (shouldn't happen), drop all AI text fields rather than corrupt JSON
    if (json.length > LIMIT) {
      delete aiDataPayload.text_on_image;
      delete aiDataPayload.tweet_text;
      delete aiDataPayload.title;
      delete aiDataPayload.description;
      json = JSON.stringify(aiDataPayload);
    }
    if (json.length <= LIMIT) {
      properties['ai_data'] = { rich_text: [{ text: { content: json } }] };
    } else {
      console.warn('[AI] ai_data too large (%d chars), skipping update to preserve existing data', json.length);
    }
  }

  try {
    await notionPatch(pageId, { properties });
  } catch (e) {
    console.warn('[AI] Notion patch error:', e);
  }
}

// ─── Repair corrupted ai_data (one-time, from JSON truncation bug) ────────────
async function repairCorruptedAiData() {
  const repairedItems = STATE.items.filter(it => it.ai_data?._repaired);
  const corruptedItems = STATE.items.filter(it => it.ai_data?._corrupted);
  if (!repairedItems.length && !corruptedItems.length) return;
  console.log('[Repair] %d salvaged, %d unsalvageable items', repairedItems.length, corruptedItems.length);

  for (const item of repairedItems) {
    try {
      const cleaned = { ...item.ai_data };
      delete cleaned._repaired;
      await notionPatch(item.id, { properties: {
        'ai_data': { rich_text: [{ text: { content: JSON.stringify(cleaned) } }] },
        'ai_analyzed': { checkbox: false }
      }});
      item.ai_data = cleaned;
      item.ai_analyzed = false;
    } catch (e) { console.warn('[Repair] Failed for', item.id, e); }
  }
  for (const item of corruptedItems) {
    try {
      await notionPatch(item.id, { properties: {
        'ai_data': { rich_text: [{ text: { content: '{}' } }] },
        'ai_analyzed': { checkbox: false }
      }});
      item.ai_data = {};
      item.ai_analyzed = false;
    } catch (e) { console.warn('[Repair] Failed for', item.id, e); }
  }
  const total = repairedItems.length + corruptedItems.length;
  showToast(`Repaired ${total} items with corrupted data. Reload to see fixed layout.`);
}

// ─── Full repair (manual, from settings) ──────────────────────────────────────
async function runFullRepair() {
  const btn = document.getElementById('sp-repair-btn');
  const status = (msg) => { if (btn) btn.textContent = msg; };

  // 1. Re-fetch all pages from Notion
  status('Fetching pages…');
  const pages = await fetchNotion();
  const items = pages.map(parseItem);

  // 2. Find corrupted ai_data
  const repaired = items.filter(it => it.ai_data?._repaired);
  const corrupted = items.filter(it => it.ai_data?._corrupted);
  let fixed = 0;

  // 3. Write salvaged data back to Notion
  if (repaired.length) {
    status(`Repairing ${repaired.length} items…`);
    for (const item of repaired) {
      try {
        const cleaned = { ...item.ai_data };
        delete cleaned._repaired;
        await notionPatch(item.id, { properties: {
          'ai_data': { rich_text: [{ text: { content: JSON.stringify(cleaned) } }] },
          'ai_analyzed': { checkbox: false }
        }});
        fixed++;
      } catch (e) { console.warn('[Repair] Failed for', item.id, e); }
    }
  }

  // 4. Reset unsalvageable items
  if (corrupted.length) {
    status(`Resetting ${corrupted.length} items…`);
    for (const item of corrupted) {
      try {
        await notionPatch(item.id, { properties: {
          'ai_data': { rich_text: [{ text: { content: '{}' } }] },
          'ai_analyzed': { checkbox: false }
        }});
        fixed++;
      } catch (e) { console.warn('[Repair] Failed for', item.id, e); }
    }
  }

  // 5. Clear file cache to force fresh URL resolution
  status('Clearing cache…');
  localStorage.removeItem('tg_file_cache');

  // 6. Done
  const msg = fixed > 0
    ? `Repaired ${fixed} items. Reloading…`
    : 'No corrupted items found. Clearing cache & reloading…';
  status(msg);
  showToast(msg);
  setTimeout(() => location.reload(), 1500);
}

// ─── AI background processing ─────────────────────────────────────────────────
async function runAiBackgroundProcessing() {
  console.log('[AI] runAiBackgroundProcessing called, STATE.aiEnabled=%s, STATE.aiAutoInViewer=%s', STATE.aiEnabled, STATE.aiAutoInViewer);
  const pending = STATE.items.filter(item => !item.ai_analyzed && item.id && item.type !== 'quote');
  console.log('[AI] pending items: %d', pending.length);
  if (!pending.length) {
    document.getElementById('ai-status').textContent = '✓ All analyzed';
    setTimeout(() => { document.getElementById('ai-status').textContent = ''; }, 3000);
    return;
  }

  const settings = await getSettings();
  console.log('[AI] settings: aiApiKey=%s, aiProvider=%s, aiModel=%s',
    settings.aiApiKey ? 'set' : 'MISSING', settings.aiProvider, settings.aiModel);
  if (!settings.aiApiKey) {
    console.log('[AI] No API key, skipping');
    return;
  }

  const aiStatus = document.getElementById('ai-status');
  let done = 0;
  const BATCH = 3;

  for (let i = 0; i < pending.length; i += BATCH) {
    const batch = pending.slice(i, i + BATCH);
    await Promise.all(batch.map(async item => {
      try {
        // For albums: find the first image/gif fileId to send to AI
        const albumImageEntry = (item.albumMedia || []).find(m =>
          m.fileId && (m.mediaType === 'image' || m.mediaType === 'gif' || !m.mediaType)
        );

        // Albums with only non-image media (PDF, document, video) — skip AI for the album card
        // Each file has its own Notion page that gets analyzed separately
        if (item.albumMedia?.length > 0 && !albumImageEntry) {
          item.ai_analyzed = true;
          // Mark as analyzed in Notion (just the checkbox, no AI data)
          try {
            await bgFetch(`https://api.notion.com/v1/pages/${item.id}`, {
              method: 'PATCH',
              headers: { 'Authorization': `Bearer ${STATE.notionToken}`, 'Notion-Version': NOTION_VERSION, 'Content-Type': 'application/json' },
              body: JSON.stringify({ properties: { 'ai_analyzed': { checkbox: true } } })
            });
          } catch {}
          done++;
          return;
        }

        const aiFileId = albumImageEntry ? albumImageEntry.fileId : item.fileId;
        const aiType = albumImageEntry ? 'image' : item.type;

        // For PDF/video: AI needs the actual file, not the display thumbnail
        // But for >20MB files, TG getFile won't work — use thumbnail instead
        const isLarge = item.ai_data?.fileSize && item.ai_data.fileSize > 20 * 1024 * 1024;
        let realFileId = aiFileId;
        if (item.type === 'pdf' && item.pdfFileId && !isLarge) realFileId = item.pdfFileId;
        else if (item.type === 'video' && item.videoFileId && !isLarge) realFileId = item.videoFileId;

        const aiItem = {
          type: aiType,
          fileId: realFileId,
          sourceUrl: item.sourceUrl,
          content: item.content,
          tagName: item.tag,
          _localBlob: item._localBlob || null,
        };

        const result = await viewerAnalyzeItem(aiItem, settings);
        if (result) {
          // Patch Notion
          await patchNotionWithAI(item.id, result, item.ai_data || {});

          // Update local state
          item.ai_type = result.content_type || item.ai_type;
          item.ai_type_secondary = result.content_type_secondary || item.ai_type_secondary;
          item.ai_description = result.description || item.ai_description;
          if (result.materials?.length) item.ai_data.materials = result.materials;
          if (result.color_palette) item.ai_data.color_palette = result.color_palette;
          if (result.color_subject) item.ai_data.color_subject = result.color_subject;
          if (result.color_top3?.length) item.ai_data.color_top3 = result.color_top3;
          if (result.text_on_image) item.ai_data.text_on_image = result.text_on_image;
          if (result.price) item.ai_data.price = result.price;
          if (result.author) item.ai_data.author = result.author;
          if (result.tweet_text) item.ai_data.tweet_text = result.tweet_text;
          if (result.title) item.ai_data.title = result.title;
          item.ai_analyzed = true;

          const freshCard = document.querySelector(`.card[data-id="${item.id}"]`);
          if (freshCard) freshCard.outerHTML = renderCard(item);
        }
      } catch (e) {
        console.warn('[AI] Analysis error for item', item.id, e);
      }
      done++;
      aiStatus.textContent = `Analyzing ${done}/${pending.length}…`;
    }));
    if (i + BATCH < pending.length) await new Promise(r => setTimeout(r, 600));
  }

  aiStatus.textContent = `✓ ${done} analyzed`;
  setTimeout(() => { aiStatus.textContent = ''; }, 4000);
}

// ─── Drag & Drop ────────────────────────────────────────────────────────────

function setupDragDrop() {
  let dragCounter = 0;
  const overlay = document.getElementById('drop-overlay');
  const quickZone = document.getElementById('drop-zone-quick');
  const noteZone = document.getElementById('drop-zone-note');
  if (!overlay) return;

  document.addEventListener('dragenter', e => {
    if (!e.dataTransfer?.types.includes('Files')) return;
    e.preventDefault();
    // If note editor is open, don't show drop overlay — let editor handle the drop
    if (!document.getElementById('note-editor').classList.contains('hidden')) return;
    dragCounter++;
    if (dragCounter === 1) overlay.classList.remove('hidden');
  });

  document.addEventListener('dragover', e => {
    if (!e.dataTransfer?.types.includes('Files')) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  });

  document.addEventListener('dragleave', () => {
    dragCounter--;
    if (dragCounter <= 0) {
      dragCounter = 0;
      overlay.classList.add('hidden');
      quickZone.classList.remove('drag-over');
      noteZone.classList.remove('drag-over');
    }
  });

  quickZone.addEventListener('dragenter', e => { e.preventDefault(); quickZone.classList.add('drag-over'); });
  quickZone.addEventListener('dragleave', () => quickZone.classList.remove('drag-over'));
  quickZone.addEventListener('dragover', e => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; });
  noteZone.addEventListener('dragenter', e => { e.preventDefault(); noteZone.classList.add('drag-over'); });
  noteZone.addEventListener('dragleave', () => noteZone.classList.remove('drag-over'));
  noteZone.addEventListener('dragover', e => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; });

  // Catch drops outside zones
  overlay.addEventListener('drop', e => {
    e.preventDefault();
    dragCounter = 0;
    overlay.classList.add('hidden');
    quickZone.classList.remove('drag-over');
    noteZone.classList.remove('drag-over');
  });

  quickZone.addEventListener('drop', async e => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter = 0;
    overlay.classList.add('hidden');
    quickZone.classList.remove('drag-over');
    const files = [...e.dataTransfer.files];
    if (!files.length) return;
    if (!STATE.chatId || !STATE.botToken) { showToast('Set Chat ID in settings first'); return; }
    handleQuickSaveFiles(files);
  });

  noteZone.addEventListener('drop', e => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter = 0;
    overlay.classList.add('hidden');
    noteZone.classList.remove('drag-over');
    const files = [...e.dataTransfer.files];
    openNoteEditor(files);
  });
}

async function handleQuickSaveFiles(files) {
  // Show tag toast first, wait for selection, then upload with tag
  const tags = STATE.customTags.filter(t => t.name && t.name.trim());
  let selectedTagName = null;

  if (tags.length > 0) {
    console.log('[QuickSave] customTags=%d, showing tag toast', tags.length);
    selectedTagName = await showTagSelectionInViewer();
    console.log('[QuickSave] selectedTag=%s', selectedTagName);
  } else {
    console.log('[QuickSave] no customTags, skipping tag toast');
  }

  const total = files.length;
  showToast(`Uploading ${total} file${total > 1 ? 's' : ''}…`);

  if (total === 1) {
    // Single file → one card
    const file = files[0];
    try {
      const result = await uploadFileToTelegram(file, STATE.botToken, STATE.chatId);
      // Build ai_data matching bot's buildAiDataFromParsed output
      const aiData = { mediaType: result.type };
      if (result.fileName) aiData.fileName = result.fileName;
      if (file.size) aiData.fileSize = file.size;
      if (result.thumbnailFileId) aiData.thumbnailFileId = result.thumbnailFileId;
      if (result.audioTitle) aiData.audioTitle = result.audioTitle;
      if (result.audioPerformer) aiData.audioPerformer = result.audioPerformer;
      if (result.audioDuration) aiData.audioDuration = result.audioDuration;

      // For Notion, store the main playback file ID (not thumbnail)
      const notionFileId = result.videoFileId || result.animationFileId || result.fileId;
      const notionPageId = await createNotionPage({
        type: result.type, fileId: notionFileId,
        tagName: selectedTagName, aiData,
      });

      // Forward to storage channel: >20MB files OR unknown document types (matches bot logic)
      const isLargeFile = file.size > 20 * 1024 * 1024;
      const isUnknownDoc = result.type === 'document';
      console.log('[Upload] fileSize=%d isLarge=%s isUnknownDoc=%s messageId=%s storageChannelId=%s',
        file.size, isLargeFile, isUnknownDoc, result.messageId, STATE.storageChannelId || 'EMPTY');
      if ((isLargeFile || isUnknownDoc) && result.messageId && STATE.chatId) {
        forwardToStorageChannel(result.messageId, notionPageId, aiData);
      }

      // For PDF/video/audio: display thumbnail, store main fileId for playback/open
      // For images/SVG/gif/document: display main fileId
      const isPdf = result.type === 'pdf';
      const isVideo = result.type === 'video';
      const isAudio = result.type === 'audio';
      const displayFileId = (isPdf || isVideo || isAudio) && result.thumbnailFileId
        ? result.thumbnailFileId : result.fileId;
      console.log('[Upload] display: type=%s thumbFileId=%s displayFileId=%s notionFileId=%s',
        result.type,
        result.thumbnailFileId?.slice(-20) || 'null',
        displayFileId?.slice(-20) || 'null',
        notionFileId?.slice(-20) || 'null');

      let imgUrl = null;
      if (displayFileId) {
        imgUrl = await resolveFileId(STATE.botToken, displayFileId);
        // SVG: Telegram serves with wrong content-type → proxy to get blob URL
        if (imgUrl && /\.svg$/i.test(result.fileName || '')) {
          const blobUrl = await proxySvgFile(imgUrl);
          if (blobUrl) imgUrl = blobUrl;
        }
        if (imgUrl) STATE.imageMap[displayFileId] = imgUrl;
      }

      addCardToGrid({
        id: notionPageId, url: 'viewer upload', type: result.type,
        tag: selectedTagName || '', content: '', fileId: displayFileId, sourceUrl: '',
        date: new Date().toISOString(),
        ai_type: null, ai_type_secondary: null, ai_description: '',
        ai_analyzed: false, ai_data: aiData, fileIds: [],
        _resolvedImg: imgUrl,
        _localBlob: file, // keep original file for AI analysis (avoids TG getFile 20MB limit)
        videoFileId: result.videoFileId || '',
        pdfFileId: isPdf ? notionFileId : '',
        audioFileId: isAudio ? result.fileId : '',
      });
      showToast(`Uploaded: ${file.name}`);
    } catch (err) {
      console.error('[Upload] Failed:', file.name, err);
      showToast(`Failed: ${file.name} — ${err.message}`);
    }
  } else {
    // Multiple files → album (one Notion page per file, shared mediaGroupId)
    const mediaGroupId = `viewer_${Date.now()}`;
    const uploadResults = [];
    const notionPageIds = [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      try {
        showToast(`Uploading ${i + 1}/${total}: ${file.name}`);
        const result = await uploadFileToTelegram(file, STATE.botToken, STATE.chatId);

        const aiData = { mediaType: result.type, mediaGroupId };
        if (result.fileName) aiData.fileName = result.fileName;
        if (file.size) aiData.fileSize = file.size;
        if (result.thumbnailFileId) aiData.thumbnailFileId = result.thumbnailFileId;
        const notionFileId = result.videoFileId || result.animationFileId || result.fileId;

        const notionPageId = await createNotionPage({
          type: 'tgpost', fileId: notionFileId,
          tagName: selectedTagName, aiData,
        });
        notionPageIds.push(notionPageId);
        uploadResults.push(result);

        // Forward large files (>20MB) or unknown document types to storage channel
        if ((file.size > 20 * 1024 * 1024 || result.type === 'document') && result.messageId && STATE.chatId) {
          forwardToStorageChannel(result.messageId, notionPageId, aiData);
        }
      } catch (err) {
        console.error('[Upload] Failed:', file.name, err);
        showToast(`Failed: ${file.name} — ${err.message}`);
      }
    }

    if (uploadResults.length > 0) {
      // Build albumMedia for local rendering (use thumbnail for display where available)
      const albumMedia = uploadResults.map(r => {
        const needsThumb = (r.type === 'pdf' || r.type === 'video' || r.type === 'audio') && r.thumbnailFileId;
        return {
          fileId: needsThumb ? r.thumbnailFileId : r.fileId,
          mediaType: r.type,
          videoFileId: r.videoFileId || '',
          pdfFileId: r.type === 'pdf' ? r.fileId : '',
          audioFileId: r.type === 'audio' ? r.fileId : '',
          fileName: r.fileName || '',
          storageUrl: '',
        };
      });

      // Resolve all fileIds (display thumbnails + playback IDs)
      const allFileIds = new Set();
      uploadResults.forEach(r => {
        if (r.fileId) allFileIds.add(r.fileId);
        if (r.thumbnailFileId) allFileIds.add(r.thumbnailFileId);
        if (r.videoFileId) allFileIds.add(r.videoFileId);
        if (r.animationFileId) allFileIds.add(r.animationFileId);
      });
      await Promise.all([...allFileIds].map(async fid => {
        const url = await resolveFileId(STATE.botToken, fid);
        if (url) STATE.imageMap[fid] = url;
      }));

      // SVG: proxy through CORS to fix content-type for display
      await Promise.all(uploadResults.map(async r => {
        if (/\.svg$/i.test(r.fileName || '') && r.fileId && STATE.imageMap[r.fileId]) {
          const blobUrl = await proxySvgFile(STATE.imageMap[r.fileId]);
          if (blobUrl) STATE.imageMap[r.fileId] = blobUrl;
        }
      }));

      const r0 = uploadResults[0];
      const mainDisplayId = albumMedia[0]?.fileId || r0?.fileId || '';
      const mainImgUrl = STATE.imageMap[mainDisplayId] || null;

      addCardToGrid({
        id: notionPageIds[0], url: 'viewer upload', type: 'tgpost',
        tag: selectedTagName || '', content: '', fileId: mainDisplayId, sourceUrl: '',
        date: new Date().toISOString(),
        ai_type: null, ai_type_secondary: null, ai_description: '',
        ai_analyzed: false, ai_data: { mediaType: uploadResults[0]?.type || 'image', mediaGroupId },
        fileIds: allFileIds, albumMedia,
        _resolvedImg: mainImgUrl, videoFileId: '', pdfFileId: '', audioFileId: '',
      });
      showToast(`Uploaded ${uploadResults.length} files as album`);
    }
  }

  // Trigger AI analysis for newly uploaded items
  console.log('[QuickSave] AI check: aiEnabled=%s, aiAutoInViewer=%s', STATE.aiEnabled, STATE.aiAutoInViewer);
  if (STATE.aiEnabled && STATE.aiAutoInViewer) {
    runAiBackgroundProcessing();
  }
}

// ─── Viewer Tag Toast ───────────────────────────────────────────────────────

// Returns a Promise that resolves with selected tag name or null
async function showTagSelectionInViewer() {
  const tags = STATE.customTags.filter(t => t.name && t.name.trim());
  console.log('[TagToast] customTags in STATE:', JSON.stringify(STATE.customTags));
  console.log('[TagToast] filtered tags:', tags.length);
  if (!tags.length) return null;

  // Read timerDuration from settings (default 4 seconds)
  const settings = await getSettings();
  const timerDuration = (settings.timerDuration || 4) * 1000;
  console.log('[TagToast] timerDuration=%dms', timerDuration);

  return new Promise(resolve => {
    const existing = document.querySelector('.viewer-tag-toast');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.className = 'viewer-tag-toast';
    let resolved = false;

    tags.forEach(tag => {
      const btn = document.createElement('button');
      btn.className = 'viewer-tag-btn';
      btn.innerHTML = `<span class="note-tag-dot" style="background:${tag.color || '#888'}"></span>${escapeHtml(tag.name)}`;
      btn.addEventListener('click', () => {
        if (resolved) return;
        resolved = true;
        toast.remove();
        console.log('[TagToast] selected:', tag.name);
        resolve(tag.name);
      });
      toast.appendChild(btn);
    });

    const skipBtn = document.createElement('button');
    skipBtn.className = 'viewer-tag-skip';
    skipBtn.textContent = 'skip';
    skipBtn.addEventListener('click', () => {
      if (resolved) return;
      resolved = true;
      toast.remove();
      console.log('[TagToast] skipped');
      resolve(null);
    });
    toast.appendChild(skipBtn);

    document.body.appendChild(toast);
    console.log('[TagToast] appended to body, visible=%s', !toast.classList.contains('hidden'));

    setTimeout(() => {
      if (!resolved) {
        resolved = true;
        toast.remove();
        console.log('[TagToast] auto-dismissed after %dms', timerDuration);
        resolve(null);
      }
    }, timerDuration);
  });
}

// ─── Note Editor ────────────────────────────────────────────────────────────

let _noteEditorFiles = [];
let _noteEditorSelectedTag = null;
let _linkTooltipEl = null;

function setupNoteEditor() {
  const addBtn = document.getElementById('add-note-btn');
  const editor = document.getElementById('note-editor');
  const closeBtn = document.getElementById('note-editor-close');
  const saveBtn = document.getElementById('note-editor-save');
  const textArea = document.getElementById('note-editor-text');
  if (!addBtn || !editor) return;

  addBtn.addEventListener('click', () => openNoteEditor([]));
  closeBtn.addEventListener('click', closeNoteEditor);
  saveBtn.addEventListener('click', saveNote);

  // Drag files into editor
  editor.addEventListener('dragover', e => { e.preventDefault(); e.stopPropagation(); e.dataTransfer.dropEffect = 'copy'; });
  editor.addEventListener('drop', e => {
    e.preventDefault();
    e.stopPropagation();
    [...e.dataTransfer.files].forEach(f => addFileToNoteEditor(f));
  });

  // Hyperlink: Cmd+V with text selection → wrap in <a>
  textArea.addEventListener('paste', e => {
    const sel = window.getSelection();
    if (!sel.rangeCount || sel.isCollapsed) return;

    const pastedText = (e.clipboardData || window.clipboardData).getData('text/plain');
    if (!pastedText) return;
    try { new URL(pastedText); } catch { return; }

    e.preventDefault();
    const range = sel.getRangeAt(0);
    const selectedText = range.toString();
    const link = document.createElement('a');
    link.href = pastedText;
    link.textContent = selectedText;
    link.target = '_blank';
    link.rel = 'noopener';
    range.deleteContents();
    range.insertNode(link);
    range.setStartAfter(link);
    range.collapse(true);
    sel.removeAllRanges();
    sel.addRange(range);
  });

  // Link tooltip on hover
  textArea.addEventListener('mouseover', e => {
    if (e.target.tagName === 'A') showLinkTooltip(e.target);
  });
  textArea.addEventListener('mouseout', e => {
    if (e.target.tagName === 'A') {
      setTimeout(() => {
        if (_linkTooltipEl && !_linkTooltipEl.matches(':hover')) hideLinkTooltip();
      }, 100);
    }
  });
}

function openNoteEditor(files = []) {
  const editor = document.getElementById('note-editor');
  const textArea = document.getElementById('note-editor-text');
  const attachments = document.getElementById('note-editor-attachments');

  _noteEditorFiles = [];
  _noteEditorSelectedTag = null;
  textArea.innerHTML = '';
  attachments.innerHTML = '';

  populateNoteEditorTags();
  files.forEach(f => addFileToNoteEditor(f));

  editor.classList.remove('hidden');
  textArea.focus();
}

function closeNoteEditor() {
  document.getElementById('note-editor')?.classList.add('hidden');
  _noteEditorFiles = [];
  _noteEditorSelectedTag = null;
}

function addFileToNoteEditor(file) {
  _noteEditorFiles.push(file);
  const attachments = document.getElementById('note-editor-attachments');
  const idx = _noteEditorFiles.length - 1;

  if (file.type.startsWith('image/')) {
    const thumb = document.createElement('div');
    thumb.className = 'note-attach-thumb';
    const img = document.createElement('img');
    img.src = URL.createObjectURL(file);
    const rmBtn = document.createElement('button');
    rmBtn.className = 'note-attach-remove';
    rmBtn.textContent = '\u00d7';
    rmBtn.addEventListener('click', () => { _noteEditorFiles[idx] = null; thumb.remove(); });
    thumb.appendChild(img);
    thumb.appendChild(rmBtn);
    attachments.appendChild(thumb);
  } else {
    const chip = document.createElement('div');
    chip.className = 'note-attach-file';
    const nameSpan = document.createElement('span');
    nameSpan.textContent = file.name || 'file';
    nameSpan.style.cssText = 'overflow:hidden;text-overflow:ellipsis;white-space:nowrap';
    const rmBtn = document.createElement('button');
    rmBtn.textContent = '\u00d7';
    rmBtn.style.cssText = 'background:none;border:none;color:#555;font-size:14px;cursor:pointer;margin-left:4px;flex-shrink:0';
    rmBtn.addEventListener('click', () => { _noteEditorFiles[idx] = null; chip.remove(); });
    chip.appendChild(nameSpan);
    chip.appendChild(rmBtn);
    attachments.appendChild(chip);
  }
}

function populateNoteEditorTags() {
  const container = document.getElementById('note-editor-tags');
  container.innerHTML = '';
  const tags = STATE.customTags.filter(t => t.name && t.name.trim());

  tags.forEach(tag => {
    const btn = document.createElement('button');
    btn.className = 'note-tag-btn';
    btn.innerHTML = `<span class="note-tag-dot" style="background:${tag.color}"></span>${escapeHtml(tag.name)}`;
    btn.addEventListener('click', () => {
      container.querySelectorAll('.note-tag-btn').forEach(b => b.classList.remove('selected'));
      if (_noteEditorSelectedTag === tag.name) {
        _noteEditorSelectedTag = null;
      } else {
        _noteEditorSelectedTag = tag.name;
        btn.classList.add('selected');
      }
    });
    container.appendChild(btn);
  });
}

async function saveNote() {
  const textArea = document.getElementById('note-editor-text');
  const plainText = textArea.innerText.trim();
  const files = _noteEditorFiles.filter(f => f !== null);

  if (!plainText && !files.length) { showToast('Nothing to save'); return; }
  if (!STATE.chatId || !STATE.botToken) { showToast('Set Chat ID in settings first'); return; }

  const saveBtn = document.getElementById('note-editor-save');
  saveBtn.textContent = 'Saving…';
  saveBtn.disabled = true;

  try {
    if (files.length === 0) {
      // Text only → quote
      await fetch(`https://api.telegram.org/bot${STATE.botToken}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: STATE.chatId, text: '[stash-viewer]\n' + plainText, disable_notification: true })
      });

      const notionPageId = await createNotionPage({
        type: 'quote', content: plainText, tagName: _noteEditorSelectedTag,
      });

      addCardToGrid({
        id: notionPageId, url: 'viewer note', type: 'quote',
        tag: _noteEditorSelectedTag || '', content: plainText,
        fileId: '', sourceUrl: '', date: new Date().toISOString(),
        ai_type: null, ai_type_secondary: null, ai_description: '',
        ai_analyzed: false, ai_data: {}, fileIds: [], _resolvedImg: null,
        videoFileId: '', pdfFileId: '', audioFileId: '',
      });
      showToast('Note saved');

    } else {
      // Text + files → upload all, create one Notion page per file (shared mediaGroupId)
      const uploadResults = [];
      for (const file of files) {
        showToast(`Uploading ${uploadResults.length + 1}/${files.length}…`);
        const result = await uploadFileToTelegram(file, STATE.botToken, STATE.chatId);
        result.fileName = file.name || '';
        uploadResults.push(result);
      }

      // Always use tgpost when there's text + files so content is visible on card
      const itemType = plainText ? 'tgpost' : (files.length === 1 ? uploadResults[0].type : 'tgpost');
      const mediaGroupId = files.length > 1 ? `viewer_${Date.now()}` : null;

      // Create one Notion page per file (same pattern as extension bot)
      const notionPageIds = [];
      for (let i = 0; i < uploadResults.length; i++) {
        const r = uploadResults[i];
        const aiData = { mediaType: r.type };
        if (mediaGroupId) aiData.mediaGroupId = mediaGroupId;
        if (r.fileName) aiData.fileName = r.fileName;
        if (files[i]?.size) aiData.fileSize = files[i].size;
        if (r.thumbnailFileId) aiData.thumbnailFileId = r.thumbnailFileId;
        if (r.audioTitle) aiData.audioTitle = r.audioTitle;
        if (r.audioPerformer) aiData.audioPerformer = r.audioPerformer;
        if (r.audioDuration) aiData.audioDuration = r.audioDuration;
        const notionFileId = r.videoFileId || r.animationFileId || r.fileId;
        const notionPageId = await createNotionPage({
          type: itemType,
          content: i === 0 ? plainText : '', // caption only on first page
          fileId: notionFileId,
          tagName: _noteEditorSelectedTag,
          aiData,
        });
        notionPageIds.push(notionPageId);

        // Forward large files (>20MB) or unknown document types to storage channel
        if ((files[i].size > 20 * 1024 * 1024 || r.type === 'document') && r.messageId && STATE.chatId) {
          forwardToStorageChannel(r.messageId, notionPageId, aiData);
        }
      }

      // Build albumMedia for local rendering (use thumbnail for display where available)
      const albumMedia = uploadResults.map(r => {
        const needsThumb = (r.type === 'pdf' || r.type === 'video' || r.type === 'audio') && r.thumbnailFileId;
        return {
          fileId: needsThumb ? r.thumbnailFileId : r.fileId,
          mediaType: r.type,
          videoFileId: r.videoFileId || '',
          pdfFileId: r.type === 'pdf' ? r.fileId : '',
          audioFileId: r.type === 'audio' ? r.fileId : '',
          fileName: r.fileName || '',
          storageUrl: '',
        };
      });

      // Resolve all fileIds (display thumbnails + playback IDs)
      const allFileIds = new Set();
      uploadResults.forEach(r => {
        if (r.fileId) allFileIds.add(r.fileId);
        if (r.thumbnailFileId) allFileIds.add(r.thumbnailFileId);
        if (r.videoFileId) allFileIds.add(r.videoFileId);
        if (r.animationFileId) allFileIds.add(r.animationFileId);
      });
      await Promise.all([...allFileIds].map(async fid => {
        const url = await resolveFileId(STATE.botToken, fid);
        if (url) STATE.imageMap[fid] = url;
      }));

      // SVG: proxy through CORS to fix content-type for display
      await Promise.all(uploadResults.map(async r => {
        if (/\.svg$/i.test(r.fileName || '') && r.fileId && STATE.imageMap[r.fileId]) {
          const blobUrl = await proxySvgFile(STATE.imageMap[r.fileId]);
          if (blobUrl) STATE.imageMap[r.fileId] = blobUrl;
        }
      }));

      const r0note = uploadResults[0];
      const mainDisplayId = albumMedia[0]?.fileId || r0note?.fileId || '';
      const mainImgUrl = STATE.imageMap[mainDisplayId] || null;
      const mainAiData = { mediaType: uploadResults[0]?.type || 'image' };
      if (mainAiData.mediaType === 'video' && uploadResults[0]?.videoFileId) {
        mainAiData.videoFileId = uploadResults[0].videoFileId;
      }
      if (mediaGroupId) mainAiData.mediaGroupId = mediaGroupId;

      addCardToGrid({
        id: notionPageIds[0], url: 'viewer note', type: itemType,
        tag: _noteEditorSelectedTag || '', content: plainText,
        fileId: mainDisplayId, sourceUrl: '', date: new Date().toISOString(),
        ai_type: null, ai_type_secondary: null, ai_description: '',
        ai_analyzed: false, ai_data: mainAiData,
        fileIds: [...allFileIds],
        albumMedia: files.length > 1 ? albumMedia : undefined,
        _resolvedImg: mainImgUrl,
        _localBlob: files[0], // keep original file for AI analysis
        videoFileId: uploadResults[0]?.videoFileId || '',
        pdfFileId: uploadResults[0]?.type === 'pdf' ? (uploadResults[0].videoFileId || uploadResults[0].animationFileId || uploadResults[0].fileId) : '',
        audioFileId: uploadResults[0]?.type === 'audio' ? uploadResults[0].fileId : '',
      });
      showToast('Note with files saved');
    }

    closeNoteEditor();

    // Trigger AI analysis for newly saved items
    console.log('[NoteEditor] AI check: aiEnabled=%s, aiAutoInViewer=%s', STATE.aiEnabled, STATE.aiAutoInViewer);
    if (STATE.aiEnabled && STATE.aiAutoInViewer) {
      runAiBackgroundProcessing();
    }
  } catch (err) {
    console.error('[NoteEditor] Save failed:', err);
    showToast('Save failed: ' + err.message);
  } finally {
    saveBtn.textContent = 'Save';
    saveBtn.disabled = false;
  }
}

// ─── Link Tooltip ───────────────────────────────────────────────────────────

function showLinkTooltip(linkEl) {
  hideLinkTooltip();
  const url = linkEl.href;
  const rect = linkEl.getBoundingClientRect();

  const tooltip = document.createElement('div');
  tooltip.className = 'note-link-tooltip';

  const urlLink = document.createElement('a');
  urlLink.href = url;
  urlLink.target = '_blank';
  urlLink.rel = 'noopener';
  urlLink.textContent = url.length > 40 ? url.slice(0, 40) + '…' : url;
  urlLink.style.maxWidth = '180px';

  const editBtn = document.createElement('button');
  editBtn.textContent = 'edit';
  editBtn.addEventListener('click', () => {
    const newUrl = prompt('Edit URL:', url);
    if (newUrl) linkEl.href = newUrl;
    hideLinkTooltip();
  });

  const removeBtn = document.createElement('button');
  removeBtn.textContent = 'remove';
  removeBtn.addEventListener('click', () => {
    const text = document.createTextNode(linkEl.textContent);
    linkEl.parentNode.replaceChild(text, linkEl);
    hideLinkTooltip();
  });

  tooltip.appendChild(urlLink);
  tooltip.appendChild(editBtn);
  tooltip.appendChild(removeBtn);

  tooltip.style.top = (rect.bottom + 6) + 'px';
  tooltip.style.left = rect.left + 'px';

  tooltip.addEventListener('mouseleave', hideLinkTooltip);
  document.body.appendChild(tooltip);
  _linkTooltipEl = tooltip;
}

function hideLinkTooltip() {
  if (_linkTooltipEl) { _linkTooltipEl.remove(); _linkTooltipEl = null; }
}

// ─── Bootstrap ───────────────────────────────────────────────────────────────
window.addEventListener('DOMContentLoaded', init);

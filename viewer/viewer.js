// ─── Constants ────────────────────────────────────────────────────────────────
const NOTION_VERSION = '2022-06-28';
const BASE_COLORS = [
  { name: 'red', hex: '#e74c3c' }, { name: 'orange', hex: '#e67e22' },
  { name: 'yellow', hex: '#f1c40f' }, { name: 'green', hex: '#2ecc71' },
  { name: 'blue', hex: '#3498db' }, { name: 'purple', hex: '#9b59b6' },
  { name: 'pink', hex: '#e91e8c' }, { name: 'brown', hex: '#795548' },
  { name: 'gray', hex: '#95a5a6' }, { name: 'black', hex: '#1a1a1a' }
];

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
  activeType: 'all',
  activeTags: new Set(),
  activeColors: [null, null, null, null, null, null]
};

window.__colorCache = JSON.parse(localStorage.getItem('sv_colors') || '{}');
window.__ocrCache = JSON.parse(localStorage.getItem('sv_ocr') || '{}');
let __ocrRunning = false;

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
async function startApp() {
  document.getElementById('toolbar').classList.remove('hidden');
  document.getElementById('grid-wrap').classList.remove('hidden');
  document.getElementById('ai-status').textContent = 'Loading…';

  buildColorFilters();
  setupToolbarEvents();

  try {
    const pages = await fetchNotion();
    STATE.items = pages.map(parseItem);
    STATE.imageMap = await resolveAllImages(STATE.items, STATE.botToken);
    applyFilters();
    document.getElementById('ai-status').textContent = '';

    // Background processing (non-blocking)
    processColors(STATE.items, STATE.imageMap);
    processOCR(STATE.items, STATE.imageMap).catch(e => console.warn('[OCR] failed:', e));
    if (STATE.aiEnabled && STATE.aiAutoInViewer) {
      runAiBackgroundProcessing();
    }
  } catch (e) {
    document.getElementById('ai-status').textContent = 'Error: ' + e.message;
    console.error('[Viewer] load error:', e);
  }
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
  return {
    id: page.id,
    url: p['URL']?.title?.[0]?.text?.content || '',
    type: p['Type']?.select?.name || 'link',
    tag: p['Tag']?.select?.name || '',
    content: p['Content']?.rich_text?.[0]?.text?.content || '',
    fileId: p['File ID']?.rich_text?.[0]?.text?.content || '',
    sourceUrl: p['Source URL']?.url || '',
    date: p['Date']?.date?.start || '',
    ai_type: p['ai_type']?.select?.name || null,
    ai_description: p['ai_description']?.rich_text?.[0]?.text?.content || '',
    ai_analyzed: p['ai_analyzed']?.checkbox || false,
    ai_data: aiData,
    _resolvedImg: null
  };
}

// ─── Image resolution ─────────────────────────────────────────────────────────
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

async function resolveAllImages(items, tgToken) {
  const withImages = items.filter(i => i.fileId);
  const map = {};
  const BATCH = 10;
  for (let i = 0; i < withImages.length; i += BATCH) {
    const batch = withImages.slice(i, i + BATCH);
    const urls = await Promise.all(batch.map(item => resolveFileId(tgToken, item.fileId)));
    batch.forEach((item, idx) => {
      if (urls[idx]) {
        map[item.fileId] = urls[idx];
        item._resolvedImg = urls[idx];
      }
    });
    if (i + BATCH < withImages.length) await new Promise(r => setTimeout(r, 350));
  }
  return map;
}

// ─── Color extraction (keep exact logic) ─────────────────────────────────────
function rgbToHue(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  if (d === 0) return 0;
  let h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return ((h * 60) + 360) % 360;
}

function rgbToSat(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  return max === 0 ? 0 : (max - min) / max;
}

function rgbToBaseName([r, g, b]) {
  const h = rgbToHue(r, g, b);
  const s = rgbToSat(r, g, b);
  const v = Math.max(r, g, b) / 255;
  if (v < 0.15) return 'black';
  if (s < 0.12) return 'gray';
  if (h < 15 || h >= 345) return 'red';
  if (h < 40 && s < 0.55 && v < 0.55) return 'brown';
  if (h < 40) return 'orange';
  if (h < 70) return 'yellow';
  if (h < 165) return 'green';
  if (h < 250) return 'blue';
  if (h < 290) return 'purple';
  return 'pink';
}

async function processColors(items, imageMap) {
  const thief = new ColorThief();
  const toProcess = items.filter(i => i.fileId && imageMap[i.fileId] && !window.__colorCache[i.fileId]);
  for (const item of toProcess) {
    try {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.src = imageMap[item.fileId];
      await new Promise((res, rej) => { img.onload = res; img.onerror = rej; });
      const color = thief.getColor(img);
      window.__colorCache[item.fileId] = rgbToBaseName(color);
    } catch { window.__colorCache[item.fileId] = null; }
    localStorage.setItem('sv_colors', JSON.stringify(window.__colorCache));
  }
  applyFilters();
}

async function processOCR(items, imageMap) {
  const toProcess = items.filter(i => i.fileId && imageMap[i.fileId] && window.__ocrCache[i.fileId] === undefined);
  if (!toProcess.length) return;
  if (__ocrRunning) return;
  __ocrRunning = true;
  const worker = await Tesseract.createWorker('eng');
  try {
    for (const item of toProcess) {
      try {
        const { data: { text } } = await worker.recognize(imageMap[item.fileId]);
        window.__ocrCache[item.fileId] = text.trim();
      } catch { window.__ocrCache[item.fileId] = ''; }
      localStorage.setItem('sv_ocr', JSON.stringify(window.__ocrCache));
    }
  } finally {
    await worker.terminate();
    __ocrRunning = false;
  }
  applyFilters();
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

// ─── Color filter UI ─────────────────────────────────────────────────────────
function buildColorFilters() {
  const wrap = document.getElementById('color-filters-wrap');
  wrap.innerHTML = [0,1,2,3,4,5].map(i => `
    <div class="color-circle" id="cc-${i}" data-slot="${i}">
      <div class="color-dropdown hidden" id="cd-${i}">
        ${BASE_COLORS.map(c => `<div class="color-option" style="background:${c.hex}" title="${c.name}" data-color="${c.name}" data-hex="${c.hex}" data-slot="${i}"></div>`).join('')}
      </div>
    </div>
  `).join('');

  document.addEventListener('click', e => {
    const circle = e.target.closest('.color-circle');
    const option = e.target.closest('.color-option');

    if (option) {
      e.stopPropagation();
      const slot = parseInt(option.dataset.slot);
      const name = option.dataset.color;
      const hex = option.dataset.hex;
      STATE.activeColors[slot] = STATE.activeColors[slot] === name ? null : name;
      const circleEl = document.getElementById(`cc-${slot}`);
      circleEl.style.background = STATE.activeColors[slot] ? hex : '';
      circleEl.classList.toggle('filled', !!STATE.activeColors[slot]);
      document.getElementById(`cd-${slot}`).classList.add('hidden');
      applyFilters();
      return;
    }

    if (circle) {
      e.stopPropagation();
      const slot = parseInt(circle.dataset.slot);
      if (STATE.activeColors[slot]) {
        STATE.activeColors[slot] = null;
        circle.style.background = '';
        circle.classList.remove('filled');
        applyFilters();
        return;
      }
      const dropdown = document.getElementById(`cd-${slot}`);
      const wasHidden = dropdown.classList.contains('hidden');
      document.querySelectorAll('.color-dropdown').forEach(d => d.classList.add('hidden'));
      if (wasHidden) dropdown.classList.remove('hidden');
      return;
    }

    document.querySelectorAll('.color-dropdown').forEach(d => d.classList.add('hidden'));
  });
}

// ─── Toolbar events ───────────────────────────────────────────────────────────
function setupToolbarEvents() {
  document.getElementById('search-input').addEventListener('input', e => {
    STATE.search = e.target.value.toLowerCase();
    applyFilters();
  });

  document.querySelectorAll('.type-pill').forEach(pill => {
    pill.addEventListener('click', () => {
      document.querySelectorAll('.type-pill').forEach(p => p.classList.remove('active'));
      pill.classList.add('active');
      STATE.activeType = pill.dataset.type;
      applyFilters();
    });
  });

  document.getElementById('disconnect-btn').addEventListener('click', disconnect);
}

// ─── Filtering ────────────────────────────────────────────────────────────────
function applyFilters() {
  let items = STATE.items;

  if (STATE.activeType !== 'all') {
    items = items.filter(item => {
      if (STATE.activeType === 'image') return item.type === 'image';
      return item.ai_type === STATE.activeType;
    });
  }

  if (STATE.search) {
    items = items.filter(item => {
      const hay = [
        item.url, item.content, item.sourceUrl,
        item.ai_description,
        JSON.stringify(item.ai_data),
        item.fileId ? (window.__ocrCache[item.fileId] || '') : ''
      ].join(' ').toLowerCase();
      return hay.includes(STATE.search);
    });
  }

  const activeColors = STATE.activeColors.filter(Boolean);
  if (activeColors.length) {
    items = items.filter(item => {
      const c = item.fileId ? window.__colorCache[item.fileId] : null;
      return c && activeColors.includes(c);
    });
  }

  renderAll(items);
}

// ─── Card rendering ───────────────────────────────────────────────────────────
function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function getDomain(url) {
  try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return url || ''; }
}

function renderCard(item) {
  const imgUrl = item._resolvedImg || (item.fileId ? STATE.imageMap[item.fileId] : null);
  const aiType = item.ai_type;
  const aiData = item.ai_data || {};
  const domain = getDomain(item.sourceUrl || item.url);

  const pendingDot = !item.ai_analyzed ? '<div class="badge-pending"></div>' : '';

  // ── Product ──
  if (aiType === 'product' && imgUrl) {
    return `<div class="card card-product" data-id="${item.id}" onclick="openLightbox('${escapeHtml(imgUrl)}','${escapeHtml(item.sourceUrl)}')">
      ${pendingDot}
      <img class="product-img" src="${escapeHtml(imgUrl)}" loading="lazy" alt="">
      <div class="product-info">
        <div class="product-name">${escapeHtml(aiData.product_name || item.url || domain)}</div>
        ${aiData.price ? `<div class="product-price">${escapeHtml(aiData.price)}</div>` : ''}
      </div>
    </div>`;
  }

  // ── X Post ──
  if (aiType === 'x_post') {
    const text = escapeHtml(aiData.tweet_text || item.content || item.ai_description || '');
    const author = escapeHtml(aiData.author || '');
    return `<div class="card card-xpost" data-id="${item.id}" ${item.sourceUrl ? `onclick="window.open('${escapeHtml(item.sourceUrl)}','_blank')"` : ''}>
      ${pendingDot}
      ${author ? `<div class="xpost-author">${author}</div>` : ''}
      <div class="xpost-text">${text}</div>
    </div>`;
  }

  // ── Image ──
  if (item.type === 'image' && imgUrl) {
    return `<div class="card card-image" data-id="${item.id}" onclick="openLightbox('${escapeHtml(imgUrl)}','${escapeHtml(item.sourceUrl)}')">
      ${pendingDot}
      <img class="card-img" src="${escapeHtml(imgUrl)}" loading="lazy" alt="">
      <div class="card-overlay">
        ${item.ai_description ? `<div class="overlay-desc">${escapeHtml(item.ai_description)}</div>` : ''}
      </div>
      ${aiType ? `<div class="type-badge">${escapeHtml(aiType)}</div>` : ''}
    </div>`;
  }

  // ── Link ──
  if (item.type === 'link') {
    return `<div class="card card-link" data-id="${item.id}" onclick="window.open('${escapeHtml(item.sourceUrl || item.url)}','_blank')">
      ${pendingDot}
      <img class="card-favicon" src="https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=32" alt="" onerror="this.style.display='none'">
      <span class="card-domain">${escapeHtml(domain)}</span>
      <div class="card-title">${escapeHtml(item.url || domain)}</div>
      ${item.ai_description ? `<div class="card-desc">${escapeHtml(item.ai_description)}</div>` : ''}
    </div>`;
  }

  // ── Text / Quote ──
  return `<div class="card card-text-item" data-id="${item.id}">
    ${pendingDot}
    <div class="card-quote">${escapeHtml(item.content || item.ai_description || '')}</div>
    ${domain ? `<div class="card-source">${escapeHtml(domain)}</div>` : ''}
  </div>`;
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
  masonry.innerHTML = items.map(renderCard).join('');
}

// ─── Lightbox ─────────────────────────────────────────────────────────────────
function openLightbox(imgUrl, sourceUrl) {
  const lb = document.getElementById('lightbox');
  const img = document.getElementById('lightbox-img');
  const link = document.getElementById('lightbox-link');
  img.src = imgUrl;
  if (sourceUrl && /^https?:\/\//i.test(sourceUrl)) {
    link.href = sourceUrl;
    link.textContent = getDomain(sourceUrl);
    link.classList.remove('hidden');
  } else {
    link.classList.add('hidden');
  }
  lb.classList.remove('hidden');
}

document.addEventListener('DOMContentLoaded', () => {
  const lb = document.getElementById('lightbox');
  lb.addEventListener('click', e => {
    if (e.target === lb || e.target === document.getElementById('lightbox-img')) {
      lb.classList.add('hidden');
      document.getElementById('lightbox-img').src = '';
    }
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      lb.classList.add('hidden');
      document.getElementById('lightbox-img').src = '';
    }
  });
});

// ─── AI background processing ─────────────────────────────────────────────────
async function runAiBackgroundProcessing() {
  const pending = STATE.items.filter(item => !item.ai_analyzed && item.id);
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
          fileId: item.fileId,
          sourceUrl: item.sourceUrl,
          content: item.content,
          tagName: item.tag
        },
        notionPageId: item.id
      }, response => {
        if (chrome.runtime.lastError) { resolve(); return; }
        if (response?.ok && response.result) {
          item.ai_type = response.result.type || item.ai_type;
          item.ai_description = response.result.description || item.ai_description;
          item.ai_data = { ...response.result.data, tags: response.result.tags };
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

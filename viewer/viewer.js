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
  layout: 'adaptive',   // adaptive | 4col | 3col
  align: 'masonry',     // masonry | center
  gap: 10,
  padding: 14
};


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
  document.getElementById('display-bar').classList.remove('hidden');
  document.getElementById('grid-wrap').classList.remove('hidden');
  document.getElementById('ai-status').textContent = 'Loading…';

  setupToolbarEvents();
  setupDisplayBar();

  try {
    const pages = await fetchNotion();
    STATE.items = pages.map(parseItem);
    STATE.imageMap = await resolveAllImages(STATE.items, STATE.botToken);
    applyFilters();
    document.getElementById('ai-status').textContent = '';

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
    ai_type_secondary: p['ai_type_secondary']?.select?.name || null,
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

// ─── Toolbar events ───────────────────────────────────────────────────────────
function setupToolbarEvents() {
  document.getElementById('search-input').addEventListener('input', e => {
    STATE.search = e.target.value.toLowerCase();
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
  // Layout buttons
  document.querySelectorAll('#display-bar [data-layout]').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#display-bar [data-layout]').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      STATE.layout = btn.dataset.layout;
      applyGridMode();
    });
  });

  // Gap range
  const gapRange = document.getElementById('gap-range');
  const gapVal = document.getElementById('gap-val');
  gapRange.addEventListener('input', () => {
    STATE.gap = parseInt(gapRange.value, 10);
    gapVal.textContent = STATE.gap;
    applyGridMode();
  });

  // Padding range
  const padRange = document.getElementById('padding-range');
  const padVal = document.getElementById('padding-val');
  padRange.addEventListener('input', () => {
    STATE.padding = parseInt(padRange.value, 10);
    padVal.textContent = STATE.padding;
    applyGridMode();
  });

  // Row alignment buttons
  document.querySelectorAll('#display-bar [data-align]').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#display-bar [data-align]').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      STATE.align = btn.dataset.align;
      applyGridMode();
    });
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

  // Reset all mode classes and inline overrides
  m.classList.remove('mode-adaptive', 'mode-4col', 'mode-3col', 'mode-rows', 'rows-adaptive', 'rows-4col', 'rows-3col');
  m.style.columnGap = '';
  m.style.gap = '';
  m.style.display = '';
  m.style.flexWrap = '';

  if (STATE.align === 'center') {
    // Flex-based row layout — gap handled via CSS var in .mode-rows
    m.classList.add('mode-rows');

    if (STATE.layout === '3col') m.classList.add('rows-3col');
    else if (STATE.layout === '4col') m.classList.add('rows-4col');
    else m.classList.add('rows-adaptive');

    m.querySelectorAll('.card').forEach(c => { c.style.marginBottom = ''; });
  } else {
    // CSS columns masonry mode
    m.style.columnGap = gap;

    if (STATE.layout === '4col') m.classList.add('mode-4col');
    else if (STATE.layout === '3col') m.classList.add('mode-3col');

    m.querySelectorAll('.card').forEach(c => { c.style.marginBottom = gap; });
  }
}

// ─── Filtering ────────────────────────────────────────────────────────────────
// Base types (from TG): image, link, quote
// AI types (content category): article, video, product, xpost
// Filtering: if base type selected → match item.type
//            if AI type selected → match item.ai_type
//            AND logic across base vs AI axes: item must satisfy both if both axes have selection
const BASE_TYPES = new Set(['image', 'link', 'quote']);
const AI_TYPES = new Set(['article', 'video', 'product', 'xpost', 'tool']);

function applyFilters() {
  let items = STATE.items;

  if (STATE.activeTypes.size > 0) {
    const activeBase = [...STATE.activeTypes].filter(t => BASE_TYPES.has(t));
    const activeAI = [...STATE.activeTypes].filter(t => AI_TYPES.has(t));

    items = items.filter(item => {
      // Notion still stores old 'text' records — treat as 'quote'
      const itemBaseType = item.type === 'text' ? 'quote' : item.type;
      const baseMatch = activeBase.length === 0 || activeBase.includes(itemBaseType);
      const aiMatch = activeAI.length === 0 || activeAI.includes(item.ai_type) || activeAI.includes(item.ai_type_secondary);
      return baseMatch && aiMatch;
    });
  }

  if (STATE.activeColor) {
    items = items.filter(item => item.ai_data?.color_palette === STATE.activeColor);
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

function getDomain(url) {
  try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return url || ''; }
}

const RULER_SVG = `<svg width="100%" viewBox="0 0 280 31" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M81.8652 21.2266C82.9651 21.2266 83.6975 21.4319 84.0615 21.8438C84.4295 22.2558 84.6133 22.8146 84.6133 23.5186C84.6132 24.0784 84.463 24.5142 84.1631 24.8262C83.8671 25.1381 83.4154 25.306 82.8076 25.3301C83.4195 25.3461 83.873 25.5047 84.1689 25.8047C84.4649 26.1007 84.6132 26.5261 84.6133 27.082C84.6133 27.838 84.4314 28.4267 84.0674 28.8467C83.7073 29.2625 82.973 29.4707 81.8652 29.4707C80.7813 29.4707 80.0489 29.244 79.6689 28.792C79.2932 28.336 79.1055 27.6361 79.1055 26.6924H80.3174C80.3174 27.5043 80.4433 28.0305 80.6953 28.2705C80.9473 28.5104 81.3393 28.6298 81.8711 28.6299C82.403 28.6299 82.7912 28.5142 83.0352 28.2822C83.2792 28.0502 83.4014 27.6081 83.4014 26.9561C83.4013 26.5041 83.2688 26.1925 83.0049 26.0205C82.7448 25.8446 82.269 25.7503 81.5771 25.7383V24.958C82.2688 24.942 82.7448 24.8402 83.0049 24.6523C83.2689 24.4603 83.4014 24.1441 83.4014 23.7041C83.4014 23.0762 83.2754 22.646 83.0234 22.4141C82.7754 22.1781 82.3911 22.0605 81.8711 22.0605C81.3592 22.0606 80.971 22.1865 80.707 22.4385C80.4472 22.6906 80.3174 23.2626 80.3174 24.1543H79.1055C79.1055 23.1503 79.2995 22.4124 79.6875 21.9404C80.0795 21.4644 80.8053 21.2266 81.8652 21.2266ZM226.868 21.2266C227.832 21.2266 228.505 21.428 228.885 21.832C229.265 22.232 229.454 22.7321 229.454 23.332C229.454 24.0239 229.24 24.5277 228.812 24.8438C228.699 24.9282 228.569 24.9997 228.424 25.0615C228.595 25.1345 228.75 25.2209 228.885 25.3242C229.345 25.6722 229.574 26.2087 229.574 26.9326C229.574 27.6804 229.373 28.2908 228.969 28.7627C228.565 29.2346 227.864 29.4707 226.868 29.4707C225.833 29.4707 225.12 29.2345 224.732 28.7627C224.344 28.2908 224.15 27.6804 224.15 26.9326C224.15 26.2086 224.383 25.6722 224.847 25.3242C224.981 25.2222 225.134 25.1369 225.304 25.0645C225.158 25.0036 225.027 24.9334 224.912 24.8506C224.484 24.5346 224.271 24.028 224.271 23.332C224.271 22.7321 224.454 22.232 224.822 21.832C225.19 21.4281 225.872 21.2266 226.868 21.2266ZM142.341 22.1318H138.345V24.4648C138.389 24.4306 138.434 24.3959 138.482 24.3643C139.006 24.0203 139.625 23.8486 140.337 23.8486C141.093 23.8487 141.644 24.0567 141.992 24.4727C142.34 24.8887 142.515 25.5706 142.515 26.5186C142.515 27.5544 142.31 28.3046 141.902 28.7686C141.494 29.2284 140.774 29.458 139.742 29.458C138.778 29.4579 138.103 29.234 137.715 28.7861C137.327 28.3381 137.133 27.7299 137.133 26.9619H138.345C138.349 27.5979 138.471 28.0364 138.711 28.2764C138.951 28.5162 139.313 28.6367 139.797 28.6367C140.277 28.6367 140.643 28.506 140.895 28.2461C141.15 27.9821 141.278 27.4121 141.278 26.5361C141.278 25.7402 141.156 25.2224 140.912 24.9824C140.668 24.7385 140.328 24.6162 139.893 24.6162C139.437 24.6162 139.066 24.73 138.782 24.958C138.534 25.154 138.392 25.4084 138.354 25.7207L138.345 25.8584H137.133V21.2861H142.341V22.1318ZM168.936 21.2266C169.939 21.2266 170.604 21.4645 170.928 21.9404C171.252 22.4163 171.413 22.9184 171.413 23.4463H170.195C170.187 23.0344 170.087 22.6984 169.896 22.4385C169.704 22.1745 169.383 22.042 168.936 22.042C168.44 22.042 168.05 22.2463 167.766 22.6543C167.562 22.9463 167.433 23.5694 167.375 24.5234C167.412 24.4926 167.449 24.4611 167.489 24.4307C167.977 24.0587 168.591 23.8721 169.331 23.8721C170.135 23.8721 170.705 24.0803 171.041 24.4961C171.377 24.9081 171.545 25.5844 171.545 26.5244C171.545 27.4803 171.363 28.208 170.999 28.708C170.639 29.2079 169.906 29.4579 168.798 29.458C167.714 29.458 166.996 29.166 166.644 28.582C166.296 27.9981 166.121 27.0343 166.121 25.6904C166.121 24.0185 166.315 22.8561 166.703 22.2041C167.095 21.5521 167.84 21.2266 168.936 21.2266ZM255.94 21.2266C257.016 21.2266 257.728 21.5262 258.076 22.126C258.424 22.726 258.599 23.6822 258.599 24.9941C258.599 26.678 258.405 27.8442 258.017 28.4922C257.629 29.1362 256.896 29.458 255.82 29.458C254.769 29.458 254.087 29.2125 253.774 28.7207C253.462 28.2288 253.307 27.7304 253.307 27.2266H254.524C254.536 27.6463 254.636 27.9881 254.824 28.252C255.016 28.5119 255.348 28.6426 255.82 28.6426C256.3 28.6426 256.68 28.4521 256.96 28.0723C257.163 27.7964 257.292 27.158 257.348 26.1572C257.31 26.1891 257.272 26.2225 257.23 26.2539C256.743 26.6259 256.129 26.8125 255.389 26.8125C254.585 26.8125 254.015 26.5941 253.679 26.1582C253.343 25.7182 253.175 25.026 253.175 24.082C253.175 23.1461 253.355 22.4361 253.715 21.9521C254.079 21.4683 254.821 21.2266 255.94 21.2266ZM24.0107 28.5342H25.8477V29.3867H20.9453V28.5342H22.7988V22.2705L20.9033 22.7021V21.79L23.0029 21.2744H24.0107V28.5342ZM112.592 26.5723H113.642V27.376H112.592V29.3867H111.386V27.376H107.989V26.5664L110.791 21.2861H112.592V26.5723ZM200.045 22.1318C199.209 23.2318 198.589 24.3662 198.185 25.5342C197.781 26.7022 197.579 27.9867 197.579 29.3867H196.265C196.265 27.9788 196.473 26.6764 196.889 25.4805C197.309 24.2845 197.927 23.1744 198.743 22.1504L198.749 22.1318H194.765V21.2861H200.045V22.1318ZM52.9229 21.2266C53.9627 21.2266 54.6624 21.4244 55.0225 21.8203C55.3824 22.2162 55.5624 22.696 55.5625 23.2598C55.5625 23.9437 55.3628 24.524 54.9629 25C54.5629 25.472 54.0348 25.9338 53.3789 26.3857C52.6949 26.8297 52.2052 27.2225 51.9092 27.5625C51.6132 27.9025 51.4649 28.2262 51.4648 28.5342H55.5566V29.3857H50.1807V28.6543C50.1807 28.1343 50.3626 27.6361 50.7266 27.1602C51.0945 26.6802 51.6749 26.2044 52.4668 25.7324C53.1828 25.2844 53.6725 24.8879 53.9365 24.5439C54.2045 24.196 54.3388 23.7724 54.3389 23.2725C54.3389 22.8285 54.2167 22.5178 53.9727 22.3418C53.7327 22.166 53.3826 22.0781 52.9229 22.0781C52.427 22.0781 52.0472 22.2182 51.7832 22.498C51.5192 22.778 51.3867 23.3061 51.3867 24.082H50.1689C50.169 23.1942 50.3649 22.4962 50.7568 21.9883C51.1528 21.4803 51.8749 21.2266 52.9229 21.2266ZM168.924 24.6221C168.456 24.6221 168.079 24.7499 167.795 25.0059C167.529 25.2459 167.378 25.5341 167.341 25.8691C167.344 27.0428 167.47 27.7968 167.718 28.1318C167.974 28.4678 168.355 28.6357 168.863 28.6357C169.375 28.6357 169.744 28.494 169.968 28.21C170.196 27.9219 170.31 27.3815 170.31 26.5898C170.31 25.7663 170.196 25.2323 169.968 24.9883C169.744 24.7444 169.396 24.6221 168.924 24.6221ZM226.868 25.4385C226.352 25.4385 225.971 25.5505 225.723 25.7744C225.479 25.9984 225.357 26.396 225.356 26.9678C225.356 27.5557 225.484 27.9802 225.74 28.2402C225.996 28.5002 226.372 28.6298 226.868 28.6299C227.36 28.6299 227.732 28.5002 227.984 28.2402C228.24 27.9802 228.368 27.5558 228.368 26.9678C228.368 26.3963 228.247 25.9984 228.003 25.7744C227.763 25.5504 227.384 25.4385 226.868 25.4385ZM109.214 26.5723H111.386V22.2207L109.214 26.5723ZM255.881 22.0605C255.369 22.0605 254.992 22.2023 254.752 22.4863C254.512 22.7704 254.393 23.3043 254.393 24.0879C254.393 24.8996 254.508 25.4278 254.74 25.6719C254.976 25.9159 255.331 26.0381 255.803 26.0381C256.267 26.038 256.643 25.914 256.931 25.666C257.203 25.4349 257.351 25.1532 257.38 24.8213C257.377 23.6447 257.253 22.8923 257.009 22.5645C256.765 22.2286 256.389 22.0607 255.881 22.0605ZM226.868 22.042C226.392 22.042 226.035 22.1485 225.795 22.3604C225.559 22.5684 225.44 22.8865 225.44 23.3145C225.44 23.8223 225.552 24.1826 225.776 24.3945C226.004 24.6024 226.368 24.706 226.868 24.7061C227.364 24.7061 227.724 24.6023 227.948 24.3945C228.172 24.1826 228.284 23.8223 228.284 23.3145C228.284 22.8865 228.167 22.5684 227.931 22.3604C227.695 22.1484 227.34 22.042 226.868 22.042ZM23.8955 16.4775H22.8955V0H23.8955V16.4775ZM52.8955 16.4775H51.8955V0H52.8955V16.4775ZM81.8955 16.4775H80.8955V0H81.8955V16.4775ZM110.896 16.4775H109.896V0H110.896V16.4775ZM139.896 16.4775H138.896V0H139.896V16.4775ZM168.896 16.4775H167.896V0H168.896V16.4775ZM197.896 16.4775H196.896V0H197.896V16.4775ZM226.896 16.4775H225.896V0H226.896V16.4775ZM255.896 16.4775H254.896V0H255.896V16.4775Z" fill="#2F2F2F" fill-opacity="0.76"/></svg>`;

function renderCard(item) {
  const imgUrl = item._resolvedImg || (item.fileId ? STATE.imageMap[item.fileId] : null);
  const aiType = item.ai_type; // article | video | product | xpost | null
  const aiTypeSec = item.ai_type_secondary; // secondary AI type for hybrid cards
  const aiData = item.ai_data || {};
  const domain = getDomain(item.sourceUrl || item.url);
  const url = item.sourceUrl || item.url || '';
  const isInstagramReel = /instagram\.com\/(reels?|reel)\//i.test(url);
  // image from TG is always image — AI type cannot override it
  const effectiveType = item.type === 'image' ? 'image' : (isInstagramReel ? 'video' : (aiType || item.type));

  const pendingDot = !item.ai_analyzed ? '<div class="badge-pending"></div>' : '';

  // ── Video card ──
  if (effectiveType === 'video') {
    const ytMatch = url.match(/(?:youtube\.com\/watch\?.*v=|youtu\.be\/|youtube\.com\/shorts\/)([a-zA-Z0-9_-]{11})/);
    const vimeoMatch = !ytMatch && url.match(/vimeo\.com\/(?:.*\/)?(\d+)/);

    // YouTube: maxresdefault (no black bars), fallback to sddefault via onerror
    const ytId = ytMatch ? ytMatch[1] : null;
    const ytSrc = ytId ? `https://img.youtube.com/vi/${ytId}/maxresdefault.jpg` : null;
    const ytFallback = ytId ? `https://img.youtube.com/vi/${ytId}/sddefault.jpg` : null;
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
    const thumbGlowAttr = ytSrc ? `onerror="this.src='${ytFallback}'"` : '';
    const thumbImgAttr = ytSrc ? `onerror="this.src='${ytFallback}'"` : '';

    return `<div class="card card-video" data-id="${item.id}" data-action="open" data-url="${escapeHtml(url)}">
      ${pendingDot}
      <div class="video-header">
        ${faviconUrl ? `<img class="video-favicon" src="${escapeHtml(faviconUrl)}" alt="" onerror="this.style.display='none'">` : ''}
        <span class="video-domain">${escapeHtml(domain)}</span>
        <button class="video-share-btn" data-action="open" data-url="${escapeHtml(url)}" title="Open">${shareIcon}</button>
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
    const notchSvg = `<svg viewBox="0 0 95.0078 37.6777" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M47.5039 0C55.1408 0 61.3925 5.93081 61.9063 13.4374C61.944 13.9883 62.3881 14.4375 62.9404 14.4375H83.3887C89.8059 14.4377 95.0078 19.6404 95.0078 26.0576C95.0078 32.4749 89.8059 37.6775 83.3887 37.6777H11.6201C5.20275 37.6777 2.11322e-05 32.475 0 26.0576C0 19.6402 5.20274 14.4375 11.6201 14.4375H32.0674C32.6197 14.4375 33.0638 13.9883 33.1015 13.4373C33.6153 5.93083 39.8671 4.64136e-05 47.5039 0Z" fill="#080808" stroke="rgba(88,119,65,0.5)" stroke-width="0.5"/>
    </svg>`;
    return `<div class="card card-product-new" data-id="${item.id}" data-action="open" data-url="${escapeHtml(url)}">
      ${pendingDot}
      <div class="product-new-notch">${notchSvg}</div>
      <div class="product-new-header">
        ${rawPrice ? `<div class="product-new-price">${escapeHtml(formattedPrice)}</div>` : ''}
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
    // Store data for fullscreen overlay via data attributes
    return `<div class="card card-xpost${hybridClass}" data-id="${item.id}" data-action="xpost" data-source-url="${escapeHtml(xpostSourceUrl)}" data-tweet-text="${escapeHtml(tweetTextRaw)}" data-author="${author}" data-img="${escapeHtml(imgUrl || '')}">
      ${pendingDot}
      <div class="xpost-header">
        ${faviconUrl ? `<img class="xpost-avatar" src="${escapeHtml(faviconUrl)}" alt="" onerror="this.style.display='none'" data-action="open" data-url="${escapeHtml(xpostSourceUrl)}">` : ''}
        ${author ? `<div class="xpost-author">${author}</div>` : ''}
      </div>
      ${tweetText ? `<div class="xpost-body"><div class="xpost-text">${tweetText}</div></div>` : ''}
      ${imgUrl ? `<div class="xpost-preview"><div class="xpost-screenshot-wrap"><img class="xpost-screenshot" src="${escapeHtml(imgUrl)}" loading="lazy" alt=""></div></div>` : ''}
      ${isHybridTool ? `<div class="xpost-tool-ruler">${RULER_SVG}</div>` : ''}
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
  const LINK_AI_OVERRIDES = new Set(['article', 'video', 'product', 'xpost', 'tool']);
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
      ${pendingDot}
      <div class="article-header">
        ${faviconUrl ? `<img class="article-favicon" src="${escapeHtml(faviconUrl)}" alt="">` : ''}
        <span class="article-domain">${escapeHtml(domain)}</span>
      </div>
      ${bookPages}
    </div>`;
  }

  // ── Has image (pure image — no AI type override) ──
  if (imgUrl) {
    const sourceUrl = item.sourceUrl || item.url || '';
    const imgDomain = getDomain(sourceUrl);
    const domainBtn = (sourceUrl && imgDomain)
      ? `<button class="img-domain-btn" data-action="open" data-url="${escapeHtml(sourceUrl)}">${escapeHtml(imgDomain)}</button>`
      : '';
    return `<div class="card card-image" data-id="${item.id}" data-action="lightbox" data-img="${escapeHtml(imgUrl)}" data-url="${escapeHtml(sourceUrl)}">
      ${pendingDot}
      <img class="card-img" src="${escapeHtml(imgUrl)}" loading="lazy" alt="">
      ${domainBtn}
    </div>`;
  }

  // ── Text / Quote ──
  const quoteTextRaw = item.content || item.ai_description || '';
  const quoteText = escapeHtml(quoteTextRaw);
  const quoteSourceUrl = item.sourceUrl || item.url || '';
  const quoteDomainHtml = domain
    ? (quoteSourceUrl
        ? `<a class="quote-source-link" data-action="open" data-url="${escapeHtml(quoteSourceUrl)}">${escapeHtml(domain)}</a>`
        : `<span class="quote-source">${escapeHtml(domain)}</span>`)
    : '<span></span>';
  const quoteSignSvg = `<svg class="quote-sign" viewBox="0 0 26 22" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M0 22V13.2C0 9.86667 0.733333 7.06667 2.2 4.8C3.73333 2.53333 6.13333 0.866667 9.4 -4.57764e-07L11 3C9 3.53333 7.46667 4.53333 6.4 6C5.4 7.4 4.86667 9.13333 4.8 11.2H9.4V22H0ZM14.6 22V13.2C14.6 9.86667 15.3333 7.06667 16.8 4.8C18.3333 2.53333 20.7333 0.866667 24 -4.57764e-07L25.6 3C23.6 3.53333 22.0667 4.53333 21 6C20 7.4 19.4667 9.13333 19.4 11.2H24V22H14.6Z" fill="rgba(230,184,120,0.31)"/>
  </svg>`;

  // Spikes border — triangular teeth pointing down, card bg color, glued to bottom
  const diamondBorder = `<svg class="quote-diamonds-svg" viewBox="0 0 280 10" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg" style="width:100%;height:8px;display:block;">
    <rect width="280" height="10" fill="#080808"/>
    <path d="M0,0 ${Array.from({length: 35}, (_,i) => `L${i*8+4},8 L${i*8+8},0`).join(' ')} L280,0 Z" fill="#FFFAF3"/>
  </svg>`;

  return `<div class="card card-quote-new" data-id="${item.id}" data-action="quote" data-quote-text="${escapeHtml(quoteTextRaw)}" data-source-url="${escapeHtml(quoteSourceUrl)}" data-domain="${escapeHtml(domain)}">
    ${pendingDot}
    <div class="quote-body">
      <div class="quote-text">${quoteText}</div>
    </div>
    <div class="quote-footer">
      ${quoteDomainHtml}
      ${quoteSignSvg}
    </div>
    ${diamondBorder}
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
  applyGridMode();
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

// ─── Content overlay (shared) ────────────────────────────────────────────────
function openContentOverlay(innerHtml) {
  const overlay = document.getElementById('content-overlay');
  const content = document.getElementById('overlay-content');
  content.innerHTML = innerHtml;
  overlay.classList.remove('hidden');
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
  masonry.addEventListener('click', e => {
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

    // "lightbox" — open image lightbox
    if (action === 'lightbox') {
      const imgSrc = actionEl.dataset.img || '';
      if (imgSrc) openLightbox(imgSrc, url);
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

        let html = '<div class="overlay-tweet">';
        html += '<div class="overlay-tweet-header">';
        if (faviconUrl) html += `<img class="overlay-tweet-avatar" src="${escapeHtml(faviconUrl)}" alt="">`;
        if (author) html += `<div class="overlay-tweet-author">${escapeHtml(author)}</div>`;
        html += '</div>';
        if (tweetText) html += `<div class="overlay-tweet-text">${escapeHtml(tweetText)}</div>`;
        if (imgSrc) html += `<img class="overlay-tweet-img" src="${escapeHtml(imgSrc)}" alt="">`;
        if (sourceUrl) {
          html += `<div class="overlay-tweet-footer"><a class="overlay-tweet-link" href="${escapeHtml(sourceUrl)}" target="_blank">${escapeHtml(domain)}</a></div>`;
        }
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

      const quoteSignSvg = `<svg style="width:26px;height:22px;" viewBox="0 0 26 22" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M0 22V13.2C0 9.86667 0.733333 7.06667 2.2 4.8C3.73333 2.53333 6.13333 0.866667 9.4 -4.57764e-07L11 3C9 3.53333 7.46667 4.53333 6.4 6C5.4 7.4 4.86667 9.13333 4.8 11.2H9.4V22H0ZM14.6 22V13.2C14.6 9.86667 15.3333 7.06667 16.8 4.8C18.3333 2.53333 20.7333 0.866667 24 -4.57764e-07L25.6 3C23.6 3.53333 22.0667 4.53333 21 6C20 7.4 19.4667 9.13333 19.4 11.2H24V22H14.6Z" fill="rgba(230,184,120,0.31)"/>
      </svg>`;

      let html = '<div class="overlay-quote">';
      html += '<div class="overlay-quote-body">';
      html += `<div class="overlay-quote-text">${escapeHtml(quoteText)}</div>`;
      html += '</div>';
      html += '<div class="overlay-quote-footer">';
      html += domain ? `<span class="overlay-quote-source">${escapeHtml(domain)}</span>` : '<span></span>';
      html += quoteSignSvg;
      html += '</div>';
      if (sourceUrl) {
        html += `<div style="padding: 0 28px 20px;"><a class="overlay-quote-link" href="${escapeHtml(sourceUrl)}" target="_blank">Open source →</a></div>`;
      }
      html += '</div>';
      openContentOverlay(html);
      return;
    }
  });

  // ── Lightbox close ──
  const lb = document.getElementById('lightbox');
  lb.addEventListener('click', e => {
    if (e.target === lb || e.target === document.getElementById('lightbox-img')) {
      lb.classList.add('hidden');
      document.getElementById('lightbox-img').src = '';
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

  // ── Escape key closes any overlay ──
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      lb.classList.add('hidden');
      document.getElementById('lightbox-img').src = '';
      closeContentOverlay();
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

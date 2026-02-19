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
  activeColor: null
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
  document.getElementById('grid-wrap').classList.remove('hidden');
  document.getElementById('ai-status').textContent = 'Loading…';

  setupToolbarEvents();

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

// ─── Filtering ────────────────────────────────────────────────────────────────
// Base types (from TG): image, link, quote
// AI types (content category): article, video, product, xpost
// Filtering: if base type selected → match item.type
//            if AI type selected → match item.ai_type
//            AND logic across base vs AI axes: item must satisfy both if both axes have selection
const BASE_TYPES = new Set(['image', 'link', 'quote']);
const AI_TYPES = new Set(['article', 'video', 'product', 'xpost']);

function applyFilters() {
  let items = STATE.items;

  if (STATE.activeTypes.size > 0) {
    const activeBase = [...STATE.activeTypes].filter(t => BASE_TYPES.has(t));
    const activeAI = [...STATE.activeTypes].filter(t => AI_TYPES.has(t));

    items = items.filter(item => {
      // Notion still stores old 'text' records — treat as 'quote'
      const itemBaseType = item.type === 'text' ? 'quote' : item.type;
      const baseMatch = activeBase.length === 0 || activeBase.includes(itemBaseType);
      const aiMatch = activeAI.length === 0 || activeAI.includes(item.ai_type);
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

function renderCard(item) {
  const imgUrl = item._resolvedImg || (item.fileId ? STATE.imageMap[item.fileId] : null);
  const aiType = item.ai_type; // article | video | product | xpost | null
  const aiData = item.ai_data || {};
  const domain = getDomain(item.sourceUrl || item.url);
  const url = item.sourceUrl || item.url || '';
  const isInstagramReel = /instagram\.com\/(reels?|reel)\//i.test(url);
  const effectiveType = isInstagramReel ? 'video' : (aiType || item.type);

  const pendingDot = !item.ai_analyzed ? '<div class="badge-pending"></div>' : '';

  const colorsHtml = Array.isArray(aiData.colors) && aiData.colors.length
    ? `<div class="card-colors">${aiData.colors.slice(0,5).map(c => `<span class="card-color-tag">${escapeHtml(c)}</span>`).join('')}</div>`
    : '';
  const materialsHtml = Array.isArray(aiData.materials) && aiData.materials.length
    ? `<div class="card-materials">${escapeHtml(aiData.materials.join(', '))}</div>`
    : '';

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
    const clickHandler = url ? `onclick="window.open('${escapeHtml(url)}','_blank')"` : '';

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

    return `<div class="card card-video" data-id="${item.id}" ${clickHandler}>
      ${pendingDot}
      <div class="video-header">
        ${faviconUrl ? `<img class="video-favicon" src="${escapeHtml(faviconUrl)}" alt="" onerror="this.style.display='none'">` : ''}
        <span class="video-domain">${escapeHtml(domain)}</span>
        <button class="video-share-btn" onclick="event.stopPropagation();window.open('${escapeHtml(url)}','_blank')" title="Open">${shareIcon}</button>
      </div>
      ${(thumbSrc || vimeoId) ? `<div class="video-preview">
        <div class="video-glow-wrap">
          <img class="video-glow" ${vimeoImgId ? `id="${vimeoImgId}-glow"` : ''} src="${escapeHtml(thumbSrc)}" loading="lazy" alt="" aria-hidden="true" ${thumbGlowAttr}>
          <img class="video-screenshot" ${vimeoImgId ? `id="${vimeoImgId}"` : ''} src="${escapeHtml(thumbSrc)}" loading="lazy" alt="" ${thumbImgAttr}>
        </div>
      </div>` : ''}
    </div>`;
  }

  // ── Product with image ──
  if (effectiveType === 'product' && imgUrl) {
    const clickHandler = url ? `onclick="window.open('${escapeHtml(url)}','_blank')"` : '';
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
    return `<div class="card card-product-new" data-id="${item.id}" ${clickHandler}>
      ${pendingDot}
      <div class="product-new-notch">${notchSvg}</div>
      <div class="product-new-header">
        ${rawPrice ? `<div class="product-new-price">${escapeHtml(formattedPrice)}</div>` : ''}
      </div>
      <div class="product-new-preview">
        <img class="product-new-screenshot" src="${escapeHtml(imgUrl)}" loading="lazy" alt="">
      </div>
    </div>`;
  }

  // ── X Post ──
  if (effectiveType === 'xpost') {
    const tweetText = escapeHtml(aiData.tweet_text || item.content || item.ai_description || '');
    const author = escapeHtml(aiData.author || '');
    const clickHandler = item.sourceUrl ? `onclick="window.open('${escapeHtml(item.sourceUrl)}','_blank')"` : '';
    const faviconUrl = domain ? `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=64` : '';
    return `<div class="card card-xpost" data-id="${item.id}" ${clickHandler}>
      ${pendingDot}
      <div class="xpost-header">
        ${faviconUrl ? `<img class="xpost-avatar" src="${escapeHtml(faviconUrl)}" alt="" onerror="this.style.display='none'">` : ''}
        ${author ? `<div class="xpost-author">${author}</div>` : ''}
      </div>
      ${tweetText ? `<div class="xpost-body"><div class="xpost-text">${tweetText}</div></div>` : ''}
      ${imgUrl ? `<div class="xpost-preview"><div class="xpost-screenshot-wrap"><img class="xpost-screenshot" src="${escapeHtml(imgUrl)}" loading="lazy" alt=""></div></div>` : ''}
    </div>`;
  }

  // ── Link (base type = link, and not article/product/xpost) ──
  const LINK_AI_OVERRIDES = new Set(['article', 'video', 'product', 'xpost']);
  if (item.type === 'link' && !LINK_AI_OVERRIDES.has(aiType)) {
    const linkUrl = item.sourceUrl || item.url || '';
    const faviconUrl = domain ? `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=64` : '';
    const arrowIcon = `<svg viewBox="0 0 36.738 36.7375" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M16.9528 14.1284C18.5149 12.5663 21.047 12.5663 22.6091 14.1284C24.1712 15.6905 24.1712 18.2226 22.6091 19.7847L6.82782 35.5659C5.26573 37.128 2.73367 37.128 1.17157 35.5659C-0.390524 34.0038 -0.390524 31.4718 1.17157 29.9097L16.9528 14.1284Z" fill="white"/><path d="M28.738 29.9131V9C28.738 8.44788 28.29 8.00026 27.738 8H6.82489C4.61575 8 2.82489 6.20914 2.82489 4C2.82489 1.79086 4.61575 0 6.82489 0H27.738C32.7083 0.00026285 36.738 4.0296 36.738 9V29.9131C36.7377 32.1218 34.9467 33.9128 32.738 33.9131C30.529 33.9131 28.7382 32.122 28.738 29.9131Z" fill="white"/></svg>`;
    return `<div class="card card-link-new" data-id="${item.id}" onclick="window.open('${escapeHtml(linkUrl)}','_blank')">
      ${pendingDot}
      <div class="link-header">
        ${faviconUrl ? `<img class="link-favicon" src="${escapeHtml(faviconUrl)}" alt="" onerror="this.style.display='none'">` : ''}
        <span class="link-domain">${escapeHtml(domain)}</span>
        <button class="link-arrow-btn" onclick="event.stopPropagation();window.open('${escapeHtml(linkUrl)}','_blank')" title="Open">${arrowIcon}</button>
      </div>
      ${imgUrl ? `<div class="link-preview"><img class="link-screenshot" src="${escapeHtml(imgUrl)}" loading="lazy" alt=""></div>` : ''}
    </div>`;
  }

  // ── Has image (article or untyped item with screenshot) ──
  const VALID_AI_TYPES = new Set(['article', 'video', 'product', 'xpost']);
  if (imgUrl) {
    const badge = (aiType && VALID_AI_TYPES.has(aiType)) ? `<div class="type-badge">${escapeHtml(aiType)}</div>` : '';
    return `<div class="card card-image" data-id="${item.id}" onclick="openLightbox('${escapeHtml(imgUrl)}','${escapeHtml(item.sourceUrl)}')">
      ${pendingDot}
      <img class="card-img" src="${escapeHtml(imgUrl)}" loading="lazy" alt="">
      <div class="card-overlay">
        ${colorsHtml}
        ${materialsHtml}
      </div>
      ${badge}
    </div>`;
  }

  // ── Text / Quote ──
  const quoteText = escapeHtml(item.content || item.ai_description || '');
  const quoteDomainHtml = domain ? `<span class="quote-source">${escapeHtml(domain)}</span>` : '<span></span>';
  const quoteSignSvg = `<svg class="quote-sign" viewBox="0 0 26 22" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M0 22V13.2C0 9.86667 0.733333 7.06667 2.2 4.8C3.73333 2.53333 6.13333 0.866667 9.4 -4.57764e-07L11 3C9 3.53333 7.46667 4.53333 6.4 6C5.4 7.4 4.86667 9.13333 4.8 11.2H9.4V22H0ZM14.6 22V13.2C14.6 9.86667 15.3333 7.06667 16.8 4.8C18.3333 2.53333 20.7333 0.866667 24 -4.57764e-07L25.6 3C23.6 3.53333 22.0667 4.53333 21 6C20 7.4 19.4667 9.13333 19.4 11.2H24V22H14.6Z" fill="rgba(230,184,120,0.31)"/>
  </svg>`;

  // Spikes border — triangular teeth pointing down, card bg color, glued to bottom
  // Sawtooth: cream card-color triangles pointing down against dark site bg
  // viewBox height 10 vs spike height 8 = 80% vertical scale (≈20% squeeze)
  const diamondBorder = `<svg class="quote-diamonds-svg" viewBox="0 0 280 10" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg" style="width:100%;height:8px;display:block;">
    <rect width="280" height="10" fill="#080808"/>
    <path d="M0,0 ${Array.from({length: 35}, (_,i) => `L${i*8+4},8 L${i*8+8},0`).join(' ')} L280,0 Z" fill="#FFFAF3"/>
  </svg>`;

  return `<div class="card card-quote-new" data-id="${item.id}">
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
          item.ai_type = response.result.content_type || item.ai_type;
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

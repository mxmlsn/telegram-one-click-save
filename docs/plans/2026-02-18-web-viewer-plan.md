# Web Viewer Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a single local HTML file that reads saved items from Notion and displays them with search, tag filter, color filter, and OCR text search.

**Architecture:** Single `viewer/index.html` with inline CSS and JS. Reads Notion DB via API, resolves Telegram file_ids for image URLs, processes images with ColorThief (color) and Tesseract.js (OCR) in the background. No build step, no server.

**Tech Stack:** Vanilla JS, Notion API, Telegram Bot API, ColorThief (CDN), Tesseract.js (CDN)

---

### Task 1: Project scaffold + auth modal

**Files:**
- Create: `viewer/index.html`

**Step 1: Create base HTML file with auth modal**

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Saves</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #0f0f0f; color: #e0e0e0; min-height: 100vh; }

    /* Auth modal */
    #auth-modal { position: fixed; inset: 0; background: rgba(0,0,0,0.85); display: flex; align-items: center; justify-content: center; z-index: 1000; }
    #auth-modal.hidden { display: none; }
    .auth-box { background: #1a1a1a; border: 1px solid #333; border-radius: 12px; padding: 32px; width: 420px; }
    .auth-box h2 { font-size: 18px; margin-bottom: 24px; color: #fff; }
    .auth-field { margin-bottom: 16px; }
    .auth-field label { display: block; font-size: 12px; color: #888; margin-bottom: 6px; text-transform: uppercase; letter-spacing: 0.5px; }
    .auth-field input { width: 100%; background: #111; border: 1px solid #333; border-radius: 8px; padding: 10px 12px; color: #e0e0e0; font-size: 14px; outline: none; }
    .auth-field input:focus { border-color: #555; }
    .auth-btn { width: 100%; background: #fff; color: #000; border: none; border-radius: 8px; padding: 12px; font-size: 14px; font-weight: 600; cursor: pointer; margin-top: 8px; }
    .auth-btn:hover { background: #e0e0e0; }
  </style>
</head>
<body>

<div id="auth-modal">
  <div class="auth-box">
    <h2>Connect</h2>
    <div class="auth-field">
      <label>Notion Token</label>
      <input type="password" id="input-notion-token" placeholder="ntn_...">
    </div>
    <div class="auth-field">
      <label>Telegram Bot Token</label>
      <input type="password" id="input-tg-token" placeholder="123456:ABC...">
    </div>
    <div class="auth-field">
      <label>Notion Database ID</label>
      <input type="text" id="input-db-id" placeholder="30b6081f-..." value="30b6081f-3dc6-8148-871f-dfb6944ac36e">
    </div>
    <button class="auth-btn" onclick="saveAuth()">Connect</button>
  </div>
</div>

<div id="app" class="hidden"></div>

<script>
const STORAGE_KEYS = { notion: 'sv_notion_token', tg: 'sv_tg_token', db: 'sv_db_id' };

function saveAuth() {
  const notion = document.getElementById('input-notion-token').value.trim();
  const tg = document.getElementById('input-tg-token').value.trim();
  const db = document.getElementById('input-db-id').value.trim();
  if (!notion || !tg || !db) return alert('Fill all fields');
  localStorage.setItem(STORAGE_KEYS.notion, notion);
  localStorage.setItem(STORAGE_KEYS.tg, tg);
  localStorage.setItem(STORAGE_KEYS.db, db);
  document.getElementById('auth-modal').classList.add('hidden');
  document.getElementById('app').classList.remove('hidden');
  init();
}

function getAuth() {
  return {
    notion: localStorage.getItem(STORAGE_KEYS.notion),
    tg: localStorage.getItem(STORAGE_KEYS.tg),
    db: localStorage.getItem(STORAGE_KEYS.db)
  };
}

window.addEventListener('DOMContentLoaded', () => {
  const { notion, tg, db } = getAuth();
  if (notion && tg && db) {
    document.getElementById('auth-modal').classList.add('hidden');
    document.getElementById('app').classList.remove('hidden');
    init();
  }
});

function init() {
  // placeholder — implemented in next tasks
  document.getElementById('app').innerHTML = '<p style="padding:40px;color:#666">Loading...</p>';
}
</script>
</body>
</html>
```

**Step 2: Open in browser and verify modal appears, tokens save, page shows "Loading..."**

Open `viewer/index.html` in Chrome. Enter any tokens. Verify modal closes and "Loading..." appears.

**Step 3: Commit**

```bash
cd viewer
git add viewer/index.html
git commit -m "feat(viewer): scaffold with auth modal"
```

---

### Task 2: Notion data fetching

**Files:**
- Modify: `viewer/index.html` — replace `init()` placeholder

**Step 1: Add fetchNotion function**

Inside `<script>`, replace `init()` with:

```javascript
async function fetchNotion(notionToken, dbId) {
  let results = [];
  let cursor = undefined;
  do {
    const body = { page_size: 100, sorts: [{ property: 'Date', direction: 'descending' }] };
    if (cursor) body.start_cursor = cursor;
    const res = await fetch(`https://api.notion.com/v1/databases/${dbId}/query`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${notionToken}`,
        'Notion-Version': '2022-06-28',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || 'Notion fetch failed');
    results = results.concat(data.results);
    cursor = data.has_more ? data.next_cursor : undefined;
  } while (cursor);
  return results;
}

function parseItem(page) {
  const p = page.properties;
  return {
    id: page.id,
    url: p['URL']?.title?.[0]?.text?.content || '',
    type: p['Type']?.select?.name || 'link',
    tag: p['Tag']?.select?.name || '',
    content: p['Content']?.rich_text?.[0]?.text?.content || '',
    fileId: p['File ID']?.rich_text?.[0]?.text?.content || '',
    sourceUrl: p['Source URL']?.url || '',
    date: p['Date']?.date?.start || ''
  };
}

async function init() {
  const { notion, tg, db } = getAuth();
  document.getElementById('app').innerHTML = '<p style="padding:40px;color:#666">Fetching...</p>';
  try {
    const pages = await fetchNotion(notion, db);
    const items = pages.map(parseItem);
    console.log('[Saves] loaded', items.length, 'items');
    window.__items = items;
    renderApp(items, tg);
  } catch (e) {
    document.getElementById('app').innerHTML = `<p style="padding:40px;color:#f66">Error: ${e.message}</p>`;
  }
}
```

**Step 2: Verify in browser console**

Open DevTools → Console. After loading should see `[Saves] loaded N items`.

**Step 3: Commit**

```bash
git add viewer/index.html
git commit -m "feat(viewer): fetch and parse Notion data"
```

---

### Task 3: Telegram image URL resolution

**Files:**
- Modify: `viewer/index.html`

**Step 1: Add resolveTelegramUrls function**

```javascript
async function resolveFileId(tgToken, fileId) {
  if (!fileId) return null;
  try {
    const res = await fetch(`https://api.telegram.org/bot${tgToken}/getFile?file_id=${fileId}`);
    const data = await res.json();
    if (!data.ok) return null;
    return `https://api.telegram.org/file/bot${tgToken}/${data.result.file_path}`;
  } catch { return null; }
}

async function resolveAllImages(items, tgToken) {
  const withImages = items.filter(i => i.fileId);
  const urls = await Promise.all(withImages.map(i => resolveFileId(tgToken, i.fileId)));
  const map = {};
  withImages.forEach((item, idx) => { if (urls[idx]) map[item.fileId] = urls[idx]; });
  return map; // fileId → imageUrl
}
```

**Step 2: Call in init() after fetchNotion**

```javascript
const imageMap = await resolveAllImages(items, tg);
window.__imageMap = imageMap;
renderApp(items, imageMap);
```

**Step 3: Commit**

```bash
git add viewer/index.html
git commit -m "feat(viewer): resolve Telegram file_ids to image URLs"
```

---

### Task 4: App layout — search, tag filter, color filter

**Files:**
- Modify: `viewer/index.html` — add CSS + renderApp shell

**Step 1: Add layout CSS**

```css
/* App layout */
#app { max-width: 1200px; margin: 0 auto; padding: 32px 24px; }
#app.hidden { display: none; }

.toolbar { position: sticky; top: 0; background: #0f0f0f; padding: 16px 0; z-index: 100; border-bottom: 1px solid #1e1e1e; margin-bottom: 24px; }
.search-bar { width: 100%; background: #1a1a1a; border: 1px solid #2a2a2a; border-radius: 10px; padding: 12px 16px; color: #e0e0e0; font-size: 15px; outline: none; }
.search-bar:focus { border-color: #444; }

.tag-filters { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 12px; }
.tag-pill { background: #1a1a1a; border: 1px solid #2a2a2a; border-radius: 20px; padding: 5px 14px; font-size: 12px; cursor: pointer; color: #888; transition: all 0.15s; }
.tag-pill.active { background: #fff; color: #000; border-color: #fff; }

.color-filters { display: flex; gap: 10px; margin-top: 12px; align-items: center; }
.color-label { font-size: 12px; color: #555; margin-right: 4px; }
.color-circle { width: 24px; height: 24px; border-radius: 50%; border: 2px solid #333; cursor: pointer; background: #1a1a1a; position: relative; transition: border-color 0.15s; }
.color-circle.filled { border-color: transparent; }
.color-circle:hover { border-color: #666; }
.color-dropdown { position: absolute; top: 30px; left: 50%; transform: translateX(-50%); background: #1a1a1a; border: 1px solid #333; border-radius: 10px; padding: 10px; display: grid; grid-template-columns: repeat(4, 1fr); gap: 6px; z-index: 200; width: 160px; }
.color-option { width: 28px; height: 28px; border-radius: 50%; cursor: pointer; border: 2px solid transparent; transition: border-color 0.1s; }
.color-option:hover { border-color: #fff; }

/* Cards grid */
.cards-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 16px; }
```

**Step 2: Add renderApp shell**

```javascript
const BASE_COLORS = [
  { name: 'red', hex: '#e74c3c' }, { name: 'orange', hex: '#e67e22' },
  { name: 'yellow', hex: '#f1c40f' }, { name: 'green', hex: '#2ecc71' },
  { name: 'blue', hex: '#3498db' }, { name: 'purple', hex: '#9b59b6' },
  { name: 'pink', hex: '#e91e8c' }, { name: 'brown', hex: '#795548' },
  { name: 'gray', hex: '#95a5a6' }, { name: 'black', hex: '#1a1a1a' }
];

let state = { search: '', activeTags: new Set(), activeColors: [null, null, null, null, null, null] };

function renderApp(items, imageMap) {
  window.__allItems = items;
  window.__imageMap = imageMap;

  const tags = [...new Set(items.map(i => i.tag).filter(Boolean))];

  document.getElementById('app').innerHTML = `
    <div class="toolbar">
      <input class="search-bar" id="search-input" placeholder="Search..." oninput="onSearch(this.value)">
      <div class="tag-filters" id="tag-filters">
        ${tags.map(t => `<button class="tag-pill" onclick="toggleTag('${t}')">${t}</button>`).join('')}
      </div>
      <div class="color-filters">
        <span class="color-label">Color</span>
        ${[0,1,2,3,4,5].map(i => `
          <div class="color-circle" id="cc-${i}" onclick="toggleColorDropdown(${i})">
            <div class="color-dropdown hidden" id="cd-${i}">
              ${BASE_COLORS.map(c => `<div class="color-option" style="background:${c.hex}" title="${c.name}" onclick="selectColor(event,${i},'${c.name}','${c.hex}')"></div>`).join('')}
            </div>
          </div>
        `).join('')}
      </div>
    </div>
    <div class="cards-grid" id="cards-grid"></div>
  `;

  renderCards();
}

function onSearch(val) { state.search = val.toLowerCase(); renderCards(); }
function toggleTag(tag) {
  state.activeTags.has(tag) ? state.activeTags.delete(tag) : state.activeTags.add(tag);
  document.querySelectorAll('.tag-pill').forEach(p => p.classList.toggle('active', state.activeTags.has(p.textContent)));
  renderCards();
}
function toggleColorDropdown(i) {
  document.querySelectorAll('.color-dropdown').forEach((d,j) => { if (j!==i) d.classList.add('hidden'); });
  document.getElementById(`cd-${i}`).classList.toggle('hidden');
}
function selectColor(e, i, name, hex) {
  e.stopPropagation();
  state.activeColors[i] = state.activeColors[i] === name ? null : name;
  const circle = document.getElementById(`cc-${i}`);
  circle.style.background = state.activeColors[i] ? hex : '';
  circle.classList.toggle('filled', !!state.activeColors[i]);
  document.getElementById(`cd-${i}`).classList.add('hidden');
  renderCards();
}
document.addEventListener('click', () => {
  document.querySelectorAll('.color-dropdown').forEach(d => d.classList.add('hidden'));
});
```

**Step 3: Verify layout renders in browser**

Should see search bar, tag pills, 6 color circles, empty grid.

**Step 4: Commit**

```bash
git add viewer/index.html
git commit -m "feat(viewer): toolbar with search, tags, color filter"
```

---

### Task 5: Card rendering

**Files:**
- Modify: `viewer/index.html`

**Step 1: Add card CSS**

```css
.card { background: #1a1a1a; border: 1px solid #222; border-radius: 12px; overflow: hidden; cursor: pointer; transition: border-color 0.15s; }
.card:hover { border-color: #444; }
.card-img { width: 100%; aspect-ratio: 16/9; object-fit: cover; display: block; background: #111; }
.card-body { padding: 12px; }
.card-domain { font-size: 13px; color: #ccc; font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.card-text { font-size: 13px; color: #aaa; line-height: 1.5; margin-top: 4px; display: -webkit-box; -webkit-line-clamp: 4; -webkit-box-orient: vertical; overflow: hidden; }
.card-text.expanded { display: block; -webkit-line-clamp: unset; }
.card-source { font-size: 11px; color: #555; margin-top: 8px; }
.card-source a { color: #555; text-decoration: none; }
.card-source a:hover { color: #888; }
.card-tag { display: inline-block; font-size: 11px; color: #666; background: #111; border-radius: 4px; padding: 2px 7px; margin-top: 8px; }
.card-ocr-badge { position: absolute; top: 8px; right: 8px; background: rgba(0,0,0,0.6); border-radius: 4px; width: 20px; height: 20px; display: flex; align-items: center; justify-content: center; }
.card-wrap { position: relative; }
```

**Step 2: Add renderCards and card builders**

```javascript
function getDomain(url) {
  try { return new URL(url).hostname.replace('www.', ''); } catch { return url; }
}

function buildCard(item) {
  const imgUrl = item.fileId ? window.__imageMap?.[item.fileId] : null;
  const domain = getDomain(item.sourceUrl || item.url);

  if (item.type === 'image') {
    return `
      <div class="card card-wrap" onclick="openLightbox('${item.fileId}','${item.sourceUrl}')">
        ${imgUrl ? `<img class="card-img" src="${imgUrl}" loading="lazy" id="img-${item.id}">` : '<div class="card-img"></div>'}
        <div class="card-body">
          ${item.tag ? `<span class="card-tag">${item.tag}</span>` : ''}
          ${domain ? `<div class="card-source"><a href="${item.sourceUrl}" target="_blank" onclick="event.stopPropagation()">${domain}</a></div>` : ''}
        </div>
      </div>`;
  }

  if (item.type === 'link') {
    return `
      <div class="card card-wrap" onclick="window.open('${item.sourceUrl || '#'}','_blank')">
        ${imgUrl ? `<img class="card-img" src="${imgUrl}" loading="lazy">` : ''}
        <div class="card-body">
          <div class="card-domain">${domain}</div>
          ${item.tag ? `<span class="card-tag">${item.tag}</span>` : ''}
        </div>
      </div>`;
  }

  // text
  const id = 'txt-' + item.id.replace(/-/g,'');
  const short = item.content.length > 200;
  return `
    <div class="card" onclick="toggleText('${id}','${item.sourceUrl}')">
      <div class="card-body">
        <div class="card-text" id="${id}">${item.content}</div>
        ${!short && domain ? `<div class="card-source"><a href="${item.sourceUrl}" target="_blank" onclick="event.stopPropagation()">${domain}</a></div>` : ''}
        ${item.tag ? `<span class="card-tag">${item.tag}</span>` : ''}
      </div>
    </div>`;
}

function renderCards() {
  const activeColors = state.activeColors.filter(Boolean);
  const filtered = (window.__allItems || []).filter(item => {
    if (state.activeTags.size && !state.activeTags.has(item.tag)) return false;
    if (state.search) {
      const hay = (item.content + item.url + item.sourceUrl + (window.__ocrCache?.[item.fileId] || '')).toLowerCase();
      if (!hay.includes(state.search)) return false;
    }
    if (activeColors.length) {
      const itemColor = window.__colorCache?.[item.fileId];
      if (!itemColor || !activeColors.includes(itemColor)) return false;
    }
    return true;
  });
  document.getElementById('cards-grid').innerHTML = filtered.map(buildCard).join('');
}

function toggleText(id, sourceUrl) {
  const el = document.getElementById(id);
  if (!el) return;
  el.classList.toggle('expanded');
  const card = el.closest('.card');
  if (el.classList.contains('expanded') && sourceUrl) {
    if (!card.querySelector('.card-source')) {
      const domain = getDomain(sourceUrl);
      card.querySelector('.card-body').insertAdjacentHTML('beforeend',
        `<div class="card-source"><a href="${sourceUrl}" target="_blank" onclick="event.stopPropagation()">${domain}</a></div>`);
    }
  }
}

// Lightbox
function openLightbox(fileId, sourceUrl) {
  const imgUrl = window.__imageMap?.[fileId];
  if (!imgUrl) return;
  const domain = getDomain(sourceUrl);
  const lb = document.createElement('div');
  lb.id = 'lightbox';
  lb.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.92);display:flex;flex-direction:column;align-items:center;justify-content:center;z-index:500;cursor:zoom-out';
  lb.innerHTML = `
    <img src="${imgUrl}" style="max-width:90vw;max-height:80vh;border-radius:8px;object-fit:contain">
    ${sourceUrl ? `<a href="${sourceUrl}" target="_blank" style="color:#888;font-size:13px;margin-top:16px;text-decoration:none" onclick="event.stopPropagation()">${domain}</a>` : ''}
  `;
  lb.onclick = () => lb.remove();
  document.body.appendChild(lb);
}
```

**Step 3: Verify cards render with correct types**

Open page, check link/image/text cards display correctly.

**Step 4: Commit**

```bash
git add viewer/index.html
git commit -m "feat(viewer): card rendering for all 3 types + lightbox"
```

---

### Task 6: Color extraction with ColorThief

**Files:**
- Modify: `viewer/index.html`

**Step 1: Add ColorThief CDN in `<head>`**

```html
<script src="https://cdnjs.cloudflare.com/ajax/libs/color-thief/2.3.0/color-thief.umd.js"></script>
```

**Step 2: Add color mapping and extraction**

```javascript
window.__colorCache = JSON.parse(localStorage.getItem('sv_colors') || '{}');

function rgbToBaseName([r, g, b]) {
  const h = rgbToHue(r, g, b);
  const s = rgbToSat(r, g, b);
  const v = Math.max(r, g, b) / 255;
  if (v < 0.15) return 'black';
  if (s < 0.12) return 'gray';
  if (h < 15 || h >= 345) return 'red';
  if (h < 40) return 'orange';
  if (h < 70) return 'yellow';
  if (h < 165) return 'green';
  if (h < 250) return 'blue';
  if (h < 290) return 'purple';
  return 'pink';
}

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
  }
  localStorage.setItem('sv_colors', JSON.stringify(window.__colorCache));
  renderCards(); // re-render with color data available
}
```

**Step 3: Call processColors after renderApp**

In `init()`, after `renderApp(items, imageMap)`:
```javascript
processColors(items, imageMap);
```

**Step 4: Verify color filtering works**

Select a color circle, select e.g. "blue" → only blue-dominant images appear.

**Step 5: Commit**

```bash
git add viewer/index.html
git commit -m "feat(viewer): color extraction with ColorThief + color filter"
```

---

### Task 7: OCR with Tesseract.js

**Files:**
- Modify: `viewer/index.html`

**Step 1: Add Tesseract CDN in `<head>`**

```html
<script src='https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js'></script>
```

**Step 2: Add OCR processing**

```javascript
window.__ocrCache = JSON.parse(localStorage.getItem('sv_ocr') || '{}');

async function processOCR(items, imageMap) {
  const toProcess = items.filter(i => i.fileId && imageMap[i.fileId] && window.__ocrCache[i.fileId] === undefined);
  if (!toProcess.length) return;
  const worker = await Tesseract.createWorker('eng');
  for (const item of toProcess) {
    try {
      const { data: { text } } = await worker.recognize(imageMap[item.fileId]);
      window.__ocrCache[item.fileId] = text.trim();
    } catch { window.__ocrCache[item.fileId] = ''; }
    localStorage.setItem('sv_ocr', JSON.stringify(window.__ocrCache));
  }
  await worker.terminate();
  renderCards(); // re-render so search now includes OCR text
}
```

**Step 3: Call processOCR after renderApp (non-blocking)**

```javascript
processOCR(items, imageMap); // no await — runs in background
```

**Step 4: Verify text search finds text in images**

Save a screenshot with visible text, search for that text in the viewer.

**Step 5: Commit**

```bash
git add viewer/index.html
git commit -m "feat(viewer): background OCR with Tesseract.js for image text search"
```

---

### Task 8: Polish + logout

**Files:**
- Modify: `viewer/index.html`

**Step 1: Add empty state, loading state, logout button**

```javascript
// In renderCards, before setting innerHTML:
if (!filtered.length) {
  document.getElementById('cards-grid').innerHTML = '<p style="color:#444;padding:40px 0">Nothing here</p>';
  return;
}

// Logout button in toolbar:
`<button onclick="logout()" style="...">Disconnect</button>`

function logout() {
  Object.values(STORAGE_KEYS).forEach(k => localStorage.removeItem(k));
  location.reload();
}
```

**Step 2: Verify empty state shows when no results**

**Step 3: Final commit**

```bash
git add viewer/index.html
git commit -m "feat(viewer): polish — empty state, logout, loading"
```

---

### Task 9: Merge to main

```bash
cd ~/Desktop/gitmerharder/telegram-one-click-save
git checkout main
git merge feature/notion-integration --no-ff -m "feat: add web viewer"
git push origin main
```

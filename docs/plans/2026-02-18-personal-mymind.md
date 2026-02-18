# Personal MyMind Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Transform the extension into a personal MyMind alternative — a beautiful dark masonry viewer with AI-powered content analysis (type detection, descriptions, structured data extraction), all running serverless inside the Chrome extension.

**Architecture:** Viewer opens as a Chrome extension tab (`chrome-extension://…/viewer/index.html`); background.js acts as a CORS-free fetch relay so the viewer can talk to Notion API and Anthropic API without any proxy server. AI analysis runs in the background after each save and/or when the viewer is opened.

**Tech Stack:** Vanilla JS/HTML/CSS, Chrome Extension MV3, Notion API v2022-06-28, Telegram Bot API, Anthropic API (claude-haiku-4-5-20251001), ColorThief CDN, Tesseract.js CDN.

---

## Task 1: manifest.json — register viewer page + context menu entry

**Files:**
- Modify: `manifest.json`
- Modify: `background.js`

**Context:** The viewer opens via right-click context menu ("Open Viewer"), NOT by clicking the extension icon. The icon click keeps its existing save-page behaviour (background.js:193). The viewer page `viewer/index.html` must be accessible as a bookmarkable URL: `chrome-extension://[id]/viewer/index.html`. No popup is added.

**Step 1: Update manifest.json**

Changes needed:
- Add `"tabs"` permission (open tab from background)
- Add `https://api.notion.com/*` and `https://api.anthropic.com/*` to host_permissions
- Add `viewer/index.html` to web_accessible_resources
- Keep `default_title` as "Save to Telegram" (icon click = save, unchanged)
- Version bump to 1.1.0

```json
{
  "manifest_version": 3,
  "name": "Telegram Instant Saver",
  "version": "1.1.0",
  "description": "Save screenshots, images, and quotes to Telegram in one click",
  "icons": {
    "16": "icons/icon-clip1-16.png",
    "48": "icons/icon-clip1-48.png",
    "128": "icons/icon-clip1-128.png"
  },
  "action": {
    "default_icon": {
      "16": "icons/icon-clip1-16.png",
      "48": "icons/icon-clip1-48.png"
    },
    "default_title": "Save to Telegram"
  },
  "background": {
    "service_worker": "background.js"
  },
  "options_page": "options/options.html",
  "content_scripts": [
    {
      "matches": ["<all_urls>"],
      "js": ["content.js"],
      "css": ["content.css"],
      "run_at": "document_start"
    }
  ],
  "permissions": [
    "activeTab",
    "contextMenus",
    "storage",
    "scripting",
    "tabs"
  ],
  "host_permissions": [
    "https://api.telegram.org/*",
    "https://api.notion.com/*",
    "https://api.anthropic.com/*",
    "<all_urls>"
  ],
  "web_accessible_resources": [
    {
      "resources": [
        "MartianMono-Regular.ttf",
        "icons/*.png",
        "viewer/index.html"
      ],
      "matches": ["<all_urls>"]
    }
  ]
}
```

**Step 2: Add "Open Viewer" context menu item in background.js**

Find where context menus are created in background.js (search for `chrome.contextMenus.create`). Add a separator and viewer item at the end of the menu registration block:

```js
chrome.contextMenus.create({
  id: 'separator-viewer',
  type: 'separator',
  contexts: ['all']
});

chrome.contextMenus.create({
  id: 'open-viewer',
  title: 'Open Viewer',
  contexts: ['all']
});
```

**Step 3: Handle "open-viewer" in the contextMenus.onClicked listener**

Find the `chrome.contextMenus.onClicked.addListener` block in background.js. Add a handler for the new item at the TOP of the switch/if chain (before existing save handlers):

```js
if (info.menuItemId === 'open-viewer') {
  const viewerUrl = chrome.runtime.getURL('viewer/index.html');
  const existing = await chrome.tabs.query({ url: viewerUrl });
  if (existing.length > 0) {
    await chrome.tabs.update(existing[0].id, { active: true });
    await chrome.windows.update(existing[0].windowId, { focused: true });
  } else {
    await chrome.tabs.create({ url: viewerUrl });
  }
  return;
}
```

**Step 4: Test manually**
- Load/reload extension in Chrome (`chrome://extensions` → refresh)
- Right-click any page → confirm "Open Viewer" item appears at bottom of context menu
- Click "Open Viewer" → viewer tab opens at `chrome-extension://…/viewer/index.html`
- Right-click again → same tab is focused, not a duplicate
- Copy the tab URL and bookmark it — confirm it's a valid bookmarkable URL
- Click extension icon → confirm existing save-page behaviour is unchanged

**Step 5: Commit**
```bash
git add manifest.json background.js
git commit -m "feat: add Open Viewer context menu item, viewer accessible as bookmarkable URL"
```

---

## Task 2: background.js — fetch relay for viewer

**Files:**
- Modify: `background.js`

**Context:** The viewer (`chrome-extension://` page) cannot fetch Notion API or Anthropic API directly due to CORS. background.js can. We add a `chrome.runtime.onMessage` handler that proxies fetch calls from the viewer.

**Step 1: Add fetch relay message handler to background.js**

Append at the end of `background.js` (before any closing code):

```js
// ─── Viewer fetch relay ───────────────────────────────────────────────────────
// Allows viewer/index.html (chrome-extension:// page) to make CORS-free requests
// through background.js. Viewer sends: { type: 'FETCH', url, options }
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type !== 'FETCH') return false;

  fetch(msg.url, msg.options || {})
    .then(async res => {
      const text = await res.text();
      sendResponse({ ok: res.ok, status: res.status, body: text });
    })
    .catch(err => {
      sendResponse({ ok: false, status: 0, body: err.message });
    });

  return true; // keep message channel open for async response
});
```

**Step 2: Test relay manually**
- Open viewer tab
- Open DevTools console on the viewer tab
- Run:
```js
chrome.runtime.sendMessage(
  { type: 'FETCH', url: 'https://api.notion.com/v1/users/me', options: {
    headers: { 'Authorization': 'Bearer YOUR_TOKEN', 'Notion-Version': '2022-06-28' }
  }},
  r => console.log(r)
)
```
- Confirm response comes back (even a 401 means the relay works)

**Step 3: Commit**
```bash
git add background.js
git commit -m "feat(background): add fetch relay for viewer CORS bypass"
```

---

## Task 3: background.js — AI settings defaults + analyzeWithAI function

**Files:**
- Modify: `background.js`

**Context:** We need to store AI settings in DEFAULT_SETTINGS and add a function that calls Anthropic API with a content item and returns structured analysis. This function will be called both on save and from the viewer relay.

**Step 1: Add AI fields to DEFAULT_SETTINGS (background.js:21)**

```js
// In DEFAULT_SETTINGS object, add after notionDbId:
aiEnabled: false,
aiProvider: 'anthropic',
aiApiKey: '',
aiModel: 'claude-haiku-4-5-20251001',
aiAutoOnSave: true,
aiAutoInViewer: true,
```

**Step 2: Add analyzeWithAI function to background.js**

Append after the `saveToNotion` function (after line ~294):

```js
// ─── AI Analysis ─────────────────────────────────────────────────────────────

const AI_PROMPT = `Analyze this saved content and return ONLY valid JSON, no other text:
{
  "type": "article|video|product|x_post",
  "description": "1-2 sentence summary of what this is",
  "data": {},
  "tags": []
}

Rules:
- type must be exactly one of: article, video, product, x_post
- For product: data = {"price": "$X", "product_name": "..."}
- For x_post: data = {"tweet_text": "full text", "author": "@handle"}
- For article: data = {"headline": "..."}
- For video: data = {"title": "...", "channel": "..."}
- tags: up to 3 short descriptive English words
- description: plain text, no markdown`;

async function analyzeWithAI(item, settings) {
  if (!settings.aiEnabled || !settings.aiApiKey) return null;

  try {
    const messages = [];

    if (item.fileId && settings.botToken) {
      // Get Telegram image URL first
      const fileRes = await fetch(
        `https://api.telegram.org/bot${settings.botToken}/getFile?file_id=${item.fileId}`
      );
      const fileData = await fileRes.json();
      if (fileData.ok) {
        const imgUrl = `https://api.telegram.org/file/bot${settings.botToken}/${fileData.result.file_path}`;
        messages.push({
          role: 'user',
          content: [
            { type: 'image', source: { type: 'url', url: imgUrl } },
            { type: 'text', text: AI_PROMPT }
          ]
        });
      }
    }

    if (messages.length === 0) {
      // Text/link only
      const context = [
        item.sourceUrl ? `URL: ${item.sourceUrl}` : '',
        item.content ? `Content: ${item.content.slice(0, 500)}` : '',
        item.tagName ? `User tag: ${item.tagName}` : ''
      ].filter(Boolean).join('\n');

      messages.push({
        role: 'user',
        content: `${AI_PROMPT}\n\nContent to analyze:\n${context}`
      });
    }

    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': settings.aiApiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        model: settings.aiModel || 'claude-haiku-4-5-20251001',
        max_tokens: 300,
        messages
      })
    });

    if (!res.ok) {
      console.warn('[TG Saver] AI error:', res.status);
      return null;
    }

    const data = await res.json();
    const text = data.content?.[0]?.text || '';
    return JSON.parse(text);
  } catch (e) {
    console.warn('[TG Saver] AI parse error:', e);
    return null;
  }
}
```

**Step 3: Add patchNotionWithAI helper**

Append right after `analyzeWithAI`:

```js
async function patchNotionWithAI(pageId, aiResult, settings) {
  if (!pageId || !aiResult) return;

  const properties = {
    'ai_analyzed': { checkbox: true }
  };

  if (aiResult.type) {
    properties['ai_type'] = { select: { name: aiResult.type } };
  }
  if (aiResult.description) {
    properties['ai_description'] = {
      rich_text: [{ text: { content: aiResult.description.slice(0, 2000) } }]
    };
  }
  if (aiResult.data || aiResult.tags) {
    const dataStr = JSON.stringify({ ...aiResult.data, tags: aiResult.tags });
    properties['ai_data'] = {
      rich_text: [{ text: { content: dataStr.slice(0, 2000) } }]
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
```

**Step 4: Add AI message handler to the fetch relay block**

In the `chrome.runtime.onMessage.addListener` block added in Task 2, ADD a second handler before the return:

```js
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
```

**Step 5: Commit**
```bash
git add background.js
git commit -m "feat(background): add AI analysis + Notion patch helpers"
```

---

## Task 4: background.js — trigger AI after save

**Files:**
- Modify: `background.js`

**Context:** After `saveToNotion` returns a page ID, we should fire AI analysis if enabled. Currently `saveToNotion` doesn't return the page ID. We need to fix that.

**Step 1: Make saveToNotion return the page ID**

In `saveToNotion` function (around line 277), change:
```js
    const res = await fetch('https://api.notion.com/v1/pages', {
```

Replace the try block to capture and return the ID:
```js
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
```

Also remove `async` keyword issue — `saveToNotion` must already be async (it is, line 258).

**Step 2: Fire AI after save in sendScreenshotDirect**

In `sendScreenshotDirect` (around line 1118), change:
```js
  saveToNotion({ type: 'link', sourceUrl: tab.url, fileId: result?.fileId || null, tagName: selectedTag?.name }, settings);
```
to:
```js
  const notionPageId = await saveToNotion({ type: 'link', sourceUrl: tab.url, fileId: result?.fileId || null, tagName: selectedTag?.name }, settings);
  if (settings.aiEnabled && settings.aiAutoOnSave && notionPageId) {
    analyzeWithAI({ sourceUrl: tab.url, fileId: result?.fileId || null, tagName: selectedTag?.name }, settings)
      .then(aiResult => patchNotionWithAI(notionPageId, aiResult, settings))
      .catch(e => console.warn('[TG Saver] AI on-save error:', e));
  }
```

Repeat the same pattern for all other `saveToNotion(...)` call sites (search for `saveToNotion(` in background.js — there are ~4 calls). For each, capture the returned `pageId` and fire AI if enabled. The pattern is always:
```js
const notionPageId = await saveToNotion({...}, settings);
if (settings.aiEnabled && settings.aiAutoOnSave && notionPageId) {
  analyzeWithAI({ sourceUrl: ..., fileId: ..., content: ..., tagName: ... }, settings)
    .then(r => patchNotionWithAI(notionPageId, r, settings))
    .catch(e => console.warn('[TG Saver] AI on-save error:', e));
}
```

**Step 3: Commit**
```bash
git add background.js
git commit -m "feat(background): trigger AI analysis after each save"
```

---

## Task 5: options — add AI settings section (dev/ first)

**Files:**
- Modify: `dev/options.js`
- Modify: `dev/index.html`

**Context:** Work in `dev/` first (mock chrome.storage). Add AI section after Notion section. Per CLAUDE.md, run dev server on port 8080 and verify in browser before copying to production.

**Step 1: Add AI defaults to dev/options.js**

In `dev/options.js`, find the DEFAULT_SETTINGS object (around line 24) and add after `notionDbId`:
```js
aiEnabled: false,
aiProvider: 'anthropic',
aiApiKey: '',
aiModel: 'claude-haiku-4-5-20251001',
aiAutoOnSave: true,
aiAutoInViewer: true,
```

**Step 2: Add AI UI section to dev/index.html**

Find the closing `</section>` of the Notion section and add after it:

```html
<!-- AI Analysis Section -->
<section class="settings-section" id="section-ai">
  <div class="section-header">
    <h2 class="section-title">AI Analysis</h2>
    <p class="section-desc">Connect an AI model to auto-tag and describe every saved item.</p>
  </div>

  <div class="setting-row">
    <div class="setting-label">
      <span>Enable AI analysis</span>
    </div>
    <div class="setting-control">
      <label class="toggle">
        <input type="checkbox" id="aiEnabled">
        <span class="toggle-slider"></span>
      </label>
    </div>
  </div>

  <div id="ai-config" class="hidden">
    <div class="setting-row">
      <div class="setting-label"><span>Provider</span></div>
      <div class="setting-control">
        <select id="aiProvider" class="select-input">
          <option value="anthropic">Anthropic (Claude)</option>
        </select>
      </div>
    </div>

    <div class="setting-row">
      <div class="setting-label"><span>API Key</span></div>
      <div class="setting-control input-with-toggle">
        <input type="password" id="aiApiKey" placeholder="sk-ant-…" class="text-input">
        <button class="show-hide-btn" data-target="aiApiKey">Show</button>
      </div>
    </div>

    <div class="setting-row">
      <div class="setting-label"><span>Model</span></div>
      <div class="setting-control">
        <select id="aiModel" class="select-input">
          <option value="claude-haiku-4-5-20251001">Haiku (fast, cheap)</option>
          <option value="claude-sonnet-4-6">Sonnet (smarter)</option>
        </select>
      </div>
    </div>

    <div class="setting-row">
      <div class="setting-label"><span>Analyze on save</span></div>
      <div class="setting-control">
        <label class="toggle">
          <input type="checkbox" id="aiAutoOnSave">
          <span class="toggle-slider"></span>
        </label>
      </div>
    </div>

    <div class="setting-row">
      <div class="setting-label"><span>Analyze in background (viewer)</span></div>
      <div class="setting-control">
        <label class="toggle">
          <input type="checkbox" id="aiAutoInViewer">
          <span class="toggle-slider"></span>
        </label>
      </div>
    </div>

    <div class="setting-row">
      <button id="testAiBtn" class="secondary-btn">Test connection</button>
      <span id="aiTestStatus" class="status-text"></span>
    </div>
  </div>
</section>
```

**Step 3: Wire up JS in dev/options.js**

Add after the Notion section's JS wiring:

```js
// AI section
const aiEnabledInput = document.getElementById('aiEnabled');
const aiConfig = document.getElementById('ai-config');
const aiProviderInput = document.getElementById('aiProvider');
const aiApiKeyInput = document.getElementById('aiApiKey');
const aiModelInput = document.getElementById('aiModel');
const aiAutoOnSaveInput = document.getElementById('aiAutoOnSave');
const aiAutoInViewerInput = document.getElementById('aiAutoInViewer');
const testAiBtn = document.getElementById('testAiBtn');
const aiTestStatus = document.getElementById('aiTestStatus');

function updateAiConfigVisibility() {
  aiConfig?.classList.toggle('hidden', !aiEnabledInput?.checked);
}

aiEnabledInput?.addEventListener('change', e => {
  saveSetting('aiEnabled', e.target.checked);
  updateAiConfigVisibility();
});
aiProviderInput?.addEventListener('change', e => saveSetting('aiProvider', e.target.value));
aiApiKeyInput?.addEventListener('change', e => saveSetting('aiApiKey', e.target.value));
aiModelInput?.addEventListener('change', e => saveSetting('aiModel', e.target.value));
aiAutoOnSaveInput?.addEventListener('change', e => saveSetting('aiAutoOnSave', e.target.checked));
aiAutoInViewerInput?.addEventListener('change', e => saveSetting('aiAutoInViewer', e.target.checked));

testAiBtn?.addEventListener('click', async () => {
  aiTestStatus.textContent = 'Testing…';
  const key = aiApiKeyInput?.value;
  if (!key) { aiTestStatus.textContent = 'Enter API key first'; return; }
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({ model: 'claude-haiku-4-5-20251001', max_tokens: 10, messages: [{ role: 'user', content: 'hi' }] })
    });
    aiTestStatus.textContent = res.ok ? '✓ Connected' : `✗ Error ${res.status}`;
  } catch (e) {
    aiTestStatus.textContent = '✗ Network error';
  }
});
```

In the `loadSettings` / `applySettings` function, add:
```js
if (aiEnabledInput) aiEnabledInput.checked = settings.aiEnabled || false;
if (aiProviderInput) aiProviderInput.value = settings.aiProvider || 'anthropic';
if (aiApiKeyInput) aiApiKeyInput.value = settings.aiApiKey || '';
if (aiModelInput) aiModelInput.value = settings.aiModel || 'claude-haiku-4-5-20251001';
if (aiAutoOnSaveInput) aiAutoOnSaveInput.checked = settings.aiAutoOnSave !== false;
if (aiAutoInViewerInput) aiAutoInViewerInput.checked = settings.aiAutoInViewer !== false;
updateAiConfigVisibility();
```

**Step 4: Verify in browser**
```
python3 -m http.server 8080  # from project root
# Open http://localhost:8080/dev/index.html
# Scroll to AI section, toggle enable, fill key, click Test
```

**Step 5: Copy to production**
```bash
cp dev/index.html options/index.html
cp dev/options.css options/options.css
# Manually copy AI JS changes into options/options.js (remove mock block at top of dev/options.js)
```

**Step 6: Commit**
```bash
git add dev/index.html dev/options.js dev/options.css options/index.html options/options.css options/options.js
git commit -m "feat(options): add AI analysis settings section"
```

---

## Task 6: viewer — CORS-free helpers + data fetching rewrite

**Files:**
- Modify: `viewer/index.html`

**Context:** Currently viewer fetches Notion via `server.js` proxy (`/notion-proxy/…`). We replace all fetches with chrome.runtime.sendMessage relay from Task 2. The viewer also needs to read AI settings from chrome.storage.

**Step 1: Add bgFetch helper at top of viewer's `<script>`**

Replace the existing fetch-to-notion calls. At the top of the inline `<script>` block, add:

```js
// CORS-free fetch via background.js relay
function bgFetch(url, options = {}) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage({ type: 'FETCH', url, options }, response => {
      if (chrome.runtime.lastError) return reject(chrome.runtime.lastError);
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

// Read settings from chrome.storage
function getSettings() {
  return new Promise(resolve => {
    chrome.storage.local.get(null, data => resolve(data));
  });
}
```

**Step 2: Replace all `fetch('/notion-proxy/…')` calls with `bgFetch('https://api.notion.com/…')`**

Search for `/notion-proxy` in viewer/index.html and replace each occurrence.

Pattern to find:
```js
fetch('/notion-proxy/v1/
```
Replace with:
```js
bgFetch('https://api.notion.com/v1/
```

Also replace `fetch('https://api.notion.com` (if any direct calls exist) with `bgFetch('https://api.notion.com`.

**Step 3: Read credentials from chrome.storage instead of auth modal**

The viewer currently shows an auth modal asking for tokens. With extension context, credentials are already in `chrome.storage.local`. Replace the modal flow:

In the `init()` / `connect()` function, before showing modal check if settings already have tokens:

```js
async function init() {
  const settings = await getSettings();
  if (settings.notionToken && settings.notionDbId && settings.botToken) {
    // Auto-connect with stored credentials
    STATE.notionToken = settings.notionToken;
    STATE.notionDbId = settings.notionDbId;
    STATE.botToken = settings.botToken;
    STATE.aiEnabled = settings.aiEnabled && settings.aiApiKey;
    STATE.aiAutoInViewer = settings.aiAutoInViewer !== false;
    hideModal();
    await loadItems();
  } else {
    showModal(); // fallback: show manual entry
  }
}
```

**Step 4: Commit**
```bash
git add viewer/index.html
git commit -m "feat(viewer): replace server proxy with background.js relay, auto-load credentials"
```

---

## Task 7: viewer — full MyMind redesign

**Files:**
- Modify: `viewer/index.html` (CSS + HTML structure + JS card rendering)

**Context:** This is the biggest visual task. Replace the current grid layout with a true masonry layout and MyMind-inspired dark aesthetic. Card types render differently based on `type` and `ai_type`.

**Step 1: Replace CSS — base layout and typography**

Replace `<style>` block entirely with the new design:

```css
* { margin: 0; padding: 0; box-sizing: border-box; }

:root {
  --bg: #080808;
  --surface: #111;
  --surface2: #181818;
  --border: rgba(255,255,255,0.06);
  --text: #e8e8e8;
  --text-muted: #666;
  --text-dim: #444;
  --accent: #fff;
  --radius: 14px;
  --font: -apple-system, BlinkMacSystemFont, 'Inter', 'Segoe UI', sans-serif;
}

body {
  font-family: var(--font);
  background: var(--bg);
  color: var(--text);
  min-height: 100vh;
  overscroll-behavior: none;
}

/* ── Toolbar ── */
#toolbar {
  position: fixed;
  top: 0; left: 0; right: 0;
  height: 56px;
  background: rgba(8,8,8,0.85);
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
  border-bottom: 1px solid var(--border);
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 0 20px;
  z-index: 100;
}

#search-input {
  flex: 1;
  max-width: 320px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 7px 12px;
  color: var(--text);
  font-size: 13px;
  outline: none;
  transition: border-color 0.15s;
}
#search-input:focus { border-color: rgba(255,255,255,0.2); }
#search-input::placeholder { color: var(--text-dim); }

.type-filters {
  display: flex;
  gap: 4px;
}

.type-pill {
  background: transparent;
  border: 1px solid var(--border);
  border-radius: 20px;
  padding: 4px 12px;
  font-size: 12px;
  color: var(--text-muted);
  cursor: pointer;
  transition: all 0.15s;
  white-space: nowrap;
}
.type-pill:hover { border-color: rgba(255,255,255,0.2); color: var(--text); }
.type-pill.active { background: var(--accent); color: #000; border-color: var(--accent); }

.toolbar-right {
  margin-left: auto;
  display: flex;
  align-items: center;
  gap: 10px;
}

#ai-status {
  font-size: 11px;
  color: var(--text-muted);
  white-space: nowrap;
}

/* ── Masonry Grid ── */
#grid-wrap {
  padding: 72px 16px 40px;
}

#masonry {
  columns: 5;
  column-gap: 10px;
}

@media (max-width: 1400px) { #masonry { columns: 4; } }
@media (max-width: 1100px) { #masonry { columns: 3; } }
@media (max-width: 750px)  { #masonry { columns: 2; } }
@media (max-width: 480px)  { #masonry { columns: 1; } }

/* ── Cards ── */
.card {
  break-inside: avoid;
  margin-bottom: 10px;
  border-radius: var(--radius);
  overflow: hidden;
  cursor: pointer;
  position: relative;
  transition: transform 0.2s ease, box-shadow 0.2s ease;
}
.card:hover {
  transform: translateY(-2px);
  box-shadow: 0 8px 32px rgba(0,0,0,0.5);
}

/* Image card */
.card-image .card-img {
  width: 100%;
  display: block;
  border-radius: var(--radius);
}
.card-image .card-overlay {
  position: absolute;
  inset: 0;
  background: linear-gradient(to top, rgba(0,0,0,0.85) 0%, transparent 50%);
  border-radius: var(--radius);
  opacity: 0;
  transition: opacity 0.2s;
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
  padding: 14px;
}
.card-image:hover .card-overlay { opacity: 1; }
.card-overlay-desc { font-size: 12px; color: rgba(255,255,255,0.85); line-height: 1.4; }

/* Link card */
.card-link {
  background: var(--surface);
  border: 1px solid var(--border);
  padding: 14px;
}
.card-link .card-favicon {
  width: 16px; height: 16px;
  border-radius: 3px;
  margin-bottom: 8px;
  display: block;
}
.card-link .card-domain {
  font-size: 11px;
  color: var(--text-muted);
  margin-bottom: 6px;
  display: block;
}
.card-link .card-title {
  font-size: 13px;
  color: var(--text);
  line-height: 1.45;
  font-weight: 500;
}
.card-link .card-og-img {
  width: 100%;
  border-radius: 8px;
  margin-bottom: 10px;
  display: block;
}
.card-link .card-desc {
  font-size: 12px;
  color: var(--text-muted);
  margin-top: 6px;
  line-height: 1.45;
}

/* Text / quote card */
.card-text {
  background: var(--surface2);
  border: 1px solid var(--border);
  padding: 16px;
}
.card-text .card-quote {
  font-size: 14px;
  line-height: 1.6;
  color: var(--text);
  font-style: italic;
}
.card-text .card-source {
  font-size: 11px;
  color: var(--text-dim);
  margin-top: 8px;
}

/* X post card */
.card-xpost {
  background: #0d0d0d;
  border: 1px solid rgba(29,155,240,0.15);
  padding: 16px;
}
.card-xpost .xpost-author {
  font-size: 12px;
  color: #1d9bf0;
  margin-bottom: 8px;
  font-weight: 500;
}
.card-xpost .xpost-text {
  font-size: 14px;
  line-height: 1.6;
  color: var(--text);
}

/* Product card */
.card-product {
  background: var(--surface);
  border: 1px solid var(--border);
  overflow: hidden;
}
.card-product .product-img {
  width: 100%;
  display: block;
  max-height: 220px;
  object-fit: cover;
}
.card-product .product-info {
  padding: 12px 14px;
}
.card-product .product-name {
  font-size: 13px;
  color: var(--text);
  line-height: 1.4;
  font-weight: 500;
}
.card-product .product-price {
  font-size: 18px;
  font-weight: 700;
  color: var(--accent);
  margin-top: 6px;
}

/* Type badge */
.type-badge {
  position: absolute;
  top: 10px; right: 10px;
  background: rgba(0,0,0,0.65);
  backdrop-filter: blur(8px);
  border-radius: 6px;
  padding: 3px 8px;
  font-size: 10px;
  color: rgba(255,255,255,0.7);
  font-weight: 600;
  letter-spacing: 0.5px;
  text-transform: uppercase;
}

/* Pending AI badge */
.badge-pending {
  width: 6px; height: 6px;
  background: var(--text-dim);
  border-radius: 50%;
  position: absolute;
  top: 10px; left: 10px;
}

/* ── Lightbox ── */
#lightbox {
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,0.92);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 500;
  cursor: zoom-out;
}
#lightbox.hidden { display: none; }
#lightbox img {
  max-width: 90vw;
  max-height: 90vh;
  border-radius: 10px;
  object-fit: contain;
}

/* ── Auth modal ── */
#auth-modal {
  position: fixed; inset: 0;
  background: rgba(0,0,0,0.7);
  display: flex; align-items: center; justify-content: center;
  z-index: 1000;
}
#auth-modal.hidden { display: none; }
.auth-box {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 16px;
  padding: 32px;
  width: 380px;
}
.auth-box h2 { font-size: 16px; font-weight: 600; margin-bottom: 20px; }
.auth-field { margin-bottom: 14px; }
.auth-field label { display: block; font-size: 11px; color: var(--text-muted); margin-bottom: 5px; text-transform: uppercase; letter-spacing: 0.5px; }
.auth-field input { width: 100%; background: var(--bg); border: 1px solid var(--border); border-radius: 8px; padding: 9px 12px; color: var(--text); font-size: 13px; outline: none; }
.auth-field input:focus { border-color: rgba(255,255,255,0.2); }
.auth-btn { width: 100%; background: var(--accent); color: #000; border: none; border-radius: 8px; padding: 11px; font-size: 13px; font-weight: 600; cursor: pointer; margin-top: 6px; }
.auth-btn:hover { opacity: 0.9; }

/* ── Empty state ── */
#empty-state {
  position: fixed; inset: 0;
  display: flex; flex-direction: column;
  align-items: center; justify-content: center;
  color: var(--text-dim);
  font-size: 14px;
  gap: 8px;
}
#empty-state.hidden { display: none; }

.hidden { display: none !important; }
```

**Step 2: Rewrite HTML structure**

Replace `<body>` content with:
```html
<body>
  <!-- Auth modal (fallback if no stored credentials) -->
  <div id="auth-modal" class="hidden">
    <div class="auth-box">
      <h2>Connect your workspace</h2>
      <div class="auth-field">
        <label>Notion Token</label>
        <input type="password" id="input-notion-token" placeholder="secret_…">
      </div>
      <div class="auth-field">
        <label>Notion Database ID</label>
        <input type="text" id="input-notion-db" placeholder="30b6081f-…">
      </div>
      <div class="auth-field">
        <label>Telegram Bot Token</label>
        <input type="password" id="input-bot-token" placeholder="123456:ABC…">
      </div>
      <button class="auth-btn" id="connect-btn">Connect</button>
      <p style="font-size:11px;color:#444;margin-top:12px;text-align:center">
        Or configure in <a href="#" id="open-settings-link" style="color:#666">extension settings</a>
      </p>
    </div>
  </div>

  <!-- Toolbar -->
  <div id="toolbar">
    <input type="text" id="search-input" placeholder="Search…">
    <div class="type-filters">
      <button class="type-pill active" data-type="all">All</button>
      <button class="type-pill" data-type="image">Images</button>
      <button class="type-pill" data-type="article">Articles</button>
      <button class="type-pill" data-type="product">Products</button>
      <button class="type-pill" data-type="x_post">Posts</button>
      <button class="type-pill" data-type="video">Videos</button>
    </div>
    <div class="toolbar-right">
      <!-- Color filters (keep existing 6-slot logic, transplant here) -->
      <div id="color-filters" class="color-filters"></div>
      <span id="ai-status"></span>
    </div>
  </div>

  <!-- Grid -->
  <div id="grid-wrap">
    <div id="masonry"></div>
  </div>

  <!-- Empty state -->
  <div id="empty-state" class="hidden">
    <span style="font-size:32px">📭</span>
    <span>Nothing saved yet</span>
  </div>

  <!-- Lightbox -->
  <div id="lightbox" class="hidden">
    <img id="lightbox-img" src="" alt="">
  </div>
```

**Step 3: Rewrite card rendering JS**

Replace existing `renderCard` / `renderCards` functions with typed renderers:

```js
function getImageUrl(item) {
  if (!item._resolvedImg) return null;
  return item._resolvedImg;
}

function getDomain(url) {
  try { return new URL(url).hostname.replace('www.', ''); } catch { return url; }
}

function parseAiData(item) {
  try { return JSON.parse(item.ai_data || '{}'); } catch { return {}; }
}

function renderCard(item) {
  const aiData = parseAiData(item);
  const aiType = item.ai_type || null;
  const imgUrl = getImageUrl(item);
  const type = item.type; // 'image' | 'link' | 'text'

  const card = document.createElement('div');
  card.className = 'card';
  card.dataset.id = item.id;

  // Pending AI badge
  if (!item.ai_analyzed) {
    const dot = document.createElement('div');
    dot.className = 'badge-pending';
    card.appendChild(dot);
  }

  // ── Product ──
  if (aiType === 'product' && imgUrl) {
    card.classList.add('card-product');
    card.innerHTML = `
      <img class="product-img" src="${imgUrl}" loading="lazy" alt="">
      <div class="product-info">
        <div class="product-name">${aiData.product_name || item.title || getDomain(item.sourceUrl || '')}</div>
        ${aiData.price ? `<div class="product-price">${aiData.price}</div>` : ''}
      </div>`;
    card.addEventListener('click', () => openLightbox(imgUrl));
    return card;
  }

  // ── X Post ──
  if (aiType === 'x_post') {
    card.classList.add('card-xpost');
    card.innerHTML = `
      ${aiData.author ? `<div class="xpost-author">${aiData.author}</div>` : ''}
      <div class="xpost-text">${aiData.tweet_text || item.content || item.ai_description || ''}</div>`;
    if (item.sourceUrl) card.addEventListener('click', () => window.open(item.sourceUrl, '_blank'));
    return card;
  }

  // ── Image ──
  if (type === 'image' && imgUrl) {
    card.classList.add('card-image');
    card.innerHTML = `
      <img class="card-img" src="${imgUrl}" loading="lazy" alt="">
      <div class="card-overlay">
        ${item.ai_description ? `<div class="card-overlay-desc">${item.ai_description}</div>` : ''}
      </div>
      ${aiType ? `<div class="type-badge">${aiType}</div>` : ''}`;
    card.addEventListener('click', () => openLightbox(imgUrl));
    return card;
  }

  // ── Link ──
  if (type === 'link') {
    const domain = getDomain(item.sourceUrl || '');
    card.classList.add('card-link');
    card.innerHTML = `
      <img class="card-favicon" src="https://www.google.com/s2/favicons?domain=${domain}&sz=32" alt="">
      <span class="card-domain">${domain}</span>
      <div class="card-title">${item.title || item.ai_description || domain}</div>
      ${item.ai_description && item.title ? `<div class="card-desc">${item.ai_description}</div>` : ''}`;
    if (item.sourceUrl) card.addEventListener('click', () => window.open(item.sourceUrl, '_blank'));
    return card;
  }

  // ── Text / Quote ──
  card.classList.add('card-text');
  card.innerHTML = `
    <div class="card-quote">${item.content || item.ai_description || ''}</div>
    ${item.sourceUrl ? `<div class="card-source">${getDomain(item.sourceUrl)}</div>` : ''}`;
  return card;
}

function renderAll(items) {
  const masonry = document.getElementById('masonry');
  masonry.innerHTML = '';
  if (items.length === 0) {
    document.getElementById('empty-state').classList.remove('hidden');
    return;
  }
  document.getElementById('empty-state').classList.add('hidden');
  items.forEach(item => masonry.appendChild(renderCard(item)));
}
```

**Step 4: Add lightbox logic**
```js
function openLightbox(url) {
  const lb = document.getElementById('lightbox');
  document.getElementById('lightbox-img').src = url;
  lb.classList.remove('hidden');
}

document.getElementById('lightbox')?.addEventListener('click', () => {
  document.getElementById('lightbox').classList.add('hidden');
  document.getElementById('lightbox-img').src = '';
});
```

**Step 5: Commit**
```bash
git add viewer/index.html
git commit -m "feat(viewer): MyMind dark masonry redesign, typed card rendering"
```

---

## Task 8: viewer — AI background processing

**Files:**
- Modify: `viewer/index.html`

**Context:** When viewer opens with AI enabled, it finds un-analyzed items and processes them in batches of 3 via `AI_ANALYZE` message to background.js.

**Step 1: Add AI processing function to viewer JS**

```js
async function runAiBackgroundProcessing(items) {
  const settings = await getSettings();
  if (!settings.aiEnabled || !settings.aiAutoInViewer || !settings.aiApiKey) return;

  const pending = items.filter(item => !item.ai_analyzed && item.id);
  if (pending.length === 0) {
    document.getElementById('ai-status').textContent = '✓ All analyzed';
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
        if (response?.ok && response.result) {
          // Update item in STATE
          item.ai_type = response.result.type;
          item.ai_description = response.result.description;
          item.ai_data = JSON.stringify({ ...response.result.data, tags: response.result.tags });
          item.ai_analyzed = true;

          // Re-render that card in place
          const oldCard = document.querySelector(`.card[data-id="${item.id}"]`);
          if (oldCard) oldCard.replaceWith(renderCard(item));
        }
        done++;
        aiStatus.textContent = `Analyzing ${done}/${pending.length}…`;
        resolve();
      });
    })));

    // Small pause between batches to avoid rate limits
    if (i + BATCH < pending.length) {
      await new Promise(r => setTimeout(r, 500));
    }
  }

  aiStatus.textContent = `✓ ${done} analyzed`;
}
```

**Step 2: Call it after loadItems**

In the `init()` function, after items are loaded and rendered:
```js
await loadItems();
runAiBackgroundProcessing(STATE.items); // fire-and-forget
```

**Step 3: Commit**
```bash
git add viewer/index.html
git commit -m "feat(viewer): AI background analysis with progress indicator"
```

---

## Task 9: filtering — type filter + search

**Files:**
- Modify: `viewer/index.html`

**Context:** Type filter pills (All / Images / Articles / Products / Posts / Videos) and search should filter the in-memory `STATE.items` array and re-render.

**Step 1: Add filter state and filter function**

```js
// Filter state
const FILTER = { type: 'all', search: '', colors: [] };

function applyFilters() {
  let items = STATE.items;

  if (FILTER.type !== 'all') {
    items = items.filter(item => {
      if (FILTER.type === 'image') return item.type === 'image';
      return item.ai_type === FILTER.type;
    });
  }

  if (FILTER.search.trim()) {
    const q = FILTER.search.toLowerCase();
    items = items.filter(item =>
      (item.title || '').toLowerCase().includes(q) ||
      (item.ai_description || '').toLowerCase().includes(q) ||
      (item.content || '').toLowerCase().includes(q) ||
      (item.sourceUrl || '').toLowerCase().includes(q) ||
      (item.ai_data || '').toLowerCase().includes(q) ||
      (item._ocrText || '').toLowerCase().includes(q)
    );
  }

  if (FILTER.colors.length > 0) {
    items = items.filter(item => item._dominantColor && FILTER.colors.includes(item._dominantColor));
  }

  renderAll(items);
}
```

**Step 2: Wire up type pills**

```js
document.querySelectorAll('.type-pill').forEach(pill => {
  pill.addEventListener('click', () => {
    document.querySelectorAll('.type-pill').forEach(p => p.classList.remove('active'));
    pill.classList.add('active');
    FILTER.type = pill.dataset.type;
    applyFilters();
  });
});
```

**Step 3: Wire up search**

```js
document.getElementById('search-input')?.addEventListener('input', e => {
  FILTER.search = e.target.value;
  applyFilters();
});
```

**Step 4: Commit**
```bash
git add viewer/index.html
git commit -m "feat(viewer): type filter pills and search"
```

---

## Task 10: final wiring + smoke test

**Files:**
- `viewer/index.html`, `background.js`, `manifest.json`

**Step 1: Reload extension in Chrome**
- Go to `chrome://extensions`
- Click the refresh button on the extension
- Check for errors in service worker console

**Step 2: End-to-end smoke test checklist**
- [ ] Click extension icon → viewer tab opens
- [ ] Viewer auto-connects with stored credentials (no modal)
- [ ] Items load from Notion and render as cards
- [ ] Image cards show photo, hover shows overlay
- [ ] Link cards show favicon + domain
- [ ] Type filter pills filter correctly
- [ ] Search filters by text
- [ ] AI status shows in toolbar (if key configured)
- [ ] Right-click save still works → toast appears
- [ ] AI analysis fires after save (check Notion DB for ai_type field)
- [ ] Options page AI section saves correctly

**Step 3: Commit any fixes found during smoke test**
```bash
git add -A
git commit -m "fix: smoke test fixes"
```

**Step 4: Tag release**
```bash
git tag v1.1.0
```

---

## Out of Scope (future phases)

- Mobile access via Cloudflare Worker
- Local JSON backend (offline mode)
- Additional AI providers (OpenAI, Gemini, Ollama)
- Semantic / embedding-based search
- Sharing / export
- Keyboard navigation in viewer

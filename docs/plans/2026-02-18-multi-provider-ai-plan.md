# Multi-Provider AI + Viewer Settings Panel — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add Google Gemini support alongside Anthropic, make provider/model selectable everywhere, and replace the viewer's auth modal with an inline settings panel.

**Architecture:** `analyzeWithAI` becomes a router that calls `callGemini` or `callAnthropic` based on `settings.aiProvider`. The viewer gets a slide-in settings panel (gear icon in toolbar) that reads/writes `chrome.storage.local` directly — replacing the existing auth modal. Options page gains a provider dropdown whose model list repopulates dynamically.

**Tech Stack:** Chrome Extension MV3, vanilla JS, `chrome.storage.local`, Gemini REST API (`generativelanguage.googleapis.com/v1beta`), Anthropic REST API.

---

## Context for implementer

**Key files:**
- `background.js` — service worker. `analyzeWithAI` is at line ~355, `DEFAULT_SETTINGS` at line ~21.
- `viewer/viewer.js` — all viewer JS. `init()` at line ~53 handles auth check.
- `viewer/index.html` — viewer HTML. Auth modal at line ~231, toolbar at line ~252.
- `options/options.js` — options page JS. AI event listeners at line ~87, AI load block at line ~474.
- `options/index.html` — options page HTML. AI section at line ~441.
- `dev/options.js` and `dev/index.html` — dev copies, must be kept in sync with options/.
- `manifest.json` — host_permissions need Gemini endpoint added.

**Provider model map** (reference for all tasks):
```js
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
```

**Gemini API call (reference):**
- Endpoint: `https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={apiKey}`
- Headers: `Content-Type: application/json` only (no auth header)
- Body with image: `{ "contents": [{ "parts": [{ "inline_data": { "mime_type": "image/jpeg", "data": "<base64>" } }, { "text": "<prompt>" }] }] }`
- Body text-only: `{ "contents": [{ "parts": [{ "text": "<prompt+context>" }] }] }`
- Response text: `data.candidates[0].content.parts[0].text`
- For images: fetch the Telegram URL → get ArrayBuffer → convert to base64 string (btoa won't work for binary; use Uint8Array loop or TextDecoder trick — see step below).

**Base64 from fetch in service worker (no browser APIs like FileReader):**
```js
async function fetchBase64(url) {
  const res = await fetch(url);
  const buffer = await res.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}
```

---

## Task 1: manifest.json — Add Gemini host permission

**Files:**
- Modify: `manifest.json`

**Step 1: Add Gemini to host_permissions**

In `manifest.json`, the `host_permissions` array currently has:
```json
"host_permissions": [
  "https://api.telegram.org/*",
  "https://api.notion.com/*",
  "<all_urls>"
]
```

Add the Gemini endpoint:
```json
"host_permissions": [
  "https://api.telegram.org/*",
  "https://api.notion.com/*",
  "https://generativelanguage.googleapis.com/*",
  "<all_urls>"
]
```

**Step 2: Verify**

Open `manifest.json` and confirm the new entry is present and JSON is valid (no trailing commas, etc.).

**Step 3: Commit**
```bash
git add manifest.json
git commit -m "feat: add Gemini host permission to manifest"
```

---

## Task 2: background.js — Provider router + Gemini + fix defaults

**Files:**
- Modify: `background.js` (lines ~21-62 for DEFAULT_SETTINGS, lines ~355-419 for analyzeWithAI)

**Step 1: Update DEFAULT_SETTINGS**

Find this block (around line 56-61):
```js
aiEnabled: false,
aiProvider: 'anthropic',
aiApiKey: '',
aiModel: 'claude-haiku-4-5-20251001',
aiAutoOnSave: true,
aiAutoInViewer: true
```

Replace with:
```js
aiEnabled: false,
aiProvider: 'google',
aiApiKey: '',
aiModel: 'gemini-2.0-flash',
aiAutoOnSave: true,
aiAutoInViewer: true
```

**Step 2: Add fetchBase64 helper**

Add this new function right before `analyzeWithAI` (around line 354):
```js
async function fetchBase64(url) {
  const res = await fetch(url);
  const buffer = await res.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}
```

**Step 3: Add callGemini function**

Add right after fetchBase64:
```js
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
```

**Step 4: Add callAnthropic function**

Add right after callGemini. This extracts the existing Anthropic logic from `analyzeWithAI`:
```js
async function callAnthropic(messages, settings) {
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
    console.warn('[TG Saver] Anthropic error:', res.status);
    return null;
  }
  const data = await res.json();
  return data.content?.[0]?.text || null;
}
```

**Step 5: Rewrite analyzeWithAI as a router**

Replace the entire `analyzeWithAI` function (from `async function analyzeWithAI` through the closing `}` at line ~419) with:

```js
async function analyzeWithAI(item, settings) {
  if (!settings.aiEnabled || !settings.aiApiKey) return null;

  try {
    const provider = settings.aiProvider || 'google';
    let responseText = null;

    if (item.fileId && settings.botToken) {
      // Get Telegram image
      const fileRes = await fetch(
        `https://api.telegram.org/bot${settings.botToken}/getFile?file_id=${item.fileId}`
      );
      const fileData = await fileRes.json();
      if (fileData.ok) {
        const imgUrl = `https://api.telegram.org/file/bot${settings.botToken}/${fileData.result.file_path}`;

        if (provider === 'google') {
          const base64 = await fetchBase64(imgUrl);
          responseText = await callGemini(AI_PROMPT, base64, settings);
        } else {
          // Anthropic accepts image URLs directly
          const messages = [{
            role: 'user',
            content: [
              { type: 'image', source: { type: 'url', url: imgUrl } },
              { type: 'text', text: AI_PROMPT }
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
      const fullPrompt = `${AI_PROMPT}\n\nContent to analyze:\n${context}`;

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
    return JSON.parse(cleaned);
  } catch (e) {
    console.warn('[TG Saver] AI parse error:', e);
    return null;
  }
}
```

**Step 6: Verify no references to old hardcoded Anthropic URL remain in analyzeWithAI**

Run:
```bash
grep -n "api.anthropic.com" /path/to/background.js
```
Expected: only appears in `callAnthropic`, not in `analyzeWithAI`.

**Step 7: Commit**
```bash
git add background.js
git commit -m "feat: multi-provider AI router (Google Gemini + Anthropic)"
```

---

## Task 3: options/index.html — Add provider dropdown to AI section

**Files:**
- Modify: `options/index.html` (AI section at line ~456)

**Step 1: Add provider select before the API key field**

Find this in the `#ai-config` div:
```html
<div id="ai-config" class="hidden">
  <div class="field">
    <label for="aiApiKey">API Key</label>
    <input type="password" id="aiApiKey" placeholder="sk-ant-…" autocomplete="off">
  </div>
```

Replace with:
```html
<div id="ai-config" class="hidden">
  <div class="field">
    <label for="aiProvider">Provider</label>
    <select id="aiProvider">
      <option value="google">Google Gemini</option>
      <option value="anthropic">Anthropic Claude</option>
    </select>
  </div>

  <div class="field">
    <label for="aiApiKey">API Key</label>
    <input type="password" id="aiApiKey" placeholder="Key for selected provider" autocomplete="off">
  </div>
```

**Step 2: Update model select to start empty (JS will populate it)**

Find:
```html
<div class="field">
  <label for="aiModel">Model</label>
  <select id="aiModel">
    <option value="claude-haiku-4-5-20251001">Haiku (fast, cheap)</option>
    <option value="claude-sonnet-4-6">Sonnet (smarter)</option>
  </select>
</div>
```

Replace with:
```html
<div class="field">
  <label for="aiModel">Model</label>
  <select id="aiModel">
    <!-- populated by JS based on provider -->
  </select>
</div>
```

**Step 3: Commit**
```bash
git add options/index.html
git commit -m "feat(options): add provider dropdown to AI section"
```

---

## Task 4: options/options.js — Wire provider dropdown + dynamic models

**Files:**
- Modify: `options/options.js` (AI listeners block at line ~87, AI load block at line ~474)

**Step 1: Add AI_MODELS and AI_DEFAULT_MODEL constants**

Add near the top of the file, after `DEFAULT_SETTINGS` (around line 51):
```js
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

function populateAiModels(provider, selectedModel) {
  const sel = document.getElementById('aiModel');
  if (!sel) return;
  const models = AI_MODELS[provider] || AI_MODELS.google;
  sel.innerHTML = models.map(m =>
    `<option value="${m.value}"${m.value === selectedModel ? ' selected' : ''}>${m.label}</option>`
  ).join('');
}
```

**Step 2: Update the AI event listeners block**

Find the DOMContentLoaded block for AI (starts around line 88):
```js
document.addEventListener('DOMContentLoaded', () => {
  const aiEnabledInput = document.getElementById('aiEnabled');
  const aiConfigDiv = document.getElementById('ai-config');
  const aiApiKeyInput = document.getElementById('aiApiKey');
  const aiModelInput = document.getElementById('aiModel');
  const aiAutoOnSaveInput = document.getElementById('aiAutoOnSave');
  const aiAutoInViewerInput = document.getElementById('aiAutoInViewer');
  const testAiBtn = document.getElementById('testAiBtn');
  const aiTestStatus = document.getElementById('aiTestStatus');

  aiEnabledInput?.addEventListener('change', e => {
    saveSetting('aiEnabled', e.target.checked);
    aiConfigDiv?.classList.toggle('hidden', !e.target.checked);
  });
  aiApiKeyInput?.addEventListener('change', e => saveSetting('aiApiKey', e.target.value));
  aiModelInput?.addEventListener('change', e => saveSetting('aiModel', e.target.value));
  aiAutoOnSaveInput?.addEventListener('change', e => saveSetting('aiAutoOnSave', e.target.checked));
  aiAutoInViewerInput?.addEventListener('change', e => saveSetting('aiAutoInViewer', e.target.checked));

  testAiBtn?.addEventListener('click', async () => {
    if (aiTestStatus) aiTestStatus.textContent = 'Testing…';
    const key = aiApiKeyInput?.value;
    if (!key) { if (aiTestStatus) aiTestStatus.textContent = 'Enter API key first'; return; }
    try {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
        body: JSON.stringify({ model: 'claude-haiku-4-5-20251001', max_tokens: 10, messages: [{ role: 'user', content: 'hi' }] })
      });
      if (aiTestStatus) aiTestStatus.textContent = res.ok ? '✓ Connected' : `✗ Error ${res.status}`;
    } catch (e) {
      if (aiTestStatus) aiTestStatus.textContent = '✗ Network error';
    }
  });
});
```

Replace the entire block with:
```js
document.addEventListener('DOMContentLoaded', () => {
  const aiEnabledInput = document.getElementById('aiEnabled');
  const aiConfigDiv = document.getElementById('ai-config');
  const aiProviderInput = document.getElementById('aiProvider');
  const aiApiKeyInput = document.getElementById('aiApiKey');
  const aiModelInput = document.getElementById('aiModel');
  const aiAutoOnSaveInput = document.getElementById('aiAutoOnSave');
  const aiAutoInViewerInput = document.getElementById('aiAutoInViewer');
  const testAiBtn = document.getElementById('testAiBtn');
  const aiTestStatus = document.getElementById('aiTestStatus');

  aiEnabledInput?.addEventListener('change', e => {
    saveSetting('aiEnabled', e.target.checked);
    aiConfigDiv?.classList.toggle('hidden', !e.target.checked);
  });

  aiProviderInput?.addEventListener('change', e => {
    const provider = e.target.value;
    saveSetting('aiProvider', provider);
    const defaultModel = AI_DEFAULT_MODEL[provider];
    saveSetting('aiModel', defaultModel);
    populateAiModels(provider, defaultModel);
  });

  aiApiKeyInput?.addEventListener('change', e => saveSetting('aiApiKey', e.target.value));
  aiModelInput?.addEventListener('change', e => saveSetting('aiModel', e.target.value));
  aiAutoOnSaveInput?.addEventListener('change', e => saveSetting('aiAutoOnSave', e.target.checked));
  aiAutoInViewerInput?.addEventListener('change', e => saveSetting('aiAutoInViewer', e.target.checked));

  testAiBtn?.addEventListener('click', async () => {
    if (aiTestStatus) aiTestStatus.textContent = 'Testing…';
    const key = aiApiKeyInput?.value;
    const provider = aiProviderInput?.value || 'google';
    if (!key) { if (aiTestStatus) aiTestStatus.textContent = 'Enter API key first'; return; }
    try {
      let res;
      if (provider === 'google') {
        const model = aiModelInput?.value || 'gemini-2.0-flash';
        res = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`,
          {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ contents: [{ parts: [{ text: 'hi' }] }] })
          }
        );
      } else {
        res = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
          body: JSON.stringify({ model: 'claude-haiku-4-5-20251001', max_tokens: 10, messages: [{ role: 'user', content: 'hi' }] })
        });
      }
      if (aiTestStatus) aiTestStatus.textContent = res.ok ? '✓ Connected' : `✗ Error ${res.status}`;
    } catch (e) {
      if (aiTestStatus) aiTestStatus.textContent = '✗ Network error';
    }
  });
});
```

**Step 3: Update the AI load block inside loadSettings**

Find (around line 474):
```js
  if (aiEnabledInput) {
    aiEnabledInput.checked = settings.aiEnabled || false;
    aiConfigDiv?.classList.toggle('hidden', !settings.aiEnabled);
  }
  if (aiApiKeyInput) aiApiKeyInput.value = settings.aiApiKey || '';
  if (aiModelInput) aiModelInput.value = settings.aiModel || 'claude-haiku-4-5-20251001';
  if (aiAutoOnSaveInput) aiAutoOnSaveInput.checked = settings.aiAutoOnSave !== false;
  if (aiAutoInViewerInput) aiAutoInViewerInput.checked = settings.aiAutoInViewer !== false;
```

Replace with:
```js
  const aiEnabledInput = document.getElementById('aiEnabled');
  const aiConfigDiv = document.getElementById('ai-config');
  const aiProviderInput = document.getElementById('aiProvider');
  const aiApiKeyInput = document.getElementById('aiApiKey');
  const aiAutoOnSaveInput = document.getElementById('aiAutoOnSave');
  const aiAutoInViewerInput = document.getElementById('aiAutoInViewer');

  if (aiEnabledInput) {
    aiEnabledInput.checked = settings.aiEnabled || false;
    aiConfigDiv?.classList.toggle('hidden', !settings.aiEnabled);
  }
  const savedProvider = settings.aiProvider || 'google';
  if (aiProviderInput) aiProviderInput.value = savedProvider;
  populateAiModels(savedProvider, settings.aiModel || AI_DEFAULT_MODEL[savedProvider]);
  if (aiApiKeyInput) aiApiKeyInput.value = settings.aiApiKey || '';
  if (aiAutoOnSaveInput) aiAutoOnSaveInput.checked = settings.aiAutoOnSave !== false;
  if (aiAutoInViewerInput) aiAutoInViewerInput.checked = settings.aiAutoInViewer !== false;
```

**Step 4: Commit**
```bash
git add options/options.js
git commit -m "feat(options): provider dropdown + dynamic model list"
```

---

## Task 5: Sync dev/ with options/

**Files:**
- Modify: `dev/index.html`
- Modify: `dev/options.js`

**Step 1: Apply identical HTML changes to dev/index.html**

Find the AI section in `dev/index.html` (same structure as options/index.html AI section).
Apply the exact same changes as Task 3 — add provider select, empty model select.

**Step 2: Apply identical JS changes to dev/options.js**

The dev file has a mock chrome.storage block at the top (lines ~1-60). After that the structure matches options/options.js.
Apply the exact same changes as Task 4 — AI_MODELS constant, populateAiModels helper, updated event listener block, updated load block.

**Step 3: Commit**
```bash
git add dev/index.html dev/options.js
git commit -m "feat(dev): sync AI provider dropdown with options/"
```

---

## Task 6: viewer/index.html — Replace auth modal with settings panel

**Files:**
- Modify: `viewer/index.html`

**Step 1: Remove auth modal HTML**

Find and delete this entire block (lines ~231-249):
```html
<!-- Auth modal (fallback if chrome.storage has no credentials) -->
<div id="auth-modal" class="hidden">
  <div class="auth-box">
    ...
  </div>
</div>
```

**Step 2: Add gear button to toolbar**

In the toolbar div, find the `toolbar-right` div:
```html
<div class="toolbar-right">
  <div class="color-filters" id="color-filters-wrap"></div>
  <span id="ai-status"></span>
  <button class="disconnect-btn" id="disconnect-btn">Disconnect</button>
</div>
```

Replace with:
```html
<div class="toolbar-right">
  <div class="color-filters" id="color-filters-wrap"></div>
  <span id="ai-status"></span>
  <button class="settings-btn" id="settings-btn" title="Settings">⚙</button>
</div>
```

(Remove Disconnect button — its function moves into the settings panel.)

**Step 3: Add settings panel HTML**

Add this after the lightbox div (before `<script src="viewer.js">`):

```html
<!-- Settings panel -->
<div id="settings-panel" class="hidden">
  <div class="settings-overlay" id="settings-overlay"></div>
  <div class="settings-drawer">
    <div class="settings-header">
      <span class="settings-title">Settings</span>
      <button class="settings-close" id="settings-close">×</button>
    </div>
    <div class="settings-body">

      <div class="settings-section-label">Workspace</div>

      <div class="settings-field">
        <label>Notion Token</label>
        <input type="password" id="sp-notion-token" placeholder="ntn_…" autocomplete="off">
      </div>
      <div class="settings-field">
        <label>Database ID</label>
        <input type="text" id="sp-db-id" placeholder="xxxxxxxx-xxxx-…" autocomplete="off">
      </div>
      <div class="settings-field">
        <label>Telegram Bot Token</label>
        <input type="password" id="sp-tg-token" placeholder="123456:ABC…" autocomplete="off">
      </div>

      <div class="settings-section-label">AI Analysis</div>

      <div class="settings-field settings-field-row">
        <label>Enable AI</label>
        <label class="sp-toggle">
          <input type="checkbox" id="sp-ai-enabled">
          <span class="sp-slider"></span>
        </label>
      </div>

      <div id="sp-ai-config">
        <div class="settings-field">
          <label>Provider</label>
          <select id="sp-ai-provider">
            <option value="google">Google Gemini</option>
            <option value="anthropic">Anthropic Claude</option>
          </select>
        </div>
        <div class="settings-field">
          <label>API Key</label>
          <input type="password" id="sp-ai-key" placeholder="Key for selected provider" autocomplete="off">
        </div>
        <div class="settings-field">
          <label>Model</label>
          <select id="sp-ai-model">
            <!-- populated by JS -->
          </select>
        </div>
        <div class="settings-field settings-field-row">
          <label>Analyze on save</label>
          <label class="sp-toggle">
            <input type="checkbox" id="sp-ai-onsave">
            <span class="sp-slider"></span>
          </label>
        </div>
        <div class="settings-field settings-field-row">
          <label>Analyze in viewer</label>
          <label class="sp-toggle">
            <input type="checkbox" id="sp-ai-inviewer">
            <span class="sp-slider"></span>
          </label>
        </div>
        <div class="settings-field settings-field-row">
          <button class="sp-test-btn" id="sp-test-btn">Test connection</button>
          <span id="sp-test-status" class="sp-status"></span>
        </div>
      </div>

    </div>
    <div class="settings-footer">
      <button class="sp-save-btn" id="sp-save-btn">Save</button>
      <button class="sp-disconnect-btn" id="sp-disconnect-btn">Disconnect</button>
    </div>
  </div>
</div>
```

**Step 4: Add CSS for settings panel**

Inside the `<style>` block, add before the closing `</style>`:
```css
/* ── Toolbar settings button ── */
.settings-btn {
  background: none; border: 1px solid var(--border); border-radius: 6px;
  padding: 4px 9px; color: var(--text-muted); font-size: 14px; cursor: pointer;
  line-height: 1;
}
.settings-btn:hover { border-color: rgba(255,255,255,0.2); color: var(--text); }

/* ── Settings panel ── */
#settings-panel { position: fixed; inset: 0; z-index: 600; }
#settings-panel.hidden { display: none; }
.settings-overlay {
  position: absolute; inset: 0; background: rgba(0,0,0,0.5);
}
.settings-drawer {
  position: absolute; top: 0; right: 0; bottom: 0;
  width: 320px; background: #0f0f0f;
  border-left: 1px solid var(--border);
  display: flex; flex-direction: column;
  overflow: hidden;
}
.settings-header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 16px 18px; border-bottom: 1px solid var(--border);
  flex-shrink: 0;
}
.settings-title { font-size: 14px; font-weight: 600; color: var(--text); }
.settings-close {
  background: none; border: none; color: var(--text-muted); font-size: 20px;
  cursor: pointer; line-height: 1; padding: 0 2px;
}
.settings-close:hover { color: var(--text); }
.settings-body { flex: 1; overflow-y: auto; padding: 18px; }
.settings-section-label {
  font-size: 10px; text-transform: uppercase; letter-spacing: 0.7px;
  color: var(--text-dim); margin: 18px 0 10px; font-weight: 600;
}
.settings-section-label:first-child { margin-top: 0; }
.settings-field { margin-bottom: 12px; }
.settings-field label { display: block; font-size: 11px; color: var(--text-muted); margin-bottom: 5px; }
.settings-field input, .settings-field select {
  width: 100%; background: var(--bg); border: 1px solid var(--border);
  border-radius: 7px; padding: 8px 10px; color: var(--text); font-size: 12px; outline: none;
}
.settings-field input:focus, .settings-field select:focus { border-color: rgba(255,255,255,0.2); }
.settings-field select option { background: #111; }
.settings-field-row {
  display: flex; align-items: center; justify-content: space-between; margin-bottom: 10px;
}
.settings-field-row label { margin-bottom: 0; }
/* Toggle switch */
.sp-toggle { position: relative; display: inline-block; width: 34px; height: 18px; flex-shrink: 0; }
.sp-toggle input { opacity: 0; width: 0; height: 0; }
.sp-slider {
  position: absolute; cursor: pointer; inset: 0;
  background: var(--surface2); border-radius: 18px; transition: background 0.2s;
}
.sp-slider:before {
  content: ''; position: absolute; width: 12px; height: 12px;
  left: 3px; bottom: 3px; background: #555; border-radius: 50%; transition: 0.2s;
}
.sp-toggle input:checked + .sp-slider { background: #fff; }
.sp-toggle input:checked + .sp-slider:before { transform: translateX(16px); background: #000; }
/* Test button row */
#sp-ai-config .settings-field-row { gap: 10px; }
.sp-test-btn {
  background: var(--surface); border: 1px solid var(--border); border-radius: 6px;
  padding: 6px 12px; color: var(--text-muted); font-size: 11px; cursor: pointer; white-space: nowrap;
}
.sp-test-btn:hover { border-color: rgba(255,255,255,0.2); color: var(--text); }
.sp-status { font-size: 11px; color: var(--text-muted); }
/* Footer */
.settings-footer {
  padding: 14px 18px; border-top: 1px solid var(--border);
  display: flex; gap: 8px; flex-shrink: 0;
}
.sp-save-btn {
  flex: 1; background: #fff; color: #000; border: none;
  border-radius: 7px; padding: 9px; font-size: 12px; font-weight: 600; cursor: pointer;
}
.sp-save-btn:hover { opacity: 0.9; }
.sp-disconnect-btn {
  background: none; border: 1px solid var(--border); border-radius: 7px;
  padding: 9px 14px; color: var(--text-muted); font-size: 12px; cursor: pointer;
}
.sp-disconnect-btn:hover { border-color: rgba(255,255,255,0.2); color: var(--text); }
```

**Step 5: Commit**
```bash
git add viewer/index.html
git commit -m "feat(viewer): settings panel HTML + CSS, remove auth modal"
```

---

## Task 7: viewer/viewer.js — Settings panel logic + remove auth modal code

**Files:**
- Modify: `viewer/viewer.js`

**Step 1: Add AI_MODELS constants at top of file**

After `const BASE_COLORS = [...]` block (around line 9), add:
```js
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
```

**Step 2: Replace the `init()` function**

Find the existing `init()` function (lines ~53-76):
```js
async function init() {
  const settings = await getSettings();
  if (settings.notionToken && settings.notionDbId && settings.botToken) {
    STATE.notionToken = settings.notionToken;
    ...
    startApp();
  } else {
    document.getElementById('auth-modal').classList.remove('hidden');
    document.getElementById('connect-btn').addEventListener('click', () => {
      ...
    });
  }
}
```

Replace with:
```js
async function init() {
  const settings = await getSettings();
  if (settings.notionToken && settings.notionDbId && settings.botToken) {
    STATE.notionToken = settings.notionToken;
    STATE.notionDbId = settings.notionDbId;
    STATE.botToken = settings.botToken;
    STATE.aiEnabled = !!(settings.aiEnabled && settings.aiApiKey);
    STATE.aiAutoInViewer = settings.aiAutoInViewer !== false;
    startApp();
  } else {
    // No credentials yet — open settings panel automatically
    openSettingsPanel();
  }
}
```

**Step 3: Replace `disconnect()` function**

Find:
```js
function disconnect() {
  // Clear only viewer-stored fallback (chrome.storage credentials are managed in settings)
  location.reload();
}
```

Replace with:
```js
function disconnect() {
  chrome.storage.local.remove(
    ['notionToken', 'notionDbId', 'botToken', 'isConnected'],
    () => location.reload()
  );
}
```

**Step 4: Add settings panel helper — populateSpModels**

Add before `buildColorFilters()`:
```js
function populateSpModels(provider, selectedModel) {
  const sel = document.getElementById('sp-ai-model');
  if (!sel) return;
  const models = AI_MODELS[provider] || AI_MODELS.google;
  sel.innerHTML = models.map(m =>
    `<option value="${m.value}"${m.value === selectedModel ? ' selected' : ''}>${m.label}</option>`
  ).join('');
}
```

**Step 5: Add openSettingsPanel and setupSettingsPanel functions**

Add after `populateSpModels`:
```js
async function openSettingsPanel() {
  const panel = document.getElementById('settings-panel');
  if (!panel) return;

  // Load current settings into form
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
  // Open via gear button
  document.getElementById('settings-btn')?.addEventListener('click', openSettingsPanel);

  // Close via overlay or × button
  document.getElementById('settings-overlay')?.addEventListener('click', closeSettingsPanel);
  document.getElementById('settings-close')?.addEventListener('click', closeSettingsPanel);

  // Provider change → repopulate models
  document.getElementById('sp-ai-provider')?.addEventListener('change', e => {
    const provider = e.target.value;
    populateSpModels(provider, AI_DEFAULT_MODEL[provider]);
  });

  // Test connection
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

  // Save button
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

    // If credentials just became valid, reload to start app
    if (notionToken && notionDbId && botToken) {
      location.reload();
    }
  });

  // Disconnect button
  document.getElementById('sp-disconnect-btn')?.addEventListener('click', disconnect);
}

function closeSettingsPanel() {
  document.getElementById('settings-panel')?.classList.add('hidden');
}
```

**Step 6: Wire setupSettingsPanel into startApp**

In `startApp()`, find:
```js
  buildColorFilters();
  setupToolbarEvents();
```

Replace with:
```js
  buildColorFilters();
  setupToolbarEvents();
  setupSettingsPanel();
```

Also, `setupSettingsPanel` must be called even when not authenticated (so the panel can be used to enter credentials). In `init()`, the `openSettingsPanel()` call won't work unless the panel's save/close listeners are already attached. Fix by calling `setupSettingsPanel()` unconditionally at the end of `init()`:

Find the updated `init()` function from Step 2 and update to:
```js
async function init() {
  setupSettingsPanel();  // always wire up panel events
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
```

And remove `setupSettingsPanel()` from `startApp()` — it's now called in `init()` before `startApp()`:
```js
  buildColorFilters();
  setupToolbarEvents();
  // setupSettingsPanel() called in init() — don't call again
```

**Step 7: Remove the old auth modal CSS from viewer/index.html**

(The `.auth-box`, `.auth-field`, `.auth-btn`, `.auth-note` CSS rules in the `<style>` block are now unused. Remove them to keep the file clean.)

Find and delete this CSS block in `viewer/index.html`:
```css
    /* ── Auth modal ── */
    #auth-modal {
      position: fixed; inset: 0;
      background: rgba(0,0,0,0.8);
      display: flex; align-items: center; justify-content: center;
      z-index: 1000;
    }
    #auth-modal.hidden { display: none; }
    .auth-box {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 16px;
      padding: 32px;
      width: 360px;
      max-width: 90vw;
    }
    .auth-box h2 { font-size: 16px; font-weight: 600; margin-bottom: 20px; color: var(--text); }
    .auth-field { margin-bottom: 14px; }
    .auth-field label { display: block; font-size: 11px; color: var(--text-muted); margin-bottom: 5px; text-transform: uppercase; letter-spacing: 0.5px; }
    .auth-field input {
      width: 100%; background: var(--bg); border: 1px solid var(--border);
      border-radius: 8px; padding: 9px 12px; color: var(--text); font-size: 13px; outline: none;
    }
    .auth-field input:focus { border-color: rgba(255,255,255,0.2); }
    .auth-btn {
      width: 100%; background: var(--accent); color: #000; border: none;
      border-radius: 8px; padding: 11px; font-size: 13px; font-weight: 600; cursor: pointer; margin-top: 6px;
    }
    .auth-btn:hover { opacity: 0.9; }
    .auth-note { font-size: 11px; color: var(--text-dim); margin-top: 10px; text-align: center; }
```

**Step 8: Commit**
```bash
git add viewer/viewer.js viewer/index.html
git commit -m "feat(viewer): settings panel with AI provider/model, remove auth modal"
```

---

## Task 8: Smoke test

**Step 1: Reload extension**

Go to `chrome://extensions` → find "Telegram Instant Saver" → click the reload (↺) button.

**Step 2: Test settings panel**

Right-click any page → "Open Viewer". The viewer should open.
- If credentials are missing: settings panel opens automatically
- Click ⚙ in toolbar: settings panel opens
- Change provider to "Google Gemini": model dropdown shows Gemini models
- Change provider to "Anthropic Claude": model dropdown shows Claude models
- Enter a Google AI Studio key → click "Test connection" → should show "✓ Connected"
- Click Save → page reloads and loads items

**Step 3: Test AI analysis**

Save an image via right-click on any page with Google provider configured.
Check Notion: `ai_analyzed` checkbox should become true, `ai_type` / `ai_description` populated.

**Step 4: Commit**
```bash
git add .
git commit -m "chore: smoke test passed — multi-provider AI + viewer settings panel"
```

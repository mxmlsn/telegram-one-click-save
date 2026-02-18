# Design: Multi-Provider AI + Viewer Settings Panel

**Date:** 2026-02-18
**Status:** Approved
**Goal:** Add Google Gemini support, make provider/model selectable, remove Anthropic hardcode, add AI settings panel inside the viewer.

---

## What Changes

### 1. background.js — Provider Router

Replace hardcoded Anthropic call with a router:

```
analyzeWithAI(item, settings)
  ├── build messages (image from Telegram or text — shared logic, unchanged)
  ├── if settings.aiProvider === 'google'    → callGemini(prompt, imageB64, settings)
  └── if settings.aiProvider === 'anthropic' → callAnthropic(messages, settings)
```

**callGemini(prompt, imageB64OrNull, settings)**
- Endpoint: `https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={apiKey}`
- Headers: `Content-Type: application/json` (no auth header — key in query param)
- Body with image:
  ```json
  { "contents": [{ "parts": [
    { "inline_data": { "mime_type": "image/jpeg", "data": "<base64>" } },
    { "text": "<prompt>" }
  ]}] }
  ```
- Body text-only:
  ```json
  { "contents": [{ "parts": [{ "text": "<prompt + context>" }] }] }
  ```
- Response text: `data.candidates[0].content.parts[0].text`

**Image handling for Gemini:**
Anthropic accepts image URLs directly. Gemini requires base64. So for Gemini with fileId:
1. Fetch Telegram image URL (existing logic)
2. Fetch image bytes → convert to base64 in background.js
3. Pass base64 to callGemini

**callAnthropic(messages, settings)** — existing logic, just extracted into its own function.

**DEFAULT_SETTINGS changes:**
```js
aiProvider: 'google',          // was hardcoded 'anthropic'
aiApiKey: '',
aiModel: 'gemini-2.0-flash',   // default for google
aiAutoOnSave: true,
aiAutoInViewer: true
```

---

### 2. Settings Panel in Viewer (viewer/viewer.js + viewer/index.html)

A slide-in settings panel triggered by a gear icon (⚙) in the toolbar.

**Toolbar addition:**
```
[Search]  [All][Images][Articles]…  [● ● ●]  [AI status]  [⚙]  [Disconnect]
```

**Settings panel (slide in from right, fixed overlay):**
```
──────────────────────────────────
  Settings                    [×]
──────────────────────────────────

  Notion Token        [••••••••]
  Database ID         [xxxxxxxx]
  Telegram Token      [••••••••]

  ──── AI Analysis ────────────────

  Enable AI           [toggle]

  Provider            [Google ▼]
                      Google Gemini
                      Anthropic Claude

  API Key             [••••••••]

  Model               [gemini-2.0-flash ▼]
                      (options change per provider)

  Analyze on save     [checkbox]
  Analyze in viewer   [checkbox]

  [Test connection]   ✓ Connected

──────────────────────────────────
  [Save]
──────────────────────────────────
```

**Model options per provider:**
- Google: `gemini-2.0-flash` (free, recommended), `gemini-2.5-flash`
- Anthropic: `claude-haiku-4-5-20251001`, `claude-sonnet-4-6`

When provider changes → model select repopulates + resets to provider default.

**Storage:** Settings panel reads/writes directly to `chrome.storage.local` (same keys as options page). No separate storage.

**Auth modal removed:** The auth modal (Connect workspace) is replaced by the settings panel. On load, if no credentials → settings panel opens automatically instead of showing the modal.

---

### 3. Options Page (options/ + dev/) — Sync

The options page AI section gets:
- Provider dropdown added (Google / Anthropic)
- Model options update dynamically based on selected provider
- "Test connection" updates to use correct provider API
- Default model changes to `gemini-2.0-flash`
- `aiProvider` wired up (currently stored but not in UI)

---

### 4. manifest.json

Add `https://generativelanguage.googleapis.com/*` to `host_permissions`.

---

## Provider Models Reference

| Provider | Model ID | Label |
|---|---|---|
| google | `gemini-2.0-flash` | Gemini 2.0 Flash (free) |
| google | `gemini-2.5-flash` | Gemini 2.5 Flash (free) |
| anthropic | `claude-haiku-4-5-20251001` | Claude Haiku (fast) |
| anthropic | `claude-sonnet-4-6` | Claude Sonnet (smart) |

---

## What Stays Unchanged

- `patchNotionWithAI` — unchanged
- AI_PROMPT — unchanged
- All call sites of `analyzeWithAI` — unchanged
- `viewer/index.html` CSS — only additions
- `viewer/viewer.js` STATE/filter/render logic — unchanged

---

## Files to Touch

1. `background.js` — router + callGemini + callAnthropic + base64 fetch + DEFAULT_SETTINGS
2. `viewer/index.html` — gear icon in toolbar, settings panel HTML, remove auth modal
3. `viewer/viewer.js` — settings panel open/close/save/load, remove auth modal logic, update init()
4. `options/index.html` + `dev/index.html` — provider dropdown
5. `options/options.js` + `dev/options.js` — provider logic, dynamic model list, test connection router
6. `manifest.json` — add Gemini host permission

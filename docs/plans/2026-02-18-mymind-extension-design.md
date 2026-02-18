# Design: Personal MyMind — Extension-First Architecture

**Date:** 2026-02-18
**Status:** Approved
**Goal:** Turn the extension into a personal MyMind alternative — beautiful viewer, AI analysis, zero external server required.

---

## Vision

Two modes:

- **Base mode** (no AI key): save to Telegram + Notion, browse in viewer with color/tag filters
- **AI mode** (API key configured): every saved item is automatically analyzed — type detected, description written, structured data extracted (price, tweet text, etc.)

Target audience: one user per installation. No shared server. Each person connects their own Telegram bot, Notion DB, and optionally an AI API key.

---

## Architecture

```
Chrome Extension (MV3)
├── background.js          — fetch relay (no CORS), token storage, AI calls
├── content.js             — toast + tag selection UI (unchanged)
├── viewer/
│   ├── index.html         — SPA viewer, opens as chrome-extension://…/viewer/index.html
│   └── viewer.js          — UI logic, communicates with background via chrome.runtime.sendMessage
└── options/               — settings page, adds AI section

External services (user's own accounts)
├── Telegram Bot API       — free file storage (images, screenshots)
├── Notion API             — database (metadata + AI-enriched fields)
└── Anthropic API          — vision analysis (optional)
```

### Why no server needed

`chrome-extension://` pages can call `chrome.runtime.sendMessage()` to background.js, which does `fetch()` without any CORS restrictions. This replaces `viewer/server.js` entirely. No Node.js process required.

---

## Save Flow

### Without AI
```
Right-click → "Save" → background.js
→ Send file/link/text to Telegram Bot API
→ Write Notion record: url, type, tag, file_id, source_url, date
→ Toast: "Saved"
```

### With AI (auto-analyze on save)
```
Same as above, then in background:
→ Send image (or URL + context) to Claude API (vision)
→ Receive: ai_type, ai_description, ai_data JSON
→ PATCH Notion record with AI fields + set ai_analyzed = true
→ Toast updates: "Saved · Analyzed"
```

Delay: ~2-4s for AI. Toast shows "Saved" immediately, analysis happens async.

---

## Notion Database Schema

### Existing fields (unchanged)
- `Name` — title
- `URL` — link
- `Type` — select: image / link / text
- `Tag` — select: user's 7 tags
- `File ID` — Telegram file_id
- `Source URL` — original page
- `Date` — created time

### New fields (added)
| Field | Type | Description |
|-------|------|-------------|
| `ai_type` | select | article / video / product / x_post |
| `ai_description` | rich text | 1-2 sentence summary |
| `ai_data` | rich text (JSON) | structured extraction: `{"price":"$49","tweet_text":"...","colors":["black"]}` |
| `ai_analyzed` | checkbox | prevents re-analysis |

---

## Viewer

### Access
Opens as a Chrome extension page: `chrome-extension://[id]/viewer/index.html`
Accessible via:
- Extension toolbar button (popup → "Open Viewer" link)
- Or dedicated browser action that opens the tab directly

### Visual Style
MyMind-inspired:
- Dark background (`#0a0a0a` or similar)
- Masonry grid layout (CSS `columns` + JS height balancing)
- Cards with no visible borders — content bleeds to edge
- Smooth hover animations (`transform: scale`, subtle shadow)
- Minimal chrome — toolbar floats over content

### Card Types

**Image card** (type: image)
- Full bleed photo
- On hover: ai_description overlay fades in
- Bottom badge: ai_type chip (product / article / etc.)

**Link card** (type: link)
- Domain + favicon
- OG image if available
- ai_description as subtitle

**Text / X post card** (type: text, ai_type: x_post)
- Large quote typography
- If ai_type = x_post: shows full extracted tweet text from ai_data
- Soft background tint

**Product card** (ai_type: product)
- Image
- Price extracted from ai_data shown prominently
- "View" button → source URL

### Toolbar
```
[Search input]  [article] [video] [product] [x post]  [● red][● blue]…  [AI status]
```

- Search: full-text across title, description, ai_description, OCR cache
- Type filters: pill tabs, single-select
- Color filters: 6 slots (existing feature, unchanged)
- AI status indicator: "Analyzing 3/47…" with progress, or "✓ All analyzed"

### AI background processing in viewer
When viewer opens with AI enabled:
1. Fetch all items from Notion
2. Find items where `ai_analyzed = false`
3. Process in batches of 3 (respect API rate limits)
4. For each: send to Claude API via background.js → update Notion → refresh card in UI
5. Show progress in toolbar

---

## Settings (new AI section)

Added to `options/` page after existing sections:

```
─── AI Analysis ──────────────────────────

  Enable AI analysis          [toggle]

  Provider                    [Anthropic ▼]
  API Key                     [••••••••••••] [show]

  Analyze automatically on save    [checkbox] ✓
  Analyze in background (viewer)   [checkbox] ✓

  [Test connection]
```

Provider dropdown: Anthropic only for now, extensible later (OpenAI, Gemini, local OpenAI-compatible).

AI key stored in `chrome.storage.local` — never leaves the browser except in requests to the AI API.

---

## AI Prompt Design

Single vision prompt sent per item:

```
Analyze this saved content and return JSON:
{
  "type": "article|video|product|x_post",
  "description": "1-2 sentence summary",
  "data": {
    // for product: "price", "product_name"
    // for x_post: "tweet_text", "author"
    // for article: "headline"
    // for video: "title", "channel"
  },
  "tags": ["up to 3 descriptive tags"],
  "colors": ["dominant color names if image"]
}
```

Model: `claude-haiku-4-5-20251001` by default (fast, cheap). User can override to Sonnet in settings.

---

## What Stays Unchanged

- `content.js` — toast system, tag selection UI
- `background.js` core logic — Telegram sending, context menus
- `options/` settings — all existing sections
- Notion write logic — new fields are additive only
- `viewer/` color extraction (ColorThief) and OCR (Tesseract.js) — kept as fallback when no AI key

---

## What Gets Built / Changed

1. **background.js** — add `AI_analyze(item)` function, add message handler for viewer relay
2. **viewer/index.html** — full redesign: MyMind aesthetic, typed card rendering, AI progress
3. **options/** — add AI settings section (dev/ first, then copy to prod)
4. **manifest.json** — add viewer page, update browser action to open viewer tab
5. **viewer/server.js** — no longer needed (background.js relay replaces it)

---

## Out of Scope (for now)

- Mobile access (deferred to Phase 2 with Cloudflare Worker)
- Multiple AI providers (architecture supports it, UI deferred)
- Semantic search / embeddings
- Notion alternative backends (local JSON deferred)
- Sharing / export

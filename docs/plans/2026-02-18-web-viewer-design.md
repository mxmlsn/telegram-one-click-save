# Web Viewer — Design

**Date:** 2026-02-18  
**Status:** Approved

## Overview

Single local HTML file. Opens in browser directly (file://). No server required.  
Reads saved items from Notion database. Resolves image URLs via Telegram Bot API.

## Auth

On first open: prompt for two tokens via modal.  
- Notion token (`ntn_...`)  
- Telegram bot token  

Both stored in `localStorage`. Never re-asked unless cleared.

## Layout (top → bottom)

1. **Search bar** — text search across: Content field (text/link), OCR text extracted from images
2. **Tag filter** — horizontal pill buttons (work / study / refs / project1 / ...). Multi-select.
3. **Color filter** — 6 empty circles. Click → dropdown with ~10 base colors. Select fills the circle. Active circles filter images by dominant color.
4. **Cards grid** — masonry or fixed-column grid

## Card Types

### Link
- Screenshot (from `file_id` → Telegram API) if available, else domain favicon
- Domain name below
- Tag pill
- Click → opens original URL in new tab

### Image
- Thumbnail preview
- Tag pill
- Click → lightbox with full-size image + source URL link below

### Text
- First ~200 chars of Content
- Tag pill + source domain
- Click → expands inline to full text + source link
- If full text fits in 200 chars: source link shown directly

## Color Processing

- Library: **ColorThief** (CDN, pure JS)
- On load: extract dominant color from each image via Canvas
- Map RGB → base color category: red / orange / yellow / green / blue / purple / pink / brown / gray / black / white
- Cache result in `localStorage` keyed by `file_id`
- Filter: show images where dominant category matches any selected circle

## Text Recognition (OCR)

- Library: **Tesseract.js** (CDN, WASM)
- Runs in background after page load, processes images one by one
- Extracted text stored in `localStorage` keyed by `file_id`
- Search bar queries both Notion Content field and OCR cache
- Visual indicator while OCR is running (spinner on card)

## Data Flow

```
localStorage tokens
       ↓
Notion API → fetch all pages from DB (paginated, limit 100)
       ↓
Render cards (text/link: immediate, images: resolve file_id → Telegram getFile → URL)
       ↓
Background: ColorThief + Tesseract per image (skip if cached)
       ↓
Filter/search reactively on user input
```

## Telegram Image Resolution

```
GET https://api.telegram.org/bot{TOKEN}/getFile?file_id={FILE_ID}
→ result.file_path
→ https://api.telegram.org/file/bot{TOKEN}/{file_path}
```

Resolved URLs are **not** cached (they expire). `file_id` → call getFile on each page load.  
Batch: resolve all at once in parallel on load.

## Files

- `viewer/index.html` — single self-contained file (inline CSS + JS)

## Constraints

- No build step, no npm, no framework — vanilla JS only
- All external libs via CDN (ColorThief, Tesseract.js)
- Works offline for cached items (LocalStorage), online for fresh Notion data

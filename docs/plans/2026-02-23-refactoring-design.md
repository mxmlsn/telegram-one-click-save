# Refactoring Design: ES Modules + Deduplication

## Problem

Project grew organically. Key issues:
1. **background.js** is 1772 lines — mixing Telegram API, Notion API, AI analysis, caption building, image compression, media detection, and send orchestration
2. **Code duplication**: every send type has two versions (with tag selection vs tag already selected) — ~600 lines of near-identical code
3. **Instagram media detection** duplicated verbatim (lines 972-1033 and 1622-1676)
4. **Toast morph animation** in content.js copy-pasted twice (click handler + timer timeout)
5. **AI prompts** (AI_PROMPT_IMAGE, AI_PROMPT_LINK) duplicated between background.js and cloudflare-bot
6. **Constants** (DEFAULT_SETTINGS, EMOJI_PACKS) duplicated across 3 files
7. **options.js** re-declares DEFAULT_SETTINGS with slightly different defaults (aiProvider: 'anthropic' vs 'google', iconColor: 'clip1' vs 'circle1')

## Approach: ES Modules

Manifest V3 supports `"type": "module"` for service worker. Options page supports `<script type="module">`.

Content script does NOT support modules (Chrome limitation) — stays as single file.

## New Structure

```
├── manifest.json                    # "type": "module" for service worker
├── background.js                    # ~80 lines: imports + chrome event listeners
├── content.js                       # Single file, deduped (~500 lines)
├── content.css                      # Unchanged
│
├── src/
│   ├── shared/
│   │   ├── constants.js             # DEFAULT_SETTINGS, EMOJI_PACKS, COLOR_ID_TO_INDEX
│   │   └── prompts.js               # AI_PROMPT_IMAGE, AI_PROMPT_LINK
│   │
│   ├── api/
│   │   ├── telegram.js              # sendPhoto, sendDocument, sendAnimation, sendTextMessage, sendPhotoSilent
│   │   └── notion.js                # saveToNotion, patchNotionWithAI
│   │
│   ├── ai/
│   │   └── analyze.js               # analyzeWithAI, callGemini, callAnthropic, fetchBase64
│   │
│   └── lib/
│       ├── caption.js               # buildCaption, escapeHTML, formatUrl, getEmojiForTag
│       ├── media.js                 # isGifUrl, isGifBlob, isPdfUrl, compressImageIfNeeded
│       └── senders.js               # Unified send functions (tag is always a parameter)
│
├── options/
│   └── options.js                   # <script type="module">, imports shared/constants.js
```

## Key Refactoring Decisions

### 1. Unify Direct/Non-Direct send functions

Current pattern (BEFORE):
- `sendImage()` — shows tag selection, then sends
- `sendImageDirect()` — tag already selected, sends

New pattern (AFTER):
- `sendImage(imageUrl, pageUrl, settings, tabId, selectedTag)` — one function, selectedTag is always passed
- Tag selection happens ONCE in the context menu handler, result passed to all senders

This eliminates: sendImage, sendImageDirect, sendImageWithTag, sendImageFromPage, sendImageFromPageDirect, sendScreenshot, sendScreenshotDirect, sendScreenshotWithTag, sendVideoAsScreenshot, sendVideoDirect — all collapsed into ~5 functions.

### 2. Unify media detection

Extract `detectMediaUnderCursor(tabId, isInstagram)` — one function used by both sendImageFromPage flows.

### 3. Unify toast morph animation

Extract `morphToSending(requestId, selectedTag)` in content.js — called by both click handler and timer timeout.

### 4. Constants single source of truth

`src/shared/constants.js` is imported by background.js and options.js.
content.js cannot import — it reads from chrome.storage (already does this).
cloudflare-bot — AI prompts copied via reference comment (can't share runtime code with Cloudflare Worker).

### 5. Settings defaults consistency

Fix the divergence: options.js has `aiProvider: 'anthropic'` while background.js has `aiProvider: 'google'`. Unify to single DEFAULT_SETTINGS.

## What NOT to change

- content.css — already clean, well-structured
- manifest.json permissions — correct as-is
- Toast visual behavior and animations — preserve exactly
- AI prompt text — preserve exactly (just move to shared file)
- Notion property names and data structure — preserve exactly
- Tag selection UX flow — preserve exactly
- cloudflare-worker — 119 lines, nothing to refactor
- dev/ folder — will be updated when options.js changes

## Risk Mitigation

- All refactoring preserves exact same behavior
- Every function keeps same parameters and return values
- Test by: right-click image, right-click link, right-click text, right-click page, click extension icon, check all toast styles (normal/minimalist, dark/light), check tag selection, check Notion save

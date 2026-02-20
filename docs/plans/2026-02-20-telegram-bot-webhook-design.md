# Telegram Bot Webhook — Design

**Date:** 2026-02-20
**Status:** Approved

## Goal

Allow saving content to Stash by sending/forwarding messages directly to the Telegram bot. Saved items appear in the web viewer alongside items saved from the Chrome extension.

## Architecture

New Cloudflare Worker `stash-telegram-bot` — handles Telegram webhook, saves metadata to Notion, runs AI analysis, reacts to messages.

```
User sends/forwards message to bot
         ↓
Telegram → POST webhook → CF Worker (stash-telegram-bot)
         ↓
Worker parses update:
  - message.photo → file_id (largest size)
  - message.document (PDF) → file_id
  - message.animation (GIF) → file_id
  - message.video → file_id
  - message.text with URL → extract link
  - message.text without URL → save as quote
  - forward_from_chat → extract source channel info
         ↓
Creates Notion entry (same schema as background.js)
         ↓
Runs AI analysis (Gemini/Claude) — same prompts as background.js
         ↓
Updates Notion entry with AI results
         ↓
Sets reaction on message: ✅ success, ❌ error
```

## Content Type Mapping

| Telegram message | Notion Type | File ID | Content | Source URL |
|---|---|---|---|---|
| `photo` | `image` | largest photo `file_id` | caption | — |
| `document` (PDF) | `pdf` | `document.file_id` | caption | — |
| `document` (other) | `document` | `document.file_id` | caption | — |
| `animation` (GIF) | `gif` | `animation.file_id` | caption | — |
| `video` | `video` | `video.file_id` | caption | — |
| `text` with URL | `link` | — | text without URL | extracted URL |
| `text` without URL | `quote` | — | full text | — |

### Forwarded Messages

- `forward_origin.type === 'channel'` → construct `https://t.me/{username}/{message_id}` as Source URL
- `forward_origin.type === 'user'` → save sender name in Content
- Content type determined by message content (photo/text/etc), not by forward status

### Notion Entry Format

Same properties as `saveToNotion()` in background.js:
- **URL** (title): domain or `telegram` for direct sends
- **Type** (select): image/pdf/gif/video/link/quote
- **Date** (date): ISO timestamp
- **Source URL** (url): link if available
- **Tag** (select): empty (tags being redesigned separately)
- **Content** (rich_text): caption/text, up to 2000 chars
- **File ID** (rich_text): Telegram file_id for viewer image resolution

## AI Analysis

Runs after Notion save, same flow as background.js:
- For images: sends photo to AI with `AI_PROMPT_IMAGE` prompt
- For links: sends screenshot/metadata with `AI_PROMPT_LINK` prompt
- Updates Notion entry with AI-classified fields (content_type, description, colors, etc.)
- AI provider configurable via env var (google/anthropic)

## Bot Reactions

- ✅ on successful save
- ❌ on error (+ optional error text reply for debugging)

## Security

- Webhook verified via `X-Telegram-Bot-Api-Secret-Token` header
- `ALLOWED_CHAT_ID` env var — only processes messages from authorized user
- All secrets in CF environment variables, never in code

## Environment Variables

| Variable | Description |
|---|---|
| `BOT_TOKEN` | Telegram bot token |
| `NOTION_TOKEN` | Notion integration secret |
| `NOTION_DB_ID` | Notion database ID |
| `WEBHOOK_SECRET` | Random string for webhook verification |
| `ALLOWED_CHAT_ID` | Authorized Telegram chat ID |
| `AI_PROVIDER` | `google` or `anthropic` |
| `AI_API_KEY` | API key for AI provider |
| `AI_MODEL` | Model name (e.g. `gemini-2.0-flash`) |

## File Structure

```
cloudflare-bot/
├── wrangler.toml
└── src/
    └── index.js
```

## Out of Scope (v1)

- Tags/categories (being redesigned separately)
- Inline keyboard for tag selection
- Bot commands (/start, /help)
- New content types ("post", "longread") — to be added later

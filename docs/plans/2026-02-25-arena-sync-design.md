# Are.na → Stash Sync: Design Doc

## Overview

Cloudflare Worker с cron trigger каждые 5 минут опрашивает Are.na канал, находит новые блоки и пересылает их в Telegram + Notion — те же хранилища что использует расширение. Viewer отображает их без изменений.

## Architecture

```
Are.na channel (stash-saver)
        ↓ polling every 5 min (cron)
Cloudflare Worker (arena-sync)
  - KV: last_synced_at
        ↓ new blocks only
Telegram Bot API  +  Notion DB
        ↓
stash.mxml.sn viewer (no changes needed)
```

## Cloudflare Worker

**Location:** `arena-worker/` (new dir in repo root)

**Cron:** `*/5 * * * *`

**KV namespace:** `ARENA_SYNC_KV` — stores `last_synced_at` (ISO timestamp)

**Flow:**
1. Read `last_synced_at` from KV (default: 24h ago on first run)
2. `GET https://api.are.na/v2/channels/{slug}/contents?per=50&sort=position&direction=desc`
3. Filter blocks where `connected_at > last_synced_at`
4. For each new block: send to Telegram + save to Notion
5. Update `last_synced_at` = now

## Block Type Mapping

| Are.na class | Telegram method | Notion type | Notes |
|---|---|---|---|
| `Image` | sendPhoto (image.original.url) | `image` | direct URL fetch |
| `Link` | sendTextMessage | `link` | uses block.source.url |
| `Text` | sendTextMessage | `quote` | block.content |
| `Attachment` | sendDocument | `pdf` | block.attachment.url |
| `Media` | sendAnimation / sendDocument | `gif` / `video` | by content_type |

## Notion Record

```js
{
  URL: `are.na/block/${block.id}`,
  'Source URL': block.source?.url || block.image?.original?.url,
  Type: mappedType,
  Content: block.title || block.content || '',
  'File ID': telegramFileId,
  Tag: 'arena',
  Date: block.connected_at
}
```

## Secrets (via `wrangler secret put`)

- `ARENA_AUTH_TOKEN`
- `ARENA_APP_TOKEN`
- `ARENA_CHANNEL_SLUG`
- `BOT_TOKEN`
- `CHAT_ID`
- `NOTION_TOKEN`
- `NOTION_DB_ID`

## Options Page Changes

New section "Are.na" in `options/` and `dev/`:
- toggle: Arena Sync Enabled
- input: Arena Auth Token
- input: Arena Channel Slug (default: stash-saver)

These are stored in `chrome.storage.local` for UI display only. Worker uses Cloudflare secrets independently.

## Files to Create/Modify

**New:**
- `arena-worker/src/index.js` — worker logic
- `arena-worker/wrangler.toml` — config + cron + KV binding

**Modified:**
- `options/index.html` + `options/options.css` + `options/options.js` — Are.na section
- `dev/index.html` + `dev/options.css` + `dev/options.js` — same for dev
- `src/shared/constants.js` — add arenaEnabled, arenaToken, arenaChannelSlug defaults

## Deploy Steps

1. `wrangler kv namespace create ARENA_SYNC_KV`
2. `wrangler secret put` × 7
3. `wrangler deploy`
4. verify cron in Cloudflare dashboard

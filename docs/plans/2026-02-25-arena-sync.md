# Are.na Sync Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Cloudflare Worker polls Are.na channel every 5 minutes and forwards new blocks to Telegram + Notion, using the same storage as the extension.

**Architecture:** Worker reads `last_synced_at` from KV, fetches Are.na channel contents, filters new blocks, sends each to Telegram Bot API and Notion. Extension options page gets an Are.na settings section for UI visibility only — worker uses Cloudflare secrets.

**Tech Stack:** Cloudflare Workers, Cloudflare KV, Are.na REST API v2, Telegram Bot API, Notion API

---

### Task 1: Create arena-worker scaffold

**Files:**
- Create: `arena-worker/wrangler.toml`
- Create: `arena-worker/src/index.js`

**Step 1: Create wrangler.toml**

```toml
name = "arena-sync"
main = "src/index.js"
compatibility_date = "2024-01-01"

[triggers]
crons = ["*/5 * * * *"]

[[kv_namespaces]]
binding = "ARENA_SYNC_KV"
id = "PLACEHOLDER_KV_ID"
```

**Step 2: Create src/index.js skeleton**

```js
export default {
  async scheduled(event, env, ctx) {
    ctx.waitUntil(syncArena(env));
  },

  // Manual trigger for testing: GET /sync
  async fetch(request, env, ctx) {
    if (new URL(request.url).pathname === '/sync') {
      ctx.waitUntil(syncArena(env));
      return new Response('sync triggered', { status: 200 });
    }
    return new Response('arena-sync worker', { status: 200 });
  }
};

async function syncArena(env) {
  console.log('[arena-sync] starting');
}
```

**Step 3: Commit**

```bash
git add arena-worker/
git commit -m "feat: scaffold arena-sync Cloudflare Worker"
```

---

### Task 2: Create KV namespace and set secrets

**Files:** none (CLI only)

**Step 1: Create KV namespace**

```bash
cd arena-worker
wrangler kv namespace create ARENA_SYNC_KV
```

Expected output includes `id = "..."` — copy that ID.

**Step 2: Update wrangler.toml with real KV id**

Replace `PLACEHOLDER_KV_ID` in `arena-worker/wrangler.toml` with the real ID from step 1.

**Step 3: Set all secrets**

```bash
wrangler secret put ARENA_AUTH_TOKEN
# enter: <your-arena-auth-token>

wrangler secret put ARENA_APP_TOKEN
# enter: <your-arena-app-token>

wrangler secret put ARENA_CHANNEL_SLUG
# enter: <your-channel-slug>

wrangler secret put BOT_TOKEN
# enter: <your-telegram-bot-token>

wrangler secret put CHAT_ID
# enter: <your-telegram-chat-id>

wrangler secret put NOTION_TOKEN
# enter: <your-notion-token>

wrangler secret put NOTION_DB_ID
# enter: <your-notion-db-id>
```

**Step 4: Commit wrangler.toml with real KV id**

```bash
git add arena-worker/wrangler.toml
git commit -m "chore: add KV namespace id to wrangler.toml"
```

---

### Task 3: Implement Are.na API fetching

**Files:**
- Modify: `arena-worker/src/index.js`

**Step 1: Add fetchArenaBlocks function**

```js
async function fetchArenaBlocks(env) {
  const slug = env.ARENA_CHANNEL_SLUG;
  const url = `https://api.are.na/v2/channels/${slug}/contents?per=100&sort=position&direction=desc`;
  const res = await fetch(url, {
    headers: {
      'X-Auth-Token': env.ARENA_AUTH_TOKEN,
      'X-App-Token': env.ARENA_APP_TOKEN
    }
  });
  if (!res.ok) throw new Error(`Are.na API error: ${res.status}`);
  const data = await res.json();
  return data.contents || [];
}
```

**Step 2: Add KV timestamp logic in syncArena**

```js
async function syncArena(env) {
  console.log('[arena-sync] starting');

  // Get last synced timestamp (default: 24h ago on first run)
  const stored = await env.ARENA_SYNC_KV.get('last_synced_at');
  const lastSyncedAt = stored ? new Date(stored) : new Date(Date.now() - 24 * 60 * 60 * 1000);

  const blocks = await fetchArenaBlocks(env);

  // Filter only new blocks
  const newBlocks = blocks.filter(b => new Date(b.connected_at) > lastSyncedAt);
  console.log(`[arena-sync] ${newBlocks.length} new blocks since ${lastSyncedAt.toISOString()}`);

  // Process in chronological order (oldest first)
  newBlocks.reverse();

  for (const block of newBlocks) {
    try {
      await processBlock(block, env);
    } catch (e) {
      console.error(`[arena-sync] block ${block.id} failed:`, e.message);
    }
  }

  // Update last_synced_at
  await env.ARENA_SYNC_KV.put('last_synced_at', new Date().toISOString());
  console.log('[arena-sync] done');
}
```

**Step 3: Add stub processBlock**

```js
async function processBlock(block, env) {
  console.log(`[arena-sync] processing block ${block.id} class=${block.class}`);
}
```

**Step 4: Deploy and test manually**

```bash
cd arena-worker
wrangler deploy
curl https://arena-sync.<your-account>.workers.dev/sync
```

Check Cloudflare Workers logs in dashboard — should see block count logged.

**Step 5: Commit**

```bash
git add arena-worker/src/index.js
git commit -m "feat: add Are.na polling with KV timestamp tracking"
```

---

### Task 4: Implement Telegram sending

**Files:**
- Modify: `arena-worker/src/index.js`

Worker runs in Cloudflare edge — no DOM, no canvas. Image compression from `src/api/telegram.js` uses canvas so can't be reused. Instead: send image directly by URL using `sendPhoto` with `photo` as URL string (Telegram supports this).

**Step 1: Add sendToTelegram function**

```js
async function sendToTelegram(block, env) {
  const botToken = env.BOT_TOKEN;
  const chatId = env.CHAT_ID;
  const base = `https://api.telegram.org/bot${botToken}`;

  const blockClass = block.class; // 'Image', 'Link', 'Text', 'Attachment', 'Media'
  const title = block.title || block.generated_title || '';
  const sourceUrl = block.source?.url || '';
  const arenaUrl = `https://www.are.na/block/${block.id}`;

  // Caption format: title | are.na/block/ID
  const captionParts = [];
  if (title && title !== block.image?.filename) captionParts.push(title);
  captionParts.push(`are.na/block/${block.id}`);
  const caption = captionParts.join('\n');

  let fileId = null;
  let notionType = 'link';

  if (blockClass === 'Image' && block.image?.original?.url) {
    const imageUrl = block.image.original.url;
    const res = await fetch(`${base}/sendPhoto`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, photo: imageUrl, caption })
    });
    const data = await res.json();
    if (data.ok) {
      const photos = data.result.photo;
      fileId = photos[photos.length - 1].file_id;
      notionType = 'image';
    } else {
      // Fallback: send as document if photo fails
      const res2 = await fetch(`${base}/sendDocument`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: chatId, document: imageUrl, caption })
      });
      const data2 = await res2.json();
      if (data2.ok) {
        fileId = data2.result.document.file_id;
        notionType = 'image';
      }
    }
  } else if (blockClass === 'Media' && block.attachment?.url) {
    const contentType = block.attachment.content_type || '';
    if (contentType.includes('gif')) {
      const res = await fetch(`${base}/sendAnimation`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: chatId, animation: block.attachment.url, caption })
      });
      const data = await res.json();
      if (data.ok) {
        fileId = data.result.animation?.thumbnail?.file_id || data.result.animation?.file_id;
        notionType = 'gif';
      }
    } else if (contentType.includes('video')) {
      const res = await fetch(`${base}/sendVideo`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: chatId, video: block.attachment.url, caption })
      });
      const data = await res.json();
      if (data.ok) {
        fileId = data.result.video?.thumbnail?.file_id;
        notionType = 'video';
      }
    }
  } else if (blockClass === 'Attachment' && block.attachment?.url) {
    const res = await fetch(`${base}/sendDocument`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, document: block.attachment.url, caption })
    });
    const data = await res.json();
    if (data.ok) {
      fileId = data.result.document?.file_id;
      notionType = 'pdf';
    }
  } else if (blockClass === 'Text') {
    const text = block.content || title || '(empty)';
    const msg = `<code>${text}</code>\n\n${arenaUrl}`;
    const res = await fetch(`${base}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text: msg, parse_mode: 'HTML' })
    });
    const data = await res.json();
    notionType = 'quote';
  } else {
    // Link or fallback
    const url = sourceUrl || arenaUrl;
    const msg = `${title ? title + '\n' : ''}${url}\n${arenaUrl}`;
    await fetch(`${base}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text: msg, parse_mode: 'HTML', disable_web_page_preview: false })
    });
    notionType = 'link';
  }

  return { fileId, notionType, title, sourceUrl, arenaUrl };
}
```

**Step 2: Wire into processBlock**

```js
async function processBlock(block, env) {
  console.log(`[arena-sync] processing block ${block.id} class=${block.class}`);
  const result = await sendToTelegram(block, env);
  console.log(`[arena-sync] block ${block.id} sent, type=${result.notionType} fileId=${result.fileId}`);
  return result;
}
```

**Step 3: Deploy and test**

```bash
wrangler deploy
curl https://arena-sync.<your-account>.workers.dev/sync
```

Check Telegram — should receive the block from stash-saver channel.

**Step 4: Commit**

```bash
git add arena-worker/src/index.js
git commit -m "feat: send Are.na blocks to Telegram by type"
```

---

### Task 5: Implement Notion saving

**Files:**
- Modify: `arena-worker/src/index.js`

**Step 1: Add saveToNotion function**

```js
async function saveToNotion(block, telegramResult, env) {
  const { fileId, notionType, title, sourceUrl, arenaUrl } = telegramResult;

  const domain = 'are.na';
  const properties = {
    'URL': { title: [{ text: { content: domain } }] },
    'Type': { select: { name: notionType } },
    'Date': { date: { start: block.connected_at || new Date().toISOString() } },
    'Source URL': { url: arenaUrl },
    'Tag': { select: { name: 'arena' } }
  };

  if (sourceUrl) properties['Source URL'] = { url: sourceUrl };
  if (title) properties['Content'] = { rich_text: [{ text: { content: title.slice(0, 2000) } }] };
  if (fileId) properties['File ID'] = { rich_text: [{ text: { content: fileId } }] };

  const res = await fetch('https://api.notion.com/v1/pages', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${env.NOTION_TOKEN}`,
      'Notion-Version': '2022-06-28',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      parent: { database_id: env.NOTION_DB_ID },
      properties
    })
  });

  if (!res.ok) {
    const err = await res.json();
    console.warn(`[arena-sync] Notion save failed for block ${block.id}:`, err.message);
  } else {
    console.log(`[arena-sync] block ${block.id} saved to Notion`);
  }
}
```

**Step 2: Wire into processBlock**

```js
async function processBlock(block, env) {
  console.log(`[arena-sync] processing block ${block.id} class=${block.class}`);
  const result = await sendToTelegram(block, env);
  await saveToNotion(block, result, env);
}
```

**Step 3: Deploy and test**

```bash
wrangler deploy
curl https://arena-sync.<your-account>.workers.dev/sync
```

Check Notion DB — should see new row with Tag=arena, correct type.

**Step 4: Commit**

```bash
git add arena-worker/src/index.js
git commit -m "feat: save Are.na blocks to Notion after Telegram send"
```

---

### Task 6: Add Are.na section to extension options

**Files:**
- Modify: `src/shared/constants.js`
- Modify: `options/index.html`
- Modify: `options/options.js`
- Modify: `dev/index.html`
- Modify: `dev/options.js`
- Modify: `options/options.css` (if needed)
- Modify: `dev/options.css` (if needed)

**Step 1: Add defaults to constants.js**

In `src/shared/constants.js`, inside `DEFAULT_SETTINGS` after the AI block:

```js
  // Are.na sync
  arenaEnabled: false,
  arenaToken: '',
  arenaChannelSlug: 'stash-saver',
```

**Step 2: Add HTML section to options/index.html and dev/index.html**

Find the existing section for AI (look for `id="ai-config"` or similar) and add after it:

```html
<section class="settings-section">
  <h2 class="section-title">Are.na</h2>
  <div class="setting-row">
    <label class="setting-label" for="arenaEnabled">Sync enabled</label>
    <label class="toggle">
      <input type="checkbox" id="arenaEnabled">
      <span class="toggle-slider"></span>
    </label>
  </div>
  <div id="arena-config">
    <div class="setting-row">
      <label class="setting-label" for="arenaToken">Auth Token</label>
      <input type="text" id="arenaToken" class="text-input" placeholder="x-auth-token from are.na">
    </div>
    <div class="setting-row">
      <label class="setting-label" for="arenaChannelSlug">Channel Slug</label>
      <input type="text" id="arenaChannelSlug" class="text-input" placeholder="stash-saver">
    </div>
    <p class="setting-hint">Worker syncs every 5 min. Token found in are.na DevTools network tab → X-Auth-Token header.</p>
  </div>
</section>
```

**Step 3: Add JS wiring to options/options.js and dev/options.js**

Add DOM references at the top with other elements:

```js
const arenaEnabledInput = document.getElementById('arenaEnabled');
const arenaTokenInput = document.getElementById('arenaToken');
const arenaChannelSlugInput = document.getElementById('arenaChannelSlug');
const arenaConfigDiv = document.getElementById('arena-config');
```

In `loadSettings` function, after loading other settings:

```js
if (arenaEnabledInput) arenaEnabledInput.checked = settings.arenaEnabled;
if (arenaTokenInput) arenaTokenInput.value = settings.arenaToken || '';
if (arenaChannelSlugInput) arenaChannelSlugInput.value = settings.arenaChannelSlug || 'stash-saver';
if (arenaConfigDiv) arenaConfigDiv.style.display = settings.arenaEnabled ? '' : 'none';
```

In `DOMContentLoaded` event listener section, add toggle handler:

```js
if (arenaEnabledInput) {
  arenaEnabledInput.addEventListener('change', () => {
    if (arenaConfigDiv) arenaConfigDiv.style.display = arenaEnabledInput.checked ? '' : 'none';
    autoSave();
  });
}
```

In the `autoSave` / `saveSettings` function, add to the settings object:

```js
arenaEnabled: arenaEnabledInput?.checked || false,
arenaToken: arenaTokenInput?.value?.trim() || '',
arenaChannelSlug: arenaChannelSlugInput?.value?.trim() || 'stash-saver',
```

**Step 4: Verify in browser**

Open http://localhost:8080/dev/index.html — should see Are.na section at bottom. Toggle should show/hide config fields.

**Step 5: Copy to prod**

```bash
cp dev/index.html options/index.html
cp dev/options.css options/options.css
```

For options.js: manually apply the same JS changes (the mock chrome.storage block at top of dev/options.js must NOT be copied).

**Step 6: Commit**

```bash
git add src/shared/constants.js options/ dev/
git commit -m "feat: add Are.na settings section to options page"
```

---

### Task 7: Final deploy and verify end-to-end

**Step 1: Deploy worker**

```bash
cd arena-worker
wrangler deploy
```

**Step 2: Add a test block to Are.na**

Go to https://www.are.na/maxim-lyashenko/stash-saver and add an image block.

**Step 3: Trigger sync manually**

```bash
curl https://arena-sync.<account>.workers.dev/sync
```

**Step 4: Verify**

- Check Telegram — new message should appear
- Check Notion — new row with Tag=arena
- Check stash.mxml.sn — after viewer refresh, block should appear

**Step 5: Check cron is active**

In Cloudflare dashboard → Workers → arena-sync → Triggers — cron `*/5 * * * *` should be listed.

**Step 6: Final commit**

```bash
git add .
git commit -m "feat: complete Are.na → Stash sync via Cloudflare Worker"
```

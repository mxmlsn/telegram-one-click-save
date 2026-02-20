# Telegram Bot Webhook — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Create a Cloudflare Worker that receives Telegram webhook messages, saves them to Notion (same schema as the Chrome extension), runs AI analysis, and reacts to messages.

**Architecture:** New CF Worker `stash-telegram-bot` in `cloudflare-bot/` directory. Receives POST from Telegram webhook, parses message type (photo/doc/gif/video/text/forward), creates Notion entry, fetches image from Telegram for AI analysis via Gemini/Claude, patches Notion with AI results, reacts ✅/❌.

**Tech Stack:** Cloudflare Workers (vanilla JS, no dependencies), Telegram Bot API, Notion API, Google Gemini / Anthropic Claude API.

**Reference files:**
- `background.js:271-311` — `saveToNotion()` function (Notion entry format to replicate)
- `background.js:315-424` — AI prompts (`AI_PROMPT_IMAGE`, `AI_PROMPT_LINK`)
- `background.js:426-627` — AI call functions (`callGemini`, `callAnthropic`, `analyzeWithAI`, `patchNotionWithAI`)
- `cloudflare-worker/wrangler.toml` — existing worker config (reuse `account_id` pattern)

---

### Task 1: Scaffold cloudflare-bot project

**Files:**
- Create: `cloudflare-bot/wrangler.toml`
- Create: `cloudflare-bot/src/index.js`

**Step 1: Create wrangler.toml**

```toml
name = "stash-telegram-bot"
main = "src/index.js"
compatibility_date = "2024-01-01"
account_id = "961294ddfea3e6556e27911482ba7360"
workers_dev = true

[observability]
enabled = true
```

**Step 2: Create minimal index.js with webhook handler skeleton**

```js
// ─── Stash Telegram Bot ─────────────────────────────────────────────────────
// Cloudflare Worker that receives Telegram webhook updates,
// saves content to Notion, runs AI analysis, and reacts to messages.

export default {
  async fetch(request, env) {
    if (request.method !== 'POST') {
      return new Response('Method not allowed', { status: 405 });
    }

    // Verify webhook secret
    const secretHeader = request.headers.get('X-Telegram-Bot-Api-Secret-Token');
    if (secretHeader !== env.WEBHOOK_SECRET) {
      return new Response('Unauthorized', { status: 401 });
    }

    try {
      const update = await request.json();
      await handleUpdate(update, env);
    } catch (e) {
      console.error('Webhook error:', e);
    }

    // Always return 200 to Telegram (otherwise it retries)
    return new Response('ok');
  }
};

async function handleUpdate(update, env) {
  const message = update.message;
  if (!message) return;

  // Only allow messages from authorized chat
  const chatId = String(message.chat.id);
  if (chatId !== env.ALLOWED_CHAT_ID) return;

  // TODO: parse and save
  console.log('Received message:', message.message_id);
}
```

**Step 3: Commit**

```bash
git add cloudflare-bot/
git commit -m "feat: scaffold cloudflare-bot worker with webhook verification"
```

---

### Task 2: Message parser — detect content type and extract data

**Files:**
- Modify: `cloudflare-bot/src/index.js`

**Step 1: Add parseMessage function**

Add this function after `handleUpdate`. It extracts all relevant data from a Telegram message into a normalized object:

```js
// ─── Message Parser ──────────────────────────────────────────────────────────

function parseMessage(message) {
  const result = {
    type: 'quote',       // default
    fileId: null,
    content: '',
    sourceUrl: null,
    caption: message.caption || '',
    messageId: message.message_id,
  };

  // Extract forward origin info
  if (message.forward_origin) {
    const origin = message.forward_origin;
    if (origin.type === 'channel' && origin.chat?.username) {
      result.sourceUrl = `https://t.me/${origin.chat.username}/${origin.message_id}`;
    } else if (origin.type === 'user') {
      const name = [origin.sender_user.first_name, origin.sender_user.last_name]
        .filter(Boolean).join(' ');
      if (name) result.content = `[from: ${name}] `;
    }
  }

  // Photo (array of sizes, take largest)
  if (message.photo && message.photo.length > 0) {
    result.type = 'image';
    result.fileId = message.photo[message.photo.length - 1].file_id;
    result.content += result.caption;
    return result;
  }

  // Animation (GIF)
  if (message.animation) {
    result.type = 'gif';
    result.fileId = message.animation.file_id;
    result.content += result.caption;
    return result;
  }

  // Video
  if (message.video) {
    result.type = 'video';
    result.fileId = message.video.file_id;
    result.content += result.caption;
    return result;
  }

  // Document (PDF or other)
  if (message.document) {
    const mime = message.document.mime_type || '';
    result.type = mime === 'application/pdf' ? 'pdf' : 'document';
    result.fileId = message.document.file_id;
    result.content += result.caption;
    return result;
  }

  // Text message
  if (message.text) {
    // Extract URL from text
    const urlEntity = (message.entities || []).find(e => e.type === 'url');
    if (urlEntity) {
      const url = message.text.substring(urlEntity.offset, urlEntity.offset + urlEntity.length);
      result.type = 'link';
      result.sourceUrl = result.sourceUrl || url;
      // Content = text without the URL itself
      result.content += message.text.replace(url, '').trim();
    } else {
      result.type = 'quote';
      result.content += message.text;
    }
    return result;
  }

  return result;
}
```

**Step 2: Wire parseMessage into handleUpdate**

Replace the TODO in `handleUpdate`:

```js
async function handleUpdate(update, env) {
  const message = update.message;
  if (!message) return;

  const chatId = String(message.chat.id);
  if (chatId !== env.ALLOWED_CHAT_ID) return;

  const parsed = parseMessage(message);

  try {
    // Save to Notion
    const notionPageId = await saveToNotion(parsed, env);

    // React with ✅
    await setReaction(env, chatId, message.message_id, '✅');

    // Run AI analysis in background (don't block response)
    if (notionPageId && parsed.fileId) {
      // AI analysis will be added in Task 4
    }
  } catch (e) {
    console.error('Save error:', e);
    await setReaction(env, chatId, message.message_id, '❌');
  }
}
```

**Step 3: Commit**

```bash
git add cloudflare-bot/src/index.js
git commit -m "feat: add message parser for all content types"
```

---

### Task 3: Notion save + Telegram reaction

**Files:**
- Modify: `cloudflare-bot/src/index.js`

**Step 1: Add saveToNotion function**

Port from `background.js:271-311`, adapted for Worker env (no `settings` object, uses `env` directly):

```js
// ─── Notion ──────────────────────────────────────────────────────────────────

async function saveToNotion(parsed, env) {
  if (!env.NOTION_TOKEN || !env.NOTION_DB_ID) {
    console.warn('Notion not configured');
    return null;
  }

  const { type, sourceUrl, content, fileId } = parsed;
  const domain = sourceUrl
    ? sourceUrl.replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0]
    : 'telegram';

  const properties = {
    'URL': { title: [{ text: { content: domain } }] },
    'Type': { select: { name: type } },
    'Date': { date: { start: new Date().toISOString() } }
  };

  if (sourceUrl) properties['Source URL'] = { url: sourceUrl };
  if (content) properties['Content'] = { rich_text: [{ text: { content: content.slice(0, 2000) } }] };
  if (fileId) properties['File ID'] = { rich_text: [{ text: { content: fileId } }] };

  const res = await fetch('https://api.notion.com/v1/pages', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${env.NOTION_TOKEN}`,
      'Notion-Version': '2022-06-28',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ parent: { database_id: env.NOTION_DB_ID }, properties })
  });

  if (!res.ok) {
    const err = await res.json();
    throw new Error(`Notion save failed: ${err.message}`);
  }

  const page = await res.json();
  return page.id || null;
}
```

**Step 2: Add setReaction function**

```js
// ─── Telegram Reactions ──────────────────────────────────────────────────────

async function setReaction(env, chatId, messageId, emoji) {
  try {
    await fetch(`https://api.telegram.org/bot${env.BOT_TOKEN}/setMessageReaction`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        message_id: messageId,
        reaction: [{ type: 'emoji', emoji }]
      })
    });
  } catch (e) {
    console.warn('Reaction failed:', e);
  }
}
```

**Step 3: Commit**

```bash
git add cloudflare-bot/src/index.js
git commit -m "feat: add Notion save and Telegram reaction"
```

---

### Task 4: AI analysis

**Files:**
- Modify: `cloudflare-bot/src/index.js`

**Step 1: Add AI prompts**

Copy `AI_PROMPT_IMAGE` and `AI_PROMPT_LINK` from `background.js:315-424` verbatim. Place them at the top of the file after the export.

**Step 2: Add AI helper functions**

Port from `background.js:426-476`, adapted for Worker env:

```js
// ─── AI Analysis ─────────────────────────────────────────────────────────────

async function fetchBase64(url) {
  const res = await fetch(url);
  const buffer = await res.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

async function callGemini(prompt, imageBase64OrNull, env, mimeType = 'image/jpeg') {
  const model = env.AI_MODEL || 'gemini-2.0-flash';
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${env.AI_API_KEY}`;
  const parts = [];
  if (imageBase64OrNull) {
    parts.push({ inline_data: { mime_type: mimeType, data: imageBase64OrNull } });
  }
  parts.push({ text: prompt });
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ contents: [{ parts }] })
  });
  if (!res.ok) {
    console.warn('Gemini error:', res.status, await res.text());
    return null;
  }
  const data = await res.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text || null;
}

async function callAnthropic(messages, env) {
  const model = (env.AI_MODEL && !env.AI_MODEL.startsWith('gemini'))
    ? env.AI_MODEL : 'claude-haiku-4-5-20251001';
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': env.AI_API_KEY,
      'anthropic-version': '2023-06-01',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ model, max_tokens: 300, messages })
  });
  if (!res.ok) {
    console.warn('Anthropic error:', res.status, await res.text());
    return null;
  }
  const data = await res.json();
  return data.content?.[0]?.text || null;
}
```

**Step 3: Add analyzeAndPatch function**

This combines `analyzeWithAI` + `patchNotionWithAI` from `background.js:478-627`:

```js
async function analyzeAndPatch(parsed, notionPageId, env) {
  if (!env.AI_API_KEY) return;

  const provider = env.AI_PROVIDER || 'google';
  const isDirectImage = parsed.type === 'image' || parsed.type === 'gif';
  let responseText = null;

  // For items with file_id — fetch image from Telegram and send to AI
  if (parsed.fileId) {
    const fileRes = await fetch(
      `https://api.telegram.org/bot${env.BOT_TOKEN}/getFile?file_id=${parsed.fileId}`
    );
    const fileData = await fileRes.json();
    if (fileData.ok) {
      const filePath = fileData.result.file_path;
      const imgUrl = `https://api.telegram.org/file/bot${env.BOT_TOKEN}/${filePath}`;
      const prompt = isDirectImage ? AI_PROMPT_IMAGE : AI_PROMPT_LINK;

      const ext = filePath.split('.').pop()?.toLowerCase();
      const mimeType = ext === 'gif' ? 'image/gif'
        : ext === 'png' ? 'image/png'
        : ext === 'webp' ? 'image/webp'
        : 'image/jpeg';

      if (provider === 'google') {
        const base64 = await fetchBase64(imgUrl);
        responseText = await callGemini(prompt, base64, env, mimeType);
      } else {
        responseText = await callAnthropic([{
          role: 'user',
          content: [
            { type: 'image', source: { type: 'url', url: imgUrl } },
            { type: 'text', text: prompt }
          ]
        }], env);
      }
    }
  }

  // Fallback: text/link analysis without image
  if (!responseText) {
    const context = [
      parsed.sourceUrl ? `URL: ${parsed.sourceUrl}` : '',
      parsed.content ? `Content: ${parsed.content.slice(0, 500)}` : ''
    ].filter(Boolean).join('\n');

    if (!context) return; // Nothing to analyze

    const fullPrompt = `${AI_PROMPT_LINK}\n\nContent to analyze:\n${context}`;

    if (provider === 'google') {
      responseText = await callGemini(fullPrompt, null, env);
    } else {
      responseText = await callAnthropic(
        [{ role: 'user', content: fullPrompt }], env
      );
    }
  }

  if (!responseText) return;

  // Parse AI response
  const cleaned = responseText.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
  let aiResult;
  try {
    aiResult = JSON.parse(cleaned);
  } catch {
    console.warn('AI parse error for:', cleaned.slice(0, 100));
    return;
  }

  // Hard guard: direct TG image can only be "product" or null
  if (isDirectImage && aiResult.content_type !== 'product') {
    aiResult.content_type = null;
  }

  // Patch Notion with AI results
  const properties = {
    'ai_analyzed': { checkbox: true }
  };

  properties['ai_type'] = aiResult.content_type
    ? { select: { name: aiResult.content_type } }
    : { select: null };
  properties['ai_type_secondary'] = aiResult.content_type_secondary
    ? { select: { name: aiResult.content_type_secondary } }
    : { select: null };
  if (aiResult.description) {
    properties['ai_description'] = {
      rich_text: [{ text: { content: aiResult.description.slice(0, 2000) } }]
    };
  }

  const aiDataPayload = {};
  if (aiResult.title) aiDataPayload.title = aiResult.title;
  if (aiResult.materials?.length) aiDataPayload.materials = aiResult.materials;
  if (aiResult.color_palette) aiDataPayload.color_palette = aiResult.color_palette;
  if (aiResult.color_subject) aiDataPayload.color_subject = aiResult.color_subject;
  if (aiResult.color_top3?.length) aiDataPayload.color_top3 = aiResult.color_top3;
  if (aiResult.text_on_image) aiDataPayload.text_on_image = aiResult.text_on_image;
  if (aiResult.price) aiDataPayload.price = aiResult.price;
  if (aiResult.author) aiDataPayload.author = aiResult.author;
  if (aiResult.tweet_text) aiDataPayload.tweet_text = aiResult.tweet_text;
  if (Object.keys(aiDataPayload).length) {
    properties['ai_data'] = {
      rich_text: [{ text: { content: JSON.stringify(aiDataPayload).slice(0, 2000) } }]
    };
  }

  await fetch(`https://api.notion.com/v1/pages/${notionPageId}`, {
    method: 'PATCH',
    headers: {
      'Authorization': `Bearer ${env.NOTION_TOKEN}`,
      'Notion-Version': '2022-06-28',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ properties })
  });
}
```

**Step 4: Wire AI into handleUpdate using waitUntil**

Update `handleUpdate` to run AI analysis in background:

```js
async function handleUpdate(update, env, ctx) {
  const message = update.message;
  if (!message) return;

  const chatId = String(message.chat.id);
  if (chatId !== env.ALLOWED_CHAT_ID) return;

  const parsed = parseMessage(message);

  try {
    const notionPageId = await saveToNotion(parsed, env);
    await setReaction(env, chatId, message.message_id, '✅');

    // Run AI analysis in background (after response is sent)
    if (notionPageId && env.AI_API_KEY) {
      ctx.waitUntil(analyzeAndPatch(parsed, notionPageId, env));
    }
  } catch (e) {
    console.error('Save error:', e);
    await setReaction(env, chatId, message.message_id, '❌');
  }
}
```

Also update the fetch handler to pass `ctx`:

```js
export default {
  async fetch(request, env, ctx) {
    // ... existing verification code ...
    try {
      const update = await request.json();
      await handleUpdate(update, env, ctx);
    } catch (e) {
      console.error('Webhook error:', e);
    }
    return new Response('ok');
  }
};
```

**Step 5: Commit**

```bash
git add cloudflare-bot/src/index.js
git commit -m "feat: add AI analysis with Gemini/Claude + Notion patch"
```

---

### Task 5: Deploy and set webhook

**Step 1: Deploy the worker**

```bash
cd cloudflare-bot
npx wrangler deploy
```

Expected: Worker deployed to `https://stash-telegram-bot.mxmlsn-co.workers.dev`

**Step 2: Set environment secrets**

```bash
npx wrangler secret put BOT_TOKEN
npx wrangler secret put NOTION_TOKEN
npx wrangler secret put NOTION_DB_ID
npx wrangler secret put WEBHOOK_SECRET
npx wrangler secret put ALLOWED_CHAT_ID
npx wrangler secret put AI_API_KEY
npx wrangler secret put AI_PROVIDER
npx wrangler secret put AI_MODEL
```

Each command will prompt for the value interactively.

**Step 3: Register webhook with Telegram**

```bash
curl -X POST "https://api.telegram.org/bot<BOT_TOKEN>/setWebhook" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://stash-telegram-bot.mxmlsn-co.workers.dev",
    "secret_token": "<WEBHOOK_SECRET>",
    "allowed_updates": ["message"]
  }'
```

Expected: `{"ok":true,"result":true,"description":"Webhook was set"}`

**Step 4: Verify webhook is active**

```bash
curl "https://api.telegram.org/bot<BOT_TOKEN>/getWebhookInfo"
```

Expected: JSON with `url` set to the worker URL, `pending_update_count: 0`.

**Step 5: Test by sending a photo to the bot in Telegram**

Expected: Bot reacts with ✅, item appears in Notion database, AI fields populated.

**Step 6: Commit any final tweaks**

```bash
git add cloudflare-bot/
git commit -m "feat: deploy telegram bot webhook worker"
```

---

### Task 6: Manual end-to-end testing

Test each content type by sending to the bot:

1. **Photo** — send any image → expect ✅, Notion entry with type=image, File ID populated
2. **GIF** — send a GIF → expect ✅, type=gif
3. **Video** — send a short video → expect ✅, type=video
4. **PDF** — send a PDF document → expect ✅, type=pdf
5. **Link** — send a URL → expect ✅, type=link, Source URL populated
6. **Text** — send plain text → expect ✅, type=quote
7. **Forward from channel** — forward a post from a public channel → expect ✅, Source URL = `t.me/channel/msgid`
8. **Forward from user** — forward a message from a private chat → expect ✅, Content prefixed with sender name
9. **Open web viewer** at stash.mxml.sn → all items visible with correct types and images

Fix any issues found during testing and commit.

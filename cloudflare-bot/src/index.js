// ─── Stash Telegram Bot ─────────────────────────────────────────────────────
// Cloudflare Worker that receives Telegram webhook updates,
// saves content to Notion, runs AI analysis, and reacts to messages.
//
// All logic is split across modules:
//   parser.js   — parseMessage()
//   notion.js   — saveToNotion(), patchNotionPage()
//   telegram.js — setReaction(), forwardToStorageChannel(), captureAndUploadScreenshot()
//   analyze.js  — analyzeAndPatch()
//   ai.js       — callGemini(), callAnthropic()
//   helpers.js  — normalizeUrl, escapeHtmlBot, formatTextWithEntities, fetchBase64, buildAiDataFromParsed
//   prompts.js  — AI prompt constants

import { parseMessage } from './parser.js';
import { saveToNotion, patchNotionPage } from './notion.js';
import { setReaction, sendTagKeyboard, deleteMessage, forwardToStorageChannel, captureAndUploadScreenshot } from './telegram.js';
import { analyzeAndPatch } from './analyze.js';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization'
};

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: CORS_HEADERS });
    }

    // Extension pushes tags config
    if (url.pathname === '/api/tags') {
      return handleTagsEndpoint(request, env);
    }

    // Telegram webhook (default path)
    if (request.method !== 'POST') {
      return new Response('Method not allowed', { status: 405 });
    }

    const secretHeader = request.headers.get('X-Telegram-Bot-Api-Secret-Token');
    if (secretHeader !== env.WEBHOOK_SECRET) {
      return new Response('Unauthorized', { status: 401 });
    }

    try {
      const update = await request.json();

      if (update.callback_query) {
        await handleCallbackQuery(update.callback_query, env);
      } else {
        await handleUpdate(update, env, ctx);
      }
    } catch (e) {
      console.error('Webhook error:', e);
    }

    return new Response('ok');
  }
};

// ─── Tags endpoint (called by extension) ────────────────────────────────────

async function handleTagsEndpoint(request, env) {
  try {
    const auth = request.headers.get('Authorization');
    if (auth !== `Bearer ${env.BOT_TOKEN}`) {
      return new Response('Unauthorized', { status: 401, headers: CORS_HEADERS });
    }

    // GET — read current tags config + env info for viewer
    if (request.method === 'GET') {
      const config = await getTagsConfig(env) || {};
      if (env.STORAGE_CHANNEL_ID) config.storageChannelId = env.STORAGE_CHANNEL_ID;
      return new Response(JSON.stringify(config), {
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' }
      });
    }

    // POST — update tags config
    if (request.method !== 'POST') {
      return new Response('Method not allowed', { status: 405, headers: CORS_HEADERS });
    }

    const body = await request.json();
    // body: { customTags, emojiPack, customEmoji, sendWithColor }
    await env.TAGS_KV.put('tags_config', JSON.stringify(body));

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' }
    });
  } catch (e) {
    console.error('Tags endpoint error:', e);
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' }
    });
  }
}

// ─── Load tags from KV ──────────────────────────────────────────────────────

const EMOJI_PACKS = {
  circle: ['\u{1F534}', '\u{1F7E1}', '\u{1F7E2}', '\u{1F535}', '\u{1F7E3}', '\u26AB\uFE0F', '\u26AA\uFE0F'],
  heart: ['\u2764\uFE0F', '\u{1F49B}', '\u{1F49A}', '\u{1F499}', '\u{1F49C}', '\u{1F5A4}', '\u{1F90D}'],
  soft: ['\u{1F344}', '\u{1F424}', '\u{1F438}', '\u{1F4A7}', '\u{1F52E}', '\u{1F31A}', '\u{1F4AD}']
};

const COLOR_ID_TO_INDEX = {
  'red': 0, 'yellow': 1, 'green': 2, 'blue': 3,
  'purple': 4, 'black': 5, 'white': 6
};

async function getTagsConfig(env) {
  try {
    const raw = await env.TAGS_KV.get('tags_config');
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function getEmojiForTag(tag, config) {
  if (!config || !config.sendWithColor) return '';
  const idx = COLOR_ID_TO_INDEX[tag.id] ?? 0;
  if (config.emojiPack === 'custom' && config.customEmoji) {
    return config.customEmoji[idx] || '';
  }
  const pack = EMOJI_PACKS[config.emojiPack || 'circle'] || EMOJI_PACKS.circle;
  return pack[idx] || '';
}

// ─── Callback query handler (tag button press) ──────────────────────────────

async function handleCallbackQuery(callbackQuery, env) {
  const data = callbackQuery.data;
  if (!data || !data.startsWith('tag:')) return;

  const chatId = String(callbackQuery.message.chat.id);
  if (chatId !== env.ALLOWED_CHAT_ID) return;

  // data format: "tag:<notionPageId>:<tagName>" or "tag:<notionPageId>:"  (no tag)
  const parts = data.split(':');
  const notionPageId = parts[1];
  const tagName = parts.slice(2).join(':'); // tag name may contain colons (unlikely but safe)

  try {
    // Patch Notion page with tag
    if (tagName && notionPageId) {
      await patchNotionPage(notionPageId, {
        'Tag': { select: { name: tagName } }
      }, env);
    }

    // Answer callback query (toast in TG)
    const toastText = tagName ? `#${tagName}` : 'No tag';
    await fetch(`https://api.telegram.org/bot${env.BOT_TOKEN}/answerCallbackQuery`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        callback_query_id: callbackQuery.id,
        text: toastText
      })
    });

    // Delete the keyboard message
    await deleteMessage(env, chatId, callbackQuery.message.message_id);
  } catch (e) {
    console.error('Callback query error:', e);
  }
}

// ─── Message handler ────────────────────────────────────────────────────────

async function handleUpdate(update, env, ctx) {
  const message = update.message;
  if (!message) return;

  const chatId = String(message.chat.id);
  if (chatId !== env.ALLOWED_CHAT_ID) return;

  // Skip messages sent by the web viewer (already saved to Notion by viewer itself)
  const text = message.text || message.caption || '';
  if (text.startsWith('[stash-viewer]')) return;

  const parsed = parseMessage(message, env);

  try {
    const notionPageId = await saveToNotion(parsed, env);
    await setReaction(env, chatId, message.message_id, '\u2705');

    if (notionPageId) {
      // Send tag keyboard (non-blocking — don't fail the save if tags fail)
      ctx.waitUntil(
        sendTagKeyboardIfConfigured(chatId, message.message_id, notionPageId, env)
      );

      ctx.waitUntil((async () => {
        // For links: capture screenshot, send to TG silently, update Notion with file_id
        if (parsed.type === 'link' && parsed.sourceUrl && !parsed.fileId) {
          const fileId = await captureAndUploadScreenshot(parsed.sourceUrl, chatId, env);
          if (fileId) {
            parsed.fileId = fileId;
            await patchNotionPage(notionPageId, {
              'File ID': { rich_text: [{ text: { content: fileId } }] }
            }, env);
          }
        }

        // Forward large files / unknown documents to storage channel
        const isLargeFile = parsed.fileSize && parsed.fileSize > 20 * 1024 * 1024;
        const isUnknownDoc = (parsed.type === 'document' || parsed.mediaType === 'document')
          && !(parsed.mediaType === 'video' || parsed.mediaType === 'image' || parsed.mediaType === 'pdf');
        if ((isLargeFile || isUnknownDoc) && env.STORAGE_CHANNEL_ID) {
          await forwardToStorageChannel(message, chatId, notionPageId, parsed, env);
        }

        // AI analysis
        if (env.AI_API_KEY) {
          await analyzeAndPatch(parsed, notionPageId, env);
        }
      })());
    }
  } catch (e) {
    console.error('Save error:', e);
    await setReaction(env, chatId, message.message_id, '\u274C');
  }
}

async function sendTagKeyboardIfConfigured(chatId, replyToMessageId, notionPageId, env) {
  try {
    const config = await getTagsConfig(env);
    if (!config || !config.customTags) return;

    const activeTags = config.customTags.filter(t => t.name && t.name.trim().length > 0);
    if (activeTags.length === 0) return;

    await sendTagKeyboard(env, chatId, replyToMessageId, notionPageId, activeTags, config);
  } catch (e) {
    console.error('Tag keyboard error:', e);
  }
}

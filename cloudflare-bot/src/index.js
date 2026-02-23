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
import { setReaction, forwardToStorageChannel, captureAndUploadScreenshot } from './telegram.js';
import { analyzeAndPatch } from './analyze.js';

export default {
  async fetch(request, env, ctx) {
    if (request.method !== 'POST') {
      return new Response('Method not allowed', { status: 405 });
    }

    const secretHeader = request.headers.get('X-Telegram-Bot-Api-Secret-Token');
    if (secretHeader !== env.WEBHOOK_SECRET) {
      return new Response('Unauthorized', { status: 401 });
    }

    try {
      const update = await request.json();
      await handleUpdate(update, env, ctx);
    } catch (e) {
      console.error('Webhook error:', e);
    }

    return new Response('ok');
  }
};

async function handleUpdate(update, env, ctx) {
  const message = update.message;
  if (!message) return;

  const chatId = String(message.chat.id);
  if (chatId !== env.ALLOWED_CHAT_ID) return;

  const parsed = parseMessage(message, env);

  try {
    const notionPageId = await saveToNotion(parsed, env);
    await setReaction(env, chatId, message.message_id, '✅');

    if (notionPageId) {
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
    await setReaction(env, chatId, message.message_id, '❌');
  }
}

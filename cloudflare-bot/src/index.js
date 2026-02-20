// ─── Stash Telegram Bot ─────────────────────────────────────────────────────
// Cloudflare Worker that receives Telegram webhook updates,
// saves content to Notion, runs AI analysis, and reacts to messages.

export default {
  async fetch(request, env, ctx) {
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
      await handleUpdate(update, env, ctx);
    } catch (e) {
      console.error('Webhook error:', e);
    }

    // Always return 200 to Telegram (otherwise it retries)
    return new Response('ok');
  }
};

async function handleUpdate(update, env, ctx) {
  const message = update.message;
  if (!message) return;

  // Only allow messages from authorized chat
  const chatId = String(message.chat.id);
  if (chatId !== env.ALLOWED_CHAT_ID) return;

  const parsed = parseMessage(message);

  try {
    // Save to Notion
    const notionPageId = await saveToNotion(parsed, env);

    // React with ✅
    await setReaction(env, chatId, message.message_id, '✅');

    // AI analysis placeholder (Task 4)
  } catch (e) {
    console.error('Save error:', e);
    await setReaction(env, chatId, message.message_id, '❌');
  }
}

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

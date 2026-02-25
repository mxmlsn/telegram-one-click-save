export default {
  async scheduled(event, env, ctx) {
    ctx.waitUntil(syncArena(env));
  },

  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname === '/sync') {
      ctx.waitUntil(syncArena(env));
      return new Response('sync triggered', { status: 200 });
    }
    if (url.pathname === '/reset') {
      await env.ARENA_SYNC_KV.delete('last_synced_at');
      return new Response('KV reset', { status: 200 });
    }
    return new Response('arena-sync worker', { status: 200 });
  }
};

async function syncArena(env) {
  console.log('[arena-sync] starting');

  const stored = await env.ARENA_SYNC_KV.get('last_synced_at');
  const lastSyncedAt = stored ? new Date(stored) : new Date(Date.now() - 24 * 60 * 60 * 1000);

  const blocks = await fetchArenaBlocks(env);

  const newBlocks = blocks.filter(b => new Date(b.connected_at) > lastSyncedAt);
  console.log(`[arena-sync] ${newBlocks.length} new blocks since ${lastSyncedAt.toISOString()}`);

  newBlocks.reverse(); // process oldest first

  for (const block of newBlocks) {
    try {
      await processBlock(block, env);
    } catch (e) {
      console.error(`[arena-sync] block ${block.id} failed:`, e.message);
    }
  }

  await env.ARENA_SYNC_KV.put('last_synced_at', new Date().toISOString());
  console.log('[arena-sync] done');
}

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

async function processBlock(block, env) {
  console.log(`[arena-sync] processing block ${block.id} class=${block.class}`);
  const result = await sendToTelegram(block, env);
  await saveToNotion(block, result, env);
  console.log(`[arena-sync] block ${block.id} done, type=${result.notionType} fileId=${result.fileId}`);
}

async function sendToTelegram(block, env) {
  const botToken = env.BOT_TOKEN;
  const chatId = env.CHAT_ID;
  const base = `https://api.telegram.org/bot${botToken}`;

  const blockClass = block.class;
  const title = block.title || block.generated_title || '';
  const sourceUrl = block.source?.url || '';
  const arenaUrl = `https://www.are.na/block/${block.id}`;

  // Caption: title (if not just filename) + arena URL
  const captionParts = [];
  if (title && title !== block.image?.filename) captionParts.push(title);
  captionParts.push(`are.na/block/${block.id}`);
  const caption = captionParts.join('\n');

  let fileId = null;
  let notionType = 'link';

  if (blockClass === 'Image' && block.image?.original?.url) {
    const imageUrl = block.image.original.url;
    // Try sendPhoto first
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
      console.warn(`[arena-sync] sendPhoto failed for ${block.id}: ${data.description}, trying sendDocument`);
      // Fallback to sendDocument
      const res2 = await fetch(`${base}/sendDocument`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: chatId, document: imageUrl, caption })
      });
      const data2 = await res2.json();
      if (data2.ok) {
        fileId = data2.result.document.file_id;
        notionType = 'image';
      } else {
        console.error(`[arena-sync] sendDocument also failed: ${data2.description}`);
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
      } else {
        console.warn(`[arena-sync] sendAnimation failed: ${data.description}`);
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
      } else {
        console.warn(`[arena-sync] sendVideo failed: ${data.description}`);
      }
    } else {
      // Generic attachment
      const res = await fetch(`${base}/sendDocument`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: chatId, document: block.attachment.url, caption })
      });
      const data = await res.json();
      if (data.ok) {
        fileId = data.result.document?.file_id;
        notionType = 'link';
      }
    }
  } else if (blockClass === 'Attachment' && block.attachment?.url) {
    const contentType = block.attachment.content_type || '';
    const isPdf = contentType.includes('pdf') || block.attachment.url?.endsWith('.pdf');
    const res = await fetch(`${base}/sendDocument`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, document: block.attachment.url, caption })
    });
    const data = await res.json();
    if (data.ok) {
      fileId = data.result.document?.file_id;
      notionType = isPdf ? 'pdf' : 'link';
    } else {
      console.warn(`[arena-sync] sendDocument failed: ${data.description}`);
    }
  } else if (blockClass === 'Text') {
    const text = block.content || title || '(empty)';
    // Escape HTML entities to avoid Telegram parse errors
    const safeText = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const msg = `<code>${safeText}</code>\n\n${arenaUrl}`;
    const res = await fetch(`${base}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text: msg, parse_mode: 'HTML' })
    });
    const data = await res.json();
    if (!data.ok) console.warn(`[arena-sync] sendMessage (Text) failed: ${data.description}`);
    notionType = 'quote';
  } else {
    // Link block or fallback
    const url = sourceUrl || arenaUrl;
    const msgParts = [];
    if (title) msgParts.push(title);
    msgParts.push(url);
    if (sourceUrl) msgParts.push(arenaUrl); // add arena link as reference
    const msg = msgParts.join('\n');
    const res = await fetch(`${base}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text: msg, disable_web_page_preview: false })
    });
    const data = await res.json();
    if (!data.ok) console.warn(`[arena-sync] sendMessage (Link) failed: ${data.description}`);
    notionType = 'link';
  }

  return { fileId, notionType, title, sourceUrl, arenaUrl };
}

async function saveToNotion(block, telegramResult, env) {
  const { fileId, notionType, title, sourceUrl, arenaUrl } = telegramResult;

  const properties = {
    'URL': { title: [{ text: { content: 'are.na' } }] },
    'Type': { select: { name: notionType } },
    'Date': { date: { start: block.connected_at || new Date().toISOString() } },
    'Source URL': { url: sourceUrl || arenaUrl },
    'Tag': { select: { name: 'arena' } }
  };

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

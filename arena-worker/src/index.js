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
    if (url.pathname === '/debug-list') {
      const slug = env.ARENA_CHANNEL_SLUG;
      const res = await fetch(`https://api.are.na/v2/channels/${slug}/contents?per=20&sort=position&direction=desc`, {
        headers: { 'X-Auth-Token': env.ARENA_AUTH_TOKEN, 'X-App-Token': env.ARENA_APP_TOKEN }
      });
      const data = await res.json();
      const blocks = (data.contents || []).map(b => ({
        id: b.id, class: b.class, title: (b.title || '').slice(0, 60),
        ct: b.attachment?.content_type || '', att_url: b.attachment?.url?.slice(0, 60) || ''
      }));
      return new Response(JSON.stringify(blocks, null, 2), { headers: { 'Content-Type': 'application/json' } });
    }
    if (url.pathname.startsWith('/debug-block/')) {
      const blockId = url.pathname.split('/').pop();
      const res = await fetch(`https://api.are.na/v2/blocks/${blockId}`, {
        headers: { 'X-Auth-Token': env.ARENA_AUTH_TOKEN, 'X-App-Token': env.ARENA_APP_TOKEN }
      });
      const data = await res.json();
      const info = {
        id: data.id, class: data.class, title: data.title,
        attachment: data.attachment ? { url: data.attachment.url, content_type: data.attachment.content_type, file_size: data.attachment.file_size } : null,
        source: data.source ? { url: data.source.url } : null,
        image: data.image ? { filename: data.image.filename, content_type: data.image.content_type, original_url: data.image.original?.url } : null,
      };
      return new Response(JSON.stringify(info, null, 2), { headers: { 'Content-Type': 'application/json' } });
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
  const sourceUrl = block.source?.url || '';
  const arenaUrl = `https://www.are.na/block/${block.id}`;

  // For Text blocks, content is the text itself — not title
  // For other blocks, use title only if it's not a URL/filename/base64
  const rawTitle = block.title || '';
  const isUrlOrBase64 = rawTitle.startsWith('http') || rawTitle.startsWith('eyJ') || rawTitle.length > 200;
  const displayTitle = blockClass === 'Text'
    ? '' // text blocks use content, not title
    : (isUrlOrBase64 ? (block.image?.filename || '') : rawTitle);

  // Caption: displayTitle + arena URL
  const captionParts = [];
  if (displayTitle) captionParts.push(displayTitle);
  captionParts.push(`are.na/block/${block.id}`);
  const caption = captionParts.join('\n');

  let fileId = null;
  let notionType = 'link';

  if (blockClass === 'Image' && block.image?.original?.url) {
    const imageUrl = block.image.original.url;
    const isGif = (block.title || '').toLowerCase().endsWith('.gif') ||
                  (block.source?.url || '').toLowerCase().includes('.gif') ||
                  (block.image?.filename || '').toLowerCase().endsWith('.gif');

    if (isGif) {
      // For GIFs: send animation to chat (for bot), then send photo to get a valid photo fileId for viewer
      const gifUrl = block.source?.url || imageUrl;
      const resAnim = await fetch(`${base}/sendAnimation`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: chatId, animation: gifUrl, caption })
      });
      await resAnim.json(); // must consume body to avoid stalled HTTP response in Cloudflare Workers
      // animation.thumbnail.file_id (AAMC type) is not retrievable via getFile — use sendPhoto instead
      const res2 = await fetch(`${base}/sendPhoto`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: chatId, photo: imageUrl, caption })
      });
      const data2 = await res2.json();
      if (data2.ok) {
        fileId = data2.result.photo[data2.result.photo.length - 1].file_id;
        notionType = 'gif';
      } else {
        console.warn(`[arena-sync] sendPhoto for gif preview failed for ${block.id}: ${data2.description}`);
      }
    } else {
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
    const isVideo = contentType.includes('video');
    const previewImageUrl = block.image?.original?.url;

    if (isVideo) {
      // Send video file — get thumbnail fileId for viewer
      const res = await fetch(`${base}/sendVideo`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: chatId, video: block.attachment.url, caption })
      });
      const data = await res.json();
      if (data.ok) {
        fileId = data.result.video?.thumbnail?.file_id;
        notionType = 'video';
        // If Telegram didn't generate a thumbnail but Are.na has a preview image, use sendPhoto to get a photo fileId
        if (!fileId && previewImageUrl) {
          const res2 = await fetch(`${base}/sendPhoto`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ chat_id: chatId, photo: previewImageUrl, caption })
          });
          const data2 = await res2.json();
          if (data2.ok) fileId = data2.result.photo[data2.result.photo.length - 1].file_id;
          else await res2.body?.cancel();
        }
      } else {
        console.warn(`[arena-sync] sendVideo failed for ${block.id}: ${data.description}`);
        // Fallback: send as document
        const res2 = await fetch(`${base}/sendDocument`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ chat_id: chatId, document: block.attachment.url, caption })
        });
        const data2 = await res2.json();
        if (data2.ok) { fileId = data2.result.document?.file_id; notionType = 'video'; }
        else console.warn(`[arena-sync] sendDocument fallback also failed: ${data2.description}`);
      }
    } else if (isPdf) {
      // Send PDF as document
      const res = await fetch(`${base}/sendDocument`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: chatId, document: block.attachment.url, caption })
      });
      const data = await res.json();
      if (data.ok) {
        notionType = 'pdf';
        // PDF document fileId can't be used as thumbnail — use Are.na preview image instead
        if (previewImageUrl) {
          const res2 = await fetch(`${base}/sendPhoto`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ chat_id: chatId, photo: previewImageUrl, caption })
          });
          const data2 = await res2.json();
          if (data2.ok) fileId = data2.result.photo[data2.result.photo.length - 1].file_id;
          else console.warn(`[arena-sync] sendPhoto for pdf preview failed: ${data2.description}`);
        }
      } else {
        console.warn(`[arena-sync] sendDocument (pdf) failed: ${data.description}`);
      }
    } else {
      const res = await fetch(`${base}/sendDocument`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: chatId, document: block.attachment.url, caption })
      });
      const data = await res.json();
      if (data.ok) {
        fileId = data.result.document?.file_id;
        notionType = 'link';
      } else {
        console.warn(`[arena-sync] sendDocument failed: ${data.description}`);
      }
    }
  } else if (blockClass === 'Text') {
    const text = block.content || block.title || '';
    const isUrl = text.startsWith('http://') || text.startsWith('https://');
    if (isUrl) {
      // Are.na failed to load external resource, stored URL as text — treat as link
      const msgParts = [text, arenaUrl].filter(Boolean);
      const res = await fetch(`${base}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: chatId, text: msgParts.join('\n'), disable_web_page_preview: false })
      });
      const data = await res.json();
      if (!data.ok) console.warn(`[arena-sync] sendMessage (Text-as-link) failed: ${data.description}`);
      notionType = 'link';
    } else {
      // Escape HTML entities to avoid Telegram parse errors
      const safeText = (text || '(empty)').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      const msg = `<code>${safeText}</code>\n\n${arenaUrl}`;
      const res = await fetch(`${base}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: chatId, text: msg, parse_mode: 'HTML' })
      });
      const data = await res.json();
      if (!data.ok) console.warn(`[arena-sync] sendMessage (Text) failed: ${data.description}`);
      notionType = 'quote';
    }
  } else {
    // Link block or fallback — try to send preview image if available
    const previewImageUrl = block.image?.original?.url;
    if (previewImageUrl) {
      const linkCaption = [displayTitle || block.title || '', sourceUrl || arenaUrl, arenaUrl].filter(Boolean).join('\n');
      const res = await fetch(`${base}/sendPhoto`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: chatId, photo: previewImageUrl, caption: linkCaption })
      });
      const data = await res.json();
      if (data.ok) {
        const photos = data.result.photo;
        fileId = photos[photos.length - 1].file_id;
        notionType = 'link';
      } else {
        // Fallback to text message
        const url = sourceUrl || arenaUrl;
        const msgParts = [displayTitle || block.title, url, arenaUrl].filter(Boolean);
        await fetch(`${base}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ chat_id: chatId, text: msgParts.join('\n'), disable_web_page_preview: false })
        });
        notionType = 'link';
      }
    } else {
      const url = sourceUrl || arenaUrl;
      const msgParts = [displayTitle || block.title, url, sourceUrl ? arenaUrl : ''].filter(Boolean);
      const res = await fetch(`${base}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: chatId, text: msgParts.join('\n'), disable_web_page_preview: false })
      });
      const data = await res.json();
      if (!data.ok) console.warn(`[arena-sync] sendMessage (Link) failed: ${data.description}`);
      notionType = 'link';
    }
  }

  return { fileId, notionType, displayTitle, sourceUrl, arenaUrl };
}

async function saveToNotion(block, telegramResult, env) {
  const { fileId, notionType, displayTitle, sourceUrl, arenaUrl } = telegramResult;

  // For text blocks, store actual text content (unless it's a URL — store nothing then).
  // For others, store displayTitle.
  const rawTextContent = block.content || block.title || '';
  const textIsUrl = rawTextContent.startsWith('http://') || rawTextContent.startsWith('https://');
  const notionContent = block.class === 'Text'
    ? (textIsUrl ? '' : rawTextContent.slice(0, 2000))
    : (displayTitle || '').slice(0, 2000);

  const properties = {
    'URL': { title: [{ text: { content: 'are.na' } }] },
    'Type': { select: { name: notionType } },
    'Date': { date: { start: block.connected_at || new Date().toISOString() } },
    'Source URL': { url: sourceUrl || arenaUrl },
    'Tag': { select: { name: 'arena' } }
  };

  if (notionContent) properties['Content'] = { rich_text: [{ text: { content: notionContent } }] };
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

// Telegram API helpers

export async function setReaction(env, chatId, messageId, emoji) {
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

export async function forwardToStorageChannel(message, chatId, notionPageId, parsed, env) {
  const { buildAiDataFromParsed } = await import('./helpers.js');

  try {
    const res = await fetch(`https://api.telegram.org/bot${env.BOT_TOKEN}/copyMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: env.STORAGE_CHANNEL_ID,
        from_chat_id: chatId,
        message_id: message.message_id,
        disable_notification: true
      })
    });

    const data = await res.json();
    if (!data.ok) {
      console.warn('Storage channel copy failed:', data.description);
      return;
    }

    const rawId = String(env.STORAGE_CHANNEL_ID);
    const channelUsername = rawId.startsWith('@') ? rawId.slice(1) : rawId;
    const copiedMsgId = data.result.message_id;
    const storageUrl = `https://t.me/${channelUsername}/${copiedMsgId}`;

    // Store on parsed so analyzeAndPatch (which runs after) preserves it
    parsed.storageUrl = storageUrl;

    const patchProps = {};
    if (!parsed.sourceUrl) {
      patchProps['Source URL'] = { url: storageUrl };
    }

    const currentAiData = buildAiDataFromParsed(parsed);
    currentAiData.storageUrl = storageUrl;

    patchProps['ai_data'] = {
      rich_text: [{ text: { content: JSON.stringify(currentAiData).slice(0, 2000) } }]
    };

    await fetch(`https://api.notion.com/v1/pages/${notionPageId}`, {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${env.NOTION_TOKEN}`,
        'Notion-Version': '2022-06-28',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ properties: patchProps })
    });
  } catch (e) {
    console.warn('Storage channel forward error:', e.message);
  }
}

export async function captureAndUploadScreenshot(url, chatId, env) {
  const { normalizeUrl } = await import('./helpers.js');
  const normalizedUrl = normalizeUrl(url);
  const screenshotUrl = `https://image.thum.io/get/width/1280/crop/960/noanimate/${normalizedUrl}`;
  const MAX_RETRIES = 3;
  const RETRY_DELAYS = [2000, 5000, 10000];

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      if (attempt > 0) {
        console.log(`Screenshot retry ${attempt}/${MAX_RETRIES - 1} for: ${normalizedUrl}`);
        await new Promise(r => setTimeout(r, RETRY_DELAYS[attempt - 1]));
      }

      const imgRes = await fetch(screenshotUrl, { redirect: 'follow' });
      if (!imgRes.ok) {
        console.warn(`Screenshot fetch failed (attempt ${attempt + 1}):`, imgRes.status);
        continue;
      }

      const contentType = imgRes.headers.get('content-type') || '';
      if (!contentType.startsWith('image/')) {
        console.warn(`Screenshot not an image (${contentType}), retrying...`);
        continue;
      }

      const imgBlob = await imgRes.arrayBuffer();
      if (!imgBlob || imgBlob.byteLength < 1024) {
        console.warn(`Screenshot too small (${imgBlob?.byteLength || 0}b), retrying...`);
        continue;
      }

      const formData = new FormData();
      formData.append('chat_id', chatId);
      formData.append('photo', new Blob([imgBlob], { type: 'image/png' }), 'screenshot.png');
      formData.append('disable_notification', 'true');

      const tgRes = await fetch(`https://api.telegram.org/bot${env.BOT_TOKEN}/sendPhoto`, {
        method: 'POST',
        body: formData
      });

      if (!tgRes.ok) {
        console.warn(`TG screenshot upload failed (attempt ${attempt + 1}):`, tgRes.status);
        continue;
      }

      const tgResult = await tgRes.json();
      const photos = tgResult.result?.photo;
      const fileId = photos && photos.length > 0 ? photos[photos.length - 1].file_id : null;
      if (fileId) return fileId;

      console.warn('TG returned no file_id, retrying...');
    } catch (e) {
      console.warn(`Screenshot capture error (attempt ${attempt + 1}):`, e.message);
    }
  }

  console.warn('Screenshot failed after all retries:', normalizedUrl);
  return null;
}

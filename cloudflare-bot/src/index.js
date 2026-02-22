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

  const parsed = parseMessage(message, env);

  try {
    // Save to Notion
    const notionPageId = await saveToNotion(parsed, env);

    // React with ✅
    await setReaction(env, chatId, message.message_id, '✅');

    // Background tasks: screenshot for links + AI analysis + storage channel for large files
    if (notionPageId) {
      ctx.waitUntil((async () => {
        // For links: capture screenshot, send to TG silently, update Notion with file_id
        if (parsed.type === 'link' && parsed.sourceUrl && !parsed.fileId) {
          const fileId = await captureAndUploadScreenshot(parsed.sourceUrl, chatId, env);
          if (fileId) {
            parsed.fileId = fileId;
            // Patch Notion with the screenshot file_id
            await fetch(`https://api.notion.com/v1/pages/${notionPageId}`, {
              method: 'PATCH',
              headers: {
                'Authorization': `Bearer ${env.NOTION_TOKEN}`,
                'Notion-Version': '2022-06-28',
                'Content-Type': 'application/json'
              },
              body: JSON.stringify({
                properties: {
                  'File ID': { rich_text: [{ text: { content: fileId } }] }
                }
              })
            });
          }
        }

        // For large files (>20MB) or unknown document types: forward to storage channel
        const isLargeFile = parsed.fileSize && parsed.fileSize > 20 * 1024 * 1024;
        const isDocFile = parsed.type === 'document' || parsed.mediaType === 'document';
        if ((isLargeFile || isDocFile) && env.STORAGE_CHANNEL_ID) {
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

// ─── Helpers ────────────────────────────────────────────────────────────────

function normalizeUrl(url) {
  if (!url) return url;
  if (!/^https?:\/\//i.test(url)) return 'https://' + url;
  return url;
}

function escapeHtmlBot(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function formatTextWithEntities(text, entities) {
  if (!entities || entities.length === 0) return text;
  // Only keep entities we render as HTML tags; skip hashtag, mention, etc.
  const tagMap = {
    bold: 'b', italic: 'i', underline: 'u', strikethrough: 's',
    code: 'code', pre: 'pre',
  };
  const htmlEntities = entities.filter(e =>
    tagMap[e.type] || e.type === 'text_link' || e.type === 'url'
  );
  // Collect boundary points where entities open/close
  const events = []; // { pos, type: 'open'|'close', entity }
  for (const e of htmlEntities) {
    events.push({ pos: e.offset, type: 'open', entity: e });
    events.push({ pos: e.offset + e.length, type: 'close', entity: e });
  }
  // Sort: by position, then close before open at same position
  events.sort((a, b) => a.pos - b.pos || (a.type === 'close' ? -1 : 1));

  let result = '';
  let cursor = 0;
  const activeStack = []; // entities currently open

  for (const ev of events) {
    // Emit text from cursor to this event position
    if (ev.pos > cursor) {
      result += escapeHtmlBot(text.substring(cursor, ev.pos));
      cursor = ev.pos;
    }
    if (ev.type === 'open') {
      const e = ev.entity;
      if (e.type === 'text_link') {
        result += `<a href="${escapeHtmlBot(e.url)}">`;
      } else if (e.type === 'url') {
        const urlText = text.substring(e.offset, e.offset + e.length);
        result += `<a href="${escapeHtmlBot(urlText)}">`;
      } else {
        result += `<${tagMap[e.type]}>`;
      }
      activeStack.push(e);
    } else {
      const e = ev.entity;
      if (e.type === 'text_link' || e.type === 'url') {
        result += '</a>';
      } else {
        result += `</${tagMap[e.type]}>`;
      }
      const idx = activeStack.lastIndexOf(e);
      if (idx !== -1) activeStack.splice(idx, 1);
    }
  }
  // Emit remaining text
  if (cursor < text.length) {
    result += escapeHtmlBot(text.substring(cursor));
  }
  return result;
}

// ─── Message Parser ──────────────────────────────────────────────────────────

function parseMessage(message, env) {
  const result = {
    type: 'quote',       // default
    fileId: null,
    thumbnailFileId: null,
    content: '',
    contentHasHtml: false,
    sourceUrl: null,
    caption: message.caption || '',
    messageId: message.message_id,
    mediaType: null,      // 'image' | 'gif' | 'video' | 'pdf' | 'document' | null
    mediaGroupId: message.media_group_id || null,
  };

  // Extract forward origin info
  if (message.forward_origin) {
    const origin = message.forward_origin;
    if (origin.type === 'channel' && origin.chat?.username) {
      result.sourceUrl = `https://t.me/${origin.chat.username}/${origin.message_id}`;
      if (origin.chat.title) result.channelTitle = origin.chat.title;
    } else if (origin.type === 'channel' && origin.chat?.title) {
      // Private channel (no username) — save title only
      result.channelTitle = origin.chat.title;
    } else if (origin.type === 'user') {
      // Skip author for messages forwarded from the bot owner (self)
      const isSelf = env?.ALLOWED_CHAT_ID && String(origin.sender_user?.id) === env.ALLOWED_CHAT_ID;
      if (!isSelf) {
        const username = origin.sender_user?.username;
        if (username) {
          // User has public username — build clickable t.me link
          const name = [origin.sender_user.first_name, origin.sender_user.last_name]
            .filter(Boolean).join(' ');
          if (name) result.forwardFrom = name;
          result.sourceUrl = `https://t.me/${username}`;
        }
        // No username → privacy settings hide it; skip label entirely
      }
    }
  }

  const isForward = !!message.forward_origin;
  const caption = result.caption;
  // A post with caption text is a tgpost (rich content: media + text together)
  const hasSubstantialCaption = caption && caption.trim().length > 0;

  // Photo (array of sizes, take largest)
  if (message.photo && message.photo.length > 0) {
    result.fileId = message.photo[message.photo.length - 1].file_id;
    result.mediaType = 'image';
    if (isForward || hasSubstantialCaption) {
      result.type = 'tgpost';
      const captionEntities = message.caption_entities || [];
      result.content += captionEntities.length
        ? formatTextWithEntities(caption, captionEntities)
        : caption;
      result.contentHasHtml = captionEntities.length > 0;
    } else {
      result.type = 'image';
      result.content += caption;
    }
    return result;
  }

  // Animation (GIF)
  if (message.animation) {
    result.fileId = message.animation.file_id;
    result.mediaType = 'gif';
    if (isForward || hasSubstantialCaption) {
      result.type = 'tgpost';
      const captionEntities = message.caption_entities || [];
      result.content += captionEntities.length
        ? formatTextWithEntities(caption, captionEntities)
        : caption;
      result.contentHasHtml = captionEntities.length > 0;
    } else {
      result.type = 'gif';
      result.content += caption;
    }
    return result;
  }

  // Video
  if (message.video) {
    result.fileId = message.video.file_id;
    result.mediaType = 'video';
    if (message.video.file_size) result.fileSize = message.video.file_size;
    if (message.video.thumbnail?.file_id) {
      result.thumbnailFileId = message.video.thumbnail.file_id;
    }
    if (isForward || hasSubstantialCaption) {
      result.type = 'tgpost';
      const captionEntities = message.caption_entities || [];
      result.content += captionEntities.length
        ? formatTextWithEntities(caption, captionEntities)
        : caption;
      result.contentHasHtml = captionEntities.length > 0;
    } else {
      result.type = 'video';
      result.content += caption;
    }
    return result;
  }

  // Document (PDF, image-as-file, or other)
  if (message.document) {
    const mime = message.document.mime_type || '';
    const isImageDoc = mime.startsWith('image/');
    const docType = mime === 'application/pdf' ? 'pdf' : (isImageDoc ? 'image' : 'document');
    result.fileId = message.document.file_id;
    result.fileName = message.document.file_name || '';
    if (message.document.file_size) result.fileSize = message.document.file_size;
    if (message.document.thumbnail?.file_id) {
      result.thumbnailFileId = message.document.thumbnail.file_id;
    } else if (message.document.thumb?.file_id) {
      result.thumbnailFileId = message.document.thumb.file_id;
    }
    if (isImageDoc) {
      // Image sent as document — treat like a photo
      if (isForward || hasSubstantialCaption) {
        result.type = 'tgpost';
        result.mediaType = 'image';
        const captionEntities = message.caption_entities || [];
        result.content += captionEntities.length
          ? formatTextWithEntities(caption, captionEntities)
          : caption;
        result.contentHasHtml = captionEntities.length > 0;
      } else {
        result.type = 'image';
        result.content += caption;
      }
      return result;
    }
    if (isForward || hasSubstantialCaption) {
      result.type = 'tgpost';
      result.mediaType = docType;
      const captionEntities = message.caption_entities || [];
      result.content += captionEntities.length
        ? formatTextWithEntities(caption, captionEntities)
        : caption;
      result.contentHasHtml = captionEntities.length > 0;
    } else {
      result.type = docType;
      result.content += caption || message.document.file_name || '';
    }
    return result;
  }

  // Video note (round video message)
  if (message.video_note) {
    result.fileId = message.video_note.file_id;
    if (message.video_note.thumbnail?.file_id) {
      result.thumbnailFileId = message.video_note.thumbnail.file_id;
    }
    result.audioDuration = message.video_note.duration || 0;
    if (isForward || hasSubstantialCaption) {
      result.type = 'tgpost';
      result.mediaType = 'video_note';
      const captionEntities = message.caption_entities || [];
      result.content += captionEntities.length
        ? formatTextWithEntities(caption, captionEntities)
        : caption;
      result.contentHasHtml = captionEntities.length > 0;
    } else {
      result.type = 'video_note';
      result.content += caption;
    }
    return result;
  }

  // Voice message
  if (message.voice) {
    result.fileId = message.voice.file_id;
    result.audioDuration = message.voice.duration || 0;
    if (isForward || hasSubstantialCaption) {
      result.type = 'tgpost';
      result.mediaType = 'voice';
      const captionEntities = message.caption_entities || [];
      result.content += captionEntities.length
        ? formatTextWithEntities(caption, captionEntities)
        : caption;
      result.contentHasHtml = captionEntities.length > 0;
    } else {
      result.type = 'voice';
      result.content += caption;
    }
    return result;
  }

  // Audio file (mp3, wav, etc.)
  if (message.audio) {
    result.fileId = message.audio.file_id;
    result.mediaType = 'audio';
    if (message.audio.thumbnail?.file_id) {
      result.thumbnailFileId = message.audio.thumbnail.file_id;
    }
    result.audioTitle = message.audio.title || '';
    result.audioPerformer = message.audio.performer || '';
    result.audioDuration = message.audio.duration || 0;
    result.audioFileName = message.audio.file_name || '';
    if (isForward || hasSubstantialCaption) {
      result.type = 'tgpost';
      const captionEntities = message.caption_entities || [];
      result.content += captionEntities.length
        ? formatTextWithEntities(caption, captionEntities)
        : caption;
      result.contentHasHtml = captionEntities.length > 0;
    } else {
      result.type = 'audio';
      result.content += caption || [message.audio.performer, message.audio.title].filter(Boolean).join(' — ') || message.audio.file_name || '';
    }
    return result;
  }

  // Text message
  if (message.text) {
    const allEntities = message.entities || [];
    const urlEntities = allEntities.filter(e => e.type === 'url');

    if (isForward) {
      // Forwarded text message → tgpost with entity formatting
      result.type = 'tgpost';
      result.content += allEntities.length
        ? formatTextWithEntities(message.text, allEntities)
        : message.text;
      result.contentHasHtml = allEntities.length > 0;
      // Extract first URL as sourceUrl if not already set from forward origin
      if (urlEntities.length > 0 && !result.sourceUrl) {
        result.sourceUrl = normalizeUrl(message.text.substring(
          urlEntities[0].offset,
          urlEntities[0].offset + urlEntities[0].length
        ));
      }
    } else if (urlEntities.length > 0) {
      const url = message.text.substring(
        urlEntities[0].offset,
        urlEntities[0].offset + urlEntities[0].length
      );
      result.type = 'link';
      result.sourceUrl = result.sourceUrl || normalizeUrl(url);
      // Content = text without the URL itself
      result.content += message.text.replace(url, '').trim();
    } else {
      // Telegram doesn't create url entities for bare domains (e.g. "google.com")
      // Detect them manually: word with dot + TLD, no spaces
      const bareUrlMatch = message.text.match(/^([\w-]+(?:\.[\w-]+)+(?:\/\S*)?)(?:\s|$)/);
      if (bareUrlMatch) {
        const bareUrl = bareUrlMatch[1];
        result.type = 'link';
        result.sourceUrl = normalizeUrl(bareUrl);
        result.content += message.text.replace(bareUrl, '').trim();
      } else {
        result.type = 'quote';
        result.content += message.text;
      }
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

  const { type, sourceUrl, content, fileId, mediaType } = parsed;
  const domain = parsed.channelTitle || parsed.forwardFrom || (sourceUrl
    ? sourceUrl.replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0]
    : 'telegram');

  const properties = {
    'URL': { title: [{ text: { content: domain } }] },
    'Type': { select: { name: type } },
    'Date': { date: { start: new Date().toISOString() } }
  };

  if (sourceUrl) properties['Source URL'] = { url: sourceUrl };
  if (content) properties['Content'] = { rich_text: [{ text: { content: content.slice(0, 2000) } }] };
  if (fileId) properties['File ID'] = { rich_text: [{ text: { content: fileId } }] };

  // Store ai_data for tgpost and video items
  const aiDataInit = {};
  if (parsed.mediaType) aiDataInit.mediaType = parsed.mediaType;
  if (parsed.thumbnailFileId) aiDataInit.thumbnailFileId = parsed.thumbnailFileId;
  if (parsed.contentHasHtml) aiDataInit.htmlContent = true;
  if (parsed.mediaGroupId) aiDataInit.mediaGroupId = parsed.mediaGroupId;
  if (parsed.channelTitle) aiDataInit.channelTitle = parsed.channelTitle;
  if (parsed.forwardFrom) aiDataInit.forwardFrom = parsed.forwardFrom;
  if (parsed.audioTitle) aiDataInit.audioTitle = parsed.audioTitle;
  if (parsed.audioPerformer) aiDataInit.audioPerformer = parsed.audioPerformer;
  if (parsed.audioDuration) aiDataInit.audioDuration = parsed.audioDuration;
  if (parsed.audioFileName) aiDataInit.audioFileName = parsed.audioFileName;
  if (parsed.fileName) aiDataInit.fileName = parsed.fileName;
  if (parsed.fileSize) aiDataInit.fileSize = parsed.fileSize;
  if (Object.keys(aiDataInit).length) {
    properties['ai_data'] = {
      rich_text: [{ text: { content: JSON.stringify(aiDataInit) } }]
    };
  }

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

// ─── Storage Channel (for large files >20MB) ────────────────────────────────

async function forwardToStorageChannel(message, chatId, notionPageId, parsed, env) {
  try {
    // Copy the message to the storage channel (silent, no "forwarded from" header)
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

    // Build the public URL: https://t.me/channelname/messageId
    // STORAGE_CHANNEL_ID can be "@channelname" or numeric id
    // For the URL we need just the username (without @)
    const rawId = String(env.STORAGE_CHANNEL_ID);
    const channelUsername = rawId.startsWith('@') ? rawId.slice(1) : rawId;
    const copiedMsgId = data.result.message_id;
    const storageUrl = `https://t.me/${channelUsername}/${copiedMsgId}`;

    // Patch Notion: add storageUrl to ai_data and set Source URL if empty
    const patchProps = {};

    // Set Source URL only if not already set (don't override real source URLs)
    if (!parsed.sourceUrl) {
      patchProps['Source URL'] = { url: storageUrl };
    }

    // Merge storageUrl into existing ai_data
    // Read current ai_data to preserve all fields
    const currentAiData = {};
    if (parsed.mediaType) currentAiData.mediaType = parsed.mediaType;
    if (parsed.thumbnailFileId) currentAiData.thumbnailFileId = parsed.thumbnailFileId;
    if (parsed.contentHasHtml) currentAiData.htmlContent = true;
    if (parsed.mediaGroupId) currentAiData.mediaGroupId = parsed.mediaGroupId;
    if (parsed.channelTitle) currentAiData.channelTitle = parsed.channelTitle;
    if (parsed.forwardFrom) currentAiData.forwardFrom = parsed.forwardFrom;
    if (parsed.audioTitle) currentAiData.audioTitle = parsed.audioTitle;
    if (parsed.audioPerformer) currentAiData.audioPerformer = parsed.audioPerformer;
    if (parsed.audioDuration) currentAiData.audioDuration = parsed.audioDuration;
    if (parsed.audioFileName) currentAiData.audioFileName = parsed.audioFileName;
    if (parsed.fileName) currentAiData.fileName = parsed.fileName;
    if (parsed.fileSize) currentAiData.fileSize = parsed.fileSize;
    currentAiData.storageUrl = storageUrl;

    // Store on parsed so analyzeAndPatch (which runs after) preserves it
    parsed.storageUrl = storageUrl;

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

// ─── Screenshot Capture ──────────────────────────────────────────────────────

async function captureAndUploadScreenshot(url, chatId, env) {
  const normalizedUrl = normalizeUrl(url);
  const screenshotUrl = `https://image.thum.io/get/width/1280/crop/960/noanimate/${normalizedUrl}`;
  const MAX_RETRIES = 3;
  const RETRY_DELAYS = [2000, 5000, 10000]; // 2s, 5s, 10s

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

      // thum.io sometimes returns HTML (error page, queue page) instead of image
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

      // Send to Telegram silently to get file_id
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

// ─── AI Analysis ─────────────────────────────────────────────────────────────

const AI_PROMPT_IMAGE = `Analyze this photo/image and return ONLY valid JSON, no other text:
{
  "content_type": null,
  "content_type_secondary": null,
  "title": "",
  "description": "detailed description: what is shown, composition, who/what is where, context",
  "materials": [],
  "color_palette": null,
  "color_subject": null,
  "color_top3": [],
  "text_on_image": "",
  "price": "",
  "author": "",
  "tweet_text": ""
}

Rules:
- content_type: This is a photo sent directly (not a link). The ONLY allowed non-null value is "product".
  *** CRITICAL RULE — READ CAREFULLY ***
  A visible price is the SINGLE MOST IMPORTANT factor for "product" classification.
  Set "product" ONLY when BOTH conditions are met:
    1. The image shows a purchasable item (clothing, shoes, furniture, gadgets, etc.)
    2. A price tag or price number is CLEARLY VISIBLE somewhere in the image (e.g. "$49", "€120", "¥3500")
  If there is NO visible price anywhere in the image → content_type MUST be null. NO EXCEPTIONS.
  Examples that are NOT "product" (because no price is shown):
    - A t-shirt photographed on a flat surface — null
    - A person wearing clothing — null
    - A fashion lookbook or editorial photo — null
    - A product photo without any price text — null
    - A brand showcase or catalog image — null
  The presence of clothing, shoes, or any item alone does NOT make it a product. Price is mandatory.
  Do NOT set "video", "article", or "xpost" — these are impossible for a direct photo.
- content_type_secondary: null for direct photos (not applicable).
- title: the single most important headline or title visible on the screen. Extract the primary heading/title text — the biggest, most prominent text that describes what this content is about. Keep it short (under 80 chars). If no clear title/headline exists, empty string.
- description: 2-4 sentences in English, describe composition, objects, people, mood, setting. Be specific.
- materials: list of textures/materials visible (e.g. ["leather", "denim"]). Empty array if none.
- COLOR TAGS — allowed values for all color fields: "red", "violet", "pink", "yellow", "green", "blue", "brown", "white", "black", "bw".
  - "red" = true reds, scarlet, crimson, burgundy, maroon, dark red
  - "violet" = purple, violet, lavender, indigo, magenta-leaning purple
  - "pink" = pink, magenta, rose, fuchsia, coral-pink
  - "yellow" = yellow, gold, amber, warm orange, mustard
  - "green" = green, emerald, olive, lime, teal-leaning green, mint
  - "blue" = blue, navy, cyan, teal, sky blue, cobalt
  - "brown" = brown, beige, tan, khaki, sand, chocolate, caramel
  - "white" = white, cream, off-white, very light gray
  - "black" = black, very dark gray, charcoal, near-black
  - "bw" = ONLY for genuine black-and-white or monochrome photography/imagery with no color
- color_palette: the single OVERALL dominant color of the entire image by area. Null if unclear.
- color_subject: the color of the MAIN SUBJECT/OBJECT (the thing the photo is about, not the background). For product photos — the product color. For portraits — clothing or key object color. Null if no clear subject or same as color_palette.
- color_top3: top 1-3 most prominent colors ordered by area coverage (largest first). Only include colors that cover a meaningful portion of the image. Do NOT pad to 3 — if the image is mostly one color, return just ["black"]. Empty array if no image.
  IMPORTANT for "black" and "white": Only include "black" or "white" in color_top3 if the image is TRULY DOMINATED by that color — i.e., the image looks dark/black or light/white overall. If the image has vivid chromatic colors (reds, blues, greens, etc.) that catch the eye, do NOT include "black" or "white" even if there are dark shadows or light highlights. A colorful image on a black background should list the chromatic colors, NOT "black". Only use "black"/"white" for images that genuinely LOOK black/white/dark/light to a human viewer.
- text_on_image: transcribe ALL visible text verbatim, preserving original language. Empty string if no text.
- price: the main product price with currency symbol (e.g. "$129"). ONLY extract the price if there is clearly ONE main product in focus AND its price is prominently displayed next to it. If the screenshot shows a gallery, listing, or grid of multiple equivalent products (e.g. a category page on Farfetch, SSENSE, etc.) — set price to empty string even if individual prices are visible. The rule: no single obvious hero product with one clear price = empty string.
- author: empty string.
- tweet_text: empty string.
- All fields must be present. No markdown, no extra fields.`;

const AI_PROMPT_LINK = `Analyze this saved link and return ONLY valid JSON, no other text:
{
  "content_type": null,
  "content_type_secondary": null,
  "title": "",
  "description": "detailed description: what is shown, composition, who/what is where, context",
  "materials": [],
  "color_palette": null,
  "color_subject": null,
  "color_top3": [],
  "text_on_image": "",
  "price": "",
  "author": "",
  "tweet_text": ""
}

Rules:
- content_type: set ONLY if confident, otherwise null. Must be one of:
  - "article" — URL is clearly an article/essay/instruction/journalism piece. NOT for book/document viewers with page navigation (use "pdf" instead)
  - "video" — URL is youtube.com/youtu.be/vimeo.com/instagram. OR screenshot shows video indicators: mute/unmute speaker icon, progress bar + playhead, play button overlay. Instagram posts with a mute/unmute icon are ALWAYS video.
  - "product" — the page shows a purchasable product WITH A VISIBLE PRICE. A price (e.g. "$49", "€120", "¥3500") MUST be clearly visible on the screenshot. If there is no price anywhere on the page — do NOT set "product", set null instead. A portfolio site, brand lookbook, design showcase, Are.na board, or any page showing items without prices is NOT "product". Only set "product" for actual e-commerce/store pages where a price is displayed.
  - "xpost" — URL contains x.com or twitter.com
  - "tool" — URL is a digital tool, app, SaaS service, template marketplace, font foundry/specimen, browser extension, CLI utility, framework/library page, AI tool, online generator/converter, or a showcase/launch post ("I made X", "I built X", Product Hunt, etc.). IMPORTANT: "tool" means the TOOL ITSELF is being saved (its homepage, landing page, or launch post). If the URL points to USER-GENERATED CONTENT hosted on a platform (e.g. a specific board/channel on Are.na, a specific project on Behance, a specific collection on Pinterest, a post on a forum, a user's profile page) — that is NOT "tool". The platform is just a host; what matters is the content being viewed.
  - "pdf" — screenshot shows a document/book being viewed. This includes: browser PDF viewer, Google Drive PDF preview, embedded PDF, Internet Archive book reader, any online document/book viewer with page navigation. Look for: PDF toolbar/controls, page navigation (e.g. "Page 1/141"), ".pdf" in URL bar or title, document-style layout with page borders, book covers being displayed in a reader interface, digital library/archive interfaces showing downloadable documents. Set "pdf" (NOT "article") when the page is displaying a PDF file, book, or document in a viewer/reader — even if the viewer is not a standard browser PDF viewer.
- content_type_secondary: If the content fits TWO categories, set the secondary one here. Same allowed values as content_type. Must be DIFFERENT from content_type (or null). Common cases:
  - xpost about a tool/app/SaaS → content_type="xpost", content_type_secondary="tool"
  - xpost about a product with visible price → content_type="xpost", content_type_secondary="product" (only if price is visible!)
  - article reviewing a tool → content_type="article", content_type_secondary="tool"
  - video about a product → content_type="video", content_type_secondary="product"
  Set null if only one category applies.
- title: the single most important headline or title visible on the screen. Extract the primary heading/title text — the biggest, most prominent text that describes what this content is about. For articles — the article headline. For products — the product name. For tools — the tool/app name. For PDFs — the document title. Keep it short (under 80 chars). If no clear title/headline exists, empty string.
- description: 2-4 sentences in English, describe composition, objects, people, mood, setting. Be specific.
- materials: list of textures/materials visible (e.g. ["leather", "denim"]). Empty array if none or no image.
- COLOR TAGS — allowed values for all color fields: "red", "violet", "pink", "yellow", "green", "blue", "brown", "white", "black", "bw".
  - "red" = true reds, scarlet, crimson, burgundy, maroon, dark red
  - "violet" = purple, violet, lavender, indigo, magenta-leaning purple
  - "pink" = pink, magenta, rose, fuchsia, coral-pink
  - "yellow" = yellow, gold, amber, warm orange, mustard
  - "green" = green, emerald, olive, lime, teal-leaning green, mint
  - "blue" = blue, navy, cyan, teal, sky blue, cobalt
  - "brown" = brown, beige, tan, khaki, sand, chocolate, caramel
  - "white" = white, cream, off-white, very light gray
  - "black" = black, very dark gray, charcoal, near-black
  - "bw" = ONLY for genuine black-and-white or monochrome photography/imagery with no color
- color_palette: the single OVERALL dominant color of the entire screenshot/image including backgrounds, UI, everything. For websites/apps — include the site background color. A dark-themed site = "black". A white site with a small red button = "white". Null if no image.
- color_subject: the color of the MAIN SUBJECT/OBJECT only, ignoring backgrounds and UI chrome. For product pages — the product itself. For tools/apps — the key accent/brand color. For articles — the hero image dominant color. Null if no clear subject or same as color_palette.
- color_top3: top 1-3 most prominent colors ordered by area coverage (largest first). Include ALL visually significant colors — backgrounds, UI, objects. Do NOT pad to 3 — if the image is mostly one color, return just ["black"]. Empty array if no image.
  IMPORTANT for "black" and "white": Only include "black" or "white" in color_top3 if the image is TRULY DOMINATED by that color — i.e., the image looks dark/black or light/white overall. If the image has vivid chromatic colors (reds, blues, greens, etc.) that catch the eye, do NOT include "black" or "white" even if there are dark shadows or light highlights. A colorful website on a white background should list the chromatic colors, NOT "white". Only use "black"/"white" for images that genuinely LOOK black/white/dark/light to a human viewer.
- text_on_image: transcribe ALL visible text verbatim, preserving original language. Empty string if no text or no image.
- price: the main product price with currency symbol (e.g. "$129", "€49.99"). ONLY extract the price if there is clearly ONE main product in focus AND its price is prominently displayed next to it. If the screenshot shows a gallery, listing, or grid of multiple equivalent products (e.g. a category page on Farfetch, SSENSE, etc.) — set price to empty string even if individual prices are visible. The rule: no single obvious hero product with one clear price = empty string.
- author: for xpost — @handle from screenshot. Empty string otherwise.
- tweet_text: for xpost — full tweet text from screenshot. Empty string otherwise.
- All fields must be present. No markdown, no extra fields.`;

const AI_PROMPT_PDF = `Analyze this PDF document and return ONLY valid JSON, no other text:
{
  "content_type": "pdf",
  "content_type_secondary": null,
  "title": "",
  "description": "detailed description: what the document is about, key topics, structure",
  "materials": [],
  "color_palette": null,
  "color_subject": null,
  "color_top3": [],
  "text_on_image": "",
  "price": "",
  "author": "",
  "tweet_text": ""
}

Rules:
- content_type: always "pdf" for PDF documents.
- content_type_secondary: null (unless the PDF is clearly about a product with price, tool, etc.).
- title: the document title — extract from the first page heading, cover, or metadata. Keep it short (under 80 chars).
- description: 2-4 sentences in English summarizing the document content, purpose, and key topics.
- text_on_image: extract the first ~500 characters of visible text from the document.
- author: document author if visible on cover/title page. Empty string otherwise.
- color_palette, color_subject, color_top3: analyze the visual appearance of the document pages (cover design, diagrams, etc.). Null/empty if plain text.
- All fields must be present. No markdown, no extra fields.`;

const AI_PROMPT_TRANSCRIBE = `Transcribe this audio message word-for-word. Return ONLY the transcript text, nothing else. If the audio contains no speech or is unintelligible, return an empty string. Do not add any commentary, timestamps, or formatting — just the raw spoken words.`;

const AI_PROMPT_AUDIO = `Analyze this audio track cover art image and return ONLY valid JSON, no other text:
{
  "color_subject": null,
  "color_palette": null,
  "color_top3": [],
  "title": "",
  "description": ""
}

Rules:
- COLOR TAGS — allowed values: "red", "violet", "pink", "yellow", "green", "blue", "brown", "white", "black", "bw", "orange", "purple".
- color_subject: the single dominant color of the MAIN SUBJECT on the cover art. This color will be used as the accent for the audio player UI. Pick the most visually prominent color. Null only if genuinely unclear.
- color_palette: the overall dominant color of the entire cover by area. Null if unclear.
- color_top3: top 1-3 most prominent colors ordered by area coverage (largest first). Do NOT pad — if mostly one color, return just that one.
- title: if there is text visible on the cover art that looks like a track/album title, extract it. Empty string if none.
- description: brief 1-2 sentence description of what the cover art depicts. Empty string if nothing notable.
- All fields must be present. No markdown, no extra fields.`;

async function transcribeAndPatch(parsed, notionPageId, env) {
  try {
    const fileRes = await fetch(
      `https://api.telegram.org/bot${env.BOT_TOKEN}/getFile?file_id=${parsed.fileId}`
    );
    const fileData = await fileRes.json();
    if (!fileData.ok) return;

    const filePath = fileData.result.file_path;
    const audioUrl = `https://api.telegram.org/file/bot${env.BOT_TOKEN}/${filePath}`;
    const ext = filePath.split('.').pop()?.toLowerCase();
    const mimeMap = { oga: 'audio/ogg', ogg: 'audio/ogg', mp3: 'audio/mpeg', wav: 'audio/wav', m4a: 'audio/mp4' };
    const mime = mimeMap[ext] || 'audio/ogg';

    const base64 = await fetchBase64(audioUrl);
    const transcript = await callGemini(AI_PROMPT_TRANSCRIBE, base64, env, mime);
    if (!transcript || !transcript.trim()) return;

    // Build ai_data preserving existing fields
    const aiData = {};
    if (parsed.mediaType) aiData.mediaType = parsed.mediaType;
    if (parsed.thumbnailFileId) aiData.thumbnailFileId = parsed.thumbnailFileId;
    if (parsed.channelTitle) aiData.channelTitle = parsed.channelTitle;
    if (parsed.forwardFrom) aiData.forwardFrom = parsed.forwardFrom;
    if (parsed.audioDuration) aiData.audioDuration = parsed.audioDuration;
    if (parsed.fileSize) aiData.fileSize = parsed.fileSize;
    if (parsed.storageUrl) aiData.storageUrl = parsed.storageUrl;
    aiData.transcript = transcript.trim();

    const properties = {
      'ai_analyzed': { checkbox: true },
      'ai_data': {
        rich_text: [{ text: { content: JSON.stringify(aiData).slice(0, 2000) } }]
      }
    };

    await fetch(`https://api.notion.com/v1/pages/${notionPageId}`, {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${env.NOTION_TOKEN}`,
        'Notion-Version': '2022-06-28',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ properties })
    });
  } catch (e) {
    console.warn('Transcription failed:', e.message);
  }
}

async function analyzeAudioCover(parsed, notionPageId, env, provider) {
  // Read existing ai_data from Notion to avoid overwriting fields set by other steps
  let aiData = {};
  try {
    const pageRes = await fetch(`https://api.notion.com/v1/pages/${notionPageId}`, {
      headers: {
        'Authorization': `Bearer ${env.NOTION_TOKEN}`,
        'Notion-Version': '2022-06-28'
      }
    });
    if (pageRes.ok) {
      const pageData = await pageRes.json();
      const existingStr = pageData.properties?.['ai_data']?.rich_text?.[0]?.text?.content || '{}';
      try { aiData = JSON.parse(existingStr); } catch {}
    }
  } catch (e) {
    console.warn('Failed to read existing ai_data:', e.message);
  }
  // Ensure key fields from parsed are present
  if (parsed.mediaType && !aiData.mediaType) aiData.mediaType = parsed.mediaType;
  if (parsed.thumbnailFileId && !aiData.thumbnailFileId) aiData.thumbnailFileId = parsed.thumbnailFileId;
  if (parsed.channelTitle && !aiData.channelTitle) aiData.channelTitle = parsed.channelTitle;
  if (parsed.forwardFrom && !aiData.forwardFrom) aiData.forwardFrom = parsed.forwardFrom;
  if (parsed.audioTitle && !aiData.audioTitle) aiData.audioTitle = parsed.audioTitle;
  if (parsed.audioPerformer && !aiData.audioPerformer) aiData.audioPerformer = parsed.audioPerformer;
  if (parsed.audioDuration && !aiData.audioDuration) aiData.audioDuration = parsed.audioDuration;
  if (parsed.audioFileName && !aiData.audioFileName) aiData.audioFileName = parsed.audioFileName;
  if (parsed.fileSize && !aiData.fileSize) aiData.fileSize = parsed.fileSize;
  if (parsed.storageUrl && !aiData.storageUrl) aiData.storageUrl = parsed.storageUrl;

  // If cover art exists, analyze it for color
  if (parsed.thumbnailFileId) {
    try {
      const fileRes = await fetch(
        `https://api.telegram.org/bot${env.BOT_TOKEN}/getFile?file_id=${parsed.thumbnailFileId}`
      );
      const fileData = await fileRes.json();
      if (fileData.ok) {
        const filePath = fileData.result.file_path;
        const imgUrl = `https://api.telegram.org/file/bot${env.BOT_TOKEN}/${filePath}`;

        const context = [
          parsed.audioTitle ? `Track: ${parsed.audioTitle}` : '',
          parsed.audioPerformer ? `Artist: ${parsed.audioPerformer}` : '',
          parsed.content ? `Caption: ${parsed.content.slice(0, 200)}` : ''
        ].filter(Boolean).join('\n');
        const prompt = context
          ? `${AI_PROMPT_AUDIO}\n\nAdditional context:\n${context}`
          : AI_PROMPT_AUDIO;

        let responseText = null;
        if (provider === 'google') {
          const base64 = await fetchBase64(imgUrl);
          responseText = await callGemini(prompt, base64, env, 'image/jpeg');
        } else {
          responseText = await callAnthropic([{
            role: 'user',
            content: [
              { type: 'image', source: { type: 'url', url: imgUrl } },
              { type: 'text', text: prompt }
            ]
          }], env);
        }

        if (responseText) {
          const cleaned = responseText.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
          try {
            const result = JSON.parse(cleaned);
            if (result.color_subject) aiData.color_subject = result.color_subject;
            if (result.color_palette) aiData.color_palette = result.color_palette;
            if (result.color_top3?.length) aiData.color_top3 = result.color_top3;
          } catch {
            console.warn('Audio cover AI parse error:', cleaned.slice(0, 100));
          }
        }
      }
    } catch (e) {
      console.warn('Audio cover analysis failed:', e.message);
    }
  }

  // Patch Notion
  const properties = {
    'ai_analyzed': { checkbox: true },
    'ai_data': {
      rich_text: [{ text: { content: JSON.stringify(aiData).slice(0, 2000) } }]
    }
  };

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

async function analyzeAndPatch(parsed, notionPageId, env) {
  const provider = env.AI_PROVIDER || 'google';

  // Voice / video_note → transcribe audio via Gemini
  const isVoice = ['voice', 'video_note'].includes(parsed.type)
    || ['voice', 'video_note'].includes(parsed.mediaType);
  if (isVoice && parsed.fileId && provider === 'google') {
    await transcribeAndPatch(parsed, notionPageId, env);
    return;
  }
  // Audio files → analyze cover art if available
  const isAudioFile = parsed.type === 'audio' || parsed.mediaType === 'audio';
  if (isAudioFile) {
    await analyzeAudioCover(parsed, notionPageId, env, provider);
    return;
  }

  const isPdf = parsed.type === 'pdf' || parsed.mediaType === 'pdf';
  const isVideo = parsed.type === 'video' || parsed.mediaType === 'video';
  const isDirectImage = parsed.type === 'image' || parsed.type === 'gif'
    || (parsed.type === 'tgpost' && (parsed.mediaType === 'image' || parsed.mediaType === 'gif'))
    || isVideo; // video thumbnail is an image
  let responseText = null;

  // For video or large files: use thumbnail instead of full file (which may exceed 20MB getFile limit)
  const isLargeFile = parsed.fileSize && parsed.fileSize > 20 * 1024 * 1024;
  const fileIdForAI = (isVideo || isLargeFile) && parsed.thumbnailFileId ? parsed.thumbnailFileId : parsed.fileId;

  // PDF files — send as application/pdf to Gemini (supports native PDF)
  if (isPdf && parsed.fileId) {
    try {
      const fileRes = await fetch(
        `https://api.telegram.org/bot${env.BOT_TOKEN}/getFile?file_id=${parsed.fileId}`
      );
      const fileData = await fileRes.json();
      if (fileData.ok) {
        const filePath = fileData.result.file_path;
        const pdfUrl = `https://api.telegram.org/file/bot${env.BOT_TOKEN}/${filePath}`;
        if (provider === 'google') {
          const base64 = await fetchBase64(pdfUrl);
          responseText = await callGemini(AI_PROMPT_PDF, base64, env, 'application/pdf');
        } else {
          // Claude supports PDF via document content type
          const base64 = await fetchBase64(pdfUrl);
          responseText = await callAnthropic([{
            role: 'user',
            content: [
              { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: base64 } },
              { type: 'text', text: AI_PROMPT_PDF }
            ]
          }], env);
        }
      }
    } catch (e) {
      console.warn('PDF AI analysis failed:', e.message);
    }
  }

  // For items with file_id (non-PDF) — fetch image from Telegram and send to AI
  if (!responseText && fileIdForAI && !isPdf) {
    const fileRes = await fetch(
      `https://api.telegram.org/bot${env.BOT_TOKEN}/getFile?file_id=${fileIdForAI}`
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

  // Hard guard: tgpost type is NEVER overridden by AI
  if (parsed.type === 'tgpost') {
    aiResult.content_type = null;
  }
  // Direct TG image can only be "product" or null
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

  // Preserve existing ai_data fields and merge AI results
  const aiDataPayload = {};
  if (parsed.mediaType) aiDataPayload.mediaType = parsed.mediaType;
  if (parsed.thumbnailFileId) aiDataPayload.thumbnailFileId = parsed.thumbnailFileId;
  if (parsed.contentHasHtml) aiDataPayload.htmlContent = true;
  if (parsed.mediaGroupId) aiDataPayload.mediaGroupId = parsed.mediaGroupId;
  if (parsed.channelTitle) aiDataPayload.channelTitle = parsed.channelTitle;
  if (parsed.forwardFrom) aiDataPayload.forwardFrom = parsed.forwardFrom;
  if (parsed.fileSize) aiDataPayload.fileSize = parsed.fileSize;
  if (parsed.audioFileName) aiDataPayload.audioFileName = parsed.audioFileName;
  if (parsed.fileName) aiDataPayload.fileName = parsed.fileName;
  if (parsed.storageUrl) aiDataPayload.storageUrl = parsed.storageUrl;
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

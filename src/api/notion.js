// Notion API methods

// Save entry to Notion database (fire-and-forget, never blocks main flow)
export async function saveToNotion(data, settings) {
  if (!settings.notionEnabled || !settings.notionToken || !settings.notionDbId) return null;

  const { type, sourceUrl, content, fileId, tagName } = data;
  const domain = sourceUrl
    ? sourceUrl.replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0]
    : '';

  const properties = {
    'URL': { title: [{ text: { content: domain || sourceUrl || '—' } }] },
    'Type': { select: { name: type } },
    'Date': { date: { start: new Date().toISOString() } }
  };

  if (sourceUrl) properties['Source URL'] = { url: sourceUrl };
  if (tagName) properties['Tag'] = { select: { name: tagName } };
  if (content) properties['Content'] = { rich_text: [{ text: { content: content.slice(0, 2000) } }] };
  if (fileId) properties['File ID'] = { rich_text: [{ text: { content: fileId } }] };

  try {
    const res = await fetch('https://api.notion.com/v1/pages', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${settings.notionToken}`,
        'Notion-Version': '2022-06-28',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ parent: { database_id: settings.notionDbId }, properties })
    });
    if (!res.ok) {
      const err = await res.json();
      console.warn('[TG Saver] Notion save failed:', err.message);
      return null;
    }
    const page = await res.json();
    return page.id || null;
  } catch (e) {
    console.warn('[TG Saver] Notion save error:', e);
    return null;
  }
}

// Patch Notion page with AI analysis results
export async function patchNotionWithAI(pageId, aiResult, settings, existingAiData) {
  if (!pageId || !aiResult) return;

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

  // Start from existing ai_data to preserve mediaType, thumbnailFileId, mediaGroupId, etc.
  const aiDataPayload = { ...(existingAiData || {}) };
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
    // Notion rich_text limit is 2000 chars. Truncate long text fields to fit,
    // never blindly slice JSON (that corrupts the structure and breaks parsing).
    const LIMIT = 2000;
    let json = JSON.stringify(aiDataPayload);
    if (json.length > LIMIT) {
      const trimFields = ['text_on_image', 'tweet_text', 'title'];
      for (const field of trimFields) {
        if (!aiDataPayload[field]) continue;
        const excess = json.length - LIMIT;
        if (excess <= 0) break;
        const maxLen = Math.max(0, aiDataPayload[field].length - excess - 50);
        aiDataPayload[field] = maxLen > 0 ? aiDataPayload[field].slice(0, maxLen) + '…' : '';
        json = JSON.stringify(aiDataPayload);
      }
    }
    if (json.length > LIMIT) {
      delete aiDataPayload.text_on_image;
      delete aiDataPayload.tweet_text;
      delete aiDataPayload.title;
      json = JSON.stringify(aiDataPayload);
    }
    if (json.length <= LIMIT) {
      properties['ai_data'] = {
        rich_text: [{ text: { content: json } }]
      };
    }
  }

  try {
    await fetch(`https://api.notion.com/v1/pages/${pageId}`, {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${settings.notionToken}`,
        'Notion-Version': '2022-06-28',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ properties })
    });
  } catch (e) {
    console.warn('[TG Saver] Notion AI patch error:', e);
  }
}

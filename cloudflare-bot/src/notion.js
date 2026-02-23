// Notion API helpers

import { buildAiDataFromParsed } from './helpers.js';

export async function saveToNotion(parsed, env) {
  if (!env.NOTION_TOKEN || !env.NOTION_DB_ID) {
    console.warn('Notion not configured');
    return null;
  }

  const { type, sourceUrl, content, fileId } = parsed;
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

  const aiDataInit = buildAiDataFromParsed(parsed);
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

export async function patchNotionPage(notionPageId, properties, env) {
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

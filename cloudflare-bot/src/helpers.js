// Shared helpers for cloudflare-bot

export function normalizeUrl(url) {
  if (!url) return url;
  if (!/^https?:\/\//i.test(url)) return 'https://' + url;
  return url;
}

export function escapeHtmlBot(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export function formatTextWithEntities(text, entities) {
  if (!entities || entities.length === 0) return text;
  const tagMap = {
    bold: 'b', italic: 'i', underline: 'u', strikethrough: 's',
    code: 'code', pre: 'pre',
  };
  const htmlEntities = entities.filter(e =>
    tagMap[e.type] || e.type === 'text_link' || e.type === 'url'
  );
  const events = [];
  for (const e of htmlEntities) {
    events.push({ pos: e.offset, type: 'open', entity: e });
    events.push({ pos: e.offset + e.length, type: 'close', entity: e });
  }
  events.sort((a, b) => a.pos - b.pos || (a.type === 'close' ? -1 : 1));

  let result = '';
  let cursor = 0;
  const activeStack = [];

  for (const ev of events) {
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
  if (cursor < text.length) {
    result += escapeHtmlBot(text.substring(cursor));
  }
  return result;
}

export async function fetchBase64(url) {
  const res = await fetch(url);
  const buffer = await res.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

// Build ai_data object from parsed message fields.
// This eliminates the 4x duplication of the same if-chain across
// saveToNotion, forwardToStorageChannel, transcribeAndPatch, analyzeAndPatch.
export function buildAiDataFromParsed(parsed) {
  const data = {};
  const fields = [
    'mediaType', 'thumbnailFileId', 'mediaGroupId',
    'channelTitle', 'forwardFrom', 'forwardUserUrl',
    'audioTitle', 'audioPerformer', 'audioDuration', 'audioFileName',
    'fileName', 'fileSize',
    'imageWidth', 'imageHeight',
    'thumbnailWidth', 'thumbnailHeight',
    'storageUrl',
  ];
  for (const key of fields) {
    if (parsed[key]) data[key] = parsed[key];
  }
  if (parsed.contentHasHtml) data.htmlContent = true;
  return data;
}

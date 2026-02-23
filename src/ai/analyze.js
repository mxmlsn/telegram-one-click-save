// AI analysis — Gemini and Anthropic providers

import { AI_PROMPT_IMAGE, AI_PROMPT_LINK } from '../shared/prompts.js';

export async function fetchBase64(url) {
  const res = await fetch(url);
  const buffer = await res.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

export async function callGemini(prompt, imageBase64OrNull, settings, mimeType = 'image/jpeg') {
  const model = settings.aiModel || 'gemini-2.0-flash';
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${settings.aiApiKey}`;
  const parts = [];
  if (imageBase64OrNull) {
    parts.push({ inline_data: { mime_type: mimeType, data: imageBase64OrNull } });
  }
  parts.push({ text: prompt });
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ contents: [{ parts }] })
  });
  if (!res.ok) {
    console.warn('[TG Saver] Gemini error:', res.status, await res.text());
    return null;
  }
  const data = await res.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text || null;
}

export async function callAnthropic(messages, settings) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': settings.aiApiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json'
    },
    body: JSON.stringify({
      model: (settings.aiModel && !settings.aiModel.startsWith('gemini')) ? settings.aiModel : 'claude-haiku-4-5-20251001',
      max_tokens: 300,
      messages
    })
  });
  if (!res.ok) {
    console.warn('[TG Saver] Anthropic error:', res.status, await res.text());
    return null;
  }
  const data = await res.json();
  return data.content?.[0]?.text || null;
}

// Call the appropriate AI provider with image or text
async function callAIWithImage(prompt, imageUrl, settings) {
  const provider = settings.aiProvider || 'google';
  const ext = imageUrl.split('?')[0].split('.').pop()?.toLowerCase();
  const mimeType = ext === 'gif' ? 'image/gif' : ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : 'image/jpeg';

  if (provider === 'google') {
    const base64 = await fetchBase64(imageUrl);
    return callGemini(prompt, base64, settings, mimeType);
  } else {
    const messages = [{
      role: 'user',
      content: [
        { type: 'image', source: { type: 'url', url: imageUrl } },
        { type: 'text', text: prompt }
      ]
    }];
    return callAnthropic(messages, settings);
  }
}

async function callAITextOnly(prompt, settings) {
  const provider = settings.aiProvider || 'google';
  if (provider === 'google') {
    return callGemini(prompt, null, settings);
  } else {
    return callAnthropic([{ role: 'user', content: prompt }], settings);
  }
}

// Main analysis function
export async function analyzeWithAI(item, settings) {
  if (!settings.aiEnabled || !settings.aiApiKey) return null;
  if (item.type === 'quote') return null;

  try {
    const isDirectImage = item.type === 'image' || item.type === 'gif' || item.type === 'video';
    let responseText = null;

    // Try original image URL first (for GIFs: Telegram thumbnail is tiny/inaccurate)
    if (item.originalImageUrl) {
      const prompt = isDirectImage ? AI_PROMPT_IMAGE : AI_PROMPT_LINK;
      responseText = await callAIWithImage(prompt, item.originalImageUrl, settings);
    }
    // Try Telegram file_id
    else if (item.fileId && settings.botToken) {
      const gifThumbFileId = item.type === 'gif' && item.existingAiData?.thumbnailFileId
        ? item.existingAiData.thumbnailFileId : null;
      const fileIdToFetch = gifThumbFileId || item.fileId;

      const fileRes = await fetch(
        `https://api.telegram.org/bot${settings.botToken}/getFile?file_id=${fileIdToFetch}`
      );
      const fileData = await fileRes.json();
      if (fileData.ok) {
        const filePath = fileData.result.file_path;
        const ext = filePath.split('.').pop()?.toLowerCase();
        const IMAGE_EXTS = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'tiff', 'heic'];
        const isGifThumb = gifThumbFileId && fileIdToFetch === gifThumbFileId;

        if (IMAGE_EXTS.includes(ext) || isGifThumb) {
          const imgUrl = `https://api.telegram.org/file/bot${settings.botToken}/${filePath}`;
          const prompt = isDirectImage ? AI_PROMPT_IMAGE : AI_PROMPT_LINK;
          responseText = await callAIWithImage(prompt, imgUrl, settings);
        }
      }
    }

    // Text/link fallback (no image, or image fetch failed)
    if (responseText === null) {
      const context = [
        item.sourceUrl ? `URL: ${item.sourceUrl}` : '',
        item.content ? `Content: ${item.content.slice(0, 500)}` : '',
        item.tagName ? `User tag: ${item.tagName}` : ''
      ].filter(Boolean).join('\n');
      const fullPrompt = `${AI_PROMPT_LINK}\n\nContent to analyze:\n${context}`;
      responseText = await callAITextOnly(fullPrompt, settings);
    }

    if (!responseText) return null;

    // Strip markdown code fences if model wrapped JSON in ```json ... ```
    const cleaned = responseText.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
    const parsed = JSON.parse(cleaned);

    // Hard guard: direct TG image can only be "product" or null
    if (isDirectImage && parsed.content_type !== 'product') {
      parsed.content_type = null;
    }

    return parsed;
  } catch (e) {
    console.warn('[TG Saver] AI parse error:', e);
    return null;
  }
}

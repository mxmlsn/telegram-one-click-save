// AI analysis orchestration — transcribe, analyze images/links/PDFs, patch Notion

import { fetchBase64, buildAiDataFromParsed } from './helpers.js';
import { callGemini, callAnthropic, parseAiJson } from './ai.js';
import { Resvg } from '@cf-wasm/resvg/workerd';
import { patchNotionPage } from './notion.js';
import {
  AI_PROMPT_IMAGE, AI_PROMPT_LINK, AI_PROMPT_PDF,
  AI_PROMPT_TRANSCRIBE, AI_PROMPT_AUDIO
} from './prompts.js';

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

    const aiData = buildAiDataFromParsed(parsed);
    aiData.transcript = transcript.trim();

    await patchNotionPage(notionPageId, {
      'ai_analyzed': { checkbox: true },
      'ai_data': {
        rich_text: [{ text: { content: JSON.stringify(aiData).slice(0, 2000) } }]
      }
    }, env);
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
  const base = buildAiDataFromParsed(parsed);
  for (const [key, val] of Object.entries(base)) {
    if (!aiData[key]) aiData[key] = val;
  }

  // Analyze cover art if available
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
          try {
            const result = parseAiJson(responseText);
            if (result.color_subject) aiData.color_subject = result.color_subject;
            if (result.color_palette) aiData.color_palette = result.color_palette;
            if (result.color_top3?.length) aiData.color_top3 = result.color_top3;
          } catch {
            console.warn('Audio cover AI parse error');
          }
        }
      }
    } catch (e) {
      console.warn('Audio cover analysis failed:', e.message);
    }
  }

  await patchNotionPage(notionPageId, {
    'ai_analyzed': { checkbox: true },
    'ai_data': {
      rich_text: [{ text: { content: JSON.stringify(aiData).slice(0, 2000) } }]
    }
  }, env);
}

export async function analyzeAndPatch(parsed, notionPageId, env) {
  const provider = env.AI_PROVIDER || 'google';

  // Voice / video_note → transcribe
  const isVoice = ['voice', 'video_note'].includes(parsed.type)
    || ['voice', 'video_note'].includes(parsed.mediaType);
  if (isVoice && parsed.fileId && provider === 'google') {
    await transcribeAndPatch(parsed, notionPageId, env);
    return;
  }

  // Audio → analyze cover art
  const isAudioFile = parsed.type === 'audio' || parsed.mediaType === 'audio';
  if (isAudioFile) {
    await analyzeAudioCover(parsed, notionPageId, env, provider);
    return;
  }

  const isPdf = parsed.type === 'pdf' || parsed.mediaType === 'pdf';
  const isVideo = parsed.type === 'video' || parsed.mediaType === 'video';
  const isDirectImage = parsed.type === 'image' || parsed.type === 'gif'
    || (parsed.type === 'tgpost' && (parsed.mediaType === 'image' || parsed.mediaType === 'gif'))
    || isVideo;
  let responseText = null;

  const isLargeFile = parsed.fileSize && parsed.fileSize > 20 * 1024 * 1024;
  const isGifType = parsed.type === 'gif' || parsed.mediaType === 'gif';
  const isSvgFile = /\.svg$/i.test(parsed.fileName || '');
  // SVG: never use TG thumbnail (it's inaccurate), always fetch actual SVG for text analysis
  const fileIdForAI = ((isVideo || isLargeFile || isGifType) && !isSvgFile && parsed.thumbnailFileId)
    ? parsed.thumbnailFileId : parsed.fileId;

  // PDF analysis
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

  // Image analysis (non-PDF)
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
      const IMAGE_EXTS = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'tiff', 'heic'];
      const isImageExt = IMAGE_EXTS.includes(ext);
      const isMp4Anim = isGifType && !isImageExt;

      if (isImageExt) {
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
      } else if (isMp4Anim && provider === 'google') {
        const base64 = await fetchBase64(imgUrl);
        responseText = await callGemini(prompt, base64, env, 'video/mp4');
      } else if (ext === 'svg') {
        // SVG: rasterize to PNG via resvg-wasm, then send PNG to AI
        try {
          const svgRes = await fetch(imgUrl);
          if (svgRes.ok) {
            const svgText = await svgRes.text();
            if (svgText.length > 50) {
              const resvg = await Resvg.async(svgText, {
                fitTo: { mode: 'width', value: 800 },
                background: '#ffffff',
              });
              const pngData = resvg.render();
              const pngBuffer = pngData.asPng();
              const base64 = btoa(String.fromCharCode(...pngBuffer));
              if (provider === 'google') {
                responseText = await callGemini(prompt, base64, env, 'image/png');
              } else {
                responseText = await callAnthropic([{
                  role: 'user',
                  content: [
                    { type: 'image', source: { type: 'base64', media_type: 'image/png', data: base64 } },
                    { type: 'text', text: prompt }
                  ]
                }], env);
              }
            }
          }
        } catch (e) {
          console.warn('SVG rasterize+analyze failed:', e.message);
        }
      }
    }
  }

  // Fallback: text/link analysis without image
  if (!responseText) {
    const context = [
      parsed.sourceUrl ? `URL: ${parsed.sourceUrl}` : '',
      parsed.content ? `Content: ${parsed.content.slice(0, 500)}` : ''
    ].filter(Boolean).join('\n');

    if (!context) return;

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

  let aiResult;
  try {
    aiResult = parseAiJson(responseText);
  } catch {
    console.warn('AI parse error');
    return;
  }

  // Hard guards
  if (parsed.type === 'tgpost') {
    aiResult.content_type = null;
  }
  if (isDirectImage && aiResult.content_type !== 'product') {
    aiResult.content_type = null;
  }

  // Build Notion properties
  const properties = {
    'ai_analyzed': { checkbox: true },
    'ai_type': aiResult.content_type
      ? { select: { name: aiResult.content_type } }
      : { select: null },
    'ai_type_secondary': aiResult.content_type_secondary
      ? { select: { name: aiResult.content_type_secondary } }
      : { select: null },
  };

  if (aiResult.description) {
    properties['ai_description'] = {
      rich_text: [{ text: { content: aiResult.description.slice(0, 2000) } }]
    };
  }

  // Merge parsed metadata with AI results into ai_data
  const aiDataPayload = buildAiDataFromParsed(parsed);
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

  await patchNotionPage(notionPageId, properties, env);
}

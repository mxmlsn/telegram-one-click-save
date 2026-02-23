// Unified send orchestration
// Each function takes selectedTag as a parameter (already resolved by context menu handler)

import { sendPhoto, sendPhotoSilent, sendDocument, sendAnimation, sendTextMessage } from '../api/telegram.js';
import { saveToNotion, patchNotionWithAI } from '../api/notion.js';
import { analyzeWithAI } from '../ai/analyze.js';
import { buildCaption } from './caption.js';
import { isGifUrl, isGifBlob, isPdfUrl, fetchImageBlob, detectMediaScript } from './media.js';

// Helper: show toast on tab
async function showToast(tabId, state, message) {
  if (!tabId) return;
  try {
    await chrome.tabs.sendMessage(tabId, { action: 'showToast', state, message });
  } catch (e) {
    // Normal on some pages (e.g. chrome:// pages)
  }
}

// Helper: fire-and-forget AI analysis + Notion patch
function fireAI(item, settings, notionPageId) {
  if (settings.aiEnabled && settings.aiAutoOnSave && notionPageId) {
    analyzeWithAI(item, settings)
      .then(r => patchNotionWithAI(notionPageId, r, settings))
      .catch(e => console.warn('[TG Saver] AI on-save error:', e));
  }
}

// ─── Send Image ─────────────────────────────────────────────────────────────

export async function sendImage(imageUrl, pageUrl, settings, tabId, selectedTag) {
  // If srcUrl is a PDF (e.g. embedded PDF), send as document
  if (isPdfUrl(imageUrl)) {
    await sendPdf(imageUrl, pageUrl, settings, tabId, selectedTag);
    return;
  }

  const { blob, isScreenshot } = await fetchImageBlob(imageUrl, tabId);

  const isGif = !isScreenshot && (isGifUrl(imageUrl) || isGifBlob(blob));
  const caption = buildCaption(pageUrl, isGif ? settings.tagGif : settings.tagImage, '', settings, selectedTag);

  let fileId = null;
  if (isGif) {
    const result = await sendAnimation(blob, caption, settings);
    fileId = result?.fileId || null;
  } else if (settings.imageCompression || isScreenshot) {
    const result = await sendPhoto(blob, caption, settings);
    fileId = result?.fileId || null;
  } else {
    await sendDocument(blob, caption, settings, imageUrl);
  }

  const notionData = { type: isGif ? 'gif' : 'image', sourceUrl: pageUrl, fileId, tagName: selectedTag?.name };
  if (isGif) notionData.content = imageUrl; // Store original URL for viewer
  const notionPageId = await saveToNotion(notionData, settings);

  const aiItem = { type: isGif ? 'gif' : 'image', sourceUrl: pageUrl, fileId };
  if (isGif) aiItem.originalImageUrl = imageUrl;
  fireAI(aiItem, settings, notionPageId);

  if (tabId) await showToast(tabId, 'success', 'Success');
}

// ─── Send Quote ─────────────────────────────────────────────────────────────

export async function sendQuote(text, pageUrl, settings, tabId, selectedTag) {
  try {
    const caption = buildCaption(pageUrl, settings.tagQuote, text, settings, selectedTag);
    await sendTextMessage(caption, settings);
    await saveToNotion({ type: 'quote', sourceUrl: pageUrl, content: text, tagName: selectedTag?.name }, settings);
    if (tabId) await showToast(tabId, 'success', 'Success');
  } catch (err) {
    console.error('[TG Saver] Error in sendQuote:', err);
    if (tabId) showToast(tabId, 'error', 'Error: ' + err.message);
  }
}

// ─── Send Link ──────────────────────────────────────────────────────────────

export async function sendLink(linkUrl, pageUrl, settings, tabId, selectedTag) {
  if (isPdfUrl(linkUrl)) {
    await sendPdf(linkUrl, pageUrl, settings, tabId, selectedTag);
    return;
  }

  const caption = buildCaption(linkUrl, settings.tagLink, '', settings, selectedTag);
  await sendTextMessage(caption, settings);
  const notionPageId = await saveToNotion({ type: 'link', sourceUrl: linkUrl, tagName: selectedTag?.name }, settings);
  fireAI({ type: 'link', sourceUrl: linkUrl, fileId: null }, settings, notionPageId);
  if (tabId) await showToast(tabId, 'success', 'Success');
}

// ─── Send PDF ───────────────────────────────────────────────────────────────

export async function sendPdf(pdfUrl, pageUrl, settings, tabId, selectedTag) {
  try {
    // Capture screenshot in parallel with PDF fetch
    let screenshotPromise = null;
    if (tabId) {
      screenshotPromise = chrome.tabs.captureVisibleTab(null, { format: 'png' })
        .catch(() => null);
    }

    const response = await fetch(pdfUrl);
    if (!response.ok) throw new Error('Failed to fetch PDF');
    const blob = await response.blob();

    const urlPath = pdfUrl.split('?')[0].split('#')[0];
    const filename = urlPath.split('/').pop() || 'document.pdf';
    const caption = buildCaption(pageUrl || pdfUrl, settings.tagPdf, '', settings, selectedTag);

    const formData = new FormData();
    formData.append('chat_id', settings.chatId);
    formData.append('document', blob, filename);
    formData.append('caption', caption);
    formData.append('parse_mode', 'HTML');

    const tgResponse = await fetch(`https://api.telegram.org/bot${settings.botToken}/sendDocument`, {
      method: 'POST',
      body: formData
    });

    if (!tgResponse.ok) {
      const error = await tgResponse.json();
      throw new Error(error.description || 'Telegram API error');
    }

    // Send screenshot as silent photo to get a fileId for viewer preview
    let previewFileId = null;
    if (screenshotPromise) {
      const screenshotDataUrl = await screenshotPromise;
      if (screenshotDataUrl) {
        try {
          const screenshotBlob = await fetch(screenshotDataUrl).then(r => r.blob());
          const photoResult = await sendPhotoSilent(screenshotBlob, settings);
          previewFileId = photoResult?.fileId || null;
        } catch (e) {
          console.warn('[TG Saver] PDF preview screenshot send failed:', e);
        }
      }
    }

    const notionPageId = await saveToNotion({ type: 'pdf', sourceUrl: pdfUrl, fileId: previewFileId, tagName: selectedTag?.name }, settings);
    fireAI({ type: 'pdf', sourceUrl: pdfUrl, fileId: previewFileId }, settings, notionPageId);

    if (tabId) await showToast(tabId, 'success', 'Success');
  } catch (err) {
    console.error('[TG Saver] Error sending PDF:', err);
    if (tabId) showToast(tabId, 'error', 'Error: ' + err.message);
  }
}

// ─── Send Screenshot (page capture) ─────────────────────────────────────────

export async function sendScreenshot(tab, settings, selectedTag) {
  try {
    // If the current page is a PDF, send it as a PDF document
    if (isPdfUrl(tab.url)) {
      await sendPdf(tab.url, tab.url, settings, tab.id, selectedTag);
      return;
    }

    if (!settings.addScreenshot) {
      // Send just the link without screenshot
      const caption = buildCaption(tab.url, settings.tagLink, '', settings, selectedTag);
      await sendTextMessage(caption, settings);
      const notionPageId = await saveToNotion({ type: 'link', sourceUrl: tab.url, tagName: selectedTag?.name }, settings);
      fireAI({ type: 'link', sourceUrl: tab.url, fileId: null }, settings, notionPageId);
      await showToast(tab.id, 'success', 'Success');
      return;
    }

    const dataUrl = await chrome.tabs.captureVisibleTab(null, { format: 'png' });
    const blob = await fetch(dataUrl).then(r => r.blob());
    const caption = buildCaption(tab.url, settings.tagLink, '', settings, selectedTag);

    const result = await sendPhoto(blob, caption, settings);
    const notionPageId = await saveToNotion({ type: 'link', sourceUrl: tab.url, fileId: result?.fileId || null, tagName: selectedTag?.name }, settings);
    fireAI({ type: 'link', sourceUrl: tab.url, fileId: result?.fileId || null }, settings, notionPageId);
    await showToast(tab.id, 'success', 'Success');
  } catch (err) {
    console.error('[TG Saver] Error in sendScreenshot:', err);
    showToast(tab.id, 'error', 'Error: ' + err.message);
  }
}

// ─── Send From Page (media detection under cursor) ──────────────────────────

export async function sendFromPage(tab, settings, selectedTag) {
  const tabId = tab.id;
  const isInstagram = tab.url.includes('instagram.com');

  // Find image or video under cursor via content script
  const results = await chrome.scripting.executeScript({
    target: { tabId },
    func: detectMediaScript,
    args: [isInstagram]
  });

  const media = results[0]?.result;

  if (!media || !media.type) {
    // No media found - send screenshot + link
    await sendScreenshot(tab, settings, selectedTag);
    return;
  }

  if (media.type === 'video') {
    // For video: take screenshot and send with image tag
    const dataUrl = await chrome.tabs.captureVisibleTab(null, { format: 'png' });
    const blob = await fetch(dataUrl).then(r => r.blob());
    const caption = buildCaption(tab.url, settings.tagImage, '', settings, selectedTag);

    const result = await sendPhoto(blob, caption, settings);
    const notionPageId = await saveToNotion({ type: 'image', sourceUrl: tab.url, fileId: result?.fileId || null, tagName: selectedTag?.name }, settings);
    fireAI({ type: 'image', sourceUrl: tab.url, fileId: result?.fileId || null }, settings, notionPageId);
    await showToast(tabId, 'success', 'Success');
  } else {
    // For image: send as usual
    await sendImage(media.src, tab.url, settings, tabId, selectedTag);
  }
}

// Media detection and utility functions

// Check if URL points to a GIF image
export function isGifUrl(url) {
  if (!url) return false;
  const cleanUrl = url.split('?')[0].split('#')[0].toLowerCase();
  return cleanUrl.endsWith('.gif');
}

// Check if URL points to a PDF file
export function isPdfUrl(url) {
  if (!url) return false;
  const cleanUrl = url.split('?')[0].split('#')[0].toLowerCase();
  return cleanUrl.endsWith('.pdf');
}

// Check if a blob is a GIF by MIME type
export function isGifBlob(blob) {
  return blob && blob.type === 'image/gif';
}

// Detect media under cursor via content script injection
// Used by both the context menu handler and toolbar icon click
export function detectMediaScript(isInstagram) {
  const el = window.__tgSaverLastRightClicked;
  if (!el) return { type: null };

  // For non-Instagram: STRICT mode
  // Only detect media if the clicked element IS the media
  if (!isInstagram) {
    if (el.tagName === 'VIDEO') {
      return { type: 'video', src: el.src || el.currentSrc };
    }
    if (el.tagName === 'IMG') {
      return { type: 'image', src: el.src };
    }
    return { type: null };
  }

  // Instagram: aggressive search (images hidden behind overlays)
  let video = el.closest('video') || el.querySelector('video');
  if (!video) {
    video = el.closest('[aria-label*="Video"], [role="group"]')?.querySelector('video');
  }
  if (!video) {
    let parent = el.parentElement;
    for (let i = 0; i < 5 && parent; i++) {
      video = parent.querySelector('video');
      if (video) break;
      parent = parent.parentElement;
    }
  }

  if (video) {
    return { type: 'video', src: video.src || video.currentSrc };
  }

  let img = el.closest('img') || el.querySelector('img');
  if (!img) {
    img = el.closest('[class*="image"], [class*="photo"], [class*="media"]')?.querySelector('img');
  }
  if (!img) {
    let parent = el.parentElement;
    for (let i = 0; i < 5 && parent; i++) {
      img = parent.querySelector('img');
      if (img) break;
      parent = parent.parentElement;
    }
  }

  if (img) {
    return { type: 'image', src: img.src };
  }

  return { type: null };
}

// Fetch image blob with screenshot fallback
export async function fetchImageBlob(imageUrl, tabId) {
  try {
    const response = await fetch(imageUrl);
    if (!response.ok) throw new Error('Failed to fetch image');
    return { blob: await response.blob(), isScreenshot: false };
  } catch (e) {
    console.error('[TG Saver] Image fetch error, using screenshot fallback:', e);
    if (tabId) {
      const screenshotDataUrl = await chrome.tabs.captureVisibleTab(null, { format: 'png' });
      const blob = await fetch(screenshotDataUrl).then(r => r.blob());
      return { blob, isScreenshot: true };
    }
    throw e;
  }
}

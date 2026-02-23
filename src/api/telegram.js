// Telegram Bot API methods

// Send text message
export async function sendTextMessage(text, settings) {
  const response = await fetch(`https://api.telegram.org/bot${settings.botToken}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: settings.chatId,
      text: text,
      parse_mode: 'HTML',
      disable_web_page_preview: !settings.showLinkPreview
    })
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.description || 'Telegram API error');
  }

  return response.json();
}

// Compress image to fit within Telegram photo size limit (10 MB)
async function compressImageIfNeeded(blob) {
  const MAX_SIZE = 10 * 1024 * 1024;

  if (blob.size <= MAX_SIZE) return blob;

  const img = new Image();
  const imgUrl = URL.createObjectURL(blob);

  await new Promise((resolve, reject) => {
    img.onload = resolve;
    img.onerror = reject;
    img.src = imgUrl;
  });

  let quality = 0.9;
  let compressedBlob = blob;

  // Try reducing quality first
  while (compressedBlob.size > MAX_SIZE && quality > 0.1) {
    const canvas = document.createElement('canvas');
    canvas.width = img.width;
    canvas.height = img.height;
    canvas.getContext('2d').drawImage(img, 0, 0);
    compressedBlob = await new Promise(resolve => {
      canvas.toBlob(resolve, 'image/jpeg', quality);
    });
    quality -= 0.1;
  }

  // If still too large, reduce dimensions
  if (compressedBlob.size > MAX_SIZE) {
    let scale = 0.9;
    while (compressedBlob.size > MAX_SIZE && scale > 0.3) {
      const canvas = document.createElement('canvas');
      canvas.width = Math.floor(img.width * scale);
      canvas.height = Math.floor(img.height * scale);
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
      compressedBlob = await new Promise(resolve => {
        canvas.toBlob(resolve, 'image/jpeg', 0.85);
      });
      scale -= 0.1;
    }
  }

  URL.revokeObjectURL(imgUrl);
  return compressedBlob;
}

// Send photo (with compression)
export async function sendPhoto(blob, caption, settings) {
  const compressedBlob = await compressImageIfNeeded(blob);

  const formData = new FormData();
  formData.append('chat_id', settings.chatId);
  formData.append('photo', compressedBlob, 'screenshot.jpg');
  formData.append('caption', caption);
  formData.append('parse_mode', 'HTML');

  const response = await fetch(`https://api.telegram.org/bot${settings.botToken}/sendPhoto`, {
    method: 'POST',
    body: formData
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.description || 'Telegram API error');
  }

  const result = await response.json();
  const photos = result.result?.photo;
  const fileId = photos && photos.length > 0 ? photos[photos.length - 1].file_id : null;
  return { ...result, fileId };
}

// Send photo silently (no notification, no caption) — for preview fileId only
export async function sendPhotoSilent(blob, settings) {
  try {
    const compressedBlob = await compressImageIfNeeded(blob);
    const formData = new FormData();
    formData.append('chat_id', settings.chatId);
    formData.append('photo', compressedBlob, 'preview.jpg');
    formData.append('disable_notification', 'true');

    const response = await fetch(`https://api.telegram.org/bot${settings.botToken}/sendPhoto`, {
      method: 'POST',
      body: formData
    });

    if (!response.ok) return null;

    const result = await response.json();
    const photos = result.result?.photo;
    const fileId = photos && photos.length > 0 ? photos[photos.length - 1].file_id : null;
    return { fileId };
  } catch (err) {
    console.warn('[TG Saver] Silent photo failed:', err);
    return null;
  }
}

// Send document (uncompressed)
export async function sendDocument(blob, caption, settings, originalUrl) {
  const ext = originalUrl.split('.').pop()?.split('?')[0] || 'png';
  const filename = `image.${ext}`;

  const formData = new FormData();
  formData.append('chat_id', settings.chatId);
  formData.append('document', blob, filename);
  formData.append('caption', caption);
  formData.append('parse_mode', 'HTML');

  const response = await fetch(`https://api.telegram.org/bot${settings.botToken}/sendDocument`, {
    method: 'POST',
    body: formData
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.description || 'Telegram API error');
  }

  return response.json();
}

// Send animation (GIF with inline preview)
export async function sendAnimation(blob, caption, settings) {
  const formData = new FormData();
  formData.append('chat_id', settings.chatId);
  formData.append('animation', blob, 'animation.gif');
  formData.append('caption', caption);
  formData.append('parse_mode', 'HTML');

  const response = await fetch(`https://api.telegram.org/bot${settings.botToken}/sendAnimation`, {
    method: 'POST',
    body: formData
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.description || 'Telegram API error');
  }

  const result = await response.json();
  // Use thumbnail file_id (static JPEG that getFile can serve as <img>).
  // The animation.file_id points to an MP4 which <img> can't render.
  const thumb = result.result?.animation?.thumbnail || result.result?.animation?.thumb;
  const fileId = thumb?.file_id || null;
  return { ...result, fileId };
}

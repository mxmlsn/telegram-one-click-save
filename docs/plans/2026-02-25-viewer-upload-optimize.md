# Viewer Upload Optimization Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix PNG transparency loss and optimize viewer file uploads to use sendDocument where possible to avoid quality loss.

**Architecture:** Change the upload routing logic in `web-viewer/viewer.js` uploadFileToTelegram function. PNG always → sendDocument. JPG/WEBP ≤ 50 MB → sendDocument (no compression). JPG/WEBP > 50 MB → sendPhoto with compression (only fallback). Video/GIF > 50 MB → sendDocument fallback instead of crashing.

**Tech Stack:** Vanilla JS, Telegram Bot API (multipart upload)

---

### Task 1: Fix PNG — always sendDocument

**Files:**
- Modify: `web-viewer/viewer.js` — the `if (['image/jpeg', 'image/png', 'image/webp'].includes(mime))` block around line 860

**Context:**
Currently all PNG/JPG/WEBP go through `sendPhoto` which compresses to JPEG and kills PNG transparency. We split this into separate branches.

**Step 1: Find exact lines**

Open `web-viewer/viewer.js` and find the block:
```js
if (['image/jpeg', 'image/png', 'image/webp'].includes(mime)) {
  const compressed = await compressImageIfNeeded(file);
  formData.append('photo', compressed, file.name || 'photo.jpg');
  const res = await fetch(`https://api.telegram.org/bot${botToken}/sendPhoto`, ...
```

**Step 2: Replace the image block**

Replace the entire `if (['image/jpeg', 'image/png', 'image/webp'].includes(mime))` block with:

```js
  // PNG → always sendDocument to preserve transparency
  if (mime === 'image/png') {
    formData.append('document', file, file.name || 'image.png');
    const res = await fetch(`https://api.telegram.org/bot${botToken}/sendDocument`, { method: 'POST', body: formData });
    if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.description || 'sendDocument failed'); }
    const data = await res.json();
    const doc = data.result?.document;
    r.fileId = doc?.file_id || null;
    r.thumbnailFileId = doc?.thumbnail?.file_id || doc?.thumb?.file_id || null;
    r.type = 'image';
    r.messageId = data.result?.message_id || null;
    console.log('[Upload] PNG sendDocument OK fileId=%s', r.fileId?.slice(-20));
    return r;
  }

  // JPG/WEBP ≤ 50 MB → sendDocument (lossless, no recompression)
  // JPG/WEBP > 50 MB → sendPhoto with compression (only fallback, no other option)
  if (['image/jpeg', 'image/webp'].includes(mime)) {
    const DOCUMENT_LIMIT = 50 * 1024 * 1024;
    if (file.size <= DOCUMENT_LIMIT) {
      formData.append('document', file, file.name || 'image.jpg');
      const res = await fetch(`https://api.telegram.org/bot${botToken}/sendDocument`, { method: 'POST', body: formData });
      if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.description || 'sendDocument failed'); }
      const data = await res.json();
      const doc = data.result?.document;
      r.fileId = doc?.file_id || null;
      r.thumbnailFileId = doc?.thumbnail?.file_id || doc?.thumb?.file_id || null;
      r.type = 'image';
      r.messageId = data.result?.message_id || null;
      console.log('[Upload] JPG/WEBP sendDocument OK fileId=%s size=%d', r.fileId?.slice(-20), file.size);
      return r;
    }
    // > 50 MB: compress and send as photo (last resort)
    const compressed = await compressImageIfNeeded(file);
    formData.append('photo', compressed, file.name || 'photo.jpg');
    const res = await fetch(`https://api.telegram.org/bot${botToken}/sendPhoto`, { method: 'POST', body: formData });
    if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.description || 'sendPhoto failed'); }
    const data = await res.json();
    const photos = data.result?.photo;
    r.fileId = photos?.length > 0 ? photos[photos.length - 1].file_id : null;
    r.type = 'image';
    r.messageId = data.result?.message_id || null;
    console.log('[Upload] JPG/WEBP >50MB sendPhoto OK fileId=%s', r.fileId?.slice(-20));
    return r;
  }
```

**Step 3: Commit**

```bash
git add web-viewer/viewer.js
git commit -m "fix: PNG always sendDocument (preserve transparency), JPG/WEBP ≤50MB sendDocument (lossless)"
```

---

### Task 2: Fix Video > 50 MB — sendDocument fallback

**Files:**
- Modify: `web-viewer/viewer.js` — the `sendVideo` block around line 896

**Context:**
Currently if sendVideo fails (e.g. > 50 MB), the error bubbles up and upload fails completely. Add fallback to sendDocument.

**Step 1: Find the sendVideo block**

Find:
```js
const res = await fetch(`https://api.telegram.org/bot${botToken}/sendVideo`, { method: 'POST', body: formData });
if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.description || 'sendVideo failed'); }
```

**Step 2: Wrap sendVideo in try/catch with sendDocument fallback**

Replace the sendVideo fetch + error check with:

```js
    let res = await fetch(`https://api.telegram.org/bot${botToken}/sendVideo`, { method: 'POST', body: formData });
    // If sendVideo fails (e.g. > 50 MB), fall back to sendDocument
    if (!res.ok) {
      const e = await res.json().catch(() => ({}));
      if (e.description?.includes('too large') || e.error_code === 413 || file.size > 50 * 1024 * 1024) {
        console.warn('[Upload] sendVideo failed (%s), falling back to sendDocument', e.description);
        const docForm = new FormData();
        docForm.append('chat_id', chatId);
        docForm.append('disable_notification', 'true');
        docForm.append('caption', '[stash-viewer]');
        docForm.append('document', file, file.name || 'video.mp4');
        const docRes = await fetch(`https://api.telegram.org/bot${botToken}/sendDocument`, { method: 'POST', body: docForm });
        if (!docRes.ok) { const de = await docRes.json().catch(() => ({})); throw new Error(de.description || 'sendDocument fallback failed'); }
        const docData = await docRes.json();
        const doc = docData.result?.document;
        r.fileId = doc?.file_id || null;
        r.type = 'video';
        r.messageId = docData.result?.message_id || null;
        console.log('[Upload] Video sendDocument fallback OK fileId=%s', r.fileId?.slice(-20));
        return r;
      }
      throw new Error(e.description || 'sendVideo failed');
    }
```

**Step 3: Commit**

```bash
git add web-viewer/viewer.js
git commit -m "fix: video >50MB falls back to sendDocument instead of crashing"
```

---

### Task 3: Fix GIF > 50 MB — sendDocument fallback

**Files:**
- Modify: `web-viewer/viewer.js` — the `sendAnimation` block around line 844

**Context:**
Same pattern — GIF > 50 MB crashes instead of gracefully degrading.

**Step 1: Find the sendAnimation error check**

Find:
```js
const res = await fetch(`https://api.telegram.org/bot${botToken}/sendAnimation`, { method: 'POST', body: formData });
if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.description || 'sendAnimation failed'); }
```

**Step 2: Add sendDocument fallback**

Replace with:

```js
    const res = await fetch(`https://api.telegram.org/bot${botToken}/sendAnimation`, { method: 'POST', body: formData });
    if (!res.ok) {
      const e = await res.json().catch(() => ({}));
      if (e.description?.includes('too large') || e.error_code === 413 || file.size > 50 * 1024 * 1024) {
        console.warn('[Upload] sendAnimation failed (%s), falling back to sendDocument', e.description);
        const docForm = new FormData();
        docForm.append('chat_id', chatId);
        docForm.append('disable_notification', 'true');
        docForm.append('caption', '[stash-viewer]');
        docForm.append('document', file, file.name || 'animation.gif');
        const docRes = await fetch(`https://api.telegram.org/bot${botToken}/sendDocument`, { method: 'POST', body: docForm });
        if (!docRes.ok) { const de = await docRes.json().catch(() => ({})); throw new Error(de.description || 'sendDocument fallback failed'); }
        const docData = await docRes.json();
        const doc = docData.result?.document;
        r.fileId = doc?.file_id || null;
        r.type = 'gif';
        r.messageId = docData.result?.message_id || null;
        console.log('[Upload] GIF sendDocument fallback OK fileId=%s', r.fileId?.slice(-20));
        return r;
      }
      throw new Error(e.description || 'sendAnimation failed');
    }
```

**Step 3: Commit**

```bash
git add web-viewer/viewer.js
git commit -m "fix: GIF >50MB falls back to sendDocument instead of crashing"
```

---

### Task 4: Verify in browser

**Step 1: Navigate to stash.mxml.sn and upload test files**

Test cases:
- PNG с прозрачным фоном → должен сохранить прозрачность (проверить в канале и во вьюере)
- JPG < 50 MB → должен загрузиться без сжатия
- Проверить консоль: должны быть логи `sendDocument OK` вместо `sendPhoto OK`

**Step 2: Check console logs**

Expected log pattern:
```
[Upload] PNG sendDocument OK fileId=...
[Upload] JPG/WEBP sendDocument OK fileId=... size=...
```

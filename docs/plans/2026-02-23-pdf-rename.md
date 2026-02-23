# PDF Rename Feature Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Allow renaming any PDF card title via context menu (right-click) with inline editing directly on the card.

**Architecture:** Add "Rename" to the existing context menu, show/hide it based on whether the right-clicked card is a PDF. On click, replace `.pdf-title` with a styled `<input>`, save on Enter/blur, cancel on Escape. Persist to Notion via `ai_data` patch (same pattern as `togglePdfTextCollapse`).

**Tech Stack:** Vanilla JS, Notion REST API (`PATCH /v1/pages/:id`), Chrome extension storage

---

### Task 1: Add "Rename" button to context menu HTML

**Files:**
- Modify: `web-viewer/index.html` (line ~2744 — inside `#ctx-menu .ctx-menu-inner`, before the delete button)

**Step 1: Add the button in `index.html`**

Find this block (around line 2744):
```html
    <div class="ctx-divider"></div>
    <button class="ctx-item ctx-item-danger" data-ctx-action="delete">Delete</button>
```

Replace with:
```html
    <div class="ctx-divider"></div>
    <button class="ctx-item" id="ctx-rename-btn" data-ctx-action="rename">Rename</button>
    <div class="ctx-divider"></div>
    <button class="ctx-item ctx-item-danger" data-ctx-action="delete">Delete</button>
```

**Step 2: Add CSS for the rename input in `index.html` styles**

Find `.card-pdf .pdf-title {` (around line 1267). After its closing `}`, add:

```css
    .pdf-title-input {
      display: block;
      width: calc(100% - 36px);
      margin: 0 18px 16px;
      margin-top: -10px;
      padding: 2px 4px;
      background: rgba(255,255,255,0.07);
      border: 1px solid rgba(255,255,255,0.25);
      border-radius: 4px;
      color: rgba(255,255,255,0.9);
      font-family: 'Times New Roman', Times, Georgia, serif;
      font-size: 28px;
      line-height: 1.15;
      outline: none;
      position: relative;
      z-index: 2;
    }
    .pdf-title-input:focus {
      border-color: rgba(255,255,255,0.5);
      background: rgba(255,255,255,0.1);
    }
```

**Step 3: Verify visually** — Open `http://localhost:8080/web-viewer/index.html`, right-click any card, confirm "Rename" appears in the menu.

---

### Task 2: Show "Rename" only for PDF cards

**Files:**
- Modify: `web-viewer/viewer.js` (around line 3356 — the `masonry.addEventListener('contextmenu', ...)` block)

**Step 1: Locate the contextmenu handler**

Find this code in `viewer.js` (around line 3356):
```js
  masonry.addEventListener('contextmenu', e => {
    const card = e.target.closest('.card[data-id]');
    if (!card) return;
    e.preventDefault();
    ctxTargetItemId = card.dataset.id;
```

**Step 2: After the existing type-highlighting logic, add PDF-check**

Find the line:
```js
    // Position at cursor, clamp to viewport
```

Just before it, add:
```js
    // Show Rename only for PDF cards
    const renameBtn = document.getElementById('ctx-rename-btn');
    if (renameBtn) {
      const isPdf = card.classList.contains('card-pdf');
      renameBtn.style.display = isPdf ? '' : 'none';
      renameBtn.previousElementSibling.style.display = isPdf ? '' : 'none'; // divider above
    }
```

**Step 3: Verify** — Right-click a PDF card → "Rename" visible. Right-click a non-PDF card → "Rename" hidden.

---

### Task 3: Implement `renamePdfItem` function

**Files:**
- Modify: `web-viewer/viewer.js` (after the `togglePdfTextCollapse` function, around line 2640)

**Step 1: Add the function after `togglePdfTextCollapse`**

Find the closing brace of `togglePdfTextCollapse` (look for the last `}` after the `catch` block around line 2640). After it, add:

```js
async function renamePdfItem(pageId, newTitle) {
  const item = STATE.items.find(i => i.id === pageId);
  if (!item) return;

  const trimmed = newTitle.trim();
  if (!trimmed) return;

  const prev = item.ai_data.title;
  item.ai_data.title = trimmed;

  // Re-render card
  const cardEl = document.querySelector(`.card[data-id="${pageId}"]`);
  if (cardEl) cardEl.outerHTML = renderCard(item);

  // Persist to Notion
  try {
    const res = await notionPatch(pageId, {
      properties: {
        'ai_data': { rich_text: [{ text: { content: JSON.stringify(item.ai_data).slice(0, 2000) } }] }
      }
    });
    if (!res.ok) {
      console.error('[Viewer] Rename failed:', res.status);
      item.ai_data.title = prev;
      const revert = document.querySelector(`.card[data-id="${pageId}"]`);
      if (revert) revert.outerHTML = renderCard(item);
    }
  } catch (e) {
    console.error('[Viewer] Rename error:', e);
    item.ai_data.title = prev;
    const revert = document.querySelector(`.card[data-id="${pageId}"]`);
    if (revert) revert.outerHTML = renderCard(item);
  }
}
```

---

### Task 4: Implement inline editing on the card

**Files:**
- Modify: `web-viewer/viewer.js` (in the `ctxMenu.addEventListener('click', ...)` handler, around line 3407)

**Step 1: Add the `rename` action handler**

Find:
```js
    if (action === 'delete') {
      await deleteItem(targetId);
    } else if (action === 'set-type') {
```

Change to:
```js
    if (action === 'rename') {
      const cardEl = document.querySelector(`.card[data-id="${targetId}"]`);
      if (!cardEl) return;
      const titleEl = cardEl.querySelector('.pdf-title');
      if (!titleEl) return;

      const currentText = titleEl.textContent.trim();
      const input = document.createElement('input');
      input.type = 'text';
      input.className = 'pdf-title-input';
      input.value = currentText;
      titleEl.replaceWith(input);
      input.focus();
      input.select();

      function commitRename() {
        const newTitle = input.value.trim();
        if (newTitle && newTitle !== currentText) {
          renamePdfItem(targetId, newTitle);
        } else {
          // Revert — restore original title element
          const span = document.createElement('div');
          span.className = 'pdf-title';
          span.textContent = currentText;
          input.replaceWith(span);
        }
      }

      input.addEventListener('keydown', e => {
        if (e.key === 'Enter') { e.preventDefault(); input.blur(); }
        if (e.key === 'Escape') {
          const span = document.createElement('div');
          span.className = 'pdf-title';
          span.textContent = currentText;
          input.replaceWith(span);
        }
      });
      input.addEventListener('blur', commitRename, { once: true });

    } else if (action === 'delete') {
      await deleteItem(targetId);
    } else if (action === 'set-type') {
```

**Step 2: Make sure Escape keydown handler doesn't also close overlay while editing**

Find the existing Escape handler (around line 3418):
```js
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      closeLightbox();
      closeContentOverlay();
      closeCtxMenu();
    }
```

No change needed — the rename input handles Escape itself via `stopPropagation` is not required since closing lightbox/overlay is harmless while editing on the card.

---

### Task 5: End-to-end test and commit

**Step 1: Manual test checklist**
- [ ] Right-click PDF card → "Rename" appears, right-click non-PDF → "Rename" hidden
- [ ] Click Rename → `.pdf-title` becomes input with current text, focused+selected
- [ ] Type new name, press Enter → card re-renders with new title
- [ ] Open again — confirm title persisted (Notion was patched)
- [ ] Press Escape mid-edit → original title restored, no save
- [ ] Click outside input (blur) → saves new title
- [ ] Empty input + blur → no save, original title restored

**Step 2: Commit**
```bash
git add web-viewer/index.html web-viewer/viewer.js
git commit -m "feat: add PDF rename via context menu with inline editing"
```

**Step 3: Push**
```bash
git push
```

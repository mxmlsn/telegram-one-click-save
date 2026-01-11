// Track right-clicked element for image detection
document.addEventListener('contextmenu', (e) => {
  window.__tgSaverLastRightClicked = e.target;
}, true);

// ============ TOAST SYSTEM ============

// Single state object - stored on window to persist across any re-injections
window.__TG_ToastState = window.__TG_ToastState || {
  intervalId: null,
  timeLeft: 4000,
  isPaused: false,
  requestId: null,
  isCancelled: false
};

const ToastState = window.__TG_ToastState;

// Listen for messages from background
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'showToast') {
    showSimpleToast(message.state, message.message);
  } else if (message.action === 'showTagSelection') {
    showTagSelectionToast(message.customTags, message.requestId);
    sendResponse({ received: true });
    return true;
  }
});

function showSimpleToast(state, message) {
  let toast = document.getElementById('tg-saver-toast');

  if (state === 'pending') {
    if (toast) toast.remove();
    killTimer();

    toast = document.createElement('div');
    toast.id = 'tg-saver-toast';
    toast.className = 'tg-saver-toast';
    toast.innerHTML = `<span class="tg-saver-icon">↑</span><span class="tg-saver-text">${message}</span>`;
    document.body.appendChild(toast);

    requestAnimationFrame(() => toast.classList.add('tg-saver-visible'));
  } else if (state === 'success' && toast) {
    killTimer();
    toast.innerHTML = `<span class="tg-saver-icon">✓</span><span class="tg-saver-text">${message}</span>`;
    toast.classList.add('tg-saver-success');
    toast.classList.remove('tg-saver-with-tags');

    setTimeout(() => {
      toast.classList.remove('tg-saver-visible');
      setTimeout(() => toast.remove(), 200);
    }, 1200);
  }
}

function showTagSelectionToast(customTags, requestId) {
  let toast = document.getElementById('tg-saver-toast');
  if (toast) toast.remove();
  killTimer();

  // Reset state
  ToastState.requestId = requestId;
  ToastState.isCancelled = false;
  ToastState.isPaused = false;

  chrome.storage.local.get({ timerDuration: 4 }, (result) => {
    ToastState.timeLeft = result.timerDuration * 1000;

    toast = document.createElement('div');
    toast.id = 'tg-saver-toast';
    toast.className = 'tg-saver-toast tg-saver-with-tags';
    toast.dataset.requestId = requestId;

    // Build tags HTML
    let tagsHtml = '';
    if (customTags) {
      const nonEmptyTags = customTags
        .map((tag, index) => ({ ...tag, index }))
        .filter(tag => tag.name && tag.name.trim().length > 0);

      tagsHtml = nonEmptyTags.map(tag => `
        <button class="tg-saver-tag-btn" data-index="${tag.index}">
          <span class="tg-saver-tag-dot" style="background: ${tag.color}"></span>
          <span>${tag.name}</span>
        </button>
      `).join('');
    }

    toast.innerHTML = `
      <div class="tg-saver-toast-content">
        <div class="tg-saver-toast-header">
          <span class="tg-saver-icon">↑</span>
          <span class="tg-saver-text">Select tag</span>
          <button class="tg-saver-cancel-btn" title="Cancel send">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>
        <div class="tg-saver-tags-container">
          ${tagsHtml}
          <button class="tg-saver-tag-btn tg-saver-skip-btn" data-index="-1">
            <span>Skip</span>
          </button>
        </div>
      </div>
      <div class="tg-saver-progress-bar">
        <div class="tg-saver-progress-fill"></div>
      </div>
    `;

    document.body.appendChild(toast);

    // Cancel button
    toast.querySelector('.tg-saver-cancel-btn').addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      cancelSend();
    });

    // Tag buttons - MANUAL CLICK - always sends
    toast.querySelectorAll('.tg-saver-tag-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const index = parseInt(btn.dataset.index);
        const selectedTag = index >= 0 ? customTags[index] : null;
        btn.classList.add('tg-saver-tag-pending');
        doSend(requestId, selectedTag);
      });
    });

    // HOVER - set pause flag
    toast.addEventListener('mouseenter', () => {
      ToastState.isPaused = true;
      const fill = toast.querySelector('.tg-saver-progress-fill');
      if (fill) fill.style.animationPlayState = 'paused';
    });

    toast.addEventListener('mouseleave', () => {
      ToastState.isPaused = false;
      const fill = toast.querySelector('.tg-saver-progress-fill');
      if (fill) fill.style.animationPlayState = 'running';
    });

    requestAnimationFrame(() => {
      toast.classList.add('tg-saver-visible');
      const fill = toast.querySelector('.tg-saver-progress-fill');
      if (fill) {
        fill.style.animation = `tg-saver-progress ${ToastState.timeLeft}ms linear forwards`;
      }
    });

    // Start countdown
    startCountdown(requestId);
  });
}

function startCountdown(requestId) {
  const TICK = 50;

  ToastState.intervalId = setInterval(() => {
    // PAUSED = do nothing, don't decrement
    if (ToastState.isPaused) {
      return;
    }

    // Cancelled = stop
    if (ToastState.isCancelled) {
      killTimer();
      return;
    }

    // Decrement
    ToastState.timeLeft -= TICK;

    // Time's up
    if (ToastState.timeLeft <= 0) {
      killTimer();

      // Final check - if somehow paused at last moment
      if (ToastState.isPaused) {
        return;
      }

      doSend(requestId, null);
    }
  }, TICK);
}

function doSend(requestId, selectedTag) {
  if (ToastState.isCancelled) {
    return;
  }

  killTimer();

  chrome.runtime.sendMessage({
    action: 'tagSelected',
    requestId: requestId,
    selectedTag: selectedTag
  });
}

function cancelSend() {
  ToastState.isCancelled = true;
  killTimer();

  const toast = document.getElementById('tg-saver-toast');
  if (toast) {
    toast.classList.remove('tg-saver-visible');
    setTimeout(() => toast.remove(), 200);
  }

  if (ToastState.requestId) {
    chrome.runtime.sendMessage({
      action: 'cancelSend',
      requestId: ToastState.requestId
    });
  }
}

function killTimer() {
  if (ToastState.intervalId) {
    clearInterval(ToastState.intervalId);
    ToastState.intervalId = null;
  }
}

// ============ SELECTION ICON ============

let selectionIcon = null;
let showSelectionIcon = true;
let savedSelectionText = '';

chrome.runtime.sendMessage({ action: 'getSettings' }, (response) => {
  if (response) {
    showSelectionIcon = response.showSelectionIcon;
  }
});

chrome.storage.onChanged.addListener((changes) => {
  if (changes.showSelectionIcon) {
    showSelectionIcon = changes.showSelectionIcon.newValue;
    if (!showSelectionIcon && selectionIcon) {
      selectionIcon.remove();
      selectionIcon = null;
    }
  }
});

function createSelectionIcon() {
  if (selectionIcon) return selectionIcon;

  selectionIcon = document.createElement('div');
  selectionIcon.id = 'tg-saver-selection-icon';
  selectionIcon.innerHTML = `
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
      <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/>
    </svg>
  `;
  selectionIcon.title = 'Send to Telegram';

  selectionIcon.addEventListener('mousedown', (e) => {
    e.preventDefault();
    e.stopPropagation();

    if (savedSelectionText) {
      chrome.runtime.sendMessage({
        action: 'sendQuoteFromSelection',
        text: savedSelectionText
      });
    }

    hideSelectionIcon();
  });

  document.body.appendChild(selectionIcon);
  return selectionIcon;
}

function showSelectionIconAt(x, y, text) {
  if (!showSelectionIcon) return;

  savedSelectionText = text;
  const icon = createSelectionIcon();

  icon.style.left = `${x}px`;
  icon.style.top = `${y - 40}px`;

  requestAnimationFrame(() => {
    icon.classList.add('tg-saver-selection-visible');
  });
}

function hideSelectionIcon() {
  if (selectionIcon) {
    selectionIcon.classList.remove('tg-saver-selection-visible');
  }
}

document.addEventListener('mouseup', (e) => {
  if (e.target.closest('#tg-saver-selection-icon')) return;

  const selection = window.getSelection();
  const selectedText = selection.toString().trim();

  if (selectedText.length > 0) {
    const range = selection.getRangeAt(0);
    const rect = range.getBoundingClientRect();

    showSelectionIconAt(
      rect.right + window.scrollX,
      rect.top + window.scrollY,
      selectedText
    );
  } else {
    hideSelectionIcon();
  }
});

document.addEventListener('mousedown', (e) => {
  if (!e.target.closest('#tg-saver-selection-icon')) {
    hideSelectionIcon();
  }
});

document.addEventListener('scroll', () => {
  hideSelectionIcon();
}, true);

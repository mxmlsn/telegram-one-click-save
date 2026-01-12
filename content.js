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
  } else if (state === 'success') {
    killTimer();

    // Create new toast if it doesn't exist
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'tg-saver-toast';
      toast.className = 'tg-saver-toast';
      document.body.appendChild(toast);
    }

    toast.innerHTML = `<span class="tg-saver-icon">✓</span><span class="tg-saver-text">${message}</span>`;
    toast.classList.add('tg-saver-success');
    toast.classList.remove('tg-saver-with-tags');

    // Ensure toast is visible
    requestAnimationFrame(() => {
      toast.classList.add('tg-saver-visible');

      // Keep success message visible for exactly 1500ms
      setTimeout(() => {
        toast.classList.remove('tg-saver-visible');
        setTimeout(() => toast.remove(), 200);
      }, 1500);
    });
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

  chrome.storage.local.get({ timerDuration: 4, toastStyle: 'normal' }, (result) => {
    ToastState.timeLeft = result.timerDuration * 1000;
    const isMinimalist = result.toastStyle === 'minimalist';

    toast = document.createElement('div');
    toast.id = 'tg-saver-toast';
    toast.className = 'tg-saver-toast tg-saver-with-tags' + (isMinimalist ? ' tg-saver-minimalist' : '');
    toast.dataset.requestId = requestId;

    // Build tags HTML
    let tagsHtml = '';
    if (customTags) {
      const nonEmptyTags = customTags
        .map((tag, index) => ({ ...tag, index }))
        .filter(tag => tag.name && tag.name.trim().length > 0);

      tagsHtml = nonEmptyTags.map(tag => `
        <button class="tg-saver-tag-btn" data-index="${tag.index}" data-tag-name="${tag.name}">
          <span class="tg-saver-tag-dot" style="background: ${tag.color}"></span>
          <span class="tg-saver-tag-name">${tag.name}</span>
        </button>
      `).join('');
    }

    if (isMinimalist) {
      toast.innerHTML = `
        <div class="tg-saver-toast-content">
          <div class="tg-saver-tags-container">
            ${tagsHtml}
          </div>
        </div>
        <div class="tg-saver-minimalist-loader"></div>
      `;
    } else {
      toast.innerHTML = `
        <div class="tg-saver-toast-content">
          <div class="tg-saver-toast-header">
            <span class="tg-saver-toast-title">Tags?</span>
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
              <div class="tg-saver-timer-loader"></div>
              <span class="tg-saver-skip-btn-text">no tag</span>
            </button>
          </div>
        </div>
      `;
    }

    document.body.appendChild(toast);

    // Cancel button (only in normal mode)
    const cancelBtn = toast.querySelector('.tg-saver-cancel-btn');
    if (cancelBtn) {
      cancelBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        cancelSend();
      });
    }

    // Tag buttons - MANUAL CLICK - always sends
    toast.querySelectorAll('.tg-saver-tag-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();

        // Hide tooltip on click
        const tooltip = document.getElementById('tg-saver-tag-tooltip');
        if (tooltip) tooltip.remove();

        const index = parseInt(btn.dataset.index);
        const selectedTag = index >= 0 ? customTags[index] : null;

        killTimer();

        // Show gray "sending" state immediately
        toast.innerHTML = `<span class="tg-saver-icon">↑</span><span class="tg-saver-text">Sending</span>`;
        toast.classList.remove('tg-saver-with-tags');

        // Don't fade out - let it transform into success toast
        doSend(requestId, selectedTag);
      });
    });

    // Add hover tooltip for minimalist mode (using event delegation on toast)
    if (isMinimalist) {
      toast.addEventListener('mouseover', (e) => {
        const btn = e.target.closest('.tg-saver-tag-btn');
        if (!btn) return;

        const tagName = btn.getAttribute('data-tag-name');
        if (!tagName) return;

        let tooltip = document.getElementById('tg-saver-tag-tooltip');
        if (!tooltip) {
          tooltip = document.createElement('div');
          tooltip.id = 'tg-saver-tag-tooltip';
          tooltip.style.cssText = `
            position: fixed;
            z-index: 2147483647;
            font-family: 'MartianMono', monospace;
            font-size: 14px;
            font-weight: 400;
            color: white;
            text-shadow: 0 1px 3px rgba(0,0,0,0.4), 0 2px 6px rgba(0,0,0,0.2);
            white-space: nowrap;
            pointer-events: none;
            padding: 0;
            margin: 0;
            line-height: 1;
            letter-spacing: -0.02em;
            text-align: right;
            opacity: 0;
            transition: opacity 0.12s ease-out;
          `;
          document.body.appendChild(tooltip);
        }

        tooltip.textContent = tagName;
        const toastRect = toast.getBoundingClientRect();
        const btnRect = btn.getBoundingClientRect();

        // Position to the left of the toast with 10px gap, vertically centered with the button
        tooltip.style.top = (btnRect.top + btnRect.height / 2) + 'px';
        tooltip.style.right = (window.innerWidth - toastRect.left + 10) + 'px';
        tooltip.style.transform = 'translateY(-50%)';

        // Fade in with requestAnimationFrame for smooth animation
        requestAnimationFrame(() => {
          tooltip.style.opacity = '1';
        });
      });

      toast.addEventListener('mouseout', (e) => {
        const btn = e.target.closest('.tg-saver-tag-btn');
        const relatedBtn = e.relatedTarget ? e.relatedTarget.closest('.tg-saver-tag-btn') : null;

        if (btn && btn !== relatedBtn) {
          const tooltip = document.getElementById('tg-saver-tag-tooltip');
          if (tooltip) {
            tooltip.style.opacity = '0';
          }
        }
      });
    }

    // HOVER - set pause flag
    toast.addEventListener('mouseenter', () => {
      ToastState.isPaused = true;
      const loader = isMinimalist
        ? toast.querySelector('.tg-saver-minimalist-loader')
        : toast.querySelector('.tg-saver-timer-loader');
      if (loader) loader.style.animationPlayState = 'paused';
    });

    toast.addEventListener('mouseleave', () => {
      ToastState.isPaused = false;
      const loader = isMinimalist
        ? toast.querySelector('.tg-saver-minimalist-loader')
        : toast.querySelector('.tg-saver-timer-loader');
      if (loader) loader.style.animationPlayState = 'running';
    });

    requestAnimationFrame(() => {
      toast.classList.add('tg-saver-visible');
      const loader = isMinimalist
        ? toast.querySelector('.tg-saver-minimalist-loader')
        : toast.querySelector('.tg-saver-timer-loader');
      if (loader) {
        loader.style.animation = `tg-saver-timer-shrink ${ToastState.timeLeft}ms linear forwards`;
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

      // Show gray "sending" state immediately
      const toast = document.getElementById('tg-saver-toast');
      if (toast) {
        toast.innerHTML = `<span class="tg-saver-icon">↑</span><span class="tg-saver-text">Sending</span>`;
        toast.classList.remove('tg-saver-with-tags');
      }

      // Don't fade out - let it transform into success toast
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

  // Remove tooltip if exists
  const tooltip = document.getElementById('tg-saver-tag-tooltip');
  if (tooltip) tooltip.remove();

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

// ESC key to cancel send
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' || e.key === 'Esc') {
    const toast = document.getElementById('tg-saver-toast');
    if (toast && toast.classList.contains('tg-saver-with-tags')) {
      e.preventDefault();
      e.stopPropagation();
      cancelSend();
    }
  }
}, true);

// Track right-clicked element for image detection
document.addEventListener('contextmenu', (e) => {
  window.__tgSaverLastRightClicked = e.target;
}, true);

// ─── Settings Cache ─────────────────────────────────────────────────────────

let cachedContentSettings = null;

chrome.storage.local.get({
  customTags: [
    { name: 'work', color: '#E64541', id: 'red' },
    { name: 'study', color: '#FFDE42', id: 'yellow' },
    { name: 'refs', color: '#4ED345', id: 'green' },
    { name: 'project1', color: '#377CDE', id: 'blue' },
    { name: '', color: '#BB4FFF', id: 'purple' },
    { name: '', color: '#3D3D3B', id: 'black' },
    { name: '', color: '#DEDEDE', id: 'white' }
  ],
  enableQuickTags: true,
  timerDuration: 4,
  toastStyle: 'normal',
  iconColor: 'circle1',
  themeLight: false
}, (result) => {
  cachedContentSettings = result;
  window.__TG_Settings = result;
});

chrome.storage.onChanged.addListener((changes) => {
  if (!cachedContentSettings) cachedContentSettings = {};
  for (const key of Object.keys(changes)) {
    cachedContentSettings[key] = changes[key].newValue;
    if (window.__TG_Settings) {
      window.__TG_Settings[key] = changes[key].newValue;
    }
    if (key === 'iconColor' && selectionIcon) {
      const img = selectionIcon.querySelector('img');
      if (img) {
        img.src = chrome.runtime.getURL(`icons/icon-${changes.iconColor.newValue}-128.png`);
      }
    }
  }
});

// ─── Toast State ────────────────────────────────────────────────────────────

window.__TG_ToastState = window.__TG_ToastState || {
  intervalId: null,
  timeLeft: 4000,
  isPaused: false,
  requestId: null,
  isCancelled: false
};

const ToastState = window.__TG_ToastState;

// ─── Message Listener ───────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'showToast') {
    showSimpleToast(message.state, message.message);
  } else if (message.action === 'showTagSelection') {
    showTagSelectionToast(message.customTags || cachedContentSettings?.customTags, message.requestId);
    sendResponse({ received: true });
    return true;
  } else if (message.action === 'preShowToast') {
    preShowTagSelection(message.requestId, message.customTags);
    sendResponse({ received: true });
    return true;
  }
});

// ─── Simple Toast (pending / success / error) ───────────────────────────────

function showSimpleToast(state, message) {
  let toast = document.getElementById('tg-saver-toast');
  const themeLight = cachedContentSettings?.themeLight || false;
  const lightClass = themeLight ? ' tg-saver-light' : '';

  if (state === 'pending') {
    if (toast) toast.remove();
    killTimer();

    toast = document.createElement('div');
    toast.id = 'tg-saver-toast';
    toast.className = 'tg-saver-toast' + lightClass;
    toast.innerHTML = `<span class="tg-saver-text">${message}</span>`;
    document.body.appendChild(toast);

    requestAnimationFrame(() => {
      toast.classList.add('tg-saver-visible');
      const text = toast.querySelector('.tg-saver-text');
      if (text) text.classList.add('tg-saver-visible-content');
    });
  } else if (state === 'success') {
    killTimer();
    const wrapper = document.getElementById('tg-saver-toast-wrapper');

    if (wrapper) {
      // Minimalist mode — toast already morphed to "Sending" state
      const wrapperToast = wrapper.querySelector('.tg-saver-toast');
      if (wrapperToast) {
        crossfadeText(wrapperToast, message);
        wrapperToast.classList.add('tg-saver-success');
        setTimeout(() => {
          wrapper.classList.add('tg-saver-fade-out');
          setTimeout(() => wrapper.remove(), 400);
        }, 1500);
      }
    } else {
      // Normal mode
      if (!toast) {
        toast = document.createElement('div');
        toast.id = 'tg-saver-toast';
        toast.className = 'tg-saver-toast' + lightClass;
        document.body.appendChild(toast);
      }

      crossfadeText(toast, message);
      toast.classList.add('tg-saver-success');
      toast.classList.remove('tg-saver-with-tags');
      toast.classList.add('tg-saver-visible');

      setTimeout(() => {
        toast.classList.remove('tg-saver-visible');
        setTimeout(() => toast.remove(), 400);
      }, 1500);
    }
  } else if (state === 'error') {
    killTimer();
    const wrapper = document.getElementById('tg-saver-toast-wrapper');
    const displayToast = wrapper ? wrapper.querySelector('.tg-saver-toast') : toast;

    if (displayToast) {
      displayToast.classList.add('tg-saver-error');
      displayToast.classList.remove('tg-saver-with-tags');
      displayToast.innerHTML = `<span class="tg-saver-text tg-saver-visible-content">${message}</span>`;

      setTimeout(() => {
        if (wrapper) {
          wrapper.classList.add('tg-saver-fade-out');
          setTimeout(() => wrapper.remove(), 400);
        } else {
          displayToast.classList.remove('tg-saver-visible');
          setTimeout(() => displayToast.remove(), 400);
        }
      }, 3000);
    }
  }
}

// Crossfade: fade out old text, fade in new text
function crossfadeText(container, newMessage) {
  const oldText = container.querySelector('.tg-saver-text');
  if (oldText) oldText.classList.remove('tg-saver-visible-content');

  const newText = document.createElement('span');
  newText.className = 'tg-saver-text tg-saver-crossfade-text';
  newText.textContent = newMessage;
  container.appendChild(newText);

  requestAnimationFrame(() => {
    newText.classList.add('tg-saver-visible-content');
    setTimeout(() => { if (oldText) oldText.remove(); }, 150);
  });
}

// ─── Pre-show Tag Selection ─────────────────────────────────────────────────

window.preShowTagSelection = function (requestId, passedTags = null) {
  const tags = passedTags || cachedContentSettings?.customTags || [];
  const hasNonEmptyTags = tags.some(t => t.name && t.name.trim());

  if (hasNonEmptyTags) {
    showTagSelectionToast(tags, requestId);
  } else {
    showSimpleToast('pending', 'Sending');
    if (passedTags || cachedContentSettings) {
      chrome.runtime.sendMessage({
        action: 'tagSelected',
        requestId: requestId,
        selectedTag: null
      });
    }
  }
};

// ─── Morph Animation (shared between click and timer) ───────────────────────

function morphToSending(requestId, selectedTag) {
  const wrapper = document.getElementById('tg-saver-toast-wrapper');
  const toast = document.getElementById('tg-saver-toast');

  if (wrapper) {
    // Minimalist mode — morph to "Sending" state, keep wrapper for success animation
    const wrapperToast = wrapper.querySelector('.tg-saver-toast');
    const currentWidth = wrapperToast ? wrapperToast.offsetWidth : 168;

    const tagsContainer = wrapper.querySelector('.tg-saver-tags-container');
    if (tagsContainer) tagsContainer.style.opacity = '0';

    setTimeout(() => {
      if (wrapperToast) {
        wrapperToast.style.setProperty('--tg-toast-width', currentWidth + 'px');
        wrapperToast.classList.add('tg-saver-animating-width');
        wrapperToast.classList.remove('tg-saver-with-tags', 'tg-saver-minimalist');
        wrapperToast.classList.add('tg-saver-visible');
        wrapperToast.innerHTML = `<span class="tg-saver-text tg-saver-visible-content">Sending</span>`;

        // Force reflow to apply starting width
        wrapperToast.offsetWidth;

        requestAnimationFrame(() => {
          wrapperToast.style.setProperty('--tg-toast-width', '168px');
          setTimeout(() => wrapperToast.classList.remove('tg-saver-animating-width'), 300);
        });
      }
      doSend(requestId, selectedTag);
    }, 150);
  } else if (toast) {
    // Normal mode — morph animation
    const currentHeight = toast.offsetHeight;
    toast.style.height = currentHeight + 'px';

    const content = toast.querySelector('.tg-saver-toast-content');
    if (content) content.style.opacity = '0';

    requestAnimationFrame(() => {
      toast.style.height = '52px';

      setTimeout(() => {
        toast.innerHTML = `<span class="tg-saver-text">Sending</span>`;
        toast.classList.remove('tg-saver-with-tags');
        toast.style.height = '';

        requestAnimationFrame(() => {
          const text = toast.querySelector('.tg-saver-text');
          if (text) text.classList.add('tg-saver-visible-content');
        });

        doSend(requestId, selectedTag);
      }, 200);
    });
  }
}

// ─── Tag Selection Toast ────────────────────────────────────────────────────

function showTagSelectionToast(customTags, requestId) {
  const existingWrapper = document.getElementById('tg-saver-toast-wrapper');
  const existingToast = document.getElementById('tg-saver-toast');
  if (existingWrapper) existingWrapper.remove();
  if (existingToast) existingToast.remove();
  killTimer();

  ToastState.requestId = requestId;
  ToastState.isCancelled = false;
  ToastState.isPaused = false;

  const timerDuration = cachedContentSettings?.timerDuration || 4;
  const toastStyle = cachedContentSettings?.toastStyle || 'normal';
  const themeLight = cachedContentSettings?.themeLight || false;

  ToastState.timeLeft = timerDuration * 1000;
  const isMinimalist = toastStyle === 'minimalist';
  const lightClass = themeLight ? ' tg-saver-light' : '';

  const toast = document.createElement('div');
  toast.id = 'tg-saver-toast';
  toast.className = 'tg-saver-toast tg-saver-with-tags' + (isMinimalist ? ' tg-saver-minimalist' : '') + lightClass;
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
    const wrapper = document.createElement('div');
    wrapper.className = 'tg-saver-minimalist-wrapper' + lightClass;
    wrapper.id = 'tg-saver-toast-wrapper';

    toast.innerHTML = `
      <div class="tg-saver-toast-content">
        <div class="tg-saver-tags-container">
          ${tagsHtml}
          <button class="tg-saver-tag-btn tg-saver-no-tag-btn" data-index="-1" title="Save without tag">
            <span class="tg-saver-no-tag-circle"></span>
          </button>
        </div>
      </div>
      <div class="tg-saver-minimalist-loader"></div>
    `;

    wrapper.appendChild(toast);
    wrapper.dataset.requestId = requestId;
    document.body.appendChild(wrapper);
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
    document.body.appendChild(toast);
  }

  // Cancel button (normal mode only)
  const cancelBtn = toast.querySelector('.tg-saver-cancel-btn');
  if (cancelBtn) {
    cancelBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      cancelSend();
    });
  }

  // Tag buttons click — uses shared morphToSending
  toast.querySelectorAll('.tg-saver-tag-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();

      const tooltip = document.getElementById('tg-saver-tag-tooltip');
      if (tooltip) tooltip.remove();

      const index = parseInt(btn.dataset.index);
      const selectedTag = index >= 0 ? customTags[index] : null;

      killTimer();
      morphToSending(requestId, selectedTag);
    });
  });

  // Hover tooltips for minimalist mode
  if (isMinimalist) {
    setupMinimalistTooltips(toast);
  }

  // Hover pause/resume
  const hoverTarget = isMinimalist ? document.getElementById('tg-saver-toast-wrapper') : toast;
  if (hoverTarget) {
    hoverTarget.addEventListener('mouseenter', () => {
      ToastState.isPaused = true;
      const loader = isMinimalist
        ? toast.querySelector('.tg-saver-minimalist-loader')
        : toast.querySelector('.tg-saver-timer-loader');
      if (loader) loader.style.animationPlayState = 'paused';
    });

    hoverTarget.addEventListener('mouseleave', () => {
      ToastState.isPaused = false;
      const loader = isMinimalist
        ? toast.querySelector('.tg-saver-minimalist-loader')
        : toast.querySelector('.tg-saver-timer-loader');
      if (loader) loader.style.animationPlayState = 'running';
    });
  }

  requestAnimationFrame(() => {
    toast.classList.add('tg-saver-visible');
    const loader = isMinimalist
      ? toast.querySelector('.tg-saver-minimalist-loader')
      : toast.querySelector('.tg-saver-timer-loader');
    if (loader) {
      loader.style.animation = `tg-saver-timer-shrink ${ToastState.timeLeft}ms linear forwards`;
    }
  });

  startCountdown(requestId);
}

// ─── Minimalist Tooltips ────────────────────────────────────────────────────

function setupMinimalistTooltips(toast) {
  toast.addEventListener('mouseover', (e) => {
    const btn = e.target.closest('.tg-saver-tag-btn');
    if (!btn) return;

    const tagName = btn.getAttribute('data-tag-name') ||
      (btn.classList.contains('tg-saver-no-tag-btn') ? 'no tags' : null);
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

    tooltip.style.top = (btnRect.top + btnRect.height / 2) + 'px';
    tooltip.style.right = (window.innerWidth - toastRect.left + 10) + 'px';
    tooltip.style.transform = 'translateY(-50%)';

    requestAnimationFrame(() => { tooltip.style.opacity = '1'; });
  });

  toast.addEventListener('mouseout', (e) => {
    const btn = e.target.closest('.tg-saver-tag-btn');
    const relatedBtn = e.relatedTarget ? e.relatedTarget.closest('.tg-saver-tag-btn') : null;

    if (btn && btn !== relatedBtn) {
      const tooltip = document.getElementById('tg-saver-tag-tooltip');
      if (tooltip) tooltip.style.opacity = '0';
    }
  });
}

// ─── Countdown Timer ────────────────────────────────────────────────────────

function startCountdown(requestId) {
  const TICK = 50;

  ToastState.intervalId = setInterval(() => {
    if (ToastState.isPaused) return;
    if (ToastState.isCancelled) { killTimer(); return; }

    ToastState.timeLeft -= TICK;

    if (ToastState.timeLeft <= 0) {
      killTimer();
      if (ToastState.isPaused) return;
      morphToSending(requestId, null);
    }
  }, TICK);
}

// ─── Send & Cancel ──────────────────────────────────────────────────────────

function doSend(requestId, selectedTag) {
  if (ToastState.isCancelled) return;
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

  const tooltip = document.getElementById('tg-saver-tag-tooltip');
  if (tooltip) tooltip.remove();

  const wrapper = document.getElementById('tg-saver-toast-wrapper');
  const toast = document.getElementById('tg-saver-toast');

  if (wrapper) {
    wrapper.style.opacity = '0';
    setTimeout(() => wrapper.remove(), 200);
  } else if (toast) {
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

// ─── Selection Icon ─────────────────────────────────────────────────────────

let selectionIcon = null;
let showSelectionIcon = true;
let savedSelectionText = '';

chrome.runtime.sendMessage({ action: 'getSettings' }, (response) => {
  if (response) showSelectionIcon = response.showSelectionIcon;
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

  const color = cachedContentSettings?.iconColor || 'circle1';
  const iconUrl = chrome.runtime.getURL(`icons/icon-${color}-128.png`);

  selectionIcon = document.createElement('div');
  selectionIcon.id = 'tg-saver-selection-icon';
  selectionIcon.innerHTML = `<img src="${iconUrl}" style="width: 100%; height: 100%; display: block;">`;
  selectionIcon.title = 'Send to Telegram';

  selectionIcon.addEventListener('mousedown', (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (savedSelectionText) {
      chrome.runtime.sendMessage({ action: 'sendQuoteFromSelection', text: savedSelectionText });
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
  icon.style.left = `${x - 4}px`;
  icon.style.top = `${y - 26}px`;
  requestAnimationFrame(() => { icon.classList.add('tg-saver-selection-visible'); });
}

function hideSelectionIcon() {
  if (selectionIcon) selectionIcon.classList.remove('tg-saver-selection-visible');
}

document.addEventListener('mouseup', (e) => {
  if (e.target.closest('#tg-saver-selection-icon')) return;

  setTimeout(() => {
    const selection = window.getSelection();
    const selectedText = selection.toString().trim();

    if (selectedText.length > 0 && selection.rangeCount > 0) {
      const range = selection.getRangeAt(0);
      const rect = range.getBoundingClientRect();

      if (rect.width > 0 && rect.height > 0) {
        showSelectionIconAt(rect.right + window.scrollX, rect.top + window.scrollY, selectedText);
      } else {
        hideSelectionIcon();
      }
    } else {
      hideSelectionIcon();
    }
  }, 10);
});

document.addEventListener('mousedown', (e) => {
  if (!e.target.closest('#tg-saver-selection-icon')) hideSelectionIcon();
});

document.addEventListener('scroll', () => { hideSelectionIcon(); }, true);

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

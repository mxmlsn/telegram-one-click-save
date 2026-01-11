// Track right-clicked element for image detection
document.addEventListener('contextmenu', (e) => {
  window.__tgSaverLastRightClicked = e.target;
}, true);

// Toast state
let toastTimeout = null;
let toastSendCallback = null;

// Listen for toast messages from background
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'showToast') {
    showToast(message.state, message.message);
  } else if (message.action === 'showTagSelection') {
    showTagSelectionToast(message.customTags, message.requestId);
    sendResponse({ received: true });
    return true;
  }
});

function showToast(state, message) {
  let toast = document.getElementById('tg-saver-toast');

  if (state === 'pending') {
    // Create new toast in pending state
    if (toast) toast.remove();
    clearToastTimeout();

    toast = document.createElement('div');
    toast.id = 'tg-saver-toast';
    toast.className = 'tg-saver-toast';
    toast.innerHTML = `<span class="tg-saver-icon">↑</span><span class="tg-saver-text">${message}</span>`;

    document.body.appendChild(toast);

    requestAnimationFrame(() => {
      toast.classList.add('tg-saver-visible');
    });
  } else if (state === 'success' && toast) {
    // Transition existing toast to success
    clearToastTimeout();
    toast.innerHTML = `<span class="tg-saver-icon">✓</span><span class="tg-saver-text">${message}</span>`;
    toast.classList.add('tg-saver-success');
    toast.classList.remove('tg-saver-with-tags');

    // Remove after delay
    setTimeout(() => {
      toast.classList.remove('tg-saver-visible');
      setTimeout(() => {
        toast.remove();
      }, 200);
    }, 1200);
  }
}

function showTagSelectionToast(customTags, requestId) {
  let toast = document.getElementById('tg-saver-toast');
  if (toast) toast.remove();
  clearToastTimeout();

  toast = document.createElement('div');
  toast.id = 'tg-saver-toast';
  toast.className = 'tg-saver-toast tg-saver-with-tags';

  // Build tag buttons HTML - preserve original grid layout from settings
  let tagsHtml = '';
  let useTwoColumns = false;
  if (customTags) {
    const nonEmptyTags = customTags
      .map((tag, index) => ({ ...tag, index }))
      .filter(tag => tag.name && tag.name.trim().length > 0);

    // Check if any non-empty tag is in the right column (odd index)
    useTwoColumns = nonEmptyTags.some(tag => tag.index % 2 === 1);

    tagsHtml = nonEmptyTags
      .map(tag => `
        <button class="tg-saver-tag-btn" data-index="${tag.index}" data-name="${tag.name}">
          <span class="tg-saver-tag-dot" style="background: ${tag.color}"></span>
          <span>${tag.name}</span>
        </button>
      `).join('');
  }

  const columnsClass = useTwoColumns ? '' : ' tg-saver-single-column';

  toast.innerHTML = `
    <div class="tg-saver-toast-content">
      <div class="tg-saver-toast-header">
        <span class="tg-saver-icon">↑</span>
        <span class="tg-saver-text">Select tag</span>
      </div>
      <div class="tg-saver-tags-container${columnsClass}">
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

  // Add click handlers for tag buttons
  toast.querySelectorAll('.tg-saver-tag-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const index = parseInt(btn.dataset.index);
      const selectedTag = index >= 0 ? customTags[index] : null;
      sendTagSelection(requestId, selectedTag);
    });
  });

  requestAnimationFrame(() => {
    toast.classList.add('tg-saver-visible');
    // Start progress bar animation
    const progressFill = toast.querySelector('.tg-saver-progress-fill');
    if (progressFill) {
      progressFill.style.animation = 'tg-saver-progress 4s linear forwards';
    }
  });

  // Auto-send without tag after 4 seconds
  toastTimeout = setTimeout(() => {
    sendTagSelection(requestId, null);
  }, 4000);
}

function sendTagSelection(requestId, selectedTag) {
  clearToastTimeout();
  chrome.runtime.sendMessage({
    action: 'tagSelected',
    requestId: requestId,
    selectedTag: selectedTag
  });
}

function clearToastTimeout() {
  if (toastTimeout) {
    clearTimeout(toastTimeout);
    toastTimeout = null;
  }
}

// Selection icon functionality
let selectionIcon = null;
let showSelectionIcon = true;
let savedSelectionText = ''; // Store selected text when icon appears

// Get settings on load
chrome.runtime.sendMessage({ action: 'getSettings' }, (response) => {
  if (response) {
    showSelectionIcon = response.showSelectionIcon;
  }
});

// Listen for settings changes
chrome.storage.onChanged.addListener((changes) => {
  if (changes.showSelectionIcon) {
    showSelectionIcon = changes.showSelectionIcon.newValue;
    if (!showSelectionIcon && selectionIcon) {
      selectionIcon.remove();
      selectionIcon = null;
    }
  }
});

// Create selection icon element
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

    // Use saved text since selection may be lost on click
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

  // Save the selected text
  savedSelectionText = text;

  const icon = createSelectionIcon();

  // Position icon above the selection end
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

// Handle text selection
document.addEventListener('mouseup', (e) => {
  // Ignore if clicking on the icon itself
  if (e.target.closest('#tg-saver-selection-icon')) return;

  const selection = window.getSelection();
  const selectedText = selection.toString().trim();

  if (selectedText.length > 0) {
    // Get position of selection end
    const range = selection.getRangeAt(0);
    const rect = range.getBoundingClientRect();

    // Show icon at the end of selection, pass text
    showSelectionIconAt(
      rect.right + window.scrollX,
      rect.top + window.scrollY,
      selectedText
    );
  } else {
    hideSelectionIcon();
  }
});

// Hide icon when clicking elsewhere
document.addEventListener('mousedown', (e) => {
  if (!e.target.closest('#tg-saver-selection-icon')) {
    hideSelectionIcon();
  }
});

// Hide icon on scroll
document.addEventListener('scroll', () => {
  hideSelectionIcon();
}, true);

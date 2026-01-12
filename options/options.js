// Emoji packs definition (red, yellow, green, blue, purple, black, white) - 7 tags only
const EMOJI_PACKS = {
  circle: ['🔴', '🟡', '🟢', '🔵', '🟣', '⚫️', '⚪️'],
  heart: ['❤️', '💛', '💚', '💙', '💜', '🖤', '🤍'],
  soft: ['🍄', '🐤', '🐸', '💧', '🔮', '🌚', '💭']
};

const DEFAULT_SETTINGS = {
  botToken: '',
  chatId: '',
  addScreenshot: true,
  imageCompression: true,
  showLinkPreview: true,
  showSelectionIcon: true,
  quoteMonospace: true,
  iconColor: 'circle1',
  useHashtags: true,
  tagImage: '#image',
  tagLink: '#link',
  tagQuote: '#quote',
  enableQuickTags: true,
  sendWithColor: true,
  timerDuration: 4,
  emojiPack: 'circle',
  toastStyle: 'normal',
  isConnected: false,
  customEmoji: ['🔴', '🟡', '🟢', '🔵', '🟣', '⚫️', '⚪️'],
  // Fixed 7 tags
  customTags: [
    { name: '', color: '#E64541', id: 'red' },
    { name: '', color: '#FFDE42', id: 'yellow' },
    { name: '', color: '#4ED345', id: 'green' },
    { name: '', color: '#377CDE', id: 'blue' },
    { name: '', color: '#BB4FFF', id: 'purple' },
    { name: '', color: '#3D3D3B', id: 'black' },
    { name: '', color: '#DEDEDE', id: 'white' }
  ]
};

// DOM elements
const botTokenInput = document.getElementById('botToken');
const chatIdInput = document.getElementById('chatId');
const addScreenshotInput = document.getElementById('addScreenshot');
const showLinkPreviewInput = document.getElementById('showLinkPreview');
const showSelectionIconInput = document.getElementById('showSelectionIcon');
const quoteMonospaceInput = document.getElementById('quoteMonospace');
const useHashtagsInput = document.getElementById('useHashtags');
const tagImageInput = document.getElementById('tagImage');
const tagLinkInput = document.getElementById('tagLink');
const tagQuoteInput = document.getElementById('tagQuote');
const enableQuickTagsInput = document.getElementById('enableQuickTags');
const saveBtn = document.getElementById('saveBtn'); // Now only for "Save & Connect"
const statusEl = document.getElementById('connectionStatus');
const savedIndicator = document.getElementById('savedIndicator');

// Custom tags elements
const customTagsList = document.getElementById('customTagsList');
const sendWithColorInput = document.getElementById('sendWithColor');
const timerMinusBtn = document.getElementById('timerMinus');
const timerPlusBtn = document.getElementById('timerPlus');
const timerValueDisplay = document.getElementById('timerValue');
const optimalLabel = document.getElementById('optimalLabel');


// Custom tags state
let customTags = [];

// Load custom tags on page open
document.addEventListener('DOMContentLoaded', loadSettings);

// Save & Connect button (only for credentials)
saveBtn.addEventListener('click', saveCredentials);




// Quick tags settings container
const quickTagsSettings = document.getElementById('quickTagsSettings');
// Hashtags settings container
const hashtagsSettings = document.getElementById('hashtagsSettings');

// Image compression input
const imageCompressionInput = document.getElementById('imageCompression');

// New toggle settings
const popupStyleInput = document.getElementById('popupStyleMinimalist');
const themeLightInput = document.getElementById('themeLight');

// Auto-save listeners
const autoSaveInputs = [
  { el: addScreenshotInput, key: 'addScreenshot', type: 'checkbox' },
  { el: showLinkPreviewInput, key: 'showLinkPreview', type: 'checkbox' },
  { el: showSelectionIconInput, key: 'showSelectionIcon', type: 'checkbox' },
  { el: quoteMonospaceInput, key: 'quoteMonospace', type: 'checkbox' },
  { el: useHashtagsInput, key: 'useHashtags', type: 'checkbox' },
  { el: enableQuickTagsInput, key: 'enableQuickTags', type: 'checkbox' },
  { el: sendWithColorInput, key: 'sendWithColor', type: 'checkbox' },
  { el: imageCompressionInput, key: 'imageCompression', type: 'checkbox' },
  { el: tagImageInput, key: 'tagImage', type: 'text' },
  { el: tagLinkInput, key: 'tagLink', type: 'text' },
  { el: tagQuoteInput, key: 'tagQuote', type: 'text' }
];

autoSaveInputs.forEach(item => {
  if (item.type === 'checkbox') {
    item.el.addEventListener('change', () => {
      saveSetting(item.key, item.el.checked);

      // Toggle quick tags settings visibility
      if (item.key === 'enableQuickTags') {
        toggleQuickTagsSettings(item.el.checked);
      }

      // Toggle emoji pack selector visibility
      if (item.key === 'sendWithColor') {
        toggleEmojiPackSettings(item.el.checked);
      }

      // Toggle hashtags settings visibility
      if (item.key === 'useHashtags') {
        toggleHashtagsSettings(item.el.checked);
      }
    });
  } else {
    // For text inputs (tags)
    item.el.addEventListener('blur', () => {
      let val = item.el.value.trim().replace(/\s/g, '');
      if (['tagImage', 'tagLink', 'tagQuote'].includes(item.key)) {
        val = '#' + val;
      }
      saveSetting(item.key, val);
    });

    // Validation (No spaces, no leading digits) for type tags too
    item.el.addEventListener('keydown', (e) => {
      if (e.key === ' ') {
        e.preventDefault();
        showInputError(item.el);
      }
      // Prevent digit as first character
      if (item.el.value.length === 0 && /^\d$/.test(e.key)) {
        e.preventDefault();
        showInputError(item.el);
      }
    });
    item.el.addEventListener('input', (e) => {
      let hasError = false;

      // Remove spaces
      if (e.target.value.includes(' ')) {
        e.target.value = e.target.value.replace(/\s/g, '');
        hasError = true;
      }

      // Check if starts with digit and remove it
      if (/^\d/.test(e.target.value)) {
        e.target.value = e.target.value.replace(/^\d+/, '');
        hasError = true;
      }

      if (hasError) {
        showInputError(item.el);
      }
    });
  }
});

// Radio buttons listeners
document.querySelectorAll('input[name="iconColor"]').forEach(radio => {
  radio.addEventListener('change', (e) => {
    saveSetting('iconColor', e.target.value);
  });
});

document.querySelectorAll('input[name="toastStyle"]').forEach(radio => {
  radio.addEventListener('change', (e) => {
    saveSetting('toastStyle', e.target.value);
  });
});

// Timer duration buttons
if (timerMinusBtn && timerPlusBtn) {
  timerMinusBtn.addEventListener('click', () => {
    let current = parseInt(timerValueDisplay.textContent);
    if (current > 2) {
      updateTimerValue(current - 1);
    }
  });

  timerPlusBtn.addEventListener('click', () => {
    let current = parseInt(timerValueDisplay.textContent);
    if (current < 8) {
      updateTimerValue(current + 1);
    }
  });
}

function updateTimerValue(value) {
  timerValueDisplay.textContent = value;

  if (timerMinusBtn) timerMinusBtn.disabled = value <= 2;
  if (timerPlusBtn) timerPlusBtn.disabled = value >= 8;

  if (optimalLabel) {
    optimalLabel.style.display = value === 4 ? 'inline' : 'none';
  }

  saveSetting('timerDuration', value);
}

// Emoji pack tabs
document.querySelectorAll('.emoji-tab').forEach(tab => {
  tab.addEventListener('click', (e) => {
    const packName = e.currentTarget.dataset.pack;

    // Update active state
    document.querySelectorAll('.emoji-tab').forEach(t => t.classList.remove('active'));
    e.currentTarget.classList.add('active');

    // Update preview
    updateEmojiPreview(packName);

    // Save setting
    saveSetting('emojiPack', packName);
  });
});

// New toggle settings
if (popupStyleInput) {
  popupStyleInput.addEventListener('change', (e) => {
    saveSetting('popupStyleMinimalist', e.target.checked);
  });
}

if (themeLightInput) {
  themeLightInput.addEventListener('change', (e) => {
    saveSetting('themeLight', e.target.checked);
  });
}



async function loadSettings() {
  const settings = await chrome.storage.local.get(DEFAULT_SETTINGS);

  botTokenInput.value = settings.botToken;
  chatIdInput.value = settings.chatId;
  addScreenshotInput.checked = settings.addScreenshot;
  showLinkPreviewInput.checked = settings.showLinkPreview;
  showSelectionIconInput.checked = settings.showSelectionIcon;
  quoteMonospaceInput.checked = settings.quoteMonospace;
  useHashtagsInput.checked = settings.useHashtags;
  tagImageInput.value = settings.tagImage.replace(/^#/, '');
  tagLinkInput.value = settings.tagLink.replace(/^#/, '');
  tagQuoteInput.value = settings.tagQuote.replace(/^#/, '');
  enableQuickTagsInput.checked = settings.enableQuickTags !== false; // Default true
  sendWithColorInput.checked = settings.sendWithColor !== false; // Default true

  // Set timer duration
  const timerDuration = settings.timerDuration || 4;
  timerValueDisplay.textContent = timerDuration;
  if (optimalLabel) {
    optimalLabel.style.display = timerDuration === 4 ? 'inline' : 'none';
  }
  if (timerMinusBtn) timerMinusBtn.disabled = timerDuration <= 2;
  if (timerPlusBtn) timerPlusBtn.disabled = timerDuration >= 8;

  // Set emoji pack selector visibility
  toggleEmojiPackSettings(settings.sendWithColor !== false);

  // Load custom emoji
  console.log('Loading settings customEmoji:', settings.customEmoji);
  if (settings.customEmoji && Array.isArray(settings.customEmoji) && settings.customEmoji.length === 7) {
    // Valid custom emoji saved
  } else {
    // Initialize with default
    await chrome.storage.local.set({ customEmoji: DEFAULT_SETTINGS.customEmoji });
  }

  // Update emoji preview
  updateEmojiPreview(settings.emojiPack || 'circle');

  // Set image compression toggle (checked = photo/true, unchecked = file/false)
  imageCompressionInput.checked = settings.imageCompression;

  // Set radio buttons
  // Set radio buttons
  const iconColor = settings.iconColor || 'circle1';
  const iconRadio = document.querySelector(`input[name="iconColor"][value="${iconColor}"]`);
  if (iconRadio) {
    iconRadio.checked = true;
  }

  const toastStyle = settings.toastStyle || 'normal';
  const toastRadio = document.querySelector(`input[name="toastStyle"][value="${toastStyle}"]`);
  if (toastRadio) {
    toastRadio.checked = true;
  }

  // Set emoji pack tab
  const emojiPack = settings.emojiPack || 'circle';
  document.querySelectorAll('.emoji-tab').forEach(tab => {
    if (tab.dataset.pack === emojiPack) {
      tab.classList.add('active');
    } else {
      tab.classList.remove('active');
    }
  });

  // Set new toggle settings
  if (popupStyleInput) {
    popupStyleInput.checked = settings.popupStyleMinimalist || false;
  }
  if (themeLightInput) {
    themeLightInput.checked = settings.themeLight || false;
  }

  // Load custom tags
  // Ensure we have the structure of 8 tags even if loading old data
  customTags = mergeCustomTags(settings.customTags || []);
  console.log('[loadSettings] About to call renderCustomTags, customTags:', customTags);
  renderCustomTags();
  console.log('[loadSettings] renderCustomTags completed');

  // Toggle quick tags settings visibility based on enableQuickTags
  toggleQuickTagsSettings(settings.enableQuickTags !== false);

  // Toggle hashtags settings visibility based on useHashtags
  toggleHashtagsSettings(settings.useHashtags !== false);
}

function mergeCustomTags(savedTags) {
  const defaultTags = DEFAULT_SETTINGS.customTags;

  // Now we have fixed 7 colors instead of 8
  if (!savedTags || savedTags.length === 0) return defaultTags;

  // Check if saved tags have the new ID structure
  const hasNewStructure = savedTags.every(t => t.id && t.color);

  if (hasNewStructure) {
    // Filter out orange tag if it exists (id === 'orange')
    const filtered = savedTags.filter(t => t.id !== 'orange');
    if (filtered.length !== 7) {
      return defaultTags;
    }
    return filtered;
  }

  // If old structure (dynamic), discard and use defaults
  return defaultTags;
}

async function saveSetting(key, value) {
  await chrome.storage.local.set({ [key]: value });
  showSavedIndicator();
}

function showSavedIndicator() {
  savedIndicator.classList.add('visible');
  setTimeout(() => {
    savedIndicator.classList.remove('visible');
  }, 2000);
}

async function saveCredentials() {
  const botToken = botTokenInput.value.trim();
  const chatId = chatIdInput.value.trim();

  if (!botToken || !chatId) {
    showStatus('Please fill in Bot Token and Chat ID', false);
    return;
  }

  saveBtn.disabled = true;

  // Get current settings to check if this is first connection
  const currentSettings = await chrome.storage.local.get(DEFAULT_SETTINGS);
  const isFirstConnection = !currentSettings.isConnected ||
    currentSettings.botToken !== botToken ||
    currentSettings.chatId !== chatId;

  // Only test connection if credentials changed or not connected
  if (isFirstConnection) {
    showStatus('Checking connection...', null);
    const testResult = await testConnection(botToken, chatId);

    if (!testResult.success) {
      showStatus(testResult.error, false);
      saveBtn.disabled = false;
      return;
    }
  }

  await chrome.storage.local.set({
    botToken,
    chatId,
    isConnected: true
  });

  showStatus(isFirstConnection ? 'Connected & saved!' : 'Saved!', true);
  saveBtn.disabled = false;
}

async function testConnection(botToken, chatId) {
  try {
    const response = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: 'Telegram Instant Saver connected!'
      })
    });

    const data = await response.json();

    if (!data.ok) {
      return { success: false, error: data.description || 'Unknown error' };
    }

    return { success: true };
  } catch (e) {
    return { success: false, error: 'Network error' };
  }
}

function showStatus(message, success) {
  statusEl.textContent = message;
  statusEl.className = 'status-value ' + (success === true ? 'connected' : success === false ? 'error' : '');
  // Removed global failure handling since we use CSS classes now
}

async function resetSettings() {
  // Keep bot credentials, reset everything else
  const currentSettings = await chrome.storage.local.get(['botToken', 'chatId', 'isConnected']);

  const resetData = {
    ...DEFAULT_SETTINGS,
    botToken: currentSettings.botToken || '',
    chatId: currentSettings.chatId || '',
    isConnected: currentSettings.isConnected || false
  };

  await chrome.storage.local.set(resetData);
  await loadSettings();
  showStatus('Settings reset to default', true);
}

// How to section - collapsible with steps
const howtoSection = document.getElementById('howtoSection');
const howtoToggle = document.getElementById('howtoToggle');
const howtoDots = document.getElementById('howtoDots');
const howtoNext = document.getElementById('howtoNext');
const howtoTextContent = document.getElementById('howtoTextContent');
const howtoImageArea = document.querySelector('.howto-image-area .howto-image');
let currentStep = 0;
const totalSteps = 4;

function updateHowtoStep() {
  // Update text steps
  howtoTextContent.querySelectorAll('.howto-step').forEach((step, index) => {
    step.classList.toggle('active', index === currentStep);
  });

  // Update dots
  howtoDots.querySelectorAll('.howto-dot').forEach((dot, index) => {
    dot.classList.toggle('active', index === currentStep);
  });

  // Update image
  if (howtoImageArea) {
    howtoImageArea.dataset.step = currentStep + 1;
  }
}

// Toggle collapse/expand with fade animation for title
function toggleHowtoSection() {
  // Add collapsing class for fade animation
  howtoSection.classList.add('collapsing');

  // Wait for fade out (200ms)
  setTimeout(() => {
    howtoSection.classList.toggle('collapsed');

    // Remove collapsing class early so title fades in before animation ends
    setTimeout(() => {
      howtoSection.classList.remove('collapsing');
    }, 150); // Title appears 150ms into the 300ms animation
  }, 200);
}

// Click on section to expand (only when collapsed)
howtoSection.addEventListener('click', (e) => {
  // Only expand if collapsed and not clicking the toggle button
  if (howtoSection.classList.contains('collapsed') && !e.target.closest('.howto-toggle-btn')) {
    toggleHowtoSection();
  }
});

// Click on toggle button to collapse/expand
howtoToggle.addEventListener('click', (e) => {
  e.stopPropagation(); // Prevent section click event
  toggleHowtoSection();
});

// Dots navigation
howtoDots.addEventListener('click', (e) => {
  e.stopPropagation(); // Prevent section click event
  const dot = e.target.closest('.howto-dot');
  if (dot) {
    currentStep = parseInt(dot.dataset.step) - 1;
    updateHowtoStep();
  }
});

// Next button navigation
howtoNext.addEventListener('click', (e) => {
  e.stopPropagation(); // Prevent section click event
  if (currentStep < totalSteps - 1) {
    currentStep++;
  } else {
    currentStep = 0; // Loop back to first step
  }
  updateHowtoStep();
});

// Initialize
updateHowtoStep();

// Custom tags functions
function renderCustomTags() {
  console.log('[renderCustomTags] Called with customTags:', customTags);
  console.log('[renderCustomTags] customTagsList element:', customTagsList);

  if (!customTagsList) {
    console.error('[renderCustomTags] ERROR: customTagsList is null!');
    return;
  }

  customTagsList.innerHTML = '';

  customTags.forEach((tag, index) => {
    const tagEl = document.createElement('div');
    tagEl.className = 'custom-tag-item';
    tagEl.draggable = true;
    tagEl.dataset.index = index;

    tagEl.innerHTML = `
      <span class="drag-handle">⠿</span>
      <span class="tag-color-dot" style="background: ${tag.color}"></span>
      <input type="text" class="tag-input" value="${tag.name}" placeholder="Tag name" maxlength="12">
    `;

    const input = tagEl.querySelector('input');

    // Auto-save on blur
    input.addEventListener('blur', (e) => {
      customTags[index].name = e.target.value;
      saveCustomTagsOnly();
    });

    // Validations (No spaces, no leading digits)
    input.addEventListener('keydown', (e) => {
      if (e.key === ' ') {
        e.preventDefault();
        showInputError(input);
      }
      // Prevent digit as first character
      if (input.value.length === 0 && /^\d$/.test(e.key)) {
        e.preventDefault();
        showInputError(input);
      }
    });

    input.addEventListener('input', (e) => {
      let hasError = false;

      // Remove spaces
      if (e.target.value.includes(' ')) {
        e.target.value = e.target.value.replace(/\s/g, '');
        hasError = true;
      }

      // Check if starts with digit and remove it
      if (/^\d/.test(e.target.value)) {
        e.target.value = e.target.value.replace(/^\d+/, '');
        hasError = true;
      }

      if (hasError) {
        showInputError(input);
      }
    });

    // Drag events
    tagEl.addEventListener('dragstart', (e) => handleDragStart(e, tagEl));
    tagEl.addEventListener('dragover', (e) => handleDragOver(e, tagEl));
    tagEl.addEventListener('drop', (e) => handleDrop(e, tagEl));
    tagEl.addEventListener('dragend', (e) => handleDragEnd(e));

    customTagsList.appendChild(tagEl);
  });
}

let dragState = {
  draggedElement: null,
  draggedIndex: -1,
  currentIndex: -1,
  ghostElement: null,
  startY: 0,
  offsetY: 0
};

function handleDragStart(e, el) {
  dragState.draggedElement = el;
  dragState.draggedIndex = parseInt(el.dataset.index);
  dragState.currentIndex = dragState.draggedIndex;

  // Calculate offset from top of element
  const rect = el.getBoundingClientRect();
  dragState.startY = rect.top;
  dragState.offsetY = e.clientY - rect.top;

  // Create empty drag image FIRST (synchronously before anything else)
  const emptyImg = document.createElement('img');
  emptyImg.src = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
  emptyImg.style.position = 'absolute';
  emptyImg.style.top = '-9999px';
  document.body.appendChild(emptyImg);
  e.dataTransfer.setDragImage(emptyImg, 0, 0);
  setTimeout(() => emptyImg.remove(), 0);

  el.classList.add('dragging');

  // Create ghost element that follows cursor
  const ghost = el.cloneNode(true);
  ghost.id = 'drag-ghost';
  ghost.style.position = 'fixed';
  ghost.style.left = `${rect.left}px`;
  ghost.style.top = `${rect.top}px`;
  ghost.style.width = `${rect.width}px`;
  ghost.style.pointerEvents = 'none';
  ghost.style.zIndex = '10000';
  ghost.style.opacity = '0.9';
  ghost.classList.remove('dragging');
  ghost.classList.add('ghost-dragging');

  // Disable input in ghost to prevent any interaction
  const ghostInput = ghost.querySelector('input');
  if (ghostInput) {
    ghostInput.disabled = true;
    ghostInput.style.pointerEvents = 'none';
  }

  document.body.appendChild(ghost);
  dragState.ghostElement = ghost;

  e.dataTransfer.effectAllowed = 'move';

  // Add mousemove listener to update ghost position
  document.addEventListener('dragover', updateGhostPosition);
}

function updateGhostPosition(e) {
  if (dragState.ghostElement && e.clientY > 0) {
    dragState.ghostElement.style.top = `${e.clientY - dragState.offsetY}px`;
  }
}

function handleDragOver(e, el) {
  e.preventDefault();

  if (!dragState.draggedElement || dragState.draggedElement === el) return;

  const targetIndex = parseInt(el.dataset.index);

  // Only reorder if we're hovering over a different element
  if (targetIndex !== dragState.currentIndex) {
    // Perform live reorder
    const draggedItem = customTags[dragState.currentIndex];

    // Remove from current position
    customTags.splice(dragState.currentIndex, 1);

    // Insert at new position
    customTags.splice(targetIndex, 0, draggedItem);

    // Update current index
    dragState.currentIndex = targetIndex;

    // Re-render immediately for live feedback
    renderCustomTags();

    // Re-apply dragging class to the element at new position
    const newDraggedEl = customTagsList.querySelector(`[data-index="${targetIndex}"]`);
    if (newDraggedEl) {
      newDraggedEl.classList.add('dragging');
      dragState.draggedElement = newDraggedEl;
    }
  }

  e.dataTransfer.dropEffect = 'move';
  return false;
}

function handleDrop(e) {
  e.preventDefault();
  e.stopPropagation();

  // Save the new order
  saveCustomTagsOnly();

  return false;
}

function handleDragEnd(e) {
  // Remove ghost element
  if (dragState.ghostElement) {
    dragState.ghostElement.remove();
  }

  // Remove mousemove listener
  document.removeEventListener('dragover', updateGhostPosition);

  // Clean up
  document.querySelectorAll('.custom-tag-item').forEach(item => {
    item.classList.remove('dragging', 'over');
  });

  dragState = {
    draggedElement: null,
    draggedIndex: -1,
    currentIndex: -1,
    ghostElement: null,
    startY: 0,
    offsetY: 0
  };
}

function showInputError(input) {
  input.classList.add('error');
  // Optional: show tooltip or toast if needed, but red highlight is usually enough for "no spaces"
  // Let's rely on CSS animation
  setTimeout(() => {
    input.classList.remove('error');
  }, 500);
}

// Remove old add/remove functions
function addCustomTag() { }
function removeCustomTag() { }
function updateAddTagState() { }


async function saveCustomTagsOnly() {
  await chrome.storage.local.set({ customTags });
  showSavedIndicator();
}

function toggleQuickTagsSettings(enabled) {
  if (quickTagsSettings) {
    quickTagsSettings.style.display = enabled ? 'block' : 'none';
  }
  const customTagsListWrapper = document.getElementById('customTagsListWrapper');
  if (customTagsListWrapper) {
    customTagsListWrapper.style.display = enabled ? 'flex' : 'none';
  }
  const quickTagsSettingsAdditional = document.getElementById('quickTagsSettingsAdditional');
  if (quickTagsSettingsAdditional) {
    quickTagsSettingsAdditional.style.display = enabled ? 'block' : 'none';
  }
}

function toggleEmojiPackSettings(enabled) {
  const emojiPackSettings = document.getElementById('emojiPackSettings');
  if (emojiPackSettings) {
    emojiPackSettings.style.display = enabled ? 'block' : 'none';
  }
}

function toggleHashtagsSettings(enabled) {
  if (hashtagsSettings) {
    hashtagsSettings.style.display = enabled ? 'block' : 'none';
  }
}

// Emoji Preview Management
async function updateEmojiPreview(packName) {
  const emojiPreview = document.getElementById('emojiPreview');
  if (!emojiPreview) return;

  if (packName === 'custom') {
    // Show input for custom emoji
    const settings = await chrome.storage.local.get({ customEmoji: DEFAULT_SETTINGS.customEmoji });
    const customEmoji = settings.customEmoji || DEFAULT_SETTINGS.customEmoji;

    emojiPreview.classList.add('editable');
    emojiPreview.innerHTML = `<input type="text" id="customEmojiInput" maxlength="14" value="${customEmoji.join('')}" placeholder="🔴🟡🟢🔵🟣⚫️⚪️">`;

    const input = document.getElementById('customEmojiInput');

    input.addEventListener('input', async (e) => {
      // Parse emoji from input
      const emojis = Array.from(e.target.value).filter(char => {
        // Keep only emoji and special characters that form emoji
        return /\p{Emoji}/u.test(char) || /[\uFE0F\u200D]/u.test(char);
      });

      // Join back and limit to reasonable length for 7 emoji (with modifiers)
      e.target.value = emojis.join('');
    });

    input.addEventListener('blur', async (e) => {
      const emojis = Array.from(e.target.value).filter(char => {
        return /\p{Emoji}/u.test(char) || /[\uFE0F\u200D]/u.test(char);
      });

      // Extract exactly 7 emoji (or use defaults if not enough)
      let finalEmojis = [];
      let currentEmoji = '';

      for (let char of emojis) {
        if (/[\uFE0F\u200D]/u.test(char)) {
          // Modifier or joiner - add to current emoji
          currentEmoji += char;
        } else {
          // New emoji
          if (currentEmoji) {
            finalEmojis.push(currentEmoji);
          }
          currentEmoji = char;
        }

        if (finalEmojis.length >= 7) break;
      }

      // Add last emoji if exists
      if (currentEmoji && finalEmojis.length < 7) {
        finalEmojis.push(currentEmoji);
      }

      // Pad with defaults if needed
      while (finalEmojis.length < 7) {
        finalEmojis.push(DEFAULT_SETTINGS.customEmoji[finalEmojis.length]);
      }

      // Save
      await chrome.storage.local.set({ customEmoji: finalEmojis });
      e.target.value = finalEmojis.join('');
      showSavedIndicator();
    });
  } else {
    // Show read-only preview
    emojiPreview.classList.remove('editable');
    const emojis = EMOJI_PACKS[packName] || EMOJI_PACKS.circle;
    emojiPreview.textContent = emojis.join(' ');
  }
}

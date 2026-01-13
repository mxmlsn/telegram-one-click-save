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
  showLinkPreview: false,
  showSelectionIcon: true,
  quoteMonospace: true,
  iconColor: 'clip1',
  useHashtags: true,
  tagImage: '#image',
  tagLink: '#link',
  tagQuote: '#text',
  enableQuickTags: true,
  sendWithColor: true,
  timerDuration: 4,
  emojiPack: 'circle',
  toastStyle: 'normal',
  popupStyleMinimalist: false,
  themeLight: false,
  isConnected: false,
  customEmoji: ['🔴', '🟡', '🟢', '🔵', '🟣', '⚫️', '⚪️'],
  // Fixed 7 tags
  customTags: [
    { name: 'work', color: '#E64541', id: 'red' },
    { name: 'study', color: '#FFDE42', id: 'yellow' },
    { name: 'refs', color: '#4ED345', id: 'green' },
    { name: 'project1', color: '#377CDE', id: 'blue' },
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
const credentialsSection = document.querySelector('.credentials-section');

// Custom tags elements
const customTagsList = document.getElementById('customTagsList');
const sendWithColorInput = document.getElementById('sendWithColor');
const timerMinusBtn = document.getElementById('timerMinus');
const timerPlusBtn = document.getElementById('timerPlus');
const timerValueDisplay = document.getElementById('timerValue');
const optimalLabel = document.getElementById('optimalLabel');
const howtoSection = document.getElementById('howtoSection');
const columnThird = document.querySelector('.column-third');


// Custom tags state
let customTags = [];

// Load custom tags on page open
document.addEventListener('DOMContentLoaded', loadSettings);

// Save & Connect button (only for credentials)
saveBtn.addEventListener('click', saveCredentials);

// Toggle password visibility
const toggleBotTokenBtn = document.getElementById('toggleBotToken');
if (toggleBotTokenBtn) {
  toggleBotTokenBtn.addEventListener('click', (e) => {
    e.preventDefault();
    const input = document.getElementById('botToken');
    const isPassword = input.type === 'password';
    input.type = isPassword ? 'text' : 'password';
    toggleBotTokenBtn.classList.toggle('showing', isPassword);
  });
}




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

      updateLivePreview();
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
    updateLivePreview();
  });
});

// New toggle settings
if (popupStyleInput) {
  popupStyleInput.addEventListener('change', (e) => {
    saveSetting('popupStyleMinimalist', e.target.checked);
    saveSetting('toastStyle', e.target.checked ? 'minimalist' : 'normal');
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

  // Set initial status and border
  if (!settings.isConnected) {
    showStatus('Enter bot details', 'not-configured');
    credentialsSection.classList.add('not-saved');
    howtoSection.classList.remove('collapsed'); // Expanded by default
    columnThird.classList.add('not-connected');
    saveBtn.disabled = true;
  } else {
    showStatus('All ok and working', 'connected');
    credentialsSection.classList.remove('not-saved');
    howtoSection.classList.add('collapsed'); // Collapsed by default
    columnThird.classList.remove('not-connected');
    saveBtn.classList.add('grayed-out');
    saveBtn.disabled = true;
  }

  // Handle interaction for Save & Connect button
  const handleInteraction = (e) => {
    const hasInfo = botTokenInput.value.trim() !== '' || chatIdInput.value.trim() !== '';
    const isFocusEvent = e.type === 'focus';
    const isInputEvent = e.type === 'input';

    if (hasInfo || isFocusEvent) {
      if (saveBtn.disabled || saveBtn.classList.contains('grayed-out')) {
        saveBtn.disabled = false;
        saveBtn.classList.remove('grayed-out');
      }
    }

    // If everything is empty and it's an input event, maybe we should disable it back?
    // But the requirements say "only when user enters info in one field and touches another button lights up blue"
    // Let's implement that specific logic:
    if (isInputEvent && !hasInfo) {
      saveBtn.disabled = true;
      saveBtn.classList.add('grayed-out');
    }
  };

  botTokenInput.addEventListener('input', handleInteraction);
  chatIdInput.addEventListener('input', handleInteraction);
  botTokenInput.addEventListener('focus', handleInteraction);
  chatIdInput.addEventListener('focus', handleInteraction);

  // Requirements: "enters info in one field and touches another button lights up blue"
  // This is already covered by input/focus, but let's be specific if they want it ONLY on "touching another"
  // Actually "lights up blue" should probably happen as soon as they start typing OR when they switch fields.
  // The user says "vvodit infu v odno pole i kasaetsya drugogo" - which sounds like blur or focus on second field.
  // But usually immediate feedback is better. I'll stick to input/focus.
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
    // Check either the explicit boolean OR the legacy string
    popupStyleInput.checked = settings.popupStyleMinimalist || (settings.toastStyle === 'minimalist');
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

  updateLivePreview();
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
  updateLivePreview();
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
    showStatus('Please fill in Bot Token and Chat ID', 'error');
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
    showStatus('Checking connection...', '');
    const testResult = await testConnection(botToken, chatId);

    if (!testResult.success) {
      showStatus(testResult.error, 'error');
      saveBtn.disabled = false;
      return;
    }
  }

  await chrome.storage.local.set({
    botToken,
    chatId,
    isConnected: true
  });

  showStatus(isFirstConnection ? 'Connected & saved!' : 'Saved!', 'connected');
  credentialsSection.classList.remove('not-saved');
  howtoSection.classList.add('collapsed'); // Collapse after successful connection
  columnThird.classList.remove('not-connected');
  saveBtn.classList.add('grayed-out');
  saveBtn.disabled = true;
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

function showStatus(message, type) {
  statusEl.textContent = message;
  statusEl.className = 'status-value ' + type;
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
  showStatus('Settings reset to default', 'connected');
}

// How to section - collapsible with steps
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
      <input type="text" class="tag-input" value="${tag.name}" placeholder="" maxlength="10">
    `;

    const input = tagEl.querySelector('input');

    // Auto-save on blur
    input.addEventListener('blur', (e) => {
      customTags[index].name = e.target.value;
      saveCustomTagsOnly();
      updateLivePreview();
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
  updateLivePreview();

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

async function saveCustomTagsOnly() {
  await chrome.storage.local.set({ customTags });
  showSavedIndicator();
  updateLivePreview();
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
      updateLivePreview();
    });
  } else {
    // Show read-only preview
    emojiPreview.classList.remove('editable');
    const emojis = EMOJI_PACKS[packName] || EMOJI_PACKS.circle;
    emojiPreview.textContent = emojis.join(' ');
  }
}

// ============================================
// LIVE PREVIEW LOGIC
// ============================================
async function updateLivePreview() {
  const settings = await chrome.storage.local.get(DEFAULT_SETTINGS);

  // 1. Gather Settings
  const addScreenshot = settings.addScreenshot;
  const quoteMonospace = settings.quoteMonospace;
  const useHashtags = settings.useHashtags;
  const enableQuickTags = settings.enableQuickTags !== false;
  const sendWithColor = settings.sendWithColor !== false;
  const showLinkPreview = settings.showLinkPreview; // Social share preview

  // Tags
  const tagImage = useHashtags ? settings.tagImage : '';
  const tagLink = useHashtags ? settings.tagLink : '';
  const tagQuote = useHashtags ? settings.tagQuote : '';

  // Theme Tags (Quick Tags)
  // We need current customTags. They are in global variable `customTags`.
  // Find the first "active" tag (non-empty name) to simulate a selected tag
  const activeCustomTag = customTags.find(t => t.name && t.name.trim().length > 0) || customTags[0];
  const themeTagName = (enableQuickTags && activeCustomTag && activeCustomTag.name) ? `#${activeCustomTag.name}` : '';
  const themeTagColor = (enableQuickTags && activeCustomTag) ? activeCustomTag.color : null;

  // Emoji
  // Identify which emoji to show. 
  // Code uses settings.emojiPack to pick from EMOJI_PACKS or settings.customEmoji
  let emoji = '';
  if (enableQuickTags && sendWithColor) {
    if (settings.emojiPack === 'custom') {
      const customEmojis = settings.customEmoji || DEFAULT_SETTINGS.customEmoji;
      // Map color ID to index? The packs are ordered: red, yellow, green, blue, purple, black, white
      // defaultTags IDs are: red, yellow, green, blue, purple, black, white
      // corresponding indices: 0, 1, 2, 3, 4, 5, 6
      const colorId = activeCustomTag.id;
      const colorMap = { 'red': 0, 'yellow': 1, 'green': 2, 'blue': 3, 'purple': 4, 'black': 5, 'white': 6 };
      const idx = colorMap[colorId] !== undefined ? colorMap[colorId] : 0;
      emoji = customEmojis[idx] || '🔴';
    } else {
      const pack = EMOJI_PACKS[settings.emojiPack || 'circle'];
      const colorId = activeCustomTag.id;
      const colorMap = { 'red': 0, 'yellow': 1, 'green': 2, 'blue': 3, 'purple': 4, 'black': 5, 'white': 6 };
      const idx = colorMap[colorId] !== undefined ? colorMap[colorId] : 0;
      emoji = pack[idx] || '🔴';
    }
  }

  // Signature Construction Function
  const buildSignature = (contentTypeTag, includeDomain = false) => {
    let signature = '';

    // 1. Emoji + Theme Tag
    if (emoji) signature += emoji;
    if (themeTagName) {
      if (emoji) signature += ' '; // space between emoji and tag
      signature += themeTagName;
    }

    // 2. Separator + Content Tag
    if (contentTypeTag) {
      if (signature) signature += ' | ';
      signature += contentTypeTag;
    }

    if (includeDomain) {
      if (signature) signature += ' | ';
      signature += 'wikipedia.org';
    }

    return signature;
  };

  // 2. Update Image Message
  const imageCompression = settings.imageCompression;
  const previewImgBubble = document.querySelector('.preview-image-bubble');
  const previewTagsImage = document.getElementById('previewTagsImage');

  if (previewImgBubble) {
    if (imageCompression) {
      // Photo Mode
      previewImgBubble.innerHTML = `
        <div class="preview-image-container">
          <img src="../prevv/image.jpg" alt="Preview Image">
        </div>
        <div class="preview-bubble-footer">
          <div class="preview-tags-line" id="previewTagsImage"></div>
        </div>
      `;
    } else {
      // File Mode
      previewImgBubble.innerHTML = `
        <div class="preview-file-container">
          <div class="preview-file-icon">
             <img src="../prevv/image.jpg" alt="Preview Image">
             <div class="preview-file-download-arrow">
               <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                 <path d="M7 13l5 5 5-5M12 18V6"></path>
               </svg>
             </div>
          </div>
          <div class="preview-file-info">
            <div class="preview-file-name">image.jpg</div>
            <div class="preview-file-size">53.0 KB — <span class="preview-file-download">Download</span></div>
          </div>
        </div>
        <div class="preview-bubble-footer">
          <div class="preview-tags-line" id="previewTagsImage"></div>
        </div>
      `;
    }

    // Refresh the tag content
    const newTagsEl = previewImgBubble.querySelector('#previewTagsImage');
    if (newTagsEl) {
      newTagsEl.textContent = buildSignature(tagImage, true);
    }
  }

  // 3. Update Link Message
  const previewLinkBubble = document.getElementById('previewLinkBubble');
  if (previewLinkBubble) {
    previewLinkBubble.innerHTML = '';
    previewLinkBubble.className = 'preview-message-bubble preview-link-bubble'; // Reset class

    if (addScreenshot) {
      // SCREENSHOT VIEW (Like Image Message)
      previewLinkBubble.classList.add('preview-image-bubble');

      const imgContainer = document.createElement('div');
      imgContainer.className = 'preview-image-container';
      const img = document.createElement('img');
      img.src = '../prevv/link.jpeg'; // Using user-provided screenshot path
      imgContainer.appendChild(img);

      previewLinkBubble.appendChild(imgContainer);

      // Footer (Caption)
      const footer = document.createElement('div');
      footer.className = 'preview-bubble-footer';
      const sigLine = document.createElement('div');
      sigLine.className = 'preview-tags-line';

      // Signature + Domain
      sigLine.textContent = buildSignature(tagLink, true);

      footer.appendChild(sigLine);
      previewLinkBubble.appendChild(footer);

    } else {
      // TEXT VIEW + Optional Native Preview
      const container = document.createElement('div');
      container.className = 'preview-link-text-only';

      const linkUrl = document.createElement('a');
      linkUrl.className = 'preview-link-url';
      linkUrl.href = '#';
      linkUrl.textContent = 'https://wikipedia.org/wiki/Main_Page';
      container.appendChild(linkUrl);

      // Native Preview Card
      if (showLinkPreview) {
        // Reuse card style but append below text or inside bubble
        const cardWrapper = document.createElement('div');
        cardWrapper.className = 'preview-link-card';
        cardWrapper.style.marginTop = '6px';
        cardWrapper.style.maxWidth = '100%';

        const imgDiv = document.createElement('div');
        imgDiv.className = 'preview-link-image';
        cardWrapper.appendChild(imgDiv);

        const contentDiv = document.createElement('div');
        contentDiv.className = 'preview-link-content';

        const title = document.createElement('div');
        title.className = 'preview-link-title';
        title.textContent = 'Wikipedia, the free encyclopedia';
        contentDiv.appendChild(title);

        const desc = document.createElement('div');
        desc.className = 'preview-link-desc';
        desc.textContent = 'Wikipedia is a free online encyclopedia, created and edited by volunteers around the world.';
        contentDiv.appendChild(desc);

        const domain = document.createElement('div');
        domain.className = 'preview-link-domain';
        domain.textContent = 'wikipedia.org';
        contentDiv.appendChild(domain);

        cardWrapper.appendChild(contentDiv);

        previewLinkBubble.appendChild(container); // Add link text
        previewLinkBubble.appendChild(cardWrapper); // Add preview card below
      } else {
        previewLinkBubble.appendChild(container); // Just link text
      }

      // Footer (Signature Only)
      const footer = document.createElement('div');
      footer.className = 'preview-bubble-footer';

      const sigLine = document.createElement('div');
      sigLine.className = 'preview-tags-line';
      // "ссылка пишется целиком в теле сообщения и рядом с тегами не дублируется" -> implies link is not in footer
      sigLine.textContent = buildSignature(tagLink, false);

      footer.appendChild(sigLine);
      previewLinkBubble.appendChild(footer);
    }
  }

  // 4. Update Text Message
  const previewQuoteText = document.getElementById('previewQuoteText');
  const previewTagsText = document.getElementById('previewTagsText');

  if (previewQuoteText) {
    if (quoteMonospace) {
      previewQuoteText.classList.add('mono-font');
    } else {
      previewQuoteText.classList.remove('mono-font');
    }
  }

  if (previewTagsText) {
    // Text messages always have domain in signature now
    previewTagsText.textContent = buildSignature(tagQuote, true);
  }

  // 5. Update Toast Preview
  renderToastPreview(settings);
}

function renderToastPreview(settings) {
  const wrapper = document.getElementById('previewToastWrapper');
  if (!wrapper) return;

  wrapper.innerHTML = '';

  const isMinimalist = settings.popupStyleMinimalist || settings.toastStyle === 'minimalist';
  const isLight = settings.themeLight;
  const enableQuickTags = settings.enableQuickTags !== false;

  const container = document.querySelector('.preview-toast-container');
  if (container) {
    container.style.display = enableQuickTags ? 'block' : 'none';
  }

  if (!enableQuickTags) return;

  // Create toast element
  const toast = document.createElement('div');
  toast.className = 'tg-saver-toast tg-saver-visible tg-saver-with-tags';
  if (isMinimalist) toast.classList.add('tg-saver-minimalist');
  if (isLight) {
    toast.classList.add('tg-saver-light');
    wrapper.classList.add('tg-saver-light'); // for close btn context
  } else {
    wrapper.classList.remove('tg-saver-light');
  }

  // Content depends on style
  if (isMinimalist) {
    // Minimalist Structure
    const content = document.createElement('div');
    content.className = 'tg-saver-toast-content';

    // Tags Container
    const tagsContainer = document.createElement('div');
    tagsContainer.className = 'tg-saver-tags-container';

    // Add all active custom tags
    const activeTags = customTags.filter(t => t.name && t.name.trim().length > 0);

    if (activeTags.length === 0) {
      // Only "No Tag" button
      const noTagBtn = document.createElement('button');
      noTagBtn.className = 'tg-saver-tag-btn tg-saver-no-tag-btn';
      const circle = document.createElement('div');
      circle.className = 'tg-saver-no-tag-circle';
      noTagBtn.appendChild(circle);
      tagsContainer.appendChild(noTagBtn);
    } else {
      activeTags.forEach(tag => {
        const btn = document.createElement('button');
        btn.className = 'tg-saver-tag-btn';
        const dot = document.createElement('div');
        dot.className = 'tg-saver-tag-dot';
        dot.style.background = tag.color;
        btn.appendChild(dot);
        tagsContainer.appendChild(btn);
      });

      // Add "No Tag" button at the end even with tags
      const noTagBtn = document.createElement('button');
      noTagBtn.className = 'tg-saver-tag-btn tg-saver-no-tag-btn';
      const circle = document.createElement('div');
      circle.className = 'tg-saver-no-tag-circle';
      noTagBtn.appendChild(circle);
      tagsContainer.appendChild(noTagBtn);
    }

    content.appendChild(tagsContainer);
    toast.appendChild(content);

    // Add minimalist loader at the bottom (60% remaining)
    const loader = document.createElement('div');
    loader.className = 'tg-saver-minimalist-loader';
    loader.style.width = '100%';
    loader.style.transform = 'scaleX(0.6)';
    toast.appendChild(loader);

    wrapper.appendChild(toast);
    wrapper.className = 'tg-saver-minimalist-wrapper' + (isLight ? ' tg-saver-light' : '');

  } else {
    // Standard Structure
    const content = document.createElement('div');
    content.className = 'tg-saver-toast-content';

    // Header
    const header = document.createElement('div');
    header.className = 'tg-saver-toast-header';

    const title = document.createElement('div');
    title.className = 'tg-saver-toast-title';
    title.textContent = 'Tags?'; // Or "Save to..."
    header.appendChild(title);

    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'tg-saver-cancel-btn';
    cancelBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>';
    header.appendChild(cancelBtn);

    content.appendChild(header);

    // Tags Container
    const tagsContainer = document.createElement('div');
    tagsContainer.className = 'tg-saver-tags-container';

    const activeTags = customTags.filter(t => t.name && t.name.trim().length > 0);

    if (activeTags.length === 0) {
      // No tag button with timer
      const skipBtn = document.createElement('button');
      skipBtn.className = 'tg-saver-tag-btn tg-saver-skip-btn';
      const timerLoader = document.createElement('div');
      timerLoader.className = 'tg-saver-timer-loader';
      timerLoader.style.width = '100%';
      timerLoader.style.transform = 'scaleX(0.6)';
      skipBtn.appendChild(timerLoader);

      const text = document.createElement('span');
      text.className = 'tg-saver-skip-btn-text';
      text.textContent = 'no tag';
      skipBtn.appendChild(text);
      tagsContainer.appendChild(skipBtn);
    } else {
      activeTags.forEach(tag => {
        const btn = document.createElement('button');
        btn.className = 'tg-saver-tag-btn';

        const dot = document.createElement('div');
        dot.className = 'tg-saver-tag-dot';
        dot.style.background = tag.color;
        btn.appendChild(dot);

        const name = document.createElement('span');
        name.className = 'tg-saver-tag-name';
        name.textContent = tag.name;
        btn.appendChild(name);

        tagsContainer.appendChild(btn);
      });

      // Add "no tag" button with timer
      const skipBtn = document.createElement('button');
      skipBtn.className = 'tg-saver-tag-btn tg-saver-skip-btn';
      const timerLoader = document.createElement('div');
      timerLoader.className = 'tg-saver-timer-loader';
      timerLoader.style.width = '100%';
      timerLoader.style.transform = 'scaleX(0.6)';
      skipBtn.appendChild(timerLoader);

      const text = document.createElement('span');
      text.className = 'tg-saver-skip-btn-text';
      text.textContent = 'no tag';
      skipBtn.appendChild(text);
      tagsContainer.appendChild(skipBtn);
    }

    content.appendChild(tagsContainer);
    toast.appendChild(content);
    wrapper.appendChild(toast);
  }
}

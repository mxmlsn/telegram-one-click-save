// ============================================
// MOCK chrome.storage for local development
// ============================================
const mockStorage = {
  data: {
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
    emojiPack: 'standard',
    toastStyle: 'normal',
    popupStyleMinimalist: false,
    themeLight: false,
    isConnected: false,
    customTags: [
      { name: 'work', color: '#377CDE', id: 'blue' },
      { name: 'personal', color: '#3D3D3B', id: 'black' },
      { name: 'urgent', color: '#4ED345', id: 'green' },
      { name: 'ideas', color: '#BB4FFF', id: 'purple' },
      { name: '', color: '#DEDEDE', id: 'white' },
      { name: 'important', color: '#E64541', id: 'red' },
      { name: '', color: '#EC9738', id: 'orange' },
      { name: '', color: '#FFDE42', id: 'yellow' }
    ]
  },

  get(keys) {
    return new Promise((resolve) => {
      if (typeof keys === 'string') {
        resolve({ [keys]: this.data[keys] });
      } else if (Array.isArray(keys)) {
        const result = {};
        keys.forEach(key => {
          result[key] = this.data[key];
        });
        resolve(result);
      } else {
        // Object with defaults
        const result = { ...keys };
        Object.keys(keys).forEach(key => {
          if (this.data[key] !== undefined) {
            result[key] = this.data[key];
          }
        });
        resolve(result);
      }
    });
  },

  set(items) {
    return new Promise((resolve) => {
      Object.assign(this.data, items);
      console.log('[Mock Storage] Saved:', items);
      resolve();
    });
  }
};

// Mock chrome API
window.chrome = {
  storage: {
    local: mockStorage
  }
};

// ============================================
// Original options.js code below
// ============================================

// Emoji packs definition (red, orange, yellow, green, blue, purple, black, white)
const EMOJI_PACKS = {
  standard: ['🔴', '🟠', '🟡', '🟢', '🔵', '🟣', '⚫️', '⚪️'],
  hearts: ['❤️', '🧡', '💛', '💚', '💙', '💜', '🖤', '🤍'],
  cute: ['🍄', '🍊', '🐤', '🐸', '💧', '🔮', '🌚', '💭'],
  random: ['📌', '☢️', '📒', '🔋', '📪', '☮️', '🎥', '📁']
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
  emojiPack: 'standard',
  toastStyle: 'normal',
  isConnected: false,
  // Fixed 8 tags
  customTags: [
    { name: '', color: '#377CDE', id: 'blue' },
    { name: '', color: '#3D3D3B', id: 'black' },
    { name: '', color: '#4ED345', id: 'green' },
    { name: '', color: '#BB4FFF', id: 'purple' },
    { name: '', color: '#DEDEDE', id: 'white' },
    { name: '', color: '#E64541', id: 'red' },
    { name: '', color: '#EC9738', id: 'orange' },
    { name: '', color: '#FFDE42', id: 'yellow' }
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
const resetBtn = document.getElementById('resetBtn');
const statusEl = document.getElementById('status');
const savedIndicator = document.getElementById('savedIndicator');

// Custom tags elements
const customTagsList = document.getElementById('customTagsList');
const sendWithColorInput = document.getElementById('sendWithColor');
const timerDurationInput = document.getElementById('timerDuration');
const timerValueDisplay = document.getElementById('timerValue');
const optimalLabel = document.querySelector('.optimal-label');


// Custom tags state
let customTags = [];

// Load custom tags on page open
document.addEventListener('DOMContentLoaded', loadSettings);

// Save & Connect button (only for credentials)
saveBtn.addEventListener('click', saveCredentials);

// Reset settings on button click
resetBtn.addEventListener('click', resetSettings);


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

// Timer duration slider
timerDurationInput.addEventListener('input', (e) => {
  const value = parseInt(e.target.value);
  timerValueDisplay.textContent = value;

  // Show "(optimal)" only for value 4
  if (value === 4) {
    optimalLabel.style.display = 'inline';
  } else {
    optimalLabel.style.display = 'none';
  }
});

timerDurationInput.addEventListener('change', (e) => {
  const value = parseInt(e.target.value);
  saveSetting('timerDuration', value);
});

// Emoji pack tabs
document.querySelectorAll('.emoji-tab').forEach(tab => {
  tab.addEventListener('click', (e) => {
    const packName = e.currentTarget.dataset.pack;

    // Update active state
    document.querySelectorAll('.emoji-tab').forEach(t => t.classList.remove('active'));
    e.currentTarget.classList.add('active');

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

// Timer duration slider
timerDurationInput.addEventListener('input', (e) => {
  const value = parseInt(e.target.value);
  timerValueDisplay.textContent = value;

  // Show "(optimal)" only for value 4
  if (value === 4) {
    optimalLabel.style.display = 'inline';
  } else {
    optimalLabel.style.display = 'none';
  }
});

timerDurationInput.addEventListener('change', (e) => {
  const value = parseInt(e.target.value);
  saveSetting('timerDuration', value);
});

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
  timerDurationInput.value = timerDuration;
  timerValueDisplay.textContent = timerDuration;
  optimalLabel.style.display = timerDuration === 4 ? 'inline' : 'none';

  // Set emoji pack selector visibility
  toggleEmojiPackSettings(settings.sendWithColor !== false);

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
  const emojiPack = settings.emojiPack || 'standard';
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

  // If saved tags are old format or empty, stick to default structure but try to preserve names if ids match? 
  // Actually, user wants fixed 8 colors. 
  // Let's assume we always want the 8 fixed colors. 
  // If we have saved data that matches the new structure (has IDs), we use it.
  // If not, we use default.

  if (!savedTags || savedTags.length === 0) return defaultTags;

  // Check if saved tags have the new ID structure
  const hasNewStructure = savedTags.every(t => t.id && t.color);

  if (hasNewStructure) {
    if (savedTags.length !== 8) {
      // If by some reason length is wrong, merge missing defaults
      // But for dragging support, order matters.
      // Let's just return savedTags for now, assuming logic holds.
      return savedTags;
    }
    return savedTags;
  }

  // If old structure (dynamic), discard and use defaults (user accepted this in plan)
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
  // In dev mode, skip actual API call
  console.log('[Mock] Skipping real connection test in dev mode');
  await new Promise(resolve => setTimeout(resolve, 500)); // Simulate delay
  return { success: true };

  /* Production code:
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
  */
}

function showStatus(message, success) {
  statusEl.textContent = message;
  statusEl.className = success === true ? 'success' : success === false ? 'error' : '';
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

// Carousel
const carouselSlides = document.getElementById('carouselSlides');
const carouselDots = document.getElementById('carouselDots');
const carouselPrev = document.getElementById('carouselPrev');
const carouselNext = document.getElementById('carouselNext');
let currentSlide = 0;
const totalSlides = 4;

function updateCarousel() {
  carouselSlides.style.transform = `translateX(-${currentSlide * 100}%)`;

  // Update dots
  carouselDots.querySelectorAll('.carousel-dot').forEach((dot, index) => {
    dot.classList.toggle('active', index === currentSlide);
  });

  // Update arrows
  carouselPrev.disabled = currentSlide === 0;
  carouselNext.disabled = currentSlide === totalSlides - 1;
}

carouselPrev.addEventListener('click', () => {
  if (currentSlide > 0) {
    currentSlide--;
    updateCarousel();
  }
});

carouselNext.addEventListener('click', () => {
  if (currentSlide < totalSlides - 1) {
    currentSlide++;
    updateCarousel();
  }
});

carouselDots.addEventListener('click', (e) => {
  const dot = e.target.closest('.carousel-dot');
  if (dot) {
    currentSlide = parseInt(dot.dataset.step) - 1;
    updateCarousel();
  }
});

// Initialize carousel
updateCarousel();

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

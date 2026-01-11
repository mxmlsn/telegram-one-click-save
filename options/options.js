const DEFAULT_SETTINGS = {
  botToken: '',
  chatId: '',
  addScreenshot: true,
  imageCompression: true,
  showLinkPreview: true,
  showSelectionIcon: true,
  quoteMonospace: true,
  iconColor: 'blue',
  useHashtags: true,
  tagImage: '#image',
  tagLink: '#link',
  tagQuote: '#quote',
  enableQuickTags: true,
  sendWithColor: true,
  timerDuration: 4,
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


// Auto-save listeners
const autoSaveInputs = [
  { el: addScreenshotInput, key: 'addScreenshot', type: 'checkbox' },
  { el: showLinkPreviewInput, key: 'showLinkPreview', type: 'checkbox' },
  { el: showSelectionIconInput, key: 'showSelectionIcon', type: 'checkbox' },
  { el: quoteMonospaceInput, key: 'quoteMonospace', type: 'checkbox' },
  { el: useHashtagsInput, key: 'useHashtags', type: 'checkbox' },
  { el: enableQuickTagsInput, key: 'enableQuickTags', type: 'checkbox' },
  { el: sendWithColorInput, key: 'sendWithColor', type: 'checkbox' },
  { el: tagImageInput, key: 'tagImage', type: 'text' },
  { el: tagLinkInput, key: 'tagLink', type: 'text' },
  { el: tagQuoteInput, key: 'tagQuote', type: 'text' }
];

autoSaveInputs.forEach(item => {
  if (item.type === 'checkbox') {
    item.el.addEventListener('change', () => {
      saveSetting(item.key, item.el.checked);
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

    // Validation (No spaces) for type tags too
    item.el.addEventListener('keydown', (e) => {
      if (e.key === ' ') {
        e.preventDefault();
        showInputError(item.el);
      }
    });
    item.el.addEventListener('input', (e) => {
      if (e.target.value.includes(' ')) {
        e.target.value = e.target.value.replace(/\s/g, '');
        showInputError(item.el);
      }
    });
  }
});

// Radio buttons listeners
document.querySelectorAll('input[name="imageCompression"]').forEach(radio => {
  radio.addEventListener('change', (e) => {
    saveSetting('imageCompression', e.target.value === 'true');
  });
});

document.querySelectorAll('input[name="iconColor"]').forEach(radio => {
  radio.addEventListener('change', (e) => {
    saveSetting('iconColor', e.target.value);
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

  // Set radio buttons
  const compressionValue = settings.imageCompression ? 'true' : 'false';
  document.querySelector(`input[name="imageCompression"][value="${compressionValue}"]`).checked = true;

  const iconColor = settings.iconColor || 'blue';
  document.querySelector(`input[name="iconColor"][value="${iconColor}"]`).checked = true;

  // Load custom tags
  // Ensure we have the structure of 8 tags even if loading old data
  customTags = mergeCustomTags(settings.customTags || []);
  renderCustomTags();
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
  customTagsList.innerHTML = '';

  customTags.forEach((tag, index) => {
    const tagEl = document.createElement('div');
    tagEl.className = 'custom-tag-item';
    tagEl.draggable = true;
    tagEl.dataset.index = index;

    tagEl.innerHTML = `
      <span class="tag-color-dot" style="background: ${tag.color}"></span>
      <input type="text" class="tag-input" value="${tag.name}" placeholder="Tag name" maxlength="12">
    `;

    const input = tagEl.querySelector('input');

    // Auto-save on blur
    input.addEventListener('blur', (e) => {
      customTags[index].name = e.target.value;
      saveCustomTagsOnly();
    });

    // Validations (No spaces)
    input.addEventListener('keydown', (e) => {
      if (e.key === ' ') {
        e.preventDefault();
        showInputError(input);
      }
    });

    input.addEventListener('input', (e) => {
      if (e.target.value.includes(' ')) {
        e.target.value = e.target.value.replace(/\s/g, '');
        showInputError(input);
      }
    });

    // Drag events
    // Using closures to preserve context safely
    tagEl.addEventListener('dragstart', (e) => handleDragStart(e, tagEl));
    tagEl.addEventListener('dragover', (e) => handleDragOver(e, tagEl));
    tagEl.addEventListener('drop', (e) => handleDrop(e, tagEl));
    tagEl.addEventListener('dragenter', (e) => handleDragEnter(e, tagEl));
    tagEl.addEventListener('dragleave', (e) => handleDragLeave(e, tagEl));

    customTagsList.appendChild(tagEl);
  });
}

let dragSrcEl = null;

function handleDragStart(e, el) {
  dragSrcEl = el;
  e.dataTransfer.effectAllowed = 'move';
  e.dataTransfer.setData('text/html', el.innerHTML);
  el.classList.add('dragging');
}

function handleDragOver(e, el) {
  e.preventDefault(); // Necessary for drop to work
  e.dataTransfer.dropEffect = 'move';
  return false;
}

function handleDragEnter(e, el) {
  el.classList.add('over');
}

function handleDragLeave(e, el) {
  el.classList.remove('over');
}

function handleDrop(e, el) {
  e.preventDefault();
  e.stopPropagation();

  // Remove visual feedback
  document.querySelectorAll('.custom-tag-item').forEach(item => {
    item.classList.remove('over', 'dragging');
  });

  if (dragSrcEl && dragSrcEl !== el) {
    const srcIndex = parseInt(dragSrcEl.dataset.index);
    const targetIndex = parseInt(el.dataset.index);

    if (isNaN(srcIndex) || isNaN(targetIndex)) return false;

    // Reorder array
    const item = customTags.splice(srcIndex, 1)[0];
    customTags.splice(targetIndex, 0, item);

    saveCustomTagsOnly().then(() => {
      renderCustomTags();
    });
  }

  return false;
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

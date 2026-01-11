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
  isConnected: false,
  customTags: [] // Array of {name: string, color: string}
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
const newTagColor = document.getElementById('newTagColor');
const newTagName = document.getElementById('newTagName');
const addTagBtn = document.getElementById('addTagBtn');

// Custom tags state
let customTags = [];

// Load settings on page open
document.addEventListener('DOMContentLoaded', loadSettings);

// Save & Connect button (only for credentials)
saveBtn.addEventListener('click', saveCredentials);

// Reset settings on button click
resetBtn.addEventListener('click', resetSettings);

// Add custom tag
addTagBtn.addEventListener('click', () => {
  addCustomTag();
  // We'll autosave customTags inside addCustomTag -> saveCustomTagsOnly
});
newTagName.addEventListener('keypress', (e) => {
  if (e.key === 'Enter') addCustomTag();
});

// Auto-save listeners
const autoSaveInputs = [
  { el: addScreenshotInput, key: 'addScreenshot', type: 'checkbox' },
  { el: showLinkPreviewInput, key: 'showLinkPreview', type: 'checkbox' },
  { el: showSelectionIconInput, key: 'showSelectionIcon', type: 'checkbox' },
  { el: quoteMonospaceInput, key: 'quoteMonospace', type: 'checkbox' },
  { el: useHashtagsInput, key: 'useHashtags', type: 'checkbox' },
  { el: enableQuickTagsInput, key: 'enableQuickTags', type: 'checkbox' },
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
    item.el.addEventListener('blur', () => {
      saveSetting(item.key, item.el.value);
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

async function loadSettings() {
  const settings = await chrome.storage.local.get(DEFAULT_SETTINGS);

  botTokenInput.value = settings.botToken;
  chatIdInput.value = settings.chatId;
  addScreenshotInput.checked = settings.addScreenshot;
  showLinkPreviewInput.checked = settings.showLinkPreview;
  showSelectionIconInput.checked = settings.showSelectionIcon;
  quoteMonospaceInput.checked = settings.quoteMonospace;
  useHashtagsInput.checked = settings.useHashtags;
  tagImageInput.value = settings.tagImage;
  tagLinkInput.value = settings.tagLink;
  tagQuoteInput.value = settings.tagQuote;
  enableQuickTagsInput.checked = settings.enableQuickTags !== false; // Default true

  // Set radio buttons
  const compressionValue = settings.imageCompression ? 'true' : 'false';
  document.querySelector(`input[name="imageCompression"][value="${compressionValue}"]`).checked = true;

  const iconColor = settings.iconColor || 'blue';
  document.querySelector(`input[name="iconColor"][value="${iconColor}"]`).checked = true;

  // Load custom tags
  customTags = settings.customTags || [];
  renderCustomTags();
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
    tagEl.innerHTML = `
      <span class="tag-color-dot" style="background: ${tag.color}"></span>
      <span class="tag-name">${tag.name}</span>
      <button type="button" class="remove-tag-btn" data-index="${index}">&times;</button>
    `;
    customTagsList.appendChild(tagEl);
  });

  // Add click handlers for remove buttons
  customTagsList.querySelectorAll('.remove-tag-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const index = parseInt(e.target.dataset.index);
      removeCustomTag(index);
    });
  });

  // Update add button state
  updateAddTagState();
}

function addCustomTag() {
  const name = newTagName.value.trim();
  const color = newTagColor.value;

  if (!name) return;
  if (customTags.length >= 9) {
    showStatus('Maximum 9 tags allowed', false);
    return;
  }

  customTags.push({ name, color });
  renderCustomTags();

  // Clear input
  newTagName.value = '';

  // Auto-save
  saveCustomTagsOnly();
}

function removeCustomTag(index) {
  customTags.splice(index, 1);
  renderCustomTags();
  saveCustomTagsOnly();
}

function updateAddTagState() {
  const isMaxReached = customTags.length >= 9;
  addTagBtn.disabled = isMaxReached;
  newTagName.disabled = isMaxReached;
  newTagColor.disabled = isMaxReached;
}

async function saveCustomTagsOnly() {
  await chrome.storage.local.set({ customTags });
  showSavedIndicator();
}

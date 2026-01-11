const DEFAULT_SETTINGS = {
  botToken: '',
  chatId: '',
  addScreenshot: true,
  imageCompression: true,
  showLinkPreview: true,
  showSelectionIcon: true,
  iconColor: 'blue',
  tagImage: '#image',
  tagLink: '#link',
  tagQuote: '#quote',
  isConnected: false
};

// DOM elements
const botTokenInput = document.getElementById('botToken');
const chatIdInput = document.getElementById('chatId');
const addScreenshotInput = document.getElementById('addScreenshot');
const showLinkPreviewInput = document.getElementById('showLinkPreview');
const showSelectionIconInput = document.getElementById('showSelectionIcon');
const tagImageInput = document.getElementById('tagImage');
const tagLinkInput = document.getElementById('tagLink');
const tagQuoteInput = document.getElementById('tagQuote');
const saveBtn = document.getElementById('saveBtn');
const statusEl = document.getElementById('status');

// Load settings on page open
document.addEventListener('DOMContentLoaded', loadSettings);

// Save settings on button click
saveBtn.addEventListener('click', saveSettings);

async function loadSettings() {
  const settings = await chrome.storage.local.get(DEFAULT_SETTINGS);

  botTokenInput.value = settings.botToken;
  chatIdInput.value = settings.chatId;
  addScreenshotInput.checked = settings.addScreenshot;
  showLinkPreviewInput.checked = settings.showLinkPreview;
  showSelectionIconInput.checked = settings.showSelectionIcon;
  tagImageInput.value = settings.tagImage;
  tagLinkInput.value = settings.tagLink;
  tagQuoteInput.value = settings.tagQuote;

  // Set radio buttons
  const compressionValue = settings.imageCompression ? 'true' : 'false';
  document.querySelector(`input[name="imageCompression"][value="${compressionValue}"]`).checked = true;

  const iconColor = settings.iconColor || 'blue';
  document.querySelector(`input[name="iconColor"][value="${iconColor}"]`).checked = true;
}

async function saveSettings() {
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

  // Only test connection if credentials changed
  if (isFirstConnection) {
    showStatus('Checking connection...', null);
    const testResult = await testConnection(botToken, chatId);

    if (!testResult.success) {
      showStatus(testResult.error, false);
      saveBtn.disabled = false;
      return;
    }
  }

  // Save all settings
  const settings = {
    botToken,
    chatId,
    addScreenshot: addScreenshotInput.checked,
    imageCompression: document.querySelector('input[name="imageCompression"]:checked').value === 'true',
    showLinkPreview: showLinkPreviewInput.checked,
    showSelectionIcon: showSelectionIconInput.checked,
    iconColor: document.querySelector('input[name="iconColor"]:checked').value,
    tagImage: tagImageInput.value || '#image',
    tagLink: tagLinkInput.value || '#link',
    tagQuote: tagQuoteInput.value || '#quote',
    isConnected: true
  };

  await chrome.storage.local.set(settings);

  showStatus(isFirstConnection ? 'Connected & saved!' : 'Settings saved!', true);
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

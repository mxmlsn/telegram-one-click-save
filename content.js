// Listen for toast messages from background
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'showToast') {
    showToast(message.success, message.message);
  }
});

function showToast(success, message) {
  // Remove existing toast if any
  const existing = document.getElementById('tg-saver-toast');
  if (existing) {
    existing.remove();
  }

  // Create toast element
  const toast = document.createElement('div');
  toast.id = 'tg-saver-toast';
  toast.className = `tg-saver-toast ${success ? 'tg-saver-success' : 'tg-saver-error'}`;

  const icon = success ? '✓' : '✗';
  toast.innerHTML = `<span class="tg-saver-icon">${icon}</span><span class="tg-saver-text">${message}</span>`;

  document.body.appendChild(toast);

  // Trigger animation
  requestAnimationFrame(() => {
    toast.classList.add('tg-saver-visible');
  });

  // Remove after delay
  setTimeout(() => {
    toast.classList.remove('tg-saver-visible');
    setTimeout(() => {
      toast.remove();
    }, 300);
  }, 1500);
}

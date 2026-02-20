// ─── Chrome API Polyfill for Web ─────────────────────────────────────────────
// This script emulates chrome.storage.local and chrome.runtime.sendMessage
// to make the extension viewer work in a standalone web environment.
//
// Usage: include this script BEFORE viewer.js in your HTML.

const PROXY_URL = 'https://stash-cors-proxy.mxmlsn-co.workers.dev';

// ─── chrome.storage.local polyfill (uses localStorage) ───────────────────────
if (typeof chrome === 'undefined') {
  window.chrome = {};
}

if (!chrome.storage) {
  chrome.storage = {
    local: {
      get(keys, callback) {
        const result = {};
        
        if (keys === null) {
          // Get all items
          for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            try {
              result[key] = JSON.parse(localStorage.getItem(key));
            } catch {
              result[key] = localStorage.getItem(key);
            }
          }
        } else if (Array.isArray(keys)) {
          // Get multiple keys
          keys.forEach(key => {
            try {
              result[key] = JSON.parse(localStorage.getItem(key));
            } catch {
              result[key] = localStorage.getItem(key);
            }
          });
        } else if (typeof keys === 'string') {
          // Single key
          try {
            result[keys] = JSON.parse(localStorage.getItem(keys));
          } catch {
            result[keys] = localStorage.getItem(keys);
          }
        } else if (typeof keys === 'object') {
          // Object with defaults
          Object.keys(keys).forEach(key => {
            const stored = localStorage.getItem(key);
            if (stored !== null) {
              try {
                result[key] = JSON.parse(stored);
              } catch {
                result[key] = stored;
              }
            } else {
              result[key] = keys[key]; // default value
            }
          });
        }
        
        if (callback) callback(result);
      },

      set(items, callback) {
        Object.entries(items).forEach(([key, value]) => {
          localStorage.setItem(key, JSON.stringify(value));
        });
        if (callback) callback();
      },

      remove(keys, callback) {
        const arr = Array.isArray(keys) ? keys : [keys];
        arr.forEach(key => localStorage.removeItem(key));
        if (callback) callback();
      },

      clear(callback) {
        localStorage.clear();
        if (callback) callback();
      }
    }
  };
}

// ─── chrome.runtime.sendMessage polyfill (proxy FETCH requests) ──────────────
if (!chrome.runtime) {
  chrome.runtime = {
    lastError: null,

    async sendMessage(message, callback) {
      chrome.runtime.lastError = null;

      // Handle FETCH messages from bgFetch() in viewer.js
      if (message.type === 'FETCH') {
        try {
          const { url, options = {} } = message;
          
          // Parse URL to determine service
          const urlObj = new URL(url);
          let service, path, token;

          // Get credentials from localStorage
          const notionToken = localStorage.getItem('notionToken');
          const botToken = localStorage.getItem('botToken');
          const aiApiKey = localStorage.getItem('aiApiKey');

          // Unwrap JSON strings if needed
          const unwrap = (val) => {
            if (!val) return null;
            try {
              return JSON.parse(val);
            } catch {
              return val;
            }
          };

          const credentials = {
            notionToken: unwrap(notionToken),
            botToken: unwrap(botToken),
            aiApiKey: unwrap(aiApiKey)
          };

          // Detect service from URL
          if (urlObj.hostname === 'api.notion.com') {
            service = 'notion';
            path = urlObj.pathname + urlObj.search;
            token = credentials.notionToken;
          } else if (urlObj.hostname === 'api.telegram.org') {
            service = 'telegram';
            const match = urlObj.pathname.match(/\/bot[^\/]+(\/.+)/);
            path = match ? match[1] + urlObj.search : urlObj.pathname;
            token = credentials.botToken;
          } else if (urlObj.hostname === 'api.anthropic.com') {
            service = 'anthropic';
            path = urlObj.pathname + urlObj.search;
            token = credentials.aiApiKey;
          } else if (urlObj.hostname === 'generativelanguage.googleapis.com') {
            service = 'google';
            path = urlObj.pathname + urlObj.search;
            token = credentials.aiApiKey;
          } else {
            throw new Error(`Unsupported API: ${urlObj.hostname}`);
          }

          // Make request to CORS proxy
          const response = await fetch(PROXY_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              service,
              token,
              path,
              method: options.method || 'POST',
              data: options.body ? JSON.parse(options.body) : undefined
            })
          });

          const text = await response.text();

          // Return response in the same format as background.js
          const result = {
            ok: response.ok,
            status: response.status,
            body: text
          };

          if (callback) callback(result);
        } catch (error) {
          chrome.runtime.lastError = { message: error.message };
          if (callback) callback(null);
        }
      } else {
        // Other message types not supported
        if (callback) callback(null);
      }
    }
  };
}

console.log('[Polyfill] Chrome API emulation loaded for web');

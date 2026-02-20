// ─── CORS Proxy Worker ────────────────────────────────────────────────────────
// This worker proxies requests to Notion, Telegram, and Anthropic APIs
// to bypass CORS restrictions from browser-based clients.
// 
// Privacy: tokens are passed in request body, never stored or logged.

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization'
};

const BASE_URLS = {
  notion: 'https://api.notion.com',
  telegram: 'https://api.telegram.org',
  anthropic: 'https://api.anthropic.com',
  google: 'https://generativelanguage.googleapis.com'
};

export default {
  async fetch(request, env, ctx) {
    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: CORS_HEADERS
      });
    }

    // Only allow POST
    if (request.method !== 'POST') {
      return new Response('Method not allowed', {
        status: 405,
        headers: CORS_HEADERS
      });
    }

    try {
      const body = await request.json();
      const { service, token, path, method = 'POST', data, binary, contentType } = body;

      // Validate service
      if (!BASE_URLS[service]) {
        return new Response(JSON.stringify({ error: 'Invalid service' }), {
          status: 400,
          headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' }
        });
      }

      // Build headers based on service
      const headers = {};
      if (!binary) headers['Content-Type'] = 'application/json';

      if (service === 'notion') {
        headers['Authorization'] = `Bearer ${token}`;
        headers['Notion-Version'] = '2022-06-28';
      } else if (service === 'telegram') {
        // Telegram uses token in URL, not header
      } else if (service === 'anthropic') {
        headers['Authorization'] = `Bearer ${token}`;
        headers['anthropic-version'] = '2023-06-01';
        headers['x-api-key'] = token;
      } else if (service === 'google') {
        // Google uses API key in URL
      }

      // Build URL
      let url = `${BASE_URLS[service]}${path}`;
      if (service === 'telegram') {
        // /file/<path> → file download; otherwise API call
        if (path.startsWith('/file/')) {
          url = `${BASE_URLS[service]}/file/bot${token}/${path.slice(6)}`;
        } else {
          url = `${BASE_URLS[service]}/bot${token}${path}`;
        }
      } else if (service === 'google' && token) {
        url += (url.includes('?') ? '&' : '?') + `key=${token}`;
      }

      // Make request
      const response = await fetch(url, {
        method,
        headers,
        body: data ? JSON.stringify(data) : undefined
      });

      // Binary mode: return raw response with specified Content-Type
      if (binary) {
        const buf = await response.arrayBuffer();
        return new Response(buf, {
          status: response.status,
          headers: {
            ...CORS_HEADERS,
            'Content-Type': contentType || response.headers.get('Content-Type') || 'application/octet-stream',
            'Content-Disposition': 'inline'
          }
        });
      }

      const responseData = await response.text();

      return new Response(responseData, {
        status: response.status,
        headers: {
          ...CORS_HEADERS,
          'Content-Type': 'application/json'
        }
      });

    } catch (error) {
      return new Response(JSON.stringify({ 
        error: 'Proxy error', 
        message: error.message 
      }), {
        status: 500,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' }
      });
    }
  }
};

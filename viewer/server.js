#!/usr/bin/env node
// Minimal proxy server for viewer/index.html
// Bypasses CORS for Notion API (Notion doesn't send Access-Control-Allow-Origin)
// Usage: node viewer/server.js
// Then open: http://localhost:3456

const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const url = require('url');

const PORT = 3456;
const HTML_FILE = path.join(__dirname, 'index.html');

const server = http.createServer((req, res) => {
  const parsed = url.parse(req.url, true);

  // CORS headers for all responses
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, Notion-Version');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  // Proxy: /notion-proxy/* → https://api.notion.com/*
  if (parsed.pathname.startsWith('/notion-proxy/')) {
    const notionPath = parsed.pathname.replace('/notion-proxy', '');
    const options = {
      hostname: 'api.notion.com',
      path: notionPath + (parsed.search || ''),
      method: req.method,
      headers: {
        'Authorization': req.headers['authorization'] || '',
        'Notion-Version': req.headers['notion-version'] || '2022-06-28',
        'Content-Type': 'application/json',
      }
    };

    const proxyReq = https.request(options, (proxyRes) => {
      res.writeHead(proxyRes.statusCode, {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      });
      proxyRes.pipe(res);
    });

    proxyReq.on('error', (e) => {
      res.writeHead(502);
      res.end(JSON.stringify({ error: e.message }));
    });

    req.pipe(proxyReq);
    return;
  }

  // Serve index.html for everything else
  fs.readFile(HTML_FILE, (err, data) => {
    if (err) {
      res.writeHead(404);
      res.end('Not found');
      return;
    }
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(data);
  });
});

server.listen(PORT, () => {
  console.log(`Saves viewer running at http://localhost:${PORT}`);
});

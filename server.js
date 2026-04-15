'use strict';

const express = require('express');
const app = express();
const PORT = 3000;

// Parse raw body as text for all content types
app.use(express.text({ type: '*/*', limit: '10mb' }));

app.all('*', (req, res) => {
    const url = `${req.protocol}://${req.headers.host}${req.originalUrl}`;
    const headers = req.headers;
    const body = typeof req.body === 'string' ? req.body : '';

    const headersHtml = Object.entries(headers)
        .map(([key, value]) => `<tr><td class="key">${esc(key)}</td><td class="value">${esc(String(value))}</td></tr>`)
        .join('\n');

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Request Inspector</title>
  <style>
    body { font-family: monospace; margin: 0; padding: 20px; background: #1e1e2e; color: #cdd6f4; }
    h1 { color: #89b4fa; border-bottom: 1px solid #313244; padding-bottom: 8px; }
    h2 { color: #a6e3a1; margin-top: 30px; }
    .section { background: #181825; border: 1px solid #313244; border-radius: 6px; padding: 16px; margin-bottom: 20px; }
    .url { word-break: break-all; color: #f38ba8; font-size: 1.1em; }
    .method { display: inline-block; background: #89b4fa; color: #1e1e2e; border-radius: 4px; padding: 2px 8px; font-weight: bold; margin-right: 8px; }
    table { width: 100%; border-collapse: collapse; }
    td { padding: 6px 10px; border-bottom: 1px solid #313244; vertical-align: top; }
    td.key { color: #cba6f7; width: 30%; white-space: nowrap; }
    td.value { color: #cdd6f4; word-break: break-all; }
    pre { margin: 0; white-space: pre-wrap; word-break: break-all; color: #fab387; }
    .empty { color: #585b70; font-style: italic; }
  </style>
</head>
<body>
  <h1>🔍 Request Inspector V4</h1>

  <h2>URL</h2>
  <div class="section">
    <span class="method">${esc(req.method)}</span>
    <span class="url">${esc(url)}</span>
  </div>

  <h2>Headers</h2>
  <div class="section">
    <table>
      ${headersHtml}
    </table>
  </div>

  <h2>Body</h2>
  <div class="section">
    ${body ? `<pre>${esc(body)}</pre>` : '<span class="empty">(empty)</span>'}
  </div>
</body>
</html>`;

    res.status(200).type('html').send(html);
});

function esc(str) {
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

app.listen(PORT, '127.0.0.1', () => {
    console.log(`Request Inspector running on http://127.0.0.1:${PORT}`);
});

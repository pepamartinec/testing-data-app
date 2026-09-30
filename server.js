'use strict';

const express = require('express');
const { renderPage, esc } = require('./layout');
const app = express();
const PORT = 3000;

// Parse raw body as text for all content types
app.use(express.text({ type: '*/*', limit: '10mb' }));

app.get('/__env', (req, res) => {
    const rows = Object.entries(process.env)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, value]) => `<tr><td class="key">${esc(key)}</td><td class="value">${esc(String(value))}</td></tr>`)
        .join('\n');

    const content = `
  <h2>Environment Variables</h2>
  <div class="section">
    ${rows ? `<table>${rows}</table>` : '<span class="empty">(none)</span>'}
  </div>`;

    res.status(200).type('html').send(renderPage('env', 'Environment', content));
});

app.all('*', (req, res) => {
    const url = `${req.protocol}://${req.headers.host}${req.originalUrl}`;
    const headers = req.headers;
    const body = typeof req.body === 'string' ? req.body : '';

    const headersHtml = Object.entries(headers)
        .map(([key, value]) => `<tr><td class="key">${esc(key)}</td><td class="value">${esc(String(value))}</td></tr>`)
        .join('\n');

    const content = `
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
  </div>`;

    res.status(200).type('html').send(renderPage('inspector', 'Request Inspector', content));
});

if (require.main === module) {
    app.listen(PORT, '127.0.0.1', () => {
        console.log(`Request Inspector running on http://127.0.0.1:${PORT}`);
    });
}

module.exports = { app };

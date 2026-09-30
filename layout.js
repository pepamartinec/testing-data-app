'use strict';

function renderPage(activeTab, title, content) {
    const tab = (id, href, label) =>
        `<a class="tab${activeTab === id ? ' active' : ''}" href="${href}">${esc(label)}</a>`;

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${esc(title)}</title>
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
    .tabs { display: flex; gap: 4px; border-bottom: 1px solid #313244; margin: 20px 0; }
    .tab { padding: 8px 18px; background: #181825; color: #cdd6f4; text-decoration: none; border: 1px solid #313244; border-bottom: none; border-radius: 6px 6px 0 0; font-size: 0.95em; }
    .tab:hover { background: #313244; }
    .tab.active { background: #313244; color: #89b4fa; font-weight: bold; }
  </style>
</head>
<body>
  <h1>🔍 ${esc(title)}</h1>
  <nav class="tabs">
    ${tab('inspector', '/', 'Request')}
    ${tab('env', '/__env', 'Environment')}
  </nav>
  ${content}
</body>
</html>`;
}

function esc(str) {
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

module.exports = { renderPage, esc };

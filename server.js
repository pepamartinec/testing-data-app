'use strict';

const express = require('express');
const rateLimit = require('express-rate-limit');
const fs = require('fs');
const path = require('path');
const app = express();
const PORT = 3000;

app.use(rateLimit({ windowMs: 60 * 1000, limit: 120 }));

const STYLES = `
    body { font-family: monospace; margin: 0; padding: 20px; background: #1e1e2e; color: #cdd6f4; }
    h1 { color: #89b4fa; border-bottom: 1px solid #313244; padding-bottom: 8px; }
    .nav { margin-bottom: 16px; }
    .nav a { color: #89b4fa; text-decoration: none; }
    .nav a:hover { text-decoration: underline; }
    .path { color: #f38ba8; font-size: 1.1em; margin-bottom: 20px; }
    .section { background: #181825; border: 1px solid #313244; border-radius: 6px; padding: 16px; margin-bottom: 20px; }
    ul { list-style: none; margin: 0; padding: 0; }
    li { padding: 4px 0; border-bottom: 1px solid #313244; }
    li:last-child { border-bottom: none; }
    li a { color: #cdd6f4; text-decoration: none; }
    li a:hover { color: #89b4fa; text-decoration: underline; }
    li.dir a { color: #a6e3a1; }
    pre { margin: 0; white-space: pre-wrap; word-break: break-all; color: #fab387; }
    .error { color: #f38ba8; font-style: italic; }
`;

app.get('*', async (req, res) => {
    const requestedPath = req.query.path || '/';
    const resolvedPath = path.resolve(requestedPath);

    let stat;
    try {
        stat = await fs.promises.stat(resolvedPath);
    } catch (err) {
        const html = page('File Tree Inspector', requestedPath,
            `<p class="error">Error: ${esc(err.message)}</p>`);
        return res.status(404).type('html').send(html);
    }

    if (stat.isDirectory()) {
        let entries;
        try {
            entries = await fs.promises.readdir(resolvedPath, { withFileTypes: true });
        } catch (err) {
            const html = page('File Tree Inspector', requestedPath,
                `<p class="error">Error reading directory: ${esc(err.message)}</p>`);
            return res.status(500).type('html').send(html);
        }

        entries.sort((a, b) => {
            if (a.isDirectory() && !b.isDirectory()) return -1;
            if (!a.isDirectory() && b.isDirectory()) return 1;
            return a.name.localeCompare(b.name);
        });

        const listItems = entries.map(entry => {
            const entryPath = path.join(resolvedPath, entry.name);
            const isDir = entry.isDirectory();
            const label = esc(entry.name) + (isDir ? '/' : '');
            return `<li class="${isDir ? 'dir' : 'file'}"><a href="/?path=${encodeURIComponent(entryPath)}">${label}</a></li>`;
        }).join('\n');

        const content = `<div class="section"><ul>\n${listItems || '<li><span class="error">(empty directory)</span></li>'}\n</ul></div>`;
        const html = page('File Tree Inspector', resolvedPath, content, resolvedPath);
        res.status(200).type('html').send(html);
    } else {
        let content;
        try {
            const raw = await fs.promises.readFile(resolvedPath);
            const text = raw.toString('utf8');
            content = `<div class="section"><pre>${esc(text)}</pre></div>`;
        } catch (err) {
            content = `<p class="error">Error reading file: ${esc(err.message)}</p>`;
        }
        const html = page('File Tree Inspector', resolvedPath, content, resolvedPath);
        res.status(200).type('html').send(html);
    }
});

function page(title, currentPath, content, fsPath) {
    const upPath = fsPath ? path.dirname(fsPath) : null;
    const upLink = upPath && upPath !== fsPath
        ? `<div class="nav"><a href="/?path=${encodeURIComponent(upPath)}">⬆ up</a></div>`
        : '';

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${esc(title)}</title>
  <style>${STYLES}</style>
</head>
<body>
  <h1>🗂 ${esc(title)}</h1>
  ${upLink}
  <div class="path">${esc(currentPath)}</div>
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

app.listen(PORT, '127.0.0.1', () => {
    console.log(`File Tree Inspector running on http://127.0.0.1:${PORT}`);
});

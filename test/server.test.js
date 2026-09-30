'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { startServer } = require('./helpers');

test('request inspector echoes the method and body', async (t) => {
    const base = await startServer(t);

    const res = await fetch(`${base}/hello`, { method: 'POST', body: 'ping-body' });
    const html = await res.text();

    assert.strictEqual(res.status, 200);
    assert.match(html, /<span class="method">POST<\/span>/);
    assert.match(html, /ping-body/);
});

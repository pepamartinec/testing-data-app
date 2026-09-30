'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { startServer } = require('./helpers');
const { sse } = require('../server');
const { parseConfig, LIMITS } = require('../sse');

async function readFrames(res, { until } = {}) {
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    const frames = [];
    let buffer = '';
    for (;;) {
        const { done, value } = await reader.read();
        if (done) {
            return frames;
        }
        buffer += decoder.decode(value, { stream: true });
        let idx;
        while ((idx = buffer.indexOf('\n\n')) !== -1) {
            frames.push({ at: Date.now(), raw: buffer.slice(0, idx) });
            buffer = buffer.slice(idx + 2);
        }
        if (until && until(frames)) {
            await reader.cancel();
            return frames;
        }
    }
}

const eventName = (frame) => (frame.raw.match(/^event: (.*)$/m) || [])[1];
const eventData = (frame) => JSON.parse(frame.raw.match(/^data: (.*)$/m)[1]);
const isComment = (frame) => frame.raw.startsWith(':');

const waitFor = async (check, timeoutMs = 1000) => {
    const deadline = Date.now() + timeoutMs;
    while (!check()) {
        if (Date.now() > deadline) {
            return false;
        }
        await new Promise((r) => setTimeout(r, 10));
    }
    return true;
};

test('parseConfig applies defaults', () => {
    const cfg = parseConfig({});
    assert.deepStrictEqual(cfg, {
        delay: 0,
        interval: 1000,
        duration: 60,
        idleAfter: 0,
        idleFor: 0,
        heartbeat: 0,
        size: 0,
        end: 'close',
    });
});

test('parseConfig clamps values into safe limits', () => {
    const cfg = parseConfig({ interval: '1', duration: '999999999', size: '999999999', delay: '-5', end: 'bogus' });
    assert.strictEqual(cfg.interval, LIMITS.minInterval);
    assert.strictEqual(cfg.duration, LIMITS.maxSeconds);
    assert.strictEqual(cfg.size, LIMITS.maxSize);
    assert.strictEqual(cfg.delay, 0);
    assert.strictEqual(cfg.end, 'close');
});

test('stream sends config, numbered ticks and end, then closes', async (t) => {
    const base = await startServer(t);

    const res = await fetch(`${base}/__sse/stream?interval=20&duration=0.15&size=5`);
    const frames = await readFrames(res);

    assert.strictEqual(res.headers.get('content-type'), 'text/event-stream');
    assert.strictEqual(res.headers.get('x-accel-buffering'), 'no');
    assert.strictEqual(eventName(frames[0]), 'config');
    assert.strictEqual(eventData(frames[0]).interval, 20);
    const ticks = frames.filter((f) => eventName(f) === 'tick').map(eventData);
    assert.ok(ticks.length >= 3, `expected several ticks, got ${ticks.length}`);
    assert.deepStrictEqual(ticks.map((d) => d.seq), ticks.map((_, i) => i + 1));
    assert.strictEqual(ticks[0].pad, 'xxxxx');
    assert.strictEqual(eventName(frames.at(-1)), 'end');
});

test('stream holds headers back for the configured delay', async (t) => {
    const base = await startServer(t);

    const started = Date.now();
    const res = await fetch(`${base}/__sse/stream?delay=0.3&interval=20&duration=0.05`);
    const waited = Date.now() - started;
    await readFrames(res);

    assert.ok(waited >= 290, `headers arrived after ${waited}ms`);
});

test('stream stays silent during the idle window', async (t) => {
    const base = await startServer(t);

    const res = await fetch(`${base}/__sse/stream?interval=20&duration=0.6&idleAfter=0.1&idleFor=0.3`);
    const frames = (await readFrames(res)).filter((f) => eventName(f) === 'tick');

    const gaps = frames.slice(1).map((f, i) => f.at - frames[i].at);
    assert.ok(Math.max(...gaps) >= 280, `largest gap was ${Math.max(...gaps)}ms`);
});

test('stream sends heartbeat comments during the idle window', async (t) => {
    const base = await startServer(t);

    const res = await fetch(`${base}/__sse/stream?interval=20&duration=0.5&idleAfter=0.05&idleFor=0.35&heartbeat=0.1`);
    const frames = await readFrames(res);

    const heartbeats = frames.filter(isComment);
    assert.ok(heartbeats.length >= 2, `got ${heartbeats.length} heartbeats`);
});

test('stream in hang mode keeps the connection open after the end event', async (t) => {
    const base = await startServer(t);

    const res = await fetch(`${base}/__sse/stream?interval=20&duration=0.1&end=hang`);
    const frames = await readFrames(res, { until: (fs) => fs.some((f) => eventName(f) === 'end') });
    assert.ok(frames.length > 0);

    const res2 = await fetch(`${base}/__sse/stream?interval=20&duration=0.05&end=hang`);
    const reader = res2.body.getReader();
    const closed = (async () => {
        for (;;) {
            const { done } = await reader.read();
            if (done) {
                return true;
            }
        }
    })();
    const outcome = await Promise.race([closed, new Promise((r) => setTimeout(() => r(false), 300))]);
    await reader.cancel();

    assert.strictEqual(outcome, false, 'connection closed although end=hang');
});

test('stream is released when the client disconnects', async (t) => {
    const base = await startServer(t);

    const res = await fetch(`${base}/__sse/stream?interval=20&duration=60`);
    await readFrames(res, { until: (fs) => fs.length >= 2 });
    assert.strictEqual(sse.activeStreams(), 1);

    assert.ok(await waitFor(() => sse.activeStreams() === 0), 'stream still active after disconnect');
});

test('stream page renders the SSE tab and form', async (t) => {
    const base = await startServer(t);

    const html = await (await fetch(`${base}/__sse`)).text();

    assert.match(html, /<a class="tab active" href="\/__sse">/);
    assert.match(html, /name="interval"/);
    assert.match(html, /name="idleFor"/);
});

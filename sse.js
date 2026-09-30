'use strict';

const express = require('express');
const { renderPage } = require('./layout');
const { renderSseContent } = require('./sse-page');

const LIMITS = {
    minInterval: 10,
    maxSeconds: 24 * 60 * 60,
    maxSize: 1024 * 1024,
};

const DEFAULTS = {
    delay: 0,
    interval: 1000,
    duration: 60,
    idleAfter: 0,
    idleFor: 0,
    heartbeat: 0,
    size: 0,
    end: 'close',
};

function clampNumber(raw, fallback, min, max) {
    const value = Number(raw);
    if (raw === undefined || raw === '' || !Number.isFinite(value)) {
        return fallback;
    }
    return Math.min(Math.max(value, min), max);
}

function parseConfig(query) {
    const seconds = (key) => clampNumber(query[key], DEFAULTS[key], 0, LIMITS.maxSeconds);
    return {
        delay: seconds('delay'),
        interval: clampNumber(query.interval, DEFAULTS.interval, LIMITS.minInterval, LIMITS.maxSeconds * 1000),
        duration: seconds('duration'),
        idleAfter: seconds('idleAfter'),
        idleFor: seconds('idleFor'),
        heartbeat: seconds('heartbeat'),
        size: Math.floor(clampNumber(query.size, DEFAULTS.size, 0, LIMITS.maxSize)),
        end: query.end === 'hang' ? 'hang' : DEFAULTS.end,
    };
}

function frame(event, data) {
    return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

function createSse() {
    const streams = new Set();
    let nextStreamId = 1;

    function stream(req, res) {
        const cfg = parseConfig(req.query);
        const id = nextStreamId++;
        const connectedAt = Date.now();
        const timers = [];
        let seq = 0;
        let streamStartedAt = 0;

        const log = (msg) => console.log(`[sse #${id}] +${((Date.now() - connectedAt) / 1000).toFixed(3)}s ${msg}`);
        const later = (fn, ms) => timers.push(setTimeout(fn, ms));
        const every = (fn, ms) => timers.push(setInterval(fn, ms));
        const stopTimers = () => timers.splice(0).forEach((timer) => clearTimeout(timer));
        const sinceStart = () => (Date.now() - streamStartedAt) / 1000;
        const inIdleWindow = () => cfg.idleFor > 0 && sinceStart() >= cfg.idleAfter && sinceStart() < cfg.idleAfter + cfg.idleFor;

        streams.add(id);
        log(`connected ${JSON.stringify(cfg)}`);

        res.on('close', () => {
            stopTimers();
            streams.delete(id);
            log(res.writableEnded ? `closed by server after ${seq} ticks` : `client disconnected after ${seq} ticks`);
        });

        const tick = () => {
            if (inIdleWindow()) {
                return;
            }
            seq++;
            res.write(frame('tick', { seq, serverTime: new Date().toISOString(), elapsedMs: Date.now() - connectedAt, pad: 'x'.repeat(cfg.size) }));
        };

        const heartbeat = () => {
            if (inIdleWindow()) {
                res.write(`: heartbeat ${new Date().toISOString()}\n\n`);
            }
        };

        const finish = () => {
            stopTimers();
            res.write(frame('end', { ticks: seq, elapsedMs: Date.now() - connectedAt, end: cfg.end }));
            if (cfg.end === 'hang') {
                log(`sent ${seq} ticks, holding connection open`);
                return;
            }
            res.end();
        };

        const start = () => {
            streamStartedAt = Date.now();
            res.writeHead(200, {
                'Content-Type': 'text/event-stream',
                'Cache-Control': 'no-cache, no-transform',
                'X-Accel-Buffering': 'no',
            });
            res.write(frame('config', { ...cfg, streamId: id, delayedMs: streamStartedAt - connectedAt }));
            every(tick, cfg.interval);
            if (cfg.heartbeat > 0) {
                every(heartbeat, cfg.heartbeat * 1000);
            }
            later(finish, cfg.duration * 1000);
        };

        later(start, cfg.delay * 1000);
    }

    const router = express.Router();
    router.get('/__sse', (req, res) => {
        res.status(200).type('html').send(renderPage('sse', 'SSE Timeouts', renderSseContent(DEFAULTS, LIMITS)));
    });
    router.get('/__sse/stream', stream);

    return { router, activeStreams: () => streams.size };
}

module.exports = { createSse, parseConfig, LIMITS };

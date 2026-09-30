'use strict';

const { esc } = require('./layout');

const FIELDS = [
    { name: 'delay', label: 'First byte delay (s)', help: 'Wait before sending response headers.' },
    { name: 'interval', label: 'Event interval (ms)', help: 'Time between tick events.' },
    { name: 'duration', label: 'Stream duration (s)', help: 'Wall-clock time from headers to the end event.' },
    { name: 'idleAfter', label: 'Idle after (s)', help: 'Start of the silent window.' },
    { name: 'idleFor', label: 'Idle for (s)', help: 'Length of the silent window. 0 = no idle.' },
    { name: 'heartbeat', label: 'Heartbeat (s)', help: 'Comment line every N s during idle. 0 = off.' },
    { name: 'size', label: 'Payload size (bytes)', help: 'Padding in each tick event.' },
];

function renderSseContent(defaults, limits) {
    const inputs = FIELDS.map((f) => `
      <label>
        <span>${esc(f.label)}</span>
        <input type="number" step="any" min="0" name="${f.name}" value="${esc(defaults[f.name])}">
        <small>${esc(f.help)}</small>
      </label>`).join('');

    return `
  <style>
    form.sse { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 12px; }
    form.sse label { display: flex; flex-direction: column; gap: 4px; }
    form.sse input, form.sse select { background: #1e1e2e; color: #cdd6f4; border: 1px solid #313244; border-radius: 4px; padding: 6px; font-family: monospace; }
    form.sse small { color: #585b70; }
    .actions { display: flex; gap: 8px; margin-top: 16px; align-items: center; }
    button { background: #89b4fa; color: #1e1e2e; border: none; border-radius: 4px; padding: 8px 16px; font-family: monospace; font-weight: bold; cursor: pointer; }
    button.stop { background: #f38ba8; }
    button:disabled, button.stop:disabled { background: #45475a; color: #7f849c; cursor: default; }
    .stats { display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 8px; }
    .stat span { display: block; color: #585b70; font-size: 0.85em; }
    .stat b { color: #f9e2af; font-size: 1.1em; }
    #outcome { margin-top: 12px; color: #fab387; }
    #log { max-height: 50vh; overflow: auto; margin: 0; font-size: 0.85em; }
    #log .tick { color: #cdd6f4; }
    #log .heartbeat { color: #585b70; }
    #log .meta { color: #a6e3a1; }
    #log .error { color: #f38ba8; }
    code.cmd { word-break: break-all; color: #cba6f7; }
  </style>

  <h2>Stream settings</h2>
  <div class="section">
    <form class="sse" id="sse-form">
      ${inputs}
      <label>
        <span>At the end</span>
        <select name="end">
          <option value="close">close the connection</option>
          <option value="hang">keep it open, send nothing</option>
        </select>
        <small>What the server does after the end event.</small>
      </label>
    </form>
    <div class="actions">
      <button type="button" id="connect">Connect</button>
      <button type="button" id="disconnect" class="stop" disabled>Disconnect</button>
    </div>
    <p><small>Limits: interval &ge; ${limits.minInterval} ms, times &le; ${limits.maxSeconds} s, payload &le; ${limits.maxSize} bytes.</small></p>
    <p><small>Same stream from a terminal:</small><br><code class="cmd" id="curl"></code></p>
  </div>

  <h2>Connection</h2>
  <div class="section">
    <div class="stats">
      <div class="stat"><span>State</span><b id="s-state">idle</b></div>
      <div class="stat"><span>HTTP status</span><b id="s-status">-</b></div>
      <div class="stat"><span>Time to headers</span><b id="s-ttfb">-</b></div>
      <div class="stat"><span>Elapsed</span><b id="s-elapsed">-</b></div>
      <div class="stat"><span>Since last byte</span><b id="s-silence">-</b></div>
      <div class="stat"><span>Longest silence</span><b id="s-maxgap">-</b></div>
      <div class="stat"><span>Ticks / last seq</span><b id="s-ticks">-</b></div>
      <div class="stat"><span>Bytes received</span><b id="s-bytes">-</b></div>
    </div>
    <div id="outcome"></div>
  </div>

  <h2>Events</h2>
  <div class="section"><pre id="log"></pre></div>

  <script>${clientScript}</script>`;
}

const clientScript = `
(() => {
  const form = document.getElementById('sse-form');
  const connectBtn = document.getElementById('connect');
  const disconnectBtn = document.getElementById('disconnect');
  const logEl = document.getElementById('log');
  const $ = (id) => document.getElementById(id);
  const MAX_LOG_LINES = 2000;
  let run = null;

  const params = () => {
    const q = new URLSearchParams();
    for (const [k, v] of new FormData(form)) {
      if (v !== '') q.set(k, v);
    }
    return q;
  };
  const streamUrl = () => new URL('/__sse/stream?' + params(), location.href).href;
  const fmt = (ms) => (ms / 1000).toFixed(3) + ' s';

  const updateCurl = () => { $('curl').textContent = "curl -N '" + streamUrl() + "'"; };
  form.addEventListener('input', updateCurl);
  updateCurl();

  const log = (cls, text) => {
    const line = document.createElement('div');
    line.className = cls;
    line.textContent = '+' + fmt(performance.now() - run.startedAt).padStart(11) + '  ' + text;
    logEl.appendChild(line);
    while (logEl.childElementCount > MAX_LOG_LINES) logEl.firstChild.remove();
    logEl.scrollTop = logEl.scrollHeight;
  };

  const render = () => {
    if (!run) return;
    const now = run.endedAt ?? performance.now();
    $('s-elapsed').textContent = fmt(now - run.startedAt);
    $('s-silence').textContent = run.lastByteAt ? fmt(now - run.lastByteAt) : '-';
    $('s-maxgap').textContent = fmt(Math.max(run.maxGap, run.lastByteAt ? now - run.lastByteAt : 0));
    $('s-ticks').textContent = run.ticks + ' / ' + run.lastSeq;
    $('s-bytes').textContent = run.bytes;
  };

  const handleFrame = (raw) => {
    if (raw.startsWith(':')) {
      log('heartbeat', raw);
      return;
    }
    const event = (raw.match(/^event: (.*)$/m) || [])[1] || 'message';
    const dataLine = (raw.match(/^data: (.*)$/m) || [])[1] || '';
    if (event !== 'tick') {
      log('meta', event + ' ' + dataLine);
      return;
    }
    const data = JSON.parse(dataLine);
    run.ticks++;
    if (data.seq !== run.lastSeq + 1) log('error', 'sequence gap: expected ' + (run.lastSeq + 1) + ', got ' + data.seq);
    run.lastSeq = data.seq;
    log('tick', 'tick #' + data.seq + ' server ' + data.serverTime + ' (server +' + fmt(data.elapsedMs) + ')');
  };

  const finish = (state, message, cls) => {
    run.endedAt = performance.now();
    clearInterval(run.timer);
    $('s-state').textContent = state;
    $('outcome').textContent = message + ' after ' + fmt(run.endedAt - run.startedAt) + '.';
    log(cls, message);
    render();
    connectBtn.disabled = false;
    disconnectBtn.disabled = true;
  };

  const connect = async () => {
    logEl.textContent = '';
    $('outcome').textContent = '';
    ['s-status', 's-ttfb'].forEach((id) => { $(id).textContent = '-'; });
    run = { startedAt: performance.now(), lastByteAt: 0, maxGap: 0, ticks: 0, lastSeq: 0, bytes: 0, controller: new AbortController() };
    run.timer = setInterval(render, 100);
    connectBtn.disabled = true;
    disconnectBtn.disabled = false;
    $('s-state').textContent = 'waiting for headers';
    log('meta', 'GET ' + streamUrl());

    try {
      const res = await fetch(streamUrl(), { signal: run.controller.signal, cache: 'no-store' });
      run.lastByteAt = performance.now();
      $('s-status').textContent = res.status + ' ' + res.statusText;
      $('s-ttfb').textContent = fmt(run.lastByteAt - run.startedAt);
      $('s-state').textContent = 'streaming';
      log('meta', 'headers ' + res.status + ' content-type=' + res.headers.get('content-type'));
      if (!res.ok || !res.body) {
        const body = await res.text();
        finish('failed', 'Server answered ' + res.status + ': ' + body.slice(0, 300), 'error');
        return;
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        const now = performance.now();
        run.maxGap = Math.max(run.maxGap, now - run.lastByteAt);
        run.lastByteAt = now;
        run.bytes += value.byteLength;
        buffer += decoder.decode(value, { stream: true });
        let idx;
        while ((idx = buffer.indexOf('\\n\\n')) !== -1) {
          handleFrame(buffer.slice(0, idx));
          buffer = buffer.slice(idx + 2);
        }
      }
      finish('closed', 'Connection closed by the other side', 'meta');
    } catch (err) {
      if (run.controller.signal.aborted) {
        finish('aborted', 'Disconnected by you', 'meta');
        return;
      }
      finish('error', 'Network error: ' + err.message, 'error');
    }
  };

  connectBtn.addEventListener('click', connect);
  disconnectBtn.addEventListener('click', () => run && run.controller.abort());
})();
`;

module.exports = { renderSseContent };

# Testing Data App

A minimal Keboola Data App that acts as a request inspector. It accepts any HTTP method on any path and returns an HTML page showing the request's URL, method, headers, and raw body — useful for debugging webhooks, proxies, and outbound HTTP calls from other services.

## What it does

`server.js` is an Express app that:

- Listens on `127.0.0.1:3000`.
- Accepts requests on any method and any path (`app.all('*')`).
- Reads the raw body as text for any content type (up to 10 MB).
- Renders a styled HTML page with the request URL, method, headers, and body.

When deployed as a Keboola Data App, nginx (see `keboola-config/nginx/sites/default.conf`) proxies public traffic from port `8888` to the Node server on `3000`, and supervisord (`keboola-config/supervisord/services/app.conf`) runs `node server.js` with auto-restart.

## SSE Timeouts tab

Open `/__sse` to debug timeouts on long requests. The page opens a Server-Sent Events stream to `/__sse/stream` and shows when bytes arrive, the longest silence, and how the connection ended (closed by the other side, network error, or disconnected by you).

The browser reads the stream with `fetch`, not `EventSource`, so a cut connection is reported and not silently reconnected.

Stream parameters (query string, all optional):

| Parameter   | Unit    | Default | Meaning                                                        |
|-------------|---------|---------|----------------------------------------------------------------|
| `delay`     | s       | 0       | Wait before sending response headers (time to first byte).     |
| `interval`  | ms      | 1000    | Time between `tick` events. Minimum 10.                        |
| `duration`  | s       | 60      | Wall-clock time from headers to the `end` event.               |
| `idleAfter` | s       | 0       | Start of a silent window, counted from the headers.            |
| `idleFor`   | s       | 0       | Length of the silent window. 0 = no silent window.             |
| `heartbeat` | s       | 0       | Send an SSE comment every N s during the silent window.        |
| `size`      | bytes   | 0       | Padding added to each `tick` event. Maximum 1 MiB.             |
| `end`       | -       | `close` | `close` ends the response; `hang` keeps it open with no data.  |

Times are capped at 24 h. Each `tick` carries `seq`, `serverTime` and `elapsedMs`, so lost events show as sequence gaps. The server logs each stream's connect and disconnect to stdout.

From a terminal:

```bash
curl -N 'http://127.0.0.1:8888/__sse/stream?interval=1000&duration=600&idleAfter=5&idleFor=300'
```

The container nginx serves `/__sse/stream` with buffering off and a 24 h read timeout, so a cut shorter than that comes from a layer in front of the app.

## Project layout

```
server.js                               # Express request inspector
layout.js                               # Shared page layout and tabs
sse.js, sse-page.js                     # SSE Timeouts tab
test/                                   # `npm test` (node:test)
package.json                            # Node dependencies (express)
keboola-config/
  setup.sh                              # Runs `npm install` at deploy time
  nginx/sites/default.conf              # Proxies :8888 -> :3000, unbuffered for SSE
  supervisord/services/app.conf         # Supervises `node server.js`
```

## Running locally

```bash
npm install
npm start
```

Then send a request to `http://127.0.0.1:3000/` with any method, headers, or body, and the response will echo them back as HTML.

Example:

```bash
curl -X POST http://127.0.0.1:3000/hello \
  -H 'X-Custom: value' \
  -d '{"foo":"bar"}'
```

## Deploying to Keboola

The `keboola-config/` directory follows the Keboola Data App convention:

- `setup.sh` is executed during deploy and installs dependencies.
- `nginx/sites/*.conf` and `supervisord/services/*.conf` are merged into the runtime container config.

No extra configuration is required — push the repository and the app is served on port `8888`.

## License

MIT — see [LICENSE](LICENSE).

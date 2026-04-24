# Testing Data App

A minimal Keboola Data App that acts as a request inspector. It accepts any HTTP method on any path and returns an HTML page showing the request's URL, method, headers, and raw body — useful for debugging webhooks, proxies, and outbound HTTP calls from other services.

## What it does

`server.js` is an Express app that:

- Listens on `127.0.0.1:3000`.
- Accepts requests on any method and any path (`app.all('*')`).
- Reads the raw body as text for any content type (up to 10 MB).
- Renders a styled HTML page with the request URL, method, headers, and body.

When deployed as a Keboola Data App, nginx (see `keboola-config/nginx/sites/default.conf`) proxies public traffic from port `8888` to the Node server on `3000`, and supervisord (`keboola-config/supervisord/services/app.conf`) runs `node server.js` with auto-restart.

## Project layout

```
server.js                               # Express request inspector
package.json                            # Node dependencies (express)
keboola-config/
  setup.sh                              # Runs `npm install` at deploy time
  nginx/sites/default.conf              # Proxies :8888 -> :3000
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

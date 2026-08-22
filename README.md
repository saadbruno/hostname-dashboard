# Homelab Beacon

A small, vibe-coded, self-hosted dashboard for keeping track of dynamic IP addresses and health signals from homelab machines. Each host reports through a token-protected webhook; the dashboard keeps only its most recent report in SQLite.

## What it does

- Environment-configured dashboard username and password
- Signed, HTTP-only login sessions
- Tokenized webhook URL or `Authorization: Bearer` authentication
- One SQLite row per hostname, updated on every report
- IPv4, IPv6, load averages, uptime, memory, disk, temperature, OS, kernel, and custom metadata
- Online/quiet status, search, filters, detail view, and 30-second auto-refresh
- Responsive UI with no frontend build step

## Quick start with Docker Compose

```bash
cp .env.example .env
```

Edit `.env` and replace all four credential/secret values. Generate good secrets with:

```bash
openssl rand -hex 32
```

That is the only one-time setup. Build and start the app with:

```bash
docker compose up -d
```

Open `http://localhost:3000`. SQLite is stored in the persistent `beacon-data` Docker volume and survives container rebuilds and restarts.

Useful lifecycle commands:

```bash
docker compose logs -f
docker compose restart
docker compose down
docker compose up -d --build
```

`docker compose down` preserves the database. Running `docker compose down -v` also deletes the SQLite volume and all host records.

## Run directly with Node.js

Requires Node.js 20 or newer and the build tools needed by `better-sqlite3`.

```bash
npm install
cp .env.example .env
npm start
```

When running directly, the database is created at `./data/hostname-dashboard.db` by default.

## Send a check-in

The preferred endpoint keeps the token out of proxy access logs:

```bash
curl --request POST http://localhost:3000/api/webhook \
  --header "Authorization: Bearer YOUR_WEBHOOK_TOKEN" \
  --header "Content-Type: application/json" \
  --data '{
    "hostname": "pve-01.home",
    "ipv4": "203.0.113.42",
    "ipv6": "2001:db8::42",
    "uptime_seconds": 86400,
    "load_average": [0.18, 0.24, 0.31],
    "os": "Debian GNU/Linux 12",
    "kernel": "6.1.0-18-amd64",
    "cpu_count": 8,
    "memory_total_bytes": 17179869184,
    "memory_used_bytes": 6442450944
  }'
```

The Discord-style tokenized URL works too:

```text
POST /api/webhook/YOUR_WEBHOOK_TOKEN
```

`hostname` is the only required body field. If the address matching the incoming connection is omitted, the server fills it from the request source. When running behind a trusted reverse proxy, set `TRUST_PROXY=true` so Express uses the forwarded client address.

Unknown JSON fields are preserved as custom metadata and shown in the host details. Additional metadata is limited to 16 KB.

## Install the Linux reporter

[examples/report.sh](examples/report.sh) gathers common Linux health information. It requires `curl` and `jq`; its public-IP lookups use ipify. Copy it onto each host and make it executable:

```bash
chmod +x report.sh
BEACON_URL=https://beacon.example.com \
BEACON_TOKEN=YOUR_WEBHOOK_TOKEN \
HOST_LABEL=pve-01.home \
./report.sh
```

For cron, place the secrets in a root-readable environment file, for example `/etc/homelab-beacon.env`:

```bash
BEACON_URL=https://beacon.example.com
BEACON_TOKEN=YOUR_WEBHOOK_TOKEN
HOST_LABEL=pve-01.home
```

Then add a job with `crontab -e`:

```cron
*/5 * * * * . /etc/homelab-beacon.env && /usr/local/bin/report-homelab.sh >/dev/null 2>&1
```

With the default `OFFLINE_AFTER_MINUTES=15`, a five-minute reporting interval allows two missed reports before a host is marked quiet.

## Environment variables

| Variable | Required | Default | Purpose |
| --- | --- | --- | --- |
| `DASHBOARD_USERNAME` | Yes | — | Login username |
| `DASHBOARD_PASSWORD` | Yes | — | Login password |
| `WEBHOOK_TOKEN` | Yes | — | Secret accepted by the webhook |
| `SESSION_SECRET` | Yes | — | Signs browser session cookies |
| `PORT` | No | `3000` | HTTP listen port |
| `DATABASE_PATH` | No | `./data/hostname-dashboard.db` | SQLite file path |
| `OFFLINE_AFTER_MINUTES` | No | `15` | Time before a host is considered quiet |
| `TRUST_PROXY` | No | `false` | Trust reverse-proxy client IP headers |
| `SECURE_COOKIES` | No | Based on `NODE_ENV` | Require HTTPS for the login cookie |
| `NODE_ENV` | No | — | `production` enables secure cookies |

The Compose setup explicitly defaults `SECURE_COOKIES` to `false` so login works when accessing the container over plain HTTP. When serving it over HTTPS through a reverse proxy, set both `TRUST_PROXY=true` and `SECURE_COOKIES=true` in `.env`.

## API

- `GET /api/health` — basic public health check
- `POST /api/webhook` — submit a host report with a Bearer token
- `POST /api/webhook/:token` — submit a host report with a URL token
- `POST /api/login` / `POST /api/logout` — dashboard session
- `GET /api/hosts` — authenticated latest host list
- `DELETE /api/hosts/:hostname` — authenticated host removal

## Development

```bash
npm run dev
npm test
```

There is no frontend compilation step: Express serves the files in `public/` directly.

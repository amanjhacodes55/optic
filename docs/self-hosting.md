# Self-hosting

Optic needs one process and one writable directory. There is no separate database server.

## Docker (recommended)

```bash
git clone https://github.com/amanjhacodes55/optic.git
cd optic
docker compose up -d
```

Open `http://your-server:3000`, create your account, and add a site. Then set `OPTIC_ALLOW_SIGNUP=false` (in
`docker-compose.yml` or the environment) and restart if you do not want anyone else to sign up. Data lives in the `optic-data` volume (`/data/optic.db` in the
container). Set `OPTIC_SEED_DEMO=1` once to load the Northwind Coffee demo data.

## Node.js

Requires Node.js 20.9 or newer.

```bash
npm ci
npm run build
node .next/standalone/server.js
```

For the standalone server, copy `public/` and `.next/static/` next to it (the Docker image does this), or run
`npx next start` instead.

## Environment variables

| Variable | Default | Purpose |
| --- | --- | --- |
| `OPTIC_ALLOW_SIGNUP` | `true` | `false` closes sign-ups (the first account can always be created). |
| `OPTIC_DB` | `./data/optic.db` | SQLite file location. |
| `OPTIC_SEED_DEMO` | off | Docker only: load demo data on start if the demo site is empty. |
| `PORT` | `3000` | HTTP port. |

## Behind a reverse proxy

Run Optic behind any proxy that terminates TLS (Caddy, nginx, Traefik, a cloud load balancer). Two headers matter:

- `X-Forwarded-For` or `X-Real-IP`: used, with the user agent, for the cookieless visitor hash. Without it every
  visitor looks like the proxy.
- A country header, if your CDN adds one: `CF-IPCountry` (Cloudflare), `X-Vercel-IP-Country`,
  `CloudFront-Viewer-Country`, `Fly-Client-Country` or `X-Country-Code`. Without one, Optic falls back to the
  browser's time zone.

Example Caddyfile:

```
analytics.example.com {
  reverse_proxy localhost:3000
}
```

### Ad blockers

Some blockers block any script named like an analytics tag. Serving Optic from a subdomain of your own site
(`stats.yoursite.com`) avoids most of this, and keeps everything first-party.

## Backups

The database is one file. Use SQLite's online backup so you never copy a half-written file:

```bash
sqlite3 /data/optic.db ".backup '/backups/optic-$(date +%F).db'"
```

## Scaling notes

A single SQLite file comfortably handles sites with millions of pageviews a month on modest hardware. Writes are
serialised, so very high-traffic sites should put Optic on a machine with a fast local disk, not network storage.
Session recordings take the most space (a few KB to a few hundred KB each); lower the sample rate in Settings if
needed.

# HTTP API

All endpoints return JSON. Times are Unix milliseconds unless noted.

## Public endpoints (used by the tracker)

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/api/config?site=ID&tz=Zone` | Tracker configuration: identity mode, consent requirement, replay settings, tag rules. Cached for 60 s. |
| `POST` | `/api/collect` | A batch of browser events. Body is `text/plain` JSON so `sendBeacon` needs no CORS preflight. |
| `POST` | `/api/replay` | A chunk of rrweb events for one recording. |

Bots (by user agent, including headless browsers) are dropped with `204`. Each IP is rate limited to 600 collect
requests a minute.

### `POST /api/collect`

```json
{
  "s": "site-id",
  "cid": "optional persistent client id",
  "uid": "optional user id from optic('identify')",
  "sw": 1440, "sh": 900, "tz": "Europe/Berlin", "lang": "de-DE",
  "e": [
    { "t": "pageview", "u": "https://shop.example/pricing?utm_source=x", "r": "https://google.com/", "ti": "Pricing" },
    { "t": "event", "n": "signup", "u": "https://shop.example/pricing", "p": { "plan": "pro" }, "rev": 49 },
    { "t": "page_leave", "u": "https://shop.example/pricing", "v": 41250, "p": { "sd": 85 } },
    { "t": "click", "u": "https://shop.example/pricing", "x": 0.42, "y": 1180, "vw": 1440, "sel": "button.buy", "rage": false, "dead": false },
    { "t": "vital", "n": "LCP", "u": "https://shop.example/pricing", "v": 1830 },
    { "t": "error", "n": "js_error", "u": "https://shop.example/pricing", "p": { "message": "TypeError: …" } }
  ]
}
```

Up to 200 events per request and 256 KB per body.

## Server-side ingestion

`POST /api/ingest`, authenticated with the site's API key (Settings → Server-side ingestion). Use it for mobile apps,
back-end conversions, CRM deals, point-of-sale orders and offline campaigns. Events may be backdated up to 90 days.

```bash
curl -X POST https://analytics.example.com/api/ingest \
  -H "Authorization: Bearer opk_…" \
  -H "Content-Type: application/json" \
  -d '{
    "site": "site-id",
    "events": [
      { "name": "purchase", "user_id": "crm-4411", "revenue": 120, "platform": "pos",
        "timestamp": "2026-10-20T10:30:00Z", "props": { "store": "Bandra" } },
      { "type": "pageview", "url": "/app/home", "client_id": "device-7f3a", "platform": "ios" }
    ]
  }'
```

| Field | Required | Notes |
| --- | --- | --- |
| `type` | no | `event` (default) or `pageview` |
| `name` | for events | Event name |
| `user_id` or `client_id` | yes | Identifies the visitor; hashed before storage |
| `url` | no | Path or URL, default `/` |
| `timestamp` | no | Unix ms or ISO 8601, default now |
| `revenue` | no | Number |
| `props` | no | Flat object of strings, numbers, booleans |
| `platform` | no | `web`, `ios`, `android`, `server` (default), `pos`, `crm`, `offline` |
| `country` | no | ISO 3166 alpha-2 |
| `user_agent` | no | Lets Optic fill in device, browser and OS |

Response: `{ "accepted": 2, "rejected": [] }`. Up to 1,000 events per request.

## Reporting API (signed in)

Every report is `GET /api/stats/<report>` with the same query parameters:

| Parameter | Example | Notes |
| --- | --- | --- |
| `site` | `demo` | Required |
| `from`, `to` | `2026-10-01` | Inclusive dates in the site's time zone; default last 30 days |
| `f` | `channel:Email` | Filter, repeatable. Dimensions: `channel`, `referrer`, `utm_source`, `utm_medium`, `utm_campaign`, `utm_term`, `utm_content`, `country`, `device`, `browser`, `os`, `language`, `platform`, `entry_page`, `exit_page`, `screen`, `page` (sessions that viewed a page), `event` (sessions that sent an event). `(none)` matches empty values. |

| Report | Extra parameters | Returns |
| --- | --- | --- |
| `overview` | – | KPIs for the period and the previous period, plus series by hour or day |
| `breakdown` | `dim`, `limit` | Metrics per value of one dimension, or per page (`dim=page`) or event (`dim=event`) |
| `event` | `name` | Top values of each property and a count series |
| `realtime` | – | Active visitors (5 min), per-minute views (30 min), live feed |
| `funnel` | `id` or `steps` (JSON), `by` | Step counts, conversion, drop-off, average time between steps, optional segment split |
| `paths` | `start` | Previous pages, next two steps, top journeys |
| `cohorts` | `weeks` | Weekly retention table and the weighted average curve |
| `ecommerce` | – | Revenue, orders, AOV, abandonment, products, revenue by channel |
| `goals` | – | Completions, conversion rate and value per goal |
| `explore` | `dim` (1–3), `metric` (1–8), `sort`, `limit` | Custom pivot. Extra dimensions: `date`, `week`, `hour_of_day`, `day_of_week`, `visitor_type` |
| `heatmap` | `path`, `device` | Click points, top selectors, scroll reach by decile |
| `recordings` | `frustrated=1`, `path` | Recording list |
| `recording` | `id` | rrweb events and the session's event timeline |
| `insights` | `metric` | Anomalies, 14-day forecast, contribution analysis, frustration signals, Web Vitals |

Management endpoints, all signed in: `GET/POST /api/sites`, `GET/PATCH/DELETE /api/sites/:id` (`PATCH` with
`{"rotateKey": true}` rotates the API key), and `GET/POST/DELETE /api/sites/:id/{goals|funnels|tags}` (`DELETE` takes
`?item=<id>`). Sign in with `POST /api/auth {"password": "…"}`, sign out with `DELETE /api/auth`.

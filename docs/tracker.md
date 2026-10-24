# Tracker guide

The tracker is a single dependency-free script, `public/optic.js` (about 6 KB gzipped). It is served by your Optic
instance, so nothing loads from a third-party domain.

## Install

Add this to the `<head>` of every page:

```html
<script defer src="https://analytics.example.com/optic.js" data-site="YOUR_SITE_ID"></script>
```

The site ID is shown in **Settings → Tracking code**. Events go to the same origin the script was loaded from.

### Script attributes

| Attribute | Default | What it does |
| --- | --- | --- |
| `data-site` | required | The site ID. |
| `data-api` | script origin | Send events to a different Optic host, e.g. behind a first-party proxy. |
| `data-auto-pageview` | `true` | Set to `false` to send pageviews yourself with `optic("pageview")`. |
| `data-exclude-localhost` | `false` | Ignore visits from `localhost` and `127.0.0.1`. |
| `data-consent` | – | Set to `required` to send nothing until `optic("consent", true)`. |

## What is collected automatically

| Data | When |
| --- | --- |
| Pageview | On load, and on every `history.pushState`, `replaceState` and `popstate`, so single-page apps work with no extra code. |
| Engaged time and scroll depth | When the page is left or hidden (`page_leave`). Engaged time only counts while the tab is visible. |
| Clicks for heatmaps | Every click: x as a fraction of page width, y in pixels, viewport width and a short CSS selector. |
| Rage clicks | 3 clicks within 800 ms and 30 px of each other. |
| Dead clicks | A click on a non-interactive element where nothing in the DOM changes and the URL stays the same within 600 ms. |
| `outbound_click` | Clicking a link to another host. |
| `file_download` | Clicking a link to a pdf, zip, docx, xlsx, csv, dmg, exe, apk, mp3, mp4 and similar files. |
| `form_submit` | Any form submit, with the form's id, name or action. |
| `video_play` / `audio_play` | The first play of each media element. |
| `js_error` | Uncaught errors and unhandled promise rejections, at most 10 per page. |
| Web Vitals | LCP, FCP, CLS, INP and TTFB, sent once when the page is first hidden. |
| Session replay | DOM snapshots and mutations via [rrweb](https://github.com/rrweb-io/rrweb), when recordings are enabled for the site. |

Query strings are removed before paths are stored. UTM parameters (and `gclid` / `fbclid`) are read first, then dropped.
Parameters listed under **Settings → Strip URL parameters** are removed in the browser before anything is sent.

## JavaScript API

Calls made before the script has loaded are queued if you add the stub:

```html
<script>window.optic = window.optic || function () { (optic.q = optic.q || []).push(arguments); };</script>
```

```js
optic("event", "signup", { plan: "pro", seats: 5 });   // custom event with properties
optic("event", "upgrade", { plan: "pro" }, 49);         // custom event with revenue
optic("purchase", 64.5, { order_id: "A-1009", item: "Kenya AA" });
optic("identify", "user-123");    // tie this browser's sessions to your own user id
optic("consent", true);           // or false, or { analytics: true, marketing: false }
optic("optout");                  // stop tracking this browser permanently (stored in localStorage)
optic("pageview");                // manual pageview, with data-auto-pageview="false"
```

Property values can be strings, numbers, booleans or null (objects are stored as JSON, up to 500 characters).

### E-commerce events

The E-commerce report reads three event names:

| Event | Properties | Used for |
| --- | --- | --- |
| `add_to_cart` | `item`, `price`, `qty` | Cart abandonment, products added |
| `begin_checkout` | anything | Checkout abandonment |
| `purchase` | revenue (second argument), `order_id`, `item` | Revenue, orders, AOV, products |

## Events without code

Any element can send an event when clicked:

```html
<button data-optic-event="cta_click" data-optic-prop-location="hero" data-optic-revenue="0">Start free trial</button>
```

Or use the **tag manager** in Settings to map a CSS selector click, a form submit or a page path to an event name, or to
load a third-party script only after the visitor has consented to its category. Rules take effect within a minute,
with no deploy.

## Privacy controls

- **Cookieless identity (default).** The server hashes a daily-rotating random salt with the site, IP address and user
  agent. Nothing is stored on the device. The salt is deleted the next day, so visitors cannot be linked across days.
  Retention reports need persistent identity.
- **Persistent identity.** The tracker stores a random id in `localStorage` (`optic_cid`). It is hashed with the site id
  on the server before storage.
- **Consent.** Per site: not required, required for visitors in the EU/EEA/UK/Switzerland, or required for everyone. The
  visitor's region comes from a CDN country header or, failing that, the browser's time zone.
- **Do Not Track and Global Privacy Control** are ignored by default. Turn on "Honour Do Not Track" in site settings to
  stop counting visitors who send either signal.
- **Recordings** mask every input value by default. Add `class="optic-block"` to keep an element out of recordings
  entirely, or `class="optic-mask"` to mask its text.

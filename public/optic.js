/*! Optic web analytics tracker | MIT License | https://github.com/amanjhacodes55/optic */
(function () {
  "use strict";
  var w = window, d = document, nav = navigator, loc = location;
  var script = d.currentScript;
  if (!script || w.__optic) return;
  w.__optic = true;

  var site = script.getAttribute("data-site");
  var api = (script.getAttribute("data-api") || new URL(script.src).origin).replace(/\/$/, "");
  var autoPageviews = script.getAttribute("data-auto-pageview") !== "false";
  var excludeLocal = script.getAttribute("data-exclude-localhost") === "true";
  if (!site) return console.warn("[optic] data-site is missing");
  // Heatmap previews load the page inside the dashboard; they must not count as visits.
  if (/[?&]optic_preview=1/.test(loc.search)) { w.optic = function () {}; return; }

  var cfg = { identity: "cookieless", respectDnt: false, consentRequired: script.getAttribute("data-consent") === "required", heatmaps: true, replay: { enabled: false }, stripParams: [], tags: [] };
  var stubQueue = (w.optic && w.optic.q) || [];
  var queue = [], userId = null, clientId = null, ready = false, disabled = false;
  var consent = readConsent();

  function store(k, v) { try { if (v === undefined) return localStorage.getItem(k); if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch (e) { return null; } }
  function readConsent() { var c = store("optic_consent"); try { return c ? JSON.parse(c) : null; } catch (e) { return null; } }
  function rid() { var a = new Uint8Array(12); (w.crypto || w.msCrypto).getRandomValues(a); return Array.prototype.map.call(a, function (b) { return ("0" + b.toString(16)).slice(-2); }).join(""); }
  function allowed(category) {
    if (disabled) return false;
    if (category === "necessary") return true;
    if (!cfg.consentRequired) return !consent || consent[category] !== false;
    return !!(consent && consent[category]);
  }

  // ---- transport ------------------------------------------------------------------------------
  function envelope(events) {
    return JSON.stringify({ s: site, cid: clientId, uid: userId, sw: screen.width, sh: screen.height, tz: tz(), lang: nav.language, e: events });
  }
  function tz() { try { return Intl.DateTimeFormat().resolvedOptions().timeZone; } catch (e) { return null; } }
  function post(path, body, beacon) {
    if (beacon && nav.sendBeacon && body.length < 60000) {
      if (nav.sendBeacon(api + path, new Blob([body], { type: "text/plain" }))) return;
    }
    try { fetch(api + path, { method: "POST", body: body, keepalive: body.length < 60000, headers: { "Content-Type": "text/plain" } }).catch(function () {}); } catch (e) {}
  }
  function send(evt, now) {
    if (!allowed("analytics")) return;
    evt.u = evt.u || cleanUrl();
    queue.push(evt);
    if (now || queue.length >= 20) flush(false);
  }
  function flush(beacon) {
    if (!queue.length || !ready) return;
    var batch = queue.splice(0, 50);
    post("/api/collect", envelope(batch), beacon);
    if (queue.length) flush(beacon);
  }
  setInterval(function () { flush(false); }, 3000);

  function cleanUrl() {
    var u = new URL(loc.href);
    (cfg.stripParams || []).forEach(function (p) { u.searchParams.delete(p); });
    u.hash = "";
    return u.toString();
  }

  // ---- pageviews and engagement ---------------------------------------------------------------
  var lastUrl = null, engagedMs = 0, visibleSince = 0, maxScroll = 0;
  function resetPage() { engagedMs = 0; maxScroll = 0; visibleSince = d.visibilityState === "visible" ? Date.now() : 0; scrollDepth(); }
  function engaged() { return engagedMs + (visibleSince ? Date.now() - visibleSince : 0); }
  function scrollDepth() {
    var h = Math.max(d.documentElement.scrollHeight, d.body ? d.body.scrollHeight : 0);
    var seen = (w.scrollY || d.documentElement.scrollTop) + w.innerHeight;
    var pct = h <= w.innerHeight ? 100 : Math.min(100, Math.round((seen / h) * 100));
    if (pct > maxScroll) maxScroll = pct;
  }
  function pageLeave(beacon) {
    if (!lastUrl) return;
    send({ t: "page_leave", u: lastUrl, v: engaged(), p: { sd: maxScroll } });
    flush(beacon);
  }
  function pageview() {
    var url = cleanUrl();
    if (url === lastUrl) return;
    if (lastUrl) pageLeave(false);
    var ref = lastUrl || d.referrer || null;
    lastUrl = url;
    resetPage();
    send({ t: "pageview", u: url, r: ref, ti: d.title }, true);
    applyPageTags();
  }
  d.addEventListener("visibilitychange", function () {
    if (d.visibilityState === "hidden") {
      if (visibleSince) { engagedMs += Date.now() - visibleSince; visibleSince = 0; }
      sendVitals();
      pageLeave(true);
      flushReplay(true);
      lastLeaveSent = true;
    } else {
      visibleSince = Date.now();
      if (lastLeaveSent) { lastLeaveSent = false; engagedMs = 0; }
    }
  });
  var lastLeaveSent = false;
  w.addEventListener("scroll", throttle(scrollDepth, 250), { passive: true });

  if (autoPageviews) {
    var wrap = function (name) {
      var orig = history[name];
      history[name] = function () { var r = orig.apply(this, arguments); setTimeout(pageview, 0); return r; };
    };
    wrap("pushState"); wrap("replaceState");
    w.addEventListener("popstate", pageview);
  }

  // ---- clicks: heatmaps, rage and dead clicks, auto events ------------------------------------
  var INTERACTIVE = "a,button,input,select,textarea,label,summary,details,[role=button],[role=link],[role=tab],[role=menuitem],[onclick],[data-optic-event],[contenteditable=true]";
  var recent = [], replayStats = { clicks: 0, rage: 0, err: 0 };

  function selector(el) {
    var parts = [];
    for (var i = 0; el && el.nodeType === 1 && i < 3; i++, el = el.parentElement) {
      var s = el.tagName.toLowerCase();
      if (el.id) { parts.unshift(s + "#" + el.id); break; }
      var cls = (typeof el.className === "string" ? el.className : "").trim().split(/\s+/).filter(function (c) { return c && !/^(\d|hover|active|focus)/.test(c) && c.length < 30; }).slice(0, 2);
      if (cls.length) s += "." + cls.join(".");
      parts.unshift(s);
    }
    return parts.join(" > ").slice(0, 300);
  }

  var mutated = false;
  if (w.MutationObserver) new MutationObserver(function () { mutated = true; }).observe(d.documentElement, { childList: true, subtree: true, attributes: true, characterData: true });

  d.addEventListener("click", function (ev) {
    var t = ev.target && ev.target.nodeType === 1 ? ev.target : ev.target && ev.target.parentElement;
    if (!t) return;
    var now = Date.now();
    replayStats.clicks++;

    recent = recent.filter(function (c) { return now - c.t < 800; });
    recent.push({ t: now, x: ev.pageX, y: ev.pageY });
    var near = recent.filter(function (c) { return Math.abs(c.x - ev.pageX) < 30 && Math.abs(c.y - ev.pageY) < 30; });
    var rage = near.length === 3;
    if (rage) replayStats.rage++;

    var interactive = t.closest(INTERACTIVE);
    autoEvents(t);

    if (cfg.heatmaps) {
      var docW = Math.max(d.documentElement.scrollWidth, w.innerWidth) || 1;
      var base = { t: "click", x: Math.min(1, Math.max(0, ev.pageX / docW)), y: Math.round(ev.pageY), vw: w.innerWidth, sel: selector(interactive || t), rage: rage };
      if (interactive) send(base);
      else {
        mutated = false;
        var urlAtClick = loc.href;
        setTimeout(function () { base.dead = !mutated && loc.href === urlAtClick; send(base); }, 600);
      }
    }
  }, true);

  var DOWNLOAD = /\.(pdf|zip|rar|7z|gz|docx?|xlsx?|pptx?|csv|txt|dmg|exe|msi|apk|mp3|mp4|mov)$/i;
  function autoEvents(t) {
    var tagged = t.closest("[data-optic-event]");
    if (tagged) {
      var props = {}, rev;
      for (var i = 0; i < tagged.attributes.length; i++) {
        var a = tagged.attributes[i];
        if (a.name.indexOf("data-optic-prop-") === 0) props[a.name.slice(16)] = a.value;
        if (a.name === "data-optic-revenue") rev = parseFloat(a.value);
      }
      track(tagged.getAttribute("data-optic-event"), props, rev);
    }
    var link = t.closest("a[href]");
    if (link) {
      var href = link.href;
      try {
        var u = new URL(href, loc.href);
        if (DOWNLOAD.test(u.pathname)) track("file_download", { file: u.pathname.split("/").pop(), url: u.href });
        else if (/^https?:$/.test(u.protocol) && u.host !== loc.host) track("outbound_click", { url: u.href, domain: u.hostname });
      } catch (e) {}
    }
    (cfg.tags || []).forEach(function (tag) {
      if (tag.kind === "click" && tag.event && safeClosest(t, tag.match)) track(tag.event, { tag: tag.match });
    });
  }
  function safeClosest(el, sel) { try { return el.closest(sel); } catch (e) { return null; } }

  d.addEventListener("submit", function (ev) {
    var f = ev.target;
    track("form_submit", { form: f.id || f.getAttribute("name") || f.getAttribute("action") || "form" });
    (cfg.tags || []).forEach(function (tag) { if (tag.kind === "submit" && tag.event && safeClosest(f, tag.match)) track(tag.event, { tag: tag.match }); });
  }, true);

  d.addEventListener("play", function (e) {
    var m = e.target;
    if (m && (m.tagName === "VIDEO" || m.tagName === "AUDIO") && !m.__opticPlayed) {
      m.__opticPlayed = true;
      track(m.tagName === "VIDEO" ? "video_play" : "audio_play", { src: (m.currentSrc || "").split("/").pop(), title: m.getAttribute("title") || "" });
    }
  }, true);

  // ---- errors and web vitals ------------------------------------------------------------------
  var errorCount = 0;
  function reportError(message, extra) {
    if (errorCount++ >= 10) return;
    replayStats.err++;
    var p = { message: String(message).slice(0, 300) };
    for (var k in extra) p[k] = extra[k];
    send({ t: "error", n: "js_error", p: p });
  }
  w.addEventListener("error", function (e) { if (e.message) reportError(e.message, { source: (e.filename || "").split("/").pop(), line: e.lineno || 0 }); });
  w.addEventListener("unhandledrejection", function (e) { reportError(e.reason && e.reason.message ? e.reason.message : String(e.reason), { kind: "promise" }); });

  var vitals = {}, vitalsSent = false;
  function observe(type, cb, opts) {
    try { var po = new PerformanceObserver(function (l) { l.getEntries().forEach(cb); }); po.observe(Object.assign({ type: type, buffered: true }, opts || {})); } catch (e) {}
  }
  observe("largest-contentful-paint", function (e) { vitals.LCP = e.startTime; });
  observe("paint", function (e) { if (e.name === "first-contentful-paint") vitals.FCP = e.startTime; });
  observe("layout-shift", function (e) { if (!e.hadRecentInput) vitals.CLS = (vitals.CLS || 0) + e.value; });
  observe("event", function (e) { if (e.interactionId && (!vitals.INP || e.duration > vitals.INP)) vitals.INP = e.duration; }, { durationThreshold: 40 });
  try { var navEntry = performance.getEntriesByType("navigation")[0]; if (navEntry) vitals.TTFB = navEntry.responseStart; } catch (e) {}
  function sendVitals() {
    if (vitalsSent) return;
    vitalsSent = true;
    for (var k in vitals) if (vitals[k] != null) send({ t: "vital", n: k, v: k === "CLS" ? Math.round(vitals[k] * 1000) / 1000 : Math.round(vitals[k]) });
  }

  // ---- tag manager ----------------------------------------------------------------------------
  var injected = {};
  function matchPath(pattern, path) {
    if (pattern.indexOf("*") < 0) return pattern === path;
    return new RegExp("^" + pattern.split("*").map(function (s) { return s.replace(/[.+?^${}()|[\]\\]/g, "\\$&"); }).join(".*") + "$").test(path);
  }
  function applyPageTags() {
    (cfg.tags || []).forEach(function (tag) {
      if (tag.kind === "pageview" && tag.event && matchPath(tag.match, loc.pathname)) track(tag.event, { tag: tag.match });
      if (tag.kind === "script" && !injected[tag.match] && allowed(tag.consent || "marketing")) {
        injected[tag.match] = true;
        var s = d.createElement("script"); s.async = true; s.src = tag.match; d.head.appendChild(s);
      }
    });
  }

  // ---- session replay -------------------------------------------------------------------------
  var replay = null;
  function startReplay() {
    var r = cfg.replay || {};
    if (!r.enabled || replay || !allowed("analytics") || Math.random() >= (r.sampleRate == null ? 1 : r.sampleRate)) return;
    replay = { id: rid(), seq: 0, buf: [], size: 0 };
    var s = d.createElement("script");
    s.src = api + "/rrweb-record.js";
    s.onload = function () {
      var record = w.rrwebRecord && (typeof w.rrwebRecord === "function" ? w.rrwebRecord : w.rrwebRecord.record);
      if (!record) return;
      record({
        emit: function (e) { replay.buf.push(e); if (e.type === 2 || replay.buf.length > 300) flushReplay(false); },
        maskAllInputs: r.maskInputs !== false,
        maskTextClass: "optic-mask",
        blockClass: "optic-block",
        inlineStylesheet: true,
        sampling: { mousemove: 50, scroll: 150, input: "last" },
      });
      setInterval(function () { flushReplay(false); }, 5000);
    };
    d.head.appendChild(s);
  }
  function flushReplay(beacon) {
    if (!replay || !replay.buf.length || !ready) return;
    var body = JSON.stringify({ s: site, rid: replay.id, seq: replay.seq++, u: loc.href, cid: clientId, uid: userId, ev: replay.buf.splice(0), clicks: replayStats.clicks, rage: replayStats.rage, err: replayStats.err });
    replayStats = { clicks: 0, rage: 0, err: 0 };
    post("/api/replay", body, beacon);
  }

  // ---- public API -----------------------------------------------------------------------------
  function track(name, props, revenue) {
    if (!name) return;
    var evt = { t: "event", n: String(name).slice(0, 120) };
    if (props && typeof props === "object") {
      evt.p = {};
      for (var k in props) { var v = props[k]; evt.p[k] = typeof v === "object" && v !== null ? JSON.stringify(v).slice(0, 500) : v; }
      if (revenue == null && typeof props.revenue === "number") revenue = props.revenue;
    }
    if (typeof revenue === "number" && isFinite(revenue)) evt.rev = revenue;
    send(evt, name === "purchase");
  }
  function command(cmd, a, b, c) {
    switch (cmd) {
      case "event": return track(a, b, c);
      case "purchase": return track("purchase", b || {}, typeof a === "number" ? a : a && a.revenue);
      case "pageview": return pageview();
      case "identify": userId = a ? String(a).slice(0, 128) : null; return;
      case "consent":
        consent = a === true ? { analytics: true, marketing: true } : a === false ? { analytics: false, marketing: false } : a;
        store("optic_consent", JSON.stringify(consent));
        if (allowed("analytics") && ready && !lastUrl) { pageview(); startReplay(); }
        if (allowed("analytics")) applyPageTags();
        return;
      case "optout": store("optic_optout", "1"); disabled = true; return;
    }
  }
  w.optic = function () { command.apply(null, arguments); };

  // ---- boot -----------------------------------------------------------------------------------
  function boot() {
    if (store("optic_optout") === "1") disabled = true;
    if (excludeLocal && /^(localhost|127\.|\[::1\])/.test(loc.hostname)) disabled = true;
    if (cfg.respectDnt && (nav.doNotTrack === "1" || w.doNotTrack === "1" || nav.globalPrivacyControl === true)) disabled = true;
    if (cfg.identity === "persistent" && !disabled) {
      clientId = store("optic_cid");
      if (!clientId) { clientId = rid(); store("optic_cid", clientId); }
    }
    ready = true;
    stubQueue.forEach(function (args) { command.apply(null, args); });
    if (autoPageviews && allowed("analytics")) pageview();
    startReplay();
  }
  fetch(api + "/api/config?site=" + encodeURIComponent(site) + "&tz=" + encodeURIComponent(tz() || ""))
    .then(function (r) { return r.ok ? r.json() : null; })
    .then(function (c) {
      if (c) {
        var forced = cfg.consentRequired;
        for (var k in c) cfg[k] = c[k];
        cfg.consentRequired = forced || c.consentRequired;
      }
    })
    .catch(function () {})
    .then(boot);

  function throttle(fn, ms) { var last = 0; return function () { var n = Date.now(); if (n - last > ms) { last = n; fn(); } }; }
})();

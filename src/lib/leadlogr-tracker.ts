export const TRACKER = `/* Leadlogr tracker v3.0 — records a submission when the visitor actually submits */
(function () {
  if (window.__LEADLOGR_RUNNING__) return;
  window.__LEADLOGR_RUNNING__ = true;

  var LEADLOGR_BACKEND_ORIGIN = 'https://www.leadlogr.com';
  var LEADLOGR_INGEST_PATH = '/api/public/leads/collect';

  /**
   * Where to post the lead.
   *
   * This used to force every leadlogr.com endpoint back to the old Lovable
   * host, from when that was the only place the ingest route existed. It long
   * outlived that: leadlogr.com serves the route now, and the Lovable
   * deployment still answers but runs code old enough to demand the retired
   * "workspace_key". So a correctly configured snippet was rewritten at
   * runtime to a backend that rejected every submission with a 400, silently —
   * only the dashboard's own "Send test event" worked, because it posts
   * straight to the real endpoint and never goes through here.
   *
   * The default is now taken from wherever this script was loaded from: a
   * tracker served by a host can always reach that host's ingest route, which
   * is true for a proxied first-party domain too.
   */
  function defaultOrigin() {
    try {
      var tag = document.getElementById('leadlogr-tracker') || document.currentScript;
      if (tag && tag.src) return new URL(tag.src, window.location.href).origin;
    } catch (e) {}
    return LEADLOGR_BACKEND_ORIGIN;
  }

  function normalizeEndpoint(endpoint) {
    var fallback = defaultOrigin() + LEADLOGR_INGEST_PATH;
    if (!endpoint) return fallback;
    try {
      return new URL(endpoint, window.location.href).href;
    } catch (e) {
      return fallback;
    }
  }

  function readConfig() {
    var cfg = window.LEADLOGR_CONFIG || {};
    var tag = document.getElementById('leadlogr-tracker') || document.currentScript;
    if (tag && tag.dataset) {
      if (!cfg.ingestKey && tag.dataset.ingestKey) cfg.ingestKey = tag.dataset.ingestKey;
      if (!cfg.ingestKey && tag.dataset.workspaceId) cfg.ingestKey = tag.dataset.workspaceId;
      if (!cfg.endpoint && tag.dataset.endpoint) cfg.endpoint = tag.dataset.endpoint;
      if (!cfg.integrationId && tag.dataset.integrationId) cfg.integrationId = tag.dataset.integrationId;
      if (cfg.debug === undefined && tag.dataset.debug) cfg.debug = tag.dataset.debug === 'true';
      if (!cfg.featureFlags && tag.dataset.featureFlags) {
        try { cfg.featureFlags = JSON.parse(tag.dataset.featureFlags); } catch (e) {}
      }
    }
    return cfg;
  }

  var CFG = readConfig();
  CFG.endpoint = normalizeEndpoint(CFG.endpoint);
  // Older snippets set workspaceId; the credential is now a rotatable ingest key.
  if (!CFG.ingestKey && CFG.workspaceId) CFG.ingestKey = CFG.workspaceId;
  if (!CFG.ingestKey || !CFG.endpoint) {
    console.warn('[leadlogr] missing ingestKey or endpoint');
    return;
  }
  var FLAGS = CFG.featureFlags || {};

  /* A form submission is the visitor handing their details to the business on
     purpose. Recording it is the business's own processing of its own enquiry —
     the same as the mailbox the form would otherwise land in — so nothing here
     is withheld, anonymised or dropped on a cookie banner's say-so.

     The CMP detection this script used to carry (eleven vendors, some hundred
     and thirty lines) is gone. It never decided whether to record an enquiry,
     only what to label it, and it cost far more than it earned: consent
     banners are themselves <form> elements, so a tracker that watched forms
     learned to treat "accept cookies" as an enquiry and booked a lead with
     nothing in it.

     Cookies are still READ — _ga and _fbp below — because those are the ad
     platforms' own first-party identifiers and attribution is the product.
     Reading an identifier is not asking permission for one. */

  /* ---------------- state ----------------
     Two different things, deliberately kept apart. The form the visitor is
     typing in, and the form the visitor actually tried to submit. Conflating
     them is what made one enquiry arrive four times. */
  var lastTouchedForm = null;
  var submitIntentForm = null;
  var submitIntentAt = 0;
  var recentSends = [];

  var log = function () {
    if (CFG.debug) try { console.log.apply(console, ['[leadlogr]'].concat([].slice.call(arguments))); } catch (e) {}
  };

  function getParam(name) {
    try { return new URLSearchParams(window.location.search).get(name) || ''; } catch (e) { return ''; }
  }
  function escapeCookieName(name) {
    var s = String(name || ''); var out = '';
    for (var i = 0; i < s.length; i++) {
      var ch = s.charAt(i);
      out += '.$?*|{}()[]\\\\/+^'.indexOf(ch) === -1 ? ch : '\\\\' + ch;
    }
    return out;
  }
  function getCookie(name) {
    var m = document.cookie.match(new RegExp('(?:^|; )' + escapeCookieName(name) + '=([^;]*)'));
    return m ? decodeURIComponent(m[1]) : '';
  }
  function setLS(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
  function getLS(k) { try { return localStorage.getItem(k) || ''; } catch (e) { return ''; } }

  var KEYS = ['utm_source','utm_medium','utm_campaign','utm_term','utm_content','gclid','wbraid','gbraid','fbclid','msclkid','li_fat_id'];
  var attribution = {};
  KEYS.forEach(function (k) {
    var fromUrl = getParam(k);
    if (fromUrl) setLS('ll_' + k, fromUrl);
    attribution[k] = fromUrl || getLS('ll_' + k);
  });

  if (!getLS('ll_landing_page_url')) setLS('ll_landing_page_url', window.location.href);
  if (!getLS('ll_referrer_url')) setLS('ll_referrer_url', document.referrer || '');

  function gaClientId() {
    var ga = getCookie('_ga'); if (!ga) return '';
    var parts = ga.split('.');
    return parts.length >= 4 ? parts[2] + '.' + parts[3] : '';
  }

  /* An id for this visit, so the server can tell a second POST from the same
     person on the same form apart from a second enquiry. sessionStorage rather
     than localStorage: the end of a visit is exactly when this should be
     forgotten, and it never needs to outlive the tab. */
  function makeSessionId() {
    try {
      var k = 'll_sid';
      var v = sessionStorage.getItem(k);
      if (!v) {
        v = Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
        sessionStorage.setItem(k, v);
      }
      return v;
    } catch (e) {
      return '';
    }
  }
  var SESSION_ID = makeSessionId();

  function clientContext() {
    var ctx = {};
    try { ctx.tz = Intl.DateTimeFormat().resolvedOptions().timeZone || ''; } catch (e) {}
    try { ctx.lang = navigator.language || ''; } catch (e) {}
    try { ctx.screen = (screen.width || 0) + 'x' + (screen.height || 0); } catch (e) {}
    try { ctx.viewport = (window.innerWidth || 0) + 'x' + (window.innerHeight || 0); } catch (e) {}
    try { ctx.platform = navigator.platform || ''; } catch (e) {}
    try { ctx.client_ts = new Date().toISOString(); } catch (e) {}
    return ctx;
  }

  function basePayload() {
    return {
      ingest_key: CFG.ingestKey,
      integration_id: CFG.integrationId || 'gtm',
      session_id: SESSION_ID,
      utm_source: attribution.utm_source || '',
      utm_medium: attribution.utm_medium || '',
      utm_campaign: attribution.utm_campaign || '',
      utm_term: attribution.utm_term || '',
      utm_content: attribution.utm_content || '',
      gclid: attribution.gclid || '',
      wbraid: attribution.wbraid || '',
      gbraid: attribution.gbraid || '',
      fbclid: attribution.fbclid || '',
      msclkid: attribution.msclkid || '',
      li_fat_id: attribution.li_fat_id || '',
      fbp: getCookie('_fbp'),
      ga_client_id: gaClientId(),
      ga_session_id: getCookie('_ga_session_id') || '',
      landing_page_url: getLS('ll_landing_page_url') || window.location.href,
      page_path: window.location.pathname,
      page_url: window.location.href,
      page_title: document.title || '',
      referrer_url: getLS('ll_referrer_url') || document.referrer || '',
      user_agent: navigator.userAgent || '',
      client_context: clientContext(),
      source: ((attribution.gclid || attribution.wbraid || attribution.gbraid) ? 'Google'
              : attribution.fbclid ? 'Meta'
              : attribution.li_fat_id ? 'LinkedIn'
              : attribution.msclkid ? 'Microsoft'
              : 'Direct'),
    };
  }

  function dedupeKey(p) {
    return [p.email || '', p.phone || '', p.name || '', p.page_path || ''].join('|').toLowerCase();
  }
  function shouldSkip(p) {
    var now = Date.now(), key = dedupeKey(p);
    // A backstop only. It cannot catch a half-typed form arriving before the
    // finished one, because those genuinely differ — that is what the submit
    // intent below is for, and what the server's supersede check cleans up.
    recentSends = recentSends.filter(function (i) { return now - i.time < 300000; });
    for (var i = 0; i < recentSends.length; i++) if (recentSends[i].key === key) return true;
    recentSends.push({ key: key, time: now });
    return false;
  }

  function transport(payload) {
    if (shouldSkip(payload)) { log('duplicate skipped', payload); return; }
    log('sending', payload);
    var body = JSON.stringify(payload);
    try {
      if (navigator.sendBeacon) {
        var blob = new Blob([body], { type: 'text/plain;charset=UTF-8' });
        if (navigator.sendBeacon(CFG.endpoint, blob)) return;
      }
    } catch (e) {}
    fetch(CFG.endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: body, keepalive: true, mode: 'cors',
    }).catch(function (err) { log('send failed', err); });
  }

  function send(extra) {
    var payload = basePayload();
    if (extra) for (var k in extra) if (Object.prototype.hasOwnProperty.call(extra, k)) payload[k] = extra[k];
    transport(payload);
  }

  function readableName(el) {
    return (el.name || el.id || el.getAttribute('aria-label') || el.getAttribute('placeholder') || '').toLowerCase();
  }

  /* Everything that hints at what a field is FOR, not just what it is called.

     Form builders generate meaningless names: Forminator ships 'text-1',
     'textarea-1', 'phone-1'. Matching on the name alone filed Bas Marketing's
     company name and his project description under 'text-1' and
     'textarea-1' — while the label right beside each box said 'Bedrijfsnaam'
     and 'Omschrijving'. The visible label is usually the only honest
     description a field has. */
  function fieldHints(el) {
    var parts = [];
    try {
      parts.push(el.name || '', el.id || '');
      parts.push(el.getAttribute('aria-label') || '', el.getAttribute('placeholder') || '');
      parts.push(el.getAttribute('autocomplete') || '');
      var labelledBy = el.getAttribute('aria-labelledby');
      if (labelledBy) {
        var byId = document.getElementById(labelledBy);
        if (byId) parts.push(byId.textContent || '');
      }
      if (el.labels && el.labels.length) {
        for (var i = 0; i < el.labels.length; i++) parts.push(el.labels[i].textContent || '');
      } else if (el.closest) {
        var wrapping = el.closest('label');
        if (wrapping) parts.push(wrapping.textContent || '');
      }
    } catch (e) {}
    return parts.join(' ').toLowerCase().slice(0, 300);
  }
  /* Collects fields from a root AND from any shadow roots inside it.
     form.querySelectorAll() stops at a shadow boundary, so web-component form
     builders (HubSpot embeds, many design systems) would otherwise record the
     submit with zero field values. */
  function deepFields(root, out, depth) {
    out = out || []; depth = depth || 0;
    if (!root || depth > 10) return out;           // guard against cycles
    var direct = root.querySelectorAll ? root.querySelectorAll('input, textarea, select') : [];
    for (var i = 0; i < direct.length; i++) out.push(direct[i]);
    var all = root.querySelectorAll ? root.querySelectorAll('*') : [];
    for (var j = 0; j < all.length; j++) {
      if (all[j].shadowRoot) deepFields(all[j].shadowRoot, out, depth + 1);
    }
    return out;
  }

  function fromForm(form) {
    var extra = { custom_fields: {} };
    var els = deepFields(form);
    for (var i = 0; i < els.length; i++) {
      var el = els[i];
      var type = (el.type || '').toLowerCase();
      if (type === 'password' || type === 'hidden' || type === 'submit' || type === 'button' || type === 'file') continue;
      if ((type === 'checkbox' || type === 'radio') && !el.checked) continue;
      var name = readableName(el);   // what we file it under
      var hints = fieldHints(el);    // what we match on
      var val = el.value;
      if (!val) continue;
      // Order matters: 'Bedrijfsnaam' must be read as the company, not the
      // name, and it contains both words. 'tel' needs word boundaries now
      // that labels are matched too, or 'Vertel ons meer' becomes a phone
      // number.
      if (type === 'email' || /e-?mail|email/.test(hints)) extra.email = val;
      else if (type === 'tel' || /telefoon|telephone|phone|mobiel|mobile|gsm|\btel\b/.test(hints)) extra.phone = val;
      else if (/company|organi[sz]ation|business|bedrijf/.test(hints)) extra.company = val;
      else if (/name|naam|voornaam|achternaam/.test(hints) && !extra.name) extra.name = val;
      else if ((type === 'textarea' ||
                /message|comment|description|omschrijving|opmerking|enquiry|inquiry|details|bericht|vraag/.test(hints)) &&
               !extra.message) extra.message = val;
      else extra.custom_fields[name || ('field_' + i)] = val;
    }
    // attach a small form fingerprint for debugging / dedupe
    extra.form_id = form.id || '';
    extra.form_action = form.action || '';
    return extra;
  }

  /* ---------------- is this actually an enquiry? ----------------

     Clicking "Accept" on a cookie banner used to book a lead: twelve of them
     across two CMP vendors on the test accounts, every single one with no
     name, no email, no phone and no message. That is the behaviour partners
     describe as "it triggers on every page", and it is ours, not their tag
     manager's. Something must have been filled in. */
  function hasAnyValue(extra) {
    if (!extra) return false;
    if (extra.email || extra.phone || extra.name || extra.message || extra.company) return true;
    var cf = extra.custom_fields || {};
    for (var k in cf) if (Object.prototype.hasOwnProperty.call(cf, k) && cf[k]) return true;
    return false;
  }

  /* Second net, for a banner whose toggles default to on and so does yield
     values. Matches where the form sits rather than a list of vendors, so one
     nobody has heard of is caught too — and it only ever applies to a form
     with no contact detail in it at all, so a real enquiry that happens to
     live inside a div called "cookie-wrapper" is never thrown away. */
  var CONSENT_PATTERN = /cookie|consent|gdpr|cmp-|cmp_|usercentrics|onetrust|cookiebot|cookieyes|complianz|iubenda|didomi|osano|termly|borlabs|klaro|tarteaucitron/i;
  function looksLikeConsentUi(form) {
    var node = form, hops = 0;
    try {
      while (node && hops < 4) {
        var id = String(node.id || '');
        var cls = typeof node.className === 'string' ? node.className : '';
        if (CONSENT_PATTERN.test(id) || CONSENT_PATTERN.test(cls)) return true;
        node = node.parentElement; hops++;
      }
    } catch (e) {}
    return false;
  }

  function isEnquiry(extra, form) {
    if (!hasAnyValue(extra)) return false;
    if (!extra.email && !extra.phone && !extra.name && !extra.message) {
      if (looksLikeConsentUi(form)) return false;
    }
    return true;
  }

  /* Every path that believes a form was submitted comes through here, so the
     question "is this a lead" is answered in exactly one place. */
  function sendFormExtra(extra, form, why) {
    if (!extra) return false;
    if (!isEnquiry(extra, form)) {
      log('ignored, nothing a business could act on', { via: why, form_id: (form && form.id) || '' });
      return false;
    }
    log('submission captured', { via: why, form_id: extra.form_id, form_action: extra.form_action });
    clearSubmitIntent();
    send(extra);
    return true;
  }
  function sendFromForm(form, why) {
    if (!form) return false;
    var extra;
    try { extra = fromForm(form); } catch (e) { log('form parse error', e); return false; }
    return sendFormExtra(extra, form, why);
  }

  /* Events from inside a shadow root are retargeted to the host, so ev.target
     is the component rather than the field. composedPath() still contains the
     real ancestry, so check it before falling back to closest(). */
  function findFormFromEvent(ev) {
    try {
      if (ev && typeof ev.composedPath === 'function') {
        var path = ev.composedPath();
        for (var i = 0; i < path.length; i++) {
          var node = path[i];
          if (node && node.tagName === 'FORM') return node;
        }
        // No <form> at all: a shadow component may submit without one. Use the
        // shadow host so its fields are still reachable via deepFields().
        for (var k = 0; k < path.length; k++) {
          if (path[k] && path[k].shadowRoot) return path[k];
        }
      }
    } catch (e) {}
    return findForm(ev && ev.target);
  }

  function findForm(target) {
    if (!target) return null;
    if (target.tagName === 'FORM') return target;
    if (target.closest) return target.closest('form');
    return null;
  }

  /* ---------------- submit intent ----------------

     Typing is not submitting. That distinction is the whole fix. The previous
     version armed itself on every 'input' event and then treated the next
     outbound POST as the submission — and on a site running Leadinfo, whose
     collector posts every ten seconds for as long as the visitor is active,
     that condition holds for the entire time someone fills in a form. Measured
     on hollandhuurt.nl: pings at 3s, 13s, 23s, 33s, 43s, 53s, 63s while
     active, none at all while idle. One enquiry, four leads, each a snapshot
     of a half-typed form.

     Now only a deliberate act arms it: a native submit, Enter, a click on
     something that submits, or a form plugin saying so. */
  var SUBMIT_INTENT_WINDOW_MS = 15000;
  var SUBMIT_WORDS = /verstuur|verzend|opsturen|aanvraag|aanvragen|bevestig|submit|send|confirm|next|volgende/i;

  function looksLikeSubmitControl(el) {
    if (!el || !el.tagName) return false;
    var tag = el.tagName.toLowerCase();
    var type = String(el.type || '').toLowerCase();
    if (tag === 'button' && type !== 'reset') return true;
    if (tag === 'input' && (type === 'submit' || type === 'button' || type === 'image')) return true;
    try { if (el.getAttribute && el.getAttribute('role') === 'button') return true; } catch (e) {}
    // Some builders submit from a div or an anchor, so fall back to its words.
    var text = '';
    try { text = el.textContent || el.value || (el.getAttribute && el.getAttribute('aria-label')) || ''; } catch (e) {}
    return SUBMIT_WORDS.test(String(text).slice(0, 80));
  }

  function armSubmitIntent(form, why) {
    if (!form) return;
    submitIntentForm = form;
    submitIntentAt = Date.now();
    log('submit intent', { why: why, form_id: form.id || '' });
  }
  function clearSubmitIntent() {
    submitIntentForm = null;
    submitIntentAt = 0;
  }
  function submitIntentLive() {
    return !!submitIntentForm && submitIntentAt > 0 &&
           (Date.now() - submitIntentAt) <= SUBMIT_INTENT_WINDOW_MS;
  }

  document.addEventListener('submit', function (ev) {
    var form = findFormFromEvent(ev); if (!form) return;
    armSubmitIntent(form, 'native submit');
    sendFromForm(form, 'submit');
  }, true);

  document.addEventListener('click', function (ev) {
    var control = null;
    try { control = ev.target && ev.target.closest ? ev.target.closest('button,input,[role="button"],a') : null; } catch (e) {}
    var form = (control && findForm(control)) || findFormFromEvent(ev);
    if (!form) return;
    if (looksLikeSubmitControl(control || ev.target)) armSubmitIntent(form, 'submit control clicked');
  }, true);

  document.addEventListener('keydown', function (ev) {
    if (!ev || ev.key !== 'Enter' || ev.shiftKey) return;
    var tag = '';
    try { tag = ev.target && ev.target.tagName ? ev.target.tagName.toLowerCase() : ''; } catch (e) {}
    if (tag === 'textarea') return;   // Enter is a newline there, not a submit
    var form = findFormFromEvent(ev); if (!form) return;
    armSubmitIntent(form, 'enter pressed');
  }, true);

  // Typing only records which form is being filled in. It arms nothing.
  document.addEventListener('input', function (ev) {
    lastTouchedForm = findFormFromEvent(ev) || lastTouchedForm;
  }, true);
  document.addEventListener('change', function (ev) {
    lastTouchedForm = findFormFromEvent(ev) || lastTouchedForm;
  }, true);

  /* A classic form that navigates away fires 'submit' and is already covered.
     This is for the ones that post and then leave without one — and it now
     needs a submit intent too, so typing in a search box and leaving the page
     no longer books a lead. */
  function flushOnDeparture(reason) {
    if (!submitIntentLive()) return;
    var form = submitIntentForm;
    // pagehide, beforeunload and visibilitychange all fire for one departure,
    // and on mobile visibilitychange fires every time the visitor switches app
    // and comes back. Consume it, or leaving a page sent the form three times.
    clearSubmitIntent();
    sendFromForm(form, 'departure:' + reason);
  }

  window.addEventListener('pagehide', function () { flushOnDeparture('pagehide'); }, true);
  window.addEventListener('beforeunload', function () { flushOnDeparture('beforeunload'); }, true);
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'hidden') flushOnDeparture('visibilitychange');
  }, true);

  /* ---------------- fetch / XHR interception ----------------
     The biggest gap in submit detection: a form that calls preventDefault()
     and POSTs via fetch fires no submit event and no unload, so nothing above
     would ever run.

     The old test for "was that the submission?" was "any POST that is not our
     own ingest call", which is true of every analytics beacon, chat widget and
     session heartbeat on the page. The test now is whether the request
     actually carries what the visitor typed. A Leadinfo ping cannot satisfy
     that; a real submission satisfies it whatever endpoint it posts to. */
  var FORM_POST_WINDOW_MS = 15000;

  function isPost(method) {
    return String(method || 'GET').toUpperCase() === 'POST';
  }

  function needlesFrom(extra) {
    var out = [];
    [extra.email, extra.phone, extra.name, extra.message].forEach(function (v) {
      var s = String(v || '').trim().toLowerCase();
      // Short values match by accident — a two-letter name would be in almost
      // any request body.
      if (s.length >= 4) out.push(s);
    });
    // Phone numbers get reformatted in transit far more often than emails do,
    // so look for the bare digits as well.
    var digits = String(extra.phone || '').replace(/[^0-9]/g, '');
    if (digits.length >= 6) out.push(digits);
    return out;
  }

  function bodyText(body) {
    try {
      if (!body) return '';
      if (typeof body === 'string') return body;
      if (typeof URLSearchParams !== 'undefined' && body instanceof URLSearchParams) return body.toString();
      if (typeof FormData !== 'undefined' && body instanceof FormData) {
        var parts = [];
        body.forEach(function (v, k) { parts.push(k + '=' + String(v)); });
        return parts.join('&');
      }
      // A Blob or a stream cannot be read synchronously; '' means "unknown",
      // which is handled separately from "read it and found nothing".
      if (typeof body === 'object' && typeof body.toString === 'function' &&
          body.toString !== Object.prototype.toString) {
        return String(body);
      }
    } catch (e) {}
    return '';
  }

  function carriesTypedValues(text, extra) {
    if (!text) return false;
    var plain = String(text).toLowerCase();
    var decoded = plain;
    try { decoded = decodeURIComponent(plain); } catch (e) {}
    var needles = needlesFrom(extra);
    for (var i = 0; i < needles.length; i++) {
      if (plain.indexOf(needles[i]) !== -1 || decoded.indexOf(needles[i]) !== -1) return true;
    }
    return false;
  }

  function onInterceptedPost(source, url, body) {
    if (!submitIntentLive()) return;
    if (Date.now() - submitIntentAt > FORM_POST_WINDOW_MS) return;
    try { if (url && String(url).indexOf(CFG.endpoint) !== -1) return; } catch (e) {}

    var form = submitIntentForm;
    var extra;
    try { extra = fromForm(form); } catch (e) { return; }

    var text = bodyText(body);
    var sameOrigin = false;
    try {
      sameOrigin = !!url && new URL(String(url), window.location.href).origin === window.location.origin;
    } catch (e) {}

    // Evidence, strongest first: the request carries what was typed. Failing
    // that, a same-origin POST whose body we could not read at all — on a page
    // where the visitor has just pressed submit, that is the submission far
    // more often than it is anything else.
    if (!carriesTypedValues(text, extra) && !(sameOrigin && !text)) {
      log('post ignored, carries nothing the visitor typed', {
        via: source, url: String(url || '').slice(0, 120),
      });
      return;
    }
    sendFormExtra(extra, form, 'post:' + source);
  }

  function installRequestHooks() {
    if (window.__LEADLOGR_REQUEST_HOOKS__) return;
    window.__LEADLOGR_REQUEST_HOOKS__ = true;

    // fetch
    try {
      if (typeof window.fetch === 'function') {
        var nativeFetch = window.fetch;
        window.fetch = function (input, init) {
          try {
            var url = typeof input === 'string' ? input : (input && input.url) || '';
            var method = (init && init.method) || (input && input.method) || 'GET';
            if (isPost(method)) onInterceptedPost('fetch', url, init && init.body);
          } catch (e) {}
          return nativeFetch.apply(this, arguments);
        };
      }
    } catch (e) { log('fetch hook failed', e); }

    // XMLHttpRequest
    try {
      var XHR = window.XMLHttpRequest;
      if (XHR && XHR.prototype) {
        var nativeOpen = XHR.prototype.open;
        var nativeSend = XHR.prototype.send;
        XHR.prototype.open = function (method, url) {
          try { this.__leadlogrMethod = method; this.__leadlogrUrl = url; } catch (e) {}
          return nativeOpen.apply(this, arguments);
        };
        XHR.prototype.send = function (body) {
          try {
            if (isPost(this.__leadlogrMethod)) {
              onInterceptedPost('xhr', this.__leadlogrUrl, body);
            }
          } catch (e) {}
          return nativeSend.apply(this, arguments);
        };
      }
    } catch (e) { log('xhr hook failed', e); }

    /* SPA route changes do not fire pagehide, so a multi-step form that
       advances the route would lose the step just completed. */
    try {
      var nativePush = history.pushState;
      if (typeof nativePush === 'function') {
        history.pushState = function () {
          try { flushOnDeparture('pushState'); } catch (e) {}
          return nativePush.apply(this, arguments);
        };
      }
    } catch (e) { log('pushState hook failed', e); }
  }
  installRequestHooks();

  /* ---------------- form plugins that announce their own success ----------------

     The only signal here that is not an inference: the plugin says the
     submission went through and hands us the form. Worth having for its own
     sake, and it is what makes Forminator — which both tester sites run —
     exact rather than merely detected.

     The Forminator event names are read out of its own shipped bundle
     (forminator/build/front/front.multi.min.js, 1.58.3), where the form
     element is the trigger target, so they bubble to document. */
  var PLUGIN_SUCCESS_EVENTS = [
    'forminator:form:submit:success',         // Forminator
    'forminator:form:submit:leads:success',   // Forminator, lead-capture variant
    'submit_success',                         // Elementor Pro
    'gform_confirmation_loaded',              // Gravity Forms
    'wpcf7mailsent',                          // Contact Form 7
  ];

  /* Plugin events do not all target the form itself: Contact Form 7 fires on
     the wrapper, which contains the form rather than being inside one. */
  function formFromPluginEvent(target) {
    var form = findForm(target);
    if (form) return form;
    try { if (target && target.querySelector) return target.querySelector('form'); } catch (e) {}
    return null;
  }

  function onPluginSuccess(ev) {
    var form = formFromPluginEvent(ev && ev.target) || submitIntentForm || lastTouchedForm;
    if (!form) return;
    clearSubmitIntent();
    sendFromForm(form, 'plugin:' + ((ev && ev.type) || 'success'));
  }

  function installPluginHooks() {
    try {
      if (window.jQuery && !window.__LEADLOGR_JQ_HOOKS__) {
        window.__LEADLOGR_JQ_HOOKS__ = true;
        // jQuery-triggered events are invisible to addEventListener, which is
        // why this needs jQuery at all rather than a native listener.
        window.jQuery(document).on(PLUGIN_SUCCESS_EVENTS.join(' '), onPluginSuccess);
        log('form plugin hooks ready');
      }
    } catch (e) { log('plugin hook failed', e); }
  }
  // Native listener too, for the plugins that dispatch a real DOM event.
  document.addEventListener('wpcf7mailsent', onPluginSuccess, true);
  installPluginHooks();
  // jQuery and the plugins load in whatever order the theme decides.
  setTimeout(installPluginHooks, 1000);
  setTimeout(installPluginHooks, 3000);

  window.Leadlogr = {
    submitForm: function (fields) { send(fields || {}); },
    config: CFG,
    version: '3.0.0',
  };

  log('ready', { endpoint: CFG.endpoint, session: SESSION_ID });
})();
`;

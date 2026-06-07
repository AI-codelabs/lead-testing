export const TRACKER = `/* Leadlogr tracker v1.1 — GDPR-aware: detects CMP, defers/anonymises when no consent */
(function () {
  if (window.__LEADLOGR_RUNNING__) return;
  window.__LEADLOGR_RUNNING__ = true;

  function readConfig() {
    var cfg = window.LEADLOGR_CONFIG || {};
    var tag = document.getElementById('leadlogr-tracker') || document.currentScript;
    if (tag && tag.dataset) {
      if (!cfg.workspaceId && tag.dataset.workspaceId) cfg.workspaceId = tag.dataset.workspaceId;
      if (!cfg.endpoint && tag.dataset.endpoint) cfg.endpoint = tag.dataset.endpoint;
      if (cfg.debug === undefined && tag.dataset.debug) cfg.debug = tag.dataset.debug === 'true';
      if (!cfg.featureFlags && tag.dataset.featureFlags) {
        try { cfg.featureFlags = JSON.parse(tag.dataset.featureFlags); } catch (e) {}
      }
    }
    return cfg;
  }

  var CFG = readConfig();
  if (!CFG.workspaceId || !CFG.endpoint) {
    console.warn('[leadlogr] missing workspaceId or endpoint');
    return;
  }
  var FLAGS = CFG.featureFlags || {};
  // Defaults:
  //   allowConsentFallback: true   -> when consent is denied/unknown, send an
  //                                   ANONYMISED event (no name/email/phone/etc)
  //                                   so attribution still works.
  //   strictNoCmp:          true   -> when no CMP is detected at all, treat as
  //                                   "denied" (GDPR-safe). Set false only if
  //                                   the customer has explicit legal basis.
  if (FLAGS.allowConsentFallback === undefined) FLAGS.allowConsentFallback = true;
  if (FLAGS.strictNoCmp === undefined) FLAGS.strictNoCmp = true;

  var lastSubmittedForm = null;
  var recentSends = [];
  var pendingSends = []; // queued until consent is decided
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

  /* ---------------- CMP / Consent detection ---------------- */
  // Returns: { source: string, state: 'granted'|'denied'|'pending'|'no-cmp' }
  function detectConsent() {
    // 1) Google Consent Mode v2 (most reliable when present)
    try {
      var ics = window.google_tag_data && window.google_tag_data.ics;
      if (ics && typeof ics.getConsentState === 'function') {
        var ad = ics.getConsentState('ad_user_data');
        var ana = ics.getConsentState('analytics_storage');
        // 1 = granted, 2 = denied, 0/undefined = not set
        if (ad === 1 || ana === 1) return { source: 'consent-mode-v2', state: 'granted' };
        if (ad === 2 || ana === 2) return { source: 'consent-mode-v2', state: 'denied' };
        return { source: 'consent-mode-v2', state: 'pending' };
      }
    } catch (e) {}

    // 2) IAB TCF v2 (Quantcast, Sourcepoint, many EU CMPs)
    try {
      if (typeof window.__tcfapi === 'function') {
        // We can't call it synchronously and wait, but its presence means a CMP is loaded.
        return { source: 'tcf-v2', state: 'pending' };
      }
    } catch (e) {}

    // 3) OneTrust
    try {
      if (window.OneTrust || typeof window.OnetrustActiveGroups === 'string') {
        var groups = String(window.OnetrustActiveGroups || '');
        // C0002 = performance, C0004 = targeting. Either implies user interacted.
        if (/C000[2-5]/.test(groups)) return { source: 'onetrust', state: 'granted' };
        if (groups && groups !== ',') return { source: 'onetrust', state: 'denied' };
        return { source: 'onetrust', state: 'pending' };
      }
    } catch (e) {}

    // 4) Cookiebot
    try {
      if (window.Cookiebot && window.Cookiebot.consent) {
        var c = window.Cookiebot.consent;
        if (window.Cookiebot.hasResponse === false) return { source: 'cookiebot', state: 'pending' };
        if (c.marketing || c.statistics) return { source: 'cookiebot', state: 'granted' };
        return { source: 'cookiebot', state: 'denied' };
      }
    } catch (e) {}

    // 5) CookieYes
    try {
      if (typeof window.getCkyConsent === 'function') {
        var cy = window.getCkyConsent();
        if (!cy || !cy.isUserActionCompleted) return { source: 'cookieyes', state: 'pending' };
        var cat = cy.categories || {};
        if (cat.analytics || cat.advertisement) return { source: 'cookieyes', state: 'granted' };
        return { source: 'cookieyes', state: 'denied' };
      }
      if (getCookie('cookieyes-consent')) {
        var raw = getCookie('cookieyes-consent');
        if (/analytics:yes|advertisement:yes/.test(raw)) return { source: 'cookieyes', state: 'granted' };
        return { source: 'cookieyes', state: 'denied' };
      }
    } catch (e) {}

    // 6) Complianz (WP)
    try {
      if (window.cmplz_consent_status) {
        var ok = window.cmplz_consent_status('marketing') || window.cmplz_consent_status('statistics');
        return { source: 'complianz', state: ok ? 'granted' : 'denied' };
      }
    } catch (e) {}

    // 7) Iubenda
    try {
      if (window._iub && window._iub.cs && window._iub.cs.api) {
        var pref = window._iub.cs.api.getPreferences && window._iub.cs.api.getPreferences();
        if (!pref) return { source: 'iubenda', state: 'pending' };
        if (pref.consent === true) return { source: 'iubenda', state: 'granted' };
        return { source: 'iubenda', state: 'denied' };
      }
    } catch (e) {}

    // 8) Didomi
    try {
      if (window.Didomi && typeof window.Didomi.getUserStatus === 'function') {
        var st = window.Didomi.getUserStatus();
        var purposes = st && st.purposes && st.purposes.consent && st.purposes.consent.enabled || [];
        if (purposes.length) return { source: 'didomi', state: 'granted' };
        return { source: 'didomi', state: 'denied' };
      }
    } catch (e) {}

    // 9) Usercentrics
    try {
      if (window.UC_UI && typeof window.UC_UI.getServicesBaseInfo === 'function') {
        var svcs = window.UC_UI.getServicesBaseInfo() || [];
        var any = svcs.some(function (s) { return s && s.consent && s.consent.status === true; });
        return { source: 'usercentrics', state: any ? 'granted' : 'denied' };
      }
    } catch (e) {}

    // 10) Osano
    try {
      if (window.Osano && window.Osano.cm) {
        var s = window.Osano.cm.getConsent ? window.Osano.cm.getConsent() : null;
        if (!s) return { source: 'osano', state: 'pending' };
        if (s.ANALYTICS === 'ACCEPT' || s.MARKETING === 'ACCEPT') return { source: 'osano', state: 'granted' };
        return { source: 'osano', state: 'denied' };
      }
    } catch (e) {}

    // 11) Termly
    try {
      if (window.Termly && getCookie('TERMLY_API_CACHE')) {
        var raw = getCookie('TERMLY_API_CACHE');
        if (/"analytics":true|"advertising":true/.test(decodeURIComponent(raw))) {
          return { source: 'termly', state: 'granted' };
        }
        return { source: 'termly', state: 'denied' };
      }
    } catch (e) {}

    // 12) Common cookie fingerprints (script tag still loading)
    try {
      var html = document.documentElement ? document.documentElement.innerHTML : '';
      var hint =
        /cookiebot|onetrust|cookieyes|complianz|iubenda|didomi|usercentrics|osano|termly|cookieconsent/i;
      var script = document.querySelector('script[src*="cookiebot"],script[src*="onetrust"],script[src*="cookieyes"],script[src*="iubenda"],script[src*="didomi"],script[src*="usercentrics"],script[src*="osano"],script[src*="termly"],script[src*="cookieconsent"],script[src*="complianz"]');
      if (script || hint.test(html.slice(0, 5000))) {
        return { source: 'cmp-loading', state: 'pending' };
      }
    } catch (e) {}

    return { source: 'none', state: 'no-cmp' };
  }

  // Map detector result to the policy the server stores.
  function consentLabel(detected) {
    if (detected.state === 'granted') return 'Accepted';
    if (detected.state === 'denied') return 'Declined';
    if (detected.state === 'pending') return 'Unknown';
    // no CMP at all — strictNoCmp treats as Declined (GDPR-safe default)
    return FLAGS.strictNoCmp ? 'Declined' : 'Unknown';
  }

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
    var detected = detectConsent();
    return {
      workspace_key: CFG.workspaceId,
      utm_source: attribution.utm_source || '',
      utm_medium: attribution.utm_medium || '',
      utm_campaign: attribution.utm_campaign || '',
      utm_term: attribution.utm_term || '',
      utm_content: attribution.utm_content || '',
      gclid: attribution.gclid || '',
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
      consent: consentLabel(detected),
      consent_source: detected.source,
      consent_state: detected.state,
      client_context: clientContext(),
      source: (attribution.gclid ? 'Google'
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
    recentSends = recentSends.filter(function (i) { return now - i.time < 8000; });
    for (var i = 0; i < recentSends.length; i++) if (recentSends[i].key === key) return true;
    recentSends.push({ key: key, time: now });
    return false;
  }

  function stripPII(p) {
    p.name = ''; p.email = ''; p.phone = ''; p.company = ''; p.message = '';
    if (p.custom_fields) p.custom_fields = {};
    p.anonymized = true;
    return p;
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

    var label = payload.consent;
    // Pending: queue and retry when consent resolves
    if (label === 'Unknown' && payload.consent_state === 'pending') {
      log('consent pending — queueing', payload);
      pendingSends.push(extra || {});
      // safety net: flush after 15s with whatever consent state we have
      setTimeout(flushPending, 15000);
      return;
    }
    // Declined (real CMP "no") or no-CMP with strictNoCmp
    if (label === 'Declined') {
      if (FLAGS.allowConsentFallback) {
        transport(stripPII(payload));
      } else {
        log('consent denied — drop', payload);
      }
      return;
    }
    // Accepted
    transport(payload);
  }

  function flushPending() {
    if (!pendingSends.length) return;
    var copy = pendingSends.slice(); pendingSends.length = 0;
    copy.forEach(function (extra) { send(extra); });
  }

  /* Listen for late consent decisions and re-evaluate. */
  function bindConsentListeners() {
    var fire = function () { setTimeout(flushPending, 0); };
    try { window.addEventListener('CookiebotOnAccept', fire); } catch (e) {}
    try { window.addEventListener('CookiebotOnDecline', fire); } catch (e) {}
    try { window.addEventListener('cookieyes_consent_update', fire); } catch (e) {}
    try { window.addEventListener('cmplz_status_change', fire); } catch (e) {}
    try { window.addEventListener('consent.onetrust', fire); } catch (e) {}
    try {
      if (window.OneTrust && typeof window.OneTrust.OnConsentChanged === 'function') {
        window.OneTrust.OnConsentChanged(fire);
      }
    } catch (e) {}
    try {
      if (typeof window.__tcfapi === 'function') {
        window.__tcfapi('addEventListener', 2, function (data, success) {
          if (success && data && (data.eventStatus === 'tcloaded' || data.eventStatus === 'useractioncomplete')) fire();
        });
      }
    } catch (e) {}
    try {
      window.didomiOnReady = window.didomiOnReady || [];
      window.didomiOnReady.push(function () {
        try { window.Didomi.on && window.Didomi.on('consent.changed', fire); } catch (e) {}
        fire();
      });
    } catch (e) {}
    // Generic dataLayer consent push
    try {
      var dl = window.dataLayer = window.dataLayer || [];
      var origPush = dl.push.bind(dl);
      dl.push = function () {
        var args = [].slice.call(arguments);
        try {
          for (var i = 0; i < args.length; i++) {
            var a = args[i];
            if (a && (a[0] === 'consent' || a.event === 'consent_update' || a.event === 'cookie_consent_update')) fire();
          }
        } catch (e) {}
        return origPush.apply(null, args);
      };
    } catch (e) {}
  }
  bindConsentListeners();

  function readableName(el) {
    return (el.name || el.id || el.getAttribute('aria-label') || el.getAttribute('placeholder') || '').toLowerCase();
  }
  function fromForm(form) {
    var extra = { custom_fields: {} };
    var els = form.querySelectorAll('input, textarea, select');
    for (var i = 0; i < els.length; i++) {
      var el = els[i];
      var type = (el.type || '').toLowerCase();
      if (type === 'password' || type === 'hidden' || type === 'submit' || type === 'button' || type === 'file') continue;
      if ((type === 'checkbox' || type === 'radio') && !el.checked) continue;
      var name = readableName(el); var val = el.value;
      if (!val) continue;
      if (type === 'email' || /e-?mail|email/.test(name)) extra.email = val;
      else if (type === 'tel' || /phone|tel|mobile|telefoon/.test(name)) extra.phone = val;
      else if (/company|organi[sz]ation|business|bedrijf/.test(name)) extra.company = val;
      else if (/name|naam|voornaam|achternaam/.test(name) && !extra.name) extra.name = val;
      else if (/message|comment|description|enquiry|inquiry|details|bericht|vraag/.test(name)) extra.message = val;
      else extra.custom_fields[name || ('field_' + i)] = val;
    }
    // attach a small form fingerprint for debugging / dedupe
    extra.form_id = form.id || '';
    extra.form_action = form.action || '';
    return extra;
  }
  function findForm(target) {
    if (!target) return null;
    if (target.tagName === 'FORM') return target;
    if (target.closest) return target.closest('form');
    return null;
  }
  function handleSubmit(ev) {
    var form = findForm(ev.target); if (!form) return;
    lastSubmittedForm = form;
    try { send(fromForm(form)); } catch (e) { log('form parse error', e); }
  }

  document.addEventListener('submit', handleSubmit, true);
  document.addEventListener('click', function (ev) {
    var target = ev.target && ev.target.closest ? ev.target.closest('button,input[type="submit"],[type="button"]') : null;
    var form = target && findForm(target);
    if (form) lastSubmittedForm = form;
  }, true);

  function installElementorHook() {
    try {
      if (!window.jQuery || window.__LEADLOGR_ELEMENTOR_HOOK__) return;
      window.__LEADLOGR_ELEMENTOR_HOOK__ = true;
      window.jQuery(document).on('submit_success', function (event) {
        var form = findForm(event && event.target) || lastSubmittedForm;
        if (form) send(fromForm(form));
      });
      log('elementor hook ready');
    } catch (e) { log('elementor hook failed', e); }
  }
  installElementorHook();
  setTimeout(installElementorHook, 1000);
  setTimeout(installElementorHook, 3000);

  window.Leadlogr = {
    submitForm: function (fields) { send(fields || {}); },
    getConsent: detectConsent,
    flushPending: flushPending,
    config: CFG,
    version: '1.1.0',
  };

  log('ready', { workspaceId: CFG.workspaceId, endpoint: CFG.endpoint, consent: detectConsent() });
})();
`;

export const TRACKER = `/* Leadlogr tracker v1 — autodetects forms, captures attribution */
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
  var lastSubmittedForm = null;
  var recentSends = [];
  var log = function () {
    if (CFG.debug) try { console.log.apply(console, ['[leadlogr]'].concat([].slice.call(arguments))); } catch (e) {}
  };

  function getParam(name) {
    try { return new URLSearchParams(window.location.search).get(name) || ''; } catch (e) { return ''; }
  }
  function escapeCookieName(name) {
    var s = String(name || '');
    var out = '';
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

  var KEYS = ['utm_source','utm_medium','utm_campaign','utm_term','utm_content','gclid','fbclid','msclkid','li_fat_id'];
  var attribution = {};
  KEYS.forEach(function (k) {
    var fromUrl = getParam(k);
    if (fromUrl) setLS('ll_' + k, fromUrl);
    attribution[k] = fromUrl || getLS('ll_' + k);
  });

  if (!getLS('ll_landing_page_url')) setLS('ll_landing_page_url', window.location.href);
  if (!getLS('ll_referrer_url')) setLS('ll_referrer_url', document.referrer || '');

  function gaClientId() {
    var ga = getCookie('_ga');
    if (!ga) return '';
    var parts = ga.split('.');
    return parts.length >= 4 ? parts[2] + '.' + parts[3] : '';
  }

  function consentState() {
    try {
      if (window.google_tag_data && window.google_tag_data.ics) {
        var ad = window.google_tag_data.ics.getConsentState && window.google_tag_data.ics.getConsentState('ad_user_data');
        if (ad === 1) return 'Accepted';
        if (ad === 2) return 'Declined';
      }
    } catch (e) {}
    return 'Unknown';
  }

  function basePayload() {
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
      referrer_url: getLS('ll_referrer_url') || document.referrer || '',
      consent: consentState(),
      source: (attribution.gclid ? 'Google'
              : attribution.fbclid ? 'Meta'
              : attribution.li_fat_id ? 'LinkedIn'
              : attribution.msclkid ? 'Microsoft'
              : 'Direct'),
    };
  }

  function dedupeKey(payload) {
    return [payload.email || '', payload.phone || '', payload.name || '', payload.page_path || ''].join('|').toLowerCase();
  }

  function shouldSkip(payload) {
    var now = Date.now();
    var key = dedupeKey(payload);
    recentSends = recentSends.filter(function (item) { return now - item.time < 8000; });
    for (var i = 0; i < recentSends.length; i++) if (recentSends[i].key === key) return true;
    recentSends.push({ key: key, time: now });
    return false;
  }

  function send(extra) {
    var payload = basePayload();
    if (extra) for (var k in extra) if (Object.prototype.hasOwnProperty.call(extra, k)) payload[k] = extra[k];
    if (FLAGS.allowConsentFallback !== false && payload.consent === 'Declined') {
      payload.name = ''; payload.email = ''; payload.phone = '';
    }
    if (shouldSkip(payload)) { log('duplicate skipped', payload); return; }

    log('sending', payload);
    var body = JSON.stringify(payload);
    try {
      if (navigator.sendBeacon) {
        // Use text/plain to keep it a CORS-safelisted request (no preflight, no credentials issue)
        var blob = new Blob([body], { type: 'text/plain;charset=UTF-8' });
        if (navigator.sendBeacon(CFG.endpoint, blob)) return;
      }
    } catch (e) {}
    fetch(CFG.endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: body,
      keepalive: true,
      mode: 'cors',
    }).catch(function (err) { log('send failed', err); });
  }

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
      var name = readableName(el);
      var val = el.value;
      if (!val) continue;
      if (type === 'email' || /e-?mail|email/.test(name)) extra.email = val;
      else if (type === 'tel' || /phone|tel|mobile|telefoon/.test(name)) extra.phone = val;
      else if (/company|organi[sz]ation|business|bedrijf/.test(name)) extra.company = val;
      else if (/name|naam|voornaam|achternaam/.test(name) && !extra.name) extra.name = val;
      else if (/message|comment|description|enquiry|inquiry|details|bericht|vraag/.test(name)) extra.message = val;
      else extra.custom_fields[name || ('field_' + i)] = val;
    }
    return extra;
  }

  function findForm(target) {
    if (!target) return null;
    if (target.tagName === 'FORM') return target;
    if (target.closest) return target.closest('form');
    return null;
  }

  function handleSubmit(ev) {
    var form = findForm(ev.target);
    if (!form) return;
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
    config: CFG,
    version: '1.0.1',
  };

  log('ready', { workspaceId: CFG.workspaceId, endpoint: CFG.endpoint });
})();
`;
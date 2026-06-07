import { createFileRoute } from "@tanstack/react-router";

// Served as /tracker.v1.js — pasted into Google Tag Manager or directly on the site.
// Auto-detects form submissions, captures UTMs + click IDs + referrer, and
// posts to /api/public/leads/collect on the Leadlogr origin.
const TRACKER = `/* Leadlogr tracker v1 — autodetects <form> submits, captures attribution */
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
  var log = function () {
    if (CFG.debug) try { console.log.apply(console, ['[leadlogr]'].concat([].slice.call(arguments))); } catch (e) {}
  };

  // ---------- attribution ----------
  function getParam(name) {
    try { return new URLSearchParams(window.location.search).get(name) || ''; } catch (e) { return ''; }
  }
  function getCookie(name) {
    var m = document.cookie.match(new RegExp('(?:^|; )' + name.replace(/([.$?*|{}()\\[\\]\\\\\\/+^])/g, '\\\\$1') + '=([^;]*)'));
    return m ? decodeURIComponent(m[1]) : '';
  }
  function setLS(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
  function getLS(k) { try { return localStorage.getItem(k) || ''; } catch (e) { return ''; } }

  // first-touch attribution: persist on first visit
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
      // Google Consent Mode v2 hook (if present)
      if (window.google_tag_data && window.google_tag_data.ics) {
        var ad = window.google_tag_data.ics.getConsentState && window.google_tag_data.ics.getConsentState('ad_user_data');
        if (ad === 1) return 'Accepted';
        if (ad === 2) return 'Declined';
      }
    } catch (e) {}
    return 'Unknown';
  }

  // ---------- payload assembly ----------
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

  function send(extra) {
    var payload = basePayload();
    if (extra) for (var k in extra) if (Object.prototype.hasOwnProperty.call(extra, k)) payload[k] = extra[k];

    // PII strip when consent denied (still send anonymized event for attribution)
    if (FLAGS.allowConsentFallback !== false && payload.consent === 'Declined') {
      payload.name = ''; payload.email = ''; payload.phone = '';
    }

    log('sending', payload);
    var body = JSON.stringify(payload);
    try {
      if (navigator.sendBeacon) {
        var blob = new Blob([body], { type: 'application/json' });
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

  // ---------- form auto-detection ----------
  function fromForm(form) {
    var extra = { custom_fields: {} };
    var els = form.querySelectorAll('input, textarea, select');
    for (var i = 0; i < els.length; i++) {
      var el = els[i];
      var type = (el.type || '').toLowerCase();
      if (type === 'password' || type === 'hidden' || type === 'submit' || type === 'button' || type === 'file') continue;
      var name = (el.name || el.id || '').toLowerCase();
      var val = el.value;
      if (!val) continue;
      if (type === 'email' || /email/.test(name)) extra.email = val;
      else if (type === 'tel' || /phone|tel|mobile/.test(name)) extra.phone = val;
      else if (/company|organi[sz]ation|business/.test(name)) extra.company = val;
      else if (/name/.test(name) && !extra.name) extra.name = val;
      else if (/message|comment|description|enquiry|inquiry|details/.test(name)) extra.message = val;
      else extra.custom_fields[name || ('field_' + i)] = val;
    }
    return extra;
  }

  function handleSubmit(ev) {
    var form = ev.target;
    if (!form || form.tagName !== 'FORM') return;
    try { send(fromForm(form)); } catch (e) { log('form parse error', e); }
  }

  // capture phase = fires before any preventDefault by site code
  document.addEventListener('submit', handleSubmit, true);

  // dynamic forms (SPAs, modals)
  if (FLAGS.allowDynamicForms !== false && window.MutationObserver) {
    new MutationObserver(function () { /* listener is already global; nothing to do */ }).observe(document.documentElement, { childList: true, subtree: true });
  }

  // manual API for SPA / custom submit handlers
  window.Leadlogr = {
    submitForm: function (fields) { send(fields || {}); },
    config: CFG,
    version: '1.0.0',
  };

  log('ready', { workspaceId: CFG.workspaceId, endpoint: CFG.endpoint });
})();
`;

export const Route = createFileRoute("/tracker/v1.js")({
  server: {
    handlers: {
      GET: async () => {
        return new Response(TRACKER, {
          status: 200,
          headers: {
            "Content-Type": "application/javascript; charset=utf-8",
            "Cache-Control": "public, max-age=300",
            "Access-Control-Allow-Origin": "*",
          },
        });
      },
    },
  },
});

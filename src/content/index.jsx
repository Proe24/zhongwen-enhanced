// content/index.jsx — bootstrap: read the on/off flag and settings, keep them
// live, and hand them to the engine. Does nothing on a page until lookups are on.
import { configure, openSentence } from './engine.js';
import { normalizeSettings, siteDisabled } from '../shared/settings.js';
import { resolveScheme } from '../shared/theme.js';

(function main() {
  if (window.__zhongwenEnhanced) return; // injected twice (e.g. after an update)
  window.__zhongwenEnhanced = true;
  const mq = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;
  let enabled = false;
  let settings = normalizeSettings(null);

  // "off on this site" means the site the user sees: the top-level page, not a
  // third-party iframe's own hostname
  const siteHost = () => {
    try { return window.top.location.hostname; } catch { /* cross-origin frame */ }
    try { if (document.referrer) return new URL(document.referrer).hostname; } catch { /* ignore */ }
    return location.hostname;
  };
  const apply = () => configure({ enabled, settings, scheme: resolveScheme(settings.theme, !!(mq && mq.matches)), siteOff: siteDisabled(settings, siteHost()) });

  chrome.storage.local.get(['enabled', 'settings'], (raw) => {
    enabled = raw.enabled === true;
    settings = normalizeSettings(raw.settings);
    apply();
  });
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;
    if (changes.enabled) enabled = changes.enabled.newValue === true;
    if (changes.settings) settings = normalizeSettings(changes.settings.newValue);
    if (changes.enabled || changes.settings) apply();
  });
  mq && mq.addEventListener && mq.addEventListener('change', apply);

  chrome.runtime.onMessage.addListener((msg) => {
    if (msg && msg.type === 'openSentence') openSentence(String(msg.text || ''));
  });
})();

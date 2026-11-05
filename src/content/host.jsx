// host.jsx — the one element we add to the page: a fixed, zero-size host with
// a shadow root that holds our stylesheet and whatever Preact renders. Styles
// go in through adopted stylesheets (a page's CSP can block inline <style>,
// but not CSSOM), with a <style> element as the fallback.
import { render } from 'preact';
import css from './content.css?inline';

let host = null;
let root = null;
let mount = null; // the popup's mount
let mounts = {}; // named mounts: 'panel'
let sheet = null;

function styleSheet() {
  if (sheet) return sheet;
  try { sheet = new CSSStyleSheet(); sheet.replaceSync(css); } catch { sheet = null; }
  return sheet;
}

export function ensureHost() {
  if (host && host.isConnected) return mount;
  // a page that removed our host: drop every old tree before building anew
  if (mount) { try { render(null, mount); } catch { /* ignore */ } }
  for (const k of Object.keys(mounts)) { try { render(null, mounts[k]); } catch { /* ignore */ } }
  mounts = {};
  host = document.createElement('zhongwen-enhanced');
  host.style.cssText = 'all:initial!important;position:fixed!important;top:0!important;left:0!important;width:0!important;height:0!important;z-index:2147483647!important;display:block!important;';
  root = host.attachShadow({ mode: 'open' });
  const s = styleSheet();
  if (s && 'adoptedStyleSheets' in root) root.adoptedStyleSheets = [s];
  else { const style = document.createElement('style'); style.textContent = css; root.append(style); }
  mount = document.createElement('div');
  mount.className = 'zw-root';
  root.append(mount);
  (document.documentElement || document.body).append(host);
  return mount;
}

export function renderInto(vnode) { render(vnode, ensureHost()); }
// a second, independent mount in the same shadow root (the sentence panel)
export function mountFor(name) {
  ensureHost();
  if (!mounts[name]) { const el = document.createElement('div'); el.className = `zw-root zw-mount-${name}`; root.append(el); mounts[name] = el; }
  return mounts[name];
}
export function unmountAll() { if (mount) render(null, mount); }
export function hostEl() { return host; }
export function isInsideHost(target) {
  if (!host || !target) return false;
  if (target === host || host.contains(target)) return true;
  const rn = target.getRootNode && target.getRootNode();
  return rn === root;
}
// first element of a class inside the shadow root
export const q = (sel) => (root ? root.querySelector(sel) : null);

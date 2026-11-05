// host.jsx — the one element we add to the page: a fixed, zero-size host with
// a shadow root that holds our stylesheet and whatever Preact renders.
import { render } from 'preact';
import css from './content.css?inline';

let host = null;
let root = null;
let mount = null;

export function ensureHost() {
  if (host && host.isConnected) return mount;
  host = document.createElement('zhongwen-enhanced');
  host.setAttribute('style', 'all:initial!important;position:fixed!important;top:0!important;left:0!important;width:0!important;height:0!important;z-index:2147483647!important;display:block!important;');
  root = host.attachShadow({ mode: 'open' });
  const style = document.createElement('style');
  style.textContent = css;
  root.append(style);
  mount = document.createElement('div');
  mount.className = 'zw-root';
  root.append(mount);
  (document.documentElement || document.body).append(host);
  return mount;
}

export function renderInto(vnode) { render(vnode, ensureHost()); }
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

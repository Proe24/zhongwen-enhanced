// route.js — hash routing: "#/vocab?title=x" → { path: '/vocab', query: {title:'x'} }
import { useEffect, useState } from 'preact/hooks';

export function parseHash(h = location.hash) {
  const s = h.replace(/^#/, '') || '/';
  const [path, qs] = s.split('?');
  const query = {};
  if (qs) for (const kv of qs.split('&')) { const [k, v = ''] = kv.split('='); query[decodeURIComponent(k)] = decodeURIComponent(v); }
  return { path: path || '/', query };
}
export function useRoute() {
  const [r, setR] = useState(parseHash());
  useEffect(() => { const h = () => setR(parseHash()); addEventListener('hashchange', h); return () => removeEventListener('hashchange', h); }, []);
  return r;
}
export const go = (path, query) => { location.hash = path + (query ? '?' + Object.entries(query).map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join('&') : ''); };

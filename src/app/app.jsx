// app.jsx — the Library (placeholder until stories S6+).
import { render } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import { api } from '../shared/api.js';
import { tokensFor, cssVars, resolveScheme } from '../shared/theme.js';

function App() {
  const [st, setSt] = useState(null);
  useEffect(() => { api.state().then(setSt); }, []);
  useEffect(() => {
    if (!st) return;
    const scheme = resolveScheme(st.settings.theme, matchMedia('(prefers-color-scheme: dark)').matches);
    document.documentElement.style.cssText = cssVars(tokensFor(st.settings, scheme));
  }, [st]);
  if (!st) return <div class="app-loading">Loading…</div>;
  return <div class="app" style="padding:40px"><h1>Zhongwen Enhanced</h1><p>{Object.keys(st.vocab).length} words saved.</p></div>;
}
render(<App />, document.getElementById('root'));

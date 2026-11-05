// popup.jsx — the toolbar popup (placeholder until story S2).
import { render } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import { api } from '../shared/api.js';
import { tokensFor, cssVars, resolveScheme } from '../shared/theme.js';

function Popup() {
  const [st, setSt] = useState(null);
  useEffect(() => { api.state().then(setSt); }, []);
  useEffect(() => {
    if (!st) return;
    document.documentElement.style.cssText = cssVars(tokensFor(st.settings, resolveScheme(st.settings.theme, matchMedia('(prefers-color-scheme: dark)').matches)));
  }, [st]);
  if (!st) return <div style="padding:16px">Loading…</div>;
  return (
    <div style="padding:16px">
      <button onClick={() => api.toggle().then((r) => setSt({ ...st, enabled: r.enabled }))}>{st.enabled ? 'Turn off' : 'Turn on'}</button>
    </div>
  );
}
render(<Popup />, document.getElementById('root'));

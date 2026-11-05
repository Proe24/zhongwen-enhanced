// app.jsx — the Library shell: sidebar + the screen for the current route.
import { render } from 'preact';
import { useAppState } from '../components/ui.jsx';
import { useRoute } from './route.js';
import { queueCount } from '../shared/review.js';
import { Vocab } from './Vocab.jsx';
import { Review } from './Review.jsx';
import { Sentences } from './Sentences.jsx';
import { Dictionary } from './Dictionary.jsx';
import { Stats } from './Stats.jsx';
import { Settings } from './Settings.jsx';
import { Help } from './Help.jsx';

const NAV = [
  ['/vocab', 'Vocabulary'], ['/review', 'Review'], ['/sentences', 'Sentences'], ['/dictionary', 'Dictionary'], ['/stats', 'Stats'], ['/settings', 'Settings'], ['/help', 'Help'],
];

function App() {
  const { st, error } = useAppState();
  const route = useRoute();
  if (error) return <div class="empty">Could not reach the extension: {error}. Try reloading this tab.</div>;
  if (!st) return <div class="empty">Loading…</div>;
  const path = route.path === '/' ? '/vocab' : route.path;
  const due = queueCount(st);
  const words = Object.keys(st.vocab).length;
  const Screen = { '/vocab': Vocab, '/review': Review, '/sentences': Sentences, '/dictionary': Dictionary, '/stats': Stats, '/settings': Settings, '/help': Help }[path] || Help;
  const counts = { '/vocab': words, '/review': due, '/sentences': st.sentences.length };
  return (
    <div class="app">
      <aside class="side">
        <a class="brand" href="#/vocab"><img src="../icons/icon48.png" alt="" /><div><b>Zhongwen Enhanced</b><span>{st.enabled ? 'Lookups on' : 'Lookups off'} · Alt+Z</span></div></a>
        {NAV.map(([p, label]) => (
          <a key={p} class={`nav ${p === path ? 'on' : ''}`} href={'#' + p}>{label}{counts[p] ? <span class="count">{counts[p]}</span> : null}</a>
        ))}
        <div class="side-foot">Offline · private · {st.dictSource || 'CC-CEDICT'}</div>
      </aside>
      <main class="main"><Screen st={st} route={route} /></main>
    </div>
  );
}
render(<App />, document.getElementById('root'));

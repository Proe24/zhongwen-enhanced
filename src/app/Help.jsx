// Help.jsx — how it works, every shortcut, what the data is, credits.
export function Help({ st, route }) {
  const v = chrome.runtime.getManifest().version;
  const fromV1 = route.query.from === 'v1';
  return (
    <div class="help">
      <div class="page-head"><h1>Help</h1><span class="sub">Zhongwen Enhanced {v}</span></div>
      {fromV1 && <div class="banner">Welcome to 2.0 — your word list from the previous version has been imported into Vocabulary.</div>}
      {!st.enabled && <div class="banner">Lookups are off. Turn them on from the toolbar icon or with Alt+Z.</div>}

      <h2>Reading a page</h2>
      <p>Turn lookups on (toolbar icon, or <kbd>Alt</kbd>+<kbd>Z</kbd>). Rest the pointer on any Chinese word: a card shows the word, tone-colored pinyin, its meanings, the other script, its HSK level and each of its characters. The longest dictionary word is picked; the shorter words that start at the same place are offered as chips.</p>
      <p>Click the word (or press <kbd>space</kbd>) to <b>pin</b> the card so you can click inside it. Pressing <kbd>s</kbd> saves the word <i>with the sentence it was in</i>, for review and export.</p>

      <h2>Shortcuts while a card is open</h2>
      <table>
        <tr><td><kbd>n</kbd></td><td>next word</td><td><kbd>s</kbd></td><td>save / remove</td></tr>
        <tr><td><kbd>b</kbd></td><td>back one character</td><td><kbd>a</kbd></td><td>listen</td></tr>
        <tr><td><kbd>m</kbd></td><td>next character</td><td><kbd>c</kbd></td><td>copy word · pinyin · meaning</td></tr>
        <tr><td><kbd>j</kbd> <kbd>k</kbd></td><td>shorter / longer match</td><td><kbd>t</kbd></td><td>break down the sentence</td></tr>
        <tr><td><kbd>space</kbd></td><td>pin / unpin</td><td><kbd>d</kbd></td><td>short / full entry</td></tr>
        <tr><td><kbd>esc</kbd></td><td>close</td><td><kbd>?</kbd></td><td>show / hide these hints</td></tr>
      </table>
      <p>Browser-wide: <kbd>Alt</kbd>+<kbd>Z</kbd> toggles lookups, <kbd>Alt</kbd>+<kbd>Shift</kbd>+<kbd>Z</kbd> opens this Library. Change them at chrome://extensions/shortcuts.</p>

      <h2>Sentences</h2>
      <p>Select Chinese text and press <kbd>t</kbd>, or right-click → <i>Break down with Zhongwen</i>: the selection is split into words, each with pinyin and a gloss. Save it to come back to it under Sentences.</p>

      <h2>Review</h2>
      <p>Saved words are scheduled with FSRS, the spaced-repetition algorithm behind modern Anki. Reveal with <kbd>space</kbd>, grade with <kbd>1</kbd>–<kbd>4</kbd> (Again · Hard · Good · Easy). A word marked Again comes back later in the same session. Daily limits live in Settings.</p>

      <h2>Your data</h2>
      <p>Everything is stored in this browser's extension storage and never sent anywhere. Settings → Your data exports flashcards (Anki, Pleco, CSV) and a full backup file you can restore in another browser.</p>

      <h2>Credits</h2>
      <ul>
        <li><a href="https://cc-cedict.org/" target="_blank" rel="noopener">CC-CEDICT</a> dictionary (CC BY-SA 4.0) — {st.dictSource}</li>
        <li>HSK 3.0 word lists from <a href="https://github.com/drkameleon/complete-hsk-vocabulary" target="_blank" rel="noopener">complete-hsk-vocabulary</a> (MIT)</li>
        <li><a href="https://github.com/open-spaced-repetition/ts-fsrs" target="_blank" rel="noopener">ts-fsrs</a> (MIT) · <a href="https://preactjs.com/" target="_blank" rel="noopener">Preact</a> (MIT)</li>
        <li>Inspired by the original Zhongwen by Christian Schiller and by 一句 Yiju. Source: <a href="https://github.com/Proe24/zhongwen-enhanced" target="_blank" rel="noopener">github.com/Proe24/zhongwen-enhanced</a> (GPL-2.0-or-later)</li>
      </ul>
    </div>
  );
}

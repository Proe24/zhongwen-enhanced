# Zhongwen Enhanced 2.0 — design notes

Version 2 is a ground-up rewrite of the extension. Nothing of the 1.x code
survives; the inspiration is [一句 Yiju](https://github.com/Proe24/yiju),
the same author's calm, offline-first Chinese reader: one dictionary
(CC-CEDICT), tone-colored pinyin, a word card that leads with the whole word
and breaks it into characters, saved words that carry their sentence, FSRS
spaced repetition, and no servers anywhere.

This file is the working design: the user stories that drove the build, in the
order they were built, and the questions each one was grilled with before and
after. It is kept so the next person (or session) can see *why*, not just what.

## Principles

1. **The page comes first.** The popup is a guest: one shadow-DOM host, no
   DOM rewriting, the native CSS Highlight API instead of hijacking the
   selection, and it only listens at all while lookups are on.
2. **Offline and private.** The dictionary ships in the package. No network
   requests, no accounts, no analytics. The only data that leaves the browser
   is what the user exports.
3. **One writer.** The service worker owns storage. Every tab, the toolbar
   popup and the Library talk to it through one message client, so two tabs
   saving words at once cannot lose each other's writes.
4. **Calm.** Few colors, few words, one accent, and the same visual language in
   the popup, the toolbar and the Library.

## Architecture

```
src/
  manifest.json          MV3 manifest (version is stamped from package.json)
  shared/                pure modules, unit-tested under vitest
    pinyin.js            numbered pinyin → marks / numbers / zhuyin
    dict.js              decode the compact table, matches-at-position, segmentation
    search.js            hanzi / pinyin / English search over the whole dictionary
    fsrs.js              ts-fsrs wrapper (grades, buckets, familiarity)
    schema.js            storage keys, v1 → v2 migration
    settings.js          defaults + validator
    exports.js           Anki / Pleco / CSV, backup + restore
    theme.js             tokens → CSS custom properties
    api.js               the message client
  background/index.js    service worker: dictionary, storage, badge, menus, commands
  content/               content script: textStream (DOM → characters), highlight,
                         host (shadow root), engine (hover/keyboard state machine), Popup
  components/            Preact components shared by popup, toolbar and Library
  app/                   the Library page (hash routes)
  popup/                 the toolbar popup
data/                    CC-CEDICT source + table builders
public/dict/             the shipped gzipped tables
e2e/run.mjs              loads dist/ into headless Chromium and drives it
```

Build: Vite 8 + Preact. Two builds — pages + worker as ES modules, the content
script as a single IIFE with its CSS inlined (a content script cannot be a
module, and page CSS must never leak in or out).

## Stories and the grilling

Each story was interrogated before it was built. The hard questions and the
answers that held up are recorded here; the ones that changed the design are
marked **(changed)**.

### S0 — Scaffold

- *Why Preact for a script injected into every page?* 4 KB gzipped, and the
  word card is genuinely stateful (drill stack, readings, save state). The whole
  content bundle is ~42 KB minified. It lets the popup, the toolbar and the
  Library share one `WordCard`.
- *Why not keep jQuery/Bootstrap from 1.x?* 230 KB of CSS/JS for a popup is the
  wrong trade, and page CSS collisions were a standing bug class. Shadow DOM
  plus hand-written CSS replaces both.
- *Where does the dictionary live and what happens when the worker is killed?*
  In the worker, loaded lazily and memoized. Chrome ends an idle worker after
  ~30 s; the next lookup reloads the table (~4.4 MB gzip → ~150 ms). The popup
  shows "Loading dictionary…" only if a lookup takes longer than 600 ms.
  **(changed)** The first design pinged the worker to keep it alive; dropped as
  a battery cost with no user-visible win.
- *Memory?* The table is one string per headword (readings joined with
  separators) decoded on demand, instead of nested arrays: a third of the heap.
- *Why rebuild from the repo's CC-CEDICT instead of a fresh download?* mdbg.net
  is not reachable from the build environment; the source file in `data/`
  (2025-04-26) is kept in git so the build is reproducible. `npm run dict`
  rebuilds from a newer file.

### S1 — Hover lookup

- *How do we know which character is under the pointer?*
  `caretPositionFromPoint`, then a check that the character's own box contains
  the point (otherwise the caret snaps to the nearest text from the margin).
- *How do words cross inline elements (`<b>`, `<a>`)?* The nearest block
  element is flattened into a stream of visible characters that remember their
  text node; the word is a slice of the stream; a Range is rebuilt from it.
  Hidden text, scripts, ruby annotations are skipped.
- *Longest match wins — what about the shorter words?* All matches starting at
  the cursor are returned; the popup shows the longest and offers the rest as
  chips (and `j`/`k`).
- *How is the popup positioned?* Below the first line box of the word, flipped
  above when there's no room, clamped to the viewport. On scroll it follows the
  word and hides when the word leaves the viewport.
- *Moving the mouse from the word into the popup crosses other text.* A
  "corridor" (the union of word box and popup box) suppresses re-lookups.
- *Traditional pages?* Traditional spellings are alias keys that redirect to the
  simplified record; the popup leads with the spelling as written on the page.

### S2 — On/off

- *Toolbar click: toggle or open a popup?* 1.x toggled on click. 2.0 opens a
  small popup with a big switch plus counts and search — and `Alt+Z` toggles
  without opening anything. The badge reads ON.
- *Per site?* A hostname list in settings; the popup has "Off on this site".

### S3 — Keyboard and pinning

- *Which keys, and when?* Single letters (n b m s a c t d j k ? space esc), only
  while the popup is visible and focus is not in a field. They're captured
  before the page sees them.
- *Why pinning?* A hover-only popup can't be interacted with. Click the word or
  press space; a pinned popup ignores the mouse until Esc or a click outside.
  Drilling into a character pins automatically.

### S4 — Word detail

- *What does the card show, in order?* The word (each character tone-colored),
  its pinyin, the other script when it differs, HSK level, saved/familiarity;
  then the senses of the main reading; other readings; the characters (tap to
  drill); then actions. A "short" view keeps the first two senses only.

### S5 — Saving

- *What is saved?* `{ w, trad, py, def, sent, url, title, addedAt }` — enough to
  review and export without the dictionary. The sentence is cut from the stream
  at `。！？；` boundaries, capped at 140 characters each side.
- *What about 1.x users?* On update the old `wordlist` JSON becomes vocab +
  sentences (list names become the source title). The raw copy is kept under
  `v1Wordlist` until the user clears data.

### S6–S11

See the sections added as each story landed below.

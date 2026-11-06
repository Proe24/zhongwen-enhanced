# 中 Zhongwen Enhanced

A calm Chinese pop-up dictionary and vocabulary trainer for Chrome. Hover over
Chinese on any page to read it; save the words you meet **with the sentence
they were in**; review them with spaced repetition. Everything runs on your
device: the dictionary ships inside the extension and nothing is ever sent
anywhere.

Version 2 is a ground-up rewrite, inspired by [一句 Yiju](https://readyiju.com)
and by the original [Zhongwen](https://github.com/cschiller/zhongwen) that
1.x was forked from. No 1.x code remains; your 1.x word list is imported on
update.

## What it does

A tour with screenshots is in [docs/FEATURES.md](docs/FEATURES.md).

- **Hover to read.** Rest the pointer on a word: the longest dictionary match
  is highlighted in the page and a peek shows the word with each character
  colored by tone, pinyin (tone marks, numbers or zhuyin), the other script
  (simplified ↔ traditional), its HSK 3.0 level and its first senses. Hold
  Shift for the full card: every meaning and reading, each character, actions
  and links. Shorter words that start at the same place are one click (or
  `j`/`k`) away.
- **Keyboard reading.** `n` next word · `b` back · `m` next character, across
  paragraphs, scrolling as you go. `space` pins the card so you can click in it.
- **Save with context.** `s` saves the word together with its sentence, the
  page title and URL. The Library groups words by where you found them.
- **Sentences.** Select text and press `t` (or right-click → *Break down with
  Zhongwen*) to see it word by word with pinyin and glosses, listen to it, and
  save it.
- **Review.** FSRS flashcards (the algorithm behind modern Anki) with the saved
  sentence on the back, optional cloze fronts, Anki-style daily limits, and
  keyboard grading.
- **Dictionary search** by hanzi, pinyin (`nihao`, `ni3hao3`, `nǐhǎo`) or
  English, in the toolbar popup and in the Library.
- **Export & backup.** Anki (tab-separated), Pleco flashcards, CSV; a one-file
  backup you can restore anywhere (merge or replace).
- **Stats.** Familiarity breakdown, streak, a 26-week activity map.
- **Themes.** Light (warm paper) and dark, following the system by default;
  four tone palettes including the Pleco colors.
- **Private by design.** No network permissions, no accounts, no analytics.
  Lookups can be switched off per site.

## Install

From the Chrome Web Store (listing pending), or unpacked:

```bash
npm install
npm run build          # → dist/ (an unpacked extension)
```

Then open `chrome://extensions`, enable *Developer mode*, choose **Load
unpacked** and pick `dist/`. `npm run pack` also writes a store-ready zip.

Chrome 120 or newer. Firefox is not supported in 2.0 (the content script relies
on the CSS Custom Highlight API and MV3 service workers).

## Use

Turn lookups on from the toolbar icon or with **Alt+Z** (badge reads ON).
Hover Chinese text. While a card is open:

| key | | key | |
|---|---|---|---|
| `n` | next word | `s` | save / remove |
| `b` | back one character | `a` | listen |
| `m` | next character | `c` | copy word · pinyin · meaning |
| `j` `k` | shorter / longer match | `t` | break down the sentence |
| `space` | pin / unpin | `d` | keep the full card |
| `Shift` (held) | peek → full card | | |
| `esc` | close | `?` | show / hide hints |

**Alt+Shift+Z** opens the Library (vocabulary, review, sentences, dictionary,
stats, settings, help). Shortcuts can be changed at
`chrome://extensions/shortcuts`.

## Develop

```bash
npm test               # vitest: pinyin, dictionary, search, FSRS, exports, migration
npm run build          # vite: pages + service worker, then the content script
npm run e2e            # loads dist/ into headless Chromium and drives the extension
npm run dict           # rebuild public/dict/words.json.gz from data/cedict_ts.u8
npm run hsk            # rebuild public/dict/hsk.json.gz (downloads the HSK 3.0 lists)
npm run icons          # re-render the icon PNGs from the SVG
```

`e2e/run.mjs` uses the `playwright` package from `node_modules` if present,
otherwise a global install (`PLAYWRIGHT_MODULE` overrides the path).

See [docs/DESIGN.md](docs/DESIGN.md) for the architecture, the user stories
the rewrite was built from, and the questions each one was tested against.

## Layout

```
src/shared/       pure modules (pinyin, dictionary, search, FSRS, exports, schema, theme)
src/background/   service worker — owns the dictionary and all storage writes
src/content/      content script — text stream, highlight, popup, sentence panel
src/components/   Preact components shared by popup, toolbar and Library
src/app/          the Library page   ·   src/popup/   the toolbar popup
data/             CC-CEDICT source and the table builders
public/dict/      the shipped gzipped tables (~4.5 MB)
test/  e2e/       unit tests · end-to-end run
```

## Data & licenses

- [CC-CEDICT](https://cc-cedict.org/) — CC BY-SA 4.0 (`data/cedict_ts.u8`,
  shipped as `public/dict/words.json.gz`).
- HSK 3.0 word lists from
  [complete-hsk-vocabulary](https://github.com/drkameleon/complete-hsk-vocabulary) — MIT.
- [ts-fsrs](https://github.com/open-spaced-repetition/ts-fsrs) — MIT.
  [Preact](https://preactjs.com/) — MIT.

Zhongwen Enhanced is free software under the
[GNU GPL v2 or later](LICENSE). See [NOTICE.md](NOTICE.md) and
[PRIVACY.md](PRIVACY.md).

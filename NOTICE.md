# NOTICE

**Zhongwen Enhanced** — Copyright (C) 2026 Stephen Underwood
<https://github.com/Proe24/zhongwen-enhanced>

Licensed under the **GNU General Public License, version 2 or later**
(GPL-2.0-or-later). See [LICENSE](LICENSE).

## About this version

Version 2.0 (2026) is a complete rewrite. Versions 1.x were a fork of
*Zhongwen* by Christian Schiller (<https://github.com/cschiller/zhongwen>,
GPL-2.0-or-later; itself based on Rikaikun, Rikaichan and RikaiXUL). None of
that code remains in 2.0; the name, the idea of a hover dictionary with
keyboard navigation, and the GPL license are kept. The design draws on
一句 Yiju (<https://readyiju.com>) by the same author.

## Bundled third-party components

- **CC-CEDICT** (`data/cedict_ts.u8`, shipped as `public/dict/words.json.gz`)
  — Chinese–English dictionary, CC BY-SA 4.0.
  <https://cc-cedict.org/> · <https://www.mdbg.net/chinese/dictionary?page=cedict>
- **Complete HSK Vocabulary** (`public/dict/hsk.json.gz`) — HSK 3.0 word
  lists by Yanis Zafirópulos, MIT.
  <https://github.com/drkameleon/complete-hsk-vocabulary>
- **ts-fsrs** — FSRS spaced-repetition scheduler, MIT.
  <https://github.com/open-spaced-repetition/ts-fsrs>
- **Preact** — UI library, MIT. <https://preactjs.com/>

Build-time tooling (Vite, Vitest, fflate, Playwright) is not distributed with
the extension.

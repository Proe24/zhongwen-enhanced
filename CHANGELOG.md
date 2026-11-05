# Changelog

## 2.0.0 — 2026-11-05

A ground-up rewrite. Nothing from 1.x is reused; the 1.x word list is imported
automatically.

### Reading
- Hover popup rebuilt in a shadow root: the page's CSS can't touch it and it
  can't touch the page. The hovered word is highlighted with the CSS Highlight
  API instead of the selection.
- Word card: the whole word first (each character tone-colored), pinyin as
  tone marks, numbers or zhuyin, every reading and sense, the other script,
  HSK 3.0 level, tappable character breakdown, links to MDBG / Wiktionary /
  Forvo / the Grammar Wiki.
- Shorter words that start at the hovered character are offered as chips.
- Keyboard navigation across paragraphs (`n` `b` `m`), pinning (`space`),
  copy, listen, short/full view, hints strip.
- Hold-a-key triggers (Alt / Ctrl / Shift) and per-site off switch.

### Learning
- Saving a word keeps its sentence, page title and URL.
- Sentence panel: break any selection into words with pinyin and glosses.
- Library: vocabulary grouped by source with search and sort; saved sentences;
  dictionary search by hanzi, pinyin or English; stats.
- Review with FSRS (ts-fsrs), sentence context, cloze fronts, daily limits.
- Export to Anki, Pleco and CSV; one-file backup and restore.

### Removed from 1.x
- AI sentence breakdown (and with it all network permissions and API keys).
- The 48 MB offline stroke-order/etymology data and the thesaurus.
- jQuery, Bootstrap and the bundled web fonts.

### Hardening (from the pre-release review)
- Mouse and keyboard handling stay out of editors, including inputs inside
  shadow roots; Shift combinations are left to the page.
- Popup and highlight styles are adopted stylesheets, so strict-CSP pages
  can't strip them; nothing is injected while lookups are off.
- A lookup still in flight can no longer bring back a popup you just closed.
- CSV/Anki cells that would read as spreadsheet formulas are neutralized;
  restored backups are validated entry by entry and only http(s) links kept.
- The 1.x import keeps each sentence's translation as its note and converts
  tone-marked pinyin to numbers, and runs inside the single write chain.
- Sentence breakdowns are capped at 1000 characters; the Review screen skips
  a card whose word was removed elsewhere instead of sticking.

### Under the hood
- Manifest V3, Vite + Preact, a single-writer service worker, unit tests under
  vitest, an end-to-end run that loads the built extension into headless
  Chromium.

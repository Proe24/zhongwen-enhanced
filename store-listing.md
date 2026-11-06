# Chrome Web Store listing — Zhongwen Enhanced 2.0

**Name:** Zhongwen Enhanced: Chinese Pop-up Dictionary

**Summary (132 chars max):**
Hover Chinese for pinyin and meaning. Save words with their sentence, review with spaced repetition. Offline and private.

**Description:**

Read Chinese on any page. Rest the pointer on a word and a calm card shows it
with each character colored by tone, pinyin (marks, numbers or zhuyin), every
meaning, the traditional or simplified form, its HSK level, and its characters.

Save a word with one key and it keeps the sentence you found it in, so your
vocabulary list is a list of real contexts, not bare words. Select a sentence
to see it word by word. Review everything with FSRS spaced repetition — the
algorithm behind modern Anki — right inside the extension, or export to Anki,
Pleco or CSV.

• Hover or hold-a-key lookups, keyboard reading (next word, back, pin)
• CC-CEDICT dictionary, fully offline — no network permissions at all
• Simplified and traditional
• Vocabulary grouped by the page it came from; saved sentences; dictionary search
• FSRS review with sentence context, cloze cards and daily limits
• Light and dark themes, four tone palettes
• Backup and restore in one file

Nothing is sent anywhere. No account. Free software (GPL).

**Category:** Education · **Language:** English

**Privacy:** https://github.com/Proe24/zhongwen-enhanced/blob/master/PRIVACY.md
(or the GitHub Pages copy at docs/privacy.html)

**Permission justifications**
- storage / unlimitedStorage: the user's vocabulary, sentences, review schedule and settings.
- contextMenus: the "Break down with Zhongwen" item on selected text.
- activeTab: the current tab's hostname for the "off on this site" switch.
- Host access (content script on all sites): the popup dictionary must run on any page the user reads; it does nothing until turned on.

**Assets:** `npm run store-assets` regenerates `store/`: eleven 1280×800 screenshots
(opaque PNG) and `promo-small-440x280.png`. Suggested order in the listing:
popup-peek, popup-light, sentence-panel, library-vocab, review (max five).

**What's new (2.0.0):**
Zhongwen Enhanced 2.0 is a complete rewrite. Hover shows a calm peek (word,
tone-colored pinyin, HSK level, first senses); hold Shift for the full card
with every reading, each character, and Save / Listen / Copy / Sentence.
Saved words keep the sentence they came from. New Library with vocabulary
grouped by source, FSRS spaced-repetition review, saved sentences,
dictionary search by hanzi / pinyin / English, stats, backup and restore,
Anki / Pleco / CSV export. Light and dark themes, four tone palettes, zhuyin.
Fully offline: the AI features and their API keys are gone, and the extension
no longer requests any network access. Your existing word list is imported
automatically.

**Single purpose:** a Chinese–English pop-up dictionary with vocabulary review.

**Data use (privacy tab):** collects no user data; everything stays on the
device; no remote code.

**Notes for the reviewer:** The extension makes no network requests. The
dictionary (CC-CEDICT) and HSK lists are bundled under `dict/`. Content
scripts run on all pages because the dictionary must work wherever the user
reads Chinese; they stay inert until the user turns lookups on. Source:
https://github.com/Proe24/zhongwen-enhanced

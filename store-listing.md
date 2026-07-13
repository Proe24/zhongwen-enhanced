# Chrome Web Store listing copy

Reference for the Web Store dashboard fields. Update the version number and
any changed features when publishing a new release.

## Detailed description

Zhongwen Enhanced is a Chinese-English pop-up dictionary and learning tool
for your browser. Hover over Chinese text on any web page to instantly see
its meaning, pinyin, and tones — then save words, study them, and break down
whole sentences with AI.

This is an actively maintained, open-source fork of the original Zhongwen
extension, with added AI sentence breakdown, vocabulary lists, a study mode,
and Anki/Pleco export.

── KEY FEATURES ──

- Instant pop-up dictionary — just hover over a word or character to see its
  translation. No clicking required.
- Supports both simplified and traditional characters (and you can choose to
  show only one).
- Color-coded pinyin — each syllable is colored by its tone to help you learn
  faster.
- Optional Zhuyin (Bopomofo) display.
- Bundled offline dictionary — uses a recent release of the widely trusted
  CC-CEDICT. Lookups work entirely on your device, with no internet required.
- AI sentence breakdown — select a Chinese sentence and get a word-by-word
  grammatical breakdown plus a natural translation, powered by your choice of
  Anthropic (Claude), Google (Gemini), or OpenAI. You use your own API key,
  and text is sent only to the provider you pick.
- Built-in word lists — save words while you read, organize them into named
  lists, and add your own notes.
- Study mode — review your saved words in interactive flashcard sessions.
- Export to Anki and Pleco for studying in your favorite app.
- Quick links to grammar and usage notes on the Chinese Grammar Wiki.
- Keyboard navigation for reading through text word by word.
- One-click on/off — toggle the dictionary whenever you want it.

── PRIVACY ──

- Dictionary lookups happen entirely on your device.
- Your word lists, settings, and API keys are stored locally in your browser
  and are never sent to the developer.
- Text is sent to a third-party AI service only when you actively use the
  sentence-breakdown feature, and only to the provider you configured, using
  your own API key.
- External dictionary, thesaurus, example-sentence, grammar, vocabulary, and
  Skritter shortcuts open the selected word in the chosen third-party site.
- Full privacy policy:
  https://github.com/Proe24/zhongwen-enhanced/blob/master/PRIVACY.md

── OPEN SOURCE ──

Zhongwen Enhanced is free and open-source software, licensed under the GNU
General Public License v2. It is based on the original Zhongwen by Christian
Schiller. Source code, changelog, and issue tracker:
https://github.com/Proe24/zhongwen-enhanced

## Other dashboard fields

- **Category:** Education (alternatively Productivity)
- **Language:** English
- **Privacy policy URL:**
  https://github.com/Proe24/zhongwen-enhanced/blob/master/PRIVACY.md

### Single purpose
A Chinese-English pop-up dictionary that shows definitions and pinyin for
Chinese text on hover, with optional AI-assisted sentence breakdown.

### Permission justifications
- **storage** — Stores the user's saved word lists, settings, and (optional)
  AI API keys locally in the browser.
- **tabs** — Detects the active tab to enable/disable the dictionary and open
  the word list and help pages.
- **contextMenus** — Adds right-click menu items to open the word list and
  trigger sentence breakdown.
- **Broad host access (`<all_urls>` content script)** — The pop-up dictionary
  must read the Chinese text the user hovers over on any page, so the content
  script needs access to all sites. Page text is processed locally.
- **api.anthropic.com / generativelanguage.googleapis.com / api.openai.com**
  — Used only for the optional sentence-breakdown feature, to send either the
  user's exact context-menu selection or the punctuation-delimited surrounding
  sentence requested with the `S` shortcut to the AI provider the user chose,
  authenticated with the user's own API key.

### Data usage declaration
Handles "Website content" (the exact context-menu selection or surrounding
sentence sent to the chosen AI provider, or the selected word included in a
third-party lookup URL when the user invokes an external-site shortcut).
Certifications (all true): does not sell user data; does not use data for
purposes unrelated to the single purpose; does not use data for
creditworthiness/lending.

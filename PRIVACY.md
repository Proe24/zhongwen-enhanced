# Privacy Policy — Zhongwen Enhanced

_Last updated: 2026-07-13_

Zhongwen Enhanced is a browser extension that provides a Chinese-English
pop-up dictionary and Chinese-learning tools. This policy explains what
data the extension handles and how.

## Summary

- The extension does **not** have its own servers and does **not**
  collect, transmit, or sell your personal data to the developer.
- Dictionary lookups happen **entirely on your device** using a bundled
  offline dictionary (CC-CEDICT).
- Your word lists, settings, and API keys are stored **locally in your
  browser** (`chrome.storage.local`).
- Text is sent to a third-party AI service **only** when you explicitly
  use the optional "Break down sentence" feature, and only to the
  provider you selected, using your own API key.
- When you explicitly open an external dictionary or learning-site shortcut,
  the selected word is included in the destination URL so that site can show
  the requested lookup. The `Shift+S` Skritter shortcut instead calls
  Skritter's add-to-vocabulary endpoint as described below.

## Data stored locally on your device

The following are saved only in your browser's local extension storage
and are never sent to the developer:

- Your saved words, sentences, vocabulary lists, notes, and study
  progress.
- Your preferences/options (theme, fonts, display settings, etc.).
- The API key(s) you optionally enter for AI providers.

You can remove this data at any time by clearing the extension's data or
uninstalling the extension.

## Optional AI sentence breakdown (third-party processing)

The extension includes an optional feature that produces a grammatical
breakdown of a Chinese sentence using an AI model. This feature is
**off by default** and only runs when you actively trigger it (for
example via the right-click "Break down sentence" menu item).

When you use this feature:

- The right-click action sends exactly the text you selected. The `S` keyboard
  shortcut sends the punctuation-delimited surrounding sentence containing the
  word under the dictionary pop-up. That text is sent directly from your
  browser to the AI provider **you** have configured. Supported providers are:
  - Anthropic (Claude) — <https://www.anthropic.com/legal/privacy>
  - Google (Gemini) — <https://policies.google.com/privacy>
  - OpenAI — <https://openai.com/policies/privacy-policy>
- The request is authenticated with the API key you supplied for that
  provider. Your key and your text are sent only to that provider's API
  endpoint, not to the extension developer.
- The provider's own privacy policy and terms govern how they handle the
  submitted text. Please review the relevant policy above.

## External dictionary and learning-site shortcuts

The extension can open third-party sites for dictionary, pronunciation,
thesaurus, example-sentence, grammar, vocabulary, and character lookups. These
actions run only when you click a link or invoke the relevant keyboard shortcut.
The selected word or character is included in the URL sent to the chosen site.
Depending on the action, destinations include LINE Dict, Forvo, Dict.cn, iCIBA,
MDBG, Reverso, MoeDict, Tatoeba, AllSet Learning, Baidu Hanyu, Zdic,
YellowBridge, and zi.tools.

The `Shift+S` Skritter shortcut calls Skritter's add-to-vocabulary endpoint to
add the current dictionary entry to your Skritter queue. Its URL sends the
entry's simplified form, traditional form, reading, and English definition to
Skritter. The destination's own privacy policy and terms apply.

## Permissions

- `storage` — to save your word lists, settings, and API keys locally.
- `tabs` / `contextMenus` — to enable the dictionary on the active tab
  and provide right-click menu actions.
- Access to web pages (`<all_urls>`) — required so the pop-up dictionary
  can read the text you hover over on any page you visit. Page content is
  processed locally unless you explicitly invoke an AI breakdown or an
  external-site lookup as described above.
- Host access to the AI provider API endpoints — used only to send
  requests for the optional breakdown feature.

## Changes to this policy

If this policy changes, the updated version will be posted in the project
repository at <https://github.com/Proe24/zhongwen-enhanced>.

## Contact

Questions can be raised via the project's issue tracker:
<https://github.com/Proe24/zhongwen-enhanced/issues>

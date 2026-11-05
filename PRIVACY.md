# Privacy Policy — Zhongwen Enhanced

_Last updated: 2026-11-05 (version 2.0)_

Zhongwen Enhanced is a browser extension that shows a Chinese–English
dictionary card for the text you hover, and keeps a vocabulary list you can
review. This policy describes what it does with data.

## In short

- The extension **makes no network requests**. The dictionary and the HSK word
  lists ship inside the extension package and all lookups happen on your
  device. It has no servers, no accounts, no analytics and no crash reporting.
- The only data it keeps is what you save on purpose: words (with the
  sentence, page title and page address they came from), sentences, notes,
  your review progress, recent lookups and your settings. All of it is stored
  in the browser's extension storage (`chrome.storage.local`) on your device.
- Nothing is shared with the developer or anyone else. Data leaves your device
  only when **you** export it (Anki, Pleco, CSV or a backup file) and choose
  where to put it.

## What the extension reads on web pages

To look words up, the content script reads the text under your pointer, the
surrounding sentence, and the page's title and address when you save a word or
sentence. It does not read pages when lookups are off, on sites you have
switched it off for, inside form fields, or when the page is not being hovered.
It does not modify pages beyond highlighting the hovered word and showing its
own popup.

## Permissions

- **storage / unlimitedStorage** — keep your vocabulary and settings locally.
- **contextMenus** — the *Break down with Zhongwen* right-click item.
- **activeTab** — read the current tab's address so the toolbar popup can offer
  "off on this site".
- **Access to all sites** (content script) — the dictionary popup has to run on
  whatever page you are reading. It is inert until you turn lookups on.

## Text-to-speech

"Listen" uses the browser's built-in speech synthesis. On most systems the
voices are local; some browsers may use a network voice provided by the
browser vendor, under that vendor's policy. The extension itself sends nothing.

## Removing your data

Settings → *Your data* → *Clear* deletes words, sentences and progress.
Uninstalling the extension removes everything it stored.

## Changes and contact

Changes to this policy are published in this file in the project repository:
<https://github.com/Proe24/zhongwen-enhanced>. Questions: open an issue there.

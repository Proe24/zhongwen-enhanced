/*
 Zhongwen - A Chinese-English Pop-Up Dictionary
 Copyright (C) 2010-2019 Christian Schiller
 https://chrome.google.com/extensions/detail/kkmlkkjojmombglmlpbpapmhcaljjkde
 */

/* global globalThis */

'use strict';

let entries = [];
let selected = new Set();
let editingIndex = -1;
let currentMode = 'manage';
let activeList = null;
let studyDeck = [];
let cardIdx = 0;
let flipped = false;
let reviewedCount = 0;

function loadEntries() {
    let json = localStorage['wordlist'];
    if (json) {
        entries = JSON.parse(json);
        entries.forEach(e => {
            e.timestamp = e.timestamp || 0;
            e.box = e.box || 1;
        });
        entries.sort((a, b) => b.timestamp - a.timestamp);
    } else {
        entries = [];
    }
}

function saveEntries() {
    let toSave = entries.map(e => {
        let copy = Object.assign({}, e);
        if (!copy.notes) delete copy.notes;
        return copy;
    });
    localStorage['wordlist'] = JSON.stringify(toSave);
}

function toneFromMark(syllable) {
    if (/[āēīōūǖ]/.test(syllable)) return 1;
    if (/[áéíóúǘ]/.test(syllable)) return 2;
    if (/[ǎěǐǒǔǚ]/.test(syllable)) return 3;
    if (/[àèìòùǜ]/.test(syllable)) return 4;
    return 5;
}

function toneColorHanzi(hanzi, pinyin) {
    let syllables = pinyin.split(/\s+/);
    let chars = hanzi.split('');
    let html = '';
    for (let i = 0; i < chars.length; i++) {
        let tone = i < syllables.length ? toneFromMark(syllables[i]) : 5;
        html += '<span class="tone' + tone + '">' + chars[i] + '</span>';
    }
    return html;
}

function convert2Zhuyin(pinyin) {
    let a = pinyin.split(/[\s·]+/);
    return a.map(s => globalThis.accentedPinyin2Zhuyin(s)).join(' ');
}

function escapeHtml(str) {
    let div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

function getVisibleEntries() {
    return entries.reduce((acc, e, i) => {
        if (e.isSentence) return acc;
        if (activeList !== null && (e.list || '') !== activeList) return acc;
        acc.push([e, i]);
        return acc;
    }, []);
}

function getSentenceEntries() {
    return entries.reduce((acc, e, i) => {
        if (!e.isSentence) return acc;
        acc.push([e, i]);
        return acc;
    }, []);
}

function getLists() {
    let counts = {};
    entries.forEach(e => {
        let name = e.list || '';
        counts[name] = (counts[name] || 0) + 1;
    });
    return counts;
}

function renderListBar() {
    let lists = getLists();
    let names = Object.keys(lists).sort((a, b) => a.localeCompare(b));
    let bar = document.getElementById('listBar');
    let sel = document.getElementById('listSelect');

    if (names.length <= 1 && (!names[0] || names[0] === '')) {
        bar.style.display = 'none';
        return;
    }
    bar.style.display = '';

    let html = '<option value="__all__">All words (' + entries.length + ')</option>';
    names.forEach(name => {
        let label = name || 'Unsorted';
        let selected = activeList === name ? ' selected' : '';
        html += '<option value="' + escapeHtml(name) + '"' + selected + '>' + escapeHtml(label) + ' (' + lists[name] + ')</option>';
    });
    if (activeList === null) sel.value = '__all__';
    sel.innerHTML = html;

    document.getElementById('renameListBtn').style.display = activeList ? '' : 'none';
}

function renderTable() {
    let tbody = document.getElementById('wordsBody');
    tbody.innerHTML = '';

    let showTrad = localStorage['simpTrad'] === 'classic';
    let visible = getVisibleEntries();

    visible.forEach(([e, i]) => {
        let tr = document.createElement('tr');
        if (selected.has(i)) tr.classList.add('is-selected');

        // Checkbox
        let tdCheck = document.createElement('td');
        let check = document.createElement('span');
        check.className = 'row-check';
        check.textContent = selected.has(i) ? '✓' : '';
        tdCheck.appendChild(check);
        tr.appendChild(tdCheck);

        // Hanzi
        let tdHz = document.createElement('td');
        tdHz.className = 'hz';
        let hzHtml = toneColorHanzi(e.simplified, e.pinyin);
        if (showTrad && e.traditional !== e.simplified) {
            hzHtml += ' <span style="color:var(--ink-faint);font-size:18px;font-weight:400">'
                + toneColorHanzi(e.traditional, e.pinyin) + '</span>';
        }
        tdHz.innerHTML = hzHtml;
        tr.appendChild(tdHz);

        // Pinyin
        let tdPy = document.createElement('td');
        tdPy.className = 'py';
        tdPy.textContent = e.pinyin;
        tr.appendChild(tdPy);

        // Definition
        let tdDef = document.createElement('td');
        tdDef.className = 'def';
        tdDef.textContent = e.definition;
        tr.appendChild(tdDef);

        // Notes
        let tdNotes = document.createElement('td');
        tdNotes.className = 'notes';
        if (e.notes) {
            tdNotes.textContent = e.notes;
        } else {
            tdNotes.innerHTML = '<span style="color:var(--ink-faint)">— edit —</span>';
        }
        tdNotes.addEventListener('click', ev => {
            ev.stopPropagation();
            openEditNotes(i);
        });
        tr.appendChild(tdNotes);

        // Date
        let tdDate = document.createElement('td');
        tdDate.style.textAlign = 'right';
        tdDate.style.color = 'var(--ink-faint)';
        tdDate.style.fontFamily = 'var(--font-mono)';
        tdDate.style.fontSize = '11px';
        if (e.timestamp) {
            let d = new Date(e.timestamp);
            tdDate.textContent = d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
        }
        tr.appendChild(tdDate);

        tr.addEventListener('click', () => toggleSelect(i));
        tbody.appendChild(tr);
    });

    let wordCount = entries.filter(e => !e.isSentence).length;
    document.getElementById('wordsTable').style.display = visible.length ? '' : 'none';
    document.getElementById('nodata').style.display = wordCount ? 'none' : '';
    document.getElementById('actions').style.display = visible.length ? '' : 'none';

    renderListBar();
    renderSentences();
    updateStats();
    updateActionButtons();
}

let expandedSentences = new Set();

function toneFromNumber(syllable) {
    let m = syllable.match(/[1-5]$/);
    return m ? parseInt(m[0]) : 5;
}

function toneColorHanziNumbered(hanzi, numberedPinyin) {
    let syllables = numberedPinyin.split(/\s+/);
    let chars = hanzi.split('');
    let html = '';
    for (let i = 0; i < chars.length; i++) {
        let tone = i < syllables.length ? toneFromNumber(syllables[i]) : 5;
        html += '<span class="tone' + tone + '">' + chars[i] + '</span>';
    }
    return html;
}

function renderBreakdownHtml(bd) {
    let html = '<div class="bd-section">';

    if (bd.words && bd.words.length) {
        html += '<div class="bd-label">Word by word</div>';
        html += '<div class="bd-words">';
        bd.words.forEach(w => {
            let hzHtml = toneColorHanziNumbered(w.hz, w.py);
            html += '<div class="bd-word">';
            html += '<span class="bd-hz">' + hzHtml + '</span>';
            html += '<span class="bd-py">' + escapeHtml(w.py) + '</span>';
            html += '<span class="bd-gloss">' + escapeHtml(w.gloss || '') + '</span>';
            if (w.role && w.role !== 'other') {
                html += '<span class="bd-role">' + escapeHtml(w.role) + '</span>';
            }
            html += '</div>';
        });
        html += '</div>';
    }

    if (bd.grammar && bd.grammar.length) {
        html += '<div class="bd-label">Grammar</div>';
        html += '<ul class="bd-grammar">';
        bd.grammar.forEach(g => {
            let formatted = escapeHtml(g).replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
            html += '<li>' + formatted + '</li>';
        });
        html += '</ul>';
    }

    html += '</div>';
    return html;
}

function renderSentences() {
    let sents = getSentenceEntries();
    let list = document.getElementById('sentenceList');
    list.innerHTML = '';

    document.getElementById('noSentences').style.display = sents.length ? 'none' : '';
    document.getElementById('sentenceActions').style.display = sents.length ? '' : 'none';

    sents.forEach(([e, i]) => {
        let isExpanded = expandedSentences.has(i);
        let card = document.createElement('div');
        card.className = 'sentence-card' + (selected.has(i) ? ' is-selected' : '') + (isExpanded ? ' is-expanded' : '');

        let check = '<span class="row-check">' + (selected.has(i) ? '✓' : '') + '</span>';
        let date = e.timestamp ? new Date(e.timestamp).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : '';
        let source = e.list ? '<span class="sentence-source">' + escapeHtml(e.list) + '</span>' : '';
        let expandIcon = e.breakdown ? '<span class="expand-toggle">' + (isExpanded ? '▾' : '▸') + '</span>' : '';

        let html = '<div class="sentence-header">' + check + source + '<span class="sentence-date">' + date + '</span>' + expandIcon + '</div>';
        html += '<div class="sentence-chinese">' + escapeHtml(e.simplified) + '</div>';
        html += '<div class="sentence-translation">' + escapeHtml(e.definition || '') + '</div>';
        if (e.notes) {
            html += '<div class="sentence-literal">' + escapeHtml(e.notes) + '</div>';
        }

        if (isExpanded && e.breakdown) {
            html += renderBreakdownHtml(e.breakdown);
        }

        card.innerHTML = html;

        let checkEl = card.querySelector('.row-check');
        checkEl.addEventListener('click', ev => {
            ev.stopPropagation();
            if (selected.has(i)) selected.delete(i); else selected.add(i);
            renderSentences();
        });

        card.addEventListener('click', () => {
            if (!e.breakdown) return;
            if (expandedSentences.has(i)) expandedSentences.delete(i); else expandedSentences.add(i);
            renderSentences();
        });

        list.appendChild(card);
    });

    updateSentenceActions();
}

function updateSentenceActions() {
    let sents = getSentenceEntries();
    let selCount = sents.filter(([_, i]) => selected.has(i)).length;
    let btn = document.getElementById('deleteSentenceBtn');
    btn.disabled = selCount === 0;
    btn.textContent = selCount === 0 ? 'Delete selected' : 'Delete ' + selCount;
}

function toggleSelect(index) {
    if (selected.has(index)) {
        selected.delete(index);
    } else {
        selected.add(index);
    }
    renderTable();
}

function updateStats() {
    let sentenceCount = entries.filter(e => e.isSentence).length;
    let wordCount = entries.length - sentenceCount;
    document.getElementById('statWords').textContent = entries.length;
    document.getElementById('tabWordCount').textContent = wordCount;
    document.getElementById('tabSentenceCount').textContent = sentenceCount;
}

function updateActionButtons() {
    let n = selected.size;
    let label = n === 0 ? '' : ' (' + n + ')';
    document.getElementById('exportAnki').textContent = 'Anki' + label;
    document.getElementById('exportPleco').textContent = 'Pleco' + label;
    document.getElementById('deselectAll').disabled = n === 0;
    document.getElementById('deleteBtn').disabled = n === 0;
    document.getElementById('deleteBtn').textContent = n === 0 ? 'Delete' : 'Delete ' + n;
    document.getElementById('moveToListBtn').disabled = n === 0;
}

function openEditNotes(index) {
    editingIndex = index;
    let e = entries[index];
    document.getElementById('modalSimplified').value = e.simplified;
    document.getElementById('modalTraditional').value = e.traditional;
    document.getElementById('modalDefinition').value = e.definition;
    document.getElementById('modalNotes').value = e.notes || '';
    $('#editNotes').modal('show');
}

function exportEntries(format) {
    let visible = getVisibleEntries().map(v => v[1]);
    let pool = selected.size === 0 ? visible : visible.filter(i => selected.has(i));
    let items = pool.map(i => entries[i]);
    let content = '';
    let filename;

    if (format === 'pleco') {
        filename = 'Zhongwen-Pleco.txt';
        content = '// Zhongwen Pleco Import\r\n';
        items.forEach(e => {
            let py = (e.pinyin || '').replace(/\s+/g, '');
            content += e.simplified + '\t' + py + '\t' + (e.definition || '') + '\r\n';
        });
    } else {
        filename = 'Zhongwen-Anki.txt';
        items.forEach(e => {
            let front = e.simplified;
            let back = e.pinyin + '<br>' + (e.definition || '');
            if (e.notes) back += '<br><i>' + e.notes.replace(/[\r\n]/g, ' ') + '</i>';
            content += front + '\t' + back + '\r\n';
        });
    }

    let a = document.getElementById('savelink');
    a.download = filename;
    a.href = URL.createObjectURL(new Blob([content], { type: 'text/plain' }));
    a.click();
}

function deleteSelected() {
    if (!confirm('Delete ' + selected.size + ' selected entries?')) return;
    entries = entries.filter((_, i) => !selected.has(i));
    selected = new Set();
    saveEntries();
    renderTable();
}

function renameList() {
    if (!activeList) return;
    let oldName = activeList || 'Unsorted';
    let newName = prompt('Rename list:', oldName);
    if (!newName || newName === oldName) return;
    entries.forEach(e => {
        if ((e.list || '') === activeList) e.list = newName;
    });
    activeList = newName;
    saveEntries();
    renderTable();
}

function moveToList() {
    if (selected.size === 0) return;
    let lists = Object.keys(getLists()).filter(n => n).sort();
    let msg = 'Enter list name' + (lists.length ? ' (existing: ' + lists.join(', ') + ')' : '') + ':';
    let name = prompt(msg);
    if (name === null) return;
    selected.forEach(i => { entries[i].list = name; });
    selected = new Set();
    saveEntries();
    renderTable();
}

// ── Study mode ───────────────────────────────────────────────────────

let sessionStreak = new Map();
let initialDeckSize = 0;
let completedCount = 0;

function buildStudyDeck() {
    studyDeck = entries.filter(e => {
        if (e.isSentence) return false;
        if (activeList !== null && (e.list || '') !== activeList) return false;
        return true;
    });
    cardIdx = 0;
    flipped = false;
    reviewedCount = 0;
    completedCount = 0;
    initialDeckSize = studyDeck.length;
    sessionStreak = new Map();
}

function renderStudy() {
    buildStudyDeck();
    let hasCards = studyDeck.length > 0;
    document.getElementById('studyEmpty').style.display = hasCards ? 'none' : '';
    document.getElementById('studyStage').style.display = hasCards ? '' : 'none';
    document.getElementById('studyComplete').style.display = 'none';
    if (!hasCards) return;

    updateDeckStats();
    renderCard();
}

function updateDeckStats() {
    document.getElementById('deckRemaining').textContent = studyDeck.length;
    document.getElementById('deckCompleted').textContent = completedCount;
    let pct = initialDeckSize > 0 ? Math.round((completedCount / initialDeckSize) * 100) : 0;
    document.getElementById('progressFill').style.width = pct + '%';
}

function renderCard() {
    let card = studyDeck[cardIdx];
    if (!card) return;

    let fc = document.getElementById('flashcard');
    fc.classList.toggle('is-flipped', flipped);

    let pad = s => String(s).padStart(2, '0');
    document.getElementById('cardNum').textContent = pad(completedCount + 1) + ' / ' + pad(initialDeckSize);
    document.getElementById('cardFlip').textContent = flipped ? 'Reveal' : 'Front';
    document.getElementById('cardHanzi').innerHTML = toneColorHanzi(card.simplified, card.pinyin);
    document.getElementById('cardPinyin').textContent = card.pinyin;
    document.getElementById('cardDef').textContent = card.definition;
    document.getElementById('revealPrompt').style.display = flipped ? 'none' : '';
    document.getElementById('studyControls').style.display = flipped ? '' : 'none';

    updateDeckStats();
}

function flipCard() {
    flipped = !flipped;
    renderCard();
}

function gradeCard(grade) {
    let card = studyDeck[cardIdx];
    if (!card) return;

    let idx = entries.indexOf(card);
    if (idx < 0) return;

    let cur = card.box || 1;
    let nb;
    switch (grade) {
        case 'again': nb = 1; break;
        case 'hard':  nb = Math.max(1, cur - 1); break;
        case 'good':  nb = cur + 1; break;
        case 'easy':  nb = cur + 2; break;
        default:      nb = cur;
    }
    entries[idx].box = Math.min(6, nb);
    entries[idx].lastReviewed = Date.now();
    saveEntries();

    reviewedCount++;
    flipped = false;

    let streak = sessionStreak.get(card) || 0;

    if (grade === 'easy') {
        sessionStreak.delete(card);
        studyDeck.splice(cardIdx, 1);
        completedCount++;
    } else if (grade === 'good') {
        streak++;
        if (streak >= 2) {
            sessionStreak.delete(card);
            studyDeck.splice(cardIdx, 1);
            completedCount++;
        } else {
            sessionStreak.set(card, streak);
            studyDeck.splice(cardIdx, 1);
            let offset = Math.min(Math.floor(studyDeck.length * 0.6), studyDeck.length);
            let insertAt = (cardIdx + Math.max(offset, 3)) % (studyDeck.length + 1);
            studyDeck.splice(insertAt, 0, card);
        }
    } else {
        sessionStreak.set(card, 0);
        cardIdx = (cardIdx + 1) % studyDeck.length;
    }

    if (studyDeck.length === 0) {
        showStudyComplete();
        return;
    }
    if (cardIdx >= studyDeck.length) cardIdx = 0;

    renderCard();
    updateStats();
}

function showStudyComplete() {
    document.getElementById('studyStage').style.display = 'none';
    document.getElementById('completedCount').textContent = initialDeckSize;
    document.getElementById('studyComplete').style.display = '';
}

function onStudyKeyDown(e) {
    if (currentMode !== 'study') return;
    if (e.target.matches('input, textarea')) return;
    if (studyDeck.length === 0) return;

    if (e.key === ' ') {
        e.preventDefault();
        flipCard();
        return;
    }
    if (!flipped) return;
    if (e.key === '1') gradeCard('again');
    if (e.key === '2') gradeCard('hard');
    if (e.key === '3') gradeCard('good');
    if (e.key === '4') gradeCard('easy');
}

function setManageTab(tab) {
    document.getElementById('tabWords').classList.toggle('is-active', tab === 'words');
    document.getElementById('tabSentences').classList.toggle('is-active', tab === 'sentences');
    document.getElementById('wordsPanel').style.display = tab === 'words' ? '' : 'none';
    document.getElementById('sentencesPanel').style.display = tab === 'sentences' ? '' : 'none';
    selected = new Set();
    if (tab === 'sentences') renderSentences();
}

function setMode(mode) {
    currentMode = mode;
    document.getElementById('modeStudy').classList.toggle('is-active', mode === 'study');
    document.getElementById('modeManage').classList.toggle('is-active', mode === 'manage');
    document.getElementById('studyView').style.display = mode === 'study' ? '' : 'none';
    document.getElementById('manageView').style.display = mode === 'manage' ? '' : 'none';
    if (mode === 'study') renderStudy();
}

document.addEventListener('DOMContentLoaded', function () {
    loadEntries();
    renderTable();
    setMode('manage');

    document.getElementById('modeStudy').addEventListener('click', () => setMode('study'));
    document.getElementById('modeManage').addEventListener('click', () => setMode('manage'));
    document.getElementById('flashcard').addEventListener('click', () => {
        if (currentMode === 'study' && studyDeck.length > 0) flipCard();
    });
    document.querySelectorAll('#studyControls .grade').forEach(btn => {
        btn.addEventListener('click', e => {
            e.stopPropagation();
            gradeCard(btn.getAttribute('data-grade'));
        });
    });
    window.addEventListener('keydown', onStudyKeyDown);
    document.getElementById('exportAnki').addEventListener('click', () => exportEntries('anki'));
    document.getElementById('exportPleco').addEventListener('click', () => exportEntries('pleco'));
    document.getElementById('studyAgainBtn').addEventListener('click', () => renderStudy());
    document.getElementById('selectAll').addEventListener('click', () => {
        selected = new Set(getVisibleEntries().map(v => v[1]));
        renderTable();
    });
    document.getElementById('deselectAll').addEventListener('click', () => {
        selected = new Set();
        renderTable();
    });
    document.getElementById('deleteBtn').addEventListener('click', deleteSelected);
    document.getElementById('renameListBtn').addEventListener('click', renameList);
    document.getElementById('moveToListBtn').addEventListener('click', moveToList);
    document.getElementById('listSelect').addEventListener('change', function () {
        activeList = this.value === '__all__' ? null : this.value;
        selected = new Set();
        renderTable();
    });

    document.getElementById('tabWords').addEventListener('click', () => setManageTab('words'));
    document.getElementById('tabSentences').addEventListener('click', () => setManageTab('sentences'));
    document.getElementById('deleteSentenceBtn').addEventListener('click', () => {
        let sents = getSentenceEntries().filter(([_, i]) => selected.has(i));
        if (!sents.length || !confirm('Delete ' + sents.length + ' sentence(s)?')) return;
        let toDelete = new Set(sents.map(([_, i]) => i));
        entries = entries.filter((_, i) => !toDelete.has(i));
        selected = new Set();
        saveEntries();
        renderTable();
    });

    document.getElementById('saveNotes').addEventListener('click', () => {
        if (editingIndex >= 0 && editingIndex < entries.length) {
            entries[editingIndex].notes = document.getElementById('modalNotes').value || '';
            saveEntries();
            $('#editNotes').modal('hide');
            renderTable();
        }
    });

    $('#editNotes').on('shown.bs.modal', () => document.getElementById('modalNotes').focus());
});

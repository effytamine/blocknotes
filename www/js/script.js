/**
 * BlockNotes — script.js
 *
 * UI, state, event listeners, rendering, and all non-algorithm logic.
 * Depends on (loaded first via index.html):
 *   ../js/constants.js   — VALID_TAGS, TYPO_MAP, URGENCY_SIGNALS, TAG_BASE_POINTS
 *   ../js/algorithms.js  — parseLines, greedyHeuristic, resolveTag, buildHashIndex,
 *                          searchRoster, insertIntoFollowUp
 */

// ============================================================
// STATE
// ============================================================

let roster          = [];
let autocompleteIdx = -1;

// ── Custom signals ───────────────────────────────────────────
function getCustomSignals() {
  try { return JSON.parse(localStorage.getItem('bn_custom_signals') || '[]'); }
  catch { return []; }
}
function saveCustomSignals(arr) {
  localStorage.setItem('bn_custom_signals', JSON.stringify(arr));
  // Invalidate knapsack cache so re-run picks up new words
  _knapCache.fingerprint = null;
}

// ── Knapsack cache ───────────────────────────────────────────
let _knapCache = { fingerprint: null, budget: null, included: new Set(), excluded: new Set(), scored: [] };

// ── Fit-for-Chat state ───────────────────────────────────────
let _fitActive      = false;
let _checkedState   = new Map();
let _allScoredLines = [];
let _charBudget     = 500;

// ── Follow-Up selection state ────────────────────────────────
let _followupChecked = new Set();

// ── Scoring info window state ────────────────────────────────
let _scoringPage = 0; // 0-indexed

// ============================================================
// INIT
// ============================================================
document.addEventListener('DOMContentLoaded', () => {
  initTheme();
  loadRoster();
  setTodayDate();
  attachInputListeners();
  attachResizer();
  loadArchiveView();
  renderFollowUp();
  const draft = localStorage.getItem('bn_draft');
  if (draft) document.getElementById('raw-input').value = draft;
  renderOutput();
  if (localStorage.getItem('bn_layout') === 'vertical') {
    document.querySelector('.split-container').classList.add('layout-vertical');
    document.querySelector('#resizer .divider-arrow i').setAttribute('data-lucide', 'grip-horizontal');
  }
  if (window.lucide) lucide.createIcons();
});

// ============================================================
// RENDER STRUCTURED OUTPUT (calls parseLines from algorithms.js)
// ============================================================

function renderOutput() {
  if (_fitActive) return;
  const raw = document.getElementById('raw-input').value;
  const out = document.getElementById('structured-output');

  if (!raw.trim()) {
    out.innerHTML = `<div class="empty-state"><div class="empty-icon"><i data-lucide="file-text"></i></div><p>Start typing on the left to see your notes organize in real-time.</p></div>`;
    document.getElementById('output-stats').textContent = '';
    if (window.lucide) lucide.createIcons();
    return;
  }

  const buckets = parseLines(raw);
  let html = '';
  if (buckets.acad.length)     html += buildCategoryBlock('acad',     '<i data-lucide="book" style="width:16px;height:16px;vertical-align:-3px;margin-right:4px;"></i> ACADEMICS',         '#acad', buckets.acad);
  if (buckets.org.length)      html += buildCategoryBlock('org',      '<i data-lucide="party-popper" style="width:16px;height:16px;vertical-align:-3px;margin-right:4px;"></i> BLOCK AFFAIRS',      '#org',  buckets.org);
  if (buckets.action.length)   html += buildActionBlock(buckets.action);
  if (buckets.untagged.length) html += buildCategoryBlock('untagged', '<i data-lucide="pin" style="width:16px;height:16px;vertical-align:-3px;margin-right:4px;"></i> UNTAGGED',            '',      buckets.untagged);
  out.innerHTML = html;

  document.getElementById('output-stats').innerHTML = [
    buckets.acad.length   ? `<i data-lucide="book" style="width:14px;height:14px;vertical-align:-2px"></i> ${buckets.acad.length}`   : '',
    buckets.org.length    ? `<i data-lucide="party-popper" style="width:14px;height:14px;vertical-align:-2px"></i> ${buckets.org.length}`    : '',
    buckets.action.length ? `<i data-lucide="alert-circle" style="width:14px;height:14px;vertical-align:-2px"></i> ${buckets.action.length}` : ''
  ].filter(Boolean).join(' &nbsp;&nbsp; ');
  if (window.lucide) lucide.createIcons();
}

function buildCategoryBlock(cls, label, tagLabel, items) {
  const rows = items.map(item => {
    const html  = highlightMentions(escapeHtml(item.content || item.task || ''));
    const badge = item.wasTypo
      ? `<span class="typo-badge" title="Auto-corrected from ${escapeHtml(item.originalToken)}"><i data-lucide="zap" style="width:10px;height:10px;vertical-align:-1px;margin-right:2px"></i>fixed</span>` : '';
    return `<div class="cat-item"><span class="bullet">•</span><span>${html}</span>${badge}</div>`;
  }).join('');
  return `<div class="category-block ${cls}">
    <div class="cat-header">${label}
      ${tagLabel ? `<code style="opacity:0.5;font-size:10px">${tagLabel}</code>` : ''}
      <span class="cat-count">${items.length} item${items.length !== 1 ? 's' : ''}</span>
    </div>
    <div class="cat-items">${rows}</div>
  </div>`;
}

function buildActionBlock(items) {
  const groups = {};
  items.forEach(item => {
    const key = (item.assignee || 'Unassigned').toLowerCase();
    if (!groups[key]) groups[key] = { assignee: item.assignee || '', tasks: [] };
    groups[key].tasks.push(item.task);
  });

  const rows = Object.values(groups).map(group => {
    const assigneeHtml = group.assignee ? `<span class="action-assignee">${escapeHtml(group.assignee)}</span>` : '<span class="action-assignee unassigned">Unassigned</span>';
    const tasksHtml = group.tasks.map(t =>
      `<div style="display: flex; align-items: flex-start; gap: 8px;">
         <span class="bullet" style="font-size: 14px;">•</span>
         <span class="action-task">${highlightMentions(escapeHtml(t))}</span>
       </div>`
    ).join('');
    return `<div class="cat-item">
      <div class="action-assignee-col">${assigneeHtml}</div>
      <div class="action-task-col" style="gap: 8px;">${tasksHtml}</div>
    </div>`;
  }).join('');

  return `<div class="category-block action">
    <div class="cat-header"><i data-lucide="alert-circle" style="width:16px;height:16px;vertical-align:-3px;margin-right:4px;"></i> ACTION ITEMS / DELIVERABLES
      <code style="opacity:0.5;font-size:10px">[A]</code>
      <span class="cat-count">${items.length} item${items.length !== 1 ? 's' : ''}</span>
    </div>
    <div class="cat-items">${rows}</div>
  </div>`;
}

function highlightMentions(html) {
  if (!roster.length) return html;
  const sorted = [...roster].sort((a, b) => b.length - a.length);
  for (const name of sorted) {
    const escaped = escapeHtml(name);
    const pattern = new RegExp('@(' + escapeRegex(escaped) + ')(?=[\\s,.:;!?]|$)', 'gi');
    html = html.replace(pattern, '<span class="mention-highlight">@$1</span>');
  }
  return html;
}

// ============================================================
// ARCHIVE VIEW
// ============================================================

function loadArchiveView() {
  const list     = document.getElementById('archive-list');
  const meetings = getStoredMeetings();
  if (!meetings.length) {
    list.innerHTML = `<div class="empty-state"><div class="empty-icon"><i data-lucide="folder-open"></i></div><p>No saved meetings yet.</p></div>`;
    return;
  }
  list.innerHTML = meetings.map(m => {
    const b = parseLines(m.rawText);
    return `<div class="archive-card" onclick="loadMeeting('${m.id}')">
      <div class="archive-card-info">
        <div class="archive-card-title">${escapeHtml(m.title)}</div>
        <div class="archive-card-meta"><i data-lucide="calendar" style="width:12px;height:12px;vertical-align:-1px"></i> ${m.date}</div>
      </div>
      <div class="archive-card-tags">
        ${b.acad.length   ? `<span class="tag-chip acad"><i data-lucide="book" style="width:12px;height:12px;vertical-align:-2px"></i> ${b.acad.length}</span>`   : ''}
        ${b.org.length    ? `<span class="tag-chip org"><i data-lucide="party-popper" style="width:12px;height:12px;vertical-align:-2px"></i> ${b.org.length}</span>`    : ''}
        ${b.action.length ? `<span class="tag-chip action"><i data-lucide="alert-circle" style="width:12px;height:12px;vertical-align:-2px"></i> ${b.action.length}</span>` : ''}
      </div>
      <div class="archive-card-actions">
        <button class="action-btn danger" style="padding:0;width:28px;height:28px;min-height:28px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:14px;line-height:1;"
          onclick="event.stopPropagation(); deleteMeeting('${m.id}')"><i data-lucide="trash-2" style="width:14px;height:14px;margin:0;"></i></button>
      </div>
    </div>`;
  }).join('');
  if (window.lucide) lucide.createIcons();
}

function loadMeeting(id) {
  const m = getStoredMeetings().find(x => x.id === id);
  if (!m) return;
  window._currentMeetingId = m.id;
  document.getElementById('raw-input').value     = m.rawText;
  document.getElementById('meeting-title').value = m.title;
  document.getElementById('meeting-date').value  = m.date;
  cancelFitForChat();
  switchView('editor');
  renderOutput();
  showToast(`Loaded: ${m.title}`, 'folder-open');
}

function deleteMeeting(id) {
  localStorage.setItem('bn_meetings', JSON.stringify(getStoredMeetings().filter(m => m.id !== id)));
  saveFollowUpQueue(getFollowUpQueue().filter(item => item.meetingId !== id));
  renderFollowUp();
  loadArchiveView();
  showToast('Meeting deleted. Its Follow-Up items removed.', 'trash-2');
}

// ============================================================
// FEATURE 2 — FIT FOR CHAT UI (calls greedyHeuristic from algorithms.js)
// ============================================================

function scoreLineUrgency(item) {
  const text = (item.content || item.task || item.rawLine || '').toLowerCase();
  let score  = 0;

  for (const group of URGENCY_SIGNALS) {
    if (group.isPattern) continue;
    for (const word of group.words) {
      if (bruteForceStringMatch(text, word)) { score += group.pts; break; }
    }
  }

  if (/\b\d{1,2}(st|nd|rd|th)?\b/.test(text)) score += 2;

  if (item.tag === '[A]') {
    score += 2; // acad-level base
    score += 3; // action bonus
  } else if (item.tag === '#acad') {
    score += 2;
  } else if (item.tag === '#org') {
    score += 1;
  }

  for (const { word, pts } of getCustomSignals()) {
    if (bruteForceStringMatch(text, word.toLowerCase())) score += pts;
  }

  return score;
}

function buildFingerprint(raw) { return raw.trim(); }

function buildScoredLines(raw) {
  const buckets = parseLines(raw);
  const all     = [];
  const push    = (item, tag) => {
    const display = item.content || item.task || item.rawLine || '';
    const line    = item.rawLine || '';
    all.push({ rawLine: line, displayText: display, assignee: item.assignee || null,
               tag, weight: line.length || display.length,
               value: scoreLineUrgency({ ...item, tag }) });
  };
  buckets.acad.forEach(i    => push(i, '#acad'));
  buckets.org.forEach(i     => push(i, '#org'));
  buckets.action.forEach(i  => push(i, '[A]'));
  buckets.untagged.forEach(i => push(i, ''));
  return all;
}

function runFitForChat() {
  const raw = document.getElementById('raw-input').value.trim();
  if (!raw) { showToast('Nothing to fit — type some notes first!', 'alert-triangle'); return; }
  _charBudget = parseInt(document.getElementById('char-budget').value, 10) || 500;
  const fp    = buildFingerprint(raw);

  if (_knapCache.fingerprint === fp && _knapCache.budget === _charBudget) {
    showToast('Same notes — using cached result.', 'zap');
    activateFitMode(_knapCache.included, _knapCache.scored);
    return;
  }

  const scored   = buildScoredLines(raw);
  const included = greedyHeuristic(scored, _charBudget);
  const excluded = new Set();
  for (let i = 0; i < scored.length; i++) if (!included.has(i)) excluded.add(i);

  _knapCache = { fingerprint: fp, budget: _charBudget, included, excluded, scored };
  activateFitMode(included, scored);
}

function activateFitMode(included, scored) {
  _fitActive      = true;
  _allScoredLines = scored;
  _checkedState   = new Map();
  for (let i = 0; i < scored.length; i++) _checkedState.set(i, included.has(i));

  document.getElementById('structured-output').classList.add('hidden');
  document.getElementById('fit-output').classList.remove('hidden');
  document.getElementById('right-panel-sub').textContent = 'Fit for Chat — select what to post';
  document.getElementById('fit-btn').classList.add('hidden');
  document.getElementById('fit-copy-btn').classList.remove('hidden');
  document.getElementById('fit-cancel-btn').classList.remove('hidden');
  renderFitLines();
}

function renderFitLines() {
  let html = '';
  _allScoredLines.forEach((item, i) => {
    const checked  = _checkedState.get(i);
    const tagIcon  = item.tag === '#acad' ? 'book' : item.tag === '#org' ? 'party-popper' : item.tag === '[A]' ? 'alert-circle' : 'pin';
    const scoreCls = item.value >= 5 ? 'fit-score-high' : item.value >= 3 ? 'fit-score-med' : 'fit-score-low';
    const scoreLbl = item.value > 0 ? `<span class="fit-score ${scoreCls}">▲${item.value}</span>` : '';
    html += `<label class="fit-line ${checked ? 'fit-checked' : 'fit-unchecked'}">
      <input type="checkbox" data-idx="${i}" ${checked ? 'checked' : ''} onchange="onFitCheck(${i}, this.checked)" />
      <span class="fit-tag-icon"><i data-lucide="${tagIcon}" style="width:16px;height:16px;vertical-align:middle"></i></span>
      <span class="fit-line-text">${escapeHtml(item.displayText || item.rawLine)}</span>
      ${scoreLbl}
      <span class="fit-weight">${item.weight}c</span>
    </label>`;
  });
  document.getElementById('fit-lines').innerHTML = html;
  updateFitBar();
}

function onFitCheck(idx, checked) {
  _checkedState.set(idx, checked);
  const label = document.querySelector(`.fit-line input[data-idx="${idx}"]`)?.closest('.fit-line');
  if (label) { label.classList.toggle('fit-checked', checked); label.classList.toggle('fit-unchecked', !checked); }
  updateFitBar();
}

function updateFitBar() {
  let used = 0;
  _checkedState.forEach((checked, i) => { if (checked) used += _allScoredLines[i].weight; });
  const over = used > _charBudget;
  document.getElementById('fit-char-count').textContent = `${used} / ${_charBudget}`;
  document.getElementById('fit-char-count').style.color = over ? 'var(--danger)' : 'var(--text-sub)';
  const fill = document.getElementById('fit-bar-fill');
  fill.style.width      = Math.min((used / _charBudget) * 100, 100) + '%';
  fill.style.background = over ? 'var(--danger)' : 'var(--success)';
}

function copyFitSelection() {
  const title          = document.getElementById('meeting-title').value.trim() || 'Block Meeting';
  const date           = document.getElementById('meeting-date').value;
  const checkedLines   = [];
  const uncheckedLines = [];
  _checkedState.forEach((checked, i) => (checked ? checkedLines : uncheckedLines).push(_allScoredLines[i]));

  if (!checkedLines.length) { showToast('⚠️ Nothing checked to copy!'); return; }

  let md = `📋 *${title}*\n📅 ${date}\n${'─'.repeat(32)}\n\n`;
  const g = { '#acad': [], '#org': [], '[A]': [], '': [] };
  checkedLines.forEach(l => (g[l.tag] || g['']).push(l));

  if (g['#acad'].length) { md += `📚 *ACADEMICS*\n`;     g['#acad'].forEach(l => { md += `• ${l.displayText}\n`; }); md += '\n'; }
  if (g['#org'].length)  { md += `🎉 *BLOCK AFFAIRS*\n`; g['#org'].forEach(l => { md += `• ${l.displayText}\n`; }); md += '\n'; }
  if (g['[A]'].length) {
    md += `🚨 *ACTION ITEMS*\n`;
    const aGroups = {};
    g['[A]'].forEach(l => {
      const k = (l.assignee || 'Unassigned').toLowerCase();
      if(!aGroups[k]) aGroups[k] = { name: l.assignee || 'Unassigned', tasks: [] };
      aGroups[k].tasks.push(l.displayText);
    });
    Object.values(aGroups).forEach(ag => {
      md += `[${ag.name}]\n`;
      ag.tasks.forEach(t => { md += `• ${t}\n`; });
    });
    md += '\n';
  }
  if (g[''].length)      { md += `📌 *OTHER*\n`;          g[''].forEach(l => { md += `• ${l.displayText}\n`; }); md += '\n'; }
  md += `_Generated by BlockNotes_`;

  navigator.clipboard.writeText(md).catch(() => {
    const ta = document.createElement('textarea');
    ta.value = md; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); document.body.removeChild(ta);
  });

  window._pendingDeferred = uncheckedLines.map(l => ({
    rawLine: l.rawLine, displayText: l.displayText, tag: l.tag, value: l.value, assignee: l.assignee, task: l.task
  }));

  showToast(`📤 Copied ${checkedLines.length} lines. ${uncheckedLines.length} deferred — save to add to Follow-Up.`);
}

function cancelFitForChat() {
  _fitActive = false;
  _checkedState.clear();
  _allScoredLines        = [];
  window._pendingDeferred = null;
  document.getElementById('structured-output').classList.remove('hidden');
  document.getElementById('fit-output').classList.add('hidden');
  document.getElementById('right-panel-sub').textContent = 'Live-organized output';
  document.getElementById('fit-btn').classList.remove('hidden');
  document.getElementById('fit-copy-btn').classList.add('hidden');
  document.getElementById('fit-cancel-btn').classList.add('hidden');
  renderOutput();
}

// ============================================================
// STORAGE HELPERS
// ============================================================

function getStoredMeetings() {
  try { return JSON.parse(localStorage.getItem('bn_meetings') || '[]'); }
  catch { return []; }
}

// ============================================================
// FEATURE 4 — ARCHIVE SEARCH UI (calls buildHashIndex from algorithms.js)
// ============================================================

function searchArchive(query) {
  const resultsEl = document.getElementById('search-results');
  const hitsEl    = document.getElementById('search-hits');
  if (!query.trim()) { resultsEl.classList.add('hidden'); return; }
  const meetings = getStoredMeetings();
  if (!meetings.length) { resultsEl.classList.add('hidden'); return; }

  const index   = buildHashIndex(meetings);
  const keyword = query.toLowerCase().trim();
  const seenIds = new Set();
  const hits    = (index[keyword] || []).filter(h => { if (seenIds.has(h.id)) return false; seenIds.add(h.id); return true; })
                   .map(h => meetings.find(m => m.id === h.id)).filter(Boolean);

  if (!hits.length) {
    hitsEl.innerHTML = `<p style="color:var(--text-muted);font-size:13px">No results for "<strong>${escapeHtml(query)}</strong>"</p>`;
    resultsEl.classList.remove('hidden');
    return;
  }
  hitsEl.innerHTML = hits.map(m => `<div class="search-hit">
    <div class="search-hit-source"><i data-lucide="calendar" style="width:12px;height:12px;vertical-align:-1px"></i> ${m.date}  —  ${escapeHtml(m.title)}</div>
    ${getSnippets(m.rawText, keyword).map(s => `<div class="search-hit-text">${s}</div>`).join('')}
  </div>`).join('');
  resultsEl.classList.remove('hidden');
  if (window.lucide) lucide.createIcons();
}

function getSnippets(text, keyword) {
  return text.split('\n').filter(l => bruteForceStringMatch(l.toLowerCase(), keyword)).slice(0, 3)
    .map(line => escapeHtml(line).replace(new RegExp(`(${escapeRegex(escapeHtml(keyword))})`, 'gi'),
      '<span class="keyword-highlight">$1</span>'));
}

// ============================================================
// INPUT LISTENERS
// ============================================================

function attachInputListeners() {
  const ta = document.getElementById('raw-input');

  ta.addEventListener('input', () => {
    localStorage.setItem('bn_draft', ta.value);
    if (_fitActive) {
      if (buildFingerprint(ta.value) !== _knapCache.fingerprint) cancelFitForChat();
    }
    renderOutput();
    handleAutocomplete(ta);
    updateLineCount(ta);
  });

  ta.addEventListener('keydown', (e) => {
    const box = document.getElementById('autocomplete-box');
    if (!box.classList.contains('hidden')) {
      const items = box.querySelectorAll('.autocomplete-item');
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        autocompleteIdx = Math.min(autocompleteIdx + 1, items.length - 1);
        highlightItem(items);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        autocompleteIdx = Math.max(autocompleteIdx - 1, 0);
        highlightItem(items);
      } else if ((e.key === 'Enter' || e.key === 'Tab') && autocompleteIdx >= 0 && items[autocompleteIdx]) {
        e.preventDefault();
        applyAutocomplete(items[autocompleteIdx].dataset.name, ta);
      } else if (e.key === 'Escape') {
        hideAutocomplete();
      }
    }
  });

  document.addEventListener('click', (e) => {
    if (!e.target.closest('#autocomplete-box') && e.target !== document.getElementById('raw-input'))
      hideAutocomplete();
  });
}

function updateLineCount(ta) {
  const n = ta.value.split('\n').filter(l => l.trim()).length;
  document.getElementById('line-count').textContent = `${n} line${n !== 1 ? 's' : ''}`;
}

// ============================================================
// AUTOCOMPLETE ENGINE (UI layer — calls searchRoster from algorithms.js)
// ============================================================

function handleAutocomplete(ta) {
  const text     = ta.value.substring(0, ta.selectionStart);
  const lastLine = text.split('\n').pop();
  const atMatch  = lastLine.match(/@([\w\s]*)$/);
  if (!atMatch) { hideAutocomplete(); return; }
  const matches = searchRoster(atMatch[1]);
  if (!matches.length) { hideAutocomplete(); return; }
  autocompleteIdx = -1;
  renderAutocomplete(matches, atMatch[1]);
}

function renderAutocomplete(names, prefix) {
  const box = document.getElementById('autocomplete-box');
  box.innerHTML = '';
  names.slice(0, 6).forEach(name => {
    const item = document.createElement('div');
    item.className    = 'autocomplete-item';
    item.dataset.name = name;
    item.innerHTML    = `<span class="match-prefix">${escapeHtml(name.substring(0, prefix.length))}</span>${escapeHtml(name.substring(prefix.length))}`;
    item.addEventListener('mousedown', (e) => { e.preventDefault(); applyAutocomplete(name, document.getElementById('raw-input')); });
    box.appendChild(item);
  });
  box.classList.remove('hidden');

  const ta = document.getElementById('raw-input');
  const coords = getCaretCoordinates(ta, ta.selectionStart);
  box.style.bottom = 'auto';
  let topPos = coords.top - ta.scrollTop - box.offsetHeight - 4;
  if (topPos < 0) topPos = coords.top - ta.scrollTop + coords.height + 4;
  box.style.top = topPos + 'px';
  box.style.left = Math.min(coords.left - ta.scrollLeft, ta.clientWidth - box.offsetWidth) + 'px';
}

function highlightItem(items) {
  items.forEach((el, i) => el.classList.toggle('selected', i === autocompleteIdx));
}

function applyAutocomplete(name, ta) {
  const before   = ta.value.substring(0, ta.selectionStart);
  const after    = ta.value.substring(ta.selectionStart);
  const replaced = before.replace(/@[\w\s]*$/, `@${name} `);
  ta.value       = replaced + after;
  ta.selectionStart = ta.selectionEnd = replaced.length;
  hideAutocomplete();
  renderOutput();
  localStorage.setItem('bn_draft', ta.value);
}

function hideAutocomplete() {
  document.getElementById('autocomplete-box').classList.add('hidden');
  autocompleteIdx = -1;
}

function getCaretCoordinates(element, position) {
  const div = document.createElement('div');
  const style = div.style;
  const computed = window.getComputedStyle(element);

  style.whiteSpace = 'pre-wrap';
  style.wordWrap = 'break-word';
  style.position = 'absolute';
  style.visibility = 'hidden';

  const properties = ['direction','boxSizing','width','height','overflowX','overflowY',
                      'borderTopWidth','borderRightWidth','borderBottomWidth','borderLeftWidth','borderStyle',
                      'paddingTop','paddingRight','paddingBottom','paddingLeft',
                      'fontStyle','fontVariant','fontWeight','fontStretch','fontSize','fontSizeAdjust','lineHeight','fontFamily',
                      'textAlign','textTransform','textIndent','textDecoration','letterSpacing','wordSpacing','tabSize','MozTabSize'];

  properties.forEach(prop => style[prop] = computed[prop]);

  div.textContent = element.value.substring(0, position);
  const span = document.createElement('span');
  span.textContent = element.value.substring(position) || '.';
  div.appendChild(span);

  document.body.appendChild(div);
  const coordinates = {
    top: span.offsetTop + parseInt(computed.borderTopWidth || 0),
    left: span.offsetLeft + parseInt(computed.borderLeftWidth || 0),
    height: parseInt(computed.lineHeight) || span.offsetHeight
  };
  document.body.removeChild(div);

  return coordinates;
}

// ============================================================
// SAVE — triggers Feature 6 Insertion Sort on deferred lines
// ============================================================

function saveMeeting() {
  const raw   = document.getElementById('raw-input').value.trim();
  const title = document.getElementById('meeting-title').value.trim() || 'Untitled Meeting';
  const date  = document.getElementById('meeting-date').value;
  if (!raw) { showToast('⚠️ Nothing to save!'); return; }

  const meetings = getStoredMeetings();
  let meetingId = window._currentMeetingId || Date.now().toString();
  const existingIdx = meetings.findIndex(m => m.id === meetingId);

  if (existingIdx !== -1) {
    meetings[existingIdx] = { ...meetings[existingIdx], title, date, rawText: raw, savedAt: new Date().toISOString() };
    const [m] = meetings.splice(existingIdx, 1);
    meetings.unshift(m);
  } else {
    meetings.unshift({ id: meetingId, title, date, rawText: raw, savedAt: new Date().toISOString() });
    window._currentMeetingId = meetingId;
  }

  localStorage.setItem('bn_meetings', JSON.stringify(meetings));
  localStorage.removeItem('bn_draft');

  const deferred = window._pendingDeferred;
  if (deferred && deferred.length > 0) {
    deferred.forEach(line => insertIntoFollowUp({ ...line, meetingId, meetingTitle: title, meetingDate: date }));
    window._pendingDeferred = null;
    showToast(`Saved! ${deferred.length} deferred line${deferred.length !== 1 ? 's' : ''} added to Follow-Up.`, 'check-circle');
  } else {
    showToast('Meeting saved!', 'check-square');
  }

  cancelFitForChat();
  loadArchiveView();
  renderFollowUp();
}

// ============================================================
// FEATURE 6 — FOLLOW-UP QUEUE UI (calls insertIntoFollowUp from algorithms.js)
// ============================================================

function getFollowUpQueue() {
  try { return JSON.parse(localStorage.getItem('bn_followup') || '[]'); }
  catch { return []; }
}

function saveFollowUpQueue(queue) {
  localStorage.setItem('bn_followup', JSON.stringify(queue));
  updateFollowUpBadge();
}

function dismissFollowUpItem(idx, e) {
  e && e.stopPropagation();
  const queue = getFollowUpQueue();
  queue.splice(idx, 1);
  const reindexed = new Set();
  _followupChecked.forEach(i => { if (i < idx) reindexed.add(i); else if (i > idx) reindexed.add(i - 1); });
  _followupChecked = reindexed;
  saveFollowUpQueue(queue);
  renderFollowUp();
}

function toggleFollowUpCheck(idx) {
  if (_followupChecked.has(idx)) _followupChecked.delete(idx);
  else _followupChecked.add(idx);
  const card = document.querySelector(`.followup-card[data-idx="${idx}"]`);
  if (card) {
    card.classList.toggle('followup-selected', _followupChecked.has(idx));
    const cb = card.querySelector('.followup-checkbox');
    if (cb) cb.checked = _followupChecked.has(idx);
  }
  updateFollowUpToolbar();
}

function updateFollowUpToolbar() {
  const toolbar = document.getElementById('followup-toolbar');
  const countEl = document.getElementById('followup-sel-count');
  toolbar.classList.toggle('hidden', _followupChecked.size === 0);
  if (countEl) countEl.textContent = _followupChecked.size;
}

function clearFollowUpSelection() {
  _followupChecked.clear();
  renderFollowUp();
}

function postSelectedFollowUp() {
  const queue = getFollowUpQueue();
  if (!_followupChecked.size) { showToast('⚠️ Nothing selected.'); return; }

  const indices  = [..._followupChecked].sort((a,b) => a - b);
  const selected = indices.map(i => queue[i]).filter(Boolean);

  const date = new Date().toISOString().split('T')[0];
  let md = `📣 *Follow-Up Announcements*\n📅 ${date}\n${'─'.repeat(32)}\n\n`;
  const g = { '#acad': [], '#org': [], '[A]': [], '': [] };
  selected.forEach(item => (g[item.tag] || g['']).push(item));

  if (g['#acad'].length) { md += `📚 *ACADEMICS*\n`;     g['#acad'].forEach(l => { md += `• ${l.displayText}\n`; }); md += '\n'; }
  if (g['#org'].length)  { md += `🎉 *BLOCK AFFAIRS*\n`; g['#org'].forEach(l => { md += `• ${l.displayText}\n`; }); md += '\n'; }
  if (g['[A]'].length) {
    md += `🚨 *ACTION ITEMS*\n`;
    const aGroups = {};
    g['[A]'].forEach(l => {
      const k = (l.assignee || 'Unassigned').toLowerCase();
      if(!aGroups[k]) aGroups[k] = { name: l.assignee || 'Unassigned', tasks: [] };
      aGroups[k].tasks.push(l.displayText);
    });
    Object.values(aGroups).forEach(ag => {
      md += `[${ag.name}]\n`;
      ag.tasks.forEach(t => { md += `• ${t}\n`; });
    });
    md += '\n';
  }
  if (g[''].length)      { md += `📌 *OTHER*\n`;          g[''].forEach(l => { md += `• ${l.displayText}\n`; }); md += '\n'; }
  md += `_Generated by BlockNotes_`;

  navigator.clipboard.writeText(md).catch(() => {
    const ta = document.createElement('textarea');
    ta.value = md; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); document.body.removeChild(ta);
  });

  const newQueue = [...queue];
  [..._followupChecked].sort((a,b) => b - a).forEach(i => newQueue.splice(i, 1));
  _followupChecked.clear();
  saveFollowUpQueue(newQueue);
  renderFollowUp();
  showToast(`📤 Copied ${selected.length} item${selected.length !== 1 ? 's' : ''} to clipboard!`);
}

function updateFollowUpBadge() {
  const queue = getFollowUpQueue();
  const badge = document.getElementById('followup-badge');
  if (queue.length > 0) { badge.textContent = queue.length; badge.classList.remove('hidden'); }
  else badge.classList.add('hidden');
}

function renderFollowUp() {
  const list  = document.getElementById('followup-list');
  const queue = getFollowUpQueue();
  updateFollowUpBadge();
  updateFollowUpToolbar();

  if (!queue.length) {
    list.innerHTML = `<div class="empty-state"><div class="empty-icon"><i data-lucide="mail-open"></i></div><p>No follow-up items.</p></div>`;
    return;
  }

  list.innerHTML = queue.map((item, i) => {
    const tagIcon  = item.tag === '#acad' ? '<i data-lucide="book"></i>' : item.tag === '#org' ? '<i data-lucide="party-popper"></i>' : item.tag === '[A]' ? '<i data-lucide="alert-circle"></i>' : '<i data-lucide="pin"></i>';
    const scoreCls = item.value >= 5 ? 'fit-score-high' : item.value >= 3 ? 'fit-score-med' : 'fit-score-low';
    const isChecked = _followupChecked.has(i);
    return `<div class="archive-card followup-card ${isChecked ? 'followup-selected' : ''}" data-idx="${i}" onclick="toggleFollowUpCheck(${i})">
      <input type="checkbox" class="followup-checkbox" ${isChecked ? 'checked' : ''}
        onclick="event.stopPropagation(); toggleFollowUpCheck(${i})" />
      <div class="archive-card-info">
        <div class="archive-card-title">
          ${tagIcon} ${escapeHtml(item.displayText)}
          <span class="fit-score ${scoreCls}">▲${item.value}</span>
        </div>
        <div class="archive-card-meta">📅 ${item.meetingDate} — ${escapeHtml(item.meetingTitle)}</div>
      </div>
      <div class="archive-card-actions" style="display:flex;gap:6px" onclick="event.stopPropagation()">
        <button class="action-btn danger" style="padding:0;width:28px;height:28px;min-height:28px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:14px;line-height:1;"
          onclick="dismissFollowUpItem(${i}, event)">✕</button>
      </div>
    </div>`;
  }).join('');
}

// ============================================================
// THEME TOGGLE
// ============================================================

function initTheme() {
  const saved = localStorage.getItem('blocknotes_theme');
  if (saved === 'dark') {
    document.documentElement.setAttribute('data-theme', 'dark');
    updateThemeIcon('sun');
  }
}

function toggleTheme() {
  const root = document.documentElement;
  const isDark = root.getAttribute('data-theme') === 'dark';
  if (isDark) {
    root.removeAttribute('data-theme');
    localStorage.setItem('blocknotes_theme', 'light');
    updateThemeIcon('moon');
  } else {
    root.setAttribute('data-theme', 'dark');
    localStorage.setItem('blocknotes_theme', 'dark');
    updateThemeIcon('sun');
  }
}

function updateThemeIcon(icon) {
  const btn = document.getElementById('btn-theme');
  if (btn) {
    btn.innerHTML = `<i data-lucide="${icon}"></i>`;
    if (window.lucide) lucide.createIcons({root: btn});
  }
}

// ============================================================
// FEATURE 5 — NAME ROSTER MANAGEMENT (feeds searchRoster in algorithms.js)
// ============================================================

function loadRoster() {
  const saved = localStorage.getItem('bn_roster');
  if (saved) {
    roster = JSON.parse(saved);
  } else {
    roster = ['Maria Santos','Juan dela Cruz','Ana Reyes',
              'Christopher Bautista','Bernadette Lim',
              'Paolo Garcia','Kristine Villanueva','Miguel Torres'];
    localStorage.setItem('bn_roster', JSON.stringify(roster));
  }
  document.getElementById('roster-textarea').value = roster.join('\n');
}

function saveRoster() {
  const raw = document.getElementById('roster-textarea').value;
  roster = raw.split('\n').map(n => n.trim()).filter(Boolean);
  localStorage.setItem('bn_roster', JSON.stringify(roster));
  document.getElementById('roster-textarea').value = roster.join('\n');
  forceCloseRoster();
  showToast('Roster saved!', 'check-circle');
}

function handleRosterFile(event) {
  const file = event.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = function(e) {
    try {
      const data = new Uint8Array(e.target.result);
      const workbook = XLSX.read(data, { type: 'array' });
      const firstSheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[firstSheetName];
      const json = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

      const ignoreHeaders = ['name', 'names', 'first name', 'last name', 'student', 'students', 'full name', 'member', 'members', 'no.', 'no', '#', 'irregular', '(ln, fn, mn)', '(ln,fn,mn)'];

      let colScores = {};
      json.forEach(row => {
        if (!row || !Array.isArray(row)) return;
        row.forEach((cell, colIdx) => {
          if (cell !== undefined && cell !== null) {
            const str = String(cell).trim();
            if (str !== '' && isNaN(Number(str)) && !ignoreHeaders.includes(str.toLowerCase().replace(/\s+/g, ' '))) {
               colScores[colIdx] = (colScores[colIdx] || 0) + 1;
            }
          }
        });
      });

      let bestColIdx = 0;
      let maxScore = -1;
      for (const idx in colScores) {
        if (colScores[idx] > maxScore) {
          maxScore = colScores[idx];
          bestColIdx = parseInt(idx, 10);
        }
      }

      let names = [];
      json.forEach(row => {
        if (row && Array.isArray(row) && row.length > bestColIdx) {
          const cell = row[bestColIdx];
          if (cell !== undefined && cell !== null) {
            const parts = String(cell).split(/\r?\n/);
            parts.forEach(part => {
              const name = part.trim();
              if (name && isNaN(Number(name)) && !ignoreHeaders.includes(name.toLowerCase().replace(/\s+/g, ' '))) {
                if (!bruteForceStringMatch(name.toLowerCase(), 'female:') && !bruteForceStringMatch(name.toLowerCase(), 'male:')) {
                  names.push(name);
                }
              }
            });
          }
        }
      });

      if (names.length > 0) {
        const textarea = document.getElementById('roster-textarea');
        const currentVal = textarea.value.trim();
        const newVal = currentVal ? currentVal + '\n' + names.join('\n') : names.join('\n');
        const uniqueNames = [...new Set(newVal.split('\n').map(n => n.trim()).filter(Boolean))];
        textarea.value = uniqueNames.join('\n');
        showToast(`Imported ${names.length} names!`, 'check-circle');
      } else {
        showToast('No names found in file.', 'x-circle');
      }
    } catch (err) {
      console.error(err);
      showToast('Error parsing file. Please check format.', 'x-circle');
    }
    event.target.value = '';
  };
  reader.readAsArrayBuffer(file);
}

// ============================================================
// CUSTOM WORDS MODAL
// ============================================================

function openCustomModal() {
  renderCustomWordsList();
  document.getElementById('custom-modal').classList.remove('hidden');
}

function closeCustomModal() {
  document.getElementById('custom-modal').classList.add('hidden');
  _knapCache.fingerprint = null;
}

function renderCustomWordsList() {
  const list    = document.getElementById('custom-words-list');
  const customs = getCustomSignals();
  if (!customs.length) {
    list.innerHTML = `<p class="modal-sub" style="padding:16px 0; text-align: center;">No custom words yet.</p>`;
    list.style.border = 'none';
    list.style.background = 'transparent';
    return;
  }
  list.style.border = '';
  list.style.background = '';
  list.innerHTML = customs.map((c, i) =>
    `<div class="custom-word-row">
      <span class="custom-word-text">${escapeHtml(c.word)}</span>
      <span class="custom-word-pts">+${c.pts} pts</span>
      <button class="action-btn danger" style="padding:3px 8px;font-size:12px"
        onclick="removeCustomWord(${i})">✕</button>
    </div>`
  ).join('');
}

function addCustomWord() {
  const wordInput = document.getElementById('custom-word-input');
  const ptsInput  = document.getElementById('custom-pts-input');
  const word = wordInput.value.trim().toLowerCase();
  const pts  = Math.min(5, Math.max(1, parseInt(ptsInput.value, 10) || 1));
  if (!word) { showToast('⚠️ Enter a word first.'); return; }

  const customs = getCustomSignals();
  if (customs.find(c => c.word === word)) { showToast('Word already exists.', 'alert-triangle'); return; }
  customs.push({ word, pts });
  saveCustomSignals(customs);
  wordInput.value = '';
  ptsInput.value  = '3';
  renderCustomWordsList();
  showToast(`"${word}" (+${pts}pts) added.`, 'check-circle');
}

function removeCustomWord(idx) {
  const customs = getCustomSignals();
  customs.splice(idx, 1);
  saveCustomSignals(customs);
  renderCustomWordsList();
}

// ============================================================
// SCORING INFO FLOATING WINDOW
// ============================================================

function buildScoringPages() {
  const customs = getCustomSignals();

  const page1 = `
    <div class="scoring-page-title"><i data-lucide="signal" style="width:20px;height:20px;vertical-align:-3px;margin-right:6px"></i> Built-in Urgency Signal Words</div>
    <p class="scoring-note">These are fixed and cannot be edited.</p>
    <table class="scoring-table">
      <thead><tr><th>Words</th><th>Points</th></tr></thead>
      <tbody>
        ${URGENCY_SIGNALS.map(g => `<tr>
          <td>${g.isPattern ? '<em>date number</em> (e.g. 15th, 3rd, June 3)' : g.words.map(w => `<code>${w}</code>`).join(', ')}</td>
          <td class="pts-cell">+${g.pts}</td>
        </tr>`).join('')}
      </tbody>
    </table>`;

  const page2 = `
    <div class="scoring-page-title"><i data-lucide="tag" style="width:20px;height:20px;vertical-align:-3px;margin-right:6px"></i> Tag Base Points</div>
    <p class="scoring-note">Added on top of signal word scores.</p>
    <table class="scoring-table">
      <thead><tr><th>Line type</th><th>Points</th><th>Note</th></tr></thead>
      <tbody>
        ${TAG_BASE_POINTS.map(t => `<tr>
          <td><code>${escapeHtml(t.label)}</code></td>
          <td class="pts-cell">+${t.pts}</td>
          <td class="note-cell">${t.note}</td>
        </tr>`).join('')}
      </tbody>
    </table>`;

  const page3 = `
    <div class="scoring-page-title" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
      <span><i data-lucide="pen-line" style="width:20px;height:20px;vertical-align:-3px;margin-right:6px"></i> Your Custom Words</span>
      <button class="action-btn" onclick="closeScoringInfo(); openCustomModal()"><i data-lucide="edit-3"></i> Edit</button>
    </div>
    ${!customs.length ? '<p class="scoring-note">No custom words added yet.</p>' : ''}
    ${customs.length ? `<table class="scoring-table">
      <thead><tr><th>Word</th><th>Points</th></tr></thead>
      <tbody>${customs.map(c => `<tr><td><code>${escapeHtml(c.word)}</code></td><td class="pts-cell">+${c.pts}</td></tr>`).join('')}</tbody>
    </table>` : ''}`;

  return [page1, page2, page3];
}

function openScoringInfo() {
  _scoringPage = 0;
  renderScoringPage();
  document.getElementById('scoring-overlay').classList.remove('hidden');
}

function closeScoringInfo() {
  document.getElementById('scoring-overlay').classList.add('hidden');
}

function scoringPage(dir) {
  const pages = buildScoringPages();
  _scoringPage = Math.max(0, Math.min(pages.length - 1, _scoringPage + dir));
  renderScoringPage();
}

function renderScoringPage() {
  const pages   = buildScoringPages();
  const content = document.getElementById('scoring-content');
  const indicator = document.getElementById('page-indicator');
  const prevBtn   = document.getElementById('page-prev');
  const nextBtn   = document.getElementById('page-next');

  content.innerHTML       = pages[_scoringPage];
  indicator.textContent   = `${_scoringPage + 1} / ${pages.length}`;
  prevBtn.disabled        = _scoringPage === 0;
  nextBtn.disabled        = _scoringPage === pages.length - 1;
  if (window.lucide) lucide.createIcons();
}

// ============================================================
// MISC UTILS
// ============================================================

function switchView(view) {
  ['editor','archive','followup'].forEach(v => {
    document.getElementById(`view-${v}`).classList.toggle('active', v === view);
    document.getElementById(`btn-${v}`).classList.toggle('active', v === view);
  });
  const metaBar = document.getElementById('meta-bar');
  if (metaBar) metaBar.style.display = (view === 'editor') ? '' : 'none';
  if (view === 'archive')  loadArchiveView();
  if (view === 'followup') renderFollowUp();
}

function clearEditor() {
  if (!document.getElementById('raw-input').value.trim()) return;
  if (!confirm('Clear the editor? Unsaved notes will be lost.')) return;
  window._currentMeetingId = null;
  document.getElementById('raw-input').value     = '';
  document.getElementById('meeting-title').value = '';
  localStorage.removeItem('bn_draft');
  window._pendingDeferred = null;
  cancelFitForChat();
  showToast('Editor cleared.', 'trash-2');
}

function openRoster()  { document.getElementById('roster-modal').classList.remove('hidden'); }
function closeRoster() {
  const currentText = document.getElementById('roster-textarea').value.trim();
  const savedText = roster.join('\n').trim();
  if (currentText !== savedText) {
    document.getElementById('roster-unsaved-modal').classList.remove('hidden');
  } else {
    forceCloseRoster();
  }
}
function forceCloseRoster() {
  document.getElementById('roster-unsaved-modal').classList.add('hidden');
  document.getElementById('roster-modal').classList.add('hidden');
  document.getElementById('roster-textarea').value = roster.join('\n');
}
function cancelCloseRoster() {
  document.getElementById('roster-unsaved-modal').classList.add('hidden');
}

function showToast(msg, icon) {
  const t = document.getElementById('toast');
  const iconHtml = icon ? `<i data-lucide="${icon}" style="width:16px;height:16px;vertical-align:-3px;margin-right:6px"></i>` : '';
  t.innerHTML = `${iconHtml}${escapeHtml(msg)}`;
  t.classList.remove('hidden');
  if (window.lucide) lucide.createIcons({root: t});
  clearTimeout(t._timer);
  t._timer = setTimeout(() => t.classList.add('hidden'), 3200);
}

function escapeHtml(str) {
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function attachResizer() {
  const resizer = document.getElementById('resizer');
  if (!resizer) return;
  const leftPanel = document.querySelector('.panel-left');
  let isResizing = false;

  resizer.addEventListener('mousedown', (e) => {
    isResizing = true;
    const isVertical = document.querySelector('.split-container').classList.contains('layout-vertical');
    document.body.style.cursor = isVertical ? 'row-resize' : 'col-resize';
  });

  document.addEventListener('mousemove', (e) => {
    if (!isResizing) return;
    const splitContainer = document.querySelector('.split-container');
    const containerRect = splitContainer.getBoundingClientRect();
    if (splitContainer.classList.contains('layout-vertical')) {
      const newHeight = e.clientY - containerRect.top;
      if (newHeight > 200 && newHeight < containerRect.height - 200) {
        leftPanel.style.flex = `0 0 ${newHeight}px`;
      }
    } else {
      const newWidth = e.clientX - containerRect.left;
      if (newWidth > 300 && newWidth < containerRect.width - 300) {
        leftPanel.style.flex = `0 0 ${newWidth}px`;
      }
    }
  });

  document.addEventListener('mouseup', () => {
    if (isResizing) {
      isResizing = false;
      document.body.style.cursor = '';
    }
  });
}

function setTodayDate() {
  const d = document.getElementById('meeting-date');
  d.value = new Date().toISOString().split('T')[0];
}

function toggleLayout() {
  const container = document.querySelector('.split-container');
  const leftPanel = document.querySelector('.panel-left');
  const resizerIcon = document.querySelector('#resizer .divider-arrow i');

  if (container.classList.contains('layout-vertical')) {
    container.classList.remove('layout-vertical');
    leftPanel.style.flex = '';
    resizerIcon.setAttribute('data-lucide', 'grip-vertical');
    localStorage.setItem('bn_layout', 'horizontal');
  } else {
    container.classList.add('layout-vertical');
    leftPanel.style.flex = '';
    resizerIcon.setAttribute('data-lucide', 'grip-horizontal');
    localStorage.setItem('bn_layout', 'vertical');
  }
  if (window.lucide) lucide.createIcons();
}
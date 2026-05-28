/**
 * BlockNotes — script.js
 *
 * Feature 1 — Bucket Sort / Presorting    (Transform & Conquer)
 * Feature 2 — Brute-Force String Matching (Brute Force)
 * Feature 3 — Sequential Search           (Brute Force)
 * Feature 4 — Levenshtein Edit Distance   (Heuristics)
 * Feature 5 — Hashing                     (Space & Time Trade-offs)
 * Feature 6 — Backtracking Knapsack       (Backtracking Algorithm)
 * Feature 7 — Insertion Sort              (Decrease & Conquer)
 */

// ============================================================
// CONSTANTS & STATE
// ============================================================

const VALID_TAGS = ['#acad', '#org'];

const TAG_CORRECTIONS = {
  '#acad': ['#acad', '#acd', '#adc', '#cad', '#aacd', '#acdd'],
  '#org':  ['#org', '#og', '#rg', '#orgg', '#orr', '#ogr']
};

const TYPO_MAP = {};
for (const [canonical, variants] of Object.entries(TAG_CORRECTIONS)) {
  for (const v of variants) {
    if (!TYPO_MAP[v]) TYPO_MAP[v] = canonical;
  }
}

// Built-in urgency signals — READ ONLY, displayed in info window page 1
const URGENCY_SIGNALS = [
  { words: ['today', 'tonight', 'now'],                       pts: 5 },
  { words: ['tomorrow'],                                      pts: 4 },
  { words: ['deadline', 'due', 'submit', 'urgent', 'asap'],  pts: 4 },
  { words: ['exam', 'quiz', 'test', 'finals', 'prelim'],     pts: 3 },
  { words: ['monday','tuesday','wednesday','thursday',
            'friday','saturday','sunday'],                    pts: 3 },
  { words: ['date number (e.g. 15th, 3rd)'],                 pts: 2, isPattern: true },
];

// Built-in tag base points — READ ONLY, displayed in info window page 2
const TAG_BASE_POINTS = [
  { label: '[A] Action item',  pts: 5, note: '+2 acad base +3 action bonus' },
  { label: '#acad line',       pts: 2, note: 'base points' },
  { label: '#org line',        pts: 1, note: 'base points' },
  { label: 'Untagged line',    pts: 0, note: 'no base points' },
];

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
  loadRoster();
  setTodayDate();
  attachInputListeners();
  loadArchiveView();
  renderFollowUp();
  const draft = localStorage.getItem('bn_draft');
  if (draft) document.getElementById('raw-input').value = draft;
  renderOutput();
});

function setTodayDate() {
  const d = document.getElementById('meeting-date');
  d.value = new Date().toISOString().split('T')[0];
}

// ============================================================
// FEATURE 3 — NAME ROSTER & AUTOCOMPLETE (Sequential Search)
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
  closeRoster();
  showToast('✅ Roster saved!');
}

/** Sequential Search — O(n) prefix match */
function searchRoster(prefix) {
  if (!prefix) return [];
  const lower = prefix.toLowerCase();
  const results = [];
  for (let i = 0; i < roster.length; i++) {
    if (roster[i].toLowerCase().startsWith(lower)) results.push(roster[i]);
  }
  return results;
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
// AUTOCOMPLETE ENGINE
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

// ============================================================
// FEATURE 4 — TAG TYPO CORRECTION (Levenshtein Edit Distance)
// ============================================================

function editDistance(a, b) {
  const m = a.length, n = b.length;
  const dp = Array.from({length: m + 1}, (_, i) =>
    Array.from({length: n + 1}, (_, j) => (i === 0 ? j : j === 0 ? i : 0))
  );
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++)
      dp[i][j] = a[i-1] === b[j-1] ? dp[i-1][j-1] : 1 + Math.min(dp[i-1][j], dp[i][j-1], dp[i-1][j-1]);
  return dp[m][n];
}

function resolveTag(token) {
  const lower = token.toLowerCase();
  if (VALID_TAGS.includes(lower)) return { canonical: lower, wasTypo: false };
  if (TYPO_MAP[lower])            return { canonical: TYPO_MAP[lower], wasTypo: true };
  for (const canonical of VALID_TAGS)
    if (editDistance(lower, canonical) <= 2) return { canonical, wasTypo: true };
  return null;
}

// ============================================================
// FEATURE 1 & 2 — PARSE + BUCKET SORT + ACTION EXTRACTION
// ============================================================

function parseLines(raw) {
  const lines   = raw.split('\n');
  const buckets = { acad: [], org: [], action: [], untagged: [] };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    if (isActionItem(line)) {
      buckets.action.push({ ...parseActionItem(line), idx: i, rawLine: line });
      continue;
    }

    const spaceIdx = line.indexOf(' ');
    const token    = spaceIdx !== -1 ? line.substring(0, spaceIdx) : line;
    const content  = spaceIdx !== -1 ? line.substring(spaceIdx + 1) : '';
    const resolved = resolveTag(token);

    if (resolved) {
      const key = resolved.canonical === '#acad' ? 'acad' : 'org';
      buckets[key].push({ content, tag: resolved.canonical, wasTypo: resolved.wasTypo,
        originalToken: resolved.wasTypo ? token : null, idx: i, rawLine: line });
    } else {
      buckets.untagged.push({ content: line, idx: i, rawLine: line });
    }
  }
  return buckets;
}

function isActionItem(line) {
  const lower = line.toLowerCase();
  for (let i = 0; i <= lower.length - 3; i++)
    if (lower[i] === '[' && lower[i+1] === 'a' && lower[i+2] === ']') return true;
  return false;
}

function parseActionItem(line) {
  const stripped = line.replace(/^\[a\]\s*/i, '').trim();
  const colonIdx = stripped.indexOf(':');
  if (colonIdx !== -1)
    return { assignee: stripped.substring(0, colonIdx).trim(), task: stripped.substring(colonIdx + 1).trim() };
  return { assignee: '', task: stripped };
}

// ============================================================
// RENDER STRUCTURED OUTPUT
// ============================================================

function renderOutput() {
  if (_fitActive) return;
  const raw = document.getElementById('raw-input').value;
  const out = document.getElementById('structured-output');

  if (!raw.trim()) {
    out.innerHTML = `<div class="empty-state"><div class="empty-icon">📝</div><p>Start typing on the left to see your notes organize in real-time.</p></div>`;
    document.getElementById('output-stats').textContent = '';
    return;
  }

  const buckets = parseLines(raw);
  let html = '';
  if (buckets.acad.length)     html += buildCategoryBlock('acad',     '📚 ACADEMICS',         '#acad', buckets.acad);
  if (buckets.org.length)      html += buildCategoryBlock('org',      '🎉 BLOCK AFFAIRS',      '#org',  buckets.org);
  if (buckets.action.length)   html += buildActionBlock(buckets.action);
  if (buckets.untagged.length) html += buildCategoryBlock('untagged', '📌 UNTAGGED',            '',      buckets.untagged);
  out.innerHTML = html;

  document.getElementById('output-stats').textContent = [
    buckets.acad.length   ? `📚 ${buckets.acad.length}`   : '',
    buckets.org.length    ? `🎉 ${buckets.org.length}`    : '',
    buckets.action.length ? `🚨 ${buckets.action.length}` : ''
  ].filter(Boolean).join('  ');
}

function buildCategoryBlock(cls, label, tagLabel, items) {
  const rows = items.map(item => {
    const html  = highlightMentions(escapeHtml(item.content || item.task || ''));
    const badge = item.wasTypo
      ? `<span class="typo-badge" title="Auto-corrected from ${escapeHtml(item.originalToken)}">⚡ fixed</span>` : '';
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
  const rows = items.map(item =>
    `<div class="cat-item"><span class="bullet">🚨</span>
      ${item.assignee ? `<span class="action-assignee">${escapeHtml(item.assignee)}</span>` : ''}
      <span class="action-task">${highlightMentions(escapeHtml(item.task))}</span>
    </div>`).join('');
  return `<div class="category-block action">
    <div class="cat-header">🚨 ACTION ITEMS / DELIVERABLES
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
// FEATURE 5 — HASH-BASED ARCHIVE SEARCH
// ============================================================

function buildHashIndex(meetings) {
  const index = {};
  meetings.forEach(m => {
    const words = (m.rawText + ' ' + m.title).toLowerCase().match(/\b\w{3,}\b/g) || [];
    [...new Set(words)].forEach(w => {
      if (!index[w]) index[w] = [];
      index[w].push({ id: m.id, title: m.title, date: m.date });
    });
  });
  return index;
}

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
    <div class="search-hit-source">📅 ${m.date}  —  ${escapeHtml(m.title)}</div>
    ${getSnippets(m.rawText, keyword).map(s => `<div class="search-hit-text">${s}</div>`).join('')}
  </div>`).join('');
  resultsEl.classList.remove('hidden');
}

function getSnippets(text, keyword) {
  return text.split('\n').filter(l => l.toLowerCase().includes(keyword)).slice(0, 3)
    .map(line => escapeHtml(line).replace(new RegExp(`(${escapeRegex(escapeHtml(keyword))})`, 'gi'),
      '<span class="keyword-highlight">$1</span>'));
}

// ============================================================
// FEATURE 6 — FIT FOR CHAT (Backtracking Knapsack)
// ============================================================

/**
 * scoreLineUrgency — BUG FIX NOTE:
 * Previously `item.assignee !== undefined` fired for ALL items since
 * non-action items had assignee: null and null !== undefined is true.
 * Fixed: action items are identified by tag === '[A]' only.
 */
function scoreLineUrgency(item) {
  const text = (item.content || item.task || item.rawLine || '').toLowerCase();
  let score  = 0;

  // Scan built-in signal groups (sequential scan)
  for (const group of URGENCY_SIGNALS) {
    if (group.isPattern) continue; // handled separately below
    for (const word of group.words) {
      if (text.includes(word)) { score += group.pts; break; }
    }
  }

  // Date number pattern
  if (/\b\d{1,2}(st|nd|rd|th)?\b/.test(text)) score += 2;

  // Tag base points — action items identified by tag only, not assignee
  if (item.tag === '[A]') {
    score += 2; // acad-level base
    score += 3; // action bonus
  } else if (item.tag === '#acad') {
    score += 2;
  } else if (item.tag === '#org') {
    score += 1;
  }

  // Custom word bonuses
  for (const { word, pts } of getCustomSignals()) {
    if (text.includes(word.toLowerCase())) score += pts;
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

/**
 * BACKTRACKING KNAPSACK
 * Branch: include / exclude each item.
 * Prune: (a) weight exceeds remaining capacity
 *        (b) suffix upper bound can't beat current best
 */
function backtrackKnapsack(items, capacity) {
  const n         = items.length;
  const suffixVal = new Array(n + 1).fill(0);
  for (let i = n - 1; i >= 0; i--) suffixVal[i] = suffixVal[i+1] + items[i].value;

  let bestValue    = -1;
  let bestIncluded = new Set();
  const current    = new Set();

  function bt(idx, remCap, curVal) {
    if (idx === n) {
      if (curVal > bestValue) { bestValue = curVal; bestIncluded = new Set(current); }
      return;
    }
    if (curVal + suffixVal[idx] <= bestValue) return; // prune

    if (items[idx].weight <= remCap) {
      current.add(idx);
      bt(idx + 1, remCap - items[idx].weight, curVal + items[idx].value);
      current.delete(idx);
    }
    bt(idx + 1, remCap, curVal);
  }

  bt(0, capacity, 0);
  return bestIncluded;
}

function runFitForChat() {
  const raw = document.getElementById('raw-input').value.trim();
  if (!raw) { showToast('⚠️ Nothing to fit — type some notes first!'); return; }
  _charBudget = parseInt(document.getElementById('char-budget').value, 10) || 500;
  const fp    = buildFingerprint(raw);

  if (_knapCache.fingerprint === fp && _knapCache.budget === _charBudget) {
    showToast('⚡ Same notes — using cached result.');
    activateFitMode(_knapCache.included, _knapCache.scored);
    return;
  }

  const scored   = buildScoredLines(raw);
  const included = backtrackKnapsack(scored, _charBudget);
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
    const tagIcon  = item.tag === '#acad' ? '📚' : item.tag === '#org' ? '🎉' : item.tag === '[A]' ? '🚨' : '📌';
    const scoreCls = item.value >= 5 ? 'fit-score-high' : item.value >= 3 ? 'fit-score-med' : 'fit-score-low';
    const scoreLbl = item.value > 0 ? `<span class="fit-score ${scoreCls}">▲${item.value}</span>` : '';
    html += `<label class="fit-line ${checked ? 'fit-checked' : 'fit-unchecked'}">
      <input type="checkbox" data-idx="${i}" ${checked ? 'checked' : ''} onchange="onFitCheck(${i}, this.checked)" />
      <span class="fit-tag-icon">${tagIcon}</span>
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
  if (g['[A]'].length)   { md += `🚨 *ACTION ITEMS*\n`;  g['[A]'].forEach(l => { md += `• ${l.assignee ? '['+l.assignee+'] ' : ''}${l.displayText}\n`; }); md += '\n'; }
  if (g[''].length)      { md += `📌 *OTHER*\n`;          g[''].forEach(l => { md += `• ${l.displayText}\n`; }); md += '\n'; }
  md += `_Generated by BlockNotes_`;

  navigator.clipboard.writeText(md).catch(() => {
    const ta = document.createElement('textarea');
    ta.value = md; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); document.body.removeChild(ta);
  });

  window._pendingDeferred = uncheckedLines.map(l => ({
    rawLine: l.rawLine, displayText: l.displayText, tag: l.tag, value: l.value
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
// SAVE — triggers Feature 7 Insertion Sort on deferred lines
// ============================================================

function saveMeeting() {
  const raw   = document.getElementById('raw-input').value.trim();
  const title = document.getElementById('meeting-title').value.trim() || 'Untitled Meeting';
  const date  = document.getElementById('meeting-date').value;
  if (!raw) { showToast('⚠️ Nothing to save!'); return; }

  const meetings = getStoredMeetings();
  
  // Check if a meeting with same title already exists
  const existingIdx = meetings.findIndex(m => m.title === title);
  
  let meeting;
  if (existingIdx !== -1) {
    // Update existing meeting
    meetings[existingIdx].rawText = raw;
    meetings[existingIdx].date = date;
    meetings[existingIdx].savedAt = new Date().toISOString();
    meeting = meetings[existingIdx];
    showToast(`✅ Meeting updated: "${title}"`);
  } else {
    // Create new meeting
    meeting = { id: Date.now().toString(), title, date, rawText: raw, savedAt: new Date().toISOString() };
    meetings.unshift(meeting);
    showToast('✅ Meeting saved!');
  }
  
  localStorage.setItem('bn_meetings', JSON.stringify(meetings));
  localStorage.removeItem('bn_draft');

  const deferred = window._pendingDeferred;
  if (deferred && deferred.length > 0) {
    deferred.forEach(line => insertIntoFollowUp({ ...line, meetingId: meeting.id, meetingTitle: title, meetingDate: date }));
    window._pendingDeferred = null;
    showToast(`✅ ${deferred.length} deferred line${deferred.length !== 1 ? 's' : ''} added to Follow-Up.`);
  }

  cancelFitForChat();
  loadArchiveView();
  renderFollowUp();
}

// ============================================================
// FEATURE 7 — FOLLOW-UP QUEUE (Insertion Sort)
// ============================================================

function getFollowUpQueue() {
  try { return JSON.parse(localStorage.getItem('bn_followup') || '[]'); }
  catch { return []; }
}

function saveFollowUpQueue(queue) {
  localStorage.setItem('bn_followup', JSON.stringify(queue));
  updateFollowUpBadge();
}

/**
 * Insertion Sort step: walk backwards through the sorted queue,
 * shifting items with lower value right, then insert at the gap.
 * Queue stays sorted descending by value after every call.
 */
function insertIntoFollowUp(newItem) {
  const queue = getFollowUpQueue();
  let pos = queue.length;
  while (pos > 0 && queue[pos - 1].value < newItem.value) pos--;
  queue.splice(pos, 0, newItem);
  saveFollowUpQueue(queue);
}

function dismissFollowUpItem(idx, e) {
  e && e.stopPropagation();
  const queue = getFollowUpQueue();
  queue.splice(idx, 1);
  // Re-index _followupChecked after removal
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
  if (g['[A]'].length)   { md += `🚨 *ACTION ITEMS*\n`;  g['[A]'].forEach(l => { md += `• ${l.displayText}\n`; }); md += '\n'; }
  if (g[''].length)      { md += `📌 *OTHER*\n`;          g[''].forEach(l => { md += `• ${l.displayText}\n`; }); md += '\n'; }
  md += `_Generated by BlockNotes_`;

  navigator.clipboard.writeText(md).catch(() => {
    const ta = document.createElement('textarea');
    ta.value = md; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); document.body.removeChild(ta);
  });

  // Remove posted items highest-index first to preserve order
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
    list.innerHTML = `<div class="empty-state"><div class="empty-icon">📭</div><p>No deferred items yet. Run Fit for Chat, copy, then save to populate this list.</p></div>`;
    return;
  }

  list.innerHTML = queue.map((item, i) => {
    const tagIcon  = item.tag === '#acad' ? '📚' : item.tag === '#org' ? '🎉' : item.tag === '[A]' ? '🚨' : '📌';
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
        <button class="action-btn danger" style="padding:5px 10px;font-size:12px"
          onclick="dismissFollowUpItem(${i}, event)">✕</button>
      </div>
    </div>`;
  }).join('');
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
  // Invalidate knapsack cache so new words take effect on next run
  _knapCache.fingerprint = null;
}

function renderCustomWordsList() {
  const list    = document.getElementById('custom-words-list');
  const customs = getCustomSignals();
  if (!customs.length) {
    list.innerHTML = `<p class="modal-sub" style="padding:8px 0">No custom words yet.</p>`;
    return;
  }
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
  if (customs.find(c => c.word === word)) { showToast('⚠️ Word already exists.'); return; }
  customs.push({ word, pts });
  saveCustomSignals(customs);
  wordInput.value = '';
  ptsInput.value  = '3';
  renderCustomWordsList();
  showToast(`✅ "${word}" (+${pts}pts) added.`);
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

  // Page 1: Built-in urgency signal words
  const page1 = `
    <div class="scoring-page-title">📶 Built-in Urgency Signal Words</div>
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

  // Page 2: Tag base points
  const page2 = `
    <div class="scoring-page-title">🏷️ Tag Base Points</div>
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

  // Page 3+: Custom words (one page, read-only view)
  const page3 = `
    <div class="scoring-page-title">✏️ Your Custom Words</div>
    <p class="scoring-note">
      ${customs.length ? 'These are your added words.' : 'No custom words added yet.'}
      <button class="scoring-edit-btn" onclick="closeScoringInfo(); openCustomModal()">Edit custom words →</button>
    </p>
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
}

// ============================================================
// STORAGE HELPERS
// ============================================================

function getStoredMeetings() {
  try { return JSON.parse(localStorage.getItem('bn_meetings') || '[]'); }
  catch { return []; }
}

// ============================================================
// ARCHIVE VIEW
// ============================================================

function loadArchiveView() {
  const list     = document.getElementById('archive-list');
  const meetings = getStoredMeetings();
  if (!meetings.length) {
    list.innerHTML = `<div class="empty-state"><div class="empty-icon">🗃️</div><p>No saved meetings yet.</p></div>`;
    return;
  }
  list.innerHTML = meetings.map(m => {
    const b = parseLines(m.rawText);
    return `<div class="archive-card" onclick="loadMeeting('${m.id}')">
      <div class="archive-card-info">
        <div class="archive-card-title">${escapeHtml(m.title)}</div>
        <div class="archive-card-meta">📅 ${m.date}</div>
      </div>
      <div class="archive-card-tags">
        ${b.acad.length   ? `<span class="tag-chip acad">📚 ${b.acad.length}</span>`   : ''}
        ${b.org.length    ? `<span class="tag-chip org">🎉 ${b.org.length}</span>`    : ''}
        ${b.action.length ? `<span class="tag-chip action">🚨 ${b.action.length}</span>` : ''}
      </div>
      <div class="archive-card-actions">
        <button class="action-btn danger" style="padding:4px 8px;font-size:12px"
          onclick="event.stopPropagation(); deleteMeeting('${m.id}')">🗑️</button>
      </div>
    </div>`;
  }).join('');
}

function loadMeeting(id) {
  const m = getStoredMeetings().find(m => m.id === id);
  if (!m) return;
  document.getElementById('raw-input').value     = m.rawText;
  document.getElementById('meeting-title').value = m.title;
  document.getElementById('meeting-date').value  = m.date;
  cancelFitForChat();
  switchView('editor');
  renderOutput();
  showToast(`📂 Loaded: ${m.title}`);
}

function deleteMeeting(id) {
  localStorage.setItem('bn_meetings', JSON.stringify(getStoredMeetings().filter(m => m.id !== id)));
  saveFollowUpQueue(getFollowUpQueue().filter(item => item.meetingId !== id));
  renderFollowUp();
  loadArchiveView();
  showToast('🗑️ Meeting deleted. Its Follow-Up items removed.');
}

// ============================================================
// MISC UTILS
// ============================================================

function switchView(view) {
  ['editor','archive','followup'].forEach(v => {
    document.getElementById(`view-${v}`).classList.toggle('active', v === view);
    document.getElementById(`btn-${v}`).classList.toggle('active', v === view);
  });
  if (view === 'archive')  loadArchiveView();
  if (view === 'followup') renderFollowUp();
}

function clearEditor() {
  if (!document.getElementById('raw-input').value.trim()) return;
  if (!confirm('Clear the editor? Unsaved notes will be lost.')) return;
  document.getElementById('raw-input').value     = '';
  document.getElementById('meeting-title').value = '';
  localStorage.removeItem('bn_draft');
  window._pendingDeferred = null;
  cancelFitForChat();
  showToast('🗑️ Editor cleared.');
}

function openRoster()  { document.getElementById('roster-modal').classList.remove('hidden'); }
function closeRoster() { document.getElementById('roster-modal').classList.add('hidden'); }

function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.remove('hidden');
  clearTimeout(t._timer);
  t._timer = setTimeout(() => t.classList.add('hidden'), 3200);
}

function escapeHtml(str) {
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
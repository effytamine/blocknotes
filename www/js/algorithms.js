/**
 * BlockNotes — algorithms.js
 *
 * Contains exactly the 6 course algorithms. Nothing else.
 * Depends on: constants.js (must be loaded first in index.html)
 *
 * ┌─────────────────────────────────────────────────────────────────────┐
 * │  Main Algos         │ Input comes from …                            │
 * ├─────────────────────┼───────────────────────────────────────────────┤
 * │ 1. Brute-Force      │ script.js → scanLineMetadata(raw)             │
 * │    String Matching  │   raw textarea string split into lines;       │
 * │    (scanLine-       │   each line tested with isActionItem() and    │
 * │    Metadata)        │   resolveTag() which calls this algo          │
 * │                     │                                               │
 * │ 2. Greedy Heuristic │ script.js → runFitForChat()                   │
 * │    Knapsack         │   calls buildScoredLines(raw) which calls     │
 * │    (greedyHeuristic)│   parseLines() → scored array passed here     │
 * │                     │                                               │
 * └─────────────────────┴───────────────────────────────────────────────┘
 * ┌─────────────────────────────────────────────────────────────────────┐
 * │  Support Algos      │ Input comes from …                            │
 * ├─────────────────────┼───────────────────────────────────────────────┤
 * │ 3. Hashing          │ script.js → searchArchive(query)              │
 * │    (buildHashIndex) │   query = search input value;                 │
 * │                     │   meetings = getStoredMeetings() from         │
 * │                     │   localStorage                                │
 * │                     │                                               │
 * │ 4. Sequential Search│ script.js → handleAutocomplete(ta)            │
 * │    (searchRoster)   │   prefix = @-mention text extracted from      │
 * │                     │   the textarea cursor position                │
 * │                     │                                               │
 * │ 5. Insertion Sort   │ script.js → saveMeeting()                     │
 * │    (insertInto-     │   newItem = a deferred scored line object     │
 * │    FollowUp)        │   from _pendingDeferred (set by               │
 * │                     │   copyFitSelection); queue persisted in       │
 * │                     │   localStorage via getFollowUpQueue()         │
 * └─────────────────────┴───────────────────────────────────────────────┘
 */

// ============================================================
// FEATURE 1 — BRUTE-FORCE STRING MATCHING
// Input: raw textarea string from script.js → scanLineMetadata(raw)
// ============================================================

/**
 * STAGE 1 — BRUTE-FORCE METADATA SCAN
 * For every non-empty line, brute-force string match for the [A]
 * action marker, then (if not an action line) resolve the leading
 * token against the known tags (exact match / typo map / closest-pair
 * brute force, see resolveTag). Returns a flat array of line-objects,
 * each annotated with metadata describing what was found — nothing
 * is categorized or sorted yet.
 */

function scanLineMetadata(raw) {
  const lines    = raw.split('\n');
  const metadata = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    // EXPECTED/CODED marker #1 — action item prefix "[A]" (brute force scan)
    if (isActionItem(line)) {
      const { assignee, task } = parseActionItem(line);
      metadata.push({ idx: i, rawLine: line, kind: 'action', tag: '[A]',
        assignee, task, wasTypo: false, originalToken: null });
      continue;
    }

    // EXPECTED/CODED marker #2 — leading "#tag" token (brute force + closest-pair fallback)
    const spaceIdx = line.indexOf(' ');
    const token    = spaceIdx !== -1 ? line.substring(0, spaceIdx) : line;
    const content  = spaceIdx !== -1 ? line.substring(spaceIdx + 1) : '';
    const resolved = resolveTag(token);

    if (resolved) {
      metadata.push({ idx: i, rawLine: line, kind: 'tagged', tag: resolved.canonical,
        content, wasTypo: resolved.wasTypo, originalToken: resolved.wasTypo ? token : null });
    } else {
      metadata.push({ idx: i, rawLine: line, kind: 'untagged', tag: null,
        content: line, wasTypo: false, originalToken: null });
    }
  }
  return metadata;
}

/**
 * Emulates Array.prototype.includes() or String.prototype.includes()
 * using the image's brute-force sliding text algorithm.
 * * @param {string|Array} target - The item or array we are searching within.
 * @param {string} pattern - The string value we are looking for.
 * @returns {boolean} true if found, false otherwise.
 */
function bruteForceStringMatch(target, pattern) {
  // Case A: If target is an Array (like VALID_TAGS), check each element
  if (Array.isArray(target)) {
    for (let k = 0; k < target.length; k++) {
      if (bruteForceStringMatch(target[k], pattern) && target[k].length === pattern.length) {
        return true;
      }
    }
    return false;
  }

  // Case B: Standard single-string matching
  const T = String(target);
  const P = String(pattern);
  const n = T.length;
  const m = P.length;

  if (m > n) return false; // mas mahaba pattern than the text

  // for i ← 0 to n - m do
  for (let i = 0; i <= n - m; i++) {
    let j = 0; // j ← 0

    // while j < m and P[j] = T[i + j] do
    while (j < m && P[j] === T[i + j]) {
      j = j + 1; // j ← j + 1
    }

    // if j = m
    if (j === m) {
      return true; // Match found!
    }
  }

  return false; // no match found
}


function resolveTag(token) {
  const lower = token.toLowerCase();

  if (bruteForceStringMatch(VALID_TAGS, lower))  return { canonical: lower, wasTypo: false };
  if (TYPO_MAP[lower])                            return { canonical: TYPO_MAP[lower], wasTypo: true };

  const inputVec = stringToVector(lower);
  const result = nearestTag(inputVec, VALID_TAGS);

  const avgLen = (lower.length + result.nearestTag.length) / 2;
  const threshold = avgLen *0.6;

  if (result.minDist <= threshold) {
    return { canonical: result.nearestTag, wasTypo: true };
  }

  return null;
}

function stringToVector(str) {
  const lowerStr = str.toLowerCase(); 
  let sumX = 0;
  let sumY = 0;

  for (let i = 0; i < lowerStr.length; i++) {
    const char = lowerStr[i];
    const coord = QWERTY_COORDINATES[char];
    if (coord !== undefined) {
      sumX += coord[0];
      sumY += coord[1];
    } else {
      sumX += 4;
      sumY += 8;
    }
  }

  return { x: sumX, y: sumY };
}

function euclideanDistance(p1, p2) {
  const dx = p1.x - p2.x;
  const dy = p1.y - p2.y;
  return Math.sqrt(dx * dx + dy * dy); // the distance formula
}

// helper (inspo from closest pair)
function nearestTag(inputVec, validTags) {
  let minDist = Infinity;
  let nearestTag = null;

  for (let i = 0; i < validTags.length; i++) {
    const dist = euclideanDistance(inputVec, stringToVector(validTags[i]));
    if (dist < minDist) {
      minDist = dist;
      nearestTag = validTags[i];
    }
  }

  return { minDist, nearestTag };
}

/**
 * STAGE 2 — METADATA-DRIVEN CATEGORIZATION
 * Reads the `kind`/`tag` metadata Stage 1 already attached to each
 * line and routes it directly into its category bucket.
 */
function categorizeLines(metadata) {
  const buckets = { acad: [], org: [], action: [], untagged: [] };

  for (const item of metadata) {
    if (item.kind === 'action') {
      buckets.action.push({ assignee: item.assignee, task: item.task, idx: item.idx, rawLine: item.rawLine });
      continue;
    }
    if (item.kind === 'tagged') {
      const key = item.tag === '#acad' ? 'acad' : 'org';
      buckets[key].push({ content: item.content, tag: item.tag, wasTypo: item.wasTypo,
        originalToken: item.originalToken, idx: item.idx, rawLine: item.rawLine });
      continue;
    }
    buckets.untagged.push({ content: item.content, idx: item.idx, rawLine: item.rawLine });
  }
  return buckets;
}

/**
 * parseLines() — runs the two-stage pipeline and returns
 * { acad, org, action, untagged } used by renderOutput,
 * buildScoredLines, and loadArchiveView in script.js.
 */
function parseLines(raw) {
  const metadata = scanLineMetadata(raw);
  return categorizeLines(metadata);
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
// FEATURE 2 — GREEDY HEURISTIC KNAPSACK
// Input: scored[] array from script.js → buildScoredLines(raw),
//        capacity (char budget integer) from script.js → runFitForChat()
// ============================================================

/**
 * GREEDY HEURISTIC KNAPSACK
 *
 * Algorithm: Greedy Approximation Algorithm
 * - Sorts items by value/weight ratio (descending)
 * - Greedily adds items with highest v/m ratio as long as capacity permits
 * - Trades optimality for speed; O(n log n) time
 */

function greedyHeuristic(items, capacity) {
  if (items.length === 0) return new Set();

  // Step 1: Calculate value/weight ratio for each item
  const ratios = items.map((item, idx) => ({
    idx,
    ratio: item.value / item.weight,
    value: item.value,
    weight: item.weight
  }));

  // Step 2: Sort by ratio descending (highest v/m first)
  ratios.sort((a, b) => b.ratio - a.ratio);

  // Step 3: Greedily add items in ratio order
  const included = new Set();
  let usedCapacity = 0;

  for (const item of ratios) {
    if (usedCapacity + item.weight <= capacity) {
      included.add(item.idx);
      usedCapacity += item.weight;
    }
  }

  return included;
}

// ============================================================
// FEATURE 3 — HASHING (Archive Search)
// Input: meetings[] array from script.js → getStoredMeetings() (localStorage)
//        query string from script.js → searchArchive(query) (search input value)
// ============================================================

class HashTable {
  constructor(size = 1009) {
    this.tableSize = size;
    // The internal textbook array
    this.table = new Array(size).fill(null);
  }

  // Hash Function: h(x) = x mod tableSize
  _hash(word) {
    let charSum = 0;
    for (let i = 0; i < word.length; i++) {
      charSum += word.charCodeAt(i);
    }
    return charSum % this.tableSize;
  }

  // Insertion with Linear Probing
  insert(word, meetingData) {
    let index = this._hash(word);
    const originalIndex = index;

    while (this.table[index] !== null && this.table[index].key !== word) {
      index = (index + 1) % this.tableSize;
      if (index === originalIndex) {
        throw new Error("Hash table is completely full!");
      }
    }

    if (this.table[index] === null) {
      this.table[index] = { key: word, values: [] };
    }

    this.table[index].values.push(meetingData);
  }

  // NEW METHOD: Converts the internal fixed array back into a standard JS Object
  toPlainObject() {
    const plainObject = {};
    
    for (let i = 0; i < this.tableSize; i++) {
      const slot = this.table[i];
      // If the slot contains textbook-hashed data, extract it to the output object
      if (slot !== null) {
        plainObject[slot.key] = slot.values;
      }
    }
    
    return plainObject;
  }
}

// Your updated build function matching the exact input/output data types
function buildHashIndex(meetings) {
  const hashTable = new HashTable(1009); 

  meetings.forEach(m => {
    const words = (m.rawText + ' ' + m.title).toLowerCase().match(/\b\w{3,}\b/g) || [];
    
    [...new Set(words)].forEach(w => {
      hashTable.insert(w, { id: m.id, title: m.title, date: m.date });
    });
  });

  // Returns the exact standard object data type your original function did:
  // { "project": [{id: 1, title: ...}], "meeting": [...] }
  return hashTable.toPlainObject();
}

// ============================================================
// FEATURE 4 — SEQUENTIAL SEARCH (Name Autocomplete)
// Input: roster[] array (global, managed by script.js → loadRoster/saveRoster)
//        prefix string from script.js → handleAutocomplete(ta),
//        extracted from the textarea's @-mention at cursor position
// ============================================================

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
// FEATURE 5 — INSERTION SORT (Follow-Up Queue)
// Input: newItem object from script.js → saveMeeting(),
//        sourced from _pendingDeferred (deferred lines set by
//        copyFitSelection); queue is read/written via
//        getFollowUpQueue() / saveFollowUpQueue() in script.js
// ============================================================

/**
 * Insertion Sort step: walk backwards through the sorted queue,
 * shifting items with lower value right, then insert at the gap.
 * Queue stays sorted descending by value after every call.
 */
function insertIntoFollowUp(newItem) {
  const queue = getFollowUpQueue();
  queue.push(newItem);          // place new item at the end, like A[n-1]
  let i = queue.length - 2;     // i <- j - 1
  const key = queue[queue.length - 1];

  while (i >= 0 && queue[i].value < key.value) {
    queue[i + 1] = queue[i];    // A[i+1] <- A[i]  (manual shift, not splice)
    i--;
  }
  queue[i + 1] = key;           // A[i+1] <- key

  saveFollowUpQueue(queue);
}
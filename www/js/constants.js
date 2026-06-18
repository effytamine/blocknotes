/**
 * BlockNotes — constants.js
 *
 * All read-only constants and derived lookup tables.
 * Consumed directly by algorithms.js and script.js via global scope (no import/export).
 */

// ============================================================
// TAG DEFINITIONS
// ============================================================

const VALID_TAGS = ['#acad', '#org'];

const TAG_CORRECTIONS = {
  '#acad': ['#acad', '#acd', '#adc', '#cad', '#aacd', '#acdd'],
  '#org':  ['#org', '#og', '#rg', '#orgg', '#orr', '#ogr']
};

// Flattened typo → canonical lookup built from TAG_CORRECTIONS
const TYPO_MAP = {};
for (const [canonical, variants] of Object.entries(TAG_CORRECTIONS)) {
  for (const v of variants) {
    if (!TYPO_MAP[v]) TYPO_MAP[v] = canonical;
  }
}

// ============================================================
// SCORING TABLES — READ ONLY, displayed in info window
// ============================================================

// Built-in urgency signals (page 1 of scoring info window)
const URGENCY_SIGNALS = [
  { words: ['today', 'tonight', 'now'],                       pts: 5 },
  { words: ['tomorrow'],                                      pts: 4 },
  { words: ['deadline', 'due', 'submit', 'urgent', 'asap'],  pts: 4 },
  { words: ['exam', 'quiz', 'test', 'finals', 'prelim'],     pts: 3 },
  { words: ['monday','tuesday','wednesday','thursday',
            'friday','saturday','sunday'],                    pts: 3 },
  { words: ['date number (e.g. 15th, 3rd)'],                 pts: 2, isPattern: true },
];

// Tag base points (page 2 of scoring info window)
const TAG_BASE_POINTS = [
  { label: '[A] Action item',  pts: 5, note: '+2 acad base +3 action bonus' },
  { label: '#acad line',       pts: 2, note: 'base points' },
  { label: '#org line',        pts: 1, note: 'base points' },
  { label: 'Untagged line',    pts: 0, note: 'no base points' },
];

// for typo correction
const QWERTY_COORDINATES = {
  // Row 0: 10 keys, no offset
  'q': [0, 0], 'w': [1, 0], 'e': [2, 0], 'r': [3, 0], 't': [4, 0],
  'y': [5, 0], 'u': [6, 0], 'i': [7, 0], 'o': [8, 0], 'p': [9, 0],

  // Row 1: 9 keys, centered (+0.5 offset)
  'a': [0.5, 1], 's': [1.5, 1], 'd': [2.5, 1], 'f': [3.5, 1], 'g': [4.5, 1],
  'h': [5.5, 1], 'j': [6.5, 1], 'k': [7.5, 1], 'l': [8.5, 1],

  // Row 2: 7 keys, centered (+1.5 offset)
  'z': [1.5, 2], 'x': [2.5, 2], 'c': [3.5, 2], 'v': [4.5, 2],
  'b': [5.5, 2], 'n': [6.5, 2], 'm': [7.5, 2],

  // Symbols: separate page entirely, high Y penalty
  '#': [0, 8], '@': [1, 8], '!': [2, 8], '?': [3, 8],
  '.': [4, 8], ',': [5, 8], '-': [6, 8], '_': [7, 8],
};
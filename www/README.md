# BlockNotes — Modular Architecture

## File Structure

```
www/
├── index.html                      # HTML entry point (imports all JS files)
├── style.css                       # Styling (dark/light theme)
│
├── constants.js                    # Shared constants
├── utils.js                        # Common utilities & helpers
├── main.js                         # App initialization & event setup
├── ui.js                           # UI controllers (theme, layout, views, scoring info)
│
├── feature1-bucket-sort.js         # Feature 1: Real-Time Bucket Sorting (Presorting)
├── feature2-action-items.js        # Feature 2: Action Item Extraction (Brute-Force String Matching)
├── feature3-autocomplete.js        # Feature 3: Smart Name Autocomplete (Sequential Search)
├── feature4-typo-correction.js     # Feature 4: Typo Correction (Closest Pair Brute Force)
├── feature5-archive-search.js      # Feature 5: Archive Search (Hashing)
├── feature6-greedy-knapsack.js     # Feature 6: Fit for Chat (Greedy Approximation)
├── feature7-insertion-sort.js      # Feature 7: Follow-Up Queue (Insertion Sort)
│
└── README.md                       # This file
```

## Import Order (Critical)

In `index.html`, scripts must be imported in this order:

1. **constants.js** — Define all global constants
2. **utils.js** — Utility functions (depends on constants)
3. **feature1-bucket-sort.js** — Bucket sorting (no feature dependencies)
4. **feature2-action-items.js** — Action items (no feature dependencies)
5. **feature3-autocomplete.js** — Autocomplete (uses loadRoster, saveRoster, etc.)
6. **feature4-typo-correction.js** — Typo correction (depends on VALID_TAGS, TYPO_MAP from constants)
7. **feature5-archive-search.js** — Archive (uses getStoredMeetings, getFollowUpQueue from utils)
8. **feature6-greedy-knapsack.js** — Greedy knapsack (depends on features 1-2, parseLines, isActionItem, getCustomSignals)
9. **feature7-insertion-sort.js** — Insertion sort (uses getFollowUpQueue, saveFollowUpQueue)
10. **ui.js** — UI controllers (depends on all features, utils)
11. **main.js** — Initialization (depends on everything)

## Dependencies Diagram

```
constants.js
    ↓
utils.js ← (depends on constants)
    ↓
feature1-bucket-sort.js ← (depends on constants)
    ↓
feature2-action-items.js ← (depends on nothing)
    ↓
feature3-autocomplete.js ← (depends on utils)
    ↓
feature4-typo-correction.js ← (depends on constants)
    ↓
feature5-archive-search.js ← (depends on utils)
    ↓
feature6-greedy-knapsack.js ← (depends on features 1-2, utils, constants)
    ↓
feature7-insertion-sort.js ← (depends on utils)
    ↓
ui.js ← (depends on everything above)
    ↓
main.js ← (depends on everything)
```

## Feature Descriptions

### Feature 1: Bucket Sorting
- **Algorithm:** Presorting (Transform & Conquer) — O(n)
- **File:** `feature1-bucket-sort.js`
- **Functions:**
  - `parseLines(raw)` — Parse raw text into buckets
  - `renderOutput()` — Render organized view
  - `buildCategoryBlock(label, items, tag)` — Build category section
  - `buildActionBlock(items)` — Build action items section

### Feature 2: Action Item Extraction
- **Algorithm:** Brute-Force String Matching — O(n·m)
- **File:** `feature2-action-items.js`
- **Functions:**
  - `isActionItem(line)` — Detect `[A]` prefix
  - `parseActionItem(line)` — Extract assignee and task

### Feature 3: Name Autocomplete
- **Algorithm:** Sequential Search — O(n)
- **File:** `feature3-autocomplete.js`
- **Functions:**
  - `searchRoster(prefix)` — Find matching names
  - `renderAutocomplete(matches, atIdx, prefix)` — Show dropdown
  - `applyAutocomplete(name, atIdx, prefixLen)` — Apply selection
  - `highlightMentions()` — Highlight mentions in output
  - `loadRoster()` / `saveRoster()` — Manage roster storage
  - `handleRosterFile(event)` — Import roster from file

### Feature 4: Typo Correction
- **Algorithm:** Closest Pair Brute Force — O(n²)
- **File:** `feature4-typo-correction.js`
- **Functions:**
  - `stringToVector(str)` — Convert string to 2D point
  - `euclideanDistance(p1, p2)` — Calculate distance
  - `closestPairBruteForce(points, labels)` — Find closest pair
  - `resolveTag(token)` — Resolve tag typos

### Feature 5: Archive Search
- **Algorithm:** Hashing — O(1) lookup
- **File:** `feature5-archive-search.js`
- **Functions:**
  - `buildHashIndex(meetings)` — Build word→meetings map
  - `searchArchive(keyword)` — Search and display results
  - `getSnippets(text, keyword)` — Extract highlighted snippets
  - `loadArchiveView()` — Display saved meetings
  - `loadMeeting(id)` / `deleteMeeting(id)` — Manage archive

### Feature 6: Greedy Knapsack
- **Algorithm:** Greedy Approximation — O(n log n)
- **File:** `feature6-greedy-knapsack.js`
- **Functions:**
  - `scoreLineUrgency(item)` — Calculate urgency score
  - `buildScoredLines(raw)` — Create scored items
  - `greedyKnapsack(items, capacity)` — Select high-value subset
  - `runFitForChat()` — Execute fit algorithm
  - `renderFitLines()` / `copyFitSelection()` — UI & export

### Feature 7: Insertion Sort
- **Algorithm:** Insertion Sort — O(n) per insert
- **File:** `feature7-insertion-sort.js`
- **Functions:**
  - `insertIntoFollowUp(newItem)` — Insert and maintain sorted order
  - `renderFollowUp()` — Display follow-up queue
  - `postSelectedFollowUp()` — Post and remove selected items

## Global Variables

**Feature State:**
- `_fitActive` — Is fit mode active
- `_allScoredLines` — Current scored lines in fit mode
- `_checkedState` — Map of checked indices in fit mode
- `_knapCache` — Cache for knapsack results
- `_rosterChanged` — Has roster been modified
- `_followupChecked` — Set of checked indices in follow-up
- `_scoringPage` — Current page in scoring info window
- `_currentTheme` — Dark/light theme
- `_currentLayout` — Vertical/horizontal layout

**Global Data:**
- `window._pendingDeferred` — Lines to be added to follow-up on save

## localStorage Keys

- `bn_draft` — Current editor content
- `bn_title` — Current meeting title
- `bn_date` — Current meeting date
- `bn_roster` — List of block member names
- `bn_meetings` — Array of saved meetings
- `bn_followup` — Array of deferred follow-up items
- `bn_custom_signals` — Array of custom urgency words
- `bn_theme` — User's theme preference (dark/light)

## How to Run

1. Ensure all files are in the same directory (`www/`)
2. Open `index.html` in a modern browser
3. No server required — all data stored locally in browser

## Architecture Notes

- **Modular:** Each feature is independent and self-contained
- **No circular dependencies:** Features import utils/constants only
- **Lazy evaluation:** Features initialized only when used
- **localStorage:** Persists all data client-side
- **No external frameworks:** Pure vanilla JS, HTML5, CSS3
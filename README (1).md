# BlockNotes — Class Block Meeting Minute Organizer

A lightweight, algorithm-driven web application for university block secretaries to instantly organize chaotic meeting notes into clean, categorized minutes.

---

## Files

- **index.html** — Full application shell with all UI elements
- **script.js** — Complete logic with 7 features implemented using 7 distinct algorithms
- **style.css** — Dark utilitarian design with color-coded categories
- **FEATURES_AND_TESTING.md** — Comprehensive breakdown of all features, algorithms, and exact test sequence

---

## How to Use

1. Open `index.html` directly in Chrome, Firefox, or Safari (no server needed)
2. All data persists in browser localStorage
3. See **FEATURES_AND_TESTING.md** for step-by-step walkthrough

---

## Features & Algorithms

| # | Feature | Algorithm | Problem Solved |
|---|---------|-----------|----------------|
| 1 | Real-Time Bucket Sorting | Presorting (Transform & Conquer) | Organize chaotic typed notes into categories instantly |
| 2 | Action Item Extraction | Brute-Force String Matching | Find and separate task assignments (`[A]`) automatically |
| 3 | Name Autocomplete | Sequential Search (Brute Force) | Complete classmate names without typing full name |
| 4 | Typo Correction | Levenshtein Edit Distance (Heuristics) | Auto-fix tag typos like `#acd` → `#acad` |
| 5 | Archive Search | Hashing (Space & Time Trade-offs) | Search old meetings by keyword in O(1) |
| 6 | Fit for Chat | Backtracking Knapsack (Decrease & Conquer) | Select highest-urgency lines within character budget |
| 7 | Follow-Up Queue | Insertion Sort (Decrease & Conquer) | Keep deferred announcements sorted by urgency |

---

## Quick Start

**Paste this test input into the Raw Input textarea:**

```
#acad Final exam tomorrow morning URGENT bring bluebooks
#org We need to pick a party theme this week Friday meeting
[A] Maria Santos: Collect 150 pesos from everyone by today
#acd Professor said quiz on Monday next week
#org Shirt order deadline is TODAY we need sizes
#org Decoration supplies budget is still unconfirmed
[A] Juan dela Cruz: Reserve the venue by Wednesday afternoon
#acad Submit assignment by 15th absolutely deadline
#org We should vote on the theme at next meeting
Bring yellow paper for tomorrow lab
#org Intramurals sign-up form is live now
#acad Study group meets Tuesday night if interested
[A] Ana Reyes: Make the poster for the party
#org Catering for the event costs 500 pesos total
#acd Exam is Friday morning first period
```

Then follow **11 exact test steps** in `FEATURES_AND_TESTING.md` to verify all features.

---

## Key Features in Action

**Tag Shortcuts:** Use `#acad` (academics), `#org` (org events), `[A] Name: task` (action items)

**Typo Tolerance:** `#acd` auto-corrects to `#acad` (edit distance ≤ 2)

**Smart Mentions:** Type `@` to autocomplete roster names; only roster names highlight in output

**Fit for Chat:** Adjust character budget, click ⚡ Run, knapsack selects highest-urgency lines. Unchecked lines become deferred.

**Scoring Transparency:** Click ℹ️ to see urgency signal words, tag points, and your custom words

**Follow-Up Queue:** Deferred items stay sorted by urgency using insertion sort

**Archive Search:** Type a keyword — instantly find all old meetings containing it

---

## No Dependencies

- Pure HTML5, CSS3, JavaScript
- No npm, no build step, no server
- All data stored locally in browser (localStorage)
- Fonts loaded from Google Fonts CDN

---

## Algorithm Implementations

All algorithms are implemented from first principles (no libraries):

- **Levenshtein Edit Distance:** O(m·n) DP matrix for typo detection
- **Backtracking Knapsack:** 2^n branch exploration with value-based pruning
- **Insertion Sort:** Live incremental sorting of follow-up queue
- **Sequential Search:** O(n) roster prefix matching for autocomplete
- **Hashing:** O(1) word → meetings lookup for archive search
- **Bucket Sort:** Transform & Conquer presorting by category tag
- **Brute-Force String Matching:** Character-by-character `[A]` detection

---

## Storage

All data persists via browser localStorage:
- Draft notes (auto-saved on every keystroke)
- Saved meetings with raw text and metadata
- Follow-up queue (sorted by urgency)
- Block roster (student names)
- Custom urgency words (user-defined scoring)

Close and reopen the browser — everything is still there.

---

## For a Proposal/Report

**See FEATURES_AND_TESTING.md** for:
- Line-by-line implementation details citing exact code locations
- No ambiguity breakdown of each algorithm
- Complete test sequence with visual verification steps
- Summary table showing algorithm coverage

---

## Questions?

All logic is in `script.js`. All UI is in `index.html`. All styling is in `style.css`. The code is clean, commented, and directly implements the named algorithms without abstractions.


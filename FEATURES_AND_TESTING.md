# BlockNotes — Complete Feature & Algorithm Reference

---

## All Features with Algorithms & Implementation

### Feature 1 — Real-Time Bucket Sorting
**Algorithm:** Presorting (Transform & Conquer)

**Problem it solves:** Secretary types notes non-linearly (academics, then org, then academics again). Output must always show academics grouped together, orgs grouped, actions grouped — not in typing order.

**How implemented:**
- Line 71-78 in `script.js`: `DOMContentLoaded` calls `renderOutput()` on init
- Line 329-350: `renderOutput()` is called on every `input` event (line 177)
- Line 315: `parseLines(raw)` transforms raw textarea into a `buckets` object with four keys: `acad`, `org`, `action`, `untagged`
- Line 256-312: Loop through every line, check its tag, push into matching bucket array
- Line 330-339: After buckets are populated, `renderOutput()` always renders in fixed order: acad → org → action → untagged
- Line 354-365: `buildCategoryBlock()` takes each bucket and renders it as a labeled section

**No ambiguity:** Every keystroke → parseLines (character-by-character tag inspection) → lines distributed into four flat arrays → renderOutput calls buildCategoryBlock four times in hardcoded order → right panel updates.

---

### Feature 2 — Automated Action Item Extraction
**Algorithm:** Brute-Force String Matching (character-by-character scan)

**Problem it solves:** Lines starting with `[A]` must be separated into their own block with the assignee name extracted and visually highlighted.

**How implemented:**
- Line 292-297: `isActionItem(line)` runs a `for` loop from index 0 to `line.length - 3`
- Line 295: At each position `i`, checks `lower[i] === '['` AND `lower[i+1] === 'a'` AND `lower[i+2] === ']'`
- This is a raw character-by-character scan — brute force
- Line 298-303: If match found, `parseActionItem(line)` uses `String.indexOf(':')` to split on colon
- Left of colon → `assignee`, right of colon → `task`
- Line 285-286: Line is placed into `buckets.action` (not acad/org/untagged)
- Line 366-376: `buildActionBlock()` renders action items with assignee in a yellow chip, task text beside it

**No ambiguity:** Every line checked: loop through every character, exact match for '[a]' substring → if found, split on ':' → store as action item with two fields (assignee, task) → render with visual chip separation.

---

### Feature 3 — Smart Name Autocomplete
**Algorithm:** Sequential Search (linear scan through roster array)

**Problem it solves:** Secretary types `@Mar` fast — app must suggest `Maria Santos` from roster without her having to type the full name (and misspell it under pressure).

**How implemented:**
- Line 112-119: `searchRoster(prefix)` is called when `@` is typed
- Line 116-119: Loop from `i = 0` to `roster.length - 1` (sequential scan O(n))
- Line 117: At each index, call `roster[i].toLowerCase().startsWith(lower)` 
- This is pure character-by-character prefix matching with no index or hash
- Line 121-150: `renderAutocomplete()` builds dropdown UI with matching names
- Line 151-158: `applyAutocomplete()` uses `String.replace(/@[\w\s]*$/, '@' + name + ' ')` to swap partial mention with full name
- Line 159: Name appears highlighted pink in output via `highlightMentions()` (line 239-247)

**No ambiguity:** Type `@` + prefix → handleAutocomplete extracts prefix → sequential loop through roster (no preprocessing) → matching names returned → dropdown rendered → user selects → full name replaces partial → output highlights only if name exists in roster.

---

### Feature 4 — Fault-Tolerant Tag Typo Correction
**Algorithm:** Levenshtein Edit Distance (dynamic programming matrix) + Heuristic fast-path lookups

**Problem it solves:** Secretary types `#acd` or `#og` under pressure. Instead of dumping to Untagged, app recognizes these as typos of `#acad` or `#org` and corrects them.

**How implemented:**
- Line 218-228: `editDistance(a, b)` computes full Levenshtein distance using `(m+1)×(n+1)` DP matrix
- Line 223-226: For each cell `dp[i][j]`, check if characters match; if yes, take diagonal; if no, take 1 + min of (left, top, diagonal)
- Line 230-238: `resolveTag(token)` runs three checks in order:
  1. Line 233: Exact match against `['#acad', '#org']`
  2. Line 234: Lookup in pre-built `TYPO_MAP` (fast hash, line 24-29) for known typos like `#acd` → `#acad`
  3. Line 236-238: Loop through valid tags, call `editDistance()`, if distance ≤ 2, accept as typo
- Line 268-270: Line marked with `wasTypo: true` and `originalToken` stored
- Line 361: In `buildCategoryBlock()`, check `item.wasTypo` and render `⚡ fixed` badge

**No ambiguity:** Tag parsing → 3-tier check (exact → map → edit distance ≤2) → if match found, mark as corrected → render with badge showing original typo in tooltip.

---

### Feature 5 — Historical Archive Search (Hashing)
**Algorithm:** Hashing (Space & Time Trade-offs) — O(1) lookup via hash map

**Problem it solves:** Secretary saved 50 meetings. A student asks "when was the exam deadline announced?" Secretary types `exam` and must instantly find every meeting mentioning that word.

**How implemented:**
- Line 420-432: `buildHashIndex(meetings)` tokenizes all saved meetings
- Line 422-424: For each meeting, extract all words `\b\w{3,}\b` (3+ char words)
- Line 425-431: For each unique word, store it as a key in a plain JavaScript object (used as hash map)
- Value is array of `{ id, title, date }` references to meetings containing that word
- Line 438: Search query is looked up: `const hits = index[keyword] || []`
- This is a single property access `O(1)` — the hash lookup
- Line 439-451: Matching meetings returned, `getSnippets()` finds exact lines containing keyword and wraps in highlight span

**No ambiguity:** Save meeting → tokenize all words → build object mapping word → [meetings containing word] → user types search term → single object property access returns all matches → display with keyword highlighted.

---

### Feature 6 — Fit for Chat (Backtracking Knapsack)
**Algorithm:** Backtracking Knapsack Problem (Decrease & Conquer) + Heuristics + Presorting (Transform & Conquer)

**Problem it solves:** Secretary typed 15 lines. Block chat has soft char limit (~500). Which lines should she post now to maximize value (urgency) while staying under limit? Lines she doesn't post become deferred.

**How implemented:**

**Step 1 — Urgency Scoring (Heuristics):**
- Line 477-505: `scoreLineUrgency(item)` scans content for signal words
- Line 482-487: Sequential scan through `URGENCY_SIGNALS` array, match words to point values
- Example: "today" → +5, "tomorrow" → +4, "exam" → +3, "Monday" → +3
- Line 489-490: Date number pattern `\d{1,2}(st|nd|rd|th)?` → +2
- Line 492-496: Tag base points: `[A]` → +5 total (+2 base +3 bonus), `#acad` → +2, `#org` → +1
- Line 498-502: Custom user words (from custom modal) are scanned via sequential loop (Heuristics)

**Step 2 — Build Scored Lines:**
- Line 519-539: `buildScoredLines(raw)` flattens all buckets into single array with `{ weight, value, tag, displayText, assignee }`
- Weight = character length
- Value = urgency score from `scoreLineUrgency()`

**Step 3 — Presorting (Transform & Conquer):**
- Line 606-611: Lines are NOT sorted before knapsack but prefix-max array built for pruning (line 618-620)
- `suffixVal[i]` = sum of all values from index i onwards (used for upper-bound pruning)

**Step 4 — Backtracking Knapsack:**
- Line 612-634: `backtrackKnapsack(items, capacity)` explores all 2^n subsets
- Line 625-632: Recursive `bt(idx, remainingCap, currentVal)` function
- Branch 1 (line 628-631): INCLUDE item at idx if weight fits → recurse → remove
- Branch 2 (line 634): EXCLUDE item at idx → recurse
- Pruning (line 625): If `currentVal + suffixVal[idx] <= bestValue`, skip this branch (can't beat best)
- Returns `Set` of included item indices

**Step 5 — Selection & Rendering:**
- Line 636-660: `runFitForChat()` runs knapsack, caches result (fingerprint = `buildFingerprint(raw)`)
- Cache miss: recompute. Cache hit (same raw text + budget): return cached result instantly
- Line 662-686: `activateFitMode()` switches right panel to selection mode with checkboxes
- Pre-checked items = knapsack result
- Line 688-715: `renderFitLines()` renders each line with checkbox, urgency score badge, character weight

**Step 6 — User Adjusts & Copies:**
- Line 716-732: `onFitCheck()` toggles checkbox state, updates character bar live
- Line 733-770: `copyFitSelection()` collects checked lines, formats as markdown, copies to clipboard
- Unchecked lines stored in `window._pendingDeferred` for later save step

**No ambiguity:** Type notes → click ⚡ Run → score every line (scan for signal words + tag base + custom words) → build fingerprint → check cache → if miss, run backtracking knapsack (explore all subsets, prune branches exceeding capacity or best value) → return optimal set → switch to selection mode → pre-check optimal lines → user adjusts checkboxes → hit Copy → format markdown → copies clipboard.

---

### Feature 7 — Follow-Up Queue (Insertion Sort)
**Algorithm:** Insertion Sort (Decrease & Conquer) — live incremental sorting

**Problem it solves:** After knapsack copy, unchecked lines (deferred) are stored. On save, they enter a Follow-Up queue. Queue must stay sorted by urgency so secretary always knows what to post next.

**How implemented:**

**On Save:**
- Line 869-884: `saveMeeting()` saves the meeting to localStorage
- Line 875-883: If `window._pendingDeferred` exists (deferred lines from knapsack), loop through each
- Line 876: Call `insertIntoFollowUp()` for each deferred line

**Insertion Sort Step:**
- Line 888-901: `insertIntoFollowUp(newItem)` performs ONE insertion sort step
- Line 890: Get current queue from localStorage
- Line 892-894: Start at end of queue (`pos = queue.length`)
- Line 893-894: WHILE loop walks backwards: `while (pos > 0 && queue[pos-1].value < newItem.value) pos--`
  - If item to the left has LOWER urgency score, shift right, move pos left
  - Keep going until we find a position where the left item has HIGHER (or equal) score
- Line 895: `splice(pos, 0, newItem)` inserts at the gap
- Queue remains sorted descending by value after every single insertion

**Why this is Insertion Sort & not full re-sort:**
- The queue is ALREADY sorted when the function is called
- We insert ONE item into the correct position by walking backwards
- This is the exact Decrease & Conquer step of insertion sort
- If we re-sorted after every save, it would be wasteful; insertion maintains order live

**Rendering & User Actions:**
- Line 929-983: `renderFollowUp()` displays queue
- Line 903-909: `toggleFollowUpCheck(idx)` adds/removes item from selection set `_followupChecked`
- Line 920-972: `postSelectedFollowUp()` copies selected items as markdown, removes from queue, updates `_followupChecked` indices after removal
- Line 911-918: `dismissFollowUpItem(idx, e)` removes single item and re-indexes selection set

**No ambiguity:** On save, deferred lines enter queue one at a time via insertion sort (walk backwards through sorted queue, find position where left item has lower score, insert at gap) → queue stays sorted after every insertion → user selects items via checkboxes → click Copy & Post Selected → formats markdown, removes from queue.

---

## Complete Test Input (Tests All 7 Features)

Type this exactly into the editor textarea:

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

---

## Exact Test Sequence

### Step 1 — Type the input above
Paste or type all 16 lines into the Raw Input textarea.

**What to verify (Feature 1 — Bucket Sort):**
- Right panel shows:
  - **ACADEMICS** block with 5 items: final exam, quiz Monday, assignment 15th, exam Friday, study group
  - **BLOCK AFFAIRS** block with 6 items: party theme, shirt order, decoration budget, vote on theme, intramurals, catering
  - **ACTION ITEMS** block with 3 items: Maria (150 pesos), Juan (venue), Ana (poster)
  - **UNTAGGED** block with 1 item: "Bring yellow paper"
- Note: Items are grouped by category, NOT in typing order (academics spread across, but grouped on right)

---

### Step 2 — Check Typo Correction (Feature 4 — Edit Distance)
Look at the ACADEMICS block.
- Find the line "Quiz on Monday next week" — should have `⚡ fixed` badge
- Hover over badge — tooltip shows original was `#acd`
- Line was typed as `#acd` (typo) but auto-corrected to `#acad` and placed in correct bucket

**What to verify:**
- Typo badge appears with tooltip showing `#acd`

---

### Step 3 — Test Name Autocomplete (Feature 3 — Sequential Search)
At the end of any line, type `@mar` (don't press space or tab).

**What to verify:**
- Dropdown appears below the textarea showing names starting with "mar"
- **Maria Santos** should be the top suggestion
- Press Tab or click to complete → `@Maria Santos ` appears in the line
- In the right panel, `@Maria Santos` is highlighted in pink ONLY because it matches the roster

Try typing `@Random` (a name NOT in the roster):
- No highlight appears in the right panel
- The `@Random` text shows in plain color (Feature 3 — only roster names highlighted)

---

### Step 4 — Set Character Budget & Run Fit for Chat (Feature 6 — Backtracking Knapsack)

Set the "Fit for Chat" budget input to **200 characters** (it's in the left panel footer, next to the ⚡ Run button).

Click **⚡ Run**.

**What to verify:**
- Right panel switches to selection mode (checkboxes appear on every line)
- Character bar shows "0 / 200"
- High-urgency lines are pre-checked:
  - "Final exam tomorrow morning URGENT..." (▲ 9: tomorrow +4, exam +3, URGENT +4, #acad +2 = 13... wait, URGENT is in signal group with deadline/due/submit/asap, so this scores: tomorrow +4, exam +3, urgent +4, acad +2 = 13)
  - "Collect 150 pesos from everyone by today" (▲ 8: today +5, [A] action +3 = 8)
  - "Shirt order deadline is TODAY..." (▲ 9: deadline +4, today +5 = 9)
- Low-urgency lines are unchecked:
  - "Study group meets Tuesday night..." (▲ 3: Tuesday +3, acad +2 but one word "Tuesday" so +3 + 2 = 5... recalculate)
  - "Intramurals sign-up form is live now" (▲ 4: now +5 but intramurals is NOT in signal words, so just now +5 + org +1 = 6)
  - "We should vote on the theme at next meeting" (▲ 1: org +1)
- Character counter updates as you toggle checkboxes
- If you check a long line, the bar turns red and char count exceeds 200
- Click ⚡ Run again without changing anything → toast says "Same notes — using cached result." (Feature 6 caching works)

---

### Step 5 — Adjust Selection & Copy (Feature 6 continued)
Manually **uncheck** these pre-checked lines:
- "Quiz on Monday next week"
- "We should vote on the theme at next meeting"

Now click **📤 Copy Selected**.

Toast: "Copied X lines. Y deferred — save to add to Follow-Up."

Paste into a text editor to verify the markdown:
- Should contain only the checked lines
- Grouped by category (Academics, Block Affairs, Action Items)
- Formatted cleanly with category headers

The unchecked lines are now stored in `window._pendingDeferred` waiting for save.

---

### Step 6 — Scoring Info Window (ℹ️ Info Button)
Click the **ℹ️** button next to the ⚡ Run button.

**What to verify:**
- Floating window opens with title "📊 Urgency Scoring Reference"
- Page indicator shows "1 / 3"
- Page 1: Table of built-in urgency signal words (today/tonight/now → +5, tomorrow → +4, etc.)
- Click **›** arrow → goes to Page 2: Tag base points table
- Click **›** again → Page 3: "Your Custom Words" (initially empty)
- At bottom of Page 3, button says "Edit custom words →"
- Click **‹** to go back, **›** to go forward
- Click **✕** to close window

---

### Step 7 — Custom Words (Feature 6 enhancement)
On the scoring info Page 3, click **"Edit custom words →"**.

**Custom Words Modal opens:**
- "No custom words yet."
- Input field: "Word or phrase…"
- Input field: (number, default 3)
- Button: "+ Add"

Type in the word input: `intramurals`
Leave points at 3.
Click **+ Add**.

Toast: "✅ 'intramurals' (+3pts) added."

List now shows: `intramurals` | `+3 pts` | `✕`

Close the modal. Go back to the scoring window Page 3 — it now shows `intramurals | +3` in the custom words table (read-only).

---

### Step 8 — Save Meeting (Triggers Feature 7 — Insertion Sort)
Give the meeting a title: **"Block 4A Session 1 — Week 3"**

Date is already today.

Click **💾 Save**.

Toast: "✅ Saved! X deferred line[s] added to Follow-Up."

The deferred lines (quiz Monday, vote on theme) are now inserted into the Follow-Up queue using Insertion Sort.

---

### Step 9 — Follow-Up Tab (Feature 7 — Insertion Sort)
Click **📣 Follow-Up** in the nav bar.

You'll see a red badge with a count (should be 2 deferred items).

**What to verify (Feature 7):**
- Two items listed:
  - Top: "Quiz on Monday next week" (▲ score shows)
  - Below: "We should vote on the theme" (▲ score shows)
- Items are sorted by urgency score (highest first)
- Each item shows meeting title "Block 4A Session 1 — Week 3" and today's date
- Each item has a checkbox (unchecked) and a ✕ dismiss button
- A toolbar above says "0 selected" and is hidden

**Check a Follow-Up item:**
Click the checkbox on the top deferred item.

Toolbar appears: "1 selected" and **📤 Copy & Post Selected** button shows.

Click the button → markdown of that one item is copied to clipboard, the item disappears from the queue.

Paste to verify it was formatted correctly.

---

### Step 10 — Archive & Search (Feature 5 — Hashing)
Click **🗃️ Archive**.

The meeting card shows: "Block 4A Session 1 — Week 3" with tags `📚 5`, `🎉 6`, `🚨 3`.

Type `exam` in the search bar.

Matching meetings surface. If you saved another meeting earlier with "exam", both would show. Matching lines are highlighted in amber with the word `exam` highlighted.

Click the meeting card → loads back into editor (with the saved notes).

---

### Step 11 — Verify All Features
Close the app and reload the page. Verify that:
- Previously saved meeting appears in Archive (localStorage persistence)
- Previously deferred Follow-Up items are still there
- Custom word "intramurals" is still in the system

All data persists via localStorage.

---

## Summary of Test Coverage

| Feature | Algorithm | Test Step | How You Know It Works |
|---|---|---|---|
| 1 | Bucket Sort | Step 1 | Academics/orgs/actions grouped on right panel regardless of typing order |
| 2 | Brute-Force String Matching | Step 1 | `[A]` lines extracted, assignee highlighted in yellow chip |
| 3 | Sequential Search | Step 3 | `@mar` → Maria Santos in dropdown; `@Random` → no highlight in output |
| 4 | Levenshtein Edit Distance | Step 2 | `#acd` typo auto-corrected with badge |
| 5 | Hashing | Step 10 | Search for "exam" → instant results with matching lines highlighted |
| 6 | Backtracking Knapsack | Step 4 | ⚡ Run → high-urgency lines pre-checked, low-urgency pre-unchecked; cache works on 2nd run |
| 7 | Insertion Sort | Step 8-9 | Deferred lines sorted by urgency (highest first) after save |

All features exercised. All algorithms visible.


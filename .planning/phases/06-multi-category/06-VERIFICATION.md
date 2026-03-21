---
phase: 06-multi-category
verified: 2026-03-20T00:00:00Z
status: human_needed
score: 13/13 automated must-haves verified
re_verification: false
human_verification:
  - test: "Open http://localhost:5173 — confirm home screen shows 4 category cards (Women, Men, NBA, LoL) with distinct colors and 'Best: 0' on each"
    expected: "4 cards visible with correct emoji (👩👨🏀⚔️), names, accent colors, and Best: 0"
    why_human: "Visual rendering and CSS custom property (--card-accent) application cannot be verified by grep"
  - test: "Click '100 LoL Champions' → type 'Jinx' → verify it resolves to verified state without any Wikidata API calls visible in DevTools Network tab"
    expected: "Entry shows 'Jinx' as verified with description 'LoL Champion'; zero calls to wikidata.org in Network tab"
    why_human: "Runtime allowlist-only routing bypass requires network observation; fuzzy strict-mode matching behavior is runtime-only"
  - test: "Click '100 Famous Women' → type 'Marie Curie' → verify resolves via Wikidata (API call visible in Network tab)"
    expected: "Entry resolves to verified 'Marie Curie' with Wikidata description"
    why_human: "Wikidata pipeline end-to-end requires live network call"
  - test: "Play a Women game, verify 3 entries, press back (←) → confirm category selection screen reappears"
    expected: "Home screen shows 4 cards; Women card shows 'Best: 3'"
    why_human: "RESET_GAME → IDLE flow, high score update, and card re-render require visual confirmation"
  - test: "Refresh page after playing — confirm high scores persist and 4 cards still appear"
    expected: "Cards show the previously set best scores loaded from localStorage"
    why_human: "localStorage persistence across page loads requires browser runtime"
---

# Phase 6: Multi-Category Game Selection — Verification Report

**Phase Goal:** Expand the game beyond "100 Famous Women" to support multiple categories (e.g. famous men, athletes, musicians), each with their own allowlist and card on the selection screen.
**Verified:** 2026-03-20
**Status:** human_needed
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | A single config file is the only place to add a new category | VERIFIED | `src/config/categories.ts` exports `CATEGORIES` array with 4 entries; all other code reads from it |
| 2 | All four category allowlist JSON files exist so Vite build does not fail | VERIFIED | `allowlist-women.json` (1043 lines), `allowlist-lol.json` (1721 lines), `allowlist-men.json` (`[]`), `allowlist-nba.json` (`[]`) all exist in `src/data/` |
| 3 | CategoryConfig type enforces verificationStrategy and wikidataGender fields | VERIFIED | Interface in `categories.ts` has `verificationStrategy: VerificationStrategy` (required) and `wikidataGender?: string` (optional) |
| 4 | GameState carries selectedCategory so reducer can derive time limits and target count | VERIFIED | `GameState.selectedCategory: CategoryConfig` in `src/types/game.ts`; reducer uses `action.payload.category.timeLimitMs` in `START_GAME` case |
| 5 | NBA/LoL guesses skip Wikidata and go straight to local allowlist fuzzy match | VERIFIED | `wikidata.ts` line 61: `if (category.verificationStrategy === 'allowlist-only')` returns early before any axios calls |
| 6 | Women/Men guesses use Wikidata pipeline with gender derived from category config | VERIFIED | `wikidata.ts` line 150: `category.wikidataGender` used in place of hardcoded QID |
| 7 | Home screen shows 4 category cards instead of a single button | NEEDS HUMAN | `App.tsx` renders `<CategorySelectScreen categories={CATEGORIES} ...>` when `state.status === 'IDLE'`; visual output needs human confirmation |
| 8 | Each category's high score is tracked separately in localStorage | VERIFIED | App.tsx uses `game_highscore_${cat.id}` and `game_state_${state.selectedCategory.id}` keys throughout |
| 9 | The game counter shows X / targetCount (not hardcoded 100) | VERIFIED | `App.tsx` line 345: `<span>{verifiedCount}</span> / {state.selectedCategory.targetCount}` |
| 10 | Restarting shows the category selection screen | VERIFIED | `case 'RESET_GAME': return initialState` where `initialState.status = 'IDLE'`; IDLE branch renders `CategorySelectScreen` |
| 11 | Background queue calls WikidataService.search(name, selectedCategory) | VERIFIED | `App.tsx` line 264: `WikidataService.search(pendingEntry.inputName, state.selectedCategory)` |
| 12 | build-allowlist.js --category flag dispatches to per-category builders | VERIFIED | Script lines 541-558: `--category` arg parsed, `BUILDERS` map dispatches to `buildWomenAllowlist`, `buildMenAllowlist`, `buildNBAAllowlist`, `buildLoLAllowlist` |
| 13 | allowlist-lol.json is populated (LoL builder ran successfully) | VERIFIED | File has 172 champion entries (1721 lines); `d[0].name === 'Aatrox'` confirmed |

**Score:** 13/13 automated truths verified. 5 items require human runtime confirmation.

---

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/config/categories.ts` | CategoryConfig interface + CATEGORIES array (4 entries) | VERIFIED | Exports `CategoryConfig`, `VerificationStrategy`, `CATEGORIES` (4 entries: women/men/nba/lol) |
| `src/data/allowlist-women.json` | Full existing women allowlist data | VERIFIED | 1043 lines, non-empty |
| `src/data/allowlist-men.json` | Empty stub `[]` | VERIFIED | Empty array `[]` — stub, populated by build script |
| `src/data/allowlist-nba.json` | Empty stub `[]` | VERIFIED | Empty array `[]` — stub; NBA API requires VPN/updated headers |
| `src/data/allowlist-lol.json` | Populated from Riot Data Dragon | VERIFIED | 172 LoL champions present; builder ran successfully |
| `src/types/game.ts` | GameEntry, GameState with selectedCategory + entries, updated GameAction | VERIFIED | All present; `ADD_ENTRY_PENDING`, `START_GAME { category }` payload confirmed |
| `src/services/wikidata.ts` | Category-aware search(), ALLOWLISTS map, searchAllowlist(input, categoryId) | VERIFIED | ALLOWLISTS map lines 17-22, `search(input, category)` at line 59, `searchAllowlist(input, categoryId, strict)` at line 264 |
| `src/components/CategorySelectScreen.tsx` | Standalone IDLE-state component rendering category cards | VERIFIED | Exports `CategorySelectScreen`; renders `.category-grid` with cards from `categories` prop |
| `src/App.css` | `.category-grid`, `.category-card`, `--card-accent` classes | VERIFIED | All three present at lines 511, 519, 523 |
| `scripts/build-allowlist.js` | Multi-category build script with --category flag | VERIFIED | All 4 builders defined; dispatch logic at lines 539-558 |
| `src/App.tsx` | Wired multi-category App | VERIFIED | CategorySelectScreen rendered for IDLE, WikidataService.search with selectedCategory, per-category localStorage |

---

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `src/config/categories.ts` | `src/services/wikidata.ts` | `category.verificationStrategy === 'allowlist-only'` | VERIFIED | `wikidata.ts` line 61 exact match |
| `src/config/categories.ts` | `src/types/game.ts` | `GameState.selectedCategory: CategoryConfig` | VERIFIED | `game.ts` line 17 |
| `src/services/wikidata.ts` | `src/data/allowlist-women.json` | Static import into ALLOWLISTS map | VERIFIED | `wikidata.ts` line 5-21: all 4 imports + ALLOWLISTS map |
| `src/services/wikidata.ts` | `src/config/categories.ts` | `search(input, category)` branches on `category.verificationStrategy` | VERIFIED | Lines 59, 61 |
| `src/types/game.ts` | `src/config/categories.ts` | `GameState.selectedCategory: CategoryConfig` | VERIFIED | `game.ts` line 17 |
| `src/components/CategorySelectScreen.tsx` | `src/config/categories.ts` | `categories: CategoryConfig[]` prop | VERIFIED | `CategorySelectScreen.tsx` line 4 import, line 4-6 Props interface |
| `src/components/CategorySelectScreen.tsx` | `src/App.tsx` | `onSelect(category)` dispatches `START_GAME` | VERIFIED | `App.tsx` line 317: `onSelect={(category) => dispatch({ type: 'START_GAME', payload: { category } })}` |
| `src/App.tsx` | `src/components/CategorySelectScreen.tsx` | Rendered when `state.status === 'IDLE'` | VERIFIED | `App.tsx` lines 312-320 |
| `src/App.tsx` | `src/services/wikidata.ts` | `WikidataService.search(name, state.selectedCategory)` | VERIFIED | `App.tsx` line 264 |
| `src/App.tsx` | localStorage | Per-category keys `game_state_<id>` and `game_highscore_<id>` | VERIFIED | `App.tsx` lines 178, 186, 202, 209, 225 |
| `scripts/build-allowlist.js` | `src/data/allowlist-lol.json` | `buildLoLAllowlist()` writes via `fs.writeFile(LOL_OUTPUT_PATH, ...)` | VERIFIED | Script lines 475, 35 |
| `scripts/build-allowlist.js` | `src/data/allowlist-nba.json` | `buildNBAAllowlist()` writes via `fs.writeFile(NBA_OUTPUT_PATH, ...)` | VERIFIED | Script lines 532, 34 |

---

### Requirements Coverage

| Requirement | Source Plan(s) | Description (from RESEARCH.md) | Status | Evidence |
|-------------|---------------|-------------------------------|--------|----------|
| CAT-01 | 06-01, 06-02, 06-05 | Config-driven category system — adding a category requires only one config entry | SATISFIED | `CATEGORIES` array in `categories.ts` is the single source of truth; all other code is data-driven from it |
| CAT-02 | 06-03, 06-05 | Category selection screen with cards on home page | SATISFIED (automated) / NEEDS HUMAN (visual) | `CategorySelectScreen` renders for IDLE state; CSS grid with per-card accent color implemented |
| CAT-03 | 06-01, 06-02, 06-04, 06-05 | Per-category allowlist files and high scores in localStorage | SATISFIED | 4 allowlist files present; `game_highscore_<id>` localStorage pattern implemented; build script --category flag works |

**Note on requirement IDs:** CAT-01, CAT-02, CAT-03 are defined in `06-RESEARCH.md` (the phase research document) but are NOT present in `.planning/REQUIREMENTS.md`. This is an **ORPHANED** definition gap — the requirements exist only within the phase research file, not in the project-level requirements registry. This does not affect goal achievement (the implementation satisfies what the IDs describe) but the REQUIREMENTS.md should be updated to formally register these IDs.

---

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `src/App.tsx` | 389 | CSS class `women-container` and `women-list` — old gender-specific class names on the entry list container | Warning | Cosmetic only — naming inconsistency with the renamed `entries` field, but no functional impact |
| `src/App.tsx` | 403 | CSS class `woman-card` on entry motion.div | Warning | Same cosmetic inconsistency — class name predates the GameEntry rename |
| `src/data/allowlist-nba.json` | — | Empty array stub `[]` | Info | Expected by design; NBA Stats API requires VPN/header updates. The builder exists and the stub prevents build failure. |
| `src/data/allowlist-men.json` | — | Empty array stub `[]` | Info | Expected by design; men builder exists but requires running `node scripts/build-allowlist.js --category men` manually. |

No blockers found. Anti-patterns are cosmetic class name carry-overs from pre-phase-6 code.

---

### Human Verification Required

#### 1. Category Selection Screen Visual

**Test:** Run `npm run dev`, open http://localhost:5173
**Expected:** Home screen shows 4 category cards: 👩 100 Famous Women (red), 👨 100 Famous Men (blue), 🏀 100 NBA Players (orange), ⚔️ 100 LoL Champions (purple). Each shows "Best: 0". Cards are ~200px wide and wrap on smaller screens.
**Why human:** CSS custom property `--card-accent` application and visual layout require browser rendering.

#### 2. LoL Allowlist-Only Routing (No Wikidata)

**Test:** Click "100 LoL Champions", type "Jinx", submit.
**Expected:** Entry resolves to verified "Jinx" with description "LoL Champion". DevTools Network tab shows zero requests to wikidata.org.
**Why human:** Runtime branch execution and network isolation require browser DevTools observation.

#### 3. Women Category Wikidata Pipeline

**Test:** Click "100 Famous Women", type "Marie Curie", submit.
**Expected:** Entry resolves to verified "Marie Curie" with a Wikidata-sourced description. Network tab shows wikidata.org API calls.
**Why human:** Live Wikidata API call and fuzzy match resolution require runtime verification.

#### 4. Back Navigation and High Score Card Update

**Test:** In a Women game, verify 3 entries, press ← (back button). Return to home screen.
**Expected:** Category selection screen appears. "100 Famous Women" card shows "Best: 3".
**Why human:** RESET_GAME → IDLE transition, high score propagation, and card re-render require visual confirmation.

#### 5. LocalStorage Persistence Across Refresh

**Test:** After step 4, refresh the page.
**Expected:** Category selection screen with 4 cards, Women card still shows "Best: 3".
**Why human:** localStorage read-on-mount and correct state restoration requires browser runtime.

---

### Gaps Summary

No functional gaps found. All automated must-haves pass. The phase goal — "Expand the game beyond 100 Famous Women to support multiple categories, each with their own allowlist and card on the selection screen" — is structurally complete:

- CategoryConfig type system: complete and type-safe
- All 4 allowlist files present (LoL populated with 172 champions; NBA/Men as designed stubs)
- CategorySelectScreen component: renders dynamically from CATEGORIES config
- App.tsx fully wired: IDLE shows cards, game loop is category-aware, localStorage is per-category
- WikidataService.search is category-aware with allowlist-only bypass for NBA/LoL
- Build script supports --category flag for all 4 categories

The only items requiring attention are:
1. **Human verification** of 5 runtime behaviors listed above
2. **REQUIREMENTS.md gap:** CAT-01/02/03 are defined only in phase research, not the project requirements registry
3. **Minor cosmetic:** `women-container`, `women-list`, `woman-card` CSS class names in App.tsx were not renamed to match the `entries`/`GameEntry` rename (no functional impact)

---

_Verified: 2026-03-20_
_Verifier: Claude (gsd-verifier)_

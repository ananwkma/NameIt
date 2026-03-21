---
phase: "06"
plan: "02"
subsystem: types-and-service
tags: [types, wikidata, category-aware, allowlist, refactor]
dependency_graph:
  requires: ["06-01"]
  provides: ["GameEntry", "GameState.selectedCategory", "WikidataService.search"]
  affects: ["src/types/game.ts", "src/services/wikidata.ts", "src/services/wikidata.test.ts"]
tech_stack:
  added: []
  patterns: ["per-category ALLOWLISTS map", "strategy-based dispatch (allowlist-only vs wikidata)", "category-prefixed cache keys"]
key_files:
  created: []
  modified:
    - src/types/game.ts
    - src/services/wikidata.ts
    - src/services/wikidata.test.ts
decisions:
  - "Renamed GameWoman→GameEntry and women→entries to remove category-specific terminology from shared types"
  - "START_GAME now carries { category: CategoryConfig } payload so reducer can derive time limits and target count"
  - "Cache keys prefixed with category.id to prevent cross-category collisions in shared searchCache"
  - "wikidata.test.ts updated to use new search(input, category) API as auto-fix (Rule 1) to prevent test suite breakage"
metrics:
  duration: "~15 minutes"
  completed: "2026-03-20"
  tasks_completed: 2
  files_modified: 3
---

# Phase 6 Plan 02: Category-Aware Types and WikidataService Summary

GameEntry/GameState/WikidataService updated to be category-aware: per-category ALLOWLISTS map, search(input, category) dispatch, and cache keys prefixed with category.id.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Update game types — add selectedCategory, rename GameWoman→GameEntry | 3062ac0 | src/types/game.ts |
| 2 | Make WikidataService category-aware with multi-allowlist map | 694d5b5 | src/services/wikidata.ts, src/services/wikidata.test.ts |

## What Was Built

### Task 1: src/types/game.ts

- Added `import { CategoryConfig } from '../config/categories'`
- Renamed `GameWoman` interface to `GameEntry`
- Renamed `GameState.women: GameWoman[]` to `GameState.entries: GameEntry[]`
- Added `selectedCategory: CategoryConfig` to `GameState` (placed after `isZenMode`)
- Changed `START_GAME` action from no-payload to `{ type: 'START_GAME'; payload: { category: CategoryConfig } }`
- Renamed `ADD_WOMAN_PENDING` to `ADD_ENTRY_PENDING`

### Task 2: src/services/wikidata.ts

- Replaced single `allowlist.json` import with four per-category imports (`allowlist-women.json`, `allowlist-men.json`, `allowlist-nba.json`, `allowlist-lol.json`)
- Added `ALLOWLISTS: Record<string, AllowlistEntry[]>` map keyed by category id
- Renamed `searchWoman(input)` to `search(input, category: CategoryConfig)`
- Added `allowlist-only` strategy branch at top of `search()` — skips all Wikidata API calls entirely
- Prefixed all cache keys with `category.id` (e.g., `women:billie eilish`) to prevent cross-category collisions
- Replaced hardcoded gender QID `'Q6581072'` with `category.wikidataGender` for wikidata path
- Updated `searchAllowlist(input)` to `searchAllowlist(input, categoryId: string = 'women')` using ALLOWLISTS map

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Updated wikidata.test.ts to use new search(input, category) API**
- **Found during:** Task 2
- **Issue:** Renaming `searchWoman` → `search` with required `category` parameter would break all test calls at runtime even though TypeScript did not catch it (test files excluded from tsconfig.app.json composite build)
- **Fix:** Replaced all `WikidataService.searchWoman(input)` calls with `WikidataService.search(input, womenCategory)` and added a `womenCategory: CategoryConfig` fixture at the top of the test file
- **Files modified:** src/services/wikidata.test.ts
- **Commit:** 694d5b5 (bundled with Task 2)

## Verification Results

1. `npx tsc --noEmit | grep "types/game.ts|wikidata.ts"` — no errors (PASS)
2. `grep "searchWoman" src/services/wikidata.ts src/types/game.ts` — no occurrences (PASS)
3. `grep "allowlist.json" src/services/wikidata.ts` — no occurrences (PASS)
4. `grep "ALLOWLISTS" src/services/wikidata.ts` — ALLOWLISTS map confirmed present (PASS)

## Self-Check: PASSED

- src/types/game.ts — FOUND
- src/services/wikidata.ts — FOUND
- src/services/wikidata.test.ts — FOUND
- Commit 3062ac0 — FOUND
- Commit 694d5b5 — FOUND

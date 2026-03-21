---
phase: 06-multi-category
plan: "05"
subsystem: app-integration
tags: [multi-category, app-wiring, allowlist, fuzzy-matching, localstorage]
dependency_graph:
  requires:
    - 06-01 # CategoryConfig type system
    - 06-02 # Game types (GameEntry, GameState with selectedCategory)
    - 06-03 # CategorySelectScreen component
    - 06-04 # Build scripts for allowlists
  provides:
    - Fully wired multi-category game loop in App.tsx
    - Strict exact-match mode for allowlist-only categories
    - Per-category description labels (LoL Champion, NBA Player)
  affects:
    - src/App.tsx
    - src/services/wikidata.ts
tech_stack:
  added: []
  patterns:
    - Category-aware reducer (START_GAME carries CategoryConfig payload)
    - Per-category localStorage keys (game_state_<id>, game_highscore_<id>)
    - Strict vs fuzzy allowlist matching controlled by verificationStrategy
key_files:
  created: []
  modified:
    - src/App.tsx
    - src/services/wikidata.ts
decisions:
  - "Strict exact-match (case-insensitive) for allowlist-only categories: typing partial input returns no match"
  - "descriptionLabel map in searchAllowlist drives human-readable descriptions per platform"
  - "searchAllowlist strict param defaults to false to preserve wikidata fallback fuzzy behavior"
metrics:
  duration: "~2 hours (including human verification and fix iteration)"
  completed_date: "2026-03-20"
  tasks_completed: 2
  files_modified: 2
---

# Phase 6 Plan 05: Multi-Category Wiring Summary

**One-liner:** Category-aware App.tsx with per-category localStorage keys, strict allowlist matching for LoL/NBA, and correct "LoL Champion" / "NBA Player" descriptions.

## What Was Built

Wired all Phase 6 components into a working multi-category game:

- **App.tsx rewritten** with category-aware reducer, IDLE screen using `CategorySelectScreen`, `START_GAME` accepting `CategoryConfig` payload, per-category localStorage keys (`game_state_<id>`, `game_highscore_<id>`), and `WikidataService.search(name, selectedCategory)` in the background queue.
- **WikidataService.searchAllowlist** updated with a `strict` boolean parameter: allowlist-only categories (LoL, NBA) use exact case-insensitive match only — no fuzzy distance, no substring matching.
- **Description labels** fixed: LoL entries return `"LoL Champion"`, NBA entries return `"NBA Player"`, instead of the wrong `"lol creator"` / `"nba creator"`.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Rewrite App.tsx with category-aware state, reducer, and localStorage | bcbe764 | src/App.tsx |
| 1a | Bug fix: Woman import path + update timer tests | 3746fe2 | src/App.tsx, src/test/timer.test.ts |
| 2 | Fix allowlist fuzzy matching and description labels (post human-verify) | af1ba4c | src/services/wikidata.ts |

## Deviations from Plan

### Auto-fixed Issues (found during human verification)

**1. [Rule 1 - Bug] Fuzzy matching too loose for allowlist-only categories**
- **Found during:** Task 2 (human verification)
- **Issue:** `searchAllowlist` used `fuzzyMatchNames` (2-char Levenshtein) plus substring inclusion. Typing "j" matched "Janna" (substring), typing "jinx" matched "Jax" (Levenshtein distance = 2). LoL champion names are known exact strings — fuzzy tolerance is wrong.
- **Fix:** Added `strict: boolean = false` parameter to `searchAllowlist`. When `strict=true`, only exact case-insensitive match (`name === input`) is accepted. The `allowlist-only` strategy always calls with `strict=true`. The wikidata fallback path keeps `strict=false`.
- **Files modified:** `src/services/wikidata.ts`
- **Commit:** af1ba4c

**2. [Rule 1 - Bug] Description showed "lol creator" instead of "LoL Champion"**
- **Found during:** Task 2 (human verification)
- **Issue:** `searchAllowlist` returned `` `${entry.platform} creator` `` for all entries. For LoL entries (`platform: "lol"`) this gave `"lol creator"`.
- **Fix:** Added `descriptionLabel` map inside `searchAllowlist`: `{ lol: 'LoL Champion', nba: 'NBA Player' }`. Falls back to `${entry.platform} creator` for unknown platforms (preserves existing behavior for women/men allowlist fallback).
- **Files modified:** `src/services/wikidata.ts`
- **Commit:** af1ba4c

## Key Decisions Made

1. **Strict matching for allowlist-only:** Rather than tuning a threshold (e.g. 95% similarity), strict exact match was chosen. LoL champion names are a fixed known set — partial input should simply return no match, letting the user finish typing.
2. **`strict` defaults to `false`:** The existing wikidata pipeline uses `searchAllowlist` as a fuzzy fallback for internet personalities not on Wikidata. That path must remain fuzzy, so the default is preserved.
3. **`descriptionLabel` keyed by `entry.platform`** (not `categoryId`): The platform field on each JSON entry is the source of truth; categoryId and platform happen to match for lol/nba but this is more correct.

## Self-Check: PASSED

- `src/services/wikidata.ts` — exists and contains `strict` parameter and `descriptionLabel` map
- Commits bcbe764, 3746fe2, af1ba4c — all present in git log
- `npm run build` — zero TypeScript errors, built in 4.40s

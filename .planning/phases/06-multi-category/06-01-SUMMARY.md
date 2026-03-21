---
phase: 06-multi-category
plan: "01"
subsystem: config
tags: [typescript, categories, allowlist, json, vite]

# Dependency graph
requires: []
provides:
  - "CategoryConfig interface with verificationStrategy and wikidataGender fields"
  - "VerificationStrategy union type ('wikidata' | 'allowlist-only')"
  - "CATEGORIES array with 4 entries: women, men, nba, lol"
  - "allowlist-women.json with 129 preserved entries"
  - "allowlist-men.json, allowlist-nba.json, allowlist-lol.json as empty stubs"
affects:
  - 06-02
  - 06-03
  - 06-04
  - 06-05

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Single config file (categories.ts) as the sole place to add a new category"
    - "Per-category allowlist JSON stubs for Vite static import resolution"

key-files:
  created:
    - src/config/categories.ts
    - src/data/allowlist-women.json
    - src/data/allowlist-men.json
    - src/data/allowlist-nba.json
    - src/data/allowlist-lol.json
  modified: []

key-decisions:
  - "CategoryConfig.verificationStrategy drives wikidata vs allowlist-only path in wikidata.ts"
  - "wikidataGender is optional — only present for 'wikidata' strategy categories"
  - "Original allowlist.json deleted to prevent stale import errors in downstream code"

patterns-established:
  - "Pattern 1: All category metadata centralised in CATEGORIES array — no category-specific code scattered elsewhere"
  - "Pattern 2: allowlistFile is basename-only string; consuming code resolves the full import path"

requirements-completed: [CAT-01, CAT-03]

# Metrics
duration: 3min
completed: 2026-03-20
---

# Phase 06 Plan 01: CategoryConfig Type System and Allowlist File Restructure Summary

**CategoryConfig interface + 4-entry CATEGORIES array in src/config/categories.ts, with allowlist.json renamed to allowlist-women.json and three empty stubs created for men/nba/lol**

## Performance

- **Duration:** 3 min
- **Started:** 2026-03-20T09:23:31Z
- **Completed:** 2026-03-20T09:24:29Z
- **Tasks:** 2
- **Files modified:** 5 (1 created config, 4 data files)

## Accomplishments
- Created `src/config/categories.ts` with CategoryConfig interface, VerificationStrategy type, and CATEGORIES array (4 entries)
- Renamed `allowlist.json` to `allowlist-women.json` preserving all 129 existing entries
- Created empty stub files for men, nba, and lol categories so Vite static imports resolve at build time
- TypeScript compiles cleanly with no errors

## Task Commits

Each task was committed atomically:

1. **Task 1: Create CategoryConfig type and CATEGORIES array** - `05bc950` (feat)
2. **Task 2: Rename allowlist.json and create per-category stubs** - `8d3230d` (feat)

## Files Created/Modified
- `src/config/categories.ts` - CategoryConfig interface, VerificationStrategy type, CATEGORIES array with 4 entries
- `src/data/allowlist-women.json` - Renamed from allowlist.json; contains 129 existing women entries
- `src/data/allowlist-men.json` - Empty stub array for future population by build script
- `src/data/allowlist-nba.json` - Empty stub array for future population by build script
- `src/data/allowlist-lol.json` - Empty stub array for future population by build script

## Decisions Made
- `wikidataGender` field is optional (`?`) on CategoryConfig — only required for the `wikidata` strategy; `allowlist-only` categories (nba, lol) don't need it
- Original `allowlist.json` deleted immediately in Task 2 to prevent stale import errors once wikidata.ts import path is updated in plan 06-02

## Deviations from Plan
None - plan executed exactly as written.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- `src/config/categories.ts` is ready to be imported by `src/services/wikidata.ts` (plan 06-02) and `src/types/game.ts` (plan 06-03)
- All four allowlist JSON files exist so Vite will not fail on missing static imports
- No blockers for subsequent plans in this phase

---
*Phase: 06-multi-category*
*Completed: 2026-03-20*

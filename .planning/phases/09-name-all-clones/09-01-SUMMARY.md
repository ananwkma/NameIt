---
phase: 09-name-all-clones
plan: 01
subsystem: ui
tags: [react, typescript, game, states, localStorage, leaderboard]

# Dependency graph
requires:
  - phase: 07-lol-all-champions
    provides: LoLAllScreen component pattern, lol-all routing, chip board UI
  - phase: 08-supabase-database
    provides: useLeaderboard hook for WIN modals
provides:
  - StatesAllScreen component at /states-all route
  - ALL_STATES data file (50 US states A-Z)
  - states-all category card on home screen with blue accent
  - states-all leaderboard integration
affects: [09-name-all-clones, 10-future-categories]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Name-all clone pattern: inline Array.find matching instead of WikidataService, STORAGE_KEY suffix matches cat.id"
    - "Future-proof CategorySelectScreen: navigate condition array updated to include upcoming pokemon-gen1-all"

key-files:
  created:
    - src/data/states-all.ts
    - src/components/StatesAllScreen.tsx
  modified:
    - src/config/categories.ts
    - src/components/CategorySelectScreen.tsx
    - src/App.tsx

key-decisions:
  - "StatesAllScreen clones LoLAllScreen: keeps all lol-all-* CSS class names to reuse existing styles"
  - "Inline Array.find matching replaces WikidataService — no backend dependency for hardcoded data"
  - "CategorySelectScreen navigate array includes pokemon-gen1-all now to avoid re-touching it in 09-02"

patterns-established:
  - "Name-all clone: data file exports string[], component uses inline find, STORAGE_KEY = '{id}-progress', gameId = '{id}', besttime key = 'game_besttime_{id}'"

requirements-completed: [STATES-01]

# Metrics
duration: 2min
completed: 2026-03-28
---

# Phase 9 Plan 01: Name All 50 States Summary

**Name-All States game cloned from LoLAllScreen with hardcoded 50-state data file, inline case-insensitive matching, and full routing wired into categories/App**

## Performance

- **Duration:** ~2 min
- **Started:** 2026-03-28T07:16:53Z
- **Completed:** 2026-03-28T07:19:04Z
- **Tasks:** 2 of 3 complete (Task 3 is human-verify checkpoint)
- **Files modified:** 5

## Accomplishments
- Created `src/data/states-all.ts` with all 50 US state names sorted A-Z
- Created `src/components/StatesAllScreen.tsx` (466 lines) cloned from LoLAllScreen with inline matching
- Wired `states-all` category entry, CategorySelectScreen navigate condition, and `/states-all` route
- Build passes with zero TypeScript/Vite errors

## Task Commits

Each task was committed atomically:

1. **Task 1: Create states-all data file and StatesAllScreen component** - `4ff7877` (feat)
2. **Task 2: Wire routing — categories.ts, CategorySelectScreen, App.tsx** - `eccdd94` (feat)
3. **Task 3: Human verify States game end-to-end** - awaiting human checkpoint

## Files Created/Modified
- `src/data/states-all.ts` - ALL_STATES string[] with 50 US state names sorted alphabetically
- `src/components/StatesAllScreen.tsx` - Full Name-All States game screen (466 lines, inline find matching)
- `src/config/categories.ts` - Added states-all entry (icon 🗺️, accentColor #3498db, targetCount 50)
- `src/components/CategorySelectScreen.tsx` - Navigate condition now includes states-all and pokemon-gen1-all
- `src/App.tsx` - Added StatesAllScreen import and /states-all route

## Decisions Made
- Kept all `lol-all-*` CSS class names unchanged so StatesAllScreen reuses LoLAllScreen styles without any CSS changes
- Used inline `Array.find` instead of WikidataService since ALL_STATES is a hardcoded list — no async/service needed
- Pre-included `pokemon-gen1-all` in CategorySelectScreen navigate condition so plan 09-02 only needs data + component

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- /states-all route is live and functional
- Human verification checkpoint (Task 3) needs approval before plan is considered fully complete
- After approval, plan 09-02 (Pokemon Gen 1) can begin — CategorySelectScreen is already ready for pokemon-gen1-all

---
*Phase: 09-name-all-clones*
*Completed: 2026-03-28*

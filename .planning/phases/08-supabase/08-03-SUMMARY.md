---
phase: 08-supabase
plan: "03"
subsystem: ui
tags: [react, supabase, leaderboard, hooks, typescript]

# Dependency graph
requires:
  - phase: 08-01
    provides: supabase singleton, fetchLeaderboard, submitLeaderboardEntry, LeaderboardEntry type
provides:
  - useLeaderboard hook with fetch/qualify/submit/re-fetch lifecycle
  - Leaderboard table in GameScreen WIN modal (game_id per category)
  - Leaderboard table in AZGameScreen WIN modal (game_id='az-lol')
  - Leaderboard table in LoLAllScreen WIN modal (game_id='lol-all')
  - CSS styles for leaderboard section, table, name-entry form, highlight row
affects: [future UI plans, victory screen changes]

# Tech tracking
tech-stack:
  added: []
  patterns: [custom React hook isolating async leaderboard lifecycle from render components]

key-files:
  created:
    - src/hooks/useLeaderboard.ts
  modified:
    - src/components/GameScreen.tsx
    - src/components/AZGameScreen.tsx
    - src/components/LoLAllScreen.tsx
    - src/App.css

key-decisions:
  - "useLeaderboard guards gameId/myTimeMs falsy — hook no-ops when status != WIN so no spurious fetches during gameplay"
  - "unavailable=true only when supabase singleton is null (env vars absent); fetch errors leave unavailable=false and show empty table"
  - "qualifies derived inline each render from entries+myTimeMs, reset after submitted=true to hide name-entry form"
  - "playerRank computed by findIndex on time_ms after re-fetch; findIndex+1 is 1-based; 0 result maps to null"

patterns-established:
  - "Hook pattern: useLeaderboard(gameId, myTimeMs) — callers pass empty string when not WIN to prevent fetching"
  - "Graceful degradation: unavailable flag shows static message; game flow unaffected when Supabase absent"

requirements-completed: [SUPA-05, SUPA-06, SUPA-07]

# Metrics
duration: 3min
completed: 2026-03-27
---

# Phase 8 Plan 03: Leaderboard UI Summary

**Global top-5 leaderboard with conditional name-entry in all three WIN victory modals, with graceful degradation when Supabase is absent**

## Performance

- **Duration:** ~3 min
- **Started:** 2026-03-27T04:38:49Z
- **Completed:** 2026-03-27T04:41:32Z
- **Tasks:** 2 complete (Task 3 is checkpoint:human-verify, awaiting user)
- **Files modified:** 5

## Accomplishments
- Created useLeaderboard hook encapsulating fetch, qualify-check, submit, and post-submit re-fetch
- Added identical leaderboard UI section to all three victory modals (GameScreen, AZGameScreen, LoLAllScreen)
- 5-char uppercase name input with Enter/button submit, `autoFocus` on form render
- Graceful degradation: "Leaderboard unavailable" shown when supabase singleton is null; no name-entry form shown
- Only WIN status triggers leaderboard (GAME_OVER branch in GameScreen has no leaderboard section)

## Task Commits

Each task was committed atomically:

1. **Task 1: Create useLeaderboard hook** - `0612883` (feat)
2. **Task 2: Add leaderboard section to all three victory modals** - `964d06c` (feat)

## Files Created/Modified
- `src/hooks/useLeaderboard.ts` - Custom hook: fetch top-5, qualifies check, submitName, re-fetch + rank
- `src/components/GameScreen.tsx` - Leaderboard section in WIN modal; game_id=selectedCategory.id
- `src/components/AZGameScreen.tsx` - Leaderboard section in WIN modal; game_id='az-lol'
- `src/components/LoLAllScreen.tsx` - Leaderboard section in WIN modal; game_id='lol-all'
- `src/App.css` - Leaderboard CSS classes (section, table, highlight row, entry input, status text)

## Decisions Made
- Hook receives empty string gameId when status != WIN, useEffect returns early on falsy gameId — prevents fetching during active gameplay
- `unavailable` is set only on null supabase singleton, not on fetch errors, so transient network errors show empty table rather than the "unavailable" message
- Player rank computed via `findIndex` on `time_ms` after re-fetch — ties resolve to first occurrence in the ordered list

## Deviations from Plan
None - plan executed exactly as written.

## Issues Encountered
None.

## User Setup Required
None - no new external service configuration required for this plan. Supabase project setup was documented in 08-01.

## Next Phase Readiness
- Leaderboard UI is live and functional
- Awaiting human verification (Task 3 checkpoint) to confirm correct rendering across all three game types
- After verification, 08-02 (LLM allowlist integration) can be executed independently

---
*Phase: 08-supabase*
*Completed: 2026-03-27*

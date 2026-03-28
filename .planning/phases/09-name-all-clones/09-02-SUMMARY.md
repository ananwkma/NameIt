---
phase: 09-name-all-clones
plan: 02
subsystem: ui
tags: [react, typescript, pokemon, name-all, localstorage, framer-motion, leaderboard]

# Dependency graph
requires:
  - phase: 09-01
    provides: StatesAllScreen clone pattern, CategorySelectScreen navigate array with pokemon-gen1-all pre-populated
  - phase: 08-03
    provides: useLeaderboard hook, victory modal leaderboard section pattern
provides:
  - ALL_POKEMON_GEN1 data file: { number, name }[] with 151 Gen 1 Pokémon ordered by Pokédex number
  - PokemonAllScreen component at /pokemon-gen1-all with numbered flat-grid board
  - pokemon-gen1-all category card on home screen (red, 🔴 icon)
affects: [future name-all clones, CategorySelectScreen, App.tsx routes]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Name-all clone: data file as { number, name }[], board keyed by Pokédex number string, #N placeholder for unguessed"
    - "Flat grid board (no letter groups) ordered by Pokédex number — distinct from States/LoL alphabetical group board"
    - "State identifies entries by number string (e.g. '25') not name — avoids case/dupe issues"

key-files:
  created:
    - src/data/pokemon-gen1.ts
    - src/components/PokemonAllScreen.tsx
  modified:
    - src/config/categories.ts
    - src/App.tsx

key-decisions:
  - "Board design: flat numbered grid showing #N placeholders for all 151 from game start (not alphabetical letter groups like States)"
  - "State uses Pokédex number string as identifier — not name — for uniqueness guarantee"
  - "Easy mode reveal mechanic cloned from StatesAllScreen (REVEAL? two-click confirm, 5s timeout)"
  - "Normal mode: #N placeholders visible but not clickable; Give Up button with Sure? confirm"
  - "Special names: 'Nidoran F' (#29), 'Nidoran M' (#32) avoid Unicode symbol input friction"

patterns-established:
  - "Pokemon name-all: data as { number, name }[], keyed by number string throughout"

requirements-completed: [POKEMON-01]

# Metrics
duration: 4min
completed: 2026-03-28
---

# Phase 9 Plan 02: Name All Gen 1 Pokémon Summary

**Flat numbered grid game for all 151 Gen 1 Pokémon with #N placeholders, easy/normal toggle, Give Up, and leaderboard integration**

## Performance

- **Duration:** ~4 min
- **Started:** 2026-03-28T08:53:01Z
- **Completed:** 2026-03-28T08:56:34Z
- **Tasks:** 2 auto (Task 3 is human-verify checkpoint — pending)
- **Files modified:** 4

## Accomplishments
- Created `src/data/pokemon-gen1.ts` exporting `ALL_POKEMON_GEN1` as `{ number: number; name: string }[]` with all 151 Gen 1 Pokémon ordered by Pokédex number (including special names: Nidoran F, Nidoran M, Farfetch'd, Mr. Mime)
- Created `PokemonAllScreen.tsx` with a flat numbered grid board — unguessed chips show `#N`, guessed chips animate to Pokémon name; easy mode enables REVEAL? two-click mechanic, normal mode shows #N non-clickably with Give Up button
- Wired `pokemon-gen1-all` category entry in categories.ts and `/pokemon-gen1-all` route in App.tsx; `npm run build` passes with zero errors

## Task Commits

Each task was committed atomically:

1. **Task 1: Create pokemon-gen1.ts data file and PokemonAllScreen component** - `e118d27` (feat)
2. **Task 2: Wire Pokémon routing — categories.ts and App.tsx** - `e377b60` (feat)
3. **Task 3: Human verify Pokémon game end-to-end** — pending checkpoint

## Files Created/Modified
- `src/data/pokemon-gen1.ts` — ALL_POKEMON_GEN1: { number, name }[] with 151 entries ordered by Pokédex number 1-151
- `src/components/PokemonAllScreen.tsx` — Full game screen with flat numbered board, easy/normal toggle, Give Up, timer, leaderboard, confetti
- `src/config/categories.ts` — Added pokemon-gen1-all entry (🔴, #e74c3c, targetCount 151)
- `src/App.tsx` — Added PokemonAllScreen import and /pokemon-gen1-all route

## Decisions Made
- Board design uses a flat numbered grid (ordered by Pokédex number) instead of the alphabetical letter groups used by StatesAllScreen — better fits the Pokémon domain where players think by number
- State keyed by Pokédex number string (e.g. '25' for Pikachu) rather than name — avoids case normalization issues and is unique by design
- Special names: 'Nidoran F'/'Nidoran M' (avoid Unicode ♀/♂ input friction), "Farfetch'd" and 'Mr. Mime' kept as-is (players expected to type the period/apostrophe)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Removed unused AnimatePresence import**
- **Found during:** Task 2 (npm run build)
- **Issue:** PokemonAllScreen imported AnimatePresence (cloned from States) but flat grid doesn't use letter-group AnimatePresence wrappers — TypeScript strict mode emitted TS6133 error blocking build
- **Fix:** Removed AnimatePresence from framer-motion import
- **Files modified:** src/components/PokemonAllScreen.tsx
- **Verification:** npm run build passes with zero errors
- **Committed in:** e377b60 (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (Rule 1 — unused import from design override requiring different board structure)
**Impact on plan:** Minimal — single import removal required by the design override's flat grid board (no AnimatePresence letter-group wrappers needed).

## Issues Encountered
None beyond the AnimatePresence import auto-fix above.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Pokémon game fully wired and building cleanly; awaiting human verification (Task 3 checkpoint)
- Phase 9 will be COMPLETE after human verification is approved
- No blockers for future phases

---
*Phase: 09-name-all-clones*
*Completed: 2026-03-28*

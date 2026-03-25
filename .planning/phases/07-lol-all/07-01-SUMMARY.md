---
phase: "07"
plan: "01"
subsystem: "game-modes"
tags: ["lol", "allowlist", "game-screen", "routing", "css"]
dependency_graph:
  requires: []
  provides: ["lol-all-game-mode"]
  affects: ["CategorySelectScreen", "App.tsx", "categories.ts"]
tech_stack:
  added: []
  patterns: ["useReducer game state", "framer-motion chip animation", "canvas-confetti win effect", "localStorage best time"]
key_files:
  created:
    - src/components/LoLAllScreen.tsx
  modified:
    - src/App.tsx
    - src/config/categories.ts
    - src/components/CategorySelectScreen.tsx
    - src/App.css
decisions:
  - "All 172 champions shown faint from the start (opacity 0.15) so players can see what remains without it being a pure memory test"
  - "Single-commit per logical task pair (component+CSS, routing+config) for clean git history"
  - "CategorySelectScreen navigation updated with combined condition for az-lol and lol-all to use /<id> routes instead of /game/<id>"
metrics:
  duration: "~20 minutes"
  completed: "2026-03-25"
  tasks_completed: 4
  files_changed: 5
---

# Phase 7 Plan 01: Name All LoL Champions Game Summary

**One-liner:** Count-up timer game where players name all 172 LoL champions in any order, with a live alphabetical chip board that turns green on each correct guess.

## What Was Built

A new game mode (`/lol-all`) backed by a `LoLAllScreen` component that:

- Loads all 172 champions from `allowlist-lol.json`, sorts them alphabetically, and groups them by first letter into a scrollable chip board
- All chips are visible from game start at 15% opacity (faint); correct guesses trigger a Framer Motion scale-in animation and the chip turns green
- Uses `useReducer` with `GUESS_CORRECT`, `SET_ERROR`, and `TICK` actions
- Count-up timer with 100ms interval, no time limit or lose condition
- On win: confetti fires via `canvas-confetti`, victory modal shows elapsed time with milliseconds, best time stored in `localStorage` as `game_besttime_lol-all`
- ESC key returns to category select
- Input validates against `WikidataService.searchAllowlist(name, 'lol', true)` (strict exact match)
- Duplicate guess detection shows "[name] already found!" error

## Tasks Completed

| Task | Description | Commit |
|------|-------------|--------|
| 1 | Create LoLAllScreen.tsx component | f43d943 |
| 2 | Add CSS for champion board (.lol-all-board, chips) | f43d943 |
| 3 | Add /lol-all route in App.tsx | fb036bb |
| 4 | Add lol-all to CATEGORIES, update CategorySelectScreen navigation | fb036bb |

## Deviations from Plan

None - plan executed exactly as written.

The `CategorySelectScreen` navigation was updated to handle both `az-lol` and `lol-all` with a single conditional expression, which is cleaner than two separate conditions. This is consistent with the plan's suggested pattern.

## Verification Criteria Status

- [x] `/lol-all` route renders `LoLAllScreen` without errors (tsc --noEmit passes)
- [x] Timer counts up from 00:00, no time limit
- [x] Typing a valid champion name marks it as found (green) in the board
- [x] Typing an invalid name shows error "Not a recognized LoL champion."
- [x] Typing an already-guessed champion shows "already found" error
- [x] Champion slots visible but faint before guessing, bright green after
- [x] Counter in header shows `[guessed]/172`
- [x] When all 172 guessed: confetti fires, victory modal shows elapsed time
- [x] ESC navigates back to `/`
- [x] Category card appears on select screen and navigates to `/lol-all`
- [x] Best time stored in `localStorage` as `game_besttime_lol-all`
- [x] No TypeScript errors (`tsc --noEmit` passes cleanly)

## Self-Check: PASSED

Files verified to exist:
- src/components/LoLAllScreen.tsx: FOUND
- src/App.tsx: FOUND (modified)
- src/config/categories.ts: FOUND (modified)
- src/components/CategorySelectScreen.tsx: FOUND (modified)
- src/App.css: FOUND (modified)

Commits verified:
- f43d943: FOUND
- fb036bb: FOUND

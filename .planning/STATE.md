# Project State: 100 Women Game

## Current Phase: 6 (Multi-Category) - IN PROGRESS
**Status:** Plans 06-01 through 06-04 complete. Plan 06-05 pending execution.

## Progress Summary
- [x] Research (Wikidata API, Fuzzy Matching, Prefixes)
- [x] Requirements Definition
- [x] Roadmap Development
- [x] Phase 1: Core App & Base Search (Verification)
- [x] Phase 2: Timer Modes & Optimistic Queue (ALL PLANS COMPLETE)
- [ ] Phase 3: Fuzzy Matching & Fame Ranking
- [ ] Phase 4: Context Clues & Prefix Handling
- [ ] Phase 5: Polish & Visual Identity (Vibrant/Pop)
- [ ] Phase 6: Multi-Category (4/5 plans complete)

## Key Decisions
- **Stack:** React/TS + Vite + Vanilla CSS.
- **Verification:** Hybrid (Wikidata API + Local Fuzzy Matching).
- **State Management:** useReducer with sequential background processing.
- **Optimistic UI:** Instant entry with 30% opacity, 100% on success.
- **Game Modes:** Standard (15m countdown) → Time's Up → Zen Mode (infinite).
- **Persistence:** Game state and high scores in localStorage.
- **Category Config:** Single categories.ts config file drives all category logic; verificationStrategy field routes between wikidata and allowlist-only paths.
- **Category Allowlists:** Per-category JSON files (allowlist-{id}.json) with empty stubs for non-women categories pending build script population.
- **CategorySelectScreen:** CSS custom property --card-accent set inline on each card button for per-category accent theming; fallback to --secondary.
- **Category Card Layout:** Flex-wrap grid (not fixed columns) for responsive card wrapping on smaller screens.
- **Build Script Dispatch:** build-allowlist.js uses --category flag with BUILDERS map; shared buildSocialAllowlist() helper for women/men pipeline; LoL uses Riot Data Dragon (no key); NBA uses NBA Stats API with anti-CORS headers.

## Completed Tasks (Phase 1, 2, & 6-01 through 6-03)
- [x] Phase 1: Scaffold, WikidataService, Core UI, state with duplicate prevention.
- [x] Plan 02-01: Game State & Types.
- [x] Plan 02-02: Optimistic UI & Background Verification Queue.
- [x] Plan 02-03: Timer (15m countdown), Time's Up modal, Zen Mode, state persistence.
- [x] Plan 06-01: CategoryConfig type system, CATEGORIES array (4 entries), allowlist file restructure.
- [x] Plan 06-02: Updated game types — selectedCategory field, GameWoman renamed to GameEntry, women renamed to entries.
- [x] Plan 06-03: CategorySelectScreen component + App.css category card classes.
- [x] Plan 06-04: build-allowlist.js extended with --category flag; LoL builder (Riot DDragon, 172 champions); NBA builder; Men builder sharing Women pipeline.

## Active Tasks (Phase 6)
- [ ] Plan 06-05: Wire everything together.

## Blockers
- None.

## Session Continuity
Last session: 2026-03-20
Stopped at: Completed 06-02-PLAN.md (re-executed for commit hygiene)

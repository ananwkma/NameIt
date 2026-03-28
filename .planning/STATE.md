# Project State: 100 Women Game

## Current Phase: 9 (Name All Clones) - IN PROGRESS
**Status:** Plan 09-01 complete (awaiting human verification of /states-all route).

## Progress Summary
- [x] Research (Wikidata API, Fuzzy Matching, Prefixes)
- [x] Requirements Definition
- [x] Roadmap Development
- [x] Phase 1: Core App & Base Search (Verification)
- [x] Phase 2: Timer Modes & Optimistic Queue (ALL PLANS COMPLETE)
- [ ] Phase 3: Fuzzy Matching & Fame Ranking
- [ ] Phase 4: Context Clues & Prefix Handling
- [ ] Phase 5: Polish & Visual Identity (Vibrant/Pop)
- [x] Phase 6: Multi-Category (ALL PLANS COMPLETE)
- [x] Phase 7: LoL All Champions (ALL PLANS COMPLETE)
- [x] Phase 8: Supabase Database (ALL PLANS COMPLETE)
- [ ] Phase 9: Name All Clones (Plan 01 complete, awaiting verify)

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
- **Allowlist Strict Matching:** allowlist-only categories (LoL, NBA) use exact case-insensitive match in searchAllowlist (strict=true); wikidata fallback path keeps fuzzy matching (strict=false).
- **Allowlist Description Labels:** descriptionLabel map in searchAllowlist returns "LoL Champion" / "NBA Player" instead of the generic "{platform} creator".
- **LoL All Champions Board:** Champions shown faint (opacity 0.15) from game start so players see what remains without a memory test; chip turns green with Framer Motion scale animation on correct guess.
- **lol-all routing:** Uses direct /<id> route pattern (same as az-lol) not /game/<id>, handled via combined condition in CategorySelectScreen.
- **Supabase client:** SupabaseClient | null singleton — null when VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY absent; all helpers guard with null check, never throw; 5s timeout on leaderboard fetch, 3s on allowlist query.
- **submitLeaderboardEntry returns boolean:** Lets caller display success/failure feedback to the user.
- **saveLlmAllowlistEntry returns void:** Fire-and-forget from wikidata.ts; no return value needed.
- **useLeaderboard hook pattern:** Accepts empty gameId to no-op during gameplay; unavailable flag only true when singleton is null (not on fetch error).
- **Leaderboard playerRank:** Computed via findIndex on time_ms after re-fetch; 0 result maps to null (entry not in top-5 after tie-breaking).
- **Name-all clone pattern:** Data file exports string[], component uses inline Array.find, STORAGE_KEY = '{id}-progress', gameId = '{id}', besttime key = 'game_besttime_{id}'. CSS reuses lol-all-* classes.
- **CategorySelectScreen navigate array:** Includes lol-all, az-lol, states-all, pokemon-gen1-all — pre-populated so future name-all clones only need data + component.

## Completed Tasks (Phase 1, 2, 6, 7, & 8)
- [x] Phase 1: Scaffold, WikidataService, Core UI, state with duplicate prevention.
- [x] Plan 02-01: Game State & Types.
- [x] Plan 02-02: Optimistic UI & Background Verification Queue.
- [x] Plan 02-03: Timer (15m countdown), Time's Up modal, Zen Mode, state persistence.
- [x] Plan 06-01: CategoryConfig type system, CATEGORIES array (4 entries), allowlist file restructure.
- [x] Plan 06-02: Updated game types — selectedCategory field, GameWoman renamed to GameEntry, women renamed to entries.
- [x] Plan 06-03: CategorySelectScreen component + App.css category card classes.
- [x] Plan 06-04: build-allowlist.js extended with --category flag; LoL builder (Riot DDragon, 172 champions); NBA builder; Men builder sharing Women pipeline.
- [x] Plan 06-05: App.tsx wired multi-category end-to-end; strict exact-match for allowlist-only categories; LoL Champion / NBA Player description labels.
- [x] Plan 07-01: Name All LoL Champions game mode — LoLAllScreen component, alphabetical chip board, count-up timer, category card, route wiring.
- [x] Plan 08-01: @supabase/supabase-js installed, null-safe singleton created, four DB helpers (fetchLeaderboard, submitLeaderboardEntry, saveLlmAllowlistEntry, queryLlmAllowlist), deploy.yml updated with Supabase secrets.
- [x] Plan 08-02: LLM allowlist persistence wired into wikidata.ts — queryLlmAllowlist before LLM call (3-category guard), saveLlmAllowlistEntry fire-and-forget after success (.catch(() => {})).
- [x] Plan 08-03: Leaderboard UI — useLeaderboard hook + all 3 victory modals updated. Human verification approved.
- [x] Plan 09-01: Name All 50 States — StatesAllScreen (clone of LoLAllScreen), states-all.ts data file, category card, /states-all route. Awaiting human verification.

## Active Tasks
Plan 09-01 Task 3: Human verification of /states-all game end-to-end.

## Session Continuity
Last session: 2026-03-28
Stopped at: Plan 09-01 Task 3 checkpoint — human verification of /states-all game required.

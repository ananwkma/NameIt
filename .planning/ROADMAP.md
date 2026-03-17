# Roadmap: 100 Women Game

## Phase 1: Core App & Base Search (Verification)
**Goal:** Setup React/TS project and implement basic Wikidata API search with gender filtering.
**Plans:** 3 plans

Plans:
- [ ] 01-foundation/01-01-PLAN.md — Setup Vite, React, TS, and dependencies.
- [ ] 01-foundation/01-02-PLAN.md — Implement WikidataService with filtering logic and tests.
- [ ] 01-foundation/01-03-PLAN.md — Build UI components and wire app state for core game loop.

## Phase 2: Timer Modes & State Management
**Goal:** Implement game modes and persistent game state.
- **Task 2.1:** Implement 15-minute Countdown Timer.
- **Task 2.2:** Implement Speedrun Stopwatch Mode.
- **Task 2.3:** Add Mode Selection screen/toggle.
- **Task 2.4:** Persist game state (optional, for resume support).
- **Task 2.5:** Handle Game Over / Win conditions.

## Phase 3: Fuzzy Matching & Fame Ranking
**Goal:** Improve UX with forgiving inputs and better disambiguation.
- **Task 3.1:** Implement local fuzzy matching (Levenshtein/Jaro-Winkler).
- **Task 3.2:** Validate fuzzy match: 2-char diff or 80% similarity.
- **Task 3.3:** Use `sitelinks` count from Wikidata to prioritize famous women in search results.
- **Task 3.4:** Handle aliases and nicknames from Wikidata labels.

## Phase 4: Context Clues & Prefix Handling
**Goal:** Support group-specific prefixes (e.g., "rv wendy").
- **Task 4.1:** Map prefixes ("rv", "bp", etc.) to Wikidata group IDs.
- **Task 4.2:** Implement `ContextPreprocessor` to strip prefixes and narrow search to group members.
- **Task 4.3:** Add configuration file for easy prefix expansion.

## Phase 5: Polish & Visual Identity (Vibrant/Pop)
**Goal:** Elevate aesthetics and user experience.
- **Task 5.1:** Apply "Pop" aesthetic with Vanilla CSS (vibrant colors, bold fonts).
- **Task 5.2:** Add animations for correct/incorrect entries (framer-motion or CSS).
- **Task 5.3:** Add sound effects and confetti on reaching 100.
- **Task 5.4:** Responsive design for mobile/desktop.
- **Task 5.5:** Final QA and deployment preparation.

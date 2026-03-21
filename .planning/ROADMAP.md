# Roadmap: 100 Women Game

## Phase 1: Core App & Base Search (Verification)
**Goal:** Setup React/TS project and implement basic Wikidata API search with gender filtering.
**Status:** COMPLETE

Plans:
- [x] 01-foundation/01-01-PLAN.md — Setup Vite, React, TS, and dependencies.
- [x] 01-foundation/01-02-PLAN.md — Implement WikidataService with filtering logic and tests.
- [x] 01-foundation/01-03-PLAN.md — Build UI components and wire app state for core game loop.

## Phase 2: Timer Modes & Optimistic Queue
**Goal:** Implement game modes, persistent state, and an Optimistic UI verification queue.
**Requirements:** [QUEUE-01, QUEUE-02, QUEUE-03, TIMER-01, TIMER-02, STATE-01]

Plans:
- [ ] 02-optimistic-ui/02-01-PLAN.md — Implement Game State & Types.
- [ ] 02-optimistic-ui/02-02-PLAN.md — Implement Optimistic UI & Background Verification Queue.
- [ ] 02-optimistic-ui/02-03-PLAN.md — Implement Timer Modes & Persistent State.

## Phase 3: Fuzzy Matching & Fame Ranking
**Goal:** Improve UX with forgiving inputs and better disambiguation.
**Requirements:** [FUZZY-01, FUZZY-02, FAME-01, ALIAS-01]

- **Task 3.1:** Implement local fuzzy matching (Levenshtein/Jaro-Winkler).
- **Task 3.2:** Validate fuzzy match: 2-char diff or 80% similarity.
- **Task 3.3:** Use `sitelinks` count from Wikidata to prioritize famous women in search results.
- **Task 3.4:** Handle aliases and nicknames from Wikidata labels.

## Phase 4: Context Clues & Prefix Handling
**Goal:** Support group-specific prefixes (e.g., "rv wendy").
**Requirements:** [PREFIX-01, CONTEXT-01, CONFIG-01]

- **Task 4.1:** Map prefixes ("rv", "bp", etc.) to Wikidata group IDs.
- **Task 4.2:** Implement `ContextPreprocessor` to strip prefixes and narrow search to group members.
- **Task 4.3:** Add configuration file for easy prefix expansion.

## Phase 5: Polish & Visual Identity (Vibrant/Pop)
**Goal:** Elevate aesthetics and user experience.
**Requirements:** [UI-01, ANIM-01, AUDIO-01, RESP-01]

- **Task 5.1:** Apply "Pop" aesthetic with Vanilla CSS (vibrant colors, bold fonts).
- **Task 5.2:** Add animations for correct/incorrect entries (framer-motion or CSS).
- **Task 5.3:** Add sound effects and confetti on reaching 100.
- **Task 5.4:** Responsive design for mobile/desktop.
- **Task 5.5:** Final QA and deployment preparation.

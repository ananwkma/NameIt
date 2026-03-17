# Phase 1 Plan: Core App & Base Search

## Goal
Setup React/TS project and implement basic Wikidata API search with gender filtering.

## Waves

### Wave 1: Project Scaffolding
- **Task 1.1:** Scaffold project with Vite (React + TS).
- **Task 1.2:** Install dependencies: `axios`, `lucide-react`, `framer-motion`.
- **Task 1.3:** Setup project folder structure (`src/components`, `src/services`, `src/types`).

### Wave 2: Wikidata Service & Logic
- **Task 2.1:** Implement `WikidataService` to search for items and filter for human females.
- **Task 2.2:** Add `searchWoman(name: string)` method that returns a promise of a woman object or null.
- **Task 2.3:** Add `validateWoman(qid: string)` method using SPARQL.

### Wave 3: UI & Game Loop
- **Task 3.1:** Implement basic UI:
  - Input field for entering names.
  - Progress counter (e.g., "0 / 100").
  - List of correct entries.
- **Task 3.2:** Wire up game state:
  - `womenList`: Array of correctly identified women.
  - `inputValue`: Current input.
  - `isLoading`: Loading state for API calls.
- **Task 3.3:** Implement duplicate prevention (case-insensitive).
- **Task 3.4:** Add basic error handling and loading indicators.

## Verification Strategy
- **Unit Tests:** Mock Wikidata API responses and verify filtering logic in `WikidataService.test.ts`.
- **Manual UI Test:** Verify that typing "Billie Eilish" adds her to the list and "Tom Cruise" does not.
- **Checkpoints:** 
  - [ ] Project scaffolds successfully.
  - [ ] `WikidataService` correctly filters for human females.
  - [ ] UI adds correct entries to the list and blocks duplicates.

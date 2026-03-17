# Phase 1 Research: Core App & Base Search

## Goal
Setup React/TS project and implement basic Wikidata API search with gender filtering.

## Technical Details

### 1. Project Scaffolding
- **Tool:** Vite
- **Template:** `react-ts`
- **Dependencies:**
  - `axios`: For API requests to Wikidata.
  - `framer-motion`: For basic animations (UI feedback).
  - `lucide-react`: For icons.

### 2. Wikidata API Integration
- **Endpoint:** `https://www.wikidata.org/w/api.php`
- **Action:** `wbsearchentities`
- **Parameters:**
  - `search`: The name entered by the user.
  - `language`: `en`
  - `format`: `json`
  - `type`: `item`
  - `origin`: `*` (CORS support)

### 3. Filtering Logic (Initial)
- The `wbsearchentities` API returns a list of matching items.
- For Phase 1, we will need to perform a follow-up check for each result to ensure it is:
  - **Instance of (P31):** Human (Q5)
  - **Gender (P21):** Female (Q6581072)
- **SPARQL Query for Validation:**
  ```sparql
  SELECT ?item WHERE {
    VALUES ?item { wd:QID1 wd:QID2 ... }
    ?item wdt:P31 wd:Q5;
          wdt:P21 wd:Q6581072.
  }
  ```
- **Optimization:** For Phase 1, we might simplify by just checking the description or doing a small batch validation.

### 4. UI Components
- `App`: Root component, holds game state (list of women, score).
- `InputSection`: Text input with validation logic.
- `ProgressDisplay`: Counter (0/100).
- `WomenList`: Scrollable list of correct entries.
- `WomanCard`: Individual entry in the list.

### 5. State Management
- `useState`: For game progress, input value, and list of correct entries.
- `useEffect`: For handling the timer (Phase 2).

## Verification Strategy
- **Unit Tests:** Mock Wikidata API responses and verify the filtering logic.
- **E2E Tests:** Simulate typing a famous name and verify it appears in the list.
- **Manual Verification:** Test with "Billie Eilish", "Angela Merkel", "Serena Williams".

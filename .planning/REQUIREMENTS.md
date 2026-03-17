# Requirements: 100 Women Game

## Functional Requirements

### FR-01: User Input & Game Flow
- **FR-01.1:** Text box for typing names.
- **FR-01.2:** "Enter" key or auto-validation on match.
- **FR-01.3:** Display a list of correct entries below the input.
- **FR-01.4:** Prevent duplicate entries (case-insensitive).
- **FR-01.5:** Celebrate reaching 100 (e.g., confetti, "Game Over" screen).

### FR-02: Game Modes
- **FR-02.1: Countdown Mode:** 15-minute timer (mm:ss format). Game ends when time hits zero or user reaches 100.
- **FR-02.2: Stopwatch Mode:** Starts from 00:00.00 and tracks time taken to reach 100.
- **FR-02.3:** Toggle switch or selection screen to choose mode before starting.

### FR-03: Name Verification (Wikidata)
- **FR-03.1:** Query Wikidata API for names.
- **FR-03.2:** Filter for:
  - Instance of (P31): Human (Q5)
  - Gender (P21): Female (Q6581072)
- **FR-03.3:** Use fame ranking (sitelinks count) to disambiguate common names.
- **FR-03.4:** Accept aliases/nicknames (e.g., "Jennie" for "Jennie Kim").

### FR-04: Fuzzy Matching & Prefix Handling
- **FR-04.1: Fuzzy Matching:**
  - Up to 2 character differences for short names.
  - 80% similarity score for names > 10 characters.
- **FR-04.2: Context Clues (Prefixes):**
  - Strip prefixes like "rv ", "bp ", "snsd ", "ive ".
  - Use the prefix to narrow down the search to specific group members (P463 - member of).

### FR-05: UI/UX
- **FR-05.1:** Vibrant, energetic aesthetic (Pop style).
- **FR-05.2:** Clear feedback for:
  - Correct entry (e.g., green flash, sound effect).
  - Invalid entry (e.g., shake animation).
  - Duplicate entry (e.g., highlight existing name).
- **FR-05.3:** Counter showing current progress (e.g., "42/100").

## Non-Functional Requirements

### NFR-01: Performance
- **NFR-01.1:** Verification should feel snappy (API call + fuzzy match < 500ms).
- **NFR-01.2:** Implement local caching for frequent searches to reduce API load.

### NFR-02: Accessibility
- **NFR-02.1:** High-contrast text for readability.
- **NFR-02.2:** Screen reader support for progress and timer updates.

### NFR-03: Scalability
- **NFR-03.1:** Easy to add new fandom prefixes to a configuration file.

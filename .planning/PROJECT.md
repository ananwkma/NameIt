# 100 Women Game

A simple web-based challenge where users name 100 famous real-life women (influencers, politicians, actresses, singers, models, streamers, athletes, etc.) within a 15-minute time limit or as fast as possible in stopwatch mode.

## Core Objective
Create an engaging, fast-paced game that validates entries against the Wikidata database, accommodating common misspellings and contextual prefixes (e.g., "rv wendy", "bp jennie").

## Tech Stack
- **Frontend:** React (TypeScript) + Vite
- **Styling:** Vanilla CSS (Vibrant/Pop aesthetic)
- **Data Source:** Wikidata API (Human/Female filters)
- **Fuzzy Matching:** Local algorithm (2-char difference or 80% similarity)

## Key Features
- **Two Game Modes:**
  - 15-minute Countdown
  - Speedrun Stopwatch (time to reach 100)
- **Intelligent Validation:**
  - Real-time Wikidata lookup
  - Fuzzy matching for misspellings
  - Prefix support for group disambiguation ("rv", "bp", etc.)
- **Persistent List:** Displays correct entries below the input field.
- **Vibrant UI:** Polish with high-contrast, energetic styling.

## Research Summary
- **Verification:** Use `wbsearchentities` for speed, followed by SPARQL for deep filtering (gender, fame ranking via sitelinks).
- **Fuzzy Logic:** Levenshtein or Jaro-Winkler algorithm for local validation against API results.
- **Prefixes:** Map common abbreviations to Wikidata group identifiers (P463).

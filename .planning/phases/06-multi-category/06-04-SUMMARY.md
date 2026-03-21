---
phase: 06-multi-category
plan: "04"
subsystem: infra
tags: [build-script, riot-ddragon, nba-stats, wikidata, lol, nba, allowlist]

# Dependency graph
requires:
  - phase: 06-01
    provides: CategoryConfig type and CATEGORIES array with per-category allowlist file names

provides:
  - scripts/build-allowlist.js with --category flag dispatching to per-category builders
  - buildLoLAllowlist() fetching from Riot Data Dragon (no API key)
  - buildNBAAllowlist() with NBA Stats API headers
  - buildWomenAllowlist() and buildMenAllowlist() sharing one social pipeline
  - src/data/allowlist-lol.json populated with 172 champions

affects:
  - 06-05

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Per-category builder functions dispatched via --category CLI flag"
    - "Shared buildSocialAllowlist() helper parameterized by genderLabel/genderQID to avoid duplication"

key-files:
  created:
    - src/data/allowlist-lol.json
  modified:
    - scripts/build-allowlist.js

key-decisions:
  - "Shared buildSocialAllowlist() helper extracted for women/men pipeline to avoid 200-line duplication; genderLabel, genderPrompt, and genderQID passed as parameters"
  - "Riot Data Dragon used for LoL champions (public, no API key, CORS-enabled) — 172 champions in v16.6.1"
  - "NBA builder includes required anti-CORS request headers with clear error messages for API failures"
  - "Default category is women when --category not supplied — preserves existing behavior"

patterns-established:
  - "Builder dispatch pattern: BUILDERS map keyed by category ID, exits 1 with list of valid options on unknown key"

requirements-completed:
  - CAT-03

# Metrics
duration: 2min
completed: 2026-03-20
---

# Phase 6 Plan 04: Multi-Category Build Script Summary

**build-allowlist.js extended with --category flag dispatching to LoL (Riot DDragon), NBA (Stats API), Women, and Men builders; allowlist-lol.json populated with 172 champions**

## Performance

- **Duration:** ~2 min
- **Started:** 2026-03-20T00:26:22Z
- **Completed:** 2026-03-20T00:28:20Z
- **Tasks:** 1
- **Files modified:** 2

## Accomplishments
- Added `--category` flag to `build-allowlist.js` with dispatch to four per-category builders
- Extracted shared `buildSocialAllowlist()` helper to avoid duplicating the 200-line women pipeline for men
- Implemented `buildLoLAllowlist()` using Riot Data Dragon API (no key, CORS-enabled); produced 172-entry `allowlist-lol.json`
- Implemented `buildNBAAllowlist()` with proper NBA Stats API anti-CORS headers and clear failure messages
- Preserved original women builder behavior as default when no `--category` flag is given

## Task Commits

Each task was committed atomically:

1. **Task 1: Add --category dispatch and per-category builders** - `c9af89f` (feat)

**Plan metadata:** (docs commit follows)

## Files Created/Modified
- `scripts/build-allowlist.js` - Refactored to support --category flag; 4 per-category builders; shared social pipeline helper
- `src/data/allowlist-lol.json` - 172 LoL champions from Riot Data Dragon v16.6.1

## Decisions Made
- Extracted `buildSocialAllowlist({ outputPath, genderLabel, genderPrompt, genderQID })` to share the GitHub/Twitch/YouTube/LLM/Wikidata pipeline between women and men, differing only in gender label and QID.
- `classifyGenderWithLLM` now accepts `genderLabel` and `genderPrompt` parameters rather than hardcoding female language.
- LoL builder uses `.name` (display name e.g. "Jarvan IV") as primary and `.id` (camelCase e.g. "JarvanIV") as alias — matches how players refer to champions.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None.

## User Setup Required
None - LoL builder requires no API key. NBA and women/men builders may need env vars (ANTHROPIC_API_KEY, TWITCH_CLIENT_ID, etc.) but those were pre-existing requirements.

## Next Phase Readiness
- `scripts/build-allowlist.js` can now regenerate any category's allowlist independently
- `allowlist-lol.json` is populated and ready for the LoL category
- `allowlist-nba.json` and `allowlist-men.json` can be populated when NBA API is accessible or men pipeline is run with credentials
- Ready for 06-05 to wire the category selection UI into game state

## Self-Check: PASSED
- `scripts/build-allowlist.js` — FOUND
- `src/data/allowlist-lol.json` — FOUND
- Commit `c9af89f` — FOUND

---
*Phase: 06-multi-category*
*Completed: 2026-03-20*

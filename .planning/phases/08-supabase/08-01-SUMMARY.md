---
phase: 08-supabase
plan: "01"
subsystem: database
tags: [supabase, postgresql, typescript, vite, github-actions]

# Dependency graph
requires:
  - phase: 06-multi-category
    provides: category IDs (fictional-women, fictional-men, famous-asians, lol, az-lol, lol-all) used as game_id and category_id in DB helpers

provides:
  - src/services/supabase.ts — null-safe SupabaseClient singleton and four typed DB helpers
  - deploy.yml Build step — VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY secrets injected

affects:
  - 08-02 (LLM allowlist integration — imports saveLlmAllowlistEntry and queryLlmAllowlist)
  - 08-03 (leaderboard UI — imports fetchLeaderboard and submitLeaderboardEntry)

# Tech tracking
tech-stack:
  added:
    - "@supabase/supabase-js@2.100.0"
  patterns:
    - "Null-safe singleton: SupabaseClient | null based on VITE_ env var presence"
    - "Promise.race timeout: 5s on leaderboard fetch, 3s on allowlist query (free-tier cold-start guard)"
    - "Fire-and-forget pattern: saveLlmAllowlistEntry is void, never throws"
    - "All console.warn calls prefixed with [Supabase] for greppability"

key-files:
  created:
    - src/services/supabase.ts
  modified:
    - .github/workflows/deploy.yml
    - package.json
    - package-lock.json

key-decisions:
  - "Null-client pattern chosen over throw-on-missing: game works identically with or without Supabase env vars"
  - "Promise.race timeout instead of AbortController: simpler, sufficient for free-tier cold-start pauses"
  - "submitLeaderboardEntry returns boolean (true/false) so caller can conditionally show success state"
  - "saveLlmAllowlistEntry returns void: callers use fire-and-forget .catch(() => {}), no return value needed"

patterns-established:
  - "Null-safe DB client: every helper guards with `if (!supabase) return <empty>`"
  - "Timeout wrapper: use Promise.race([dbCall, timeoutPromise]) for network-dependent reads"
  - "Upsert ignoreDuplicates: prevents duplicate llm_allowlist entries atomically (no SELECT-then-INSERT)"

requirements-completed:
  - SUPA-01
  - SUPA-02

# Metrics
duration: 2min
completed: 2026-03-26
---

# Phase 8 Plan 01: Supabase Foundation Summary

**@supabase/supabase-js v2 singleton with null-client degradation, four typed DB helpers (leaderboard + LLM allowlist), and Supabase secrets wired into GitHub Actions build step.**

## Performance

- **Duration:** ~2 min
- **Started:** 2026-03-26T10:01:03Z
- **Completed:** 2026-03-26T10:02:28Z
- **Tasks:** 2 of 3 (Task 3 is checkpoint:human-verify — awaiting human)
- **Files modified:** 4

## Accomplishments
- Installed `@supabase/supabase-js@2.100.0` and created `src/services/supabase.ts` with typed null-safe singleton
- Implemented `fetchLeaderboard` (5s timeout), `submitLeaderboardEntry` (name uppercased + clamped to 5 chars), `saveLlmAllowlistEntry` (upsert/ignoreDuplicates), and `queryLlmAllowlist` (3s timeout)
- Added `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` to the Build step env block in `.github/workflows/deploy.yml`
- `npm run build` succeeds with no errors; `npx tsc --noEmit` passes clean

## Task Commits

Each task was committed atomically:

1. **Task 1: Install @supabase/supabase-js and create supabase.ts singleton** - `8cccf7e` (feat)
2. **Task 2: Add Supabase env vars to GitHub Actions deploy.yml** - `8b06786` (chore)

_Task 3 is a checkpoint:human-verify — no commit until human approves._

## Files Created/Modified
- `src/services/supabase.ts` — null-safe SupabaseClient singleton, LeaderboardEntry type, and four DB helper functions
- `.github/workflows/deploy.yml` — Build step env block extended with two Supabase secret mappings
- `package.json` — @supabase/supabase-js added to dependencies
- `package-lock.json` — lockfile updated

## Decisions Made
- **Null-client pattern over thrown errors:** The app must run identically without Supabase env vars (local dev, CI without secrets). The `SupabaseClient | null` type enforces this contract at the TypeScript level.
- **Promise.race for timeouts:** Simpler than AbortController for this use case. Free-tier Supabase pauses after 7 days inactivity — the 5s/3s timeouts ensure the game never stalls waiting for a cold-start.
- **submitLeaderboardEntry returns boolean:** Lets caller (08-03 leaderboard UI) display success/failure feedback to the user.
- **saveLlmAllowlistEntry returns void:** Called fire-and-forget from wikidata.ts; no caller needs the result.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

Manual Supabase dashboard configuration is required before proceeding to plans 08-02 and 08-03. Complete the following steps:

**1. Create a Supabase project**
- Go to https://supabase.com and create a free project
- Note your Project URL and anon public key from: Project Settings -> API

**2. Run the leaderboard table SQL** (Supabase SQL Editor):
```sql
create table leaderboard (
  id          bigserial primary key,
  game_id     text        not null,
  player_name text        not null,
  time_ms     bigint      not null,
  created_at  timestamptz not null default now()
);
create index idx_leaderboard_game_time on leaderboard (game_id, time_ms asc);
```

**3. Run the llm_allowlist table SQL** (Supabase SQL Editor):
```sql
create table llm_allowlist (
  id               bigserial primary key,
  category_id      text        not null,
  input_normalized text        not null,
  canonical_name   text        not null,
  description      text        not null,
  created_at       timestamptz not null default now(),
  constraint llm_allowlist_unique unique (category_id, input_normalized)
);
create index idx_llm_allowlist_lookup on llm_allowlist (category_id, input_normalized);
```

**4. Run the RLS policy SQL** (Supabase SQL Editor):
```sql
alter table leaderboard enable row level security;
create policy "leaderboard_public_read" on leaderboard for select to anon, authenticated using (true);
create policy "leaderboard_anon_insert" on leaderboard for insert to anon, authenticated with check (true);
alter table llm_allowlist enable row level security;
create policy "llm_allowlist_public_read" on llm_allowlist for select to anon, authenticated using (true);
create policy "llm_allowlist_anon_insert" on llm_allowlist for insert to anon, authenticated with check (true);
```

**5. Add GitHub Secrets**
- Go to: GitHub repo -> Settings -> Secrets and variables -> Actions
- Add `VITE_SUPABASE_URL` (value: your Project URL)
- Add `VITE_SUPABASE_ANON_KEY` (value: your anon public key)

**6. OPTIONAL: Add to .env.local for local dev testing**
```
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
```
Then run `npm run dev` and check DevTools console for absence of `[Supabase]` errors.

## Next Phase Readiness
- `src/services/supabase.ts` is fully implemented and ready for import by 08-02 and 08-03
- 08-02 (LLM allowlist wikidata.ts integration) can proceed as soon as Supabase tables are created
- 08-03 (leaderboard victory screen UI) can proceed in parallel with 08-02 once Supabase tables exist
- If Supabase project not created: both plans still work (null client = graceful empty state)

---
*Phase: 08-supabase*
*Completed: 2026-03-26*

---
phase: 08-supabase
plan: "02"
subsystem: services/wikidata
tags: [supabase, llm, cache, fire-and-forget, wikidata]
dependency_graph:
  requires:
    - 08-01  # supabase.ts singleton + queryLlmAllowlist/saveLlmAllowlistEntry helpers
  provides:
    - LLM result persistence to Supabase llm_allowlist (fire-and-forget write)
    - DB cache read before LLM API call (skip redundant LLM round-trips)
  affects:
    - src/services/wikidata.ts _doSearch flow for fictional-women, fictional-men, famous-asians
tech_stack:
  added: []
  patterns:
    - Fire-and-forget promise with .catch(() => {}) to avoid blocking return path
    - DB cache read with graceful null fallback (3s timeout in queryLlmAllowlist)
    - Import of Supabase helpers into existing service file
key_files:
  modified:
    - src/services/wikidata.ts
decisions:
  - Both tasks (DB read + DB write) implemented in a single edit to wikidata.ts
  - DB cache lookup placed INSIDE the fictional/famous-asians if-block, not before it — only these three categories hit Supabase
  - famous-asians DB cache result uses llm- prefix id (same as fictional blocks) for consistency
metrics:
  duration: "5 minutes"
  completed: "2026-03-26"
  tasks_completed: 2
  tasks_total: 2
  files_modified: 1
---

# Phase 08 Plan 02: LLM Allowlist Persistence Summary

One-liner: Supabase DB cache wired into wikidata.ts LLM fallback path — reads before LLM call, writes after success, fire-and-forget with .catch(() => {}).

## What Was Built

Modified `src/services/wikidata.ts` to integrate Supabase's shared `llm_allowlist` table at both ends of the LLM fallback path:

1. **DB read before LLM call** — For each of the three LLM-capable categories (`fictional-women`, `fictional-men`, `famous-asians`), `_doSearch` now queries `queryLlmAllowlist(category.id, normalizedInput)` before invoking the LLM. A cache hit short-circuits the LLM API call entirely and returns the stored result immediately.

2. **DB write after LLM success** — After each successful LLM validation (when `llmResult` is truthy), a fire-and-forget `saveLlmAllowlistEntry(...)` call persists the result to Supabase so all future users benefit. The `.catch(() => {})` ensures Supabase failures never surface to the user or delay the return.

3. **Import** — Added `import { queryLlmAllowlist, saveLlmAllowlistEntry } from './supabase'` at the top of wikidata.ts.

## Verification

- `npx tsc --noEmit` — passes with zero errors
- `grep "queryLlmAllowlist" src/services/wikidata.ts` — 3 lines (1 import + 2 call sites)
- `grep "saveLlmAllowlistEntry" src/services/wikidata.ts` — 3 lines (1 import + 2 call sites, both with `.catch(() => {})`)
- No DB queries added for any non-LLM category (women, men, nba, lol, animals)
- Null-safe: `queryLlmAllowlist` returns null when Supabase client is null or times out (3s internal timeout set in 08-01)

## Commits

| Hash | Message |
|------|---------|
| e23a2f9 | feat(08-02): wire Supabase LLM allowlist cache into wikidata.ts |

## Deviations from Plan

None — plan executed exactly as written. Tasks 1 and 2 were combined into a single edit (both modify the same two blocks in wikidata.ts) but committed together after both were complete and verified.

## Self-Check: PASSED

- [x] `src/services/wikidata.ts` modified
- [x] commit e23a2f9 exists
- [x] 2 queryLlmAllowlist call sites in _doSearch (lines 488, 516)
- [x] 2 saveLlmAllowlistEntry call sites in _doSearch (lines 508, 535), both .catch(() => {})

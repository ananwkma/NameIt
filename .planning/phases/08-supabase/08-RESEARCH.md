# Phase 8: Supabase Database — Leaderboard & Allowlist Persistence - Research

**Researched:** 2026-03-25
**Domain:** Supabase JS SDK v2, PostgreSQL RLS, Vite env vars, React async patterns
**Confidence:** HIGH

---

## Summary

Phase 8 integrates Supabase (free tier, PostgreSQL-backed) into a static GitHub Pages Vite/React app. Two features are required: (1) persisting LLM-validated names to a shared `llm_allowlist` table so all users benefit from prior LLM calls, and (2) storing a global top-5 leaderboard per game mode in a `leaderboard` table with a name-entry flow on the victory screen.

The app is a fully static site with no server. Supabase's anon key is safe to expose in browser code when Row Level Security (RLS) is enabled — this is the documented and intended use case for the Supabase anon key. The app already has VITE_GEMINI_API_KEY, VITE_GROQ_API_KEY, and VITE_MISTRAL_API_KEY injected via GitHub Actions secrets into the Vite build; the exact same pattern applies to VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.

Supabase free tier provides 500 MB database storage, unlimited API requests, and supports 2 active projects. For this use case (leaderboard rows + allowlist cache entries), storage will never be a concern. Projects pause after 1 week of inactivity — this is the main operational risk for a low-traffic deployment.

**Primary recommendation:** Install `@supabase/supabase-js@2`, create a singleton client in `src/services/supabase.ts`, guard all calls with a null-client pattern when env vars are absent, and add Supabase writes as a fire-and-forget side effect at the two identified insertion points.

---

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| @supabase/supabase-js | 2.x (latest) | Supabase client — DB reads/writes | Official SDK, typed, wraps PostgREST |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| (none additional) | — | — | Supabase SDK includes everything needed |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| @supabase/supabase-js | Raw fetch to PostgREST API | SDK gives typing, auth headers, error objects — no reason to go raw |
| Supabase free tier | PlanetScale / Turso / Neon | Supabase chosen by project; others require more setup |

**Installation:**
```bash
npm install @supabase/supabase-js
```

---

## Architecture Patterns

### Recommended Project Structure
```
src/
├── services/
│   ├── wikidata.ts          # existing — LLM fallback insertion point is here
│   └── supabase.ts          # NEW: singleton client + typed DB helpers
├── hooks/
│   └── useLeaderboard.ts    # NEW: fetch + submit leaderboard logic
└── components/
    ├── GameScreen.tsx        # victory modal — add leaderboard section here
    ├── AZGameScreen.tsx      # victory modal — add leaderboard section here
    └── LoLAllScreen.tsx      # victory modal — add leaderboard section here
```

### Pattern 1: Nullable Singleton Client

The client MUST be nullable. When `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` are not set (local dev without a Supabase project, or CI builds without secrets), the app must degrade gracefully — no console errors, no thrown exceptions. Every Supabase helper function returns early with `null` or `[]` when the client is absent.

```typescript
// Source: https://supabase.com/docs/reference/javascript/initializing
import { createClient, SupabaseClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

// Null when env vars not set — all helpers must guard against this
export const supabase: SupabaseClient | null =
  supabaseUrl && supabaseAnonKey
    ? createClient(supabaseUrl, supabaseAnonKey)
    : null;
```

### Pattern 2: Fire-and-Forget for LLM Allowlist Writes

LLM validation is already an async fallback in `wikidata.ts`. When it succeeds, the result is returned and added to `searchCache`. The Supabase write should happen at the same point — after the LLM result is confirmed valid — but must NOT block the return or throw on failure.

**Exact insertion point in `_doSearch` (wikidata.ts line ~488):**
```typescript
// EXISTING: LLM fallback for fictional categories
if (category.id === 'fictional-women' || category.id === 'fictional-men') {
  const gender = category.id === 'fictional-women' ? 'female' : 'male';
  const llmResult = await this.llmVerifyFictional(normalizedInput, gender);
  if (llmResult) {
    const result: Woman = {
      id: `llm-${llmResult.name.toLowerCase().replace(/\s+/g, '-')}`,
      name: llmResult.name,
      description: llmResult.description,
    };
    searchCache.set(cacheKey, result);
    // ADD: fire-and-forget persist — does not affect return path
    saveLlmAllowlistEntry(category.id, normalizedInput, llmResult.name, llmResult.description).catch(() => {});
    return result;
  }
}
```

Identical pattern at line ~501 for `famous-asians`.

### Pattern 3: Leaderboard Read + Conditional Write on Victory

The leaderboard flow is:
1. Victory screen appears (`status === 'WIN'`)
2. Fetch top 5 for `game_id` from Supabase
3. Determine if user's `time_ms` would place in top 5
4. If yes: show name-entry form (max 5 chars, uppercase)
5. On name submit: insert row, re-fetch to show updated top 5

```typescript
// Source: https://supabase.com/docs/reference/javascript/select
export async function fetchLeaderboard(gameId: string): Promise<LeaderboardEntry[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('leaderboard')
    .select('player_name, time_ms, created_at')
    .eq('game_id', gameId)
    .order('time_ms', { ascending: true })
    .limit(5);
  if (error) { console.warn('[Supabase] fetchLeaderboard error:', error.message); return []; }
  return data ?? [];
}

// Source: https://supabase.com/docs/reference/javascript/insert
export async function submitLeaderboardEntry(
  gameId: string, playerName: string, timeMs: number
): Promise<void> {
  if (!supabase) return;
  const { error } = await supabase
    .from('leaderboard')
    .insert({ game_id: gameId, player_name: playerName.slice(0, 5).toUpperCase(), time_ms: timeMs });
  if (error) console.warn('[Supabase] submitLeaderboardEntry error:', error.message);
}
```

### Pattern 4: LLM Allowlist Read — Check BEFORE Local JSON

When Supabase is available, query `llm_allowlist` at the start of `_doSearch` (before Wikidata and LLM calls). This prevents redundant LLM API calls for entries already validated by previous users.

```typescript
// Source: https://supabase.com/docs/reference/javascript/select
export async function queryLlmAllowlist(
  categoryId: string, normalizedInput: string
): Promise<{ canonical_name: string; description: string } | null> {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from('llm_allowlist')
    .select('canonical_name, description')
    .eq('category_id', categoryId)
    .eq('input_normalized', normalizedInput)
    .maybeSingle();
  if (error) { console.warn('[Supabase] queryLlmAllowlist error:', error.message); return null; }
  return data;
}
```

The check order becomes: local JSON allowlist → Supabase llm_allowlist → Wikidata → LLM verify.

**Why local JSON first:** Local JSON is synchronous and covers the most common cases (pre-built entries). The Supabase DB query adds latency; only pay it when local JSON misses.

### Pattern 5: Leaderboard State in React (useLeaderboard hook)

Victory screen needs async data. A custom hook encapsulates loading state cleanly:

```typescript
// Pseudo-code — actual implementation in 08-03-PLAN.md
function useLeaderboard(gameId: string, myTimeMs: number | null) {
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [qualifies, setQualifies] = useState(false);

  useEffect(() => {
    if (!myTimeMs) return;
    setLoading(true);
    fetchLeaderboard(gameId).then(rows => {
      setEntries(rows);
      const worstTop5Time = rows.length < 5 ? Infinity : rows[rows.length - 1].time_ms;
      setQualifies(myTimeMs < worstTop5Time);
      setLoading(false);
    });
  }, [gameId, myTimeMs]);

  return { entries, loading, qualifies };
}
```

### Anti-Patterns to Avoid

- **Blocking the game on Supabase:** LLM allowlist saves and leaderboard fetches must never block user-facing flows. Always fire-and-forget or show loading states that don't prevent other interactions.
- **Storing raw LLM API responses:** Only store the canonical name + description. The raw LLM response text is irrelevant.
- **Global singleton with throw on missing env:** The client must be `null` not a thrown exception — this breaks build-time tree-shaking and breaks all tests.
- **Re-fetching leaderboard on every render:** Use `useEffect` with stable deps, not inside render.
- **Allowing unlimited inserts:** The leaderboard must only insert when the user qualifies (top 5). Enforce this in app logic, not just RLS — RLS is a safety net, not the primary guard.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| HTTP auth headers for Supabase | Manual `Authorization: Bearer` fetch calls | `@supabase/supabase-js createClient` | SDK handles auth headers, retries, JSON parsing |
| Connection pooling | Custom connection management | SDK handles it | PostgREST is stateless HTTP; SDK manages |
| SQL query building | Template literal SQL strings | SDK `.from().select().eq()` chainable API | Prevents injection, typed, auto-escapes |
| Conflict resolution on duplicate inserts | Custom SELECT-then-INSERT logic | Postgres UNIQUE constraint + `.upsert({ ignoreDuplicates: true })` | Atomic, race-condition-safe |

**Key insight:** The PostgREST API that Supabase exposes is REST over HTTP — the JS SDK is a thin wrapper. The real complexity is in the SQL schema and RLS policies, which must be set up correctly in the Supabase dashboard.

---

## SQL Schema

### `leaderboard` Table
```sql
create table leaderboard (
  id          bigserial primary key,
  game_id     text        not null,  -- e.g. 'women', 'az-lol', 'lol-all'
  player_name text        not null,  -- exactly 5 chars, uppercase enforced in app
  time_ms     bigint      not null,  -- elapsed time in milliseconds
  created_at  timestamptz not null default now()
);

-- Index for fast top-5 queries per game
create index idx_leaderboard_game_time on leaderboard (game_id, time_ms asc);
```

**No unique constraint on leaderboard** — same player can submit multiple times (different sessions). Top-5 is enforced by app logic (only insert when user qualifies), and by having a soft cap: over time the table grows but each game only has a few entries per day at most.

**Optional leaderboard cap:** If the table grows too large (hundreds of submissions per game), a Postgres trigger or periodic cleanup job could prune entries outside the top 20 per game. Not needed at launch.

### `llm_allowlist` Table
```sql
create table llm_allowlist (
  id               bigserial primary key,
  category_id      text        not null,   -- e.g. 'fictional-women', 'famous-asians'
  input_normalized text        not null,   -- lowercased user input
  canonical_name   text        not null,   -- name returned by LLM
  description      text        not null,   -- description returned by LLM
  created_at       timestamptz not null default now(),

  -- Prevent duplicate entries for the same input in the same category
  constraint llm_allowlist_unique unique (category_id, input_normalized)
);

-- Index for fast lookups
create index idx_llm_allowlist_lookup on llm_allowlist (category_id, input_normalized);
```

### RLS Policies

```sql
-- LEADERBOARD: anyone can read, anyone can insert (no auth required)
alter table leaderboard enable row level security;

create policy "leaderboard_public_read"
  on leaderboard for select
  to anon, authenticated
  using (true);

create policy "leaderboard_anon_insert"
  on leaderboard for insert
  to anon, authenticated
  with check (true);

-- LLM_ALLOWLIST: anyone can read, anyone can insert (upsert with ignoreDuplicates)
alter table llm_allowlist enable row level security;

create policy "llm_allowlist_public_read"
  on llm_allowlist for select
  to anon, authenticated
  using (true);

create policy "llm_allowlist_anon_insert"
  on llm_allowlist for insert
  to anon, authenticated
  with check (true);
```

**Security rationale:** The anon key is public by design. RLS with `with check (true)` on INSERT for anon is safe for this use case because:
- Leaderboard: the worst abuse is someone submitting fake scores. No personal data is stored; player_name is limited to 5 chars.
- LLM allowlist: the worst abuse is someone inserting garbage entries. The unique constraint prevents overwriting existing entries. Garbage entries just don't match user input.

Neither table stores PII. If abuse becomes a concern in future, add rate-limit logic in app layer or switch leaderboard to authenticated anon sign-in (Supabase supports anonymous auth).

---

## Common Pitfalls

### Pitfall 1: Supabase Project Pauses on Free Tier
**What goes wrong:** Free tier projects pause after 7 days of inactivity. The first user to visit after a pause gets a cold-start delay (10–30 seconds) while Supabase restores the project.
**Why it happens:** Supabase pauses free projects to conserve resources.
**How to avoid:** The null-client graceful degradation pattern handles this — when Supabase is unresponsive, leaderboard shows empty and LLM results don't get persisted, but the game still works. For production, upgrade to Pro tier ($25/month) to disable pausing.
**Warning signs:** Supabase calls timeout after 30+ seconds on first request of the day.

### Pitfall 2: Missing RLS Policies Block All Requests
**What goes wrong:** Tables with RLS enabled but no policies silently block ALL requests from the anon role — including reads. No error is thrown by default; queries just return empty arrays.
**Why it happens:** Supabase RLS defaults to deny-all when RLS is on. This is a safety feature but trips up developers who forget to add read policies.
**How to avoid:** Always create explicit SELECT and INSERT policies even when `with check (true)`. Verify by running a test query from the Supabase SQL Editor with `SET ROLE anon;` before deploying.
**Warning signs:** All `fetchLeaderboard()` calls return empty arrays even after inserting data.

### Pitfall 3: Vite Env Vars Must Be VITE_-Prefixed
**What goes wrong:** `import.meta.env.SUPABASE_URL` is always `undefined` — only `VITE_`-prefixed vars are exposed to the browser bundle.
**Why it happens:** Vite intentionally strips non-VITE_ env vars from the client bundle for security.
**How to avoid:** Use `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`. Add to `.env.local` for local dev and to GitHub Actions secrets for deployment.
**Warning signs:** `supabase` singleton is `null` in production despite setting env vars.

### Pitfall 4: GitHub Actions Secrets Not Passed to `npm run build`
**What goes wrong:** `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` are set as GitHub secrets but not exposed in the `env:` block of the build step in `deploy.yml`.
**Why it happens:** GitHub Actions secrets must be explicitly mapped to environment variables for each step. The existing `deploy.yml` only maps the three LLM keys.
**How to avoid:** Add both Supabase secrets to the `Build` step's `env:` block in `.github/workflows/deploy.yml`:
```yaml
- name: Build
  env:
    VITE_GEMINI_API_KEY: ${{ secrets.VITE_GEMINI_API_KEY }}
    VITE_GROQ_API_KEY: ${{ secrets.VITE_GROQ_API_KEY }}
    VITE_MISTRAL_API_KEY: ${{ secrets.VITE_MISTRAL_API_KEY }}
    VITE_SUPABASE_URL: ${{ secrets.VITE_SUPABASE_URL }}
    VITE_SUPABASE_ANON_KEY: ${{ secrets.VITE_SUPABASE_ANON_KEY }}
  run: npm run build
```
**Warning signs:** Leaderboard and allowlist persistence work locally but not on the deployed site.

### Pitfall 5: Leaderboard Time Display — `time_ms` is Elapsed Not Remaining
**What goes wrong:** Leaderboard shows 0ms or incorrect time because developer stored `timeLeft` (countdown remaining) instead of `timeElapsed`.
**Why it happens:** `GameScreen` tracks both `timeLeft` (countdown) and `timeElapsed`. The win condition fires when `verifiedCount >= targetCount`, and `state.timeElapsed` is the actual time played.
**How to avoid:** Always store `state.timeElapsed` (milliseconds played), not `state.timeLeft`. Sort leaderboard ascending by `time_ms` (lower = faster = better).

### Pitfall 6: LLM Allowlist `input_normalized` vs Canonical Name Mismatch
**What goes wrong:** User types "hermione granger" → LLM returns `{ name: "Hermione Granger", description: "..." }`. On next lookup, user types "Hermione Granger" (different case) → normalized input doesn't match stored "hermione granger".
**Why it happens:** Normalization (lowercase) must be applied consistently at both write time and read time.
**How to avoid:** `input_normalized` is always `normalizedInput` from `_doSearch` (already lowercased). Query must also normalize before lookup. The canonical name stored is the LLM's properly-cased name.

### Pitfall 7: `az-lol` and `lol-all` Victory Screens Have No `state.timeElapsed` in GameState Type
**What goes wrong:** AZGameScreen and LoLAllScreen have their own local state types (`AZState`, `LoLAllState`) with `timeElapsed`, but they are not using the shared `GameState` type.
**Why it happens:** These two screens were built independently from `GameScreen`. They each have their own reducer and state types.
**How to avoid:** Extract `timeElapsed` from their respective local state on win. Both screens already track `timeElapsed` correctly. The `game_id` for the leaderboard should be:
- `AZGameScreen` → `'az-lol'`
- `LoLAllScreen` → `'lol-all'`
- `GameScreen` → `state.selectedCategory.id`

---

## Code Examples

Verified patterns from official sources:

### Supabase Client Singleton
```typescript
// Source: https://supabase.com/docs/reference/javascript/initializing
// src/services/supabase.ts
import { createClient, SupabaseClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const supabase: SupabaseClient | null =
  supabaseUrl && supabaseAnonKey
    ? createClient(supabaseUrl, supabaseAnonKey)
    : null;
```

### Fetch Top-5 Leaderboard
```typescript
// Source: https://supabase.com/docs/reference/javascript/select
export async function fetchLeaderboard(gameId: string): Promise<LeaderboardEntry[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('leaderboard')
    .select('player_name, time_ms, created_at')
    .eq('game_id', gameId)
    .order('time_ms', { ascending: true })
    .limit(5);
  if (error) {
    console.warn('[Supabase] fetchLeaderboard error:', error.message);
    return [];
  }
  return data ?? [];
}
```

### Submit Leaderboard Entry
```typescript
// Source: https://supabase.com/docs/reference/javascript/insert
export async function submitLeaderboardEntry(
  gameId: string,
  playerName: string,
  timeMs: number
): Promise<boolean> {
  if (!supabase) return false;
  const { error } = await supabase
    .from('leaderboard')
    .insert({
      game_id: gameId,
      player_name: playerName.toUpperCase().slice(0, 5),
      time_ms: timeMs,
    });
  if (error) {
    console.warn('[Supabase] submitLeaderboardEntry error:', error.message);
    return false;
  }
  return true;
}
```

### Upsert LLM Allowlist Entry (ignore duplicate)
```typescript
// Source: https://supabase.com/docs/reference/javascript/upsert
export async function saveLlmAllowlistEntry(
  categoryId: string,
  inputNormalized: string,
  canonicalName: string,
  description: string
): Promise<void> {
  if (!supabase) return;
  const { error } = await supabase
    .from('llm_allowlist')
    .upsert(
      { category_id: categoryId, input_normalized: inputNormalized, canonical_name: canonicalName, description },
      { onConflict: 'category_id,input_normalized', ignoreDuplicates: true }
    );
  if (error) console.warn('[Supabase] saveLlmAllowlistEntry error:', error.message);
}
```

### Query LLM Allowlist Before LLM Call
```typescript
// Source: https://supabase.com/docs/reference/javascript/select
export async function queryLlmAllowlist(
  categoryId: string,
  normalizedInput: string
): Promise<{ canonical_name: string; description: string } | null> {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from('llm_allowlist')
    .select('canonical_name, description')
    .eq('category_id', categoryId)
    .eq('input_normalized', normalizedInput)
    .maybeSingle();
  if (error) {
    console.warn('[Supabase] queryLlmAllowlist error:', error.message);
    return null;
  }
  return data;
}
```

---

## Victory Screen Analysis (All 3 Game Types)

The planner needs to know exactly how each game's victory screen works to add the leaderboard section.

### GameScreen.tsx (Standard categories — women, men, fictional, etc.)
- **Win condition:** `status === 'WIN'` set by reducer when `verifiedCount >= selectedCategory.targetCount`
- **Victory modal:** Lines 454–475 — a `.modal.victory-modal` div inside a `.modal-overlay`
- **Time to store:** `state.timeElapsed` (milliseconds elapsed since game start)
- **game_id:** `state.selectedCategory.id` (e.g., `'women'`, `'fictional-women'`)
- **Current content:** "You Did It!" heading, verified count, total time display, "Back to Categories" button
- **Insertion point:** After `<p>Total Time: ...</p>`, before action-buttons div

### AZGameScreen.tsx (A-Z LoL Champions)
- **Win condition:** `status === 'WIN'` set when `nextIndex >= 26` in `FILL_SLOT` action (line 41)
- **Victory modal:** Lines 207–219 — a `.modal.victory-modal` div
- **Time to store:** `state.timeElapsed`
- **game_id:** `'az-lol'` (hardcoded — uses `localStorage.getItem('game_besttime_az-lol')`)
- **Current content:** "You Did It!" heading, "A to Z completed in [time]", "Back to Categories" button
- **Insertion point:** After the `big-number` div, before action-buttons div

### LoLAllScreen.tsx (Name All LoL Champions)
- **Win condition:** `status === 'WIN'` set when `total >= TOTAL` (172 champions)
- **Victory modal:** Lines 333–354 — a `.modal.victory-modal` div
- **Time to store:** `state.timeElapsed`
- **game_id:** `'lol-all'` (hardcoded — uses `localStorage.getItem('game_besttime_lol-all')`)
- **Current content:** "You Did It!" heading, "All 172 champions found in [time]", optional guessed/revealed stats, "Back to Categories" button
- **Insertion point:** After stats-detail section, before action-buttons div

**Key difference for `LoLAllScreen`:** For pure speed records, a "lol-all" win where the player revealed many champions is arguably less impressive. The leaderboard entry could include or exclude revealed counts — but for simplicity, track raw `timeElapsed` only.

---

## LLM Allowlist Integration Point in wikidata.ts

The two LLM fallback blocks are at lines 484–511 in `_doSearch`. Both follow the same pattern:

```
const llmResult = await this.llmVerifyXxx(normalizedInput, ...)
if (llmResult) {
  const result: Woman = { id: ..., name: llmResult.name, description: llmResult.description }
  searchCache.set(cacheKey, result)
  return result  // <-- INSERT Supabase write here, before return
}
```

The Supabase write (`saveLlmAllowlistEntry`) is placed **after** `searchCache.set` and **before** `return result`. It must be fire-and-forget (`.catch(() => {})` or `void`) so it never delays the game.

The llm_allowlist **read** happens earlier in the flow — at the top of `_doSearch` before the Wikidata triple-search, but only for categories that use LLM fallback (`fictional-women`, `fictional-men`, `famous-asians`). For all other categories, skip the DB query entirely.

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Supabase v1 API | Supabase v2 (`@supabase/supabase-js@2`) | 2022 | v2 has breaking API changes from v1; use v2 |
| `supabase.from().select()` returning `{ body, error }` | Returns `{ data, error }` | v2 | `data` not `body` — common v1 mistake |

**Deprecated/outdated:**
- `supabase.from().select().then(...)` chaining with `.then()` directly: Works but `async/await` is preferred.
- `supabase.auth.session()`: v1 pattern, not relevant here since this app uses no auth.

---

## Open Questions

1. **Should `llm_allowlist` be queried for ALL wikidata-strategy categories, or only fictional/famous-asians?**
   - What we know: LLM fallback only fires for `fictional-women`, `fictional-men`, and `famous-asians`.
   - What's unclear: Whether future categories might also use LLM fallback.
   - Recommendation: Only query `llm_allowlist` in `_doSearch` for the three categories that have LLM fallback. Guard with `if (category.id === 'fictional-women' || ...)`.

2. **What is the `game_id` for leaderboard entries in `GameScreen` that have a timer (15min countdown)?**
   - What we know: `state.selectedCategory.id` is the category ID. Time is tracked as `timeElapsed` (count-up), not `timeLeft` (countdown).
   - What's unclear: Should leaderboard only apply to WIN condition (target reached), not GAME_OVER (time ran out)?
   - Recommendation: Only submit leaderboard entries on `status === 'WIN'`. GAME_OVER means the player didn't complete the target, so no leaderboard placement.

3. **Should the leaderboard include Zen Mode wins?**
   - What we know: Zen Mode continues after time runs out, and `timeElapsed` keeps ticking. A player could win in Zen Mode with a `timeElapsed` greater than 15 minutes.
   - Recommendation: Include Zen Mode wins but the time will naturally rank lower than non-Zen wins. No special handling needed.

4. **Free tier pause risk — should the app handle timeout gracefully?**
   - What we know: Free Supabase projects pause after 7 days of inactivity.
   - Recommendation: Set a request timeout of ~5 seconds on leaderboard fetch. If it times out, show no leaderboard data (empty state). The null-client pattern already handles this case at the code level; the cold-start delay is the UX concern.

---

## Sources

### Primary (HIGH confidence)
- https://supabase.com/docs/reference/javascript/initializing — Client initialization
- https://supabase.com/docs/reference/javascript/select — Select API
- https://supabase.com/docs/reference/javascript/insert — Insert API
- https://supabase.com/docs/reference/javascript/upsert — Upsert with ignoreDuplicates
- https://supabase.com/docs/guides/database/postgres/row-level-security — RLS policies
- https://supabase.com/docs/guides/getting-started/quickstarts/reactjs — Vite/React setup

### Secondary (MEDIUM confidence)
- https://uibakery.io/blog/supabase-pricing — Free tier limits (500MB storage, unlimited API requests, pauses after 7 days)
- https://medium.com/@focusgid/handling-environment-variables-in-vite-with-react-and-supabase-eaa4b3c9a0a4 — VITE_ prefix env var pattern verified against Vite docs

### Tertiary (LOW confidence)
- None — all critical claims verified against official Supabase docs.

---

## Metadata

**Confidence breakdown:**
- Standard stack (supabase-js v2): HIGH — official npm package, verified at docs
- SQL schema design: HIGH — standard PostgreSQL, no library-specific assumptions
- RLS policies: HIGH — verified against official Supabase RLS guide
- Vite env var pattern: HIGH — existing app already uses same VITE_ pattern for LLM keys
- GitHub Actions integration: HIGH — existing deploy.yml shows exact pattern to follow
- Free tier limits: MEDIUM — from pricing page, subject to change
- Leaderboard UX/flow: MEDIUM — based on reading all 3 game components, no official reference

**Research date:** 2026-03-25
**Valid until:** 2026-06-25 (90 days — Supabase API is stable v2, unlikely to change)

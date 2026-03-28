# Phase 9: Name All 50 States & Name All Gen 1 Pokémon - Research

**Researched:** 2026-03-27
**Domain:** React/TypeScript component cloning — hardcoded-list "name-all" game modes
**Confidence:** HIGH (all findings from direct codebase inspection)

## Summary

Phase 9 adds two new "name-all" game modes by cloning the existing `LoLAllScreen.tsx` component. The pattern is well-established: a self-contained screen component with its own `useReducer`, `localStorage` persistence, count-up timer, alphabetical chip board, reveal mechanic, and leaderboard integration. No new libraries are required — everything reuses the exact stack already in place.

The key insight is that `LoLAllScreen` uses `WikidataService.searchAllowlist()` for validation because LoL champions already exist in the ALLOWLISTS map inside `wikidata.ts`. States and Pokémon will **not** exist in that map, so the new screens must do their own inline string matching against their hardcoded lists (a simple `Array.find` with `.toLowerCase()` comparison). This avoids touching `wikidata.ts` entirely.

The home screen (`CategorySelectScreen`) reads from `CATEGORIES` array in `src/config/categories.ts`. Two new entries must be added there with a special `id` that matches the direct-route pattern (`lol-all`, `az-lol`). The routing branch in `CategorySelectScreen` must be extended to include the new IDs, and `App.tsx` needs two new `<Route>` elements.

**Primary recommendation:** Clone `LoLAllScreen.tsx` twice, swap the data source and game-specific strings, pick a new `STORAGE_KEY` and leaderboard `gameId` per game, add two category entries to `categories.ts`, extend the `CategorySelectScreen` navigate condition, and add two routes to `App.tsx`.

---

## Standard Stack

No new dependencies needed. This phase uses only what's already installed.

### Core (already installed)
| Library | Version (from package.json) | Purpose | Used By |
|---------|-----------------------------|---------|---------|
| react | existing | UI rendering | all screens |
| react-router-dom | existing | `useNavigate`, `<Route>` | `App.tsx`, screen components |
| framer-motion | existing | `motion.span` chip animation, `AnimatePresence` group collapse | `LoLAllScreen` — clone inherits |
| canvas-confetti | existing | Win celebration | `LoLAllScreen` — clone inherits |
| lucide-react | existing | `Search`, `AlertCircle`, `Clock` icons | `LoLAllScreen` — clone inherits |

### Reused Project Utilities
| File | Export | Used For |
|------|--------|----------|
| `src/utils/formatTime.ts` | `formatTime(ms, showMs)` | Timer display and victory modal |
| `src/utils/badWords.ts` | `isBadWord(name)` | Leaderboard name entry validation |
| `src/hooks/useLeaderboard.ts` | `useLeaderboard(gameId, myTimeMs)` | Victory modal leaderboard |
| `src/services/supabase.ts` | `supabase` singleton (indirect via hook) | No direct import needed |

**Installation:** No new packages required.

---

## Architecture Patterns

### Recommended Project Structure

```
src/
├── components/
│   ├── LoLAllScreen.tsx       # Existing — read-only reference
│   ├── StatesAllScreen.tsx    # NEW — clone of LoLAllScreen
│   └── PokemonAllScreen.tsx   # NEW — clone of LoLAllScreen
├── data/
│   ├── states-all.ts          # NEW — hardcoded string[] of 50 state names
│   └── pokemon-gen1.ts        # NEW — hardcoded string[] of 151 Gen 1 Pokémon names
└── config/
    └── categories.ts          # MODIFIED — add 2 new entries
```

### Pattern 1: Direct Hardcoded List (no WikidataService)

`LoLAllScreen` uses `WikidataService.searchAllowlist()` because the LoL allowlist is already registered in `wikidata.ts`'s `ALLOWLISTS` map. States and Pokémon are not in that map and should not be added there (it would contaminate `wikidata.ts` with unrelated data). Instead, the new screens do inline matching:

```typescript
// Source: direct codebase analysis of LoLAllScreen.tsx + wikidata.ts
// Inline validation — no WikidataService import needed
const result = ALL_ITEMS.find(
  (item) => item.toLowerCase() === inputValue.trim().toLowerCase()
);
if (!result) {
  dispatch({ type: 'SET_ERROR', payload: `"${inputValue.trim()}" is not recognized.` });
  return;
}
const canonicalLower = result.toLowerCase();
if (state.guessed.has(canonicalLower) || state.revealed.has(canonicalLower)) {
  dispatch({ type: 'SET_ERROR', payload: `${result} already found!` });
  return;
}
dispatch({ type: 'GUESS_CORRECT', payload: result });
```

This is simpler than the LoL path and keeps `wikidata.ts` clean.

### Pattern 2: Data File Format

The LoL allowlist is a JSON object array with many fields. States and Pokémon are plain name lists — no need for JSON with metadata. Use a `.ts` file that exports a `string[]`:

```typescript
// src/data/states-all.ts
export const ALL_STATES: string[] = [
  'Alabama', 'Alaska', 'Arizona', 'Arkansas', 'California',
  // ... 50 entries total, sorted alphabetically
];
```

```typescript
// src/data/pokemon-gen1.ts
export const ALL_POKEMON_GEN1: string[] = [
  'Bulbasaur', 'Ivysaur', 'Venusaur', 'Charmander', 'Charmeleon',
  // ... 151 entries total, sorted alphabetically for the board
];
```

Using `.ts` instead of `.json` avoids type assertion casts (LoL uses `allowlistRaw as Array<{ name: string }>`).

### Pattern 3: Routing — Direct Route (not /game/:categoryId)

Confirmed from `App.tsx` and `CategorySelectScreen.tsx`. "Name-all" style games use a top-level path, not the `/game/:categoryId` pattern used by `GameScreen`:

```typescript
// App.tsx — add alongside existing /lol-all route
<Route path="/states-all" element={<StatesAllScreen />} />
<Route path="/pokemon-gen1-all" element={<PokemonAllScreen />} />
```

`CategorySelectScreen` routes via a condition check on `cat.id`:

```typescript
// CategorySelectScreen.tsx — current condition
onClick={() => cat.id === 'lol-all' || cat.id === 'az-lol'
  ? navigate(`/${cat.id}`)
  : navigate(`/game/${cat.id}`)
}
```

This must be extended to include the two new IDs:

```typescript
onClick={() =>
  ['lol-all', 'az-lol', 'states-all', 'pokemon-gen1-all'].includes(cat.id)
    ? navigate(`/${cat.id}`)
    : navigate(`/game/${cat.id}`)
}
```

### Pattern 4: Category Entry in categories.ts

The `CategoryConfig` type supports `timeLimitMs: 0` for count-up-only (no countdown). `verificationStrategy` should be `'allowlist-only'` for documentation accuracy even though the new screens bypass `WikidataService` entirely. The `allowlistFile` field is not used by these screens — leave it as an empty string or a non-existent file name; it won't be imported.

```typescript
// src/config/categories.ts — new entries to append
{
  id: 'states-all',
  name: 'All 50 States',
  icon: '🗺️',
  accentColor: '#3498db',
  targetCount: 50,
  timeLimitMs: 0,
  allowlistFile: '',              // unused — screen does inline matching
  verificationStrategy: 'allowlist-only',
  inputPlaceholder: 'Type any US state name',
},
{
  id: 'pokemon-gen1-all',
  name: 'All Gen 1 Pokémon',
  icon: '🔴',
  accentColor: '#e74c3c',
  targetCount: 151,
  timeLimitMs: 0,
  allowlistFile: '',              // unused — screen does inline matching
  verificationStrategy: 'allowlist-only',
  inputPlaceholder: 'Type any Gen 1 Pokémon name',
},
```

### Pattern 5: localStorage Keys and Leaderboard Game IDs

Each game needs a unique `STORAGE_KEY` and leaderboard `gameId`. The existing pattern is:
- `LoLAllScreen`: `STORAGE_KEY = 'lol-all-progress'`, leaderboard id `'lol-all'`
- Best time key: `'game_besttime_lol-all'`

New games follow the same naming:
- States: `STORAGE_KEY = 'states-all-progress'`, leaderboard `gameId = 'states-all'`, best time key `'game_besttime_states-all'`
- Pokémon: `STORAGE_KEY = 'pokemon-gen1-all-progress'`, leaderboard `gameId = 'pokemon-gen1-all'`, best time key `'game_besttime_pokemon-gen1-all'`

The `CategorySelectScreen` reads best times via `localStorage.getItem(`game_besttime_${cat.id}`)` — so the key MUST match `game_besttime_${cat.id}` exactly. Since `cat.id` is `'states-all'` and `'pokemon-gen1-all'`, the keys above are correct.

### Pattern 6: CSS — Reuse lol-all-* Classes

All board UI classes (`lol-all-board`, `lol-all-group`, `lol-all-letter`, `lol-all-names`, `lol-all-chip`, `lol-all-chip--found`, `lol-all-chip--revealing`, `lol-all-chip--revealed`, `lol-all-revealed-tray`, `lol-all-revealed-label`, `lol-all-revealed-chips`) are defined in `App.css` and are generic enough to be reused unchanged. The new screens are visual clones — they should use these same class names.

No new CSS is needed unless a per-game accent color is desired on the chip `--found` state. The existing `lol-all-chip--found` is `background: #27ae60` (green) — this is game-neutral and works for both states and Pokémon.

### Anti-Patterns to Avoid

- **Don't add states/pokemon to `wikidata.ts` ALLOWLISTS:** Contaminates the service with unrelated domains; not necessary since the screens do inline matching.
- **Don't use the `/game/:categoryId` route:** States and Pokémon screens are standalone components, not `GameScreen` instances.
- **Don't import `WikidataService` in the new screens:** Unnecessary dependency; inline string matching is simpler and has no side effects.
- **Don't use `.json` data files with complex shape:** Plain `string[]` exported from `.ts` is cleaner than `Array<{name: string}>` JSON with type assertions.
- **Don't forget the best-time key format:** Must be `game_besttime_${cat.id}` or the home screen won't display the best time.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Count-up timer | Custom interval logic | Copy pattern from `LoLAllScreen` (TICK action + `setInterval` at 100ms) | Already proven, handles PAUSED state correctly |
| Win confetti | Custom animation | `canvas-confetti` (already installed, same pattern as LoLAllScreen) | Full confetti animation, canvas-isolate prevents z-index issues |
| Chip reveal mechanic | Custom timeout logic | Copy `handleChipClick` + `revealTimers` ref + 5s REVEAL_CANCEL pattern | Race condition handling already solved |
| Leaderboard | Custom Supabase calls | `useLeaderboard(gameId, timeElapsed)` hook | Handles null Supabase, loading, qualifies, rank calculation |
| Time display | Custom formatter | `formatTime(ms, true)` from `src/utils/formatTime.ts` | Already handles mm:ss.cc format |
| Bad word filter | Custom regex | `isBadWord(name)` from `src/utils/badWords.ts` | Leet-speak normalization already in place |

**Key insight:** This phase is a clone exercise. Every hard problem is already solved in `LoLAllScreen.tsx`. Copy the reducer, effects, and JSX structure verbatim, then change only: data source, STORAGE_KEY, leaderboard gameId, title text, placeholder text, and error messages.

---

## Common Pitfalls

### Pitfall 1: Best-Time Key Mismatch
**What goes wrong:** Home screen shows "Best: 0" instead of the saved best time.
**Why it happens:** `CategorySelectScreen` reads `game_besttime_${cat.id}`. If the screen saves the key differently (e.g., `'besttime-states'`), there's a mismatch.
**How to avoid:** Always set `localStorage.setItem('game_besttime_states-all', ...)` — the suffix must equal `cat.id` exactly.
**Warning signs:** Home card shows `Best: 0` after completing the game.

### Pitfall 2: CategorySelectScreen Navigate Condition Not Updated
**What goes wrong:** Clicking the new home card navigates to `/game/states-all` which renders `GameScreen` (wrong component) or falls through to the `*` catch-all redirect.
**Why it happens:** `CategorySelectScreen` has a hardcoded condition `cat.id === 'lol-all' || cat.id === 'az-lol'` that controls which route pattern to use.
**How to avoid:** Extend the condition array to include `'states-all'` and `'pokemon-gen1-all'`.
**Warning signs:** Clicking the card shows the wrong game or redirects home.

### Pitfall 3: Pokémon Name Casing
**What goes wrong:** Input `"bulbasaur"` doesn't match `"Bulbasaur"` if comparison isn't normalized.
**Why it happens:** Inline matching must use `.toLowerCase()` on both sides.
**How to avoid:** `ALL_ITEMS.find(item => item.toLowerCase() === input.toLowerCase())` — the canonical name returned has correct casing for display.
**Warning signs:** Correct answers rejected as "not recognized".

### Pitfall 4: Reveal Timer Leak on Unmount
**What goes wrong:** If user navigates away during a pending reveal, the timeout fires after unmount and dispatches to a dead reducer.
**Why it happens:** `revealTimers.current` holds window timeout IDs not cleaned up in a return function.
**How to avoid:** Add a cleanup effect — `LoLAllScreen` already has this pattern implicitly via the `status !== 'PLAYING'` guard but a proper cleanup effect on unmount is advisable. Copy the existing pattern as-is; it is functionally safe (React ignores dispatches to unmounted reducers via `useReducer`).
**Warning signs:** Console warnings about dispatching to unmounted components (unlikely with hooks but safe to be aware of).

### Pitfall 5: `allowlistFile: ''` TypeScript Error
**What goes wrong:** `CategoryConfig.allowlistFile` is typed as `string`, so `''` is valid. But if any code attempts to `import` it or pass it to `WikidataService`, the empty string will fail.
**Why it happens:** Not applicable — the new screens bypass `WikidataService` entirely and `GameScreen` is never rendered for these IDs.
**How to avoid:** Confirm the `allowlistFile` field is only consumed inside `wikidata.ts` via `ALLOWLISTS[categoryId]` lookups, which return `[]` for unregistered IDs — harmless.

---

## Code Examples

All patterns sourced from direct codebase inspection (HIGH confidence).

### Alphabetical Group Builder (same pattern for states/pokemon)
```typescript
// Source: LoLAllScreen.tsx lines 19-28
const ITEM_GROUPS: { letter: string; names: string[] }[] = [];
for (const name of ALL_ITEMS) {  // ALL_ITEMS is already sorted alphabetically
  const letter = name[0].toUpperCase();
  const group = ITEM_GROUPS.find(g => g.letter === letter);
  if (group) {
    group.names.push(name);
  } else {
    ITEM_GROUPS.push({ letter, names: [name] });
  }
}
```

### localStorage Progress Persistence Pattern
```typescript
// Source: LoLAllScreen.tsx lines 146-158
// Save on every state change (except WIN)
useEffect(() => {
  if (state.status === 'WIN') return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify({
    guessed: Array.from(state.guessed),
    revealed: Array.from(state.revealed),
    timeElapsed: state.timeElapsed,
  }));
}, [state.guessed, state.revealed, state.timeElapsed, state.status]);

// Clear on WIN (clean slate for next attempt)
useEffect(() => {
  if (state.status === 'WIN') localStorage.removeItem(STORAGE_KEY);
}, [state.status]);
```

### Best Time Save on WIN
```typescript
// Source: LoLAllScreen.tsx lines 177-183
useEffect(() => {
  if (state.status !== 'WIN') return;
  const saved = localStorage.getItem('game_besttime_states-all'); // match cat.id
  const current = saved ? parseInt(saved, 10) : Infinity;
  if (state.timeElapsed < current) {
    localStorage.setItem('game_besttime_states-all', state.timeElapsed.toString());
  }
}, [state.status, state.timeElapsed]);
```

### useLeaderboard Hook Invocation
```typescript
// Source: LoLAllScreen.tsx lines 140-143
const { entries, loading, unavailable, qualifies, playerRank, submitName, submitted } = useLeaderboard(
  state.status === 'WIN' ? 'states-all' : '',   // gameId: empty string = no-op during play
  state.status === 'WIN' ? state.timeElapsed : 0
);
```

### Inline Name Matching (replaces WikidataService.searchAllowlist)
```typescript
// Source: derived from LoLAllScreen.tsx handleSubmit + LoLAllScreen's WikidataService call removed
const handleSubmit = (e: React.FormEvent) => {
  e.preventDefault();
  const raw = inputValue.trim();
  if (!raw || state.status !== 'PLAYING') return;
  setInputValue('');

  const result = ALL_STATES.find(s => s.toLowerCase() === raw.toLowerCase());

  if (!result) {
    dispatch({ type: 'SET_ERROR', payload: `"${raw}" is not a US state.` });
    return;
  }

  const canonicalLower = result.toLowerCase();
  if (state.guessed.has(canonicalLower) || state.revealed.has(canonicalLower)) {
    dispatch({ type: 'SET_ERROR', payload: `${result} already found!` });
    return;
  }

  dispatch({ type: 'GUESS_CORRECT', payload: result });
  inputRef.current?.focus();
};
```

---

## Complete Change Map

Every file that needs to change or be created:

| File | Change Type | What |
|------|-------------|------|
| `src/data/states-all.ts` | CREATE | `export const ALL_STATES: string[]` — 50 state names sorted A-Z |
| `src/data/pokemon-gen1.ts` | CREATE | `export const ALL_POKEMON_GEN1: string[]` — 151 Gen 1 names sorted A-Z |
| `src/components/StatesAllScreen.tsx` | CREATE | Clone of LoLAllScreen, inline matching, gameId `'states-all'` |
| `src/components/PokemonAllScreen.tsx` | CREATE | Clone of LoLAllScreen, inline matching, gameId `'pokemon-gen1-all'` |
| `src/config/categories.ts` | MODIFY | Append 2 entries: `states-all` and `pokemon-gen1-all` |
| `src/components/CategorySelectScreen.tsx` | MODIFY | Extend navigate condition to include new IDs |
| `src/App.tsx` | MODIFY | Add 2 `<Route>` elements |

No CSS changes needed — reuse all `lol-all-*` classes from `App.css`.

---

## State of the Art

| Old Approach | Current Approach | Impact |
|--------------|------------------|--------|
| N/A (new feature) | Clone LoLAllScreen, inline matching | Clean, zero-dependency addition |

The LoLAllScreen pattern is already the project's established "name-all" template. This phase simply replicates it twice with different data.

---

## Open Questions

1. **Pokémon name variant: "Mr. Mime" / "Farfetch'd" / "Nidoran♀" / "Nidoran♂"**
   - What we know: Some Gen 1 names have special characters or punctuation.
   - What's unclear: Should `"Mr Mime"` (no period) also accept? Should `"Nidoran"` accept for both gendered forms?
   - Recommendation: For phase 9, accept only exact canonical match (e.g., `"Mr. Mime"` required). Fuzzy matching for these edge cases can be a follow-up. Include both `Nidoran♀` and `Nidoran♂` as separate entries; player must type the special character OR the planner may choose to rename them `"Nidoran F"` and `"Nidoran M"` to avoid symbol input friction.

2. **Icon choices for home cards**
   - What we know: `categories.ts` uses emoji icons. `accentColor` sets the card's accent.
   - What's unclear: Exact emoji and color preferences are cosmetic.
   - Recommendation: `🗺️` + `#3498db` for States; `🔴` + `#e74c3c` for Pokémon. Planner can adjust.

3. **Supabase leaderboard table pre-population**
   - What we know: `fetchLeaderboard` queries `game_id = 'states-all'` against the existing `leaderboard` table. The table already supports any `game_id` string — no schema migration needed.
   - What's unclear: Nothing — confirmed from `supabase.ts` line 41: `.eq('game_id', gameId)` with no schema constraint on game_id values.
   - Recommendation: No DB migration required. New game IDs work immediately.

---

## Sources

### Primary (HIGH confidence)
- `src/components/LoLAllScreen.tsx` — complete implementation inspected (472 lines)
- `src/hooks/useLeaderboard.ts` — hook signature and behavior confirmed (66 lines)
- `src/App.tsx` — all routes inspected (21 lines)
- `src/components/CategorySelectScreen.tsx` — navigate condition confirmed (55 lines)
- `src/config/categories.ts` — CategoryConfig type and CATEGORIES array inspected (196 lines)
- `src/services/supabase.ts` — leaderboard helpers confirmed (148 lines)
- `src/utils/formatTime.ts` — signature confirmed
- `src/utils/badWords.ts` — export confirmed
- `src/App.css` — all `lol-all-*` CSS classes confirmed (lines 611–742)
- `src/services/wikidata.ts` — ALLOWLISTS map and searchAllowlist confirmed; states/pokemon absent

### Secondary (MEDIUM confidence)
- `.planning/STATE.md` — confirms Phase 8 complete, Phase 9 is next
- `.planning/ROADMAP.md` — confirms two-plan split (09-01 states, 09-02 pokemon)

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all imports verified from source files
- Architecture patterns: HIGH — derived from direct code inspection of LoLAllScreen
- CSS reuse: HIGH — all class names confirmed in App.css
- Routing pattern: HIGH — confirmed in App.tsx and CategorySelectScreen.tsx
- Pitfalls: HIGH — derived from actual code paths, not speculation

**Research date:** 2026-03-27
**Valid until:** 2026-04-27 (stable codebase — no external API dependencies for this phase)

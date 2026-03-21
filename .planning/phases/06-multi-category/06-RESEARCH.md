# Phase 6: Multi-Category Game Selection - Research

**Researched:** 2026-03-20
**Domain:** Multi-category config system, external data APIs (Riot Data Dragon, NBA Stats), React state architecture refactor
**Confidence:** HIGH (architecture analysis from source), MEDIUM (external APIs)

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

#### Launch categories
- **100 Famous Women** — existing category, keep as-is (Wikidata + LLM verified)
- **100 Famous Men** — male equivalent, same Wikidata + LLM pipeline
- **100 NBA Players** — all-time (legends + active), NBA Stats API as data source
- **100 LoL Champions** — all-time, Riot Data Dragon API as data source
- All four launch categories target 100 names and 15-minute time limit

#### Category config system
- Config-driven: a single TS/JSON config file where adding a new category = adding one entry
- Each category config defines: name, icon/emoji, accent color, target count, time limit, allowlist file path, data source type
- Per-category target count and time limit (all launch categories happen to be 100 / 15 min, but the system supports overrides)

#### Category card design
- Fixed width ~200px cards in a responsive flex-wrap layout (fills row, wraps to next on smaller screens)
- Each card shows: emoji icon, category name, personal best score
- Each category has a distinct accent color
- No difficulty label or entry count shown on card

#### Allowlist file structure
- Separate JSON files per category: `src/data/allowlist-women.json`, `allowlist-men.json`, `allowlist-nba.json`, `allowlist-lol.json`
- `build-allowlist.js` updated to accept a `--category` flag and generate the appropriate file
- LoL: fetch from Riot Data Dragon API (official, always up to date with new champion releases)
- NBA: fetch from NBA Stats API (all-time players)

#### Validation per category
- Famous Women / Men: existing Wikidata + LLM fuzzy matching pipeline
- NBA Players: fuzzy match against NBA Stats API dataset (exact + 2-char tolerance)
- LoL Champions: fuzzy match against Data Dragon champion list (exact + 2-char tolerance)

#### High score tracking
- High scores stored per category in localStorage (keyed by category ID)
- Each card on the home screen shows that category's best score

### Claude's Discretion
- Exact accent colors per category
- Card hover/active states
- How to handle "no score yet" on a card (e.g. "—" or "Best: —")
- Build script CLI design (flags, output messaging)

### Deferred Ideas (OUT OF SCOPE)
- None — discussion stayed within phase scope
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| CAT-01 | Config-driven category system — adding a category requires only one config entry | Category config TypeScript type pattern; existing `GameState` and reducer patterns identified for category-aware changes |
| CAT-02 | Category selection screen with cards on home page | Existing `.mode-btn` / `.score-pill` CSS patterns and `menu-card` container directly reusable; flex-wrap layout with `~200px` fixed-width cards |
| CAT-03 | Per-category allowlist files and high scores in localStorage | Allowlist JSON shape confirmed; localStorage key pattern identified (`100women_highscore` → `game_highscore_<categoryId>`); NBA Stats API requires Node.js build-time fetch (CORS blocked in browser); Riot Data Dragon has free browser/node CORS access |
</phase_requirements>

---

## Summary

The app currently has a single hardcoded category ("100 Famous Women") baked into `App.tsx`, `GameState`, `wikidata.ts`, and `build-allowlist.js`. Every reference to "women" must be generalized to accept a category. The refactor has three distinct layers: (1) a TypeScript category config object that drives everything, (2) game state made category-aware by adding `selectedCategory: CategoryConfig` to `GameState` and threading it through the reducer and localStorage keys, and (3) a new category selection screen replacing the single mode button in the `IDLE` render branch.

The two new data sources have very different characteristics. **Riot Data Dragon** is a free, public, CORS-enabled CDN — fetch `https://ddragon.leagueoflegends.com/cdn/{version}/data/en_US/champion.json` from both the browser and Node.js without any key. As of patch 16.6.1 (March 2026) there are 184 champions. **NBA Stats API** (`stats.nba.com/stats/commonallplayers`) is **CORS-blocked in browsers** and requires specific headers (User-Agent, Referer, `x-nba-stats-origin`, `x-nba-stats-token`) when called from Node.js — this endpoint is only suitable for the `build-allowlist.js` script running at build time, not at game verification time. Both the NBA and LoL allowlists must therefore be built offline and shipped as static JSON.

For game-time verification of NBA and LoL categories, the approach is pure local allowlist fuzzy matching — no live API calls — identical to the existing `searchAllowlist` path in `wikidata.ts`. `WikidataService` needs a category-aware entry point: when `verificationStrategy` is `'allowlist-only'`, skip the Wikidata API entirely and go straight to the per-category allowlist.

**Primary recommendation:** Add `CategoryConfig` type → update `GameState` and reducer to carry selected category → split `App.tsx` IDLE branch into a `CategorySelectScreen` component → make `wikidata.ts` accept a category parameter → update `build-allowlist.js` with a `--category` flag dispatching to per-category fetch logic.

---

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| React + useReducer | 18.3.1 (already installed) | State management with category context | Already the project pattern; no new dependency needed |
| Vanilla CSS | — (already in App.css) | Category card styles | Project decision; no CSS framework |
| TypeScript | ^5.2.2 (already installed) | CategoryConfig type safety | Already project standard |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| framer-motion | ^12.36.0 (already installed) | Card hover/transition if desired | Already in project; optional use for category card enter animation |
| lucide-react | ^0.577.0 (already installed) | Icons on category cards if needed | Already in project |

### No New Packages Required
All required functionality (fetch, JSON import, localStorage, fuzzy matching) is covered by the existing stack. The build script uses native `fetch` (Node 18+) already used in `build-allowlist.js`.

**Installation:** None — no new packages.

---

## Architecture Patterns

### Recommended Project Structure
```
src/
├── config/
│   └── categories.ts        # CategoryConfig[] — single source of truth
├── data/
│   ├── allowlist-women.json # Existing (rename from allowlist.json)
│   ├── allowlist-men.json   # New
│   ├── allowlist-nba.json   # New (built by script)
│   └── allowlist-lol.json   # New (built by script)
├── types/
│   ├── game.ts              # Add selectedCategory to GameState
│   └── wikidata.ts          # Unchanged
├── services/
│   └── wikidata.ts          # Category-aware entry point
├── components/
│   └── CategorySelectScreen.tsx  # New — extracted IDLE branch
└── App.tsx                  # Thin: delegates to CategorySelectScreen or game
scripts/
└── build-allowlist.js       # Updated with --category flag
```

### Pattern 1: CategoryConfig Type
**What:** Single TypeScript interface drives all category-specific behavior — no scattered if/else
**When to use:** Every place that currently hardcodes "women" reads from the config instead

```typescript
// src/config/categories.ts
export type VerificationStrategy = 'wikidata' | 'allowlist-only';

export interface CategoryConfig {
  id: string;                    // 'women' | 'men' | 'nba' | 'lol'
  name: string;                  // Display name: "100 Famous Women"
  icon: string;                  // Emoji: "👩"
  accentColor: string;           // CSS hex: "#ff4757"
  targetCount: number;           // 100
  timeLimitMs: number;           // 15 * 60 * 1000
  allowlistFile: string;         // './allowlist-women.json' (relative to src/data)
  verificationStrategy: VerificationStrategy;
  wikidataGender?: string;       // Only for wikidata strategy: 'Q6581072' (female) | 'Q6581097' (male)
}

export const CATEGORIES: CategoryConfig[] = [
  {
    id: 'women',
    name: '100 Famous Women',
    icon: '👩',
    accentColor: '#ff4757',
    targetCount: 100,
    timeLimitMs: 15 * 60 * 1000,
    allowlistFile: 'allowlist-women.json',
    verificationStrategy: 'wikidata',
    wikidataGender: 'Q6581072',
  },
  {
    id: 'men',
    name: '100 Famous Men',
    icon: '👨',
    accentColor: '#2f86eb',
    targetCount: 100,
    timeLimitMs: 15 * 60 * 1000,
    allowlistFile: 'allowlist-men.json',
    verificationStrategy: 'wikidata',
    wikidataGender: 'Q6581097',
  },
  {
    id: 'nba',
    name: '100 NBA Players',
    icon: '🏀',
    accentColor: '#ff7f00',
    targetCount: 100,
    timeLimitMs: 15 * 60 * 1000,
    allowlistFile: 'allowlist-nba.json',
    verificationStrategy: 'allowlist-only',
  },
  {
    id: 'lol',
    name: '100 LoL Champions',
    icon: '⚔️',
    accentColor: '#9b59b6',
    targetCount: 100,
    timeLimitMs: 15 * 60 * 1000,
    allowlistFile: 'allowlist-lol.json',
    verificationStrategy: 'allowlist-only',
  },
];
```

### Pattern 2: Category-Aware GameState
**What:** Add `selectedCategory` to `GameState`; derive `CLASSIC_TIME_LIMIT` and target count from it; key localStorage per category ID
**When to use:** All reducer cases that reference time limits or game-over conditions

```typescript
// src/types/game.ts — additions
import { CategoryConfig } from '../config/categories';

export interface GameState {
  // ... existing fields unchanged ...
  selectedCategory: CategoryConfig;  // NEW — always set before PLAYING
}

// GameAction additions
export type GameAction =
  | { type: 'START_GAME'; payload: { category: CategoryConfig } }  // CHANGED: carries category
  // ... all other actions unchanged ...
```

**localStorage key pattern:** `game_state_<categoryId>` and `game_highscore_<categoryId>` — replaces the current hardcoded `'100women_state'` / `'100women_highscore'`.

### Pattern 3: Category Selection Screen Component
**What:** Extract the IDLE render branch of `App.tsx` into a dedicated component
**When to use:** `state.status === 'IDLE'`

```typescript
// src/components/CategorySelectScreen.tsx
interface Props {
  categories: CategoryConfig[];
  highScores: Record<string, number>;  // { [categoryId]: bestScore }
  onSelect: (category: CategoryConfig) => void;
}

// CSS: flex-wrap row of ~200px cards
// .category-grid { display: flex; flex-wrap: wrap; gap: 1rem; justify-content: center; }
// .category-card { width: 200px; flex-shrink: 0; ... }
```

### Pattern 4: Category-Aware WikidataService
**What:** Accept a `CategoryConfig` in `searchWoman` (rename to `searchName` or accept category param) and branch on `verificationStrategy`
**When to use:** Background queue processor in `App.tsx` passes current category

The key insight: for `verificationStrategy === 'allowlist-only'` categories, **skip all Wikidata API calls entirely** and go directly to `searchAllowlist` with the category's allowlist data loaded at module init time.

```typescript
// wikidata.ts — new signature
async search(input: string, category: CategoryConfig): Promise<Woman | null> {
  if (category.verificationStrategy === 'allowlist-only') {
    return this.searchAllowlist(input, category.id);
  }
  // ... existing Wikidata pipeline with wikidataGender from category ...
}
```

The allowlist data must be loaded per-category. Use dynamic imports or a map keyed by category ID:

```typescript
// Load allowlists at module level (Vite handles JSON imports)
import womenData from '../data/allowlist-women.json';
import menData from '../data/allowlist-men.json';
import nbaData from '../data/allowlist-nba.json';
import lolData from '../data/allowlist-lol.json';

const ALLOWLISTS: Record<string, AllowlistEntry[]> = {
  women: womenData as AllowlistEntry[],
  men: menData as AllowlistEntry[],
  nba: nbaData as AllowlistEntry[],
  lol: lolData as AllowlistEntry[],
};
```

### Pattern 5: Build Script `--category` Flag
**What:** `build-allowlist.js` dispatches to a per-category fetch function based on `--category <id>` arg
**When to use:** `npm run build:allowlist -- --category nba`

```javascript
// Argument parsing (no extra deps, already using ESM)
const args = process.argv.slice(2);
const categoryIdx = args.indexOf('--category');
const categoryId = categoryIdx !== -1 ? args[categoryIdx + 1] : 'women';

const CATEGORY_BUILDERS = {
  women: buildWomenAllowlist,   // existing logic
  men: buildMenAllowlist,        // new — same pipeline, wikidataGender: 'Q6581097'
  nba: buildNBAAllowlist,        // new — NBA Stats API (Node.js only)
  lol: buildLoLAllowlist,        // new — Riot Data Dragon
};

await CATEGORY_BUILDERS[categoryId]();
```

### Anti-Patterns to Avoid
- **Keeping `CLASSIC_TIME_LIMIT` as a top-level constant in App.tsx:** It must be derived from `state.selectedCategory.timeLimitMs` once category is in state. Delete the constant.
- **Checking `game.women` length against hardcoded `100`:** Use `category.targetCount`. The win condition check in the reducer (`verifiedCount >= 100`) must use the selected category.
- **Renaming `allowlist.json` in-place without updating the import:** `wikidata.ts` line 4 imports `'../data/allowlist.json'` — this import path changes to a per-category map.
- **Calling NBA Stats API from the browser/game:** CORS-blocked. NBA data is build-time only, shipped as static JSON.
- **One global high score:** Must be per-category; the existing `highScore` useState and `localStorage.getItem('100women_highscore')` must become a `Record<string, number>` loaded for all categories on mount.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Fuzzy name matching for NBA/LoL | Custom distance algo | `fuzzyMatchNames` from `src/utils/fuzzyMatch.ts` | Already exists, already tested, already correct (2-char / 80% rule) |
| LoL champion name list | Web scraping | `https://ddragon.leagueoflegends.com/cdn/{version}/data/en_US/champion.json` | Official, CORS-enabled, no key required, 184 champions as of patch 16.6.1 |
| NBA player list fetch | Manual CSV scraping | `stats.nba.com/stats/commonallplayers?IsOnlyCurrentSeason=0&LeagueID=00&Season=2024-25` | Returns all historical players; use at build time (Node.js) with proper headers |
| High score storage | IndexedDB or server | `localStorage` (already used) | Consistent with existing `100women_highscore` pattern; extend with per-category keys |

**Key insight:** The fuzzy matching utility, Wikidata service structure, and localStorage pattern are all reusable as-is. The refactor is primarily about threading `CategoryConfig` through existing code, not building new subsystems.

---

## Common Pitfalls

### Pitfall 1: NBA Stats API CORS Block
**What goes wrong:** Calling `stats.nba.com` from the game's front-end (browser) returns a CORS error and/or gets IP-blocked.
**Why it happens:** stats.nba.com does not set `Access-Control-Allow-Origin` headers for browser requests, and has historically blocked cloud IP ranges.
**How to avoid:** NBA data is **build-time only**. `build-allowlist.js --category nba` fetches it in Node.js with proper headers (`User-Agent: Mozilla/5.0...`, `Referer: https://www.nba.com/`, `x-nba-stats-origin: statscall`, `x-nba-stats-token: true`). The output is a static `allowlist-nba.json` that ships with the app.
**Warning signs:** If anyone proposes calling the NBA API from WikidataService or App.tsx, reject it.

### Pitfall 2: Stale selectedCategory in Reducer
**What goes wrong:** The reducer is called with actions that depend on `category.targetCount` or `category.timeLimitMs` but the category is not yet in state (initial IDLE state).
**Why it happens:** `initialState` must have a default `selectedCategory`. Setting it to `null` and using optional chaining everywhere creates widespread typescript noise.
**How to avoid:** Set `initialState.selectedCategory = CATEGORIES[0]` (women) as a sensible default. The actual selection is set in `START_GAME` payload and stored in state.

### Pitfall 3: localStorage Key Collision Between Categories
**What goes wrong:** Two categories overwrite each other's saved game state.
**Why it happens:** The current keys `'100women_state'` and `'100women_highscore'` are hardcoded strings.
**How to avoid:** Change to `game_state_${category.id}` and `game_highscore_${category.id}`. On mount, load high scores for all categories into a `Record<string, number>` map.

### Pitfall 4: Vite Static JSON Import for Missing File
**What goes wrong:** Build fails at `vite build` if `allowlist-nba.json` or `allowlist-lol.json` does not exist when the app is built.
**Why it happens:** Vite resolves static JSON imports at build time. If the file is absent, the build errors.
**How to avoid:** Either (a) commit stub empty allowlist files (`[]`) that get replaced by the build script, or (b) use dynamic `import()` with a fallback. Committing stubs is simpler and aligns with the existing `allowlist.json` pattern.

### Pitfall 5: LoL Champion JSON Key is Champion ID, Not Name
**What goes wrong:** Iterating `Object.values(champData.data)` gives objects where `.id` is the key (e.g., `"Jarvan IV"` uses id `"JarvanIV"`) but `.name` is the display name.
**Why it happens:** The Data Dragon `champion.json` uses a camelCase key for lookups but stores the actual display name in the `name` field.
**How to avoid:** Always use `champion.name` (e.g., `"Jarvan IV"`, `"Twisted Fate"`) for the allowlist, not `champion.id` (`"JarvanIV"`, `"TwistedFate"`). Store both as aliases in the allowlist entry.

### Pitfall 6: `GameWoman` Type Uses `women` Terminology
**What goes wrong:** `GameState.women: GameWoman[]` is semantically wrong for NBA players or LoL champions — but renaming breaks existing code.
**Why it happens:** The type was designed for a single category.
**How to avoid:** Rename `GameState.women` to `GameState.entries` and `GameWoman` to `GameEntry` as part of this phase. The `Woman` type in `wikidata.ts` can be renamed to `GameEntity` or kept as-is if the planner prefers minimal churn — accept either approach but document the rename decision.

---

## Code Examples

### Riot Data Dragon — Fetch All Champions (Build Script)
```javascript
// scripts/build-allowlist.js — buildLoLAllowlist()
// Source: https://developer.riotgames.com/docs/lol (Data Dragon section)
async function buildLoLAllowlist() {
  // Step 1: Get latest version
  const versionsRes = await fetch('https://ddragon.leagueoflegends.com/api/versions.json');
  const versions = await versionsRes.json();
  const latestVersion = versions[0]; // e.g. "16.6.1"

  // Step 2: Fetch champion summary
  const champRes = await fetch(
    `https://ddragon.leagueoflegends.com/cdn/${latestVersion}/data/en_US/champion.json`
  );
  const champData = await champRes.json();

  // Step 3: Build allowlist entries
  const allowlist = Object.values(champData.data).map(champ => ({
    name: champ.name,            // "Jarvan IV" — display name
    aliases: [champ.id],         // "JarvanIV" — alias for matching typos like "jarvaniv"
    platform: 'lol',
    genderSource: 'riot-ddragon',
  }));

  await fs.writeFile(LOL_OUTPUT_PATH, JSON.stringify(allowlist, null, 2));
  console.log(`Wrote ${allowlist.length} LoL champions`);
}
```

### NBA Stats API — Fetch All-Time Players (Build Script, Node.js Only)
```javascript
// scripts/build-allowlist.js — buildNBAAllowlist()
// Source: https://github.com/swar/nba_api/blob/master/docs/nba_api/stats/endpoints/commonallplayers.md
async function buildNBAAllowlist() {
  const url = 'https://stats.nba.com/stats/commonallplayers?IsOnlyCurrentSeason=0&LeagueID=00&Season=2024-25';

  // REQUIRED: NBA.com blocks requests without these headers
  const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Referer': 'https://www.nba.com/',
    'Accept': 'application/json, text/plain, */*',
    'Accept-Language': 'en-US,en;q=0.9',
    'x-nba-stats-origin': 'statscall',
    'x-nba-stats-token': 'true',
    'Connection': 'keep-alive',
  };

  const res = await fetch(url, { headers });
  const data = await res.json();

  // Response shape: { resultSets: [{ headers: [...], rowSet: [[...], ...] }] }
  const resultSet = data.resultSets[0];
  const colHeaders = resultSet.headers;
  const rows = resultSet.rowSet;

  const nameIdx = colHeaders.indexOf('DISPLAY_FIRST_LAST');

  const allowlist = rows
    .map(row => ({
      name: row[nameIdx],       // "LeBron James"
      aliases: [],
      platform: 'nba',
      genderSource: 'nba-stats-api',
    }))
    .filter(entry => entry.name && entry.name.trim() !== '');

  await fs.writeFile(NBA_OUTPUT_PATH, JSON.stringify(allowlist, null, 2));
  console.log(`Wrote ${allowlist.length} NBA players`);
}
```

### Category-Aware High Score Load (App.tsx mount effect)
```typescript
// Load all category high scores on mount
const [highScores, setHighScores] = useState<Record<string, number>>({});

useEffect(() => {
  const scores: Record<string, number> = {};
  for (const cat of CATEGORIES) {
    const saved = localStorage.getItem(`game_highscore_${cat.id}`);
    scores[cat.id] = saved ? parseInt(saved, 10) || 0 : 0;
  }
  setHighScores(scores);
}, []);
```

### CategorySelectScreen CSS Pattern
```css
/* App.css additions — aligns with existing .mode-btn pattern */
.category-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 1rem;
  justify-content: center;
  padding: 1rem 0;
}

.category-card {
  width: 200px;
  flex-shrink: 0;
  background: var(--white);
  border: 3px solid var(--secondary);
  border-radius: 20px;
  padding: 1.5rem 1rem;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.5rem;
  cursor: pointer;
  transition: all 0.2s;
  /* Override border color with per-category accent via inline style */
}

.category-card:hover {
  transform: translateY(-5px);
  box-shadow: 0 10px 20px rgba(0,0,0,0.1);
}
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Single hardcoded category in App.tsx | `CategoryConfig[]` array drives all game instances | This phase | No code changes needed for new categories post-phase |
| `'100women_state'` localStorage key | `game_state_<categoryId>` per-category key | This phase | Existing saved games in old key will be orphaned — acceptable for a development build |
| `WikidataService.searchWoman()` | `WikidataService.search(input, category)` | This phase | NBA/LoL bypass Wikidata entirely; women/men use existing Wikidata pipeline with gender from config |
| `allowlist.json` (single file) | `allowlist-<id>.json` per category | This phase | Rename existing file to `allowlist-women.json`; update the single import in `wikidata.ts` |

**Deprecated/outdated:**
- `CLASSIC_TIME_LIMIT` constant in `App.tsx`: replaced by `category.timeLimitMs`
- `state.women` field name: recommend rename to `state.entries` in this phase
- `'100women_highscore'` localStorage key: replaced by per-category keys

---

## Open Questions

1. **NBA Stats API reliability**
   - What we know: The endpoint works in Node.js with the listed headers; it has historically required header tweaks as NBA.com updates their anti-bot measures
   - What's unclear: Whether the exact header set above will work in March 2026 — NBA.com has changed requirements periodically
   - Recommendation: The build script should include clear error messaging if the request fails (non-200 or missing `resultSets`), and document the required headers in a comment. The LoL script is a reliable fallback to test first; if NBA fails, the stub allowlist approach (manually curated `allowlist-nba.json`) is the backup plan.

2. **`GameWoman` / `Woman` type rename scope**
   - What we know: `GameState.women`, `GameWoman`, and `WikidataService.searchWoman` are semantically wrong for multi-category but renaming touches many files
   - What's unclear: Whether the planner should rename in this phase or leave it as tech debt
   - Recommendation: Rename in this phase while the files are already being touched. Minimal additional cost vs. long-term confusion. Rename: `women` → `entries`, `GameWoman` → `GameEntry`, `searchWoman` → `search`.

3. **`allowlist.json` → `allowlist-women.json` rename**
   - What we know: `wikidata.ts` line 4 has `import allowlistData from '../data/allowlist.json'` — this must be updated
   - What's unclear: Whether there are other importers
   - Recommendation: Grep for `allowlist.json` during implementation (`grep -r "allowlist.json" src/`) — only one import found in current codebase, but verify.

---

## Sources

### Primary (HIGH confidence)
- Source code analysis: `src/App.tsx`, `src/types/game.ts`, `src/services/wikidata.ts`, `src/utils/fuzzyMatch.ts`, `scripts/build-allowlist.js` — all read directly
- `https://ddragon.leagueoflegends.com/api/versions.json` — confirmed latest version 16.6.1 (March 2026)
- `https://ddragon.leagueoflegends.com/cdn/16.6.1/data/en_US/champion.json` — confirmed 184 champions, `name` field is display name, `id` is camelCase key
- `https://developer.riotgames.com/docs/lol` — confirmed Data Dragon is CORS-enabled, no API key required

### Secondary (MEDIUM confidence)
- [swar/nba_api commonallplayers docs](https://github.com/swar/nba_api/blob/master/docs/nba_api/stats/endpoints/commonallplayers.md) — endpoint URL, parameters, `IsOnlyCurrentSeason=0` for all-time
- [riot-api-libraries Data Dragon CORS docs](https://riot-api-libraries.readthedocs.io/en/latest/ddragon.html) — confirmed CORS-enabled for Data Dragon (not main Riot API)
- Multiple sources confirm NBA Stats API CORS block for browsers and required headers

### Tertiary (LOW confidence — validate during implementation)
- NBA Stats API required headers (`x-nba-stats-origin`, `x-nba-stats-token`, specific User-Agent) — confirmed by community sources but NBA.com may have changed requirements since last validation; **test the build script before relying on it**
- NBA Stats `rowSet` response shape — documented in nba_api Python library; verify actual column order in Node.js response during implementation

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new packages; all patterns from existing codebase
- Architecture (CategoryConfig, GameState changes): HIGH — derived directly from source code analysis
- LoL Data Dragon API: HIGH — directly verified via live fetch, official docs, confirmed CORS access
- NBA Stats API (build-time): MEDIUM — URL and parameters confirmed via docs; exact headers are community-sourced and may need adjustment
- Pitfalls: HIGH for CORS/localStorage/import issues (pattern-based); MEDIUM for NBA header specifics

**Research date:** 2026-03-20
**Valid until:** 2026-04-20 for LoL Data Dragon (stable CDN); 2026-03-27 for NBA Stats API headers (re-verify before build script execution — NBA.com changes frequently)

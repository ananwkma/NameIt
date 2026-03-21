# Phase 6: Multi-Category Game Selection - Context

**Gathered:** 2026-03-20
**Status:** Ready for planning

<domain>
## Phase Boundary

Replace the single "100 Women" card on the home screen with a multi-category selection screen. Each category has its own allowlist file, card on the home screen, game rules (target count + time limit), and high score. The game loop itself is unchanged — only the entry point and data sourcing expand.

</domain>

<decisions>
## Implementation Decisions

### Launch categories
- **100 Famous Women** — existing category, keep as-is (Wikidata + LLM verified)
- **100 Famous Men** — male equivalent, same Wikidata + LLM pipeline
- **100 NBA Players** — all-time (legends + active), NBA Stats API as data source
- **100 LoL Champions** — all-time, Riot Data Dragon API as data source
- All four launch categories target 100 names and 15-minute time limit

### Category config system
- Config-driven: a single TS/JSON config file where adding a new category = adding one entry
- Each category config defines: name, icon/emoji, accent color, target count, time limit, allowlist file path, data source type
- Per-category target count and time limit (all launch categories happen to be 100 / 15 min, but the system supports overrides)

### Category card design
- Fixed width ~200px cards in a responsive flex-wrap layout (fills row, wraps to next on smaller screens)
- Each card shows: emoji icon, category name, personal best score
- Each category has a distinct accent color
- No difficulty label or entry count shown on card

### Allowlist file structure
- Separate JSON files per category: `src/data/allowlist-women.json`, `allowlist-men.json`, `allowlist-nba.json`, `allowlist-lol.json`
- `build-allowlist.js` updated to accept a `--category` flag and generate the appropriate file
- LoL: fetch from Riot Data Dragon API (official, always up to date with new champion releases)
- NBA: fetch from NBA Stats API (all-time players)

### Validation per category
- Famous Women / Men: existing Wikidata + LLM fuzzy matching pipeline
- NBA Players: fuzzy match against NBA Stats API dataset (exact + 2-char tolerance)
- LoL Champions: fuzzy match against Data Dragon champion list (exact + 2-char tolerance)

### High score tracking
- High scores stored per category in localStorage (keyed by category ID)
- Each card on the home screen shows that category's best score

### Claude's Discretion
- Exact accent colors per category
- Card hover/active states
- How to handle "no score yet" on a card (e.g. "—" or "Best: —")
- Build script CLI design (flags, output messaging)

</decisions>

<specifics>
## Specific Ideas

- Cards should use the same compact ~200px style as the mockup: icon + name on one line, best score below
- Responsive layout: flex-wrap so cards fill a row and overflow to next row on smaller screens — not a fixed 2-column grid
- LoL and NBA categories use the same fuzzy matching logic as the existing categories (exact + fuzzy, all-time)

</specifics>

<deferred>
## Deferred Ideas

- None — discussion stayed within phase scope

</deferred>

---

*Phase: 06-multi-category*
*Context gathered: 2026-03-20*

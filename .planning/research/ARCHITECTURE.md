# Architecture Patterns: Wikidata Verification

**Domain:** Entity Linking & Fuzzy Matching
**Researched:** 2024-05-24

## Recommended Architecture: Hybrid Search & Validate

The system follows a two-stage pipeline to balance the scale of Wikidata with the strictness of project requirements.

### Component Boundaries

| Component | Responsibility | Communicates With |
|-----------|---------------|-------------------|
| `SearchService` | Fetch candidates via Wikidata API. | Wikidata `wbsearchentities` |
| `ContextPreprocessor` | Resolve prefixes (e.g., "rv" -> "Red Velvet"). | `SearchService`, `SPARQLService` |
| `SPARQLService` | Fetch detailed metadata (gender, occupation, sitelinks). | Wikidata Query Service (WQS) |
| `FuzzyMatcher` | Apply local string similarity algorithms (Levenshtein, Jaro-Winkler). | `SearchService`, `SPARQLService` |

### Data Flow

1.  **Input:** User enters "rv wendy".
2.  **Pre-process:** `ContextPreprocessor` identifies "rv" prefix, maps to "Red Velvet" (Q17467200).
3.  **Search:** `SearchService` calls `wbsearchentities` for "wendy".
4.  **Metadata Fetch:** `SPARQLService` filters "wendy" candidates for:
    - Gender = female (Q6581072)
    - Member of = "Red Velvet" (Q17467200)
5.  **Validation:** `FuzzyMatcher` compares input "wendy" against result labels/aliases using 80% similarity threshold.
6.  **Result:** Returns the top-ranked "famous woman" or "not found".

## Patterns to Follow

### Pattern 1: Sitelinks for Fame Ranking
**What:** Use the `wikibase:sitelinks` property to rank results.
**When:** To disambiguate names like "Wendy" (South Korean singer vs. American talk show host).
**Example:**
```sparql
SELECT ?person ?sitelinks WHERE {
  ?person wdt:P31 wd:Q5;            # human
          wdt:P21 wd:Q6581072.      # female
  ?person wikibase:sitelinks ?sitelinks.
} ORDER BY DESC(?sitelinks) LIMIT 1
```

### Pattern 2: Local Fuzzy Validation (Levenshtein)
**What:** Final check on candidate strings.
**When:** After API returns top 10–50 candidates.
**Algorithm (Node.js/natural):**
```javascript
const natural = require('natural');
const similarity = natural.LevenshteinDistance("wendy", "rv wendy", { search: true });
// If normalized distance (1 - distance/length) > 0.8, then accept.
```

## Anti-Patterns to Avoid

### Anti-Pattern 1: Complex SPARQL for Text Search
**What:** Using `FILTER(REGEX(...))` in SPARQL for name search.
**Why bad:** Extremely slow on large datasets like Wikidata (often timeouts).
**Instead:** Use `wbsearchentities` API or the `mwapi` service inside SPARQL.

## Scalability Considerations

| Concern | At 100 users | At 10K users | At 1M users |
|---------|--------------|--------------|-------------|
| API Latency | OK (~200ms) | OK (~200ms) | Need caching (Redis) for common searches. |
| SPARQL Reliability | High | Medium (rate limits) | Aggressive caching + pre-fetching top 1000 names. |

## Sources

- [Wikidata API (wbsearchentities)](https://www.wikidata.org/w/api.php?action=help&modules=wbsearchentities)
- [SPARQL Performance Tuning](https://www.mediawiki.org/wiki/Wikidata_Query_Service/Query_Optimization)

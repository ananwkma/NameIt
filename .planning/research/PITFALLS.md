# Domain Pitfalls: Wikidata Verification

**Domain:** Entity Linking & Fuzzy Matching
**Researched:** 2024-05-24

## Critical Pitfalls

Mistakes that cause rewrites or major issues.

### Pitfall 1: Over-Reliance on Exact Matching
**What goes wrong:** Users enter "Jennie" but Wikidata's primary label is "Jennie Kim", or they enter "rv wendy" which isn't the primary label.
**Why it happens:** Standard API results focus on primary labels first.
**Prevention:** Use a hybrid search (search aliases) and local fuzzy similarity check.

### Pitfall 2: SPARQL Timeouts
**What goes wrong:** Large SPARQL queries (e.g., searching all female singers) time out.
**Why it happens:** Wikidata Query Service is shared globally and has strict time limits (~60s per query).
**Prevention:** Use `wbsearchentities` API for initial search and SPARQL only for metadata retrieval of specific IDs.

### Pitfall 3: Ambiguous Identifiers
**What goes wrong:** Multiple people share a common name (e.g., "Lisa").
**Why it happens:** Natural result of global fame.
**Prevention:** Rank by `wikibase:sitelinks` and show descriptions/images to help disambiguation if multiple candidates pass the threshold.

## Moderate Pitfalls

### Pitfall 1: Rate Limiting
**What goes wrong:** Application gets blocked by Wikidata for sending too many requests.
**Prevention:** Implement exponential backoff and cache common search results (e.g., for 24 hours).

## Minor Pitfalls

### Pitfall 1: Case Sensitivity
**What goes wrong:** Searching "RV Wendy" fails if it expects "rv wendy".
**Prevention:** Always normalize inputs to lowercase before matching locally.

## Phase-Specific Warnings

| Phase Topic | Likely Pitfall | Mitigation |
|-------------|---------------|------------|
| Core Search | Ambiguous Names | Rank results by `sitelinks` count. |
| Prefix Handling | Incomplete Group List | Start with a curated list of top K-pop/fandom abbreviations. |
| Fuzzy Matching | High False Positives | Set threshold to >= 80% similarity; reject anything lower. |

## Sources

- [Wikidata: Help:SPARQL/Optimization](https://www.wikidata.org/wiki/Wikibase/Query_Service/User_Manual#SPARQL_Optimization)
- [Wikidata: API Rate Limits](https://www.wikidata.org/w/api.php?action=help&modules=main)

# Research Summary: 100 Women Game Verification

This document synthesizes research into building a robust verification system for famous women using the Wikidata ecosystem. It outlines the technical strategy, architectural patterns, and roadmap implications.

## Executive Summary

The "100 Women Game" verification system will leverage **Wikidata** as its source of truth, utilizing its vast database of human entities (Q5) filtered by gender (female Q6581072). To ensure high performance and accuracy, the system will employ a **two-stage hybrid search pipeline**: an initial broad search via the Wikidata `wbsearchentities` API followed by localized **fuzzy matching** and deep metadata validation via **SPARQL**.

The primary challenge lies in disambiguating famous individuals with common names and handling specialized context clues (e.g., fandom-specific prefixes like "rv" for Red Velvet). The research recommends a "rank-by-fame" approach using Wikipedia `sitelinks` as a proxy for global significance, combined with a `ContextPreprocessor` to resolve abbreviations before querying the API.

Key risks include Wikidata's inherent API latency and SPARQL timeout constraints. These will be mitigated through aggressive caching of common search results, strict SPARQL query optimization, and a fallback to local fuzzy similarity thresholds (e.g., 80% Levenshtein distance) to handle minor typos and alias variations.

## Key Findings

### Core Tech Stack (from STACK.md)
*   **Primary Data:** Wikidata API (`wbsearchentities`) for fast entity search and SPARQL (WQS) for deep property filtering.
*   **Fuzzy Matching:** `natural` (Node.js) or `rapidfuzz` (Python) for localized string similarity checks.
*   **Integration:** `wikijs` (v6+) or `axios` for low-level MediaWiki API and SPARQL interaction.
*   **Version Req:** Use the latest Wikidata JSON API format (v1) for maximum compatibility.

### Essential Features (from FEATURES.md)
*   **Table Stakes:** Name search, female gender filtering (Q6581072), and occupation verification (P106).
*   **Differentiators:** "Fame Score" ranking based on `sitelinks` count; prefix handling for group abbreviations (e.g., "bp jennie").
*   **Deferred:** Real-time bio generation and direct database crawling (use API/SPARQL instead).

### Architectural Patterns (from ARCHITECTURE.md)
*   **Two-Stage Pipeline:** Search API first -> Fetch metadata (SPARQL) second -> Locally validate third.
*   **Fame Ranking:** Always rank results by `wikibase:sitelinks` to ensure the most famous "Wendy" or "Lisa" appears first.
*   **Local Validation:** Perform final string comparisons locally using fuzzy algorithms rather than relying on remote API scoring.

### Critical Risks (from PITFALLS.md)
*   **SPARQL Timeouts:** Never perform broad text searches via SPARQL; use it only for property retrieval on specific IDs.
*   **Exact Match Failure:** Users rarely type the "primary label" exactly; always check aliases and use fuzzy thresholds.
*   **Rate Limiting:** Wikidata is a shared resource; implement exponential backoff and 24-hour caching for common searches.

## Roadmap Implications

### Suggested Phase Structure

1.  **Phase 1: Core Search & Gender Filtering**
    *   *Rationale:* Establishes the basic "plumbing" for connecting to Wikidata.
    *   *Delivers:* Search input that returns only female human candidates.
    *   *Pitfalls to avoid:* Ignoring case sensitivity; over-reliance on exact matches.

2.  **Phase 2: Fame Ranking & Disambiguation**
    *   *Rationale:* Solves the problem of multiple people with the same name.
    *   *Delivers:* Automatic sorting of results by global fame (`sitelinks`).
    *   *Pitfalls to avoid:* SPARQL timeouts (must optimize queries).

3.  **Phase 3: Fuzzy Validation & Alias Support**
    *   *Rationale:* Improves UX by allowing for minor typos and common nicknames (e.g., "IU").
    *   *Delivers:* Locally computed similarity scores; acceptance of secondary labels.
    *   *Pitfalls to avoid:* High false positives (keep threshold >= 80%).

4.  **Phase 4: Context/Prefix Resolution**
    *   *Rationale:* High-value feature for fandom-specific use cases.
    *   *Delivers:* Mapping of "rv" -> "Red Velvet" and membership verification (P463).
    *   *Pitfalls to avoid:* Maintaining an outdated list of abbreviations (start with a curated core).

### Research Flags
*   **Needs `/gsd:research-phase`:** Phase 4 (Prefix Resolution) requires mapping common abbreviations to Wikidata QIDs.
*   **Standard Patterns:** Phase 1 and 3 follow well-documented MediaWiki API and NLP patterns.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | Wikidata is the industry standard for this data; JS libraries are mature. |
| Features | HIGH | Clear separation between "table stakes" and "differentiators". |
| Architecture | MEDIUM | SPARQL reliability can be intermittent; caching strategy is critical. |
| Pitfalls | HIGH | Wikidata's limitations (timeouts, rate limits) are well-documented. |

### Gaps to Address
*   **Group Mapping:** No exhaustive list of group abbreviations (e.g., "snsd", "twice", "ive") currently exists in the project; this needs manual curation or a specific SPARQL query to find common aliases for groups.
*   **UI Integration:** Research focuses on data/API; interaction design for disambiguation (e.g., "Did you mean...?") needs definition.

## Sources
*   [Wikidata API Documentation](https://www.wikidata.org/w/api.php?action=help&modules=wbsearchentities)
*   [Wikidata Query Service (SPARQL)](https://query.wikidata.org/)
*   [Natural - Node.js String Similarity](https://www.npmjs.com/package/natural)
*   [Wikipedia Sitelinks as Fame Proxy](https://meta.wikimedia.org/wiki/Wikidata/Sitelinks)

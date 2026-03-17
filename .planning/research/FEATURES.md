# Feature Landscape: Famous Women Verification

**Domain:** Wikidata Entity Matching
**Researched:** 2024-05-24

## Table Stakes

Features users expect for any "real-life person" verification system.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Name Search | Basic interaction. | Low | Use `wbsearchentities` for search. |
| Gender Filtering | Must be "female" (Q6581072). | Low | Built-in property filter in Wikidata. |
| Occupation Verification | Ensure it's not a generic name (e.g., must be singer, athlete). | Medium | Map broad categories (P106) to target human-readable labels. |
| Fame Score | Avoid obscure people with same name. | Medium | Use `sitelinks` count as proxy for global fame. |

## Differentiators

Features that make the verification "smarter" than a basic text search.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Prefix Handling | Support "rv wendy", "bp jennie", etc. | High | Regex for group abbreviations + membership verification (P463). |
| Fuzzy Similarity | Allow for minor typos (e.g., "Jennie" vs "Jenny"). | Medium | Implement local Levenshtein (2-char diff) or 80% similarity check. |
| Alias Support | Recognize "IU" as "Lee Ji-eun". | Low | Wikidata's `wbsearchentities` natively supports aliases. |
| Career Summary | Show "Singer for Red Velvet" during validation. | Low | Fetch description and "member of" property. |

## Anti-Features

Features to explicitly NOT build.

| Anti-Feature | Why Avoid | What to Do Instead |
|--------------|-----------|-------------------|
| Direct DB Crawl | Wikidata is too massive; search and SPARQL are optimized. | Use the API/SPARQL endpoints only. |
| Real-time Bio Generation | Too slow and prone to errors. | Fetch static "description" from Wikidata. |

## Feature Dependencies

```
Core Search (API) → Occupation/Gender Filtering → Fuzzy Validation → Prefix/Context Resolution
```

## MVP Recommendation

Prioritize:
1. **Core Search & Gender Filter:** Basic verification that name exists and person is female.
2. **Fame Score:** Use `sitelinks` > 5 (arbitrary threshold) to ensure person is "famous".
3. **Occupation Check:** Filter for "singer", "actress", etc.

Defer: **Prefix Handling** (v1.1) and **Strict Fuzzy Matching** (v1.2).

## Sources

- [Wikidata: Property:P106 (Occupation)](https://www.wikidata.org/wiki/Property:P106)
- [Wikidata: Property:P463 (Member of)](https://www.wikidata.org/wiki/Property:P463)
- [Wikipedia Sitelinks as fame proxy](https://meta.wikimedia.org/wiki/Wikidata/Sitelinks)

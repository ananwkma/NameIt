# Technology Stack: Wikidata Integration

**Project:** 100 Women Game (Wikidata Verification)
**Researched:** 2024-05-24

## Recommended Stack

### Core Data & APIs
| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| Wikidata API | Latest | Entity search & data retrieval | Largest open-source database of famous people. `wbsearchentities` is fast. |
| Wikidata SPARQL | WQS | Deep filtering & analytics | Complex queries (e.g., "all female singers in Red Velvet") that API can't do alone. |

### Fuzzy Matching Libraries
| Technology | Language | Purpose | Why |
|------------|----------|---------|-----|
| `natural` | Node.js | String similarity (Jaro-Winkler, Levenshtein) | Industry standard for Node.js NLP. Supports multiple algorithms. |
| `rapidfuzz` | Python | High-performance fuzzy matching | Extremely fast C++ implementation for large-scale local filtering. |

### Supporting Libraries
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `wikijs` | v6+ | MediaWiki API wrapper | Simplified interaction with Wikidata's search and entity APIs. |
| `axios` | Latest | Low-level HTTP requests | When direct SPARQL POST requests or custom API calls are needed. |

## Alternatives Considered

| Category | Recommended | Alternative | Why Not |
|----------|-------------|-------------|---------|
| Database | Wikidata | Freebase (Retired), DBpedia | Wikidata is actively maintained by the community and has the best K-pop/influencer coverage. |
| Matcher | Local Similarity | Elasticsearch Fuzzy | Setting up custom Elasticsearch is overkill for basic verification; use Wikidata's API first. |

## Installation

```bash
# Node.js
npm install natural wikijs axios
```

## Sources

- [Wikidata API (wbsearchentities)](https://www.wikidata.org/w/api.php?action=help&modules=wbsearchentities)
- [Wikidata Query Service (SPARQL)](https://query.wikidata.org/)
- [Natural - String Similarity (Node.js)](https://www.npmjs.com/package/natural)

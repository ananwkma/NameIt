import axios from 'axios';
import { Woman } from '../types/wikidata';
import { fuzzyMatchNames, fuzzyMatchAllowlist } from '../utils/fuzzyMatch';
import { CategoryConfig } from '../config/categories';
import womenData from '../data/allowlist-women.json';
import menData from '../data/allowlist-men.json';
import nbaData from '../data/allowlist-nba.json';
import lolData from '../data/allowlist-lol.json';

interface AllowlistEntry {
  name: string;
  aliases: string[];
  platform: string;
  genderSource: string;
}

const ALLOWLISTS: Record<string, AllowlistEntry[]> = {
  women: womenData as AllowlistEntry[],
  men: menData as AllowlistEntry[],
  nba: nbaData as AllowlistEntry[],
  lol: lolData as AllowlistEntry[],
};

const WIKIDATA_API_URL = 'https://www.wikidata.org/w/api.php';

const headers = {
  'Api-User-Agent': '100WomenGame/1.0 (contact@example.com)',
};

interface WomanCandidate extends Woman {
  sitelinks: number;
  aliases: string[];
  resolvedProperties: string[];
}

// In-memory caches for performance
const searchCache = new Map<string, Woman | null>();
const propertyLabelCache = new Map<string, string>();

export const WikidataService = {
  contextMap: {
    'bp': { qid: 'Q25056705', full: 'blackpink' },
    'blackpink': { qid: 'Q25056705', full: 'blackpink' },
    'rv': { qid: 'Q17430886', full: 'red velvet' },
    'red velvet': { qid: 'Q17430886', full: 'red velvet' },
    'snsd': { qid: 'Q20153', full: 'girls generation' },
    'twice': { qid: 'Q21014160', full: 'twice' },
    'ive': { qid: 'Q109355700', full: 'ive' },
    'aespa': { qid: 'Q101030999', full: 'aespa' },
    'itzy': { qid: 'Q60673413', full: 'itzy' },
    'loona': { qid: 'Q27163016', full: 'loona' },
    'bts': { qid: 'Q13854753', full: 'bts' },
    'newjeans': { qid: 'Q113189332', full: 'newjeans' },
    'lsxfm': { qid: 'Q111532454', full: 'le sserafim' },
    'lesserafim': { qid: 'Q111532454', full: 'le sserafim' },
    'idle': { qid: 'Q52222384', full: '(g)i-dle' },
  } as Record<string, { qid: string; full: string }>,

  async search(input: string, category: CategoryConfig): Promise<Woman | null> {
    // NEW: allowlist-only strategy — skip Wikidata entirely, use strict (exact) matching
    if (category.verificationStrategy === 'allowlist-only') {
      const normalizedInput = input.trim().toLowerCase();
      const match = this.searchAllowlist(normalizedInput, category.id, true);
      if (match) {
        searchCache.set(`${category.id}:${normalizedInput}`, match);
      }
      return match;
    }

    // Existing Wikidata pipeline below
    const normalizedInput = input.trim().toLowerCase();
    const cacheKey = `${category.id}:${normalizedInput}`;
    try {

      // Check search cache
      if (searchCache.has(cacheKey)) {
        console.log(`[DEBUG] Cache hit for search: "${normalizedInput}"`);
        return searchCache.get(cacheKey) || null;
      }

      const activeContexts: string[] = [];
      let cleanSearchQuery = normalizedInput;

      for (const [abbr, info] of Object.entries(this.contextMap)) {
        if (normalizedInput.includes(abbr)) {
          activeContexts.push(abbr);
          cleanSearchQuery = cleanSearchQuery.replace(abbr, info.full);
        }
      }

      // Extract the core name for a targeted fallback search
      const parts = normalizedInput.split(/\s+/);
      const namePart = parts.filter(w => !activeContexts.includes(w) && w !== 'loona').join(' ');

      console.log(`[DEBUG] Input: "${input}" -> Query: "${cleanSearchQuery}" | Name Only: "${namePart}"`);

      // 1. Triple Search Strategy
      const [searchA, searchB, searchC] = await Promise.all([
        axios.get(WIKIDATA_API_URL, {
          params: { action: 'query', list: 'search', srsearch: `${namePart} ${activeContexts.join(' ')}`, srlimit: 20, format: 'json', origin: '*' },
          headers,
        }),
        // Search B: Name only
        axios.get(WIKIDATA_API_URL, {
          params: { action: 'wbsearchentities', search: namePart || cleanSearchQuery, language: 'en', limit: 20, format: 'json', origin: '*' },
          headers,
        }),
        // Search C: Full string entity search
        axios.get(WIKIDATA_API_URL, {
          params: { action: 'wbsearchentities', search: cleanSearchQuery, language: 'en', limit: 20, format: 'json', origin: '*' },
          headers,
        })
      ]);

      const idsA = (searchA.data.query?.search || []).map((r: any) => r.title);
      const idsB = (searchB.data.search || []).map((r: any) => r.id);
      const idsC = (searchC.data.search || []).map((r: any) => r.id);

      // Combine all IDs and take ONLY TOP 5 for detailed fetching
      const allIds = Array.from(new Set([...idsA, ...idsC, ...idsB])).slice(0, 5).join('|');

      if (!allIds) {
        console.log(`[DEBUG] No Wikidata results found, will try allowlist.`);
        throw new Error('no_results');
      }

      // 2. Fetch detailed data for top candidates
      const entitiesResponse = await axios.get(WIKIDATA_API_URL, {
        params: {
          action: 'wbgetentities',
          ids: allIds,
          props: 'claims|labels|descriptions|sitelinks/urls|aliases',
          languages: 'en',
          format: 'json',
          origin: '*',
        },
        headers,
      });

      const entities = entitiesResponse.data.entities;
      const candidates: { id: string, entity: any, propertyQids: Set<string> }[] = [];
      const allReferencedQids = new Set<string>();

      for (const id in entities) {
        const entity = entities[id];
        const claims = entity.claims;
        if (!claims) continue;

        const isHuman = claims.P31?.some((c: any) => c.mainsnak.datavalue?.value.id === 'Q5');
        const isFemale = claims.P21?.some((c: any) => c.mainsnak.datavalue?.value.id === category.wikidataGender);

        if (isHuman && isFemale) {
          const propertyQids = new Set<string>();
          for (const prop in claims) {
            claims[prop].forEach((statement: any) => {
              const val = statement.mainsnak.datavalue?.value?.id;
              if (val && typeof val === 'string' && val.startsWith('Q')) {
                propertyQids.add(val);
                allReferencedQids.add(val);
              }
            });
          }
          candidates.push({ id, entity, propertyQids });
        }
      }

      // 3. Resolve Labels using cache for performance
      const qidArray = Array.from(allReferencedQids);
      const qidsToFetch = qidArray.filter(qid => !propertyLabelCache.has(qid));

      if (qidsToFetch.length > 0) {
        const chunkSize = 50;
        for (let i = 0; i < qidsToFetch.length; i += chunkSize) {
          const chunk = qidsToFetch.slice(i, i + chunkSize).join('|');
          const labelsResponse = await axios.get(WIKIDATA_API_URL, {
            params: { action: 'wbgetentities', ids: chunk, props: 'labels', languages: 'en', format: 'json', origin: '*' },
            headers,
          });
          const labelEntities = labelsResponse.data.entities;
          for (const qid in labelEntities) {
            propertyLabelCache.set(qid, labelEntities[qid].labels?.en?.value || 'Unknown');
          }
        }
      }

      const qidMap: Record<string, string> = {};
      for (const qid of qidArray) {
        qidMap[qid] = propertyLabelCache.get(qid) || 'Unknown';
      }

      // 4. Build Final Candidates
      const finalCandidates: WomanCandidate[] = candidates.map(c => {
        const resolvedProperties: string[] = [];
        c.propertyQids.forEach(qid => {
          const label = qidMap[qid];
          if (label) resolvedProperties.push(label.toLowerCase());
        });

        return {
          id: c.id,
          name: c.entity.labels?.en?.value || 'Unknown',
          description: c.entity.descriptions?.en?.value || '',
          sitelinks: Object.keys(c.entity.sitelinks || {}).length,
          aliases: (c.entity.aliases?.en || []).map((a: any) => a.value),
          resolvedProperties
        };
      });

      console.log(`[DEBUG] Found ${finalCandidates.length} valid candidates.`);

      // 5. Filter and Rank
      const filtered = finalCandidates.filter(c => this.checkMatch(normalizedInput.split(/\s+/), activeContexts, c));

      // Rank by: primary name match first, then by fame (sitelinks)
      filtered.sort((a, b) => {
        const aNameMatch = a.name.toLowerCase() === namePart || a.name.toLowerCase() === normalizedInput;
        const bNameMatch = b.name.toLowerCase() === namePart || b.name.toLowerCase() === normalizedInput;
        if (aNameMatch && !bNameMatch) return -1;
        if (bNameMatch && !aNameMatch) return 1;
        return b.sitelinks - a.sitelinks;
      });

      if (filtered.length > 0) {
        // Ambiguity check: top candidate should be significantly more "famous" if no explicit context match
        let passed = true;
        if (activeContexts.length === 0 && filtered.length > 1) {
          const top = filtered[0];
          const second = filtered[1];
          const topNameNormalized = top.name.toLowerCase();
          const inputMatchesTopDirectly = topNameNormalized === normalizedInput ||
            topNameNormalized.startsWith(normalizedInput) ||
            normalizedInput.startsWith(topNameNormalized);
          if (!inputMatchesTopDirectly && top.sitelinks < second.sitelinks * 1.5) {
            console.log(`[DEBUG] REJECTED: Ambiguity between "${top.name}" and "${second.name}".`);
            passed = false;
          }
        }

        if (passed) {
          const bestMatch = filtered[0];
          console.log(`[DEBUG] SUCCESS: Selected ${bestMatch.name} (${bestMatch.id})`);
          searchCache.set(cacheKey, bestMatch);
          return bestMatch;
        }
      } else {
        console.log('[DEBUG] All candidates filtered out.');
      }
    } catch (error) {
      console.error('[DEBUG] ERROR:', error);
    }

    // Fallback: check local allowlist (internet personalities not on Wikidata)
    const allowlistMatch = this.searchAllowlist(normalizedInput, category.id);
    if (allowlistMatch) {
      console.log(`[DEBUG] Allowlist match: ${allowlistMatch.name}`);
      searchCache.set(cacheKey, allowlistMatch);
      return allowlistMatch;
    }

    searchCache.set(cacheKey, null);
    return null;
  },

  searchAllowlist(input: string, categoryId: string = 'women', strict: boolean = false): Woman | null {
    const list = ALLOWLISTS[categoryId] || [];

    const descriptionLabel: Record<string, string> = {
      lol: 'LoL Champion',
      nba: 'NBA Player',
    };

    const makeResult = (entry: { name: string; platform: string }): Woman => ({
      id: `allowlist-${entry.name.toLowerCase().replace(/\s+/g, '-')}`,
      name: entry.name,
      description: descriptionLabel[entry.platform] || `${entry.platform} creator`,
    });

    // 1. Full name / alias match (exact or DL fuzzy)
    for (const entry of list) {
      const names = [entry.name.toLowerCase(), ...entry.aliases.map((a: string) => a.toLowerCase())];
      for (const name of names) {
        const isMatch = strict
          ? fuzzyMatchAllowlist(name, input)
          : (fuzzyMatchNames(name, input) || name === input || name.includes(input) || input.includes(name));
        if (isMatch) return makeResult(entry);
      }
    }

    // 2. Last-name match for allowlist-only categories (e.g. "durant" → "Kevin Durant")
    //    When multiple players share a last name, pick the one with the most years active.
    if (strict && input.length >= 3) {
      const lastNameMatches: Array<{ entry: typeof list[0]; yearsActive: number; toYear: number }> = [];

      for (const entry of list) {
        const parts = entry.name.trim().split(/\s+/);
        const lastName = parts[parts.length - 1].toLowerCase();
        if (fuzzyMatchAllowlist(lastName, input)) {
          const fromYear = (entry as unknown as Record<string, number>).fromYear ?? 0;
          const toYear   = (entry as unknown as Record<string, number>).toYear   ?? 0;
          lastNameMatches.push({ entry, yearsActive: toYear - fromYear, toYear });
        }
      }

      if (lastNameMatches.length === 1) {
        return makeResult(lastNameMatches[0].entry);
      }
      if (lastNameMatches.length > 1) {
        // Most years active wins; break ties by most recent (higher toYear)
        lastNameMatches.sort((a, b) =>
          b.yearsActive - a.yearsActive || b.toYear - a.toYear
        );
        return makeResult(lastNameMatches[0].entry);
      }

      // 3. First-name match — only resolves if the first name is unique in the dataset
      //    "giannis" → Giannis Antetokounmpo (unique), "jaylen" → no match (Jaylen Brown + others)
      const firstNameMatches = list.filter(entry => {
        const firstName = entry.name.trim().split(/\s+/)[0].toLowerCase();
        return fuzzyMatchAllowlist(firstName, input);
      });
      if (firstNameMatches.length === 1) {
        return makeResult(firstNameMatches[0]);
      }
    }

    return null;
  },

  checkMatch(inputWords: string[], activeContexts: string[], candidate: WomanCandidate): boolean {
    const targetNames = [
      candidate.name.toLowerCase(),
      ...candidate.aliases.map(a => a.toLowerCase())
    ];

    const namePart = inputWords.filter(w => !activeContexts.includes(w) && !this.contextMap[w]).join(' ');

    // 1. Name Match using Fuzzy Matching and Alias Check
    let nameMatch = false;
    if (!namePart) {
      nameMatch = true;
    } else {
      nameMatch = targetNames.some(name => {
        // Project Rule: 2-char diff OR 80% similarity
        if (fuzzyMatchNames(name, namePart)) return true;

        // Also support partial matches (e.g. "Billie" matches "Billie Eilish")
        if (name.includes(namePart) || namePart.includes(name)) return true;

        return false;
      });
    }

    if (!nameMatch) return false;

    // 2. Context Match
    if (activeContexts.length > 0) {
      const contextPass = activeContexts.some(ctx => {
        const info = this.contextMap[ctx];
        const contextTerm = info ? info.full : ctx;

        const propertyMatch = candidate.resolvedProperties.some(prop => prop.includes(contextTerm));
        const fullText = `${candidate.name} ${candidate.description} ${candidate.aliases.join(' ')}`.toLowerCase();

        return propertyMatch || fullText.includes(contextTerm);
      });

      if (!contextPass) {
        // Fallback: Check if the input words themselves appear in resolved properties
        const manualContextMatch = inputWords.some(w => {
           if (targetNames.some(n => n.includes(w))) return false;
           return candidate.resolvedProperties.some(p => p.includes(w));
        });
        if (manualContextMatch) return true;

        return false;
      }
    }

    return true;
  },

  // Helper for testing to clear state between tests
  clearCaches() {
    searchCache.clear();
    propertyLabelCache.clear();
  }
};

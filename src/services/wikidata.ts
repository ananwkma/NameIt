import axios from 'axios';
import { Woman } from '../types/wikidata';
import { fuzzyMatchNames, fuzzyMatchAllowlist } from '../utils/fuzzyMatch';
import { CategoryConfig } from '../config/categories';
import womenData from '../data/allowlist-women.json';
import menData from '../data/allowlist-men.json';
import nbaData from '../data/allowlist-nba.json';
import lolData from '../data/allowlist-lol.json';
import fictionalWomenData from '../data/allowlist-fictional-women.json';
import fictionalMenData from '../data/allowlist-fictional-men.json';
import famousAsiansData from '../data/allowlist-famous-asians.json';
import animalsData from '../data/allowlist-animals.json';

interface AllowlistEntry {
  name: string;
  aliases: string[];
  platform: string;
  gender?: string;
  genderSource: string;
  description?: string;
}

const ALLOWLISTS: Record<string, AllowlistEntry[]> = {
  women: womenData as AllowlistEntry[],
  men: menData as AllowlistEntry[],
  nba: nbaData as AllowlistEntry[],
  lol: lolData as AllowlistEntry[],
  'fictional-women': fictionalWomenData as AllowlistEntry[],
  'fictional-men': fictionalMenData as AllowlistEntry[],
  'famous-asians': famousAsiansData as AllowlistEntry[],
  'animals': animalsData as AllowlistEntry[],
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
const llmCache = new Map<string, { name: string; description: string } | null>();
// In-flight deduplication: if two identical searches fire simultaneously (e.g. React StrictMode),
// the second awaits the same promise instead of making a duplicate Gemini/Wikidata request.
const pendingSearches = new Map<string, Promise<Woman | null>>();

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
    'tekken': { qid: 'Q174910', full: 'tekken' },
    'lol': { qid: 'Q1103341', full: 'league of legends' },
    'kakegurui': { qid: 'Q20650710', full: 'kakegurui' },
    'naruto': { qid: 'Q83471', full: 'naruto' },
    'bleach': { qid: 'Q727082', full: 'bleach' },
    'onepiece': { qid: 'Q73539', full: 'one piece' },
    'fairytail': { qid: 'Q796822', full: 'fairy tail' },
    'aot': { qid: 'Q844422', full: 'attack on titan' },
    'mha': { qid: 'Q54492', full: 'my hero academia' },
    'jjk': { qid: 'Q87470480', full: 'jujutsu kaisen' },
    'evangelion': { qid: 'Q220459', full: 'neon genesis evangelion' },
    'rezero': { qid: 'Q20646568', full: 're zero' },
    'demonslayer': { qid: 'Q58187846', full: 'demon slayer' },
    'sailormoon': { qid: 'Q45932', full: 'sailor moon' },
    'dragonball': { qid: 'Q11100', full: 'dragon ball' },
    'genshin': { qid: 'Q98395780', full: 'genshin impact' },
    'overwatch': { qid: 'Q19816365', full: 'overwatch' },
    'valorant': { qid: 'Q89290771', full: 'valorant' },
    'apex': { qid: 'Q58218851', full: 'apex legends' },
    'mortalcombat': { qid: 'Q131395', full: 'mortal kombat' },
    'streetfighter': { qid: 'Q208072', full: 'street fighter' },
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

    // Check search cache
    if (searchCache.has(cacheKey)) {
      console.log(`[DEBUG] Cache hit for search: "${normalizedInput}"`);
      return searchCache.get(cacheKey) || null;
    }

    // Deduplicate in-flight requests (React StrictMode fires effects twice,
    // causing duplicate API calls for the same input)
    if (pendingSearches.has(cacheKey)) {
      console.log(`[DEBUG] Deduplicating in-flight request for: "${normalizedInput}"`);
      return pendingSearches.get(cacheKey)!;
    }

    const searchPromise = this._doSearch(normalizedInput, cacheKey, category, input);
    pendingSearches.set(cacheKey, searchPromise);
    try {
      return await searchPromise;
    } finally {
      pendingSearches.delete(cacheKey);
    }
  },

  async _doSearch(normalizedInput: string, cacheKey: string, category: CategoryConfig, input: string): Promise<Woman | null> {
    try {
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

      // If the entire input was consumed by context keywords (e.g. the user typed just
      // "kakegurui"), there is no character name to match — reject immediately.
      if (!namePart) {
        searchCache.set(cacheKey, null);
        return null;
      }

      // For fictional categories, check the allowlist first using the context-stripped name.
      // This ensures entries with full canonical names (e.g. "Ririka Momobami") are returned
      // instead of the short Wikidata label ("Ririka"), preventing false dedup collisions.
      if (category.id === 'fictional-women' || category.id === 'fictional-men') {
        // When context is active (e.g. "ashe overwatch"), find the entry matching
        // BOTH the name AND that specific franchise, not just the first name match.
        const nameQuery = activeContexts.length > 0 ? normalizedInput : (namePart || normalizedInput);
        const earlyMatch = this.searchAllowlist(nameQuery, category.id);
        if (earlyMatch) {
          console.log(`[DEBUG] Early allowlist match for "${nameQuery}": ${earlyMatch.name}`);
          searchCache.set(cacheKey, earlyMatch);
          return earlyMatch;
        }

        if (activeContexts.length > 0 && namePart) {
          const list = ALLOWLISTS[category.id] || [];
          let franchiseSpecificMatch: Woman | null = null;
          for (const contextKey of activeContexts) {
            const hintNorm = contextKey.replace(/\s+/g, '');
            for (const entry of list) {
              const names = [entry.name.toLowerCase(), ...entry.aliases.map((a: string) => a.toLowerCase())];
              if (!names.some(n => fuzzyMatchNames(n, namePart) || n === namePart)) continue;
              const platformFull = (this.contextMap[entry.platform]?.full || '').toLowerCase();
              const platformKey = entry.platform.toLowerCase();
              if (
                platformFull.includes(contextKey) || platformKey.includes(hintNorm) ||
                hintNorm.includes(platformKey) || contextKey === platformKey
              ) {
                franchiseSpecificMatch = this.searchAllowlistEntries(namePart, [entry]);
                break;
              }
            }
            if (franchiseSpecificMatch) break;
          }
          // Fall back to first name match if no franchise-specific match found
          const match = franchiseSpecificMatch || this.searchAllowlist(namePart, category.id);
          if (match) {
            console.log(`[DEBUG] Context-aware allowlist match for "${normalizedInput}": ${match.name}`);
            searchCache.set(cacheKey, match);
            return match;
          }
        }

        // Franchise-hint search: handles "joey friends" OR "friends joey" order.
        // Tries every split point with name-first and franchise-first orderings.
        const inputWords = normalizedInput.trim().split(/\s+/);
        if (inputWords.length >= 2 && activeContexts.length === 0) {
          const list = ALLOWLISTS[category.id] || [];

          const tryFranchiseHint = (namePortion: string, franchiseHint: string): Woman | null => {
            const hintNorm = franchiseHint.replace(/\s+/g, '');
            for (const entry of list) {
              const names = [entry.name.toLowerCase(), ...entry.aliases.map((a: string) => a.toLowerCase())];
              if (!names.some(n => fuzzyMatchNames(n, namePortion) || n.includes(namePortion))) continue;
              const result = this.searchAllowlistEntries(namePortion, [entry]);
              if (!result) continue;
              // Check description, platform key, or contextMap full name against the hint
              const desc = result.description.toLowerCase();
              const platformFull = (this.contextMap[entry.platform]?.full || '').toLowerCase();
              const platformKey = entry.platform.toLowerCase();
              if (
                desc.includes(franchiseHint) ||
                desc.replace(/\s+/g, '').includes(hintNorm) ||
                platformFull.includes(franchiseHint) ||
                platformKey.includes(hintNorm) ||
                hintNorm.includes(platformKey)
              ) {
                return result;
              }
            }
            return null;
          };

          for (let split = 1; split < inputWords.length; split++) {
            // Try name-first: "peter family guy"
            const match1 = tryFranchiseHint(
              inputWords.slice(0, split).join(' '),
              inputWords.slice(split).join(' '),
            );
            if (match1) {
              console.log(`[DEBUG] Franchise-hint match for "${normalizedInput}": ${match1.name}`);
              searchCache.set(cacheKey, match1);
              return match1;
            }
            // Try franchise-first: "family guy peter"
            const match2 = tryFranchiseHint(
              inputWords.slice(split).join(' '),
              inputWords.slice(0, split).join(' '),
            );
            if (match2) {
              console.log(`[DEBUG] Franchise-hint match for "${normalizedInput}": ${match2.name}`);
              searchCache.set(cacheKey, match2);
              return match2;
            }
          }
        }
      }

      // Exact allowlist match short-circuits Wikidata for all categories.
      // Prevents Wikidata returning scientific/canonical names (e.g. "Felidae" for "cat").
      const exactAllowlistMatch = this.searchAllowlist(normalizedInput, category.id, category.strictAllowlistMatch ?? false);
      if (exactAllowlistMatch && exactAllowlistMatch.name.toLowerCase() === normalizedInput) {
        console.log(`[DEBUG] Exact allowlist match for "${normalizedInput}": ${exactAllowlistMatch.name}`);
        searchCache.set(cacheKey, exactAllowlistMatch);
        return exactAllowlistMatch;
      }

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

      // Combine all IDs and take ONLY TOP 10 for detailed fetching
      const allIds = Array.from(new Set([...idsA, ...idsC, ...idsB])).slice(0, 10).join('|');

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

        // 1. Instance-of filter (default: Q5 = human)
        const instanceOf = category.wikidataInstanceOf || 'Q5';
        const validInstances = Array.isArray(instanceOf) ? instanceOf : [instanceOf];
        const isValidInstance = claims.P31?.some((c: any) => validInstances.includes(c.mainsnak.datavalue?.value.id));
        if (!isValidInstance) continue;

        const p31Ids: string[] = (claims.P31 || []).map((c: any) => c.mainsnak.datavalue?.value.id).filter(Boolean);
        const p21Ids: string[] = (claims.P21 || []).map((c: any) => c.mainsnak.datavalue?.value.id).filter(Boolean);

        // 2. Gender filter — only applied when wikidataGender is configured.
        //    Type-encoded gender (fictional character P31 values) takes priority over P21.
        if (category.wikidataGender) {
          const hasFemaleType = p31Ids.includes('Q15773347'); // fictional female character
          const hasMaleType   = p31Ids.includes('Q15773348') || p31Ids.includes('Q15773317');
          const hasExplicitMaleP21 = p21Ids.includes('Q6581097') || p21Ids.includes('Q44148');
          const passesGender = !hasExplicitMaleP21 && (
            hasFemaleType || (!hasMaleType && p21Ids.includes(category.wikidataGender))
          );
          console.log(`[DEBUG] Entity ${id} (${entity.labels?.en?.value}): passesGender=${passesGender}, P31=[${p31Ids.join(',')}] P21=[${p21Ids.join(',')}]`);
          if (!passesGender) continue;
        }

        // 3. Ethnicity filter — applied when wikidataEthnicGroups or wikidataCountries is configured.
        //    Passes when P172 (ethnic group) OR P27 (country of citizenship) has a matching QID.
        if (category.wikidataEthnicGroups?.length || category.wikidataCountries?.length) {
          const p172Ids: string[] = (claims.P172 || []).map((c: any) => c.mainsnak.datavalue?.value.id).filter(Boolean);
          const p27Ids:  string[] = (claims.P27  || []).map((c: any) => c.mainsnak.datavalue?.value.id).filter(Boolean);
          const passesEthnicity =
            (category.wikidataEthnicGroups?.some(qid => p172Ids.includes(qid)) ?? false) ||
            (category.wikidataCountries?.some(qid  => p27Ids.includes(qid))  ?? false);
          console.log(`[DEBUG] Entity ${id} (${entity.labels?.en?.value}): passesEthnicity=${passesEthnicity}, P172=[${p172Ids}] P27=[${p27Ids}]`);
          if (!passesEthnicity) continue;
        }

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
          name: (c.entity.labels?.en?.value || 'Unknown').replace(/^\w/, ch => ch.toUpperCase()),
          description: c.entity.descriptions?.en?.value || '',
          sitelinks: Object.keys(c.entity.sitelinks || {}).length,
          aliases: (c.entity.aliases?.en || []).map((a: any) => a.value),
          resolvedProperties
        };
      });

      console.log(`[DEBUG] Found ${finalCandidates.length} valid candidates.`);

      // 5. Filter and Rank
      const filtered = finalCandidates.filter(c => this.checkMatch(normalizedInput.split(/\s+/), activeContexts, c, category.id));

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

          // For strict categories (e.g. animals), verify the input is within the
          // allowed edit distance of the matched name before accepting the Wikidata result.
          // If the match came via an alias (e.g. "polar bear" on "Ursus maritimus"),
          // substitute the alias as the display name so users see the common name.
          if (category.strictAllowlistMatch) {
            const allNames = [bestMatch.name.toLowerCase(), ...bestMatch.aliases.map((a: string) => a.toLowerCase())];
            const matchedName = allNames.find(n => fuzzyMatchAllowlist(n, normalizedInput));
            if (!matchedName) {
              console.log(`[DEBUG] REJECTED (strict): "${normalizedInput}" is too far from "${bestMatch.name}"`);
              passed = false;
            } else if (matchedName !== bestMatch.name.toLowerCase()) {
              // Prefer the common-name alias over the scientific primary label
              bestMatch.name = matchedName.charAt(0).toUpperCase() + matchedName.slice(1);
              console.log(`[DEBUG] Using alias "${bestMatch.name}" instead of scientific name`);
            }
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
    const allowlistMatch = this.searchAllowlist(normalizedInput, category.id, category.strictAllowlistMatch ?? false);
    if (allowlistMatch) {
      // In strict mode, skip fuzzy fallback matches that resolve to a different name.
      // e.g. "ram" fuzzy-matching "rat" would wrongly substitute one animal for another.
      // Exact matches (name === input) are always accepted.
      if (category.strictAllowlistMatch && allowlistMatch.name.toLowerCase() !== normalizedInput) {
        console.log(`[DEBUG] Strict fallback: skipping fuzzy match "${allowlistMatch.name}" for "${normalizedInput}"`);
      } else {
        console.log(`[DEBUG] Allowlist match: ${allowlistMatch.name}`);
        searchCache.set(cacheKey, allowlistMatch);
        return allowlistMatch;
      }
    }

    // LLM fallback for fictional categories when Wikidata and allowlist both fail
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
        return result;
      }
    }

    // LLM fallback for famous-asians when Wikidata and allowlist both fail
    if (category.id === 'famous-asians') {
      const llmResult = await this.llmVerifyFamousAsian(normalizedInput);
      if (llmResult) {
        const result: Woman = {
          id: llmResult.qid ?? `llm-${llmResult.name.toLowerCase().replace(/\s+/g, '-')}`,
          name: llmResult.name,
          description: llmResult.description,
        };
        searchCache.set(cacheKey, result);
        return result;
      }
    }

    searchCache.set(cacheKey, null);
    return null;
  },

  searchAllowlist(input: string, categoryId: string = 'women', strict: boolean = false): Woman | null {
    const list = ALLOWLISTS[categoryId] || [];
    return this.searchAllowlistEntries(input, list, strict);
  },

  searchAllowlistEntries(input: string, list: AllowlistEntry[], strict: boolean = false): Woman | null {
    const descriptionLabel: Record<string, string> = {
      lol: 'LoL Champion',
      nba: 'NBA Player',
      twitch: 'Twitch streamer',
      youtube: 'YouTube creator',
      instagram: 'Instagram creator',
      tiktok: 'TikTok creator',
      twitter: 'Twitter/X personality',
      'famous-asians': '',
      animals: 'Animal',
    };

    // Display names for platforms not in contextMap
    const platformDisplayNames: Record<string, string> = {
      familyguy: 'Family Guy', simpsons: 'The Simpsons', friends: 'Friends',
      futurama: 'Futurama', southpark: 'South Park', theoffice: 'The Office',
      himym: 'How I Met Your Mother', tbbt: 'The Big Bang Theory', b99: 'Brooklyn Nine-Nine',
      seinfeld: 'Seinfeld', sopranos: 'The Sopranos', breakingbad: 'Breaking Bad',
      dexter: 'Dexter', doctorwho: 'Doctor Who', strangerthings: 'Stranger Things',
      walkingdead: 'The Walking Dead', gameofthrones: 'Game of Thrones', got: 'Game of Thrones',
      greysanatomy: 'Grey\'s Anatomy', gossipgirl: 'Gossip Girl', gilmoregirls: 'Gilmore Girls',
      euphoria: 'Euphoria', handmaidstale: 'The Handmaid\'s Tale', buffy: 'Buffy the Vampire Slayer',
      dc: 'DC', marvel: 'Marvel', disney: 'Disney', pixar: 'Pixar', ghibli: 'Studio Ghibli',
      starwars: 'Star Wars', 'star-wars': 'Star Wars', harrypotter: 'Harry Potter',
      lotr: 'Lord of the Rings', 'lord-of-the-rings': 'Lord of the Rings',
      'the-hobbit': 'The Hobbit', hungergames: 'The Hunger Games',
      divergent: 'Divergent', twilight: 'Twilight', acotar: 'A Court of Thorns and Roses',
      shadowhunters: 'Shadowhunters', hisdarkmaterials: 'His Dark Materials',
      'wheel-of-time': 'The Wheel of Time', narnia: 'The Chronicles of Narnia',
      avatar: 'Avatar', atla: 'Avatar: The Last Airbender',
      finalfantasy: 'Final Fantasy', ff: 'Final Fantasy',
      zelda: 'The Legend of Zelda', mario: 'Super Mario', 'super_mario': 'Super Mario',
      pokemon: 'Pokémon', metroid: 'Metroid', kirby: 'Kirby',
      godofwar: 'God of War', gow: 'God of War',
      kingdomhearts: 'Kingdom Hearts', kh: 'Kingdom Hearts',
      persona: 'Persona', fireemblem: 'Fire Emblem',
      residentevil: 're: Resident Evil', re: 'Resident Evil',
      metalgear: 'Metal Gear', mgs: 'Metal Gear Solid',
      masseffect: 'Mass Effect', cyberpunk: 'Cyberpunk 2077',
      eldenring: 'Elden Ring', 'elden-ring': 'Elden Ring',
      'elder-scrolls': 'The Elder Scrolls', 'elder-scrolles': 'The Elder Scrolls',
      witcher: 'The Witcher', 'the-witcher': 'The Witcher',
      assassinscreed: 'Assassin\'s Creed', ac: 'Assassin\'s Creed',
      tombraider: 'Tomb Raider', uncharted: 'Uncharted',
      halo: 'Halo', gears: 'Gears of War',
      borderlands: 'Borderlands', rdr: 'Red Dead Redemption',
      gta: 'Grand Theft Auto', tlou: 'The Last of Us',
      apexlegends: 'Apex Legends', dota2: 'Dota 2', 'dota-2': 'Dota 2',
      heroesofthestorm: 'Heroes of the Storm', 'heroes-of-the-storm': 'Heroes of the Storm',
      warcraft: 'Warcraft', worldofwarcraft: 'World of Warcraft', starcraft: 'StarCraft',
      devilmaycry: 'Devil May Cry', dmc: 'Devil May Cry',
      silenthill: 'Silent Hill', castlevania: 'Castlevania',
      undertale: 'Undertale', celeste: 'Celeste', hollow_knight: 'Hollow Knight',
      hollowknight: 'Hollow Knight', cuphead: 'Cuphead',
      dragonquest: 'Dragon Quest', talesof: 'Tales of', xenoblade: 'Xenoblade Chronicles',
      nier: 'NieR', horizon: 'Horizon', destiny: 'Destiny',
      batmanarkham: 'Batman: Arkham', smashbros: 'Super Smash Bros.',
      blazblue: 'BlazBlue', guiltygear: 'Guilty Gear', kingoffighters: 'King of Fighters',
      mortalcombat: 'Mortal Kombat', mortalkombat: 'Mortal Kombat', mk: 'Mortal Kombat',
      tekken: 'Tekken', sf: 'Street Fighter', skullgirls: 'Skullgirls',
      cowboybebop: 'Cowboy Bebop', onepunchman: 'One Punch Man', opm: 'One Punch Man',
      deathnote: 'Death Note', fma: 'Fullmetal Alchemist',
      codegeass: 'Code Geass', gurren: 'Gurren Lagann', gurrenn: 'Gurren Lagann',
      sao: 'Sword Art Online', konosuba: 'KonoSuba', overlord: 'Overlord',
      spyfamily: 'Spy x Family', shieldhero: 'The Rising of the Shield Hero',
      rezero: 'Re:Zero', 'darlifra': 'Darling in the FranXX',
      'killakill': 'Kill la Kill', guiltycrown: 'Guilty Crown',
      'blacklagoon': 'Black Lagoon', gintama: 'Gintama',
      jujutsukaisen: 'Jujutsu Kaisen', fate: 'Fate',
      litRPG: 'LitRPG', literature: 'Literature', pirates: 'Pirates of the Caribbean',
      missionimpossible: 'Mission: Impossible', jamesbond: 'James Bond',
      indianajones: 'Indiana Jones', scarface: 'Scarface', godfather: 'The Godfather',
      matrix: 'The Matrix', pulpfiction: 'Pulp Fiction', fightclub: 'Fight Club',
      diehard: 'Die Hard', silenceofthelambs: 'The Silence of the Lambs',
      terminator: 'Terminator', 'mad-max': 'Mad Max', alien: 'Alien',
      'jurassic-world': 'Jurassic World', 'jurassicworld': 'Jurassic World',
      sherlock: 'Sherlock Holmes', bourne: 'Jason Bourne',
      prideandprejudice: 'Pride and Prejudice', janeeyre: 'Jane Eyre',
      wutheringheights: 'Wuthering Heights', 'scarletletter': 'The Scarlet Letter',
      tokillamockingbird: 'To Kill a Mockingbird', catcherintherye: 'The Catcher in the Rye',
      'littlewomen': 'Little Women', gatsby: 'The Great Gatsby', marktain: 'Mark Twain',
      pjatc: 'Percy Jackson', 'aladdin': 'Aladdin', frozen: 'Frozen',
      tangled: 'Tangled', moana: 'Moana', encanto: 'Encanto',
      zootopia: 'Zootopia', toystory: 'Toy Story', insideout: 'Inside Out',
      incredibles: 'The Incredibles', 'brave': 'Brave', hercules: 'Hercules',
      lionking: 'The Lion King', junglebook: 'The Jungle Book', peterpan: 'Peter Pan',
      'clueless': 'Clueless', 'meangirls': 'Mean Girls', 'legallyblonde': 'Legally Blonde',
      prettywoman: 'Pretty Woman', 'grease': 'Grease', 'titanic': 'Titanic',
      'thelmaandlouise': 'Thelma & Louise', 'killbill': 'Kill Bill',
      killingeve: 'Killing Eve', 'alias': 'Alias', xena: 'Xena: Warrior Princess',
      sabrina: 'Sabrina the Teenage Witch', 'parksandrec': 'Parks and Recreation',
      'satc': 'Sex and the City', 'madmen': 'Mad Men', gravity: 'Gravity Falls',
      winxclub: 'Winx Club', scoobydoo: 'Scooby-Doo', ppg: 'Powerpuff Girls',
      sonic: 'Sonic the Hedgehog', crash_bandicoot: 'Crash Bandicoot',
      spyro: 'Spyro the Dragon', 'donkey_kong': 'Donkey Kong', rayman: 'Rayman',
      'mega_man': 'Mega Man', 'warioland': 'Wario Land', 'ori': 'Ori',
      'cavestory': 'Cave Story', 'dustforce': 'Dustforce', 'shovel_knight': 'Shovel Knight',
      shovelknight: 'Shovel Knight', 'shantae': 'Shantae', 'rogue': 'Rogue',
      diablo: 'Diablo', 'commandoconquer': 'Command & Conquer',
      'halflife': 'Half-Life', 'portal': 'Portal', doom: 'Doom',
      'dukenukem': 'Duke Nukem', unreal: 'Unreal Tournament',
      'metro': 'Metro', 'splintercell': 'Splinter Cell', 'hitman': 'Hitman',
      dishonored: 'Dishonored', 'smite': 'Smite',
      'forrestgump': 'Forrest Gump', 'theshining': 'The Shining',
      'breakfastattiffanys': 'Breakfast at Tiffany\'s',
      'gonegirl': 'Gone Girl', 'gonewiththewind': 'Gone with the Wind',
      'emma': 'Emma', 'matilda': 'Matilda', 'alice': 'Alice in Wonderland',
      'wizardofoz': 'The Wizard of Oz', 'juno': 'Juno', 'divergent': 'Divergent',
      'anime': 'Anime', 'nintendo': 'Nintendo', 'smashbros': 'Super Smash Bros.',
      'league-of-legends': 'League of Legends',
    };

    const makeResult = (entry: { name: string; platform: string; description?: string }): Woman => {
      let description: string;
      if (entry.description) {
        description = entry.description;
      } else if (entry.platform in descriptionLabel) {
        description = descriptionLabel[entry.platform];
      } else {
        const contextInfo = this.contextMap[entry.platform];
        const displayPlatform =
          platformDisplayNames[entry.platform] ??
          (contextInfo ? contextInfo.full.replace(/\b\w/g, (c: string) => c.toUpperCase()) : null) ??
          entry.platform.replace(/[-_]/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase());
        description = `Character from ${displayPlatform}`;
      }
      const displayName = entry.name.charAt(0).toUpperCase() + entry.name.slice(1);
      return {
        id: `allowlist-${entry.platform}-${entry.name.toLowerCase().replace(/\s+/g, '-')}`,
        name: displayName,
        description,
      };
    };

    // 1a. Exact full name / alias match (priority pass — order-independent)
    for (const entry of list) {
      const names = [entry.name.toLowerCase(), ...entry.aliases.map((a: string) => a.toLowerCase())];
      if (names.some(name => name === input)) return makeResult(entry);
    }

    // 1b. Fuzzy primary name match only — aliases are exact-match only (step 1a).
    // This prevents short aliases like "jun" from fuzzy-matching unrelated inputs like "juno".
    for (const entry of list) {
      const primaryName = entry.name.toLowerCase();
      const isMatch = strict
        ? fuzzyMatchAllowlist(primaryName, input)
        // Word-boundary check instead of raw substring: "ash" must match a whole word in the
        // entry name, not just any substring (e.g. "ash" ⊂ "flash" but ≠ any word in "flash").
        : (fuzzyMatchNames(primaryName, input) || primaryName.split(/\s+/).some(word => fuzzyMatchNames(word, input)));
      if (isMatch) return makeResult(entry);
    }

    // 2. Last-name match for allowlist-only categories (e.g. "durant" → "Kevin Durant")
    //    When multiple players share a last name, pick the one with the most years active.
    if (strict && input.length >= 3) {
      const lastNameMatches: Array<{ entry: AllowlistEntry; yearsActive: number; toYear: number }> = [];

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

      // 3. First-name match — exact only, resolves only if the first name is unique in the dataset
      //    "giannis" → Giannis Antetokounmpo (unique), "jaylen" → no match (9 Jaylens exist)
      //    Exact match avoids "bronny" colliding with "ronny" via DL fuzzy
      const firstNameMatches = list.filter(entry => {
        const firstName = entry.name.trim().split(/\s+/)[0].toLowerCase();
        return firstName === input;
      });
      if (firstNameMatches.length === 1) {
        return makeResult(firstNameMatches[0]);
      }
    }

    return null;
  },

  checkMatch(inputWords: string[], activeContexts: string[], candidate: WomanCandidate, categoryId?: string): boolean {
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

    // For fictional categories the wikidataInstanceOf filter already confirmed the
    // entity is a fictional character. Skip context validation only when no context
    // was provided — if the user typed "kaede kakegurui" the context should gate
    // the result so we don't return a character from a different franchise.
    if ((categoryId === 'fictional-women' || categoryId === 'fictional-men') && activeContexts.length === 0) return true;

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

  // LLM provider chain — tried in order, skipping providers with no API key.
  // On 429 (rate limit) or failure, falls through to the next provider.
  async llmRequest(prompt: string): Promise<string | null> {
    const geminiKey = import.meta.env.VITE_GEMINI_API_KEY;
    const groqKey   = import.meta.env.VITE_GROQ_API_KEY;
    const mistralKey = import.meta.env.VITE_MISTRAL_API_KEY;

    const providers: Array<{ name: string; call: () => Promise<{ status: number; text: string }> }> = [
      // Gemini models (same key, progressively lighter)
      ...(geminiKey ? [
        'gemini-2.5-flash',
        'gemini-2.0-flash',
        'gemini-1.5-flash',
        'gemini-1.5-flash-8b',
      ].map(model => ({
        name: model,
        call: async () => {
          const res = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${geminiKey}`,
            { method: 'POST', headers: { 'content-type': 'application/json' },
              body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { maxOutputTokens: 200 } }) }
          );
          const data = await res.json();
          return { status: res.status, text: (data.candidates?.[0]?.content?.parts?.[0]?.text || '').trim() };
        },
      })) : []),
      // Groq (OpenAI-compatible, free tier, very fast)
      ...(groqKey ? [
        { model: 'llama-3.1-8b-instant', label: 'groq-llama-3.1-8b' },
        { model: 'gemma2-9b-it',          label: 'groq-gemma2-9b' },
      ].map(({ model, label }) => ({
        name: label,
        call: async () => {
          const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
            method: 'POST',
            headers: { 'content-type': 'application/json', 'authorization': `Bearer ${groqKey}` },
            body: JSON.stringify({ model, max_tokens: 200, messages: [{ role: 'user', content: prompt }] }),
          });
          const data = await res.json();
          return { status: res.status, text: (data.choices?.[0]?.message?.content || '').trim() };
        },
      })) : []),
      // Mistral (free tier)
      ...(mistralKey ? [{
        name: 'mistral-small',
        call: async () => {
          const res = await fetch('https://api.mistral.ai/v1/chat/completions', {
            method: 'POST',
            headers: { 'content-type': 'application/json', 'authorization': `Bearer ${mistralKey}` },
            body: JSON.stringify({ model: 'mistral-small-latest', max_tokens: 200, messages: [{ role: 'user', content: prompt }] }),
          });
          const data = await res.json();
          return { status: res.status, text: (data.choices?.[0]?.message?.content || '').trim() };
        },
      }] : []),
    ];

    for (const provider of providers) {
      try {
        const { status, text } = await provider.call();
        if (status === 200 && text) {
          if (provider.name !== 'gemini-2.5-flash') {
            console.log(`[DEBUG] LLM provider used: ${provider.name}`);
          }
          return text;
        }
        if (status === 429) {
          console.warn(`[DEBUG] ${provider.name} 429 — trying next provider`);
          continue;
        }
        if (status === 404) {
          console.warn(`[DEBUG] ${provider.name} 404 — trying next provider`);
          continue;
        }
        console.warn(`[DEBUG] ${provider.name} HTTP ${status} — trying next provider`);
      } catch (err) {
        console.warn(`[DEBUG] ${provider.name} error — trying next provider`, err);
      }
    }

    console.warn('[DEBUG] All LLM providers exhausted');
    return null;
  },

  // Keep geminiRequest for backwards compat with llmVerifyFamousAsian
  async geminiRequest(apiKey: string, prompt: string): Promise<string | null> {
    return this.llmRequest(prompt);
  },

  async llmVerifyFictional(input: string, gender: 'female' | 'male'): Promise<{ name: string; description: string } | null> {
    if (!import.meta.env.VITE_GEMINI_API_KEY && !import.meta.env.VITE_GROQ_API_KEY && !import.meta.env.VITE_MISTRAL_API_KEY) {
      console.log('[DEBUG] LLM fallback skipped: no API keys configured');
      return null;
    }

    const cacheKey = `${gender}:${input}`;
    if (llmCache.has(cacheKey)) {
      console.log(`[DEBUG] LLM cache hit for "${input}"`);
      return llmCache.get(cacheKey)!;
    }

    const prompt = `Is "${input}" a fictional ${gender} character from any video game, TV show, film, book, or other media?\nReply in EXACTLY one of these two formats (no other text):\nYES | [full correct canonical name] | Character from [franchise/series name]\nNO`;
    console.log(`[DEBUG] LLM fictional query: "${input}" (${gender})`);

    try {
      const answer = await this.llmRequest(prompt);
      if (answer === null) return null;
      console.log(`[DEBUG] LLM fictional answer for "${input}": "${answer}"`);

      if (!answer.toUpperCase().startsWith('YES')) {
        llmCache.set(cacheKey, null);
        return null;
      }

      const parts = answer.split('|').map((p: string) => p.trim());
      const rawName = parts[1] || '';
      const description = parts[2] || '';

      // Require both name and description — reject malformed responses like "YES | Jam"
      if (!rawName || !description) {
        console.log(`[DEBUG] Gemini malformed response for "${input}" — missing name or description`);
        llmCache.set(cacheKey, null);
        return null;
      }

      // If Gemini's canonical name is wildly different from the input (e.g. "Jam" for "junkrat"),
      // use the input as the display name instead (title-cased).
      const rawNameNorm = rawName.toLowerCase().replace(/[^a-z0-9]/g, '');
      const inputNorm = input.toLowerCase().replace(/[^a-z0-9]/g, '');
      const nameIsRelevant = rawNameNorm.includes(inputNorm) || inputNorm.includes(rawNameNorm) || fuzzyMatchNames(rawNameNorm, inputNorm);
      const name = nameIsRelevant
        ? rawName.replace(/\b\w/g, (c: string) => c.toUpperCase())
        : input.trim().replace(/\b\w/g, (c: string) => c.toUpperCase());
      const result = { name, description };
      llmCache.set(cacheKey, result);
      return result;
    } catch (error) {
      console.error('[DEBUG] LLM verify error:', error);
      return null;
    }
  },

  async llmVerifyFamousAsian(input: string): Promise<{ name: string; description: string; qid: string | null } | null> {
    const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
    if (!apiKey) {
      console.log('[DEBUG] LLM fallback skipped: no VITE_GEMINI_API_KEY');
      return null;
    }

    const cacheKey = `famous-asian:${input}`;
    if (llmCache.has(cacheKey)) {
      console.log(`[DEBUG] LLM cache hit for "${input}"`);
      return llmCache.get(cacheKey)!;
    }

    const prompt = `Is "${input}" a famous Asian or Asian-American person (e.g. athlete, entertainer, streamer, YouTuber, politician, scientist, etc.)? Note: the input may be a Twitch/YouTube username or online handle rather than a real name.\nIf yes, reply with exactly: YES | [full canonical name] | [one sentence description] | [Wikidata QID e.g. Q12345, or NONE]\nIf no, reply with exactly: NO`;
    console.log(`[DEBUG] Gemini famous-asian query: "${input}"`);

    try {
      const answer = await this.geminiRequest(apiKey, prompt);
      if (answer === null) return null;

      if (!answer.toUpperCase().startsWith('YES')) {
        console.log(`[DEBUG] Gemini famous-asian REJECTED "${input}": "${answer}"`);
        llmCache.set(cacheKey, null);
        return null;
      }

      const parts = answer.split('|').map((p: string) => p.trim());
      const name = parts[1] || input.trim();
      const description = parts[2] || 'Famous Asian personality';
      const rawQid = parts[3] || '';
      const qid = /^Q\d+$/i.test(rawQid) ? rawQid.toUpperCase() : null;
      const result = { name, description, qid };
      console.log(`[DEBUG] Gemini famous-asian ACCEPTED "${input}" → name: "${name}" | description: "${description}" | QID: ${qid ?? 'none'}`);
      llmCache.set(cacheKey, result);
      return result;
    } catch (error) {
      console.error('[DEBUG] LLM verify error:', error);
      return null;
    }
  },

  // Helper for testing to clear state between tests
  clearCaches() {
    searchCache.clear();
    propertyLabelCache.clear();
    llmCache.clear();
  }
};

if (import.meta.env.DEV) {
  (window as any).__clearWikidataCache = () => WikidataService.clearCaches();
  console.log('[DEV] Cache clear available: window.__clearWikidataCache()');
}

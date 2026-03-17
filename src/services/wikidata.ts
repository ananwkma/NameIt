import axios from 'axios';
import { Woman } from '../types/wikidata';
import Levenshtein from 'fast-levenshtein';

const WIKIDATA_API_URL = 'https://www.wikidata.org/w/api.php';

const headers = {
  'Api-User-Agent': '100WomenGame/1.0 (contact@example.com)',
};

interface WomanCandidate extends Woman {
  sitelinks: number;
  aliases: string[];
  resolvedProperties: string[];
}

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

  async searchWoman(input: string): Promise<Woman | null> {
    try {
      const normalizedInput = input.trim().toLowerCase();
      const activeContexts: string[] = [];
      let cleanSearchQuery = normalizedInput;
      
      for (const [abbr, info] of Object.entries(this.contextMap)) {
        if (normalizedInput.includes(abbr)) {
          activeContexts.push(abbr);
          cleanSearchQuery = cleanSearchQuery.replace(abbr, info.full);
        }
      }

      // If no explicit map match, check for manual context split (last word)
      const parts = normalizedInput.split(/\s+/);
      if (activeContexts.length === 0 && parts.length > 1) {
        // Assume last word might be context if it's not part of the name
        // This is a heuristic for "loona yves" where "loona" isn't yet in map (though I just added it)
        // or for things like "japanese singer"
      }

      // Extract the core name for a targeted fallback search
      const namePart = parts.filter(w => !activeContexts.includes(w) && w !== 'loona').join(' ');

      console.log(`[DEBUG] Input: "${input}" -> Query: "${cleanSearchQuery}" | Name Only: "${namePart}"`);

      // 1. Triple Search Strategy
      // We need to be careful not to hit URL length limits or API complexities.
      // Search A: Text search for "loona yves" (classic "AND" search)
      const [searchA, searchB, searchC] = await Promise.all([
        axios.get(WIKIDATA_API_URL, {
          params: { action: 'query', list: 'search', srsearch: `${namePart} ${activeContexts.join(' ')}`, srlimit: 50, format: 'json', origin: '*' },
          headers,
        }),
        // Search B: Name only "yves"
        axios.get(WIKIDATA_API_URL, {
          params: { action: 'wbsearchentities', search: namePart || cleanSearchQuery, language: 'en', limit: 50, format: 'json', origin: '*' },
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
      
      // Combine all IDs (up to 50 unique)
      const allIds = Array.from(new Set([...idsA, ...idsC, ...idsB])).slice(0, 50).join('|');

      if (!allIds) {
        console.log(`[DEBUG] No results found.`);
        return null;
      }

      // 2. Fetch detailed data
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
        const isFemale = claims.P21?.some((c: any) => c.mainsnak.datavalue?.value.id === 'Q6581072');

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

      // 3. Resolve Labels
      const qidArray = Array.from(allReferencedQids);
      const qidMap: Record<string, string> = {}; 
      const chunkSize = 50;
      for (let i = 0; i < qidArray.length; i += chunkSize) {
        const chunk = qidArray.slice(i, i + chunkSize).join('|');
        const labelsResponse = await axios.get(WIKIDATA_API_URL, {
          params: { action: 'wbgetentities', ids: chunk, props: 'labels', languages: 'en', format: 'json', origin: '*' },
          headers,
        });
        const labelEntities = labelsResponse.data.entities;
        for (const qid in labelEntities) {
          qidMap[qid] = labelEntities[qid].labels?.en?.value || 'Unknown';
        }
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
      // Use original input parts for name matching, but respect activeContexts
      let filtered = finalCandidates.filter(c => this.checkMatch(input.trim().toLowerCase().split(/\s+/), activeContexts, c));

      filtered.sort((a, b) => b.sitelinks - a.sitelinks);

      if (filtered.length === 0) {
        console.log('[DEBUG] All candidates filtered out.');
        return null;
      }

      if (activeContexts.length === 0 && filtered.length > 1) {
        const top = filtered[0];
        const second = filtered[1];
        if (top.sitelinks < second.sitelinks * 1.5) {
          console.log(`[DEBUG] REJECTED: Ambiguity between "${top.name}" and "${second.name}".`);
          return null; 
        }
      }

      console.log(`[DEBUG] SUCCESS: Selected ${filtered[0].name} (${filtered[0].id})`);
      return filtered[0];
    } catch (error) {
      console.error('[DEBUG] ERROR:', error);
      return null;
    }
  },

  checkMatch(inputWords: string[], activeContexts: string[], candidate: WomanCandidate): boolean {
    const targetNames = [
      candidate.name.toLowerCase(), 
      ...candidate.aliases.map(a => a.toLowerCase())
    ];

    // Remove known context keywords to isolate the name
    // Also remove any words that map to context in our map (like "loona")
    const namePart = inputWords.filter(w => !activeContexts.includes(w) && !this.contextMap[w]).join(' ');
    
    // 1. Name Match
    let nameMatch = false;
    if (!namePart) {
      nameMatch = true; 
    } else {
      nameMatch = targetNames.some(name => {
        if (Levenshtein.get(name, namePart) <= 2) return true;
        if (name.includes(namePart) || namePart.includes(name)) return true;
        return false;
      });
    }

    if (!nameMatch) {
      // console.log(`[DEBUG] Name Mismatch: "${candidate.name}" vs "${namePart}"`);
      return false;
    }

    // 2. Context Match
    // If we have active contexts, check them against resolved properties
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
        // e.g. input "loona" might match property "Loona" even if not in activeContexts
        const manualContextMatch = inputWords.some(w => {
           if (targetNames.some(n => n.includes(w))) return false; // skip if it's part of the name
           return candidate.resolvedProperties.some(p => p.includes(w));
        });
        if (manualContextMatch) return true;

        return false;
      }
    } else {
       // If no context was detected in the MAP, but the user typed multiple words
       // check if the non-name words match any properties.
       // e.g. "japanese singer" -> "japanese" might match "citizenship: japan"
    }

    return true;
  },
};

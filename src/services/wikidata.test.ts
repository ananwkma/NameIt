import { describe, it, expect, beforeEach, vi } from 'vitest';
import axios from 'axios';
import MockAdapter from 'axios-mock-adapter';
import { WikidataService } from './wikidata';

const mock = new MockAdapter(axios);

describe('WikidataService', () => {
  beforeEach(() => {
    mock.reset();
    WikidataService.clearCaches();
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('should return a woman if search and validation succeed', async () => {
    // Mock Search A (query list search)
    mock.onGet('https://www.wikidata.org/w/api.php', { params: expect.objectContaining({ action: 'query' }) }).reply(200, {
      query: { search: [{ title: 'Q1' }] }
    });

    // Mock Search B & C (wbsearchentities)
    mock.onGet('https://www.wikidata.org/w/api.php', { params: expect.objectContaining({ action: 'wbsearchentities' }) }).reply(200, {
      search: [{ id: 'Q1' }]
    });

    // Mock wbgetentities for details
    mock.onGet('https://www.wikidata.org/w/api.php', { params: expect.objectContaining({ action: 'wbgetentities', ids: 'Q1', props: 'claims|labels|descriptions|sitelinks/urls|aliases' }) }).reply(200, {
      entities: {
        Q1: {
          id: 'Q1',
          labels: { en: { value: 'Billie Eilish' } },
          descriptions: { en: { value: 'American singer' } },
          sitelinks: { enwiki: { title: 'Billie Eilish' }, frwiki: { title: 'Billie Eilish' } },
          aliases: { en: [{ value: 'Billie Eilish Pirate Baird O\'Connell' }] },
          claims: {
            P31: [{ mainsnak: { datavalue: { value: { id: 'Q5' } } } }], // Human
            P21: [{ mainsnak: { datavalue: { value: { id: 'Q6581072' } } } }] // Female
          }
        }
      }
    });

    const result = await WikidataService.searchWoman('Billie Eilish');
    expect(result).not.toBeNull();
    expect(result?.name).toBe('Billie Eilish');
    expect(result?.id).toBe('Q1');
  });

  it('should use cache for repeated searches', async () => {
     let callCount = 0;
     mock.onGet('https://www.wikidata.org/w/api.php').reply(() => {
       callCount++;
       return [200, {
         query: { search: [{ title: 'Q1' }] },
         search: [{ id: 'Q1' }],
         entities: {
           Q1: {
             id: 'Q1',
             labels: { en: { value: 'Billie Eilish' } },
             claims: {
               P31: [{ mainsnak: { datavalue: { value: { id: 'Q5' } } } }],
               P21: [{ mainsnak: { datavalue: { value: { id: 'Q6581072' } } } }]
             }
           }
         }
       }];
     });

     await WikidataService.searchWoman('Billie Eilish');
     const countAfterFirst = callCount;
     
     const secondResult = await WikidataService.searchWoman('Billie Eilish');
     expect(secondResult?.name).toBe('Billie Eilish');
     expect(callCount).toBe(countAfterFirst); // No new calls
  });

  it('should rank by sitelinks', async () => {
    mock.onGet('https://www.wikidata.org/w/api.php', { params: expect.objectContaining({ action: 'query' }) }).reply(200, {
      query: { search: [{ title: 'Q1' }, { title: 'Q2' }] }
    });
    mock.onGet('https://www.wikidata.org/w/api.php', { params: expect.objectContaining({ action: 'wbsearchentities' }) }).reply(200, {
      search: [{ id: 'Q1' }, { id: 'Q2' }]
    });

    mock.onGet('https://www.wikidata.org/w/api.php', { params: expect.objectContaining({ action: 'wbgetentities', ids: 'Q1|Q2' }) }).reply(200, {
      entities: {
        Q1: {
          id: 'Q1',
          labels: { en: { value: 'Famous Woman' } },
          sitelinks: { a: {}, b: {} }, // 2 sitelinks
          claims: {
            P31: [{ mainsnak: { datavalue: { value: { id: 'Q5' } } } }],
            P21: [{ mainsnak: { datavalue: { value: { id: 'Q6581072' } } } }]
          }
        },
        Q2: {
          id: 'Q2',
          labels: { en: { value: 'More Famous Woman' } },
          sitelinks: { a: {}, b: {}, c: {}, d: {} }, // 4 sitelinks
          claims: {
            P31: [{ mainsnak: { datavalue: { value: { id: 'Q5' } } } }],
            P21: [{ mainsnak: { datavalue: { value: { id: 'Q6581072' } } } }]
          }
        }
      }
    });

    const result = await WikidataService.searchWoman('Woman');
    expect(result?.id).toBe('Q2'); // Q2 has more sitelinks
  });

  it('should support fuzzy matching for aliases', async () => {
    mock.onGet('https://www.wikidata.org/w/api.php', { params: expect.objectContaining({ action: 'query' }) }).reply(200, {
      query: { search: [{ title: 'Q1' }] }
    });
    mock.onGet('https://www.wikidata.org/w/api.php', { params: expect.objectContaining({ action: 'wbsearchentities' }) }).reply(200, {
      search: [{ id: 'Q1' }]
    });

    mock.onGet('https://www.wikidata.org/w/api.php', { params: expect.objectContaining({ action: 'wbgetentities' }) }).reply(200, {
      entities: {
        Q1: {
          id: 'Q1',
          labels: { en: { value: 'Jisoo' } },
          aliases: { en: [{ value: 'Kim Ji-soo' }] },
          claims: {
            P31: [{ mainsnak: { datavalue: { value: { id: 'Q5' } } } }],
            P21: [{ mainsnak: { datavalue: { value: { id: 'Q6581072' } } } }]
          }
        }
      }
    });

    // "Kim Ji-su" vs "Kim Ji-soo" is 1-char diff (fuzzy match)
    const result = await WikidataService.searchWoman('Kim Ji-su');
    expect(result).not.toBeNull();
    expect(result?.name).toBe('Jisoo');
  });

  it('should fetch only top 5 candidates', async () => {
      const ids = Array.from({ length: 10 }, (_, i) => `Q${i+1}`);
      mock.onGet('https://www.wikidata.org/w/api.php', { params: expect.objectContaining({ action: 'query' }) }).reply(200, {
        query: { search: ids.map(id => ({ title: id })) }
      });
      mock.onGet('https://www.wikidata.org/w/api.php', { params: expect.objectContaining({ action: 'wbsearchentities' }) }).reply(200, {
        search: ids.map(id => ({ id }))
      });

      // Expect wbgetentities to be called with only top 5 IDs
      const top5Ids = ids.slice(0, 5).join('|');
      mock.onGet('https://www.wikidata.org/w/api.php', { params: expect.objectContaining({ action: 'wbgetentities', ids: top5Ids }) }).reply(200, {
        entities: {
          Q1: {
            id: 'Q1',
            labels: { en: { value: 'Woman 1' } },
            claims: {
              P31: [{ mainsnak: { datavalue: { value: { id: 'Q5' } } } }],
              P21: [{ mainsnak: { datavalue: { value: { id: 'Q6581072' } } } }]
            }
          }
        }
      });

      const result = await WikidataService.searchWoman('Woman');
      expect(result).not.toBeNull();
      expect(result?.id).toBe('Q1');
  });

  it('should cache property labels', async () => {
    mock.onGet('https://www.wikidata.org/w/api.php', { params: expect.objectContaining({ action: 'query' }) }).reply(200, {
      query: { search: [{ title: 'Q1' }] }
    });
    mock.onGet('https://www.wikidata.org/w/api.php', { params: expect.objectContaining({ action: 'wbsearchentities' }) }).reply(200, {
      search: [{ id: 'Q1' }]
    });

    // Q1 has a property pointing to Q100
    mock.onGet('https://www.wikidata.org/w/api.php', { params: expect.objectContaining({ action: 'wbgetentities', ids: 'Q1' }) }).reply(200, {
      entities: {
        Q1: {
          id: 'Q1',
          labels: { en: { value: 'Woman' } },
          claims: {
            P31: [{ mainsnak: { datavalue: { value: { id: 'Q5' } } } }],
            P21: [{ mainsnak: { datavalue: { value: { id: 'Q6581072' } } } }],
            P106: [{ mainsnak: { datavalue: { value: { id: 'Q100' } } } }]
          }
        }
      }
    });

    // Mock label fetch for Q100
    let labelCallCount = 0;
    mock.onGet('https://www.wikidata.org/w/api.php', { params: expect.objectContaining({ action: 'wbgetentities', ids: 'Q100', props: 'labels' }) }).reply(() => {
      labelCallCount++;
      return [200, {
        entities: {
          Q100: { labels: { en: { value: 'Singer' } } }
        }
      }];
    });

    await WikidataService.searchWoman('Woman');
    expect(labelCallCount).toBe(1);

    // Clear search cache but NOT property cache (manually clearing search cache only)
    // Actually searchWoman caches the whole result. To test property cache, we need a different search.
    
    mock.onGet('https://www.wikidata.org/w/api.php', { params: expect.objectContaining({ action: 'query', srsearch: 'Other' }) }).reply(200, {
        query: { search: [{ title: 'Q2' }] }
    });
    mock.onGet('https://www.wikidata.org/w/api.php', { params: expect.objectContaining({ action: 'wbsearchentities', search: 'other' }) }).reply(200, {
        search: [{ id: 'Q2' }]
    });
    mock.onGet('https://www.wikidata.org/w/api.php', { params: expect.objectContaining({ action: 'wbgetentities', ids: 'Q2' }) }).reply(200, {
        entities: {
          Q2: {
            id: 'Q2',
            labels: { en: { value: 'Other Woman' } },
            claims: {
              P31: [{ mainsnak: { datavalue: { value: { id: 'Q5' } } } }],
              P21: [{ mainsnak: { datavalue: { value: { id: 'Q6581072' } } } }],
              P106: [{ mainsnak: { datavalue: { value: { id: 'Q100' } } } }] // Same property Q100
            }
          }
        }
    });

    await WikidataService.searchWoman('Other');
    expect(labelCallCount).toBe(1); // Should still be 1 because Q100 was cached
  });
});

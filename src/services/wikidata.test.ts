import { describe, it, expect, beforeEach } from 'vitest';
import axios from 'axios';
import MockAdapter from 'axios-mock-adapter';
import { WikidataService } from './wikidata';

const mock = new MockAdapter(axios);

describe('WikidataService', () => {
  beforeEach(() => {
    mock.reset();
  });

  it('should return a woman if search and validation succeed', async () => {
    // Mock wbsearchentities
    mock.onGet('https://www.wikidata.org/w/api.php').reply(200, {
      search: [{ id: 'Q1', label: 'Billie Eilish', description: 'Singer' }]
    });

    // Mock SPARQL
    mock.onGet('https://query.wikidata.org/sparql').reply(200, {
      results: {
        bindings: [
          {
            item: { value: 'http://www.wikidata.org/entity/Q1' },
            itemLabel: { value: 'Billie Eilish' },
            itemDescription: { value: 'Singer' }
          }
        ]
      }
    });

    const result = await WikidataService.searchWoman('Billie Eilish');
    expect(result).not.toBeNull();
    expect(result?.name).toBe('Billie Eilish');
    expect(result?.id).toBe('Q1');
  });

  it('should return null if no human female is found', async () => {
    mock.onGet('https://www.wikidata.org/w/api.php').reply(200, {
      search: [{ id: 'Q2', label: 'Tom Cruise', description: 'Actor' }]
    });

    mock.onGet('https://query.wikidata.org/sparql').reply(200, {
      results: {
        bindings: [] // No results after filtering for female humans
      }
    });

    const result = await WikidataService.searchWoman('Tom Cruise');
    expect(result).toBeNull();
  });
});

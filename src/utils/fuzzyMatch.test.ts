import { describe, it, expect } from 'vitest';
import { getLevenshteinDistance, getSimilarityRatio, fuzzyMatchNames } from './fuzzyMatch';

describe('fuzzyMatch utilities', () => {
  describe('getLevenshteinDistance', () => {
    it('should return 0 for identical strings', () => {
      expect(getLevenshteinDistance('test', 'test')).toBe(0);
      expect(getLevenshteinDistance('Marie Curie', 'Marie Curie')).toBe(0);
    });

    it('should be case-insensitive and handle trimming', () => {
      expect(getLevenshteinDistance('test', 'TEST')).toBe(0);
      expect(getLevenshteinDistance(' test ', 'test')).toBe(0);
    });

    it('should calculate correct distance for substitutions', () => {
      expect(getLevenshteinDistance('test', 'text')).toBe(1);
      expect(getLevenshteinDistance('kitten', 'sitting')).toBe(3);
    });

    it('should calculate correct distance for insertions', () => {
      expect(getLevenshteinDistance('test', 'tests')).toBe(1);
    });

    it('should calculate correct distance for deletions', () => {
      expect(getLevenshteinDistance('tests', 'test')).toBe(1);
    });

    it('should handle empty strings', () => {
      expect(getLevenshteinDistance('', 'test')).toBe(4);
      expect(getLevenshteinDistance('test', '')).toBe(4);
      expect(getLevenshteinDistance('', '')).toBe(0);
    });
  });

  describe('getSimilarityRatio', () => {
    it('should return 1 for identical strings', () => {
      expect(getSimilarityRatio('test', 'test')).toBe(1.0);
    });

    it('should calculate correct similarity ratio', () => {
      // 'test' vs 'text': distance 1, maxLength 4 -> (4-1)/4 = 0.75
      expect(getSimilarityRatio('test', 'text')).toBe(0.75);
      
      // 'Marie' vs 'Maria': distance 1, maxLength 5 -> (5-1)/5 = 0.8
      expect(getSimilarityRatio('Marie', 'Maria')).toBe(0.8);
    });

    it('should handle empty strings', () => {
      expect(getSimilarityRatio('', '')).toBe(1.0);
      expect(getSimilarityRatio('test', '')).toBe(0);
    });
  });

  describe('fuzzyMatchNames', () => {
    it('should match identical names', () => {
      expect(fuzzyMatchNames('Marie Curie', 'Marie Curie')).toBe(true);
      expect(fuzzyMatchNames('marie curie', 'MARIE CURIE')).toBe(true);
    });

    it('should match with 1 character difference', () => {
      expect(fuzzyMatchNames('Marie Curie', 'Maria Curie')).toBe(true);
    });

    it('should match with 2 character difference', () => {
      expect(fuzzyMatchNames('Marie Curie', 'Maria Curia')).toBe(true);
    });

    it('should match with > 2 characters but >= 80% similarity', () => {
      // 'Elizabeth Blackwell' (19 chars) vs 'Elisabeth Blackwell' (19 chars)
      // Distance is 1 (s vs z).
      expect(fuzzyMatchNames('Elizabeth Blackwell', 'Elisabeth Blackwell')).toBe(true);

      // 'Florence Nightingale' (20 chars) vs 'Florenz Nightingal' (18 chars)
      // Distance is 3: c->z, e deleted, e deleted.
      // (20-3)/20 = 0.85
      expect(fuzzyMatchNames('Florence Nightingale', 'Florenz Nightingal')).toBe(true);
    });

    it('should not match if distance > 2 AND similarity < 80%', () => {
      // 'Marie' (5 chars) vs 'Mary' (4 chars)
      // Distance is 2 ('ie' -> 'y'). (5-2)/5 = 0.6. Matches by distance 2.
      expect(fuzzyMatchNames('Marie', 'Mary')).toBe(true);

      // 'Ada Lovelace' vs 'Grace Hopper'
      expect(fuzzyMatchNames('Ada Lovelace', 'Grace Hopper')).toBe(false);
    });

    it('should handle names with common typos', () => {
      expect(fuzzyMatchNames('Rosalind Franklin', 'Rosalind Franklyn')).toBe(true);
      expect(fuzzyMatchNames('Jane Goodall', 'Jayne Goodall')).toBe(true);
    });
  });
});

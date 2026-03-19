/**
 * Calculates the Levenshtein distance between two strings.
 * The distance is the minimum number of single-character edits (insertions, deletions or substitutions)
 * required to change one string into the other.
 */
export function getLevenshteinDistance(a: string, b: string): number {
  const s1 = a.toLowerCase().trim();
  const s2 = b.toLowerCase().trim();

  if (s1.length === 0) return s2.length;
  if (s2.length === 0) return s1.length;

  const matrix: number[][] = [];

  // Initialize matrix
  for (let i = 0; i <= s1.length; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= s2.length; j++) {
    matrix[0][j] = j;
  }

  // Fill matrix
  for (let i = 1; i <= s1.length; i++) {
    for (let j = 1; j <= s2.length; j++) {
      if (s1[i - 1] === s2[j - 1]) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j] + 1,    // deletion
          matrix[i][j - 1] + 1,    // insertion
          matrix[i - 1][j - 1] + 1 // substitution
        );
      }
    }
  }

  return matrix[s1.length][s2.length];
}

/**
 * Calculates a similarity ratio between two strings using Levenshtein distance.
 * Returns a value between 0 and 1, where 1 is an exact match.
 */
export function getSimilarityRatio(a: string, b: string): number {
  const distance = getLevenshteinDistance(a, b);
  const maxLength = Math.max(a.trim().length, b.trim().length);
  
  if (maxLength === 0) return 1.0;
  
  return (maxLength - distance) / maxLength;
}

/**
 * Performs a fuzzy match between two names based on the project rule:
 * - 2-character difference OR 80% similarity
 * 
 * Strings are normalized (lowercase and trimmed) before comparison.
 */
export function fuzzyMatchNames(target: string, candidate: string): boolean {
  const s1 = target.toLowerCase().trim();
  const s2 = candidate.toLowerCase().trim();

  // Exact match shortcut
  if (s1 === s2) return true;

  const distance = getLevenshteinDistance(s1, s2);
  
  // Rule: 2-character difference OR 80% similarity
  if (distance <= 2) return true;
  
  const ratio = getSimilarityRatio(s1, s2);
  if (ratio >= 0.8) return true;

  return false;
}

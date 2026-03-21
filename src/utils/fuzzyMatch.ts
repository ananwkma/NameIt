/**
 * Calculates the Damerau-Levenshtein distance between two strings.
 * Like Levenshtein but also counts adjacent transpositions (e.g. "jnix"→"jinx") as a single edit.
 * Used for allowlist-only categories (LoL, NBA, Men) with length-aware thresholds:
 *   < 10 chars → distance ≤ 1 (one typo or one swap)
 *   ≥ 10 chars → distance ≤ 2 (two typos or two swaps, or one of each)
 */
export function getDamerauLevenshteinDistance(a: string, b: string): number {
  const s1 = a.toLowerCase().trim();
  const s2 = b.toLowerCase().trim();

  if (s1.length === 0) return s2.length;
  if (s2.length === 0) return s1.length;

  const m = s1.length;
  const n = s2.length;
  const d: number[][] = Array.from({ length: m + 1 }, (_, i) =>
    Array.from({ length: n + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0))
  );

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = s1[i - 1] === s2[j - 1] ? 0 : 1;
      d[i][j] = Math.min(
        d[i - 1][j] + 1,        // deletion
        d[i][j - 1] + 1,        // insertion
        d[i - 1][j - 1] + cost  // substitution
      );
      // Transposition of two adjacent characters
      if (i > 1 && j > 1 && s1[i - 1] === s2[j - 2] && s1[i - 2] === s2[j - 1]) {
        d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + cost);
      }
    }
  }

  return d[m][n];
}

/**
 * Fuzzy match for allowlist-only categories (LoL champions, NBA players, Men).
 * Uses Damerau-Levenshtein with length-aware thresholds:
 *   < 10 chars → 1 edit allowed  ("jynx" ✓ for "jinx", "jnix" ✓ for "jinx")
 *   ≥ 10 chars → 2 edits allowed ("himerdingerr" ✓ for "heimerdinger")
 */
export function fuzzyMatchAllowlist(target: string, candidate: string): boolean {
  const s1 = target.toLowerCase().trim();
  const s2 = candidate.toLowerCase().trim();

  if (s1 === s2) return true;

  // Don't match very short inputs to longer names (prevents "j" matching "Janna")
  if (s2.length <= 2 && s1.length > s2.length + 1) return false;

  const len = Math.max(s1.length, s2.length);
  const threshold = len >= 10 ? 2 : 1;

  return getDamerauLevenshteinDistance(s1, s2) <= threshold;
}

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

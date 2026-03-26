import { createClient, SupabaseClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

// Null when env vars are not set — all helpers guard against this.
// This is the expected path for local dev without a Supabase project.
export const supabase: SupabaseClient | null =
  supabaseUrl && supabaseAnonKey
    ? createClient(supabaseUrl, supabaseAnonKey)
    : null;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface LeaderboardEntry {
  player_name: string;
  time_ms: number;
  created_at: string;
}

// ---------------------------------------------------------------------------
// Leaderboard helpers
// ---------------------------------------------------------------------------

/**
 * Fetch the top 5 leaderboard entries for a given game mode.
 * Returns [] when Supabase is unavailable or on error.
 * Wrapped in a 5-second timeout to handle free-tier cold-start pauses.
 */
export async function fetchLeaderboard(gameId: string): Promise<LeaderboardEntry[]> {
  if (!supabase) return [];

  const query = supabase
    .from('leaderboard')
    .select('player_name, time_ms, created_at')
    .eq('game_id', gameId)
    .order('time_ms', { ascending: true })
    .limit(5)
    .then(({ data, error }) => {
      if (error) {
        console.warn('[Supabase] fetchLeaderboard error:', error.message);
        return [];
      }
      return (data ?? []) as LeaderboardEntry[];
    });

  const timeout = new Promise<LeaderboardEntry[]>((resolve) =>
    setTimeout(() => resolve([]), 5000)
  );

  return Promise.race([query, timeout]);
}

/**
 * Insert a leaderboard entry for the given game.
 * Player name is uppercased and clamped to 5 characters.
 * Returns true on success, false on error or when Supabase is unavailable.
 */
export async function submitLeaderboardEntry(
  gameId: string,
  playerName: string,
  timeMs: number
): Promise<boolean> {
  if (!supabase) return false;

  const { error } = await supabase.from('leaderboard').insert({
    game_id: gameId,
    player_name: playerName.toUpperCase().slice(0, 5),
    time_ms: timeMs,
  });

  if (error) {
    console.warn('[Supabase] submitLeaderboardEntry error:', error.message);
    return false;
  }
  return true;
}

// ---------------------------------------------------------------------------
// LLM allowlist helpers
// ---------------------------------------------------------------------------

/**
 * Persist a LLM-validated entry to the shared allowlist table so all users
 * benefit from prior LLM calls. Upserts with ignoreDuplicates to avoid
 * overwriting existing canonical entries.
 * Never throws — fire-and-forget safe.
 */
export async function saveLlmAllowlistEntry(
  categoryId: string,
  inputNormalized: string,
  canonicalName: string,
  description: string
): Promise<void> {
  if (!supabase) return;

  const { error } = await supabase.from('llm_allowlist').upsert(
    {
      category_id: categoryId,
      input_normalized: inputNormalized,
      canonical_name: canonicalName,
      description,
    },
    { onConflict: 'category_id,input_normalized', ignoreDuplicates: true }
  );

  if (error) console.warn('[Supabase] saveLlmAllowlistEntry error:', error.message);
}

/**
 * Query the shared LLM allowlist for a previously-validated entry.
 * Returns null when Supabase is unavailable, on error, or when no entry exists.
 * Wrapped in a 3-second timeout to avoid blocking the verification flow.
 */
export async function queryLlmAllowlist(
  categoryId: string,
  normalizedInput: string
): Promise<{ canonical_name: string; description: string } | null> {
  if (!supabase) return null;

  const query = supabase
    .from('llm_allowlist')
    .select('canonical_name, description')
    .eq('category_id', categoryId)
    .eq('input_normalized', normalizedInput)
    .maybeSingle()
    .then(({ data, error }) => {
      if (error) {
        console.warn('[Supabase] queryLlmAllowlist error:', error.message);
        return null;
      }
      return data as { canonical_name: string; description: string } | null;
    });

  const timeout = new Promise<null>((resolve) =>
    setTimeout(() => resolve(null), 3000)
  );

  return Promise.race([query, timeout]);
}

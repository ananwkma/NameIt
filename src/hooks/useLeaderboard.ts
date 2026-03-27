import { useState, useEffect } from 'react';
import { supabase, fetchLeaderboard, submitLeaderboardEntry, LeaderboardEntry } from '../services/supabase';

interface UseLeaderboardReturn {
  entries: LeaderboardEntry[];
  loading: boolean;
  unavailable: boolean;
  qualifies: boolean;
  playerRank: number | null;
  submitName: (name: string) => Promise<void>;
  submitted: boolean;
}

export function useLeaderboard(gameId: string, myTimeMs: number): UseLeaderboardReturn {
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [unavailable, setUnavailable] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [playerRank, setPlayerRank] = useState<number | null>(null);

  useEffect(() => {
    if (!gameId || !myTimeMs) return;

    let cancelled = false;

    async function load() {
      setLoading(true);

      if (supabase === null) {
        if (!cancelled) {
          setUnavailable(true);
          setLoading(false);
        }
        return;
      }

      const result = await fetchLeaderboard(gameId);
      if (!cancelled) {
        setEntries(result);
        setLoading(false);
      }
    }

    load();
    return () => { cancelled = true; };
  }, [gameId, myTimeMs]);

  // Derived: qualifies if not unavailable, not yet submitted, and time beats 5th place (or fewer than 5)
  const qualifies =
    !unavailable &&
    !submitted &&
    !loading &&
    (entries.length < 5 || myTimeMs < entries[entries.length - 1].time_ms);

  async function submitName(name: string): Promise<void> {
    await submitLeaderboardEntry(gameId, name, myTimeMs);
    const updated = await fetchLeaderboard(gameId);
    // Find rank: 1-based position of myTimeMs in the updated list
    const rank = updated.findIndex((e) => e.time_ms === myTimeMs) + 1;
    setEntries(updated);
    setSubmitted(true);
    setPlayerRank(rank > 0 ? rank : null);
  }

  return { entries, loading, unavailable, qualifies, playerRank, submitName, submitted };
}

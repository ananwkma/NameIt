import { useReducer, useRef, useEffect, useState } from 'react';
import { useLeaderboard } from '../hooks/useLeaderboard';
import { useNavigate } from 'react-router-dom';
import { Search, AlertCircle, Clock } from 'lucide-react';
import { motion } from 'framer-motion';
import { formatTime } from '../utils/formatTime';
import { isBadWord } from '../utils/badWords';
import { fuzzyMatchAllowlist } from '../utils/fuzzyMatch';
import confetti from 'canvas-confetti';
import { ALL_POKEMON_GEN1 } from '../data/pokemon-gen1';

const TOTAL = ALL_POKEMON_GEN1.length; // 151

const STORAGE_KEY = 'pokemon-gen1-all-progress';

interface PokemonAllState {
  guessed: Set<string>;   // stores number as string, e.g. '25' for Pikachu
  revealed: Set<string>;  // stores number as string (easy mode reveals)
  revealing: Set<string>; // in "REVEAL?" pending state (number as string)
  error: string | null;
  status: 'PLAYING' | 'PAUSED' | 'WIN' | 'GAVE_UP';
  timeElapsed: number;
  lastTick: number | null;
}

type PokemonAllAction =
  | { type: 'GUESS_CORRECT'; payload: string }
  | { type: 'SET_ERROR'; payload: string | null }
  | { type: 'TICK'; payload: number }
  | { type: 'PAUSE_GAME' }
  | { type: 'RESUME_GAME' }
  | { type: 'REVEAL_PENDING'; payload: string }
  | { type: 'REVEAL_CONFIRM'; payload: string }
  | { type: 'REVEAL_CANCEL'; payload: string }
  | { type: 'RESET' }
  | { type: 'GIVE_UP' };

function loadSavedState(): PokemonAllState {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      return {
        guessed: new Set(parsed.guessed ?? []),
        revealed: new Set(parsed.revealed ?? []),
        revealing: new Set(),
        error: null,
        status: 'PLAYING',
        timeElapsed: parsed.timeElapsed ?? 0,
        lastTick: null,
      };
    }
  } catch {}
  return {
    guessed: new Set(),
    revealed: new Set(),
    revealing: new Set(),
    error: null,
    status: 'PLAYING',
    timeElapsed: 0,
    lastTick: null,
  };
}

function pokemonAllReducer(state: PokemonAllState, action: PokemonAllAction): PokemonAllState {
  switch (action.type) {
    case 'GUESS_CORRECT': {
      const newGuessed = new Set(state.guessed);
      newGuessed.add(action.payload);
      const total = newGuessed.size + state.revealed.size;
      return {
        ...state,
        guessed: newGuessed,
        error: null,
        status: total >= TOTAL ? 'WIN' : 'PLAYING',
      };
    }
    case 'REVEAL_PENDING': {
      const newRevealing = new Set(state.revealing);
      newRevealing.add(action.payload);
      return { ...state, revealing: newRevealing };
    }
    case 'REVEAL_CONFIRM': {
      const numStr = action.payload;
      const newRevealing = new Set(state.revealing);
      newRevealing.delete(numStr);
      const newRevealed = new Set(state.revealed);
      newRevealed.add(numStr);
      const total = state.guessed.size + newRevealed.size;
      return {
        ...state,
        revealing: newRevealing,
        revealed: newRevealed,
        status: total >= TOTAL ? 'WIN' : 'PLAYING',
      };
    }
    case 'REVEAL_CANCEL': {
      const newRevealing = new Set(state.revealing);
      newRevealing.delete(action.payload);
      return { ...state, revealing: newRevealing };
    }
    case 'SET_ERROR':
      return { ...state, error: action.payload };
    case 'PAUSE_GAME':
      return { ...state, status: 'PAUSED', lastTick: null };
    case 'RESUME_GAME':
      return { ...state, status: 'PLAYING', lastTick: Date.now() };
    case 'TICK': {
      if (state.status !== 'PLAYING') return state;
      const delta = action.payload - (state.lastTick || action.payload);
      return { ...state, timeElapsed: state.timeElapsed + delta, lastTick: action.payload };
    }
    case 'RESET':
      return { guessed: new Set(), revealed: new Set(), revealing: new Set(), error: null, status: 'PLAYING', timeElapsed: 0, lastTick: null };
    case 'GIVE_UP':
      return { ...state, status: 'GAVE_UP', lastTick: null };
  }
}

export function PokemonAllScreen() {
  const navigate = useNavigate();
  const [state, dispatch] = useReducer(pokemonAllReducer, undefined, loadSavedState);
  const [mode, setMode] = useState<'easy' | 'normal'>('normal');
  const [giveUpPending, setGiveUpPending] = useState(false);
  const giveUpTimer = useRef<number | null>(null);
  const [inputValue, setInputValue] = useState('');
  const [nameInput, setNameInput] = useState('');
  const [nameError, setNameError] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const confettiCanvasRef = useRef<HTMLCanvasElement>(null);
  const revealTimers = useRef<Map<string, number>>(new Map());

  const { entries, loading, unavailable, qualifies, playerRank, submitName, submitted } = useLeaderboard(
    state.status === 'WIN' ? 'pokemon-gen1-all' : '',
    state.status === 'WIN' ? state.timeElapsed : 0
  );

  // Save progress to localStorage
  useEffect(() => {
    if (state.status === 'WIN') return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      guessed: Array.from(state.guessed),
      revealed: Array.from(state.revealed),
      timeElapsed: state.timeElapsed,
    }));
  }, [state.guessed, state.revealed, state.timeElapsed, state.status]);

  // Clear on win
  useEffect(() => {
    if (state.status === 'WIN') localStorage.removeItem(STORAGE_KEY);
  }, [state.status]);

  // Timer
  useEffect(() => {
    if (state.status !== 'PLAYING') return;
    const interval = window.setInterval(() => {
      dispatch({ type: 'TICK', payload: Date.now() });
    }, 100);
    return () => clearInterval(interval);
  }, [state.status]);

  // Auto-dismiss error
  useEffect(() => {
    if (!state.error) return;
    const timer = setTimeout(() => dispatch({ type: 'SET_ERROR', payload: null }), 5000);
    return () => clearTimeout(timer);
  }, [state.error]);

  // Save best time on win
  useEffect(() => {
    if (state.status !== 'WIN') return;
    const saved = localStorage.getItem('game_besttime_pokemon-gen1-all');
    const current = saved ? parseInt(saved, 10) : Infinity;
    if (state.timeElapsed < current) {
      localStorage.setItem('game_besttime_pokemon-gen1-all', state.timeElapsed.toString());
    }
  }, [state.status, state.timeElapsed]);

  // Confetti on win
  useEffect(() => {
    if (state.status !== 'WIN' || !confettiCanvasRef.current) return;
    const fire = confetti.create(confettiCanvasRef.current, { resize: true });
    const end = Date.now() + 3000;
    const frame = () => {
      fire({ particleCount: 6, angle: 60, spread: 55, origin: { x: 0 } });
      fire({ particleCount: 6, angle: 120, spread: 55, origin: { x: 1 } });
      if (Date.now() < end) requestAnimationFrame(frame);
    };
    frame();
  }, [state.status]);

  // Escape key to pause/resume
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (state.status === 'PLAYING') dispatch({ type: 'PAUSE_GAME' });
        else if (state.status === 'PAUSED') dispatch({ type: 'RESUME_GAME' });
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [state.status]);

  const handleChipClick = (numStr: string) => {
    if (mode !== 'easy') return;
    if (state.status !== 'PLAYING') return;
    if (state.guessed.has(numStr) || state.revealed.has(numStr)) return;

    if (state.revealing.has(numStr)) {
      // Second click within 5s — confirm reveal
      const timer = revealTimers.current.get(numStr);
      if (timer) { clearTimeout(timer); revealTimers.current.delete(numStr); }
      dispatch({ type: 'REVEAL_CONFIRM', payload: numStr });
    } else {
      // First click — enter pending state
      dispatch({ type: 'REVEAL_PENDING', payload: numStr });
      const timer = window.setTimeout(() => {
        dispatch({ type: 'REVEAL_CANCEL', payload: numStr });
        revealTimers.current.delete(numStr);
      }, 5000);
      revealTimers.current.set(numStr, timer);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const name = inputValue.trim();
    if (!name || state.status !== 'PLAYING') return;
    setInputValue('');

    const pokemon =
      ALL_POKEMON_GEN1.find(p => p.name.toLowerCase() === name.toLowerCase()) ??
      ALL_POKEMON_GEN1.find(p => fuzzyMatchAllowlist(p.name, name));

    if (!pokemon) {
      dispatch({ type: 'SET_ERROR', payload: `"${name}" is not a Gen 1 Pokémon.` });
      return;
    }
    const numStr = String(pokemon.number);
    if (state.guessed.has(numStr) || state.revealed.has(numStr)) {
      dispatch({ type: 'SET_ERROR', payload: `${pokemon.name} already found!` });
      return;
    }
    dispatch({ type: 'GUESS_CORRECT', payload: numStr });
    inputRef.current?.focus();
  };

  const handleModeToggle = () => {
    localStorage.removeItem(STORAGE_KEY);
    dispatch({ type: 'RESET' });
    setInputValue('');
    setMode(m => m === 'easy' ? 'normal' : 'easy');
  };

  const foundCount = state.guessed.size + state.revealed.size;

  return (
    <div className="master-container">
      <div className="game-top">
        <header>
          <h2 className="game-title">Name All Gen 1 Pokémon</h2>
          <div className="header-right">
            <button
              className="secondary"
              onClick={handleModeToggle}
              style={{ fontFamily: 'monospace', fontSize: '1.1rem', fontWeight: 700, padding: '0 0.75rem', alignSelf: 'stretch', display: 'flex', alignItems: 'center', background: mode === 'easy' ? 'var(--accent)' : 'var(--primary)' }}
            >
              {mode === 'easy' ? 'Easy' : 'Normal'}
            </button>
            <div className="timer-display">
              <Clock size={16} className="timer-icon" />
              {formatTime(state.timeElapsed, true)}
            </div>
            <div className="counter">
              <span>{foundCount}</span>/{TOTAL}
            </div>
          </div>
        </header>

        <form onSubmit={handleSubmit} className="input-group">
          <div className="input-wrapper">
            <input
              ref={inputRef}
              type="text"
              value={inputValue}
              maxLength={50}
              onChange={(e) => {
                setInputValue(e.target.value);
                if (state.error) dispatch({ type: 'SET_ERROR', payload: null });
              }}
              placeholder="Type any Gen 1 Pokémon name"
              disabled={state.status !== 'PLAYING'}
              autoFocus
            />
            <Search className="icon search-icon" />
          </div>
        </form>

        {state.error && (
          <div className="error-message">
            <AlertCircle size={16} />
            <span>{state.error}</span>
          </div>
        )}

        {mode === 'normal' && state.status === 'PLAYING' && (
          <div style={{ marginTop: '0.5rem', textAlign: 'right' }}>
            <button
              className={`secondary${giveUpPending ? ' give-up-pending' : ''}`}
              style={{ fontSize: '0.85rem', padding: '0.3rem 0.75rem', minWidth: '5.5rem', background: giveUpPending ? 'var(--primary)' : undefined, color: giveUpPending ? '#fff' : undefined }}
              onClick={() => {
                if (giveUpPending) {
                  if (giveUpTimer.current) { clearTimeout(giveUpTimer.current); giveUpTimer.current = null; }
                  setGiveUpPending(false);
                  localStorage.removeItem(STORAGE_KEY);
                  dispatch({ type: 'GIVE_UP' });
                } else {
                  setGiveUpPending(true);
                  giveUpTimer.current = window.setTimeout(() => { setGiveUpPending(false); giveUpTimer.current = null; }, 3000);
                }
              }}
            >
              {giveUpPending ? 'Sure?' : 'Give Up'}
            </button>
          </div>
        )}
      </div>

      {/* EASY MODE: revealed tray + full numbered board */}
      {mode === 'easy' && (
        <>
          {state.revealed.size > 0 && (
            <div className="lol-all-revealed-tray">
              <span className="lol-all-revealed-label">Revealed</span>
              <div className="lol-all-revealed-chips">
                {Array.from(state.revealed)
                  .map(numStr => parseInt(numStr, 10))
                  .sort((a, b) => a - b)
                  .map(num => {
                    const pokemon = ALL_POKEMON_GEN1.find(p => p.number === num);
                    return pokemon ? (
                      <span key={num} className="lol-all-chip lol-all-chip--revealed">
                        {pokemon.name}
                      </span>
                    ) : null;
                  })}
              </div>
            </div>
          )}
          <div className="lol-all-board">
            <div className="lol-all-names" style={{ alignContent: 'start' }}>
              {ALL_POKEMON_GEN1.map(pokemon => {
                const numStr = String(pokemon.number);
                const guessed = state.guessed.has(numStr);
                const revealed = state.revealed.has(numStr);
                const revealing = state.revealing.has(numStr);

                let chipClass = 'lol-all-chip';
                if (guessed) chipClass += ' lol-all-chip--found';
                else if (revealed) chipClass += ' lol-all-chip--revealed';
                else if (revealing) chipClass += ' lol-all-chip--revealing';

                const label = guessed
                  ? pokemon.name
                  : revealed
                  ? pokemon.name
                  : revealing
                  ? 'REVEAL?'
                  : `#${pokemon.number}`;

                return (
                  <motion.span
                    key={numStr}
                    className={chipClass}
                    animate={guessed || revealed ? { opacity: 1, scale: [1.15, 1] } : { opacity: 1, scale: 1 }}
                    initial={false}
                    transition={{ duration: 0.2 }}
                    onClick={() => handleChipClick(numStr)}
                    style={{ cursor: guessed || revealed ? 'default' : 'pointer' }}
                  >
                    {label}
                  </motion.span>
                );
              })}
            </div>
          </div>
        </>
      )}

      {/* NORMAL MODE: full numbered board, unguessed show #N, not clickable */}
      {mode === 'normal' && (
        <div className="lol-all-board">
          <div className="lol-all-names" style={{ alignContent: 'start' }}>
            {ALL_POKEMON_GEN1.map(pokemon => {
              const numStr = String(pokemon.number);
              const guessed = state.guessed.has(numStr);

              return (
                <motion.span
                  key={numStr}
                  className={`lol-all-chip${guessed ? ' lol-all-chip--found' : ''}`}
                  animate={guessed ? { opacity: 1, scale: [1.15, 1] } : { opacity: 1, scale: 1 }}
                  initial={false}
                  transition={{ duration: 0.2 }}
                >
                  {guessed ? pokemon.name : `#${pokemon.number}`}
                </motion.span>
              );
            })}
          </div>
        </div>
      )}

      {/* PAUSE MODAL */}
      {state.status === 'PAUSED' && (
        <div className="modal-overlay">
          <div className="modal">
            <h2>Game Paused</h2>
            <div className="action-buttons">
              <button onClick={() => dispatch({ type: 'RESUME_GAME' })}>Resume</button>
              <button className="secondary" onClick={() => { localStorage.removeItem(STORAGE_KEY); navigate('/'); }}>Quit</button>
            </div>
          </div>
        </div>
      )}

      {state.status === 'WIN' && (
        <canvas
          ref={confettiCanvasRef}
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
            zIndex: 2000,
            pointerEvents: 'none',
          }}
        />
      )}

      {state.status === 'WIN' && (
        <div className="modal-overlay">
          <div className="modal victory-modal">
            <h2>You Did It!</h2>
            <div className="final-score">
              <p>All {TOTAL} Pokémon found in</p>
              <div className="big-number">{formatTime(state.timeElapsed, true)}</div>
            </div>
            {state.revealed.size > 0 && (
              <div className="stats-detail">
                <p>
                  {state.guessed.size} guessed &nbsp;·&nbsp;{' '}
                  <span style={{ color: '#e74c3c' }}>{state.revealed.size} revealed</span>
                </p>
              </div>
            )}
            {/* LEADERBOARD */}
            <div className="leaderboard-section">
              {loading && <p className="leaderboard-loading">Loading leaderboard…</p>}
              {unavailable && <p className="leaderboard-unavailable">Leaderboard unavailable</p>}
              {!loading && !unavailable && (
                <>
                  {entries.length > 0 && (
                    <table className="leaderboard-table">
                      <thead>
                        <tr><th>#</th><th>Name</th><th>Time</th></tr>
                      </thead>
                      <tbody>
                        {entries.map((entry, i) => (
                          <tr
                            key={i}
                            className={submitted && playerRank === i + 1 ? 'leaderboard-row-mine' : ''}
                          >
                            <td>{i + 1}</td>
                            <td>{entry.player_name}</td>
                            <td>{formatTime(entry.time_ms, true)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                  {qualifies && !submitted && (
                    <div className="leaderboard-entry">
                      <p>You made the top 5! Enter your name:</p>
                      <form onSubmit={async (e) => {
                        e.preventDefault();
                        const name = nameInput.trim();
                        if (!name) return;
                        if (isBadWord(name)) { setNameError('That name is not allowed.'); return; }
                        setNameError('');
                        await submitName(name);
                      }}>
                        <input
                          type="text"
                          value={nameInput}
                          maxLength={5}
                          onChange={(e) => { setNameInput(e.target.value.toUpperCase()); setNameError(''); }}
                          placeholder="XXXXX"
                          autoFocus
                        />
                        <button type="submit" disabled={!nameInput.trim()}>Submit</button>
                      </form>
                      {nameError && <p style={{ color: '#e53e3e', margin: '0.25rem 0 0', fontSize: '0.85rem' }}>{nameError}</p>}
                    </div>
                  )}
                  {submitted && playerRank && (
                    <p className="leaderboard-rank-confirm">You placed #{playerRank}!</p>
                  )}
                </>
              )}
            </div>
            <div className="action-buttons">
              <button onClick={() => navigate('/')}>Back to Categories</button>
            </div>
          </div>
        </div>
      )}

      {/* GAVE UP MODAL */}
      {state.status === 'GAVE_UP' && (() => {
        const missed = ALL_POKEMON_GEN1.filter(p => !state.guessed.has(String(p.number)));
        return (
          <div className="modal-overlay">
            <div className="modal">
              <h2 style={{ color: 'var(--primary)' }}>You Gave Up!</h2>
              <p style={{ margin: '0.25rem 0 0.75rem' }}>
                You got <strong>{state.guessed.size}</strong> / {TOTAL} Pokémon in {formatTime(state.timeElapsed, true)}.
              </p>
              {missed.length > 0 && (
                <div style={{ textAlign: 'left', marginBottom: '1rem' }}>
                  <p style={{ fontWeight: 700, marginBottom: '0.4rem' }}>You missed ({missed.length}):</p>
                  <div className="lol-all-names" style={{ alignContent: 'start' }}>
                    {missed.map(pokemon => (
                      <span key={pokemon.number} className="lol-all-chip" style={{ opacity: 1, background: 'var(--primary)', color: '#fff', border: 'none' }}>
                        {pokemon.name}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              <div className="action-buttons">
                <button onClick={() => { dispatch({ type: 'RESET' }); }}>Try Again</button>
                <button className="secondary" onClick={() => navigate('/')}>Back to Categories</button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}

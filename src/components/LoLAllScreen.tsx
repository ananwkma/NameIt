import { useReducer, useRef, useEffect, useState } from 'react';
import { useLeaderboard } from '../hooks/useLeaderboard';
import { useNavigate } from 'react-router-dom';
import { WikidataService } from '../services/wikidata';
import { Search, AlertCircle, Clock } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { formatTime } from '../utils/formatTime';
import { isBadWord } from '../utils/badWords';
import confetti from 'canvas-confetti';
import allowlistRaw from '../data/allowlist-lol.json';

const ALL_CHAMPIONS: string[] = (allowlistRaw as Array<{ name: string }>)
  .map(e => e.name)
  .sort((a, b) => a.localeCompare(b));

const TOTAL = ALL_CHAMPIONS.length; // 172

// Group champions by first letter
const CHAMPION_GROUPS: { letter: string; names: string[] }[] = [];
for (const name of ALL_CHAMPIONS) {
  const letter = name[0].toUpperCase();
  const group = CHAMPION_GROUPS.find(g => g.letter === letter);
  if (group) {
    group.names.push(name);
  } else {
    CHAMPION_GROUPS.push({ letter, names: [name] });
  }
}

interface LoLAllState {
  guessed: Set<string>;   // guessed by typing (lowercase)
  revealed: Set<string>;  // revealed by clicking twice (lowercase)
  revealing: Set<string>; // in "REVEAL?" pending state (lowercase)
  error: string | null;
  status: 'PLAYING' | 'PAUSED' | 'WIN';
  timeElapsed: number;
  lastTick: number | null;
}

type LoLAllAction =
  | { type: 'GUESS_CORRECT'; payload: string }
  | { type: 'SET_ERROR'; payload: string | null }
  | { type: 'TICK'; payload: number }
  | { type: 'PAUSE_GAME' }
  | { type: 'RESUME_GAME' }
  | { type: 'REVEAL_PENDING'; payload: string }
  | { type: 'REVEAL_CONFIRM'; payload: string }
  | { type: 'REVEAL_CANCEL'; payload: string };

const STORAGE_KEY = 'lol-all-progress';

function loadSavedState(): LoLAllState {
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

function lolAllReducer(state: LoLAllState, action: LoLAllAction): LoLAllState {
  switch (action.type) {
    case 'GUESS_CORRECT': {
      const newGuessed = new Set(state.guessed);
      newGuessed.add(action.payload.toLowerCase());
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
      newRevealing.add(action.payload.toLowerCase());
      return { ...state, revealing: newRevealing };
    }
    case 'REVEAL_CONFIRM': {
      const nameLower = action.payload.toLowerCase();
      const newRevealing = new Set(state.revealing);
      newRevealing.delete(nameLower);
      const newRevealed = new Set(state.revealed);
      newRevealed.add(nameLower);
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
      newRevealing.delete(action.payload.toLowerCase());
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
  }
}

export function LoLAllScreen() {
  const navigate = useNavigate();
  const [state, dispatch] = useReducer(lolAllReducer, undefined, loadSavedState);
  const [inputValue, setInputValue] = useState('');
  const [nameInput, setNameInput] = useState('');
  const [nameError, setNameError] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const confettiCanvasRef = useRef<HTMLCanvasElement>(null);
  const revealTimers = useRef<Map<string, number>>(new Map());

  const { entries, loading, unavailable, qualifies, playerRank, submitName, submitted } = useLeaderboard(
    state.status === 'WIN' ? 'lol-all' : '',
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
    const saved = localStorage.getItem('game_besttime_lol-all');
    const current = saved ? parseInt(saved, 10) : Infinity;
    if (state.timeElapsed < current) {
      localStorage.setItem('game_besttime_lol-all', state.timeElapsed.toString());
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

  const handleChipClick = (name: string) => {
    if (state.status !== 'PLAYING') return;
    const nameLower = name.toLowerCase();
    if (state.guessed.has(nameLower) || state.revealed.has(nameLower)) return;

    if (state.revealing.has(nameLower)) {
      // Second click within 5s — confirm reveal
      const timer = revealTimers.current.get(nameLower);
      if (timer) { clearTimeout(timer); revealTimers.current.delete(nameLower); }
      dispatch({ type: 'REVEAL_CONFIRM', payload: name });
    } else {
      // First click — enter pending state
      dispatch({ type: 'REVEAL_PENDING', payload: name });
      const timer = window.setTimeout(() => {
        dispatch({ type: 'REVEAL_CANCEL', payload: name });
        revealTimers.current.delete(nameLower);
      }, 5000);
      revealTimers.current.set(nameLower, timer);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const name = inputValue.trim();
    if (!name || state.status !== 'PLAYING') return;
    setInputValue('');

    const result = WikidataService.searchAllowlist(name.toLowerCase(), 'lol', true);

    if (!result) {
      dispatch({ type: 'SET_ERROR', payload: `"${name}" is not a recognized LoL champion.` });
      return;
    }

    const canonicalLower = result.name.toLowerCase();
    if (state.guessed.has(canonicalLower) || state.revealed.has(canonicalLower)) {
      dispatch({ type: 'SET_ERROR', payload: `${result.name} already found!` });
      return;
    }

    dispatch({ type: 'GUESS_CORRECT', payload: result.name });
    inputRef.current?.focus();
  };

  const foundCount = state.guessed.size + state.revealed.size;

  return (
    <div className="master-container">
      <div className="game-top">
        <header>
          <button className="back-btn" onClick={() => dispatch({ type: 'PAUSE_GAME' })}>←</button>
          <h2 className="game-title">Name All LoL Champions</h2>
          <div className="header-right">
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
              placeholder="Type any LoL champion's name"
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
      </div>

      {/* REVEALED NAMES TRAY */}
      {state.revealed.size > 0 && (
        <div className="lol-all-revealed-tray">
          <span className="lol-all-revealed-label">Revealed</span>
          <div className="lol-all-revealed-chips">
            {Array.from(state.revealed).sort().map(nameLower => {
              const canonical = ALL_CHAMPIONS.find(n => n.toLowerCase() === nameLower) ?? nameLower;
              return (
                <span key={nameLower} className="lol-all-chip lol-all-chip--revealed">
                  {canonical}
                </span>
              );
            })}
          </div>
        </div>
      )}

      {/* CHAMPION BOARD */}
      <div className="lol-all-board">
        <AnimatePresence>
          {CHAMPION_GROUPS.map(({ letter, names }) => {
            const groupComplete = names.every(n => state.guessed.has(n.toLowerCase()) || state.revealed.has(n.toLowerCase()));
            if (groupComplete) return null;
            return (
              <motion.div
                key={letter}
                className="lol-all-group"
                layout
                exit={{ opacity: 0, height: 0, marginBottom: 0, overflow: 'hidden' }}
                transition={{ duration: 0.4, ease: 'easeInOut' }}
              >
                <span className="lol-all-letter">{letter}</span>
                <div className="lol-all-names">
                  {names.map(name => {
                    const nameLower = name.toLowerCase();
                    const guessed = state.guessed.has(nameLower);
                    const revealed = state.revealed.has(nameLower);
                    const revealing = state.revealing.has(nameLower);

                    let chipClass = 'lol-all-chip';
                    if (guessed) chipClass += ' lol-all-chip--found';
                    else if (revealed) chipClass += ' lol-all-chip--revealed';
                    else if (revealing) chipClass += ' lol-all-chip--revealing';

                    return (
                      <motion.span
                        key={name}
                        className={chipClass}
                        animate={guessed || revealed ? { opacity: 1, scale: [1.15, 1] } : { opacity: 1, scale: 1 }}
                        initial={false}
                        transition={{ duration: 0.2 }}
                        onClick={() => handleChipClick(name)}
                        style={{ cursor: guessed || revealed ? 'default' : 'pointer' }}
                      >
                        {guessed ? name : revealed ? name : revealing ? 'REVEAL?' : ''}
                      </motion.span>
                    );
                  })}
                </div>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>

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
              <p>All {TOTAL} champions found in</p>
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
    </div>
  );
}

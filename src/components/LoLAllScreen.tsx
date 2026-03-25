import { useReducer, useRef, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { WikidataService } from '../services/wikidata';
import { Search, AlertCircle, Clock } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { formatTime } from '../utils/formatTime';
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

const initialState: LoLAllState = {
  guessed: new Set(),
  revealed: new Set(),
  revealing: new Set(),
  error: null,
  status: 'PLAYING',
  timeElapsed: 0,
  lastTick: null,
};

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
  const [state, dispatch] = useReducer(lolAllReducer, initialState);
  const [inputValue, setInputValue] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const confettiCanvasRef = useRef<HTMLCanvasElement>(null);
  const revealTimers = useRef<Map<string, number>>(new Map());

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
          <h2 className="game-title">Name All LoL Champions</h2>
          <div className="header-right">
            <div className="timer-display">
              <Clock size={16} className="timer-icon" />
              {formatTime(state.timeElapsed)}
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
              <button className="secondary" onClick={() => navigate('/')}>Quit</button>
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
            <div className="action-buttons">
              <button onClick={() => navigate('/')}>Back to Categories</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

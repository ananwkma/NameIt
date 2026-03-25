import { useReducer, useRef, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { WikidataService } from '../services/wikidata';
import { Search, AlertCircle, Clock } from 'lucide-react';
import { motion } from 'framer-motion';
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
  guessed: Set<string>;      // champion names (lowercase) already found
  error: string | null;
  status: 'PLAYING' | 'WIN';
  timeElapsed: number;
  lastTick: number | null;
}

type LoLAllAction =
  | { type: 'GUESS_CORRECT'; payload: string }
  | { type: 'SET_ERROR'; payload: string | null }
  | { type: 'TICK'; payload: number };

const initialState: LoLAllState = {
  guessed: new Set(),
  error: null,
  status: 'PLAYING',
  timeElapsed: 0,
  lastTick: Date.now(),
};

function lolAllReducer(state: LoLAllState, action: LoLAllAction): LoLAllState {
  switch (action.type) {
    case 'GUESS_CORRECT': {
      const newGuessed = new Set(state.guessed);
      newGuessed.add(action.payload.toLowerCase());
      const isWin = newGuessed.size === TOTAL;
      return {
        ...state,
        guessed: newGuessed,
        error: null,
        status: isWin ? 'WIN' : 'PLAYING',
      };
    }
    case 'SET_ERROR':
      return { ...state, error: action.payload };
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

  // Escape key to go back
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') navigate('/');
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [navigate]);

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
    if (state.guessed.has(canonicalLower)) {
      dispatch({ type: 'SET_ERROR', payload: `${result.name} already found!` });
      return;
    }

    dispatch({ type: 'GUESS_CORRECT', payload: result.name });
    inputRef.current?.focus();
  };

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
              <span>{state.guessed.size}</span>/{TOTAL}
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
        {CHAMPION_GROUPS.map(({ letter, names }) => (
          <div key={letter} className="lol-all-group">
            <span className="lol-all-letter">{letter}</span>
            <div className="lol-all-names">
              {names.map(name => (
                <motion.span
                  key={name}
                  className={`lol-all-chip${state.guessed.has(name.toLowerCase()) ? ' lol-all-chip--found' : ''}`}
                  animate={state.guessed.has(name.toLowerCase()) ? { opacity: 1, scale: 1 } : { opacity: 0.15, scale: 1 }}
                  initial={false}
                >
                  {name}
                </motion.span>
              ))}
            </div>
          </div>
        ))}
      </div>

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
              <p>All {TOTAL} champions named in</p>
              <div className="big-number">{formatTime(state.timeElapsed, true)}</div>
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

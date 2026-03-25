import { useReducer, useRef, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { WikidataService } from '../services/wikidata';
import { Search, AlertCircle, Clock } from 'lucide-react';
import { motion } from 'framer-motion';
import { formatTime } from '../utils/formatTime';
import confetti from 'canvas-confetti';

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');

interface SlotEntry { name: string; id: string; }

interface AZState {
  currentLetterIndex: number; // 0 = A, 25 = Z
  slots: Record<string, SlotEntry | null>;
  error: string | null;
  status: 'PLAYING' | 'WIN';
  timeElapsed: number;
  lastTick: number | null;
}

type AZAction =
  | { type: 'FILL_SLOT'; letter: string; entry: SlotEntry }
  | { type: 'SET_ERROR'; payload: string | null }
  | { type: 'TICK'; payload: number };

const initialState: AZState = {
  currentLetterIndex: 0,
  slots: Object.fromEntries(ALPHABET.map(l => [l, null])),
  error: null,
  status: 'PLAYING',
  timeElapsed: 0,
  lastTick: null,
};

function azReducer(state: AZState, action: AZAction): AZState {
  switch (action.type) {
    case 'FILL_SLOT': {
      const newSlots = { ...state.slots, [action.letter]: action.entry };
      const nextIndex = state.currentLetterIndex + 1;
      const isWin = nextIndex >= 26;
      return {
        ...state,
        slots: newSlots,
        error: null,
        currentLetterIndex: nextIndex,
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

export function AZGameScreen() {
  const navigate = useNavigate();
  const [state, dispatch] = useReducer(azReducer, initialState);
  const [inputValue, setInputValue] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const confettiCanvasRef = useRef<HTMLCanvasElement>(null);

  const currentLetter = ALPHABET[state.currentLetterIndex] ?? '';

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
    const saved = localStorage.getItem('game_besttime_az-lol');
    const current = saved ? parseInt(saved, 10) : Infinity;
    if (state.timeElapsed < current) {
      localStorage.setItem('game_besttime_az-lol', state.timeElapsed.toString());
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

    const firstLetter = result.name[0].toUpperCase();
    if (firstLetter !== currentLetter) {
      dispatch({ type: 'SET_ERROR', payload: `${result.name} starts with ${firstLetter}, not ${currentLetter}.` });
      return;
    }

    dispatch({ type: 'FILL_SLOT', letter: currentLetter, entry: { name: result.name, id: result.id } });
    inputRef.current?.focus();
  };

  return (
    <div className="master-container">
      <div className="game-top">
        <header>
          <h2 className="game-title">A-Z LoL Champions</h2>
          <div className="header-right">
            <div className="timer-display">
              <Clock size={16} className="timer-icon" />
              {formatTime(state.timeElapsed)}
            </div>
            <div className="counter">
              <span>{currentLetter || '✓'}</span>
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
              placeholder={`Type a LoL champion's name that starts with ${currentLetter}`}
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

      {/* ALPHABET GRID */}
      <div className="az-grid">
        {ALPHABET.map((letter, i) => {
          const slot = state.slots[letter];
          const isCurrent = i === state.currentLetterIndex;
          return (
            <motion.div
              key={letter}
              className={`az-card${slot ? ' az-card--filled' : ''}${isCurrent ? ' az-card--current' : ''}`}
              animate={slot ? { scale: [1.15, 1] } : { scale: 1 }}
              transition={{ duration: 0.2 }}
            >
              <span className="az-letter">{letter}</span>
              {slot && <span className="az-name">{slot.name}</span>}
            </motion.div>
          );
        })}
      </div>

      {state.status === 'WIN' && (
        <canvas ref={confettiCanvasRef} style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', zIndex: 2000, pointerEvents: 'none' }} />
      )}

      {state.status === 'WIN' && (
        <div className="modal-overlay">
          <div className="modal victory-modal">
            <h2>You Did It!</h2>
            <div className="final-score">
              <p>A to Z completed in</p>
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

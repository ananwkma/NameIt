import { useReducer, useRef, useEffect, useState } from 'react';
import { WikidataService } from './services/wikidata';
import { GameState, GameAction, GameEntry } from './types/game';
import { CATEGORIES, CategoryConfig } from './config/categories';
import { CategorySelectScreen } from './components/CategorySelectScreen';
import { Search, AlertCircle, Loader2, RotateCcw, Clock, Infinity as InfinityIcon, Pause } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import './App.css';

const initialState: GameState = {
  status: 'IDLE',
  isZenMode: false,
  selectedCategory: CATEGORIES[0],
  entries: [],
  isProcessing: false,
  error: null,
  timeLeft: CATEGORIES[0].timeLimitMs,
  timeElapsed: 0,
  startTime: null,
  lastTick: null,
};

function gameReducer(state: GameState, action: GameAction): GameState {
  switch (action.type) {
    case 'START_GAME':
      return {
        ...initialState,
        selectedCategory: action.payload.category,
        status: 'PLAYING',
        startTime: Date.now(),
        lastTick: Date.now(),
        timeLeft: action.payload.category.timeLimitMs,
        timeElapsed: 0,
        isZenMode: false,
      };
    case 'LOAD_GAME':
      return {
        ...action.payload,
        isProcessing: false,
        lastTick: Date.now(),
      };
    case 'ENTER_ZEN_MODE':
      return {
        ...state,
        status: 'PLAYING',
        isZenMode: true,
        timeElapsed: state.selectedCategory.timeLimitMs,
        lastTick: Date.now(),
      };
    case 'ADD_ENTRY_PENDING':
      return {
        ...state,
        entries: [
          {
            tempId: action.payload.tempId,
            inputName: action.payload.name,
            status: 'pending',
          } as GameEntry,
          ...state.entries,
        ],
      };
    case 'VERIFY_SUCCESS': {
      const isDuplicate = state.entries.some(
        (e) => e.status === 'verified' && e.id === action.payload.data.id
      );

      if (isDuplicate) {
        return {
          ...state,
          error: `You already added ${action.payload.data.name}!`,
          entries: state.entries.filter((e) => e.tempId !== action.payload.tempId),
        };
      }

      const updatedEntries = state.entries.map((e) =>
        e.tempId === action.payload.tempId
          ? ({ ...e, ...action.payload.data, status: 'verified' } as GameEntry)
          : e
      );

      const verifiedCount = updatedEntries.filter(e => e.status === 'verified').length;

      if (verifiedCount >= state.selectedCategory.targetCount) {
        return { ...state, entries: updatedEntries, status: 'WIN', endTime: Date.now() } as any;
      }

      return { ...state, error: null, entries: updatedEntries };
    }
    case 'VERIFY_FAIL':
      return {
        ...state,
        entries: state.entries.filter((e) => e.tempId !== action.payload.tempId),
      };
    case 'SET_PROCESSING':
      return { ...state, isProcessing: action.payload };
    case 'SET_ERROR':
      return { ...state, error: action.payload };
    case 'PAUSE_GAME':
      return { ...state, status: 'PAUSED', lastTick: null };
    case 'RESUME_GAME':
      return { ...state, status: 'PLAYING', lastTick: Date.now() };
    case 'RESET_GAME':
      return initialState;
    case 'TICK': {
      if (state.status !== 'PLAYING') return state;

      const now = action.payload;
      const lastTick = state.lastTick || now;
      const delta = now - lastTick;

      const newTimeElapsed = state.timeElapsed + delta;

      if (!state.isZenMode) {
        const newTimeLeft = state.timeLeft - delta;
        if (newTimeLeft <= 0) {
          return {
            ...state,
            timeLeft: 0,
            timeElapsed: newTimeElapsed,
            status: 'TIME_UP',
            lastTick: null,
          };
        }
        return {
          ...state,
          timeLeft: newTimeLeft,
          timeElapsed: newTimeElapsed,
          lastTick: now,
        };
      } else {
        return {
          ...state,
          timeElapsed: newTimeElapsed,
          lastTick: now,
        };
      }
    }
    case 'SKIP_TIME':
      return { ...state, timeLeft: 5000 };
    case 'GAME_OVER':
      return { ...state, status: 'GAME_OVER', lastTick: null };
    case 'WIN_GAME':
      return { ...state, status: 'WIN', lastTick: null };
    default:
      return state;
  }
}

// Format milliseconds to MM:SS or MM:SS.ms
const formatTime = (ms: number, showMs = false) => {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  const str = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;

  if (showMs) {
    const milliseconds = Math.floor((Math.max(0, ms) % 1000) / 10);
    return `${str}.${milliseconds.toString().padStart(2, '0')}`;
  }
  return str;
};

function App() {
  const [state, dispatch] = useReducer(gameReducer, initialState);
  const [inputValue, setInputValue] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const [highScores, setHighScores] = useState<Record<string, number>>({});
  const isDebug = new URLSearchParams(window.location.search).has('debug');

  // Load game and high scores on mount
  useEffect(() => {
    const isDebug = new URLSearchParams(window.location.search).has('debug');

    // Load high scores for all categories
    const scores: Record<string, number> = {};
    for (const cat of CATEGORIES) {
      const saved = localStorage.getItem(`game_highscore_${cat.id}`);
      scores[cat.id] = saved ? parseInt(saved, 10) || 0 : 0;
    }
    setHighScores(scores);

    // Restore active game — use the category stored in saved state
    if (!isDebug) {
      for (const cat of CATEGORIES) {
        const savedState = localStorage.getItem(`game_state_${cat.id}`);
        if (savedState) {
          try {
            const parsedState = JSON.parse(savedState);
            if (['PLAYING', 'PAUSED', 'TIME_UP'].includes(parsedState.status)) {
              dispatch({ type: 'LOAD_GAME', payload: parsedState });
              break;
            }
          } catch (e) {
            console.error('Failed to load state', e);
          }
        }
      }
    } else {
      // Debug: clear all category states
      for (const cat of CATEGORIES) {
        localStorage.removeItem(`game_state_${cat.id}`);
      }
    }
  }, []);

  // Save state on change
  useEffect(() => {
    const key = `game_state_${state.selectedCategory.id}`;
    if (['PLAYING', 'PAUSED', 'TIME_UP'].includes(state.status)) {
      localStorage.setItem(key, JSON.stringify(state));
    } else {
      localStorage.removeItem(key);
    }
  }, [state]);

  // Update high score per category
  useEffect(() => {
    const verifiedCount = state.entries.filter(e => e.status === 'verified').length;
    const catId = state.selectedCategory.id;
    const current = highScores[catId] ?? 0;
    if (verifiedCount > current) {
      const updated = { ...highScores, [catId]: verifiedCount };
      setHighScores(updated);
      localStorage.setItem(`game_highscore_${catId}`, verifiedCount.toString());
    }
  }, [state.entries, highScores, state.selectedCategory.id]);

  // Timer Effect
  useEffect(() => {
    let interval: number;
    if (state.status === 'PLAYING') {
      interval = window.setInterval(() => {
        dispatch({ type: 'TICK', payload: Date.now() });
      }, 100);
    }
    return () => clearInterval(interval);
  }, [state.status]);

  // Auto-dismiss error after 10 seconds
  useEffect(() => {
    if (!state.error) return;
    const timer = setTimeout(() => dispatch({ type: 'SET_ERROR', payload: null }), 10000);
    return () => clearTimeout(timer);
  }, [state.error]);

  // Auto-focus on mount
  useEffect(() => {
    if (state.status === 'PLAYING') {
      inputRef.current?.focus();
    }
  }, [state.status]);

  // Background Queue Processor
  useEffect(() => {
    const processQueue = async () => {
      if (state.isProcessing || state.status !== 'PLAYING') return;

      const pendingEntry = [...state.entries].reverse().find(e => e.status === 'pending');

      if (pendingEntry) {
        dispatch({ type: 'SET_PROCESSING', payload: true });
        try {
          const result = await WikidataService.search(pendingEntry.inputName, state.selectedCategory);
          if (result) {
            dispatch({ type: 'VERIFY_SUCCESS', payload: { tempId: pendingEntry.tempId, data: result } });
          } else {
            dispatch({ type: 'VERIFY_FAIL', payload: { tempId: pendingEntry.tempId } });
            dispatch({ type: 'SET_ERROR', payload: `"${pendingEntry.inputName}" not recognized.` });
          }
        } catch (error) {
          dispatch({ type: 'VERIFY_FAIL', payload: { tempId: pendingEntry.tempId } });
          dispatch({ type: 'SET_ERROR', payload: 'Connection error while verifying.' });
        } finally {
          dispatch({ type: 'SET_PROCESSING', payload: false });
        }
      }
    };

    processQueue();
  }, [state.entries, state.isProcessing, state.status]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const name = inputValue.trim();
    if (!name) return;

    const isDuplicate = state.entries.some(
      e => e.inputName.toLowerCase() === name.toLowerCase() ||
           (e.status === 'verified' && e.name?.toLowerCase() === name.toLowerCase())
    );

    if (isDuplicate) {
      dispatch({ type: 'SET_ERROR', payload: `You already added or are verifying "${name}"!` });
      return;
    }

    const tempId = crypto.randomUUID();
    dispatch({ type: 'ADD_ENTRY_PENDING', payload: { name, tempId } });
    setInputValue('');

    inputRef.current?.focus();
  };

  const verifiedCount = state.entries.filter(e => e.status === 'verified').length;

  // Category label for modals (e.g. "famous women", "NBA players", "LoL champions")
  const categoryLabel = state.selectedCategory.name.toLowerCase().replace('100 ', '');

  // --- RENDER HELPERS ---

  if (state.status === 'IDLE') {
    return (
      <CategorySelectScreen
        categories={CATEGORIES}
        highScores={highScores}
        onSelect={(category: CategoryConfig) => dispatch({ type: 'START_GAME', payload: { category } })}
      />
    );
  }

  return (
    <div className="master-container">

      {/* TOP SECTION */}
      <div className="game-top">
        <header>
          <button className="icon-btn back-btn" onClick={() => dispatch({ type: 'RESET_GAME' })} title="Back to menu">
            ←
          </button>
          <h2 className="game-title">Name {state.selectedCategory.name}</h2>
          <div className="header-right">
            <div className={`timer-display ${state.timeLeft <= 30000 && !state.isZenMode ? 'urgent' : ''}`}>
              {!state.isZenMode ? (
                <>
                  <Clock size={16} className="timer-icon" />
                  {formatTime(state.timeLeft)}
                </>
              ) : (
                <>
                  <InfinityIcon size={16} className="timer-icon" />
                  {formatTime(state.timeElapsed)}
                </>
              )}
            </div>
            <div className="counter">
              <span>{verifiedCount}</span> / {state.selectedCategory.targetCount}
            </div>
            {isDebug && !state.isZenMode && state.status === 'PLAYING' && (
              <button className="icon-btn debug-skip-btn" onClick={() => dispatch({ type: 'SKIP_TIME' })} title="Skip to end (debug)">
                ⏩
              </button>
            )}
            <button className="icon-btn" onClick={() => dispatch({ type: 'PAUSE_GAME' })} title="Pause">
              <Pause size={16} />
            </button>
          </div>
        </header>

        <form onSubmit={handleSubmit} className="input-group">
          <div className="input-wrapper">
            <input
              ref={inputRef}
              type="text"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              placeholder={`Type a ${categoryLabel} name...`}
              disabled={state.status !== 'PLAYING' || verifiedCount >= state.selectedCategory.targetCount}
            />
            {state.isProcessing ? (
              <Loader2 className="icon loading-spinner" />
            ) : (
              <Search className="icon search-icon" />
            )}
          </div>
        </form>

        {state.error && (
          <div className="error-message">
            <AlertCircle size={16} />
            <span>{state.error}</span>
          </div>
        )}
      </div>

      {/* BOXES SECTION */}
      <div className="women-container">
        <section className="women-list">
          <AnimatePresence mode='popLayout'>
            {state.entries.map((entry) => (
              <motion.div
                key={entry.tempId}
                layout
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{
                  opacity: entry.status === 'pending' ? 0.3 : 1,
                  scale: 1,
                  backgroundColor: entry.status === 'verified' ? '#fff' : '#fff'
                }}
                exit={{ opacity: 0, scale: 0.5, transition: { duration: 0.2 } }}
                className={`woman-card status-${entry.status}`}
              >

                <div className="woman-info">
                  <h3>{entry.status === 'verified' ? entry.name : entry.inputName}</h3>
                  {entry.status === 'verified' && entry.description && state.selectedCategory.verificationStrategy !== 'allowlist-only' && (
                    <p>{entry.description.charAt(0).toUpperCase() + entry.description.slice(1)}</p>
                  )}
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        </section>
      </div>

      {/* PAUSE MODAL */}
      {state.status === 'PAUSED' && (
        <div className="modal-overlay">
          <div className="modal">
            <h2>Game Paused</h2>
            <div className="action-buttons">
              <button onClick={() => dispatch({ type: 'RESUME_GAME' })}>Resume</button>
              <button className="secondary" onClick={() => dispatch({ type: 'RESET_GAME' })}>Quit</button>
            </div>
          </div>
        </div>
      )}

      {/* TIME UP MODAL */}
      {state.status === 'TIME_UP' && (
        <div className="modal-overlay">
          <div className="modal">
            <h2>Time's Up!</h2>
            <div className="final-score">
              <p>You named</p>
              <div className="big-number">{verifiedCount}</div>
              <p>{categoryLabel}</p>
            </div>
            <p className="modal-note">Keep going in Zen Mode?</p>
            <div className="action-buttons">
              <button onClick={() => dispatch({ type: 'ENTER_ZEN_MODE' })}>
                Continue (Zen Mode)
              </button>
              <button className="secondary" onClick={() => dispatch({ type: 'GAME_OVER' })}>
                Stop &amp; See Results
              </button>
            </div>
          </div>
        </div>
      )}

      {/* VICTORY / GAME OVER MODAL */}
      {(state.status === 'WIN' || state.status === 'GAME_OVER') && (
        <div className="modal-overlay">
          <div className="modal victory-modal">
            <h2>{state.status === 'WIN' ? 'You Did It!' : 'Game Over'}</h2>
            <div className="final-score">
              <p>You named</p>
              <div className="big-number">{verifiedCount}</div>
              <p>{categoryLabel}</p>
            </div>
            {state.status === 'WIN' && (
              <div className="stats-detail">
                <p>Total Time: <strong>{formatTime(state.timeElapsed, true)}</strong></p>
              </div>
            )}
            <div className="action-buttons">
              <button onClick={() => dispatch({ type: 'RESET_GAME' })}>
                <RotateCcw size={16} /> Play Again
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;

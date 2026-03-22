import { useReducer, useRef, useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { WikidataService } from '../services/wikidata';
import { GameState, GameAction, GameEntry } from '../types/game';
import { CATEGORIES } from '../config/categories';
import { Search, AlertCircle, Loader2, Clock, Infinity as InfinityIcon } from 'lucide-react';
import { formatTime } from '../utils/formatTime';
import confetti from 'canvas-confetti';
import { motion, AnimatePresence } from 'framer-motion';

const baseInitialState: Omit<GameState, 'selectedCategory' | 'timeLeft'> = {
  status: 'IDLE',
  isZenMode: false,
  entries: [],
  isProcessing: false,
  error: null,
  timeElapsed: 0,
  startTime: null,
  lastTick: null,
};

function gameReducer(state: GameState, action: GameAction): GameState {
  switch (action.type) {
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
    default:
      return state;
  }
}


export function GameScreen() {
  const { categoryId } = useParams<{ categoryId: string }>();
  const navigate = useNavigate();
  const category = CATEGORIES.find(c => c.id === categoryId) ?? CATEGORIES[0];
  const isDebug = new URLSearchParams(window.location.search).has('debug');

  const effectiveCategory = isDebug ? { ...category, targetCount: 5 } : category;

  const [state, dispatch] = useReducer(gameReducer, undefined, (): GameState => {
    if (!isDebug) {
      const savedState = localStorage.getItem(`game_state_${category.id}`);
      if (savedState) {
        try {
          const parsed = JSON.parse(savedState);
          if (['PLAYING', 'PAUSED', 'TIME_UP'].includes(parsed.status)) {
            return { ...parsed, lastTick: Date.now() };
          }
        } catch (e) {
          console.error('Failed to load state', e);
        }
      }
    } else {
      localStorage.removeItem(`game_state_${category.id}`);
    }
    return {
      ...baseInitialState,
      status: 'PLAYING',
      selectedCategory: effectiveCategory,
      timeLeft: effectiveCategory.timeLimitMs,
      startTime: Date.now(),
      lastTick: Date.now(),
    };
  });

  const [inputValue, setInputValue] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const confettiCanvasRef = useRef<HTMLCanvasElement>(null);

  // Redirect if invalid categoryId
  useEffect(() => {
    if (!CATEGORIES.find(c => c.id === categoryId)) {
      navigate('/');
    }
  }, [categoryId, navigate]);

  // Save state on change
  useEffect(() => {
    const key = `game_state_${state.selectedCategory.id}`;
    if (['PLAYING', 'PAUSED', 'TIME_UP'].includes(state.status)) {
      localStorage.setItem(key, JSON.stringify(state));
    } else {
      localStorage.removeItem(key);
    }
  }, [state]);

  // Update high score and best completion time per category
  useEffect(() => {
    const verifiedCount = state.entries.filter(e => e.status === 'verified').length;
    const catId = state.selectedCategory.id;
    const saved = localStorage.getItem(`game_highscore_${catId}`);
    const current = saved ? parseInt(saved, 10) || 0 : 0;
    if (verifiedCount > current) {
      localStorage.setItem(`game_highscore_${catId}`, verifiedCount.toString());
    }
    if (state.status === 'WIN') {
      const savedTime = localStorage.getItem(`game_besttime_${catId}`);
      const currentBest = savedTime ? parseInt(savedTime, 10) : Infinity;
      if (state.timeElapsed < currentBest) {
        localStorage.setItem(`game_besttime_${catId}`, state.timeElapsed.toString());
      }
    }
  }, [state.entries, state.selectedCategory.id, state.status, state.timeElapsed]);

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
    const timer = setTimeout(() => dispatch({ type: 'SET_ERROR', payload: null }), 5000);
    return () => clearTimeout(timer);
  }, [state.error]);

  // Auto-focus on mount
  useEffect(() => {
    if (state.status === 'PLAYING') {
      inputRef.current?.focus();
    }
  }, [state.status]);

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
  const categoryLabel = state.selectedCategory.name.toLowerCase().replace('100 ', '');

  return (
    <div className="master-container">

      {/* TOP SECTION */}
      <div className="game-top">
        <header>
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
          </div>
        </header>

        <form onSubmit={handleSubmit} className="input-group">
          <div className="input-wrapper">
            <input
              ref={inputRef}
              type="text"
              value={inputValue}
              onChange={(e) => {
                setInputValue(e.target.value);
                if (state.error) dispatch({ type: 'SET_ERROR', payload: null });
              }}
              placeholder={state.selectedCategory.inputPlaceholder}
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

      {/* CONFETTI CANVAS */}
      {state.status === 'WIN' && (
        <canvas ref={confettiCanvasRef} style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', zIndex: 2000, pointerEvents: 'none' }} />
      )}

      {/* PAUSE MODAL */}
      {state.status === 'PAUSED' && (
        <div className="modal-overlay">
          <div className="modal">
            <h2>Game Paused</h2>
            <div className="action-buttons">
              <button onClick={() => dispatch({ type: 'RESUME_GAME' })}>Resume</button>
              <button className="secondary" onClick={() => {
                localStorage.removeItem(`game_state_${state.selectedCategory.id}`);
                navigate('/');
              }}>Quit</button>
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
          <div className={`modal ${state.status === 'WIN' ? 'victory-modal' : ''}`}>
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
              <button onClick={() => navigate('/')}>
                Back to Categories
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

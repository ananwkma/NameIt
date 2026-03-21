import { useReducer, useRef, useEffect, useState } from 'react';
import { WikidataService } from './services/wikidata';
import { GameState, GameAction, GameWoman } from './types/game';
import { Search, AlertCircle, Loader2, Play, Trophy, RotateCcw, Clock, Infinity as InfinityIcon } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import './App.css';

const CLASSIC_TIME_LIMIT = 15 * 60 * 1000; // 15 minutes in ms

const initialState: GameState = {
  status: 'IDLE',
  isZenMode: false,
  women: [],
  isProcessing: false,
  error: null,
  timeLeft: CLASSIC_TIME_LIMIT,
  timeElapsed: 0,
  startTime: null,
  lastTick: null,
};

function gameReducer(state: GameState, action: GameAction): GameState {
  switch (action.type) {
    case 'START_GAME':
      return {
        ...initialState,
        status: 'PLAYING',
        startTime: Date.now(),
        lastTick: Date.now(),
        timeLeft: CLASSIC_TIME_LIMIT,
        timeElapsed: 0,
        isZenMode: false,
      };
    case 'LOAD_GAME':
      return {
        ...action.payload,
        // Ensure we don't load into a processing state that might be stuck
        isProcessing: false, 
        lastTick: Date.now(), // Reset tick to avoid huge jumps
      };
    case 'ENTER_ZEN_MODE':
        return {
            ...state,
            status: 'PLAYING',
            isZenMode: true,
            timeElapsed: CLASSIC_TIME_LIMIT,
            lastTick: Date.now(),
        };
    case 'ADD_WOMAN_PENDING':
      return {
        ...state,
        women: [
          {
            tempId: action.payload.tempId,
            inputName: action.payload.name,
            status: 'pending',
          } as GameWoman,
          ...state.women,
        ],
      };
    case 'VERIFY_SUCCESS': {
      // Check for duplicates before finalizing
      const isDuplicate = state.women.some(
        (w) => w.status === 'verified' && w.id === action.payload.data.id
      );

      if (isDuplicate) {
        return {
          ...state,
          error: `You already added ${action.payload.data.name}!`,
          women: state.women.filter((w) => w.tempId !== action.payload.tempId),
        };
      }

      const updatedWomen = state.women.map((w) =>
        w.tempId === action.payload.tempId
          ? ({
              ...w,
              ...action.payload.data,
              status: 'verified',
            } as GameWoman)
          : w
      );
      
      const verifiedCount = updatedWomen.filter(w => w.status === 'verified').length;
      
      // Check for win condition
      if (verifiedCount >= 100) {
        return {
            ...state,
            women: updatedWomen,
            status: 'WIN',
            endTime: Date.now(), // Forceful cast handled by persistence logic
        } as any; 
      }

      return {
        ...state,
        error: null,
        women: updatedWomen,
      };
    }
    case 'VERIFY_FAIL':
      return {
        ...state,
        women: state.women.filter((w) => w.tempId !== action.payload.tempId),
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

      // Always update total elapsed time
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
        // Zen Mode
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
    const milliseconds = Math.floor((Math.max(0, ms) % 1000) / 10); // 2 digits
    return `${str}.${milliseconds.toString().padStart(2, '0')}`;
  }
  return str;
};

function App() {
  const [state, dispatch] = useReducer(gameReducer, initialState);
  const [inputValue, setInputValue] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const [highScore, setHighScore] = useState<number>(0);
  const isDebug = new URLSearchParams(window.location.search).has('debug');

  // Load game and high scores on mount
  useEffect(() => {
    const isDebug = new URLSearchParams(window.location.search).has('debug');
    if (isDebug) {
      localStorage.removeItem('100women_state');
    }

    const savedState = isDebug ? null : localStorage.getItem('100women_state');
    const savedScore = localStorage.getItem('100women_highscore');

    if (savedState) {
      try {
        const parsedState = JSON.parse(savedState);
        // Restore if active or paused or time up
        if (['PLAYING', 'PAUSED', 'TIME_UP'].includes(parsedState.status)) {
            dispatch({ type: 'LOAD_GAME', payload: parsedState });
        }
      } catch (e) {
        console.error('Failed to load state', e);
      }
    }

    if (savedScore) {
      setHighScore(parseInt(savedScore, 10) || 0);
    }
  }, []);

  // Save state on change
  useEffect(() => {
    if (['PLAYING', 'PAUSED', 'TIME_UP'].includes(state.status)) {
      localStorage.setItem('100women_state', JSON.stringify(state));
    } else if (state.status === 'IDLE' || state.status === 'GAME_OVER' || state.status === 'WIN') {
        localStorage.removeItem('100women_state');
    }
  }, [state]);

  // Update high score (max women found)
  useEffect(() => {
    const verifiedCount = state.women.filter(w => w.status === 'verified').length;
    if (verifiedCount > highScore) {
        setHighScore(verifiedCount);
        localStorage.setItem('100women_highscore', verifiedCount.toString());
    }
  }, [state.women, highScore]);

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
      // Don't start if already processing or game is not playing
      if (state.isProcessing || state.status !== 'PLAYING') return;

      // Find the first pending item (oldest first)
      const pendingWoman = [...state.women].reverse().find(w => w.status === 'pending');

      if (pendingWoman) {
        dispatch({ type: 'SET_PROCESSING', payload: true });
        try {
          const result = await WikidataService.searchWoman(pendingWoman.inputName);
          if (result) {
            dispatch({ type: 'VERIFY_SUCCESS', payload: { tempId: pendingWoman.tempId, data: result } });
          } else {
            dispatch({ type: 'VERIFY_FAIL', payload: { tempId: pendingWoman.tempId } });
            dispatch({ type: 'SET_ERROR', payload: `"${pendingWoman.inputName}" not found or not a famous woman.` });
          }
        } catch (error) {
          dispatch({ type: 'VERIFY_FAIL', payload: { tempId: pendingWoman.tempId } });
          dispatch({ type: 'SET_ERROR', payload: 'Connection error while verifying.' });
        } finally {
          dispatch({ type: 'SET_PROCESSING', payload: false });
        }
      }
    };

    processQueue();
  }, [state.women, state.isProcessing, state.status]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const name = inputValue.trim();
    if (!name) return;

    // Check for duplicates in the current list (optimistic check)
    const isDuplicate = state.women.some(
      w => w.inputName.toLowerCase() === name.toLowerCase() || 
           (w.status === 'verified' && w.name?.toLowerCase() === name.toLowerCase())
    );

    if (isDuplicate) {
      dispatch({ type: 'SET_ERROR', payload: `You already added or are verifying "${name}"!` });
      return;
    }

    // Optimistic Add
    const tempId = crypto.randomUUID();
    dispatch({ type: 'ADD_WOMAN_PENDING', payload: { name, tempId } });
    setInputValue(''); // Clear input immediately
    
    // Focus back immediately
    inputRef.current?.focus();
  };

  const verifiedCount = state.women.filter(w => w.status === 'verified').length;

  // --- RENDER HELPERS ---

  if (state.status === 'IDLE') {
    return (
      <div className="master-container" style={{ alignItems: 'center' }}>
        <header>
            <h1>Name It!</h1>
        </header>
        <div className="menu-card">
          <h2>Name It!</h2>
          
          <div className="mode-selection single-mode">
            <button 
                className="mode-btn primary-start"
                onClick={() => dispatch({ type: 'START_GAME' })}
            >
                <Play className="icon-lg" />
                <h3>100 Women</h3>
<div className="score-pill">Best: {highScore}</div>
            </button>
          </div>
        </div>
      </div>
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
          <div className={`timer-display ${state.timeLeft <= 30000 && !state.isZenMode ? 'urgent' : ''}`}>
              {!state.isZenMode ? (
                   <>
                      <Clock size={20} className="timer-icon" />
                      {formatTime(state.timeLeft)}
                   </>
              ) : (
                  <>
                      <InfinityIcon size={20} className="timer-icon" />
                      {formatTime(state.timeElapsed)}
                  </>
              )}
          </div>
          <div className="counter">
            <span>{verifiedCount}</span> / 100
          </div>
          <div className="header-right">
            {isDebug && !state.isZenMode && state.status === 'PLAYING' && (
              <button className="icon-btn debug-skip-btn" onClick={() => dispatch({ type: 'SKIP_TIME' })} title="Skip to end (debug)">
                ⏩
              </button>
            )}
            <button className="icon-btn" onClick={() => dispatch({ type: 'PAUSE_GAME' })}>
              II
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
              placeholder="Type a famous woman's name..."
              disabled={state.status !== 'PLAYING' || verifiedCount >= 100}
            />
            {state.isProcessing ? (
              <Loader2 className="icon loading-spinner" />
            ) : (
              <Search className="icon search-icon" />
            )}
          </div>
          <button type="submit" disabled={state.status !== 'PLAYING' || verifiedCount >= 100}>
            Add
          </button>
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
            {state.women.map((woman) => (
              <motion.div
                key={woman.tempId}
                layout
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ 
                  opacity: woman.status === 'pending' ? 0.3 : 1, 
                  scale: 1,
                  backgroundColor: woman.status === 'verified' ? '#fff' : '#fff'
                }}
                exit={{ opacity: 0, scale: 0.5, transition: { duration: 0.2 } }}
                className={`woman-card status-${woman.status}`}
              >
                {woman.status === 'verified' && (
                  <div className="tooltip">
                    <strong>{woman.name}</strong>
                    {woman.description && ` — ${woman.description}`}
                  </div>
                )}
                <div className="woman-info">
                  <h3>{woman.status === 'verified' ? woman.name : woman.inputName}</h3>
                  {woman.status === 'verified' && woman.description && (
                    <p>{woman.description.charAt(0).toUpperCase() + woman.description.slice(1)}</p>
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
                    <p>famous women</p>
                </div>
                <p className="modal-note">Keep going in Zen Mode?</p>
                <div className="action-buttons">
                    <button onClick={() => dispatch({ type: 'ENTER_ZEN_MODE' })}>
                        Continue (Zen Mode)
                    </button>
                    <button className="secondary" onClick={() => dispatch({ type: 'GAME_OVER' })}>
                        Stop & See Results
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
                    <p>famous women</p>
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

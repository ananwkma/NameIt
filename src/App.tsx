import { useReducer, useRef, useEffect, useState } from 'react';
import { WikidataService } from './services/wikidata';
import { GameState, GameAction, GameWoman } from './types/game';
import { Search, CheckCircle, AlertCircle, Loader2 } from 'lucide-react';
import './App.css';

const initialState: GameState = {
  status: 'PLAYING',
  mode: 'CLASSIC',
  women: [],
  isProcessing: false,
  error: null,
  startTime: Date.now(),
  accumulatedTime: 0,
  endTime: null,
};

function gameReducer(state: GameState, action: GameAction): GameState {
  switch (action.type) {
    case 'START_GAME':
      return {
        ...initialState,
        status: 'PLAYING',
        mode: action.payload,
        startTime: Date.now(),
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

      return {
        ...state,
        error: null,
        women: state.women.map((w) =>
          w.tempId === action.payload.tempId
            ? ({
                ...w,
                ...action.payload.data,
                status: 'verified',
              } as GameWoman)
            : w
        ),
      };
    }
    case 'VERIFY_FAIL':
      return {
        ...state,
        women: state.women.map((w) =>
          w.tempId === action.payload.tempId
            ? ({
                ...w,
                status: 'failed',
              } as GameWoman)
            : w
        ),
      };
    case 'SET_PROCESSING':
      return { ...state, isProcessing: action.payload };
    case 'SET_ERROR':
      return { ...state, error: action.payload };
    case 'PAUSE_GAME':
      return { ...state, status: 'PAUSED' };
    case 'RESUME_GAME':
      return { ...state, status: 'PLAYING' };
    case 'RESET_GAME':
      return initialState;
    default:
      return state;
  }
}

function App() {
  const [state, dispatch] = useReducer(gameReducer, initialState);
  const [inputValue, setInputValue] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-focus on mount
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Background Queue Processor
  useEffect(() => {
    const processQueue = async () => {
      // Don't start if already processing or game is not playing
      if (state.isProcessing || state.status !== 'PLAYING') return;

      // Find the first pending item (oldest first - they are added at the start of array, so oldest is at the end)
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

  return (
    <div className="container">
      <header>
        <h1>100 Women Game</h1>
        <div className="counter">
          <span>{verifiedCount}</span> / 100
        </div>
      </header>

      <main>
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

        <section className="women-list">
          {state.women.map((woman) => (
            <div key={woman.tempId} className={`woman-card status-${woman.status}`}>
              <div className="woman-info">
                <h3>{woman.status === 'verified' ? woman.name : woman.inputName}</h3>
                <p>
                  {woman.status === 'verified'
                    ? woman.description
                    : woman.status === 'pending'
                    ? 'Verifying...'
                    : 'Not found or invalid'}
                </p>
              </div>
              {woman.status === 'verified' && <CheckCircle className="check-icon" />}
              {woman.status === 'pending' && <Loader2 className="icon loading-spinner" />}
              {woman.status === 'failed' && <AlertCircle className="icon error-icon" />}
            </div>
          ))}
        </section>
      </main>

      {verifiedCount >= 100 && (
        <div className="victory-modal">
          <h2>Congratulations!</h2>
          <p>You've named 100 famous women!</p>
        </div>
      )}
    </div>
  );
}

export default App;

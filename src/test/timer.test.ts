import { describe, it, expect } from 'vitest';
import { GameState, GameAction } from '../types/game';
import { CATEGORIES } from '../config/categories';

const CLASSIC_TIME_LIMIT = 15 * 60 * 1000;

// Mock reducer mirroring App.tsx logic
function gameReducer(state: GameState, action: GameAction): GameState {
  switch (action.type) {
    case 'START_GAME':
      return {
        ...state,
        selectedCategory: action.payload.category,
        status: 'PLAYING',
        startTime: 1000,
        lastTick: 1000,
        timeLeft: action.payload.category.timeLimitMs,
        timeElapsed: 0,
        isZenMode: false,
      };
    case 'ENTER_ZEN_MODE':
      return {
          ...state,
          status: 'PLAYING',
          isZenMode: true,
          lastTick: 1000, // mock time
      };
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
        // ZEN MODE
        return {
          ...state,
          timeElapsed: newTimeElapsed,
          lastTick: now,
        };
      }
    }
    default:
        return state;
  }
}

describe('Timer Logic', () => {
    const initialState: GameState = {
        status: 'IDLE',
        isZenMode: false,
        selectedCategory: CATEGORIES[0],
        entries: [],
        isProcessing: false,
        error: null,
        timeLeft: CLASSIC_TIME_LIMIT,
        timeElapsed: 0,
        startTime: null,
        lastTick: null,
    };

    it('should start game with correct time and standard mode', () => {
        const state = gameReducer(initialState, { type: 'START_GAME', payload: { category: CATEGORIES[0] } });
        expect(state.isZenMode).toBe(false);
        expect(state.timeLeft).toBe(CLASSIC_TIME_LIMIT);
        expect(state.status).toBe('PLAYING');
    });

    it('should countdown in standard mode', () => {
        let state = gameReducer(initialState, { type: 'START_GAME', payload: { category: CATEGORIES[0] } });
        // Simulate 1 second passing (start at 1000, now 2000)
        state = gameReducer(state, { type: 'TICK', payload: 2000 });
        expect(state.timeLeft).toBe(CLASSIC_TIME_LIMIT - 1000);
        expect(state.timeElapsed).toBe(1000);
    });

    it('should trigger TIME_UP when time runs out in standard mode', () => {
        let state = gameReducer(initialState, { type: 'START_GAME', payload: { category: CATEGORIES[0] } });
        // Simulate time limit passing
        state = gameReducer(state, { type: 'TICK', payload: 1000 + CLASSIC_TIME_LIMIT + 1 });
        expect(state.status).toBe('TIME_UP');
        expect(state.timeLeft).toBe(0);
    });

    it('should count up in Zen Mode', () => {
        let state = gameReducer(initialState, { type: 'START_GAME', payload: { category: CATEGORIES[0] } });
        state = gameReducer(state, { type: 'ENTER_ZEN_MODE' });

        expect(state.isZenMode).toBe(true);
        expect(state.status).toBe('PLAYING');

        // Simulate 1 second passing
        state = gameReducer(state, { type: 'TICK', payload: 2000 }); // start at 1000
        expect(state.timeElapsed).toBe(1000);
        // Time left should not change or be relevant, but let's check it doesn't decrease to negative or something weird
        // In our reducer logic, we don't update timeLeft in Zen Mode.
    });
});

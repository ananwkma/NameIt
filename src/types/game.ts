import { Woman } from './wikidata';

export type GameStatus = 'MENU' | 'PLAYING' | 'PAUSED' | 'VICTORY' | 'GAME_OVER';

export type GameMode = 'CLASSIC' | 'TIME_ATTACK';

export interface GameState {
  status: GameStatus;
  mode: GameMode;
  women: Woman[];
  startTime: number | null;
  accumulatedTime: number;
  endTime: number | null;
}

export type GameAction =
  | { type: 'START_GAME'; payload: { mode: GameMode } }
  | { type: 'PAUSE_GAME' }
  | { type: 'RESUME_GAME' }
  | { type: 'END_GAME'; payload: { reason: 'VICTORY' | 'TIME_UP' | 'GIVE_UP' } }
  | { type: 'ADD_WOMAN'; payload: Woman }
  | { type: 'RESTORE_STATE'; payload: GameState }
  | { type: 'RESET_GAME' };

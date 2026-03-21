import { Woman } from './wikidata';
import { CategoryConfig } from '../config/categories';

export type VerificationStatus = 'pending' | 'verified' | 'failed';

export interface GameEntry extends Partial<Woman> {
  status: VerificationStatus;
  tempId: string;
  inputName: string;
}

export type GameStatus = 'IDLE' | 'PLAYING' | 'PAUSED' | 'TIME_UP' | 'GAME_OVER' | 'WIN';

export interface GameState {
  status: GameStatus;
  isZenMode: boolean;
  selectedCategory: CategoryConfig;
  entries: GameEntry[];
  isProcessing: boolean;
  error: string | null;
  // Timer related
  timeLeft: number;      // ms remaining (Standard countdown)
  timeElapsed: number;   // ms elapsed (Zen Mode / Total)
  startTime: number | null; // Timestamp when current session started
  lastTick: number | null;  // Timestamp of last tick for accurate delta calc
}

export type GameAction =
  | { type: 'START_GAME'; payload: { category: CategoryConfig } }
  | { type: 'LOAD_GAME'; payload: GameState }
  | { type: 'ENTER_ZEN_MODE' }
  | { type: 'ADD_ENTRY_PENDING'; payload: { name: string; tempId: string } }
  | { type: 'VERIFY_SUCCESS'; payload: { tempId: string; data: Woman } }
  | { type: 'VERIFY_FAIL'; payload: { tempId: string; error?: string } }
  | { type: 'SET_PROCESSING'; payload: boolean }
  | { type: 'SET_ERROR'; payload: string | null }
  | { type: 'PAUSE_GAME' }
  | { type: 'RESUME_GAME' }
  | { type: 'RESET_GAME' }
  | { type: 'TICK'; payload: number } // payload is current timestamp
  | { type: 'SKIP_TIME' }
  | { type: 'GAME_OVER' }
  | { type: 'WIN_GAME' };

import { Woman } from './wikidata';

export type VerificationStatus = 'pending' | 'verified' | 'failed';

export interface GameWoman extends Partial<Woman> {
  status: VerificationStatus;
  tempId: string;
  inputName: string;
}

export type GameStatus = 'IDLE' | 'PLAYING' | 'PAUSED' | 'GAME_OVER';

export type GameMode = 'CLASSIC' | 'SPEEDRUN';

export interface GameState {
  status: GameStatus;
  mode: GameMode;
  women: GameWoman[];
  isProcessing: boolean;
  error: string | null;
  // Metadata for different modes
  startTime: number | null;
  accumulatedTime: number;
  endTime: number | null;
}

export type GameAction =
  | { type: 'START_GAME'; payload: GameMode }
  | { type: 'ADD_WOMAN_PENDING'; payload: { name: string; tempId: string } }
  | { type: 'VERIFY_SUCCESS'; payload: { tempId: string; data: Woman } }
  | { type: 'VERIFY_FAIL'; payload: { tempId: string; error?: string } }
  | { type: 'SET_PROCESSING'; payload: boolean }
  | { type: 'SET_ERROR'; payload: string | null }
  | { type: 'PAUSE_GAME' }
  | { type: 'RESUME_GAME' }
  | { type: 'RESET_GAME' };

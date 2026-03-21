export type VerificationStrategy = 'wikidata' | 'allowlist-only';

export interface CategoryConfig {
  id: string;
  name: string;
  icon: string;
  accentColor: string;
  targetCount: number;
  timeLimitMs: number;
  allowlistFile: string;       // basename only, e.g. 'allowlist-women.json'
  verificationStrategy: VerificationStrategy;
  wikidataGender?: string;     // Wikidata QID, only for 'wikidata' strategy
}

export const CATEGORIES: CategoryConfig[] = [
  {
    id: 'women',
    name: '100 Famous Women',
    icon: '👩',
    accentColor: '#ff4757',
    targetCount: 100,
    timeLimitMs: 15 * 60 * 1000,
    allowlistFile: 'allowlist-women.json',
    verificationStrategy: 'wikidata',
    wikidataGender: 'Q6581072',
  },
  {
    id: 'men',
    name: '100 Famous Men',
    icon: '👨',
    accentColor: '#2f86eb',
    targetCount: 100,
    timeLimitMs: 15 * 60 * 1000,
    allowlistFile: 'allowlist-men.json',
    verificationStrategy: 'wikidata',
    wikidataGender: 'Q6581097',
  },
  {
    id: 'nba',
    name: '100 NBA Players',
    icon: '🏀',
    accentColor: '#ff7f00',
    targetCount: 100,
    timeLimitMs: 15 * 60 * 1000,
    allowlistFile: 'allowlist-nba.json',
    verificationStrategy: 'allowlist-only',
  },
  {
    id: 'lol',
    name: '100 LoL Champions',
    icon: '⚔️',
    accentColor: '#9b59b6',
    targetCount: 100,
    timeLimitMs: 15 * 60 * 1000,
    allowlistFile: 'allowlist-lol.json',
    verificationStrategy: 'allowlist-only',
  },
];

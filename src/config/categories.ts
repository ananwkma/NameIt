export type VerificationStrategy = 'wikidata' | 'allowlist-only';

export interface CategoryConfig {
  id: string;
  name: string;
  icon: string;
  accentColor: string;
  targetCount: number;
  timeLimitMs: number;
  allowlistFile: string;
  verificationStrategy: VerificationStrategy;
  inputPlaceholder: string;
  wikidataGender?: string;     // Wikidata QID for gender filter
  wikidataInstanceOf?: string; // Wikidata QID for instance-of filter (default: Q5 = human)
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
    inputPlaceholder: "Type a famous woman's name",
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
    inputPlaceholder: "Type a famous man's name",
    wikidataGender: 'Q6581097',
  },
  {
    id: 'fictional-women',
    name: '100 Fictional Women',
    icon: '🎭',
    accentColor: '#e91e8c',
    targetCount: 100,
    timeLimitMs: 15 * 60 * 1000,
    allowlistFile: 'allowlist-fictional-women.json',
    verificationStrategy: 'wikidata',
    inputPlaceholder: "Type a fictional woman's name",
    wikidataGender: 'Q6581072',
    wikidataInstanceOf: 'Q15632617', // fictional human
  },
  {
    id: 'fictional-men',
    name: '100 Fictional Men',
    icon: '🎭',
    accentColor: '#8e44ad',
    targetCount: 100,
    timeLimitMs: 15 * 60 * 1000,
    allowlistFile: 'allowlist-fictional-men.json',
    verificationStrategy: 'wikidata',
    inputPlaceholder: "Type a fictional man's name",
    wikidataGender: 'Q6581097',
    wikidataInstanceOf: 'Q15632617',
  },
  {
    id: 'famous-asians',
    name: '100 Famous Asians',
    icon: '🌏',
    accentColor: '#e74c3c',
    targetCount: 100,
    timeLimitMs: 15 * 60 * 1000,
    allowlistFile: 'allowlist-famous-asians.json',
    verificationStrategy: 'allowlist-only',
    inputPlaceholder: "Type a famous Asian person's name",
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
    inputPlaceholder: "Type an NBA player's name",
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
    inputPlaceholder: "Type a LoL champion's name",
  },
  {
    id: 'az-lol',
    name: 'A-Z LoL Champions',
    icon: '⚔️',
    accentColor: '#1abc9c',
    targetCount: 26,
    timeLimitMs: 0,
    allowlistFile: 'allowlist-lol.json',
    verificationStrategy: 'allowlist-only',
    inputPlaceholder: "Type a LoL champion's name",
  },
];

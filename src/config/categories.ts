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
  strictAllowlistMatch?: boolean;       // Use strict DL-distance matching (no substring check) for allowlist
  wikidataGender?: string;              // Wikidata QID for P21 gender filter
  wikidataInstanceOf?: string | string[]; // Wikidata QID(s) for P31 instance-of filter (default: Q5 = human)
  wikidataEthnicGroups?: string[];      // P172 ethnic group QIDs — candidate must match at least one
  wikidataCountries?: string[];         // P27 country-of-citizenship QIDs — candidate must match at least one
                                        // (ethnicity passes when EITHER wikidataEthnicGroups OR wikidataCountries matches)
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
    wikidataInstanceOf: ['Q15773347', 'Q15632617', 'Q4663903'], // fictional female character, fictional human, fictional video game character
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
    wikidataInstanceOf: ['Q15773348', 'Q15632617', 'Q4663903'], // fictional male character, fictional human, fictional video game character
  },
  {
    id: 'famous-asians',
    name: '100 Famous Asians',
    icon: '🌏',
    accentColor: '#e74c3c',
    targetCount: 100,
    timeLimitMs: 15 * 60 * 1000,
    allowlistFile: 'allowlist-famous-asians.json',
    verificationStrategy: 'wikidata',
    inputPlaceholder: "Type a famous Asian person's name",
    // P172 ethnic group QIDs — catches diaspora whose citizenship is non-Asian
    wikidataEthnicGroups: [
      'Q180251',  // Han Chinese           (China / HK / Taiwan / Singapore)
      'Q49078',   // Japanese people       (Japan)
      'Q484083',  // Korean people         (South Korea)
      'Q2516866', // Indian people         (India)
      'Q47011',   // Filipino people       (Philippines)
      'Q1231722', // Vietnamese people     (Vietnam)
      'Q38091',   // Thai people           (Thailand)
      'Q130932',  // Malay people          (Malaysia / Singapore)
      'Q46524',   // Indonesian people     (Indonesia)
      'Q1283205', // Pakistani people      (Pakistan)
      'Q1163307', // Bengali people        (Bangladesh)
      'Q34006',   // Khmer people          (Cambodia)
      'Q50602',   // Sinhalese             (Sri Lanka)
      'Q1291318', // Nepali people         (Nepal)
      'Q849771',  // Burmese people        (Myanmar)
      'Q29623',   // Mongolian people      (Mongolia)
      'Q1218049', // Lao people            (Laos)
      'Q1572501', // Taiwanese people      (Taiwan)
      // Diaspora groups — covers Asian-Americans and other nationals
      'Q2657969', // Vietnamese Americans
      'Q1146100', // Chinese Americans
      'Q276879',  // Korean Americans
      'Q1156766', // Japanese Americans
      'Q1413685', // Filipino Americans
      'Q2643509', // Indian Americans
      'Q44614',   // Taiwanese Americans
      'Q4450068', // Thai Americans
      'Q4256383', // Indonesian Americans
      'Q7125803', // Pakistani Americans
      'Q4855425', // Bangladeshi Americans
    ],
    // P27 country of citizenship QIDs — catches nationals
    wikidataCountries: [
      'Q148',  // China (PRC)
      'Q8646', // Hong Kong
      'Q865',  // Taiwan (ROC)
      'Q17',   // Japan
      'Q884',  // South Korea
      'Q668',  // India
      'Q928',  // Philippines
      'Q881',  // Vietnam
      'Q869',  // Thailand
      'Q833',  // Malaysia
      'Q334',  // Singapore
      'Q252',  // Indonesia
      'Q843',  // Pakistan
      'Q902',  // Bangladesh
      'Q819',  // Laos
      'Q424',  // Cambodia
      'Q760',  // Sri Lanka
      'Q837',  // Nepal
      'Q836',  // Myanmar
      'Q974',  // Mongolia
    ],
  },
  {
    id: 'animals',
    name: '100 Animals',
    icon: '🦁',
    accentColor: '#27ae60',
    targetCount: 100,
    timeLimitMs: 15 * 60 * 1000,
    allowlistFile: 'allowlist-animals.json',
    verificationStrategy: 'wikidata',
    inputPlaceholder: 'Type an animal',
    wikidataInstanceOf: ['Q16521'], // taxon — covers all animal species
    strictAllowlistMatch: true,
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
  {
    id: 'lol-all',
    name: 'All LoL Champions',
    icon: '🏆',
    accentColor: '#9b59b6',
    targetCount: 172,
    timeLimitMs: 0,
    allowlistFile: 'allowlist-lol.json',
    verificationStrategy: 'allowlist-only',
    inputPlaceholder: "Type any LoL champion's name",
  },
  {
    id: 'states-all',
    name: 'All 50 States',
    icon: '🗺️',
    accentColor: '#3498db',
    targetCount: 50,
    timeLimitMs: 0,
    allowlistFile: '',
    verificationStrategy: 'allowlist-only',
    inputPlaceholder: 'Type any US state name',
  },
];

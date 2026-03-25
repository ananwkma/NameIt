/**
 * build-allowlist.js
 *
 * Builds an allowlist of famous people for one of several categories:
 *   women  — Famous women (GitHub CSV, Twitch, YouTube, LLM + Wikidata)
 *   men    — Famous men (same pipeline, male gender filter)
 *   lol    — League of Legends champions (Riot Data Dragon, no API key)
 *   nba    — NBA players (NBA Stats API)
 *
 * Usage:
 *   node scripts/build-allowlist.js                  # defaults to --category women
 *   node scripts/build-allowlist.js --category women
 *   node scripts/build-allowlist.js --category men
 *   node scripts/build-allowlist.js --category lol
 *   node scripts/build-allowlist.js --category nba
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ─── Config ─────────────────────────────────────────────────────────────────

const GAME_CONFIG = {
  name: '100 Famous Women',
  wikidataGender: 'Q6581072', // female
  wikidataInstance: 'Q5',     // human
};

const WOMEN_OUTPUT_PATH           = path.join(__dirname, '../src/data/allowlist-women.json');
const MEN_OUTPUT_PATH             = path.join(__dirname, '../src/data/allowlist-men.json');
const NBA_OUTPUT_PATH             = path.join(__dirname, '../src/data/allowlist-nba.json');
const LOL_OUTPUT_PATH             = path.join(__dirname, '../src/data/allowlist-lol.json');
const FICTIONAL_WOMEN_OUTPUT_PATH = path.join(__dirname, '../src/data/allowlist-fictional-women.json');
const FICTIONAL_MEN_OUTPUT_PATH   = path.join(__dirname, '../src/data/allowlist-fictional-men.json');
const FAMOUS_ASIANS_OUTPUT_PATH   = path.join(__dirname, '../src/data/allowlist-famous-asians.json');
const ANIMALS_OUTPUT_PATH         = path.join(__dirname, '../src/data/allowlist-animals.json');

// GitHub CSV: top 1000 Twitch streamers by follower count (CC0, Kaggle-sourced)
const GITHUB_CSV_URL =
  'https://raw.githubusercontent.com/phelpsbp/Twitch-Streamer-Analysis/main/twitchdata-update.csv';

// Twitch live stream categories (used as optional supplement)
const TWITCH_CATEGORIES = [
  { name: 'Just Chatting',             id: '509658' },
  { name: 'Music',                     id: '26936' },
  { name: 'Art',                       id: '509660' },
  { name: 'Beauty & Body Art',         id: '509669' },
];

const STREAMS_PER_CATEGORY = 100;

// Concurrency limit for Wikidata lookups
const WIKIDATA_CONCURRENCY = 10;

// Manual seeds — always included regardless of data sources.
// Add names here that rose to fame after the GitHub dataset (2019–2020).
const MANUAL_SEEDS = [
  // Male streamers — LLM will filter out any females
  'jasontheween',
  'xQc',
  'Asmongold',
  'shroud',
  'HasanAbi',
  'Ludwig',
  'Mizkif',
  'moistcr1tikal',
  'Sykkuno',
  'Disguised Toast',
  'Pokimane', // LLM will filter — keep in case gender check is loose
  // Streamers that went viral post-2020
  'supcaitlin',
  'QTCinderella',
  'BrizBri',
  'YodelingSailor',
  'Kkatamina',
  'Shylily',
  'Nyanners',
  'ironmouse',
  'veibae',
  'Sykkunno', // remove if not female — LLM will filter
  'Bao',
  'filian',
  'Nihmune',
  'Vedal987', // remove if not female — LLM will filter
  'Buffpup',
  'LilyPichu',
  'fuslie',
  'hafu',
  'Valkyrae',
  'Atrioc', // remove if not female — LLM will filter
  '39daph',
  'xChocoBars',
  'Katerino',
  'JustaMinx',
  'Naeondra',
];

// ─── GitHub CSV dataset ──────────────────────────────────────────────────────

async function fetchGitHubStreamers() {
  console.log('Fetching GitHub top-streamers dataset...');
  try {
    const res = await fetch(GITHUB_CSV_URL);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const text = await res.text();
    const lines = text.trim().split(/\r?\n/);
    const headers = lines[0].split(',').map(h => h.trim().toLowerCase());

    const channelIdx   = headers.indexOf('channel');
    const followersIdx = headers.findIndex(h => h.includes('followers') && !h.includes('gained'));
    const partnerIdx   = headers.indexOf('partnered');

    if (channelIdx === -1) throw new Error('Could not find "Channel" column in CSV');

    const streamers = [];
    for (let i = 1; i < lines.length; i++) {
      const cols = lines[i].split(',');
      if (cols.length < 2) continue;
      const channel   = cols[channelIdx]?.trim();
      const followers = followersIdx !== -1 ? parseInt(cols[followersIdx], 10) : 0;
      const partnered = partnerIdx !== -1 ? cols[partnerIdx]?.trim().toLowerCase() === 'true' : false;
      if (channel) {
        streamers.push({ name: channel, login: channel.toLowerCase(), platform: 'twitch', followers, partnered });
      }
    }

    // Sort by followers descending
    streamers.sort((a, b) => b.followers - a.followers);
    console.log(`GitHub dataset: ${streamers.length} streamers (sorted by followers)`);
    return streamers;
  } catch (err) {
    console.warn(`GitHub dataset fetch failed: ${err.message} — skipping`);
    return [];
  }
}

// ─── Twitch live streams (optional supplement) ───────────────────────────────

async function getTwitchToken() {
  const res = await fetch('https://id.twitch.tv/oauth2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.TWITCH_CLIENT_ID,
      client_secret: process.env.TWITCH_CLIENT_SECRET,
      grant_type: 'client_credentials',
    }),
  });
  const data = await res.json();
  if (!data.access_token) throw new Error(`Twitch auth failed: ${JSON.stringify(data)}`);
  console.log('Twitch token obtained');
  return data.access_token;
}

async function fetchLiveTwitchStreamers(token) {
  const headers = {
    'Client-ID': process.env.TWITCH_CLIENT_ID,
    'Authorization': `Bearer ${token}`,
  };

  const allStreamers = new Map();

  for (const category of TWITCH_CATEGORIES) {
    try {
      const url = `https://api.twitch.tv/helix/streams?game_id=${category.id}&first=${STREAMS_PER_CATEGORY}`;
      const res = await fetch(url, { headers });
      const data = await res.json();
      for (const stream of (data.data || [])) {
        allStreamers.set(stream.user_login, {
          name: stream.user_name,
          login: stream.user_login,
          platform: 'twitch',
          followers: 0,
        });
      }
      console.log(`  Twitch live [${category.name}]: ${data.data?.length ?? 0} streamers`);
    } catch (err) {
      console.warn(`  Twitch [${category.name}] failed:`, err.message);
    }
    await sleep(300);
  }

  console.log(`Twitch live: ${allStreamers.size} unique streamers`);
  return Array.from(allStreamers.values());
}

// ─── YouTube (optional) ──────────────────────────────────────────────────────

async function fetchYouTubeCreators() {
  if (!process.env.YOUTUBE_API_KEY) {
    console.log('No YOUTUBE_API_KEY — skipping YouTube');
    return [];
  }

  const searchQueries = [
    'female gaming youtuber',
    'female beauty youtuber',
    'female lifestyle youtuber',
    'female music youtuber',
  ];

  const creators = new Map();
  for (const query of searchQueries) {
    try {
      const url = `https://www.googleapis.com/youtube/v3/search?part=snippet&type=channel&q=${encodeURIComponent(query)}&maxResults=50&key=${process.env.YOUTUBE_API_KEY}`;
      const res = await fetch(url);
      const data = await res.json();
      for (const item of (data.items || [])) {
        const channelId = item.id.channelId;
        creators.set(channelId, {
          name: item.snippet.channelTitle,
          channelId,
          platform: 'youtube',
          followers: 0,
        });
      }
      console.log(`  YouTube [${query}]: ${data.items?.length ?? 0} channels`);
    } catch (err) {
      console.warn(`  YouTube [${query}] failed:`, err.message);
    }
    await sleep(300);
  }

  console.log(`YouTube: ${creators.size} unique creators collected`);
  return Array.from(creators.values());
}

// ─── LLM gender classification (fast bulk pass) ──────────────────────────────

async function classifyGenderWithLLM(names, genderLabel, genderPrompt) {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.log('No ANTHROPIC_API_KEY — skipping LLM classification');
    return {};
  }

  const results = {};
  const BATCH_SIZE = 100; // larger batches = fewer API calls
  const batches = [];
  for (let i = 0; i < names.length; i += BATCH_SIZE) {
    batches.push(names.slice(i, i + BATCH_SIZE));
  }

  console.log(`  ${batches.length} LLM batches of up to ${BATCH_SIZE} names...`);

  // Run up to 3 batches concurrently to avoid rate limits
  const BATCH_CONCURRENCY = 3;
  for (let i = 0; i < batches.length; i += BATCH_CONCURRENCY) {
    const chunk = batches.slice(i, i + BATCH_CONCURRENCY);
    await Promise.all(chunk.map(async (batch, chunkIdx) => {
      const batchNum = i + chunkIdx + 1;
      const prompt = `You are helping build a dataset of famous ${genderLabel} for a trivia game.

Given these streamer/creator usernames and display names, ${genderPrompt}
Only include people you are highly confident. Exclude if unsure, organization, or unknown.

Names (one per line):
${batch.map((n, idx) => `${idx + 1}. ${n}`).join('\n')}

Respond ONLY with a JSON array of the names (exactly as written above) that match. Example:
["Pokimane", "Amouranth"]

JSON array only, no explanation.`;

      try {
        const res = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'x-api-key': process.env.ANTHROPIC_API_KEY,
            'anthropic-version': '2023-06-01',
            'content-type': 'application/json',
          },
          body: JSON.stringify({
            model: 'claude-haiku-4-5-20251001',
            max_tokens: 1024,
            messages: [{ role: 'user', content: prompt }],
          }),
        });

        const data = await res.json();
        const raw = data.content?.[0]?.text || '[]';
        const text = raw.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
        const confirmed = JSON.parse(text);
        confirmed.forEach(name => { results[name] = true; });
        console.log(`  LLM batch ${batchNum}/${batches.length}: ${confirmed.length}/${batch.length} confirmed ${genderLabel}`);
      } catch (err) {
        console.warn(`  LLM batch ${batchNum} failed:`, err.message);
      }
    }));

    if (i + BATCH_CONCURRENCY < batches.length) await sleep(500);
  }

  return results;
}

// ─── Wikidata gender check (concurrent) ──────────────────────────────────────

async function checkWikidataName(name, genderQID) {
  try {
    const searchRes = await fetch(
      `https://www.wikidata.org/w/api.php?action=wbsearchentities&search=${encodeURIComponent(name)}&language=en&limit=3&format=json&origin=*`
    );
    const searchData = await searchRes.json();
    const ids = (searchData.search || []).map(r => r.id).slice(0, 3).join('|');
    if (!ids) return null;

    const entityRes = await fetch(
      `https://www.wikidata.org/w/api.php?action=wbgetentities&ids=${ids}&props=claims|labels&languages=en&format=json&origin=*`
    );
    const entityData = await entityRes.json();

    for (const id in entityData.entities) {
      const entity = entityData.entities[id];
      const claims = entity.claims || {};
      const isHuman  = claims.P31?.some(c => c.mainsnak.datavalue?.value?.id === GAME_CONFIG.wikidataInstance);
      const isGender = claims.P21?.some(c => c.mainsnak.datavalue?.value?.id === genderQID);
      if (isHuman && isGender) {
        return { confirmed: true, wikidataName: entity.labels?.en?.value };
      }
    }
    return { confirmed: false };
  } catch {
    return null;
  }
}

async function checkWikidataBatch(candidates, genderQID) {
  const results = new Map();
  const queue = [...candidates];
  let completed = 0;

  async function worker() {
    while (queue.length > 0) {
      const candidate = queue.shift();
      if (!candidate) break;
      const result = await checkWikidataName(candidate.name, genderQID);
      results.set((candidate.login || candidate.name).toLowerCase(), result);
      completed++;
      if (completed % 50 === 0) {
        console.log(`  Wikidata progress: ${completed}/${candidates.length}`);
      }
      await sleep(100); // light delay per worker
    }
  }

  const workers = Array.from({ length: WIKIDATA_CONCURRENCY }, () => worker());
  await Promise.all(workers);
  return results;
}

// ─── Shared social-media pipeline (women / men) ──────────────────────────────

async function buildSocialAllowlist({ outputPath, genderLabel, genderPrompt, genderQID }) {
  console.log(`\nBuilding allowlist for: ${genderLabel}\n`);

  // 1. Fetch candidates
  const githubStreamers = await fetchGitHubStreamers();

  let liveTwitchStreamers = [];
  if (process.env.TWITCH_CLIENT_ID && process.env.TWITCH_CLIENT_SECRET) {
    const token = await getTwitchToken();
    liveTwitchStreamers = await fetchLiveTwitchStreamers(token);
  } else {
    console.log('No TWITCH credentials — using GitHub dataset only');
  }

  const youtubeCreators = await fetchYouTubeCreators();

  // Convert manual seeds to candidate objects
  const manualCandidates = MANUAL_SEEDS.map(name => ({
    name,
    login: name.toLowerCase(),
    platform: 'twitch',
    followers: 0,
    manual: true,
  }));

  // Merge: GitHub dataset first (sorted by followers), then manual seeds, then live/YT
  const seenMerge = new Set();
  const allCandidates = [];
  for (const c of [...githubStreamers, ...manualCandidates, ...liveTwitchStreamers, ...youtubeCreators]) {
    const key = (c.login || c.name).toLowerCase();
    if (!seenMerge.has(key)) {
      seenMerge.add(key);
      allCandidates.push(c);
    }
  }
  console.log(`\nTotal unique candidates: ${allCandidates.length}`);

  // 2. LLM bulk pass — fast, classifies all candidates in ~10 API calls
  console.log('\nLLM bulk gender classification...');
  const llmResults = await classifyGenderWithLLM(allCandidates.map(c => c.name), genderLabel, genderPrompt);
  const llmConfirmed = allCandidates.filter(c => llmResults[c.name]);
  console.log(`LLM confirmed ${genderLabel}: ${llmConfirmed.length}/${allCandidates.length}`);

  // 3. Wikidata check on LLM-confirmed subset only (much smaller, runs concurrently)
  console.log(`\nWikidata verification on ${llmConfirmed.length} names (${WIKIDATA_CONCURRENCY} concurrent)...`);
  const wikidataResults = await checkWikidataBatch(llmConfirmed, genderQID);

  // 4. Build output
  const seen = new Set();
  const allowlist = llmConfirmed
    .map(candidate => {
      const key = (candidate.login || candidate.name).toLowerCase();
      const wikiResult = wikidataResults.get(key);
      return {
        name: wikiResult?.wikidataName || candidate.name,
        aliases: candidate.login && candidate.login.toLowerCase() !== (wikiResult?.wikidataName || candidate.name).toLowerCase()
          ? [candidate.login]
          : [],
        platform: candidate.platform,
        followers: candidate.followers || 0,
        genderSource: wikiResult?.confirmed ? 'wikidata+llm' : 'llm',
        wikidataConfirmed: wikiResult?.confirmed ?? false,
      };
    })
    .sort((a, b) => b.followers - a.followers)
    .filter(entry => {
      const k = entry.name.toLowerCase();
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });

  await fs.writeFile(outputPath, JSON.stringify(allowlist, null, 2));
  console.log(`\nWritten to ${outputPath}`);
  console.log(`   ${allowlist.length} entries`);

  const bySource = allowlist.reduce((acc, e) => {
    acc[e.genderSource] = (acc[e.genderSource] || 0) + 1;
    return acc;
  }, {});
  console.log('   By gender source:', bySource);

  const wikidataCount = allowlist.filter(e => e.wikidataConfirmed).length;
  console.log(`   Wikidata confirmed: ${wikidataCount} (${allowlist.length > 0 ? ((wikidataCount / allowlist.length) * 100).toFixed(0) : 0}%)`);
}

// ─── Per-category builders ────────────────────────────────────────────────────

async function buildWomenAllowlist() {
  await buildSocialAllowlist({
    outputPath: WOMEN_OUTPUT_PATH,
    genderLabel: 'women',
    genderPrompt: 'identify which ones are clearly female (woman or girl). Only include people you are highly confident are female.',
    genderQID: 'Q6581072', // female
  });
}

async function buildMenAllowlist() {
  await buildSocialAllowlist({
    outputPath: MEN_OUTPUT_PATH,
    genderLabel: 'men',
    genderPrompt: 'identify which ones are clearly male (man or boy). Only include people you are highly confident are male.',
    genderQID: 'Q6581097', // male
  });
}

async function buildLoLAllowlist() {
  console.log('\nBuilding LoL Champions allowlist...\n');

  // Step 1: Get latest patch version
  const versionsRes = await fetch('https://ddragon.leagueoflegends.com/api/versions.json');
  if (!versionsRes.ok) throw new Error(`Versions fetch failed: HTTP ${versionsRes.status}`);
  const versions = await versionsRes.json();
  const latestVersion = versions[0];
  console.log(`Latest Data Dragon version: ${latestVersion}`);

  // Step 2: Fetch champion summary
  const champRes = await fetch(
    `https://ddragon.leagueoflegends.com/cdn/${latestVersion}/data/en_US/champion.json`
  );
  if (!champRes.ok) throw new Error(`Champion data fetch failed: HTTP ${champRes.status}`);
  const champData = await champRes.json();

  // Female champions — manually curated (Riot Data Dragon has no gender field)
  const FEMALE_CHAMPIONS = new Set([
    'Ahri', 'Akali', 'Ambessa', 'Anivia', 'Annie', 'Ashe',
    "Bel'Veth", 'Briar', 'Caitlyn', 'Camille', 'Cassiopeia',
    'Diana', 'Elise', 'Evelynn', 'Fiora', 'Gwen', 'Illaoi', 'Irelia',
    'Janna', 'Jinx', "Kai'Sa", 'Karma', 'Katarina', 'Kayle', 'Kindred',
    'LeBlanc', 'Leona', 'Lillia', 'Lissandra', 'Lux',
    'Miss Fortune', 'Morgana', 'Naafiri', 'Nami', 'Neeko', 'Nidalee', 'Nilah',
    'Orianna', 'Poppy', 'Quinn', 'Rell', 'Renata Glasc', 'Riven',
    'Samira', 'Sejuani', 'Seraphine', 'Shyvana', 'Sivir',
    'Sona', 'Soraka', 'Syndra', 'Taliyah', 'Tristana',
    'Vayne', 'Vi', 'Xayah', 'Yuumi', 'Zeri', 'Zoe', 'Zyra',
  ]);

  // Step 3: Build allowlist — use .name (display name), .id as alias
  // champData.data is an object keyed by champion ID (e.g. "JarvanIV")
  // Each value has: .name ("Jarvan IV"), .id ("JarvanIV"), .title, .blurb
  const allowlist = Object.values(champData.data).map(champ => ({
    name: champ.name,             // "Jarvan IV" — the display name players know
    aliases: [champ.id],          // "JarvanIV" — camelCase variant as alias
    platform: 'lol',
    followers: 0,
    gender: FEMALE_CHAMPIONS.has(champ.name) ? 'f' : 'm',
    genderSource: 'manual-curation',
    wikidataConfirmed: false,
  }));

  await fs.writeFile(LOL_OUTPUT_PATH, JSON.stringify(allowlist, null, 2));
  console.log(`Written to ${LOL_OUTPUT_PATH}`);
  console.log(`${allowlist.length} LoL champions`);
}

async function buildNBAAllowlist() {
  console.log('\nBuilding NBA Players allowlist...\n');
  console.log('NOTE: NBA Stats API is CORS-blocked in browsers — this runs in Node.js only.');

  const url = 'https://stats.nba.com/stats/commonallplayers?IsOnlyCurrentSeason=0&LeagueID=00&Season=2024-25';
  const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Referer': 'https://www.nba.com/',
    'Accept': 'application/json, text/plain, */*',
    'Accept-Language': 'en-US,en;q=0.9',
    'x-nba-stats-origin': 'statscall',
    'x-nba-stats-token': 'true',
    'Connection': 'keep-alive',
  };

  let res;
  try {
    res = await fetch(url, { headers });
  } catch (err) {
    throw new Error(`NBA Stats API network error: ${err.message}. This API may require a VPN or updated headers.`);
  }

  if (!res.ok) {
    throw new Error(`NBA Stats API returned HTTP ${res.status}. Headers may need updating — see: https://github.com/swar/nba_api`);
  }

  const data = await res.json();

  if (!data.resultSets || !data.resultSets[0]) {
    throw new Error('NBA Stats API response missing resultSets. Endpoint may have changed.');
  }

  const resultSet = data.resultSets[0];
  const colHeaders = resultSet.headers;
  const rows = resultSet.rowSet;

  const nameIdx     = colHeaders.indexOf('DISPLAY_FIRST_LAST');
  const fromYearIdx = colHeaders.indexOf('FROM_YEAR');
  const toYearIdx   = colHeaders.indexOf('TO_YEAR');

  if (nameIdx === -1) {
    throw new Error(`Column DISPLAY_FIRST_LAST not found. Available columns: ${colHeaders.join(', ')}`);
  }

  // Well-known nicknames → player's full display name (as it appears in DISPLAY_FIRST_LAST)
  const NBA_NICKNAMES = {
    // Modern stars
    'wemby':        'Victor Wembanyama',
    'bron':         'LeBron James',
    'lebron':       'LeBron James',
    'kd':           'Kevin Durant',
    'slim reaper':  'Kevin Durant',
    'greek freak':  'Giannis Antetokounmpo',
    'joker':        'Nikola Jokic',
    'ant':          'Anthony Edwards',
    'ant-man':      'Anthony Edwards',
    'dame':         'Damian Lillard',
    'pg13':         'Paul George',
    'cp3':          'Chris Paul',
    'russ':         'Russell Westbrook',
    'the brow':     'Anthony Davis',
    'the beard':    'James Harden',
    'luka':         'Luka Doncic',
    'zion':         'Zion Williamson',
    // Legends
    'mj':           'Michael Jordan',
    'magic':        'Magic Johnson',
    'dr j':         'Julius Erving',
    'the mailman':  'Karl Malone',
    'the dream':    'Hakeem Olajuwon',
    'admiral':      'David Robinson',
    'the admiral':  'David Robinson',
    'penny':        'Anfernee Hardaway',
    'the answer':   'Allen Iverson',
    'ai':           'Allen Iverson',
    'flash':        'Dwyane Wade',
    'd-wade':       'Dwyane Wade',
    'big fundamental': 'Tim Duncan',
    'logo':         'Jerry West',
  };

  // Build a name→entry map for nickname injection
  const playersByName = new Map();

  const allowlist = rows
    .map(row => {
      const name     = row[nameIdx];
      const fromYear = fromYearIdx !== -1 ? parseInt(row[fromYearIdx], 10) || 0 : 0;
      const toYear   = toYearIdx   !== -1 ? parseInt(row[toYearIdx],   10) || 0 : 0;
      return { name, aliases: [], platform: 'nba', fromYear, toYear, genderSource: 'nba-stats-api', wikidataConfirmed: false };
    })
    .filter(entry => entry.name && entry.name.trim() !== '');

  // Normalize: strip diacritics for nickname lookup (e.g. "Jokić" → "Jokic")
  const normalize = str => str.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

  // Index by normalized display name for nickname injection
  for (const entry of allowlist) {
    playersByName.set(normalize(entry.name), entry);
  }

  // Inject nicknames as aliases on matching players
  let nicknameCount = 0;
  for (const [nickname, fullName] of Object.entries(NBA_NICKNAMES)) {
    const entry = playersByName.get(normalize(fullName));
    if (entry) {
      entry.aliases.push(nickname);
      nicknameCount++;
    } else {
      console.warn(`  Nickname "${nickname}" → "${fullName}" — player not found in dataset`);
    }
  }
  console.log(`  ${nicknameCount} nicknames injected`);

  await fs.writeFile(NBA_OUTPUT_PATH, JSON.stringify(allowlist, null, 2));
  console.log(`Written to ${NBA_OUTPUT_PATH}`);
  console.log(`${allowlist.length} NBA players`);
}

// ─── Dispatch ─────────────────────────────────────────────────────────────────

// ─── Kakegurui characters ─────────────────────────────────────────────────────

const KAKEGURUI_CHARACTERS = [
  { name: 'Yumeko Jabami',         aliases: ['Yumeko'],          gender: 'f' },
  { name: 'Mary Saotome',          aliases: ['Mary'],            gender: 'f' },
  { name: 'Kirari Momobami',       aliases: ['Kirari'],          gender: 'f' },
  { name: 'Ririka Momobami',       aliases: ['Ririka'],          gender: 'f' },
  { name: 'Midari Ikishima',       aliases: ['Midari'],          gender: 'f' },
  { name: 'Yuriko Nishinotouin',   aliases: ['Yuriko'],          gender: 'f' },
  { name: 'Sayaka Igarashi',       aliases: ['Sayaka'],          gender: 'f' },
  { name: 'Rei Batsubami',         aliases: ['Rei'],             gender: 'f' },
  { name: 'Runa Yomozuki',         aliases: ['Runa'],            gender: 'f' },
  { name: 'Itsuki Sumeragi',       aliases: ['Itsuki'],          gender: 'f' },
  { name: 'Yuriko Nishinotouin',   aliases: ['Yuriko'],          gender: 'f' },
  { name: 'Ryota Suzui',           aliases: ['Ryota'],           gender: 'm' },
  { name: 'Kaede Manyuda',         aliases: ['Kaede'],           gender: 'm' },
];

// ─── Game character rosters (manually curated, gender annotated) ──────────────

const TEKKEN_CHARACTERS = [
  // Female
  { name: 'Alisa Bosconovitch', aliases: ['Alisa'],                         gender: 'f' },
  { name: 'Anna Williams',      aliases: ['Anna'],                           gender: 'f' },
  { name: 'Asuka Kazama',       aliases: ['Asuka'],                          gender: 'f' },
  { name: 'Azucena Ortiz',      aliases: ['Azucena', 'Azucena Milagros'],    gender: 'f' },
  { name: 'Christie Monteiro',  aliases: ['Christie'],                       gender: 'f' },
  { name: 'Eliza',              aliases: [],                                  gender: 'f' },
  { name: 'Emilie De Rochefort',aliases: ['Lili', 'Emilie'],                 gender: 'f' },
  { name: 'Josie Rizal',        aliases: ['Josie'],                          gender: 'f' },
  { name: 'Julia Chang',        aliases: ['Julia'],                          gender: 'f' },
  { name: 'Jun Kazama',         aliases: ['Jun'],                            gender: 'f' },
  { name: 'Katarina Alves',     aliases: ['Katarina'],                       gender: 'f' },
  { name: 'Kazumi Mishima',     aliases: ['Kazumi'],                         gender: 'f' },
  { name: 'Kunimitsu',          aliases: [],                                  gender: 'f' },
  { name: 'Leo Kliesen',        aliases: ['Leo'],                            gender: 'f' },
  { name: 'Lidia Sobieska',     aliases: ['Lidia'],                          gender: 'f' },
  { name: 'Lucky Chloe',        aliases: ['Chloe'],                          gender: 'f' },
  { name: 'Master Raven',       aliases: [],                                  gender: 'f' },
  { name: 'Michelle Chang',     aliases: ['Michelle'],                       gender: 'f' },
  { name: 'Nina Williams',      aliases: ['Nina'],                           gender: 'f' },
  { name: 'Panda',              aliases: [],                                  gender: 'f' },
  { name: 'Reina',              aliases: [],                                  gender: 'f' },
  { name: 'Ling Xiaoyu',        aliases: ['Xiaoyu', 'Ling'],                 gender: 'f' },
  { name: 'Zafina',             aliases: [],                                  gender: 'f' },
  // Male
  { name: 'Armor King',         aliases: [],                                  gender: 'm' },
  { name: 'Bryan Fury',         aliases: ['Bryan'],                          gender: 'm' },
  { name: 'Claudio Serafino',   aliases: ['Claudio'],                        gender: 'm' },
  { name: 'Devil Jin',          aliases: [],                                  gender: 'm' },
  { name: 'Eddy Gordo',         aliases: ['Eddy'],                           gender: 'm' },
  { name: 'Fahkumram',          aliases: [],                                  gender: 'm' },
  { name: 'Feng Wei',           aliases: ['Feng'],                           gender: 'm' },
  { name: 'Heihachi Mishima',   aliases: ['Heihachi'],                       gender: 'm' },
  { name: 'Hwoarang',           aliases: [],                                  gender: 'm' },
  { name: 'Jack-8',             aliases: ['Jack'],                           gender: 'm' },
  { name: 'Jin Kazama',         aliases: ['Jin'],                            gender: 'm' },
  { name: 'Kazuya Mishima',     aliases: ['Kazuya'],                         gender: 'm' },
  { name: 'King',               aliases: [],                                  gender: 'm' },
  { name: 'Kuma',               aliases: [],                                  gender: 'm' },
  { name: 'Lars Alexandersson', aliases: ['Lars'],                           gender: 'm' },
  { name: 'Law',                aliases: ['Marshall Law'],                   gender: 'm' },
  { name: 'Lee Chaolan',        aliases: ['Lee', 'Violet'],                  gender: 'm' },
  { name: 'Leroy Smith',        aliases: ['Leroy'],                          gender: 'm' },
  { name: 'Paul Phoenix',       aliases: ['Paul'],                           gender: 'm' },
  { name: 'Raven',              aliases: [],                                  gender: 'm' },
  { name: 'Shaheen',            aliases: [],                                  gender: 'm' },
  { name: 'Steve Fox',          aliases: ['Steve'],                          gender: 'm' },
  { name: 'Victor Chevalier',   aliases: ['Victor'],                         gender: 'm' },
  { name: 'Yoshimitsu',         aliases: [],                                  gender: 'm' },
];

const SKULLGIRLS_CHARACTERS = [
  // Female
  { name: 'Filia',        aliases: [],                                             gender: 'f' },
  { name: 'Cerebella',    aliases: [],                                             gender: 'f' },
  { name: 'Peacock',      aliases: [],                                             gender: 'f' },
  { name: 'Parasoul',     aliases: [],                                             gender: 'f' },
  { name: 'Ms. Fortune',  aliases: ['Ms Fortune', 'Nadia Fortune', 'Nadia'],      gender: 'f' },
  { name: 'Painwheel',    aliases: [],                                             gender: 'f' },
  { name: 'Valentine',    aliases: [],                                             gender: 'f' },
  { name: 'Double',       aliases: [],                                             gender: 'f' },
  { name: 'Squigly',      aliases: ['Sienna Contiello'],                          gender: 'f' },
  { name: 'Fukua',        aliases: [],                                             gender: 'f' },
  { name: 'Eliza',        aliases: [],                                             gender: 'f' },
  { name: 'Robo-Fortune', aliases: ['Robo Fortune'],                              gender: 'f' },
  { name: 'Annie',        aliases: ['Annie of the Stars'],                        gender: 'f' },
  { name: 'Black Dahlia', aliases: [],                                             gender: 'f' },
  { name: 'Umbrella',     aliases: [],                                             gender: 'f' },
  // Male
  { name: 'Big Band',     aliases: [],                                             gender: 'm' },
  { name: 'Beowulf',      aliases: [],                                             gender: 'm' },
];

// ─── Popular fictional characters (manually curated, cross-media) ────────────

const POPULAR_FICTIONAL_CHARACTERS = [

  // ── Disney / Pixar ──────────────────────────────────────────────────────────
  { name: 'Elsa',             aliases: ['Queen Elsa'],                             franchise: 'frozen',     gender: 'f' },
  { name: 'Anna',             aliases: [],                                          franchise: 'frozen',     gender: 'f' },
  { name: 'Moana',            aliases: [],                                          franchise: 'disney',     gender: 'f' },
  { name: 'Mulan',            aliases: ['Fa Mulan'],                               franchise: 'disney',     gender: 'f' },
  { name: 'Ariel',            aliases: ['The Little Mermaid'],                     franchise: 'disney',     gender: 'f' },
  { name: 'Belle',            aliases: [],                                          franchise: 'disney',     gender: 'f' },
  { name: 'Cinderella',       aliases: ['Ella'],                                   franchise: 'disney',     gender: 'f' },
  { name: 'Rapunzel',         aliases: [],                                          franchise: 'tangled',    gender: 'f' },
  { name: 'Merida',           aliases: [],                                          franchise: 'brave',      gender: 'f' },
  { name: 'Tiana',            aliases: [],                                          franchise: 'disney',     gender: 'f' },
  { name: 'Snow White',       aliases: [],                                          franchise: 'disney',     gender: 'f' },
  { name: 'Aurora',           aliases: ['Sleeping Beauty', 'Briar Rose'],          franchise: 'disney',     gender: 'f' },
  { name: 'Jasmine',          aliases: ['Princess Jasmine'],                       franchise: 'aladdin',    gender: 'f' },
  { name: 'Pocahontas',       aliases: [],                                          franchise: 'disney',     gender: 'f' },
  { name: 'Raya',             aliases: [],                                          franchise: 'disney',     gender: 'f' },
  { name: 'Mirabel',          aliases: ['Mirabel Madrigal'],                       franchise: 'encanto',    gender: 'f' },
  { name: 'Isabela Madrigal', aliases: ['Isabela'],                                franchise: 'encanto',    gender: 'f' },
  { name: 'Luisa Madrigal',   aliases: ['Luisa'],                                  franchise: 'encanto',    gender: 'f' },
  { name: 'Vanellope',        aliases: ['Vanellope von Schweetz'],                 franchise: 'disney',     gender: 'f' },
  { name: 'Judy Hopps',       aliases: ['Judy'],                                   franchise: 'zootopia',   gender: 'f' },
  { name: 'Helen Parr',       aliases: ['Elastigirl', 'Mrs. Incredible'],          franchise: 'incredibles',gender: 'f' },
  { name: 'Violet Parr',      aliases: ['Violet'],                                 franchise: 'incredibles',gender: 'f' },
  { name: 'Joy',              aliases: [],                                          franchise: 'insideout',  gender: 'f' },
  { name: 'Sadness',          aliases: [],                                          franchise: 'insideout',  gender: 'f' },
  { name: 'Disgust',          aliases: [],                                          franchise: 'insideout',  gender: 'f' },
  { name: 'Nala',             aliases: [],                                          franchise: 'lionking',   gender: 'f' },
  { name: 'Dory',             aliases: [],                                          franchise: 'pixar',      gender: 'f' },
  { name: 'Asha',             aliases: [],                                          franchise: 'disney',     gender: 'f' },
  { name: 'Tinker Bell',      aliases: ['Tinkerbell', 'Tink'],                     franchise: 'disney',     gender: 'f' },
  { name: 'Wendy Darling',    aliases: ['Wendy'],                                  franchise: 'peterpan',   gender: 'f' },
  { name: 'Alice',            aliases: [],                                          franchise: 'alice',      gender: 'f' },
  { name: 'Maleficent',       aliases: [],                                          franchise: 'disney',     gender: 'f' },
  { name: 'Cruella de Vil',   aliases: ['Cruella'],                                franchise: 'disney',     gender: 'f' },
  { name: 'Ursula',           aliases: [],                                          franchise: 'disney',     gender: 'f' },
  { name: 'Meg',              aliases: ['Megara'],                                  franchise: 'hercules',   gender: 'f' },

  { name: 'Simba',            aliases: [],                                          franchise: 'lionking',   gender: 'm' },
  { name: 'Woody',            aliases: ['Sheriff Woody'],                           franchise: 'toystory',   gender: 'm' },
  { name: 'Buzz Lightyear',   aliases: ['Buzz'],                                   franchise: 'toystory',   gender: 'm' },
  { name: 'Aladdin',          aliases: ['Al'],                                      franchise: 'aladdin',    gender: 'm' },
  { name: 'Flynn Rider',      aliases: ['Eugene Fitzherbert', 'Flynn'],            franchise: 'tangled',    gender: 'm' },
  { name: 'Kristoff',         aliases: [],                                          franchise: 'frozen',     gender: 'm' },
  { name: 'Hercules',         aliases: ['Herc'],                                   franchise: 'hercules',   gender: 'm' },
  { name: 'Mowgli',           aliases: [],                                          franchise: 'junglebook', gender: 'm' },
  { name: 'Pinocchio',        aliases: [],                                          franchise: 'disney',     gender: 'm' },
  { name: 'Dumbo',            aliases: [],                                          franchise: 'disney',     gender: 'm' },
  { name: 'Bambi',            aliases: [],                                          franchise: 'disney',     gender: 'm' },

  // ── Marvel ──────────────────────────────────────────────────────────────────
  { name: 'Black Widow',      aliases: ['Natasha Romanoff', 'Natasha'],            franchise: 'marvel',     gender: 'f' },
  { name: 'Scarlet Witch',    aliases: ['Wanda Maximoff', 'Wanda'],                franchise: 'marvel',     gender: 'f' },
  { name: 'Captain Marvel',   aliases: ['Carol Danvers'],                          franchise: 'marvel',     gender: 'f' },
  { name: 'Storm',            aliases: ['Ororo Munroe'],                           franchise: 'marvel',     gender: 'f' },
  { name: 'Jean Grey',        aliases: ['Phoenix', 'Dark Phoenix'],                franchise: 'marvel',     gender: 'f' },
  { name: 'Rogue',            aliases: ['Anna Marie'],                             franchise: 'marvel',     gender: 'f' },
  { name: 'Mystique',         aliases: ['Raven Darkholme'],                        franchise: 'marvel',     gender: 'f' },
  { name: 'She-Hulk',         aliases: ['Jennifer Walters'],                       franchise: 'marvel',     gender: 'f' },
  { name: 'Wasp',             aliases: ['Janet Van Dyne'],                         franchise: 'marvel',     gender: 'f' },
  { name: 'Gamora',           aliases: [],                                          franchise: 'marvel',     gender: 'f' },
  { name: 'Nebula',           aliases: [],                                          franchise: 'marvel',     gender: 'f' },
  { name: 'Shuri',            aliases: [],                                          franchise: 'marvel',     gender: 'f' },
  { name: 'Pepper Potts',     aliases: ['Pepper', 'Rescue'],                       franchise: 'marvel',     gender: 'f' },
  { name: 'Gwen Stacy',       aliases: ['Spider-Gwen', 'Ghost-Spider'],            franchise: 'marvel',     gender: 'f' },
  { name: 'Mary Jane Watson', aliases: ['Mary Jane', 'MJ'],                        franchise: 'marvel',     gender: 'f' },
  { name: 'Invisible Woman',  aliases: ['Sue Storm', 'Susan Storm'],               franchise: 'marvel',     gender: 'f' },
  { name: 'Ms. Marvel',       aliases: ['Kamala Khan', 'Kamala'],                  franchise: 'marvel',     gender: 'f' },
  { name: 'America Chavez',   aliases: ['America'],                                franchise: 'marvel',     gender: 'f' },
  { name: 'Yelena Belova',    aliases: ['Yelena'],                                 franchise: 'marvel',     gender: 'f' },
  { name: 'Elektra',          aliases: [],                                          franchise: 'marvel',     gender: 'f' },
  { name: 'Okoye',            aliases: [],                                          franchise: 'marvel',     gender: 'f' },

  { name: 'Spider-Man',       aliases: ['Peter Parker', 'Spiderman'],              franchise: 'marvel',     gender: 'm' },
  { name: 'Iron Man',         aliases: ['Tony Stark', 'Tony'],                     franchise: 'marvel',     gender: 'm' },
  { name: 'Captain America',  aliases: ['Steve Rogers', 'Steve'],                  franchise: 'marvel',     gender: 'm' },
  { name: 'Thor',             aliases: ['Thor Odinson'],                           franchise: 'marvel',     gender: 'm' },
  { name: 'Hulk',             aliases: ['Bruce Banner'],                           franchise: 'marvel',     gender: 'm' },
  { name: 'Black Panther',    aliases: ["T'Challa"],                               franchise: 'marvel',     gender: 'm' },
  { name: 'Hawkeye',          aliases: ['Clint Barton'],                           franchise: 'marvel',     gender: 'm' },
  { name: 'Wolverine',        aliases: ['Logan', 'James Howlett'],                 franchise: 'marvel',     gender: 'm' },
  { name: 'Cyclops',          aliases: ['Scott Summers'],                          franchise: 'marvel',     gender: 'm' },
  { name: 'Professor X',      aliases: ['Professor Xavier', 'Charles Xavier'],     franchise: 'marvel',     gender: 'm' },
  { name: 'Magneto',          aliases: ['Erik Lehnsherr', 'Max Eisenhardt'],       franchise: 'marvel',     gender: 'm' },
  { name: 'Deadpool',         aliases: ['Wade Wilson'],                            franchise: 'marvel',     gender: 'm' },
  { name: 'Ant-Man',          aliases: ['Scott Lang'],                             franchise: 'marvel',     gender: 'm' },
  { name: 'Doctor Strange',   aliases: ['Stephen Strange'],                        franchise: 'marvel',     gender: 'm' },
  { name: 'Loki',             aliases: [],                                          franchise: 'marvel',     gender: 'm' },
  { name: 'Thanos',           aliases: [],                                          franchise: 'marvel',     gender: 'm' },
  { name: 'Green Goblin',     aliases: ['Norman Osborn'],                          franchise: 'marvel',     gender: 'm' },
  { name: 'Venom',            aliases: ['Eddie Brock'],                            franchise: 'marvel',     gender: 'm' },
  { name: 'Nick Fury',        aliases: ['Fury'],                                   franchise: 'marvel',     gender: 'm' },
  { name: 'Daredevil',        aliases: ['Matt Murdock'],                           franchise: 'marvel',     gender: 'm' },
  { name: 'Punisher',         aliases: ['Frank Castle'],                           franchise: 'marvel',     gender: 'm' },
  { name: 'Winter Soldier',   aliases: ['Bucky Barnes', 'Bucky'],                  franchise: 'marvel',     gender: 'm' },
  { name: 'Falcon',           aliases: ['Sam Wilson'],                             franchise: 'marvel',     gender: 'm' },
  { name: 'Vision',           aliases: [],                                          franchise: 'marvel',     gender: 'm' },
  { name: 'War Machine',      aliases: ['James Rhodes', 'Rhodey'],                 franchise: 'marvel',     gender: 'm' },
  { name: 'Quicksilver',      aliases: ['Pietro Maximoff'],                        franchise: 'marvel',     gender: 'm' },
  { name: 'Beast',            aliases: ['Hank McCoy'],                             franchise: 'marvel',     gender: 'm' },
  { name: 'Iceman',           aliases: ['Bobby Drake'],                            franchise: 'marvel',     gender: 'm' },

  // ── DC Comics ───────────────────────────────────────────────────────────────
  { name: 'Wonder Woman',     aliases: ['Diana Prince', 'Diana'],                  franchise: 'dc',         gender: 'f' },
  { name: 'Catwoman',         aliases: ['Selina Kyle', 'Selina'],                  franchise: 'dc',         gender: 'f' },
  { name: 'Harley Quinn',     aliases: ['Harley'],                                 franchise: 'dc',         gender: 'f' },
  { name: 'Supergirl',        aliases: ['Kara Danvers', 'Kara Zor-El', 'Kara'],   franchise: 'dc',         gender: 'f' },
  { name: 'Batgirl',          aliases: ['Barbara Gordon'],                         franchise: 'dc',         gender: 'f' },
  { name: 'Batwoman',         aliases: ['Kate Kane'],                              franchise: 'dc',         gender: 'f' },
  { name: 'Poison Ivy',       aliases: ['Pamela Isley'],                           franchise: 'dc',         gender: 'f' },
  { name: 'Black Canary',     aliases: ['Dinah Lance'],                            franchise: 'dc',         gender: 'f' },
  { name: 'Starfire',         aliases: ["Koriand'r"],                              franchise: 'dc',         gender: 'f' },
  { name: 'Raven',            aliases: ['Rachel Roth'],                            franchise: 'dc',         gender: 'f' },
  { name: 'Zatanna',          aliases: [],                                          franchise: 'dc',         gender: 'f' },
  { name: 'Mera',             aliases: [],                                          franchise: 'dc',         gender: 'f' },
  { name: 'Huntress',         aliases: ['Helena Bertinelli'],                      franchise: 'dc',         gender: 'f' },
  { name: 'Power Girl',       aliases: ['Kara Zor-L'],                             franchise: 'dc',         gender: 'f' },
  { name: 'Lois Lane',        aliases: [],                                          franchise: 'dc',         gender: 'f' },
  { name: 'Hawkgirl',         aliases: ['Shiera Hall'],                            franchise: 'dc',         gender: 'f' },

  { name: 'Superman',         aliases: ['Clark Kent', 'Kal-El'],                   franchise: 'dc',         gender: 'm' },
  { name: 'Batman',           aliases: ['Bruce Wayne'],                            franchise: 'dc',         gender: 'm' },
  { name: 'Joker',            aliases: ['The Joker'],                              franchise: 'dc',         gender: 'm' },
  { name: 'The Flash',        aliases: ['Barry Allen', 'Barry'],                   franchise: 'dc',         gender: 'm' },
  { name: 'Green Lantern',    aliases: ['Hal Jordan'],                             franchise: 'dc',         gender: 'm' },
  { name: 'Aquaman',          aliases: ['Arthur Curry'],                           franchise: 'dc',         gender: 'm' },
  { name: 'Robin',            aliases: ['Dick Grayson', 'Tim Drake', 'Damian Wayne'], franchise: 'dc',      gender: 'm' },
  { name: 'Green Arrow',      aliases: ['Oliver Queen', 'Ollie'],                  franchise: 'dc',         gender: 'm' },
  { name: 'Lex Luthor',       aliases: ['Lex'],                                    franchise: 'dc',         gender: 'm' },
  { name: 'Bane',             aliases: [],                                          franchise: 'dc',         gender: 'm' },
  { name: 'Two-Face',         aliases: ['Harvey Dent'],                            franchise: 'dc',         gender: 'm' },
  { name: 'Riddler',          aliases: ['Edward Nygma'],                           franchise: 'dc',         gender: 'm' },
  { name: 'Penguin',          aliases: ['Oswald Cobblepot'],                       franchise: 'dc',         gender: 'm' },
  { name: 'Nightwing',        aliases: ['Dick Grayson'],                           franchise: 'dc',         gender: 'm' },
  { name: 'Deathstroke',      aliases: ['Slade Wilson'],                           franchise: 'dc',         gender: 'm' },
  { name: 'Constantine',      aliases: ['John Constantine'],                       franchise: 'dc',         gender: 'm' },
  { name: 'Shazam',           aliases: ['Billy Batson', 'Captain Marvel'],         franchise: 'dc',         gender: 'm' },
  { name: 'Cyborg',           aliases: ['Victor Stone'],                           franchise: 'dc',         gender: 'm' },

  // ── Harry Potter ────────────────────────────────────────────────────────────
  { name: 'Hermione Granger', aliases: ['Hermione'],                               franchise: 'harrypotter',gender: 'f' },
  { name: 'Ginny Weasley',    aliases: ['Ginny'],                                  franchise: 'harrypotter',gender: 'f' },
  { name: 'Luna Lovegood',    aliases: ['Luna'],                                   franchise: 'harrypotter',gender: 'f' },
  { name: 'Bellatrix Lestrange', aliases: ['Bellatrix'],                           franchise: 'harrypotter',gender: 'f' },
  { name: 'Dolores Umbridge', aliases: ['Umbridge'],                               franchise: 'harrypotter',gender: 'f' },
  { name: 'Molly Weasley',    aliases: ['Molly'],                                  franchise: 'harrypotter',gender: 'f' },
  { name: 'Minerva McGonagall', aliases: ['McGonagall', 'Professor McGonagall'],   franchise: 'harrypotter',gender: 'f' },
  { name: 'Nymphadora Tonks', aliases: ['Tonks'],                                  franchise: 'harrypotter',gender: 'f' },
  { name: 'Fleur Delacour',   aliases: ['Fleur'],                                  franchise: 'harrypotter',gender: 'f' },
  { name: 'Cho Chang',        aliases: ['Cho'],                                    franchise: 'harrypotter',gender: 'f' },
  { name: 'Lavender Brown',   aliases: ['Lavender'],                               franchise: 'harrypotter',gender: 'f' },
  { name: 'Narcissa Malfoy',  aliases: ['Narcissa'],                               franchise: 'harrypotter',gender: 'f' },
  { name: 'Lily Potter',      aliases: ['Lily Evans'],                             franchise: 'harrypotter',gender: 'f' },

  { name: 'Harry Potter',     aliases: ['Harry'],                                  franchise: 'harrypotter',gender: 'm' },
  { name: 'Ron Weasley',      aliases: ['Ron'],                                    franchise: 'harrypotter',gender: 'm' },
  { name: 'Albus Dumbledore', aliases: ['Dumbledore'],                             franchise: 'harrypotter',gender: 'm' },
  { name: 'Lord Voldemort',   aliases: ['Voldemort', 'Tom Riddle', 'He Who Must Not Be Named'], franchise: 'harrypotter', gender: 'm' },
  { name: 'Draco Malfoy',     aliases: ['Draco'],                                  franchise: 'harrypotter',gender: 'm' },
  { name: 'Neville Longbottom', aliases: ['Neville'],                              franchise: 'harrypotter',gender: 'm' },
  { name: 'Severus Snape',    aliases: ['Snape'],                                  franchise: 'harrypotter',gender: 'm' },
  { name: 'Sirius Black',     aliases: ['Sirius'],                                 franchise: 'harrypotter',gender: 'm' },
  { name: 'Rubeus Hagrid',    aliases: ['Hagrid'],                                 franchise: 'harrypotter',gender: 'm' },
  { name: 'Remus Lupin',      aliases: ['Lupin'],                                  franchise: 'harrypotter',gender: 'm' },
  { name: 'Fred Weasley',     aliases: ['Fred'],                                   franchise: 'harrypotter',gender: 'm' },
  { name: 'George Weasley',   aliases: ['George'],                                 franchise: 'harrypotter',gender: 'm' },
  { name: 'Dobby',            aliases: [],                                          franchise: 'harrypotter',gender: 'm' },

  // ── Star Wars ───────────────────────────────────────────────────────────────
  { name: 'Leia Organa',      aliases: ['Princess Leia', 'Leia'],                  franchise: 'starwars',   gender: 'f' },
  { name: 'Rey',              aliases: ['Rey Skywalker'],                          franchise: 'starwars',   gender: 'f' },
  { name: 'Padmé Amidala',    aliases: ['Padme', 'Padme Amidala', 'Queen Amidala'],franchise: 'starwars',   gender: 'f' },
  { name: 'Ahsoka Tano',      aliases: ['Ahsoka'],                                 franchise: 'starwars',   gender: 'f' },
  { name: 'Sabine Wren',      aliases: ['Sabine'],                                 franchise: 'starwars',   gender: 'f' },
  { name: 'Hera Syndulla',    aliases: ['Hera'],                                   franchise: 'starwars',   gender: 'f' },
  { name: 'Jyn Erso',         aliases: ['Jyn'],                                    franchise: 'starwars',   gender: 'f' },
  { name: 'Asajj Ventress',   aliases: ['Ventress'],                               franchise: 'starwars',   gender: 'f' },
  { name: 'Captain Phasma',   aliases: ['Phasma'],                                 franchise: 'starwars',   gender: 'f' },
  { name: 'Rose Tico',        aliases: ['Rose'],                                   franchise: 'starwars',   gender: 'f' },

  { name: 'Luke Skywalker',   aliases: ['Luke'],                                   franchise: 'starwars',   gender: 'm' },
  { name: 'Darth Vader',      aliases: ['Anakin Skywalker', 'Anakin', 'Vader'],    franchise: 'starwars',   gender: 'm' },
  { name: 'Han Solo',         aliases: ['Han'],                                    franchise: 'starwars',   gender: 'm' },
  { name: 'Yoda',             aliases: [],                                          franchise: 'starwars',   gender: 'm' },
  { name: 'Obi-Wan Kenobi',   aliases: ['Obi Wan', 'Obi-Wan', 'Ben Kenobi'],      franchise: 'starwars',   gender: 'm' },
  { name: 'Palpatine',        aliases: ['Emperor Palpatine', 'Darth Sidious'],     franchise: 'starwars',   gender: 'm' },
  { name: 'Kylo Ren',         aliases: ['Ben Solo'],                               franchise: 'starwars',   gender: 'm' },
  { name: 'Finn',             aliases: ['FN-2187'],                                franchise: 'starwars',   gender: 'm' },
  { name: 'Poe Dameron',      aliases: ['Poe'],                                    franchise: 'starwars',   gender: 'm' },
  { name: 'Boba Fett',        aliases: ['Fett'],                                   franchise: 'starwars',   gender: 'm' },
  { name: 'Mace Windu',       aliases: ['Mace'],                                   franchise: 'starwars',   gender: 'm' },
  { name: 'Din Djarin',       aliases: ['Mandalorian', 'The Mandalorian', 'Mando'],franchise: 'starwars',   gender: 'm' },
  { name: 'Count Dooku',      aliases: ['Dooku', 'Darth Tyranus'],                 franchise: 'starwars',   gender: 'm' },
  { name: 'Lando Calrissian', aliases: ['Lando'],                                  franchise: 'starwars',   gender: 'm' },
  { name: 'Qui-Gon Jinn',     aliases: ['Qui-Gon', 'Qui Gon'],                    franchise: 'starwars',   gender: 'm' },

  // ── Game of Thrones ─────────────────────────────────────────────────────────
  { name: 'Daenerys Targaryen', aliases: ['Daenerys', 'Dany', 'Khaleesi'],         franchise: 'got',        gender: 'f' },
  { name: 'Cersei Lannister',   aliases: ['Cersei'],                               franchise: 'got',        gender: 'f' },
  { name: 'Arya Stark',         aliases: ['Arya'],                                 franchise: 'got',        gender: 'f' },
  { name: 'Sansa Stark',        aliases: ['Sansa'],                                franchise: 'got',        gender: 'f' },
  { name: 'Brienne of Tarth',   aliases: ['Brienne'],                              franchise: 'got',        gender: 'f' },
  { name: 'Ygritte',            aliases: [],                                        franchise: 'got',        gender: 'f' },
  { name: 'Melisandre',         aliases: ['Red Woman'],                            franchise: 'got',        gender: 'f' },
  { name: 'Margaery Tyrell',    aliases: ['Margaery'],                             franchise: 'got',        gender: 'f' },
  { name: 'Olenna Tyrell',      aliases: ['Olenna', 'Queen of Thorns'],            franchise: 'got',        gender: 'f' },
  { name: 'Catelyn Stark',      aliases: ['Catelyn', 'Cat'],                       franchise: 'got',        gender: 'f' },
  { name: 'Missandei',          aliases: [],                                        franchise: 'got',        gender: 'f' },
  { name: 'Lyanna Stark',       aliases: ['Lyanna'],                               franchise: 'got',        gender: 'f' },

  { name: 'Jon Snow',           aliases: ['Jon', 'Aegon Targaryen'],               franchise: 'got',        gender: 'm' },
  { name: 'Tyrion Lannister',   aliases: ['Tyrion'],                               franchise: 'got',        gender: 'm' },
  { name: 'Jaime Lannister',    aliases: ['Jaime', 'Kingslayer'],                  franchise: 'got',        gender: 'm' },
  { name: 'Ned Stark',          aliases: ['Eddard Stark', 'Ned'],                  franchise: 'got',        gender: 'm' },
  { name: 'Robb Stark',         aliases: ['Robb'],                                 franchise: 'got',        gender: 'm' },
  { name: 'Bran Stark',         aliases: ['Bran', 'Three-Eyed Raven'],             franchise: 'got',        gender: 'm' },
  { name: 'Joffrey Baratheon',  aliases: ['Joffrey'],                              franchise: 'got',        gender: 'm' },
  { name: 'Samwell Tarly',      aliases: ['Sam', 'Samwell'],                       franchise: 'got',        gender: 'm' },
  { name: 'Davos Seaworth',     aliases: ['Davos'],                                franchise: 'got',        gender: 'm' },
  { name: 'Sandor Clegane',     aliases: ['The Hound', 'Hound'],                   franchise: 'got',        gender: 'm' },
  { name: 'Petyr Baelish',      aliases: ['Littlefinger'],                         franchise: 'got',        gender: 'm' },
  { name: 'Varys',              aliases: ['The Spider'],                           franchise: 'got',        gender: 'm' },
  { name: 'Tormund',            aliases: ['Tormund Giantsbane'],                   franchise: 'got',        gender: 'm' },
  { name: 'Hodor',              aliases: [],                                        franchise: 'got',        gender: 'm' },
  { name: 'Stannis Baratheon',  aliases: ['Stannis'],                              franchise: 'got',        gender: 'm' },

  // ── Lord of the Rings ────────────────────────────────────────────────────────
  { name: 'Arwen',              aliases: ['Arwen Undómiel'],                       franchise: 'lotr',       gender: 'f' },
  { name: 'Galadriel',          aliases: [],                                        franchise: 'lotr',       gender: 'f' },
  { name: 'Eowyn',              aliases: ['Éowyn'],                                franchise: 'lotr',       gender: 'f' },

  { name: 'Frodo Baggins',      aliases: ['Frodo'],                                franchise: 'lotr',       gender: 'm' },
  { name: 'Gandalf',            aliases: ['Gandalf the Grey', 'Gandalf the White', 'Mithrandir'], franchise: 'lotr', gender: 'm' },
  { name: 'Aragorn',            aliases: ['Strider', 'Elessar'],                   franchise: 'lotr',       gender: 'm' },
  { name: 'Legolas',            aliases: [],                                        franchise: 'lotr',       gender: 'm' },
  { name: 'Gimli',              aliases: [],                                        franchise: 'lotr',       gender: 'm' },
  { name: 'Samwise Gamgee',     aliases: ['Sam', 'Samwise'],                       franchise: 'lotr',       gender: 'm' },
  { name: 'Boromir',            aliases: [],                                        franchise: 'lotr',       gender: 'm' },
  { name: 'Faramir',            aliases: [],                                        franchise: 'lotr',       gender: 'm' },
  { name: 'Meriadoc Brandybuck',aliases: ['Merry'],                                franchise: 'lotr',       gender: 'm' },
  { name: 'Peregrin Took',      aliases: ['Pippin'],                               franchise: 'lotr',       gender: 'm' },
  { name: 'Gollum',             aliases: ['Sméagol', 'Smeagol'],                   franchise: 'lotr',       gender: 'm' },
  { name: 'Bilbo Baggins',      aliases: ['Bilbo'],                                franchise: 'lotr',       gender: 'm' },
  { name: 'Thorin Oakenshield', aliases: ['Thorin'],                               franchise: 'lotr',       gender: 'm' },
  { name: 'Sauron',             aliases: ['The Dark Lord'],                        franchise: 'lotr',       gender: 'm' },
  { name: 'Saruman',            aliases: [],                                        franchise: 'lotr',       gender: 'm' },

  // ── The Hunger Games ────────────────────────────────────────────────────────
  { name: 'Katniss Everdeen',   aliases: ['Katniss'],                              franchise: 'hungergames',gender: 'f' },
  { name: 'Effie Trinket',      aliases: ['Effie'],                                franchise: 'hungergames',gender: 'f' },
  { name: 'Rue',                aliases: [],                                        franchise: 'hungergames',gender: 'f' },
  { name: 'Johanna Mason',      aliases: ['Johanna'],                              franchise: 'hungergames',gender: 'f' },
  { name: 'Primrose Everdeen',  aliases: ['Prim'],                                 franchise: 'hungergames',gender: 'f' },
  { name: 'Annie Cresta',       aliases: ['Annie'],                                franchise: 'hungergames',gender: 'f' },
  { name: 'Coin',               aliases: ['President Coin', 'Alma Coin'],          franchise: 'hungergames',gender: 'f' },

  { name: 'Peeta Mellark',      aliases: ['Peeta'],                                franchise: 'hungergames',gender: 'm' },
  { name: 'Haymitch Abernathy', aliases: ['Haymitch'],                             franchise: 'hungergames',gender: 'm' },
  { name: 'Gale Hawthorne',     aliases: ['Gale'],                                 franchise: 'hungergames',gender: 'm' },
  { name: 'Finnick Odair',      aliases: ['Finnick'],                              franchise: 'hungergames',gender: 'm' },
  { name: 'President Snow',     aliases: ['Snow', 'Coriolanus Snow'],              franchise: 'hungergames',gender: 'm' },
  { name: 'Caesar Flickerman',  aliases: ['Caesar'],                               franchise: 'hungergames',gender: 'm' },

  // ── Twilight ─────────────────────────────────────────────────────────────────
  { name: 'Bella Swan',         aliases: ['Bella', 'Bella Cullen'],                franchise: 'twilight',   gender: 'f' },
  { name: 'Alice Cullen',       aliases: ['Alice'],                                franchise: 'twilight',   gender: 'f' },
  { name: 'Rosalie Hale',       aliases: ['Rosalie'],                              franchise: 'twilight',   gender: 'f' },
  { name: 'Esme Cullen',        aliases: ['Esme'],                                 franchise: 'twilight',   gender: 'f' },
  { name: 'Victoria',           aliases: [],                                        franchise: 'twilight',   gender: 'f' },
  { name: 'Jane',               aliases: [],                                        franchise: 'twilight',   gender: 'f' },

  { name: 'Edward Cullen',      aliases: ['Edward'],                               franchise: 'twilight',   gender: 'm' },
  { name: 'Jacob Black',        aliases: ['Jacob'],                                franchise: 'twilight',   gender: 'm' },
  { name: 'Carlisle Cullen',    aliases: ['Carlisle'],                             franchise: 'twilight',   gender: 'm' },
  { name: 'Emmett Cullen',      aliases: ['Emmett'],                               franchise: 'twilight',   gender: 'm' },
  { name: 'Jasper Hale',        aliases: ['Jasper'],                               franchise: 'twilight',   gender: 'm' },

  // ── Percy Jackson ────────────────────────────────────────────────────────────
  { name: 'Annabeth Chase',     aliases: ['Annabeth'],                             franchise: 'pjatc',      gender: 'f' },
  { name: 'Thalia Grace',       aliases: ['Thalia'],                               franchise: 'pjatc',      gender: 'f' },
  { name: 'Piper McLean',       aliases: ['Piper'],                                franchise: 'pjatc',      gender: 'f' },
  { name: 'Hazel Levesque',     aliases: ['Hazel'],                                franchise: 'pjatc',      gender: 'f' },
  { name: 'Reyna Avila Ramirez-Arellano', aliases: ['Reyna'],                      franchise: 'pjatc',      gender: 'f' },
  { name: 'Clarisse La Rue',    aliases: ['Clarisse'],                             franchise: 'pjatc',      gender: 'f' },

  { name: 'Percy Jackson',      aliases: ['Percy'],                                franchise: 'pjatc',      gender: 'm' },
  { name: 'Grover Underwood',   aliases: ['Grover'],                               franchise: 'pjatc',      gender: 'm' },
  { name: 'Nico di Angelo',     aliases: ['Nico'],                                 franchise: 'pjatc',      gender: 'm' },
  { name: 'Jason Grace',        aliases: ['Jason'],                                franchise: 'pjatc',      gender: 'm' },
  { name: 'Leo Valdez',         aliases: ['Leo'],                                  franchise: 'pjatc',      gender: 'm' },
  { name: 'Luke Castellan',     aliases: ['Luke'],                                 franchise: 'pjatc',      gender: 'm' },

  // ── Avatar: The Last Airbender / Legend of Korra ────────────────────────────
  { name: 'Katara',             aliases: [],                                        franchise: 'atla',       gender: 'f' },
  { name: 'Toph Beifong',       aliases: ['Toph'],                                 franchise: 'atla',       gender: 'f' },
  { name: 'Azula',              aliases: ['Princess Azula'],                       franchise: 'atla',       gender: 'f' },
  { name: 'Suki',               aliases: [],                                        franchise: 'atla',       gender: 'f' },
  { name: 'Korra',              aliases: ['Avatar Korra'],                         franchise: 'atla',       gender: 'f' },
  { name: 'Asami Sato',         aliases: ['Asami'],                                franchise: 'atla',       gender: 'f' },
  { name: 'Lin Beifong',        aliases: ['Lin'],                                  franchise: 'atla',       gender: 'f' },
  { name: 'Jinora',             aliases: [],                                        franchise: 'atla',       gender: 'f' },

  { name: 'Aang',               aliases: ['Avatar Aang'],                          franchise: 'atla',       gender: 'm' },
  { name: 'Zuko',               aliases: ['Prince Zuko'],                          franchise: 'atla',       gender: 'm' },
  { name: 'Sokka',              aliases: [],                                        franchise: 'atla',       gender: 'm' },
  { name: 'Iroh',               aliases: ['Uncle Iroh', 'General Iroh'],           franchise: 'atla',       gender: 'm' },
  { name: 'Fire Lord Ozai',     aliases: ['Ozai'],                                 franchise: 'atla',       gender: 'm' },
  { name: 'Mako',               aliases: [],                                        franchise: 'atla',       gender: 'm' },
  { name: 'Bolin',              aliases: [],                                        franchise: 'atla',       gender: 'm' },
  { name: 'Tenzin',             aliases: [],                                        franchise: 'atla',       gender: 'm' },

  // ── The Witcher ──────────────────────────────────────────────────────────────
  { name: 'Ciri',               aliases: ['Cirilla', 'Cirilla Fiona Elen Riannon'],franchise: 'witcher',    gender: 'f' },
  { name: 'Yennefer',           aliases: ['Yennefer of Vengerberg'],               franchise: 'witcher',    gender: 'f' },
  { name: 'Triss Merigold',     aliases: ['Triss'],                                franchise: 'witcher',    gender: 'f' },

  { name: 'Geralt of Rivia',    aliases: ['Geralt', 'The Witcher', 'White Wolf'],  franchise: 'witcher',    gender: 'm' },
  { name: 'Jaskier',            aliases: ['Dandelion'],                            franchise: 'witcher',    gender: 'm' },
  { name: 'Vesemir',            aliases: [],                                        franchise: 'witcher',    gender: 'm' },

  // ── Anime — Naruto ───────────────────────────────────────────────────────────
  { name: 'Sakura Haruno',      aliases: ['Sakura'],                               franchise: 'naruto',     gender: 'f' },
  { name: 'Hinata Hyuga',       aliases: ['Hinata'],                               franchise: 'naruto',     gender: 'f' },
  { name: 'Tsunade',            aliases: ['Lady Tsunade'],                         franchise: 'naruto',     gender: 'f' },
  { name: 'Temari',             aliases: [],                                        franchise: 'naruto',     gender: 'f' },
  { name: 'Kushina Uzumaki',    aliases: ['Kushina'],                              franchise: 'naruto',     gender: 'f' },
  { name: 'Konan',              aliases: [],                                        franchise: 'naruto',     gender: 'f' },
  { name: 'Ino Yamanaka',       aliases: ['Ino'],                                  franchise: 'naruto',     gender: 'f' },

  { name: 'Naruto Uzumaki',     aliases: ['Naruto'],                               franchise: 'naruto',     gender: 'm' },
  { name: 'Sasuke Uchiha',      aliases: ['Sasuke'],                               franchise: 'naruto',     gender: 'm' },
  { name: 'Kakashi Hatake',     aliases: ['Kakashi'],                              franchise: 'naruto',     gender: 'm' },
  { name: 'Itachi Uchiha',      aliases: ['Itachi'],                               franchise: 'naruto',     gender: 'm' },
  { name: 'Jiraiya',            aliases: ['Pervy Sage'],                           franchise: 'naruto',     gender: 'm' },
  { name: 'Gaara',              aliases: [],                                        franchise: 'naruto',     gender: 'm' },
  { name: 'Rock Lee',           aliases: [],                                        franchise: 'naruto',     gender: 'm' },
  { name: 'Minato Namikaze',    aliases: ['Minato', 'Yellow Flash'],               franchise: 'naruto',     gender: 'm' },
  { name: 'Madara Uchiha',      aliases: ['Madara'],                               franchise: 'naruto',     gender: 'm' },
  { name: 'Obito Uchiha',       aliases: ['Obito', 'Tobi'],                        franchise: 'naruto',     gender: 'm' },

  // ── Anime — One Piece ────────────────────────────────────────────────────────
  { name: 'Nami',               aliases: [],                                        franchise: 'onepiece',   gender: 'f' },
  { name: 'Nico Robin',         aliases: ['Robin'],                                franchise: 'onepiece',   gender: 'f' },
  { name: 'Nefertari Vivi',     aliases: ['Vivi'],                                 franchise: 'onepiece',   gender: 'f' },
  { name: 'Boa Hancock',        aliases: ['Hancock'],                              franchise: 'onepiece',   gender: 'f' },
  { name: 'Perona',             aliases: [],                                        franchise: 'onepiece',   gender: 'f' },
  { name: 'Big Mom',            aliases: ['Charlotte Linlin'],                     franchise: 'onepiece',   gender: 'f' },

  { name: 'Monkey D. Luffy',    aliases: ['Luffy'],                                franchise: 'onepiece',   gender: 'm' },
  { name: 'Roronoa Zoro',       aliases: ['Zoro'],                                 franchise: 'onepiece',   gender: 'm' },
  { name: 'Sanji',              aliases: ['Vinsmoke Sanji'],                       franchise: 'onepiece',   gender: 'm' },
  { name: 'Usopp',              aliases: ['Sogeking'],                             franchise: 'onepiece',   gender: 'm' },
  { name: 'Tony Tony Chopper',  aliases: ['Chopper'],                              franchise: 'onepiece',   gender: 'm' },
  { name: 'Portgas D. Ace',     aliases: ['Ace'],                                  franchise: 'onepiece',   gender: 'm' },
  { name: 'Trafalgar Law',      aliases: ['Law'],                                  franchise: 'onepiece',   gender: 'm' },
  { name: 'Dracule Mihawk',     aliases: ['Mihawk'],                               franchise: 'onepiece',   gender: 'm' },
  { name: 'Shanks',             aliases: ['Red-Haired Shanks'],                    franchise: 'onepiece',   gender: 'm' },
  { name: 'Whitebeard',         aliases: ['Edward Newgate'],                       franchise: 'onepiece',   gender: 'm' },

  // ── Anime — Attack on Titan ──────────────────────────────────────────────────
  { name: 'Mikasa Ackerman',    aliases: ['Mikasa'],                               franchise: 'aot',        gender: 'f' },
  { name: 'Historia Reiss',     aliases: ['Historia', 'Christa'],                  franchise: 'aot',        gender: 'f' },
  { name: 'Sasha Blouse',       aliases: ['Sasha'],                                franchise: 'aot',        gender: 'f' },
  { name: 'Annie Leonhart',     aliases: ['Annie'],                                franchise: 'aot',        gender: 'f' },
  { name: 'Pieck Finger',       aliases: ['Pieck'],                                franchise: 'aot',        gender: 'f' },
  { name: 'Ymir',               aliases: [],                                        franchise: 'aot',        gender: 'f' },

  { name: 'Eren Yeager',        aliases: ['Eren Yaeger', 'Eren'],                  franchise: 'aot',        gender: 'm' },
  { name: 'Levi Ackerman',      aliases: ['Levi', 'Captain Levi'],                 franchise: 'aot',        gender: 'm' },
  { name: 'Armin Arlert',       aliases: ['Armin'],                                franchise: 'aot',        gender: 'm' },
  { name: 'Erwin Smith',        aliases: ['Erwin'],                                franchise: 'aot',        gender: 'm' },
  { name: 'Reiner Braun',       aliases: ['Reiner'],                               franchise: 'aot',        gender: 'm' },
  { name: 'Zeke Yeager',        aliases: ['Zeke'],                                 franchise: 'aot',        gender: 'm' },

  // ── Anime — My Hero Academia ─────────────────────────────────────────────────
  { name: 'Ochaco Uraraka',     aliases: ['Ochaco', 'Uraraka', 'Uravity'],         franchise: 'mha',        gender: 'f' },
  { name: 'Momo Yaoyorozu',     aliases: ['Momo', 'Creati'],                       franchise: 'mha',        gender: 'f' },
  { name: 'Tsuyu Asui',         aliases: ['Froppy', 'Tsu'],                        franchise: 'mha',        gender: 'f' },
  { name: 'Toga Himiko',        aliases: ['Toga'],                                 franchise: 'mha',        gender: 'f' },
  { name: 'Mina Ashido',        aliases: ['Mina', 'Pinky'],                        franchise: 'mha',        gender: 'f' },
  { name: 'Nejire Hado',        aliases: ['Nejire'],                               franchise: 'mha',        gender: 'f' },

  { name: 'Izuku Midoriya',     aliases: ['Midoriya', 'Deku'],                     franchise: 'mha',        gender: 'm' },
  { name: 'Katsuki Bakugo',     aliases: ['Bakugo', 'Kacchan', 'Dynamight'],       franchise: 'mha',        gender: 'm' },
  { name: 'Shoto Todoroki',     aliases: ['Todoroki', 'Shoto'],                    franchise: 'mha',        gender: 'm' },
  { name: 'All Might',          aliases: ['Toshinori Yagi'],                       franchise: 'mha',        gender: 'm' },
  { name: 'Endeavor',           aliases: ['Enji Todoroki'],                        franchise: 'mha',        gender: 'm' },
  { name: 'Tenya Iida',         aliases: ['Iida', 'Ingenium'],                     franchise: 'mha',        gender: 'm' },

  // ── Anime — Dragon Ball ──────────────────────────────────────────────────────
  { name: 'Bulma',              aliases: ['Bulma Briefs'],                         franchise: 'dragonball',  gender: 'f' },
  { name: 'Chi-Chi',            aliases: ['Chichi'],                               franchise: 'dragonball',  gender: 'f' },
  { name: 'Android 18',         aliases: ['Lazuli'],                               franchise: 'dragonball',  gender: 'f' },
  { name: 'Videl',              aliases: [],                                        franchise: 'dragonball',  gender: 'f' },
  { name: 'Caulifla',           aliases: [],                                        franchise: 'dragonball',  gender: 'f' },

  { name: 'Goku',               aliases: ['Son Goku', 'Kakarot'],                  franchise: 'dragonball',  gender: 'm' },
  { name: 'Vegeta',             aliases: ['Prince Vegeta'],                        franchise: 'dragonball',  gender: 'm' },
  { name: 'Gohan',              aliases: ['Son Gohan'],                            franchise: 'dragonball',  gender: 'm' },
  { name: 'Piccolo',            aliases: [],                                        franchise: 'dragonball',  gender: 'm' },
  { name: 'Frieza',             aliases: ['Freeza'],                               franchise: 'dragonball',  gender: 'm' },
  { name: 'Cell',               aliases: ['Perfect Cell'],                         franchise: 'dragonball',  gender: 'm' },
  { name: 'Majin Buu',          aliases: ['Buu'],                                  franchise: 'dragonball',  gender: 'm' },
  { name: 'Trunks',             aliases: ['Future Trunks'],                        franchise: 'dragonball',  gender: 'm' },
  { name: 'Goten',              aliases: [],                                        franchise: 'dragonball',  gender: 'm' },
  { name: 'Krillin',            aliases: [],                                        franchise: 'dragonball',  gender: 'm' },
  { name: 'Beerus',             aliases: ['God of Destruction Beerus'],            franchise: 'dragonball',  gender: 'm' },

  // ── Anime — Demon Slayer ─────────────────────────────────────────────────────
  { name: 'Nezuko Kamado',      aliases: ['Nezuko'],                               franchise: 'demonslayer', gender: 'f' },
  { name: 'Shinobu Kocho',      aliases: ['Shinobu'],                              franchise: 'demonslayer', gender: 'f' },
  { name: 'Kanao Tsuyuri',      aliases: ['Kanao'],                                franchise: 'demonslayer', gender: 'f' },
  { name: 'Mitsuri Kanroji',    aliases: ['Mitsuri'],                              franchise: 'demonslayer', gender: 'f' },
  { name: 'Daki',               aliases: [],                                        franchise: 'demonslayer', gender: 'f' },

  { name: 'Tanjiro Kamado',     aliases: ['Tanjiro'],                              franchise: 'demonslayer', gender: 'm' },
  { name: 'Zenitsu Agatsuma',   aliases: ['Zenitsu'],                              franchise: 'demonslayer', gender: 'm' },
  { name: 'Inosuke Hashibira',  aliases: ['Inosuke'],                              franchise: 'demonslayer', gender: 'm' },
  { name: 'Giyu Tomioka',       aliases: ['Giyu'],                                 franchise: 'demonslayer', gender: 'm' },
  { name: 'Muzan Kibutsuji',    aliases: ['Muzan'],                                franchise: 'demonslayer', gender: 'm' },
  { name: 'Rengoku',            aliases: ['Kyojuro Rengoku'],                      franchise: 'demonslayer', gender: 'm' },
  { name: 'Tengen Uzui',        aliases: ['Tengen'],                               franchise: 'demonslayer', gender: 'm' },

  // ── Anime — Jujutsu Kaisen ───────────────────────────────────────────────────
  { name: 'Nobara Kugisaki',    aliases: ['Nobara'],                               franchise: 'jjk',        gender: 'f' },
  { name: 'Maki Zen\'in',       aliases: ['Maki'],                                 franchise: 'jjk',        gender: 'f' },
  { name: 'Mei Mei',            aliases: [],                                        franchise: 'jjk',        gender: 'f' },

  { name: 'Yuji Itadori',       aliases: ['Yuji', 'Itadori'],                      franchise: 'jjk',        gender: 'm' },
  { name: 'Megumi Fushiguro',   aliases: ['Megumi', 'Fushiguro'],                  franchise: 'jjk',        gender: 'm' },
  { name: 'Satoru Gojo',        aliases: ['Gojo'],                                 franchise: 'jjk',        gender: 'm' },
  { name: 'Ryomen Sukuna',      aliases: ['Sukuna'],                               franchise: 'jjk',        gender: 'm' },
  { name: 'Suguru Geto',        aliases: ['Geto'],                                 franchise: 'jjk',        gender: 'm' },

  // ── Anime — Sailor Moon ──────────────────────────────────────────────────────
  { name: 'Sailor Moon',        aliases: ['Usagi Tsukino', 'Usagi', 'Serena'],     franchise: 'sailormoon', gender: 'f' },
  { name: 'Sailor Mercury',     aliases: ['Ami Mizuno', 'Ami'],                    franchise: 'sailormoon', gender: 'f' },
  { name: 'Sailor Mars',        aliases: ['Rei Hino', 'Rei'],                      franchise: 'sailormoon', gender: 'f' },
  { name: 'Sailor Jupiter',     aliases: ['Makoto Kino', 'Makoto'],                franchise: 'sailormoon', gender: 'f' },
  { name: 'Sailor Venus',       aliases: ['Minako Aino', 'Minako'],                franchise: 'sailormoon', gender: 'f' },
  { name: 'Sailor Pluto',       aliases: ['Setsuna Meioh'],                        franchise: 'sailormoon', gender: 'f' },
  { name: 'Chibiusa',           aliases: ['Rini', 'Sailor Chibi Moon'],            franchise: 'sailormoon', gender: 'f' },

  // ── Anime — Bleach ───────────────────────────────────────────────────────────
  { name: 'Rukia Kuchiki',      aliases: ['Rukia'],                                franchise: 'bleach',     gender: 'f' },
  { name: 'Orihime Inoue',      aliases: ['Orihime'],                              franchise: 'bleach',     gender: 'f' },
  { name: 'Yoruichi Shihoin',   aliases: ['Yoruichi'],                             franchise: 'bleach',     gender: 'f' },
  { name: 'Rangiku Matsumoto',  aliases: ['Rangiku'],                              franchise: 'bleach',     gender: 'f' },
  { name: 'Nel',                aliases: ['Neliel', 'Neliel Tu Odelschwanck'],     franchise: 'bleach',     gender: 'f' },

  { name: 'Ichigo Kurosaki',    aliases: ['Ichigo'],                               franchise: 'bleach',     gender: 'm' },
  { name: 'Renji Abarai',       aliases: ['Renji'],                                franchise: 'bleach',     gender: 'm' },
  { name: 'Byakuya Kuchiki',    aliases: ['Byakuya'],                              franchise: 'bleach',     gender: 'm' },
  { name: 'Sosuke Aizen',       aliases: ['Aizen'],                                franchise: 'bleach',     gender: 'm' },
  { name: 'Kisuke Urahara',     aliases: ['Urahara'],                              franchise: 'bleach',     gender: 'm' },
  { name: 'Toshiro Hitsugaya',  aliases: ['Hitsugaya'],                            franchise: 'bleach',     gender: 'm' },
  { name: 'Kenpachi Zaraki',    aliases: ['Kenpachi', 'Zaraki'],                   franchise: 'bleach',     gender: 'm' },

  // ── Anime — Fullmetal Alchemist ──────────────────────────────────────────────
  { name: 'Winry Rockbell',     aliases: ['Winry'],                                franchise: 'fma',        gender: 'f' },
  { name: 'Riza Hawkeye',       aliases: ['Riza'],                                 franchise: 'fma',        gender: 'f' },
  { name: 'Olivier Armstrong',  aliases: ['Olivier', 'Olivier Mira Armstrong'],    franchise: 'fma',        gender: 'f' },
  { name: 'Lan Fan',            aliases: [],                                        franchise: 'fma',        gender: 'f' },
  { name: 'Izumi Curtis',       aliases: ['Izumi'],                                franchise: 'fma',        gender: 'f' },
  { name: 'Lust',               aliases: [],                                        franchise: 'fma',        gender: 'f' },

  { name: 'Edward Elric',       aliases: ['Ed'],                                   franchise: 'fma',        gender: 'm' },
  { name: 'Alphonse Elric',     aliases: ['Al', 'Alphonse'],                       franchise: 'fma',        gender: 'm' },
  { name: 'Roy Mustang',        aliases: ['Mustang', 'Flame Alchemist'],           franchise: 'fma',        gender: 'm' },
  { name: 'Greed',              aliases: [],                                        franchise: 'fma',        gender: 'm' },
  { name: 'Envy',               aliases: [],                                        franchise: 'fma',        gender: 'm' },
  { name: 'King Bradley',       aliases: ['Wrath'],                                franchise: 'fma',        gender: 'm' },

  // ── Anime — Evangelion ───────────────────────────────────────────────────────
  { name: 'Asuka Langley Soryu', aliases: ['Asuka Langley', 'Asuka Langley Shikinami'], franchise: 'evangelion', gender: 'f' },
  { name: 'Rei Ayanami',        aliases: ['Rei'],                                  franchise: 'evangelion', gender: 'f' },
  { name: 'Misato Katsuragi',   aliases: ['Misato'],                               franchise: 'evangelion', gender: 'f' },
  { name: 'Ritsuko Akagi',      aliases: ['Ritsuko'],                              franchise: 'evangelion', gender: 'f' },
  { name: 'Mari Makinami',      aliases: ['Mari'],                                 franchise: 'evangelion', gender: 'f' },

  { name: 'Shinji Ikari',       aliases: ['Shinji'],                               franchise: 'evangelion', gender: 'm' },
  { name: 'Kaworu Nagisa',      aliases: ['Kaworu'],                               franchise: 'evangelion', gender: 'm' },

  // ── Anime — Re:Zero ──────────────────────────────────────────────────────────
  { name: 'Rem',                aliases: [],                                        franchise: 'rezero',     gender: 'f' },
  { name: 'Ram',                aliases: [],                                        franchise: 'rezero',     gender: 'f' },
  { name: 'Emilia',             aliases: [],                                        franchise: 'rezero',     gender: 'f' },
  { name: 'Beatrice',           aliases: [],                                        franchise: 'rezero',     gender: 'f' },
  { name: 'Echidna',            aliases: ['Witch of Greed'],                       franchise: 'rezero',     gender: 'f' },

  { name: 'Subaru Natsuki',     aliases: ['Subaru'],                               franchise: 'rezero',     gender: 'm' },

  // ── Anime — Fairy Tail ───────────────────────────────────────────────────────
  { name: 'Lucy Heartfilia',    aliases: ['Lucy'],                                 franchise: 'fairytail',  gender: 'f' },
  { name: 'Erza Scarlet',       aliases: ['Erza'],                                 franchise: 'fairytail',  gender: 'f' },
  { name: 'Wendy Marvell',      aliases: ['Wendy'],                                franchise: 'fairytail',  gender: 'f' },
  { name: 'Mirajane Strauss',   aliases: ['Mirajane'],                             franchise: 'fairytail',  gender: 'f' },

  { name: 'Natsu Dragneel',     aliases: ['Natsu'],                                franchise: 'fairytail',  gender: 'm' },
  { name: 'Gray Fullbuster',    aliases: ['Gray'],                                 franchise: 'fairytail',  gender: 'm' },
  { name: 'Jellal Fernandes',   aliases: ['Jellal'],                               franchise: 'fairytail',  gender: 'm' },
  { name: 'Gildarts Clive',     aliases: ['Gildarts'],                             franchise: 'fairytail',  gender: 'm' },

  // ── Anime — Other ────────────────────────────────────────────────────────────
  { name: 'Ryuko Matoi',        aliases: ['Ryuko'],                                franchise: 'killakill',  gender: 'f' },
  { name: 'Satsuki Kiryuin',    aliases: ['Satsuki'],                              franchise: 'killakill',  gender: 'f' },
  { name: 'Nui Harime',         aliases: ['Nui'],                                  franchise: 'killakill',  gender: 'f' },
  { name: 'Megumin',            aliases: [],                                        franchise: 'konosuba',   gender: 'f' },
  { name: 'Aqua',               aliases: [],                                        franchise: 'konosuba',   gender: 'f' },
  { name: 'Darkness',           aliases: ['Lalatina'],                             franchise: 'konosuba',   gender: 'f' },
  { name: 'Inori Yuzuriha',     aliases: ['Inori'],                                franchise: 'guiltycrown',gender: 'f' },
  { name: 'Albedo',             aliases: [],                                        franchise: 'overlord',   gender: 'f' },
  { name: 'Shalltear Bloodfallen', aliases: ['Shalltear'],                         franchise: 'overlord',   gender: 'f' },
  { name: 'Zero Two',           aliases: ['002'],                                  franchise: 'darlifra',   gender: 'f' },
  { name: 'Chihiro Ogino',      aliases: ['Chihiro', 'Sen'],                       franchise: 'ghibli',     gender: 'f' },
  { name: 'Sophie Hatter',      aliases: ['Sophie'],                               franchise: 'ghibli',     gender: 'f' },
  { name: 'Nausicaa',           aliases: [],                                        franchise: 'ghibli',     gender: 'f' },
  { name: 'Kiki',               aliases: [],                                        franchise: 'ghibli',     gender: 'f' },
  { name: 'San',                aliases: ['Princess Mononoke', 'Mononoke'],        franchise: 'ghibli',     gender: 'f' },
  { name: 'Artoria Pendragon',  aliases: ['Saber', 'Arturia'],                     franchise: 'fate',       gender: 'f' },
  { name: 'Rin Tohsaka',        aliases: ['Rin'],                                  franchise: 'fate',       gender: 'f' },
  { name: 'Sakura Matou',       aliases: ['Sakura'],                               franchise: 'fate',       gender: 'f' },
  { name: 'Violet Evergarden',  aliases: ['Violet'],                               franchise: 'anime',      gender: 'f' },
  { name: 'Yor Forger',         aliases: ['Yor'],                                  franchise: 'spyfamily',  gender: 'f' },
  { name: 'Anya Forger',        aliases: ['Anya'],                                 franchise: 'spyfamily',  gender: 'f' },
  { name: 'Fubuki',             aliases: ['Blizzard of Hell'],                     franchise: 'opm',        gender: 'f' },
  { name: 'Tatsumaki',          aliases: ['Tornado of Terror'],                    franchise: 'opm',        gender: 'f' },
  { name: 'Raphtalia',          aliases: [],                                        franchise: 'shieldhero', gender: 'f' },
  { name: 'Myne',               aliases: ['Malty', 'Bitch Princess'],              franchise: 'shieldhero', gender: 'f' },
  { name: 'Darkness',           aliases: ['Lalatina'],                             franchise: 'konosuba',   gender: 'f' },
  { name: 'Toga Himiko',        aliases: ['Toga'],                                 franchise: 'mha',        gender: 'f' },
  { name: 'Revy',               aliases: ['Rebecca Lee'],                          franchise: 'blacklagoon', gender: 'f' },

  { name: 'Light Yagami',       aliases: ['Light', 'Kira'],                        franchise: 'deathnote',  gender: 'm' },
  { name: 'L',                  aliases: ['Lawliet', 'L Lawliet'],                 franchise: 'deathnote',  gender: 'm' },
  { name: 'Near',               aliases: [],                                        franchise: 'deathnote',  gender: 'm' },
  { name: 'Saitama',            aliases: ['One Punch Man'],                        franchise: 'opm',        gender: 'm' },
  { name: 'Genos',              aliases: ['Demon Cyborg'],                         franchise: 'opm',        gender: 'm' },
  { name: 'Spike Spiegel',      aliases: ['Spike'],                                franchise: 'cowboybebop',gender: 'm' },
  { name: 'Lelouch vi Britannia', aliases: ['Lelouch', 'Zero'],                    franchise: 'codegeass',  gender: 'm' },
  { name: 'Simon',              aliases: [],                                        franchise: 'gurrenn',    gender: 'm' },
  { name: 'Kamina',             aliases: [],                                        franchise: 'gurrenn',    gender: 'm' },
  { name: 'Kirito',             aliases: ['Kazuto Kirigaya'],                      franchise: 'sao',        gender: 'm' },
  { name: 'Loid Forger',        aliases: ['Loid'],                                 franchise: 'spyfamily',  gender: 'm' },
  { name: 'Gintoki Sakata',     aliases: ['Gintoki'],                              franchise: 'gintama',    gender: 'm' },

  // ── Video Games — Street Fighter ─────────────────────────────────────────────
  { name: 'Chun-Li',            aliases: ['Chun Li'],                              franchise: 'sf',         gender: 'f' },
  { name: 'Cammy White',        aliases: ['Cammy'],                                franchise: 'sf',         gender: 'f' },
  { name: 'Sakura Kasugano',    aliases: ['Sakura'],                               franchise: 'sf',         gender: 'f' },
  { name: 'Rose',               aliases: [],                                        franchise: 'sf',         gender: 'f' },
  { name: 'Juri Han',           aliases: ['Juri'],                                 franchise: 'sf',         gender: 'f' },
  { name: 'Ibuki',              aliases: [],                                        franchise: 'sf',         gender: 'f' },
  { name: 'Karin Kanzuki',      aliases: ['Karin'],                                franchise: 'sf',         gender: 'f' },
  { name: 'Rainbow Mika',       aliases: ['R. Mika'],                              franchise: 'sf',         gender: 'f' },
  { name: 'Menat',              aliases: [],                                        franchise: 'sf',         gender: 'f' },
  { name: 'Elena',              aliases: [],                                        franchise: 'sf',         gender: 'f' },
  { name: 'Makoto',             aliases: [],                                        franchise: 'sf',         gender: 'f' },
  { name: 'Laura Matsuda',      aliases: ['Laura'],                                franchise: 'sf',         gender: 'f' },
  { name: 'Lily',               aliases: ['Thunderfoot'],                          franchise: 'sf',         gender: 'f' },
  { name: 'Marisa',             aliases: [],                                        franchise: 'sf',         gender: 'f' },
  { name: 'Manon',              aliases: [],                                        franchise: 'sf',         gender: 'f' },

  { name: 'Ryu',                aliases: [],                                        franchise: 'sf',         gender: 'm' },
  { name: 'Ken Masters',        aliases: ['Ken'],                                   franchise: 'sf',         gender: 'm' },
  { name: 'Akuma',              aliases: ['Gouki'],                                franchise: 'sf',         gender: 'm' },
  { name: 'M. Bison',           aliases: ['Bison', 'Dictator'],                    franchise: 'sf',         gender: 'm' },
  { name: 'Guile',              aliases: [],                                        franchise: 'sf',         gender: 'm' },
  { name: 'Zangief',            aliases: ['Red Cyclone'],                          franchise: 'sf',         gender: 'm' },
  { name: 'Dhalsim',            aliases: [],                                        franchise: 'sf',         gender: 'm' },
  { name: 'Blanka',             aliases: [],                                        franchise: 'sf',         gender: 'm' },
  { name: 'Balrog',             aliases: ['Boxer'],                                franchise: 'sf',         gender: 'm' },
  { name: 'Vega',               aliases: ['Claw'],                                 franchise: 'sf',         gender: 'm' },
  { name: 'Sagat',              aliases: [],                                        franchise: 'sf',         gender: 'm' },
  { name: 'Dan Hibiki',         aliases: ['Dan'],                                  franchise: 'sf',         gender: 'm' },
  { name: 'Rashid',             aliases: [],                                        franchise: 'sf',         gender: 'm' },
  { name: 'Luke Sullivan',      aliases: [],                                        franchise: 'sf',         gender: 'm' },

  // ── Video Games — Mortal Kombat ──────────────────────────────────────────────
  { name: 'Sonya Blade',        aliases: ['Sonya'],                                franchise: 'mk',         gender: 'f' },
  { name: 'Kitana',             aliases: ['Princess Kitana'],                      franchise: 'mk',         gender: 'f' },
  { name: 'Mileena',            aliases: [],                                        franchise: 'mk',         gender: 'f' },
  { name: 'Jade',               aliases: [],                                        franchise: 'mk',         gender: 'f' },
  { name: 'Cassie Cage',        aliases: ['Cassie'],                               franchise: 'mk',         gender: 'f' },
  { name: 'Sindel',             aliases: ['Queen Sindel'],                         franchise: 'mk',         gender: 'f' },
  { name: 'Skarlet',            aliases: [],                                        franchise: 'mk',         gender: 'f' },
  { name: 'Jacqui Briggs',      aliases: ['Jacqui'],                               franchise: 'mk',         gender: 'f' },
  { name: 'Cetrion',            aliases: [],                                        franchise: 'mk',         gender: 'f' },
  { name: 'Frost',              aliases: [],                                        franchise: 'mk',         gender: 'f' },
  { name: 'Nitara',             aliases: [],                                        franchise: 'mk',         gender: 'f' },

  { name: 'Scorpion',           aliases: ['Hanzo Hasashi'],                        franchise: 'mk',         gender: 'm' },
  { name: 'Sub-Zero',           aliases: ['Bi-Han', 'Kuai Liang'],                 franchise: 'mk',         gender: 'm' },
  { name: 'Liu Kang',           aliases: ['Liu Kang'],                             franchise: 'mk',         gender: 'm' },
  { name: 'Raiden',             aliases: ['Thunder God'],                          franchise: 'mk',         gender: 'm' },
  { name: 'Shao Kahn',          aliases: [],                                        franchise: 'mk',         gender: 'm' },
  { name: 'Johnny Cage',        aliases: ['Johnny'],                               franchise: 'mk',         gender: 'm' },
  { name: 'Kano',               aliases: [],                                        franchise: 'mk',         gender: 'm' },
  { name: 'Noob Saibot',        aliases: ['Noob'],                                 franchise: 'mk',         gender: 'm' },
  { name: 'Ermac',              aliases: [],                                        franchise: 'mk',         gender: 'm' },
  { name: 'Baraka',             aliases: [],                                        franchise: 'mk',         gender: 'm' },
  { name: 'Reptile',            aliases: [],                                        franchise: 'mk',         gender: 'm' },
  { name: 'Shang Tsung',        aliases: [],                                        franchise: 'mk',         gender: 'm' },
  { name: 'Goro',               aliases: [],                                        franchise: 'mk',         gender: 'm' },
  { name: 'Kung Lao',           aliases: [],                                        franchise: 'mk',         gender: 'm' },

  // ── Video Games — Final Fantasy ──────────────────────────────────────────────
  { name: 'Terra Branford',     aliases: ['Terra'],                                franchise: 'ff',         gender: 'f' },
  { name: 'Celes Chere',        aliases: ['Celes'],                                franchise: 'ff',         gender: 'f' },
  { name: 'Aerith Gainsborough', aliases: ['Aerith', 'Aeris'],                     franchise: 'ff',         gender: 'f' },
  { name: 'Tifa Lockhart',      aliases: ['Tifa'],                                 franchise: 'ff',         gender: 'f' },
  { name: 'Yuffie Kisaragi',    aliases: ['Yuffie'],                               franchise: 'ff',         gender: 'f' },
  { name: 'Rinoa Heartilly',    aliases: ['Rinoa'],                                franchise: 'ff',         gender: 'f' },
  { name: 'Garnet',             aliases: ['Dagger', 'Princess Garnet', 'Dagger til Alexandros'], franchise: 'ff', gender: 'f' },
  { name: 'Yuna',               aliases: [],                                        franchise: 'ff',         gender: 'f' },
  { name: 'Lulu',               aliases: [],                                        franchise: 'ff',         gender: 'f' },
  { name: 'Rikku',              aliases: [],                                        franchise: 'ff',         gender: 'f' },
  { name: 'Paine',              aliases: [],                                        franchise: 'ff',         gender: 'f' },
  { name: 'Ashe',               aliases: ['Ashelia B\'nargin Dalmasca'],           franchise: 'ff',         gender: 'f' },
  { name: 'Lightning',          aliases: ['Claire Farron'],                        franchise: 'ff',         gender: 'f' },
  { name: 'Serah Farron',       aliases: ['Serah'],                                franchise: 'ff',         gender: 'f' },
  { name: 'Lunafreya',          aliases: ['Luna', 'Lunafreya Nox Fleuret'],        franchise: 'ff',         gender: 'f' },
  { name: 'Freya Crescent',     aliases: ['Freya'],                                franchise: 'ff',         gender: 'f' },

  { name: 'Cloud Strife',       aliases: ['Cloud'],                                franchise: 'ff',         gender: 'm' },
  { name: 'Sephiroth',          aliases: ['One-Winged Angel'],                     franchise: 'ff',         gender: 'm' },
  { name: 'Tidus',              aliases: [],                                        franchise: 'ff',         gender: 'm' },
  { name: 'Zidane Tribal',      aliases: ['Zidane'],                               franchise: 'ff',         gender: 'm' },
  { name: 'Squall Leonhart',    aliases: ['Squall', 'Leon'],                       franchise: 'ff',         gender: 'm' },
  { name: 'Noctis Lucis Caelum', aliases: ['Noctis', 'Noct'],                      franchise: 'ff',         gender: 'm' },
  { name: 'Cecil Harvey',       aliases: ['Cecil'],                                franchise: 'ff',         gender: 'm' },
  { name: 'Kefka Palazzo',      aliases: ['Kefka'],                                franchise: 'ff',         gender: 'm' },
  { name: 'Auron',              aliases: [],                                        franchise: 'ff',         gender: 'm' },
  { name: 'Zack Fair',          aliases: ['Zack'],                                 franchise: 'ff',         gender: 'm' },

  // ── Video Games — Other ──────────────────────────────────────────────────────
  { name: 'Lara Croft',         aliases: ['Lara'],                                 franchise: 'tombraider', gender: 'f' },
  { name: 'Samus Aran',         aliases: ['Samus'],                                franchise: 'metroid',    gender: 'f' },
  { name: 'Chell',              aliases: [],                                        franchise: 'portal',     gender: 'f' },
  { name: 'GLaDOS',             aliases: ['Glados'],                               franchise: 'portal',     gender: 'f' },
  { name: '2B',                 aliases: ['YoRHa No.2 Type B'],                    franchise: 'nier',       gender: 'f' },
  { name: 'A2',                 aliases: [],                                        franchise: 'nier',       gender: 'f' },
  { name: 'Jill Valentine',     aliases: ['Jill'],                                 franchise: 're',         gender: 'f' },
  { name: 'Claire Redfield',    aliases: ['Claire'],                               franchise: 're',         gender: 'f' },
  { name: 'Ada Wong',           aliases: ['Ada'],                                  franchise: 're',         gender: 'f' },
  { name: 'Lady Dimitrescu',    aliases: ['Alcina Dimitrescu'],                    franchise: 're',         gender: 'f' },
  { name: 'Tracer',             aliases: ['Lena Oxton'],                           franchise: 'overwatch',  gender: 'f' },
  { name: 'Mercy',              aliases: ['Angela Ziegler'],                       franchise: 'overwatch',  gender: 'f' },
  { name: 'Pharah',             aliases: ['Fareeha Amari'],                        franchise: 'overwatch',  gender: 'f' },
  { name: 'Widowmaker',         aliases: ['Amelie Lacroix'],                       franchise: 'overwatch',  gender: 'f' },
  { name: 'D.Va',               aliases: ['Hana Song'],                            franchise: 'overwatch',  gender: 'f' },
  { name: 'Sombra',             aliases: ['Olivia Colomar'],                       franchise: 'overwatch',  gender: 'f' },
  { name: 'Symmetra',           aliases: ['Satya Vaswani'],                        franchise: 'overwatch',  gender: 'f' },
  { name: 'Kairi',              aliases: [],                                        franchise: 'kh',         gender: 'f' },
  { name: 'Xion',               aliases: [],                                        franchise: 'kh',         gender: 'f' },
  { name: 'Aqua',               aliases: [],                                        franchise: 'kh',         gender: 'f' },
  { name: 'Pyra',               aliases: ['Mythra'],                               franchise: 'xenoblade',  gender: 'f' },
  { name: 'Nia',                aliases: [],                                        franchise: 'xenoblade',  gender: 'f' },
  { name: 'Bayonetta',          aliases: [],                                        franchise: 'bayonetta',  gender: 'f' },
  { name: 'Princess Zelda',     aliases: ['Zelda'],                                franchise: 'zelda',      gender: 'f' },
  { name: 'Impa',               aliases: [],                                        franchise: 'zelda',      gender: 'f' },
  { name: 'Urbosa',             aliases: [],                                        franchise: 'zelda',      gender: 'f' },
  { name: 'Trish',              aliases: [],                                        franchise: 'dmc',        gender: 'f' },
  { name: 'Lady',               aliases: ['Mary', 'Devil Hunter Lady'],            franchise: 'dmc',        gender: 'f' },
  { name: 'Lifeweaver',         aliases: [],                                        franchise: 'overwatch',  gender: 'm' },
  { name: 'Ellie',              aliases: ['Ellie Williams'],                       franchise: 'tlou',       gender: 'f' },
  { name: 'Abby',               aliases: [],                                        franchise: 'tlou',       gender: 'f' },
  { name: 'Aloy',               aliases: [],                                        franchise: 'horizon',    gender: 'f' },
  { name: 'Quiet',              aliases: [],                                        franchise: 'mgs',        gender: 'f' },
  { name: 'Misty',              aliases: ['Kasumi'],                               franchise: 'pokemon',    gender: 'f' },
  { name: 'May',                aliases: ['Haruka'],                               franchise: 'pokemon',    gender: 'f' },
  { name: 'Dawn',               aliases: ['Hikari'],                               franchise: 'pokemon',    gender: 'f' },
  { name: 'Cynthia',            aliases: [],                                        franchise: 'pokemon',    gender: 'f' },
  { name: 'Jessie',             aliases: ['Musashi'],                              franchise: 'pokemon',    gender: 'f' },
  { name: 'Wraith',             aliases: ['Renee Blasey'],                         franchise: 'apex',       gender: 'f' },
  { name: 'Lifeline',           aliases: ['Ajay Che'],                             franchise: 'apex',       gender: 'f' },
  { name: 'Loba',               aliases: ['Loba Andrade'],                         franchise: 'apex',       gender: 'f' },
  { name: 'Horizon',            aliases: ['Dr. Mary Somers'],                      franchise: 'apex',       gender: 'f' },
  { name: 'Valkyrie',           aliases: ['Kairi Imahara'],                        franchise: 'apex',       gender: 'f' },
  { name: 'Ash',                aliases: [],                                        franchise: 'apex',       gender: 'f' },
  { name: 'Sage',               aliases: [],                                        franchise: 'valorant',   gender: 'f' },
  { name: 'Jett',               aliases: [],                                        franchise: 'valorant',   gender: 'f' },
  { name: 'Reyna',              aliases: [],                                        franchise: 'valorant',   gender: 'f' },
  { name: 'Viper',              aliases: [],                                        franchise: 'valorant',   gender: 'f' },
  { name: 'Killjoy',            aliases: [],                                        franchise: 'valorant',   gender: 'f' },
  { name: 'Neon',               aliases: [],                                        franchise: 'valorant',   gender: 'f' },
  { name: 'Skye',               aliases: [],                                        franchise: 'valorant',   gender: 'f' },
  { name: 'Fade',               aliases: [],                                        franchise: 'valorant',   gender: 'f' },
  { name: 'Astra',              aliases: [],                                        franchise: 'valorant',   gender: 'f' },
  { name: 'Seraphine',          aliases: [],                                        franchise: 'valorant',   gender: 'f' },
  { name: 'Amber',              aliases: [],                                        franchise: 'genshin',    gender: 'f' },
  { name: 'Lisa',               aliases: [],                                        franchise: 'genshin',    gender: 'f' },
  { name: 'Jean',               aliases: [],                                        franchise: 'genshin',    gender: 'f' },
  { name: 'Barbara',            aliases: [],                                        franchise: 'genshin',    gender: 'f' },
  { name: 'Fischl',             aliases: ['Amy'],                                  franchise: 'genshin',    gender: 'f' },
  { name: 'Keqing',             aliases: [],                                        franchise: 'genshin',    gender: 'f' },
  { name: 'Ganyu',              aliases: [],                                        franchise: 'genshin',    gender: 'f' },
  { name: 'Hu Tao',             aliases: [],                                        franchise: 'genshin',    gender: 'f' },
  { name: 'Raiden Shogun',      aliases: ['Ei', 'Baal'],                           franchise: 'genshin',    gender: 'f' },
  { name: 'Lumine',             aliases: [],                                        franchise: 'genshin',    gender: 'f' },
  { name: 'Eula',               aliases: ['Eula Lawrence'],                        franchise: 'genshin',    gender: 'f' },
  { name: 'Yoimiya',            aliases: [],                                        franchise: 'genshin',    gender: 'f' },
  { name: 'Sangonomiya Kokomi', aliases: ['Kokomi'],                               franchise: 'genshin',    gender: 'f' },
  { name: 'Noelle',             aliases: [],                                        franchise: 'genshin',    gender: 'f' },

  { name: 'Mario',              aliases: ['Super Mario'],                          franchise: 'nintendo',   gender: 'm' },
  { name: 'Luigi',              aliases: [],                                        franchise: 'nintendo',   gender: 'm' },
  { name: 'Link',               aliases: [],                                        franchise: 'zelda',      gender: 'm' },
  { name: 'Ganondorf',          aliases: ['Ganon'],                                franchise: 'zelda',      gender: 'm' },
  { name: 'Sonic the Hedgehog', aliases: ['Sonic'],                                franchise: 'sonic',      gender: 'm' },
  { name: 'Shadow the Hedgehog', aliases: ['Shadow'],                              franchise: 'sonic',      gender: 'm' },
  { name: 'Knuckles',           aliases: ['Knuckles the Echidna'],                 franchise: 'sonic',      gender: 'm' },
  { name: 'Tails',              aliases: ['Miles Prower'],                         franchise: 'sonic',      gender: 'm' },
  { name: 'Kratos',             aliases: ['Ghost of Sparta'],                      franchise: 'gow',        gender: 'm' },
  { name: 'Atreus',             aliases: [],                                        franchise: 'gow',        gender: 'm' },
  { name: 'Joel Miller',        aliases: ['Joel'],                                 franchise: 'tlou',       gender: 'm' },
  { name: 'Nathan Drake',       aliases: ['Nate'],                                 franchise: 'uncharted',  gender: 'm' },
  { name: 'Solid Snake',        aliases: ['Snake', 'Big Boss'],                    franchise: 'mgs',        gender: 'm' },
  { name: 'Dante',              aliases: [],                                        franchise: 'dmc',        gender: 'm' },
  { name: 'Vergil',             aliases: [],                                        franchise: 'dmc',        gender: 'm' },
  { name: 'Leon Kennedy',       aliases: ['Leon S. Kennedy', 'Leon'],              franchise: 're',         gender: 'm' },
  { name: 'Chris Redfield',     aliases: ['Chris'],                                franchise: 're',         gender: 'm' },
  { name: 'Arthur Morgan',      aliases: ['Arthur'],                               franchise: 'rdr',        gender: 'm' },
  { name: 'John Marston',       aliases: ['John'],                                 franchise: 'rdr',        gender: 'm' },
  { name: 'Master Chief',       aliases: ['John-117'],                             franchise: 'halo',       gender: 'm' },
  { name: 'Alucard',            aliases: [],                                        franchise: 'castlevania',gender: 'm' },
  { name: 'Sora',               aliases: [],                                        franchise: 'kh',         gender: 'm' },
  { name: 'Riku',               aliases: [],                                        franchise: 'kh',         gender: 'm' },
  { name: 'Axel',               aliases: ['Lea'],                                  franchise: 'kh',         gender: 'm' },
  { name: 'Corvo Attano',       aliases: ['Corvo'],                                franchise: 'dishonored', gender: 'm' },
  { name: 'Marcus Fenix',       aliases: ['Marcus'],                               franchise: 'gears',      gender: 'm' },
  { name: 'Gordon Freeman',     aliases: ['Freeman'],                              franchise: 'halflife',   gender: 'm' },
  { name: 'Ezio Auditore',      aliases: ['Ezio'],                                 franchise: 'ac',         gender: 'm' },
  { name: 'Altair Ibn-La\'Ahad', aliases: ['Altair'],                              franchise: 'ac',         gender: 'm' },
  { name: 'Geralt',             aliases: ['Geralt of Rivia'],                      franchise: 'witcher',    gender: 'm' },
  { name: 'Shepard',            aliases: ['Commander Shepard'],                    franchise: 'masseffect', gender: 'm' },
  { name: 'Garrus Vakarian',    aliases: ['Garrus'],                               franchise: 'masseffect', gender: 'm' },

  // ── Movies ───────────────────────────────────────────────────────────────────
  { name: 'Ellen Ripley',       aliases: ['Ripley'],                               franchise: 'alien',      gender: 'f' },
  { name: 'Sarah Connor',       aliases: ['Sarah'],                                franchise: 'terminator', gender: 'f' },
  { name: 'Trinity',            aliases: [],                                        franchise: 'matrix',     gender: 'f' },
  { name: 'Clarice Starling',   aliases: ['Clarice'],                              franchise: 'silenceofthelambs', gender: 'f' },
  { name: 'Mia Wallace',        aliases: ['Mia'],                                  franchise: 'pulpfiction', gender: 'f' },
  { name: 'Beatrix Kiddo',      aliases: ['The Bride', 'Black Mamba'],             franchise: 'killbill',   gender: 'f' },
  { name: 'Holly Golightly',    aliases: ['Holly'],                                franchise: 'breakfastattiffanys', gender: 'f' },
  { name: 'Elle Woods',         aliases: [],                                        franchise: 'legallyblonde', gender: 'f' },
  { name: 'Cher Horowitz',      aliases: ['Cher'],                                 franchise: 'clueless',   gender: 'f' },
  { name: 'Matilda Wormwood',   aliases: ['Matilda'],                              franchise: 'matilda',    gender: 'f' },
  { name: 'Juno MacGuff',       aliases: ['Juno'],                                 franchise: 'juno',       gender: 'f' },
  { name: 'Vivian Ward',        aliases: ['Vivian'],                               franchise: 'prettywoman', gender: 'f' },
  { name: 'Cady Heron',         aliases: ['Cady'],                                 franchise: 'meangirls',  gender: 'f' },
  { name: 'Regina George',      aliases: ['Regina'],                               franchise: 'meangirls',  gender: 'f' },
  { name: 'Karenina',           aliases: ['Anna Karenina'],                        franchise: 'literature', gender: 'f' },
  { name: 'Thelma Dickinson',   aliases: ['Thelma'],                               franchise: 'thelmaandlouise', gender: 'f' },
  { name: 'Louise Sawyer',      aliases: ['Louise'],                               franchise: 'thelmaandlouise', gender: 'f' },
  { name: 'Dorothy Gale',       aliases: ['Dorothy'],                              franchise: 'wizardofoz',  gender: 'f' },
  { name: 'Glinda',             aliases: ['Glinda the Good Witch'],                franchise: 'wizardofoz',  gender: 'f' },
  { name: 'Sandy Olsson',       aliases: ['Sandy'],                                franchise: 'grease',     gender: 'f' },
  { name: 'Rose DeWitt Bukater', aliases: ['Rose'],                                franchise: 'titanic',    gender: 'f' },
  { name: 'Katniss',            aliases: ['Katniss Everdeen'],                     franchise: 'hungergames',gender: 'f' },
  { name: 'Amy Dunne',          aliases: ['Amy'],                                  franchise: 'gonegirl',   gender: 'f' },
  { name: 'Lisbeth Salander',   aliases: ['Lisbeth'],                              franchise: 'girltattoo', gender: 'f' },

  { name: 'Indiana Jones',      aliases: ['Indy'],                                 franchise: 'indianajones', gender: 'm' },
  { name: 'James Bond',         aliases: ['007', 'Bond'],                          franchise: 'jamesbond',  gender: 'm' },
  { name: 'John McClane',       aliases: ['McClane'],                              franchise: 'diehard',    gender: 'm' },
  { name: 'Forrest Gump',       aliases: ['Forrest'],                              franchise: 'forrestgump', gender: 'm' },
  { name: 'Tony Montana',       aliases: ['Tony'],                                 franchise: 'scarface',   gender: 'm' },
  { name: 'Vito Corleone',      aliases: ['The Godfather', 'Don Corleone'],        franchise: 'godfather',  gender: 'm' },
  { name: 'Michael Corleone',   aliases: ['Michael'],                              franchise: 'godfather',  gender: 'm' },
  { name: 'Tyler Durden',       aliases: ['Tyler'],                                franchise: 'fightclub',  gender: 'm' },
  { name: 'Jack Torrance',      aliases: ['Jack'],                                 franchise: 'theshining', gender: 'm' },
  { name: 'Hannibal Lecter',    aliases: ['Hannibal'],                             franchise: 'silenceofthelambs', gender: 'm' },
  { name: 'Jason Bourne',       aliases: ['Bourne'],                               franchise: 'bourne',     gender: 'm' },
  { name: 'Ethan Hunt',         aliases: ['Ethan'],                                franchise: 'missionimpossible', gender: 'm' },
  { name: 'Jack Sparrow',       aliases: ['Captain Jack Sparrow'],                 franchise: 'pirates',    gender: 'm' },
  { name: 'Jay Gatsby',         aliases: ['Gatsby'],                               franchise: 'gatsby',     gender: 'm' },
  { name: 'Atticus Finch',      aliases: ['Atticus'],                              franchise: 'tokillamockingbird', gender: 'm' },

  // ── TV Shows ─────────────────────────────────────────────────────────────────
  { name: 'Rachel Green',       aliases: ['Rachel'],                               franchise: 'friends',    gender: 'f' },
  { name: 'Monica Geller',      aliases: ['Monica'],                               franchise: 'friends',    gender: 'f' },
  { name: 'Phoebe Buffay',      aliases: ['Phoebe'],                               franchise: 'friends',    gender: 'f' },
  { name: 'Skyler White',       aliases: ['Skyler'],                               franchise: 'breakingbad', gender: 'f' },
  { name: 'Eleven',             aliases: ['El', 'Jane Hopper', 'Jane'],            franchise: 'strangerthings', gender: 'f' },
  { name: 'Max Mayfield',       aliases: ['Max'],                                  franchise: 'strangerthings', gender: 'f' },
  { name: 'Buffy Summers',      aliases: ['Buffy'],                                franchise: 'buffy',      gender: 'f' },
  { name: 'Willow Rosenberg',   aliases: ['Willow'],                               franchise: 'buffy',      gender: 'f' },
  { name: 'Carrie Bradshaw',    aliases: ['Carrie'],                               franchise: 'satc',       gender: 'f' },
  { name: 'Lorelai Gilmore',    aliases: ['Lorelai'],                              franchise: 'gilmoregirls', gender: 'f' },
  { name: 'Rory Gilmore',       aliases: ['Rory'],                                 franchise: 'gilmoregirls', gender: 'f' },
  { name: 'Carol Peletier',     aliases: ['Carol'],                                franchise: 'walkingdead', gender: 'f' },
  { name: 'Michonne',           aliases: [],                                        franchise: 'walkingdead', gender: 'f' },
  { name: 'Serena van der Woodsen', aliases: ['Serena'],                           franchise: 'gossipgirl', gender: 'f' },
  { name: 'Blair Waldorf',      aliases: ['Blair'],                                franchise: 'gossipgirl', gender: 'f' },
  { name: 'Amy Santiago',       aliases: ['Amy'],                                  franchise: 'b99',        gender: 'f' },
  { name: 'Rosa Diaz',          aliases: ['Rosa'],                                 franchise: 'b99',        gender: 'f' },
  { name: 'Leslie Knope',       aliases: ['Leslie'],                               franchise: 'parksandrec', gender: 'f' },
  { name: 'April Ludgate',      aliases: ['April'],                                franchise: 'parksandrec', gender: 'f' },
  { name: 'Sabrina Spellman',   aliases: ['Sabrina'],                              franchise: 'sabrina',    gender: 'f' },
  { name: 'June Osborne',       aliases: ['Offred', 'June'],                       franchise: 'handmaidstale', gender: 'f' },
  { name: 'Kim Possible',       aliases: ['Kim'],                                  franchise: 'disney',     gender: 'f' },
  { name: 'Shego',              aliases: [],                                        franchise: 'disney',     gender: 'f' },
  { name: 'Bloom',              aliases: [],                                        franchise: 'winxclub',   gender: 'f' },
  { name: 'Blossom',            aliases: [],                                        franchise: 'ppg',        gender: 'f' },
  { name: 'Bubbles',            aliases: [],                                        franchise: 'ppg',        gender: 'f' },
  { name: 'Buttercup',          aliases: [],                                        franchise: 'ppg',        gender: 'f' },
  { name: 'Daphne Blake',       aliases: ['Daphne'],                               franchise: 'scoobydoo',  gender: 'f' },
  { name: 'Velma Dinkley',      aliases: ['Velma'],                                franchise: 'scoobydoo',  gender: 'f' },
  { name: 'Turanga Leela',      aliases: ['Leela'],                                franchise: 'futurama',   gender: 'f' },
  { name: 'Marge Simpson',      aliases: ['Marge'],                                franchise: 'simpsons',   gender: 'f' },
  { name: 'Lisa Simpson',       aliases: ['Lisa'],                                 franchise: 'simpsons',   gender: 'f' },
  { name: 'Lois Griffin',       aliases: ['Lois'],                                 franchise: 'familyguy',  gender: 'f' },
  { name: 'Meg Griffin',        aliases: ['Meg'],                                  franchise: 'familyguy',  gender: 'f' },
  { name: 'Meredith Grey',      aliases: ['Meredith'],                             franchise: 'greysanatomy', gender: 'f' },
  { name: 'Cristina Yang',      aliases: ['Cristina'],                             franchise: 'greysanatomy', gender: 'f' },
  { name: 'Nancy Wheeler',      aliases: ['Nancy'],                                franchise: 'strangerthings', gender: 'f' },
  { name: 'Robin Buckley',      aliases: ['Robin'],                                franchise: 'strangerthings', gender: 'f' },
  { name: 'Pam Beesly',         aliases: ['Pam'],                                  franchise: 'theoffice',  gender: 'f' },
  { name: 'Kelly Kapoor',       aliases: ['Kelly'],                                franchise: 'theoffice',  gender: 'f' },
  { name: 'Angela Martin',      aliases: ['Angela'],                               franchise: 'theoffice',  gender: 'f' },
  { name: 'Robin Scherbatsky',  aliases: [],                                        franchise: 'himym',      gender: 'f' },
  { name: 'Lily Aldrin',        aliases: ['Lily'],                                 franchise: 'himym',      gender: 'f' },
  { name: 'Rue Bennett',        aliases: ['Rue'],                                  franchise: 'euphoria',   gender: 'f' },
  { name: 'Jules Vaughn',       aliases: ['Jules'],                                franchise: 'euphoria',   gender: 'f' },
  { name: 'Cassie Howard',      aliases: ['Cassie'],                               franchise: 'euphoria',   gender: 'f' },
  { name: 'Villanelle',         aliases: ['Oksana Astankova'],                     franchise: 'killingeve',  gender: 'f' },
  { name: 'Eve Polastri',       aliases: ['Eve'],                                  franchise: 'killingeve',  gender: 'f' },
  { name: 'Sydney Bristow',     aliases: ['Sydney'],                               franchise: 'alias',      gender: 'f' },
  { name: 'Xena',               aliases: ['Xena Warrior Princess'],                franchise: 'xena',       gender: 'f' },
  { name: 'Gabrielle',          aliases: [],                                        franchise: 'xena',       gender: 'f' },

  { name: 'Ross Geller',        aliases: ['Ross'],                                 franchise: 'friends',    gender: 'm' },
  { name: 'Joey Tribbiani',     aliases: ['Joey'],                                 franchise: 'friends',    gender: 'm' },
  { name: 'Chandler Bing',      aliases: ['Chandler'],                             franchise: 'friends',    gender: 'm' },
  { name: 'Walter White',       aliases: ['Heisenberg'],                           franchise: 'breakingbad', gender: 'm' },
  { name: 'Jesse Pinkman',      aliases: ['Jesse'],                                franchise: 'breakingbad', gender: 'm' },
  { name: 'Saul Goodman',       aliases: ['Jimmy McGill'],                         franchise: 'breakingbad', gender: 'm' },
  { name: 'Mike Ehrmantraut',   aliases: ['Mike'],                                 franchise: 'breakingbad', gender: 'm' },
  { name: 'Sherlock Holmes',    aliases: ['Sherlock'],                             franchise: 'sherlock',   gender: 'm' },
  { name: 'John Watson',        aliases: ['Watson'],                               franchise: 'sherlock',   gender: 'm' },
  { name: 'Sheldon Cooper',     aliases: ['Sheldon'],                              franchise: 'tbbt',       gender: 'm' },
  { name: 'Tony Soprano',       aliases: ['Tony'],                                 franchise: 'sopranos',   gender: 'm' },
  { name: 'Don Draper',         aliases: ['Don', 'Dick Whitman'],                  franchise: 'madmen',     gender: 'm' },
  { name: 'Dexter Morgan',      aliases: ['Dexter'],                               franchise: 'dexter',     gender: 'm' },
  { name: 'Jack Bauer',         aliases: ['Jack'],                                 franchise: '24',         gender: 'm' },
  { name: 'Michael Scott',      aliases: ['Michael'],                              franchise: 'theoffice',  gender: 'm' },
  { name: 'Dwight Schrute',     aliases: ['Dwight'],                               franchise: 'theoffice',  gender: 'm' },
  { name: 'Jim Halpert',        aliases: ['Jim'],                                  franchise: 'theoffice',  gender: 'm' },
  { name: 'Rick Grimes',        aliases: ['Rick'],                                 franchise: 'walkingdead', gender: 'm' },
  { name: 'Daryl Dixon',        aliases: ['Daryl'],                                franchise: 'walkingdead', gender: 'm' },
  { name: 'Jake Peralta',       aliases: ['Jake'],                                 franchise: 'b99',        gender: 'm' },
  { name: 'Holt',               aliases: ['Raymond Holt', 'Captain Holt'],        franchise: 'b99',        gender: 'm' },
  { name: 'The Doctor',         aliases: ['Doctor Who'],                           franchise: 'doctorwho',  gender: 'm' },
  { name: 'Homer Simpson',      aliases: ['Homer'],                                franchise: 'simpsons',   gender: 'm' },
  { name: 'Bart Simpson',       aliases: ['Bart', 'El Barto'],                     franchise: 'simpsons',   gender: 'm' },
  { name: 'Peter Griffin',      aliases: ['Peter'],                                franchise: 'familyguy',  gender: 'm' },
  { name: 'Stewie Griffin',     aliases: ['Stewie'],                               franchise: 'familyguy',  gender: 'm' },
  { name: 'Fry',                aliases: ['Philip J. Fry'],                        franchise: 'futurama',   gender: 'm' },
  { name: 'Bender',             aliases: ['Bender Rodriguez'],                     franchise: 'futurama',   gender: 'm' },
  { name: 'Ted Mosby',          aliases: ['Ted'],                                  franchise: 'himym',      gender: 'm' },
  { name: 'Marshall Eriksen',   aliases: ['Marshall'],                             franchise: 'himym',      gender: 'm' },
  { name: 'Barney Stinson',     aliases: ['Barney'],                               franchise: 'himym',      gender: 'm' },

  // ── Literature ───────────────────────────────────────────────────────────────
  { name: 'Elizabeth Bennet',   aliases: ['Lizzy', 'Elizabeth'],                   franchise: 'prideandprejudice', gender: 'f' },
  { name: 'Jane Bennet',        aliases: ['Jane'],                                 franchise: 'prideandprejudice', gender: 'f' },
  { name: 'Jane Eyre',          aliases: ['Jane'],                                 franchise: 'janeeyre',   gender: 'f' },
  { name: 'Jo March',           aliases: ['Jo'],                                   franchise: 'littlewomen', gender: 'f' },
  { name: 'Amy March',          aliases: ['Amy'],                                  franchise: 'littlewomen', gender: 'f' },
  { name: 'Meg March',          aliases: ['Meg'],                                  franchise: 'littlewomen', gender: 'f' },
  { name: 'Scarlett O\'Hara',   aliases: ['Scarlett'],                             franchise: 'gonewiththewind', gender: 'f' },
  { name: 'Hester Prynne',      aliases: ['Hester'],                               franchise: 'scarletletter', gender: 'f' },
  { name: 'Emma Woodhouse',     aliases: ['Emma'],                                 franchise: 'emma',       gender: 'f' },
  { name: 'Feyre Archeron',     aliases: ['Feyre'],                                franchise: 'acotar',     gender: 'f' },
  { name: 'Nesta Archeron',     aliases: ['Nesta'],                                franchise: 'acotar',     gender: 'f' },
  { name: 'Tris Prior',         aliases: ['Tris', 'Beatrice Prior'],               franchise: 'divergent',  gender: 'f' },
  { name: 'Clary Fray',         aliases: ['Clary', 'Clarissa Fray'],               franchise: 'shadowhunters', gender: 'f' },
  { name: 'Isabelle Lightwood', aliases: ['Izzy', 'Isabelle'],                     franchise: 'shadowhunters', gender: 'f' },
  { name: 'Lyra Belacqua',      aliases: ['Lyra', 'Lyra Silvertongue'],            franchise: 'hisdarkmaterials', gender: 'f' },
  { name: 'Katniss Everdeen',   aliases: ['Katniss'],                              franchise: 'hungergames',gender: 'f' },

  { name: 'Atticus Finch',      aliases: ['Atticus'],                              franchise: 'tokillamockingbird', gender: 'm' },
  { name: 'Holden Caulfield',   aliases: ['Holden'],                               franchise: 'catcherintherye', gender: 'm' },
  { name: 'Jay Gatsby',         aliases: ['Gatsby'],                               franchise: 'gatsby',     gender: 'm' },
  { name: 'Tom Sawyer',         aliases: ['Tom'],                                  franchise: 'marktain',   gender: 'm' },
  { name: 'Huckleberry Finn',   aliases: ['Huck'],                                 franchise: 'marktain',   gender: 'm' },
  { name: 'Robinson Crusoe',    aliases: ['Crusoe'],                               franchise: 'literature', gender: 'm' },
  { name: 'Sherlock Holmes',    aliases: ['Sherlock'],                             franchise: 'sherlockholmes', gender: 'm' },
  { name: 'Dracula',            aliases: ['Count Dracula'],                        franchise: 'literature', gender: 'm' },
  { name: 'Frankenstein',       aliases: ["Frankenstein's Monster"],               franchise: 'literature', gender: 'm' },
  { name: 'Dorian Gray',        aliases: ['Dorian'],                               franchise: 'literature', gender: 'm' },
  { name: 'Heathcliff',         aliases: [],                                        franchise: 'wutheringheights', gender: 'm' },

];

// ─── Claude game character pipeline ──────────────────────────────────────────

const FICTIONAL_CHARACTER_CATEGORIES = [
  { label: 'action/adventure games',    prompt: 'action and adventure video games (e.g. Zelda, God of War, Tomb Raider, Uncharted, Assassin\'s Creed, Batman Arkham, Devil May Cry, Dishonored, Sekiro)' },
  { label: 'RPG/JRPG games',            prompt: 'RPG and JRPG video games (e.g. Final Fantasy, Persona, Tales of, Dragon Quest, Xenoblade, Fire Emblem, Kingdom Hearts, Nier, Chrono Trigger)' },
  { label: 'fighting games',            prompt: 'fighting video games (e.g. Street Fighter, Mortal Kombat, Tekken, Guilty Gear, BlazBlue, King of Fighters, Smash Bros, Virtua Fighter, Soul Calibur)' },
  { label: 'shooter/FPS games',         prompt: 'shooter and FPS video games (e.g. Halo, Overwatch, Apex Legends, Mass Effect, Borderlands, Doom, Metroid, Titanfall, Destiny, Valorant)' },
  { label: 'platformer/indie games',    prompt: 'platformer and indie video games (e.g. Mario, Sonic, Hollow Knight, Undertale, Cuphead, Shovel Knight, Ori, Celeste, Axiom Verge, Metroidvania games)' },
  { label: 'open-world/sandbox games',  prompt: 'open-world and sandbox video games (e.g. GTA, Red Dead Redemption, Cyberpunk 2077, The Witcher, Elden Ring, Skyrim, Fallout, Horizon, Ghost of Tsushima)' },
  { label: 'MOBA/strategy games',       prompt: 'MOBA, strategy and online games (e.g. League of Legends, Dota 2, Warcraft, StarCraft, Heroes of the Storm, Smite, Battlerite, Paladins)' },
  { label: 'horror/survival games',     prompt: 'horror and survival video games (e.g. Resident Evil, Silent Hill, Dead Space, Outlast, Amnesia, Until Dawn, The Evil Within, Alan Wake, Control)' },
  { label: 'Pokemon characters',        prompt: 'the Pokemon franchise — trainers, gym leaders, Elite Four, Champions, rivals, villains, and major anime characters across all generations' },
  { label: 'anime/manga franchises',    prompt: 'anime and manga franchises (e.g. Naruto, Dragon Ball, One Piece, Attack on Titan, Demon Slayer, Bleach, Jujutsu Kaisen, My Hero Academia, Fullmetal Alchemist, Hunter x Hunter, Fairy Tail, Sword Art Online, Re:Zero, Overlord, One Punch Man)' },
  { label: 'shounen/isekai anime',      prompt: 'shounen and isekai anime (e.g. Black Clover, Seven Deadly Sins, That Time I Got Reincarnated as a Slime, Overlord, KonoSuba, Sword Art Online, Log Horizon, No Game No Life, Mushoku Tensei, Jobless Reincarnation)' },
  { label: 'comic/superhero franchises',prompt: 'comic book and superhero franchises (e.g. Marvel, DC, X-Men, Avengers, Spider-Man, Batman, Superman, Wonder Woman, Teen Titans, Justice League, Fantastic Four, Deadpool)' },
  { label: 'animated TV shows',         prompt: 'animated TV shows and cartoons (e.g. Avatar: The Last Airbender, Family Guy, The Simpsons, Futurama, South Park, Rick and Morty, Gravity Falls, Steven Universe, Adventure Time, Regular Show, Bob\'s Burgers)' },
  { label: 'Disney/Pixar/animated films', prompt: 'Disney, Pixar and other animated film franchises (e.g. Lion King, Frozen, Moana, Tangled, Aladdin, Mulan, The Little Mermaid, Toy Story, Finding Nemo, The Incredibles, Brave, Encanto, Turning Red, Ratatouille)' },
  { label: 'live-action TV shows',      prompt: 'popular live-action TV show characters (e.g. Game of Thrones, Breaking Bad, The Office, Friends, Stranger Things, The Witcher, Peaky Blinders, Sherlock, Doctor Who, Dexter, Sopranos, Mad Men, Better Call Saul, The Boys)' },
  { label: 'film franchises',           prompt: 'major film franchise characters (e.g. Star Wars, Harry Potter, Lord of the Rings, Marvel MCU, DC films, Indiana Jones, James Bond, Mission Impossible, Pirates of the Caribbean, Jurassic Park, The Matrix, Fast & Furious)' },
];

async function getCuratedFictionalCharactersFromClaude(gender) {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.log('No ANTHROPIC_API_KEY — skipping Claude fictional character pipeline');
    return [];
  }

  const genderLabel = gender === 'f' ? 'female' : 'male';
  const all = [];
  const CONCURRENCY = 3;

  console.log(`  Fetching curated ${genderLabel} characters across ${FICTIONAL_CHARACTER_CATEGORIES.length} categories...`);

  for (let i = 0; i < FICTIONAL_CHARACTER_CATEGORIES.length; i += CONCURRENCY) {
    const chunk = FICTIONAL_CHARACTER_CATEGORIES.slice(i, i + CONCURRENCY);
    const chunkResults = await Promise.all(chunk.map(async ({ label, prompt }) => {
      const fullPrompt = `List 100 of the most well-known ${genderLabel} characters from ${prompt}.
Include protagonists, antagonists, and major supporting characters across all titles in these franchises.

Respond ONLY with a JSON array:
[{"name": "Samus Aran", "aliases": ["Samus"], "franchise": "metroid"}]

Rules:
- "name": full canonical character name
- "aliases": common nicknames or short names (can be empty array)
- "franchise": short lowercase franchise key with no spaces

JSON array only, no explanation.`;

      try {
        const res = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'x-api-key': process.env.ANTHROPIC_API_KEY,
            'anthropic-version': '2023-06-01',
            'content-type': 'application/json',
          },
          body: JSON.stringify({
            model: 'claude-haiku-4-5-20251001',
            max_tokens: 4096,
            messages: [{ role: 'user', content: fullPrompt }],
          }),
        });

        const data = await res.json();
        const raw = data.content?.[0]?.text || '[]';
        const text = raw.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
        const items = JSON.parse(text);
        console.log(`  [${label}]: ${items.length} ${genderLabel} characters`);
        return items;
      } catch (err) {
        console.warn(`  [${label}] failed:`, err.message);
        return [];
      }
    }));

    all.push(...chunkResults.flat());
    if (i + CONCURRENCY < FICTIONAL_CHARACTER_CATEGORIES.length) await sleep(8000);
  }

  console.log(`  Claude curated total: ${all.length} ${genderLabel} characters`);
  return all;
}

async function buildFictionalGameAllowlist(gender, outputPath) {
  console.log(`\nBuilding fictional ${gender === 'f' ? 'women' : 'men'} allowlist (game characters)...\n`);

  const entries = [];

  // Popular cross-media characters
  for (const c of POPULAR_FICTIONAL_CHARACTERS.filter(c => c.gender === gender)) {
    entries.push({ name: c.name, aliases: c.aliases, platform: c.franchise, gender, genderSource: 'manual-curation' });
  }
  console.log(`  Cross-media: ${POPULAR_FICTIONAL_CHARACTERS.filter(c => c.gender === gender).length} characters`);

  // Kakegurui
  for (const c of KAKEGURUI_CHARACTERS.filter(c => c.gender === gender)) {
    entries.push({ name: c.name, aliases: c.aliases, platform: 'kakegurui', gender, genderSource: 'manual-curation' });
  }
  console.log(`  Kakegurui: ${KAKEGURUI_CHARACTERS.filter(c => c.gender === gender).length} characters`);

  // Tekken
  for (const c of TEKKEN_CHARACTERS.filter(c => c.gender === gender)) {
    entries.push({ name: c.name, aliases: c.aliases, platform: 'tekken', gender, genderSource: 'manual-curation' });
  }
  console.log(`  Tekken: ${TEKKEN_CHARACTERS.filter(c => c.gender === gender).length} characters`);

  // Skullgirls
  for (const c of SKULLGIRLS_CHARACTERS.filter(c => c.gender === gender)) {
    entries.push({ name: c.name, aliases: c.aliases, platform: 'skullgirls', gender, genderSource: 'manual-curation' });
  }
  console.log(`  Skullgirls: ${SKULLGIRLS_CHARACTERS.filter(c => c.gender === gender).length} characters`);

  // LoL — read from already-built allowlist, filter by gender
  try {
    const lolRaw = await fs.readFile(LOL_OUTPUT_PATH, 'utf8');
    const lolEntries = JSON.parse(lolRaw).filter(e => e.gender === gender);
    for (const c of lolEntries) {
      entries.push({ name: c.name, aliases: c.aliases, platform: 'lol', gender, genderSource: 'manual-curation' });
    }
    console.log(`  LoL: ${lolEntries.length} champions`);
  } catch {
    console.warn('  LoL allowlist not found — run --category lol first');
  }

  // Claude: curated characters across games, anime, comics, film/TV
  const claudeCharacters = await getCuratedFictionalCharactersFromClaude(gender);
  for (const c of claudeCharacters) {
    if (!c.name || !c.franchise) continue;
    entries.push({
      name: c.name,
      aliases: Array.isArray(c.aliases) ? c.aliases : [],
      platform: c.franchise.toLowerCase().replace(/\s+/g, ''),
      gender,
      genderSource: 'claude-curated',
    });
  }

  // Merge with existing allowlist so manually-added entries are preserved
  let existing = [];
  try {
    const raw = await fs.readFile(outputPath, 'utf8');
    existing = JSON.parse(raw);
    console.log(`  Merging with ${existing.length} existing entries...`);
  } catch {
    // File doesn't exist yet — start fresh
  }

  // Existing entries take priority (preserve manual additions).
  // Deduplicate by name+platform so same-name characters from different franchises
  // (e.g. Ashe from FF, LoL, and Overwatch) are all kept as distinct entries.
  const seen = new Set(existing.map(e => `${e.name.toLowerCase()}|${e.platform}`));
  const newEntries = entries.filter(e => !seen.has(`${e.name.toLowerCase()}|${e.platform}`));
  const deduped = [...existing, ...newEntries];

  await fs.writeFile(outputPath, JSON.stringify(deduped, null, 2));
  console.log(`\nWrote ${deduped.length} entries to ${outputPath} (${newEntries.length} new)`);
}

async function buildFictionalWomenAllowlist() {
  await buildFictionalGameAllowlist('f', FICTIONAL_WOMEN_OUTPUT_PATH);
}

async function buildFictionalMenAllowlist() {
  await buildFictionalGameAllowlist('m', FICTIONAL_MEN_OUTPUT_PATH);
}

// ─── Asian streamers — manual seeds ──────────────────────────────────────────
const ASIAN_STREAMER_SEEDS = [
  'supcaitlin',
  'jasontheween',
  'fuslie',
  'hafu',
  'Valkyrae',
  'xChocoBars',
  'Sykkuno',
  'Disguised Toast',
  'LilyPichu',
  '39daph',
  'Kkatamina',
  'Bao',
  'Nihmune',
  'Naeondra',
  'jimmyzhang',
  'Jimmy Zhang',
  'AngelsKimi',
  'Pokimane',    // Moroccan — Gemini will reject
  'Myth',
  'Scarra',
  'bnans',
  'AriaSaki',
  'Kyedae',
  'TenZ',
  'BunnyFufuu',
  'Keeoh',
  'QuarterJade',
  'Masayoshi',
  'PaperRex',
  'Shiphtur',
];

// ─── Claude curated famous Asians (build-time only) ──────────────────────────
const CURATED_CATEGORIES = [
  { label: 'athletes',              prompt: 'professional athletes (Olympics, football, basketball, baseball, tennis, martial arts, esports, etc.)' },
  { label: 'musicians',             prompt: 'musicians, singers, K-pop/J-pop artists, classical musicians, and music producers' },
  { label: 'actors/entertainers',   prompt: 'actors, actresses, comedians, TV hosts, and entertainment personalities' },
  { label: 'artists/illustrators',  prompt: 'visual artists, illustrators, digital artists, animators, and designers' },
  { label: 'business/tech',         prompt: 'business leaders, tech founders, entrepreneurs, and executives' },
  { label: 'politicians/activists', prompt: 'politicians, world leaders, activists, and public intellectuals' },
  { label: 'directors/filmmakers',  prompt: 'film directors, screenwriters, and producers' },
  { label: 'scientists/academics',  prompt: 'scientists, academics, Nobel laureates, and researchers' },
  { label: 'models/influencers',    prompt: 'fashion models, influencers, and social media personalities' },
  { label: 'chefs/food',            prompt: 'celebrity chefs and food personalities' },
];

async function getCuratedFamousAsiansFromClaude() {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.log('No ANTHROPIC_API_KEY — skipping curated Claude pipeline');
    return [];
  }

  const all = [];
  console.log(`  Fetching curated famous Asians across ${CURATED_CATEGORIES.length} categories...`);

  const CONCURRENCY = 3;
  for (let i = 0; i < CURATED_CATEGORIES.length; i += CONCURRENCY) {
    const chunk = CURATED_CATEGORIES.slice(i, i + CONCURRENCY);
    const chunkResults = await Promise.all(chunk.map(async ({ label, prompt }) => {
      const fullPrompt = `List the 50 most famous and widely recognized Asian or Asian-American/diaspora ${prompt}. Include people from any Asian ethnicity (East, South, Southeast Asian) regardless of country of residence.

For each person provide their name and a short description.

Respond ONLY with a JSON array:
[{"name": "...", "description": "..."}]

JSON array only, no explanation.`;

      try {
        const res = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'x-api-key': process.env.ANTHROPIC_API_KEY,
            'anthropic-version': '2023-06-01',
            'content-type': 'application/json',
          },
          body: JSON.stringify({
            model: 'claude-haiku-4-5-20251001',
            max_tokens: 4096,
            messages: [{ role: 'user', content: fullPrompt }],
          }),
        });

        const data = await res.json();
        const raw = data.content?.[0]?.text || '[]';
        const text = raw.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
        const items = JSON.parse(text);
        console.log(`  [${label}]: ${items.length} people`);
        return items.map(item => ({
          name: item.name,
          description: item.description,
          platform: 'famous-asians',
          genderSource: 'claude-curated',
        }));
      } catch (err) {
        console.warn(`  [${label}] failed:`, err.message);
        return [];
      }
    }));

    all.push(...chunkResults.flat());
    if (i + CONCURRENCY < CURATED_CATEGORIES.length) await sleep(500);
  }

  console.log(`  Curated total: ${all.length} people across all categories`);
  return all;
}

// ─── Claude Asian streamer classifier (build-time only) ──────────────────────
async function classifyAsianStreamersWithClaude(candidates) {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.log('No ANTHROPIC_API_KEY — skipping streamer Claude pipeline');
    return [];
  }

  const BATCH_SIZE = 100;
  const BATCH_CONCURRENCY = 3;
  const confirmed = [];

  const batches = [];
  for (let i = 0; i < candidates.length; i += BATCH_SIZE) {
    batches.push(candidates.slice(i, i + BATCH_SIZE));
  }

  console.log(`  ${batches.length} Claude batches of up to ${BATCH_SIZE} names...`);

  for (let i = 0; i < batches.length; i += BATCH_CONCURRENCY) {
    const chunk = batches.slice(i, i + BATCH_CONCURRENCY);
    const chunkResults = await Promise.all(chunk.map(async (batch, chunkIdx) => {
      const batchNum = i + chunkIdx + 1;
      const nameList = batch.map(c => c.name).join('\n');
      const prompt = `You are helping build a dataset of famous Asian streamers and content creators for a trivia game.

Given these streamer/creator display names (which may be Twitch/YouTube usernames or handles), identify which ones are of Asian descent (East Asian, South Asian, or Southeast Asian ethnicity, regardless of nationality or country of residence).
Only include people you are highly confident are Asian. Exclude if unsure or not a real person.

Names (one per line):
${nameList}

Respond ONLY with a JSON array. For each confirmed Asian creator include their name exactly as written and a concise description (e.g. "Vietnamese-American Twitch streamer"). Omit anyone who is not Asian.

Example:
[{"name": "supcaitlin", "description": "Vietnamese-American Twitch streamer"}]

JSON array only, no explanation.`;

      try {
        const res = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'x-api-key': process.env.ANTHROPIC_API_KEY,
            'anthropic-version': '2023-06-01',
            'content-type': 'application/json',
          },
          body: JSON.stringify({
            model: 'claude-haiku-4-5-20251001',
            max_tokens: 2048,
            messages: [{ role: 'user', content: prompt }],
          }),
        });

        const data = await res.json();
        const raw = data.content?.[0]?.text || '[]';
        const text = raw.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
        const items = JSON.parse(text);
        console.log(`  Claude batch ${batchNum}/${batches.length}: ${items.length}/${batch.length} confirmed Asian`);
        return items.map(item => {
          const original = batch.find(c => c.name.toLowerCase() === item.name.toLowerCase());
          return {
            name: item.name,
            description: item.description,
            platform: original?.platform || 'twitch',
            followers: original?.followers || 0,
          };
        });
      } catch (err) {
        console.warn(`  Claude batch ${batchNum}/${batches.length} failed:`, err.message);
        return [];
      }
    }));

    confirmed.push(...chunkResults.flat());
    if (i + BATCH_CONCURRENCY < batches.length) await sleep(500);
  }

  return confirmed;
}

async function buildFamousAsiansAllowlist() {
  console.log('\nBuilding Famous Asians allowlist...\n');

  // ── Step 1: Wikidata SPARQL for public figures ────────────────────────────
  const ASIAN_COUNTRIES = [
    'Q29520', // China
    'Q17',    // Japan
    'Q884',   // South Korea
    'Q668',   // India
    'Q865',   // Taiwan
    'Q881',   // Vietnam
    'Q869',   // Thailand
    'Q252',   // Indonesia
    'Q928',   // Philippines
    'Q833',   // Malaysia
    'Q334',   // Singapore
    'Q836',   // Myanmar
    'Q424',   // Cambodia
    'Q843',   // Pakistan
    'Q902',   // Bangladesh
    'Q854',   // Sri Lanka
    'Q837',   // Nepal
    'Q711',   // Mongolia
    'Q8646',  // Hong Kong
    'Q423',   // North Korea
  ];

  const countryValues = ASIAN_COUNTRIES.map(q => `wd:${q}`).join(' ');
  const sparql = `
    SELECT DISTINCT ?person ?personLabel ?sitelinks WHERE {
      ?person wdt:P31 wd:Q5 .
      ?person wdt:P27 ?country .
      VALUES ?country { ${countryValues} }
      ?person wikibase:sitelinks ?sitelinks .
      FILTER (?sitelinks >= 20)
      SERVICE wikibase:label { bd:serviceParam wikibase:language "en" }
    }
    ORDER BY DESC(?sitelinks)
    LIMIT 3000
  `;

  const sparqlUrl = `https://query.wikidata.org/sparql?query=${encodeURIComponent(sparql)}&format=json`;
  console.log('Querying Wikidata SPARQL for public figures...');

  const sparqlRes = await fetch(sparqlUrl, {
    headers: { 'User-Agent': '100WomenGame/1.0 (contact@example.com)', 'Accept': 'application/sparql-results+json' },
  });
  if (!sparqlRes.ok) throw new Error(`SPARQL query failed: HTTP ${sparqlRes.status}`);

  const sparqlData = await sparqlRes.json();
  const sparqlEntries = sparqlData.results.bindings
    .filter(r => r.personLabel?.value && !r.personLabel.value.startsWith('Q'))
    .map(r => ({
      name: r.personLabel.value,
      aliases: [],
      platform: 'famous-asians',
      genderSource: 'wikidata-sparql',
    }));
  console.log(`Got ${sparqlEntries.length} candidates from SPARQL`);

  // ── Step 2: Twitch/GitHub streamers via Claude ────────────────────────────
  let streamerEntries = [];

  const githubStreamers = await fetchGitHubStreamers();

  let liveTwitchStreamers = [];
  if (process.env.TWITCH_CLIENT_ID && process.env.TWITCH_CLIENT_SECRET) {
    const token = await getTwitchToken();
    liveTwitchStreamers = await fetchLiveTwitchStreamers(token);
  } else {
    console.log('No TWITCH credentials — using GitHub dataset only for streamers');
  }

  const seedCandidates = ASIAN_STREAMER_SEEDS.map(name => ({
    name,
    login: name.toLowerCase(),
    platform: 'twitch',
    followers: 0,
    manual: true,
  }));

  // Merge: seeds first so they're not dropped by dedup
  const seenMerge = new Set();
  const allStreamers = [];
  for (const c of [...seedCandidates, ...githubStreamers, ...liveTwitchStreamers]) {
    const key = (c.login || c.name).toLowerCase();
    if (!seenMerge.has(key)) {
      seenMerge.add(key);
      allStreamers.push(c);
    }
  }
  console.log(`\nStreamer candidates: ${allStreamers.length} — running Claude Asian classification...`);

  const claudeResults = await classifyAsianStreamersWithClaude(allStreamers);
  console.log(`Claude confirmed Asian streamers: ${claudeResults.length}/${allStreamers.length}`);

  streamerEntries = claudeResults.map(r => ({
    name: r.name,
    aliases: [],
    platform: r.platform,
    description: r.description,
    genderSource: 'claude',
  }));

  // ── Step 3: Curated famous Asians from Claude ─────────────────────────────
  console.log('\nFetching curated famous Asians from Claude...');
  const curatedEntries = await getCuratedFamousAsiansFromClaude();

  // ── Step 4: Merge all sources, deduplicate ────────────────────────────────
  const seen = new Set();
  const output = [];

  for (const entry of [...sparqlEntries, ...streamerEntries, ...curatedEntries]) {
    const key = entry.name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    const out = { name: entry.name, aliases: entry.aliases ?? [], platform: entry.platform, genderSource: entry.genderSource };
    if (entry.description) out.description = entry.description;
    output.push(out);
  }

  await fs.writeFile(FAMOUS_ASIANS_OUTPUT_PATH, JSON.stringify(output, null, 2));
  console.log(`\nWrote ${output.length} famous Asians to ${FAMOUS_ASIANS_OUTPUT_PATH}`);
  console.log(`  SPARQL public figures: ${sparqlEntries.length}`);
  console.log(`  Claude-verified streamers: ${streamerEntries.length}`);
  console.log(`  Claude-curated (artists/athletes/etc): ${curatedEntries.length}`);
}

// ─── Animals allowlist ────────────────────────────────────────────────────────

const GENERIC_ANIMAL_NAMES = [
  // Pets & farm
  'dog', 'cat', 'fish', 'bird', 'horse', 'cow', 'pig', 'chicken', 'duck', 'rabbit',
  'hamster', 'mouse', 'rat', 'goat', 'sheep', 'donkey', 'hen', 'rooster', 'turkey',
  // Wild mammals
  'lion', 'tiger', 'bear', 'wolf', 'fox', 'deer', 'elephant', 'monkey', 'gorilla',
  'giraffe', 'zebra', 'hippo', 'rhino', 'cheetah', 'leopard', 'jaguar', 'puma',
  'cougar', 'panther', 'buffalo', 'bison', 'moose', 'elk', 'reindeer', 'camel',
  'kangaroo', 'koala', 'panda', 'raccoon', 'skunk', 'squirrel', 'chipmunk', 'bat',
  'otter', 'beaver', 'seal', 'walrus', 'whale', 'dolphin', 'shark', 'narwhal',
  // Reptiles & amphibians
  'snake', 'turtle', 'lizard', 'crocodile', 'alligator', 'gecko', 'iguana',
  'chameleon', 'cobra', 'python', 'boa', 'frog', 'toad', 'newt', 'salamander',
  // Birds
  'owl', 'eagle', 'parrot', 'penguin', 'flamingo', 'peacock', 'toucan', 'pelican',
  'crow', 'raven', 'pigeon', 'dove', 'swan', 'goose', 'hawk', 'falcon', 'vulture',
  'ostrich', 'emu', 'heron', 'stork', 'crane', 'seagull', 'puffin', 'hummingbird',
  'robin', 'sparrow', 'finch', 'canary', 'magpie', 'albatross', 'kiwi',
  // Sea creatures
  'octopus', 'squid', 'jellyfish', 'crab', 'lobster', 'shrimp', 'prawn',
  'seahorse', 'starfish', 'clam', 'oyster', 'mussel', 'eel', 'stingray',
  'salmon', 'tuna', 'goldfish', 'carp', 'bass', 'trout', 'cod', 'snail',
  // Insects & arachnids
  'spider', 'bee', 'ant', 'fly', 'butterfly', 'moth', 'grasshopper', 'cricket',
  'beetle', 'ladybug', 'dragonfly', 'mosquito', 'caterpillar', 'worm', 'scorpion',
  'tarantula', 'firefly', 'wasp', 'cockroach', 'termite', 'mantis',
];

const ANIMAL_CATEGORIES = [
  { label: 'mammals',            prompt: 'well-known mammals (e.g. lion, elephant, dolphin, whale, wolf, bear, etc.)',                         count: 150 },
  { label: 'birds',              prompt: 'well-known birds (e.g. eagle, penguin, parrot, flamingo, owl, etc.)',                                 count: 150 },
  { label: 'fish',               prompt: 'well-known fish (e.g. salmon, shark, clownfish, tuna, goldfish, etc.)',                               count: 100 },
  { label: 'reptiles',           prompt: 'well-known reptiles (e.g. crocodile, komodo dragon, chameleon, cobra, etc.)',                         count: 100 },
  { label: 'insects & arachnids',prompt: 'well-known insects and arachnids (e.g. butterfly, tarantula, praying mantis, etc.)',                  count: 100 },
  { label: 'sea creatures',      prompt: 'well-known sea creatures that are not fish (e.g. octopus, jellyfish, crab, lobster, seahorse, etc.)', count: 100 },
  { label: 'amphibians',         prompt: 'well-known amphibians (e.g. frog, axolotl, salamander, toad, etc.)',                                  count:  50 },
  { label: 'dog breeds',         prompt: 'popular dog breeds (e.g. golden retriever, poodle, bulldog, husky, etc.)',                            count: 100 },
  { label: 'cat breeds',         prompt: 'popular cat breeds (e.g. siamese, persian, maine coon, bengal, etc.)',                                count:  50 },
  { label: 'dinosaurs',          prompt: 'well-known dinosaurs and prehistoric creatures (e.g. T-Rex, triceratops, velociraptor, etc.)',         count: 100 },
];

async function buildAnimalsAllowlist() {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error('ANTHROPIC_API_KEY required for animals build');
    process.exit(1);
  }

  console.log('\nBuilding Animals allowlist from Claude...\n');

  const all = [];
  const CONCURRENCY = 3;

  for (let i = 0; i < ANIMAL_CATEGORIES.length; i += CONCURRENCY) {
    const chunk = ANIMAL_CATEGORIES.slice(i, i + CONCURRENCY);
    const chunkResults = await Promise.all(chunk.map(async ({ label, prompt, count }) => {
      const fullPrompt = `List the ${count} most well-known and recognizable ${prompt}.
Use common English names (not scientific names). Include both singular common names people would actually type in a trivia game.

Respond ONLY with a JSON array of strings:
["lion", "elephant", "dolphin"]

JSON array only, no explanation.`;

      try {
        const res = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'x-api-key': process.env.ANTHROPIC_API_KEY,
            'anthropic-version': '2023-06-01',
            'content-type': 'application/json',
          },
          body: JSON.stringify({
            model: 'claude-haiku-4-5-20251001',
            max_tokens: 4096,
            messages: [{ role: 'user', content: fullPrompt }],
          }),
        });

        const data = await res.json();
        const raw = data.content?.[0]?.text || '[]';
        const text = raw.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
        const items = JSON.parse(text);
        console.log(`  [${label}]: ${items.length} animals`);
        return items.map(name => ({
          name: typeof name === 'string' ? name : name.name,
          aliases: [],
          platform: 'animals',
          genderSource: 'claude-curated',
        }));
      } catch (err) {
        console.warn(`  [${label}] failed:`, err.message);
        return [];
      }
    }));

    all.push(...chunkResults.flat());
    if (i + CONCURRENCY < ANIMAL_CATEGORIES.length) await sleep(500);
  }

  // Prepend generic names so they always appear and aren't dropped by dedup
  const genericEntries = GENERIC_ANIMAL_NAMES.map(name => ({
    name,
    aliases: [],
    platform: 'animals',
    genderSource: 'manual',
  }));
  all.unshift(...genericEntries);

  // Deduplicate
  const seen = new Set();
  const output = all.filter(e => {
    const k = e.name.toLowerCase();
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });

  await fs.writeFile(ANIMALS_OUTPUT_PATH, JSON.stringify(output, null, 2));
  console.log(`\nWrote ${output.length} animals to ${ANIMALS_OUTPUT_PATH}`);
}

async function main() {
  const args = process.argv.slice(2);
  const categoryIdx = args.indexOf('--category');
  const categoryId = categoryIdx !== -1 ? args[categoryIdx + 1] : 'women';

  const BUILDERS = {
    women: buildWomenAllowlist,
    men: buildMenAllowlist,
    nba: buildNBAAllowlist,
    lol: buildLoLAllowlist,
    'fictional-women': buildFictionalWomenAllowlist,
    'fictional-men': buildFictionalMenAllowlist,
    'famous-asians': buildFamousAsiansAllowlist,
    animals: buildAnimalsAllowlist,
  };

  const builder = BUILDERS[categoryId];
  if (!builder) {
    console.error(`Unknown category: "${categoryId}". Valid options: ${Object.keys(BUILDERS).join(', ')}`);
    process.exit(1);
  }

  console.log(`\nBuilding allowlist for category: ${categoryId}\n`);
  await builder();
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function loadEnv() {
  try {
    const envFile = await fs.readFile(path.join(__dirname, '../.env'), 'utf-8');
    for (const line of envFile.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eqIdx = trimmed.indexOf('=');
      if (eqIdx === -1) continue;
      const key = trimmed.slice(0, eqIdx).trim();
      const val = trimmed.slice(eqIdx + 1).trim();
      if (key && val && !process.env[key]) process.env[key] = val;
    }
  } catch {
    // no .env file
  }
}

loadEnv().then(main).catch(err => {
  console.error('\nError:', err.message);
  process.exit(1);
});

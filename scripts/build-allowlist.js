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

  // Step 3: Build allowlist — use .name (display name), .id as alias
  // champData.data is an object keyed by champion ID (e.g. "JarvanIV")
  // Each value has: .name ("Jarvan IV"), .id ("JarvanIV"), .title, .blurb
  const allowlist = Object.values(champData.data).map(champ => ({
    name: champ.name,             // "Jarvan IV" — the display name players know
    aliases: [champ.id],          // "JarvanIV" — camelCase variant as alias
    platform: 'lol',
    followers: 0,
    genderSource: 'riot-ddragon',
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

async function buildFictionalWomenAllowlist() {
  await buildSocialAllowlist({
    outputPath: FICTIONAL_WOMEN_OUTPUT_PATH,
    genderLabel: 'fictional-women',
    genderPrompt: 'identify which ones are clearly fictional female characters (from film, TV, books, games, anime, etc.). Only include fictional characters you are highly confident are female.',
    genderQID: 'Q6581072',
    wikidataInstance: 'Q15632617', // fictional human
  });
}

async function buildFictionalMenAllowlist() {
  await buildSocialAllowlist({
    outputPath: FICTIONAL_MEN_OUTPUT_PATH,
    genderLabel: 'fictional-men',
    genderPrompt: 'identify which ones are clearly fictional male characters (from film, TV, books, games, anime, etc.). Only include fictional characters you are highly confident are male.',
    genderQID: 'Q6581097',
    wikidataInstance: 'Q15632617',
  });
}

async function buildFamousAsiansAllowlist() {
  console.log('\nBuilding Famous Asians allowlist via Wikidata SPARQL...\n');

  // Asian country Q-IDs
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

  const url = `https://query.wikidata.org/sparql?query=${encodeURIComponent(sparql)}&format=json`;
  console.log('Querying Wikidata SPARQL...');

  const res = await fetch(url, {
    headers: { 'User-Agent': '100WomenGame/1.0 (contact@example.com)', 'Accept': 'application/sparql-results+json' },
  });
  if (!res.ok) throw new Error(`SPARQL query failed: HTTP ${res.status}`);

  const data = await res.json();
  const results = data.results.bindings;
  console.log(`Got ${results.length} candidates from SPARQL`);

  const entries = results
    .filter(r => r.personLabel?.value && !r.personLabel.value.startsWith('Q'))
    .map(r => ({
      name: r.personLabel.value,
      aliases: [],
      platform: 'famous-asians',
      genderSource: 'wikidata-sparql',
      sitelinks: parseInt(r.sitelinks?.value || '0'),
    }));

  // Deduplicate by name
  const seen = new Set();
  const deduped = entries.filter(e => {
    if (seen.has(e.name.toLowerCase())) return false;
    seen.add(e.name.toLowerCase());
    return true;
  });

  const output = deduped.map(({ name, aliases, platform, genderSource }) => ({ name, aliases, platform, genderSource }));
  await fs.writeFile(FAMOUS_ASIANS_OUTPUT_PATH, JSON.stringify(output, null, 2));
  console.log(`\nWrote ${output.length} famous Asians to ${FAMOUS_ASIANS_OUTPUT_PATH}`);
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

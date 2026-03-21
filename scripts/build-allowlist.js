/**
 * build-allowlist.js
 *
 * Builds an allowlist of famous women from:
 *   1. GitHub CSV dataset — top 1000 Twitch streamers by follower count
 *   2. Live Twitch streams (optional, for freshness)
 *   3. YouTube creators (optional)
 *
 * Gender filtering: LLM-first (fast bulk), then Wikidata confirm (smaller set)
 *
 * Usage: node scripts/build-allowlist.js
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

const OUTPUT_PATH = path.join(__dirname, '../src/data/allowlist.json');

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
  console.log('📥 Fetching GitHub top-streamers dataset...');
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
    console.log(`✓ GitHub dataset: ${streamers.length} streamers (sorted by followers)`);
    return streamers;
  } catch (err) {
    console.warn(`⚠ GitHub dataset fetch failed: ${err.message} — skipping`);
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
  console.log('✓ Twitch token obtained');
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

  console.log(`✓ Twitch live: ${allStreamers.size} unique streamers`);
  return Array.from(allStreamers.values());
}

// ─── YouTube (optional) ──────────────────────────────────────────────────────

async function fetchYouTubeCreators() {
  if (!process.env.YOUTUBE_API_KEY) {
    console.log('⚠ No YOUTUBE_API_KEY — skipping YouTube');
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

  console.log(`✓ YouTube: ${creators.size} unique creators collected`);
  return Array.from(creators.values());
}

// ─── LLM gender classification (fast bulk pass) ──────────────────────────────

async function classifyGenderWithLLM(names) {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.log('⚠ No ANTHROPIC_API_KEY — skipping LLM classification');
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
      const prompt = `You are helping build a dataset of famous women for a trivia game.

Given these streamer/creator usernames and display names, identify which ones are clearly female (woman or girl).
Only include people you are highly confident are female. Exclude if unsure, male, organization, or unknown.

Names (one per line):
${batch.map((n, idx) => `${idx + 1}. ${n}`).join('\n')}

Respond ONLY with a JSON array of the names (exactly as written above) that are clearly female. Example:
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
        console.log(`  LLM batch ${batchNum}/${batches.length}: ${confirmed.length}/${batch.length} confirmed female`);
      } catch (err) {
        console.warn(`  LLM batch ${batchNum} failed:`, err.message);
      }
    }));

    if (i + BATCH_CONCURRENCY < batches.length) await sleep(500);
  }

  return results;
}

// ─── Wikidata gender check (concurrent) ──────────────────────────────────────

async function checkWikidataName(name) {
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
      const isFemale = claims.P21?.some(c => c.mainsnak.datavalue?.value?.id === GAME_CONFIG.wikidataGender);
      if (isHuman && isFemale) {
        return { confirmed: true, wikidataName: entity.labels?.en?.value };
      }
    }
    return { confirmed: false };
  } catch {
    return null;
  }
}

async function checkWikidataBatch(candidates) {
  const results = new Map();
  const queue = [...candidates];
  let completed = 0;

  async function worker() {
    while (queue.length > 0) {
      const candidate = queue.shift();
      if (!candidate) break;
      const result = await checkWikidataName(candidate.name);
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

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`\n🚀 Building allowlist for: ${GAME_CONFIG.name}\n`);

  // 1. Fetch candidates
  const githubStreamers = await fetchGitHubStreamers();

  let liveTwitchStreamers = [];
  if (process.env.TWITCH_CLIENT_ID && process.env.TWITCH_CLIENT_SECRET) {
    const token = await getTwitchToken();
    liveTwitchStreamers = await fetchLiveTwitchStreamers(token);
  } else {
    console.log('⚠ No TWITCH credentials — using GitHub dataset only');
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
  console.log(`\n📋 Total unique candidates: ${allCandidates.length}`);

  // 2. LLM bulk pass — fast, classifies all candidates in ~10 API calls
  console.log('\n🤖 LLM bulk gender classification...');
  const llmResults = await classifyGenderWithLLM(allCandidates.map(c => c.name));
  const llmConfirmed = allCandidates.filter(c => llmResults[c.name]);
  console.log(`✓ LLM confirmed female: ${llmConfirmed.length}/${allCandidates.length}`);

  // 3. Wikidata check on LLM-confirmed subset only (much smaller, runs concurrently)
  console.log(`\n🔍 Wikidata verification on ${llmConfirmed.length} names (${WIKIDATA_CONCURRENCY} concurrent)...`);
  const wikidataResults = await checkWikidataBatch(llmConfirmed);

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

  await fs.writeFile(OUTPUT_PATH, JSON.stringify(allowlist, null, 2));
  console.log(`\n💾 Written to ${OUTPUT_PATH}`);
  console.log(`   ${allowlist.length} entries`);

  const bySource = allowlist.reduce((acc, e) => {
    acc[e.genderSource] = (acc[e.genderSource] || 0) + 1;
    return acc;
  }, {});
  console.log('   By gender source:', bySource);

  const wikidataCount = allowlist.filter(e => e.wikidataConfirmed).length;
  console.log(`   Wikidata confirmed: ${wikidataCount} (${((wikidataCount / allowlist.length) * 100).toFixed(0)}%)`);
}

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
  console.error('\n❌ Error:', err.message);
  process.exit(1);
});

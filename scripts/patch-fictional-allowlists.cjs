/**
 * Fetches missing categories that returned 0 from the main build run.
 * Merges into existing allowlists without overwriting.
 * Usage: node scripts/patch-fictional-allowlists.js
 */
const fs = require('fs/promises');
const fsSync = require('fs');
const path = require('path');
const sleep = ms => new Promise(r => setTimeout(r, ms));

// Load .env manually (no dotenv dependency needed)
try {
  const envPath = path.resolve(__dirname, '../.env');
  const envContent = fsSync.readFileSync(envPath, 'utf8');
  for (const line of envContent.split('\n')) {
    const match = line.match(/^([^#=]+)=(.*)$/);
    if (match) process.env[match[1].trim()] = match[2].trim();
  }
} catch { /* .env not found, rely on shell env */ }

const MISSING = [
  ['m', 'shounen/isekai anime', 'shounen and isekai anime (e.g. Black Clover, Seven Deadly Sins, That Time I Got Reincarnated as a Slime, Overlord, KonoSuba, Sword Art Online, Log Horizon, No Game No Life, Mushoku Tensei)'],
  ['m', 'anime/manga franchises', 'anime and manga franchises (e.g. Naruto, Dragon Ball, One Piece, Attack on Titan, Demon Slayer, Bleach, Jujutsu Kaisen, My Hero Academia, Fullmetal Alchemist, Hunter x Hunter, Fairy Tail, One Punch Man)'],
  ['m', 'comic/superhero franchises', 'comic book and superhero franchises (e.g. Marvel, DC, X-Men, Avengers, Spider-Man, Batman, Superman, Deadpool, Fantastic Four, Green Lantern, Flash, Iron Man)'],
  ['m', 'live-action TV shows', 'popular live-action TV show characters (e.g. Breaking Bad, Fresh Prince of Bel-Air, Friends, The Office, Stranger Things, Game of Thrones, Sopranos, Dexter, Sherlock, Doctor Who, Peaky Blinders, Better Call Saul, The Boys, Drake and Josh, Saved by the Bell, That 70s Show, How I Met Your Mother, Big Bang Theory)'],
  ['m', 'animated TV shows', 'animated TV shows (e.g. Family Guy, The Simpsons, Futurama, South Park, Rick and Morty, Avatar: The Last Airbender, Gravity Falls, Adventure Time, Regular Show, Bob\'s Burgers, American Dad, King of the Hill, Archer, Clone Wars)'],
  ['m', 'Disney/Pixar/animated films', 'Disney, Pixar and animated films (e.g. Lion King, Toy Story, Finding Nemo, The Incredibles, Aladdin, Mulan, Hercules, Tarzan, Big Hero 6, Wreck-It Ralph, Ratatouille, Up, Cars, Monsters Inc, Jungle Book, Peter Pan)'],
  ['f', 'shooter/FPS games', 'shooter and FPS video games (e.g. Halo, Overwatch, Apex Legends, Mass Effect, Borderlands, Metroid, Destiny, Valorant, Titanfall, Left 4 Dead, Portal)'],
  ['f', 'open-world/sandbox games', 'open-world and sandbox video games (e.g. GTA, Red Dead Redemption, Cyberpunk 2077, The Witcher, Elden Ring, Skyrim, Fallout, Horizon, Ghost of Tsushima, Assassin\'s Creed)'],
  ['f', 'platformer/indie games', 'platformer and indie video games (e.g. Mario, Metroid, Hollow Knight, Celeste, Cuphead, Shovel Knight, Ori, Bayonetta, Shantae, Dustforce, Cave Story)'],
  ['f', 'Pokemon characters', 'the Pokemon franchise — female trainers, gym leaders, Elite Four, Champions, rivals, villains, and major anime characters across all generations'],
  ['f', 'horror/survival games', 'horror and survival video games (e.g. Resident Evil, Silent Hill, Dead Space, Outlast, Until Dawn, The Evil Within, Alan Wake, Control, Alien Isolation, Returnal)'],
  ['f', 'MOBA/strategy games', 'MOBA and strategy games (e.g. League of Legends, Dota 2, Heroes of the Storm, Smite, Battlerite, Warcraft, StarCraft, Overwatch)'],
  ['f', 'animated TV shows', 'animated TV shows (e.g. Avatar: The Last Airbender, Steven Universe, Gravity Falls, She-Ra, Winx Club, Powerpuff Girls, Kim Possible, Totally Spies, Sailor Moon, My Little Pony, Star vs the Forces of Evil, Miraculous Ladybug)'],
  ['f', 'live-action TV shows', 'popular live-action TV show characters (e.g. Friends, Stranger Things, Game of Thrones, Grey\'s Anatomy, Gossip Girl, Pretty Little Liars, Gilmore Girls, Fresh Prince, Buffy, Charmed, The Good Place, Schitt\'s Creek, Emily in Paris, Sex and the City, Euphoria, Bridgerton)'],
  ['f', 'Disney/Pixar/animated films', 'Disney, Pixar and animated films (e.g. Frozen, Moana, Tangled, The Little Mermaid, Mulan, Brave, Encanto, Cinderella, Sleeping Beauty, Snow White, Toy Story, The Incredibles, Turning Red, Ratatouille, Up, Luca)'],
  ['f', 'film franchises', 'major film franchise characters (e.g. Star Wars, Harry Potter, Lord of the Rings, Marvel MCU, DC films, Hunger Games, Divergent, Twilight, Pirates of the Caribbean, Jurassic Park, The Matrix, Kill Bill, Alien, Terminator)'],
];

async function claudeFetch(gender, label, prompt) {
  const genderLabel = gender === 'f' ? 'female' : 'male';
  const fullPrompt = `List 100 of the most well-known ${genderLabel} characters from ${prompt}.
Include protagonists, antagonists, and major supporting characters across all titles in these franchises.

Respond ONLY with a JSON array:
[{"name": "Walter White", "aliases": ["Heisenberg"], "franchise": "breakingbad"}]

Rules:
- "name": full canonical character name
- "aliases": common nicknames or short names (can be empty array)
- "franchise": short lowercase franchise key with no spaces

JSON array only, no explanation.`;

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

  if (!res.ok) {
    const err = await res.json();
    console.warn(`  [${label}] API error ${res.status}:`, err.error?.message);
    return [];
  }

  const data = await res.json();
  const raw = data.content?.[0]?.text || '[]';
  const text = raw.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
  try {
    const items = JSON.parse(text);
    console.log(`  [${label}] ${genderLabel}: ${items.length} characters`);
    return items;
  } catch {
    console.warn(`  [${label}] JSON parse failed`);
    return [];
  }
}

async function main() {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error('ANTHROPIC_API_KEY not set');
    process.exit(1);
  }

  const menPath = './src/data/allowlist-fictional-men.json';
  const womenPath = './src/data/allowlist-fictional-women.json';
  let men = JSON.parse(await fs.readFile(menPath, 'utf8'));
  let women = JSON.parse(await fs.readFile(womenPath, 'utf8'));

  const menNames = new Set(men.map(e => e.name.toLowerCase()));
  const womenNames = new Set(women.map(e => e.name.toLowerCase()));

  for (const [gender, label, prompt] of MISSING) {
    const items = await claudeFetch(gender, label, prompt);
    if (gender === 'm') {
      const newEntries = items
        .filter(c => c.name && !menNames.has(c.name.toLowerCase()))
        .map(c => ({
          name: c.name,
          aliases: Array.isArray(c.aliases) ? c.aliases : [],
          platform: c.franchise?.toLowerCase().replace(/\s+/g, '') || 'unknown',
          gender: 'm',
          genderSource: 'claude-curated',
        }));
      newEntries.forEach(e => menNames.add(e.name.toLowerCase()));
      men.push(...newEntries);
    } else {
      const newEntries = items
        .filter(c => c.name && !womenNames.has(c.name.toLowerCase()))
        .map(c => ({
          name: c.name,
          aliases: Array.isArray(c.aliases) ? c.aliases : [],
          platform: c.franchise?.toLowerCase().replace(/\s+/g, '') || 'unknown',
          gender: 'f',
          genderSource: 'claude-curated',
        }));
      newEntries.forEach(e => womenNames.add(e.name.toLowerCase()));
      women.push(...newEntries);
    }
    await sleep(2000);
  }

  await fs.writeFile(menPath, JSON.stringify(men, null, 2));
  await fs.writeFile(womenPath, JSON.stringify(women, null, 2));
  console.log(`\nDone. Men: ${men.length}, Women: ${women.length}`);
}

main().catch(console.error);

/**
 * One-time script: apply Wikipedia basketball nicknames to allowlist-nba.json
 * Run: node scripts/apply-nba-nicknames.js
 */

import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const allowlistPath = join(__dirname, '../src/data/allowlist-nba.json');

const allowlist = JSON.parse(readFileSync(allowlistPath, 'utf8'));

// Wikipedia nickname data (from List of nicknames in basketball)
const WIKI_NICKNAMES = [
  {"player":"Kareem Abdul-Jabbar","nicknames":["The Captain","Captain Hook"]},
  {"player":"Edrice Adebayo","nicknames":["Bam","The Onomatopoeia"]},
  {"player":"Ray Allen","nicknames":["Ray Ray","Sugar Ray","Jesus Shuttlesworth"]},
  {"player":"Rafer Alston","nicknames":["Skip To My Lou"]},
  {"player":"Chris Andersen","nicknames":["Birdman"]},
  {"player":"Giannis Antetokounmpo","nicknames":["Greek Freak","The Alphabet"]},
  {"player":"Carmelo Anthony","nicknames":["Melo","Captain America","Hoodie Melo"]},
  {"player":"Nate Archibald","nicknames":["Tiny"]},
  {"player":"Gilbert Arenas","nicknames":["Agent Zero","The Hibachi","Gil"]},
  {"player":"Trevor Ariza","nicknames":["Cobra"]},
  {"player":"Paul Arizin","nicknames":["Pitchin"]},
  {"player":"Stacey Augmon","nicknames":["Plastic Man"]},
  {"player":"Charles Barkley","nicknames":["Chuck","Sir Charles","The Round Mound of Rebound"]},
  {"player":"Harrison Barnes","nicknames":["The Black Falcon"]},
  {"player":"Dick Barnett","nicknames":["Fall Back Baby"]},
  {"player":"Brent Barry","nicknames":["Bones"]},
  {"player":"Bradley Beal","nicknames":["Big Panda"]},
  {"player":"Michael Beasley","nicknames":["B-Easy","Big Mike"]},
  {"player":"Marco Belinelli","nicknames":["Beli"]},
  {"player":"Walt Bellamy","nicknames":["Bells"]},
  {"player":"Chauncey Billups","nicknames":["Mr. Big Shot"]},
  {"player":"Larry Bird","nicknames":["The Hick from French Lick","Larry Legend"]},
  {"player":"Bismack Biyombo","nicknames":["Bizzy Bo"]},
  {"player":"Daron Blaylock","nicknames":["Mookie"]},
  {"player":"Tyrone Bogues","nicknames":["Muggsy"]},
  {"player":"Devin Booker","nicknames":["Book","D-Book"]},
  {"player":"Chris Bosh","nicknames":["CB4","The Boshtrich"]},
  {"player":"Bill Bradley","nicknames":["Dollar Bill"]},
  {"player":"Mikal Bridges","nicknames":["The Warden","Brooklyn Bridges"]},
  {"player":"Joe Bryant","nicknames":["Jellybean"]},
  {"player":"Kobe Bryant","nicknames":["Black Mamba","KB-24","Vino"]},
  {"player":"Jimmy Butler","nicknames":["Jimmy Buckets","Jimmy Jordan"]},
  {"player":"Antoine Carr","nicknames":["Big Dawg"]},
  {"player":"Vince Carter","nicknames":["Vinsanity","Air Canada","Half Man Half Amazing","VC"]},
  {"player":"Michael Carter-Williams","nicknames":["MCW"]},
  {"player":"Alex Caruso","nicknames":["The Bald Mamba","Carushow"]},
  {"player":"Sam Cassell","nicknames":["Sam I Am"]},
  {"player":"Wilt Chamberlain","nicknames":["Wilt the Stilt","The Big Dipper"]},
  {"player":"Mike Conley","nicknames":["Bite Bite"]},
  {"player":"DeMarcus Cousins","nicknames":["Boogie"]},
  {"player":"Bob Cousy","nicknames":["The Houdini of the Hardwood","Cooz"]},
  {"player":"Jamal Crawford","nicknames":["J Crossover"]},
  {"player":"Billy Cunningham","nicknames":["Kangaroo Kid"]},
  {"player":"Stephen Curry","nicknames":["Baby-Faced Assassin","Chef Curry","Steph","Splash Brothers"]},
  {"player":"Anthony Davis","nicknames":["Brow","AD"]},
  {"player":"Glen Davis","nicknames":["Big Baby"]},
  {"player":"Darryl Dawkins","nicknames":["Chocolate Thunder"]},
  {"player":"Matthew Dellavedova","nicknames":["Delly","The Curry Stopper"]},
  {"player":"DeMar DeRozan","nicknames":["Deebo"]},
  {"player":"Boris Diaw","nicknames":["Tea Time"]},
  {"player":"Luka Doncic","nicknames":["Luka Magic","The Don"]},
  {"player":"Clyde Drexler","nicknames":["Clyde the Glide"]},
  {"player":"Goran Dragic","nicknames":["The Dragon","Gold Dragon"]},
  {"player":"Andre Drummond","nicknames":["Big Penguin"]},
  {"player":"Tim Duncan","nicknames":["The Big Fundamental","Slam Duncan","Twin Towers"]},
  {"player":"Kevin Durant","nicknames":["KD","Durantula","Slim Reaper","Easy Money Sniper"]},
  {"player":"Anthony Edwards","nicknames":["Ant-Man","Ant"]},
  {"player":"Pervis Ellison","nicknames":["Never Nervous Pervis"]},
  {"player":"Joel Embiid","nicknames":["The Process"]},
  {"player":"Julius Erving","nicknames":["Dr. J"]},
  {"player":"Patrick Ewing","nicknames":["The Beast of the East"]},
  {"player":"Derek Fisher","nicknames":["D-Fish"]},
  {"player":"Eric Floyd","nicknames":["Sleepy"]},
  {"player":"De'Aaron Fox","nicknames":["Swipa"]},
  {"player":"Steve Francis","nicknames":["Stevie Franchise"]},
  {"player":"Walt Frazier","nicknames":["Clyde"]},
  {"player":"James Fredette","nicknames":["Jimmer"]},
  {"player":"Aaron Gordon","nicknames":["Air Gordon"]},
  {"player":"Dan Gadzuric","nicknames":["The Flying Dutchman"]},
  {"player":"Danilo Gallinari","nicknames":["Il Gallo","The Rooster"]},
  {"player":"Kevin Garnett","nicknames":["Big Ticket","KG","The Kid"]},
  {"player":"Marc Gasol","nicknames":["Big Spain"]},
  {"player":"Paul George","nicknames":["PG-13","Playoff P","Podcast P"]},
  {"player":"George Gervin","nicknames":["The Iceman","Ice"]},
  {"player":"Shai Gilgeous-Alexander","nicknames":["SGA"]},
  {"player":"Artis Gilmore","nicknames":["A Train"]},
  {"player":"Manu Ginobili","nicknames":["The Magician","Gino"]},
  {"player":"Rudy Gobert","nicknames":["The Stifle Tower","The French Rejection"]},
  {"player":"Robert Horry","nicknames":["Big Shot Rob"]},
  {"player":"Dwight Howard","nicknames":["Superman","D12"]},
  {"player":"Rodney Hundley","nicknames":["Hot Rod"]},
  {"player":"Serge Ibaka","nicknames":["I-block-a","Air Congo"]},
  {"player":"Andre Iguodala","nicknames":["Iggy"]},
  {"player":"Zydrunas Ilgauskas","nicknames":["Big Z"]},
  {"player":"Brandon Ingram","nicknames":["B.I.","Sleepy Reaper"]},
  {"player":"Kyrie Irving","nicknames":["Uncle Drew"]},
  {"player":"Allen Iverson","nicknames":["A.I.","The Answer","Bubba Chuck"]},
  {"player":"LeBron James","nicknames":["King James","The King","The Chosen One","LBJ","The Akron Hammer"]},
  {"player":"Earvin Johnson","nicknames":["Magic","E.J."]},
  {"player":"Joe Johnson","nicknames":["Iso Joe"]},
  {"player":"Larry Johnson","nicknames":["Grandmama","LJ"]},
  {"player":"Vinnie Johnson","nicknames":["The Microwave"]},
  {"player":"Nikola Jokic","nicknames":["Joker"]},
  {"player":"Michael Jordan","nicknames":["Air Jordan","His Airness","MJ"]},
  {"player":"Shawn Kemp","nicknames":["The Reignman"]},
  {"player":"Jason Kidd","nicknames":["J-Kidd"]},
  {"player":"Andrei Kirilenko","nicknames":["AK47"]},
  {"player":"Toni Kukoc","nicknames":["Croatian Sensation","The Waiter"]},
  {"player":"Trajan Langdon","nicknames":["The Alaskan Assassin"]},
  {"player":"Kawhi Leonard","nicknames":["The Claw"]},
  {"player":"Damian Lillard","nicknames":["Dame Dolla","Sub Zero","Logo Lillard","Dame Time"]},
  {"player":"Jeremy Lin","nicknames":["Linsanity"]},
  {"player":"Brook Lopez","nicknames":["Splash Mountain"]},
  {"player":"Bob Love","nicknames":["Butterbean"]},
  {"player":"Karl Malone","nicknames":["The Mailman"]},
  {"player":"Moses Malone","nicknames":["Chairman of the Boards"]},
  {"player":"Pete Maravich","nicknames":["Pistol Pete"]},
  {"player":"Stephon Marbury","nicknames":["Starbury"]},
  {"player":"Shawn Marion","nicknames":["The Matrix"]},
  {"player":"Cedric Maxwell","nicknames":["Cornbread"]},
  {"player":"Xavier McDaniel","nicknames":["The X-Man"]},
  {"player":"Tracy McGrady","nicknames":["T-Mac"]},
  {"player":"Kevin McHale","nicknames":["The Black Hole"]},
  {"player":"Sam Merrill","nicknames":["Money Merrill","Sammy Buckets"]},
  {"player":"George Mikan","nicknames":["Mr. Basketball"]},
  {"player":"Harold Miner","nicknames":["Baby Jordan"]},
  {"player":"Donovan Mitchell","nicknames":["Spida"]},
  {"player":"Sidney Moncrief","nicknames":["Sid the Squid"]},
  {"player":"Earl Monroe","nicknames":["Black Magic","Earl the Pearl"]},
  {"player":"Greg Monroe","nicknames":["Moose"]},
  {"player":"Ja Morant","nicknames":["Ja Wick","Ja Dropper"]},
  {"player":"Marcus Morris","nicknames":["Mook"]},
  {"player":"Alonzo Mourning","nicknames":["Zo"]},
  {"player":"Jamal Murray","nicknames":["The Blue Arrow"]},
  {"player":"Dikembe Mutombo","nicknames":["Mt. Mutombo"]},
  {"player":"Steve Nash","nicknames":["Hair Canada"]},
  {"player":"Jameer Nelson","nicknames":["Mighty Mouse"]},
  {"player":"Dirk Nowitzki","nicknames":["Dirty","Bavarian Bomber","The Germinator","The Big German"]},
  {"player":"Jusuf Nurkic","nicknames":["The Bosnian Beast"]},
  {"player":"Lamar Odom","nicknames":["The Candy Man"]},
  {"player":"Shaquille O'Neal","nicknames":["Shaq Attack","The Diesel","The Big Aristotle","Superman"]},
  {"player":"Hakeem Olajuwon","nicknames":["The Dream"]},
  {"player":"Chris Paul","nicknames":["CP3","The Point God"]},
  {"player":"Gary Payton","nicknames":["GP","The Glove"]},
  {"player":"Gary Payton II","nicknames":["The Mitten"]},
  {"player":"Sam Perkins","nicknames":["Big Smooth"]},
  {"player":"Chuck Person","nicknames":["The Rifleman"]},
  {"player":"Paul Pierce","nicknames":["The Truth"]},
  {"player":"Mason Plumlee","nicknames":["Plumdog Millionaire"]},
  {"player":"Kristaps Porzingis","nicknames":["KP","Unicorn"]},
  {"player":"Julius Randle","nicknames":["Beyblade"]},
  {"player":"Zach Randolph","nicknames":["Z-Bo"]},
  {"player":"Austin Reaves","nicknames":["Hillbilly Kobe","AR-15"]},
  {"player":"Mitch Richmond","nicknames":["The Rock"]},
  {"player":"Rajon Rondo","nicknames":["Fedex"]},
  {"player":"David Robinson","nicknames":["The Admiral"]},
  {"player":"Glenn Robinson","nicknames":["Big Dog"]},
  {"player":"Nate Robinson","nicknames":["KryptoNate"]},
  {"player":"Oscar Robertson","nicknames":["The Big O"]},
  {"player":"Dennis Rodman","nicknames":["The Worm"]},
  {"player":"Derrick Rose","nicknames":["D-Rose"]},
  {"player":"Terry Rozier","nicknames":["Scary Terry"]},
  {"player":"D'Angelo Russell","nicknames":["DLo"]},
  {"player":"Bill Russell","nicknames":["Russ"]},
  {"player":"Domantas Sabonis","nicknames":["Sabas Jr.","Domas"]},
  {"player":"Arvydas Sabonis","nicknames":["Sabas"]},
  {"player":"Brian Scalabrine","nicknames":["The White Mamba"]},
  {"player":"Pascal Siakam","nicknames":["Spicy P"]},
  {"player":"Ben Simmons","nicknames":["Fresh Prince","Big Ben","Ben 10"]},
  {"player":"Marcus Smart","nicknames":["The Cobra"]},
  {"player":"Kenny Smith","nicknames":["The Jet"]},
  {"player":"J. R. Smith","nicknames":["JR Swish"]},
  {"player":"Rik Smits","nicknames":["The Flying Dutchman","The Dunkin"]},
  {"player":"Latrell Sprewell","nicknames":["Spree"]},
  {"player":"Lance Stephenson","nicknames":["Born Ready"]},
  {"player":"Isaiah Stewart","nicknames":["Beef Stew"]},
  {"player":"Amar'e Stoudemire","nicknames":["STAT"]},
  {"player":"Predrag Stojakovic","nicknames":["Peja"]},
  {"player":"Jerry Stackhouse","nicknames":["Stack","House"]},
  {"player":"Jayson Tatum","nicknames":["The Anomaly"]},
  {"player":"Jason Terry","nicknames":["JET"]},
  {"player":"Isaiah Thomas","nicknames":["IT"]},
  {"player":"David Thompson","nicknames":["The Skywalker"]},
  {"player":"Klay Thompson","nicknames":["Splash Brothers","Game 6 Klay"]},
  {"player":"Karl-Anthony Towns","nicknames":["KAT"]},
  {"player":"Jonas Valanciunas","nicknames":["JV","Lithuanian Lightning"]},
  {"player":"Nick Van Exel","nicknames":["Nasty Nick"]},
  {"player":"Nikola Vucevic","nicknames":["Vooch"]},
  {"player":"Dwyane Wade","nicknames":["D-Wade","Flash"]},
  {"player":"Kemba Walker","nicknames":["Cardiac Kemba"]},
  {"player":"Ben Wallace","nicknames":["Big Ben"]},
  {"player":"Gerald Wallace","nicknames":["Crash"]},
  {"player":"Rasheed Wallace","nicknames":["Sheed"]},
  {"player":"Anthony Webb","nicknames":["Spud"]},
  {"player":"Chris Webber","nicknames":["C-Webb"]},
  {"player":"Victor Wembanyama","nicknames":["Wemby","Alien"]},
  {"player":"Jerry West","nicknames":["Mr. Clutch","The Logo"]},
  {"player":"Russell Westbrook","nicknames":["Brodie"]},
  {"player":"Derrick White","nicknames":["D-White"]},
  {"player":"Andrew Wiggins","nicknames":["Maple Jordan"]},
  {"player":"Dominique Wilkins","nicknames":["The Human Highlight Film"]},
  {"player":"Deron Williams","nicknames":["D-Will"]},
  {"player":"Jalen Williams","nicknames":["J-Dub"]},
  {"player":"Jason Williams","nicknames":["White Chocolate"]},
  {"player":"Lou Williams","nicknames":["Sweet Lou"]},
  {"player":"Robert Williams","nicknames":["Time Lord"]},
  {"player":"Corliss Williamson","nicknames":["Big Nasty"]},
  {"player":"James Worthy","nicknames":["Big Game James"]},
  {"player":"Yao Ming","nicknames":["The Great Wall of China","Chairman Yao"]},
  {"player":"Nick Young","nicknames":["Swaggy P"]},
  {"player":"Trae Young","nicknames":["Ice Trae"]},
  {"player":"Tyrese Haliburton","nicknames":["The Haliban"]},
  {"player":"Richard Hamilton","nicknames":["Rip"]},
  {"player":"Anfernee Hardaway","nicknames":["Penny"]},
  {"player":"James Harden","nicknames":["The Beard"]},
  {"player":"John Havlicek","nicknames":["Hondo"]},
  {"player":"Elvin Hayes","nicknames":["The Big E"]},
  {"player":"Tyler Herro","nicknames":["Baby Goat","Boy Wonder"]},
  {"player":"Buddy Hield","nicknames":["Buddy Love"]},
  {"player":"Grant Hill","nicknames":["G"]},
  {"player":"Fred Hoiberg","nicknames":["The Mayor"]},
  {"player":"Chet Holmgren","nicknames":["Abraham Lincoln"]},
  {"player":"Robert Horry","nicknames":["Big Shot Rob"]},
  {"player":"Kevin Huerter","nicknames":["Red Velvet"]},
  {"player":"Serge Ibaka","nicknames":["Serge Protector"]},
  {"player":"Andre Iguodala","nicknames":["Iggy"]},
  {"player":"Jonathan Isaac","nicknames":["The Minister of Defense"]},
  {"player":"John Stockton","nicknames":["Stock"]},
  {"player":"Patrick Beverley","nicknames":["Pat Bev"]},
  {"player":"Zion Williamson","nicknames":["Zion","Big Z","The Pelican","Showzion"]},
];

// Normalize a name for matching
const normalize = (s) => s
  .toLowerCase()
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')   // remove diacritics
  .replace(/['''.]/g, '')             // remove apostrophes and periods
  .replace(/[^a-z0-9 -]/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();

// Build lookup: normalized name → index
const nameToIdx = new Map();
allowlist.forEach((entry, idx) => {
  nameToIdx.set(normalize(entry.name), idx);
});

let matched = 0;
let skipped = 0;
const appliedTo = [];

for (const { player, nicknames } of WIKI_NICKNAMES) {
  const idx = nameToIdx.get(normalize(player));
  if (idx === undefined) {
    skipped++;
    continue;
  }

  const entry = allowlist[idx];
  const existingLower = new Set([
    entry.name.toLowerCase(),
    ...entry.aliases.map(a => a.toLowerCase()),
  ]);

  const toAdd = nicknames
    .map(n => n.trim())
    .filter(n => n.length > 1 && n !== ',')
    .filter(n => !existingLower.has(n.toLowerCase()));

  if (toAdd.length > 0) {
    entry.aliases.push(...toAdd);
    matched++;
    appliedTo.push(`${entry.name}: +[${toAdd.join(', ')}]`);
  }
}

writeFileSync(allowlistPath, JSON.stringify(allowlist, null, 2));

console.log(`\nApplied nicknames to ${matched} players, skipped ${skipped} unmatched.\n`);
appliedTo.forEach(line => console.log(' ', line));

const BAD_WORDS = new Set([
  'FUCK', 'SHIT', 'CUNT', 'DICK', 'COCK', 'PISS', 'TWAT',
  'BITCH', 'SLUT', 'WHORE', 'PUSSY', 'ARSE', 'ASSS', 'ASSSS',
  'NIGGA', 'NIGGER', 'NIGER', 'NIGG', 'NIGA',
  'RAPE', 'RAPER', 'RAPEY',
  'NAZI', 'NAZIS',
  'HOMO', 'DYKE',
  'RETRD',
  'PEDO', 'PEDOS',
  'KKK', 'KKKKK',
  'CHINK', 'SPICK', 'SPIC', 'KIKE', 'GOOK', 'WOP',
]);

function normalize(name: string): string {
  return name.toUpperCase().trim()
    .replace(/4/g, 'A')
    .replace(/3/g, 'E')
    .replace(/[L1]/g, 'I')
    .replace(/0/g, 'O')
    .replace(/V/g, 'U')
    .replace(/Q/g, 'G');
}

export function isBadWord(name: string): boolean {
  return BAD_WORDS.has(normalize(name));
}

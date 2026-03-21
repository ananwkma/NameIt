export function formatTime(ms: number, showMs = false): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  const str = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;

  if (showMs) {
    const milliseconds = Math.floor((Math.max(0, ms) % 1000) / 10);
    return `${str}.${milliseconds.toString().padStart(2, '0')}`;
  }
  return str;
}

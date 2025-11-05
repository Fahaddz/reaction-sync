export function secondsToTime(seconds: number, prec: number = 1): string {
  if (isNaN(seconds)) return "0:00";
  const rounded = Math.round(seconds * 10) / 10;
  const [whole, decimal] = rounded.toString().split('.');
  return `${Math.floor(Number(whole) / 60)}:${String(Number(whole) % 60).padStart(2, '0')}${decimal ? `.${decimal}` : ''}`;
}

export function timeToSeconds(timeStr: string): number {
  const parts = timeStr.split(':');
  if (parts.length === 2) {
    return Number(parts[0]) * 60 + Number(parts[1]);
  }
  return 0;
}


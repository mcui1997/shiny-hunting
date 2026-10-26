import { SEASONS, type Season } from './types';

/**
 * PokeMMO's clock: in-game time runs 4× real time and restarts every 6 real hours, at
 * 00:00, 06:00, 12:00 and 18:00 UTC, so each 6-hour block is one in-game day. Each block
 * is the next weekday. The season changes with the real (UTC) month:
 * Jan/May/Sep Spring, Feb/Jun/Oct Summer, Mar/Jul/Nov Autumn, Apr/Aug/Dec Winter.
 * Checked against the in-game clock in your battle screenshots (see tests).
 */
const BLOCK_MS = 6 * 3600 * 1000;
/** Block 0 (1970-01-01 00:00 UTC) was a Saturday; found from the Aron screenshot, checked on all 11. */
const WEEKDAY_OFFSET = 6;
export const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] as const;

export interface GameTime {
  weekday: (typeof WEEKDAYS)[number];
  hour: number;
  minute: number;
  season: Season;
  period: 'Morning' | 'Day' | 'Night';
}

export function gameTime(now: Date): GameTime {
  const t = now.getTime();
  const block = Math.floor(t / BLOCK_MS);
  const inGameMinutes = Math.floor(((t - block * BLOCK_MS) * 4) / 60000); // 0..1439
  const hour = Math.floor(inGameMinutes / 60);
  const minute = inGameMinutes % 60;
  const weekday = WEEKDAYS[(((block + WEEKDAY_OFFSET) % 7) + 7) % 7];
  const season = SEASONS[now.getUTCMonth() % 4];
  // Morning 04:00–10:59, day 11:00–20:59, night 21:00–03:59.
  const period = hour >= 4 && hour < 11 ? 'Morning' : hour >= 11 && hour < 21 ? 'Day' : 'Night';
  return { weekday, hour, minute, season, period };
}

export const pad2 = (n: number) => String(n).padStart(2, '0');

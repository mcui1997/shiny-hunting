import { useEffect, useState } from 'react';
import { gameTime, pad2 } from '../lib/clock';

const central = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Chicago', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' });

/** Small header clock: in-game weekday, time, period and season, plus your time (US Central). */
export function Clock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    // One in-game minute is 15 real seconds.
    const t = window.setInterval(() => setNow(new Date()), 5000);
    return () => window.clearInterval(t);
  }, []);
  const g = gameTime(now);
  const parts = central.formatToParts(now);
  const local = parts.filter((p) => p.type !== 'timeZoneName').map((p) => p.value).join('').trim();
  const zone = parts.find((p) => p.type === 'timeZoneName')?.value ?? 'CT';
  const night = g.period === 'Night';
  return (
    <div className="clock" role="timer" aria-live="off" aria-label={`In game: ${g.weekday} ${pad2(g.hour)}:${pad2(g.minute)}, ${g.period}, ${g.season}. Your time: ${local} ${zone}.`}>
      <span className={`clock-icon clock-icon--${g.period.toLowerCase()}`} aria-hidden="true">
        {night ? (
          <svg width="14" height="14" viewBox="0 0 24 24"><path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z" fill="currentColor" /></svg>
        ) : (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><circle cx="12" cy="12" r="4.2" fill="currentColor" /><path d="M12 2v2.5M12 19.5V22M2 12h2.5M19.5 12H22M4.9 4.9l1.8 1.8M17.3 17.3l1.8 1.8M4.9 19.1l1.8-1.8M17.3 6.7l1.8-1.8" /></svg>
        )}
      </span>
      <span className="clock-lines">
        <span className="clock-game"><span className="mono">{g.weekday.slice(0, 3)} {pad2(g.hour)}:{pad2(g.minute)}</span> · {g.season}</span>
        <span className="clock-real">You · {local} {zone}</span>
      </span>
    </div>
  );
}

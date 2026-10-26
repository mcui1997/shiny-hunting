import { useEffect, useRef, useState } from 'react';
import { gameTime, nextSeason, pad2, untilLabel, upcomingPhases, type Period } from '../lib/clock';

const TZ = 'America/Chicago';
const central = new Intl.DateTimeFormat('en-US', { timeZone: TZ, hour: 'numeric', minute: '2-digit', timeZoneName: 'short' });
const centralDay = new Intl.DateTimeFormat('en-US', { timeZone: TZ, weekday: 'short', hour: 'numeric', minute: '2-digit' });
const centralDate = new Intl.DateTimeFormat('en-US', { timeZone: TZ, weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

/** Real length of each period (one in-game hour = 15 real minutes). */
const LENGTH: Record<Period, string> = { Morning: '1 h 45 m', Day: '2 h 30 m', Night: '1 h 45 m' };

/**
 * Small header clock: in-game weekday, time and season, plus your time (US Central).
 * Hover, focus or tap it for the schedule: when this period ends and the next few start.
 */
export function Clock() {
  const [now, setNow] = useState(() => new Date());
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    // One in-game minute is 15 real seconds.
    const t = window.setInterval(() => setNow(new Date()), 5000);
    return () => window.clearInterval(t);
  }, []);
  // Tap-to-open (phones): close on outside tap or Escape.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('pointerdown', onDown); document.removeEventListener('keydown', onKey); };
  }, [open]);

  const g = gameTime(now);
  const parts = central.formatToParts(now);
  const local = parts.filter((p) => p.type !== 'timeZoneName').map((p) => p.value).join('').trim();
  const zone = parts.find((p) => p.type === 'timeZoneName')?.value ?? 'CT';
  const phases = upcomingPhases(now, 6);
  const season = nextSeason(now);

  return (
    <div className={`clock-wrap${open ? ' is-open' : ''}`} ref={ref}>
      <button type="button" className="clock" aria-expanded={open} aria-controls="clock-schedule"
        aria-label={`In game ${g.weekday} ${pad2(g.hour)}:${pad2(g.minute)}, ${g.period}, ${g.season}. Your time ${local} ${zone}. Show schedule.`}
        onClick={() => setOpen((o) => !o)}>
        <PeriodIcon period={g.period} />
        <span className="clock-lines" aria-hidden="true">
          <span className="clock-game"><span className="mono">{g.weekday.slice(0, 3)} {pad2(g.hour)}:{pad2(g.minute)}</span> · {g.season}</span>
          <span className="clock-real">You · {local} {zone}</span>
        </span>
      </button>

      <div id="clock-schedule" className="clock-pop" role="region" aria-label="In-game schedule">
        <div className="clock-now">
          <PeriodIcon period={g.period} />
          <div>
            <strong>{g.period}</strong> now
            <div className="small muted">ends {untilLabel(now, phases[0].at)} · {centralDay.format(phases[0].at)}</div>
          </div>
        </div>
        <table className="clock-table">
          <thead><tr><th scope="col">Next</th><th scope="col">Your time ({zone})</th><th scope="col">Starts</th></tr></thead>
          <tbody>
            {phases.map((p) => (
              <tr key={p.at.getTime()} className={`clock-row--${p.period.toLowerCase()}`}>
                <td><span className="clock-dot" aria-hidden="true" />{p.period}<span className="small muted"> · {p.weekday.slice(0, 3)}</span></td>
                <td className="clock-time">{centralDay.format(p.at)}</td>
                <td className="muted">{untilLabel(now, p.at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="small muted clock-foot">
          Morning {LENGTH.Morning}, day {LENGTH.Day}, night {LENGTH.Night} of real time.
          {' '}{season.season} starts {centralDate.format(season.at)} ({untilLabel(now, season.at)}).
        </p>
      </div>
    </div>
  );
}

function PeriodIcon({ period }: { period: Period }) {
  return (
    <span className={`clock-icon clock-icon--${period.toLowerCase()}`} aria-hidden="true">
      {period === 'Night' ? (
        <svg width="14" height="14" viewBox="0 0 24 24"><path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z" fill="currentColor" /></svg>
      ) : (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><circle cx="12" cy="12" r="4.2" fill="currentColor" /><path d="M12 2v2.5M12 19.5V22M2 12h2.5M19.5 12H22M4.9 4.9l1.8 1.8M17.3 17.3l1.8 1.8M4.9 19.1l1.8-1.8M17.3 6.7l1.8-1.8" /></svg>
      )}
    </span>
  );
}

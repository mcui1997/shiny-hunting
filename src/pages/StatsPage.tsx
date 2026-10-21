import { NetWorth } from '../components/NetWorth';
import { Totals } from '../components/Totals';
import { formatWhen } from '../components/ui';
import { parseCount } from '../lib/data';
import { useDerived } from '../lib/derived';
import { href } from '../lib/router';
import { chronological, countsForLuck, currentSpecies, formatCount, oddsOf } from '../lib/stats';
import { useStore } from '../lib/store';
import { DEFAULT_ODDS, ODDS_LABEL } from '../lib/types';

export function StatsPage() {
  const d = useDerived()!;
  const { rows } = useStore();
  const s = d.summary;
  const hunts = chronological(rows.caught).filter((c) => countsForLuck(c) && (parseCount(c.encounters) ?? 0) > 0);
  const max = Math.max(DEFAULT_ODDS * 1.5, ...hunts.map((c) => parseCount(c.encounters)!));

  return (
    <div className="stack" style={{ gap: 24 }}>
      <h1 className="h1">Stats</h1>
      <div className="stats-top">
        <Totals s={s} />
        <NetWorth />
      </div>

      <section className="panel" aria-labelledby="luck-h">
        <h2 id="luck-h" className="h2">Luck</h2>
        {s.luck === null ? (
          <p className="muted" style={{ margin: 0 }}>Log a shiny with its encounter count to see this.</p>
        ) : (
          <>
            <p style={{ margin: 0, fontSize: 17 }}>
              At {formatCount(s.encounters)} encounters you'd expect <strong>{s.expected.toFixed(1)}</strong> shinies. You found <strong>{s.luckCount}</strong>,
              {' '}which makes you luckier than about <strong>{Math.round((s.luckierThan ?? 0) * 100)}%</strong> of hunters with the same count.
            </p>
            <div className="facts">
              {s.fastest && <Fact label="Fastest" value={`${formatCount(parseCount(s.fastest.encounters))} enc`} sub={`${currentSpecies(s.fastest)} · ${formatWhen(s.fastest.caught_at).date}`} />}
              {s.slowest && <Fact label="Longest grind" value={`${formatCount(parseCount(s.slowest.encounters))} enc`} sub={`${currentSpecies(s.slowest)} · ${formatWhen(s.slowest.caught_at).date}`} />}
              <Fact label="Average" value={`${formatCount(Math.round(s.average ?? 0))} enc`} sub={ODDS_LABEL} />
            </div>
          </>
        )}
        <span className="small muted">Odds are {ODDS_LABEL} (PokeMMO's 1 in 30,000 base, boosted by donator status) unless a catch has its own. Traded and bought shinies are left out of luck. Fled ones still count: you found them.</span>
      </section>

      {hunts.length > 0 && (
        <section className="panel" aria-labelledby="grind-h">
          <h2 id="grind-h" className="h2">Encounters per shiny</h2>
          <div className="legend">
            <span><i style={{ background: 'var(--sparkle)' }} />Faster than the odds</span>
            <span><i style={{ background: 'var(--lagoon)' }} />Slower</span>
            <span><i style={{ background: 'var(--ink)', width: 2 }} />1 in {formatCount(DEFAULT_ODDS)} (donator)</span>
          </div>
          <div className="bars" role="list">
            {hunts.map((c) => {
              const enc = parseCount(c.encounters)!;
              const odds = oddsOf(c);
              const sp = d.game.byName.get(currentSpecies(c));
              return (
                <div key={c.id} className="bar-row" role="listitem">
                  <a href={sp ? href.species(sp.id) : undefined} style={{ fontWeight: 600, color: 'var(--ink)', textDecoration: 'none', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.species}</a>
                  <div className="bar-track" aria-hidden="true">
                    <div className={`bar-fill${enc < odds ? ' bar-fill--lucky' : ''}`} style={{ width: `${(enc / max) * 100}%` }} />
                    <div className="bar-mark" style={{ left: `${(odds / max) * 100}%` }} />
                  </div>
                  <span className="mono small" style={{ textAlign: 'right' }}>{formatCount(enc)}</span>
                </div>
              );
            })}
          </div>
        </section>
      )}

    </div>
  );
}

function Fact({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="fact">
      <span className="eyebrow">{label}</span>
      <span className="fact-value">{value}</span>
      {sub && <span className="small muted">{sub}</span>}
    </div>
  );
}

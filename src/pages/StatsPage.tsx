import { NetWorth } from '../components/NetWorth';
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

  const parts = [`${s.kept} kept`, s.sold && `${s.sold} sold`, s.traded && `${s.traded} traded`, s.fled && `${s.fled} fled`].filter(Boolean).join(' · ');
  const when = (c: { caught_at: string }) => formatWhen(c.caught_at).date.replace(/, \d{4}$/, '');

  return (
    <div className="stack" style={{ gap: 24 }}>
      <h1 className="h1">Stats</h1>
      <div className="stats-top">
        <section className="panel overview" aria-labelledby="luck-h">
          <div className="overview-hero">
            <span id="luck-h" className="eyebrow">Luck</span>
            <span className="overview-big">{s.luck === null ? '—' : `${s.luck.toFixed(2)}×`}</span>
            {s.luck !== null && (
              <p className="overview-text">
                You found <strong>{s.luckCount}</strong> where you'd expect <strong>{s.expected.toFixed(1)}</strong> at {ODDS_LABEL}.
                {' '}Luckier than about <strong>{Math.round((s.luckierThan ?? 0) * 100)}%</strong> of hunters with the same count.
              </p>
            )}
          </div>
          <dl className="overview-list">
            <div><dt>Shinies</dt><dd><span className="mono">{s.total}</span><span className="muted small">{parts}</span></dd></div>
            <div><dt>Encounters</dt><dd><span className="mono">{formatCount(s.encounters)}</span></dd></div>
            <div><dt>Per shiny</dt><dd><span className="mono">{s.average ? formatCount(Math.round(s.average)) : '—'}</span><span className="muted small">average</span></dd></div>
            {s.fastest && <div><dt>Fastest</dt><dd><span className="mono">{formatCount(parseCount(s.fastest.encounters))}</span><span className="muted small">{currentSpecies(s.fastest)} · {when(s.fastest)}</span></dd></div>}
            {s.slowest && <div><dt>Longest</dt><dd><span className="mono">{formatCount(parseCount(s.slowest.encounters))}</span><span className="muted small">{currentSpecies(s.slowest)} · {when(s.slowest)}</span></dd></div>}
          </dl>
          <span className="small muted overview-note">Traded and bought shinies are left out of luck; fled ones count.</span>
        </section>
        <NetWorth />
      </div>

      {hunts.length > 0 && (
        <section className="panel" aria-labelledby="grind-h">
          <h2 id="grind-h" className="h2">Encounters per shiny</h2>
          <div className="legend">
            <span><i style={{ background: 'var(--good)' }} />Under {formatCount(DEFAULT_ODDS)}</span>
            <span><i style={{ background: 'var(--over)' }} />Over {formatCount(DEFAULT_ODDS)}</span>
            <span><i style={{ background: 'var(--ink)', width: 2 }} />The odds</span>
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

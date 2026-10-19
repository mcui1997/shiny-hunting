import { Fragment } from 'react';
import { seasonsLabel, shareIn, timesLabel, verdictFor, type Game } from '../lib/game';
import { TIMES, type HordeRow, type Season, type Species } from '../lib/types';
import { Pill } from './ui';

interface HordeLine {
  row: HordeRow;
  times: string[];
  split: [number, number][];
  share: number;
}

/** Split each horde row into one line per distinct split across morning/day/night. */
function hordeLines(sp: Species, season: Season | null): HordeLine[] {
  const out: HordeLine[] = [];
  for (const row of sp.hordes) {
    if (season && !row.seasons.includes(season)) continue;
    const shares = shareIn(row, sp.id);
    const groups = new Map<string, HordeLine>();
    row.split.forEach((split, t) => {
      if (!split.length || shares[t] === 0) return;
      const key = JSON.stringify(split);
      const g = groups.get(key) ?? { row, times: [], split, share: shares[t] };
      g.times.push(TIMES[t]);
      groups.set(key, g);
    });
    out.push(...groups.values());
  }
  return out.sort((a, b) => b.share - a.share || b.row.size - a.row.size || b.times.length - a.times.length || a.row.area.localeCompare(b.row.area));
}

function VerdictPill({ share }: { share: number }) {
  const v = verdictFor(share);
  if (v === 'solo') return <Pill tone="solid">Solo</Pill>;
  if (v === 'shared') return <Pill tone="teal">{share}%</Pill>;
  return <Pill tone="neutral">{share}%</Pill>;
}

export function HuntTables({ sp, game, season }: { sp: Species; game: Game; season: Season | null }) {
  const lines = hordeLines(sp, season);
  const singles = sp.singles.filter((r) => !season || r.seasons.includes(season))
    .sort((a, b) => Math.max(...b.rates) - Math.max(...a.rates));
  const rare = sp.rare.filter((r) => !season || r.seasons.length === 0 || r.seasons.includes(season));
  const best = lines[0]?.share ?? 0;

  if (!lines.length && !singles.length && !rare.length) {
    return <p className="muted" style={{ margin: 0 }}>{season ? `No ${sp.name} encounters in ${season}.` : `No wild ${sp.name} encounters in the game data.`}</p>;
  }

  return (
    <div className="stack" style={{ gap: 16 }}>
      {lines.length > 0 && (
        <div className="table-box">
          <table className="table">
            <thead>
              <tr>
                <th scope="col">Location</th>
                <th scope="col">Season</th>
                <th scope="col">Time</th>
                <th scope="col">Horde</th>
                <th scope="col">Split</th>
                <th scope="col">{sp.name}</th>
              </tr>
            </thead>
            <tbody>
              {lines.map((l, i) => (
                <tr key={i} className={l.share === best && best >= 100 ? 'is-best' : undefined}>
                  <td><strong>{l.row.area}</strong><div className="small muted">{l.row.region} · {l.row.type}</div></td>
                  <td>{seasonsLabel(l.row.seasons)}</td>
                  <td>{timesLabel(l.times)}</td>
                  <td className="mono">{l.row.size}x</td>
                  <td className="split">
                    {l.split.map(([id, pct], j) => (
                      <Fragment key={id}>
                        {j > 0 && <span> · </span>}
                        {id === sp.id ? <b>{game.name(id)} {pct}%</b> : <span>{game.name(id)} {pct}%</span>}
                      </Fragment>
                    ))}
                  </td>
                  <td><VerdictPill share={l.share} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {singles.length > 0 && (
        <details>
          <summary>Single encounters ({singles.length})</summary>
          <div className="table-box">
            <table className="table">
              <thead>
                <tr>
                  <th scope="col">Location</th>
                  <th scope="col">Season</th>
                  <th scope="col">Levels</th>
                  <th scope="col">Morning</th>
                  <th scope="col">Day</th>
                  <th scope="col">Night</th>
                </tr>
              </thead>
              <tbody>
                {singles.map((r, i) => (
                  <tr key={i}>
                    <td><strong>{r.area}</strong><div className="small muted">{r.region} · {r.type}</div></td>
                    <td>{seasonsLabel(r.seasons)}</td>
                    <td className="mono">{r.levels}</td>
                    {r.rates.map((rate, t) => <td key={t} className="mono">{rate ? `${rate}%` : '—'}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      )}

      {rare.length > 0 && (
        <div className="stack" style={{ gap: 6 }}>
          <span className="h3" style={{ fontSize: 16 }}>Special encounters</span>
          <span className="small muted">The game data gives no rate for these.</span>
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            {rare.map((r, i) => (
              <li key={i}>{r.area} ({r.region}) · {r.type} · <strong>{r.kind === '???' ? 'Hidden' : r.kind}</strong>{r.seasons.length ? ` · ${seasonsLabel(r.seasons)}` : ''}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

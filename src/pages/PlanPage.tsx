import { useMemo } from 'react';
import { Sprite } from '../components/Sprite';
import { Pill } from '../components/ui';
import { gameTime } from '../lib/clock';
import { useDerived } from '../lib/derived';
import { onlyLabel, placeType, buildPlan, timesLabel, type PlanCard } from '../lib/plan';
import { usePref } from '../lib/prefs';
import { href } from '../lib/router';
import { PRIORITIES, PRIORITY_LABEL, SEASONS } from '../lib/types';

type Filter = 'all' | 'plan' | 'limited';

/** Every open goal with a 5x horde, by season, in tier order. Gold rows are where the plan hunts it. */
export function PlanPage() {
  const d = useDerived()!;
  const [filter, setFilter] = usePref<Filter>('plan-filter', 'all');
  const plan = useMemo(() => {
    const open = [...d.goals.values()].filter((g) => d.progress.get(g.species)?.kind === 'open');
    return buildPlan(d.game, open);
  }, [d]);

  // Start from the season it is in-game now.
  const now = gameTime(new Date()).season;
  const start = SEASONS.indexOf(now);
  const order = [...SEASONS.slice(start), ...SEASONS.slice(0, start)];
  const show = (c: PlanCard) => filter === 'all' || (filter === 'plan' ? c.planned : !!onlyLabel(c.seasons));

  return (
    <div className="stack" style={{ gap: 18 }}>
      <div className="row row--between">
        <div className="stack" style={{ gap: 2 }}>
          <h1 className="h2">Plan</h1>
          <span className="small muted">Best 5x horde for each goal, by season. Gold rows are where to hunt it.</span>
        </div>
        <div className="segmented segmented--small" role="group" aria-label="Show">
          {([['all', 'All'], ['plan', 'Plan picks'], ['limited', 'Season-limited']] as const).map(([k, label]) => (
            <button key={k} type="button" aria-pressed={filter === k} onClick={() => setFilter(k)}>{label}</button>
          ))}
        </div>
      </div>

      <div className="plan">
        {order.map((season) => {
          const cards = plan[season].filter(show);
          return (
            <section key={season} className={`plan-col plan-col--${season.toLowerCase()}`} aria-label={season}>
              <div className="plan-head">
                <h2 className="h3">{season}{season === now && <> <Pill tone="teal">Now</Pill></>}</h2>
                <span className="mono small muted">{plan[season].filter((c) => c.planned).length} planned</span>
              </div>
              {cards.length === 0 && <p className="small muted" style={{ margin: 0 }}>Nothing here.</p>}
              {PRIORITIES.map((p) => {
                const group = cards.filter((c) => c.priority === p);
                if (!group.length) return null;
                return (
                  <div key={p} className="stack" style={{ gap: 6 }}>
                    <span className={`plan-tier plan-tier--${p}`}>{PRIORITY_LABEL[p]} · {group.length}</span>
                    {group.map((c) => <PlanRow key={c.name} c={c} />)}
                  </div>
                );
              })}
            </section>
          );
        })}
      </div>
    </div>
  );
}

function PlanRow({ c }: { c: PlanCard }) {
  const type = placeType(c.row.type);
  const only = onlyLabel(c.seasons);
  return (
    <a className={`plan-row${c.planned ? ' plan-row--planned' : ''}`} href={href.species(c.id)}>
      <span className="plan-art"><Sprite id={c.id} name={c.name} shiny size={40} /></span>
      <span className="plan-body">
        <span className="plan-top">
          <span className="plan-name">{c.name}</span>
          <span className="plan-share mono">{c.share}%</span>
        </span>
        <span className="plan-where"><b>{c.row.area}</b> · {c.row.region}{type && ` · ${type}`} · {timesLabel(c.times)}</span>
        {(c.via.length > 0 || c.partners.length > 0 || c.planned || only) && (
          <span className="plan-meta">
            {c.via.length > 0 && <span>via {c.via.join(' / ')}</span>}
            {c.partners.length > 0 && <span className="plan-with">+ {c.partners.join(', ')}</span>}
            {c.planned && <Pill tone="gold">Plan</Pill>}
            {only && <Pill tone="ghost">{only}</Pill>}
          </span>
        )}
        {c.others.length > 0 && <span className="plan-horde mono">w/ {c.others.map((o) => `${o.name} ${o.share}%`).join(' · ')}</span>}
      </span>
    </a>
  );
}

import type { ReactNode } from 'react';
import { GoalMenu, MiniTile } from '../components/MiniTile';
import { Totals } from '../components/Totals';
import { Pill, STATUS_LABEL } from '../components/ui';
import { useDerived } from '../lib/derived';
import { href } from '../lib/router';
import { currentSpecies } from '../lib/stats';
import { useStore } from '../lib/store';
import { PRIORITIES, PRIORITY_LABEL, type CatchStatus, type GoalRow } from '../lib/types';

const byName = <T extends { name: string }>(a: T, b: T) => a.name.localeCompare(b.name);

export function HomePage() {
  const d = useDerived()!;
  const { rows } = useStore();
  const s = d.summary;

  // Owned: one tile per species and status (two kept Aggron = one tile ×2; a sold one is its own tile).
  const groups = new Map<string, { name: string; status: CatchStatus; count: number; caughtAs: Set<string> }>();
  for (const c of rows.caught) {
    const name = currentSpecies(c);
    const key = `${name}|${c.status}`;
    const g = groups.get(key) ?? { name, status: c.status as CatchStatus, count: 0, caughtAs: new Set<string>() };
    g.count++;
    if (c.species !== name) g.caughtAs.add(c.species);
    groups.set(key, g);
  }
  const owned = [...groups.values()].sort((a, b) => byName(a, b) || (a.status === 'kept' ? -1 : b.status === 'kept' ? 1 : 0));

  // Planned: goals not yet owned.
  const planned = rows.goals.filter((g) => d.progress.get(g.species)?.kind !== 'done');

  return (
    <div className="stack" style={{ gap: 28 }}>
      <Totals s={s} />

      <section aria-label="Tier list" className="stack" style={{ gap: 12 }}>
        <div className="row row--between">
          <h1 className="h2">Shinies</h1>
          <div className="row" style={{ gap: 8 }}>
            <a className="btn btn--small" href={href.newCatch()}>Log a shiny</a>
          </div>
        </div>

        <div className="tiers">
          <TierRow tier="owned" label="Owned" count={s.total}>
            {owned.length === 0 ? <span className="tier-empty">No shinies yet. Your first one goes here.</span> : owned.map((g) => {
              const sp = d.game.byName.get(g.name);
              const kept = g.status === 'kept';
              if (!sp) return null;
              return (
                <MiniTile key={`${g.name}|${g.status}`} sp={sp} tone={kept ? 'owned' : 'gone'} tags={<>
                  {g.count > 1 && <Pill tone="gold">×{g.count}</Pill>}
                  {!kept && <Pill tone="neutral">{STATUS_LABEL[g.status]}</Pill>}
                </>} />
              );
            })}
          </TierRow>
          {PRIORITIES.map((p) => {
            const items = planned.filter((g) => g.priority === p).map((g) => ({ ...g, name: g.species })).sort(byName);
            return (
              <TierRow key={p} tier={p} label={PRIORITY_LABEL[p]} count={items.length}>
                {items.length === 0
                  ? <span className="tier-empty">Empty. Use ⋯ on any tile here or in the Dex.</span>
                  : items.map((g) => <PlannedTile key={g.species} goal={g} />)}
              </TierRow>
            );
          })}
        </div>
      </section>
    </div>
  );
}

function TierRow({ tier, label, count, children }: { tier: string; label: string; count: number; children: ReactNode }) {
  const short = label.replace(/ tier$/, '');
  return (
    <section className={`tier tier--${tier}`} aria-label={`${label}, ${count}`}>
      <div className="tier-label">
        <span className="tier-name">{short}</span>
        <span className="tier-count">{count}</span>
      </div>
      <div className="mini-grid tier-items">{children}</div>
    </section>
  );
}

function PlannedTile({ goal }: { goal: GoalRow }) {
  const d = useDerived()!;
  const sp = d.game.byName.get(goal.species)!;
  const progress = d.progress.get(goal.species);
  return (
    <MiniTile sp={sp} tags={progress?.kind === 'evolve' && <Pill tone="teal">Have {progress.from}</Pill>}
      menu={<GoalMenu species={goal.species} goal={goal} />} />
  );
}

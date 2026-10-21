import { useState } from 'react';
import { GoalMenu, MiniTile } from '../components/MiniTile';
import { Totals } from '../components/Totals';
import { Pill, STATUS_LABEL } from '../components/ui';
import { makeResolver } from '../lib/data';
import { useDerived } from '../lib/derived';
import { href } from '../lib/router';
import { currentSpecies } from '../lib/stats';
import { useStore } from '../lib/store';
import { PRIORITIES, PRIORITY_LABEL, type CatchStatus, type GoalRow } from '../lib/types';

const GROUPS = ['current', 'future', ''];
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

      <section aria-labelledby="owned-h" className="stack" style={{ gap: 12 }}>
        <div className="row row--between">
          <h2 id="owned-h" className="h2">Owned <span className="count">{s.total}</span></h2>
          <a className="btn btn--small" href={href.newCatch()}>Log a shiny</a>
        </div>
        {owned.length === 0 ? (
          <p className="empty">No shinies yet. Your first one goes here.</p>
        ) : (
          <div className="mini-grid">
            {owned.map((g) => {
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
          </div>
        )}
      </section>

      <section aria-labelledby="planned-h" className="stack" style={{ gap: 16 }}>
        <div className="row row--between">
          <h2 id="planned-h" className="h2">Goals <span className="count">{planned.length}</span></h2>
          <AddGoal />
        </div>
        {planned.length === 0 && <p className="empty">No goals yet. Add one, or use + Goal on any Pokémon's page.</p>}
        {GROUPS.map((p) => {
          const label = PRIORITY_LABEL[p];
          const items = planned.filter((g) => g.priority === p).map((g) => ({ ...g, name: g.species })).sort(byName);
          if (!items.length) return null;
          return (
            <div key={p || 'none'} className="prio-row">
              <h3 className="prio-label">{label} <span className="count">{items.length}</span></h3>
              <div className="mini-grid">
                {items.map((g) => <PlannedTile key={g.species} goal={g} />)}
              </div>
            </div>
          );
        })}
      </section>
    </div>
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

function AddGoal() {
  const d = useDerived()!;
  const store = useStore();
  const [text, setText] = useState('');
  const [priority, setPriority] = useState('');
  const [error, setError] = useState<string | null>(null);

  function add() {
    if (!text.trim()) return;
    const name = makeResolver(d.game.names)(text);
    if (!name) { setError(`"${text.slice(0, 40)}" isn't a Pokémon name I recognize.`); return; }
    if (d.goals.has(name)) { setError(`${name} is already a goal.`); return; }
    store.saveGoal({ species: name, priority, notes: '' });
    setText('');
    setError(null);
  }

  return (
    <form className="add-goal" onSubmit={(e) => { e.preventDefault(); add(); }}>
      <label className="sr-only" htmlFor="add-goal">Add a goal</label>
      <input id="add-goal" className="input input--compact" list="species-names" maxLength={40} placeholder="Add a goal…" value={text}
        aria-invalid={error ? true : undefined} aria-describedby={error ? 'add-goal-error' : undefined}
        onChange={(e) => { setText(e.target.value); setError(null); }} />
      <label className="sr-only" htmlFor="add-goal-p">Priority</label>
      <select id="add-goal-p" className="select select--compact" value={priority} onChange={(e) => setPriority(e.target.value)}>
        {PRIORITIES.map((p) => <option key={p} value={p}>{PRIORITY_LABEL[p]}</option>)}
        <option value="">{PRIORITY_LABEL['']}</option>
      </select>
      <button type="submit" className="btn btn--small btn--primary">Add</button>
      {error && <span id="add-goal-error" className="small" role="alert" style={{ color: 'var(--ember-ink)', flexBasis: '100%' }}>{error}</span>}
      <datalist id="species-names">{d.game.names.map((n) => <option key={n} value={n} />)}</datalist>
    </form>
  );
}

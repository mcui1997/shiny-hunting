import { useState } from 'react';
import { Sprite } from '../components/Sprite';
import { Pill } from '../components/ui';
import { makeResolver } from '../lib/csv';
import { useDerived } from '../lib/derived';
import { bestSpotLabel, hordeSpots } from '../lib/game';
import { sortGoals } from '../lib/goals';
import { href } from '../lib/router';
import { useStore } from '../lib/store';
import { GOAL_STATUSES, PRIORITIES, type GoalRow } from '../lib/types';

const GROUPS: [string, string][] = [['P1', 'Priority 1'], ['P2', 'Priority 2'], ['P3', 'Priority 3'], ['', 'No priority yet']];

export function GoalsPage() {
  const d = useDerived()!;
  const store = useStore();
  const [showDone, setShowDone] = useState(false);
  const [adding, setAdding] = useState('');
  const [addError, setAddError] = useState<string | null>(null);
  const goals = sortGoals(store.rows.goals);
  const done = goals.filter((g) => d.progress.get(g.species)?.kind === 'done');
  const open = goals.filter((g) => d.progress.get(g.species)?.kind !== 'done');

  function add() {
    const name = makeResolver(d.game.names)(adding);
    if (!name) { setAddError(`"${adding}" isn't a Pokémon name I recognize.`); return; }
    if (d.goals.has(name)) { setAddError(`${name} is already a goal.`); return; }
    store.saveGoal({ species: name, priority: '', status: 'planned', notes: '' });
    setAdding('');
    setAddError(null);
  }

  return (
    <div className="stack" style={{ gap: 24 }}>
      <div className="row row--between">
        <div>
          <h1 className="h1">Goals</h1>
          <span className="muted">{open.length} open · {done.length} done</span>
        </div>
        <form className="row" style={{ alignItems: 'flex-end' }} onSubmit={(e) => { e.preventDefault(); add(); }}>
          <div className="field">
            <label htmlFor="add-goal">Add a goal</label>
            <input id="add-goal" maxLength={40} className="input" list="species-names" placeholder="Pokémon name" value={adding}
              aria-invalid={addError ? true : undefined} aria-describedby={addError ? 'add-goal-error' : undefined}
              onChange={(e) => { setAdding(e.target.value); setAddError(null); }} />
          </div>
          <button type="submit" className="btn btn--primary">Add</button>
        </form>
      </div>
      {addError && <p id="add-goal-error" className="banner banner--warn" style={{ margin: 0 }}>{addError}</p>}
      <datalist id="species-names">{d.game.names.map((n) => <option key={n} value={n} />)}</datalist>

      {GROUPS.map(([p, label]) => {
        const items = open.filter((g) => g.priority === p);
        if (!items.length) return null;
        return (
          <section key={p} className="stack" aria-label={label}>
            <h2 className="h2 group-title">{label} <span className="small muted" style={{ fontFamily: 'var(--body)', fontWeight: 600 }}>{items.length}</span></h2>
            <div className="list">{items.map((g) => <GoalItem key={g.species} goal={g} />)}</div>
          </section>
        );
      })}

      {done.length > 0 && (
        <section className="stack">
          <button type="button" className="btn" style={{ alignSelf: 'flex-start' }} aria-expanded={showDone} onClick={() => setShowDone((s) => !s)}>
            {showDone ? 'Hide' : 'Show'} {done.length} done
          </button>
          {showDone && <div className="list">{done.map((g) => <GoalItem key={g.species} goal={g} />)}</div>}
        </section>
      )}
    </div>
  );
}

function GoalItem({ goal }: { goal: GoalRow }) {
  const d = useDerived()!;
  const store = useStore();
  const sp = d.game.byName.get(goal.species)!;
  const progress = d.progress.get(goal.species);
  // Best horde across this species and everything earlier in its line: highest share, then 5x over 3x.
  const fam = d.game.family(sp.id);
  const spotFor = [sp, ...fam.filter((f) => f.id !== sp.id && d.game.canBecome(f.id, sp.id))]
    .map((f) => ({ f, top: hordeSpots(f)[0], label: bestSpotLabel(f) }))
    .filter((x) => x.top)
    .sort((a, b) => b.top.best - a.top.best || b.top.row.size - a.top.row.size || (a.f.id === sp.id ? -1 : 0))[0];
  const idBase = `goal-${sp.id}`;

  return (
    <article className={`entry${progress?.kind === 'done' ? ' entry--gilt' : ''}`}>
      <a className="entry-tile" href={href.species(sp.id)} aria-label={`${sp.name} details`}>
        <Sprite id={sp.id} name={sp.name} shiny size={80} />
      </a>
      <div className="entry-body">
        <div className="row" style={{ gap: 8 }}>
          <a className="h3" href={href.species(sp.id)} style={{ color: 'var(--ink)', textDecoration: 'none' }}>{sp.name}</a>
          {progress?.kind === 'done' && <Pill tone="gold">Done</Pill>}
          {progress?.kind === 'evolve' && <Pill tone="teal">Have {progress.from}, evolve to finish</Pill>}
          {goal.status === 'hunting' && progress?.kind === 'open' && <Pill tone="ember">Hunting</Pill>}
          {goal.status === 'paused' && progress?.kind === 'open' && <Pill tone="neutral">Paused</Pill>}
        </div>
        <span className="small muted">
          {spotFor ? <>{spotFor.f.id !== sp.id && <>As {spotFor.f.name}: </>}{spotFor.label}</> : 'No horde spot in the data. Check the page for other encounters.'}
        </span>
        {d.notes.get(sp.name) && <span className="small" style={{ whiteSpace: 'pre-line' }}>{d.notes.get(sp.name)}</span>}
      </div>
      <div className="entry-actions" style={{ flexWrap: 'wrap' }}>
        <label className="sr-only" htmlFor={`${idBase}-p`}>Priority for {sp.name}</label>
        <select id={`${idBase}-p`} className="select" style={{ width: 'auto', minHeight: 36 }} value={goal.priority}
          onChange={(e) => store.saveGoal({ ...goal, priority: e.target.value })}>
          <option value="">No priority</option>
          {PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}
        </select>
        <label className="sr-only" htmlFor={`${idBase}-s`}>Status for {sp.name}</label>
        <select id={`${idBase}-s`} className="select" style={{ width: 'auto', minHeight: 36 }} value={goal.status}
          onChange={(e) => store.saveGoal({ ...goal, status: e.target.value })}>
          {GOAL_STATUSES.map((s) => <option key={s} value={s}>{s[0].toUpperCase() + s.slice(1)}</option>)}
        </select>
        <button type="button" className="btn btn--small btn--ghost" onClick={() => confirm(`Remove ${sp.name} from your goals?`) && store.deleteGoal(sp.name)}>
          Remove<span className="sr-only"> {sp.name}</span>
        </button>
      </div>
    </article>
  );
}

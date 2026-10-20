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

      {open.length === 0 && done.length === 0 && <p className="empty">No goals yet. Add one above.</p>}

      {GROUPS.map(([p, label]) => {
        const items = open.filter((g) => g.priority === p);
        if (!items.length) return null;
        return (
          <section key={p || 'none'} className="stack" style={{ gap: 10 }} aria-label={label}>
            <h2 className="h2">{label}</h2>
            <GoalTable goals={items} />
          </section>
        );
      })}

      {done.length > 0 && (
        <section className="stack" style={{ gap: 10 }}>
          <button type="button" className="btn" style={{ alignSelf: 'flex-start' }} aria-expanded={showDone} onClick={() => setShowDone((s) => !s)}>
            {showDone ? 'Hide' : 'Show'} {done.length} done
          </button>
          {showDone && <GoalTable goals={done} />}
        </section>
      )}
    </div>
  );
}

function GoalTable({ goals }: { goals: GoalRow[] }) {
  return (
    <div className="owned-list" role="list">
      <div className="goal-head" aria-hidden="true">
        <span />
        <span>Pokémon</span>
        <span>Best spot</span>
        <span>Priority</span>
        <span>Status</span>
        <span />
      </div>
      {goals.map((g) => <GoalRowItem key={g.species} goal={g} />)}
    </div>
  );
}

function GoalRowItem({ goal }: { goal: GoalRow }) {
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
  const isDone = progress?.kind === 'done';

  return (
    <article role="listitem" className={`goal-row${isDone ? '' : ' goal-row--open'}`}>
      <a className="owned-tile" href={href.species(sp.id)} aria-label={`${sp.name} details`} tabIndex={-1}>
        <Sprite id={sp.id} name={sp.name} shiny size={56} />
      </a>
      <div className="owned-name">
        <div className="row" style={{ gap: 8, flexWrap: 'nowrap', minWidth: 0 }}>
          <a className="owned-title" href={href.species(sp.id)}>{sp.name}</a>
          {isDone && <Pill tone="gold">Done</Pill>}
          {!isDone && goal.status === 'hunting' && <Pill tone="ember">Hunting</Pill>}
          {!isDone && goal.status === 'paused' && <Pill tone="neutral">Paused</Pill>}
        </div>
        {progress?.kind === 'evolve' && <span className="small" style={{ color: 'var(--lagoon-deep)', fontWeight: 600 }}>Have {progress.from}, evolve to finish</span>}
      </div>
      <div className="owned-cell goal-spot">
        {spotFor ? (
          <>
            {spotFor.f.id !== sp.id && <span className="small muted">As {spotFor.f.name}</span>}
            <span>{spotFor.label}</span>
          </>
        ) : (
          <span className="muted">No horde spot. See its page.</span>
        )}
      </div>
      <div className="goal-priority">
        <label className="sr-only" htmlFor={`${idBase}-p`}>Priority for {sp.name}</label>
        <select id={`${idBase}-p`} className="select select--compact" value={goal.priority}
          onChange={(e) => store.saveGoal({ ...goal, priority: e.target.value })}>
          <option value="">None</option>
          {PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}
        </select>
      </div>
      <div className="goal-status">
        <label className="sr-only" htmlFor={`${idBase}-s`}>Status for {sp.name}</label>
        <select id={`${idBase}-s`} className="select select--compact" value={goal.status}
          onChange={(e) => store.saveGoal({ ...goal, status: e.target.value })}>
          {GOAL_STATUSES.map((s) => <option key={s} value={s}>{s[0].toUpperCase() + s.slice(1)}</option>)}
        </select>
      </div>
      <button type="button" className="btn btn--small btn--ghost goal-remove"
        onClick={() => confirm(`Remove ${sp.name} from your goals?`) && store.deleteGoal(sp.name)}>
        Remove<span className="sr-only"> {sp.name}</span>
      </button>
    </article>
  );
}

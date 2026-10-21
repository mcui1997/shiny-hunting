import { useEffect, useRef, useState } from 'react';
import { Sprite } from '../components/Sprite';
import { Pill, SparkleIcon, STATUS_LABEL } from '../components/ui';
import { makeResolver } from '../lib/data';
import { useDerived } from '../lib/derived';
import { href } from '../lib/router';
import { currentSpecies, formatCount } from '../lib/stats';
import { useStore } from '../lib/store';
import { PRIORITIES, type CatchStatus, type GoalRow } from '../lib/types';
import { GoalControls } from '../components/GoalControls';

const PRIORITY_ROWS: [string, string][] = [['P1', 'P1'], ['P2', 'P2'], ['P3', 'P3'], ['', 'No priority']];
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
      <p className="home-stats">
        <span><strong>{s.total}</strong> {s.total === 1 ? 'shiny' : 'shinies'}</span>
        <span><strong className="mono">{formatCount(s.encounters)}</strong> encounters</span>
        {s.luck !== null && <span>luck <strong className="mono">{s.luck.toFixed(2)}×</strong></span>}
        <span><strong>{planned.length}</strong> planned</span>
      </p>

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
              return (
                <a key={`${g.name}|${g.status}`} className={`mini${kept ? ' mini--owned' : ' mini--gone'}`} href={sp ? href.species(sp.id) : href.caught()}>
                  <span className="mini-art">
                    {sp && <Sprite id={sp.id} name={g.name} shiny size={64} />}
                    {kept && <SparkleIcon size={14} className="sparkle" />}
                  </span>
                  <span className="mini-name">{g.name}</span>
                  <span className="mini-tags">
                    {g.count > 1 && <Pill tone="gold">×{g.count}</Pill>}
                    {!kept && <Pill tone="neutral">{STATUS_LABEL[g.status]}</Pill>}
                  </span>
                </a>
              );
            })}
          </div>
        )}
      </section>

      <section aria-labelledby="planned-h" className="stack" style={{ gap: 16 }}>
        <div className="row row--between">
          <h2 id="planned-h" className="h2">Planned <span className="count">{planned.length}</span></h2>
          <AddGoal />
        </div>
        {planned.length === 0 && <p className="empty">Nothing planned. Add a goal, or use + Goal on any Pokémon's page.</p>}
        {PRIORITY_ROWS.map(([p, label]) => {
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
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Close the quick editor on outside click or Escape.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); };
  }, [open]);

  return (
    <div className="mini-wrap" ref={ref}>
      <a className="mini" href={href.species(sp.id)}>
        <span className="mini-art"><Sprite id={sp.id} name={sp.name} shiny size={64} /></span>
        <span className="mini-name">{sp.name}</span>
        <span className="mini-tags">
          {goal.status === 'hunting' && <Pill tone="ember">Hunting</Pill>}
          {progress?.kind === 'evolve' && <Pill tone="teal">Have {progress.from}</Pill>}
        </span>
      </a>
      <button type="button" className="mini-more" aria-label={`Edit ${sp.name} goal`} aria-expanded={open} onClick={() => setOpen((o) => !o)}>⋯</button>
      {open && (
        <div className="mini-pop" role="dialog" aria-label={`${sp.name} goal`}>
          <GoalControls goal={goal} />
        </div>
      )}
    </div>
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
    store.saveGoal({ species: name, priority, status: 'planned', notes: '' });
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
        <option value="">No priority</option>
        {PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}
      </select>
      <button type="submit" className="btn btn--small btn--primary">Add</button>
      {error && <span id="add-goal-error" className="small" role="alert" style={{ color: 'var(--ember-ink)', flexBasis: '100%' }}>{error}</span>}
      <datalist id="species-names">{d.game.names.map((n) => <option key={n} value={n} />)}</datalist>
    </form>
  );
}

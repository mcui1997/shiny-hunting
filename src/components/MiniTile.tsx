import { useEffect, useRef, useState, type ReactNode } from 'react';
import { href } from '../lib/router';
import { useStore } from '../lib/store';
import { PRIORITIES, PRIORITY_SHORT, type GoalRow, type Species } from '../lib/types';
import { GoalControls } from './GoalControls';
import { Sprite } from './Sprite';
import { HuntBadge, SparkleIcon } from './ui';

/**
 * Small Pokémon tile used on Home and in the Dex. `tone` sets the frame: gold for a shiny you
 * own, faded for one you sold/traded/lost. With `menu`, a ⋯ button opens a small editor.
 */
export function MiniTile({ sp, shiny = true, tone, tags, menu, label }: {
  sp: Species;
  shiny?: boolean;
  tone?: 'owned' | 'gone';
  tags?: ReactNode;
  menu?: ReactNode;
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const { game } = useStore();

  // Close the editor on outside click or Escape.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); };
  }, [open]);

  const tile = (
    <a className={`mini${tone ? ` mini--${tone}` : ''}`} href={href.species(sp.id)}>
      <span className="mini-art">
        <Sprite id={sp.id} name={sp.name} shiny={shiny} size={64} />
        {tone === 'owned' && shiny && <SparkleIcon size={14} className="sparkle" />}
        {game && <HuntBadge kind={game.huntKind(sp)} />}
      </span>
      <span className="mini-name">{label ?? sp.name}</span>
      <span className="mini-tags">{tags}</span>
    </a>
  );
  if (!menu) return tile;
  return (
    <div className="mini-wrap" ref={ref}>
      {tile}
      <button type="button" className="mini-more" aria-label={`Goal options for ${sp.name}`} aria-expanded={open} onClick={() => setOpen((o) => !o)}>⋯</button>
      {open && <div className="mini-pop" role="dialog" aria-label={`${sp.name} goal`}>{menu}</div>}
    </div>
  );
}

/** Edit an existing goal, or add the species to one of the groups. */
export function GoalMenu({ species, goal }: { species: string; goal?: GoalRow }) {
  const store = useStore();
  if (goal) return <GoalControls goal={goal} />;
  return (
    <div className="goal-controls">
      <span className="small muted" style={{ fontWeight: 600 }}>Add to</span>
      {PRIORITIES.map((p) => (
        <button key={p} type="button" className="btn btn--small" onClick={() => store.saveGoal({ species, priority: p, notes: '' })}>
          {PRIORITY_SHORT[p]}
        </button>
      ))}
    </div>
  );
}

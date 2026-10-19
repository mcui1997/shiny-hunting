import { useState } from 'react';
import { Sprite } from '../components/Sprite';
import { catchStatusPill, formatWhen } from '../components/ui';
import { useDerived } from '../lib/derived';
import { href } from '../lib/router';
import { chronological, currentSpecies, formatCount, formatValue } from '../lib/stats';
import { parseValue } from '../lib/csv';
import { useStore } from '../lib/store';

export function CaughtPage() {
  const d = useDerived()!;
  const { rows } = useStore();
  const [order, setOrder] = useState<'newest' | 'oldest'>('newest');
  const list = chronological(rows.caught);
  if (order === 'newest') list.reverse();

  return (
    <div className="stack" style={{ gap: 20 }}>
      <div className="row row--between">
        <div>
          <h1 className="h1">Caught</h1>
          <span className="muted">{rows.caught.length} shinies, newest first by default.</span>
        </div>
        <div className="row">
          <div className="segmented" role="group" aria-label="Order">
            <button type="button" aria-pressed={order === 'newest'} onClick={() => setOrder('newest')}>Newest</button>
            <button type="button" aria-pressed={order === 'oldest'} onClick={() => setOrder('oldest')}>Oldest</button>
          </div>
          <a className="btn btn--primary" href={href.newCatch()}>Log a shiny</a>
        </div>
      </div>

      {list.length === 0 ? (
        <p className="empty">No shinies yet. Your first one goes here.</p>
      ) : (
        <div className="list">
          {list.map((c) => {
            const now = currentSpecies(c);
            const sp = d.game.byName.get(now);
            const when = formatWhen(c.caught_at);
            const gilt = c.status === 'kept';
            return (
              <article key={c.id} className={`entry${gilt ? ' entry--gilt' : ''}`}>
                <a className="entry-tile" href={sp ? href.species(sp.id) : undefined} aria-label={`${now} details`}>
                  {sp ? <Sprite id={sp.id} name={now} shiny size={80} /> : <span className="muted">?</span>}
                </a>
                <div className="entry-body">
                  <div className="row" style={{ gap: 8 }}>
                    <span className="mono small muted">#{d.shinyNumber.get(c.id)}</span>
                    <a href={sp ? href.species(sp.id) : undefined} className="h3" style={{ color: 'var(--ink)', textDecoration: 'none' }}>{now}</a>
                    {now !== c.species && <span className="small muted">caught as {c.species}</span>}
                    {catchStatusPill(c.status)}
                  </div>
                  <span className="small muted">
                    {when.date}{when.time ? `, ${when.time}` : ''}
                    {c.encounters && <> · <span className="mono" style={{ color: 'var(--ink)', fontWeight: 700 }}>{formatCount(Number(c.encounters))}</span> enc</>}
                    {c.method && ` · ${c.method}`}
                    {c.location && ` · ${c.location}`}
                    {c.est_value && ` · ${formatValue(parseValue(c.est_value))}`}
                  </span>
                  {c.thoughts && <p className="entry-thought">“{c.thoughts}”</p>}
                </div>
                <div className="entry-actions">
                  <a className="btn btn--small" href={href.editCatch(c.id)}>Edit<span className="sr-only"> {now}</span></a>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}

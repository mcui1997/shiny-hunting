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
          <h1 className="h1">Owned</h1>
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
        <div className="owned-list" role="list">
          <div className="owned-head" aria-hidden="true">
            <span />
            <span>Shiny</span>
            <span>Caught</span>
            <span className="num">Encounters</span>
            <span>Method · Location</span>
            <span className="num">Value</span>
            <span />
          </div>
          {list.map((c) => {
            const now = currentSpecies(c);
            const sp = d.game.byName.get(now);
            const when = formatWhen(c.caught_at);
            const where = [c.method, c.location].filter(Boolean).join(' · ');
            return (
              <article key={c.id} role="listitem" className={`owned-row${c.status === 'kept' ? '' : ' owned-row--gone'}`}>
                <a className="owned-tile" href={sp ? href.species(sp.id) : undefined} aria-label={`${now} details`} tabIndex={-1}>
                  {sp ? <Sprite id={sp.id} name={now} shiny size={56} /> : <span className="muted">?</span>}
                </a>
                <div className="owned-name">
                  <div className="row" style={{ gap: 8, flexWrap: 'nowrap', minWidth: 0 }}>
                    <span className="mono small muted">#{d.shinyNumber.get(c.id)}</span>
                    <a href={sp ? href.species(sp.id) : undefined} className="owned-title">{now}</a>
                    {catchStatusPill(c.status)}
                  </div>
                  {now !== c.species && <span className="small muted">caught as {c.species}</span>}
                </div>
                <div className="owned-cell owned-date">
                  <span>{when.date}</span>
                  {when.time && <span className="small muted">{when.time}</span>}
                </div>
                <div className="owned-cell num owned-encs">
                  <span className="mono owned-enc">{c.encounters ? formatCount(Number(c.encounters)) : '—'}</span>
                  <span className="small muted owned-label">encounters</span>
                </div>
                <div className="owned-cell owned-where">{where || <span className="muted">—</span>}</div>
                <div className="owned-cell num owned-value">{c.est_value ? formatValue(parseValue(c.est_value)) : '—'}</div>
                <a className="btn btn--small owned-edit" href={href.editCatch(c.id)}>Edit<span className="sr-only"> {now}</span></a>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}

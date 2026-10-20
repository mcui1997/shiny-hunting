import { useState } from 'react';
import { Sprite } from '../components/Sprite';
import { catchStatusPill, formatWhen } from '../components/ui';
import { useDerived } from '../lib/derived';
import { href } from '../lib/router';
import { chronological, currentSpecies, formatCount } from '../lib/stats';
import { usePref } from '../lib/prefs';
import { useStore } from '../lib/store';
import { DEFAULT_TAGS } from '../lib/types';

export function CaughtPage() {
  const d = useDerived()!;
  const { rows } = useStore();
  const [order, setOrder] = useState<'newest' | 'oldest'>('newest');
  const [tag, setTag] = usePref<string>('owned-tag', 'all');
  const all = chronological(rows.caught);
  if (order === 'newest') all.reverse();

  // Category chips: every tag in use (plus the suggested ones), and Untagged.
  const counts = new Map<string, number>();
  for (const c of rows.caught) counts.set(c.tag, (counts.get(c.tag) ?? 0) + 1);
  const tags = [...new Set([...DEFAULT_TAGS, ...rows.caught.map((c) => c.tag).filter(Boolean)])].sort();
  const active = tag === 'all' || tag === '' || tags.includes(tag) ? tag : 'all';
  const list = active === 'all' ? all : all.filter((c) => c.tag === active);
  const chip = (key: string, label: string, n: number) => (
    <button key={key || 'untagged'} type="button" className="chip" aria-pressed={active === key} onClick={() => setTag(key)}>
      {label} <span className="chip-count">{n}</span>
    </button>
  );

  return (
    <div className="stack" style={{ gap: 20 }}>
      <div className="row row--between">
        <div>
          <h1 className="h1">Owned</h1>
          <span className="muted">{rows.caught.length} shinies{active !== 'all' ? ` · showing ${list.length}` : ''}</span>
        </div>
        <div className="row">
          <div className="segmented" role="group" aria-label="Order">
            <button type="button" aria-pressed={order === 'newest'} onClick={() => setOrder('newest')}>Newest</button>
            <button type="button" aria-pressed={order === 'oldest'} onClick={() => setOrder('oldest')}>Oldest</button>
          </div>
          <a className="btn btn--primary" href={href.newCatch()}>Log a shiny</a>
        </div>
      </div>

      {rows.caught.length > 0 && (
        <div className="chips" role="group" aria-label="Category">
          {chip('all', 'All', rows.caught.length)}
          {tags.map((t) => chip(t, t[0].toUpperCase() + t.slice(1), counts.get(t) ?? 0))}
          {chip('', 'Untagged', counts.get('') ?? 0)}
        </div>
      )}

      {list.length === 0 ? (
        <p className="empty">{rows.caught.length ? 'Nothing in this category yet. Tag a shiny from its Edit page.' : 'No shinies yet. Your first one goes here.'}</p>
      ) : (
        <div className="owned-list" role="list">
          <div className="owned-head" aria-hidden="true">
            <span />
            <span>Shiny</span>
            <span>Caught</span>
            <span className="num">Encounters</span>
            <span>Method · Location</span>
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
                  <div className="row" style={{ gap: '4px 8px', minWidth: 0 }}>
                    <span className="mono small muted">#{d.shinyNumber.get(c.id)}</span>
                    <a href={sp ? href.species(sp.id) : undefined} className="owned-title">{now}</a>
                    {catchStatusPill(c.status)}
                    {c.tag && <span className="pill pill--tag">{c.tag}</span>}
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
                <a className="btn btn--small owned-edit" href={href.editCatch(c.id)}>Edit<span className="sr-only"> {now}</span></a>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}

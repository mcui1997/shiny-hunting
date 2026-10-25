import { useState } from 'react';
import { Sprite } from '../components/Sprite';
import { catchStatusPill, formatWhen } from '../components/ui';
import { LIMITS } from '../lib/data';
import { useDerived } from '../lib/derived';
import { suggestedNote } from '../lib/notes';
import { href } from '../lib/router';
import { chronological, currentSpecies, formatCount } from '../lib/stats';
import { useStore } from '../lib/store';
import { SCREENSHOT_NAME, type CatchRow } from '../lib/types';

const SHOTS = `${import.meta.env.BASE_URL}screenshots/`;

export function CaughtPage() {
  const { rows } = useStore();
  const [order, setOrder] = useState<'newest' | 'oldest'>('newest');
  const [open, setOpen] = useState<Set<string>>(new Set());
  const list = chronological(rows.caught);
  if (order === 'newest') list.reverse();
  const toggle = (id: string) => setOpen((s) => {
    const n = new Set(s);
    if (n.has(id)) n.delete(id); else n.add(id);
    return n;
  });

  return (
    <div className="stack" style={{ gap: 20 }}>
      <div className="row row--between">
        <div>
          <h1 className="h1">Owned</h1>
          <span className="muted">{rows.caught.length} shinies</span>
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
        <ul className="log" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
          {list.map((c) => <LogItem key={c.id} c={c} open={open.has(c.id)} onToggle={() => toggle(c.id)} />)}
        </ul>
      )}
    </div>
  );
}

function LogItem({ c, open, onToggle }: { c: CatchRow; open: boolean; onToggle: () => void }) {
  const d = useDerived()!;
  const now = currentSpecies(c);
  const sp = d.game.byName.get(now);
  const when = formatWhen(c.caught_at);
  const detailId = `log-${c.id}`;
  return (
    <li className={`log-item${c.status === 'kept' ? '' : ' log-item--gone'}`}>
      <button type="button" className="log-row" aria-expanded={open} aria-controls={detailId} onClick={onToggle}>
        <span className="log-tile">{sp ? <Sprite id={sp.id} name={now} shiny size={48} /> : null}</span>
        <span className="log-name">
          <span className="log-title"><span>{now}</span>{c.status !== 'kept' && catchStatusPill(c.status)}</span>
          {now !== c.species && <span className="small muted">caught as {c.species}</span>}
        </span>
        <span className="log-when">{when.date}{when.time ? ` · ${when.time}` : ''}</span>
        <span className="log-enc">{c.encounters ? formatCount(Number(c.encounters)) : '—'}</span>
        <svg className="log-chev" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6" /></svg>
      </button>
      {open && <LogDetail id={detailId} c={c} />}
    </li>
  );
}

function LogDetail({ id, c }: { id: string; c: CatchRow }) {
  const d = useDerived()!;
  const sp = d.game.byName.get(currentSpecies(c));
  const shot = c.screenshot && SCREENSHOT_NAME.test(c.screenshot) ? SHOTS + c.screenshot : null;
  const facts: [string, string][] = [
    ['Method', c.method ? c.method.replace(/^./, (m) => m.toUpperCase()) : ''],
    ['Location', c.location],
    ['Season', c.season],
    ['Nature', c.nature],
    ['Encounters', c.encounters ? formatCount(Number(c.encounters)) : ''],
    ['Shiny #', String(d.shinyNumber.get(c.id) ?? '')],
  ];
  return (
    <div id={id} className="log-detail">
      {shot ? (
        <a className="log-shot" href={shot} target="_blank" rel="noopener" aria-label="Open the screenshot full size">
          <img src={shot} alt={`Battle screenshot: ${c.species} at ${c.location || 'unknown location'}`} loading="lazy" decoding="async" />
        </a>
      ) : (
        <div className="log-noshot">No screenshot yet. Send it to Claude to add it.</div>
      )}
      <div className="log-side">
        <dl className="log-facts">
          {facts.filter(([, v]) => v).map(([k, v]) => <div key={k} style={{ display: 'contents' }}><dt>{k}</dt><dd>{v}</dd></div>)}
        </dl>
        <Note c={c} suggestion={suggestedNote(sp)} />
        <div className="row" style={{ gap: 8 }}>
          {sp && <a className="btn btn--small" href={href.species(sp.id)}>Dex entry</a>}
          <a className="btn btn--small btn--ghost" href={href.editCatch(c.id)}>Edit catch</a>
        </div>
      </div>
    </div>
  );
}

/** The catch's note: your own text, or a suggestion from its Uses until you change it. */
function Note({ c, suggestion }: { c: CatchRow; suggestion: string }) {
  const store = useStore();
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState('');
  const custom = c.note.trim() !== '';
  const shown = custom ? c.note : suggestion;

  if (editing) {
    return (
      <form className="log-note" onSubmit={(e) => { e.preventDefault(); store.saveCatch({ ...c, note: text.trim() === suggestion ? '' : text.trim() }); setEditing(false); }}>
        <label className="label" htmlFor={`note-${c.id}`}>Good for</label>
        <textarea id={`note-${c.id}`} className="textarea" maxLength={LIMITS.longText} value={text} autoFocus
          onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === 'Escape') setEditing(false); }} />
        <div className="row" style={{ gap: 8 }}>
          <button type="submit" className="btn btn--small btn--primary">Save</button>
          <button type="button" className="btn btn--small btn--ghost" onClick={() => setEditing(false)}>Cancel</button>
          {custom && (
            <button type="button" className="btn btn--small btn--ghost" onClick={() => { store.saveCatch({ ...c, note: '' }); setEditing(false); }}>
              Use suggestion
            </button>
          )}
        </div>
      </form>
    );
  }
  return (
    <div className="log-note">
      <span className="label">Good for{!custom && <span className="muted" style={{ textTransform: 'none', letterSpacing: 0, fontWeight: 500 }}> · suggested</span>}</span>
      <p>{shown}</p>
      <div><button type="button" className="btn btn--small btn--ghost" onClick={() => { setText(shown); setEditing(true); }}>Edit note</button></div>
    </div>
  );
}

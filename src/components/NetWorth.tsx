import { useEffect, useRef, useState, type FormEvent } from 'react';
import { formatValue, parseValue } from '../lib/data';
import { isOwned } from '../lib/stats';
import { useStore } from '../lib/store';
import { WORTH_ITEMS, WORTH_LABEL } from '../lib/types';

/**
 * Net worth: shiny value (sum of each kept shiny's value, not editable here) plus two amounts
 * you type in: non-shiny Pokémon and cosmetics. The ⋯ button opens an editor for those two.
 */
export function NetWorth() {
  const store = useStore();
  const kept = store.rows.caught.filter(isOwned);
  const valued = kept.filter((c) => parseValue(c.value) !== null);
  const shinies = valued.reduce((s, c) => s + (parseValue(c.value) ?? 0), 0);
  const manual = Object.fromEntries(store.rows.worth.map((w) => [w.item, parseValue(w.value) ?? 0]));
  const total = shinies + WORTH_ITEMS.reduce((s, i) => s + (manual[i] ?? 0), 0);
  const [editing, setEditing] = useState(false);

  const line = (label: string, n: number, note?: string) => (
    <div className="worth-line">
      <span>{label}{note && <span className="small muted"> · {note}</span>}</span>
      <span className="mono" title={n.toLocaleString('en-US')}>{formatValue(n)}</span>
    </div>
  );

  return (
    <section className="tile worth" aria-labelledby="worth-h">
      <div className="row row--between" style={{ alignItems: 'flex-start' }}>
        <div className="stack" style={{ gap: 4 }}>
          <span id="worth-h" className="eyebrow">Net worth</span>
          <span className="tile-big tile-big--mono" title={total.toLocaleString('en-US')}>{formatValue(total)}</span>
        </div>
        {!editing && <button type="button" className="mini-more worth-edit" aria-label="Edit net worth" onClick={() => setEditing(true)}>⋯</button>}
      </div>
      {editing ? (
        <WorthEditor shinies={shinies} onDone={() => setEditing(false)} />
      ) : (
        <div className="worth-lines">
          {line('Shinies', shinies, kept.length > valued.length ? `${kept.length - valued.length} of ${kept.length} not valued yet` : undefined)}
          {WORTH_ITEMS.map((i) => <div key={i}>{line(WORTH_LABEL[i], manual[i] ?? 0)}</div>)}
        </div>
      )}
    </section>
  );
}

function WorthEditor({ shinies, onDone }: { shinies: number; onDone: () => void }) {
  const store = useStore();
  const current = Object.fromEntries(store.rows.worth.map((w) => [w.item, w.value]));
  const [draft, setDraft] = useState<Record<string, string>>(() =>
    Object.fromEntries(WORTH_ITEMS.map((i) => [i, current[i] ? formatPlain(current[i]) : ''])));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const first = useRef<HTMLInputElement>(null);
  useEffect(() => first.current?.focus(), []);

  function save(e: FormEvent) {
    e.preventDefault();
    const er: Record<string, string> = {};
    const out: Record<string, string> = {};
    for (const i of WORTH_ITEMS) {
      const v = draft[i].trim();
      if (!v) { out[i] = ''; continue; }
      const n = parseValue(v);
      if (n === null) er[i] = 'An amount like 2500000 or 2.5M.';
      else out[i] = String(n);
    }
    setErrors(er);
    if (Object.keys(er).length) return;
    store.saveWorth(out);
    onDone();
  }

  return (
    <form className="stack" style={{ gap: 10 }} onSubmit={save} onKeyDown={(e) => { if (e.key === 'Escape') onDone(); }}>
      <div className="worth-line">
        <span>Shinies <span className="small muted">· from each shiny's value</span></span>
        <span className="mono">{formatValue(shinies)}</span>
      </div>
      {WORTH_ITEMS.map((i, n) => (
        <div key={i} className="field">
          <label htmlFor={`worth-${i}`}>{WORTH_LABEL[i]}</label>
          <input id={`worth-${i}`} ref={n === 0 ? first : undefined} className="input input--compact mono" style={{ width: '100%' }} maxLength={30} placeholder="e.g. 2.5M"
            value={draft[i]} onChange={(e) => setDraft((d) => ({ ...d, [i]: e.target.value }))}
            aria-invalid={errors[i] ? true : undefined} aria-describedby={errors[i] ? `worth-${i}-err` : undefined} />
          {errors[i] && <span id={`worth-${i}-err`} className="small" style={{ color: 'var(--ember-ink)' }}>{errors[i]}</span>}
        </div>
      ))}
      <div className="row" style={{ gap: 8 }}>
        <button type="submit" className="btn btn--small btn--primary">Save</button>
        <button type="button" className="btn btn--small btn--ghost" onClick={onDone}>Cancel</button>
      </div>
    </form>
  );
}

/** 2500000 -> "2,500,000" for the input. */
const formatPlain = (v: string) => (/^\d+$/.test(v) ? Number(v).toLocaleString('en-US') : v);

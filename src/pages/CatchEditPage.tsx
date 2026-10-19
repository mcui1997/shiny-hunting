import { useMemo, useState, type FormEvent } from 'react';
import { Sprite } from '../components/Sprite';
import { BackLink } from '../components/ui';
import { makeResolver, parseCount, parseDateTime, parseValue } from '../lib/csv';
import { useDerived } from '../lib/derived';
import { go, href } from '../lib/router';
import { useStore } from '../lib/store';
import { CATCH_COLUMNS, CATCH_STATUSES, DEFAULT_ODDS, METHODS, NATURES, SEASONS, type CatchRow } from '../lib/types';

const blank = (): CatchRow => Object.fromEntries(CATCH_COLUMNS.map((c) => [c, ''])) as CatchRow;
const nowLocal = () => {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
};

/** "2000000" -> "2M", "350000" -> "350K"; anything else unchanged. */
function compactValue(s: string) {
  const n = parseValue(s);
  if (n === null) return s;
  if (n >= 1_000_000 && n % 100_000 === 0) return `${n / 1_000_000}M`;
  if (n >= 1_000 && n % 1_000 === 0) return `${n / 1_000}K`;
  return String(n);
}

export function CatchEditPage({ id, species }: { id?: string; species?: string }) {
  const d = useDerived()!;
  const store = useStore();
  const existing = id ? store.rows.caught.find((c) => c.id === id) : undefined;
  const resolve = useMemo(() => makeResolver(d.game.names), [d.game]);
  const [row, setRow] = useState<CatchRow>(() => existing ? {
    ...existing, est_value: compactValue(existing.est_value), sold_for: compactValue(existing.sold_for),
  } : {
    ...blank(), id: store.newCatchId(), species: species ? resolve(species) ?? species : '',
    caught_at: nowLocal(), status: 'kept',
  });
  const [errors, setErrors] = useState<Partial<Record<keyof CatchRow, string>>>({});

  if (id && !existing) {
    return (
      <div className="stack">
        <BackLink href={href.caught()}>Back to caught</BackLink>
        <p className="empty">No catch with id {id}. It may have been removed.</p>
      </div>
    );
  }

  const sp = d.game.byName.get(resolve(row.species) ?? '');
  const evolveOptions = sp ? d.game.descendants(sp.id) : [];
  const areas = sp ? [...new Set(d.game.family(sp.id).flatMap((f) => [...f.hordes, ...f.singles].map((r) => r.area)))].sort() : [];
  const set = (k: keyof CatchRow) => (e: { target: { value: string } }) => {
    setRow((r) => ({ ...r, [k]: e.target.value }));
    setErrors((er) => ({ ...er, [k]: undefined }));
  };

  function validate(): CatchRow | null {
    const er: typeof errors = {};
    const out: CatchRow = { ...row };
    const name = resolve(row.species);
    if (!name) er.species = row.species ? `"${row.species}" isn't a Pokémon name I recognize.` : 'Which Pokémon?';
    else out.species = name;
    const when = parseDateTime(row.caught_at.replace('T', ' '));
    if (!when) er.caught_at = 'When did you catch it?';
    else out.caught_at = when;
    for (const k of ['encounters', 'odds'] as const) {
      if (row[k] && parseCount(row[k]) === null) er[k] = 'Whole number, like 21201.';
      else if (row[k]) out[k] = String(parseCount(row[k]));
    }
    for (const k of ['est_value', 'sold_for'] as const) {
      if (row[k] && parseValue(row[k]) === null) er[k] = 'A number like 2M, 350K or 2000000.';
      else if (row[k]) out[k] = String(parseValue(row[k]));
    }
    for (const k of ['evolved_on', 'sold_on'] as const) {
      if (row[k] && !parseDateTime(row[k])) er[k] = 'Use a date like 2026-10-20.';
    }
    if (out.current_form === out.species) out.current_form = '';
    if (!out.current_form) out.evolved_on = '';
    setErrors(er);
    return Object.keys(er).length ? null : out;
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    const out = validate();
    if (!out) return;
    store.saveCatch(out);
    const target = d.game.byName.get(out.current_form || out.species);
    go(target ? href.species(target.id) : href.caught());
  }

  function onDelete() {
    if (!existing) return;
    if (!confirm(`Delete this ${existing.species} catch? This can't be undone once you export.`)) return;
    store.deleteCatch(existing.id);
    go(href.caught());
  }

  const err = (k: keyof CatchRow) => errors[k] && <span id={`err-${k}`} className="small" style={{ color: 'var(--ember-ink)' }}>{errors[k]}</span>;
  const inv = (k: keyof CatchRow) => (errors[k] ? { 'aria-invalid': true as const, 'aria-describedby': `err-${k}` } : {});

  return (
    <div className="stack" style={{ gap: 20 }}>
      <BackLink href={existing && sp ? href.species(sp.id) : href.caught()}>Back</BackLink>
      <div className="row">
        {sp && <div className="mini-tile" style={{ background: 'var(--gilt)' }}><Sprite id={sp.id} name={sp.name} shiny size={56} eager /></div>}
        <h1 className="h1">{existing ? `Edit ${existing.species}` : 'Log a shiny'}</h1>
      </div>

      <form className="form panel" onSubmit={onSubmit} noValidate>
        <div className="form-grid">
          <div className="field">
            <label htmlFor="f-species">Pokémon (as caught)</label>
            <input id="f-species" className="input" list="species-names" value={row.species} onChange={set('species')} required {...inv('species')} />
            {err('species')}
          </div>
          <div className="field">
            <label htmlFor="f-when">Caught</label>
            <input id="f-when" className="input" type="datetime-local" value={row.caught_at.replace(' ', 'T')} onChange={(e) => set('caught_at')({ target: { value: e.target.value.replace('T', ' ') } })} {...inv('caught_at')} />
            {err('caught_at')}
          </div>
          <div className="field">
            <label htmlFor="f-enc">Encounters since your last shiny</label>
            <input id="f-enc" className="input mono" inputMode="numeric" value={row.encounters} onChange={set('encounters')} {...inv('encounters')} />
            {err('encounters')}
          </div>
          <div className="field">
            <label htmlFor="f-method">Method</label>
            <select id="f-method" className="select" value={row.method} onChange={set('method')}>
              <option value="">Not entered</option>
              {METHODS.map((m) => <option key={m} value={m}>{m[0].toUpperCase() + m.slice(1)}</option>)}
            </select>
          </div>
          <div className="field">
            <label htmlFor="f-loc">Location</label>
            <input id="f-loc" className="input" list="area-names" value={row.location} onChange={set('location')} />
            <datalist id="area-names">{areas.map((a) => <option key={a} value={a} />)}</datalist>
          </div>
          <div className="field">
            <label htmlFor="f-season">Season</label>
            <select id="f-season" className="select" value={row.season} onChange={set('season')}>
              <option value="">Not entered</option>
              {SEASONS.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
        </div>

        <div className="form-grid">
          <div className="field">
            <label htmlFor="f-value">Estimated value</label>
            <input id="f-value" className="input" placeholder="2M" value={row.est_value} onChange={set('est_value')} {...inv('est_value')} />
            {err('est_value')}
          </div>
          <div className="field">
            <label htmlFor="f-status">Status</label>
            <select id="f-status" className="select" value={row.status} onChange={set('status')}>
              {CATCH_STATUSES.map((s) => <option key={s} value={s}>{s[0].toUpperCase() + s.slice(1)}</option>)}
            </select>
          </div>
          {row.status === 'sold' && (
            <>
              <div className="field">
                <label htmlFor="f-sold">Sold for</label>
                <input id="f-sold" className="input" placeholder="3.5M" value={row.sold_for} onChange={set('sold_for')} {...inv('sold_for')} />
                {err('sold_for')}
              </div>
              <div className="field">
                <label htmlFor="f-soldon">Sold on</label>
                <input id="f-soldon" className="input" type="date" value={row.sold_on.slice(0, 10)} onChange={set('sold_on')} {...inv('sold_on')} />
                {err('sold_on')}
              </div>
            </>
          )}
          <div className="field">
            <label htmlFor="f-nature">Nature</label>
            <select id="f-nature" className="select" value={row.nature} onChange={set('nature')}>
              <option value="">Not entered</option>
              {NATURES.map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </div>
          <div className="field">
            <label htmlFor="f-ivs">IVs</label>
            <input id="f-ivs" className="input mono" placeholder="31/31/x/31/x/31" value={row.ivs} onChange={set('ivs')} />
          </div>
          <div className="field">
            <label htmlFor="f-ball">Ball</label>
            <input id="f-ball" className="input" value={row.ball} onChange={set('ball')} />
          </div>
          <div className="field">
            <label htmlFor="f-form">Form</label>
            <input id="f-form" className="input" placeholder="Only for Unown, Deerling, etc." value={row.form} onChange={set('form')} />
          </div>
          <div className="field">
            <label htmlFor="f-odds">Odds (1 in …)</label>
            <input id="f-odds" className="input mono" inputMode="numeric" placeholder={String(DEFAULT_ODDS)} value={row.odds} onChange={set('odds')} {...inv('odds')} />
            <span className="field-hint">Leave blank for your current odds.</span>
            {err('odds')}
          </div>
          <div className="field">
            <label htmlFor="f-shot">Screenshot</label>
            <input id="f-shot" className="input" placeholder="nidorino.png or a link" value={row.screenshot} onChange={set('screenshot')} />
            <span className="field-hint">File name in the repo's screenshots folder, or a full link.</span>
          </div>
        </div>

        {evolveOptions.length > 0 && (
          <fieldset className="form-grid" style={{ border: 0, padding: 0, margin: 0 }}>
            <legend className="h3" style={{ marginBottom: 12 }}>Evolution</legend>
            <div className="field">
              <label htmlFor="f-evo">Now a</label>
              <select id="f-evo" className="select" value={row.current_form} onChange={set('current_form')} aria-describedby="f-evo-hint">
                <option value="">Not evolved ({sp?.name})</option>
                {evolveOptions.map((o) => {
                  const via = sp ? (d.game.path(sp.id, o.id) ?? []).slice(0, -1).map((s) => d.game.name(s.id)) : [];
                  return <option key={o.id} value={o.name}>{o.name}{via.length ? ` (via ${via.join(', ')})` : ''}</option>;
                })}
              </select>
              <span id="f-evo-hint" className="field-hint">Pick its final stage. Every stage in between is marked in your dex too.</span>
            </div>
            {row.current_form && (
              <div className="field">
                <label htmlFor="f-evo-on">Evolved on</label>
                <input id="f-evo-on" className="input" type="date" value={row.evolved_on.slice(0, 10)} onChange={set('evolved_on')} {...inv('evolved_on')} />
                {err('evolved_on')}
              </div>
            )}
          </fieldset>
        )}

        <div className="field">
          <label htmlFor="f-thoughts">Thoughts</label>
          <textarea id="f-thoughts" className="textarea" rows={4} value={row.thoughts} onChange={set('thoughts')} />
        </div>

        <div className="form-actions">
          {existing ? <button type="button" className="btn btn--danger" onClick={onDelete}>Delete catch</button> : <span />}
          <div className="row">
            <a className="btn" href={existing && sp ? href.species(sp.id) : href.caught()}>Cancel</a>
            <button type="submit" className="btn btn--primary">{existing ? 'Save changes' : 'Log shiny'}</button>
          </div>
        </div>
      </form>
      <datalist id="species-names">{d.game.names.map((n) => <option key={n} value={n} />)}</datalist>
    </div>
  );
}

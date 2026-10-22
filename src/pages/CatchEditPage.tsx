import { useMemo, useState, type FormEvent } from 'react';
import { Combobox } from '../components/Combobox';
import { Sprite } from '../components/Sprite';
import { BackLink } from '../components/ui';
import { LIMITS, makeResolver, normalizeTag, parseCount, parseDateTime, parseValue } from '../lib/data';
import { useDerived } from '../lib/derived';
import { go, href } from '../lib/router';
import { useStore } from '../lib/store';
import { CATCH_COLUMNS, CATCH_STATUSES, DEFAULT_ODDS, DEFAULT_TAGS, METHODS, NATURES, ODDS_LABEL, SEASONS, type CatchRow } from '../lib/types';

const blank = (): CatchRow => Object.fromEntries(CATCH_COLUMNS.map((c) => [c, ''])) as CatchRow;
const nowLocal = () => {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
};

const NEW_TAG = '__new__';

export function CatchEditPage({ id, species }: { id?: string; species?: string }) {
  const d = useDerived()!;
  const store = useStore();
  const existing = id ? store.rows.caught.find((c) => c.id === id) : undefined;
  const resolve = useMemo(() => makeResolver(d.game.names), [d.game]);
  const [row, setRow] = useState<CatchRow>(() => existing ? { ...existing } : {
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
  const tagOptions = [...new Set([...DEFAULT_TAGS, ...store.rows.caught.map((c) => c.tag), row.tag].filter(Boolean))].sort();
  const [customTag, setCustomTag] = useState(false);
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
    if (row.value && parseValue(row.value) === null) er.value = 'An amount like 2500000 or 2.5M.';
    else if (row.value) out.value = String(parseValue(row.value));
    for (const k of ['evolved_on', 'sold_on'] as const) {
      if (row[k] && !parseDateTime(row[k])) er[k] = 'Use a date like 2026-10-20.';
    }
    out.tag = normalizeTag(row.tag);
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
            <Combobox id="f-species" maxLength={LIMITS.shortText} value={row.species} onValue={(v) => set('species')({ target: { value: v } })} options={d.game.names} required {...inv('species')} />
            {err('species')}
          </div>
          <div className="field">
            <label htmlFor="f-when">Caught</label>
            <input id="f-when" className="input" type="datetime-local" value={row.caught_at.replace(' ', 'T')} onChange={(e) => set('caught_at')({ target: { value: e.target.value.replace('T', ' ') } })} {...inv('caught_at')} />
            {err('caught_at')}
          </div>
          <div className="field">
            <label htmlFor="f-enc">Encounters since your last shiny</label>
            <input id="f-enc" maxLength={LIMITS.shortText} className="input mono" inputMode="numeric" value={row.encounters} onChange={set('encounters')} {...inv('encounters')} />
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
            <Combobox id="f-loc" maxLength={LIMITS.shortText} value={row.location} onValue={(v) => set('location')({ target: { value: v } })} options={areas} />
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
            <label htmlFor="f-status">Status</label>
            <select id="f-status" className="select" value={row.status} onChange={set('status')}>
              {CATCH_STATUSES.map((s) => <option key={s} value={s}>{s[0].toUpperCase() + s.slice(1)}</option>)}
            </select>
          </div>
          <div className="field">
            <label htmlFor="f-tag">Category</label>
            {customTag ? (
              <div className="row" style={{ gap: 8, flexWrap: 'nowrap' }}>
                <input id="f-tag" maxLength={24} className="input" placeholder="e.g. competitive" value={row.tag} onChange={set('tag')} autoFocus />
                <button type="button" className="btn btn--small" onClick={() => { setCustomTag(false); setRow((r) => ({ ...r, tag: '' })); }}>Cancel</button>
              </div>
            ) : (
              <select id="f-tag" className="select" value={row.tag}
                onChange={(e) => {
                  if (e.target.value === NEW_TAG) { setCustomTag(true); setRow((r) => ({ ...r, tag: '' })); }
                  else set('tag')(e);
                }}>
                <option value="">No category</option>
                {tagOptions.map((t) => <option key={t} value={t}>{t[0].toUpperCase() + t.slice(1)}</option>)}
                <option value={NEW_TAG}>New category…</option>
              </select>
            )}
            <span className="field-hint">Groups your Owned list.</span>
          </div>
          {row.status === 'sold' && (
            <>
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
            <input id="f-ivs" maxLength={LIMITS.shortText} className="input mono" placeholder="31/31/x/31/x/31" value={row.ivs} onChange={set('ivs')} />
          </div>
          <div className="field">
            <label htmlFor="f-ball">Ball</label>
            <input id="f-ball" maxLength={LIMITS.shortText} className="input" value={row.ball} onChange={set('ball')} />
          </div>
          <div className="field">
            <label htmlFor="f-form">Form</label>
            <input id="f-form" maxLength={LIMITS.shortText} className="input" placeholder="Only for Unown, Deerling, etc." value={row.form} onChange={set('form')} />
          </div>
          <div className="field">
            <label htmlFor="f-value">Value</label>
            <input id="f-value" maxLength={30} className="input mono" placeholder="e.g. 2.5M" value={row.value} onChange={set('value')} {...inv('value')} />
            <span className="field-hint">Pokeyen. Adds to your net worth on Stats while you keep it.</span>
            {err('value')}
          </div>
          <div className="field">
            <label htmlFor="f-odds">Odds (1 in …)</label>
            <input id="f-odds" maxLength={LIMITS.shortText} className="input mono" inputMode="numeric" placeholder={String(DEFAULT_ODDS)} value={row.odds} onChange={set('odds')} {...inv('odds')} />
            <span className="field-hint">Leave blank for {ODDS_LABEL}.</span>
            {err('odds')}
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

        <div className="form-actions">
          {existing ? <button type="button" className="btn btn--danger" onClick={onDelete}>Delete catch</button> : <span />}
          <div className="row">
            <a className="btn" href={existing && sp ? href.species(sp.id) : href.caught()}>Cancel</a>
            <button type="submit" className="btn btn--primary">{existing ? 'Save changes' : 'Log shiny'}</button>
          </div>
        </div>
      </form>
    </div>
  );
}

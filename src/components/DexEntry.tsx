import { huntSummary, wikiUrl, type Game, type SeasonBest } from '../lib/game';
import { href } from '../lib/router';
import { SEASONS, type Species, type UseItem } from '../lib/types';
import { Pill } from './ui';
import { Sprite } from './Sprite';

const STAT_NAMES = ['HP', 'Attack', 'Defense', 'Sp. Atk', 'Sp. Def', 'Speed'];
const STAT_SHORT = ['HP', 'Atk', 'Def', 'SpA', 'SpD', 'Spe'];

function genderLabel(female: number | null) {
  if (female === null) return 'Genderless';
  if (female === 100) return 'Female only';
  if (female === 0) return 'Male only';
  return `${100 - female}% ♂ · ${female}% ♀`;
}

function evLabel(ev: number[]) {
  const parts = ev.map((n, i) => (n ? `${n} ${STAT_SHORT[i]}` : '')).filter(Boolean);
  return parts.length ? parts.join(', ') : 'None';
}

export function DexEntry({ sp }: { sp: Species }) {
  const { dex } = sp;
  const total = dex.stats.reduce((a, b) => a + b, 0);
  // Ability uses are shown with the ability itself; this list is the move-based ones.
  const uses = sp.uses
    .filter((u) => u.tag !== 'field')
    .map((u) => ({ ...u, items: u.items.filter((i) => !i.how.endsWith('ability')) }))
    .filter((u) => u.items.length);
  const field = sp.uses.find((u) => u.tag === 'field');
  return (
    <section aria-labelledby="dex-h" className="panel">
      <h2 id="dex-h" className="sr-only">Dex</h2>
      <div className="stack" style={{ gap: 8 }}>
        <span className="label">Abilities</span>
        <ul className="abilities">
          {dex.abilities.map((a) => (
            <li key={a.name}>
              <span className="ability-name">
                {a.name}{a.hidden && <span className="ability-tag">Hidden</span>}
              </span>
              <span className="ability-text">
                {a.field && <span className="ability-field">{a.field.replace(/^./, (c) => c.toUpperCase())}.</span>}
                <span className={a.field ? 'muted' : undefined}>{a.effect}</span>
              </span>
            </li>
          ))}
        </ul>
      </div>

      {(uses.length > 0 || field) && (
        <div className="stack" style={{ gap: 8 }}>
          <span className="label">Moves worth knowing</span>
          {uses.length > 0 && (
            <ul className="uses">
              {uses.map((u) => (
                <li key={u.tag}>
                  <span className="use-label">{u.label}</span>
                  <span className="use-items">
                    {u.items.map((it) => <UseLine key={it.name} tag={u.tag} label={u.label} item={it} />)}
                  </span>
                </li>
              ))}
            </ul>
          )}
          {field && <span className="small muted">Field moves: {field.items.map((f) => f.name).join(', ')}</span>}
        </div>
      )}

      <div className="dex-grid">
        <div className="stats" role="table" aria-label="Base stats">
          {dex.stats.map((v, i) => (
            <div key={i} className="stat" role="row">
              <span role="rowheader" className="stat-name">{STAT_NAMES[i]}</span>
              <span role="cell" className="stat-val mono">{v}</span>
              <span className="stat-bar" aria-hidden="true"><span style={{ width: `${Math.min(100, (v / 180) * 100)}%` }} /></span>
            </div>
          ))}
          <div className="stat stat--total" role="row">
            <span role="rowheader" className="stat-name">Total</span>
            <span role="cell" className="stat-val mono">{total}</span>
            <span />
          </div>
        </div>
        <dl className="facts">
          <div><dt>Egg groups</dt><dd>{dex.eggGroups.join(', ')}</dd></div>
          <div><dt>Gender</dt><dd>{genderLabel(dex.female)}</dd></div>
          <div><dt>Catch rate</dt><dd className="mono">{dex.catchRate}</dd></div>
          <div><dt>EV yield</dt><dd>{evLabel(dex.evYield)}</dd></div>
          {dex.tier && <div><dt>Tier</dt><dd>{dex.tier}</dd></div>}
        </dl>
      </div>
    </section>
  );
}

/** One move or ability under a use, e.g. "Spore 100% · as Shroomish, Lv 40" or "Flame Body · ability — Eggs hatch…". */
function UseLine({ tag, label, item }: { tag: string; label: string; item: UseItem }) {
  if (tag === 'sleep' || tag === 'para') {
    const acc = /(\d+)% accurate/.exec(item.effect)?.[1];
    return (
      <span className="use-item">
        <strong>{item.name}</strong>{acc ? ` ${acc}%` : item.name === 'Yawn' ? ' (next turn)' : ''}
        <span className="muted"> · {item.how}</span>
      </span>
    );
  }
  return (
    <span className="use-item">
      {item.name !== label && <><strong>{item.name}</strong><span className="muted"> · </span></>}
      <span className="muted">{item.how}</span> — {item.effect}
    </span>
  );
}

export function HuntSummaryPanel({ sp, family, game }: { sp: Species; family: Species[]; game: Game }) {
  // This species, then earlier stages that evolve into it (latest stage first), if they're in the wild.
  const earlier = family.filter((f) => f.id !== sp.id && game.canBecome(f.id, sp.id)).reverse();
  const line = [sp, ...earlier].filter((f) => game.hasEncounters(f));
  return (
    <section aria-labelledby="hunt-h" className="panel">
      <div className="row row--between">
        <h2 id="hunt-h" className="h2">Hunt</h2>
        <a className="btn btn--small" href={wikiUrl(sp.name)} target="_blank" rel="noopener noreferrer">PokeMMO wiki ↗</a>
      </div>
      {line.length === 0 ? (
        <p className="muted" style={{ margin: 0 }}>
          Not in the wild{earlier.length ? ' at any stage' : ''}. Likely an egg, gift, fossil or event.
        </p>
      ) : (
        <ul className="hunt-list">
          {line.map((f) => <HuntLine key={f.id} sp={f} showName={line.length > 1 || f.id !== sp.id} />)}
        </ul>
      )}
      <span className="small muted">From <a href={game.data.source.url}>{game.data.source.name}</a>. Check the wiki before a long hunt.</span>
    </section>
  );
}

function HuntLine({ sp, showName }: { sp: Species; showName: boolean }) {
  const h = huntSummary(sp);
  const best = SEASONS.map((x) => h.seasons[x]).filter((x): x is SeasonBest => !!x);
  const top = best.length ? Math.max(...best.map((b) => b.share)) : 0;
  const soloArea = best.find((b) => b.share >= 100)?.area;
  return (
    <li>
      {showName && <a className="hunt-as" href={href.species(sp.id)}><Sprite id={sp.id} name={sp.name} shiny size={28} />{sp.name}</a>}
      <span className="hunt-facts">
        {best.length === 0 ? (
          <span className="hunt-fact"><Pill tone="neutral">No 5x hordes</Pill></span>
        ) : (
          <span className="seasons" role="list" aria-label="Best 5x horde share by season">
            {SEASONS.map((season) => {
              const b = h.seasons[season];
              const label = !b ? '—' : b.share >= 100 ? 'Solo' : `${b.share}%`;
              const when = b && b.times.length < 3 ? b.times.join('/').toLowerCase() : '';
              return (
                <span key={season} role="listitem" className={`season${!b ? ' season--none' : b.share >= 100 ? ' season--solo' : ''}${b && b.share === top ? ' season--top' : ''}`}
                  title={b ? `${season}: ${label}${when ? ` (${when})` : ''} at ${b.area}` : `${season}: no 5x horde`}>
                  <span className="season-name">{season}</span>
                  <span className="season-val">{label}</span>
                  {when && <span className="season-when">{when}</span>}
                </span>
              );
            })}
          </span>
        )}
        {(soloArea || h.other.length > 0) && (
          <span className="small muted">
            {soloArea && <>Solo at e.g. {soloArea}</>}
            {soloArea && h.other.length > 0 && ' · '}
            {h.other.length > 0 && <>{best.length ? 'Also: ' : ''}{h.other.join(', ')}</>}
          </span>
        )}
      </span>
    </li>
  );
}

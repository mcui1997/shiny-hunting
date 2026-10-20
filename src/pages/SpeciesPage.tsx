import { Fragment, useEffect, useState } from 'react';
import { CatchFacts } from '../components/CatchDetail';
import { HuntTables } from '../components/HuntTables';
import { Sprite } from '../components/Sprite';
import { BackLink, catchStatusPill, dexNo, formatWhen, Pill, SparkleIcon } from '../components/ui';
import { LIMITS } from '../lib/data';
import { useDerived } from '../lib/derived';
import { href } from '../lib/router';
import { currentSpecies, formatCount, isMineState, isOwned, isOwnedState } from '../lib/stats';
import { useStore } from '../lib/store';
import { GOAL_STATUSES, PRIORITIES, SEASONS, type CatchRow, type Season, type Species } from '../lib/types';

export function SpeciesPage({ id }: { id: number }) {
  const d = useDerived()!;
  const store = useStore();
  const sp = d.game.byId.get(id);
  const [season, setSeason] = useState<Season | null>(null);
  if (!sp) {
    return (
      <div className="stack">
        <BackLink href={href.dex()}>Back to dex</BackLink>
        <p className="empty">There's no Pokémon #{id} in Gen 1–5.</p>
      </div>
    );
  }
  const entry = d.dex.get(sp.name);
  const mine = isMineState(entry.state);
  const latest = entry.catches[0];
  const family = d.game.family(sp.id);
  // Hunt as this species first, then the rest of its family that appears in the wild.
  const huntAs = [sp, ...family.filter((f) => f.id !== sp.id)].filter((f) => d.game.hasEncounters(f));
  const familyNames = new Set(family.map((f) => f.name));
  const lineCatch = store.rows.caught.find((c) => isOwned(c) && familyNames.has(currentSpecies(c)) && currentSpecies(c) !== sp.name);

  return (
    <div className="stack" style={{ gap: 24 }}>
      <BackLink href={href.dex()}>Back to dex</BackLink>

      <div className="hero">
        <section aria-label="Sprite" className={`hero-card${mine ? ' hero-card--gilt' : ''}`}>
          <div className="row row--between">
            <span className="mono small muted">{dexNo(sp.id)}</span>
            {latest && entry.state === 'owned' && <Pill tone="gold">Shiny #{d.shinyNumber.get(latest.id)}</Pill>}
            {!sp.obtainable && <Pill tone="neutral">No regular source</Pill>}
          </div>
          <div className="hero-tile">
            <Sprite id={sp.id} name={sp.name} shiny size={200} eager />
            {mine && <SparkleIcon size={26} className="sparkle" />}
          </div>
          <div className="row" style={{ flexWrap: 'nowrap' }}>
            <div className="mini-tile"><Sprite id={sp.id} name={sp.name} shiny={false} size={56} eager /></div>
            <div style={{ minWidth: 0 }}>
              <h1 className="h1">{sp.name}</h1>
              <span className="muted">{sp.types.join(' · ')}</span>
            </div>
          </div>
          {family.length > 1 && <EvolutionLine sp={sp} family={family} />}
        </section>

        <section aria-label="Your shiny" className="hero-side">
          {latest ? (
            <>
              <div className="row row--between">
                <div className="row" style={{ gap: 8 }}>
                  <h2 className="h2">Your shiny</h2>
                  {catchStatusPill(latest.status)}
                  {latest.species !== sp.name && <span className="small muted">caught as <a href={href.species(d.game.byName.get(latest.species)?.id ?? 0)}>{latest.species}</a></span>}
                  {latest.current_form && latest.current_form !== sp.name && <span className="small muted">now a <a href={href.species(d.game.byName.get(latest.current_form)?.id ?? 0)}>{latest.current_form}</a></span>}
                </div>
                <div className="row" style={{ gap: 8 }}>
                  <a className="btn btn--small" href={href.editCatch(latest.id)}>Edit</a>
                  <a className="btn btn--small" href={href.newCatch(sp.name)}>Log another</a>
                </div>
              </div>
              <CatchFacts c={latest} />
              {entry.catches.length > 1 && <OtherCatches catches={entry.catches.slice(1)} />}
            </>
          ) : (
            <div className="panel">
              <h2 className="h2">No shiny {sp.name} yet</h2>
              {lineCatch ? (
                <p style={{ margin: 0 }}>
                  You have a shiny <strong>{currentSpecies(lineCatch)}</strong> in this line
                  {d.game.canBecome(d.game.byName.get(currentSpecies(lineCatch))!.id, sp.id) ? '. Evolved it? Mark that catch as evolved.' : '.'}
                </p>
              ) : (
                <p className="muted" style={{ margin: 0 }}>Log it here when it shows up.</p>
              )}
              <div className="row">
                {lineCatch && d.game.canBecome(d.game.byName.get(currentSpecies(lineCatch))!.id, sp.id) && (
                  <a className="btn btn--primary" href={href.editCatch(lineCatch.id)}>Mark {currentSpecies(lineCatch)} as evolved</a>
                )}
                <a className={lineCatch ? 'btn' : 'btn btn--primary'} href={href.newCatch(sp.name)}>Log a new shiny {sp.name}</a>
              </div>
            </div>
          )}
          <GoalPanel sp={sp} />
        </section>
      </div>

      <section aria-labelledby="hunt-h" className="panel">
        <div className="row row--between">
          <h2 id="hunt-h" className="h2">How to hunt {sp.name}</h2>
          <div className="chips">
            <span className="chips-label">Season</span>
            {SEASONS.map((s) => (
              <button key={s} type="button" className="chip chip--season" aria-pressed={season === s} onClick={() => setSeason(season === s ? null : s)}>{s}</button>
            ))}
          </div>
        </div>
        {huntAs.length === 0 ? (
          <p className="muted" style={{ margin: 0 }}>
            No wild encounters for {family.length > 1 ? 'this evolution line' : sp.name} in the game data. It likely comes from an egg, gift, fossil, raid or event. Add how you'll get it in your hunt notes.
          </p>
        ) : (
          huntAs.map((f) => (
            <div key={f.id} className="stack" style={{ gap: 10 }}>
              {(huntAs.length > 1 || f.id !== sp.id) && (
                <div className="row" style={{ gap: 8 }}>
                  <Sprite id={f.id} name={f.name} shiny size={40} />
                  <h3 className="h3">As {f.name}</h3>
                  {f.id !== sp.id && <HowToReach game={d.game} from={f} to={sp} />}
                </div>
              )}
              <HuntTables sp={f} game={d.game} season={season} />
            </div>
          ))
        )}
        <span className="small muted">
          Source: <a href={d.game.data.source.url}>{d.game.data.source.name}</a>, {formatWhen(d.game.data.source.date).date}. Split is each species' share of that horde.
        </span>
      </section>

      <HuntNotes species={sp.name} />
    </div>
  );
}

function EvolutionLine({ sp, family }: { sp: Species; family: Species[] }) {
  const d = useDerived()!;
  return (
    <nav aria-label="Evolution line" className="evo">
      {family.map((f, i) => {
        const parent = family.find((p) => p.evolvesTo.some((e) => e.id === f.id));
        const how = parent?.evolvesTo.find((e) => e.id === f.id)?.how;
        return (
          <Fragment key={f.id}>
            {i > 0 && how && <span className="evo-arrow" aria-label={`evolves by ${how}`}>→ {how}{parent && family.indexOf(parent) !== i - 1 ? ` (from ${parent.name})` : ''}</span>}
            <a className="evo-step" href={href.species(f.id)} aria-current={f.id === sp.id ? 'page' : undefined}>
              <Sprite id={f.id} name={f.name} shiny size={28} />
              {f.name}
              {isOwnedState(d.dex.get(f.name).state) && <SparkleIcon size={12} />}
            </a>
          </Fragment>
        );
      })}
    </nav>
  );
}

function HowToReach({ game, from, to }: { game: import('../lib/game').Game; from: Species; to: Species }) {
  const steps = game.path(from.id, to.id);
  if (steps && steps.length) return <span className="small muted">then {steps.map((s) => `${s.how} → ${game.name(s.id)}`).join(', ')}</span>;
  if (game.path(to.id, from.id)) return <span className="small muted">(evolves from {to.name})</span>;
  return null;
}

function OtherCatches({ catches }: { catches: CatchRow[] }) {
  return (
    <div className="panel" style={{ gap: 8 }}>
      <h3 className="h3">Earlier shinies</h3>
      {catches.map((c) => (
        <div key={c.id} className="row row--between">
          <span>{formatWhen(c.caught_at).date} · {c.encounters ? `${formatCount(Number(c.encounters))} enc` : 'no count'} {catchStatusPill(c.status)}</span>
          <a className="btn btn--small" href={href.editCatch(c.id)}>Edit</a>
        </div>
      ))}
    </div>
  );
}

function GoalPanel({ sp }: { sp: Species }) {
  const d = useDerived()!;
  const store = useStore();
  const goal = d.goals.get(sp.name);
  const progress = d.progress.get(sp.name);
  if (!goal) {
    return (
      <div className="row">
        <button type="button" className="btn" onClick={() => store.saveGoal({ species: sp.name, priority: '', status: 'planned', notes: '' })}>Add {sp.name} to goals</button>
      </div>
    );
  }
  return (
    <div className="panel" style={{ gap: 12 }}>
      <div className="row row--between">
        <h3 className="h3">Goal</h3>
        {progress?.kind === 'done' && <Pill tone="gold">Done</Pill>}
        {progress?.kind === 'evolve' && <Pill tone="teal">Evolve to finish</Pill>}
      </div>
      {progress?.kind === 'evolve' && (
        <p style={{ margin: 0 }}>
          You have a shiny <a href={href.species(d.game.byName.get(progress.from)!.id)}>{progress.from}</a>. Evolve it to finish: {progress.steps.map((s) => `${s.how} → ${d.game.name(s.id)}`).join(', ')}.
        </p>
      )}
      <div className="form-grid">
        <div className="field">
          <label htmlFor="goal-priority">Priority</label>
          <select id="goal-priority" className="select" value={goal.priority} onChange={(e) => store.saveGoal({ ...goal, priority: e.target.value })}>
            <option value="">None</option>
            {PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
        </div>
        <div className="field">
          <label htmlFor="goal-status">Status</label>
          <select id="goal-status" className="select" value={goal.status} onChange={(e) => store.saveGoal({ ...goal, status: e.target.value })}>
            {GOAL_STATUSES.map((s) => <option key={s} value={s}>{s[0].toUpperCase() + s.slice(1)}</option>)}
          </select>
        </div>
      </div>
      <div className="row">
        <button type="button" className="btn btn--small btn--danger" onClick={() => confirm(`Remove ${sp.name} from your goals?`) && store.deleteGoal(sp.name)}>Remove goal</button>
      </div>
    </div>
  );
}

function HuntNotes({ species }: { species: string }) {
  const d = useDerived()!;
  const store = useStore();
  const saved = d.notes.get(species) ?? '';
  const [text, setText] = useState(saved);
  useEffect(() => setText(saved), [saved, species]);
  const changed = text.trim() !== saved;
  return (
    <section className="field">
      <label htmlFor="hunt-notes" className="h3" style={{ color: 'var(--ink)' }}>Your hunt notes</label>
      <textarea id="hunt-notes" className="textarea" rows={3} maxLength={LIMITS.longText}
        placeholder="Anything the data doesn't know: best spot to Sweet Scent from, your rotation, what to bring, how you'll get an egg-only one."
        value={text} onChange={(e) => setText(e.target.value)} onBlur={() => changed && store.saveNote(species, text)} />
      {changed && <div className="row"><button type="button" className="btn btn--small btn--primary" onClick={() => store.saveNote(species, text)}>Save notes</button></div>}
    </section>
  );
}

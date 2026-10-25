import { Fragment } from 'react';
import { DexEntry, HuntSummaryPanel } from '../components/DexEntry';
import { GoalControls } from '../components/GoalControls';
import { Sprite } from '../components/Sprite';
import { BackLink, catchStatusPill, dexNo, formatWhen, HuntBadge, Pill, SparkleIcon } from '../components/ui';
import { useDerived } from '../lib/derived';
import { href } from '../lib/router';
import { currentSpecies, formatCount, isMineState, isOwned, isOwnedState } from '../lib/stats';
import { useStore } from '../lib/store';
import { DEFAULT_PRIORITY, type CatchRow, type Species } from '../lib/types';

export function SpeciesPage({ id }: { id: number }) {
  const d = useDerived()!;
  const sp = d.game.byId.get(id);
  if (!sp) {
    return (
      <div className="stack">
        <BackLink href={href.home()}>Back</BackLink>
        <p className="empty">There's no Pokémon #{id} in Gen 1–5.</p>
      </div>
    );
  }
  const entry = d.dex.get(sp.name);
  const mine = isMineState(entry.state);
  const family = d.game.family(sp.id);

  return (
    <div className="stack" style={{ gap: 20 }}>
      <BackLink href={href.home()}>Back</BackLink>
      <div className="species">
        <section aria-label={sp.name} className={`hero-card${mine ? ' hero-card--gilt' : ''}`}>
          <div className="row row--between">
            <span className="mono small muted">{dexNo(sp.id)}</span>
            {!sp.obtainable && <Pill tone="neutral">No regular source</Pill>}
          </div>
          <div className="hero-tile">
            <Sprite id={sp.id} name={sp.name} shiny size={160} eager />
            {mine && <SparkleIcon size={24} className="sparkle" />}
          </div>
          <div className="row" style={{ flexWrap: 'nowrap', gap: 10 }}>
            <div className="mini-tile"><Sprite id={sp.id} name={sp.name} shiny={false} size={48} eager /></div>
            <div style={{ minWidth: 0 }}>
              <h1 className="h1 h1--species">{sp.name}</h1>
              <span className="muted row" style={{ gap: 8 }}>{sp.types.join(' · ')} <HuntBadge kind={d.game.huntKind(sp)} /></span>
            </div>
          </div>
          <Tracking sp={sp} />
          {family.length > 1 && <EvolutionLine sp={sp} family={family} />}
        </section>

        <div className="species-main">
          <DexEntry sp={sp} />
          <HuntSummaryPanel sp={sp} family={family} game={d.game} />
        </div>
      </div>
    </div>
  );
}

/** Your shiny and your goal for this species, kept to a few lines inside the card. */
function Tracking({ sp }: { sp: Species }) {
  const d = useDerived()!;
  const store = useStore();
  const entry = d.dex.get(sp.name);
  const latest = entry.catches[0];
  const goal = d.goals.get(sp.name);
  const progress = d.progress.get(sp.name);
  const family = d.game.family(sp.id);
  const familyNames = new Set(family.map((f) => f.name));
  const lineCatch = !latest
    ? store.rows.caught.find((c) => isOwned(c) && familyNames.has(currentSpecies(c)) && d.game.canBecome(d.game.byName.get(currentSpecies(c))!.id, sp.id))
    : undefined;
  const linkTo = (name: string) => href.species(d.game.byName.get(name)?.id ?? 0);

  return (
    <div className="track">
      {latest ? (
        <div className="stack" style={{ gap: 6 }}>
          <div className="row" style={{ gap: 8 }}>
            <SparkleIcon size={16} />
            <strong>Shiny #{d.shinyNumber.get(latest.id)}</strong>
            {catchStatusPill(latest.status)}
            {entry.catches.length > 1 && <Pill tone="gold">×{entry.catches.length}</Pill>}
          </div>
          <span className="small muted">
            {[
              formatWhen(latest.caught_at).date,
              latest.encounters ? `${formatCount(Number(latest.encounters))} enc` : null,
              latest.nature || null,
            ].filter(Boolean).join(' · ')}
            {latest.species !== sp.name && <> · caught as <a href={linkTo(latest.species)}>{latest.species}</a></>}
            {latest.current_form && latest.current_form !== sp.name && <> · now <a href={linkTo(latest.current_form)}>{latest.current_form}</a></>}
          </span>
          <div className="row" style={{ gap: 8 }}>
            <a className="btn btn--small" href={href.editCatch(latest.id)}>Edit</a>
            <a className="btn btn--small btn--ghost" href={href.newCatch(sp.name)}>Log another</a>
          </div>
          {entry.catches.length > 1 && <OtherCatches catches={entry.catches.slice(1)} />}
        </div>
      ) : (
        <div className="row" style={{ gap: 8 }}>
          {lineCatch ? (
            <a className="btn btn--small btn--primary" href={href.editCatch(lineCatch.id)}>Mark {currentSpecies(lineCatch)} as evolved</a>
          ) : (
            <a className="btn btn--small btn--primary" href={href.newCatch(sp.name)}>Log shiny</a>
          )}
          {!goal && <button type="button" className="btn btn--small" onClick={() => store.saveGoal({ species: sp.name, priority: DEFAULT_PRIORITY, notes: '' })}>+ Goal</button>}
          {lineCatch && <a className="btn btn--small btn--ghost" href={href.newCatch(sp.name)}>Log a new one</a>}
        </div>
      )}
      {goal && progress?.kind !== 'done' && <GoalControls goal={goal} />}
      {progress?.kind === 'evolve' && (
        <span className="small" style={{ color: 'var(--lagoon-deep)', fontWeight: 600 }}>
          Have {progress.from}: {progress.steps.map((s) => `${s.how} → ${d.game.name(s.id)}`).join(', ')}
        </span>
      )}
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

function OtherCatches({ catches }: { catches: CatchRow[] }) {
  return (
    <details className="small">
      <summary>Earlier shinies ({catches.length})</summary>
      <div className="stack" style={{ gap: 6, marginTop: 6 }}>
        {catches.map((c) => (
          <div key={c.id} className="row row--between" style={{ gap: 8 }}>
            <span>{formatWhen(c.caught_at).date} · {c.encounters ? `${formatCount(Number(c.encounters))} enc` : 'no count'} {catchStatusPill(c.status)}</span>
            <a href={href.editCatch(c.id)}>Edit</a>
          </div>
        ))}
      </div>
    </details>
  );
}

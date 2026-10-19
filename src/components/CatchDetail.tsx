import { parseCount, parseValue } from '../lib/csv';
import { href } from '../lib/router';
import { chanceWithin, countsForLuck, formatCount, formatValue, oddsOf } from '../lib/stats';
import { DEFAULT_ODDS, type CatchRow } from '../lib/types';
import { formatWhen, STATUS_LABEL } from './ui';

const NATURE_EFFECT: Record<string, string> = {
  Lonely: '+Atk / −Def', Brave: '+Atk / −Spe', Adamant: '+Atk / −SpA', Naughty: '+Atk / −SpD',
  Bold: '+Def / −Atk', Relaxed: '+Def / −Spe', Impish: '+Def / −SpA', Lax: '+Def / −SpD',
  Timid: '+Spe / −Atk', Hasty: '+Spe / −Def', Jolly: '+Spe / −SpA', Naive: '+Spe / −SpD',
  Modest: '+SpA / −Atk', Mild: '+SpA / −Def', Quiet: '+SpA / −Spe', Rash: '+SpA / −SpD',
  Calm: '+SpD / −Atk', Gentle: '+SpD / −Def', Sassy: '+SpD / −Spe', Careful: '+SpD / −SpA',
  Hardy: 'Neutral', Docile: 'Neutral', Serious: 'Neutral', Bashful: 'Neutral', Quirky: 'Neutral',
};

function Fact({ label, value, sub, mono }: { label: string; value: string; sub?: string | null; mono?: boolean }) {
  return (
    <div className="fact">
      <span className="eyebrow">{label}</span>
      <span className={mono ? 'fact-value fact-value--mono' : 'fact-value'}>{value}</span>
      {sub && <span className="small muted">{sub}</span>}
    </div>
  );
}

function EmptyFact({ label, id }: { label: string; id: string }) {
  return (
    <div className="fact fact--empty">
      <span className="eyebrow">{label}</span>
      <span className="fact-value">Not entered</span>
      <a className="small" style={{ fontWeight: 600 }} href={href.editCatch(id)}>Add<span className="sr-only"> {label.toLowerCase()}</span></a>
    </div>
  );
}

export function CatchFacts({ c }: { c: CatchRow }) {
  const when = formatWhen(c.caught_at);
  const enc = parseCount(c.encounters);
  const odds = oddsOf(c);
  const est = parseValue(c.est_value);
  const sold = parseValue(c.sold_for);
  const pace = enc && countsForLuck(c) ? odds / enc : null;
  const paceLabel = pace === null ? null
    : pace >= 0.9 && pace <= 1.1 ? 'About average'
      : pace > 1 ? `${pace >= 10 ? Math.round(pace) : pace.toFixed(1)}× faster than average`
        : `${(1 / pace).toFixed(1)}× the average grind`;

  return (
    <div className="facts">
      <Fact label="Caught" value={when.date} sub={when.time} />
      {enc !== null ? <Fact label="Encounters" value={formatCount(enc)} sub={paceLabel} mono /> : <EmptyFact label="Encounters" id={c.id} />}
      <Fact label="Est. value" value={formatValue(est)} sub={c.status === 'sold' && sold !== null ? `Sold for ${formatValue(sold)}` : STATUS_LABEL[c.status]} />
      {c.method ? <Fact label="Method" value={c.method.replace(/^./, (m) => m.toUpperCase())} /> : <EmptyFact label="Method" id={c.id} />}
      {c.location ? <Fact label="Location" value={c.location} sub={c.season || null} /> : <EmptyFact label="Location" id={c.id} />}
      {c.nature && <Fact label="Nature" value={c.nature} sub={NATURE_EFFECT[c.nature] ?? null} />}
      {c.ivs && <Fact label="IVs" value={c.ivs} />}
      {c.ball && <Fact label="Ball" value={c.ball} />}
      {c.form && <Fact label="Form" value={c.form} />}
      {c.current_form && <Fact label="Evolved" value={`Into ${c.current_form}`} sub={c.evolved_on ? formatWhen(c.evolved_on).date : null} />}
      {odds !== DEFAULT_ODDS && <Fact label="Odds" value={`1 in ${formatCount(odds)}`} />}
      {c.sold_on && <Fact label="Sold on" value={formatWhen(c.sold_on).date} />}
    </div>
  );
}

export function Thoughts({ c }: { c: CatchRow }) {
  if (!c.thoughts) return null;
  const enc = parseCount(c.encounters);
  const odds = oddsOf(c);
  let caption: string | null = null;
  if (enc && countsForLuck(c)) {
    const p = chanceWithin(enc, odds);
    const oneIn = Math.round(1 / p);
    caption = `A ${(p * 100).toFixed(1)}% chance of a shiny within ${formatCount(enc)} encounters${p < 0.5 ? `, about 1 in ${oneIn}` : ''}.`;
  }
  return (
    <figure className="quote">
      <span className="eyebrow">Thoughts</span>
      <blockquote>{c.thoughts}</blockquote>
      {caption && <figcaption>{caption}</figcaption>}
    </figure>
  );
}

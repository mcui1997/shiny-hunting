import { ABILITY_RENAME } from './abilities-en.mjs';

// "Uses" tags: what a species is good for outside of battling, worked out by fixed rules from
// its abilities and the moves it can learn. Nothing here is a judgement call.
//
// Ability effects are PokeMMO's own, translated from the out-of-battle notes in PokeMMO Hub's
// src/data/pokemmo/ability.json ("战斗外（首位非濒死效果）" = outside battle, while it leads the
// party and isn't fainted). Several differ from the main games: Synchronize is 20% here, and
// Compound Eyes, Static and Magnet Pull have no out-of-battle effect in PokeMMO, so they get no tag.
// Move effects are standard battle effects; Sweet Scent and the field moves are from the PokeMMO
// wiki's Field moves page.

const LEAD = 'while it leads';

/** ability -> [tag, effect] */
const ABILITY_USES = {
  'Flame Body': ['egg', `Eggs hatch 50% faster ${LEAD}`],
  'Magma Armor': ['egg', `Eggs hatch 50% faster ${LEAD}`],
  Synchronize: ['sync', `20% chance a wild Pokémon gets its nature, ${LEAD}`],
  'Cute Charm': ['gender', `+25% chance of the opposite gender, hordes included, ${LEAD}`],
  Pickup: ['pickup', `10% chance to pick up an item after battle, ${LEAD}`],
  'Honey Gather': ['honey', 'May gather Honey after battle if it holds nothing; likelier at higher level'],
  Illuminate: ['more', `+10% wild encounters ${LEAD}`],
  'Arena Trap': ['more', `+10% wild encounters ${LEAD}`],
  Swarm: ['more', `+10% wild encounters ${LEAD}`],
  'No Guard': ['more', `+10% wild encounters ${LEAD}`],
  Stench: ['fewer', `−15% wild encounters ${LEAD}`],
  'White Smoke': ['fewer', `−15% wild encounters ${LEAD}`],
  'Quick Feet': ['fewer', `−10% wild encounters ${LEAD}`],
  'Sand Veil': ['fewer', `−25% wild encounters in a sandstorm, ${LEAD}`],
  Pressure: ['higher', `+50% chance of wild Pokémon above its level, ${LEAD}`],
  Hustle: ['higher', `+50% chance of wild Pokémon above its level, ${LEAD}`],
  'Vital Spirit': ['higher', `+50% chance of wild Pokémon above its level, ${LEAD}`],
  Intimidate: ['lower', `−50% encounters with wild Pokémon below its level, ${LEAD}`],
  'Keen Eye': ['lower', `−50% encounters with wild Pokémon below its level, ${LEAD}`],
  'Suction Cups': ['fishing', `+10% fishing success ${LEAD}`],
  'Sticky Hold': ['fishing', `+10% fishing success ${LEAD}`],
  'Run Away': ['escape', 'Always escapes wild battles'],
  'Shadow Tag': ['trap', "Foes can't flee or switch for 3 turns; a wild Pokémon's Teleport fails"],
  'Magnet Pull': ['trap', "Steel-type foes can't flee or switch"],
};

/** Abilities with a battle trapping effect in addition to an out-of-battle one. */
const TRAP_ABILITIES = { 'Arena Trap': "Grounded foes can't flee or switch; Teleport fails" };

/** move -> [tag, effect]. Accuracy is added from moves.json where it matters. */
const MOVE_USES = {
  'Sweet Scent': ['scent', 'Starts a horde'],
  'False Swipe': ['swipe', 'Always leaves the target at 1 HP or more'],
  Sketch: ['sketch', 'Permanently copies the last move a foe used'],
  Spore: ['sleep', 'Sleep'],
  'Sleep Powder': ['sleep', 'Sleep'],
  Hypnosis: ['sleep', 'Sleep'],
  'Lovely Kiss': ['sleep', 'Sleep'],
  Sing: ['sleep', 'Sleep'],
  GrassWhistle: ['sleep', 'Sleep'],
  'Dark Void': ['sleep', 'Sleep'],
  Yawn: ['sleep', 'Falls asleep at the end of the next turn'],
  'Thunder Wave': ['para', 'Paralysis'],
  Glare: ['para', 'Paralysis'],
  'Stun Spore': ['para', 'Paralysis'],
  'Mean Look': ['trap', "Target can't flee or switch"],
  Block: ['trap', "Target can't flee or switch"],
  'Spider Web': ['trap', "Target can't flee or switch"],
  Cut: ['field', 'Clears small trees'],
  Surf: ['field', 'Crosses water'],
  Fly: ['field', 'Flies to Pokémon Centers you have visited'],
  'Rock Smash': ['field', 'Breaks cracked rocks'],
  Strength: ['field', 'Pushes boulders'],
  Flash: ['field', 'Lights up dark caves'],
  Waterfall: ['field', 'Climbs waterfalls'],
  Whirlpool: ['field', 'Crosses whirlpools'],
  Dive: ['field', 'Dives underwater'],
  'Rock Climb': ['field', 'Climbs rocky walls'],
};

/** Display order and labels. */
export const USE_TAGS = [
  ['scent', 'Sweet Scent'],
  ['swipe', 'False Swipe'],
  ['sleep', 'Puts to sleep'],
  ['para', 'Paralyzes'],
  ['trap', 'Stops fleeing'],
  ['sync', 'Synchronize'],
  ['gender', 'Cute Charm'],
  ['egg', 'Egg hatcher'],
  ['pickup', 'Pickup'],
  ['honey', 'Honey Gather'],
  ['more', 'More encounters'],
  ['fewer', 'Fewer encounters'],
  ['higher', 'Higher-level encounters'],
  ['lower', 'Fewer weak encounters'],
  ['fishing', 'Better fishing'],
  ['escape', 'Run Away'],
  ['sketch', 'Sketch'],
  ['field', 'Field moves'],
];
const ORDER = new Map(USE_TAGS.map(([k], i) => [k, i]));
const LABEL = new Map(USE_TAGS);

// How a move is learned. "SPECIAL" (event/other) is left out: not something you can plan on.
const LEARN_RANK = { level: 0, EVOLVE: 1, TUTOR: 2, 'TM??': 3, EGG: 4, PREVO: 5 };

function learnLabel(mv) {
  switch (mv.type) {
    case 'level': return mv.level > 1 ? `Lv ${mv.level}` : 'Lv 1';
    case 'EVOLVE': return 'on evolving';
    case 'TUTOR': return 'tutor';
    case 'TM??': return 'TM';
    case 'EGG': return 'egg move';
    case 'EGG & ITEM': return 'egg move';
    default: return null;
  }
}

/** Best way this species itself can learn each move. */
function ownMoves(m) {
  const best = new Map();
  for (const mv of m.moves ?? []) {
    const rank = LEARN_RANK[mv.type === 'EGG & ITEM' ? 'EGG' : mv.type];
    if (rank === undefined || mv.type === 'PREVO') continue;
    const cur = best.get(mv.name);
    const better = !cur || rank < cur.rank || (rank === cur.rank && mv.type === 'level' && (mv.level ?? 0) < (cur.mv.level ?? 0));
    if (better) best.set(mv.name, { rank, mv });
  }
  return best;
}

/**
 * Tags for one species:
 * [{ tag, label, items: [{ name, how, effect, hidden? }] }]
 * `how` is the ability slot ("ability", "hidden ability") or how the move is learned ("Lv 23", "TM", "as Shroomish, Lv 40").
 */
export function usesFor(m, { monsById, parentOf, accuracy }) {
  const groups = new Map();
  const add = (tag, item) => {
    const g = groups.get(tag) ?? { tag, label: LABEL.get(tag), items: [] };
    if (!g.items.some((x) => x.name === item.name)) g.items.push(item);
    groups.set(tag, g);
  };

  // Abilities: same slot rules as the dex (first, second, hidden; "--" = none).
  const [a, b, h] = m.abilities.map((x) => ABILITY_RENAME[x.name] ?? x.name);
  const slots = [[a, false]];
  if (b && b !== a && b !== '--') slots.push([b, false]);
  if (h && h !== '--' && h !== a && h !== b) slots.push([h, true]);
  for (const [name, hidden] of slots) {
    const how = hidden ? 'hidden ability' : 'ability';
    const use = ABILITY_USES[name];
    if (use) add(use[0], { name, how, effect: use[1], ...(hidden && { hidden: true }) });
    if (TRAP_ABILITIES[name]) add('trap', { name, how, effect: TRAP_ABILITIES[name], ...(hidden && { hidden: true }) });
  }

  // Moves: learned directly, or (PREVO) only as an earlier stage of the line.
  const own = ownMoves(m);
  const prevoMoves = new Map();
  for (let p = parentOf(m.id), depth = 0; p !== undefined && depth < 3; p = parentOf(p), depth++) {
    const pm = monsById.get(p);
    if (!pm) break;
    for (const [name, v] of ownMoves(pm)) if (!own.has(name) && !prevoMoves.has(name)) prevoMoves.set(name, { ...v, from: pm.name });
  }
  for (const [name, [tag, effect]] of Object.entries(MOVE_USES)) {
    const v = own.get(name) ?? prevoMoves.get(name);
    if (!v) continue;
    const learned = learnLabel(v.mv);
    if (!learned) continue;
    const how = v.from ? `as ${v.from}, ${learned}` : learned;
    const acc = accuracy.get(name);
    const withAcc = (tag === 'sleep' || tag === 'para') && acc && acc <= 100 ? `${effect}, ${acc}% accurate` : effect;
    add(tag, { name, how, effect: withAcc });
  }

  // Sleep and paralysis: most accurate first.
  for (const t of ['sleep', 'para']) {
    const g = groups.get(t);
    const acc = (n) => { const v = accuracy.get(n) ?? 0; return v <= 100 ? v : 0; }; // 101 = Yawn's delayed sure-hit
    if (g) g.items.sort((x, y) => acc(y.name) - acc(x.name));
  }
  return [...groups.values()].sort((x, y) => ORDER.get(x.tag) - ORDER.get(y.tag));
}

export const RULES = { ABILITY_USES, TRAP_ABILITIES, MOVE_USES };

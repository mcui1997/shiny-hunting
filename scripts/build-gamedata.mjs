// Builds public/data/pokemon.json from PokeMMO Hub's monster.json.
//
// Usage:
//   node scripts/build-gamedata.mjs                 # downloads the pinned source
//   node scripts/build-gamedata.mjs path/to/monster.json
//
// Source: https://github.com/PokeMMO-Tools/pokemmo-hub (src/data/pokemmo/monster.json)
// To pick up a newer PokeMMO patch, bump SOURCE_COMMIT and SOURCE_DATE, then rerun.

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const SOURCE_COMMIT = 'd462e849a7319b52ba6b5f15e368c24e23529dc8';
const SOURCE_DATE = '2026-07-30';
const SOURCE_URL = `https://raw.githubusercontent.com/PokeMMO-Tools/pokemmo-hub/${SOURCE_COMMIT}/src/data/pokemmo/monster.json`;
const MAX_DEX = 649; // Gen 1–5. Higher IDs are alternate-form records and event costumes.

const here = dirname(fileURLToPath(import.meta.url));
const outFile = resolve(here, '../public/data/pokemon.json');

const SEASONS = ['Spring', 'Summer', 'Autumn', 'Winter'];

async function loadSource() {
  const local = process.argv[2];
  if (local) return JSON.parse(await readFile(local, 'utf8'));
  const res = await fetch(SOURCE_URL);
  if (!res.ok) throw new Error(`Download failed: ${res.status} ${SOURCE_URL}`);
  return res.json();
}

const titleCase = (s) => s.charAt(0) + s.slice(1).toLowerCase();

// "2.5%" -> 2.5; "--" -> 0; "Lure" / "Special" / "???" -> null (rate unknown)
function parseRate(v) {
  const s = String(v ?? '').trim();
  if (s.endsWith('%')) return Number.parseFloat(s);
  if (s === '--' || s === '') return 0;
  return null;
}

function evoLabel(e) {
  const item = e.item_name ? e.item_name.replace(/\s*\(EVO\)\s*$/, '') : null;
  switch (e.type) {
    case 'LEVEL': return `Level ${e.val}`;
    case 'ITEM': return item ?? 'Use item';
    case 'TRADE': return 'Trade';
    case 'TRADE_WITH_ITEM': return item ? `Trade holding ${item}` : 'Trade holding item';
    case 'TRADE_FOR_OPPOSITE': return 'Trade (specific partner)';
    case 'HAPPINESS': return 'Friendship';
    case 'HAPPINESS_DAY': return 'Friendship (day)';
    case 'HAPPINESS_NIGHT': return 'Friendship (night)';
    case 'LEVEL_ITEM_DAY': return item ? `Level up holding ${item} (day)` : 'Level up holding item (day)';
    case 'LEVEL_ITEM_NIGHT': return item ? `Level up holding ${item} (night)` : 'Level up holding item (night)';
    case 'ITEM_MALE': return item ? `${item} (male)` : 'Use item (male)';
    case 'ITEM_FEMALE': return item ? `${item} (female)` : 'Use item (female)';
    case 'LEVEL_MALE': return `Level ${e.val} (male)`;
    case 'LEVEL_FEMALE': return `Level ${e.val} (female)`;
    case 'LEVEL_WITH_SKILL': return 'Level up knowing a move';
    case 'LEVEL_WITH_MONSTER': return 'Level up with a specific party member';
    case 'MAX_BEAUTY': return 'Level up with max Beauty';
    case 'ATK_GREATER_THAN_DEF': return `Level ${e.val} (Atk > Def)`;
    case 'ATK_LESS_THAN_DEF': return `Level ${e.val} (Atk < Def)`;
    case 'ATK_EQUAL_TO_DEF': return `Level ${e.val} (Atk = Def)`;
    case 'PERSONALITY_HIGH':
    case 'PERSONALITY_LOW': return `Level ${e.val} (personality)`;
    default:
      if (e.type.startsWith('LEVEL_LOCATION')) return 'Level up at a special location';
      return 'Special';
  }
}

function main(source) {
  const mons = source.filter((m) => m.id >= 1 && m.id <= MAX_DEX);
  if (mons.length !== MAX_DEX) throw new Error(`Expected ${MAX_DEX} species, got ${mons.length}`);
  const nameById = new Map(mons.map((m) => [m.id, m.name]));

  // ---- Evolution families ----
  const parent = new Map();
  for (const m of mons) {
    for (const e of m.evolutions ?? []) {
      if (e.id <= MAX_DEX && nameById.has(e.id) && e.type !== 'CREATE_EXTRA_MONSTER' && e.type !== 'ALLOW_MONSTER_CREATION') {
        if (!parent.has(e.id)) parent.set(e.id, m.id);
      }
    }
  }
  const rootOf = (id) => { let r = id; const seen = new Set(); while (parent.has(r) && !seen.has(r)) { seen.add(r); r = parent.get(r); } return r; };

  // ---- Encounters ----
  // Horde groups: every horde slot sharing region + exact area + encounter type + season + size
  // forms one horde table. A species' share = its rate / all rates in that table, per time of day.
  const groups = new Map();
  const singles = new Map(); // id -> Map(key -> row)
  const rare = new Map();    // id -> Map(key -> row)

  for (const m of mons) {
    for (const l of m.locations ?? []) {
      const size = l.is_horde_5x ? 5 : l.is_horde_3x ? 3 : 0;
      const rates = [parseRate(l.rarity_morning), parseRate(l.rarity_day), parseRate(l.rarity_night)];
      const place = { region: l.region_name, area: l.location_name_full, type: l.type };
      if (rates.some((r) => r === null)) {
        const kind = [l.rarity_morning, l.rarity_day, l.rarity_night].find((v) => parseRate(v) === null);
        const key = `${place.region}|${place.area}|${place.type}|${kind}`;
        const map = rare.get(m.id) ?? new Map(); rare.set(m.id, map);
        const row = map.get(key) ?? { ...place, kind: String(kind), seasons: new Set() };
        row.seasons.add(l.season); map.set(key, row);
        continue;
      }
      if (size) {
        const key = `${l.region_id}|${l.location_id}|${l.type}|${l.season}|${size}`;
        const g = groups.get(key) ?? { ...place, season: l.season, size, slots: new Map() };
        const cur = g.slots.get(m.id) ?? [0, 0, 0];
        g.slots.set(m.id, cur.map((v, i) => v + rates[i]));
        groups.set(key, g);
      } else {
        const key = `${place.region}|${place.area}|${place.type}|${rates.join('/')}|${l.min_level}-${l.max_level}`;
        const map = singles.get(m.id) ?? new Map(); singles.set(m.id, map);
        const row = map.get(key) ?? { ...place, rates, levels: `${l.min_level}–${l.max_level}`, seasons: new Set() };
        row.seasons.add(l.season); map.set(key, row);
      }
    }
  }

  // Turn each horde group into per-species rows with splits, then merge identical rows across seasons.
  const hordes = new Map(); // id -> Map(key -> row)
  for (const g of groups.values()) {
    const totals = [0, 1, 2].map((t) => [...g.slots.values()].reduce((s, r) => s + r[t], 0));
    const split = [0, 1, 2].map((t) =>
      totals[t] === 0 ? [] :
        [...g.slots.entries()]
          .filter(([, r]) => r[t] > 0)
          .map(([id, r]) => [id, Math.round((1000 * r[t]) / totals[t]) / 10])
          .sort((a, b) => b[1] - a[1] || a[0] - b[0]));
    for (const id of g.slots.keys()) {
      const key = `${g.region}|${g.area}|${g.type}|${g.size}|${JSON.stringify(split)}`;
      const map = hordes.get(id) ?? new Map(); hordes.set(id, map);
      const row = map.get(key) ?? { region: g.region, area: g.area, type: g.type, size: g.size, split, seasons: new Set() };
      row.seasons.add(g.season); map.set(key, row);
    }
  }

  const seasonList = (set) => SEASONS.filter((s) => set.has(s));

  const out = mons.map((m) => {
    const evolvesTo = (m.evolutions ?? [])
      .filter((e) => e.id <= MAX_DEX && nameById.has(e.id) && e.type !== 'CREATE_EXTRA_MONSTER' && e.type !== 'ALLOW_MONSTER_CREATION')
      .map((e) => ({ id: e.id, how: evoLabel(e) }));
    const h = [...(hordes.get(m.id)?.values() ?? [])].map((r) => ({
      region: r.region, area: r.area, type: r.type, size: r.size, seasons: seasonList(r.seasons),
      // split per time of day: [morning, day, night], each a list of [speciesId, percent]
      split: r.split,
    }));
    const s = [...(singles.get(m.id)?.values() ?? [])].map((r) => ({
      region: r.region, area: r.area, type: r.type, levels: r.levels, seasons: seasonList(r.seasons), rates: r.rates,
    }));
    const rr = [...(rare.get(m.id)?.values() ?? [])].map((r) => ({
      region: r.region, area: r.area, type: r.type, kind: r.kind, seasons: seasonList(r.seasons),
    }));
    return {
      id: m.id,
      name: m.name,
      types: [...new Set(m.types.map(titleCase))],
      obtainable: Boolean(m.obtainable),
      family: rootOf(m.id),
      evolvesTo,
      hordes: h,
      singles: s,
      rare: rr,
    };
  });

  return {
    source: { name: 'PokeMMO Hub game data', url: 'https://github.com/PokeMMO-Tools/pokemmo-hub', commit: SOURCE_COMMIT, date: SOURCE_DATE },
    pokemon: out,
  };
}

const data = main(await loadSource());
await mkdir(dirname(outFile), { recursive: true });
await writeFile(outFile, JSON.stringify(data));
const kb = Math.round(JSON.stringify(data).length / 1024);
console.log(`Wrote ${data.pokemon.length} species to public/data/pokemon.json (${kb} KB)`);

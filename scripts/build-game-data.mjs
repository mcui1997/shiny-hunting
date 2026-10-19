// Builds data/game.json from PokeMMO Hub's game data.
//
//   node scripts/build-game-data.mjs              # uses the pinned commit below
//   node scripts/build-game-data.mjs <commit-sha> # rebuild from a newer commit
//   HUB_DIR=/path/to/pokemmo-hub node scripts/build-game-data.mjs  # use a local clone
//
// What it does:
//  - keeps the 649 real species (Gen 1-5); drops alternate-form and event/debug entries
//  - groups horde slots that share a spot (region + exact floor/area + encounter type),
//    season and horde size, then turns each slot's rate into its share of that horde,
//    separately for morning, day and night
//  - merges rows that are identical across seasons so tables stay short
//  - keeps every non-horde encounter (grass, caves, fishing rods, lures, specials...)
//
// Nothing here is guessed. Rates the game marks as "Lure", "Special" or "???" are kept
// as labels, never turned into numbers.

import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const HUB_REPO = 'PokeMMO-Tools/pokemmo-hub';
const PINNED_COMMIT = 'd462e849a7319b52ba6b5f15e368c24e23529dc8';
const commit = process.argv[2] || PINNED_COMMIT;
const here = path.dirname(fileURLToPath(import.meta.url));
const outFile = path.join(here, '..', 'data', 'game.json');

async function load(file) {
  if (process.env.HUB_DIR) {
    return JSON.parse(await readFile(path.join(process.env.HUB_DIR, 'src/data/pokemmo', file), 'utf8'));
  }
  const url = `https://raw.githubusercontent.com/${HUB_REPO}/${commit}/src/data/pokemmo/${file}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status} fetching ${url}`);
  return res.json();
}

async function monsterFileDate() {
  try {
    const res = await fetch(`https://api.github.com/repos/${HUB_REPO}/commits?sha=${commit}&path=src/data/pokemmo/monster.json&per_page=1`);
    if (!res.ok) return null;
    const [c] = await res.json();
    return c?.commit?.committer?.date?.slice(0, 10) ?? null;
  } catch {
    return null;
  }
}

const SEASONS = ['Spring', 'Summer', 'Autumn', 'Winter'];
const TIMES = ['m', 'd', 'n']; // morning, day, night
const MAX_DEX = 649;

const titleCase = (s) => s.charAt(0) + s.slice(1).toLowerCase();
const parseRate = (v) => {
  const s = String(v ?? '').trim();
  if (s.endsWith('%')) {
    const n = parseFloat(s);
    return Number.isFinite(n) ? n : 0;
  }
  if (s === '--' || s === '') return 0; // not present at this time of day
  return s; // "Lure", "Special", "???": a label, not a number
};
const round1 = (n) => Math.round(n * 10) / 10;

function evoMethod(e, moveNames, speciesNames) {
  const item = e.item_name ? e.item_name.replace(/\s*\((EVO|ATK|DEF|SPATK|SPDEF|SPD|HP)\)/g, '').trim() : null;
  switch (e.type) {
    case 'LEVEL': return `Level ${e.val}`;
    case 'ITEM': return item;
    case 'TRADE': return 'Trade';
    case 'TRADE_WITH_ITEM': return `Trade holding ${item}`;
    case 'TRADE_FOR_OPPOSITE': return 'Trade for Karrablast/Shelmet';
    case 'HAPPINESS': return 'Friendship';
    case 'HAPPINESS_DAY': return 'Friendship (day)';
    case 'HAPPINESS_NIGHT': return 'Friendship (night)';
    case 'LEVEL_WITH_SKILL': return `Level up knowing ${moveNames.get(e.val) ?? 'a move'}`;
    case 'LEVEL_WITH_MONSTER': return `Level up with ${speciesNames.get(e.val) ?? 'a partner'} in party`;
    case 'LEVEL_ITEM_DAY': return `Level up holding ${item} (day)`;
    case 'LEVEL_ITEM_NIGHT': return `Level up holding ${item} (night)`;
    case 'LEVEL_LOCATION_1':
    case 'LEVEL_LOCATION_2':
    case 'LEVEL_LOCATION_3': return 'Level up at a special location';
    case 'LEVEL_MALE': return `Level ${e.val} (male)`;
    case 'LEVEL_FEMALE': return `Level ${e.val} (female)`;
    case 'ITEM_MALE': return `${item} (male)`;
    case 'ITEM_FEMALE': return `${item} (female)`;
    case 'ATK_GREATER_THAN_DEF': return `Level ${e.val}, Atk > Def`;
    case 'ATK_LESS_THAN_DEF': return `Level ${e.val}, Atk < Def`;
    case 'ATK_EQUAL_TO_DEF': return `Level ${e.val}, Atk = Def`;
    case 'PERSONALITY_HIGH':
    case 'PERSONALITY_LOW': return `Level ${e.val} (random)`;
    case 'ALLOW_MONSTER_CREATION': return `Level ${e.val}`;
    case 'CREATE_EXTRA_MONSTER': return `Level ${e.val} with a free party slot`;
    case 'MAX_BEAUTY': return 'Level up with max Beauty';
    default: return titleCase(e.type.replace(/_/g, ' '));
  }
}

// Group identical per-time member lists: {m: X, d: X, n: Y} -> [{times:['m','d'], ...X}, {times:['n'], ...Y}]
function groupTimes(byTime) {
  const out = [];
  for (const t of TIMES) {
    const key = JSON.stringify(byTime[t]);
    if (!byTime[t] || byTime[t].length === 0) continue;
    const hit = out.find((g) => g.key === key);
    if (hit) hit.times.push(t);
    else out.push({ key, times: [t], members: byTime[t] });
  }
  return out.map(({ times, members }) => ({ times, members }));
}

function mergeSeasons(rows, keyOf) {
  const map = new Map();
  for (const r of rows) {
    const k = keyOf(r);
    const hit = map.get(k);
    if (hit) {
      if (!hit.seasons.includes(r.season)) hit.seasons.push(r.season);
    } else {
      const { season, ...rest } = r;
      map.set(k, { ...rest, seasons: [season] });
    }
  }
  return [...map.values()].map((r) => ({ ...r, seasons: SEASONS.filter((s) => r.seasons.includes(s)) }));
}

async function main() {
  console.log(`Loading PokeMMO Hub data @ ${commit.slice(0, 8)}...`);
  const [monsters, moves, fileDate] = await Promise.all([load('monster.json'), load('moves.json'), monsterFileDate()]);
  const moveNames = new Map(moves.map((m) => [m.id, m.name]));
  const real = monsters.filter((m) => m.id >= 1 && m.id <= MAX_DEX);
  const speciesNames = new Map(real.map((m) => [m.id, m.name]));
  if (real.length !== MAX_DEX) throw new Error(`Expected ${MAX_DEX} species, got ${real.length}`);

  // ---- species + evolutions
  const from = new Map();
  for (const m of real) for (const e of m.evolutions) if (e.id <= MAX_DEX) from.set(e.id, m.id);
  const species = real
    .sort((a, b) => a.id - b.id)
    .map((m) => ({
      id: m.id,
      name: m.name,
      types: [...new Set(m.types)].map(titleCase),
      obtainable: !!m.obtainable,
      from: from.get(m.id) ?? null,
      evos: m.evolutions.filter((e) => e.id <= MAX_DEX).map((e) => ({ to: e.id, how: evoMethod(e, moveNames, speciesNames) })),
    }));

  // ---- encounters
  const hordeSlots = new Map(); // groupKey -> {region, area, type, size, season, rates: {m: Map(id->rate)...}}
  const singles = [];
  for (const m of real) {
    for (const l of m.locations) {
      const season = l.season;
      if (!SEASONS.includes(season)) continue;
      const base = { region: l.region_name, area: l.location_name_full, type: l.type };
      const rates = { m: parseRate(l.rarity_morning), d: parseRate(l.rarity_day), n: parseRate(l.rarity_night) };
      if (l.is_horde_3x || l.is_horde_5x) {
        const size = l.is_horde_5x ? 5 : 3;
        const key = [l.region_id, l.location_id, l.location_name_full, l.type, size, season].join('|');
        let g = hordeSlots.get(key);
        if (!g) {
          g = { ...base, size, season, rates: { m: new Map(), d: new Map(), n: new Map() }, labels: new Set() };
          hordeSlots.set(key, g);
        }
        for (const t of TIMES) {
          const r = rates[t];
          if (typeof r === 'number') {
            if (r > 0) g.rates[t].set(m.id, (g.rates[t].get(m.id) ?? 0) + r);
          } else g.labels.add(`${m.id}:${r}`);
        }
      } else {
        singles.push({ id: m.id, ...base, season, lv: [l.min_level, l.max_level], rates });
      }
    }
  }

  const hordeRows = [];
  for (const g of hordeSlots.values()) {
    const byTime = {};
    for (const t of TIMES) {
      const total = [...g.rates[t].values()].reduce((a, b) => a + b, 0);
      byTime[t] = [...g.rates[t].entries()]
        .map(([id, r]) => [id, round1((r / total) * 100)])
        .sort((a, b) => b[1] - a[1] || a[0] - b[0]);
    }
    const times = groupTimes(byTime);
    if (times.length === 0) continue;
    hordeRows.push({ region: g.region, area: g.area, type: g.type, size: g.size, season: g.season, times });
  }
  const hordes = mergeSeasons(hordeRows, (r) => JSON.stringify([r.region, r.area, r.type, r.size, r.times]))
    .sort((a, b) => a.region.localeCompare(b.region) || a.area.localeCompare(b.area) || b.size - a.size);

  const hordeIndex = {};
  hordes.forEach((h, i) => {
    const ids = new Set(h.times.flatMap((t) => t.members.map(([id]) => id)));
    for (const id of ids) (hordeIndex[id] ??= []).push(i);
  });

  const singleRows = mergeSeasons(singles, (r) => JSON.stringify([r.id, r.region, r.area, r.type, r.lv, r.rates]));
  const encounters = {};
  for (const r of singleRows) {
    const { id, ...rest } = r;
    (encounters[id] ??= []).push(rest);
  }

  const out = {
    source: {
      name: 'PokeMMO Hub game data',
      repo: `https://github.com/${HUB_REPO}`,
      commit,
      monsterFileDate: fileDate ?? '2026-07-30',
      builtAt: new Date().toISOString().slice(0, 10),
    },
    species,
    hordes,
    hordeIndex,
    encounters,
  };
  await writeFile(outFile, JSON.stringify(out));
  const kb = Math.round(JSON.stringify(out).length / 1024);
  console.log(`Wrote ${path.relative(process.cwd(), outFile)}: ${species.length} species, ${hordes.length} horde rows, ${singleRows.length} other encounter rows (${kb} KB)`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

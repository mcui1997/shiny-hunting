// Refreshes the stats block in README.md from public/data/tracker.json, using the same
// math as the site's Stats page. Run: npm run readme
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { makeResolver, normalizeCatches, parseTracker } from '../src/lib/data';
import { Game } from '../src/lib/game';
import { chronological, currentSpecies, formatCount, summarize } from '../src/lib/stats';
import type { GameData } from '../src/lib/types';

const root = resolve(import.meta.dirname, '..');
const game = new Game(JSON.parse(readFileSync(resolve(root, 'public/data/pokemon.json'), 'utf8')) as GameData);
const raw = parseTracker(readFileSync(resolve(root, 'public/data/tracker.json'), 'utf8'));
const caught = normalizeCatches(raw.caught, makeResolver(game.names)).rows;
const s = summarize(caught);
const latest = chronological(caught).at(-1);

const statusParts = [`${s.kept} kept`, s.sold && `${s.sold} sold`, s.traded && `${s.traded} traded`, s.fled && `${s.fled} fled`].filter(Boolean).join(', ');
const latestLabel = latest
  ? `${currentSpecies(latest)}${currentSpecies(latest) !== latest.species ? ` (caught as ${latest.species})` : ''}, ${latest.caught_at.slice(0, 10)}`
  : 'none yet';

const block = [
  '<!-- stats:start -->',
  '| Shinies | Encounters | Per shiny | Luck | Latest |',
  '|:-:|:-:|:-:|:-:|:-:|',
  `| **${s.total}** (${statusParts}) | ${formatCount(s.encounters)} | ${s.average ? formatCount(Math.round(s.average)) : '—'} | ${s.luck === null ? '—' : `${s.luck.toFixed(2)}×`} | ${latestLabel} |`,
  '<!-- stats:end -->',
].join('\n');

const path = resolve(root, 'README.md');
const readme = readFileSync(path, 'utf8');
const next = readme.replace(/<!-- stats:start -->[\s\S]*?<!-- stats:end -->/, block);
if (next === readme && !readme.includes('<!-- stats:start -->')) throw new Error('README.md has no <!-- stats:start --> block');
writeFileSync(path, next);
console.log(block);

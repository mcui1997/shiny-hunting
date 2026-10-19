# shiny-hunting

Personal PokeMMO shiny hunt tracker. Live at **https://mcui1997.github.io/shiny-hunting/**

A static site (Vite + React + TypeScript) on GitHub Pages. No backend: your data is three CSV files in this repo, and the encounter data is generated from the game's data files.

## Your data

All in `public/data/`. Edit them on GitHub, in any spreadsheet app, or on the site and export.

### `caught.csv` — one row per shiny

| Column | Notes |
|---|---|
| `id` | `s001`, `s002`… Unique. Leave blank on new rows and the site assigns one. |
| `species` | What you caught. Never changes, even after evolving. |
| `form` | Only for Unown letters, Deerling seasons, etc. |
| `current_form` | What it is now, if you evolved it. Blank = same as `species`. Put the final stage only: Litwick → `Chandelure` also marks Lampent in your dex. |
| `evolved_on` | `2026-10-20` |
| `caught_at` | `2026-10-17 19:14` (also reads `10/17/26, 7:14 PM`) |
| `encounters` | **Since your previous shiny**, so totals and luck add up. A second shiny in the same horde is `0`. |
| `method` | `5x horde`, `3x horde`, `single`, `fishing`, `safari`, `egg`, `traded`, `bought`, `other` |
| `location`, `season` | Free text / `Spring`… |
| `nature`, `ivs`, `ball` | Optional |
| `odds` | 1 in N. Blank = 27,000. Set it per row if your odds change, so old catches keep theirs. |
| `est_value`, `sold_for` | `2000000` (the site also accepts `2M`, `350K`) |
| `status` | `kept`, `sold`, `traded`, `fled` (fled/KO'd still counts toward luck, not the collection) |
| `sold_on` | Date |
| `screenshot` | File name in `public/screenshots/`, or a full link |
| `thoughts` | Anything. Commas, quotes and line breaks are fine. |

Traded and bought shinies are left out of luck stats.

### `goals.csv`

`species, priority (P1–P3 or blank), status (planned / hunting / paused), notes`. A goal is **done** automatically when you own a shiny that is that species now. If you own an earlier stage (a Litwick for a Chandelure goal), it shows **evolve to finish**. Sold, traded and fled shinies never complete a goal.

### `notes.csv`

`species, notes` — your own hunt notes, shown on each Pokémon's page.

## Editing on the site

Edits on the site are saved in your browser first, and a banner shows which files aren't in the repo yet. Export the CSV and commit it (or hand it to Claude). Once the repo has the same content, the banner clears by itself. If the repo copy changes while you have local edits, the site warns you instead of overwriting either side.

**Import CSV** loads a file you edited elsewhere, including the old spreadsheet's export (`Pokémon, Encounters, Capture Date, Value, Sold?, Thoughts`). Rows it can't read are listed, never silently dropped.

## Game data

`public/data/pokemon.json` is generated from [PokeMMO Hub](https://github.com/PokeMMO-Tools/pokemmo-hub)'s `monster.json` (pinned commit, data as of 2026-07-30): every species #1–649 with types, evolutions, and every encounter by season, time of day and horde size. Horde splits are calculated by grouping slots that share an exact area, encounter type, season and size.

To update after a PokeMMO patch, bump `SOURCE_COMMIT` / `SOURCE_DATE` in `scripts/build-gamedata.mjs`, then:

```sh
npm run gamedata
npm test   # includes checks against hunts confirmed in-game
```

Sprites load from the [PokeAPI sprites](https://github.com/PokeAPI/sprites) repo (Gen 5 animated, with static fallbacks).

## Development

```sh
npm install
npm run dev      # http://localhost:5173/shiny-hunting/
npm test
npm run build
```

Pushing to `main` runs tests and deploys to Pages (Settings → Pages → Source: GitHub Actions).

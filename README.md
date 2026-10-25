<h1 align="center">✦ Shiny Hunt Tracker</h1>

<p align="center">
  A personal PokeMMO shiny log: every catch, every goal, and where to hunt next.<br>
  <a href="https://mcui1997.github.io/shiny-hunting/"><b>Open the site →</b></a>
</p>

<p align="center">
  <img src="docs/screenshot.png" alt="The dex view: shiny, encounter and luck totals above the full Pokédex grid" width="880">
</p>

## What it does

- **Home**: totals and a tier list: Owned, Hunting, S, A, B, with quick edits
- **Dex** of all 649 Gen 1–5 Pokémon as small tiles, shiny or normal: search, season and solo-horde filters, a final-forms toggle and All / Unowned / Missing (not owned and not a goal), Owned bubbles, a 5x / 3x / egg / other badge, and a ⋯ on each tile to add it to a goal
- **Species pages** lead with abilities and what each does (PokeMMO's own effects, in and out of battle), then base stats, EV yield, egg groups, gender, catch rate, tier
- **Uses** worked out from abilities and learnable moves: egg hatcher, Synchronize (20% in PokeMMO), Sweet Scent, False Swipe, sleep and paralysis moves, trapping, encounter-rate abilities
- **Hunt summary**: best 5x horde share in each season, for the species and its earlier stages, with a link to the PokeMMO wiki
- **Your log** of catches with evolutions, categories, and luck against 1 in 27,000 (donator status)
- **Net worth** on Stats: kept shinies' values plus manual amounts for non-shiny Pokémon, cosmetics and Pokeyen on hand
- **Edit on the site**, then export `tracker.json` and commit. No backend.
- **Safe to import any file:** every entry is validated and size-capped, and the page runs under a strict Content Security Policy

## Your data

Everything lives in one file, `public/data/tracker.json`. Each entry sits on its own line, blank fields are left out, and encounters are numbers:

```json
{
  "version": 1,
  "caught": [
    {"id":"s001","species":"Aron","current_form":"Aggron","caught_at":"2026-09-23 21:04","encounters":26321,"method":"5x horde","status":"kept","tag":"cosmetic"}
  ],
  "goals": [
    {"species":"Xatu","priority":"hunting"}
  ],
  "notes": [],
  "worth": {"pokemon": 12000000, "cosmetics": 850000, "pokeyen": 3000000}
}
```

Import on the site replaces all three lists; Export downloads the whole file.

<details>
<summary><b>caught fields</b></summary>

<br>

| Field | Notes |
|---|---|
| `species` / `current_form` | What you caught / what it is now. Put the final stage only; stages in between are marked too. |
| `caught_at` | `2026-10-17 19:14` |
| `encounters` | Since your previous shiny |
| `method` | `5x horde`, `3x horde`, `single`, `fishing`, `safari`, `egg`, `traded`, `bought`, `other` |
| `odds` | Leave out for 1 in 27,000 (donator status) |
| `status` | `kept`, `sold`, `traded`, `fled` |
| `tag` | Category for the Owned filter, e.g. `utility`, `cosmetic`, or your own |
| `value` | Pokeyen. Counts toward net worth while kept; `2.5M` or `2500000` on the site |

Also: `id`, `form`, `evolved_on`, `location`, `season`, `nature`, `ivs`, `ball`, `sold_on`.
Goals have `species` and `priority` (the tier): `hunting`, `s`, `a` or `b`. Older files (P1–P3, current/future/unplanned) are converted on import.

</details>

## Develop

```sh
npm install && npm run dev   # localhost:5173/shiny-hunting/
npm test
npm run gamedata             # refresh encounter data after a PokeMMO patch
```

Pushing to `main` tests and deploys to GitHub Pages.

<sub>Encounter data from <a href="https://github.com/PokeMMO-Tools/pokemmo-hub">PokeMMO Hub</a> · sprites from <a href="https://github.com/PokeAPI/sprites">PokeAPI</a></sub>

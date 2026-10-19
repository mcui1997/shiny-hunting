<h1 align="center">✦ Shiny Hunt Tracker</h1>

<p align="center">
  A personal PokeMMO shiny log: every catch, every goal, and where to hunt next.<br>
  <a href="https://mcui1997.github.io/shiny-hunting/"><b>Open the site →</b></a>
</p>

<p align="center">
  <img src="docs/screenshot.png" alt="The dex view: luck, encounter and value totals above a grid of owned shiny Pokémon" width="880">
</p>

## What it does

- **Dex** of all 649 Gen 1–5 Pokémon in shiny and normal, filtered by owned, goals, season and solo hordes
- **Hunt plans** for every species: horde splits by season and time of day, including earlier evolutions
- **Your log** of catches with Thoughts, evolutions, value, and luck against 1 in 27,000 (donator status)
- **Edit on the site**, then export CSV and commit. No backend.
- **Safe to import anyone's CSV:** rows are validated, exports are spreadsheet-safe, and the page runs under a strict Content Security Policy

## Your data

| File | What's in it |
|---|---|
| `public/data/caught.csv` | One row per shiny |
| `public/data/goals.csv` | Targets, priority, status |
| `public/data/notes.csv` | Your own hunt notes |

<details>
<summary><b>caught.csv columns</b></summary>

<br>

| Column | Notes |
|---|---|
| `species` / `current_form` | What you caught / what it is now. Put the final stage only; stages in between are marked too. |
| `caught_at` | `2026-10-17 19:14` |
| `encounters` | Since your previous shiny |
| `method` | `5x horde`, `3x horde`, `single`, `fishing`, `safari`, `egg`, `traded`, `bought`, `other` |
| `odds` | Blank = 1 in 27,000 (donator status) |
| `est_value` / `sold_for` | `2000000` or `2M` |
| `status` | `kept`, `sold`, `traded`, `fled` |

Also: `id`, `form`, `evolved_on`, `location`, `season`, `nature`, `ivs`, `ball`, `sold_on`, `thoughts`.

</details>

## Develop

```sh
npm install && npm run dev   # localhost:5173/shiny-hunting/
npm test
npm run gamedata             # refresh encounter data after a PokeMMO patch
```

Pushing to `main` tests and deploys to GitHub Pages.

<sub>Encounter data from <a href="https://github.com/PokeMMO-Tools/pokemmo-hub">PokeMMO Hub</a> · sprites from <a href="https://github.com/PokeAPI/sprites">PokeAPI</a></sub>

# Adding a game

Contributions are welcome. The full guide is [ADDING_A_GAME.md](https://github.com/GNRRaiser/Steam-Custom-Achievements/blob/main/ADDING_A_GAME.md) in the repo; this page is the overview.

## A checklist game (no save research)

A game is one folder, `source/games/<slug>/`, with a `game.json` that lists its achievements. Start with `"detector": null`, so every achievement has a **Mark as unlocked** button.

1. Create `source/games/<slug>/game.json`. `appId` is the number in the game's Steam store URL.
2. Optionally add pictures as `source/games/<slug>/art/<index>.webp` (or `.png`/`.jpg`), numbered in list order from 0, ideally 256x256 or smaller.
3. Add the slug to `ORDER` in `source/build.py` and run `python source/build.py`.
4. Add the game to `ORDER` and `GAME_INFO` in `source/site.py` and run it to make the game's web page.
5. Run the tests and open a pull request. Commit the generated files too; CI fails if they're out of date.

## Automatic unlocks

The plugin needs to understand the game's save:

- **Call of Duty 4 engine games** only need rules in `game.json` (missions, skill level, config values).
- **A new save format** needs a `backend/detector_<name>.lua`. Detectors only read files, and a save they don't fully understand must never unlock anything.

The easiest way to find where a game stores something is a repo build's **Record an achievement** (Settings tab): it saves your save files before and after you earn an achievement, so you can compare them.

## Rules for contributions

- Never commit real save files. Describe what changed, or build a small test fixture like the ones in `tests/`.
- Don't commit game files (executables, data archives). Only the IDs and names derived from them.

## Building and testing

You need Python 3, Node.js, `pip install lupa` and `npm install jsdom`.

```sh
python source/build.py
python source/site.py
for t in tests/test_*.py; do python "$t"; done
for t in tests/test_*.cjs; do node "$t"; done
```

GitHub runs all of these on every pull request.

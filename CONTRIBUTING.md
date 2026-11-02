# Contributing

Thanks for wanting to help. Steam Custom Achievements is a small fan project, so every bug report, unlock rate, picture and new game makes a real difference.

By taking part you agree to follow the [Code of Conduct](CODE_OF_CONDUCT.md). Security problems go through [SECURITY.md](SECURITY.md), not public issues.

## Ways to help

- **Report a bug.** [Open an issue](../../issues) with the game, the achievement, what you expected and what happened, and the text from **View My Achievements > Settings > Copy status**. Please don't attach save files to a public issue. They can contain your name and PC paths.
- **Suggest a game.** It fits if its Steam version has no achievements but another version had them (Xbox 360, PS3 or Games for Windows Live). Open an issue with the game's Steam store link and where its achievement list can be found.
- **Fix data.** Wrong names, descriptions, groups or unlock rates live in `source/games/<slug>/game.json`.
- **Add pictures.** Achievement pictures go in `source/games/<slug>/art/<index>.webp` (or `.png`/`.jpg`), numbered in list order from 0, 256x256 or smaller.
- **Make more achievements unlock automatically.** This means working out where a game stores the progress. See [ADDING_A_GAME.md](ADDING_A_GAME.md) for how detectors work and how record mode helps.
- **Improve the docs.** The wiki is built from the `wiki/` folder, so edit pages there (changes are published to the wiki when they reach `main`).

## Adding a game

[ADDING_A_GAME.md](ADDING_A_GAME.md) is the full guide, and the [Adding a game](../../wiki/Adding-a-Game) wiki page is the short version. In short:

1. Create `source/games/<slug>/game.json` with `"detector": null`, so every achievement starts with a **Mark as unlocked** button.
2. Add the slug to `ORDER` in `source/build.py`, and to `ORDER` and `GAME_INFO` in `source/site.py`.
3. Run `python source/build.py` and `python source/site.py`, and commit the files they generate.
4. Automatic unlocks can come later, in their own pull request.

## Setting up

You need Python 3.12 or newer and Node.js 22 or newer. The test tools are only needed for running tests and are never shipped with the plugin.

```sh
pip install lupa
npm install jsdom playwright
npx playwright install chromium
```

If you install the Node packages somewhere outside the repository, point the tests at them with `SCA_TEST_MODULES=<that folder>/node_modules` and `SCA_PLAYWRIGHT_MODULE=<that folder>/node_modules/playwright`.

## Before you open a pull request

Run the same checks GitHub runs on every pull request:

```sh
python source/build.py
python source/site.py
for t in tests/test_*.py; do python "$t"; done
for t in tests/test_*.cjs; do node "$t"; done
```

- `build.py` and `site.py` regenerate `.millennium/Dist/index.js`, `backend/games.lua` and the website in `docs/`. Commit what they change. The **Build is up to date** check fails if the generated files don't match `source/`.
- Every test must pass. Don't skip or loosen a test to make it pass. If a test is wrong, fix the test and say why in the pull request.
- New detector code needs a test with a small made-up fixture, like the `*_fixture.py` files in `tests/`.

## Pull requests

- Work on a branch in your fork and open the pull request against `main`.
- Keep each pull request to one change, such as one game, one fix or one feature, with a title that says what it does.
- In the description, say what changed and how you checked it, for example which game and achievement you tested in Steam.
- Leave the version number in `source/build.py` alone. It's changed when a release is made.
- The maintainer reviews and merges. A green tick on all checks is needed first.

## Rules the plugin follows

These keep it safe for everyone, so pull requests that break them can't be merged:

- **Read-only.** The plugin only reads game saves and profiles. It never changes or deletes them.
- **Never guess.** A save that's damaged, cut off or in an unknown layout must never unlock anything.
- **No network.** The plugin doesn't send or download anything, and the tests check for it.
- **No real saves or game files in the repository.** That means no `.sav`, `.prf`, `.fos` or similar, and no game executables or data archives. Use made-up test fixtures, and only the IDs and names you found.
- **No new runtime dependencies.** The plugin runs inside Steam through Millennium with what's in this repository.

## Licence

By contributing, you agree that your work is released under the repository's [MIT license](LICENSE). Achievement names, descriptions and icons belong to their games' publishers and aren't covered by it.

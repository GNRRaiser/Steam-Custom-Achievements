# Steam Custom Achievements

Steam-style achievements for PC games that only had achievements on Xbox 360 and PS3, like Mass Effect, Assassin's Creed and Fable III. It's a [Millennium](https://steambrew.app) plugin: each supported game gets an ACHIEVEMENTS card on its Library page, an ACHIEVEMENTS stat next to PLAY TIME, and a full "View My Achievements" list.

Most achievements unlock by themselves: the plugin reads the game's saves (read-only) and unlocks an achievement a few seconds after the game records the progress. The rest have a "Mark as unlocked" button.

It's an unofficial fan plugin. The achievements only show in your own Steam client, not on your Steam profile.

**Install guide on Steam:** https://steamcommunity.com/sharedfiles/filedetails/?id=3830564916

## Supported games

The achievements come from each game's Xbox 360 list, plus the PS3 platinum. Mass Effect, Brotherhood and Fable III keep their own achievement list inside the game, which made those much easier to get working. When you unlock one while playing, it pops up in the bottom right corner with a sound, just like a real Steam achievement.

| Game | Steam app ID | Achievements | Unlock automatically |
| --- | --- | --- | --- |
| Assassin's Creed | 15100 | 44 | 44 |
| Assassin's Creed II | 33230 | 51 | 41 |
| Assassin's Creed Brotherhood | 48190 | 61 | 50 |
| Call of Duty 4: Modern Warfare | 7940 | 37 | 24 |
| Call of Duty: World at War | 10090 | 67 | 22 |
| Fable III | 105400 | 60 | 60 |
| Fallout 3 - Game of the Year Edition | 22370 | 72 | 72 |
| Mass Effect | 17460 | 50 | 45 |
| Mass Effect 2 | 24980 | 63 | 61 |
| Thrillville: Off the Rails | 6080 | 50 | 18 |

Totals include the PS3 platinum where the game has one. [AUTO_TRACKING.md](AUTO_TRACKING.md) explains what each automatic Assassin's Creed II achievement reads; [CHANGELOG.txt](CHANGELOG.txt) covers the other games.

## Install

You need Windows, Steam and [Millennium](https://steambrew.app) 3.x.

1. Download the latest `steam-custom-achievements-vX.Y.Z-share.zip` from [Releases](../../releases).
2. Exit Steam completely (Steam > Exit).
3. Right-click the ZIP and choose Extract All.
4. Open the `steam-custom-achievements` folder and run `INSTALL_OR_REPAIR.cmd`. If Windows warns you, click More info > Run anyway.
5. Start Steam. In Millennium > Plugins, make sure **Steam Custom Achievements (Local)** is turned on.
6. Open a supported game in your Library. The ACHIEVEMENTS section is under Friends Who Play.

To update, repeat steps 1 to 5 with the new ZIP. Your unlocks are kept. `CHECK_INSTALL.cmd` checks an install without changing anything.

If nothing unlocks, open View My Achievements > SETTINGS and click Auto-detect save, or paste your save folder's path. The [Steam guide](https://steamcommunity.com/sharedfiles/filedetails/?id=3830564916) covers the common problems.

## Privacy

The plugin makes no network connections. It only reads game saves, never changes them, and only writes to its own plugin folder and Millennium's settings. Only download it from this repo's Releases or the Steam guide.

If you use "Capture while I play" or "Record an achievement", copies of your saves are kept in the plugin's `recordings` folder. Don't zip up your installed plugin folder to share it; share the release ZIP instead.

## Adding a game

Contributions are welcome. A game is one folder, `source/games/<slug>/`, with a `game.json` listing its achievements. The short version:

1. Create `source/games/<slug>/game.json`. Start with `"detector": null` so every achievement is manual (see the example in [ADDING_A_GAME.md](ADDING_A_GAME.md)). `appId` is the number in the game's Steam store URL.
2. Optionally add pictures as `source/games/<slug>/art/<index>.webp` (or `.png`/`.jpg`), numbered in list order from 0.
3. Add the slug to `ORDER` at the top of `source/build.py`.
4. Run `python source/build.py`. It checks the game and regenerates `.millennium/Dist/index.js` and `backend/games.lua`. Commit those generated files too.
5. Run the tests (below) and open a pull request.

To make achievements unlock automatically, the plugin needs to understand the game's save. Games on the Call of Duty 4 engine just need rules in `game.json`. A new save format needs a `backend/detector_<name>.lua`. [ADDING_A_GAME.md](ADDING_A_GAME.md) covers both. The golden rule: a detector only reads files, and a save it doesn't fully understand must never unlock anything.

The plugin's record mode (View My Achievements > Settings > Record an achievement) saves your save files before and after you earn an achievement, which is the easiest way to work out where a game stores it. Please don't commit real saves to the repo; describe what changed, or build a small test fixture like the ones in `tests/`.

## Building and testing

Requirements: Python 3, Node.js, `pip install lupa` and `npm install jsdom`.

```sh
python source/build.py                 # regenerate the plugin from source/
for t in tests/test_*.py; do python "$t"; done
for t in tests/test_*.cjs; do node "$t"; done
python source/package.py ../steam-custom-achievements-vX.Y.Z-share.zip --share   # release ZIP
```

`package.py` must write the ZIP outside the repo folder. For an extra check before sharing, put words that must never ship (your name, Windows username, Steam ID) one per line in `source/private_terms.txt`; that file is git-ignored, and `--share` refuses to build if any of them appear in the package.

## Repo layout

| Path | What it is |
| --- | --- |
| `source/games/<slug>/` | One folder per game: `game.json`, pictures, rule files |
| `source/*.js` | Frontend source (the Library card, popup, settings) |
| `source/build.py`, `source/package.py` | Build the plugin and the release ZIP |
| `backend/` | Lua backend: save watcher and one detector per save format |
| `.millennium/Dist/index.js`, `backend/games.lua` | Generated by `build.py` |
| `tools/Install-Plugin.ps1`, `*.cmd` | Windows installer and install check |
| `tests/` | Tests with synthetic save fixtures |
| `CHANGELOG.txt` | What changed in each version |

## License

[MIT](LICENSE). Achievement names, descriptions and icons belong to their games' publishers. The Assassin's Creed II save mappings come from AC2AP ([MIT](third_party/AC2AP-LICENSE.txt)).

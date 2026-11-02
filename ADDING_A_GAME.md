# Adding a game

A game is one folder in `source/games/<slug>/` with a `game.json`, plus its slug in
`ORDER` at the top of `source/build.py`. Run `python source/build.py` afterwards; it
checks the pack and regenerates `.millennium/Dist/index.js` and `backend/games.lua`.
Then add the game to `ORDER` and `GAME_INFO` in `source/site.py` and run `python source/site.py`
to make its web page in `docs/`. Commit the generated files too; CI fails if they are out of date.

Pictures go in `source/games/<slug>/art/<index>.webp` (or `.png`/`.jpg`), numbered in list order
from 0. Steam's own icons are 256x256, so that size or smaller is best.

## Manual-only game (no save research needed)

```json
{
  "appId": 6080,
  "title": "Thrillville: Off the Rails",
  "platform": "Xbox 360",
  "detector": null,
  "trackingNote": "Shown in Settings: why tracking is manual.",
  "achievements": [
    {"name": "Bandito Beater", "detail": "Complete Bandito Chinchilla.", "group": "Minigames", "points": 20, "icon": "star"}
  ]
}
```

- `appId` is the number in the game's Steam store URL. The card only appears on that Library page.
- `group` fills the category filter and picks the fallback picture colour.
- `icon` is a symbol from `ICON_SYMBOLS` in `source/icons.js` (skull, medal, tank, plane, flame,
  key, flower, book, house, music, ring, coaster, coins, crown, star, target, sword, ...).
  Players can still replace any picture from the popup.
- Spoilers: achievements in the `Story` group are hidden (name, description and picture) until they
  unlock or the player reveals spoilers. Set `"spoilerGroups": ["Story", "Ending"]` on the game to
  change which groups, or `"hidden": true` / `"hidden": false` on one achievement.
- Optional `"rarity": 12.5` on an achievement is its unlock rate (percent of players), shown like
  Steam's global percentage; under 10 counts as rare. Players can also load rates from a saved page.
- Optional `"completion": {"name": "Platinum", "detail": "...", "picture": "platinum.webp"}` on the
  game adds a PS3-style platinum that unlocks once every other achievement is unlocked. Add
  `"excludeGroups": ["..."]` to leave groups out of it (Bully leaves out its mobile-only multiplayer list).
- Achievements with a counter (a rule with `need` and `label`) show progress as n / total and get
  Steam progress popups at 25%, 50% and 75% when `need` is at least 4.
- Optional `saveFolders` (with `saveFolderHint` for the placeholder text) lets capture and record
  mode find a manual game's saves without a pasted path. Each entry is an environment variable
  (`USERPROFILE`, `APPDATA`, `LOCALAPPDATA`, `ProgramFiles(x86)` or `ProgramFiles`) followed by folder
  names, where `*` matches any one subfolder; the first one that exists is used. See `source/games/me1/game.json`.
- Optional `decoder` names a save reader in `backend/` (`acb` and `thrillville` so far) so record mode
  and capture show named values for a game that has no automatic tracking yet.

## Games built on the CoD 4 engine (`"detector": "cod"`)

Add `levels` (`[mapname, mission title]` in `mis_difficulty` order), `appDataFolders`
(the folder under `%LOCALAPPDATA%\Activision`) and a `rule` on each automatic achievement:

| Rule | Unlocks when |
| --- | --- |
| `{"levels": ["cargoship"], "skill": 1}` | every listed mission is finished on at least that skill (1 Recruit, 2 Regular, 3 Hardened, 4 Veteran) |
| `{"allExcept": ["airplane"], "skill": 3, "label": "..."}` | every mission except the listed ones reaches the skill; the popup shows n / total |
| `{"dvar": "cheat_points", "need": 15, "label": "Enemy intel"}` | a numeric `seta` value in config.cfg reaches `need` |

## A new save format

Write `backend/detector_<name>.lua` with the same functions as `detector_cod.lua`
(`locate`, `resolve`, `parse`, `evaluate`, `counts`, `describe`, `maxBytes`), register it in
`detectors` at the top of `backend/main.lua` and in `DETECTORS` in `source/build.py`, and add it
to `$RelativeFiles` in `tools/Install-Plugin.ps1` and the file list in `source/package.py`.
Detectors must only read files, and an unknown or damaged layout must never unlock anything.
The watcher already waits for two identical snapshots before awarding.
An optional `remember(parsed)` returns a small table the watcher keeps between Steam sessions and
passes back as `evaluate(parsed, game, memory)`; Fallout 3 uses it so the karma achievements need a
level-up, as in the game.

Real saves are the only reliable way to map a format. For AC2 that meant comparing saves
from before and after each milestone. Fable III (`detector_fable3.lua`) shows the other route:
the hero save is a chunked zlib stream (`inflate.lua` decodes it in pure Lua) holding the game's
own lifetime statistics, so rules are just a stat name and a threshold, e.g.
`"rule": {"stat": "STAT_NUM_COLLECTED_GNOMES", "need": 50, "label": "Gnomes destroyed"}`;
`build.py` hashes the name (32-bit FNV-1). Thrillville (`detector_thrillville.lua`) uses the
game's own mission names, e.g. `"finished": ["P1_G_WinPrizes"]` or `"opened": [<every mission of a park>]`.

## Fallout 3 (`"detector": "fallout3"`)

`backend/detector_fallout3.lua` reads the newest `.fos` save (layout in its header comment) and keeps
a short summary, so the 5-20 MB file is only re-read when it changes. Rules:

| Rule | Unlocks when |
| --- | --- |
| `{"quests": [{"plugin": "Anchorage.esm", "id": "14F6"}]}` | any listed quest has its completed flag; the ID is the form ID without the load-order byte |
| `{"quests": [...], "started": true}` | ... or is running |
| `{"stat": "People Killed", "need": 300, "label": "People Killed"}` | a Pip-Boy misc statistic (named from `statNames`) reaches `need` |
| `{"level": 14, "karma": "good"}` | the level reaches 14 with karma >= 250 (`bad` <= -250, `neutral` between) |
| `{"global": {"plugin": "Fallout3.esm", "id": "A3031"}, "need": 5, "label": "..."}` | a global variable (here BehemothsKilled) reaches `need` |
| `{"globals": [7 refs], "need": 7, "label": "...", "done": [ref]}` | every listed global is at least 1, or a `done` global is |
| `{"questVar": {"plugin": "Zeta.esm", "id": "3419", "var": 1}, "need": 25, "doneValue": -1}` | a quest script variable (index from the script's SLSD) reaches `need`, or equals `doneValue` |

The IDs come from the game's own achievement scripts (AddAchievement) in the .esm files.

## Mass Effect (`"detector": "me1"`)

Each automatic entry has `"rule": {"id": <1-50>}`, the achievement's slot in the profile's
`anAchievementStates`, plus `"stat"` and `"label"` when a RewardStats counter tracks it (e.g. `PistolKills`).
See `backend/detector_me1.lua`.

## Other detectors

The rest follow the same pattern; each file's header comment describes its format.

| Detector | Game | Reads |
| --- | --- | --- |
| `ac1` | Assassin's Creed | the .sav progress block, which is the game's own record of all 44 achievements |
| `ac2` | Assassin's Creed II | autosave mission records, the game's own checklists, villa data (see [AUTO_TRACKING.md](AUTO_TRACKING.md)) |
| `bully` | Bully: Scholarship Edition | the chapter, the Stats screen numbers (`{"stat": n, "need": x}`, n from the game's SStats.lua), the load screen's completion % and the mission table (`{"mission": n}`, `{"missions": [...], "need": x}`, `{"groups": [[...]], "need": x}`, n in Act\\Missions.act order) |
| `acb` | Assassin's Creed Brotherhood | mission records in the .SAV, plus the achievement bits the game keeps in OPTIONS |
| `fable3` | Fable III | the XLiveEmu `Achievements.txt` unlock list (`"xlive": <id>` per achievement) |
| `me2` | Mass Effect 2 | the achievement bits in the `Player1.prf` profile |
| `thrillville` | Thrillville: Off the Rails | park save mission statuses and owner level |

## Testing a new game

Turn on View My Achievements > SETTINGS > "Capture while I play" (or "Record an achievement") to
keep copies of the save before and after each change, with a log of what changed. Comparing those
is the easiest way to find where a game stores progress. Never commit real saves; build a small
synthetic fixture in `tests/` instead. Run all the tests before opening a pull request:

```sh
for t in tests/test_*.py; do python "$t"; done
for t in tests/test_*.cjs; do node "$t"; done
```

# Adding a game

A game is one folder in `source/games/<slug>/` with a `game.json`, plus its slug in
`ORDER` at the top of `source/build.py`. Run `python source/build.py` afterwards; it
checks the pack and regenerates `.millennium/Dist/index.js` and `backend/games.lua`.

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
- Optional `saveFolders` (with `saveFolderHint` for the placeholder text) lets capture and record
  mode find a manual game's saves without a pasted path. Each entry is an environment variable
  (`USERPROFILE`, `APPDATA`, `LOCALAPPDATA`, `ProgramFiles(x86)` or `ProgramFiles`) followed by folder
  names, where `*` matches any one subfolder; the first one that exists is used. See `source/games/me1/game.json`.
- Optional `decoder` names a save reader in `backend/` (only `acb` so far) so record mode and capture
  show named values for a game that has no automatic tracking yet.

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

Real saves are the only reliable way to map a format. For AC2 that meant comparing saves
from before and after each milestone. Fable III (`detector_fable3.lua`) shows the other route:
the hero save is a chunked zlib stream (`inflate.lua` decodes it in pure Lua) holding the game's
own lifetime statistics, so rules are just a stat name and a threshold, e.g.
`"rule": {"stat": "STAT_NUM_COLLECTED_GNOMES", "need": 50, "label": "Gnomes destroyed"}`;
`build.py` hashes the name (32-bit FNV-1). Thrillville (`detector_thrillville.lua`) uses the
game's own mission names, e.g. `"finished": ["P1_G_WinPrizes"]` or `"opened": [<every mission of a park>]`.

## Mass Effect (`"detector": "me1"`)

Each automatic entry has `"rule": {"id": <1-50>}`, the achievement's slot in the profile's
`anAchievementStates`, plus `"stat"` and `"label"` when a RewardStats counter tracks it (e.g. `PistolKills`).
See `backend/detector_me1.lua`.

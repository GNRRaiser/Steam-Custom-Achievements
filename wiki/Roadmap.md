# Roadmap

What's done, what's planned, what might come, and what isn't possible. Nothing here has a date; it moves as things get tested. Ideas and requests are welcome in [Issues](https://github.com/GNRRaiser/Steam-Custom-Achievements/issues).

## Done

- **11 games** with their Xbox 360 lists (plus PS3 platinums): Assassin's Creed I, II and Brotherhood, Bully: Scholarship Edition (with its PS4 extras), Call of Duty 4 and World at War, Fable III, Fallout 3, Mass Effect 1 and 2, Thrillville: Off the Rails.
- **Automatic unlocks** from saves for 471 of 599 achievements. Assassin's Creed, Fable III and Fallout 3 are fully automatic.
- **Looks like Steam:** Library card and stat, unlock and progress popups, Steam-style list and date format, unlock rates, rare gold glow, hidden story achievements, category counts, sorting.
- **Big Picture mode** with controller support.
- **Website** with a page per game, **automatic tests** on every change, and **GitHub Releases** starting with v0.34.9.

## Planned

### More automatic unlocks

| Game | What | What it needs |
| --- | --- | --- |
| Mass Effect | Scholar, Completionist, Tactician, Medal of Exploration | A game profile where each one is unlocked, to confirm where the game stores it. Community profiles welcome. |
| Thrillville: Off the Rails | Money Maker, crowd and arcade achievements | Saves with matching in-game numbers to map the save's statistics. Paused for now. |
| Bully: Scholarship Edition | Errands, jobs, the paper route, carnival and arcade games, money and respect | Errands and jobs are kept outside the mission table, and the carnival entries still need checking against a save. Your own saves before and after one of these help. |
| Assassin's Creed Brotherhood | Feather count | Checking the feather count against the game's own count on more saves. |

### Smaller improvements

- A **wiki** (this one) kept in the repo, so it's reviewed like the code.
- Steam guide and website kept in step with each release.

## Ideas (not decided)

### Adding games without a new build

Adding a game today means a new plugin version. A possible plan, in steps:

1. **"Add achievements" button** on any game's Library page: load a saved achievements page (TrueAchievements or Exophase) and the plugin builds a checklist for that game, with pictures and unlock rates, stored on your PC.
2. **Any Games for Windows Live game played through XLiveEmu** could unlock automatically, the way Fable III does, by reading the emulator's record and the achievement list inside the game.
3. **A generator script and a "request a game" issue form**, so a new game's list can be added to the plugin from a saved page in one step.
4. **A save capture kit**, so players can send in before-and-after saves for a game that needs a new save reader.

Automatic unlocks for games with their own save formats (like Assassin's Creed II or Mass Effect 2) would still need work for each game.

### Other ideas

- More games: requests welcome. The best fits are PC games whose Steam version has no achievements but which had them on Xbox 360, PS3 or Games for Windows Live.
- Listing the plugin in Millennium's plugin browser, if the project's rules allow it.
- Testing on Linux and Steam Deck.
- Progress per Steam account instead of per PC, for shared PCs.
- Translations of the plugin's own text.

## Staying manual

These achievements aren't written to any file the plugin can read, so they keep their **Mark as unlocked** button:

- **Assassin's Creed II:** 9 one-off moments (Street Cleaner, Fly Swatter, Messer Sandman, Doctor, No-hitter, Lightning Strike, Sweeper, High Dive, Mailman).
- **Call of Duty 4:** 13 challenges inside missions.
- **Call of Duty: World at War:** 19 challenges inside missions, co-op and multiplayer, and the Map Pack 2 and 3 achievements (multiplayer data is encrypted).
- **Assassin's Creed Brotherhood:** the 10 multiplayer achievements (servers are shut down).
- **Mass Effect 2:** Highly Trained, which the PC game doesn't have.

Reading them straight from the game's memory while it runs would be possible in theory, but it's fragile across game versions and too close to how cheats work, so it isn't planned.

## Not possible

- **Achievements on your Steam profile**, Steam level, badges or "perfect games." Only a game's developer can add achievements to Steam itself.
- **Syncing with Xbox or PlayStation accounts.** The plugin works offline and doesn't sign in to anything.

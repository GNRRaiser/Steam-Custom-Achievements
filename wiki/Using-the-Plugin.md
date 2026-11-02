# Using the plugin

## On the game's Library page

Open a supported game in your Steam Library. You get:

- An **ACHIEVEMENTS** stat next to PLAY TIME.
- An **ACHIEVEMENTS** card under Friends Who Play, with your unlocked count, a progress bar and your latest unlocks.
- **View My Achievements**, which opens the full list.

## The achievements list

The list looks like Steam's own: a summary box ("YOU'VE UNLOCKED 20/51 ACHIEVEMENTS"), unlocked achievements first with their unlock date, then locked ones.

- **Search and categories:** filter by name or by category (for example "Broken Steel (2/6)").
- **Sort:** default order, rarest first, or most common first.
- **Progress:** achievements with a counter (feathers, kills, viewpoints and so on) show how far you are, such as 37 / 100.
- **Mark as unlocked / Mark as locked:** for achievements the plugin can't read from your save, or to fix a mistake.

## Popups

When an achievement unlocks while you play, a Steam-style popup appears in the bottom-right corner with a sound. Achievements with a counter of at least 4 also get progress popups at 25%, 50% and 75%.

## Unlock rates and the rare glow

Every achievement shows how many players have it ("63% of players have this achievement"). These are the real Xbox 360 percentages from TrueAchievements, built into the plugin. Unlocked achievements that fewer than 10% of players have get Steam's gold glow.

To use your own numbers, save a game's achievement page from TrueAchievements or Exophase in Chrome or Edge (Ctrl+S) and load it in **Settings > Load from saved page**. A page saved as "Webpage, Single File" (.mhtml) loads the rates and the pictures; "Webpage, Complete" (.html) loads only the rates.

## Hidden achievements and spoilers

Locked story achievements are hidden (name, description and picture) until you unlock them, like Steam's hidden achievements. **Show spoilers** at the bottom of the list reveals them, and **Hide spoilers** hides them again.

## Pictures

Every achievement comes with a picture. To change one, click its picture in the list and choose an image. **Load from saved page** can fill in every picture at once from a saved .mhtml page, and **Reset to built-in pictures** undoes your changes.

## Settings tab

- **Automatic tracking:** shows which save the plugin is reading and when it last changed. **Auto-detect save** looks for it again; you can also paste a save file or folder path and click **Use file / folder**.
- **Pictures:** load from a saved page or reset (see above).
- **Backup / Restore / Copy status:** see below.

## Backups

**Backup** shows your progress for that game as text you can copy and keep. **Restore** takes that text back and replaces your current progress. **Copy status** copies a report that helps when asking for help with a problem.

Progress is stored on your PC, per game. It isn't tied to a Steam account or a save slot.

## Developer tools

Builds made from the repo (not the release `-share.zip`) also have **Capture while I play** and **Record an achievement** in Settings. They copy your save files before and after you earn something, which helps work out where a game records an achievement. The copies stay in the plugin's `recordings` folder on your PC. See [Adding a game](Adding-a-Game).

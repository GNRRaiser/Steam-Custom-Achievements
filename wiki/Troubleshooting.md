# Troubleshooting

## No ACHIEVEMENTS section on the game page

- Check that **Steam Custom Achievements (Local)** is turned on in **Millennium > Plugins**, then restart Steam.
- Make sure it's one of the [supported games](Home#supported-games). The card only appears on that game's own Library page.
- Run `CHECK_INSTALL.cmd` from the extracted folder. It checks the install without changing anything.
- Run `INSTALL_OR_REPAIR.cmd` again with Steam closed.

## Nothing unlocks, or it says "auto-tracking needs setup"

The plugin couldn't find your save.

1. Open the game in your Library and click **View My Achievements**.
2. Open the **SETTINGS** tab.
3. Click **Auto-detect save**. If that doesn't find it, paste the path to your save file or folder and click **Use file / folder**. Each game's page lists where its save usually is.
4. When it works, the status says "auto-tracking" with your save's name.

Some games only record progress at checkpoints, at the end of a mission or memory, or when you save. An unlock can come a little after the moment you earned it; that's normal.

## An achievement didn't unlock even though I earned it

- Check the game's page on this wiki: some achievements aren't recorded in any save and are **marked by hand**.
- Wait for the game's next save or checkpoint, then give it a few seconds.
- Fallout 3's level-and-karma achievements unlock on your next level-up, as in the game.
- Fable III needs XLiveEmu for its full record (see [Fable III](Fable-III)).

If it still doesn't unlock, use **Mark as unlocked**, and please [open an issue](https://github.com/GNRRaiser/Steam-Custom-Achievements/issues) with the game, the achievement and the text from **Settings > Copy status**.

## "Couldn't read that save"

The game wrote a save the plugin doesn't expect (cut off, damaged, or from a game update). Your unlocks stay, and the plugin keeps watching: it tries again the next time the game writes that save. If it keeps happening, open an issue with **Copy status**.

## It stopped working after a Steam update

Steam updates can break Millennium for a while. Update Millennium, then run `INSTALL_OR_REPAIR.cmd` again.

## Big Picture: a button doesn't respond

See [Big Picture mode](Big-Picture-Mode#if-somethings-off).

## I lost my progress

Progress is kept on your PC per game. If you made a **Backup** (Settings tab), use **Restore** and paste it back. Reinstalling or updating the plugin doesn't reset progress. For automatic achievements, the plugin unlocks them again from your save.

## Reporting a problem

[Open an issue](https://github.com/GNRRaiser/Steam-Custom-Achievements/issues) with:

- the game and the plugin version (shown at the bottom of the Settings tab)
- what you expected and what happened
- the text from **Settings > Copy status**

Please don't attach your save files to a public issue.

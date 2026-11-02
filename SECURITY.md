# Security policy

## Supported versions

Only the [latest release](../../releases/latest) gets fixes. If you're on an older version, update first and check whether the problem is still there.

## Reporting a problem

Please don't open a public issue for a security problem. Report it privately instead: open the **Security** tab of this repository and click **Report a vulnerability**. Include what you found, which version you're on, and the steps to reproduce it if you can.

You should get a reply within a week. Once a fix is out, the report can be made public, and you'll be credited unless you'd rather not be.

If you attach files, leave out anything personal. Files from the plugin's `recordings` folder and `INSTALL_REPORT.txt` can contain copies of your saves and the folder paths on your PC.

## What the plugin does

So you know what to look at:

- It reads each supported game's save and profile files **read-only**. It never changes or deletes them.
- It keeps its own data (unlocks, settings, pictures you add) in Steam's local storage and its Millennium settings. If you use record mode or "capture while I play", it copies save files into its own `recordings` folder (or your temp folder).
- It doesn't send anything over the internet and doesn't touch your Steam account, profile or real Steam achievements. Everything stays in your own Steam client.

The installer (`INSTALL_OR_REPAIR.cmd`, which runs `tools/Install-Plugin.ps1`) reads the Windows registry only to find where Steam is installed, then copies the plugin into Millennium's `plugins` folder. If an older copy is there, it is moved aside first and put back if the install fails. It downloads nothing and only replaces its own plugin folder.

## What to report here

**Report privately:**

- The plugin or installer reading, writing or deleting files it shouldn't, or anything outside the folders above.
- Anything that lets a game save, a picture or a page you open make the plugin run code or change other files.
- The plugin sending anything over the network, or affecting your Steam account.

**Not a security problem:** achievements that don't unlock, wrong unlock rates, or display bugs. Open a normal [issue](../../issues) for those.

**Somewhere else:** problems in Millennium itself go to [Millennium](https://github.com/SteamClientHomebrew/Millennium), and problems in Steam or the games go to Valve or the game's publisher.

## Staying safe

Only download the plugin from this repository's [Releases](../../releases) page. Copies uploaded anywhere else aren't checked and could be changed. The plugin is free, so anyone asking you to pay for it, or to log in with your Steam account to get it, is a scam.

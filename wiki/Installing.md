# Installing

## What you need

- Windows
- Steam
- [Millennium](https://steambrew.app) 3.x (the Steam plugin loader)

## Install Millennium

1. Download Millennium from its official site, https://steambrew.app.
2. Exit Steam completely (Steam > Exit, not just closing the window).
3. Run the Millennium installer, then start Steam.

## Install the plugin

1. Download the latest `steam-custom-achievements-vX.Y.Z-share.zip` from [Releases](https://github.com/GNRRaiser/Steam-Custom-Achievements/releases).
2. Exit Steam completely.
3. Right-click the ZIP and choose **Extract All**.
4. Open the `steam-custom-achievements` folder and run `INSTALL_OR_REPAIR.cmd`. If Windows warns you, click **More info > Run anyway**.
5. Start Steam. In **Millennium > Plugins**, make sure **Steam Custom Achievements (Local)** is turned on.
6. Open a supported game in your Library. The ACHIEVEMENTS section is under Friends Who Play.

Achievements you've already earned unlock the first time the plugin reads your save, so you don't need to replay anything.

## Updating

Repeat steps 1 to 5 with the new ZIP. Your unlocks, pictures and settings are kept.

## Checking an install

`CHECK_INSTALL.cmd` (in the extracted folder) checks that the plugin is installed correctly without changing anything. Run it if the card doesn't show up, and see [Troubleshooting](Troubleshooting). If the installer can't find Millennium's plugins folder, it asks you to paste the folder that **Millennium > Plugins > Browse Local Files** opens, and writes what it found to `INSTALL_REPORT.txt`.

## Uninstalling

Turn the plugin off in **Millennium > Plugins**, exit Steam, then delete the `steam-custom-achievements` folder from Millennium's plugins folder (**Millennium > Plugins > Browse Local Files** opens it). Use **Backup** in the plugin's Settings first if you might come back (see [Using the plugin](Using-the-Plugin#backups)).

## Only download from here

Get the plugin from this repo's [Releases](https://github.com/GNRRaiser/Steam-Custom-Achievements/releases) or the [Steam guide](https://steamcommunity.com/sharedfiles/filedetails/?id=3830564916). Don't install copies someone zipped from their own Steam folder: those can contain that person's save files.

# Security policy

## Supported versions

Only the [latest release](../../releases/latest) gets fixes. If you're on an older version, update first and check whether the problem is still there.

## Reporting a problem

Please don't open a public issue for a security problem. Report it privately instead: open the **Security** tab of this repository and click **Report a vulnerability**. Include what you found, which version you're on, and the steps to reproduce it if you can.

You should get a reply within a week. Once a fix is out, the report can be made public.

## What the plugin does

So you know what to look at:

- It reads each supported game's save and profile files **read-only**. It never changes or deletes them.
- It keeps its own data (unlocks, settings, pictures you add) in Steam's local storage and its Millennium settings. If you use record mode or "capture while I play", it copies save files into its own `recordings` folder (or your temp folder).
- It doesn't send anything over the internet and doesn't touch your Steam account, profile or real Steam achievements. Everything stays in your own Steam client.

Reports about any of the above, or about the install scripts (`INSTALL_OR_REPAIR.cmd`, `CHECK_INSTALL.cmd`, `tools/`), are welcome.

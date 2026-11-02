# Automatic tracking

## How it works (all games)

The plugin's backend reads each supported game's save or profile files, read-only, and never changes them. When a file changes, it is read again and an unlock is only awarded once two reads in a row match, so a half-written save never counts. A save it doesn't fully understand never unlocks anything.

The game you're playing, the game shown in Steam, and any game whose save just changed are checked every second (since v0.34.6). The other supported games take turns in the background, so progress made while Steam shows another page is still recorded. Unlocks can only be as quick as the game's own saving: many games save at checkpoints or at the end of a memory, so the popup can arrive a little after the moment you earned it. Achievements you earned before installing unlock the first time the save is read.

Achievements with a counter show Steam-style progress popups at 25%, 50% and 75% (counters of at least 4 only; hidden and platinum entries never get one). What each game reads is listed in [CHANGELOG.txt](CHANGELOG.txt) and [ADDING_A_GAME.md](ADDING_A_GAME.md); the rest of this page is the full Assassin's Creed II breakdown.

# Assassin's Creed II (since v0.1.8)

This build unlocks 41 of the 50 Xbox 360 entries from read-only autosave evidence (plus the PS3 platinum once all others are unlocked). It does not claim that all achievements have live memory detection.

The detector requires a valid ACII save header and a completed Mission record. It checks both record-size fields, type 0x5FDACBA05FDACBA0, the ID marker, the completion marker, and a completion value of exactly 100. Unknown/truncated layouts do not earn an achievement. Duplicate records count once.

| Achievement | Evidence |
| --- | --- |
| The Birth of an Assassin | A completed story memory proves this mandatory introduction was passed; catch-up occurs on a later autosave. |
| Arrivederci Abstergo | A completed story memory proves this mandatory introduction was passed; catch-up occurs on a later autosave. |
| Welcome to the Animus 2.0 | A completed story memory proves this mandatory introduction was passed; catch-up occurs on a later autosave. |
| The Pain of Betrayal | DNA Sequence 1: completion flag 100 for final memory Last Man Standing. |
| Vengeance | DNA Sequence 2: completion flag 100 for final memory Arrivederci (record 39E0A284; v0.33.0 moved it from 39E0A287, which is Laying Low). |
| Exit the Son | DNA Sequence 3: completion flag 100 for final memory A Change of Plans. |
| Bloody Sunday | DNA Sequence 4: completion flag 100 for final memory Farewell Francesco. |
| Undertaker | Completed tomb mission: Novella's Secret. |
| The Conspirators | DNA Sequence 5: completion flag 100 for final memory With Friends Like These (record 44F3E3E1; v0.33.0 moved it from 44F3E3DB, an earlier memory). |
| An Unexpected Journey | DNA Sequence 6: completion flag 100 for final memory Tutti a Bordo. |
| Bleeding Effect | A completed story memory in Sequence 7 or later proves the mandatory hideout training was passed. |
| The Merchant of Venice | DNA Sequence 7: completion flag 100 for final memory Everything Must Go. |
| The Impenetrable Palazzo | DNA Sequence 8: completion flag 100 for final memory Infrequent Flier. |
| Masquerade | DNA Sequence 9: completion flag 100 for final memory Having a Blast (record 635BC916; v0.33.0 moved it from 635BC90D, the memory before). |
| Bianca's Man | DNA Sequence 10: completion flag 100 for final memory Two Birds, One Blade. |
| The Prophet | DNA Sequence 11: completion flag 100 for final memory Play Along. |
| The Vault | DNA Sequence 14: completion flag 100 for final memory In Bocca al Lupo. |
| Venetian Gladiator | Completed tomb mission: Visitazione's Secret. |
| I Can See Your House From Here! | Completed tomb mission: Torre Grossa's Secret. |
| Hallowed Be Thy Name | Completed tomb mission: San Marco's Secret. |
| Prison Escape | Completed tomb mission: Ravaldino's Secret. |
| Choir Boy | Completed tomb mission: Il Duomo's Secret. |
| Assassin For Hire | Completion of a mapped assassination contract. |
| Macho Man | Completion of a mapped defense-of-honor mission or the mandatory Beat a Cheat story memory. |
| Steal Home | Completion of a mapped thieves race. |
| Myth Maker | All 8 Monteriggioni statuette object IDs present in the gameplay save (AC2AP Statue_Codex IDs). Progress shown as n / 8. |
| In Memory of Petruccio | All 100 feather object IDs present in the gameplay save (AC2AP Feather_00-99 IDs). Progress shown as n / 100. |
| Kleptomaniac | Game task 0x25620DB1 (florins pickpocketed): completion flag set and counter >= 1000. |
| Red Light Addict | Game task 0x25620DC7 (florins spent on courtesans): completion flag set and counter >= 5000. Cross-checked: 2400 = 16 hires x 150. |
| Man of the People | Game task 0x25620DC8 (florins tossed): completion flag set and counter >= 300. Confirmed across 96 SaveGame.Pro story saves (20, 90, then 300 with the flag set). |
| An Old Friend Returns | Final Present memory record A2AD5ED6 at completion 100 (0 in a save made at its start, 100 in every post-ending save). |
| Tip of the Iceberg / A Piece of the Puzzle / Vitruvian Man | Game task 0x5BC08542 (glyphs solved), count only because the game never sets its flag: at least 1 / at least 1 / 20. Climbs 6, 8, 10, 20 across story saves; a tester's save reads 1, matching their own count. |
| I Like the View | Game task 0x25620DBE: completion flag set and counter >= 10 (climbs 1, 7, 10 across story saves). |
| Victory Lies in Preparation | Every armour tier I-IV (gauntlets, chest, pauldrons, greaves) and every pouch upgrade present (AC2AP shop IDs). 25 items: Smoke Pouch III was dropped because it never appears in any of 188 saves, including a 100% save. |
| Show Your Colors | The game's own checklist for this achievement: the six Auditore-cape region tasks (C962822F, C9628230, C9628232-35) completed. |
| Art Connoisseur | The game's own checklist: Buy Firenze Painting and Buy Venezia Painting (BACDC7D8, BACDC7D7) completed. |
| Perfect Harmony | The game's own checklist: Tint Wetland Ebony and Tint Wetland Ivory (BACDC7E3, BACDC7E4) completed. |
| Handy Man | VillaSaveData building levels: any building above its new-game level (0 0 1 1 0 0 0 0 0 0 0). |
| Podestà of Monteriggioni | VillaSaveData stronghold value at least 120000, 80% of the 150000 maximum in the game's villa manager. |

## Timing and current limits

Two consecutive matching snapshots are required (see How it works above for how often saves are checked). These are autosave-triggered detections, not frame-by-frame RAM checks. The earliest introduction and hideout-training checks intentionally catch up from later mandatory memories.

The remaining 9 entries stay manual: Street Cleaner, Fly Swatter, Messer Sandman, Doctor, No-hitter, Lightning Strike, Sweeper, High Dive and Mailman. They are one-off moments with no checklist in the game's data and nothing in the save that records them (captures around Lightning Strike and High Dive confirmed this), so there is nothing to read. No save counter is treated as feathers or viewpoints merely because it changes.

Existing saved progress is kept. Progress is stored per PC and per game, not per Steam account or save slot.

## Source and attribution

Record layout and game mission ID mappings were derived from [TomDouaud/AssassinsCreed2AP](https://github.com/TomDouaud/AssassinsCreed2AP), commit `6da90a5436ec07520fc19b666615a6cfc4398a8f`, under the MIT license. The required license is included at `third_party/AC2AP-LICENSE.txt`. The completion parser here is stricter than that source: a missing/unknown completion field never means success.

Header validation was cross-checked with [Starman12976/AssassinsCreedIISaveFileViewer](https://github.com/Starman12976/AssassinsCreedIISaveFileViewer), public domain/Unlicense. No randomizer, Archipelago client, networking, inventory modification or third-party game DLL is bundled.

## Verification

The detector and watcher are tested under LuaJIT 2.1, the runtime used by Millennium, with synthetic fixtures in `tests/`. The rules were checked against real gameplay saves and the pcsavegames.com save pack, and unlock timing has been confirmed in the Windows Steam client. No real saves are included in the repo or the release ZIP.

## Runtime compatibility

The detector reads little-endian integers with byte arithmetic. It uses no `string.pack`, `string.unpack`, or 64-bit integer arithmetic, which are unavailable in standard LuaJIT 2.1. The Mission type is matched by its exact bytes. A slot -1 container is recognized for diagnostics but never grants achievements.

## Sequence end check (v0.33.0)

The AC2AP name table skips the short introduction memories some sequences start with, so its names drift by one in those sequences. Each sequence rule was rechecked against the order in which the game creates mission records (it creates them as memories open) and the pcsavegames.com save pack (one save per memory): the rule must be the last record of its sequence and must still be 0 in a save made inside the sequence's last memory.

| Sequence | Records | Rule | Result |
| --- | --- | --- | --- |
| 1 | 385B98EB, 3904C2E5..3904EC4D (12) | 3904EC4D | last, unchanged |
| 2 | 397E179C (intro), 397E179F, 39E0A28D, 39E0A28A, 39E0A287, 39E0A284 | 39E0A284 | was 39E0A287 (one early; seen in play) |
| 3 | 53E662CA..53E662ED (5) | 53E662ED | last, unchanged |
| 4 | 38EA7247..38EA7256, 747EB081 | 747EB081 | last, unchanged |
| 5 | 44F3E3CF, 900AFDA9, 44F3E3D2, D8, DE, DB, D5, E1 | 44F3E3E1 | was 44F3E3DB (already 100 with two memories left) |
| 6 | 45112AA2, 53AC7948, D2AD7C12, 45112AA8 | 45112AA8 | last, unchanged |
| 7 | 9 records ending 0DB13BF3 | 0DB13BF3 | last, unchanged |
| 8 | 44C119BD..44C119C9 (5) | 44C119C9 | last; 0 in the Seq 8 Memory 5 save |
| 9 | 635BC901..635BC916 (8) | 635BC916 | was 635BC90D (one early) |
| 10 | 635BC9A6..635BC9B2 (5) | 635BC9B2 | last, unchanged |
| 11 | 63904392, 63904398 | 63904398 | last, unchanged |
| 14 | 2532C038, D2365A19 | D2365A19 | not in the pack (no Sequence 14 save); unverified |

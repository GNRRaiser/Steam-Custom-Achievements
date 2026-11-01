# Assassin's Creed II automatic tracking (since v0.1.8)

This build supports 36 of the 50 entries through read-only autosave evidence. It does not claim that all achievements have live memory detection.

The detector requires a valid ACII save header and a completed Mission record. It checks both record-size fields, type 0x5FDACBA05FDACBA0, the ID marker, the completion marker, and a completion value of exactly 100. Unknown/truncated layouts do not earn an achievement. Duplicate records count once.

| Achievement | Evidence |
| --- | --- |
| The Birth of an Assassin | A completed story memory proves this mandatory introduction was passed; catch-up occurs on a later autosave. |
| Arrivederci Abstergo | A completed story memory proves this mandatory introduction was passed; catch-up occurs on a later autosave. |
| Welcome to the Animus 2.0 | A completed story memory proves this mandatory introduction was passed; catch-up occurs on a later autosave. |
| The Pain of Betrayal | DNA Sequence 1: completion flag 100 for final memory Last Man Standing. |
| Vengeance | DNA Sequence 2: completion flag 100 for final memory Arrivederci. |
| Exit the Son | DNA Sequence 3: completion flag 100 for final memory A Change of Plans. |
| Bloody Sunday | DNA Sequence 4: completion flag 100 for final memory Farewell Francesco. |
| Undertaker | Completed tomb mission: Novella's Secret. |
| The Conspirators | DNA Sequence 5: completion flag 100 for final memory With Friends Like These. |
| An Unexpected Journey | DNA Sequence 6: completion flag 100 for final memory Tutti a Bordo. |
| Bleeding Effect | A completed story memory in Sequence 7 or later proves the mandatory hideout training was passed. |
| The Merchant of Venice | DNA Sequence 7: completion flag 100 for final memory Everything Must Go. |
| The Impenetrable Palazzo | DNA Sequence 8: completion flag 100 for final memory Infrequent Flier. |
| Masquerade | DNA Sequence 9: completion flag 100 for final memory Having a Blast. |
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

## Timing and current limits

Two consecutive matching snapshots are required; polling normally occurs about every two seconds while Steam is running. These are autosave-triggered detections, not frame-by-frame RAM checks. The earliest introduction and hideout-training checks intentionally catch up from later mandatory memories.

The remaining 14 entries remain manual: combat/action challenges, villa, paintings, dyes, capes and the courier. Those conditions need additional verified state or memory/event mappings. No save counter is treated as feathers or viewpoints merely because it changes.

Existing saved progress is kept. This first AC2 pack uses the same per-PC/app progress scope as earlier builds, rather than separate Steam-account/save-slot profiles.

## Source and attribution

Record layout and game mission ID mappings were derived from [TomDouaud/AssassinsCreed2AP](https://github.com/TomDouaud/AssassinsCreed2AP), commit `6da90a5436ec07520fc19b666615a6cfc4398a8f`, under the MIT license. The required license is included at `third_party/AC2AP-LICENSE.txt`. The completion parser here is stricter than that source: a missing/unknown completion field never means success.

Header validation was cross-checked with [Starman12976/AssassinsCreedIISaveFileViewer](https://github.com/Starman12976/AssassinsCreedIISaveFileViewer), public domain/Unlicense. No randomizer, Archipelago client, networking, inventory modification or third-party game DLL is bundled.

## Verification

The actual detector and watcher passed tests under LuaJIT 2.1, the runtime used by Millennium 3.6.2. The supplied real gameplay save parsed successfully and produced 23 supported achievements from 190 mission records. The supplied slot -1 file produced none. The uploaded saves are not included in this package. The native game and Windows Steam client have not been run here, so event timing and integration still need the user’s client-side test.

## Runtime compatibility

The detector reads little-endian integers with byte arithmetic. It uses no `string.pack`, `string.unpack`, or 64-bit integer arithmetic, which are unavailable in standard LuaJIT 2.1. The Mission type is matched by its exact bytes. A slot -1 container is recognized for diagnostics but never grants achievements.

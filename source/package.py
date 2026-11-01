#!/usr/bin/env python3
"""Every distribution extracts to one ready-to-copy plugin folder."""
import argparse
from pathlib import Path
import subprocess
import sys
from zipfile import ZIP_DEFLATED, ZipFile

ROOT = Path(__file__).resolve().parent.parent
FOLDER = 'steam-custom-achievements'
parser = argparse.ArgumentParser()
parser.add_argument('output', type=Path, help='Output ZIP path outside the plugin source folder')
parser.add_argument('--share', action='store_true', help='Plugin files and install steps only: no notes, tests, sources or recordings notes')
args = parser.parse_args()
output = args.output.resolve()
if output.is_relative_to(ROOT):
    parser.error('The output ZIP must be outside the source folder.')
import os
subprocess.run([sys.executable, str(ROOT / 'source/build.py')], check=True, env={**os.environ, 'SCA_SHARE_BUILD': '1' if args.share else '0'})
output.parent.mkdir(parents=True, exist_ok=True)
VERSION = __import__('json').loads((ROOT / 'plugin.json').read_text(encoding='utf-8'))['version']
SHARE_TOP = {'plugin.json', 'INSTALL_OR_REPAIR.cmd', 'CHECK_INSTALL.cmd'}
SHARE_DIRS = {'.millennium', 'backend', 'third_party', 'tools'}
SHARE_STEPS = f'''STEAM CUSTOM ACHIEVEMENTS v{VERSION} - INSTALL / UPDATE

Needs Steam with Millennium 3.x.

1. Exit Steam completely using Steam > Exit.
2. Extract All from the ZIP. It contains one steam-custom-achievements folder.
3. Run INSTALL_OR_REPAIR.cmd from the extracted folder. It finds Millennium's
   plugins folder, moves any older copy of this plugin to
   custom-achievement-backups and installs this one. (Or replace the
   steam-custom-achievements folder in Millennium's plugins folder by hand with
   this whole folder, including backend and .millennium.)
4. Start Steam and confirm Steam Custom Achievements (Local) is enabled under
   Millennium > Plugins.
5. Open a supported game's Library page. The ACHIEVEMENTS section appears below
   Friends Who Play; View My Achievements opens the full list.

To update, repeat these steps with the newer ZIP. Unlocks are kept.
CHECK_INSTALL.cmd checks an installation without changing anything.
'''.replace('\n', '\r\n')
RECORDING_SLUGS = sorted(p.name for p in (ROOT / 'source/games').iterdir() if p.is_dir())
def shared(relative):
    if len(relative.parts) == 1:
        return relative.name in SHARE_TOP
    return relative.parts[0] in SHARE_DIRS
with ZipFile(output, 'w', ZIP_DEFLATED) as archive:
    for path in sorted(ROOT.rglob('*')):
        if not path.is_file() or '__pycache__' in path.parts or '.git' in path.parts:
            continue
        relative = path.relative_to(ROOT)
        if relative.name == 'INSTALL_REPORT.txt' or relative.suffix.lower() in {'.png', '.zip'}:
            continue
        if args.share and not shared(relative):
            continue
        archive.write(path, Path(FOLDER) / relative)
    if args.share:
        archive.writestr(f'{FOLDER}/INSTALL.txt', SHARE_STEPS)
        for slug in RECORDING_SLUGS:
            archive.writestr(f'{FOLDER}/recordings/{slug}/', '')
with ZipFile(output) as archive:
    assert archive.testzip() is None
    names = archive.namelist()
    assert all(name.startswith(FOLDER + '/') for name in names)
    assert FOLDER + '/plugin.json' in names
    assert FOLDER + '/.millennium/Dist/index.js' in names
    if args.share:
        notes = [n for n in names if n.lower().endswith(('.md', 'readme.txt', 'test_results.txt')) or '/tests/' in n or '/source/' in n]
        assert not notes, notes
        # Optional, not in git: one private word per line (your name, Windows user, Steam ID...).
        private = ROOT / 'source' / 'private_terms.txt'
        terms = [t.strip().lower().encode() for t in private.read_text(encoding='utf-8').splitlines() if t.strip()] if private.exists() else []
        for name in names:
            if not name.endswith('/'):
                data = archive.read(name).lower()
                for term in terms:
                    assert term not in data, name
    for relative in [r for r in ('backend/main.lua', 'backend/games.lua', 'backend/detector_ac2.lua', 'backend/detector_cod.lua', 'backend/detector_fable3.lua', 'backend/inflate.lua', 'backend/recorder.lua', 'backend/capture.lua', 'backend/decoder_acb.lua', 'backend/decoder_thrillville.lua', 'backend/detector_acb.lua', 'backend/detector_ac1.lua', 'backend/detector_me1.lua', 'backend/detector_me2.lua', 'backend/detector_thrillville.lua', 'backend/detector_fallout3.lua', 'backend/lzo1x.lua', 'backend/auto_rules.lua', 'backend/collectible_rules.lua', 'backend/tracker_rules.lua', 'backend/checklist_rules.lua', 'third_party/AC2AP-LICENSE.txt', 'recordings/README.txt', 'recordings/ac2/README.txt', 'recordings/cod4/README.txt', 'recordings/codwaw/README.txt', 'recordings/fable3/README.txt', 'recordings/thrillville-otr/README.txt', 'recordings/ac1/README.txt', 'recordings/acb/README.txt', 'recordings/me1/README.txt', 'recordings/me2/README.txt', 'recordings/fallout3/README.txt') if not (args.share and r.startswith('recordings/'))]:
        assert FOLDER + '/' + relative in names
    assert not any(name.startswith(FOLDER + '/' + FOLDER + '/') for name in names)
    # INSTALL_OR_REPAIR copies only the files Install-Plugin.ps1 lists, so it must list every Lua module.
    installer = (ROOT / 'tools/Install-Plugin.ps1').read_text(encoding='utf-8-sig')
    for name in names:
        if name.startswith(FOLDER + '/backend/') and name.endswith('.lua'):
            assert "'" + name[len(FOLDER) + 1:].replace('/', '\\') + "'" in installer, name
if args.share:
    with ZipFile(output) as archive:
        assert b'const SHARE_BUILD = true;' in archive.read(FOLDER + '/.millennium/Dist/index.js')
    subprocess.run([sys.executable, str(ROOT / 'source/build.py')], check=True, env={**os.environ, 'SCA_SHARE_BUILD': '0'}, stdout=subprocess.DEVNULL)
print(output)

#!/usr/bin/env python3
"""Build the GitHub Pages website in docs/ from source/games/*/game.json.

Run `python source/site.py` after changing a game's achievements, then commit
docs/. GitHub serves the folder at SITE_URL once Pages is set to
"Deploy from a branch: main /docs". The pages are plain HTML so search engines
can read every game name and achievement name without running any script.
"""
import html
import json
from pathlib import Path

BASE = Path(__file__).resolve().parent
ROOT = BASE.parent
DOCS = ROOT / 'docs'
GAMES_DIR = BASE / 'games'

SITE_URL = 'https://gnrraiser.github.io/Steam-Custom-Achievements/'
REPO_URL = 'https://github.com/GNRRaiser/Steam-Custom-Achievements'
GUIDE_URL = 'https://steamcommunity.com/sharedfiles/filedetails/?id=3830564916'
MILLENNIUM_URL = 'https://steambrew.app'
# Site ownership check (the file method is docs/google54cf37509701d6b4.html).
GOOGLE_VERIFICATION = 'zMGmcWJ9kuK8mSTHeUcNw-XrvxbpVxAqFteEe25JUVk'

ORDER = ['ac1', 'ac2', 'acb', 'bully', 'cod4', 'codwaw', 'fable3', 'fallout3', 'me1', 'me2', 'thrillville-otr']

# How many achievements unlock by themselves (the rest have a "Mark as
# unlocked" button), and the short names people search for. Keep the counts
# in step with the README table.
GAME_INFO = {
    'ac1': {'auto': 44, 'aka': ['AC1', 'Assassins Creed 1', "Assassin's Creed Director's Cut"], 'page': 'assassins-creed'},
    'ac2': {'auto': 41, 'aka': ['AC2', 'Assassins Creed 2'], 'page': 'assassins-creed-2'},
    'acb': {'auto': 50, 'aka': ['ACB', 'AC Brotherhood', 'Assassins Creed Brotherhood'], 'page': 'assassins-creed-brotherhood'},
    'bully': {'auto': 26, 'aka': ['Bully', 'Bully SE', 'Canis Canem Edit', 'Bully Anniversary Edition'], 'page': 'bully-scholarship-edition'},
    'cod4': {'auto': 24, 'aka': ['COD4', 'CoD 4', 'Modern Warfare 1', 'COD4 MW'], 'page': 'call-of-duty-4-modern-warfare'},
    'codwaw': {'auto': 22, 'aka': ['COD WaW', 'CoD 5', 'World at War'], 'page': 'call-of-duty-world-at-war'},
    'fable3': {'auto': 60, 'aka': ['Fable 3', 'Fable III GFWL'], 'page': 'fable-3'},
    'fallout3': {'auto': 72, 'aka': ['Fallout 3', 'FO3', 'Fallout 3 GOTY'], 'page': 'fallout-3'},
    'me1': {'auto': 45, 'aka': ['ME1', 'Mass Effect 1'], 'page': 'mass-effect'},
    'me2': {'auto': 61, 'aka': ['ME2', 'Mass Effect 2'], 'page': 'mass-effect-2'},
    'thrillville-otr': {'auto': 18, 'aka': ['Thrillville Off the Rails', 'Thrillville 2'], 'page': 'thrillville-off-the-rails'},
}

CSS = """
:root{--bg:#0f1720;--panel:#17212c;--panel2:#1d2a37;--text:#e6edf3;--muted:#9fb0c0;--accent:#66c0f4;--accent2:#1a9fff;--line:#2a3a4a;--good:#7fc97f}
@media (prefers-color-scheme: light){:root{--bg:#f4f7fa;--panel:#ffffff;--panel2:#eef3f7;--text:#16212c;--muted:#52616f;--accent:#0b6fb8;--accent2:#0b6fb8;--line:#d6e0e8;--good:#2f7d32}}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--text);font:16px/1.6 system-ui,-apple-system,"Segoe UI",Roboto,Arial,sans-serif}
a{color:var(--accent)}
.wrap{max-width:960px;margin:0 auto;padding:0 16px}
header.top{border-bottom:1px solid var(--line);background:var(--panel)}
header.top .wrap{display:flex;gap:16px;align-items:center;justify-content:space-between;padding-top:12px;padding-bottom:12px;flex-wrap:wrap}
header.top a.brand{color:var(--text);text-decoration:none;font-weight:700}
header.top nav a{margin-left:16px;text-decoration:none}
h1{font-size:2rem;line-height:1.2;margin:32px 0 12px}
h2{font-size:1.35rem;margin:36px 0 12px}
.lead{font-size:1.1rem;color:var(--muted);max-width:720px}
.btns{display:flex;gap:12px;flex-wrap:wrap;margin:20px 0}
.btn{display:inline-block;padding:10px 18px;border-radius:6px;background:var(--accent2);color:#fff;text-decoration:none;font-weight:600}
.btn.alt{background:var(--panel2);color:var(--text);border:1px solid var(--line)}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:12px}
.card{background:var(--panel);border:1px solid var(--line);border-radius:8px;padding:14px 16px;text-decoration:none;color:var(--text);display:block}
.card:hover{border-color:var(--accent)}
.card strong{display:block}
.card span{color:var(--muted);font-size:.92rem}
table{width:100%;border-collapse:collapse;background:var(--panel);border:1px solid var(--line);border-radius:8px;overflow:hidden}
th,td{text-align:left;padding:8px 12px;border-bottom:1px solid var(--line);vertical-align:top}
th{background:var(--panel2);font-size:.9rem}
td.n{white-space:nowrap;color:var(--muted)}
.tablewrap{overflow-x:auto}
.note{background:var(--panel);border-left:3px solid var(--accent);padding:10px 14px;border-radius:4px}
ol li,ul li{margin:4px 0}
details{background:var(--panel);border:1px solid var(--line);border-radius:8px;padding:10px 14px;margin:8px 0}
summary{cursor:pointer;font-weight:600}
footer{margin:48px 0 0;padding:20px 0;border-top:1px solid var(--line);color:var(--muted);font-size:.9rem}
"""


def esc(text):
    return html.escape(str(text), quote=True)


def load_game(slug):
    folder = GAMES_DIR / slug
    game = json.loads((folder / 'game.json').read_text(encoding='utf-8'))
    if 'achievementsFile' in game:
        game['achievements'] = json.loads((folder / game['achievementsFile']).read_text(encoding='utf-8'))
    game['slug'] = slug
    game.update(GAME_INFO[slug])
    game['total'] = len(game['achievements']) + (1 if game.get('completion') else 0)
    return game


def page(title, description, path, body, ld):
    url = SITE_URL + path
    return f"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>{esc(title)}</title>
<meta name="description" content="{esc(description)}">
<link rel="canonical" href="{esc(url)}">
<meta name="google-site-verification" content="{GOOGLE_VERIFICATION}">
<meta property="og:type" content="website">
<meta property="og:title" content="{esc(title)}">
<meta property="og:description" content="{esc(description)}">
<meta property="og:url" content="{esc(url)}">
<meta name="twitter:card" content="summary">
<style>{CSS}</style>
<script type="application/ld+json">{json.dumps(ld, ensure_ascii=False)}</script>
</head>
<body>
<header class="top"><div class="wrap"><a class="brand" href="{SITE_URL}">Steam Custom Achievements</a><nav><a href="{SITE_URL}#games">Games</a><a href="{SITE_URL}#install">Install</a><a href="{REPO_URL}">GitHub</a></nav></div></header>
<main class="wrap">
{body}
</main>
<footer><div class="wrap">Steam Custom Achievements is a free, open source, unofficial fan plugin for <a href="{MILLENNIUM_URL}">Millennium</a>. It is not made by or affiliated with Valve, Microsoft, Sony or any game publisher. Achievement names and descriptions belong to their games' publishers. <a href="{REPO_URL}">Source code on GitHub</a> (MIT license).</div></footer>
</body>
</html>
"""


def install_steps():
    return f"""<ol>
<li>Install <a href="{MILLENNIUM_URL}">Millennium</a> 3.x for Steam on Windows.</li>
<li>Download the latest <code>steam-custom-achievements-vX.Y.Z-share.zip</code> from <a href="{REPO_URL}/releases">GitHub Releases</a>.</li>
<li>Exit Steam completely (Steam &gt; Exit), extract the ZIP and run <code>INSTALL_OR_REPAIR.cmd</code>.</li>
<li>Start Steam, check that <strong>Steam Custom Achievements (Local)</strong> is on in Millennium &gt; Plugins, and open a supported game in your Library.</li>
</ol>
<p>The <a href="{GUIDE_URL}">step by step Steam guide</a> has pictures and fixes for common problems.</p>"""


def build_index(games):
    total = sum(g['total'] for g in games)
    names = ', '.join(g['title'] for g in games)
    title = 'Steam Achievements for Mass Effect, Assassin\'s Creed, Fallout 3, Fable III and more'
    description = (f'Free Steam plugin that adds the Xbox 360 achievements to {len(games)} PC games that have none on Steam: '
                   f'{names}. {total} achievements, most unlock automatically from your saves.')
    cards = '\n'.join(
        f'<a class="card" href="{g["page"]}/"><strong>{esc(g["title"])} Steam achievements</strong>'
        f'<span>{g["total"]} achievements, {g["auto"]} unlock automatically</span></a>'
        for g in games)
    faq = [
        ('Why do these games have no achievements on Steam?',
         'Many PC ports from the Xbox 360 era used Games for Windows Live or had no PC achievements at all, so their Steam pages never got any. '
         'The Xbox 360 and PS3 versions did have them. This plugin brings those lists to Steam.'),
        ('Do the achievements show on my Steam profile?',
         'No. They show in your own Steam client only: on the game\'s Library page, the achievement list, popups when you unlock one, and Big Picture mode. '
         'Steam does not let anyone add real achievements to a game they did not publish.'),
        ('Do I have to unlock them again by hand?',
         'Mostly not. The plugin reads your game saves (read only, it never changes them) and unlocks an achievement a few seconds after the game records it, '
         'including ones you earned before installing. The few it cannot detect have a "Mark as unlocked" button.'),
        ('Is it safe?',
         'The plugin makes no network connections, never changes your saves, and only writes to its own folder. The source code is on GitHub. '
         'Only download it from the GitHub Releases page or the Steam guide.'),
        ('Does it work in Big Picture mode and with a controller?',
         'Yes. Big Picture shows an Achievements section on the game page and a full list you can browse with a controller.'),
        ('Can you add another game?',
         'Yes, games are added one folder at a time. Open an issue on GitHub with the game\'s name, or follow ADDING_A_GAME.md to add it yourself.'),
    ]
    faq_html = '\n'.join(f'<details><summary>{esc(q)}</summary><p>{esc(a)}</p></details>' for q, a in faq)
    ld = [
        {
            '@context': 'https://schema.org',
            '@type': 'SoftwareApplication',
            'name': 'Steam Custom Achievements',
            'applicationCategory': 'GameApplication',
            'operatingSystem': 'Windows',
            'description': description,
            'url': SITE_URL,
            'downloadUrl': REPO_URL + '/releases',
            'license': 'https://opensource.org/licenses/MIT',
            'offers': {'@type': 'Offer', 'price': '0', 'priceCurrency': 'USD'},
        },
        {
            '@context': 'https://schema.org',
            '@type': 'FAQPage',
            'mainEntity': [{'@type': 'Question', 'name': q, 'acceptedAnswer': {'@type': 'Answer', 'text': a}} for q, a in faq],
        },
    ]
    body = f"""<h1>Steam achievements for games that only had them on Xbox 360 and PS3</h1>
<p class="lead">Steam Custom Achievements is a free <a href="{MILLENNIUM_URL}">Millennium</a> plugin that adds the Xbox 360 achievement list, plus the PS3 platinum, to {len(games)} PC games that have no achievements on Steam. Each game gets an Achievements card on its Steam Library page, unlock popups, and a full achievement list, in desktop Steam and Big Picture mode.</p>
<div class="btns"><a class="btn" href="{REPO_URL}/releases">Download from GitHub</a><a class="btn alt" href="{GUIDE_URL}">Steam install guide</a></div>
<h2 id="games">Supported games</h2>
<div class="grid">
{cards}
</div>
<h2>How it works</h2>
<p>The plugin reads each game's save files or profile (read only) and unlocks an achievement a few seconds after the game records your progress, with a Steam style popup and sound. Achievements you earned before installing unlock the first time it reads your saves. Anything the save does not record has a "Mark as unlocked" button. Your unlocks are kept when you update.</p>
<h2 id="install">Install</h2>
{install_steps()}
<h2>Questions</h2>
{faq_html}
"""
    return page(title, description, '', body, ld)


def build_game(game):
    t = game['title']
    title = f'{t} Steam Achievements: all {game["total"]} Xbox 360 achievements on PC'
    description = (f'Add the {game["total"]} Xbox 360 achievements to {t} on Steam. A free plugin puts them on your Steam Library page; '
                   f'{game["auto"]} unlock automatically from your saves.')
    rows = []
    for i, a in enumerate(game['achievements'], 1):
        pts = f'{a["points"]}G' if a.get('points') else ''
        rows.append(f'<tr><td class="n">{i}</td><td><strong>{esc(a["name"])}</strong></td><td>{esc(a.get("detail", ""))}</td><td class="n">{pts}</td></tr>')
    if game.get('completion'):
        c = game['completion']
        rows.append(f'<tr><td class="n">{len(rows) + 1}</td><td><strong>{esc(c["name"])}</strong></td><td>{esc(c.get("detail", ""))} (PS3 platinum trophy, unlocks when you have all the others)</td><td class="n"></td></tr>')
    manual = game['total'] - game['auto']
    manual_text = (f'All {game["total"]} unlock automatically.' if manual == 0 else
                   f'{game["auto"]} unlock automatically and {manual} have a "Mark as unlocked" button.')
    aka = ', '.join(game['aka'])
    plat = ', plus a PS3 platinum trophy' if game.get('completion') else ''
    ld = [
        {
            '@context': 'https://schema.org',
            '@type': 'SoftwareApplication',
            'name': f'Steam Custom Achievements for {t}',
            'applicationCategory': 'GameApplication',
            'operatingSystem': 'Windows',
            'description': description,
            'url': SITE_URL + game['page'] + '/',
            'downloadUrl': REPO_URL + '/releases',
            'offers': {'@type': 'Offer', 'price': '0', 'priceCurrency': 'USD'},
        },
        {
            '@context': 'https://schema.org',
            '@type': 'BreadcrumbList',
            'itemListElement': [
                {'@type': 'ListItem', 'position': 1, 'name': 'Steam Custom Achievements', 'item': SITE_URL},
                {'@type': 'ListItem', 'position': 2, 'name': f'{t} Steam achievements', 'item': SITE_URL + game['page'] + '/'},
            ],
        },
    ]
    body = f"""<p><a href="../">All games</a></p>
<h1>{esc(t)} Steam achievements</h1>
<p class="lead">{esc(t)} has no achievements on Steam, but the {esc(game["platform"])} version has {len(game["achievements"])}{plat}. Steam Custom Achievements is a free plugin that adds all {game["total"]} of them to {esc(t)} in your Steam Library (Steam app {game["appId"]}). {manual_text}</p>
<div class="btns"><a class="btn" href="{REPO_URL}/releases">Download from GitHub</a><a class="btn alt" href="{GUIDE_URL}">Steam install guide</a></div>
<h2>How {esc(t)} achievements unlock</h2>
<p class="note">{esc(game.get("trackingNote", ""))}</p>
<h2>Install</h2>
{install_steps()}
<h2>All {game["total"]} {esc(t)} achievements</h2>
<div class="tablewrap"><table>
<thead><tr><th>#</th><th>Achievement</th><th>How to unlock</th><th>Points</th></tr></thead>
<tbody>
{chr(10).join(rows)}
</tbody>
</table></div>
<p>Also searched as: {esc(aka)}.</p>
"""
    return page(title, description, game['page'] + '/', body, ld)


def write(path, text):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text, encoding='utf-8', newline='\n')


def main():
    games = [load_game(slug) for slug in ORDER]
    write(DOCS / 'index.html', build_index(games))
    for game in games:
        write(DOCS / game['page'] / 'index.html', build_game(game))
    urls = [SITE_URL] + [SITE_URL + g['page'] + '/' for g in games]
    write(DOCS / 'sitemap.xml', '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
          + ''.join(f'  <url><loc>{esc(u)}</loc></url>\n' for u in urls) + '</urlset>\n')
    write(DOCS / 'robots.txt', f'User-agent: *\nAllow: /\nSitemap: {SITE_URL}sitemap.xml\n')
    write(DOCS / '.nojekyll', '')
    print(f'Wrote {len(urls)} pages to {DOCS}')


if __name__ == '__main__':
    main()

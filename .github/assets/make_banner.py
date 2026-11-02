"""Rebuilds the README banner (.github/assets/banner.png).

Fills banner-template.html with real achievements (name, description, unlock
rate and picture from source/games/<slug>/game.json and art/), then renders it
at 2560x640 with Playwright's Chromium:

    python .github/assets/make_banner.py

Change ROWS to show other achievements, and the "11 games / 599 achievements"
chips in the template when games are added.
"""
import base64, glob, html, json, pathlib

ROOT = pathlib.Path(__file__).resolve().parents[2]
HERE = pathlib.Path(__file__).resolve().parent
ROWS = [('me2', 26, 'Mass Effect 2'), ('fable3', 29, 'Fable III'),
        ('fallout3', 49, 'Fallout 3'), ('acb', 31, "Assassin's Creed Brotherhood")]


def row(slug, index, title):
    a = json.loads((ROOT / f'source/games/{slug}/game.json').read_text(encoding='utf-8'))['achievements'][index]
    pic = pathlib.Path(glob.glob(str(ROOT / f'source/games/{slug}/art/{index}.*'))[0])
    kind = pic.suffix[1:].replace('jpg', 'jpeg')
    uri = f'data:image/{kind};base64,' + base64.b64encode(pic.read_bytes()).decode()
    detail = a['detail'].split(' They won')[0]
    rare = ' rare' if a['rarity'] < 10 else ''
    return (f'<div class="row{rare}"><img src="{uri}"><div class="txt">'
            f'<div class="n">{html.escape(a["name"])}</div><div class="d">{html.escape(detail)}</div>'
            f'<div class="p">{a["rarity"]}% of players have this achievement</div></div>'
            f'<div class="g">{html.escape(title)}</div></div>')


def main():
    page = (HERE / 'banner-template.html').read_text(encoding='utf-8')
    page = page.replace('%%ROWS%%', ''.join(row(*r) for r in ROWS))
    from playwright.sync_api import sync_playwright
    with sync_playwright() as p:
        try:
            browser = p.chromium.launch()
        except Exception:  # Playwright's own Chromium is not installed: use Chrome
            browser = p.chromium.launch(channel='chrome')
        tab = browser.new_page(viewport={'width': 1280, 'height': 320}, device_scale_factor=2)
        tab.set_content(page)
        tab.wait_for_timeout(300)
        tab.screenshot(path=str(HERE / 'banner.png'))
        browser.close()


if __name__ == '__main__':
    main()

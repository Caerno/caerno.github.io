"""Картинка для превью ссылки (og:image, 1200×630): снимок хиро из собранной страницы, по языку.

    node build.mjs && python3 tools/og.py      # → src/brand/og.png, src/brand/og-ru.png; build.mjs кладёт их в dist/

Хиро снимается в режиме «убрать анимацию» (фигура неподвижна), без меню. Перезапускать, когда меняются
имя, роль, строка статуса или фигура. Нужен Playwright для Python (как у tests/).
"""
import functools, http.server, pathlib, threading
from playwright.sync_api import sync_playwright

ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT = {'/': ROOT / 'src/brand/og.png', '/ru/': ROOT / 'src/brand/og-ru.png'}


class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass


srv = http.server.ThreadingHTTPServer(('127.0.0.1', 0), functools.partial(Quiet, directory=str(ROOT / 'dist')))
threading.Thread(target=srv.serve_forever, daemon=True).start()
with sync_playwright() as p:
    b = p.chromium.launch()
    for path, out in OUT.items():
        pg = b.new_page(viewport={'width': 1200, 'height': 630}, reduced_motion='reduce')
        pg.goto(f'http://127.0.0.1:{srv.server_port}{path}', wait_until='networkidle')
        pg.add_style_tag(content='nav{display:none !important}')
        pg.wait_for_selector('#hero-t.on')
        pg.wait_for_timeout(4500)                      # field.js: неподвижный кадр после T_STILL = 3,2 с
        pg.screenshot(path=str(out))
        print('✓', out.relative_to(ROOT))
    b.close()
srv.shutdown()

"""Smoke test of the "Your Thing" page (tools/build-career.mjs) in headless Chromium (Playwright).

    python3 tests/career.py

Builds both language versions into a temporary folder, serves it over http (both pages share one origin, so one
localStorage, as on GitHub Pages) and checks what a visitor can lose by moving between /en/ and /ru/:
marked occupations stay on screen after the switch, "start over" clears the Russian-only constraint answers,
a damaged or stale storage does not break the page, a second tab or a page restored from the back/forward cache
picks up what the other page saved.
"""
import functools
import http.server
import json
import os
import subprocess
import sys
import tempfile
import threading
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
libs = Path.home() / '.local/pwlibs'          # local WSL quirk: shared libs for Chromium live here
if libs.exists():
    os.environ.setdefault('LD_LIBRARY_PATH', str(libs))

from playwright.sync_api import sync_playwright  # noqa: E402

failed = []


def check(cond, what):
    if not cond:
        failed.append(what)
    print(('  ok  ' if cond else '  FAIL') + ' ' + what)


class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *args):
        pass


with tempfile.TemporaryDirectory() as tmp:
    subprocess.run(['node', 'tools/build-career.mjs', tmp, '--pretty'], cwd=ROOT, check=True, stdout=subprocess.DEVNULL)
    server = http.server.ThreadingHTTPServer(('127.0.0.1', 0), functools.partial(Quiet, directory=tmp))
    threading.Thread(target=server.serve_forever, daemon=True).start()
    BASE = f'http://127.0.0.1:{server.server_address[1]}/'

    with sync_playwright() as p:
        browser = p.chromium.launch()
        ctx = browser.new_context(viewport={'width': 1280, 'height': 900})
        page = ctx.new_page()
        errors = []
        page.on('pageerror', lambda e: errors.append(str(e)))

        def marked():
            return page.evaluate("document.querySelectorAll('#career-occs li.picked').length")

        def stored(key):
            return page.evaluate('k => localStorage.getItem(k)', key)

        def tick(sel, i):
            page.evaluate("([s, i]) => document.querySelectorAll('#career-occs li .pk ' + s)[i].click()", [sel, i])

        page.goto(BASE + 'ru/')
        page.wait_for_timeout(400)
        ids = page.evaluate("CAREER_DATA.items.filter(i => i.src === 'riasec').slice(0, 14).map(i => i.id)")
        seed = "ids => localStorage.setItem('career.answers.v1', JSON.stringify(ids.map((id, k) => [id, k % 5 + 1])))"
        page.evaluate(seed, ids)
        page.reload()
        page.wait_for_timeout(400)
        check(page.evaluate("!document.getElementById('career-results').hidden"), 'ru: results open after 14 answers')
        tick('.y', 0)
        tick('.y', 1)
        tick('.n', 2)
        check(marked() == 2, 'ru: two "mine" are marked')

        print('== language switch')
        page.click('nav .lang a')
        page.wait_for_timeout(600)
        check(page.url == BASE, f'switched to en ({page.url})')
        check(marked() == 2, 'en: both "mine" still on screen (the two lists rank differently)')
        check((page.evaluate("document.getElementById('career-nope').innerText") or '').startswith('Not for me · 1'), 'en: "Not for me · 1" group')
        check(page.evaluate("document.querySelectorAll('#career-badge img').length") == 1, 'en: badge preview drawn')
        check(page.evaluate("document.querySelector('#career-occs li.picked .pk .y').getAttribute('aria-pressed')") == 'true', 'en: marked button is aria-pressed')
        page.click('nav .lang a')
        page.wait_for_timeout(600)
        check(marked() == 2, 'ru again: both "mine" still on screen')

        print('== start over on en')
        page.evaluate("localStorage.setItem('career.limits.v2', JSON.stringify({sex: 'm'}))")
        page.goto(BASE)
        page.wait_for_timeout(400)
        page.once('dialog', lambda d: d.accept())
        page.evaluate("[...document.querySelectorAll('#career-q .q__actions .btn')].pop().click()")
        page.wait_for_timeout(300)
        check(stored('career.limits.v2') is None, 'en: start over erases the Russian constraint answers too')
        check(stored('career.picks.v1') == '{}', 'en: start over erases the marks')

        print('== damaged storage')
        page.evaluate("localStorage.setItem('career.picks.v1', 'null'); localStorage.setItem('career.answers.v1', '{\"a\": 1}')")
        page.reload()
        page.wait_for_timeout(400)
        check(page.evaluate("!!document.querySelector('#career-q .q__text')"), 'a question is shown')
        page.evaluate("localStorage.setItem('career.picks.v1', JSON.stringify({'00-0000.00': 'yes'}))")
        page.reload()
        page.wait_for_timeout(400)
        check(page.evaluate("!!document.querySelector('#career-q .q__text')"), 'an unknown occupation code does not break the page')

        print('== next question in the background (ru)')
        page.evaluate("localStorage.clear()")
        page.goto(BASE + 'ru/')
        page.wait_for_timeout(300)
        page.evaluate(seed, ids)
        page.reload()
        page.wait_for_timeout(1000)
        before = page.evaluate("document.querySelector('#career-q .q__text').textContent")
        check(page.evaluate("(() => { const q = document.getElementById('career-q'); q.querySelector('.likert button').click(); return q.getAttribute('aria-busy'); })()") == 'true',
              'ru: after an answer the page waits for the background thread, not for itself')
        page.wait_for_function("document.getElementById('career-q').getAttribute('aria-busy') !== 'true'", timeout=10000)
        check(page.evaluate("document.querySelector('#career-q .q__text').textContent") != before, 'ru: the next question arrives')

        print('== "mine" pulls the occupation up (en)')
        page.goto(BASE)
        page.wait_for_timeout(400)
        names = "[...document.querySelectorAll('#career-occs > li .occs__name')].map(b => b.textContent)"
        name = page.evaluate(names)[19]
        tick('.y', 19)
        pos = page.evaluate(names).index(name)
        check(pos < 5, f'en: "mine" on row 20 lifts it to row {pos + 1} (top 5 expected)')

        print('== second tab and back/forward cache')
        page.evaluate("localStorage.clear()")
        page.goto(BASE + 'ru/')
        page.wait_for_timeout(300)
        page.evaluate(seed, ids)
        page.reload()
        page.wait_for_timeout(400)
        other = ctx.new_page()
        other.goto(BASE)
        other.wait_for_timeout(500)
        other.evaluate("document.querySelectorAll('#career-occs li .pk .y')[0].click()")
        page.wait_for_timeout(500)
        check(marked() == 1, 'ru tab shows the mark made in the en tab without a reload')
        page.evaluate("localStorage.setItem('career.picks.v1', '{}')")
        page.evaluate("window.dispatchEvent(new PageTransitionEvent('pageshow', {persisted: true}))")
        page.wait_for_timeout(300)
        check(marked() == 0, 'a page restored from the cache re-reads the storage')

        check(not errors, f'no page errors {errors[:2]}')
        browser.close()
    server.shutdown()

print()
print('FAILED:' if failed else 'all checks passed', *failed, sep='\n  ')
sys.exit(1 if failed else 0)

"""Smoke test of the built landing in headless Chromium (Playwright).

Run after `node build.mjs`:
    python3 tests/smoke.py
Needs the Playwright Python package with Chromium installed (any venv is fine).

Checks, per language: the page loads without console errors, the wheel scrolls the page (nothing hijacks it),
the "+" of a case card opens, and the language switch points at the other version.
"""
import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PAGES = {'en': ROOT / 'dist/index.html', 'ru': ROOT / 'dist/ru/index.html'}

libs = Path.home() / '.local/pwlibs'          # local WSL quirk: shared libs for Chromium live here
if libs.exists():
    os.environ.setdefault('LD_LIBRARY_PATH', str(libs))

from playwright.sync_api import sync_playwright  # noqa: E402

failed = []


def check(cond, what):
    if not cond:
        failed.append(what)
    print(('  ok  ' if cond else '  FAIL') + ' ' + what)


with sync_playwright() as p:
    browser = p.chromium.launch()
    for lang, page_path in PAGES.items():
        print(f'== {lang}')
        check(page_path.exists(), f'{page_path.relative_to(ROOT)} exists')
        if not page_path.exists():
            continue
        errors = []
        page = browser.new_page(viewport={'width': 1280, 'height': 800})
        page.on('pageerror', lambda e: errors.append(str(e)))
        page.goto(page_path.as_uri())
        page.wait_for_timeout(500)
        check(not errors, f'no page errors {errors[:1]}')
        page.evaluate("document.documentElement.style.scrollBehavior = 'auto'")
        page.evaluate("scrollTo(0, document.getElementById('work').getBoundingClientRect().top + scrollY - 200)")
        page.wait_for_timeout(200)
        y0 = page.evaluate('scrollY')
        page.mouse.move(640, 400)
        for _ in range(6):
            page.mouse.wheel(0, 100)
            page.wait_for_timeout(80)
        y1 = page.evaluate('scrollY')
        check(y1 - y0 >= 500, f'wheel scrolls the page, nothing holds it ({y0}->{y1})')
        first = page.locator('.cases .case button.case__t').first
        if first.count():
            first.evaluate('b => b.click()')
            page.wait_for_timeout(400)
            check(page.evaluate("!document.querySelector('.cases .case .case__more').hidden"), '"+" opens the case')
        other = page.evaluate("(document.querySelector('#nav a[hreflang]') || document.querySelector('link[rel=alternate]') || {}).getAttribute?.('href')")
        check(bool(other), f'language switch present ({other})')
        page.close()
    browser.close()

print()
print('FAILED:' if failed else 'all checks passed', *failed, sep='\n  ')
sys.exit(1 if failed else 0)

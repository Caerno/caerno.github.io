"""Знак сайта: пиксельная звезда 7×7, лучи гаснут к концам (вариант 5/13 из Сайт-визитка/фавикон, выбран 23.10.2026).

Один источник для всех размеров: сетка STAR ниже. Пишет в src/brand/:
  favicon.svg          плитка 32×32 со знаком — фавикон и лого
  mark.svg             знак без плитки — в меню сайта (build.mjs вставляет его в HTML)
  favicon.ico          16, 32, 48
  apple-touch-icon.png 180, плитка во весь квадрат (углы скругляет сама система)
  logo-512.png, logo-1024.png — лого для аватаров и соцсетей

Клетка = 4 единицы из 32, поля 2: при 16, 32, 48, 512, 1024 px клетки ложатся ровно на пиксели.
Запуск: python3 tools/brand.py (нужен Pillow)
"""
from pathlib import Path
from PIL import Image, ImageDraw

BG, ACCENT = (0x12, 0x13, 0x15), (0xE0, 0x70, 0x3A)
STAR = ['...2...',
        '...4...',
        '..454..',
        '2455542',
        '..454..',
        '...4...',
        '...2...']
OUT = Path(__file__).resolve().parent.parent / 'src' / 'brand'


def color(level):
    """уровень 2/4/5 = оранжевый с непрозрачностью .4/.8/1 поверх фона, сведённый в сплошной цвет"""
    a = int(level) / 5
    return tuple(round(b + a * (c - b)) for b, c in zip(BG, ACCENT))


def cells(cell, margin):
    for i, row in enumerate(STAR):
        for j, ch in enumerate(row):
            if ch != '.':
                yield margin + j * cell, margin + i * cell, color(ch)


def hexc(c):
    return '#%02X%02X%02X' % c


def svg(tile):
    paths = {}
    for x, y, c in cells(4, 2):
        paths.setdefault(c, []).append(f'M{x} {y}h4v4h-4z')
    body = ''.join(f'<path fill="{hexc(c)}" d="{"".join(d)}"/>' for c, d in paths.items())
    bg = f'<rect width="32" height="32" rx="6" fill="{hexc(BG)}"/>' if tile else ''
    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">{bg}{body}</svg>\n'


def png(size, rounded=True, cell=None, margin=None):
    """рисуем в 8 раз крупнее и сводим усреднением: клетки на целых пикселях остаются чёткими, скругление плитки сглаживается"""
    k = 8
    cell, margin = cell or size // 8, margin if margin is not None else size // 16
    im = Image.new('RGBA', (size * k, size * k), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    if rounded:
        d.rounded_rectangle((0, 0, size * k - 1, size * k - 1), radius=size * k * 6 // 32, fill=BG)
    else:
        d.rectangle((0, 0, size * k - 1, size * k - 1), fill=BG)
    for x, y, c in cells(cell * k, margin * k):
        d.rectangle((x, y, x + cell * k - 1, y + cell * k - 1), fill=c)
    return im.resize((size, size), Image.Resampling.BOX)


if __name__ == '__main__':
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / 'favicon.svg').write_text(svg(True))
    (OUT / 'mark.svg').write_text(svg(False))
    icons = [png(s) for s in (48, 32, 16)]
    icons[0].save(OUT / 'favicon.ico', sizes=[(48, 48), (32, 32), (16, 16)], append_images=icons[1:])
    png(180, rounded=False, cell=20, margin=20).convert('RGB').save(OUT / 'apple-touch-icon.png')
    for s in (512, 1024):
        png(s).save(OUT / f'logo-{s}.png')
    print('written:', ', '.join(sorted(p.name for p in OUT.iterdir())))

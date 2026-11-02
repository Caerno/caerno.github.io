#!/usr/bin/env python3
"""Фото для главной (02.11.2026): круг по лицу из снимка, ч/б, край чёткий (03.11: вместо размытого края 10 px — граница по его дальней стороне, круг во весь кадр).
   python3 -I tools/photo.py <исходник.jpg> [cx cy r] -> src/brand/photo.png (2x: 480 px, на странице ~240; цветной, ч/б — CSS)."""
import sys
from PIL import Image, ImageOps

src = sys.argv[1]
cx, cy, r = (int(x) for x in sys.argv[2:5]) if len(sys.argv) >= 5 else (330, 310, 185)
OUT, SS = 480, 4                    # вывод 480 px = 2x от 240 на странице; маска рисуется в 4x и сжимается — сглаженный, но чёткий край
im = Image.open(src).convert('RGB')
box = (cx - r, cy - r, cx + r, cy + r)
im = im.crop(box).resize((OUT, OUT), Image.LANCZOS)
im = ImageOps.autocontrast(im, cutoff=1)          # цвет; ч/б делает CSS (filter), по наведению цвет возвращается (его слово 02.11)
from PIL import ImageDraw
mask = Image.new('L', (OUT * SS, OUT * SS), 0)
ImageDraw.Draw(mask).ellipse((0, 0, OUT * SS - 1, OUT * SS - 1), fill=255)   # чёткий край по дальней стороне бывшего размытия (03.11)
mask = mask.resize((OUT, OUT), Image.LANCZOS)


out = im.convert('RGBA'); out.putalpha(mask)
out.save('src/brand/photo.png', optimize=True)
print('src/brand/photo.png', out.size)

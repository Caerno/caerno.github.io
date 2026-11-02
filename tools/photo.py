#!/usr/bin/env python3
"""Фото для главной (02.11.2026): круг по лицу из снимка, ч/б, край ~10 px с плавным нарастанием прозрачности.
   python3 -I tools/photo.py <исходник.jpg> [cx cy r] -> src/brand/photo.png (2x: 480 px, на странице ~240; цветной, ч/б — CSS)."""
import sys
from PIL import Image, ImageFilter, ImageOps

src = sys.argv[1]
cx, cy, r = (int(x) for x in sys.argv[2:5]) if len(sys.argv) >= 5 else (330, 310, 185)
OUT, EDGE = 480, 10 * 2            # вывод 480 px = 2x от 240 на странице; край 10 px на странице = 20 px здесь
im = Image.open(src).convert('RGB')
box = (cx - r, cy - r, cx + r, cy + r)
im = im.crop(box).resize((OUT, OUT), Image.LANCZOS)
im = ImageOps.autocontrast(im, cutoff=1)          # цвет; ч/б делает CSS (filter), по наведению цвет возвращается (его слово 02.11)
mask = Image.new('L', (OUT, OUT), 0)
from PIL import ImageDraw
ImageDraw.Draw(mask).ellipse((EDGE // 2, EDGE // 2, OUT - EDGE // 2, OUT - EDGE // 2), fill=255)
mask = mask.filter(ImageFilter.GaussianBlur(EDGE / 2.5))     # плавный край


out = im.convert('RGBA'); out.putalpha(mask)
out.save('src/brand/photo.png', optimize=True)
print('src/brand/photo.png', out.size)

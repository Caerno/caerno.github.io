#!/usr/bin/env python
"""Совместная модель: 6 шкал RIASEC + 5 шкал Big Five (TIPI) на одних респондентах Open Psychometrics.
Запуск: python3 tools/career-joint.py  (нужен numpy; вход — папка openpsychometrics из tools/sources.json)
Выход: data/career/model.json — порядок измерений, априорная корреляционная матрица 11×11
(наблюдаемые корреляции шкал, поправленные на ненадёжность и приведённые к положительно определённой),
параметры GRM для 10 пунктов TIPI. Грубо, так и помечено.
"""
import csv, json, math
from pathlib import Path
import numpy as np
from statistics import NormalDist
from sources import ROOT, src

SRC = src('openpsychometrics') / 'data.csv'
OUT = ROOT / 'data' / 'career' / 'model.json'
RS = ['R', 'I', 'A', 'S', 'E', 'C']
ids = [f'{s}{i}' for s in RS for i in range(1, 9)]
# TIPI: (шкала, прямой пункт, обратный пункт). Gosling, Rentfrow & Swann 2003.
B5 = [('EX', 1, 6), ('AG', 7, 2), ('CO', 3, 8), ('ES', 9, 4), ('OP', 5, 10)]

rows = []
with open(SRC, newline='') as f:
    for r in csv.DictReader(f, delimiter='\t'):
        try:
            v = [int(r[i]) for i in ids]; tp = [int(r[f'TIPI{k}']) for k in range(1, 11)]
        except ValueError:
            continue
        if any(x < 1 or x > 5 for x in v) or any(x < 1 or x > 7 for x in tp): continue
        if any(r.get(k) == '1' for k in ('VCL6', 'VCL9', 'VCL12')): continue
        rows.append(v + tp)
X = np.array(rows, dtype=float); n = len(X)
ri = X[:, :48].reshape(n, 6, 8); tipi = X[:, 48:]
ri_score = ri.mean(axis=2)
def alpha(items):  # Кронбах
    k = items.shape[1]; return k / (k - 1) * (1 - items.var(axis=0, ddof=1).sum() / items.sum(axis=1).var(ddof=1))
rel = [alpha(ri[:, s, :]) for s in range(6)]
b5_score = []; tipi_items = []; nd = NormalDist()
for name, pos, neg in B5:
    a_, b_ = tipi[:, pos - 1], 8 - tipi[:, neg - 1]
    r12 = np.corrcoef(a_, b_)[0, 1]
    rel.append(2 * r12 / (1 + r12))            # Спирмен—Браун для двух пунктов
    b5_score.append((a_ + b_) / 2)
    lam = math.sqrt(max(r12, 0.05)); a = lam / math.sqrt(1 - lam * lam)
    for num, col, rev in ((pos, a_, False), (neg, b_, True)):
        b = []
        for k in range(2, 8):
            p = min(max((col >= k).mean(), 1e-4), 1 - 1e-4)
            b.append(round(-nd.inv_cdf(p) * math.sqrt(1 + a * a) / a, 3))
        tipi_items.append({'id': f'T{num}', 'dim': name, 'rev': rev, 'a': round(a, 3), 'b': b, 'r12': round(float(r12), 3)})
S = np.column_stack([ri_score] + b5_score)
C = np.corrcoef(S, rowvar=False)
relv = np.array(rel)
D = C / np.sqrt(np.outer(relv, relv)); np.fill_diagonal(D, 1.0)
D = np.clip(D, -0.9, 0.9); np.fill_diagonal(D, 1.0)
w, V = np.linalg.eigh(D); w = np.maximum(w, 0.05); P = V @ np.diag(w) @ V.T
d = np.sqrt(np.diag(P)); P = P / np.outer(d, d)
dims = RS + [b[0] for b in B5]
np.set_printoptions(precision=2, suppress=True, linewidth=160)
print('n', n); print('rel', dict(zip(dims, np.round(relv, 2)))); print('observed\n', C); print('prior (disattenuated, PSD)\n', P); print('min eig', np.linalg.eigvalsh(P).min())
tipi_items.sort(key=lambda t: int(t['id'][1:]))
OUT.write_text(json.dumps({
    '_': 'Совместная априорная модель RIASEC×Big Five. prior — корреляционная матрица скрытых шкал (наблюдаемые корреляции шкал / sqrt(надёжностей), клип ±0,9, собственные числа ≥ 0,05). TIPI: GRM, 7 категорий, a в probit-единицах, пункты rev перекодируются 8−y до подсчёта. Грубо; tools/career-joint.py.',
    'n': n, 'dims': dims, 'reliability': dict(zip(dims, [round(float(x), 3) for x in relv])),
    'observed': [[round(float(x), 3) for x in r] for r in C], 'prior': [[round(float(x), 4) for x in r] for r in P], 'tipi': tipi_items}, ensure_ascii=False, indent=1))
print(OUT)

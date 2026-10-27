#!/usr/bin/env python3
"""Эмбеддинги названий для кейса маппинга (bge-m3 через Ollama, ТОЛЬКО процессор: num_gpu=0 — видеокарта общая).
Наборы: ESCO (англ. названия), O*NET (названия), Справочник Минтруда, профроли hh, названия вакансий
(«Работа России» топ-2000 + hh-счётчики), профессии партнёра. Кэш по тексту — embed_cache из tools/sources.json."""
import json, urllib.request, os, time, csv
from sources import ROOT, src
B = src('career_data') / 'banks'
C = src('embed_cache')
texts = []
texts += [e['title'] for e in json.load(open(B / 'esco-occupations-en.json'))]
texts += [o['title'] for o in json.load(open(ROOT / 'data/career/occupations.json'))['occupations']]
texts += [m['name'] for m in json.load(open(B / 'mintrud-spravochnik-2026-10-07.json'))]
texts += [r['role'] for r in csv.DictReader(open(B / 'hh-roles.csv'))]
texts += [n for n, k in json.load(open(B / 'trudvsem-2026-10-03.json'))['vacancy_names_top']]
texts += list(json.load(open(B / 'hh-title-counts-2026-10-04.json'))['counts'])
texts += [p['ru'] for p in json.load(open(src('career_data') / 'partner-professions-2026-10-07.json'))['items']]
done = set()
if os.path.exists(C):
    for l in open(C): done.add(json.loads(l)['t'])
todo = sorted({t.strip() for t in texts if t and t.strip()} - done)
print('всего', len(set(texts)), 'в кэше', len(done), 'считать', len(todo), flush=True)
f = open(C, 'a'); t0 = time.time()
for i in range(0, len(todo), 64):
    batch = todo[i:i + 64]
    req = urllib.request.Request('http://localhost:11434/api/embed', data=json.dumps({'model': 'bge-m3', 'input': batch, 'options': {'num_gpu': 0}}).encode(), headers={'Content-Type': 'application/json'})
    E = json.load(urllib.request.urlopen(req, timeout=900))['embeddings']
    for t, e in zip(batch, E): f.write(json.dumps({'t': t, 'e': [round(x, 5) for x in e]}, ensure_ascii=False) + '\n')
    f.flush()
    if (i // 64) % 10 == 0: print(f'{i + len(batch)}/{len(todo)} {time.time() - t0:.0f}s', flush=True)
print('ГОТОВО', len(todo), f'{time.time() - t0:.0f}s')

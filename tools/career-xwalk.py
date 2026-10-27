#!/usr/bin/env python
"""Соответствия для вкладок профессии на странице теста → data/career/xwalk.json.
  O*NET   — описание из O*NET 30.0 (Occupation Data, CC BY 4.0);
  ESCO    — по официальной таблице ESCO→O*NET-SOC 2019 (onetcenter.org), точное соответствие профессий;
  Минтруд — Справочник профессий Минтруда (скачан 07.10.2026) по той же 4-значной группе ОКЗ (= ISCO-08),
            которую дают ESCO-соответствия этой профессии; внутри группы — топ-5 по сходству русского названия
            с болгарскими метками ESCO (буквенные триграммы). Близкие профессии группы, НЕ точное соответствие.
Запуск: python3 tools/career-xwalk.py   (нужен openpyxl; входы — onet и career_data из tools/sources.json)"""
import csv, json, collections
from datetime import date
from pathlib import Path
import openpyxl
from sources import ROOT, src
BANKS = src('career_data') / 'banks'
OUT = ROOT / 'data/career/xwalk.json'
occ = json.load(open(OUT.parent / 'occupations.json'))['occupations']
codes = {o['code'] for o in occ}
desc = {}
with open(src('onet') / 'onet-30-occupations.txt', newline='') as f:
    for r in csv.DictReader(f, delimiter='\t'): desc[r['O*NET-SOC Code']] = r['Description'].strip()
esco = json.load(open(BANKS / 'esco-occupations-en.json')); esco_by_code = {e['code']: e for e in esco}
wb = openpyxl.load_workbook(BANKS / 'ESCO_to_ONET-SOC.xlsx', read_only=True)
rows = list(wb.worksheets[0].iter_rows(values_only=True))
start = next(i for i, r in enumerate(rows) if r and r[0] == 'ESCO/ISCO Code') + 1
on2esco = collections.defaultdict(list)
for r in rows[start:]:
    if not r or not r[0] or not r[2]: continue
    ec, oc = str(r[0]).strip(), str(r[2]).strip()
    if oc in codes and ec in esco_by_code and ec not in on2esco[oc]: on2esco[oc].append(ec)
mt = json.load(open(BANKS / 'mintrud-spravochnik-2026-10-07.json'))
mt_by_okz = collections.defaultdict(list)
for m in mt:
    for z in m['okz']: mt_by_okz[z['code']].append(m['id'])
labels = json.load(open(BANKS / 'esco-occupations-labels-2026-10-07.json'))
import re
def norm(t):
    t = t.lower().replace('ё', 'е').replace('ы', 'и').replace('э', 'е').replace('ь', '').replace('ъ', 'а')
    return re.sub(r'[^а-яa-z ]', ' ', t)
STOP = set()
def grams(t):
    out = set()
    for w in norm(t).split():
        if w in STOP or len(w) < 3: continue
        w = f' {w} '; out.update(w[i:i + 3] for i in range(len(w) - 2))
    return out
wc = collections.Counter(w for m in mt for w in set(norm(m['name']).split()))
wc.update(w for e in esco for w in set(norm((labels.get(e['uri']) or {}).get('bg', '')).split()))
STOP |= {w for w, k in wc.items() if k > 40}   # «специалист», «по», «мастер», «оператор», «работник»…
bg = {}
for e in esco:
    lab = (labels.get(e['uri']) or {}).get('bg', '')
    bg[e['code']] = [grams(x) for x in lab.split('/') if x.strip()]
mt_g = {m['id']: grams(m['name']) for m in mt}
def sim(a, b): return len(a & b) / (len(a | b) or 1)
TOP, MIN = 5, 0.2
mt_used = set(); out_on = {}
for o in occ:
    c = o['code']; ec = on2esco.get(c, [])
    groups = sorted({e[:4] for e in ec})
    cand = {i for g in groups for i in mt_by_okz.get(g, [])}
    targets = [g for e in ec for g in bg.get(e, [])]
    scored = sorted(((max((sim(mt_g[i], t) for t in targets), default=0), i) for i in cand), reverse=True)[:TOP]
    scored = [(sc, i) for sc, i in scored if sc >= MIN]
    ids = [i for sc, i in scored]
    mt_used.update(ids)
    out_on[c] = {'d': desc.get(c, ''), 'esco': ec, 'isco': groups, 'mt': ids, 'mts': [round(sc, 2) for sc, i in scored], 'mtn': len(cand)}
esco_out = {c: [esco_by_code[c]['title'], esco_by_code[c]['uri']] for c in sorted({e for v in out_on.values() for e in v['esco']})}   # sorted: порядок множества строк меняется от запуска к запуску
okz_names = {z['code']: z['name'] for m in mt for z in m['okz']}
mt_out = {m['id']: {'n': m['name'], 'd': m['description'], 'okz': [z['code'] for z in m['okz']]} for m in mt if m['id'] in mt_used}
# Русские названия, уже сопоставленные с O*NET вручную: профессии партнёра (точно) и профроли hh (вручную 04.10, не сверены).
ru = {}
for it in json.load(open(src('career_data') / 'partner-professions-2026-10-07.json'))['items']:
    ru.setdefault(it['onet'], []).append({'n': it['ru'], 'src': 'partner'})
for r in csv.DictReader(open(BANKS / 'hh-roles-onet-manual.csv')):
    if r['onet_code'] in codes and not any(x['n'] == r['hh_role'] for x in ru.get(r['onet_code'], [])):
        ru.setdefault(r['onet_code'], []).append({'n': r['hh_role'], 'src': 'hh'})
json.dump({'_': __doc__.split('\n')[0], 'built': date.today().isoformat(), 'ru': ru, 'onet': out_on, 'esco': esco_out, 'mt': mt_out, 'okz': {g: okz_names.get(g, '') for v in out_on.values() for g in v['isco']}},
          open(OUT, 'w'), ensure_ascii=False, separators=(',', ':'))
n_esco = sum(1 for v in out_on.values() if v['esco']); n_mt = sum(1 for v in out_on.values() if v['mt'])
cnt = sorted(len(v['mt']) for v in out_on.values() if v['mt'])
print(f'O*NET {len(out_on)} | с ESCO {n_esco} | с Минтрудом {n_mt} (на профессию медиана {cnt[len(cnt)//2]}, макс {cnt[-1]}) | ESCO {len(esco_out)} | Минтруд {len(mt_out)}')
print('русских названий у профессий O*NET:', len(ru))
print(OUT, OUT.stat().st_size // 1024, 'KB')

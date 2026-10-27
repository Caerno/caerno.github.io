#!/usr/bin/env python
"""Кейс маппинга по кодам: русские профессии → группа ОКЗ (= ISCO-08, 4 знака) → уровень, ESCO той же группы,
O*NET через официальную таблицу ESCO→O*NET-SOC 2019. Без моделей.
  Справочник Минтруда, ОК 016-2025 — код ОКЗ свой;
  профроли hh, названия вакансий, профессии партнёра — кода нет: точное совпадение нормализованного названия
  с названием в ОК 016-2025 или Справочнике (регистр, ё, скобки, пробелы), оттуда ОКЗ.
Проверка: 17 профессий партнёра и 25 профролей hh с ручной привязкой к O*NET — попадает ли верная O*NET в список группы.
Запуск: python3 tools/career-map.py   (нужен openpyxl; вход и выход — banks/ в career_data из tools/sources.json)"""
import json, csv, collections, re
import openpyxl
from sources import ROOT, src
P = src('career_data'); B = P / 'banks'; OUT = B / 'map'; OUT.mkdir(exist_ok=True)
LEVEL = {'1': 'руководители', '2': 'специалисты высшего уровня', '3': 'специалисты среднего уровня', '4': 'служащие', '5': 'сфера обслуживания и торговли', '6': 'сельское хозяйство', '7': 'квалифицированные рабочие', '8': 'операторы и сборщики', '9': 'неквалифицированные', '0': 'военные'}
def norm(s): s = (s or '').lower().replace('ё', 'е'); s = re.sub(r'\(.*?\)', ' ', s); s = re.sub(r'[^\w\s-]', ' ', s); return re.sub(r'\s+', ' ', s).strip()

esco = json.load(open(B / 'esco-occupations-en.json'))
esco_by_isco = collections.defaultdict(list)
for e in esco: esco_by_isco[e['code'][:4]].append(e)
onet = {o['code']: o['title'] for o in json.load(open(ROOT / 'data/career/occupations.json'))['occupations']}
rows = list(openpyxl.load_workbook(B / 'ESCO_to_ONET-SOC.xlsx', read_only=True).worksheets[0].iter_rows(values_only=True))
st = next(i for i, r in enumerate(rows) if r and r[0] == 'ESCO/ISCO Code') + 1
isco2on = collections.defaultdict(collections.Counter)   # группа ISCO → O*NET, вес = сколько ESCO группы ведут в эту O*NET
for r in rows[st:]:
    if r and r[0] and r[2] and str(r[2]).strip() in onet: isco2on[str(r[0])[:4]][str(r[2]).strip()] += 1
okz_name = {}
mt = json.load(open(B / 'mintrud-spravochnik-2026-10-07.json'))
okp = json.load(open(B / 'okpdtr-2025-okz-vcot-2026-10-07.json'))
for m in mt:
    for z in m['okz']: okz_name[z['code']] = z['name']
for r in okp: okz_name.setdefault(r['code_okz'], r.get('name_okz', ''))
by_name = {}
for r in okp: by_name.setdefault(norm(r['name']), (r['code_okz'], 'ОК 016-2025'))
for m in mt:
    if m['okz']: by_name.setdefault(norm(m['name']), (m['okz'][0]['code'], 'Справочник'))

def row(name, okz, how, extra=None):
    on = isco2on.get(okz, collections.Counter()).most_common()
    d = {'name': name, 'okz': okz or '', 'okz_name': okz_name.get(okz, ''), 'level': LEVEL.get((okz or ' ')[0], ''), 'how': how,
         'esco_n': len(esco_by_isco.get(okz, [])), 'onet_n': len(on), 'onet': [c for c, k in on]}
    d.update(extra or {}); return d
def by_text(name, extra=None):
    hit = by_name.get(norm(name))
    return row(name, hit[0], 'совпадение названия: ' + hit[1], extra) if hit else row(name, '', 'нет совпадения', extra)

res = {
  'mintrud': [row(m['name'], m['okz'][0]['code'] if m['okz'] else '', 'код ОКЗ из карточки', {'id': m['id']}) for m in mt],
  'okpdtr2025': [row(r['name'], r['code_okz'], 'код ОКЗ из классификатора', {'code': r['code']}) for r in okp],
  'hh_roles': [by_text(r['role']) for r in csv.DictReader(open(B / 'hh-roles.csv'))],
  'trudvsem_titles': [by_text(n, {'count': k}) for n, k in json.load(open(B / 'trudvsem-2026-10-03.json'))['vacancy_names_top']],
  'hh_titles': [by_text(n) for n in json.load(open(B / 'hh-title-counts-2026-10-04.json'))['counts']],
}
cover = {}
for k, rs in res.items():
    n = len(rs); g = sum(1 for r in rs if r['okz']); o = sum(1 for r in rs if r['onet'])
    w = sum(r.get('count', 0) for r in rs); wo = sum(r.get('count', 0) for r in rs if r['onet'])
    cover[k] = {'всего': n, 'с группой ОКЗ': g, 'доходит до O*NET': o, **({'доля вакансий, доходит до O*NET': round(wo / w, 3)} if w else {})}
gold = [(p['ru'], p['onet'], 'партнёр') for p in json.load(open(P / 'partner-professions-2026-10-07.json'))['items']]
gold += [(r['hh_role'], r['onet_code'], 'hh') for r in csv.DictReader(open(B / 'hh-roles-onet-manual.csv'))]
ev = []
for name, oc, src in gold:
    r = by_text(name)
    ev.append({'name': name, 'src': src, 'gold': oc, 'gold_title': onet.get(oc, ''), 'okz': r['okz'], 'how': r['how'], 'in_group_list': oc in r['onet'], 'group_size': r['onet_n'], 'rank_in_group': (r['onet'].index(oc) + 1) if oc in r['onet'] else None})
found = [e for e in ev if e['okz']]
metrics = {'эталон': len(ev), 'нашлась группа ОКЗ по названию': len(found), 'верная O*NET в списке группы': sum(e['in_group_list'] for e in found),
           'медиана размера списка группы': sorted(e['group_size'] for e in found)[len(found) // 2] if found else None, 'верная O*NET первой в группе': sum(1 for e in found if e['rank_in_group'] == 1)}
json.dump({'_': __doc__.split('\n')[0], 'coverage': cover, 'metrics': metrics, 'eval': ev}, open(OUT / 'summary.json', 'w'), ensure_ascii=False, indent=1)
for k, rs in res.items():
    with open(OUT / f'{k}.csv', 'w', newline='') as f:
        w = csv.writer(f); w.writerow(['name', 'count', 'how', 'okz', 'okz_name', 'level', 'esco_in_group', 'onet_in_group', 'onet_top', 'onet_top_title', 'onet_all'])
        for r in rs: w.writerow([r['name'], r.get('count', ''), r['how'], r['okz'], r['okz_name'], r['level'], r['esco_n'], r['onet_n'], (r['onet'] or [''])[0], onet.get((r['onet'] or [''])[0], ''), ' '.join(r['onet'])])
print(json.dumps(cover, ensure_ascii=False, indent=0)); print(json.dumps(metrics, ensure_ascii=False))
for e in ev:
    if not e['okz'] or not e['in_group_list']: print('  мимо:', e['name'], '|', e['how'], '| группа', e['okz'], '| эталон', e['gold_title'])

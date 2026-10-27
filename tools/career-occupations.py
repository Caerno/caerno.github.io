#!/usr/bin/env python3
"""O*NET 30.0 Interests (OI, 1–7 по RIASEC) + названия → data/career/occupations.json.
Источник: onet-30-occupations.txt и onet-30-interests.txt из папки onet в tools/sources.json (O*NET 30.0, CC BY 4.0)."""
import csv, json, math
from sources import ROOT, src
D=src('onet')
OUT=ROOT/'data'/'career'/'occupations.json'
NAMES={'Realistic':'R','Investigative':'I','Artistic':'A','Social':'S','Enterprising':'E','Conventional':'C'}
titles={}
with open(D/'onet-30-occupations.txt', newline='') as f:
    for r in csv.DictReader(f, delimiter='\t'): titles[r['O*NET-SOC Code']]=r['Title']
occ={}
with open(D/'onet-30-interests.txt', newline='') as f:
    for r in csv.DictReader(f, delimiter='\t'):
        if r['Scale ID']=='OI' and r['Element Name'] in NAMES:
            occ.setdefault(r['O*NET-SOC Code'],{})[NAMES[r['Element Name']]]=float(r['Data Value'])
rows=[{'code':c,'title':titles.get(c,c),'v':[o[s] for s in 'RIASEC']} for c,o in sorted(occ.items()) if len(o)==6]
stats={}
for i,s in enumerate('RIASEC'):
    xs=[r['v'][i] for r in rows]; m=sum(xs)/len(xs); sd=math.sqrt(sum((x-m)**2 for x in xs)/(len(xs)-1))
    stats[s]={'mean':round(m,3),'sd':round(sd,3)}
OUT.write_text(json.dumps({'_':'O*NET 30.0 Interests, OI scale 1–7, order R I A S E C; CC BY 4.0','n':len(rows),'stats':stats,'occupations':rows},ensure_ascii=False,indent=0))
print(len(rows), stats)

#!/usr/bin/env python3
"""Калибровка банка RIASEC (48 пунктов, public domain, Open Psychometrics 2015–2018)
под graded response model (GRM) классическим способом, без MCMC:
  a  = r / sqrt(1 - r^2), r — корреляция пункта с суммой остальных пунктов шкалы (probit-единицы)
  b_k = -Phi^-1(P(y >= k+1)) * sqrt(1 + a^2) / a  — маргинальные пороги при theta ~ N(0,1)
Грубая калибровка, так и помечена в README. Вход: папка openpsychometrics из tools/sources.json (data.csv, codebook.txt).
Выход: data/career/items.json (пункты + параметры + нормы шкал).
"""
import csv, json, math, sys
from sources import ROOT, src

SRC = src('openpsychometrics')
OUT = ROOT / 'data' / 'career' / 'items.json'
SCALES = ['R', 'I', 'A', 'S', 'E', 'C']

def inv_norm(p):  # Acklam
    a=[-3.969683028665376e+01,2.209460984245205e+02,-2.759285104469687e+02,1.383577518672690e+02,-3.066479806614716e+01,2.506628277459239e+00]
    b=[-5.447609879822406e+01,1.615858368580409e+02,-1.556989798598866e+02,6.680131188771972e+01,-1.328068155288572e+01]
    c=[-7.784894002430293e-03,-3.223964580411365e-01,-2.400758277161838e+00,-2.549732539343734e+00,4.374664141464968e+00,2.938163982698783e+00]
    d=[7.784695709041462e-03,3.224671290700398e-01,2.445134137142996e+00,3.754408661907416e+00]
    pl=0.02425
    if p<pl:
        q=math.sqrt(-2*math.log(p)); return (((((c[0]*q+c[1])*q+c[2])*q+c[3])*q+c[4])*q+c[5])/((((d[0]*q+d[1])*q+d[2])*q+d[3])*q+1)
    if p>1-pl:
        q=math.sqrt(-2*math.log(1-p)); return -(((((c[0]*q+c[1])*q+c[2])*q+c[3])*q+c[4])*q+c[5])/((((d[0]*q+d[1])*q+d[2])*q+d[3])*q+1)
    q=p-0.5; r=q*q
    return (((((a[0]*r+a[1])*r+a[2])*r+a[3])*r+a[4])*r+a[5])*q/(((((b[0]*r+b[1])*r+b[2])*r+b[3])*r+b[4])*r+1)

items = {}
for line in (SRC/'codebook.txt').read_text().splitlines():
    p = line.split('\t')
    if len(p)==2 and p[0][0] in SCALES and p[0][1:].isdigit() and len(p[0])==2:
        items[p[0]] = p[1].strip()
ids = [f'{s}{i}' for s in SCALES for i in range(1,9)]
assert all(i in items for i in ids), 'codebook incomplete'

rows=[]; dropped={'range':0,'fakewords':0}
with open(SRC/'data.csv', newline='') as f:
    rd = csv.DictReader(f, delimiter='\t')
    for r in rd:
        try:
            v=[int(r[i]) for i in ids]
        except ValueError:
            dropped['range']+=1; continue
        if any(x<1 or x>5 for x in v): dropped['range']+=1; continue
        if any(r.get(k)=='1' for k in ('VCL6','VCL9','VCL12')): dropped['fakewords']+=1; continue
        rows.append(v)
n=len(rows)
print('kept', n, 'dropped', dropped, file=sys.stderr)

def mean(xs): return sum(xs)/len(xs)
def corr(x,y):
    mx,my=mean(x),mean(y); sx=sy=sxy=0.0
    for a,b in zip(x,y):
        da,db=a-mx,b-my; sx+=da*da; sy+=db*db; sxy+=da*db
    return sxy/math.sqrt(sx*sy)

out_items=[]; norms={}
for si,s in enumerate(SCALES):
    cols=[[r[si*8+j] for r in rows] for j in range(8)]
    score=[mean([c[k] for c in cols]) for k in range(n)]
    m=mean(score); sd=math.sqrt(sum((x-m)**2 for x in score)/(n-1))
    norms[s]={'mean':round(m,4),'sd':round(sd,4)}
    for j in range(8):
        col=cols[j]
        rest=[(score[k]*8-col[k])/7 for k in range(n)]
        r=corr(col,rest)
        a=r/math.sqrt(1-r*r)
        b=[]
        for k in range(2,6):
            p=sum(1 for x in col if x>=k)/n
            p=min(max(p,1e-4),1-1e-4)
            b.append(round(-inv_norm(p)*math.sqrt(1+a*a)/a,3))
        out_items.append({'id':f'{s}{j+1}','scale':s,'en':items[f'{s}{j+1}'],'r':round(r,3),'a':round(a,3),'b':b})

OUT.write_text(json.dumps({
  '_':'RIASEC 48 items, public domain (Liao, Armstrong & Rounds 2008 via openpsychometrics.org). GRM params: a in probit units (multiply by 1.7 for logistic), b = 4 category thresholds. Coarse classical calibration, see tools/career-calibrate.py.',
  'source':'openpsychometrics.org/_rawdata/RIASEC_data12Dec2018.zip','n':n,'dropped':dropped,
  'scales':SCALES,'norms':norms,'items':out_items}, ensure_ascii=False, indent=1))
print(OUT, file=sys.stderr)

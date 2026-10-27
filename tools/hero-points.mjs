/* hero-points.mjs — точки для символьного поля на главной.
   Два источника, оба из настоящих данных репозитория:
     cloud  — 923 профессии O*NET в пространстве интересов, первые две главные компоненты;
     graph  — пять кейсов и методы, которые у них общие (тезис сайта).
   node tools/hero-points.mjs > data/derived/hero-points.json */
import fs from 'node:fs';
import YAML from 'yaml';

const round = (x, n = 3) => Math.round(x * 10 ** n) / 10 ** n;

/* --- 1. Облако профессий: стандартизация + две главные компоненты --- */
function cloud() {
  const src = JSON.parse(fs.readFileSync('data/career/occupations.json', 'utf8'));
  const keys = ['R', 'I', 'A', 'S', 'E', 'C'];
  const z = src.occupations.map(o => o.v.map((v, i) => (v - src.stats[keys[i]].mean) / src.stats[keys[i]].sd));

  const cov = Array.from({ length: 6 }, () => new Array(6).fill(0));
  for (const row of z) for (let i = 0; i < 6; i++) for (let j = 0; j < 6; j++) cov[i][j] += row[i] * row[j] / z.length;

  const mul = (m, v) => m.map(r => r.reduce((s, x, i) => s + x * v[i], 0));
  const norm = v => { const n = Math.hypot(...v); return v.map(x => x / n); };
  function power(m) {
    let v = norm([1, 0.7, 0.3, -0.4, 0.2, -0.6]);
    for (let k = 0; k < 400; k++) v = norm(mul(m, v));
    const lam = mul(m, v).reduce((s, x, i) => s + x * v[i], 0);
    return { v, lam };
  }
  const p1 = power(cov);
  const deflated = cov.map((r, i) => r.map((x, j) => x - p1.lam * p1.v[i] * p1.v[j]));
  const p2 = power(deflated);

  const dot = (a, b) => a.reduce((s, x, i) => s + x * b[i], 0);
  const pts = z.map((row, i) => ({ x: dot(row, p1.v), y: dot(row, p2.v), t: src.occupations[i].title }));
  const sx = Math.max(...pts.map(p => Math.abs(p.x))), sy = Math.max(...pts.map(p => Math.abs(p.y)));

  /* акцент — его собственная точка. theta в candidates.json уже в тех же единицах,
     что и z-оценки профессий: career.js (строки 72–78) сравнивает их напрямую,
     поэтому здесь повторно не стандартизуем. */
  let me = null, meCoarse = false;
  try {
    const c = JSON.parse(fs.readFileSync('data/career/candidates.json', 'utf8'));
    const p = (c.people || []).find(x => x.id === 'dk');
    if (p && p.theta) {
      const th = keys.map(k => p.theta[k]);
      me = { x: dot(th, p1.v) / sx, y: dot(th, p2.v) / sy };
      meCoarse = /coarse/i.test(p.source || '') || p.coarse === true;
    }
  } catch { /* нет позиции — акцента не будет */ }

  return {
    id: 'cloud',
    n: pts.length,
    caption: { en: `${pts.length} occupations, O*NET interest space`, ru: `${pts.length} профессии O*NET в пространстве интересов` },
    source: 'data/career/occupations.json · O*NET 30.0 Interests, CC BY 4.0',
    axes: { pc1: p1.v.map(v => round(v)), pc2: p2.v.map(v => round(v)), share: [round(p1.lam / 6), round(p2.lam / 6)] },
    me: me ? [round(me.x), round(me.y)] : null,
    meCoarse,
    points: pts.map(p => [round(p.x / sx), round(p.y / sy), 1])
  };
}

/* --- 2. Граф кейсов и методов --- */
function graph() {
  const files = fs.readdirSync('data/cases').filter(f => f.endsWith('.yaml'));
  const cases = files.map(f => YAML.parse(fs.readFileSync('data/cases/' + f, 'utf8')));
  const methods = [...new Set(cases.flatMap(c => c.methods || []))].sort();

  const mpos = new Map(methods.map((m, i) => {
    const a = (i / methods.length) * Math.PI * 2 - Math.PI / 2;
    return [m, { x: Math.cos(a) * 0.86, y: Math.sin(a) * 0.62 }];
  }));
  const cpos = cases.map(c => {
    const ms = (c.methods || []).map(m => mpos.get(m));
    return { slug: c.slug, domain: c.domain, x: ms.reduce((s, p) => s + p.x, 0) / ms.length * 0.52, y: ms.reduce((s, p) => s + p.y, 0) / ms.length * 0.52 };
  });
  for (let it = 0; it < 220; it++) {          /* расталкивание, чтобы кейсы не слипались */
    for (const a of cpos) for (const b of cpos) {
      if (a === b) continue;
      const dx = a.x - b.x, dy = a.y - b.y, d = Math.hypot(dx, dy) || 1e-3;
      if (d < 0.46) { a.x += dx / d * 0.004; a.y += dy / d * 0.004; }
    }
  }

  const pts = [];
  for (const c of cases) for (const m of c.methods || []) {
    const A = cpos.find(p => p.slug === c.slug), B = mpos.get(m);
    const steps = 30;
    for (let i = 1; i < steps; i++) {         /* ребро — пунктир из точек */
      const t = i / steps;
      pts.push([round(A.x + (B.x - A.x) * t), round(A.y + (B.y - A.y) * t), 0.42]);
    }
  }
  /* подписи узлов в обеих версиях: русская берётся из i18n, не сочиняется здесь */
  let RU = {};
  try { RU = YAML.parse(fs.readFileSync('data/i18n/ru.yaml', 'utf8')); } catch { /* нет перевода — останутся английские */ }
  const ru = (k, fb) => (RU[k] != null && RU[k] !== '' ? RU[k] : fb);
  const nodes = [
    ...cpos.map(c => ({ x: round(c.x), y: round(c.y), kind: 'case', label: c.domain, labelRu: ru('case.' + c.slug + '.domain', c.domain), slug: c.slug })),
    ...methods.map(m => ({ x: round(mpos.get(m).x), y: round(mpos.get(m).y), kind: 'method', label: m.replace(/-/g, ' '), labelRu: ru('method.' + m, m.replace(/-/g, ' ')) }))
  ];
  for (const n of nodes) for (let k = 0; k < (n.kind === 'case' ? 26 : 10); k++) {
    const a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * (n.kind === 'case' ? 0.075 : 0.038);
    pts.push([round(n.x + Math.cos(a) * r), round(n.y + Math.sin(a) * r * 0.72), n.kind === 'case' ? 1.6 : 1]);
  }

  return {
    id: 'graph',
    n: cases.length,
    caption: { en: `${cases.length} domains, ${methods.length} shared methods`, ru: `${cases.length} доменов, ${methods.length} общих методов` },
    source: 'data/cases/*.json · поле methods',
    nodes, points: pts
  };
}

const out = { _: 'Сгенерировано tools/hero-points.mjs, руками не править', built: new Date().toISOString().slice(0, 10), sets: [cloud(), graph()] };
process.stdout.write(JSON.stringify(out));

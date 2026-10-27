// Синтетические люди против модели с ограничениями.
// Человек: пол, возраст, θ из совместного прайора, ответы на все ограничения — из априорных таблиц (согласованы с уровнем образования).
// Плечи: A — единый выбор вопроса (интересы + ограничения), выдача по U; B — как сейчас на странице: пункты по дисперсии, выдача по интересам.
// Ожидания: пол/возраст в первой десятке; дальтонизм — только при профессиях, которые он закрывает, в топ-30;
// школьнику ни одного деликатного вопроса; топ-10 A ближе к истинному, чем B.
//   node tools/career-sim.mjs [людей=24] [вопросов=45]
import { readFile } from 'node:fs/promises';
import { careerItems, careerModel } from './career-items.mjs';
const J = async (p) => JSON.parse(await readFile(new URL(p, import.meta.url), 'utf8'));
const CAREER = new Function((await readFile(new URL('../src/career.js', import.meta.url), 'utf8')) + '; return CAREER;')();
const bank = await J('../data/career/items.json'), model = await J('../data/career/model.json'), tipi = await J('../data/career/tipi.json'), ddo = await J('../data/career/ddo.json');
const OCC = await J('../data/career/occupations.json'), C = await J('../data/career/constraints.json');
if (process.env.COND_NO) C.cond_factor.no = +process.env.COND_NO; if (process.env.COND_SOME) C.cond_factor.some = +process.env.COND_SOME;
const items = careerItems({ bank, model, tipi, ddo }), M = careerModel(model, bank), n = M.dims.length, occ = OCC.occupations, stats = OCC.stats;
const N = +(process.argv[2] || 24), QN = +(process.argv[3] || 45);
let seed = 7; const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
const gauss = () => Math.sqrt(-2 * Math.log(rnd() || 1e-9)) * Math.cos(2 * Math.PI * rnd());
const L = M.prior.map(() => new Array(n).fill(0));
for (let i = 0; i < n; i++) for (let j = 0; j <= i; j++) { let s = M.prior[i][j]; for (let k = 0; k < j; k++) s -= L[i][k] * L[j][k]; L[i][j] = i === j ? Math.sqrt(s) : s / L[j][j]; }
const draw = () => { const e = M.dims.map(gauss); return L.map((row) => row.reduce((s, x, k) => s + x * e[k], 0)); };
const zOf = (it, th) => (it.kind === 'pair' ? it.w.reduce((s, x, k) => s + x * th[k], 0) : th[it.dim]);
const respond = (it, th) => { const z = zOf(it, th), K = CAREER.ncat(it); let u = rnd(), c = 0; for (let y = 1; y <= K; y++) { c += CAREER.lik(it, y, z); if (u <= c) return y; } return K; };
const pick = (states, ps) => { let u = rnd() * ps.reduce((a, b) => a + b, 0); for (let i = 0; i < ps.length; i++) { u -= ps[i]; if (u <= 0) return states[i]; } return states[states.length - 1]; };
const LV = ['school', 'college', 'university', 'postgrad'];

function person() {
  const sx = pick(C.sexes, C.sexes.map((s) => C.demo.sex[s])), ag = pick(C.ages, C.ages.map((a) => C.demo.age[a]));
  const t = { sex: sx, age: ag };
  for (const [q, Q] of Object.entries(C.q)) {
    if (q === 'sex' || q === 'age' || q === 'direction') continue;
    if (!Q.prior) continue;
    let v; for (let r = 0; r < 30; r++) { v = pick(Q.states, Q.prior[sx][ag]); const need = Q.need_level && Q.need_level[v]; if (!need || q === 'level' || LV.indexOf(need) <= LV.indexOf(t.level)) break; v = Q.states[Q.states.length - 1]; }
    t[q] = v;
  }
  if (t.level !== 'school') { const Q = C.q.direction, pr = Q.prior_by_level[t.level === 'college' ? 'college' : 'university'][sx]; t.direction = pick(Q.states, pr); t.area = Q.area_of[t.direction]; }
  return { truth: t, theta: draw() };
}
const trueRank = (p) => {
  const est = {}; M.dims.forEach((d, j) => (est[d] = { mean: p.theta[j], sd: 0 }));
  return CAREER.rankU({ est, scales: M.dims.slice(0, M.riasec) }, C, occ, stats, p.truth);
};
const top = (r, k) => new Set(r.slice(0, k).map((x) => x.o.code));
const ov = (a, b) => [...a].filter((x) => b.has(x)).length / a.size;
const closesCV = new Set(Object.entries(C.occ).filter(([, o]) => o.b.b_color_vision && o.b.b_color_vision.cl).map(([c]) => c));

const R = { A10: [], B10: [], A30: [], B30: [], P10: [], P30: [], first10: [], firstDemo: [], limits: [], cvAsked: 0, cvJustified: 0, kidSensitive: 0, kids: 0, ms: [] };
for (let pi = 0; pi < N; pi++) {
  const p = person(), tr = trueRank(p), T10 = top(tr, 10), T30 = top(tr, 30);
  // A: единый выбор
  let answers = [], ans = {}, order = [];
  for (let t = 0; t < QN; t++) {
    const st = CAREER.build(M, items, answers), t0 = Date.now(), nq = CAREER.nextQuestion(st, C, occ, stats, ans); R.ms.push(Date.now() - t0);
    if (!nq) break;
    if (nq.kind === 'item') answers.push([nq.item.id, respond(nq.item, p.theta)]);
    else {
      if (nq.q === 'b_color_vision') { R.cvAsked++; const cur = top(CAREER.rankU(st, C, occ, stats, ans), 30); if ([...cur].some((c) => closesCV.has(c))) R.cvJustified++; }
      ans[nq.q] = p.truth[nq.q] ?? 'skip';
    }
    order.push(nq.kind === 'item' ? 'i' : nq.q);
  }
  const stA = CAREER.build(M, items, answers), rA = CAREER.rankU(stA, C, occ, stats, ans);
  R.A10.push(ov(T10, top(rA, 10))); R.A30.push(ov(T30, top(rA, 30)));
  const fd = order.findIndex((x) => x === 'sex' || x === 'age'); R.firstDemo.push(fd < 0 ? 99 : fd + 1);
  const lim = order.filter((x) => x !== 'i'); R.limits.push(lim.length);
  if (p.truth.age === '14-17') { R.kids++; R.kidSensitive += lim.filter((q) => C.q[q] && C.q[q].sensitive).length; }
  // B: как сейчас — пункты по дисперсии, выдача только по интересам
  let ansB = [];
  for (let t = 0; t < QN; t++) { const st = CAREER.build(M, items, ansB), it = CAREER.nextItem(st); if (!it) break; ansB.push([it.id, respond(it, p.theta)]); }
  const stB = CAREER.build(M, items, ansB), rB = CAREER.rankOcc(stB, occ, stats, 30).map((x) => ({ o: x.o }));
  R.B10.push(ov(T10, top(rB, 10))); R.B30.push(ov(T30, top(rB, 30)));
  // B′: те же вопросы, что B, но выдача по U с ограничениями по приорам (ничего не спросили)
  const rP = CAREER.rankU(stB, C, occ, stats, {}); R.P10.push(ov(T10, top(rP, 10))); R.P30.push(ov(T30, top(rP, 30)));
  R.first10.push(order.slice(0, 10).filter((x) => x !== 'i').length);
  console.log(`#${pi + 1} ${p.truth.sex} ${p.truth.age} lvl=${p.truth.level} h=${p.truth.horizon} | A@10 ${R.A10.at(-1).toFixed(1)} B@10 ${R.B10.at(-1).toFixed(1)} | ограничений ${lim.length}: ${lim.slice(0, 12).join(' ')}`);
}
const mean = (a) => a.reduce((s, x) => s + x, 0) / a.length;
console.log('\n== итог', N, 'человек,', QN, 'вопросов');
console.log('совпадение с истинным топ-10:  A', mean(R.A10).toFixed(3), " B′", mean(R.P10).toFixed(3), ' B', mean(R.B10).toFixed(3));
console.log('совпадение с истинным топ-30:  A', mean(R.A30).toFixed(3), " B′", mean(R.P30).toFixed(3), ' B', mean(R.B30).toFixed(3));
console.log('ограничений в первых 10 вопросах (среднее):', mean(R.first10).toFixed(1));
console.log('пол или возраст впервые на шаге (медиана):', [...R.firstDemo].sort((a, b) => a - b)[Math.floor(N / 2)], ' в первой десятке:', R.firstDemo.filter((x) => x <= 10).length, 'из', N);
console.log('ограничений задано (среднее):', mean(R.limits).toFixed(1));
console.log('дальтонизм спрошен:', R.cvAsked, ', из них при «закрываемых» в топ-30:', R.cvJustified);
console.log('школьников:', R.kids, ', деликатных вопросов им:', R.kidSensitive);
console.log('выбор вопроса, мс: медиана', [...R.ms].sort((a, b) => a - b)[Math.floor(R.ms.length / 2)], ' максимум', Math.max(...R.ms));

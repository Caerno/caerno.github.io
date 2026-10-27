// Проверка движка без браузера.
// 1) EP против точной сетки: единичный прайор, только RIASEC — оценки должны совпасть с одномерным байесом.
// 2) Восстановление theta на симуляции: персоны из совместного прайора отвечают по той же модели.
//    Плечи: (а) независимый прайор, только RIASEC (= v1); (б) совместный прайор, только RIASEC; (в) совместный, все три инструмента.
//    Для ДДО выигрыш получен «по построению»: симулятор отвечает по тому же некалиброванному кроссволку.
import { readFile } from 'node:fs/promises';
import { careerItems, careerModel } from './career-items.mjs';
const J = async (p) => JSON.parse(await readFile(new URL(p, import.meta.url), 'utf8'));
const CAREER = new Function((await readFile(new URL('../src/career.js', import.meta.url), 'utf8')) + '; return CAREER;')();
const bank = await J('../data/career/items.json'), model = await J('../data/career/model.json'), tipi = await J('../data/career/tipi.json'), ddo = await J('../data/career/ddo.json');
const items = careerItems({ bank, model, tipi, ddo }), M = careerModel(model, bank), n = M.dims.length;
const riasecOnly = items.filter((i) => i.src === 'riasec');
const I = M.dims.map((_, a) => M.dims.map((_, b) => (a === b ? 1 : 0)));
let seed = 11; const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
const gauss = () => Math.sqrt(-2 * Math.log(rnd() || 1e-9)) * Math.cos(2 * Math.PI * rnd());
// Холецкий прайора — чтобы тянуть коррелированные персоны
const L = M.prior.map(() => new Array(n).fill(0));
for (let i = 0; i < n; i++) for (let j = 0; j <= i; j++) { let s = M.prior[i][j]; for (let k = 0; k < j; k++) s -= L[i][k] * L[j][k]; L[i][j] = i === j ? Math.sqrt(s) : s / L[j][j]; }
const draw = () => { const e = M.dims.map(gauss); return L.map((row) => row.reduce((s, x, k) => s + x * e[k], 0)); };
const zOf = (it, th) => (it.kind === 'pair' ? it.w.reduce((s, x, k) => s + x * th[k], 0) : th[it.dim]);
const respond = (it, th) => { const z = zOf(it, th), K = CAREER.ncat(it); let u = rnd(), c = 0; for (let y = 1; y <= K; y++) { c += CAREER.lik(it, y, z); if (u <= c) return y; } return K; };

// 1) EP против точной сетки
{
  const th = draw(), ans = riasecOnly.map((it) => [it.id, respond(it, th)]);
  const st = CAREER.build({ ...M, prior: I }, riasecOnly, ans);
  let maxDm = 0, maxDs = 0;
  for (let d = 0; d < 6; d++) {
    let Z = 0, m1 = 0, m2 = 0;
    for (let z = -6; z <= 6; z += 0.01) { let p = Math.exp(-z * z / 2); for (const [id, y] of ans) { const it = riasecOnly.find((i) => i.id === id); if (it.dim === d) p *= CAREER.lik(it, y, z); } Z += p; m1 += p * z; m2 += p * z * z; }
    const mean = m1 / Z, sd = Math.sqrt(m2 / Z - mean * mean), e = st.est[M.dims[d]];
    maxDm = Math.max(maxDm, Math.abs(e.mean - mean)); maxDs = Math.max(maxDs, Math.abs(e.sd - sd));
  }
  console.log(`EP vs точная сетка (единичный прайор, 48 пунктов): max |Δmean| = ${maxDm.toFixed(3)}, max |Δsd| = ${maxDs.toFixed(3)}`);
}

// 2) Восстановление
const ARMS = [
  { name: 'а) независимо, RIASEC (v1)', model: { ...M, prior: I }, items: riasecOnly },
  { name: 'б) совместно, RIASEC', model: M, items: riasecOnly },
  { name: 'в) совместно, 3 инструмента', model: M, items },
];
const N = +(process.argv[2] || 100), AT = [12, 24, 48, 77];
const personas = Array.from({ length: N }, draw);
for (const arm of ARMS) {
  const se = {}, sd = {}, cnt = {}, src = { riasec: 0, tipi: 0, ddo: 0 };
  for (const th of personas) {
    const ans = []; let st = CAREER.build(arm.model, arm.items, ans);
    for (let k = 0; k < 77; k++) {
      const it = CAREER.nextItem(st); if (!it) break;
      ans.push([it.id, respond(it, th)]); st = CAREER.build(arm.model, arm.items, ans);
      if (k < 24) src[it.src]++;
      if (AT.includes(st.n)) { let e = 0; for (let d = 0; d < 6; d++) e += (st.mu[d] - th[d]) ** 2; se[st.n] = (se[st.n] || 0) + e / 6; sd[st.n] = (sd[st.n] || 0) + CAREER.meanSd(st); cnt[st.n] = (cnt[st.n] || 0) + 1; }
    }
  }
  console.log(arm.name + ':', AT.filter((a) => cnt[a]).map((a) => `n=${a} RMSE ${Math.sqrt(se[a] / cnt[a]).toFixed(2)} (sd ${(sd[a] / cnt[a]).toFixed(2)})`).join(' | '), '| первые 24 пункта:', JSON.stringify(src));
}

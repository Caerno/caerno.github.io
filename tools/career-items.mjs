// Единый список пунктов трёх инструментов для движка: используется и билдером, и тестами.
// lang — 'en' | 'ru'; tr(key, en) — оверлей перевода (для пунктов RIASEC), по умолчанию английский.
export function careerItems({ bank, model, tipi, ddo }, lang = 'en', tr = (k, en) => en) {
  const idx = Object.fromEntries(model.dims.map((d, i) => [d, i]));
  const n = model.dims.length;
  const riasec = bank.items.map((it) => ({ id: it.id, src: 'riasec', kind: 'grm', dim: idx[it.scale], a: it.a, b: it.b, text: tr(`career.item.${it.id}`, it.en) }));
  const tp = model.tipi.map((it) => ({ id: it.id, src: 'tipi', kind: 'grm', dim: idx[it.dim], a: it.a, b: it.b, rev: it.rev, text: tipi.items[it.id][lang] }));
  const vec = (w) => { const v = new Array(n).fill(0); for (const [k, x] of Object.entries(w)) v[idx[k]] = x; return v; };
  const dd = ddo.pairs.map((p) => { const a = vec(p.a.w), b = vec(p.b.w); return { id: p.id, src: 'ddo', kind: 'pair', kappa: ddo.kappa, w: a.map((x, i) => x - b[i]), ta: p.a[lang], tb: p.b[lang] }; });
  return [...riasec, ...tp, ...dd];
}
export const careerModel = (model, bank) => ({ dims: model.dims, prior: model.prior, riasec: bank.scales.length });

// career.js — байесов адаптивный тест: один совместный гауссов апостериор по всем скрытым шкалам
// (6 интересов RIASEC + 5 черт Big Five), в который пишут разные инструменты.
// Пункт любого инструмента — это правдоподобие по одномерной проекции z = w·theta:
//   kind 'grm'  — порядковый ответ (graded response model) по одной шкале, w = орт шкалы;
//   kind 'pair' — вынужденный выбор из пары, w = w_a − w_b, P(a) = sigmoid(kappa·z).
// Обновление — expectation propagation: у каждого ответа гауссов «сайт» (tau, nu) вдоль своего w.
// Чистые функции в CAREER.* (гоняются в node: tools/career-test.mjs), DOM — внизу.
function careerLib() {
  var D = 1.7, T = [], PHI = [], t, i;
  for (t = -6; t <= 6 + 1e-9; t += 0.1) { T.push(t); PHI.push(Math.exp(-t * t / 2)); }

  function inv(M) { // Гаусс—Жордан, матрицы до 11×11
    var n = M.length, A = [], r, c, k;
    for (r = 0; r < n; r++) { A.push(M[r].slice()); for (c = 0; c < n; c++) A[r].push(r === c ? 1 : 0); }
    for (c = 0; c < n; c++) {
      var p = c; for (r = c + 1; r < n; r++) if (Math.abs(A[r][c]) > Math.abs(A[p][c])) p = r;
      var tmp = A[c]; A[c] = A[p]; A[p] = tmp;
      var d = A[c][c]; for (k = 0; k < 2 * n; k++) A[c][k] /= d;
      for (r = 0; r < n; r++) if (r !== c) { var f = A[r][c]; if (f) for (k = 0; k < 2 * n; k++) A[r][k] -= f * A[c][k]; }
    }
    return A.map(function (row) { return row.slice(n); });
  }
  function mv(M, v) { return M.map(function (row) { var s = 0; for (var j = 0; j < v.length; j++) s += row[j] * v[j]; return s; }); }
  function dot(a, b) { var s = 0; for (var j = 0; j < a.length; j++) s += a[j] * b[j]; return s; }

  function ncat(item) { return item.kind === 'pair' || item.kind === 'occ' || item.kind === 'near' ? 2 : item.b.length + 1; }
  function pge(item, k, z) { return 1 / (1 + Math.exp(-D * item.a * (z - item.b[k - 2]))); } // P(y >= k)
  // Правдоподобие ответа y (1..K) при проекции z. Обратные пункты перекодируются здесь.
  function lik(item, y, z) {
    if (item.kind === 'pair') { var p = 1 / (1 + Math.exp(-item.kappa * z)); return y === 1 ? p : 1 - p; }
    if (item.kind === 'occ') { var q = 1 / (1 + Math.exp(-item.kappa * (z - item.b0))); return 1 - q; } // «не моё»
    if (item.kind === 'near') { var e = (z - item.b0) / item.s; return Math.exp(-e * e / 2); }       // «моё»: профиль рядом с профессией по оси
    var K = item.b.length + 1; if (item.rev) y = K + 1 - y;
    var lo = y <= 1 ? 1 : pge(item, y, z), hi = y >= K ? 0 : pge(item, y + 1, z);
    return Math.max(lo - hi, 1e-9);
  }
  function wOf(item, n) { if (item.w) return item.w; var w = []; for (var j = 0; j < n; j++) w.push(j === item.dim ? 1 : 0); return w; }
  // Моменты z ~ N(m, v), умноженного на правдоподобие ответа: вес, среднее, дисперсия.
  function tilted(item, y, m, v) {
    var sd = Math.sqrt(v), Z = 0, M1 = 0, M2 = 0, N = 0;
    for (var j = 0; j < T.length; j++) { var z = m + sd * T[j], w = PHI[j] * lik(item, y, z); N += PHI[j]; Z += w; M1 += w * z; M2 += w * z * z; }
    var mean = M1 / Z; return { p: Z / N, mean: mean, v: Math.max(M2 / Z - mean * mean, 1e-9) };
  }

  // model: { dims: [...], prior: матрица, riasec: число первых измерений-интересов }
  // Состояние целиком выводится из списка ответов [[id, y], ...].
  function build(model, items, answers, sweeps) {
    var n = model.dims.length, byId = {}, asked = {}, sites = [], k, j;
    for (k = 0; k < items.length; k++) byId[items[k].id] = items[k];
    for (k = 0; k < answers.length; k++) {
      var it = byId[answers[k][0]]; if (!it || asked[it.id]) continue;
      asked[it.id] = true; sites.push({ item: it, y: answers[k][1], w: wOf(it, n), tau: 0, nu: 0 });
    }
    var S = model.prior.map(function (r) { return r.slice(); }), eta = [], mu = [];
    for (j = 0; j < n; j++) { eta.push(0); mu.push(0); }
    for (var sw = 0; sw < (sweeps || 4); sw++) for (k = 0; k < sites.length; k++) {
      var st = sites[k], s = mv(S, st.w), v = dot(st.w, s), m = dot(st.w, mu);
      if (v < 1e-9) continue;
      var pc = 1 / v - st.tau; if (pc <= 1e-9) continue;
      var vc = 1 / pc, mc = vc * (m / v - st.nu), tl = tilted(st.item, st.y, mc, vc);
      var tau = Math.max(1 / tl.v - 1 / vc, 0), nu = tau > 0 ? tl.mean / tl.v - mc / vc : 0;
      var dt = tau - st.tau, dn = nu - st.nu; st.tau = tau; st.nu = nu;
      var g = dt / (1 + dt * v), a, b;
      for (a = 0; a < n; a++) for (b = 0; b < n; b++) S[a][b] -= g * s[a] * s[b]; // Шерман—Моррисон
      for (a = 0; a < n; a++) eta[a] += dn * st.w[a];
      mu = mv(S, eta);
    }
    var est = {};
    for (j = 0; j < n; j++) est[model.dims[j]] = { mean: mu[j], sd: Math.sqrt(Math.max(S[j][j], 0)) };
    return { model: model, items: items, asked: asked, est: est, mu: mu, S: S, n: sites.length, scales: model.dims.slice(0, model.riasec) };
  }

  // Ожидаемое снижение суммарной дисперсии шкал интересов от ответа на пункт.
  function gain(st, item) {
    var n = st.model.dims.length, w = wOf(item, n), s = mv(st.S, w), v = dot(w, s);
    if (v < 1e-6) return 0;
    var m = dot(w, st.mu), K = ncat(item), ev = 0, y, lever = 0;
    for (y = 1; y <= K; y++) { var tl = tilted(item, y, m, v); ev += tl.p * tl.v; }
    for (var j = 0; j < st.model.riasec; j++) lever += s[j] * s[j];
    return Math.max(v - ev, 0) / (v * v) * lever;
  }
  function nextItem(st) {
    var best = null, bg = 1e-5;
    for (var k = 0; k < st.items.length; k++) {
      var it = st.items[k]; if (st.asked[it.id]) continue;
      var g = gain(st, it); if (g > bg) { bg = g; best = it; }
    }
    return best;
  }
  function maxSd(st) { var m = 0; st.scales.forEach(function (s) { m = Math.max(m, st.est[s].sd); }); return m; }
  function meanSd(st) { var m = 0; st.scales.forEach(function (s) { m += st.est[s].sd; }); return m / st.scales.length; }
  function code(st) { return st.scales.slice().sort(function (a, b) { return st.est[b].mean - st.est[a].mean; }).slice(0, 3).join(''); }
  // Расстояние в z-пространстве интересов, ось взвешена уверенностью теста: 1 / (1 + sd^2).
  function distance(st, z) {
    var d = 0;
    for (var j = 0; j < st.scales.length; j++) { var e = st.est[st.scales[j]]; d += (e.mean - z[j]) * (e.mean - z[j]) / (1 + e.sd * e.sd); }
    return Math.sqrt(d);
  }
  function zOcc(o, stats, scales) { return scales.map(function (s, j) { return (o.v[j] - stats[s].mean) / stats[s].sd; }); }
  function rankOcc(st, occ, stats, top) {
    return occ.map(function (o) { return { o: o, d: distance(st, zOcc(o, stats, st.scales)) }; })
      .sort(function (a, b) { return a.d - b.d; }).slice(0, top);
  }

  // ---- Ограничения: U(o) = «хочу» × «не отталкивает» × «смогу» ----
  // C — data/career/constraints.json; ans — { вопрос: код ответа } ('skip' — спросили, не ответил).
  // Неотвеченное — априорная вероятность по (пол, возраст); сами пол и возраст — скрытые и уточняются по всем ответам.
  // Следующий вопрос любого вида — тот, чей ответ ожидаемо сильнее всего меняет верх выдачи.
  var DIPLOMA = { b_med_diploma: 1, b_pedagogy_diploma: 1, b_psychology_diploma: 1, b_law_diploma: 1, b_econ_diploma: 1, b_tech_diploma: 1,
    b_science_diploma: 1, b_academic_degree: 1, b_transport_training: 1, b_arts_training: 1, b_math_level: 1 };
  var LEVELS = ['school', 'college', 'university', 'postgrad'], REQ = { 'колледж': 'college', 'вуз': 'university', 'вуз и больше': 'postgrad' };
  var NO_DIPLOMA = { 'открытый': 1, 'курсы': 1, 'портфолио': 1, 'отбор': 1 }, CONTEXT = { sex: 1, age: 1, level: 1, area: 1, direction: 1, horizon: 1 };
  var TOPK = 30, EPS = 0.01;

  function given(ans, q) { var v = ans[q]; return v != null && v !== 'skip' ? v : null; }
  // Апостериор по 14 клеткам (пол × возраст): априорная демография × правдоподобия всех ответов с приором.
  function demoPost(C, ans) {
    var w = [], s, a, i, q;
    for (s = 0; s < C.sexes.length; s++) for (a = 0; a < C.ages.length; a++) {
      var sx = C.sexes[s], ag = C.ages[a], p = C.demo.sex[sx] * C.demo.age[ag];
      if (given(ans, 'sex') != null && given(ans, 'sex') !== sx) p = 0;
      if (given(ans, 'age') != null && given(ans, 'age') !== ag) p = 0;
      for (q in ans) {
        var Q = C.q[q], v = given(ans, q); if (!Q || !Q.prior || v == null) continue;
        i = Q.states.indexOf(v); if (i >= 0) p *= Math.max(Q.prior[sx][ag][i], 1e-6);
      }
      w.push(p);
    }
    var t = 0; for (i = 0; i < w.length; i++) t += w[i];
    return w.map(function (x) { return t > 0 ? x / t : 1 / w.length; });
  }
  // Распределение ответа на вопрос q как { состояние: p } — при данных ответах ans и апостериоре post.
  function marg(C, ans, post, q) {
    var Q = C.q[q], out = {}, v = given(ans, q), i, s, a, k = 0;
    if (q === 'b_age') { // производное от возраста
      var A = marg(C, ans, post, 'age');
      return { under_18: A['14-17'], '18_20': A['18-24'] * 3 / 7, '21_35': A['18-24'] * 4 / 7 + A['25-34'],
        over_35: 1 - A['14-17'] - A['18-24'] - A['25-34'] };
    }
    var dv = given(ans, 'direction'), av = given(ans, 'area'), lvd = given(ans, 'level'), hi = lvd === 'university' || lvd === 'postgrad';
    if (v == null && q === 'area' && dv != null) v = C.q.direction.area_of[dv];                       // область — из направления
    if (v == null && Q.from_direction && dv != null && hi) v = Q.from_direction[dv] || Q.from_direction_default;   // диплом — из направления
    else if (v == null && Q.from_area && av != null && hi && Q.from_area[av]) v = Q.from_area[av];         // … или из области, где однозначно
    if (v != null) { Q.states.forEach(function (st) { out[st] = st === v ? 1 : 0; }); return out; }
    Q.states.forEach(function (st) { out[st] = 0; });
    if (q === 'sex' || q === 'age') {
      for (s = 0; s < C.sexes.length; s++) for (a = 0; a < C.ages.length; a++, k++) out[q === 'sex' ? C.sexes[s] : C.ages[a]] += post[k];
      return out;
    }
    if (q === 'area') { // доля областей — сумма направлений
      var Dm = marg(C, ans, post, 'direction'), AO = C.q.direction.area_of;
      for (var dd in Dm) out[AO[dd]] += Dm[dd];
      return out;
    }
    if (q === 'direction') { // приор зависит от уровня: колледж — выпуск СПО, вуз и выше — выпуск вузов; ответ об области сужает
      var L = marg(C, ans, post, 'level'), S = marg(C, ans, post, 'sex'), hl = L.university + L.postgrad, co = L.college, tot = hl + co, t2 = 0;
      if (tot <= 0) return out;
      for (i = 0; i < Q.states.length; i++) for (s = 0; s < C.sexes.length; s++) {
        var sx = C.sexes[s]; out[Q.states[i]] += S[sx] * (co * Q.prior_by_level.college[sx][i] + hl * Q.prior_by_level.university[sx][i]) / tot;
      }
      if (av != null) { for (var d2 in out) { if (Q.area_of[d2] !== av) out[d2] = 0; t2 += out[d2]; } if (t2 > 0) for (d2 in out) out[d2] /= t2; }
      return out;
    }
    for (s = 0; s < C.sexes.length; s++) for (a = 0; a < C.ages.length; a++, k++) {
      var row = Q.prior[C.sexes[s]][C.ages[a]]; for (i = 0; i < Q.states.length; i++) out[Q.states[i]] += post[k] * row[i];
    }
    var lv = given(ans, 'level');
    if (Q.need_level && lv != null) { // согласовать с ответом об образовании: состояния выше уровня человека — 0
      var t = 0; for (var st in out) { var need = Q.need_level[st]; if (need && LEVELS.indexOf(need) > LEVELS.indexOf(lv)) out[st] = 0; t += out[st]; }
      if (t > 0) for (st in out) out[st] /= t;
    }
    return out;
  }
  function memoMarg(C, ans) { var post = demoPost(C, ans), cache = {}; return function (q) { return cache[q] || (cache[q] = marg(C, ans, post, q)); }; }
  function E(m, tab) { var s = 0; for (var k in m) s += m[k] * (tab[k] || 0); return s; }
  // Множитель «не отталкивает» × «смогу» для профессии o (запись C.occ[code]).
  function occFactor(C, o, M) {
    var K = C.consts, f = 1, D = 0, other = 0, agePath = 0, b, e, m, k;
    for (b in o.b) {
      e = o.b[b]; m = M(b);
      if (b === 'b_age') { // школьнику «младше 18 закрывает» = «подождать до 18»
        var minor = m.under_18 || 0, wait = (e.p && e.p.under_18) || 2.5;
        if (e.cl) for (k = 0; k < e.cl.length; k++) if (e.cl[k] !== 'under_18') f *= 1 - (m[e.cl[k]] || 0);
        agePath += minor * wait; continue;
      }
      if (e.cl) { var pc = 0; for (k = 0; k < e.cl.length; k++) pc += m[e.cl[k]] || 0; f *= 1 - pc; }
      if (e.lo) { var lo = 0; for (k in m) lo += m[k] * (e.lo[k] ? 1 / e.lo[k] : 1); f *= lo; }
      if (e.p && b !== 'b_management_experience') { if (DIPLOMA[b] && o.dip) D += E(m, e.p); else if (!DIPLOMA[b]) other += E(m, e.p); }
    }
    for (k = 0; k < o.c.length; k++) f *= E(M(o.c[k]), C.cond_factor);
    var Lv = M('level'), Dr = null, pm = 0;
    if (o.dirs.length) { Dr = M('direction'); for (k = 0; k < o.dirs.length; k++) pm += Dr[o.dirs[k]] || 0; }
    if (!o.dip && REQ[o.lvl]) { // зачёт уровня и направления (профессии без барьера-диплома)
      var need = REQ[o.lvl], ni = LEVELS.indexOf(need);
      for (k = 0; k < LEVELS.length; k++) {
        var l = LEVELS[k], p = Lv[l] || 0; if (!p) continue;
        D += p * (k >= ni ? (o.dirs.length ? (1 - pm) * K.RETRAIN[need] : 0) : K.UPGRADE[l + '->' + need]);
      }
    }
    var Ks = 0;
    if (NO_DIPLOMA[o.ep]) Ks = Math.max(0, o.T0 - o.kl * o.k * (pm * K.P_SKILL_MATCH + (1 - pm) * K.P_SKILL));
    var X = 0;
    if (o.ep === 'лестница') { var mm = M('b_management_experience'); X = o.T0 * E(mm, K.LADDER_MULT); }
    var Lyr = Math.max(D, Ks) + other + X + agePath, H = M('horizon'), Qh = C.q.horizon, minorP = M('age')['14-17'] || 0, can = 0;
    for (k = 0; k < Qh.states.length; k++) {
      var h = Qh.years[k];
      can += (H[Qh.states[k]] || 0) * ((1 - minorP) * Math.exp(-K.LAMBDA * Math.max(0, Lyr - h)) + minorP * Math.exp(-K.LAMBDA * Math.max(0, Lyr - h - K.MINOR_BONUS)));
    }
    return { f: f * can, L: Lyr };
  }
  // Отметка профессии как ответы. «Моё» — профиль рядом с точкой профессии: по каждой оси интересов гауссов ответ
  // с центром в z профессии и разбросом MINE_SD (тянет профиль к ней по всем шести осям сразу, тем сильнее, чем меньше
  // профиль уже известен). «Не моё» — проекция профиля на направление к профессии скорее меньше половины пути.
  // MINE_SD, kappa и порог — оценки, не калиброваны.
  var MINE_SD = 0.5;
  function occItems(model, o, stats, v) {
    var sc = model.dims.slice(0, model.riasec), z = zOcc(o, stats, sc), n = model.dims.length, out = [], j, k;
    if (v === 'yes') {
      for (j = 0; j < z.length; j++) { var w = []; for (k = 0; k < n; k++) w.push(k === j ? 1 : 0); out.push({ id: 'occ:' + o.code + ':' + sc[j], kind: 'near', w: w, b0: z[j], s: MINE_SD }); }
      return out;
    }
    var len = Math.sqrt(dot(z, z)) || 1, u = [];
    for (j = 0; j < n; j++) u.push(j < z.length ? z[j] / len : 0);
    return [{ id: 'occ:' + o.code, kind: 'occ', w: u, b0: len / 2, kappa: 1.5 }];
  }
  // Пункты и ответы вместе с отметками профессий: { items, answers, extra } (extra — сколько ответов добавили отметки).
  function withPicks(model, items, answers, picks, occBy, stats) {
    var its = items, ans = answers, extra = 0;
    for (var c in picks) {
      if (its === items) { its = items.slice(); ans = answers.slice(); }
      occItems(model, occBy[c], stats, picks[c]).forEach(function (it) { its.push(it); ans.push([it.id, 1]); extra++; });
    }
    return { items: its, answers: ans, extra: extra };
  }
  function likeOf(st, o, stats) { var d = distance(st, o._z || (o._z = zOcc(o, stats, st.scales))); return Math.exp(-d * d / 2); }
  // Полная выдача: [{ o, u, like, f, L }] по убыванию u.
  function rankU(st, C, occ, stats, ans) {
    var M = memoMarg(C, ans);
    return occ.map(function (o) {
      var co = C.occ[o.code], like = likeOf(st, o, stats), r = co ? occFactor(C, co, M) : { f: 1, L: 0 };
      return { o: o, u: like * r.f, like: like, f: r.f, L: r.L };
    }).sort(function (a, b) { return b.u - a.u; });
  }
  // «Хочу» всех профессий разом в out: то же, что likeOf, по матрице z профессий (кэш на массиве occ).
  function likesInto(st, occ, stats, out) {
    var Z = occ._Z, n = occ.length, k = st.scales.length, m = [], den = [], i, j, d, e;
    if (!Z) { Z = occ._Z = new Float64Array(n * k); for (i = 0; i < n; i++) { var z = occ[i]._z || (occ[i]._z = zOcc(occ[i], stats, st.scales)); for (j = 0; j < k; j++) Z[i * k + j] = z[j]; } }
    for (j = 0; j < k; j++) { e = st.est[st.scales[j]]; m.push(e.mean); den.push(1 + e.sd * e.sd); }
    for (i = 0; i < n; i++) {
      d = 0; for (j = 0; j < k; j++) { e = m[j] - Z[i * k + j]; d += e * e / den[j]; }
      d = Math.sqrt(d); out[i] = Math.exp(-d * d / 2);
    }
    return out;
  }
  // Верхние TOPK по u (при равных — меньший индекс): вставка в короткий отсортированный список.
  function topSet(us, codes) {
    var idx = [], k, j, i, n = us.length, s = {};
    for (i = 0; i < n; i++) {
      if (idx.length === TOPK && us[i] <= us[idx[TOPK - 1]]) continue;
      for (j = idx.length < TOPK ? idx.length : TOPK - 1; j > 0 && us[idx[j - 1]] < us[i]; j--) idx[j] = idx[j - 1];
      idx[j] = i;
    }
    for (k = 0; k < idx.length; k++) s[codes[idx[k]]] = 1;
    return s;
  }
  // То же множество, но u считается лениво: профессии идут по убыванию like, а u = like × f, f ≤ 1, поэтому как только
  // like следующей меньше TOPK-го найденного u, дальше в верх никто не попадёт.
  function topLazy(order, likes, uAt, codes) {
    var idx = [], val = [], k, j, i, u, s = {};
    for (k = 0; k < order.length; k++) {
      i = order[k];
      if (idx.length === TOPK && likes[i] < val[TOPK - 1]) break;
      u = uAt(i);
      if (idx.length === TOPK && !(u > val[TOPK - 1] || (u === val[TOPK - 1] && i < idx[TOPK - 1]))) continue;
      for (j = idx.length < TOPK ? idx.length : TOPK - 1; j > 0 && (val[j - 1] < u || (val[j - 1] === u && idx[j - 1] > i)); j--) { idx[j] = idx[j - 1]; val[j] = val[j - 1]; }
      idx[j] = i; val[j] = u;
    }
    for (k = 0; k < idx.length; k++) s[codes[idx[k]]] = 1;
    return s;
  }
  // f ≤ 1 у любой профессии: множители «закрывает», «снижает», условия и срок пути не больше единицы. Иначе ленивый обход неточен.
  function fBounded(C) {
    if (C._fle1 != null) return C._fle1;
    var ok = true, c, b, k;
    for (k in C.cond_factor) if (C.cond_factor[k] > 1) ok = false;
    for (c in C.occ) for (b in C.occ[c].b) { var lo = C.occ[c].b[b].lo; if (lo) for (k in lo) if (lo[k] < 1) ok = false; }
    return (C._fle1 = ok);
  }
  function overlap(a, b) { var n = 0; for (var k in a) if (b[k]) n++; return n / TOPK; }
  // Можно ли сейчас задавать вопрос q: направление — только после уровня; деликатное и «с N лет» — только когда возраст известен.
  function eligible(C, ans, q) {
    var Q = C.q[q]; if (q === 'b_age' || ans[q] != null) return false;
    var lv = given(ans, 'level'), av = given(ans, 'area');
    if (q === 'area') return lv != null && lv !== 'school' && ans.direction == null;
    if (q === 'direction') return av != null && options(C, ans, q).length > 1;   // уточнение — только внутри названной области
    if (Q.from_direction && given(ans, 'direction') != null) return false;   // уже известно из направления
    if (Q.from_area && av != null && Q.from_area[av]) return false;           // … или из области
    if (Q.kind === 'context') return true;
    var ag = given(ans, 'age'), lo = ag ? parseInt(ag, 10) : null;
    if (Q.sensitive && (lo == null || lo < 18)) return false;
    if (Q.min_age && Q.min_age > 14 && (lo == null || lo < Q.min_age)) return false;
    return true;
  }
  // Какие ответы показывать (индексы состояний): уточнение направления — только внутри названной области.
  function options(C, ans, q) {
    var Q = C.q[q], av = given(ans, 'area'), out = [], ord = Q.order || Q.states.map(function (_, i) { return i; });
    ord.forEach(function (i) { if (q !== 'direction' || av == null || Q.area_of[Q.states[i]] === av) out.push(i); });   // порядок показа — Q.order
    return out;
  }
  // Приближённое обновление апостериора θ ответом y на пункт item (один шаг EP вдоль w) — для оценки ценности пункта.
  function peek(st, item, y) {
    var n = st.model.dims.length, w = wOf(item, n), s = mv(st.S, w), v = dot(w, s), m = dot(w, st.mu), tl = tilted(item, y, m, v), est = {}, j;
    var gm = (tl.mean - m) / v, gv = (v - tl.v) / (v * v);
    for (j = 0; j < st.scales.length; j++) {
      var sd2 = st.S[j][j] - gv * s[j] * s[j]; est[st.model.dims[j]] = { mean: st.mu[j] + gm * s[j], sd: Math.sqrt(Math.max(sd2, 0)) };
    }
    return { p: tl.p, st: { est: est, scales: st.scales } };
  }
  // Какие профессии (индексы в occ) зависят от вопроса q — для быстрого пересчёта; mark[q][i] = 1, если зависит.
  function byQuestion(C, codes) {
    if (C._byQ && C._byQn === codes.length) return C._byQ;
    var idx = {}; codes.forEach(function (c, i) { var o = C.occ[c]; if (!o) return;
      for (var b in o.b) (idx[b] = idx[b] || []).push(i); o.c.forEach(function (q) { (idx[q] = idx[q] || []).push(i); }); });
    if (idx.b_age) (idx.age = idx.age || []);
    var mark = {}; for (var q in idx) { mark[q] = new Uint8Array(codes.length); idx[q].forEach(function (i) { mark[q][i] = 1; }); }
    C._byQ = idx; C._byQm = mark; C._byQn = codes.length; return idx;
  }
  // Следующий вопрос: пункт интересов или ограничение — тот, чей ответ ожидаемо сильнее меняет топ-30. null — менять нечего.
  function nextQuestion(st, C, occ, stats, ans, opts) {
    opts = opts || {};
    var n = occ.length, codes = occ.map(function (o) { return o.code; }), M = memoMarg(C, ans), i, k;
    var likes = likesInto(st, occ, stats, new Float64Array(n)), fs = new Float64Array(n), us = new Float64Array(n), u2 = new Float64Array(n);
    for (i = 0; i < n; i++) { var co = C.occ[codes[i]]; fs[i] = co ? occFactor(C, co, M).f : 1; us[i] = likes[i] * fs[i]; }
    var base = topSet(us, codes), best = null, bv = opts.eps != null ? opts.eps : EPS;
    if (!opts.noItems) for (k = 0; k < st.items.length; k++) {
      var it = st.items[k]; if (st.asked[it.id]) continue;
      var val = 0, K = ncat(it);
      for (var y = 1; y <= K; y++) {
        var pk = peek(st, it, y); if (pk.p < 1e-3) continue;
        likesInto(pk.st, occ, stats, u2); for (i = 0; i < n; i++) u2[i] *= fs[i];
        val += pk.p * (1 - overlap(base, topSet(u2, codes)));
      }
      if (val > bv) { bv = val; best = { kind: 'item', item: it, value: val }; }
    }
    if (!opts.noLimits) {
      byQuestion(C, codes);
      var lazy = fBounded(C), order = [];
      for (i = 0; i < n; i++) order.push(i);
      order.sort(function (a, b) { return likes[b] - likes[a] || a - b; });
      for (var q in C.q) {
        if (!eligible(C, ans, q)) continue;
        // ответ на барьер или условие меняет только профессии, где он есть (сдвиг пола/возраста от него — второго порядка); контекст — все
        var mq = M(q), v2 = 0, mark = CONTEXT[q] ? null : C._byQm[q];
        if (!CONTEXT[q] && !mark) continue;
        for (var stt in mq) {
          var pq = mq[stt]; if (pq < 1e-3) continue;
          var a2 = {}; for (var x in ans) a2[x] = ans[x]; a2[q] = stt;
          var uAt = (function (M2) { return function (i) {
            if (mark && !mark[i]) return us[i];
            var co2 = C.occ[codes[i]]; return likes[i] * (co2 ? occFactor(C, co2, M2).f : 1);
          }; })(memoMarg(C, a2));
          var top;
          if (lazy) top = topLazy(order, likes, uAt, codes);
          else { for (i = 0; i < n; i++) u2[i] = uAt(i); top = topSet(u2, codes); }
          v2 += pq * (1 - overlap(base, top));
        }
        if (v2 > bv) { bv = v2; best = { kind: 'limit', q: q, value: v2 }; }
      }
    }
    return best;
  }
  return { lik: lik, ncat: ncat, build: build, gain: gain, nextItem: nextItem, maxSd: maxSd, meanSd: meanSd, code: code, distance: distance, rankOcc: rankOcc,
    occItems: occItems, withPicks: withPicks, demoPost: demoPost, marg: marg, occFactor: occFactor, rankU: rankU, nextQuestion: nextQuestion, eligible: eligible, memoMarg: memoMarg, options: options };
}
var CAREER = careerLib();
// Фоновый поток страницы: тот же движок (careerLib) считает следующий вопрос, пока страница отвечает на касания.
// Вход — ответы, отметки и ограничения; выход — { kind: 'item' | 'limit', id } или null.
function careerWorker() {
  var D = null, BY = {};
  onmessage = function (e) {
    var m = e.data;
    if (m.init) { D = m.init; D.occ.forEach(function (o) { BY[o.code] = o; }); return; }
    var w = CAREER.withPicks(D.model, D.items, m.answers, m.picks, BY, D.occStats);
    var nq = CAREER.nextQuestion(CAREER.build(D.model, w.items, w.answers), D.limits, D.occ, D.occStats, m.lans);
    postMessage({ seq: m.seq, nq: nq && { kind: nq.kind, id: nq.item ? nq.item.id : nq.q } });
  };
}

if (typeof document !== 'undefined' && typeof CAREER_DATA !== 'undefined') (function () {
  var DATA = CAREER_DATA, T = DATA.T, KEY = 'career.answers.v1', MIN_SHOW = 12, SHARP = 0.4;
  var q = document.getElementById('career-q'), prof = document.getElementById('career-profile'),
      res = document.getElementById('career-results'), answered = document.getElementById('career-answered');
  // Ограничения (только на /ru/): ответы { вопрос: код }, свой ключ; следующий вопрос — CAREER.nextQuestion.
  var LIM = DATA.limits || null, KEYL = 'career.limits.v2', LIMN = LIM ? Object.keys(LIM.q).length : 0;
  // Выбор профессий: { код: 'yes' | 'no' } — «моё» (до трёх) и «не моё»; идут в модель как ответы по профессии.
  var KEYP = 'career.picks.v1', OCCBY = {}, answers = [], lans = {}, picks = {};
  DATA.occ.forEach(function (o) { OCCBY[o.code] = o; });
  function stored(key, fallback) { try { var v = JSON.parse(localStorage.getItem(key)); return v == null ? fallback : v; } catch (e) { return fallback; } }
  // Хранилище общее для /en/ и /ru/ и правится из соседних вкладок: читаем заново и не верим формату (старые коды, чужие правки).
  function load() {
    var a = stored(KEY, []), l = stored(KEYL, {}), p = stored(KEYP, {}), yes = 0, c;
    answers = Array.isArray(a) ? a.filter(function (x) { return Array.isArray(x) && typeof x[0] === 'string'; }) : [];
    lans = LIM && l && typeof l === 'object' && !Array.isArray(l) ? l : {};
    picks = {};
    if (p && typeof p === 'object' && !Array.isArray(p)) for (c in p) if (OCCBY[c] && (p[c] === 'no' || (p[c] === 'yes' && yes < 3))) { picks[c] = p[c]; if (p[c] === 'yes') yes++; }
  }
  function rebuild() {
    var w = CAREER.withPicks(DATA.model, DATA.items, answers, picks, OCCBY, DATA.occStats), s = CAREER.build(DATA.model, w.items, w.answers);
    s.extra = w.extra; return s;
  }
  load();
  var st = rebuild(), showing = false;   // сохранённый выбор — сразу в профиль
  function nPicks() { return Object.keys(picks).length; }
  function nAll() { return st.n - st.extra + (LIM ? Object.keys(lans).length : 0); }

  function fmt(s, o) { return s.replace(/\{(\w+)\}/g, function (_, k) { return o[k]; }); }
  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(answers)); if (LIM) localStorage.setItem(KEYL, JSON.stringify(lans)); localStorage.setItem(KEYP, JSON.stringify(picks)); } catch (e) {} }
  function pct(x) { return Math.max(0, Math.min(100, (x + 3) / 6 * 100)); }

  function renderBars() {
    if (!prof) return; // шкалы на странице выключены (SHOW_SCALES в билдере)
    if (!st.n) { prof.hidden = true; return; }
    prof.hidden = false;
    DATA.model.dims.forEach(function (s) {
      var e = st.est[s], li = prof.querySelector('[data-scale="' + s + '"]'); if (!li) return;
      var fill = li.querySelector('.bar__fill'), ci = li.querySelector('.bar__ci'), a = pct(0), b = pct(e.mean);
      fill.style.left = Math.min(a, b) + '%'; fill.style.width = Math.abs(b - a) + '%';
      ci.style.left = pct(e.mean - e.sd) + '%'; ci.style.width = (pct(e.mean + e.sd) - pct(e.mean - e.sd)) + '%';
      li.querySelector('.bar__val').textContent = (e.mean >= 0 ? '+' : '') + e.mean.toFixed(2);
    });
    answered.textContent = fmt(T.answered, { n: st.n, sd: CAREER.meanSd(st).toFixed(2) });
    document.getElementById('career-resnote').textContent = fmt(T.resultsNote, { code: CAREER.code(st) });
  }

  // После клика курсор стоит над новой кнопкой на том же месте, и она выглядит «нажатой»; на тачскрине
  // :hover вообще не снимается. Поэтому до первого движения мыши hover-стиль выключен.
  function busy() { return q.getAttribute('aria-busy') === 'true'; }
  function answer(item, y) {
    if (busy()) return;
    if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
    if (showing) res.hidden = false;
    document.body.classList.add('nohover');
    answers.push([item.id, y]); save(); st = rebuild(); renderBars(); if (showing) renderResults(); renderQuestion();
  }
  function answerLimit(id, code) {
    if (busy()) return;
    if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
    document.body.classList.add('nohover');
    lans[id] = code; save(); if (showing) renderResults(); renderQuestion();
  }
  document.addEventListener('mousemove', function () { document.body.classList.remove('nohover'); }, { passive: true });
  function btn(cls, num, label, fn) {
    var b = el('button', cls); b.type = 'button';
    if (num != null) b.appendChild(el('b', null, String(num)));
    if (label) b.appendChild(document.createTextNode(label));
    b.addEventListener('click', function (e) { viaKeyboard = e.detail === 0; fn(); }); return b;
  }
  // Клавиши 1–7 отвечают на текущий вопрос; читаются по физическому коду, раскладка не важна.
  document.addEventListener('keydown', function (e) {
    if (e.ctrlKey || e.altKey || e.metaKey) return;
    var m = /^(Digit|Numpad)([1-9])$/.exec(e.code); if (!m || busy()) return;
    var bs = q.querySelectorAll('.likert button'), i = +m[2] - 1;
    if (i < bs.length) { viaKeyboard = true; e.preventDefault(); bs[i].click(); }
  });

  var TOTAL = DATA.items.length + LIMN, viaKeyboard = false, ITEMBY = {};
  DATA.items.forEach(function (it) { ITEMBY[it.id] = it; });
  function restart() {
    if (nAll() && !window.confirm(T.confirmRestart)) return;
    answers = []; lans = {}; picks = {}; save();
    try { localStorage.removeItem(KEYL); } catch (e) {}   // на /en/ save() ограничений не пишет — их ответы с /ru/ стираем здесь
    st = rebuild(); showing = false; res.hidden = true; renderBars(); renderQuestion();
  }
  function syncAbout() { var a = document.querySelector('.about'); if (a) a.hidden = nAll() > 0; }
  function actions() {
    var act = el('div', 'q__actions');
    if (nAll() >= MIN_SHOW && !showing) act.appendChild(btn('btn btn--go', null, T.showResults, showResults));
    if (st.n && CAREER.maxSd(st) < SHARP) act.appendChild(el('span', 'q__hint', T.sharpEnough));
    if (nAll()) act.appendChild(btn('btn', null, T.restart, restart));
    return act;
  }
  // Строка прогресса: «Вопрос N из …» слева, тег источника вопроса справа.
  function progressRow(n, tag) {
    var p = el('p', 'q__progress'); p.appendChild(el('span', null, fmt(T.progress, { n: n, total: TOTAL })));
    if (tag) p.appendChild(el('span', 'q__tag', tag)); return p;
  }
  function renderLimit(id) {
    var Q = LIM.q[id];
    q.appendChild(progressRow(nAll() + 1, T.srcLimit[Q.kind] + (Q.src ? ' · ' + Q.src : '')));
    q.appendChild(el('p', 'q__text', Q.text));
    var lk = el('div', 'likert likert--2');
    CAREER.options(LIM, lans, id).forEach(function (i) { var code = Q.states[i]; lk.appendChild(btn('', null, Q.labels[i], function () { answerLimit(id, code); })); });
    if (Q.skip) lk.appendChild(btn('', null, T.skip, function () { answerLimit(id, 'skip'); }));
    q.appendChild(lk); q.appendChild(actions()); keysHint();
    if (viaKeyboard) { var first = q.querySelector('.likert button'); if (first) first.focus(); }
  }
  // Подсказка про клавиши — по числу кнопок у текущего вопроса (клавиши 1–9).
  function keysHint() {
    var k = document.querySelector('.note--keys'), n = Math.min(q.querySelectorAll('.likert button').length, 9);
    if (k && T.keysHintN) { k.hidden = n < 2; k.textContent = fmt(T.keysHintN, { n: n }); }
  }
  // Следующий вопрос на /ru/ выбирается перебором: каждый оставшийся вопрос × каждый ответ на него × пересчёт верха выдачи.
  // Это сотни пересчётов, поэтому после ответа считает фоновый поток (careerWorker), а вопрос до его ответа приглушён.
  // Первый вопрос при загрузке и браузер без Worker — в основном потоке.
  var worker = null, wSeq = 0;
  function startWorker() {
    if (!LIM || worker || typeof Worker === 'undefined') return;
    try {
      var src = careerLib.toString() + '\nvar CAREER = careerLib();\n(' + careerWorker.toString() + ')();';
      worker = new Worker(URL.createObjectURL(new Blob([src], { type: 'text/javascript' })));
      worker.onmessage = function (e) { if (e.data.seq === wSeq) { q.removeAttribute('aria-busy'); drawQuestion(e.data.nq); } };
      worker.onerror = function () { worker = null; if (busy()) { q.removeAttribute('aria-busy'); renderQuestion(); } };
      worker.postMessage({ init: { model: DATA.model, items: DATA.items, occ: DATA.occ, occStats: DATA.occStats, limits: LIM } });
    } catch (e) { worker = null; }
  }
  function renderQuestion() {
    syncAbout();
    if (!LIM) { var it = CAREER.nextItem(st); return drawQuestion(it && { kind: 'item', id: it.id }); }
    if (!worker) { var nq = CAREER.nextQuestion(st, LIM, DATA.occ, DATA.occStats, lans); return drawQuestion(nq && { kind: nq.kind, id: nq.item ? nq.item.id : nq.q }); }
    q.setAttribute('aria-busy', 'true');
    worker.postMessage({ seq: ++wSeq, answers: answers, picks: picks, lans: lans });
  }
  function drawQuestion(nq) {
    q.innerHTML = '';
    if (nq && nq.kind === 'limit') { renderLimit(nq.id); return; }
    var item = nq ? ITEMBY[nq.id] : null;
    if (!item) {
      q.appendChild(progressRow(nAll()));
      q.appendChild(el('p', 'q__text', T.done));
      var done = el('div', 'q__actions');
      if (!showing) done.appendChild(btn('btn btn--go', null, T.showResults, showResults));
      done.appendChild(btn('btn', null, T.restart, restart));
      q.appendChild(done);
      if (nAll() && !showing) showResults();
      return;
    }
    q.appendChild(progressRow(nAll() + 1, T.src[item.src] + (T.srcInstr && T.srcInstr[item.src] ? ' · ' + T.srcInstr[item.src] : '')));
    var lk;
    if (item.kind === 'pair') {
      q.appendChild(el('p', 'q__stem', T.pairStem));
      lk = el('div', 'likert likert--2');
      lk.appendChild(btn('', null, item.ta, function () { answer(item, 1); }));
      lk.appendChild(btn('', null, item.tb, function () { answer(item, 2); }));
    } else {
      if (item.src === 'tipi') q.appendChild(el('p', 'q__stem', T.tipiStem));
      q.appendChild(el('p', 'q__text', item.text));
      var K = CAREER.ncat(item); lk = el('div', 'likert' + (K === 7 ? ' likert--7' : ''));
      for (var y = 1; y <= K; y++) (function (y) {
        var label = K === 7 ? (y === 1 ? T.tipiEnds[0] : y === 4 ? T.tipiEnds[1] : y === 7 ? T.tipiEnds[2] : '') : T.likert[y - 1];
        lk.appendChild(btn('', y, label, function () { answer(item, y); }));
      })(y);
    }
    q.appendChild(lk);
    q.appendChild(actions()); keysHint();
    if (viaKeyboard) { var first = q.querySelector('.likert button'); if (first) first.focus(); }
  }

  // Вкладки профессии: O*NET всегда; ESCO и Справочник — если есть соответствия. Данные — отдельным файлом.
  var xwalk = null;
  function loadXwalk() {
    if (!xwalk) xwalk = fetch(DATA.xwalkUrl).then(function (r) { if (!r.ok) throw 0; return r.json(); });
    return xwalk;
  }
  function link(href, text) { var a = el('a', 'ext', text + ' ↗'); a.href = href; a.target = '_blank'; a.rel = 'noopener'; return a; }
  function renderTabs(box, o) {
    box.appendChild(el('p', 'od__note', T.loading));
    loadXwalk().then(function (x) { box.innerHTML = ''; build(x.onet[o.code] || {}, x); })
      .catch(function () { box.innerHTML = ''; build({}, null); box.insertBefore(el('p', 'od__note', T.loadFail), box.firstChild); });
    function build(v, x) {
      var tabs = [{ key: 'onet', label: T.tabOnet, fill: function (p) {
        if (v.d) p.appendChild(el('p', 'od__text', v.d));
        if (T.onetLang && v.d) p.appendChild(el('p', 'od__note', T.onetLang));
        p.appendChild(link('https://www.onetonline.org/link/summary/' + o.code, T.onetOpen));
      } }];
      if (x && v.esco && v.esco.length) tabs.push({ key: 'esco', label: T.tabEsco + ' · ' + v.esco.length, fill: function (p) {
        p.appendChild(el('p', 'od__note', T.escoNote));
        var ul = el('ul', 'od__list');
        v.esco.forEach(function (c) { var e = x.esco[c]; if (!e) return; var li = el('li'); li.appendChild(link('https://esco.ec.europa.eu/en/classification/occupation?uri=' + encodeURIComponent(e[1]), e[0])); ul.appendChild(li); });
        p.appendChild(ul);
      } });
      if (x && x.mt && v.mt && v.mt.length) tabs.push({ key: 'mt', label: T.tabMt + ' · ' + v.mt.length, fill: function (p) {
        p.appendChild(el('p', 'od__note', T.mtNote));
        var ul = el('ul', 'od__list');
        v.mt.forEach(function (id) { var m = x.mt[id]; if (!m) return; var li = el('li');
          li.appendChild(el('p', 'od__name', m.n)); if (m.d) li.appendChild(el('p', 'od__text', m.d.length > 360 ? m.d.slice(0, 357).replace(/\s+\S*$/, '') + '…' : m.d));
          li.appendChild(link('https://spravochnik.rosmintrud.ru/professions/' + id, T.mtOpen)); ul.appendChild(li); });
        p.appendChild(ul);
      } });
      var bar = el('div', 'tabs'), pane = el('div', 'tabpane'); bar.setAttribute('role', 'tablist');
      tabs.forEach(function (tb, i) {
        var b = el('button', 'tab', tb.label); b.type = 'button'; b.setAttribute('role', 'tab');
        b.addEventListener('click', function () { show(i); }); bar.appendChild(b);
      });
      function show(i) {
        Array.prototype.forEach.call(bar.children, function (b, j) { b.classList.toggle('tab--on', j === i); b.setAttribute('aria-selected', j === i ? 'true' : 'false'); });
        pane.innerHTML = ''; tabs[i].fill(pane);
      }
      box.appendChild(bar); box.appendChild(pane); show(0);
    }
  }

  function showResults(noScroll) { showing = true; renderResults(); res.hidden = false; if (noScroll !== true) res.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' }); }

  // Годы пути словами (страница с ограничениями — русская).
  function yearsRu(L) {
    if (L < 1) return T.lessYear;
    var n = Math.round(L), m10 = n % 10, m100 = n % 100;
    return '~' + n + ' ' + (m10 === 1 && m100 !== 11 ? 'год' : m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14) ? 'года' : 'лет');
  }
  // Что закрывает профессию по ответам человека (неустранимое): { q, a } или null.
  function blockReason(code) {
    var co = LIM.occ[code]; if (!co) return null;
    for (var b in co.b) {
      var e = co.b[b], a = lans[b]; if (b === 'b_age' || !e.cl || !a || a === 'skip' || e.cl.indexOf(a) < 0) continue;
      var Q = LIM.q[b]; return { need: Q.tagc || Q.text, a: Q.labels[Q.states.indexOf(a)] };
    }
    return null;
  }
  // Теги карточки, не больше 6: путь, как входят, «закон»; требования — что нужно получить (с годами), что уже есть (зелёный),
  // что проверяют; условия профессии — красный «нет», зелёный «да», обычный — середина или не спрошено.
  function cardTags(co, r) {
    var first = [], need = [], no = [], yes = [], rest = [], seen = {}, b;
    if (r.L >= 0.75) first.push({ t: fmt(T.pathNote, { y: yearsRu(r.L) }), tone: 'path' });
    if (T.entry && T.entry[co.ep]) first.push({ t: T.entry[co.ep] });
    if (co.reg) first.push({ t: T.law, title: co.regw });
    for (b in co.b) {
      if (b === 'b_age') continue;
      var e = co.b[b], Q = LIM.q[b], a = lans[b], has = a != null && a !== 'skip', lab = null, yrs = 0;
      if (e.p && Q.tag) {
        var cand = Q.states.filter(function (x) { return !(x in e.p) && !(e.cl && e.cl.indexOf(x) >= 0) && Q.tag[x]; });
        if (!cand.length) cand = Object.keys(e.p).filter(function (x) { return Q.tag[x]; }).sort(function (x, y) { return e.p[x] - e.p[y]; });
        if (cand.length) lab = Q.tag[cand[0]];
        if (has) yrs = e.p[a] || 0;
      } else if (e.cl && Q.tagc) lab = Q.tagc;
      if (!lab || seen[lab]) continue; seen[lab] = 1;
      if (has && yrs > 0) need.push({ t: lab + ' · ' + yearsRu(yrs) }); else if (has) yes.push({ t: lab, tone: 'yes' }); else rest.push({ t: lab });
    }
    co.c.forEach(function (c) {
      var a = lans[c], t = { t: LIM.q[c].short };
      if (a === 'no') { t.tone = 'no'; no.push(t); } else if (a === 'yes') { t.tone = 'yes'; yes.push(t); } else { if (a === 'some') t.tone = 'some'; rest.push(t); }
    });
    return first.concat(need, no, yes, rest).slice(0, 6);
  }
  function togglePick(code, v) {
    var yes = Object.keys(picks).filter(function (c) { return picks[c] === 'yes'; }).length;
    if (picks[code] === v) delete picks[code];
    else if (v === 'yes' && yes >= 3) { pickNote(T.pickMax); return; }
    else picks[code] = v;
    save(); st = rebuild(); renderResults(); renderQuestion();
  }
  function pickNote(t) { var n = document.getElementById('career-pick-note'); if (!n) return; n.textContent = t; n.hidden = false; setTimeout(function () { n.hidden = true; }, 2500); }
  // ✓ и ✕ справа — по наведению (десктоп); на сенсорном экране кнопок нет, строку смахивают: вправо — «моё», влево — «не моё».
  function pickable(li, name, code) {
    var pk = el('span', 'pk');
    [['yes', '✓', T.pickYes], ['no', '✕', T.pickNo]].forEach(function (x) {
      var b = el('button', (x[0] === 'yes' ? 'y' : 'n') + (picks[code] === x[0] ? ' on' : ''), x[1]); b.type = 'button'; b.title = x[2]; b.setAttribute('aria-label', x[2]); b.setAttribute('aria-pressed', picks[code] === x[0] ? 'true' : 'false');
      b.addEventListener('click', function (e) { e.stopPropagation(); togglePick(code, x[0]); }); pk.appendChild(b);
    });
    li.appendChild(pk);
    var x0 = 0, y0 = 0, dx = 0, horiz = null;
    li.addEventListener('touchstart', function (e) { var t = e.touches[0]; x0 = t.clientX; y0 = t.clientY; dx = 0; horiz = null; }, { passive: true });
    li.addEventListener('touchmove', function (e) {
      var t = e.touches[0], ddx = t.clientX - x0, ddy = t.clientY - y0;
      if (horiz === null && (Math.abs(ddx) > 8 || Math.abs(ddy) > 8)) horiz = Math.abs(ddx) > Math.abs(ddy) * 1.5;
      if (!horiz) return;
      e.preventDefault(); dx = ddx;
      li.style.transform = 'translateX(' + Math.round(dx * 0.5) + 'px)';
      li.style.background = dx > 0 ? 'rgba(124,200,150,.10)' : 'rgba(232,116,106,.10)';
    }, { passive: false });
    li.addEventListener('touchend', function () {
      li.style.transform = ''; li.style.background = '';
      if (horiz) { li._swiped = true; setTimeout(function () { li._swiped = false; }, 400); if (dx > 70) togglePick(code, 'yes'); else if (dx < -70) togglePick(code, 'no'); }
    });
    li.addEventListener('touchcancel', function () { li.style.transform = ''; li.style.background = ''; });   // системный жест прервал касание — строка не должна остаться сдвинутой
    name.addEventListener('click', function (e) { if (li._swiped) { e.stopImmediatePropagation(); e.preventDefault(); } }, true);
  }
  function occItem(r, note, tags, canPick) {
    var li = el('li'), name = el('button', 'occs__name'); name.type = 'button'; name.setAttribute('aria-expanded', 'false');
    if (picks[r.o.code] === 'yes') li.className = 'picked';
    if (canPick) pickable(li, name, r.o.code);
    var ruName = DATA.ruNames && DATA.ruNames[r.o.code];
    if (ruName) { name.appendChild(el('span', 'occs__ru', ruName)); name.appendChild(el('span', 'occs__en', r.o.title)); } else name.appendChild(el('span', 'occs__ru', r.o.title));
    li.appendChild(name);   // строка — только название; всё остальное — в раскрытии
    var box = el('div', 'od'); box.hidden = true;
    // Сверху раскрытия — причина и теги: рисуются сразу, без подгрузки; ниже — вкладки, они грузятся при первом раскрытии.
    if (note) box.appendChild(el('p', 'occs__note', note));
    if (tags && tags.length) {
      var tg = el('div', 'occs__tags'); tags.forEach(function (t) { var c = el('span', 'chip' + (t.tone ? ' chip--' + t.tone : ''), t.t); if (t.title) c.title = t.title; tg.appendChild(c); });
      box.appendChild(tg);
    }
    var tabs = el('div', 'od__tabs'); box.appendChild(tabs);
    name.addEventListener('click', function () {
      var open = box.hidden; box.hidden = !open; name.setAttribute('aria-expanded', open ? 'true' : 'false');
      if (open && !tabs.dataset.done) { tabs.dataset.done = '1'; renderTabs(tabs, r.o); }
    });
    li.appendChild(box); return li;
  }
  function renderResults() {
    var ol = document.getElementById('career-occs'); ol.innerHTML = '';
    shareTop = [];
    var keep = function (r) { if (shareTop.length < 10) shareTop.push({ code: r.o.code, ru: DATA.ruNames && DATA.ruNames[r.o.code] || '', en: r.o.title }); };
    // Отмеченное «моё» остаётся в списке на своём месте по рангу, даже если вышло за тридцатку (после смены языка, нового ответа или отметки соседней строки).
    if (!LIM) CAREER.rankOcc(st, DATA.occ, DATA.occStats, DATA.occ.length).forEach(function (r) {
      if (picks[r.o.code] === 'no') return; if (ol.children.length >= 30 && picks[r.o.code] !== 'yes') return; keep(r); ol.appendChild(occItem(r, null, null, true));
    });
    else {
      // Главный список — по U (реранк, не фильтр); закрытое неустранимым — в свёрнутый блок с причиной.
      var ranked = CAREER.rankU(st, LIM, DATA.occ, DATA.occStats, lans), shown = 0;
      ranked.forEach(function (r) {
        if (picks[r.o.code] === 'no') return;
        if (blockReason(r.o.code) || (shown >= 30 && picks[r.o.code] !== 'yes')) return; shown++; keep(r);
        var co = LIM.occ[r.o.code];
        ol.appendChild(occItem(r, null, co ? cardTags(co, r) : [], true));
      });
      var bl = document.getElementById('career-blocked');
      if (!bl) { bl = el('details', 'occs__blocked'); bl.id = 'career-blocked'; ol.parentNode.insertBefore(bl, ol.nextSibling); }
      bl.innerHTML = ''; var byLike = ranked.slice().sort(function (a, b) { return b.like - a.like; }).slice(0, 60), list = el('ol', 'occs'), nb = 0;
      byLike.forEach(function (r) { var why = blockReason(r.o.code); if (!why || nb >= 15) return; nb++; list.appendChild(occItem(r, fmt(T.blockedReason, why))); });
      bl.hidden = !nb; bl.appendChild(el('summary', null, fmt(T.blockedTitle, { n: nb }))); bl.appendChild(list);
    }
    // «Не моё» — свёрнутой группой в конце (там же снимается); «моё» — зелёным в общем списке.
    var np = document.getElementById('career-nope');
    if (!np) { np = el('details', 'occs__blocked'); np.id = 'career-nope'; var anchor = document.getElementById('career-blocked') || ol; anchor.parentNode.insertBefore(np, anchor.nextSibling); }
    np.innerHTML = ''; var nl = el('ol', 'occs');
    Object.keys(picks).forEach(function (c) { if (picks[c] === 'no' && OCCBY[c]) nl.appendChild(occItem({ o: OCCBY[c] }, null, null, true)); });
    np.hidden = !nl.children.length; np.appendChild(el('summary', null, fmt(T.nopeTitle, { n: nl.children.length }))); np.appendChild(nl);
    updateBadge();
    var ta = document.getElementById('career-json'), out = { n: st.n, theta: {}, sd: {} };
    DATA.model.dims.forEach(function (s) { out.theta[s] = +st.est[s].mean.toFixed(3); out.sd[s] = +st.est[s].sd.toFixed(3); });
    if (LIM) out.limits = lans;
    if (nPicks()) out.picks = picks;
    ta.value = JSON.stringify(out);
  }
  // Поделиться: картинка, Markdown, HTML или JSON — генерируется здесь же и копируется в буфер; ничего не хостится.
  var shareTop = [];
  function shareUrl() { return location.origin + location.pathname; }
  function hEsc(x) { return String(x).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
  function lineOf(x) { return x.ru && x.ru !== x.en ? x.ru + ' — ' + x.en : x.en; }
  function chosen() { return Object.keys(picks).filter(function (c) { return picks[c] === 'yes' && OCCBY[c]; }).map(function (c) { return { code: c, ru: DATA.ruNames && DATA.ruNames[c] || '', en: OCCBY[c].title }; }); }
  // Текст: выбранные («Мой выбор»), если есть, иначе верх выдачи («Мои профессии»).
  function shareText(fmt) {
    var ch = chosen(), list = ch.length ? ch : shareTop, head = ch.length ? T.badgeHead : T.shareHead;
    if (fmt === 'json') { var o = JSON.parse(document.getElementById('career-json').value || '{}'); o.top = shareTop; if (ch.length) o.chosen = ch; return JSON.stringify(o); }
    if (fmt === 'md') return '**' + T.title + '** · ' + head + '\n\n' + list.map(function (x, i) { return (i + 1) + '. ' + lineOf(x); }).join('\n') + '\n\n' + shareUrl();
    return '<p><b>' + hEsc(T.title) + '</b> · ' + hEsc(head) + '</p>\n<ol>\n' + list.map(function (x) { return '  <li>' + hEsc(lineOf(x)) + '</li>'; }).join('\n') +
      '\n</ol>\n<p><a href="' + hEsc(shareUrl()) + '">' + hEsc(shareUrl()) + '</a></p>';
  }
  // Бейдж 1200×630 в цветах страницы: «Мой выбор» и 1–3 выбранные профессии, адрес теста. Рисуется, только если что-то выбрано.
  function badgeCanvas() {
    var ch = chosen(); if (!ch.length) return null;
    var W = 1200, H = 630, c = document.createElement('canvas'), g = c.getContext('2d'), css = getComputedStyle(document.body);
    var sans = css.fontFamily, mono = getComputedStyle(document.querySelector('.q__progress') || document.body).fontFamily, root = getComputedStyle(document.documentElement);
    var col = function (v, d) { return (root.getPropertyValue(v) || d).trim() || d; }, ink = col('--ink', '#E8E6E1'), dim = col('--dim', '#9A9EA5'), acc = col('--accent', '#E0703A');
    c.width = W; c.height = H; g.fillStyle = col('--bg', '#121315'); g.fillRect(0, 0, W, H); g.fillStyle = acc; g.fillRect(0, 0, 10, H);
    var fit = function (t, w) { if (g.measureText(t).width <= w) return t; while (t.length > 1 && g.measureText(t + '…').width > w) t = t.slice(0, -1); return t + '…'; };
    g.fillStyle = acc; g.font = '500 24px ' + mono; g.fillText(T.title.toUpperCase(), 80, 100);
    g.fillStyle = dim; g.font = '400 30px ' + sans; g.fillText(T.badgeHead, 80, 160);
    var big = ch.length < 3 ? 58 : 46, step = ch.length < 3 ? 130 : 108;
    ch.forEach(function (x, i) {
      var y = 255 + i * step; g.fillStyle = ink; g.font = '600 ' + big + 'px ' + sans; g.fillText(fit(x.ru || x.en, W - 160), 80, y);
      if (x.ru && x.ru !== x.en) { g.fillStyle = dim; g.font = '400 24px ' + sans; g.fillText(fit(x.en, W - 160), 82, y + 38); }
    });
    g.fillStyle = dim; g.font = '400 22px ' + mono; g.fillText(shareUrl().replace(/^https?:\/\//, ''), 80, H - 60);
    return c;
  }
  function updateBadge() {
    var box = document.getElementById('career-badge'); if (!box) return;
    var c = badgeCanvas(); box.innerHTML = '';
    if (!c) { box.appendChild(el('p', 'sub badge-hint', T.badgeHint)); return; }
    var img = el('img', 'badge'); img.alt = T.badgeHead; img.src = c.toDataURL('image/png'); box.appendChild(img);
  }
  // Картинка — бейдж выбранных; без выбора кнопка её не просит (см. обработчик ниже).
  function shareImage(cb) { badgeCanvas().toBlob(cb, 'image/png'); }
  function flash(b, text) { var label = b.textContent; b.textContent = text; setTimeout(function () { b.textContent = label; }, 2000); }
  function copyText(text, b) {
    var done = function () { flash(b, T.copied); };
    var fallback = function () { var ta = document.getElementById('career-json'), keepV = ta.value; ta.hidden = false; ta.value = text; ta.select(); try { document.execCommand('copy'); done(); } catch (e) {} ta.value = keepV; ta.hidden = true; };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done, fallback); else fallback();
  }
  Array.prototype.forEach.call(document.querySelectorAll('#career-share [data-fmt]'), function (b) {
    b.addEventListener('click', function () {
      if (!showing) renderResults();
      var fmt = b.getAttribute('data-fmt');
      if (fmt !== 'img') return copyText(shareText(fmt), b);
      if (!chosen().length) { flash(b, T.badgeNeed); updateBadge(); return; }
      shareImage(function (blob) {
        var save = function () { var a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = T.shareFile || 'badge.png'; a.click(); flash(b, T.saved); };
        if (navigator.clipboard && window.ClipboardItem) navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]).then(function () { flash(b, T.copied); }, save); else save();
      });
    });
  });

  function start() {
    renderBars();
    if (nAll() >= MIN_SHOW) showResults(true); // после перезагрузки или смены языка результат остаётся на месте (счёт — все ответы)
    else { showing = false; res.hidden = true; }
    var w = worker; worker = null; wSeq++; q.removeAttribute('aria-busy'); renderQuestion(); worker = w;   // при загрузке — сразу, без потока
  }
  // Страница из кэша «назад» и соседняя вкладка (в том числе другой язык) знают только то, что было при загрузке; без этого их
  // следующее сохранение затёрло бы отметки и ответы, сделанные в другом месте.
  function resync() { load(); st = rebuild(); start(); }
  addEventListener('pageshow', function (e) { if (e.persisted) resync(); });
  addEventListener('storage', function (e) { if (e.key === null || e.key === KEY || e.key === KEYL || e.key === KEYP) resync(); });
  start();
  setTimeout(startWorker, 0);
})();

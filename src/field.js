/* field.js — символьное поле на canvas. Один движок на два места:
   хиро (граф кейсов: собирается, дышит, уезжает вбок) и блок «Кем быть» (облако).
   Точки приходят из data/derived/hero-points.json, всё считается в буфер клеток,
   поэтому стоимость кадра не зависит от размера экрана. */
(function () {
  var RAMP = ' ·:;+o08$@';
  /* «Убрать анимацию» в системе: поле стоит в собранном виде (кадр T_STILL, после отъезда), подписи — первые варианты,
     без дыхания, вспышек, роя и осыпи; лупа слабее; кадр рисуется только на движение мыши и смену размера. */
  var REDUCED = !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches), T_STILL = 3.2, STILL_GLOW = 0.6;

  function Field(canvas, opts) {
    var ctx = canvas.getContext('2d', { alpha: false });
    var set = POINTS.sets.find(function (s) { return s.id === opts.set; });
    var FS = opts.fs || 13, fly = opts.fly !== false, bgLines = opts.bg !== false;
    var W, H, cw, ch, cols, rows, buf, acc, occ, t0 = performance.now();
    var ptr = { x: -1e4, y: -1e4, on: false }, running = false, dead = false, lastT = 0;
    var visible = true, looping = false;             /* холст за пределами экрана не рисуется: цикл кадров встаёт и возобновляется при появлении */

    /* Рёбра графа (08.10, его просьба): серое — пунктиры рёбер и методы — по умолчанию не видно.
       По ребру от кейса к методу бежит вспышка мельтешащих знаков; добежала — метод и его подпись
       проявляются и гаснут за ~1,5 с. Точки ребра и сгустка метода узнаются по весу из hero-points.mjs
       (ребро 0.42, метод 1) и привязываются к ближайшему ребру / узлу один раз. */
    var EDGE = null;
    if (set.edges && set.nodes) {
      EDGE = { e: new Int16Array(set.points.length).fill(-1), u: new Float32Array(set.points.length),
               m: new Int16Array(set.points.length).fill(-1), glow: new Float32Array(set.nodes.length), pulses: [], next: 0,
               text: [], last: {}, hits: new Int16Array(set.nodes.length), msw: [] };
      set.points.forEach(function (p, i) {
        if (Math.abs(p[2] - 0.42) < 0.01) {
          var best = 1e9;
          set.edges.forEach(function (ed, k) {
            var A = set.nodes[ed[0]], B = set.nodes[ed[1]], dx = B.x - A.x, dy = B.y - A.y;
            var u = Math.max(0, Math.min(1, ((p[0] - A.x) * dx + (p[1] - A.y) * dy) / (dx * dx + dy * dy)));
            var d = Math.hypot(A.x + dx * u - p[0], A.y + dy * u - p[1]);
            if (d < best) { best = d; EDGE.e[i] = k; EDGE.u[i] = u; }
          });
        } else if (Math.abs(p[2] - 1) < 0.01) {
          var bd = 1e9;
          set.nodes.forEach(function (n, k) {
            if (n.kind === 'case') return;
            var d = Math.hypot(n.x - p[0], n.y - p[1]);
            if (d < bd) { bd = d; EDGE.m[i] = k; }
          });
        }
      });
    }
    /* Раскрытие облака («мозг», блок «Кем быть», 08.10): граница коробки растёт плавно (CSS), а само облако —
       рывками: каждый рывок — толчок к случайной стенке и быстрый рост с замедлением, к концу стабилизируется.
       Размер облака считается от коробки в свёрнутом виде (W0, H0), поэтому плавный рост коробки его не тянет. */
    var GROW = opts.grow ? { W0: 0, H0: 0, g: 0, from: 0, to: 0, t0: 0, dur: 0.3, kicks: [], ox: 0, oy: 0, vx: 0, vy: 0, open: false, rw: 1, rh: 1 } : null;
    var needLayout = false;                          /* размер меняют снаружи — перекладываемся в начале кадра, без чёрного мигания */
    function growStep(t, dt) {
      var G = GROW;
      while (G.kicks.length && t >= G.kicks[0].at) {
        var k = G.kicks.shift(), a = Math.random() * Math.PI * 2;
        G.from = G.g; G.to = k.to; G.t0 = t; G.dur = k.dur;
        G.vx += Math.cos(a) * k.push; G.vy += Math.sin(a) * k.push * 0.7;
      }
      var u = Math.min(1, (t - G.t0) / G.dur); u = 1 - Math.pow(1 - u, 3);
      G.g = G.from + (G.to - G.from) * u;
      G.vx += (-60 * G.ox - 8 * G.vx) * dt; G.vy += (-60 * G.oy - 8 * G.vy) * dt;   /* пружина: удар о стенку и назад */
      G.ox += G.vx * dt; G.oy += G.vy * dt;
    }
    /* open(w, h): во сколько раз раскрытая коробка шире и выше свёрнутой; облако растёт по каждой оси до своей доли */
    this.open = function (rw, rh) {
      if (!GROW) return;
      if (REDUCED) {                                   /* без рывков: сразу конечный размер */
        GROW.open = rh > 1 || rw > 1; GROW.rw = Math.max(1, rw); GROW.rh = Math.max(1, rh); GROW.g = GROW.open ? 1 : 0; GROW.kicks = [];
        loop(); return;
      }
      var t = (performance.now() - t0) / 1000;
      if (rh > 1 || rw > 1) {
        GROW.open = true; GROW.rw = Math.max(1, rw); GROW.rh = Math.max(1, rh);
        GROW.kicks = [0, 0.3, 0.58, 0.9].map(function (d, i) {
          return { at: t + d, to: [0.38, 0.66, 0.88, 1][i], dur: 0.32 + i * 0.06, push: 300 - i * 55 }; });
      } else { GROW.open = false; GROW.kicks = []; GROW.from = GROW.g; GROW.to = 0; GROW.t0 = t; GROW.dur = 0.6; }
    };
    this.nudge = function (dy) {                       /* прокрутка: облако на месте, центр чуть елозит */
      if (!GROW || REDUCED) return;
      var m = Math.min(40, Math.abs(dy));               /* без направления: только мелкая дрожь */
      GROW.vx += (Math.random() - 0.5) * m * 2.2; GROW.vy += (Math.random() - 0.5) * m * 1.6;
    };
    var TRAIL = 0.28;                                /* хвост вспышки — доля длины ребра */
    var GRAY_FADE = 0.3, MSWD = 1.3;                 /* порог «уже погасла»; длительность смены серой подписи, с */
    function methodSwarm(k, t) {                     /* смена серой подписи — тем же роем, что у оранжевых */
      var m = EDGE && EDGE.msw[k]; if (!m) return null;
      var p = (t - m.start) / MSWD;
      if (p >= 1) { EDGE.msw[k] = null; return null; }
      if (p >= 0.5) EDGE.text[k] = m.to;
      var u = p < 0.5 ? p / 0.5 : (p - 0.5) / 0.5, e = u * u * (3 - 2 * u), at = p < 0.5 ? e : 1 - e;
      return { w: at, s: Math.sin(Math.PI * at) };
    }
    /* Серых текстов больше, чем мест: удар вспышки от кейса ставит в точку навык этого кейса (set.pool),
       которого сейчас нет на экране, из давно не показанных; в пуле и имя самого метода. */
    function nodeText(n) { return (opts.lang === 'ru' && n.labelRu) ? n.labelRu : n.label; }

    /* Подписи кейсов (оранжевые) сменяются: раз в 6–12 с буквы роятся, схлопываются в узел и
       разлетаются следующей подписью из n.labels. SWD — длительность смены, с. */
    var SWD = 1.8, SW = (set.nodes || []).map(function (n) {
      return n.kind === 'case' && n.labels && n.labels.length > 1 ? { idx: 0, to: 0, start: -1, next: 5 + Math.random() * 7 } : null;
    });
    function swarmStep(t) {
      SW.forEach(function (w, k) {
        if (!w) return;
        if (w.start < 0 && t > w.next) { w.start = t; w.to = (w.idx + 1) % set.nodes[k].labels.length; }
        if (w.start < 0) return;
        var p = (t - w.start) / SWD;
        if (p >= 0.5) w.idx = w.to;
        if (p >= 1) { w.start = -1; w.next = t + 6 + Math.random() * 6; }
      });
    }
    function caseText(k) { var w = SW[k]; return w ? set.nodes[k].labels[w.idx] : nodeText(set.nodes[k]); }
    function swarmOf(k, t) {                         /* w: 0 — на месте, 1 — в точке узла; s — сила роения */
      var w = SW[k]; if (!w || w.start < 0) return null;
      var p = Math.min(1, (t - w.start) / SWD), u = p < 0.5 ? p / 0.5 : (p - 0.5) / 0.5, e = u * u * (3 - 2 * u);
      var at = p < 0.5 ? e : 1 - e;
      return { w: at, s: Math.sin(Math.PI * at) };
    }
    function chooseText(src, k, t, not) {
      var shown = {};
      if (not) shown[not] = 1;                         /* смена: не та же подпись */
      for (var j = 0; j < EDGE.glow.length; j++) if (j !== k && EDGE.glow[j] > 0.04 && EDGE.text[j]) shown[EDGE.text[j]] = 1;
      var c = ((set.pool && set.pool[src]) || []).concat([nodeText(set.nodes[k])]).filter(function (x, i, a) { return x && !shown[x] && a.indexOf(x) === i; });
      if (!c.length) return nodeText(set.nodes[k]);
      c.sort(function (a, b) { return (EDGE.last[a] || -1) - (EDGE.last[b] || -1); });
      var pick = c[Math.floor(Math.random() * Math.min(3, c.length))];
      EDGE.last[pick] = t; return pick;
    }
    /* пунктиры между жёлтыми узлами — кейсами с общим методом — видны всегда, без вспышек */
    var LINKPTS = [];
    (set.links || []).forEach(function (l) {
      var A = set.nodes[l[0]], B = set.nodes[l[1]], n = Math.max(8, Math.round(Math.hypot(B.x - A.x, B.y - A.y) * 45));
      for (var i = 2; i < n - 1; i++) LINKPTS.push([A.x + (B.x - A.x) * i / n, A.y + (B.y - A.y) * i / n]);
    });

    function layout() {
      var dpr = Math.min(devicePixelRatio || 1, 2);
      W = canvas.clientWidth; H = canvas.clientHeight;
      if (!W || !H) return false;
      canvas.width = W * dpr; canvas.height = H * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.font = FS + 'px "Geist Mono", monospace';
      cw = ctx.measureText('0').width || FS * 0.6;
      ch = Math.round(FS * 1.24);
      cols = Math.ceil(W / cw); rows = Math.ceil(H / ch);
      buf = new Float32Array(cols * rows); acc = new Float32Array(cols * rows); occ = new Uint8Array(cols * rows);
      if (GROW && !GROW.open && GROW.g < 0.001) { GROW.W0 = W; GROW.H0 = H; }   /* база — свёрнутая коробка */
      return true;
    }

    function put(a, ix, iy, v) { if (ix >= 0 && iy >= 0 && ix < cols && iy < rows) a[iy * cols + ix] += v; }

    function shade(u) {
      var lo = [0x3A, 0x3C, 0x40], hi = [0xE8, 0xE6, 0xE1], c = [];
      for (var i = 0; i < 3; i++) c.push(Math.round(lo[i] + (hi[i] - lo[i]) * u));
      return 'rgb(' + c[0] + ',' + c[1] + ',' + c[2] + ')';
    }

    function glyph(gx, gy, v, a, k) {
      var s = Math.max(v, a), gi = Math.min(RAMP.length - 1, Math.floor(s * 3.1)), g = RAMP[gi];
      if (g === ' ') return;
      if (k !== 1) ctx.font = (FS * k).toFixed(1) + 'px "Geist Mono", monospace';
      ctx.fillStyle = a > 0.06 ? '#E0703A' : shade(Math.min(1, s * 0.85));
      ctx.fillText(g, gx, gy);
      if (k !== 1) ctx.font = FS + 'px "Geist Mono", monospace';
    }

    var LR = 120;                                    /* радиус лупы, px */
    var lensA = 0;                                   /* сила лупы: растёт при наведении, плавно гаснет после */
    var LENS = REDUCED ? 0.6 : 1.9;                  /* прибавка к размеру в центре лупы */
    function lens(d) { return d < LR ? 1 + LENS * Math.pow(1 - d / LR, 2) * lensA : 1; }

    /* Названия профессий в облаке (08.10, два варианта, галками в редакторе). Касание точки курсором запускает
       анимацию имени фиксированной длины. Все анимации живут в одной таблице NP фиксированного размера:
       касание занимает следующую строку по кругу, кадр проходит таблицу одним циклом — работа на кадр постоянная.
       fall  (hoverNames)  — имя осыпается назад и вниз, как карты в пасьянсе, со шлейфом копий; свёрнутое и раскрытое;
       drift (cornerNames) — только раскрытое: имя в месте касания уходит вбок и расплывается, как из фокуса. */
    var NAMES = set.names || null, SP = NAMES ? new Float32Array(set.points.length * 2) : null;
    var NPN = 16, NP = [], npHead = 0, npLast = -1, npLastT = -1;
    for (var q0 = 0; q0 < NPN; q0++) NP.push({ on: false, i: 0, x: 0, y: 0, t0: 0, kind: 0, vx: 0, vy: 0, rot: 0 });
    var T_FALL = 1.8, T_DRIFT = 1.6;
    function npSpawn(i, x, y, t, kind) {
      var n = NP[npHead]; npHead = (npHead + 1) % NPN;
      n.on = true; n.i = i; n.x = x; n.y = y; n.t0 = t; n.kind = kind;
      var side = Math.random() < 0.5 ? -1 : 1;
      if (kind === 0) { n.vx = side * (50 + Math.random() * 90); n.vy = -(230 + Math.random() * 90); n.rot = side * (0.15 + Math.random() * 0.3); }
      else { n.vx = (x >= W / 2 ? 1 : -1) * (120 + Math.random() * 60); n.vy = (Math.random() - 0.5) * 20; n.rot = 0; }
    }
    /* один шрифт на всю таблицу, размер — масштабом, прозрачность — globalAlpha: ни разбора шрифта, ни размытия на кадр */
    function npText(n, x, y, sc, a, rot, shade) {
      ctx.save(); ctx.translate(x, y); if (rot) ctx.rotate(rot); ctx.scale(sc, sc); ctx.globalAlpha = a;
      if (shade > 0.02) {                              /* затенение фона: тёмная обводка под буквами (дешевле размытия) */
        ctx.globalAlpha = a * shade; ctx.lineWidth = 7 / sc; ctx.strokeText(NAMES[n.i], 0, 0); ctx.globalAlpha = a;
      }
      ctx.fillText(NAMES[n.i], 0, 0); ctx.restore();
    }
    function drawNames(t, only) {                      /* only: 0 — осыпь (рисуется ЗА знаками облака), 1 — уход вбок (спереди) */
      if (!NAMES) return;
      ctx.save(); ctx.textBaseline = 'middle'; ctx.textAlign = 'center';
      ctx.font = '500 ' + (FS - 2) + 'px "Geist", sans-serif'; ctx.fillStyle = '#E8E6E1';   /* на пару пунктов меньше поля */
      ctx.strokeStyle = opts.bgColor || '#121315'; ctx.lineJoin = 'round';
      for (var k = 0; k < NPN; k++) {
        var n = NP[k]; if (!n.on || n.kind !== only) continue;
        var T = n.kind === 0 ? T_FALL : T_DRIFT, u = (t - n.t0) / T;
        if (u >= 1) { n.on = false; continue; }
        if (n.kind === 0) {                              /* осыпь: бросок, тяжесть, отскок от дна, уход вглубь, шлейф */
          for (var g = 1; g >= 0; g--) {
            var tau = Math.max(0, (t - n.t0) - g * 0.08), uu = tau / T;
            var x = n.x + n.vx * tau, y = n.y + n.vy * tau + 300 * tau * tau, fl = H + 6;   /* отскок — у самого низа рамки */
            if (y > fl) y = fl - (y - fl) * 0.45;
            var big = Math.max(0, 1 - uu * 2.2);           /* в начале полёта крупнее и с тенью, потом уходит вглубь */
            npText(n, x, y, 1.15 + 1.0 * big - 0.6 * uu, (1 - uu) * (g ? 0.3 : 1), n.rot * uu, g ? 0 : 0.85 * big);
          }
        } else {                                         /* уход из фокуса: вбок, копии расползаются */
          var e = 1 - Math.pow(1 - u, 2), x2 = n.x + n.vx * e * T * 0.6, y2 = n.y - 12 + n.vy * u, sp = 7 * u, a2 = 1 - u, sc = 1.3 - 0.25 * u;
          npText(n, x2, y2, sc, a2, 0, 0);
          if (u > 0.08) { npText(n, x2 - sp, y2, sc, a2 * 0.35, 0, 0); npText(n, x2 + sp, y2, sc, a2 * 0.35, 0, 0); }
        }
      }
      ctx.restore();
    }

    /* Подписи узлов — буквы в клетках той же сетки. Подпись встаёт в строку рядом с узлом;
       если её клетки задевают уже занятые (чужая подпись с зазором в две клетки и строку, узел кейса),
       она сдвигается на строку от узла (к узлу — со штрафом), пока не разойдётся. Под лупой буквы
       растут с тем же k, что знаки поля, и раздвигаются вдоль строки, чтобы не слипаться.
       Клетки под буквами помечаются в occ — знак поля там не рисуется. */
    function placeLabels(cx, cy, rx, ry, ca, sa, alpha, t) {
      var out = [];
      if (!set.nodes || !opts.labels) return out;
      var taken = [];                                /* [строка, c0, c1, зазор по строкам] */
      var nodes = set.nodes.map(function (n, k) {
        return { n: n, k: k, X: cx + (n.x * ca - n.y * sa) * rx, Y: cy + (n.x * sa + n.y * ca) * ry };
      });
      nodes.forEach(function (o) {
        if (o.n.kind !== 'case') return;
        var c = Math.round(o.X / cw); taken.push([Math.round(o.Y / ch), c, c, 0]);
      });
      function free(r, a, b) {
        for (var i = 0; i < taken.length; i++) {
          var t = taken[i];
          if (Math.abs(t[0] - r) <= t[3] && a <= t[2] && b >= t[1]) return false;
        }
        return true;
      }
      var cases = nodes.filter(function (o) { return o.n.kind === 'case'; });
      var methods = nodes.filter(function (o) { return o.n.kind !== 'case' && (!EDGE || EDGE.glow[o.k] > 0.04); });  /* метод подписан, пока его видно */
      cases.concat(methods).forEach(function (o) {
        var n = o.n, isCase = n.kind === 'case';
        var chars = Array.from(isCase ? caseText(o.k) : (EDGE && EDGE.text[o.k] ? EDGE.text[o.k] : nodeText(n))), L = chars.length;
        var swm = isCase ? swarmOf(o.k, t) : methodSwarm(o.k, t);
        if (!isCase && swm) chars = Array.from(EDGE.text[o.k] || nodeText(n)), L = chars.length;   /* текст мог смениться на середине */
        if (!L || L > Math.floor(W / cw)) return;
        var tx = o.X + (isCase ? 0 : (n.x >= 0 ? 30 : -30)), ty = o.Y + (n.y >= 0 ? 1 : -1) * (isCase ? 30 : 20);
        var dir = n.y >= 0 ? 1 : -1, r0 = Math.round(ty / ch), row = -1;
        var c0 = Math.max(0, Math.min(Math.floor(W / cw) - L, Math.round(tx / cw - L / 2 + 0.5)));  /* целиком в кадре */
        function fits(r) { return r >= 0 && r < rows && free(r, c0 - 2, c0 + L + 1); }
        for (var d = 0; d <= rows + 3 && row < 0; d++) {        /* к узлу — со штрафом в три строки */
          if (fits(r0 + d * dir)) row = r0 + d * dir;
          else if (d >= 4 && fits(r0 - (d - 3) * dir)) row = r0 - (d - 3) * dir;
        }
        if (row < 0) row = Math.max(0, Math.min(rows - 1, r0));
        taken.push([row, c0, c0 + L - 1, 1]);

        var y = row * ch + ch * 0.5, xs = [], ks = [], hot = false;
        if (c0 > 0 && !swm) occ[row * cols + c0 - 1] = 1;         /* по клетке пустоты слева и справа, */
        if (c0 + L < cols && !swm) occ[row * cols + c0 + L] = 1;  /* чтобы знак поля не прилипал к слову */
        for (var i = 0; i < L; i++) {
          xs.push((c0 + i + 0.5) * cw);
          ks.push(lensA > 0.01 ? lens(Math.hypot(xs[i] - ptr.x, y - ptr.y)) : 1);
          if (ks[i] > 1) hot = true;
        }
        var X = xs.slice();
        if (hot) {                                     /* точка строки под курсором стоит на месте, остальное раздвигается */
          var ax = Math.max(xs[0], Math.min(xs[L - 1], ptr.x)), ka = lens(Math.hypot(ax - ptr.x, y - ptr.y));
          var j = Math.min(L - 1, Math.max(0, Math.floor((ax - xs[0]) / cw)));
          X[j] = ax - (ax - xs[j]) * (ks[j] + ka) / 2;
          if (j + 1 < L) X[j + 1] = ax + (xs[j + 1] - ax) * (ka + ks[j + 1]) / 2;
          for (i = j + 2; i < L; i++) X[i] = X[i - 1] + cw * (ks[i - 1] + ks[i]) / 2;
          for (i = j - 1; i >= 0; i--) X[i] = X[i + 1] - cw * (ks[i] + ks[i + 1]) / 2;
          var over = Math.max(0, X[L - 1] + ks[L - 1] * cw / 2 - W) - Math.max(0, ks[0] * cw / 2 - X[0]);
          if (over) for (i = 0; i < L; i++) X[i] -= over;          /* раздвинутое слово не уходит за край */
        }
        var color = isCase ? 'rgba(224,112,58,' + alpha + ')' : 'rgba(160,163,169,' + alpha * 0.9 * (EDGE ? Math.min(1, EDGE.glow[o.k] * 1.3) : 1) + ')';
        for (i = 0; i < L; i++) {
          if (swm) {                                   /* смена подписи: буквы сходятся к середине своей строки и роятся — */
            var lc = (X[0] + X[L - 1]) / 2;            /* только по горизонтали, уровень строки не меняется (09.10) */
            var jx = Math.sin(t * 9 + i * 2.1 + o.k) * cw * 0.9, jy = Math.cos(t * 7.7 + i * 1.3 + o.k * 0.7) * ch * 0.22;   /* чуть по высоте, около своей строки */
            var g = chars[i] === ' ' ? ' ' : (Math.random() < swm.s * 0.55 ? RAMP[4 + Math.floor(Math.random() * 6)] : chars[i]);
            if (g !== ' ') out.push([g, X[i] + (lc - X[i]) * swm.w + jx * swm.s, y + jy * swm.s, ks[i], color, isCase]);
            continue;
          }
          var k = ks[i], hw = k * cw / 2, hh = k * ch / 2;
          var x0 = Math.max(0, Math.ceil((X[i] - hw) / cw - 0.5)), x1 = Math.min(cols - 1, Math.floor((X[i] + hw) / cw - 0.5));
          var y0 = Math.max(0, Math.ceil((y - hh) / ch - 0.5)), y1 = Math.min(rows - 1, Math.floor((y + hh) / ch - 0.5));
          for (var yy = y0; yy <= y1; yy++) for (var xx = x0; xx <= x1; xx++) occ[yy * cols + xx] = 1;
          if (chars[i] !== ' ') out.push([chars[i], X[i], y, k, color, isCase]);
        }
      });
      return out;
    }

    function drawLabels(list) {
      if (!list.length) return;
      list.sort(function (p, q) { return p[3] - q[3]; });           /* крупные — поверх */
      ctx.textAlign = 'center';
      var font = '';
      for (var i = 0; i < list.length; i++) {
        var l = list[i], f = (l[5] ? '500 ' : '400 ') + (FS * l[3]).toFixed(1) + 'px "Geist Mono", monospace';
        if (f !== font) { ctx.font = font = f; }
        ctx.fillStyle = l[4];
        ctx.fillText(l[0], l[1], l[2]);
      }
      ctx.textAlign = 'left';
      ctx.font = FS + 'px "Geist Mono", monospace';
    }

    function frame(now) {
      if (dead) return;
      if (!running || !visible) { looping = false; return; }
      if (needLayout) { needLayout = false; layout(); }
      var t = REDUCED ? T_STILL : (now - t0) / 1000;
      /* темп первого экрана (08.10, «то же, но быстрее»): сборка 0,6 с, пауза до 1,9 с, отъезд вбок 0,9 с; было 1,35 / 4,0 / 1,4 */
      var e = 1 - Math.pow(1 - Math.min(1, t / 0.6), 3);
      var f = fly ? Math.max(0, Math.min(1, (t - 1.9) / 0.9)) : 0;
      f = f * f * (3 - 2 * f);
      var breathe = REDUCED ? 1 : 1 + 0.028 * Math.sin(t * 0.9), rot = REDUCED ? 0 : 0.10 * Math.sin(t * 0.27);

      buf.fill(0); acc.fill(0);
      if (bgLines) {
        for (var y = 0; y < rows; y++) for (var x = 0; x < cols; x++) {
          var nx = (x - cols / 2) / cols * 2, ny = (y - rows / 2) / rows * 2, d = Math.hypot(nx * 1.6, ny);
          var w = Math.sin(d * 7.5 - t * 0.5 + Math.sin(nx * 2.2 + t * 0.17) * 0.8);
          buf[y * cols + x] += Math.max(0, w) * 0.30 * (1 - Math.min(1, d * 0.55));
        }
      }

      var scale = (0.20 + 0.80 * e) * breathe * (1 - 0.34 * f);
      var cx = W * (0.5 + (opts.flyTo || 0.22) * f), cy = H * 0.5;
      var BW = W, BH = H, gs = 1;
      if (GROW) { if (!REDUCED) growStep(t, Math.min(0.05, Math.max(0, t - (GROW.lt || t)))); GROW.lt = t;
        BW = GROW.W0 || W; BH = GROW.H0 || H; cx += GROW.ox; cy += GROW.oy; }   /* центр — середина коробки */
      var gx = GROW ? 1 + (GROW.rw - 1) * GROW.g : 1, gy = GROW ? 1 + (GROW.rh - 1) * GROW.g : 1;
      var rx = Math.min(BW * (opts.rx || 0.30), 520) * scale * gx, ry = Math.min(BH * (opts.ry || 0.34), 330) * scale * gy;
      var ca = Math.cos(rot), sa = Math.sin(rot), alpha = 1 - 0.55 * f;
      var dt = Math.min(0.1, Math.max(0, t - lastT)); lastT = t;
      lensA = REDUCED ? (ptr.on ? 1 : 0) : lensA + ((ptr.on ? 1 : 0) - lensA) * Math.min(1, dt * (ptr.on ? 8 : 1.6));
      var hb = 784, hi = -1;                           /* ближайшая к курсору точка облака, в пределах 28 px */
      if (EDGE && REDUCED) for (var sg = 0; sg < EDGE.glow.length; sg++) EDGE.glow[sg] = set.nodes[sg].kind === 'case' ? 0 : STILL_GLOW;   /* методы видны все, своими названиями */
      if (EDGE && t > 0.55 && !REDUCED) {
        if (t >= EDGE.next) {
          EDGE.pulses.push({ e: Math.floor(Math.random() * set.edges.length), t0: t, dur: 1.1 + Math.random() * 0.6, h: 0 });
          EDGE.next = t + 0.3 + Math.random() * 0.45;
        }
        for (var g = 0; g < EDGE.glow.length; g++) EDGE.glow[g] *= Math.exp(-dt / 1.5);
        EDGE.pulses = EDGE.pulses.filter(function (q) {
          q.h = (t - q.t0) / q.dur;
          if (q.h >= 1 + TRAIL) return false;
          if (q.h >= 1 && !q.hit) {                    /* удар по серой точке (09.10): погасшая (ниже порога) — новая подпись сразу; */
            q.hit = true; var mk = set.edges[q.e][1], src = set.edges[q.e][0];   /* видимая: 2-й удар подсвечивает, 3-й меняет перемешиванием */
            if (EDGE.glow[mk] < GRAY_FADE || !EDGE.text[mk]) { EDGE.text[mk] = chooseText(src, mk, t); EDGE.hits[mk] = 1; EDGE.msw[mk] = null; }
            else if (!EDGE.msw[mk] && ++EDGE.hits[mk] >= 3) { EDGE.msw[mk] = { start: t, to: chooseText(src, mk, t, EDGE.text[mk]) }; EDGE.hits[mk] = 1; }
            EDGE.glow[mk] = 1;
          }
          return true;
        });
      }

      for (var i = 0; i < set.points.length; i++) {
        var p = set.points[i], j = (1 - e) * e * 0.9;
        var px = p[0] + Math.sin(p[0] * 91.7 + p[1] * 13.3) * j;
        var py = p[1] + Math.cos(p[0] * 37.1 + p[1] * 71.9) * j;
        var wgt = p[2];
        if (EDGE) {
          if (EDGE.e[i] >= 0) {                        /* точка ребра светится только в хвосте вспышки и мельтешит */
            wgt = 0;
            for (var q = 0; q < EDGE.pulses.length; q++) {
              var P = EDGE.pulses[q], back = P.h - EDGE.u[i];
              if (P.e === EDGE.e[i] && back >= 0 && back < TRAIL) wgt = Math.max(wgt, (1 - back / TRAIL) * (0.5 + Math.random() * 1.1));
            }
          } else if (EDGE.m[i] >= 0) wgt = p[2] * EDGE.glow[EDGE.m[i]];
        }
        var SX = cx + (px * ca - py * sa) * rx, SY = cy + (px * sa + py * ca) * ry;
        if (SP) { SP[i * 2] = SX; SP[i * 2 + 1] = SY;
          if (ptr.on && (set.hoverNames || set.cornerNames)) { var hd = (SX - ptr.x) * (SX - ptr.x) + (SY - ptr.y) * (SY - ptr.y); if (hd < hb) { hb = hd; hi = i; } } }
        if (wgt > 0) put(buf, Math.round(SX / cw), Math.round(SY / ch), wgt * 1.35 * alpha);
      }
      for (var li = 0; li < LINKPTS.length; li++) {
        var L = LINKPTS[li];
        put(buf, Math.round((cx + (L[0] * ca - L[1] * sa) * rx) / cw), Math.round((cy + (L[0] * sa + L[1] * ca) * ry) / ch), 0.42 * 1.35 * alpha * e);
      }
      if (EDGE) EDGE.pulses.forEach(function (P) {         /* голова вспышки — самый яркий знак */
        if (P.h > 1) return;
        var A = set.nodes[set.edges[P.e][0]], B = set.nodes[set.edges[P.e][1]];
        var hx = A.x + (B.x - A.x) * P.h, hy = A.y + (B.y - A.y) * P.h;
        put(buf, Math.round((cx + (hx * ca - hy * sa) * rx) / cw), Math.round((cy + (hx * sa + hy * ca) * ry) / ch), (1.4 + Math.random() * 1.6) * alpha);
      });
      if (set.nodes) set.nodes.forEach(function (n) {
        if (n.kind !== 'case') return;
        put(acc, Math.round((cx + (n.x * ca - n.y * sa) * rx) / cw), Math.round((cy + (n.x * sa + n.y * ca) * ry) / ch), 2.0 * alpha);
      });

      occ.fill(0);
      if (!REDUCED) swarmStep(t);
      var lab = placeLabels(cx, cy, rx, ry, ca, sa, alpha, t);

      ctx.fillStyle = opts.bgColor || '#121315'; ctx.fillRect(0, 0, W, H);
      if (NAMES && hi >= 0 && hi !== npLast && t - npLastT > 0.12 && !REDUCED) {   /* новое касание — новая строка таблицы */
        var openNow = GROW && GROW.open && GROW.g > 0.85;
        var kind = openNow && set.cornerNames ? 1 : (set.hoverNames ? 0 : -1);
        if (kind >= 0) { npSpawn(hi, SP[hi * 2], SP[hi * 2 + 1], t, kind); npLast = hi; npLastT = t; }
      }
      if (!ptr.on) npLast = -1;
      drawNames(t, 0);
      ctx.textBaseline = 'middle';
      var big = [];
      for (var yy = 0; yy < rows; yy++) for (var xx = 0; xx < cols; xx++) {
        var ii = yy * cols + xx, v = buf[ii], a = acc[ii];
        if ((v < 0.06 && a < 0.06) || occ[ii]) continue;
        var gx = xx * cw, gy = yy * ch + ch * 0.5;
        if (lensA > 0.01) { var dd = Math.hypot(gx - ptr.x, gy - ptr.y); if (dd < LR) { big.push([gx, gy, v, a, dd]); continue; } }
        glyph(gx, gy, v, a, 1);
      }
      big.sort(function (p, q) { return q[4] - p[4]; });
      big.forEach(function (b) { glyph(b[0], b[1], b[2], b[3], lens(b[4])); });
      drawLabels(lab);
      drawNames(t, 1);
      if (REDUCED && NAMES && hi >= 0 && (set.hoverNames || set.cornerNames)) {   /* название под курсором — на месте, без полёта */
        ctx.save(); ctx.textBaseline = 'middle'; ctx.textAlign = 'center'; ctx.lineJoin = 'round';
        ctx.font = '500 ' + (FS - 2) + 'px "Geist", sans-serif'; ctx.fillStyle = '#E8E6E1'; ctx.strokeStyle = opts.bgColor || '#121315';
        npText({ i: hi }, SP[hi * 2], SP[hi * 2 + 1] - 14, 1.15, 1, 0, 0.85); ctx.restore();
      }

      if (opts.onPhase) opts.onPhase(t);
      if (REDUCED) { looping = false; return; }          /* следующий кадр — по событию */
      requestAnimationFrame(frame);
    }

    /* мышь слушаем на родителе холста: текст и кнопки поверх поля (имя в хиро, «Кем быть» в облаке) не глушат лупу */
    var host = canvas.parentNode || canvas;
    host.addEventListener('pointermove', function (ev) {
      var r = canvas.getBoundingClientRect();
      ptr.x = ev.clientX - r.left; ptr.y = ev.clientY - r.top; ptr.on = true;
      if (REDUCED && running && visible) loop();
    });
    host.addEventListener('pointerleave', function () { ptr.on = false; if (REDUCED && running && visible) loop(); });
    addEventListener('resize', function () { needLayout = true; if (REDUCED && running && visible) loop(); });
    if (opts.grow && window.ResizeObserver) new ResizeObserver(function () { needLayout = true; if (REDUCED && running && visible) loop(); }).observe(canvas);

    function loop() { if (!looping) { looping = true; requestAnimationFrame(frame); } }
    if (window.IntersectionObserver) new IntersectionObserver(function (es) {
      visible = es[es.length - 1].isIntersecting; if (visible && running) loop();
    }).observe(canvas);
    this.start = function () { if (!layout()) return; running = true; t0 = performance.now(); loop(); };
    this.set = set;
  }

  document.fonts.ready.then(function () {
    var hero = new Field(document.getElementById('hero-c'), { set: 'graph', labels: true, fly: true, lang: document.documentElement.lang || 'ru' });
    hero.start();
    var t = document.getElementById('hero-t');
    setTimeout(function () { t.classList.add('on'); }, REDUCED ? 0 : 2200);   /* текст — в середине отъезда, как раньше */

    /* облако запускается, только когда доезжает до экрана */
    var cc = document.getElementById('cloud-c');
    var cloud = new Field(cc, { set: 'cloud', fly: false, bg: false, rx: 0.22, ry: 0.30, fs: 11, bgColor: '#17181B', grow: true });
    window.CLOUD = cloud;
    var started = false;
    new IntersectionObserver(function (es) {
      es.forEach(function (en) { if (en.isIntersecting && !started) { started = true; cloud.start();
        var c = cloud.set;
        var cp = document.getElementById('cloud-p');
        if (!cp.textContent.trim()) cp.innerHTML = c.source +
          ' · две главные компоненты: ' + (c.axes.share[0] * 100).toFixed(1) + '% + ' + (c.axes.share[1] * 100).toFixed(1) + '% дисперсии';
      } });
    }, { threshold: 0.25 }).observe(cc);

    /* появление секций и тень у навигации */
    var io = new IntersectionObserver(function (es) {
      es.forEach(function (en) { if (en.isIntersecting) { en.target.classList.add('in'); io.unobserve(en.target); } });
    }, { threshold: 0.15, rootMargin: '0px 0px -8% 0px' });
    document.querySelectorAll('.rise').forEach(function (el) { io.observe(el); });
    addEventListener('scroll', function () { document.getElementById('nav').classList.toggle('stuck', scrollY > 24); }, { passive: true });
  });
})();

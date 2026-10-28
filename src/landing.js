/* 09.10: толчок. held() → false: страница едет; 'busy': прокрутку съели, не толкаем; true: съели и толкаем.
   p растёт от колеса и рисуется в --push; p ≥ 1 — done(). 10.10: один шаг колеса (щелчок мыши — 100 px, трекпад — мелкие
   события) считается не больше STEP px, иначе щелчок мыши перепрыгивал порог и ничего не было видно; T — сколько таких
   пикселей до ухода (T/STEP ≈ число щелчков). Пауза дольше 1,4 с — пружиной к 0 (как у мозга 09.10); до паузы толчки копятся. */
var STEP = 34, PAUSE = 1400;
var NAV = function () { var n = document.getElementById('nav'); return n ? n.offsetHeight : 0; };
function Hold(el, T, held, done, fall, dir, paint) {   /* fall 0..1: сопротивление падает с p — первый толчок самый тугой, дальше легче;
   dir −1 — ловит колесо вверх (10.10, обратный ход); paint(p) — своя отрисовка вместо --push = p */
  var p = 0, last = 0, raf = 0, ty = 0; dir = dir || 1;
  function draw() { if (paint) paint(p); else el.style.setProperty('--push', p.toFixed(3)); }
  function relax() { raf = 0; if (performance.now() - last < PAUSE) { raf = requestAnimationFrame(relax); return; }
    p *= 0.85; if (p < 0.005) p = 0; draw(); if (p) raf = requestAnimationFrame(relax); }
  function push(dy) { last = performance.now(); p = Math.min(1, p + Math.min(dy, STEP) / (T * (1 - (fall || 0) * p))); draw();
    if (p >= 1) { done(); p = 0; last = 0; if (!raf) raf = requestAnimationFrame(relax); return; }   /* --push остаётся 1 на момент done(): уход продолжает сдвиг, а не прыгает с нуля; потом пружиной к 0 */ if (!raf) raf = requestAnimationFrame(relax); }
  function guard(e, dy) { var h = held(); if (h === false) return; e.preventDefault(); if (h === 'busy') return; push(dy); }
  var KEYS = dir > 0 ? ['ArrowDown', 'PageDown', 'End', ' '] : ['ArrowUp', 'PageUp', 'Home'];
  addEventListener('wheel', function (e) { if (e.deltaY * dir > 0) guard(e, Math.abs(e.deltaY)); }, { passive: false });
  addEventListener('keydown', function (e) { if (KEYS.indexOf(e.key) >= 0 && e.target === document.body) guard(e, /^Arrow/.test(e.key) ? 50 : 120); });
  addEventListener('touchstart', function (e) { ty = e.touches[0].clientY; }, { passive: true });
  addEventListener('touchmove', function (e) { var d = (ty - e.touches[0].clientY) * dir; if (d > 2) { ty = e.touches[0].clientY; guard(e, d * 1.5); } }, { passive: false });
  return { reset: function () { p = 0; draw(); } };
}
/* кейсы: один открыт — он крупнее, остальные тише; открытие одного закрывает другие; вложенные «+» в проектах — как раньше */
function setCase(card, open) {
  var list = card.closest('.cases'), t = card.querySelector('button.case__t'), m = card.querySelector('.case__more'); if (!t || !m) return;
  var y0 = t.getBoundingClientRect().top;   /* 28.10: нажатый заголовок остаётся на месте экрана — иначе закрытый длинный кейс выше уводит открытый вверх */
  list.querySelectorAll('.case.open').forEach(function (c) { if (c === card) return;
    c.classList.remove('open'); c.querySelector('.case__more').hidden = true; c.querySelector('button.case__t').setAttribute('aria-expanded', 'false'); });
  card.classList.toggle('open', open); m.hidden = !open; t.setAttribute('aria-expanded', open ? 'true' : 'false');
  list.classList.toggle('focus', open);
  pin(t, y0);
}
/* держит элемент на y0 по экрану, пока идут переходы кейсов (h3 .4s, scale .5s): закрытый заголовок выше сжимается ещё ~16 px;
   прокрутка мгновенная — html{scroll-behavior:smooth} вёл бы поправку видимо; колесо, касание или клавиша — отпускаем */
var pinRaf = 0;
function pin(el, y0) {
  var end = performance.now() + 600;
  function stop() { cancelAnimationFrame(pinRaf); pinRaf = 0; }
  function step() { var d = el.getBoundingClientRect().top - y0; if (Math.abs(d) >= 0.5) scrollBy({ top: d, behavior: 'instant' });
    pinRaf = performance.now() < end ? requestAnimationFrame(step) : 0; }
  stop(); step();
  ['wheel', 'touchstart', 'keydown'].forEach(function (k) { addEventListener(k, stop, { once: true, passive: true }); });
}
document.addEventListener('click', function (ev) {          /* 28.10: ссылки «Других проектов» видны сразу, «+» остался только у кейсов */
  var a = ev.target.closest('a.tocase');
  if (a) { var c = document.getElementById(a.getAttribute('href').slice(1)); if (c) setCase(c, true); return; }
  var b = ev.target.closest('button.case__t'); if (!b) return;
  var card = b.closest('.case'); setCase(card, card.querySelector('.case__more').hidden);
});
/* «Кем быть»: «+» у заголовка раскрывает описание и облако; при прокрутке вниз раскрытое сначала
   сворачивается, потом страница едет; свёрнутое само не раскрывается (08.10) */
(function () {
  var sec = document.getElementById('space'), btn = sec && sec.querySelector('button.space__name'); if (!btn) return;
  var more = sec.querySelector('.space__more'), box = sec.querySelector('.cloudbox'), open = false, busy = 0, h0 = 0, lastY = scrollY, ty = 0;
  var M = 48;                                          /* маргин от шапки сайта сверху и от края окна снизу */
  function set(o) {
    if (!h0) h0 = box.getBoundingClientRect().height;
    open = o; btn.setAttribute('aria-expanded', o ? 'true' : 'false');
    more.style.height = o ? more.scrollHeight + 'px' : '0px';
    var F = Math.max(1.2, Math.min(1.7, innerHeight * 0.78 / h0));   /* облако и коробка растут в одной пропорции */
    box.style.height = (o ? h0 * F : h0) + 'px';
    if (window.CLOUD) CLOUD.open(o ? F : 0, o ? F : 0);
    busy = performance.now() + 800;
  }
  btn.addEventListener('click', function () { set(!open); });
  /* выход: открытое едет, пока верх не дошёл до шапки + M или низ до края − M; потом колесо толкает (T 80 ≈ три щелчка,
     первый толчок самый тугой, дальше легче), пауза дольше 1,4 с — вернулось; дотолкал — закрылось */
  Hold(box, 80, function () {
    if (!open) return performance.now() < busy ? 'busy' : false;
    var r = box.getBoundingClientRect();
    if (r.bottom <= 0) return false;
    if (r.top > NAV() + M && r.bottom > innerHeight - M) return false;
    return true;
  }, function () { set(false); }, 0.6);
  addEventListener('scroll', function () { var dy = scrollY - lastY; lastY = scrollY; if (window.CLOUD) CLOUD.nudge(dy); }, { passive: true });
})();

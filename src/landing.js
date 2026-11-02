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
/* Запуск полей (перенесено из field.js 02.11, чтобы движок жил и на странице теста). Облако «Кем быть» — свёрнутое, без
   раскрытия и толчков (его решение 02.11): только знаки и лупа; в центре ссылка на тест. */
(function () {
  var REDUCED = window.FIELD_REDUCED;
  document.fonts.ready.then(function () {
    var hero = new Field(document.getElementById('hero-c'), { set: 'graph', labels: true, fly: true, lang: document.documentElement.lang || 'ru' });
    hero.start();
    var t = document.getElementById('hero-t');
    setTimeout(function () { t.classList.add('on'); }, REDUCED ? 0 : 2200);   /* текст — в середине отъезда, как раньше */

    /* облако запускается, только когда доезжает до экрана */
    var cc = document.getElementById('cloud-c');
    if (cc) {
      var cloud = new Field(cc, { set: 'cloud', fly: false, bg: false, rx: 0.22, ry: 0.30, fs: 11, bgColor: '#17181B' });
      var started = false;
      new IntersectionObserver(function (es) {
        es.forEach(function (en) { if (en.isIntersecting && !started) { started = true; cloud.start();
          var c = cloud.set, cp = document.getElementById('cloud-p');
          if (!cp.textContent.trim()) cp.innerHTML = c.source +
            ' · две главные компоненты: ' + (c.axes.share[0] * 100).toFixed(1) + '% + ' + (c.axes.share[1] * 100).toFixed(1) + '% дисперсии';
        } });
      }, { threshold: 0.25 }).observe(cc);
    }

    /* появление секций и тень у навигации */
    var io = new IntersectionObserver(function (es) {
      es.forEach(function (en) { if (en.isIntersecting) { en.target.classList.add('in'); io.unobserve(en.target); } });
    }, { threshold: 0.15, rootMargin: '0px 0px -8% 0px' });
    document.querySelectorAll('.rise').forEach(function (el) { io.observe(el); });
    addEventListener('scroll', function () { document.getElementById('nav').classList.toggle('stuck', scrollY > 24); }, { passive: true });
  });
})();

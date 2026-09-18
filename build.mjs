#!/usr/bin/env node
// caerno-site — личный сайт-визитка с ДИНАМИЧЕСКОЙ упаковкой (линзами).
// data/profile.json + data/packagings.json + data/cases/*.json -> dist/
// Пока посетитель не щёлкнул линзу — хиро прокручивает упаковки; клик фиксирует.
// #as=<id> в URL открывает сразу нужную упаковку (ссылка под конкретную вакансию).
// Билдер унаследован от polit-linkedin. Зависимостей нет; JS — один инлайн-скрипт.

import { readdir, readFile, writeFile, mkdir, copyFile, rm } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(fileURLToPath(import.meta.url));
const DATA = join(ROOT, 'data');
const DIST = join(ROOT, 'dist');

// Порядок подачи в фоновом ряду и на страницах кейсов.
const ORDER = ['healthcare', 'forensic-finance', 'wiki-governance', 'edtech', 'wikipedia-infra'];


// ── Локализация ─────────────────────────────────────────────────────────
// Английский — канон и лежит в самих данных. Русский — плоский оверлей
// data/i18n/ru.json по ключам вида role.judge.owns. Нет перевода — молча
// берётся английский, страница не разваливается. Страницы собираются дважды:
// dist/ (en) и dist/ru/, переключатель — обычная ссылка, без JS.
let LANG = 'en';
let TR = {};
const t = (key, en) => (LANG === 'ru' && TR[key] ? TR[key] : en);

const { ui: UI, methods: METHODS } = JSON.parse(
  await readFile(new URL('./data/ui.json', import.meta.url), 'utf8')
);
const u = (k) => UI[k][LANG];

const esc = (s) =>
  String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

function renderBlocks(blocks, slug) {
  const rows = blocks
    .map(
      (b, i) => `
        <div class="kv__row">
          <span class="kv__label">${esc(t(`case.${slug}.blk.${i}.label`, b.label))}</span>
          <p class="kv__text">${esc(t(`case.${slug}.blk.${i}.text`, b.text))}</p>
        </div>`
    )
    .join('');
  return `<div class="kv">${rows}</div>`;
}

function renderMethods(c, all) {
  const rows = c.methods
    .map((m) => {
      const others = all.filter((o) => o.slug !== c.slug && o.methods.includes(m));
      const links = others
        .map((o) => `<a href="./${esc(o.slug)}.html">${esc(t(`case.${o.slug}.domain`, o.domain))}</a>`)
        .join(', ');
      return `<span>◆ ${esc(t(`method.${m}`, METHODS[m] ?? m))}${links ? ` · ${LANG === 'ru' ? 'также' : 'also'}: ` + links : ''}</span>`;
    })
    .join('\n');
  return `<div class="methods">${rows}</div>`;
}

function renderCard(c, all, { linked, hidden }) {
  const name = (t(`case.${c.slug}.title`, c.title.join('|')) || '').split('|').map(esc).join('<br>');
  const heading = linked ? `<a href="./${esc(c.slug)}.html">${name}</a>` : name;
  const extLinks = (c.links ?? [])
    .map((l, i) => `<a href="${esc(l.url)}">${esc(t(`case.${c.slug}.link.${i}`, l.label))} ↗</a>`)
    .join('\n        ');

  return `
    <article class="card case-full${hidden ? ' is-hidden' : ''}" data-slug="${esc(c.slug)}">
      <div class="card__strip">
        <span>${esc(t(`case.${c.slug}.domain`, c.domain))}</span>
        <span>${esc(t(`case.${c.slug}.period`, c.period))}</span>
      </div>

      <div class="card__head">
        <h2 class="card__name">${heading}</h2>
        <p class="card__dates">${esc(t(`case.${c.slug}.org`, c.org))}</p>
        <p class="card__why">${esc(t(`case.${c.slug}.tagline`, c.tagline))}</p>
      </div>

      ${renderBlocks(c.blocks, c.slug)}
      ${renderMethods(c, all)}

      <div class="card__foot">
        ${extLinks || `<a href="./index.html">← ${u('allEng')}</a>`}
      </div>
    </article>`;
}

// Компактная карточка для фонового ряда («вторым рядом, мельче»).
function renderMini(c, { hidden }) {
  return `
    <article class="mini case-mini${hidden ? ' is-hidden' : ''}" data-slug="${esc(c.slug)}">
      <div class="card__strip">
        <span>${esc(t(`case.${c.slug}.domain`, c.domain))}</span>
        <span>${esc(t(`case.${c.slug}.period`, c.period))}</span>
      </div>
      <h3 class="mini__name"><a href="./${esc(c.slug)}.html">${esc(t(`case.${c.slug}.title`, c.title.join(' ')).replace('|', ' '))}</a></h3>
      <p class="mini__tag">${esc(t(`case.${c.slug}.tagline`, c.tagline))}</p>
    </article>`;
}

// ── Crew: двенадцать кресел ─────────────────────────────────────────────
// Один и тот же набор данных читается двумя способами. Основателю — карта
// оргструктуры (что кресло держит, что ломается без него, кого сажать рядом).
// Нанимателю — покрытие: covered / partial / open seat + доказательства.
// Второе не мешает первому только потому, что это ДАННЫЕ (значок + ссылка),
// а не проза о себе.
//
// Раскрытие — нативный <details> НА МЕСТЕ карточки: ширина сохраняется,
// соседи отодвигаются вниз, ничего не перекрывается. Плавающих окон нет:
// они загораживали соседние карточки и требовали своего менеджера состояния.
// Побочный выигрыш — работает без единой строки JS, с клавиатуры и в поиске.

const coverage = () => ({
  covered:   { label: u('covered'),  note: u('covNote') },
  partial:   { label: u('partial'),  note: u('parNote') },
  uncovered: { label: u('openSeat'), note: u('openNote') },
});

function renderRoleDetail(role, caseMap) {
  const cov = coverage()[role.coverage] ?? coverage().partial;

  const facts = [
    [u('owns'), t(`role.${role.id}.owns`, role.owns)],
    [u('measured'), t(`role.${role.id}.measured`, role.measured)],
    [u('empty'), t(`role.${role.id}.empty`, role.empty)],
    [u('grades'), t(`role.${role.id}.grades`, role.grades)],
  ]
    .map(
      ([label, text]) => `
        <div class="kv__row">
          <span class="kv__label">${esc(label)}</span>
          <p class="kv__text">${esc(text)}</p>
        </div>`
    )
    .join('');

  const evidence = role.evidence
    .map((e, i) => {
      const link = e.case && caseMap[e.case]
        ? ` <a href="./${esc(e.case)}.html">${esc(caseMap[e.case])} ↗</a>`
        : '';
      return `<li>${esc(t(`role.${role.id}.ev.${i}`, e.text))}${link}</li>`;
    })
    .join('\n          ');

  return `
      <div class="kv">${facts}</div>

      <p class="role__kit">${role.kit.map((k, i) => `◇ ${esc(t(`role.${role.id}.kit.${i}`, k))}`).join(' &nbsp;')}</p>

      <div class="role__cov">
        <span class="kv__label">${u('myCoverage')} — ${esc(cov.label)}</span>
        <ul class="ev">
          ${evidence}
        </ul>
        <p class="role__limit"><b>${u('whereStop')}</b> ${esc(t(`role.${role.id}.limit`, role.limit))}</p>
      </div>

      <div class="role__comp">
        <span class="kv__label">${u('compSeat')}</span>
        <p class="role__compname">${esc(t(`role.${role.id}.comp.seat`, role.complement.seat))}</p>
        <p class="kv__text">${esc(t(`role.${role.id}.comp.why`, role.complement.why))}</p>
        <p class="role__when">${u('fillIt')} ${esc(t(`role.${role.id}.comp.when`, role.complement.when))}</p>
      </div>`;
}

// Карточка ростера = <details>. Заголовок кликабелен, разворот идёт вниз
// внутри той же колонки. Ссылка «open as page» ведёт на настоящую страницу.
function renderRoleCard(role, caseMap) {
  const cov = coverage()[role.coverage] ?? coverage().partial;
  return `
      <details class="rolecard cov--${esc(role.coverage)}" id="seat-${esc(role.id)}" data-seat="${esc(role.id)}">
        <summary>
          <span class="rolecard__top">
            <span class="rolecard__sigil" aria-hidden="true">${role.emoji}</span>
            <span class="rolecard__badge">${esc(cov.label)}</span>
          </span>
          <span class="rolecard__name">${esc(t(`role.${role.id}.seat`, role.seat))}</span>
          <span class="rolecard__owns">${esc(t(`role.${role.id}.owns`, role.owns))}</span>
          <span class="rolecard__comp">${u('compSeat')}: ${esc(t(`role.${role.id}.comp.seat`, role.complement.seat))}</span>
          <span class="rolecard__more">${u('details')} ▾</span>
        </summary>
        <div class="rolecard__body">
${renderRoleDetail(role, caseMap)}
          <p class="rolecard__page"><a href="./crew-${esc(role.id)}.html">${u('ownPage')}</a></p>
        </div>
      </details>`;
}

// Единственное, что осталось от скрипта: адрес запоминает, какие кресла
// раскрыты, чтобы ссылку можно было кинуть прицельно. Позиции и размеры
// в историю по-прежнему не пишутся; без JS страница полностью рабочая.
const SEAT_SCRIPT = `
<script>
(function () {
  var all = Array.prototype.slice.call(document.querySelectorAll('details[data-seat]'));
  function sync() {
    var open = all.filter(function (d) { return d.open; }).map(function (d) { return d.dataset.seat; });
    history.replaceState(null, '', open.length ? '#seat=' + open.join(',') : location.pathname);
  }
  function apply() {
    var m = /#seat=([a-z0-9,\\-]+)/i.exec(location.hash);
    var want = m ? m[1].split(',') : [];
    all.forEach(function (d) { d.open = want.indexOf(d.dataset.seat) >= 0; });
    // Пришедший по дип-линку должен увидеть, что именно открылось, а не шапку.
    var first = want.length && document.getElementById('seat-' + want[0]);
    if (first) first.scrollIntoView({ block: 'start' });
  }
  all.forEach(function (d) { d.addEventListener('toggle', sync); });
  // Панель лежит поверх страницы — значит нужен привычный способ её убрать.
  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Escape') return;
    var open = all.filter(function (d) { return d.open; });
    if (!open.length) return;
    var last = open[open.length - 1];
    last.open = false;
    last.querySelector('summary').focus();
  });
  window.addEventListener('hashchange', apply);
  if (location.hash) apply();
})();
</script>`;

// Favicon: срезанный угол карточки + DK, инлайн-SVG (без отдельного файла и 404).
const FAVICON =
  "data:image/svg+xml," +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><path d="M0 0H50L64 14V64H14L0 50Z" fill="#24486F"/><text x="32" y="43" font-family="monospace" font-size="26" font-weight="700" text-anchor="middle" fill="#F0EBDD">DK</text></svg>`
  );

function page({ title, description, body, file }) {
  const alt = LANG === 'ru' ? `../${file}` : `./ru/${file}`;
  return `<!doctype html>
<html lang="${LANG}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:type" content="profile">
<link rel="icon" href="${FAVICON}">
<link rel="stylesheet" href="./styles.css">
<link rel="alternate" hreflang="${LANG === 'ru' ? 'en' : 'ru'}" href="${alt}">
<link rel="alternate" hreflang="x-default" href="${LANG === 'ru' ? `../${file}` : `./${file}`}">
</head>
<body>
${body}
</body>
</html>
`;
}

async function main() {
  await rm(DIST, { recursive: true, force: true });
  await mkdir(DIST, { recursive: true });

  const profile = JSON.parse(await readFile(join(DATA, 'profile.json'), 'utf8'));
  const lenses = JSON.parse(await readFile(join(DATA, 'packagings.json'), 'utf8'));
  const files = (await readdir(join(DATA, 'cases'))).filter((f) => f.endsWith('.json'));
  const cases = [];
  for (const f of files) {
    cases.push(JSON.parse(await readFile(join(DATA, 'cases', f), 'utf8')));
  }
  cases.sort((a, b) => ORDER.indexOf(a.slug) - ORDER.indexOf(b.slug));

  const crew = JSON.parse(await readFile(join(DATA, 'roles.json'), 'utf8'));
  // Выведенное из данных — необязательный слой: нет файлов, сайт собирается как раньше.
  const readOpt = async (p) => { try { return JSON.parse(await readFile(join(DATA, p), 'utf8')); } catch { return null; } };
  const fits = await readOpt('fits.json');
  const mined = await readOpt('derived/lenses.json');
  const minedEdits = await readOpt('mined.json');
  const specs = await readOpt('derived/specs.json');
  const caseMap = Object.fromEntries(cases.map((c) => [c.slug, c.domain]));

  for (const lang of ['en', 'ru']) {
    LANG = lang;
    TR = lang === 'ru' ? (await readOpt('i18n/ru.json')) ?? {} : {};
    const OUT = lang === 'ru' ? join(DIST, 'ru') : DIST;
    await mkdir(OUT, { recursive: true });
    if (lang === 'ru') await writeFile(join(OUT, 'styles.css'), '@import url("../styles.css");');

  const def = lenses[0]; // дефолтная упаковка до включения JS / без JS

  const head = (meta, file = 'index.html') => `
  <header class="masthead">
    <h1 class="masthead__title"><a href="./index.html">${esc(t('profile.name', profile.name))} · ${u('masthead')}</a></h1>
    <div class="masthead__right">
      ${meta ? `<span class="masthead__meta">${esc(meta)}</span>` : ''}
      <a class="langsw" href="${LANG === 'ru' ? `../${file}` : `./ru/${file}`}" hreflang="${LANG === 'ru' ? 'en' : 'ru'}">${u('otherLang')}</a>
    </div>
  </header>`;

  const linkrow = `
  <nav class="linkrow">
${profile.links.map((l, i) => `    <a href="${esc(l.url)}">${esc(t(`profile.link.${i}`, l.label))} ↗</a>`).join('\n')}
  </nav>`;

  // Тексты добытых упаковок правятся руками в data/mined.json (майнер его не
  // перезаписывает); русский — в data/i18n/ru.json (lens.<id>.*). Никаких n/fit
  // и прочей кухни на страницу не выводить — это внутреннее.
  const minedLenses = (mined?.lenses ?? []).map((l) => ({ ...l, ...(minedEdits?.[l.id] ?? {}) }));
  const allLenses = [...lenses, ...minedLenses];
  const chip = (l, i) =>
    `<button type="button" class="lens${i === 0 ? ' lens--active' : ''}${l.source === 'mined' ? ' lens--data' : ''}" aria-pressed="${i === 0}" data-lens="${esc(l.id)}">${esc(t(`lens.${l.id}.label`, l.label))}</button>`;
  const chips = lenses.map(chip).join('\n      ');
  const minedRow = !minedLenses.length ? '' : `
  <nav class="lenses lenses--mined">
${minedLenses.map((l, i) => '      ' + chip(l, lenses.length + i)).join('\n')}
  </nav>`;

  const fitsCol = !fits ? '' : `
    <aside class="hero__fits">
      <p class="kv__label">${esc(t('fits.label', fits.label))}</p>
${fits.fits.map((f) => `
      <a class="fit" href="./crew.html#seat=${f.seats.join(',')}" data-fit="${esc(f.id)}" data-lens="${esc(f.lens)}">
        <span class="fit__name">${esc(t(`fit.${f.id}.label`, f.label))}</span>
        <span class="fit__line">${esc(t(`fit.${f.id}.line`, f.line))}</span>
        <span class="fit__go">${u('fitSeats')}</span>
      </a>`).join('\n')}
    </aside>`;

  const hero = `
  <section class="hero">
    <div class="hero__main">
    <p class="hero__role" id="lens-role">${esc(t(`lens.${def.id}.role`, def.role))}</p>
    <h2 class="hero__name">${profile.nameLines.map(esc).join('<br>')}</h2>
    <p class="hero__headline" id="lens-headline">${esc(t(`lens.${def.id}.headline`, def.headline))}</p>
    <p class="hero__status">${esc(t('profile.status', profile.status))}</p>
    <nav class="lenses">
      <span class="lenses__label">${u('viewAs')}</span>
      ${chips}
    </nav>
${minedRow}
    <p class="lede" id="lens-lede">${esc(t(`lens.${def.id}.lede`, def.lede))}</p>
    <p class="crewstrip" id="lens-crew"></p>
    </div>
${fitsCol}
  </section>`;

  const fulls = cases
    .map((c) => renderCard(c, cases, { linked: true, hidden: !def.featured.includes(c.slug) }))
    .join('\n');
  const minis = cases
    .map((c) => renderMini(c, { hidden: def.featured.includes(c.slug) }))
    .join('\n');

  // Автоплей — компромисс после ревью: крутятся только роль и тезис (8 с, пауза по
  // hover), лид и карточки переключаются ТОЛЬКО осознанным кликом. Клик фиксирует.
  const script = `
<script>
(function () {
  var LENSES = ${JSON.stringify(allLenses.map((l) => ({
    id: l.id, source: l.source, featured: l.featured,
    label: t(`lens.${l.id}.label`, l.label),
    role: t(`lens.${l.id}.role`, l.role),
    headline: t(`lens.${l.id}.headline`, l.headline),
    lede: t(`lens.${l.id}.lede`, l.lede),
    crew: l.crew ? { needs: l.crew.needs.map((r) => ({ coverage: r.coverage, emoji: r.emoji, seat: t(`role.${r.id}.seat`, r.seat) })) } : null,
  })))};
  var MANUAL = ${lenses.length};
  var $ = function (s) { return document.querySelector(s); };
  var roleEl = $('#lens-role'), hEl = $('#lens-headline'), lEl = $('#lens-lede'), cEl = $('#lens-crew');
  var MARKS = { covered: '●', partial: '◐', uncovered: '○' };
  var hero = $('.hero');
  var chips = Array.prototype.slice.call(document.querySelectorAll('.lens'));
  var fulls = Array.prototype.slice.call(document.querySelectorAll('.case-full'));
  var minis = Array.prototype.slice.call(document.querySelectorAll('.case-mini'));
  var idx = 0, timer = null, locked = false;

  function fade(el) { el.classList.remove('swapfade'); void el.offsetWidth; el.classList.add('swapfade'); }
  function setChips(i) {
    chips.forEach(function (c, j) {
      c.classList.toggle('lens--active', j === i);
      c.setAttribute('aria-pressed', j === i ? 'true' : 'false');
    });
  }
  function applyLite(i) {
    var L = LENSES[i];
    roleEl.textContent = L.role; hEl.textContent = L.headline;
    fade(roleEl); fade(hEl); setChips(i);
  }
  function applyFull(i) {
    applyLite(i);
    var L = LENSES[i];
    lEl.textContent = L.lede; fade(lEl);
    if (cEl) {
      if (L.crew) {
        cEl.innerHTML = L.crew.needs.map(function (r) {
          return '<span class="cov--' + r.coverage + '"><b>' + MARKS[r.coverage] + '</b> ' + r.emoji + ' ' + r.seat + '</span>';
        }).join('');
        cEl.classList.remove('is-hidden');
      } else { cEl.innerHTML = ''; cEl.classList.add('is-hidden'); }
      fade(cEl);
    }
    fulls.forEach(function (el) { el.classList.toggle('is-hidden', L.featured.indexOf(el.dataset.slug) < 0); });
    minis.forEach(function (el) { el.classList.toggle('is-hidden', L.featured.indexOf(el.dataset.slug) >= 0); });
  }
  function stop() { if (timer) { clearInterval(timer); timer = null; } }
  function start() {
    if (locked || timer || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    timer = setInterval(function () { idx = (idx + 1) % MANUAL; applyLite(idx); }, 8000);
  }

  for (var k = 0; k < LENSES.length; k++) {
    if (location.hash === '#as=' + LENSES[k].id) { idx = k; locked = true; }
  }
  if (locked) { applyFull(idx); } else { start(); }

  hero.addEventListener('mouseenter', stop);
  hero.addEventListener('mouseleave', start);
  chips.forEach(function (c, j) {
    c.addEventListener('click', function () {
      locked = true; stop();
      idx = j; applyFull(j); markFit(null);
      history.replaceState(null, '', '#as=' + LENSES[j].id);
    });
  });

  // Тип проекта — тот же переключатель, вход с другой стороны: посетитель
  // выбирает не «кем меня считать», а «что у него за проект». Выбор применяет
  // упаковку целиком: роль, тезис, лид и подборку кейсов.
  var fitEls = Array.prototype.slice.call(document.querySelectorAll('[data-fit]'));
  function markFit(id) {
    fitEls.forEach(function (el) { el.classList.toggle('fit--active', el.dataset.fit === id); });
  }
  fitEls.forEach(function (el) {
    el.addEventListener('click', function (e) {
      if (e.target.closest('.fit__go')) return;   // мелкая ссылка ведёт в ростер
      e.preventDefault();
      var j = -1;
      for (var q = 0; q < LENSES.length; q++) if (LENSES[q].id === el.dataset.lens) j = q;
      if (j < 0) return;
      locked = true; stop();
      idx = j; applyFull(j); markFit(el.dataset.fit);
      history.replaceState(null, '', '#fit=' + el.dataset.fit);
      document.querySelector('.cards').scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  });
  var fm = /#fit=([a-z0-9-]+)/i.exec(location.hash);
  if (fm) {
    var el0 = document.querySelector('[data-fit="' + fm[1] + '"]');
    if (el0) {
      for (var w = 0; w < LENSES.length; w++) if (LENSES[w].id === el0.dataset.lens) idx = w;
      locked = true; applyFull(idx); markFit(fm[1]);
    }
  }
})();
</script>`;

  const covCount = crew.roles.reduce((a, r) => ((a[r.coverage] = (a[r.coverage] ?? 0) + 1), a), {});
  const band = `
  <a class="band" href="./crew.html">
    <span class="band__label">${u('orgDoor')}</span>
    <span class="band__text">${esc(t('band.text', 'Twelve seats an AI product needs — what each owns, what breaks while it is empty, and who has to sit next to it.'))} ${crew.roles.length} ${u('seats')} · ${covCount.covered ?? 0} ${u('covered')} · ${covCount.partial ?? 0} ${u('partial')} · ${covCount.uncovered ?? 0} ${u('openCount')}.</span>
    <span class="band__go">→</span>
  </a>`;

  // Грейд заявлен далеко не везде. «unspecified·31» — не распределение, а шум,
  // поэтому: считаем только по тем вакансиям, где уровень назван, и если названо
  // меньше 40% — строку не показываем вообще (то же правило, что и для вилок).
  const gradeRow = (g) => {
    const total = Object.values(g).reduce((a, b) => a + b, 0);
    const stated = Object.entries(g).filter(([k]) => k !== 'unspecified');
    const n = stated.reduce((a, [, v]) => a + v, 0);
    if (!n || n / total < 0.4) return '';
    return `Level stated in ${n} of ${total}: ` + stated.sort((a, b) => b[1] - a[1])
      .map(([k, v]) => `${esc(k)} ${Math.round((v / n) * 100)}%`).join(' · ');
  };

  // Корпус здесь — инструмент, а не предмет. На странице не должно быть ни fit,
  // ни распределения грейдов, ни примеров чужих вакансий: это витрина аналитика.
  // Субъект каждой строки — экипаж и моё место в нём.
  const minedSection = '';

  const gallery = `
<div class="sheet">
${head('')}
${hero}
${linkrow}
${band}
  <div class="cards">
${fulls}
  </div>
  <p class="rowlabel">${u('alsoRecord')}</p>
  <div class="cards-mini">
${minis}
  </div>
  <p class="note">${esc(t('profile.note', profile.note))}</p>
${minedSection}
</div>
${script}`;

  await writeFile(
    join(OUT, 'index.html'),
    page({ title: `${profile.name} — ${t('profile.role', profile.role)}`, description: t(`lens.${def.id}.headline`, def.headline), body: gallery, file: 'index.html' })
  );

  for (const c of cases) {
    const body = `
<div class="sheet">
${head(t(`case.${c.slug}.domain`, c.domain), `${c.slug}.html`)}
  <div class="cards cards--single">
${renderCard(c, cases, { linked: false, hidden: false })}
  </div>
${linkrow}
</div>`;
    await writeFile(
      join(OUT, `${c.slug}.html`),
      page({ title: `${t(`case.${c.slug}.domain`, c.domain)} — ${profile.name}`, description: t(`case.${c.slug}.tagline`, c.tagline), body, file: `${c.slug}.html` })
    );
  }

  // ── Ростер команды + страница на кресло ──────────────────────────────
  const core = crew.roles.filter((r) => r.tier === 'core');
  const support = crew.roles.filter((r) => r.tier !== 'core');

  const legend = Object.entries(coverage())
    .map(
      ([key, v]) =>
        `<span class="legend__item cov--${esc(key)}"><b>${esc(v.label)}</b> — ${esc(v.note)}</span>`
    )
    .join('\n      ');

  const roster = (list) => `<div class="roster">${list.map((r) => renderRoleCard(r, caseMap)).join('\n')}\n  </div>`;

  const crewBody = `
<div class="sheet">
${head(u('twelve'), 'crew.html')}

  <section class="hero hero--crew">
    <p class="hero__role">${esc(t('crew.kicker', crew.meta.kicker))}</p>
    <h2 class="hero__name">${esc(t('crew.title', crew.meta.title))}</h2>
    <p class="hero__headline">${esc(t('crew.lede', crew.meta.lede))}</p>
    <p class="hero__status">${esc(t('crew.scope', crew.meta.scope))}</p>
  </section>

  <p class="lede">${esc(t('crew.howto', crew.meta.howto))}</p>

  <div class="legend">
      ${legend}
  </div>

  <p class="rowlabel">${u('coreSeats')}</p>
  ${roster(core)}

  <p class="rowlabel">${u('supportSeats')}</p>
  ${roster(support)}

  <p class="note">${esc(t('crew.portraits', crew.meta.portraits))}</p>

${linkrow}
</div>
${SEAT_SCRIPT}`;

  await writeFile(
    join(OUT, 'crew.html'),
    page({ title: `${t('crew.title', crew.meta.title)} — ${profile.name}`, description: t('crew.lede', crew.meta.lede), body: crewBody, file: 'crew.html' })
  );

  for (const r of crew.roles) {
    const cov = coverage()[r.coverage] ?? coverage().partial;
    const body = `
<div class="sheet">
${head(r.tier === 'core' ? u('coreSeat') : u('supportSeat'), `crew-${r.id}.html`)}
  <div class="cards cards--single">
    <article class="role cov--${esc(r.coverage)}">
      <div class="card__strip">
        <span>${esc(r.tier === 'core' ? u('coreSeat') : u('supportSeat'))}</span>
        <span>${esc(cov.label)}</span>
      </div>
      <div class="role__head">
        <div class="role__sigil" aria-hidden="true">${r.emoji}</div>
        <div><h2 class="role__name">${esc(r.seat)}</h2></div>
      </div>
${renderRoleDetail(r, caseMap)}
    </article>
  </div>
  <nav class="linkrow">
    <a href="./crew.html">${u('allSeats')}</a>
    <a href="./index.html">${u('engagements')}</a>
  </nav>
</div>`;
    await writeFile(
      join(OUT, `crew-${r.id}.html`),
      page({ title: `${t(`role.${r.id}.seat`, r.seat)} — ${profile.name}`, description: t(`role.${r.id}.owns`, r.owns), body, file: `crew-${r.id}.html` })
    );
  }


  }
  LANG = 'en';

  // CSS в паблик уходит без комментариев: src/ — кухня, dist/ — витрина.
  const css = await readFile(join(ROOT, 'src', 'styles.css'), 'utf8');
  await writeFile(join(DIST, 'styles.css'), css.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\n{3,}/g, '\n\n').trimStart());
  console.log(
    `✓ dist/: index.html (${lenses.length} упаковки) + ${cases.length} кейсов + ` +
      `crew.html (${crew.roles.filter((r) => r.tier === 'core').length} основных / ${crew.roles.filter((r) => r.tier !== 'core').length} вспомогательных кресел) + ` +
      `${crew.roles.length} страниц кресел, en + ru + styles.css`
  );
}

main();

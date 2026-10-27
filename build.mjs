/* build.mjs — caerno.github.io landing, built from data/ (YAML content, JSON numbers).
   English version is the default (dist/index.html), Russian is dist/ru/index.html, RU / EN switch as in "Your Thing".
   Block order and visibility, texts of every slot: data/landing.yaml (_layout with show; en/ru variants, pick -1 = removed).
   Edited in PAL: http://127.0.0.1:8080/site — rebuild and preview live there.
   node build.mjs →
     dist/index.html, dist/ru/index.html   — publishable: hidden and empty slots are not rendered;
     preview/en.html, preview/ru.html      — everything at once, empty slots shown as framed placeholders. */
import fs from 'node:fs';
import YAML from 'yaml';

const J = p => JSON.parse(fs.readFileSync(p, 'utf8'));
const Y = p => YAML.parse(fs.readFileSync(p, 'utf8'));
const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>');   /* перенос строки в тексте = <br> */

const profile   = Y('data/profile.yaml');
const RU        = Y('data/i18n/ru.yaml');
const fits      = Y('data/fits.yaml');
const artifacts = Y('data/artifacts.yaml');
const points    = J('data/derived/hero-points.json');

const TX        = Y('data/landing.yaml');
const ATOMS     = Y('data/atoms/capabilities.yaml').atoms;
/* кейсы — в порядке карточек блока «Кейсы» в _layout (case-<slug>), число любое */
const cases     = TX._layout.find(b => b.id === 'work').items.filter(it => typeof it === 'object' && it.id.startsWith('case-'))
                    .map(it => Y(`data/cases/${it.id.slice(5)}.yaml`));
const ARTS      = Object.fromEntries(Y('data/artifacts.yaml').items.map(a => [a.id, a]));
/* имена профессий облака — тем же порядком, что точки (tools/hero-points.mjs). На обеих версиях английские
   названия O*NET: русские в xwalk есть ручные только у 33, автоподбор Справочника часто мимо
   (Legislators → «Нотариус»), под курсором это читалось бы как ошибка (08.10) */
const OCC = J('data/career/occupations.json').occupations;
const occNames = () => OCC.map(o => o.title);
const BUILT     = new Date().toISOString().slice(0, 10);
/* «Написать» ведёт в Telegram (08.10: «должен быть телеграм caerno»), почта — рядом в финальном блоке */
const TG    = profile.links.find(l => l.label === 'Telegram');
const WRITE = TG ? TG.url : 'mailto:kirsanov.dima@gmail.com';
const TEST  = { en: 'https://caerno.github.io/your-thing/', ru: 'https://caerno.github.io/your-thing/ru/' };

/* видимость блоков и карточек из _layout: id → show */
const SHOW = new Map();
(function walk(items) { for (const it of items) if (typeof it === 'object') { SHOW.set(it.id, it.show !== false); walk(it.items); } })(TX._layout);

/* слово forensic он снял 21.09 — в подписях и заголовках не выводится */
const unforensic = (t, lang) => /forensic/i.test(t) ? (lang === 'ru' ? 'Финансы' : 'Finance') : t;
const low = t => String(t).split(' ').map(w => /\p{Ll}/u.test(w) ? w.toLowerCase() : w).join(' ');   /* серые подписи фигуры строчными, аббревиатуры как есть (27.10) */

/* Граф фигуры строится здесь из показанных кейсов (как tools/hero-points.mjs, но без файла-посредника):
   методы — по эллипсу, кейс — в средней точке своих методов с расталкиванием; разброс знаков — от зерна,
   чтобы страница не менялась от пересборки к пересборке. Число кейсов и методов любое. */
function rng(seed) { let a = 0; for (const ch of seed) a = (a * 31 + ch.charCodeAt(0)) >>> 0;
  return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const r3 = x => Math.round(x * 1000) / 1000;
function graphOf(cs) {
  const R = rng(cs.map(c => c.slug).join('|'));
  const methods = [...new Set(cs.flatMap(c => c.methods || []))].sort();
  const mpos = new Map(methods.map((m, i) => { const a = i / Math.max(1, methods.length) * Math.PI * 2 - Math.PI / 2;
    return [m, { x: Math.cos(a) * 0.86, y: Math.sin(a) * 0.62 }]; }));
  const cpos = cs.map(c => { const ms = (c.methods || []).map(m => mpos.get(m));
    const mx = ms.length ? ms.reduce((s, p) => s + p.x, 0) / ms.length : 0, my = ms.length ? ms.reduce((s, p) => s + p.y, 0) / ms.length : 0;
    if (c.center) return { c, x: 0, y: 0, pin: true };          /* кейс с center: true стоит в середине фигуры */
    return { c, x: mx * 0.52 + (R() - 0.5) * 0.02, y: my * 0.52 + (R() - 0.5) * 0.02 }; });
  for (let it = 0; it < 220; it++) for (const a of cpos) for (const b of cpos) {
    if (a === b || a.pin) continue;
    const dx = a.x - b.x, dy = a.y - b.y, d = Math.hypot(dx, dy) || 1e-3;
    if (d < 0.46) { a.x += dx / d * 0.004; a.y += dy / d * 0.004; }
  }
  const points = [];
  for (const p of cpos) for (const m of p.c.methods || []) { const B = mpos.get(m);
    for (let i = 1; i < 30; i++) { const t = i / 30; points.push([r3(p.x + (B.x - p.x) * t), r3(p.y + (B.y - p.y) * t), 0.42]); } }
  const nodes = [
    ...cpos.map(p => ({ x: r3(p.x), y: r3(p.y), kind: 'case', label: p.c.domain, labelRu: RU[`case.${p.c.slug}.domain`] || p.c.domain, slug: p.c.slug })),
    ...methods.map(m => ({ x: r3(mpos.get(m).x), y: r3(mpos.get(m).y), kind: 'method', id: m, label: m.replace(/-/g, ' '), labelRu: RU['method.' + m] || m.replace(/-/g, ' ') }))];
  for (const n of nodes) for (let k = 0; k < (n.kind === 'case' ? 26 : 10); k++) {
    const a = R() * Math.PI * 2, r = Math.sqrt(R()) * (n.kind === 'case' ? 0.075 : 0.038);
    points.push([r3(n.x + Math.cos(a) * r), r3(n.y + Math.sin(a) * r * 0.72), n.kind === 'case' ? 1.6 : 1]);
  }
  return { id: 'graph', n: cs.length, nodes, points };
}

/* рёбра графа «кейс → метод» — по ним бегут вспышки (field.js) */
const edgesOf = (g, cases) => cases.flatMap(c => (c.methods || []).map(m => [
  g.nodes.findIndex(n => n.kind === 'case' && n.slug === c.slug),
  g.nodes.findIndex(n => n.kind !== 'case' && n.label === m.replace(/-/g, ' '))])).filter(e => e[0] >= 0 && e[1] >= 0);

/* связи «кейс — кейс»: пары кейсов с общим методом — постоянные пунктиры между жёлтыми узлами (08.10) */
const linksOf = (g, cases) => { const out = [];
  cases.forEach((a, i) => cases.forEach((b, j) => { if (j <= i || !(a.methods || []).some(m => (b.methods || []).includes(m))) return;
    const A = g.nodes.findIndex(n => n.kind === 'case' && n.slug === a.slug), B = g.nodes.findIndex(n => n.kind === 'case' && n.slug === b.slug);
    if (A >= 0 && B >= 0) out.push([A, B]); }));
  return out; };

/* page styles and behaviour are inlined into the single HTML file: one request, no build step for the browser */
const inline = f => fs.readFileSync(f, 'utf8').replace(/\n$/, '');
const CSS = inline('src/landing.css'), LANDING_JS = inline('src/landing.js'), FIELD_JS = fs.readFileSync('src/field.js', 'utf8');
/* знак: src/brand/ пишет tools/brand.py; в меню — знак без плитки, фавиконы лежат рядом со страницами */
const SITE = 'https://caerno.github.io/';                 /* og:image — только абсолютным адресом */
const MARK = inline('src/brand/mark.svg'), ICONS = ['favicon.svg', 'favicon.ico', 'apple-touch-icon.png'];

function render(lang, publish) {
  const ru = lang === 'ru';
  const up = publish && ru ? '../' : '';                    /* dist/ru/ берёт фавиконы из dist/ */
  const vis = id => !publish || SHOW.get(id) !== false;
  const opt = id => SHOW.get(id) === true;                  /* переключатель: галка в редакторе = да, и в прототипе тоже */
  const eyebrow = (blk, key, end) => opt(blk + '-eyebrow-end') === end ? el(key, t => `<p class="eyebrow rise">${t}</p>`) : '';   /* серая подпись: в начале или в конце блока (09.10) */
  const D = (k, en) => ru && RU[k] != null && RU[k] !== '' ? RU[k] : en;          /* тексты из данных */
  const removed = k => TX[k]?.[lang]?.pick === -1;
  const S = k => {                                                                 /* место: выбранный вариант или null */
    const s = TX[k]?.[lang];
    if (!s || s.pick < 0 || !s.v.length) return null;
    const v = s.v[Math.min(s.pick, s.v.length - 1)];
    return v === '' || (Array.isArray(v) && !v.length) ? null : v;
  };
  /* el: текст места в обёртке; без текста — на выкладке ничего, в прототипе рамка «нет текста» */
  const el = (k, wrap) => {
    const v = S(k);
    if (v != null) return wrap(esc(v));
    return publish || removed(k) ? '' : wrap(`<span class="slot">${esc(k)}: нет текста (${lang})</span>`);
  };
  const nameLines = ru ? String(D('profile.nameLines', '')).split(/[|\n]/) : profile.nameLines;
  const other = ru ? '../' : './ru/';
  const headline = S('hero.headline');
  const desc = (headline || `${D('profile.role', profile.role)} · ${D('profile.status', profile.status)}`).replace(/\n/g, ' ');   /* превью ссылки в мессенджерах (27.10) */
  /* серые тексты: для каждого кейса — навыки из data/atoms с этим кейсом, подпись на языке страницы; пустая — не берём */
  const pl = removed('field.pool') ? {} : (S('field.pool') || {});
  const incl = slug => [slug, ...((cases.find(c => c.slug === slug) || {}).includes || [])];   /* совмещённый кейс берёт навыки своих частей */
  const poolOf = g => g.nodes.map(n => n.kind !== 'case' ? [] :
    ATOMS.filter(a => (a.cases || []).some(x => incl(n.slug).includes(x)) && pl[a.id]).map(a => low(unforensic(pl[a.id], lang))).filter(x => !/forensic/i.test(x)));
  const fc = removed('field.cases') ? null : (S('field.cases') || {}), fm = removed('field.methods') ? null : (S('field.methods') || {});
  const shown = cases.filter(c => vis('case-' + c.slug));
  const POINTS = { ...points, sets: points.sets.map(({ me, meCoarse, ...rest }) => rest.id === 'graph' ? graphOf(shown)
      : rest.id === 'cloud' && rest.points.length === OCC.length ? { ...rest, names: occNames(lang), hoverNames: vis('space-hover'), cornerNames: vis('space-corners') } : rest)
    .map(rest => !rest.nodes ? rest : { ...rest, edges: edgesOf(rest, shown), links: linksOf(rest, shown), pool: poolOf(rest),
    nodes: rest.nodes.map(n => { const m = n.kind === 'case' ? fc : fm;
      /* несколько подписей через « | » — у кейса подпись сменяется (field.js: буквы роятся и схлопываются в узел) */
      /* подписи в landing.yaml — по id узла (slug кейса / id метода, 12.10); старые ключи по английской подписи ещё читаются */
      const labels = (m === null ? '' : String(m[n.kind === 'case' ? n.slug : n.id] ?? m[n.label] ?? (ru ? n.labelRu : n.label))).split('|')
        .map(x => unforensic(x.trim(), lang)).map(x => n.kind === 'case' ? x : low(x)).filter(Boolean);
      const t = labels[0] || '';
      return { ...n, label: t, labelRu: t, labels }; }) }) };

  const langSw = ru ? `<b>RU</b> / <a href="${other}">EN</a>` : `<a href="${other}">RU</a> / <b>EN</b>`;
  /* микрокарта для подвала: показанные блоки в порядке страницы, подпись — из меню или надписи над заголовком */
  const MAP = [['work', 'nav.work'], ['fit', 'fit.eyebrow'], ['how', 'nav.how'], ['code', 'nav.code'], ['space', 'space.eyebrow'],
               ['about', 'nav.about'], ['faq', 'faq.eyebrow'], ['end', 'end.h2']]
    .filter(([id, k]) => vis(id) && S(k)).map(([id, k]) => `<a href="#${id}">${esc(S(k))}</a>`);

  return `<!doctype html>
<html lang="${lang}">
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(D('profile.name', profile.name))}${publish ? '' : ' — прототип'}</title>
<meta name="description" content="${esc(desc)}">
<meta property="og:type" content="website">
<meta property="og:title" content="${esc(D('profile.name', profile.name))}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:image" content="${SITE}${ru ? 'og-ru.png' : 'og.png'}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary_large_image">
<meta property="og:locale" content="${ru ? 'ru_RU' : 'en_US'}">
<meta property="og:url" content="${SITE}${ru ? 'ru/' : ''}">
<link rel="canonical" href="${SITE}${ru ? 'ru/' : ''}">
<link rel="icon" href="${up}favicon.ico" sizes="32x32">
<link rel="icon" href="${up}favicon.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="${up}apple-touch-icon.png">
<link rel="alternate" hreflang="en" href="${SITE}">
<link rel="alternate" hreflang="ru" href="${SITE}ru/">
<link rel="alternate" hreflang="x-default" href="${SITE}">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Geist:wght@400..700&family=Geist+Mono:wght@400;500&family=Source+Serif+4:ital,opsz,wght@0,8..60,400;1,8..60,400&display=swap">
<style>
${CSS}
</style>

<nav id="nav"><div class="wrap">
  <span class="me">${vis('logo') ? `<span class="logo" aria-hidden="true">${MARK}</span>` : ''}${esc(D('profile.name', profile.name))}</span>
  ${vis('work') ? el('nav.work', t => `<a href="#work">${t}</a>`) : ''}${vis('how') ? el('nav.how', t => `<a href="#how">${t}</a>`) : ''}
  ${vis('code') ? el('nav.code', t => `<a href="#code">${t}</a>`) : ''}${vis('about') ? el('nav.about', t => `<a href="#about">${t}</a>`) : ''}
  ${vis('lang') ? `<span class="lang">${langSw}</span>` : ''}
  ${el('nav.cta', t => `<a class="cta" href="${esc(WRITE)}">${t}</a>`)}
</div></nav>

<main>
${vis('hero') ? `<header class="hero">
  <canvas id="hero-c"></canvas>
  <div class="txt" id="hero-t">
    <p class="role">${esc(D('profile.role', profile.role))}</p>
    <h1>${nameLines.map(x => esc(String(x).trim())).join('<br>')}</h1>
    ${el('hero.headline', t => `<p class="lead">${t.replace(/\n/g, '<br>')}</p>`)}
    <p class="status">${esc(D('profile.status', profile.status))}</p>
    ${el('hero.btn', t => `<a class="btn" href="${esc(WRITE)}">${t}</a>`)}
  </div>
</header>` : ''}

${vis('work') ? `<section id="work"><div class="wrap">
  <div id="work-head">${eyebrow('work', 'work.eyebrow', false)}
  ${el('work.h2', t => `<h2 class="rise">${t}</h2>`)}
  ${el('work.sub', t => `<p class="sub rise">${t}</p>`)}${eyebrow('work', 'work.eyebrow', true)}</div>
  <div class="deck cases">${shown.map(c => { const go = S('work.go'), tag = go ? 'a' : 'div';
    const ind = c.industries ? D(`case.${c.slug}.industries`, c.industries) : '';
    const projs = (c.projects || []).map(id => ARTS[id]).filter(Boolean);
    const pts = String(D(`case.${c.slug}.points`, c.points) || '').split('\n').map(x => x.trim()).filter(Boolean);   /* под «+»: пункт на строку (23.10) */
    const line = D(`case.${c.slug}.tagline`, c.tagline), lineIn = line && (pts.length || !projs.length);   /* 26.10: описание тоже под «+»; где там одни карточки проектов (Wikipedia) — текст с ними не смешиваем */
    const more = (lineIn ? `<p>${esc(line)}</p>` : '') + (pts.length ? `<ul class="case__pts">${pts.map(x => `<li>${esc(x)}</li>`).join('')}</ul>` : '') +
      (ind ? `${el('work.more.industries', t => `<p class="case__lbl">${t}</p>`)}<p>${esc(ind)}</p>` : '') +
      (projs.length ? `${projs.map(a => `<div class="proj">
          <p class="proj__n">${esc(D(`artifact.${a.id}.label`, a.label))}</p>${a.line ? `<p>${esc(D(`artifact.${a.id}.line`, a.line))}</p>` : ''}
          <div class="art__links">${(a.links || [{ kind: '', url: a.url }]).map(l =>
            `<a class="ext" href="${esc(l.url)}" target="_blank" rel="noopener">${esc(S('code.link.' + l.kind) ?? l.url)} ↗</a>`).join('')}</div></div>`).join('')}` : '');
    const title = esc(unforensic(D(`case.${c.slug}.domain`, c.domain), lang));
    return `<div class="it"><${tag} class="case rise" id="case-${c.slug}"${go ? ' href="#"' : ''}>
      <div><div class="tag">${esc(D(`case.${c.slug}.period`, c.period))}</div></div>
      <div><h3>${more ? `<button class="case__t" type="button" aria-expanded="false">${title}</button>` : title}</h3>
           <p class="case__org">${esc(String(D(`case.${c.slug}.org`, c.org)).split('·').map(x => x.replace(/^ +| +$/g, '')).join(' · '))}</p>
           ${line && !lineIn ? `<p>${esc(line)}</p>` : ''}
           ${more ? `<div class="case__more" hidden>${more}</div>` : ''}</div>
      ${go ? `<div class="go">${esc(go)}</div>` : ''}
    </${tag}></div>`; }).join('')}</div>
</div></section>` : ''}

${vis('fit') ? `<section id="fit"><div class="wrap">
  ${el('fit.eyebrow', t => `<p class="eyebrow rise">${t}</p>`)}
  ${el('fit.h2', t => `<h2 class="rise">${t}</h2>`)}
  ${el('fit.sub', t => `<p class="sub rise">${t}</p>`)}
  <div class="steps">
    ${fits.fits.filter(f => vis('fit-' + f.id)).map((f, i) => `<div class="step rise" style="transition-delay:${i * 90}ms">
        <p class="n">0${i + 1}</p><h3>${esc(D(`fit.${f.id}.label`, f.label))}</h3>
        <p>${esc(D(`fit.${f.id}.line`, f.line))}</p></div>`).join('')}
  </div>
</div></section>` : ''}

${vis('how') ? `<section id="how"><div class="wrap">
  ${el('how.eyebrow', t => `<p class="eyebrow rise">${t}</p>`)}
  ${el('how.h2', t => `<h2 class="rise">${t}</h2>`)}
  ${el('how.sub', t => `<p class="sub rise">${t}</p>`)}
  <div class="steps">
    ${(S('how.steps') || []).map((s, i) => `<div class="step rise" style="transition-delay:${i * 90}ms">
        <p class="n">0${i + 1}</p><h3>${esc(s.h)}</h3><p>${esc(s.t)}</p></div>`).join('')}
  </div>
</div></section>` : ''}

${vis('code') ? `<section id="code"><div class="wrap">
  ${eyebrow('code', 'code.eyebrow', false)}
  ${el('code.h2', t => `<h2 class="rise">${t}</h2>`)}
  <div class="deck arts">
    ${TX._layout.find(b => b.id === 'code').items.filter(it => typeof it === 'object' && it.id.startsWith('art-') && vis(it.id))
       .map(it => ARTS[it.id.slice(4)]).filter(Boolean).map((a, i) => { const cs = shown.find(c => (c.projects || []).includes(a.id));   /* 09.10: проект, разобранный в кейсе, ведёт в кейс — подробности показываются в одном месте */
        return `<div class="it"><div class="art rise" style="transition-delay:${(i % 2) * 70}ms">
        ${cs ? `<a class="al tocase" href="#case-${cs.slug}">${esc(D(`artifact.${a.id}.label`, a.label))}</a>`
             : `<button class="al" type="button" aria-expanded="false">${esc(D(`artifact.${a.id}.label`, a.label))}</button>`}
        <p>${esc(D(`artifact.${a.id}.line`, a.line))}</p>
        ${cs ? '' : `<div class="art__links" hidden>${(a.links || [{ kind: '', url: a.url }]).map(l =>
          `<a class="ext" href="${esc(l.url)}" target="_blank" rel="noopener">${esc(S('code.link.' + l.kind) ?? l.url)} ↗</a>`).join('')}</div>`}</div></div>`; }).join('')}
  </div>
  ${eyebrow('code', 'code.eyebrow', true)}
  ${vis('code-links') ? el('code.more', t => `<p class="more rise">${t}</p>`) : ''}
  ${vis('code-links') ? `<div class="links rise" style="margin-top:14px">${profile.links.filter(l => l.label !== 'Email' && l.label !== 'Telegram')
      .map(l => `<a class="btn ghost" href="${esc(l.url)}">${esc(l.label)}</a>`).join('')}</div>` : ''}
</div></section>` : ''}

${vis('space') ? `<section id="space"><div class="wrap">
  ${eyebrow('space', 'space.eyebrow', false)}
  ${el('space.h2', t => `<h2 class="rise">${t}</h2>`)}
  ${el('space.sub', t => `<p class="sub rise">${t}</p>`)}
  ${S('space.more') ? `<div class="space__more"><p>${esc(S('space.more'))}</p></div>` : ''}
  <div class="cloudbox rise"><canvas id="cloud-c"></canvas>
    ${S('space.more') && S('space.toggle') ? `<button class="space__name" type="button" aria-expanded="false">${esc(S('space.toggle'))}</button>` : ''}<div class="cap" id="cloud-p">${esc(S('space.cap') ?? 'O*NET 30.0, CC BY 4.0')}</div></div>
  ${el('space.btn', t => `<p class="space__btn"><a class="btn ghost" href="${TEST[lang]}">${t}</a></p>`)}
  ${eyebrow('space', 'space.eyebrow', true)}
</div></section>` : ''}

${vis('about') ? `<section id="about"><div class="wrap about">
  ${el('about.eyebrow', t => `<p class="eyebrow rise">${t}</p>`)}
  ${headline ? `<p class="q rise">${ru ? '«' : '“'}${esc(headline).replace(/\n/g, ' ')}${ru ? '»' : '”'}</p>` : ''}
  ${(S('about.text') || []).map((t, i) => `<p class="rise"${i ? '' : ' style="margin-top:28px"'}>${esc(t)}</p>`).join('\n  ')}
</div></section>` : ''}

${vis('faq') ? `<section id="faq"><div class="wrap">
  ${el('faq.eyebrow', t => `<p class="eyebrow rise">${t}</p>`)}
  ${el('faq.h2', t => `<h2 class="rise">${t}</h2>`)}
  <div class="faq rise">
    ${(S('faq.items') || []).filter(f => f.q && f.a).map(f => `<details><summary>${esc(f.q)}</summary>
      <p>${esc(f.a)}</p></details>`).join('')}
  </div>
</div></section>` : ''}

${vis('end') ? `<section class="end" id="end"><div class="wrap">
  ${el('end.h2', t => `<h2 class="rise">${t}</h2>`)}
  <div class="row rise">
    ${TG ? `<a class="btn" href="${esc(TG.url)}">Telegram @${esc(TG.url.split('/').pop())}</a>` : ''}
    <a class="btn${TG ? ' ghost' : ''}" href="mailto:kirsanov.dima@gmail.com">kirsanov.dima@gmail.com</a>
  </div>
</div></section>` : ''}
</main>

${(() => { const inner = [vis('footer-map') && MAP.length ? `<span class="fmap">${MAP.join(' · ')}${vis('lang') ? ' · ' + langSw : ''}</span>` : '',
    el('footer.text', t => `<span>${t}</span>`),   /* свободная строка подвала (12.10) */
    S('footer.updated') ? `<span>${esc(S('footer.updated'))} ${BUILT}</span>` : '',   /* «обновлено» убрано 08.10 */
    vis('license') ? '<span>CC BY 4.0</span>' : '',
    publish ? '' : '<span style="margin-left:auto">прототип: всё подряд, на выкладке скрытое не выводится</span>'].join('');
  return vis('footer') && inner ? `<footer><div class="wrap" style="display:flex;gap:20px;flex-wrap:wrap;padding:0">${inner}</div></footer>` : ''; })()}

<script>
${LANDING_JS}
const POINTS = ${JSON.stringify(POINTS)};
${FIELD_JS}
</script>
`;
}

for (const d of ['dist/ru', 'preview']) fs.mkdirSync(d, { recursive: true });
for (const d of ['dist', 'preview']) for (const f of ICONS) fs.copyFileSync('src/brand/' + f, `${d}/${f}`);
for (const f of ['og.png', 'og-ru.png']) fs.copyFileSync('src/brand/' + f, `dist/${f}`);   /* превью ссылки, снимает tools/og.py (27.10) */
const OUT = {
  'dist/index.html':    render('en', true),
  'dist/ru/index.html': render('ru', true),
  'preview/en.html':    render('en', false),
  'preview/ru.html':    render('ru', false)
};
for (const [f, html] of Object.entries(OUT)) fs.writeFileSync(f, html);
console.log('built:', Object.keys(OUT).map(f => `${f} ${(fs.statSync(f).size / 1024).toFixed(1)} KB`).join(' · '));

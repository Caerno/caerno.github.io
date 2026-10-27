#!/usr/bin/env node
// Самостоятельная страница «Кем быть» / «Your Thing»: <out>/index.html (en), <out>/ru/index.html и README.md.
// Папка целиком переносима — ни одной ссылки наружу, кроме шрифтов и O*NET; годится как корень
// отдельного репозитория с GitHub Pages (caerno.github.io/<имя>/).
//   node tools/build-career.mjs [outDir]      по умолчанию dist/career
import { readFile, writeFile, mkdir, copyFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import YAML from 'yaml';
import { careerItems, careerModel } from './career-items.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const J = async (p) => JSON.parse(await readFile(join(ROOT, p), 'utf8'));
const Y = async (p) => YAML.parse(await readFile(join(ROOT, p), 'utf8'));
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// Шкалы (RIASEC + Big Five столбиками) на странице не показываются: оценки черт посетителю не выводим.
const SHOW_SCALES = false;

// prettyUrls: ссылки на каталоги (для GitHub Pages) вместо index.html (для file://); base — адрес для canonical.
export async function buildCareer(outDir = join(ROOT, 'dist', 'career'), { prettyUrls = false, base = '' } = {}) {
  const [bank, model, tipi, ddo, occ, profile, texts, ru, css, js, xw, limits, ruNamesLlm] = await Promise.all([
    J('data/career/items.json'), J('data/career/model.json'), J('data/career/tipi.json'), J('data/career/ddo.json'),
    J('data/career/occupations.json'), Y('data/profile.yaml'), J('data/career/texts.json'), Y('data/i18n/ru.yaml'),
    readFile(join(ROOT, 'src', 'career.css'), 'utf8'), readFile(join(ROOT, 'src', 'career.js'), 'utf8'),
    J('data/career/xwalk.json'), J('data/career/constraints.json'), J('data/career/ru-names.json'),
  ]);
  const cssMin = css.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\n{2,}/g, '\n').trim();

  for (const lang of ['en', 'ru']) {
    const T = texts[lang], isRu = lang === 'ru';
    const tr = (key, en) => (isRu && ru[key] ? ru[key] : en);
    const items = careerItems({ bank, model, tipi, ddo }, lang, tr);
    // Людей на странице нет: ничьи профили не публикуются. Вместо этого — куда прислать свой JSON.
    // Русская страница: основное название — ручная привязка, иначе русское название из этапа LLM 20–21.10
    // (data/career/ru-names.json; прежний автоподбор Справочника Минтруда часто промахивался). Показываются все профессии.
    const ruNames = {};
    if (isRu) for (const c of Object.keys(xw.onet)) {
      // Одна ручная привязка — главная; несколько (роли hh и партнёра, сведённые в одну O*NET) — общее название от LLM.
      const man = (xw.ru || {})[c];
      if (man && (man.length === 1 || !ruNamesLlm[c])) ruNames[c] = man.map((x) => x.n).join(' · ');
      else if (ruNamesLlm[c]) ruNames[c] = ruNamesLlm[c];
    }
    const occList = occ.occupations;
    // Ограничения (барьеры, условия, путь) — только на русской странице: тексты вопросов пока только по-русски.
    const payload = { T, items, model: careerModel(model, bank), occ: occList, occStats: occ.stats, xwalkUrl: './xwalk.json', ruNames, ...(isRu ? { limits } : {}) };
    // Вкладки профессии грузятся отдельным файлом при первом открытии: на русской — с Справочником Минтруда.
    const xo = {}; for (const [c, v] of Object.entries(xw.onet)) xo[c] = isRu ? { d: v.d, esco: v.esco, mt: v.mt } : { d: v.d, esco: v.esco };
    const xwOut = { onet: xo, esco: xw.esco, ...(isRu ? { mt: Object.fromEntries(Object.entries(xw.mt).filter(([id]) => Object.values(xw.onet).some((v) => v.mt.includes(+id)))) } : {}) };
    const mail = profile.links.find((l) => l.url.startsWith('mailto:')), gh = profile.links.find((l) => /github\.com/.test(l.url));
    const contacts = [mail && `<a href="${esc(mail.url)}">${esc(mail.url.replace('mailto:', ''))}</a>`, gh && `<a href="${esc(gh.url)}">${esc(gh.url.replace('https://', ''))}</a>`].filter(Boolean).join(' · ');
    const bar = (s, name, hint) => `      <li class="bar" data-scale="${s}"><span class="bar__name">${esc(name)}<small>${esc(hint)}</small></span><span class="bar__track"><span class="bar__fill"></span><span class="bar__ci"></span></span><span class="bar__val">·</span></li>`;
    const n6 = bank.scales.length;
    const here = prettyUrls ? './' : './index.html', other = prettyUrls ? (isRu ? '../' : './ru/') : (isRu ? '../index.html' : './ru/index.html');
    const canonical = base ? `<link rel="canonical" href="${esc(base + (isRu ? 'ru/' : ''))}">\n` : '';
    const html = `<!doctype html>
<html lang="${lang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(T.title)} — ${esc(T.kicker)}</title>
<link rel="icon" href="${isRu ? '../' : ''}favicon.ico" sizes="32x32">
<link rel="icon" href="${isRu ? '../' : ''}favicon.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="${isRu ? '../' : ''}apple-touch-icon.png">
<meta name="description" content="${esc(T.lede)}">
<meta property="og:title" content="${esc(T.title)}">
<meta property="og:description" content="${esc(T.lede)}">
<link rel="alternate" hreflang="${isRu ? 'en' : 'ru'}" href="${other}">
${canonical}<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Geist:wght@400..700&family=Geist+Mono:wght@400;500&display=swap">
<style>
${cssMin}
</style>
</head>
<body>
<nav><div class="wrap">
  <a class="me" href="${here}"><b>${esc(T.title)}</b><small>${esc(T.kicker)}</small></a>
  <a class="sec" href="#test">${esc(T.navTest)}</a><a class="sec" href="#method">${esc(T.method)}</a>
  <span class="lang">${isRu ? `<b>RU</b> / <a href="${other}">EN</a>` : `<a href="${other}">RU</a> / <b>EN</b>`}</span>
</div></nav>

<header class="top"><div class="wrap">
  <p class="role">${esc(T.kicker)}</p>
  <h1>${esc(T.title)}</h1>
  <p class="lead">${esc(T.lead)}</p>
</div></header>

<section id="test"><div class="wrap">
  <p class="eyebrow">${esc(T.navTest)}</p>
  <div id="career-q" class="q" aria-live="polite"><noscript><p class="q__text">JavaScript</p></noscript></div>
  <p class="note note--keys">${esc(T.keysHint)}</p>
  <div class="about">${T.about.map((p) => `<p>${esc(p)}</p>`).join('')}</div>
</div></section>

${SHOW_SCALES ? `<section id="career-profile" hidden><div class="wrap">
  <p class="eyebrow">${esc(T.profileEyebrow)}</p>
  <h2>${esc(T.resultsTitle)}</h2>
  <ul class="bars">
${model.dims.slice(0, n6).map((s) => bar(s, T.scales[s], T.scaleHints[s])).join('\n')}
  </ul>
  <p class="note" id="career-answered"></p>
  <h3 class="block">${esc(T.big5Title)}</h3>
  <ul class="bars">
${model.dims.slice(n6).map((s) => bar(s, T.big5[s], T.big5Hints[s])).join('\n')}
  </ul>
  <p class="note" id="career-resnote"></p>
</div></section>` : ''}

<section id="career-results" hidden><div class="wrap">
  <p class="eyebrow">O*NET 30.0</p>
  <h2>${esc(T.occTitle)}</h2>
  <p class="sub">${esc(T.occNote)}</p>
  <p class="sub swipe-hint">${esc(T.swipeHint)}</p>
  <p class="sub pick-note" id="career-pick-note" aria-live="polite" hidden></p>
  <ol class="occs" id="career-occs"></ol>
  <h3 class="block">${esc(T.shareTitle)}</h3>
  <p class="sub share">${esc(T.shareNote)} ${contacts}</p>
  <p class="copyrow" id="career-share">${['img', 'md', 'html', 'json'].map((k) => `<button type="button" class="btn" data-fmt="${k}">${esc(T.shareFmt[k])}</button>`).join(' ')}</p>
  <div id="career-badge" class="badge-box"></div>
  <textarea class="copybox" id="career-json" hidden readonly></textarea>
</div></section>

<section id="method" class="method"><div class="wrap">
  <p class="eyebrow">${esc(T.method)}</p>
  <p class="mtext">${esc(T.methodIntro)}</p>
  <ul class="mlist">${T.methodInstruments.map(([k, v]) => `<li><b>${esc(k)}</b> — ${esc(v)}</li>`).join('')}</ul>
  <h3 class="block">${esc(T.methodHowTitle)}</h3>
  ${T.methodHowIntro ? `<p class="mtext">${esc(T.methodHowIntro)}</p>` : ''}
  ${T.methodHowFold ? `<div class="mfold">${T.methodHow.map(([k, v]) => {
    // Пункт — строкой с «+»; в раскрытии текст; строки после первой — список («Заголовок: текст»)
    const [first, ...rest] = v.split('\n');
    const li = (x) => { const i = x.indexOf(':'); return i > 0 && i < 30 ? `<li><b>${esc(x.slice(0, i + 1))}</b>${esc(x.slice(i + 1))}</li>` : `<li>${esc(x)}</li>`; };
    return `<details><summary>${esc(k)}</summary><p>${esc(first)}</p>${rest.length ? `<ul>${rest.map(li).join('')}</ul>` : ''}</details>`;
  }).join('')}</div>` : `<ul class="mlist">${T.methodHow.map(([k, v]) => `<li><b>${esc(k)}.</b> ${esc(v)}</li>`).join('')}</ul>`}
  <h3 class="block">${esc(T.methodWhereTitle)}</h3>
  <p class="mtext">${esc(T.methodWhere)}</p>
  <p class="mtext">${esc(T.methodTabs)}</p>
  <p class="mnote"><b>${esc(T.methodNoteTitle)}.</b> ${esc(T.methodNote)}</p>
  <p class="srcline">${esc(T.sources)}</p>
</div></section>

<footer><div class="wrap">
  <span>${esc(T.footPrivacy)}</span>
</div></footer>
<script>var CAREER_DATA = ${JSON.stringify(payload).replace(/</g, '\\u003c')};</script>
<script>
${js}
</script>
</body>
</html>
`;
    const dir = isRu ? join(outDir, 'ru') : outDir;
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, 'index.html'), html);
    await writeFile(join(dir, 'xwalk.json'), JSON.stringify(xwOut));
  }
  await writeFile(join(outDir, 'README.md'), await readFile(join(ROOT, 'data', 'career', 'readme.md'), 'utf8'));   // README репозитория страницы
  for (const f of ['favicon.svg', 'favicon.ico', 'apple-touch-icon.png']) await copyFile(join(ROOT, 'src', 'brand', f), join(outDir, f));   // знак сайта, tools/brand.py
  return outDir;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const pretty = process.argv.includes('--pretty');
  console.log('✓', await buildCareer(process.argv.find((a, i) => i >= 2 && !a.startsWith('--')), { prettyUrls: pretty, base: pretty ? 'https://caerno.github.io/your-thing/' : '' }));
}

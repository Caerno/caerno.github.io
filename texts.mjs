// Единая карта редактируемого содержимого сайта. Английский лежит в самих данных,
// русский — оверлеем в data/i18n/ru.json. Используется выгрузкой (export_texts.mjs)
// и локальным редактором (local-admin/admin.mjs), чтобы список полей был один на всех.
//
// kind: 'text'  — двуязычная пара (английский в данных, русский в оверлее);
//       'plain' — одно значение на обе версии: адрес ссылки, список слагов, значок,
//                 уровень покрытия. Такие поля правятся вместе с текстом, к которому
//                 относятся, иначе правка выходит половинчатой.
import { readFile, writeFile, readdir } from 'node:fs/promises';

const ORDER = ['healthcare', 'forensic-finance', 'edtech', 'wiki-governance', 'wikipedia-infra'];

export async function loadTexts(DATA) {
  const read = async (p) => JSON.parse(await readFile(new URL(p, DATA), 'utf8'));
  const [profile, lenses, mined, fits, roles, tr, ui, live] = await Promise.all([
    read('profile.json'), read('packagings.json'), read('mined.json'), read('fits.json'),
    read('roles.json'), read('i18n/ru.json'), read('ui.json'), read('derived/lenses.json'),
  ]);
  const caseFiles = (await readdir(new URL('./cases/', DATA))).filter((f) => f.endsWith('.json'));
  const cases = {};
  for (const f of caseFiles) {
    const c = await read(`cases/${f}`);
    cases[c.slug] = c;
  }
  const slugs = ORDER.filter((s) => cases[s]);
  const liveMined = new Set(live.lenses.map((l) => l.id));

  const units = [];
  let section = '';
  const S = (t) => { section = t; };
  const U = (path, ruKey, box, key, hint) => units.push({ id: path, kind: 'text', section, path, ruKey, box, key, hint });
  const P = (path, box, key, hint) => units.push({ id: path, kind: 'plain', section, path, box, key, hint });

  S('Первый экран: имя, роль, тезис, статус, ссылки');
  P('profile.json → name', profile, 'name', 'имя в заголовке окна и в подписях страниц');
  P('profile.json → nameLines', profile, 'nameLines', 'крупное имя, по строке на элемент; правится как список через |');
  U('profile.json → role', 'profile.role', profile, 'role', 'строка роли под шапкой — показывается, пока не выбрана линза');
  U('profile.json → status', 'profile.status', profile, 'status', 'формат работы, часовой пояс, язык');
  U('profile.json → note', 'profile.note', profile, 'note');
  profile.links.forEach((l, i) => {
    U(`profile.json → links[${i}].label`, `profile.link.${i}`, l, 'label', 'подпись ссылки в первом экране');
    P(`profile.json → links[${i}].url`, l, 'url', 'адрес этой же ссылки');
  });

  S('Авторские упаковки: линзы-переключатели');
  for (const l of lenses) {
    for (const k of ['label', 'role', 'headline', 'lede']) {
      const hint = { label: 'надпись на плашке', role: 'строка роли над именем', headline: 'крупный тезис', lede: 'абзац под тезисом' }[k];
      U(`packagings.json → ${l.id}.${k}`, `lens.${l.id}.${k}`, l, k, hint);
    }
    P(`packagings.json → ${l.id}.featured`, l, 'featured', `какие кейсы подсвечивает линза; через запятую из: ${slugs.join(', ')}`);
  }

  S('Намайненные упаковки: тексты правятся руками, майнер их не трогает');
  for (const [id, l] of Object.entries(mined)) {
    if (id === '_') continue;
    const dead = liveMined.has(id) ? '' : ' ⚠️ линзы нет в derived/lenses.json — на сайте не показывается';
    for (const k of ['label', 'role', 'headline', 'lede']) {
      U(`mined.json → ${id}.${k}`, `lens.${id}.${k}`, l, k, k === 'label' ? `надпись на плашке${dead}` : dead || undefined);
    }
  }

  S('Блок «Where I fit» — под какие задачи подхожу');
  U('fits.json → label', 'fits.label', fits, 'label', 'заголовок блока');
  for (const f of fits.fits) {
    U(`fits.json → ${f.id}.label`, `fit.${f.id}.label`, f, 'label', 'название типа задачи');
    U(`fits.json → ${f.id}.line`, `fit.${f.id}.line`, f, 'line');
    P(`fits.json → ${f.id}.lens`, f, 'lens', `какая линза включается по клику: ${lenses.map((l) => l.id).join(', ')}`);
    P(`fits.json → ${f.id}.seats`, f, 'seats', `какие роли подсвечиваются; через запятую из: ${roles.roles.map((r) => r.id).join(', ')}`);
  }

  for (const slug of slugs) {
    const c = cases[slug];
    S(`Кейс «${c.domain}» (${slug})`);
    U(`${slug}.json → domain`, `case.${slug}.domain`, c, 'domain', 'метка домена в шапке карточки и в заголовке страницы');
    U(`${slug}.json → title`, `case.${slug}.title`, c, 'title', 'крупное имя карточки; перенос строки — символ |');
    U(`${slug}.json → period`, `case.${slug}.period`, c, 'period');
    U(`${slug}.json → org`, `case.${slug}.org`, c, 'org', 'организация и должность');
    U(`${slug}.json → tagline`, `case.${slug}.tagline`, c, 'tagline', 'подпись под заголовком и описание страницы');
    c.blocks.forEach((b, i) => {
      U(`${slug}.json → blocks[${i}].label`, `case.${slug}.blk.${i}.label`, b, 'label', 'подпись блока слева');
      U(`${slug}.json → blocks[${i}].text`, `case.${slug}.blk.${i}.text`, b, 'text');
    });
    P(`${slug}.json → methods`, c, 'methods', `теги методов и кросс-ссылки между кейсами; через запятую из: ${Object.keys(ui.methods).join(', ')}`);
    (c.links ?? []).forEach((l, i) => {
      U(`${slug}.json → links[${i}].label`, `case.${slug}.link.${i}`, l, 'label', 'подпись ссылки внизу карточки');
      P(`${slug}.json → links[${i}].url`, l, 'url', 'адрес этой же ссылки');
    });
  }

  S('Страница «Двенадцать ролей»: вступление');
  for (const k of Object.keys(roles.meta)) U(`roles.json → meta.${k}`, `crew.${k}`, roles.meta, k);

  for (const r of roles.roles) {
    S(`Роль «${r.seat}» (${r.id})`);
    U(`${r.id} → seat`, `role.${r.id}.seat`, r, 'seat', 'название роли');
    P(`${r.id} → tier`, r, 'tier', 'core — основная роль, support — вспомогательная');
    P(`${r.id} → coverage`, r, 'coverage', 'covered — закрываю, partial — частично, uncovered — не закрываю; определяет значок и подпись');
    P(`${r.id} → emoji`, r, 'emoji', 'значок роли');
    for (const k of ['owns', 'measured', 'empty', 'grades', 'limit']) U(`${r.id} → ${k}`, `role.${r.id}.${k}`, r, k);
    r.kit.forEach((_, i) => U(`${r.id} → kit[${i}]`, `role.${r.id}.kit.${i}`, r.kit, i, 'инструмент в строке под ролью'));
    r.evidence.forEach((e, i) => {
      U(`${r.id} → evidence[${i}]`, `role.${r.id}.ev.${i}`, e, 'text', 'доказательство');
      P(`${r.id} → evidence[${i}].case`, e, 'case', `на какой кейс ссылается это доказательство: ${slugs.join(', ')}`);
    });
    U(`${r.id} → complement.seat`, `role.${r.id}.comp.seat`, r.complement, 'seat', 'кто нужен рядом');
    U(`${r.id} → complement.why`, `role.${r.id}.comp.why`, r.complement, 'why');
    U(`${r.id} → complement.when`, `role.${r.id}.comp.when`, r.complement, 'when');
  }

  S('Названия методов (теги под кейсами)');
  for (const id of Object.keys(ui.methods)) U(`ui.json → methods.${id}`, `method.${id}`, ui.methods, id);

  S('Подписи интерфейса');
  for (const k of Object.keys(ui.ui)) {
    units.push({ id: `ui.json → ui.${k}`, kind: 'ui', section, path: `ui.json → ui.${k}`, box: ui.ui[k] });
  }

  const write = (p, obj) => writeFile(new URL(p, DATA), JSON.stringify(obj, null, 2) + '\n');
  const save = async () => {
    await Promise.all([
      write('profile.json', profile), write('packagings.json', lenses), write('mined.json', mined),
      write('fits.json', fits), write('roles.json', roles), write('i18n/ru.json', tr), write('ui.json', ui),
      ...Object.values(cases).map((c) => write(`cases/${c.slug}.json`, c)),
    ]);
  };

  return { units, tr, save };
}

// Значения читаются и пишутся одинаково для строк и для списков: список показывается
// через запятую (у имени — через |), обратно разбирается по тому же разделителю.
const SEP = { nameLines: ' | ', title: ' | ' };
const sep = (u) => SEP[u.key] ?? ', ';

export const en = (u) => {
  const v = u.kind === 'ui' ? u.box.en : u.box[u.key];
  return Array.isArray(v) ? v.join(sep(u)) : String(v ?? '');
};
export const setEn = (u, value) => {
  if (u.kind === 'ui') { u.box.en = value; return; }
  const old = u.box[u.key];
  u.box[u.key] = Array.isArray(old) ? value.split(sep(u).trim()).map((s) => s.trim()).filter(Boolean) : value;
};
export const ruOf = (u, tr) => (u.kind === 'ui' ? u.box.ru : tr[u.ruKey]);
export const setRu = (u, tr, value) => {
  if (u.kind === 'ui') { u.box.ru = value; return; }
  if (value.trim()) tr[u.ruKey] = value; else delete tr[u.ruKey];
};

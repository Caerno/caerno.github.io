// data/ -> два md-бандла для внешней вычитки: весь английский текст и весь русский.
// Каждый абзац подписан путём ключа, чтобы правку можно было применить обратно в JSON.
//   node export_texts.mjs <outdir>
import { writeFile } from 'node:fs/promises';
import { loadTexts, en, ruOf } from './texts.mjs';

const out = process.argv[2];
if (!out) throw new Error('usage: node export_texts.mjs <outdir>');

const { units, tr } = await loadTexts(new URL('./data/', import.meta.url));

function render(lang) {
  const head = lang === 'en'
    ? '# Сайт-визитка — весь английский текст\n\n' +
      'Английский — исходный текст, лежит в самих данных. Путь ключа над каждым абзацем —\n' +
      'адрес правки. Русская версия того же текста — в парном файле.\n'
    : '# Сайт-визитка — весь русский текст\n\n' +
      'Русский лежит оверлеем в `data/i18n/ru.json`: ключ подменяет английский на русской\n' +
      'версии страницы. Нет ключа — на сайте молча показывается английский, такие места\n' +
      'помечены ниже. Порядок совпадает с парным английским файлом.\n';
  const parts = [head];
  let section = null;
  for (const u of units) {
    if (u.kind === 'plain') continue;   // адреса, слаги и значки — не предмет вычитки
    if (u.section !== section) { section = u.section; parts.push(`\n## ${section}\n`); }
    if (lang === 'en') {
      parts.push(`### \`${u.path}\`\nключ оверлея: \`${u.ruKey}\`\n\n${en(u)}\n`);
    } else {
      parts.push(`### \`ru.json → ${u.ruKey}\`\nанглийский исходник: \`${u.path}\`\n\n${ruOf(u, tr) ?? '⚠️ ПЕРЕВОДА НЕТ — на сайте показывается английский'}\n`);
    }
  }
  return parts.join('\n');
}

for (const [name, text] of [['04_сайт-английский.md', render('en')], ['05_сайт-русский.md', render('ru')]]) {
  await writeFile(`${out}/${name}`, text);
  console.log(`${name}: ${text.length} симв.`);
}
const missing = units.filter((u) => u.kind !== 'plain' && ruOf(u, tr) === undefined);
console.log(missing.length ? `без перевода: ${missing.length} (${missing.slice(0, 5).map((u) => u.ruKey ?? u.path).join(', ')}…)` : 'без перевода: нет');

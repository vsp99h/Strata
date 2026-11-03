/**
 * The activity line - "Ran 2 commands, read a file" - used to be a finished English sentence the host
 * sent and the page printed, so it stayed English in every language. The frame always carried the counts;
 * the page now builds the words from the catalog. These check the building, the plural forms, and that no
 * language is left with English prose.
 */
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { build } from 'esbuild';

const here = rel => fileURLToPath(new URL(rel, import.meta.url));
globalThis.window ??= globalThis;
globalThis.localStorage ??= { getItem: () => null, setItem: () => {} };
globalThis.navigator ??= { language: 'en' };

// One bundle for both, so the language the test sets is the language the sentence builder reads.
// Two bundles would give two copies of the i18n module and two independent language variables.
const { activitySentence, setTranslationLanguage } = await (async () => {
  const r = await build({
    stdin: { contents: "export { activitySentence } from './src/lib/deliverables';\nexport { setTranslationLanguage } from './src/lib/i18n';", resolveDir: here('..') },
    bundle: true, write: false, format: 'esm', platform: 'node', logLevel: 'silent', loader: { '.json': 'json' },
  });
  return import(`data:text/javascript;base64,${Buffer.from(r.outputFiles[0].text).toString('base64')}`);
})();

const TEMPLATES = [
  'Ran {0} command|Ran {0} commands',
  'Read {0} file|Read {0} files',
  'Edited {0} file|Edited {0} files',
  'Searched {0} time|Searched {0} times',
  'Looked up {0} web page|Looked up {0} web pages',
  'Used the browser {0} time|Used the browser {0} times',
  'Started {0} helper|Started {0} helpers',
  'Loaded {0} skill|Loaded {0} skills',
  'Used {0} tool|Used {0} tools',
];

test('the line is built from the counts, in the host\'s order', () => {
  setTranslationLanguage('en');
  assert.equal(activitySentence({ command: 2, read: 1 }), 'Ran 2 commands, read 1 file');
  assert.equal(activitySentence({ skill: 1, command: 3, read: 2 }), 'Ran 3 commands, read 2 files, loaded 1 skill',
    'skills read in the same line as commands and files, which is where the person asked for them');
});

test('a skill alone says so, instead of hiding inside "used N tools"', () => {
  setTranslationLanguage('en');
  assert.equal(activitySentence({ skill: 2 }), 'Loaded 2 skills');
});

test('zero and absent kinds are left out, and an empty group falls back to the host\'s sentence', () => {
  setTranslationLanguage('en');
  assert.equal(activitySentence({ command: 0, read: 2 }), 'Read 2 files', 'a zero is not a thing that happened');
  assert.equal(activitySentence({}, 'Ran a command'), 'Ran a command', 'a frame with no counts keeps the host\'s line');
  assert.equal(activitySentence(undefined, 'Edited a file'), 'Edited a file');
});

test('Russian picks its form by the last digit, which is the whole reason the forms are in the catalog', () => {
  setTranslationLanguage('ru');
  const line = n => activitySentence({ command: n });
  assert.equal(line(1), 'Выполнил 1 команду');
  assert.equal(line(2), 'Выполнил 2 команды');
  assert.equal(line(5), 'Выполнил 5 команд');
  assert.equal(line(11), 'Выполнил 11 команд', 'eleven is not "one" despite ending in 1');
  assert.equal(line(21), 'Выполнил 21 команду', 'twenty-one takes the one form');
  assert.equal(line(14), 'Выполнил 14 команд', 'fourteen is many');
  assert.equal(line(105), 'Выполнил 105 команд', 'the hundreds rule wins over the last digit');
});

test('English takes one and other', () => {
  setTranslationLanguage('en');
  assert.equal(activitySentence({ read: 1 }), 'Read 1 file');
  assert.equal(activitySentence({ read: 4 }), 'Read 4 files');
});

test('every activity string exists in all nine languages and none of them is left in English', () => {
  const langs = ['en', 'zh', 'ja', 'de', 'es', 'ru', 'pt', 'ko', 'fr'];
  const catalogs = Object.fromEntries(langs.map(l => [l, JSON.parse(readFileSync(here(`../src/locales/${l}.json`), 'utf8'))]));
  const idOf = text => Object.entries(catalogs.en).find(([, v]) => v === text)?.[0];
  const slots = t => (t.match(/\{\d+\}/g) ?? []).length;
  for (const text of TEMPLATES) {
    const id = idOf(text);
    assert.ok(id, `"${text}" is in the English catalog`);
    for (const l of langs) {
      const t = catalogs[l][id];
      assert.ok(typeof t === 'string' && t.trim(), `${id} in ${l}`);
      // Every form must carry the slot, or the number vanishes in that language.
      for (const form of t.split('|')) assert.equal(slots(form), slots(text.split('|')[0]), `${id} in ${l}: every form keeps {0}`);
      if (l !== 'en') assert.notEqual(t, text, `${id} is translated in ${l}`);
    }
  }
});

test('Russian carries three forms, the other eight languages two', () => {
  const ru = JSON.parse(readFileSync(here('../src/locales/ru.json'), 'utf8'));
  const en = JSON.parse(readFileSync(here('../src/locales/en.json'), 'utf8'));
  const idOf = text => Object.entries(en).find(([, v]) => v === text)?.[0];
  for (const text of TEMPLATES) {
    assert.equal(ru[idOf(text)].split('|').length, 3, `${idOf(text)} has three Russian forms`);
    for (const l of ['de', 'es', 'fr', 'pt']) {
      const other = JSON.parse(readFileSync(here(`../src/locales/${l}.json`), 'utf8'))[idOf(text)];
      assert.equal(other.split('|').length, 2, `${idOf(text)} has two forms in ${l}`);
    }
  }
});

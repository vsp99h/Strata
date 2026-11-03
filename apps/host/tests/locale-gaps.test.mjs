import test from 'node:test';
import assert from 'node:assert/strict';
import ts from 'typescript';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { build } from 'esbuild';

const languages = ['en', 'zh', 'ja', 'de', 'es', 'ru', 'pt', 'ko', 'fr'];
const read = async name => JSON.parse(await readFile(`src/locales/${name}.json`, 'utf8'));
const built = await build({ stdin: { contents: "export * from './src/lib/i18n';", resolveDir: process.cwd() }, bundle: true, write: false, format: 'esm', platform: 'node', loader: { '.json': 'json' } });
const { tr, setTranslationLanguage } = await import(`data:text/javascript;base64,${Buffer.from(built.outputFiles[0].text).toString('base64')}`);

test('every string that reaches tr() and every command hint has a key in the English catalog, so no language is stuck in English (#3479)', async () => {
  const known = new Set();
  for (const name of ['en', 'tune-en', 'tools-en', 'fix-en', 'gh-en', 'ui-en', 'engine-en', 'pick-en', 'df2-en', 'upd-en', 'r3-en', 'pic-en', 'gui-en']) for (const v of Object.values(await read(name))) known.add(String(v));
  const missing = [];
  const placeholderGaps = [];
  /**
   * Two tr() calls carry no words to translate: an example address shown as a placeholder, and a model
   * name that must stay exactly as the vendor writes it. Named here rather than filtered by shape, so a
   * future third case has to be looked at instead of quietly matching a pattern.
   */
  const notCopy = new Set(['http://127.0.0.1:3000/mcp', 'Qwen-Image-2.1-Turbo']);
  /**
   * Every string a tr() call can receive. Reading only `arguments[0].text` saw 2001 of 3757 call sites
   * and missed the other 1756 - `tr(ready ? 'Loading model' : 'Ready')`, `tr(label || 'Configured')` -
   * which is how 18 strings came to sit untranslated in eight languages with a green suite.
   */
  const literalStrings = (node, out = []) => {
    if (!node) return out;
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) { out.push(node.text); return out; }
    if (ts.isParenthesizedExpression(node) || ts.isAsExpression(node)) return literalStrings(node.expression, out);
    if (ts.isConditionalExpression(node)) { literalStrings(node.whenTrue, out); literalStrings(node.whenFalse, out); return out; }
    if (ts.isBinaryExpression(node) && (node.operatorToken.kind === ts.SyntaxKind.BarBarToken || node.operatorToken.kind === ts.SyntaxKind.QuestionQuestionToken)) { literalStrings(node.left, out); literalStrings(node.right, out); return out; }
    return out;
  };
  const scan = async dir => {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) { if (entry.name !== 'locales') await scan(path); continue; }
      if (!/\.tsx?$/.test(path)) continue;
      const source = await readFile(path, 'utf8'), sf = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true, path.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
      const visit = node => {
        if (ts.isCallExpression(node) && node.expression.getText(sf) === 'tr') {
          for (const raw of literalStrings(node.arguments[0])) {
            const text = String(raw).trim();
            if (text && /[a-zA-Z]{2}/.test(text) && !known.has(text) && !notCopy.has(text)) missing.push(`${path}: ${text}`);
          }
        }
        /**
         * A string carrying a `{0}` slot AND words is translatable copy whatever it is passed to. Checking
         * only `tr(...)` call sites misses strings handed to a helper that translates later - the telemetry
         * chip asked for "{0}{1} tok/s", no such key existed, and the raw braces reached the screen.
         * Templates that are only separators and slots (`{0} · {1}`) carry nothing to translate.
         */
        if ((ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) && /\{\d+\}/.test(node.text) && /[a-zA-Z]{2}/.test(node.text) && !path.endsWith('chat-showcase.ts')) {
          const text = node.text.trim();
          if (text && !known.has(text)) placeholderGaps.push(`${path}: ${text}`);
        }
        if (ts.isPropertyAssignment(node) && node.name.getText(sf) === 'hint' && ts.isStringLiteral(node.initializer) && !path.endsWith('chat-showcase.ts')) {
          const text = node.initializer.text.trim();
          if (text && !known.has(text)) missing.push(`${path}: hint ${text}`);
        }
        ts.forEachChild(node, visit);
      };
      visit(sf);
    }
  };
  await scan('src');
  assert.deepEqual(missing, []);
  assert.deepEqual(placeholderGaps, [], 'a template with {0} slots that no catalog carries reaches the screen as raw braces');
});

test('the fix catalogs have the same keys and placeholders in all nine languages', async () => {
  const en = await read('fix-en');
  for (const language of languages) {
    const catalog = await read(`fix-${language}`);
    assert.deepEqual(Object.keys(catalog), Object.keys(en), language);
    for (const [id, text] of Object.entries(catalog)) assert.deepEqual((text.match(/\{\d+\}/g) ?? []).sort(), (en[id].match(/\{\d+\}/g) ?? []).sort(), `${language} ${id}`);
  }
});

test('the /plan, /research and /new hints and the four "Open ..." hints are translated (#3479, #3825)', () => {
  for (const language of ['zh', 'ru']) {
    setTranslationLanguage(language);
    for (const hint of ['Have the assistant write a plan first; nothing runs until you approve it', 'Search the web, read the pages and answer with sources', 'Start a new conversation; keep this one'])
      assert.notEqual(tr(hint), hint, `${language}: ${hint}`);
    for (const label of ['Model settings', 'Serving', 'Models', 'Skills']) {
      const hint = tr(`Open ${label}`);
      assert.notEqual(hint, `Open ${label}`, `${language}: ${label} template`);
      assert.ok(!hint.includes(label), `${language}: the label is translated too: ${hint}`);
    }
  }
  setTranslationLanguage('zh');
  assert.equal(tr('Open Skills'), '打开 技能');
  setTranslationLanguage('en');
  assert.equal(tr('Open Skills'), 'Open Skills');
});

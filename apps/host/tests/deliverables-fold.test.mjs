/**
 * A long list of files an answer produced pushes the answer itself off the screen, so past a handful the
 * cards fold behind one line. The threshold is the whole decision, and it is the part worth pinning: a
 * list of five must not fold (folding a short list costs a click for nothing), six must.
 */
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';

async function moduleAt(path) {
  const result = await build({ entryPoints: [fileURLToPath(new URL(path, import.meta.url))], bundle: true, write: false, platform: 'node', format: 'esm' });
  return import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`);
}

const { DELIVERABLES_FOLD_AFTER, foldsDeliverables } = await moduleAt('../src/lib/deliverables.ts');

test('a short list stays open: no click to see five files', () => {
  for (const count of [0, 1, 2, 5]) assert.equal(foldsDeliverables(count), false, `${count} files are shown as cards`);
});

test('past the handful it folds', () => {
  for (const count of [6, 12, 200]) assert.equal(foldsDeliverables(count), true, `${count} files fold into one line`);
});

test('the threshold is the number the person asked for, and the two agree', () => {
  assert.equal(DELIVERABLES_FOLD_AFTER, 5, 'five shown, six folded');
  assert.equal(foldsDeliverables(DELIVERABLES_FOLD_AFTER), false);
  assert.equal(foldsDeliverables(DELIVERABLES_FOLD_AFTER + 1), true);
});

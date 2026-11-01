/** "Model progress" is one figure: the Monitor's top bar and the thin bar under the composer read the same helper, so they cannot disagree. */
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';

async function moduleAt(path) { const result = await build({ entryPoints: [fileURLToPath(new URL(path, import.meta.url))], bundle: true, write: false, platform: 'node', format: 'esm' }); return import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`); }

const { modelProgress } = await moduleAt('../src/lib/model-progress.ts');

const base = { phaseLabel: '', prompt: { done: 0, total: 0, pct: 0 } };

test('reading the prompt: the bar follows the share of the prompt read, in the reading tone', () => {
  const p = modelProgress({ ...base, phase: 'reading', prompt: { done: 500, total: 1000, pct: 50 } });
  assert.equal(p.value, 50, 'half read, half filled');
  assert.equal(p.tone, 'info', 'reading is shown in its own colour, as on the Monitor');
  assert.equal(p.indeterminate, false, 'the size is known, so the bar fills rather than sweeps');
});

test('writing: the share of the answer written, in the accent tone', () => {
  const p = modelProgress({ ...base, phase: 'generating', generation: { done: 30, total: 120 } });
  assert.equal(Math.round(p.value), 25, 'a quarter written');
  assert.equal(p.tone, 'accent', 'writing uses the answer colour');
  assert.equal(p.indeterminate, false);
});

test('writing with no known limit: the bar sweeps instead of sitting at zero', () => {
  const p = modelProgress({ ...base, phase: 'thinking', generation: { done: 40, total: null } });
  assert.equal(p.indeterminate, true, 'work is happening but its size is unknown');
  assert.equal(p.value, 0, 'no figure is invented for it');
});

test('a model that is starting: a sweep, so a slow load is not read as a stall', () => {
  const p = modelProgress({ ...base, phase: 'loading' });
  assert.equal(p.indeterminate, true);
  assert.equal(p.tone, 'info');
});

test('idle: a zero the caller can hide behind', () => {
  const p = modelProgress({ ...base, phase: 'idle' });
  assert.equal(p.value, 0);
  assert.equal(p.indeterminate, false);
  assert.equal(p.phase, 'idle', 'the caller uses the phase to decide whether to show the bar at all');
});

test('no telemetry yet: nothing to draw', () => {
  assert.equal(modelProgress(null), null);
  assert.equal(modelProgress(undefined), null);
});

test('a figure the engine reported outside 0..100 is kept inside the bar', () => {
  assert.equal(modelProgress({ ...base, phase: 'reading', prompt: { done: 9, total: 8, pct: 140 } }).value, 100, 'never overflows');
  assert.equal(modelProgress({ ...base, phase: 'reading', prompt: { done: 0, total: 8, pct: -5 } }).value, 0, 'never negative');
});

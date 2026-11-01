/**
 * A question left open by a mid-turn comment must be remembered, must not pile up, and must be clearable.
 * The list is the only trace the earlier question leaves, so its rules matter: one entry per thread, a small
 * cap so it can never push the composer off screen, and removal on the click that resolves it.
 */
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';

async function moduleAt(path) {
  const result = await build({ entryPoints: [fileURLToPath(new URL(path, import.meta.url))], bundle: true, write: false, platform: 'node', format: 'esm' });
  // Salt: an identical bundle yields an identical data: URL, and Node returns the cached module with the
  // previous test's state.
  const text = result.outputFiles[0].text + `\n/* salt ${Math.random()} */`;
  return import(`data:text/javascript;base64,${Buffer.from(text).toString('base64')}`);
}

const CHAT = 'c1';

test('the question in flight is remembered when a comment joins the turn', async () => {
  const m = await moduleAt('../src/lib/deferred.ts');
  assert.deepEqual(m.deferredOf(CHAT), [], 'nothing is deferred to begin with');
  m.noteDeferred(CHAT, 'how does the goal mode work?');
  assert.deepEqual(m.deferredOf(CHAT).map(q => q.text), ['how does the goal mode work?']);
});

test('the same thread is not listed twice, and a return to it is not a new thread', async () => {
  const m = await moduleAt('../src/lib/deferred.ts');
  m.noteDeferred(CHAT, 'explain the goal mode and its rounds');
  m.noteDeferred(CHAT, 'explain the goal mode and its rounds');
  m.noteDeferred(CHAT, 'explain the goal mode and its rounds again, please, in more detail than before');
  assert.equal(m.deferredOf(CHAT).length, 1, 'one entry per thread');
});

test('an empty comment adds nothing', async () => {
  const m = await moduleAt('../src/lib/deferred.ts');
  m.noteDeferred(CHAT, '   ');
  m.noteDeferred(CHAT, null);
  m.noteDeferred(CHAT, undefined);
  assert.deepEqual(m.deferredOf(CHAT), []);
});

test('the list stays short: the oldest thread is dropped, the newest kept', async () => {
  const m = await moduleAt('../src/lib/deferred.ts');
  for (const t of ['first question', 'second question', 'third question', 'fourth question']) m.noteDeferred(CHAT, t);
  assert.deepEqual(m.deferredOf(CHAT).map(q => q.text), ['second question', 'third question', 'fourth question']);
});

test('dismissing or returning removes one entry and leaves the rest', async () => {
  const m = await moduleAt('../src/lib/deferred.ts');
  m.noteDeferred(CHAT, 'alpha');
  m.noteDeferred(CHAT, 'beta');
  const [first] = m.deferredOf(CHAT);
  m.clearDeferred(CHAT, first.id);
  assert.deepEqual(m.deferredOf(CHAT).map(q => q.text), ['beta']);
});

test('one chat does not leak its list into another', async () => {
  const m = await moduleAt('../src/lib/deferred.ts');
  m.noteDeferred(CHAT, 'about this chat');
  assert.deepEqual(m.deferredOf('other-chat'), [], 'a different chat sees nothing');
  m.clearDeferred(CHAT);
  assert.deepEqual(m.deferredOf(CHAT), [], 'clearing the chat empties it');
});

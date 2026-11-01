/**
 * A queued comment must not come back as a card once the host has taken it.
 *
 * The page learns the waiting list from several sources that can arrive in any order: the answer to the POST that
 * queued the comment carries the list as it was BEFORE the Harness took it, while the frame that announces the
 * delivery carries it AFTER. When the POST answer lands last - most often at the end of an answer, where steering
 * and the turn's finish overlap - an unguarded snapshot puts the card back for good.
 */
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';

async function moduleAt(path) {
  const result = await build({ entryPoints: [fileURLToPath(new URL(path, import.meta.url))], bundle: true, write: false, platform: 'node', format: 'esm' });
  // Salt the text: an identical bundle yields an identical data: URL, and Node hands back the module cached with
  // the previous test's state.
  const text = result.outputFiles[0].text + `\n/* salt ${Math.random()} */`;
  return import(`data:text/javascript;base64,${Buffer.from(text).toString('base64')}`);
}

const CHAT = 'chat-1';
const item = { id: 'q-1', text: 'a comment typed mid-turn', deliverAt: 'step' };

test('a snapshot that arrives after the comment was delivered cannot restore the card', async () => {
  const m = await moduleAt('../src/lib/plan.ts');

  m.applyQueueFrame(CHAT, [item]);
  assert.deepEqual(m.queueOf(CHAT).map(x => x.id), ['q-1'], 'the comment shows while it waits');

  m.markQueueSettled(CHAT, ['q-1']);
  m.applyQueueFrame(CHAT, []);
  assert.deepEqual(m.queueOf(CHAT), [], 'the delivery clears it');

  m.applyQueueFrame(CHAT, [item]);   // the POST answer, landing late, still names the comment
  assert.deepEqual(m.queueOf(CHAT), [], 'a stale snapshot does not put the card back');
});

test('a comment that was handed back at the end of the turn is settled too', async () => {
  const m = await moduleAt('../src/lib/plan.ts');
  m.applyQueueFrame(CHAT, [item]);
  m.markQueueSettled(CHAT, ['q-1']);           // queued-release
  m.applyQueueFrame(CHAT, [item]);             // a late snapshot
  assert.deepEqual(m.queueOf(CHAT), [], 'no card for a comment the page already gave back');
});

test('a different comment is unaffected: only settled ids are dropped', async () => {
  const m = await moduleAt('../src/lib/plan.ts');
  m.applyQueueFrame(CHAT, [item]);
  m.markQueueSettled(CHAT, ['q-1']);
  m.applyQueueFrame(CHAT, [item, { id: 'q-2', text: 'a second comment', deliverAt: 'step' }]);
  assert.deepEqual(m.queueOf(CHAT).map(x => x.id), ['q-2'], 'the waiting comment still shows');
});

test('a comment re-sent by the person is a new id and shows again', async () => {
  const m = await moduleAt('../src/lib/plan.ts');
  m.applyQueueFrame(CHAT, [item]);
  m.markQueueSettled(CHAT, ['q-1']);
  m.applyQueueFrame(CHAT, [{ id: 'q-9', text: item.text, deliverAt: 'step' }]);
  assert.deepEqual(m.queueOf(CHAT).map(x => x.id), ['q-9'], 'the host mints a fresh id per queued message');
});

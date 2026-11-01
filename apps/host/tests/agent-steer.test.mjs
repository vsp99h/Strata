// A comment typed while the assistant is working goes INTO the turn that is running, not after it.
//
// The Harness calls this steering: `session/prompt` with mode:'steer' is accepted during an ordinary turn, the
// text lands in the Harness' next-step inbox and the model reads it on the next step of the same turn. The host
// announces a comment as delivered only once the Harness has taken it, so a comment the Harness will not take
// stays on the waiting list and the end of the turn hands it back to the page.
//
// A goal (and a plan step) keeps the rhythm it had: its comments wait for a step boundary and are covered by
// agent-plan-run.test.mjs.
//
// Run:  STRATA_HARNESS_DIR=%LOCALAPPDATA%\Programs\Strata\harness node --test tests/agent-steer.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startScriptedWorker } from './helpers/scripted-worker.mjs';
import { createAgentBridge } from '../server/agent/agent-bridge.mjs';
import { resolveHarness } from '../server/agent/harness-runtime.mjs';

const HARNESS = process.env.STRATA_HARNESS_DIR;
const skip = !HARNESS || !resolveHarness({ env: process.env }).ok ? 'STRATA_HARNESS_DIR is not set to a built Harness' : false;
const wait = ms => new Promise(r => setTimeout(r, ms));
const text = m => (typeof m?.content === 'string' ? m.content : Array.isArray(m?.content) ? m.content.map(p => p.text ?? '').join(' ') : '');
/** Which of the model's requests first carries the marker in a user message (-1 when none does). */
const firstRequestWith = (worker, needle) => worker.requests.findIndex(r => (JSON.parse(r.raw).messages ?? []).some(m => m.role === 'user' && text(m).includes(needle)));
const queueFrames = frames => frames.filter(f => f.type === 'queued-message').map(f => f.state);

async function rig(t, chatId) {
  const worker = await startScriptedWorker({ chunkDelayMs: 300 });
  const dir = mkdtempSync(join(tmpdir(), 'strata-steer-'));
  const ws = join(dir, 'ws'); mkdirSync(ws, { recursive: true });
  const local = [{ id: 'inst-1', label: 'Scripted', baseUrl: worker.url, modelId: 'scripted-model', context: 32768, slots: 2 }];
  const seen = [];
  const bridge = createAgentBridge({ dataDir: dir, localInstances: () => local, connections: () => [], env: process.env, startTimeoutMs: 90_000, onPlan: () => {}, onQueue: (id, queue) => seen.push({ id, queue }), onGoal: () => {} });
  t.after(async () => { await bridge.stop(chatId).catch(() => {}); await bridge.close(); await worker.close(); try { rmSync(dir, { recursive: true, force: true, maxRetries: 3 }); } catch { /* best effort */ } });
  return { worker, bridge, ws, seen };
}

/**
 * Start a turn of many steps and wait until its first tool call proves the turn is live. The turn's promise comes
 * back INSIDE an object: a helper that returns it would make the caller's `await` wait for the whole turn (an
 * async function awaits the promise it returns), and the test would then steer a turn that is already over.
 */
async function startLongTurn(bridge, ws, chatId, out, steps = 12) {
  const run = bridge.runTurn({ chatId, workspacePath: ws, mode: 'bypass', message: `SCRIPT:steps ${steps} steer.txt`, onFrame: f => out.push(f) });
  run.catch(() => { /* the test stops the turn; its rejection is not a failure */ });
  for (let i = 0; i < 400 && !out.some(f => f.type === 'agent-tool'); i++) await wait(20);
  assert.ok(out.some(f => f.type === 'agent-tool'), 'the turn reached its first tool call');
  return { run };
}

test('a comment typed during an ordinary turn reaches the model on its next step, while the turn is still running', { skip }, async (t) => {
  const { worker, bridge, ws } = await rig(t, 's1');
  const out = [];
  const { run } = await startLongTurn(bridge, ws, 's1', out);
  assert.equal(bridge.isRunning('s1'), true, 'the turn is live');
  const requestsBefore = worker.requests.length;
  const needle = `STEER-MARKER-${Date.now()}`;

  const added = bridge.queueMessage({ chatId: 's1', text: needle });
  assert.equal(added.message.deliverAt, 'step', 'the comment belongs to the next step of this turn');
  assert.deepEqual(added.queue.map(m => m.text), [needle], 'it shows as waiting until the Harness has taken it');

  for (let i = 0; i < 400 && firstRequestWith(worker, needle) < 0; i++) await wait(20);
  const sawAt = firstRequestWith(worker, needle);
  assert.ok(sawAt >= 0, 'the model received the comment');
  assert.ok(sawAt >= requestsBefore, 'it reaches a request made after the comment, not one already in flight');
  assert.equal(bridge.isRunning('s1'), true, 'the model read it while the turn was still running: the comment arrived mid-turn, not after the answer');

  const frames = out.filter(f => f.type === 'queued-message');
  assert.deepEqual(queueFrames(out), ['queued', 'delivered'], 'the page is told it waits, then that it was sent');
  assert.equal(frames.at(-1).message.text, needle, 'the delivered frame carries the text, so the page can show it as the person’s message');
  assert.deepEqual(bridge.takeQueue('s1'), { queue: [], released: [] }, 'nothing is left waiting');

  await bridge.stop('s1'); await run;
});

test('a comment typed while nothing runs is refused, so the page sends it as an ordinary message', { skip }, async (t) => {
  const { bridge } = await rig(t, 's2');
  let err = null;
  try { bridge.queueMessage({ chatId: 's2', text: 'a comment with no turn running' }); } catch (e) { err = e; }
  assert.ok(err, 'with no turn running there is nothing to add to');
  assert.equal(err.code, 'queue-idle');
  assert.match(err.message, /Nothing is running/);
});

test('a comment the Harness will not take stays waiting and is handed back when the turn ends', { skip }, async (t) => {
  const { bridge, ws } = await rig(t, 's3');
  const out = [];
  const { run } = await startLongTurn(bridge, ws, 's3', out, 4);
  const gw = bridge._debug().rt.gw;
  const realRpc = gw.rpc.bind(gw);
  gw.rpc = (method, args, opts) => (method === 'session/prompt' && args?.request?.mode === 'steer')
    ? Promise.reject(new Error('the Harness will not take it'))
    : realRpc(method, args, opts);
  t.after(() => { gw.rpc = realRpc; });

  const needle = `REFUSED-MARKER-${Date.now()}`;
  bridge.queueMessage({ chatId: 's3', text: needle });
  await wait(600);
  assert.deepEqual(queueFrames(out), ['queued'], 'a comment the Harness did not take is never announced as delivered');
  assert.deepEqual(bridge.takeQueue('s3').queue.map(m => m.text), [needle], 'it stays on the waiting list, still visible');

  await bridge.stop('s3'); await run;
  const released = out.find(f => f.type === 'queued-release');
  assert.ok(released, 'the end of an ordinary turn hands the comment back too');
  assert.deepEqual(released.messages.map(m => m.text), [needle]);
  assert.ok(out.findIndex(f => f.type === 'queued-release') < out.findIndex(f => f.type === 'done'), 'it is handed back before the turn is over');
  assert.deepEqual(bridge.takeQueue('s3'), { queue: [], released: [] }, 'the waiting list is empty afterwards');
});

test('a comment the Harness takes after its turn has gone still leaves the waiting list, so no card stays on the page', { skip }, async (t) => {
  const { bridge, ws, seen } = await rig(t, 's4');
  const out = [];
  const { run } = await startLongTurn(bridge, ws, 's4', out, 4);
  const gw = bridge._debug().rt.gw;
  const realRpc = gw.rpc.bind(gw);
  let letHarnessAnswer = null;
  const gate = new Promise(resolve => { letHarnessAnswer = resolve; });
  gw.rpc = (method, args, opts) => (method === 'session/prompt' && args?.request?.mode === 'steer')
    ? gate.then(() => realRpc(method, args, opts))
    : realRpc(method, args, opts);
  t.after(() => { gw.rpc = realRpc; });

  const needle = `LATE-ACCEPT-MARKER-${Date.now()}`;
  bridge.queueMessage({ chatId: 's4', text: needle });
  assert.deepEqual(bridge.takeQueue('s4').queue.map(m => m.text), [needle], 'it waits while the Harness decides');

  await bridge.stop('s4'); await run;   // the turn is over before the Harness has answered the steer
  const snapshots = () => seen.filter(s => s.id === 's4').length;
  const beforeLateAnswer = snapshots();

  letHarnessAnswer();
  for (let i = 0; i < 200 && snapshots() === beforeLateAnswer; i++) await wait(20);

  assert.ok(!out.some(f => f.type === 'queued-message' && f.state === 'delivered'), 'a comment whose turn is gone is not announced as delivered into a turn that no longer exists');
  assert.ok(snapshots() > beforeLateAnswer, 'the late acceptance still gives the page a snapshot, so its card cannot stay up');
  assert.deepEqual(seen.filter(s => s.id === 's4').at(-1)?.queue ?? [], [], 'that snapshot says nothing is waiting');
  assert.deepEqual(bridge.takeQueue('s4').queue, [], 'the waiting list is empty afterwards');
});

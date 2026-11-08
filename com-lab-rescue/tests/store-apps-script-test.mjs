/**
 * Actual GameStore -> RPC envelope -> actual Code.gs/Questions.gs integration.
 * Only Google platform services and the fetch boundary are simulated here.
 * This does not assert that an unpublished Google deployment has working CORS.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { harness, questionsById } from './apps-script-harness.mjs';

const bank = JSON.parse(await readFile(new URL('../data/question-bank.json', import.meta.url), 'utf8'));
const source = (await readFile(new URL('../src/store.js', import.meta.url), 'utf8')).replace(
  "import bank from '../data/question-bank.json';", `const bank = ${JSON.stringify(bank)};`,
);
const { GameStore } = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
const KEY = 'com-lab-rescue:v1';
const ENDPOINT = 'https://script.google.com/macros/s/AKfycb_CONTRACT_INTEGRATION_TEST_123456789/exec';
const copy = (value) => JSON.parse(JSON.stringify(value));
const profile = (code = '000077') => ({ full_name: `นักเรียน ทดสอบ${code}`, student_code: code, class_group: 'ม.1/1', nickname: `ช่าง${code}`, avatar_color: '#FF91BB' });

class MemoryStorage {
  data = new Map();
  getItem(key) { return this.data.get(key) ?? null; }
  setItem(key, value) { this.data.set(key, String(value)); }
  removeItem(key) { this.data.delete(key); }
}

function bridgeFor(google) {
  const bridge = {
    online: true, attempts: [], delivered: [], loseNextAnswerResponse: false,
    goOfflineAfterError: false, dashboardPayload: null,
  };
  bridge.fetch = async (url, options) => {
    assert.equal(url, ENDPOINT, 'All online requests target the configured Google deployment');
    assert.equal(options.method, 'POST');
    assert.equal(options.headers['Content-Type'], 'text/plain;charset=utf-8');
    assert.equal(options.headers.Authorization, undefined);
    assert.equal(options.mode, undefined);
    assert.equal(options.redirect, 'follow');
    assert.equal(options.credentials, 'omit');
    const envelope = JSON.parse(options.body);
    assert.ok(['GET', 'POST'].includes(envelope.method));
    assert.equal(typeof envelope.token, 'string');
    bridge.attempts.push(copy(envelope));
    if (!bridge.online) throw new TypeError('Network disconnected');
    const result = bridge.dashboardPayload && envelope.path === '/api/dashboard'
      ? { ok: true, data: bridge.dashboardPayload }
      : JSON.parse(google.sandbox.doPost({ postData: {
        contents: options.body,
        type: options.headers['Content-Type'],
        length: Buffer.byteLength(options.body, 'utf8'),
      } }).getContent());
    bridge.delivered.push({ request: copy(envelope), response: copy(result) });
    if (bridge.goOfflineAfterError && !result.ok) bridge.online = false;
    if (bridge.loseNextAnswerResponse && envelope.path.endsWith('/answers') && result.ok) {
      bridge.loseNextAnswerResponse = false;
      bridge.online = false;
      // The write already committed, but its acknowledgement never reached
      // the browser. Reusing the queued event must be safe.
      throw new TypeError('Connection lost after Google committed the answer');
    }
    return { ok: true, status: 200, json: async () => copy(result) };
  };
  return bridge;
}

function browser(bridge, storage = new MemoryStorage(), endpoint = ENDPOINT) {
  Object.defineProperty(globalThis, 'localStorage', { value: storage, configurable: true });
  Object.defineProperty(globalThis, 'navigator', { value: { onLine: true }, configurable: true });
  Object.defineProperty(globalThis, 'location', { value: { protocol: 'file:', origin: 'null' }, configurable: true });
  globalThis.COM_LAB_CONFIG = { googleScriptUrl: endpoint };
  globalThis.fetch = bridge.fetch;
  return storage;
}

async function connect(bridge, storage = new MemoryStorage()) {
  browser(bridge, storage);
  const store = new GameStore();
  await store.init();
  await store.connectionPromise;
  return store;
}

async function complete(store, correctCount = 12, syncEach = true) {
  const ids = [...store.state.session.questions];
  for (const [index, id] of ids.entries()) {
    const question = questionsById[id];
    const optionId = index < correctCount ? question.correct_option_id : question.options.find((option) => option.id !== question.correct_option_id).id;
    await store.answer(id, optionId);
    await store.acknowledge(id);
    if (syncEach) {
      await store.sync();
      assert.equal(store.state.pendingCount, 0, store.state.error);
      assert.equal(store.state.session.current_stage, Math.min(2, Math.floor((index + 1) / 4)));
    }
  }
}

await test('real Google RPC registration, session/current resume and all 12 answer/ack transitions agree with the store', async () => {
  const google = harness(), bridge = bridgeFor(google), storage = new MemoryStorage();
  const store = await connect(bridge, storage);
  assert.equal(store.state.mode, 'server');
  assert.equal(store.state.connectionAvailable, true);
  await store.register(profile());
  assert.equal(store.state.profile.student_code, '000077');
  assert.equal(google.state.sheets.get('players').getLastRow(), 2);
  await store.start();
  const original = copy(store.state.session);
  assert.equal(original.questions.length, 12);
  assert.equal(store.state.syncStatus, 'saved');
  assert.deepEqual(Object.keys(store.state.session.answers), []);

  // A second application instance restores the exact server-selected question
  // and option order rather than rolling a fresh practice run.
  const resumed = await connect(bridge, storage);
  assert.equal(resumed.state.session.id, original.id);
  assert.deepEqual(resumed.state.session.questions, original.questions);
  assert.deepEqual(resumed.state.session.option_orders, original.option_orders);
  assert.ok(bridge.delivered.some((call) => call.request.path === '/api/sessions/current'));
  await complete(resumed, 9);
  const session = resumed.state.session;
  assert.equal(session.status, 'completed');
  assert.equal(session.score, 90);
  assert.equal(session.correct_count, 9);
  assert.equal(session.wrong_count, 3);
  assert.equal(session.badge, 'silver');
  assert.equal(session.learning_result, 'passed');
  assert.equal(session.server_confirmed, true);
  assert.deepEqual(session.completed_stages, ['stage_1', 'stage_2', 'stage_3']);
  assert.equal(google.state.sheets.get('answers').getLastRow(), 13);
  assert.equal(google.state.sheets.get('events').getLastRow(), 25);
  const dashboard = await resumed.getDashboard();
  assert.equal(dashboard.source, 'server');
  assert.equal(dashboard.scope, 'class');
  assert.equal(dashboard.partial, false);
  assert.equal(dashboard.total_players, 1);
  assert.equal(dashboard.average_score, 90);
  assert.equal(dashboard.leaderboard[0].nickname, profile().nickname);
  assert.ok(!JSON.stringify(dashboard).includes(profile().full_name));
  assert.equal(google.state.unlockedWrites, 0);
});

await test('lost response after a committed Google write and a fully offline round replay without duplicate scores', async () => {
  const google = harness(), bridge = bridgeFor(google), storage = new MemoryStorage();
  const store = await connect(bridge, storage);
  await store.register(profile()); await store.start();
  const ids = [...store.state.session.questions];
  bridge.loseNextAnswerResponse = true;
  await store.answer(ids[0], questionsById[ids[0]].correct_option_id);
  await store.sync();
  assert.equal(bridge.online, false);
  assert.equal(google.state.sheets.get('answers').getLastRow(), 2);
  assert.equal(store.state.pendingCount, 1);
  await store.acknowledge(ids[0]);
  for (const id of ids.slice(1)) {
    await store.answer(id, questionsById[id].correct_option_id);
    await store.acknowledge(id);
  }
  await store.sync();
  assert.equal(store.state.session.status, 'completed');
  assert.equal(store.state.session.server_confirmed, false);
  assert.equal(store.state.pendingCount, 24);
  const queuedIds = JSON.parse(storage.getItem(KEY)).outbox.map((event) => event.event_id);

  const resumed = await connect(bridge, storage);
  assert.equal(resumed.state.mode, 'server');
  assert.equal(resumed.state.session.id, store.state.session.id);
  assert.equal(resumed.state.pendingCount, 24);
  bridge.online = true;
  await resumed.sync();
  assert.equal(resumed.state.pendingCount, 0, resumed.state.error);
  assert.equal(resumed.state.session.score, 120);
  assert.equal(resumed.state.session.correct_count, 12);
  assert.equal(resumed.state.session.status, 'completed');
  assert.equal(resumed.state.session.server_confirmed, true);
  assert.equal(google.state.sheets.get('answers').getLastRow(), 13);
  assert.equal(google.state.sheets.get('events').getLastRow(), 25);
  const accepted = bridge.delivered.filter((call) => /\/(answers|ack)$/.test(call.request.path));
  assert.equal(accepted.length, 25, 'One response was lost and its answer was retried once');
  assert.equal(accepted[1].response.data.replayed, true);
  assert.deepEqual(accepted.slice(1).map((call) => call.request.body.event_id), queuedIds);
  const count = accepted.length;
  await resumed.sync();
  assert.equal(bridge.delivered.filter((call) => /\/(answers|ack)$/.test(call.request.path)).length, count);
});

await test('the store recovers a real partial Google Sheets write failure through the backend answer ledger', async () => {
  const google = harness(), bridge = bridgeFor(google);
  const store = await connect(bridge);
  await store.register(profile()); await store.start();
  const id = store.state.session.questions[0];
  google.state.failNextWrite = 'sessions';
  bridge.goOfflineAfterError = true;
  await store.answer(id, questionsById[id].correct_option_id);
  await store.sync();
  assert.equal(store.state.pendingCount, 1);
  assert.equal(store.state.syncStatus, 'offline');
  assert.equal(google.state.sheets.get('answers').getLastRow(), 2);
  assert.equal(bridge.delivered.at(-1).response.error.status, 503);
  await store.acknowledge(id);
  bridge.online = true; bridge.goOfflineAfterError = false;
  await store.sync();
  assert.equal(store.state.pendingCount, 0, store.state.error);
  assert.equal(store.state.session.score, 10);
  assert.equal(store.state.session.answers[id].acknowledged, true);
  assert.equal(google.state.sheets.get('answers').getLastRow(), 2);
  assert.ok(bridge.delivered.some((call) => call.response.data?.replayed === true));
  assert.equal(google.state.held, false);
});

await test('configured failures and real duplicate-registration errors never create phantom local users', async () => {
  const google = harness(), bridge = bridgeFor(google);
  const original = await connect(bridge);
  await original.register(profile());
  const other = await connect(bridge, new MemoryStorage());
  await assert.rejects(other.register(profile()), { code: 'recovery_required' });
  assert.equal(other.state.mode, 'server');
  assert.equal(other.state.profile, null);
  assert.equal(other.state.history.length, 0);
  assert.equal(google.state.sheets.get('players').getLastRow(), 2);
  bridge.online = false;
  const offline = await connect(bridge, new MemoryStorage());
  await assert.rejects(offline.register(profile('000088')), { code: 'network_unavailable' });
  assert.equal(offline.state.mode, 'server');
  assert.equal(offline.state.profile, null);
  assert.equal(offline.state.history.length, 0);
  assert.equal(google.state.sheets.get('players').getLastRow(), 2);
});

await test('real paged Google dashboard payload preserves partial/source semantics, distinct from device fallback', async () => {
  const google = harness(), bridge = bridgeFor(google);
  const store = await connect(bridge);
  await store.register(profile()); await store.start(); await complete(store, 12);
  const second = google.register({ group: 'ม.1/1', student: '000088', nickname: 'อีกคน' });
  google.complete(second.token, 9);
  const token = JSON.parse(globalThis.localStorage.getItem(KEY)).token;
  const page = google.ok('GET', '/api/dashboard?page=2&page_size=1', {}, token);
  assert.equal(page.source, 'google-sheets');
  assert.equal(page.partial, true);
  assert.equal(page.total_results, 2);
  // This is the backend's real pagination result, delivered through the same
  // transport so the client's normalization can be verified without 1001 users.
  bridge.dashboardPayload = page;
  const online = await store.getDashboard();
  assert.equal(online.source, 'server');
  assert.equal(online.scope, 'class');
  assert.equal(online.partial, true);
  assert.equal(online.total_results, 2);
  assert.equal(online.average_score, 105);
  assert.equal(online.leaderboard.length, 1);
  bridge.online = false;
  const cached = await store.getDashboard();
  assert.equal(cached.source, 'device-cache');
  assert.equal(cached.scope, 'this_device');
  assert.equal(cached.partial, true);
  assert.equal(cached.total_players, 1);
});

await test('a different Google bank version is rejected before any provisional answer is graded', async () => {
  const google = harness(), bridge = bridgeFor(google);
  google.sandbox.COMLAB_QUESTION_BANK.bank_version = '2.0.0';
  const store = await connect(bridge);
  await store.register(profile());
  await assert.rejects(store.start(), { code: 'bank_version_mismatch' });
  assert.equal(store.state.mode, 'server');
  assert.equal(store.state.session, null);
  assert.equal(google.state.sheets.get('answers').getLastRow(), 1);
});

await test('changing Google question text without a version bump cannot silently use bundled offline answers', async () => {
  const google = harness(), bridge = bridgeFor(google);
  google.sandbox.COMLAB_QUESTION_BANK.questions.forEach((question) => { question.prompt += ' (ปรับปรุงเนื้อหา)'; });
  const store = await connect(bridge);
  await store.register(profile());
  await assert.rejects(store.start(), { code: 'bank_snapshot_mismatch' });
  assert.equal(store.state.session, null);
  assert.equal(store.state.questions.length, 0);
  assert.equal(google.state.sheets.get('answers').getLastRow(), 1);
});

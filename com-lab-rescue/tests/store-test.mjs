import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

// Keep this test dependency-free. The browser bundle resolves JSON normally;
// Node loads the same module with its question bank injected in memory.
const bank = JSON.parse(await readFile(new URL('../data/question-bank.json', import.meta.url), 'utf8'));
const rawSource = await readFile(new URL('../src/store.js', import.meta.url), 'utf8');
const source = rawSource.replace("import bank from '../data/question-bank.json';", `const bank = ${JSON.stringify(bank)};`);
const { GameStore } = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
const KEY = 'com-lab-rescue:v1';
const ENDPOINT_KEY = 'com-lab-rescue:google-script-url';
const GOOGLE_URL = 'https://script.google.com/macros/s/AKfycb_TEST_DEPLOYMENT_ID_0123456789/exec';
const byId = new Map(bank.questions.map((question) => [question.id, question]));
const copy = (value) => JSON.parse(JSON.stringify(value));

class MemoryStorage {
  values = new Map();
  failWrite = false;
  getItem(key) { return this.values.has(key) ? this.values.get(key) : null; }
  setItem(key, value) {
    if (this.failWrite) throw new Error('quota exceeded');
    this.values.set(key, String(value));
  }
  removeItem(key) { this.values.delete(key); }
}

function setup(protocol = 'file:', storage = new MemoryStorage()) {
  Object.defineProperty(globalThis, 'localStorage', { value: storage, configurable: true });
  Object.defineProperty(globalThis, 'location', { value: { protocol, origin: protocol === 'file:' ? 'null' : 'http://localhost:8000' }, configurable: true });
  Object.defineProperty(globalThis, 'navigator', { value: { onLine: true }, configurable: true });
  globalThis.COM_LAB_CONFIG = { googleScriptUrl: '' };
  globalThis.fetch = async () => { throw new TypeError('No backend'); };
  return storage;
}

const profile = (code = '001', group = 'ม.1/1') => ({
  full_name: `นักเรียนทดสอบ ${code}`, student_code: code, class_group: group,
  nickname: `บิต${code}`, avatar_color: '#51D6E4',
});

async function finish(store, correct = 12) {
  const ids = [...store.state.session.questions];
  for (const [index, id] of ids.entries()) {
    const question = byId.get(id);
    const option = index < correct ? question.correct_option_id : question.options.find((item) => item.id !== question.correct_option_id).id;
    await store.answer(id, option);
    await store.acknowledge(id);
  }
}

function fixtureSession(playerId) {
  const questions = [];
  for (const stage of ['stage_1', 'stage_2', 'stage_3']) {
    for (const difficulty of ['easy', 'medium']) {
      for (const type of ['multiple_choice', 'true_false']) questions.push(bank.questions.find((q) => q.stage_id === stage && q.difficulty === difficulty && q.type === type).id);
    }
  }
  return {
    id: 'server-session-001', session_id: 'server-session-001', player_id: playerId,
    bank_version: bank.bank_version, questions,
    option_orders: Object.fromEntries(questions.map((id) => [id, byId.get(id).options.map((option) => option.id)])),
    answers: {}, started_at: new Date().toISOString(), ended_at: null,
    status: 'in_progress', score: 0, max_score: 120, correct_count: 0, wrong_count: 0,
    current_stage: 0, current_stage_id: 'stage_1', completed_stages: [],
    active_seconds: 0, elapsed_seconds: 0, badge: null, learning_result: 'pending',
  };
}

class FakeBackend {
  online = true;
  rejectAuth = false;
  received = [];
  calls = [];
  requests = [];
  holdNextAnswer = false;
  release = null;
  token = 'opaque-test-token-do-not-export';
  player = null;
  session = null;

  response(data, status = 200) {
    const snapshot = copy(status >= 200 && status < 300 ? { ok: true, data } : { ok: false, error: { ...data.error, status } });
    return { ok: true, status: 200, json: async () => snapshot };
  }

  refresh() {
    const session = this.session;
    const answers = Object.values(session.answers);
    session.correct_count = answers.filter((answer) => answer.is_correct).length;
    session.wrong_count = answers.length - session.correct_count;
    session.score = session.correct_count * 10;
    session.completed_stages = ['stage_1', 'stage_2', 'stage_3'].filter((stage) => session.questions.filter((id) => byId.get(id).stage_id === stage).every((id) => session.answers[id]?.acknowledged));
    session.current_stage = Math.min(2, session.completed_stages.length);
    session.current_stage_id = `stage_${session.current_stage + 1}`;
    if (session.completed_stages.length === 3) {
      session.status = 'completed'; session.ended_at = new Date().toISOString();
      session.badge = session.correct_count >= 11 ? 'gold' : session.correct_count >= 9 ? 'silver' : 'bronze';
      session.learning_result = session.correct_count >= 9 ? 'passed' : 'needs_review';
    }
  }

  fetch = async (url, options = {}) => {
    const envelope = JSON.parse(options.body);
    const { path, body = {}, token } = envelope;
    this.calls.push(path);
    this.requests.push({ url, options: { ...options, signal: undefined }, envelope: copy(envelope) });
    if (!this.online) throw new TypeError('offline');
    if (path === '/api/health') return this.response({ ok: true, storage: 'google-sheets' });
    if (path === '/api/register') {
      this.player = { ...body, id: 'server-player-001', player_id: 'server-player-001' };
      return this.response({ player: this.player, token: this.token });
    }
    if (this.rejectAuth || token !== this.token) return this.response({ error: { code: 'unauthorized', message: 'สิทธิ์เชื่อมต่อหมดอายุ กรุณาเข้าสู่ระบบใหม่' } }, 401);
    if (path === '/api/sessions' || path === '/api/sessions/current') {
      if (path === '/api/sessions' && !this.session) this.session = fixtureSession(this.player.player_id);
      const session = this.session?.status === 'in_progress' ? this.session : null;
      return this.response({ session, questions: (session?.questions || []).map((id) => {
        const { correct_option_id, explanation, ...question } = byId.get(id);
        return question;
      }) });
    }
    if (path.endsWith('/answers')) {
      this.received.push({ kind: 'answer', ...body });
      const question = byId.get(body.question_id);
      if (!this.session.answers[question.id]) {
        const correct = question.correct_option_id === body.option_id;
        this.session.answers[question.id] = {
          question_id: question.id, option_id: body.option_id, is_correct: correct, points: correct ? 10 : 0,
          correct_option_id: question.correct_option_id, explanation: question.explanation,
          answered_at: new Date().toISOString(), acknowledged: false, acknowledged_at: null,
        };
      }
      this.refresh();
      const result = this.response({ answer: this.session.answers[question.id], session: this.session });
      if (this.holdNextAnswer) {
        this.holdNextAnswer = false;
        await new Promise((resolve) => { this.release = resolve; });
      }
      return result;
    }
    if (path.endsWith('/ack')) {
      this.received.push({ kind: 'ack', ...body });
      this.session.answers[body.question_id].acknowledged = true;
      this.session.answers[body.question_id].acknowledged_at = new Date().toISOString();
      this.refresh();
      return this.response({ session: this.session });
    }
    if (path.endsWith('/checkpoint')) {
      this.received.push({ kind: 'checkpoint', ...body });
      this.session.active_seconds = Math.max(this.session.active_seconds, body.active_seconds);
      return this.response({ session: this.session });
    }
    if (path.endsWith('/abandon')) {
      this.received.push({ kind: 'abandon', ...body });
      this.session.status = 'abandoned'; this.session.ended_at = new Date().toISOString();
      return this.response({ session: this.session });
    }
    if (path === '/api/dashboard') return this.response({ total_players: 8, average_score: 90, highest_score: 120, lowest_score: 60, leaderboard: [] });
    return this.response({ error: { code: 'not_found', message: 'Unknown route' } }, 404);
  };
}

async function remoteStore(server = new FakeBackend(), storage = setup('http:')) {
  globalThis.COM_LAB_CONFIG = { googleScriptUrl: GOOGLE_URL };
  globalThis.fetch = server.fetch;
  const store = new GameStore();
  await store.init();
  await store.connectionPromise;
  await store.register(profile());
  await store.start();
  return { store, server, storage };
}

await test('18-question bank produces 12 unique questions, all stages/formats/difficulties, and exact resume order', async () => {
  const storage = setup();
  const store = new GameStore();
  await store.init();
  await assert.rejects(store.register({ ...profile(), nickname: '  ' }), { code: 'invalid_profile' });
  await store.register({ ...profile(), full_name: '  นักเรียนตัวอย่าง  ' });
  assert.equal(store.state.profile.full_name, 'นักเรียนตัวอย่าง');
  assert.equal(store.state.profile.student_code, '001');
  await store.start();
  const selected = copy(store.state.session.questions);
  const order = copy(store.state.session.option_orders);
  assert.equal(selected.length, 12);
  assert.equal(new Set(selected).size, 12);
  for (const stage of ['stage_1', 'stage_2', 'stage_3']) {
    const questions = selected.map((id) => byId.get(id)).filter((q) => q.stage_id === stage);
    assert.equal(questions.length, 4);
    assert.equal(new Set(questions.map((q) => `${q.type}:${q.difficulty}`)).size, 4);
  }
  const restored = new GameStore();
  await restored.init();
  assert.deepEqual(restored.state.session.questions, selected);
  assert.deepEqual(restored.state.session.option_orders, order);
  assert.equal(JSON.parse(storage.getItem(KEY)).schema_version, 1);
});

await test('first answers are immutable; feedback acknowledgement gates stages; completing gives exactly 120', async () => {
  setup();
  const store = new GameStore(); await store.init(); await store.register(profile()); await store.start();
  const first = store.state.session.questions[0];
  const later = store.state.session.questions[4];
  await assert.rejects(store.answer(later, byId.get(later).correct_option_id), { code: 'stage_locked' });
  const correct = byId.get(first).correct_option_id;
  const answer = await store.answer(first, correct);
  assert.equal(answer.points, 10);
  await store.answer(first, correct);
  assert.equal(store.state.session.score, 10);
  const wrong = byId.get(first).options.find((option) => option.id !== correct).id;
  await assert.rejects(store.answer(first, wrong), { code: 'immutable_answer' });
  assert.equal(store.state.session.current_stage, 0);
  await store.acknowledge(first);
  await store.acknowledge(first);
  for (const [index, id] of store.state.session.questions.entries()) {
    if (index === 0) continue;
    await store.answer(id, byId.get(id).correct_option_id);
    if (index === 3) assert.equal(store.state.session.current_stage, 0);
    await store.acknowledge(id);
    if (index === 3) assert.equal(store.state.session.current_stage, 1);
  }
  assert.equal(store.state.session.status, 'completed');
  assert.equal(store.state.session.score, 120);
  assert.equal(store.state.session.correct_count, 12);
  assert.equal(store.state.session.wrong_count, 0);
  assert.equal(store.state.session.badge, 'gold');
  assert.equal(store.state.session.learning_result, 'passed');
  assert.equal(store.state.history.length, 1);
  assert.ok(store.state.session.ended_at);
  await store.answer(first, correct);
  assert.equal(store.state.session.score, 120);
});

await test('best-per-player class leaderboard uses shared ranks, excludes unfinished and exposes no student identities', async () => {
  setup(); const store = new GameStore(); await store.init();
  await store.register(profile('001')); await store.start(); await finish(store, 12);
  await store.start(); await finish(store, 0);
  assert.equal(store.state.session.badge, 'bronze');
  assert.equal(store.state.session.learning_result, 'needs_review');
  store.signOut(); await store.register(profile('002')); await store.start(); await finish(store, 12);
  store.signOut(); await store.register(profile('003')); await store.start(); await finish(store, 9);
  assert.equal(store.state.session.badge, 'silver');
  store.signOut(); await store.register(profile('004', 'ม.2/1')); await store.start(); await finish(store, 12);
  assert.equal((await store.getDashboard()).total_players, 1);
  store.signOut(); await store.register(profile('001'));
  const dashboard = await store.getDashboard();
  assert.equal(dashboard.total_players, 3);
  assert.equal(dashboard.average_score, 110);
  assert.equal(dashboard.highest_score, 120);
  assert.equal(dashboard.lowest_score, 90);
  assert.deepEqual(dashboard.leaderboard.map((entry) => entry.rank), [1, 1, 3]);
  assert.deepEqual(dashboard.leaderboard.map((entry) => entry.score), [120, 120, 90]);
  assert.equal(dashboard.source, 'local');
  assert.ok(!JSON.stringify(dashboard).includes('full_name'));
  assert.ok(!JSON.stringify(dashboard).includes('student_code'));
});

await test('active time checkpoints at 15 seconds and stops after completion', async () => {
  const storage = setup(); const store = new GameStore(); await store.init(); await store.register(profile()); await store.start();
  store.tick(14.6); store.tick(0.6); store.tick(-10); store.tick(NaN);
  assert.equal(store.state.session.active_seconds, 15);
  assert.equal(JSON.parse(storage.getItem(KEY)).session.active_seconds, 15);
  await finish(store, 12);
  store.tick(30);
  assert.equal(store.state.session.active_seconds, 15);
});

await test('storage quota failure is visible while gameplay remains usable', async () => {
  const storage = setup(); storage.failWrite = true;
  const store = new GameStore(); await store.init(); await store.register(profile()); await store.start();
  assert.match(store.state.error, /บันทึกในเครื่องไม่ได้/);
  const first = store.state.session.questions[0];
  await store.answer(first, byId.get(first).correct_option_id);
  assert.equal(store.state.session.score, 10);
  assert.equal(store.save(), false);
  assert.match(store.state.error, /ดาวน์โหลดผล/);
});

await test('unreadable checkpoint is preserved as recovery and not trusted', async () => {
  const storage = setup();
  storage.setItem(KEY, '{damaged json');
  const store = new GameStore(); await store.init();
  assert.equal(store.state.profile, null);
  assert.equal(storage.getItem(`${KEY}:recovery`), '{damaged json');
  assert.match(store.state.error, /เปิดข้อมูลบันทึกเดิมไม่ได้/);
});

await test('configured Google connection does not upload an existing local profile or run', async () => {
  const storage = setup();
  const offline = new GameStore(); await offline.init(); await offline.register(profile()); await offline.start();
  const localId = offline.state.session.id;
  const server = new FakeBackend(); setup('http:', storage); globalThis.fetch = server.fetch;
  globalThis.COM_LAB_CONFIG = { googleScriptUrl: GOOGLE_URL };
  const restored = new GameStore(); await restored.init();
  await restored.connectionPromise;
  assert.equal(restored.state.mode, 'local');
  assert.equal(restored.state.session.id, localId);
  assert.deepEqual(server.calls, ['/api/health']);
});

await test('offline remote answers persist in order, resume unchanged and reconcile only when the queue drains', async () => {
  const { store, server, storage } = await remoteStore();
  server.online = false;
  const [first, second] = store.state.session.questions;
  await store.answer(first, byId.get(first).correct_option_id);
  await store.acknowledge(first);
  await store.answer(second, byId.get(second).correct_option_id);
  await store.acknowledge(second);
  await store.sync();
  assert.equal(store.state.pendingCount, 4);
  assert.equal(store.state.session.score, 20);
  assert.equal(store.state.syncStatus, 'offline');
  const queuedIds = JSON.parse(storage.getItem(KEY)).outbox.map((event) => event.event_id);
  const savedOrder = copy(store.state.session.option_orders);
  const restored = new GameStore(); await restored.init();
  await restored.connectionPromise;
  assert.equal(restored.state.pendingCount, 4);
  assert.deepEqual(restored.state.session.option_orders, savedOrder);
  server.online = true;
  await restored.sync();
  assert.equal(restored.state.pendingCount, 0);
  assert.equal(restored.state.syncStatus, 'saved');
  assert.equal(restored.state.session.score, 20);
  assert.equal(restored.state.session.answers[first].acknowledged, true);
  assert.equal(restored.state.session.answers[second].acknowledged, true);
  assert.equal(restored.state.session.server_confirmed, true);
  assert.deepEqual(server.received.map((entry) => entry.kind), ['answer', 'ack', 'answer', 'ack']);
  assert.deepEqual(server.received.map((entry) => entry.event_id), queuedIds);
  await restored.sync();
  assert.equal(server.received.length, 4);
});

await test('a delayed earlier answer response cannot erase newer provisional answers', async () => {
  const { store, server } = await remoteStore();
  const [first, second] = store.state.session.questions;
  server.holdNextAnswer = true;
  await store.answer(first, byId.get(first).correct_option_id);
  await store.acknowledge(first);
  await store.answer(second, byId.get(second).correct_option_id);
  assert.equal(store.state.session.score, 20);
  assert.equal(store.state.pendingCount, 3);
  const sync = store.sync();
  assert.equal(typeof server.release, 'function');
  server.release();
  await sync;
  assert.equal(store.state.pendingCount, 0);
  assert.equal(store.state.session.score, 20);
  assert.equal(Object.keys(store.state.session.answers).length, 2);
  assert.equal(store.state.session.answers[first].acknowledged, true);
  assert.equal(store.state.session.answers[second].acknowledged, false);
});

await test('authorization errors stop replay; pending sign-out requires an explicit token-free export', async () => {
  const { store, server } = await remoteStore();
  server.rejectAuth = true;
  const first = store.state.session.questions[0];
  await store.answer(first, byId.get(first).correct_option_id);
  await store.sync();
  assert.equal(store.state.syncStatus, 'error');
  assert.equal(store.state.pendingCount, 1);
  const calls = server.calls.length;
  await store.sync(); await store.sync();
  assert.equal(server.calls.length, calls);
  assert.throws(() => store.signOut(), { code: 'pending_sync' });
  const exported = store.exportData();
  assert.equal(exported.pending_events.length, 1);
  assert.ok(!JSON.stringify(exported).includes(server.token));
  assert.ok(!JSON.stringify(exported).includes('"token"'));
  store.signOut();
  assert.equal(store.state.profile, null);
  assert.equal(store.state.pendingCount, 0);
  assert.equal(store.state.history.length, 1);
});

await test('server dashboard and offline device-only fallback are labelled separately', async () => {
  const { store, server } = await remoteStore();
  const online = await store.getDashboard();
  assert.equal(online.total_players, 8);
  assert.equal(online.scope, 'class');
  assert.equal(online.source, 'server');
  server.online = false;
  const fallback = await store.getDashboard();
  assert.equal(fallback.source, 'device-cache');
  assert.equal(fallback.scope, 'this_device');
  assert.equal(fallback.partial, true);
  server.online = true;
  await store.sync();
  assert.equal(store.state.syncStatus, 'saved');
});

await test('an unconfigured HTTP game stays local and never probes same-origin APIs', async () => {
  setup('http:');
  let calls = 0;
  globalThis.fetch = async () => { calls++; throw new Error('unexpected network'); };
  const store = new GameStore(); await store.init(); await store.connectionPromise;
  assert.equal(calls, 0);
  assert.equal(store.state.mode, 'local');
  assert.equal(store.state.configuredEndpoint, '');
  await store.register(profile()); await store.start();
  assert.equal(calls, 0);
});

await test('Google setup validates URLs, uses a readable simple POST envelope, and persists explicit disconnection', async () => {
  const storage = setup(); const server = new FakeBackend(); globalThis.fetch = server.fetch;
  const store = new GameStore(); await store.init();
  await assert.rejects(store.connectGoogle('https://example.com/exec'), { code: 'invalid_google_url' });
  await assert.rejects(store.connectGoogle(GOOGLE_URL.replace('/exec', '/dev')), { code: 'invalid_google_url' });
  assert.equal(server.calls.length, 0);
  await store.connectGoogle(GOOGLE_URL);
  assert.equal(store.state.mode, 'server');
  assert.equal(store.state.connectionAvailable, true);
  assert.equal(storage.getItem(ENDPOINT_KEY), GOOGLE_URL);
  const request = server.requests[0];
  assert.equal(request.url, GOOGLE_URL);
  assert.equal(request.options.method, 'POST');
  assert.equal(request.options.headers['Content-Type'], 'text/plain;charset=utf-8');
  assert.equal(request.options.headers.Authorization, undefined);
  assert.equal(request.options.mode, undefined);
  assert.equal(request.options.redirect, 'follow');
  assert.equal(request.options.credentials, 'omit');
  assert.deepEqual(request.envelope, { method: 'GET', path: '/api/health', body: {}, token: '' });
  await store.connectGoogle('');
  assert.equal(storage.getItem(ENDPOINT_KEY), '');
  assert.equal(store.state.mode, 'local');
  globalThis.COM_LAB_CONFIG.googleScriptUrl = GOOGLE_URL;
  const calls = server.calls.length;
  const restored = new GameStore(); await restored.init(); await restored.connectionPromise;
  assert.equal(restored.state.configuredEndpoint, '');
  assert.equal(server.calls.length, calls);
});

await test('a configured unreachable Google deployment never silently registers a local player', async () => {
  setup(); const server = new FakeBackend(); server.online = false;
  globalThis.COM_LAB_CONFIG.googleScriptUrl = GOOGLE_URL;
  globalThis.fetch = server.fetch;
  const store = new GameStore(); await store.init(); await store.connectionPromise;
  assert.equal(store.state.mode, 'server');
  assert.equal(store.state.syncStatus, 'offline');
  await assert.rejects(store.register(profile()), { code: 'network_unavailable' });
  assert.equal(store.state.profile, null);
  assert.equal(store.state.history.length, 0);
});

await test('initial Google cold start does not block cached UI and endpoint changes protect unfinished online sessions', async () => {
  setup(); const server = new FakeBackend();
  globalThis.COM_LAB_CONFIG.googleScriptUrl = GOOGLE_URL;
  let releaseHealth;
  globalThis.fetch = async (url, options) => {
    const envelope = JSON.parse(options.body);
    if (envelope.path === '/api/health') await new Promise((resolve) => { releaseHealth = resolve; });
    return server.fetch(url, options);
  };
  const store = new GameStore();
  await store.init();
  assert.equal(store.state.syncStatus, 'pending');
  assert.equal(store.state.connectionAvailable, false);
  assert.equal(typeof releaseHealth, 'function');
  releaseHealth(); await store.connectionPromise;
  assert.equal(store.state.connectionAvailable, true);
  globalThis.fetch = server.fetch;
  await store.register(profile()); await store.start();
  await assert.rejects(store.connectGoogle(''), { code: 'active_session' });
  assert.equal(store.state.configuredEndpoint, GOOGLE_URL);
  await store.abandon(); await store.sync();
  await store.connectGoogle('');
  assert.equal(store.state.profile, null);
  assert.equal(store.state.mode, 'local');
  assert.equal(store.state.history.length, 1);
});

await test('an unfinished incompatible bank checkpoint stays untouched and blocks grading or replacement', async () => {
  const storage = setup();
  const original = new GameStore(); await original.init(); await original.register(profile()); await original.start();
  const first = original.state.session.questions[0];
  await original.answer(first, byId.get(first).correct_option_id);
  const saved = JSON.parse(storage.getItem(KEY));
  saved.bank_version = '0.9.0'; saved.session.bank_version = '0.9.0'; saved.token = 'must-not-be-exported';
  const oldRaw = JSON.stringify(saved);
  storage.setItem(KEY, oldRaw);
  const next = new GameStore(); await next.init();
  assert.equal(next.state.saveIncompatible, true);
  assert.equal(next.state.syncStatus, 'error');
  assert.equal(storage.getItem(KEY), oldRaw);
  assert.equal(next.save(), false);
  await assert.rejects(next.register(profile('002')), { code: 'bank_version_mismatch' });
  await assert.rejects(next.start(), { code: 'bank_version_mismatch' });
  assert.equal(storage.getItem(KEY), oldRaw);
  const exported = next.exportData();
  assert.equal(exported.bank_version, '0.9.0');
  assert.equal(exported.current_session.score, 10);
  assert.ok(!JSON.stringify(exported).includes('must-not-be-exported'));
});

await test('equal-version changed question snapshots are rejected before resuming; shuffled options are compatible', async () => {
  const storage = setup();
  const original = new GameStore(); await original.init(); await original.register(profile()); await original.start();
  const saved = JSON.parse(storage.getItem(KEY));
  saved.questions[0].options.reverse();
  storage.setItem(KEY, JSON.stringify(saved));
  const compatible = new GameStore(); await compatible.init();
  assert.equal(compatible.state.saveIncompatible, undefined);
  assert.equal(compatible.state.session.id, original.state.session.id);
  const changed = JSON.parse(storage.getItem(KEY));
  changed.questions[0].prompt += ' เนื้อหาที่เปลี่ยนแล้ว';
  const changedRaw = JSON.stringify(changed);
  storage.setItem(KEY, changedRaw);
  const incompatible = new GameStore(); await incompatible.init();
  assert.equal(incompatible.state.saveIncompatible, true);
  assert.equal(incompatible.state.session, null);
  assert.equal(storage.getItem(KEY), changedRaw);
});

await test('a completed old-bank run is archived while player identity survives a bank update', async () => {
  const storage = setup();
  const original = new GameStore(); await original.init(); await original.register(profile()); await original.start(); await finish(original, 12);
  const saved = JSON.parse(storage.getItem(KEY));
  saved.bank_version = '0.9.0'; saved.session.bank_version = '0.9.0';
  saved.history.forEach((entry) => { entry.bank_version = '0.9.0'; });
  storage.setItem(KEY, JSON.stringify(saved));
  const next = new GameStore(); await next.init();
  assert.equal(next.state.profile.player_id, original.state.profile.player_id);
  assert.equal(next.state.session, null);
  assert.equal(next.state.history[0].bank_version, '0.9.0');
  assert.equal(next.state.history[0].score, 120);
  assert.equal(next.state.history[0].archived, true);
  await next.start();
  assert.equal(next.state.session.bank_version, bank.bank_version);
  assert.equal(next.state.session.score, 0);
  assert.equal((await next.getDashboard()).average_score, null);
});

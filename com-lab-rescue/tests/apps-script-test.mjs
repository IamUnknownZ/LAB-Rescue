/** Local mocked Google-service tests; not a live deployment test. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {harness, questionsById} from './apps-script-harness.mjs';

test('setup creates four private data tabs, is repeatable, and stores bound ID for web context', () => {
  const h = harness({runSetup: false});
  assert.equal(h.rpc('GET', '/api/health').error.code, 'setup_required');
  h.sandbox.setup();
  assert.deepEqual([...h.state.sheets.keys()].sort(), ['answers', 'events', 'players', 'sessions']);
  h.register();
  const before = JSON.stringify(h.state.sheets.get('players').rows);
  h.sandbox.setup();
  assert.equal(JSON.stringify(h.state.sheets.get('players').rows), before);
  h.state.boundAvailable = false;
  assert.equal(h.ok('GET', '/api/health').storage, 'google-sheets');
  const get = JSON.parse(h.sandbox.doGet({parameter: {}}).getContent());
  assert.equal(get.ok, true);
  assert.equal(get.data.version, '1.0.0');
  assert.equal(h.state.unlockedWrites, 0);
});

test('registration stores hashed tokens, preserves zeroes, and safely projects formula-like names', () => {
  const h = harness();
  const registered = h.register({student: '000123', name: '=SUM(1,2)'});
  assert.equal(registered.player.student_code, '000123');
  assert.equal(registered.player.full_name, '=SUM(1,2)');
  assert.equal(registered.player.avatar_color, '#51d6e4');
  assert.equal(registered.token.length, 64);
  const sheet = h.state.sheets.get('players');
  assert.equal(sheet.rows[1][1], "'=SUM(1,2)");
  const record = JSON.parse(sheet.rows[1].at(-1));
  assert.equal(record.student_code, '000123');
  assert.equal(record.token_hash.length, 64);
  assert.ok(!JSON.stringify([...h.state.sheets.values()].map(s => s.rows)).includes(registered.token));
  const me = h.ok('GET', '/api/me', {}, registered.token);
  assert.equal(me.player.full_name, '=SUM(1,2)');
  const duplicate = h.rpc('POST', '/api/register', {
    full_name: 'คนอื่น', student_code: '000123', class_group: 'ปวช.1/1', nickname: 'ทดสอบ',
  });
  assert.equal(duplicate.error.code, 'recovery_required');
  assert.equal(duplicate.error.status, 409);
  assert.ok(!duplicate.token);
});

test('selected questions contain 3 stages, 2 types and 2 difficulties; no answers in question payload', () => {
  const h = harness();
  const {token} = h.register();
  const payload = h.ok('POST', '/api/sessions', {}, token);
  assert.equal(payload.session.questions.length, 12);
  assert.equal(new Set(payload.session.questions).size, 12);
  for (const stage of ['stage_1', 'stage_2', 'stage_3']) {
    const selected = payload.questions.filter(q => q.stage_id === stage);
    assert.equal(selected.length, 4);
    assert.equal(new Set(selected.map(q => q.type + '/' + q.difficulty)).size, 4);
  }
  for (const q of payload.questions) {
    assert.ok(!('correct_option_id' in q));
    assert.ok(!('explanation' in q));
    assert.deepEqual(q.options.map(o => o.id), payload.session.option_orders[q.id]);
  }
  const duplicate = h.ok('POST', '/api/sessions', {}, token);
  assert.equal(duplicate.session.id, payload.session.id);
  assert.deepEqual(duplicate.questions, payload.questions);
});

test('future stages are locked until answers and acknowledgements finish the current stage', () => {
  const h = harness();
  const {token} = h.register();
  const {session} = h.ok('POST', '/api/sessions', {}, token);
  const future = session.questions[4];
  const request = {question_id: future, option_id: questionsById[future].correct_option_id, event_id: randomUUID()};
  assert.equal(h.rpc('POST', '/api/sessions/' + session.id + '/answers', request, token).error.code, 'stage_locked');
  for (const qid of session.questions.slice(0, 4)) h.answer(token, session.id, qid);
  assert.equal(h.rpc('POST', '/api/sessions/' + session.id + '/answers', request, token).error.code, 'stage_locked');
  let result;
  for (const qid of session.questions.slice(0, 4)) result = h.ack(token, session.id, qid);
  assert.equal(result.session.current_stage, 1);
  assert.deepEqual(result.session.completed_stages, ['stage_1']);
  assert.equal(h.answer(token, session.id, future).session.score, 50);
});

test('first answer is immutable and repeated event deliveries never increase score twice', () => {
  const h = harness();
  const {token} = h.register();
  const {session} = h.ok('POST', '/api/sessions', {}, token);
  const qid = session.questions[0], event = randomUUID();
  h.answer(token, session.id, qid, false, event);
  for (let retry = 0; retry < 8; retry++) {
    const again = h.answer(token, session.id, qid, false, event);
    assert.equal(again.session.score, 0);
    assert.equal(again.session.wrong_count, 1);
    assert.equal(again.replayed, true);
  }
  const changed = h.rpc('POST', '/api/sessions/' + session.id + '/answers', {
    question_id: qid, option_id: questionsById[qid].correct_option_id, event_id: randomUUID(),
  }, token);
  assert.equal(changed.error.code, 'immutable_answer');
  const conflict = h.rpc('POST', '/api/sessions/' + session.id + '/ack', {
    question_id: qid, event_id: event,
  }, token);
  assert.equal(conflict.error.code, 'event_conflict');
  assert.equal(h.state.sheets.get('answers').getLastRow(), 2);
});

test('a transient session write failure is repaired from the answer ledger on retry', () => {
  const h = harness();
  const {token} = h.register();
  const {session} = h.ok('POST', '/api/sessions', {}, token);
  const qid = session.questions[0];
  const body = {question_id: qid, option_id: questionsById[qid].correct_option_id,
    event_id: randomUUID(), active_seconds: 0};
  h.state.failNextWrite = 'sessions';
  const failed = h.rpc('POST', '/api/sessions/' + session.id + '/answers', body, token);
  assert.equal(failed.ok, false);
  assert.equal(failed.error.status, 503);
  assert.equal(h.state.sheets.get('answers').getLastRow(), 2);
  const retried = h.ok('POST', '/api/sessions/' + session.id + '/answers', body, token);
  assert.equal(retried.session.score, 10);
  assert.equal(retried.session.correct_count, 1);
  assert.equal(retried.replayed, true);
  assert.equal(h.state.sheets.get('answers').getLastRow(), 2);
  assert.equal(h.state.held, false);
});

test('a reserved event with failed answer write can safely finish on retry', () => {
  const h = harness();
  const {token} = h.register();
  const {session} = h.ok('POST', '/api/sessions', {}, token);
  const qid = session.questions[0];
  const body = {question_id: qid, option_id: questionsById[qid].correct_option_id, event_id: randomUUID()};
  h.state.failNextWrite = 'answers';
  assert.equal(h.rpc('POST', '/api/sessions/' + session.id + '/answers', body, token).ok, false);
  const saved = h.ok('POST', '/api/sessions/' + session.id + '/answers', body, token);
  assert.equal(saved.session.score, 10);
  assert.equal(h.state.sheets.get('events').getLastRow(), 2);
  assert.equal(h.state.sheets.get('answers').getLastRow(), 2);
});

test('feedback retry recovers an interrupted stage transition', () => {
  const h = harness();
  const {token} = h.register();
  const {session} = h.ok('POST', '/api/sessions', {}, token);
  for (const qid of session.questions.slice(0, 3)) {
    h.answer(token, session.id, qid);
    h.ack(token, session.id, qid);
  }
  const qid = session.questions[3];
  h.answer(token, session.id, qid);
  const body = {question_id: qid, event_id: randomUUID()};
  h.state.failNextWrite = 'sessions';
  assert.equal(h.rpc('POST', '/api/sessions/' + session.id + '/ack', body, token).ok, false);
  const retried = h.ok('POST', '/api/sessions/' + session.id + '/ack', body, token);
  assert.equal(retried.session.current_stage, 1);
  assert.equal(retried.replayed, true);
  assert.equal(retried.session.score, 40);
});

test('new invocations resume stable selected questions, shuffled options, and submitted answers', () => {
  const h = harness();
  const {token} = h.register();
  const initial = h.ok('POST', '/api/sessions', {}, token);
  const qid = initial.session.questions[0];
  h.answer(token, initial.session.id, qid);
  h.state.boundAvailable = false;
  const resumed = h.ok('GET', '/api/sessions/current', {}, token);
  assert.equal(resumed.session.id, initial.session.id);
  assert.deepEqual(resumed.questions, initial.questions);
  assert.deepEqual(resumed.session.option_orders, initial.session.option_orders);
  assert.equal(resumed.session.score, 10);
  assert.ok(resumed.session.answers[qid]);
});

test('all reward and mastery thresholds are computed from first answers', () => {
  for (const [count, badge, result] of [[12, 'gold', 'passed'], [11, 'gold', 'passed'],
    [10, 'silver', 'passed'], [9, 'silver', 'passed'], [8, 'bronze', 'needs_review'], [0, 'bronze', 'needs_review']]) {
    const h = harness();
    const {token} = h.register();
    const session = h.complete(token, count);
    assert.equal(session.score, count * 10);
    assert.equal(session.correct_count, count);
    assert.equal(session.wrong_count, 12 - count);
    assert.equal(session.badge, badge);
    assert.equal(session.learning_result, result);
    assert.equal(session.status, 'completed');
    assert.ok(session.ended_at);
    assert.deepEqual(session.completed_stages, ['stage_1', 'stage_2', 'stage_3']);
    assert.equal(h.ok('GET', '/api/sessions/current', {}, token).session, null);
  }
});

test('token permissions protect other profiles and sessions', () => {
  const h = harness();
  const owner = h.register(), stranger = h.register();
  const {session} = h.ok('POST', '/api/sessions', {}, owner.token);
  assert.equal(h.rpc('GET', '/api/dashboard').error.status, 401);
  for (const [method, endpoint, body] of [
    ['GET', '/api/sessions/' + session.id, {}],
    ['POST', '/api/sessions/' + session.id + '/checkpoint', {active_seconds: 10}],
    ['POST', '/api/sessions/' + session.id + '/abandon', {}],
    ['POST', '/api/sessions/' + session.id + '/answers', {
      question_id: session.questions[0], option_id: 'a', event_id: randomUUID(),
    }],
  ]) {
    assert.equal(h.rpc(method, endpoint, body, stranger.token).error.status, 404);
  }
});

test('dashboard uses class-specific best completed runs and nickname-only equal ranks', () => {
  const h = harness();
  const first = h.register({nickname: 'ผู้เล่นหนึ่ง'});
  h.complete(first.token, 8); h.complete(first.token, 12);
  const second = h.register({nickname: 'ผู้เล่นสอง'}); h.complete(second.token, 12);
  const third = h.register({nickname: 'ผู้เล่นสาม'}); h.complete(third.token, 9);
  const outsider = h.register({group: 'อีกห้อง'}); h.complete(outsider.token, 0);
  const data = h.ok('GET', '/api/dashboard', {}, first.token);
  assert.equal(data.source, 'google-sheets');
  assert.equal(data.total_players, 3);
  assert.equal(data.completed_players, 3);
  assert.equal(data.average_score, 110);
  assert.equal(data.highest_score, 120);
  assert.equal(data.lowest_score, 90);
  assert.deepEqual(data.leaderboard.map(r => r.rank), [1, 1, 3]);
  assert.equal(data.page_size, 1000);
  assert.equal(data.partial, false);
  assert.ok(!JSON.stringify(data).includes(first.player.student_code));
  assert.ok(!JSON.stringify(data).includes(first.player.full_name));
  for (const row of data.leaderboard) {
    assert.ok(!('player_id' in row)); assert.ok(!('token' in row));
  }
  const paged = h.ok('GET', '/api/dashboard?page=99&page_size=2', {}, first.token);
  assert.equal(paged.page, 2); assert.equal(paged.total_pages, 2);
  assert.equal(paged.leaderboard.length, 1); assert.equal(paged.partial, true);
  assert.equal(paged.average_score, 110);
});

test('empty dashboard returns null aggregates rather than invented data', () => {
  const h = harness();
  const {token} = h.register();
  h.ok('POST', '/api/sessions', {}, token);
  const data = h.ok('GET', '/api/dashboard', {}, token);
  assert.equal(data.total_players, 1);
  assert.equal(data.average_score, null);
  assert.equal(data.highest_score, null);
  assert.equal(data.lowest_score, null);
  assert.deepEqual(data.leaderboard, []);
});

test('active time is bounded and monotonic, pause and abandon preserve history', () => {
  const h = harness();
  const {token} = h.register();
  const {session} = h.ok('POST', '/api/sessions', {}, token);
  const paused = h.ok('POST', '/api/sessions/' + session.id + '/checkpoint', {
    active_seconds: 999999, paused: true,
  }, token).session;
  assert.equal(paused.status, 'paused');
  assert.ok(paused.active_seconds <= paused.elapsed_seconds + 2);
  const resumed = h.ok('POST', '/api/sessions/' + session.id + '/checkpoint',
    {active_seconds: 0, paused: false}, token).session;
  assert.equal(resumed.active_seconds, paused.active_seconds);
  assert.equal(h.rpc('POST', '/api/sessions/' + session.id + '/checkpoint',
    {active_seconds: -1}, token).error.code, 'invalid_time');
  const abandoned = h.ok('POST', '/api/sessions/' + session.id + '/abandon', {}, token).session;
  assert.equal(abandoned.status, 'abandoned');
  assert.ok(abandoned.ended_at);
  const next = h.ok('POST', '/api/sessions', {}, token).session;
  assert.notEqual(next.id, session.id);
  assert.equal(h.ok('GET', '/api/sessions/' + session.id, {}, token).session.status, 'abandoned');
});

test('malformed input and lock contention produce actionable JSON errors and release lock', () => {
  const h = harness();
  let response = JSON.parse(h.sandbox.doPost({postData: {contents: '{bad'}}).getContent());
  assert.equal(response.error.code, 'invalid_json');
  response = JSON.parse(h.sandbox.doPost({postData: {contents: 'x'.repeat(17000)}}).getContent());
  assert.equal(response.error.status, 413);
  response = h.rpc('POST', '/api/register', {});
  assert.equal(response.error.status, 422);
  assert.equal(h.state.held, false);
  h.state.forceBusy = true;
  response = h.rpc('GET', '/api/health');
  assert.equal(response.error.status, 503);
  assert.equal(response.error.code, 'busy');
  h.state.forceBusy = false;
  assert.equal(h.ok('GET', '/api/health').ok, true);
  assert.equal(h.state.unlockedWrites, 0);
});

test('versioned session question snapshots survive later changes to the authoring bank', () => {
  const h = harness();
  const {token} = h.register();
  const first = h.ok('POST', '/api/sessions', {}, token);
  h.sandbox.COMLAB_QUESTION_BANK.bank_version = '2.0.0';
  h.sandbox.COMLAB_QUESTION_BANK.questions[0].prompt = 'ข้อความใหม่';
  const resumed = h.ok('GET', '/api/sessions/current', {}, token);
  assert.equal(resumed.session.bank_version, '1.0.0');
  assert.deepEqual(resumed.questions, first.questions);
});

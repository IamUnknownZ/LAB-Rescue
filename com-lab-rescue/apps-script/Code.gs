/**
 * COM LAB RESCUE — Google Apps Script + private Google Sheets.
 * Add Questions.gs and run setup() once before deploying as a Web app.
 * Browser RPC: POST text/plain JSON {method, path, body, token}.
 * Response: {ok:true,data} or {ok:false,error:{code,message,status}}.
 * Google ContentService responses use HTTP 200; read the JSON envelope.
 */

var COMLAB_VERSION = '1.0.0';
var COMLAB_SCHEMA_VERSION = '1';
var COMLAB_STAGES = ['stage_1', 'stage_2', 'stage_3'];
var COMLAB_BUCKETS = [
  ['multiple_choice', 'easy'], ['true_false', 'easy'],
  ['multiple_choice', 'medium'], ['true_false', 'medium']
];
var COMLAB_BODY_LIMIT = 16384;
var COMLAB_TABLES = {
  players: [
    'id', 'full_name', 'student_code', 'class_group', 'nickname',
    'avatar_color', 'token_hash', 'created_at', 'record_json'
  ],
  sessions: [
    'id', 'player_id', 'bank_version', 'started_at', 'ended_at', 'last_seen_at',
    'status', 'current_stage', 'score', 'max_score', 'correct_count',
    'wrong_count', 'active_seconds', 'completed_stages', 'badge',
    'learning_result', 'revision', 'record_json'
  ],
  answers: [
    'session_id', 'question_id', 'option_id', 'is_correct', 'points',
    'answered_at', 'acknowledged_at', 'first_event_id', 'record_json'
  ],
  events: [
    'session_id', 'event_id', 'action', 'payload_hash', 'created_at', 'record_json'
  ]
};

/**
 * Run manually once as the Spreadsheet owner. Safe to rerun: never clears data.
 * Bound script: Extensions > Apps Script from the desired Sheet.
 * Standalone: set Script Property SPREADSHEET_ID before running.
 */
function setup() {
  return withScriptLock_(function () {
    validateBank_();
    var properties = PropertiesService.getScriptProperties();
    var spreadsheet = SpreadsheetApp.getActiveSpreadsheet() || workbook_();
    properties.setProperty('SPREADSHEET_ID', spreadsheet.getId());
    Object.keys(COMLAB_TABLES).forEach(function (name) {
      var headers = COMLAB_TABLES[name];
      var sheet = spreadsheet.getSheetByName(name) || spreadsheet.insertSheet(name);
      ensureSize_(sheet, 1, headers.length);
      if (sheet.getLastRow() === 0) {
        sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
      } else {
        assertHeaders_(sheet, headers);
      }
      sheet.setFrozenRows(1);
      sheet.getRange(1, 1, 1, headers.length)
        .setFontWeight('bold').setBackground('#152c47').setFontColor('#ffffff');
    });
    properties.setProperty('COMLAB_SCHEMA_VERSION', COMLAB_SCHEMA_VERSION);
    return {ok: true, storage: 'google-sheets', tables: Object.keys(COMLAB_TABLES)};
  });
}

/** GET is intentionally limited to a health check; tokens never go in URLs. */
function doGet(e) {
  try {
    var path = e && e.parameter && e.parameter.path || '/api/health';
    if (path !== '/api/health') {
      fail_(405, 'rpc_required', 'กรุณาเรียก API ผ่าน POST text/plain ตามคู่มือ');
    }
    return output_({ok: true, data: withScriptLock_(function () {
      return health_(context_());
    })});
  } catch (error) {
    return errorOutput_(error);
  }
}

function doPost(e) {
  try {
    var raw = e && e.postData && e.postData.contents;
    if (typeof raw !== 'string') {
      fail_(400, 'body_required', 'ไม่พบข้อมูลคำขอ กรุณาส่ง JSON ผ่าน POST');
    }
    if (raw.length > COMLAB_BODY_LIMIT ||
        Utilities.newBlob(raw).getBytes().length > COMLAB_BODY_LIMIT) {
      fail_(413, 'body_too_large', 'ข้อมูลที่ส่งมีขนาดใหญ่เกินไป');
    }
    var envelope;
    try { envelope = JSON.parse(raw); }
    catch (_) { fail_(400, 'invalid_json', 'ข้อมูล JSON ไม่ถูกต้อง'); }
    if (!plainObject_(envelope) || !plainObject_(envelope.body === undefined ? {} : envelope.body)) {
      fail_(422, 'object_required', 'คำขอและ body ต้องเป็น JSON object');
    }
    var data = withScriptLock_(function () {
      return route_(context_(), envelope);
    });
    return output_({ok: true, data: data});
  } catch (error) {
    return errorOutput_(error);
  }
}

function output_(envelope) {
  return ContentService.createTextOutput(JSON.stringify(envelope))
    .setMimeType(ContentService.MimeType.JSON);
}

function errorOutput_(error) {
  if (error && error.apiCode) {
    return output_({ok: false, error: {
      code: error.apiCode, message: error.message, status: error.apiStatus
    }});
  }
  // Never log request bodies, bearer tokens or student profiles.
  console.error('COM LAB RESCUE service error: ' + (error && error.name || 'Error'));
  return output_({ok: false, error: {
    code: 'service_unavailable', status: 503,
    message: 'ระบบบันทึกข้อมูลยังไม่พร้อม กรุณาลองใหม่หรือติดต่อผู้สอน'
  }});
}

function fail_(status, code, message) {
  var error = new Error(message);
  error.apiStatus = status;
  error.apiCode = code;
  throw error;
}

function plainObject_(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function now_() { return new Date().toISOString(); }
function clone_(value) { return JSON.parse(JSON.stringify(value)); }
function canonicalText_(value) { return String(value).trim().replace(/\s+/g, ' ').toLowerCase(); }

function requiredText_(body, key, maximum) {
  if (typeof body[key] !== 'string') {
    fail_(422, 'invalid_field', 'กรุณากรอก ' + key + ' ให้ครบ');
  }
  var value = body[key].trim().replace(/\s+/g, ' ');
  if (!value || value.length > maximum || /[\u0000-\u001f\u007f]/.test(value)) {
    fail_(422, 'invalid_field', 'ข้อมูล ' + key + ' ไม่ถูกต้อง หรือยาวเกิน ' + maximum + ' ตัวอักษร');
  }
  return value;
}

function digest_(value) {
  return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, value, Utilities.Charset.UTF_8)
    .map(function (byte) { return ('0' + ((byte + 256) % 256).toString(16)).slice(-2); }).join('');
}

function withScriptLock_(work) {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) {
    fail_(503, 'busy', 'มีผู้เล่นกำลังบันทึกข้อมูล กรุณารอสักครู่แล้วลองใหม่');
  }
  try { return work(); }
  finally {
    try { SpreadsheetApp.flush(); }
    finally { lock.releaseLock(); }
  }
}

function workbook_() {
  var properties = PropertiesService.getScriptProperties();
  var id = properties.getProperty('SPREADSHEET_ID');
  var spreadsheet = id ? SpreadsheetApp.openById(id) : SpreadsheetApp.getActiveSpreadsheet();
  if (!spreadsheet) {
    fail_(503, 'configuration_required',
      'กรุณารัน setup จากชีตที่ต้องการ หรือกำหนด Script Property SPREADSHEET_ID ก่อน');
  }
  return spreadsheet;
}

function context_() {
  if (PropertiesService.getScriptProperties().getProperty('COMLAB_SCHEMA_VERSION') !== COMLAB_SCHEMA_VERSION) {
    fail_(503, 'setup_required', 'กรุณาให้เจ้าของสคริปต์รัน setup และอนุญาตสิทธิ์ก่อน');
  }
  return {spreadsheet: workbook_(), cache: Object.create(null)};
}

function ensureSize_(sheet, rows, columns) {
  if (rows > sheet.getMaxRows()) {
    sheet.insertRowsAfter(sheet.getMaxRows(), Math.max(200, rows - sheet.getMaxRows()));
  }
  if (columns > sheet.getMaxColumns()) {
    sheet.insertColumnsAfter(sheet.getMaxColumns(), columns - sheet.getMaxColumns());
  }
}

function assertHeaders_(sheet, headers) {
  var found = sheet.getRange(1, 1, 1, headers.length).getValues()[0];
  if (headers.some(function (header, index) { return found[index] !== header; })) {
    fail_(503, 'schema_mismatch',
      'หัวคอลัมน์ของแท็บ ' + sheet.getName() + ' ไม่ตรงกับรุ่นนี้ กรุณาตรวจคู่มือก่อนแก้ข้อมูล');
  }
}

function table_(context, name) {
  if (context.cache[name]) return context.cache[name];
  var headers = COMLAB_TABLES[name];
  var sheet = context.spreadsheet.getSheetByName(name);
  if (!sheet || sheet.getLastRow() === 0) {
    fail_(503, 'setup_required', 'ไม่พบแท็บ ' + name + ' กรุณารัน setup');
  }
  assertHeaders_(sheet, headers);
  var last = sheet.getLastRow();
  var cells = last > 1 ? sheet.getRange(2, 1, last - 1, headers.length).getValues() : [];
  var records = [];
  cells.forEach(function (row, index) {
    if (row.every(function (cell) { return cell === ''; })) return;
    var record;
    try { record = JSON.parse(String(row[headers.length - 1])); }
    catch (_) { fail_(503, 'storage_corrupt', 'ข้อมูลในแท็บ ' + name + ' เสียรูปแบบ กรุณาติดต่อผู้สอน'); }
    if (!plainObject_(record)) fail_(503, 'storage_corrupt', 'ข้อมูลในชีตไม่อยู่ในรูปแบบที่รองรับ');
    record._row = index + 2;
    records.push(record);
  });
  var result = {sheet: sheet, records: records, headers: headers};
  context.cache[name] = result;
  return result;
}

/** Projected columns are readable reports. record_json preserves exact original values.
 * Literal-escape formula-like strings and format as text to preserve student IDs.
 */
function sheetValue_(value) {
  if (value === null || value === undefined) return '';
  if (Array.isArray(value) || typeof value === 'object') return JSON.stringify(value);
  if (typeof value === 'string' && /^[=+\-@']/.test(value)) return "'" + value;
  return value;
}

function save_(context, name, record) {
  var table = table_(context, name);
  var clean = Object.assign({}, record);
  delete clean._row;
  var json = JSON.stringify(clean);
  if (json.length > 49000) {
    fail_(503, 'record_too_large', 'ข้อมูลหนึ่งรายการยาวเกินขนาดเซลล์ กรุณาย่อข้อความคำถาม');
  }
  var cells = table.headers.map(function (header) {
    return header === 'record_json' ? json : sheetValue_(clean[header]);
  });
  var isNew = !record._row;
  var row = record._row || table.sheet.getLastRow() + 1;
  ensureSize_(table.sheet, row, table.headers.length);
  table.sheet.getRange(row, 1, 1, table.headers.length).setNumberFormat('@').setValues([cells]);
  record._row = row;
  if (isNew) table.records.push(record);
  return record;
}

function health_(context) {
  Object.keys(COMLAB_TABLES).forEach(function (name) {
    var sheet = context.spreadsheet.getSheetByName(name);
    if (!sheet || sheet.getLastRow() === 0) fail_(503, 'setup_required', 'กรุณารัน setup ให้ครบก่อน');
    assertHeaders_(sheet, COMLAB_TABLES[name]);
  });
  validateBank_();
  return {ok: true, storage: 'google-sheets', version: COMLAB_VERSION};
}

function validateBank_() {
  if (typeof COMLAB_QUESTION_BANK === 'undefined' || !COMLAB_QUESTION_BANK.bank_version ||
      !Array.isArray(COMLAB_QUESTION_BANK.questions) || COMLAB_QUESTION_BANK.questions.length < 15) {
    fail_(503, 'question_bank_missing', 'กรุณาเพิ่มไฟล์ Questions.gs ให้ครบ');
  }
  var ids = Object.create(null);
  COMLAB_QUESTION_BANK.questions.forEach(function (question) {
    if (typeof question.id !== 'string' || ids[question.id] || !Array.isArray(question.options)) {
      fail_(503, 'question_bank_invalid', 'รหัสคำถามซ้ำหรือข้อมูลคำถามไม่ถูกต้อง');
    }
    ids[question.id] = true;
    var options = question.options.map(function (option) { return option.id; });
    if (new Set(options).size !== options.length || options.length < 2 ||
        options.indexOf(question.correct_option_id) < 0 || question.points !== 10 || !question.explanation) {
      fail_(503, 'question_bank_invalid', 'เฉลย ตัวเลือก หรือคะแนนของคำถามไม่ถูกต้อง');
    }
  });
  COMLAB_STAGES.forEach(function (stage) {
    COMLAB_BUCKETS.forEach(function (bucket) {
      if (!COMLAB_QUESTION_BANK.questions.some(function (question) {
        return question.stage_id === stage && question.type === bucket[0] && question.difficulty === bucket[1];
      })) fail_(503, 'question_bank_invalid', 'คลังคำถามต้องครบสองรูปแบบและสองความยากทุกด่าน');
    });
  });
}

function profile_(player) {
  return {
    id: player.id, player_id: player.id, full_name: player.full_name,
    student_code: player.student_code, class_group: player.class_group,
    nickname: player.nickname, avatar_color: player.avatar_color, created_at: player.created_at
  };
}

function authenticate_(context, token) {
  if (typeof token !== 'string' || !/^[A-Za-z0-9_-]{20,200}$/.test(token)) {
    fail_(401, 'authentication_required', 'กรุณาลงทะเบียนหรือกลับมาใช้เบราว์เซอร์เดิม');
  }
  var tokenHash = digest_(token);
  var player = table_(context, 'players').records.find(function (row) { return row.token_hash === tokenHash; });
  if (!player) fail_(401, 'invalid_token', 'ข้อมูลเข้าใช้งานไม่ถูกต้อง กรุณาติดต่อผู้สอน');
  return player;
}

function register_(context, body) {
  var player = {
    id: Utilities.getUuid(),
    full_name: requiredText_(body, 'full_name', 120),
    student_code: requiredText_(body, 'student_code', 60),
    class_group: requiredText_(body, 'class_group', 80),
    nickname: requiredText_(body, 'nickname', 40),
    avatar_color: body.avatar_color || '#51d6e4',
    created_at: now_()
  };
  var colors = {teal: '#51d6e4', blue: '#4679dc', orange: '#f3a647', purple: '#9273ca'};
  if (typeof player.avatar_color === 'string') {
    player.avatar_color = (colors[player.avatar_color] || player.avatar_color).toLowerCase();
  }
  if (typeof player.avatar_color !== 'string' || !/^#[0-9a-f]{6}$/.test(player.avatar_color)) {
    fail_(422, 'invalid_field', 'กรุณาเลือกสีหุ่นยนต์ที่ถูกต้อง');
  }
  var duplicate = table_(context, 'players').records.some(function (row) {
    return canonicalText_(row.class_group) === canonicalText_(player.class_group) &&
      canonicalText_(row.student_code) === canonicalText_(player.student_code);
  });
  if (duplicate) {
    fail_(409, 'recovery_required',
      'รหัสผู้เรียนนี้ลงทะเบียนในกลุ่มนี้แล้ว กรุณาใช้เบราว์เซอร์เดิมหรือติดต่อผู้สอน');
  }
  var token = Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, '');
  player.token_hash = digest_(token);
  save_(context, 'players', player);
  return {player: profile_(player), token: token};
}

function ownedSession_(context, player, id) {
  var session = table_(context, 'sessions').records.find(function (row) {
    return row.id === id && row.player_id === player.id;
  });
  if (!session) fail_(404, 'session_not_found', 'ไม่พบรอบการเล่นของผู้เล่นนี้');
  return session;
}

function snapshotMap_(session) {
  var result = Object.create(null);
  session.question_snapshot.forEach(function (question) { result[question.id] = question; });
  return result;
}

function answerRows_(context, session) {
  return table_(context, 'answers').records.filter(function (answer) { return answer.session_id === session.id; });
}

function elapsed_(session) {
  var end = session.ended_at ? Date.parse(session.ended_at) : Date.now();
  return Math.max(0, Math.floor((end - Date.parse(session.started_at)) / 1000));
}

function requestedTime_(session, body) {
  var value = body.active_seconds === undefined ? session.active_seconds : body.active_seconds;
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    fail_(422, 'invalid_time', 'เวลาเล่นต้องเป็นจำนวนวินาทีที่ไม่ติดลบ');
  }
  return Math.max(session.active_seconds, Math.min(Math.floor(value), elapsed_(session) + 2, 604800));
}

/** Answer rows are authoritative. Recompute derived fields after any partial write
 * or retry, because Sheets does not provide multi-sheet SQL transactions.
 */
function refreshSession_(context, session) {
  var before = JSON.stringify([
    session.score, session.correct_count, session.wrong_count, session.completed_stages,
    session.current_stage, session.status, session.badge, session.learning_result, session.ended_at
  ]);
  var snapshot = snapshotMap_(session);
  var rows = answerRows_(context, session);
  var seen = Object.create(null);
  var correct = 0;
  rows.forEach(function (answer) {
    if (!snapshot[answer.question_id] || seen[answer.question_id]) {
      fail_(503, 'storage_corrupt', 'คำตอบในชีตซ้ำหรือไม่ตรงกับรอบการเล่น กรุณาติดต่อผู้สอน');
    }
    seen[answer.question_id] = answer;
    if (answer.option_id === snapshot[answer.question_id].correct_option_id) correct += 1;
  });
  var completed = COMLAB_STAGES.filter(function (stage) {
    return session.questions.filter(function (id) { return snapshot[id].stage_id === stage; })
      .every(function (id) { return seen[id] && seen[id].acknowledged_at; });
  });
  session.score = correct * 10;
  session.correct_count = correct;
  session.wrong_count = rows.length - correct;
  session.completed_stages = completed;
  session.current_stage = Math.min(2, completed.length);
  if (session.status !== 'abandoned') {
    if (completed.length === 3) {
      session.status = 'completed';
      session.ended_at = session.ended_at || rows.reduce(function (latest, answer) {
        return answer.acknowledged_at > latest ? answer.acknowledged_at : latest;
      }, session.started_at);
      session.badge = correct >= 11 ? 'gold' : correct >= 9 ? 'silver' : 'bronze';
      session.learning_result = correct >= 9 ? 'passed' : 'needs_review';
    }
  }
  var after = JSON.stringify([
    session.score, session.correct_count, session.wrong_count, session.completed_stages,
    session.current_stage, session.status, session.badge, session.learning_result, session.ended_at
  ]);
  if (before !== after) {
    session.revision += 1;
    save_(context, 'sessions', session);
  }
  return session;
}

function sessionView_(context, session) {
  var snapshot = snapshotMap_(session);
  var answers = {};
  answerRows_(context, session).forEach(function (answer) {
    var question = snapshot[answer.question_id];
    var correct = answer.option_id === question.correct_option_id;
    answers[answer.question_id] = {
      question_id: answer.question_id, option_id: answer.option_id,
      is_correct: correct, points: correct ? 10 : 0,
      correct_option_id: question.correct_option_id, explanation: question.explanation,
      answered_at: answer.answered_at, acknowledged: Boolean(answer.acknowledged_at),
      acknowledged_at: answer.acknowledged_at || null
    };
  });
  return {
    id: session.id, session_id: session.id, player_id: session.player_id,
    schema_version: 1, bank_version: session.bank_version, questions: session.questions.slice(),
    option_orders: clone_(session.option_orders), current_stage: session.current_stage,
    current_stage_id: COMLAB_STAGES[session.current_stage],
    completed_stages: session.completed_stages.slice(), answers: answers, status: session.status,
    score: session.score, max_score: 120, correct_count: session.correct_count, wrong_count: session.wrong_count,
    active_seconds: session.active_seconds, elapsed_seconds: elapsed_(session),
    started_at: session.started_at, ended_at: session.ended_at || null, last_seen_at: session.last_seen_at,
    badge: session.badge || null, learning_result: session.learning_result, revision: session.revision
  };
}

function sessionPayload_(context, session) {
  refreshSession_(context, session);
  var snapshot = snapshotMap_(session);
  var questions = session.questions.map(function (id) {
    var question = snapshot[id];
    var sanitized = {};
    ['id', 'stage_id', 'type', 'difficulty', 'category', 'prompt', 'points', 'scene_target']
      .forEach(function (key) { sanitized[key] = question[key]; });
    sanitized.options = session.option_orders[id].map(function (optionId) {
      var option = question.options.find(function (candidate) { return candidate.id === optionId; });
      return {id: option.id, label: option.label};
    });
    return sanitized;
  });
  return {session: sessionView_(context, session), questions: questions};
}

function currentSession_(context, player) {
  var candidates = table_(context, 'sessions').records.filter(function (session) {
    return session.player_id === player.id && ['in_progress', 'paused'].indexOf(session.status) >= 0;
  }).sort(function (a, b) { return b.started_at.localeCompare(a.started_at); });
  for (var index = 0; index < candidates.length; index += 1) {
    var session = refreshSession_(context, candidates[index]);
    if (session.status !== 'completed') return sessionPayload_(context, session);
  }
  return {session: null, questions: []};
}

function shuffled_(items) {
  var result = items.slice();
  for (var i = result.length - 1; i > 0; i -= 1) {
    var j = Math.floor(Math.random() * (i + 1));
    var saved = result[i]; result[i] = result[j]; result[j] = saved;
  }
  return result;
}

function beginSession_(context, player) {
  var existing = currentSession_(context, player);
  if (existing.session) return existing;
  validateBank_();
  var selected = [];
  var orders = {};
  COMLAB_STAGES.forEach(function (stage) {
    COMLAB_BUCKETS.forEach(function (bucket) {
      var candidates = COMLAB_QUESTION_BANK.questions.filter(function (question) {
        return question.stage_id === stage && question.type === bucket[0] && question.difficulty === bucket[1];
      });
      var question = clone_(candidates[Math.floor(Math.random() * candidates.length)]);
      selected.push(question);
      var optionIds = question.options.map(function (option) { return option.id; });
      orders[question.id] = question.type === 'multiple_choice' ? shuffled_(optionIds) : optionIds;
    });
  });
  var timestamp = now_();
  var session = {
    id: Utilities.getUuid(), player_id: player.id, bank_version: COMLAB_QUESTION_BANK.bank_version,
    questions: selected.map(function (question) { return question.id; }), option_orders: orders,
    question_snapshot: selected, started_at: timestamp, ended_at: null, last_seen_at: timestamp,
    status: 'in_progress', current_stage: 0, score: 0, max_score: 120, correct_count: 0,
    wrong_count: 0, active_seconds: 0, completed_stages: [], badge: null,
    learning_result: 'pending', revision: 0
  };
  save_(context, 'sessions', session);
  return sessionPayload_(context, session);
}

function event_(context, session, body, action, payload) {
  var id = requiredText_(body, 'event_id', 120);
  var hash = digest_(JSON.stringify({action: action, payload: payload}));
  var existing = table_(context, 'events').records.find(function (entry) {
    return entry.session_id === session.id && entry.event_id === id;
  });
  if (existing) {
    if (existing.action !== action || existing.payload_hash !== hash) {
      fail_(409, 'event_conflict', 'รหัสการบันทึกถูกใช้กับข้อมูลอื่นแล้ว กรุณาโหลดความคืบหน้าใหม่');
    }
    return;
  }
  save_(context, 'events', {
    session_id: session.id, event_id: id, action: action, payload_hash: hash, created_at: now_()
  });
}

function answer_(context, player, id, body) {
  var questionId = requiredText_(body, 'question_id', 80);
  var optionId = requiredText_(body, 'option_id', 80);
  var session = refreshSession_(context, ownedSession_(context, player, id));
  var question = snapshotMap_(session)[questionId];
  if (!question) fail_(422, 'question_not_in_session', 'คำถามนี้ไม่ได้อยู่ในรอบการเล่นนี้');
  if (!question.options.some(function (option) { return option.id === optionId; })) {
    fail_(422, 'invalid_option', 'ไม่พบตัวเลือกนี้ในคำถาม');
  }
  var old = answerRows_(context, session).find(function (entry) { return entry.question_id === questionId; });
  if (old) {
    if (old.option_id !== optionId) {
      fail_(409, 'immutable_answer', 'บันทึกคำตอบแรกแล้ว การฝึกซ้ำไม่เปลี่ยนคะแนนเดิม');
    }
    event_(context, session, body, 'answer', {question_id: questionId, option_id: optionId});
    var replay = sessionView_(context, session);
    return {answer: replay.answers[questionId], session: replay, replayed: true};
  }
  if (['in_progress', 'paused'].indexOf(session.status) < 0) fail_(409, 'session_closed', 'รอบการเล่นนี้สิ้นสุดแล้ว');
  if (question.stage_id !== COMLAB_STAGES[session.current_stage]) {
    fail_(409, 'stage_locked', 'กรุณาทำภารกิจและอ่านคำอธิบายของด่านปัจจุบันให้ครบก่อน');
  }
  var active = requestedTime_(session, body);
  event_(context, session, body, 'answer', {question_id: questionId, option_id: optionId});
  var correct = optionId === question.correct_option_id;
  save_(context, 'answers', {
    session_id: session.id, question_id: questionId, option_id: optionId,
    is_correct: correct, points: correct ? 10 : 0, answered_at: now_(),
    acknowledged_at: null, first_event_id: body.event_id.trim()
  });
  session.active_seconds = active;
  session.last_seen_at = now_();
  session.status = 'in_progress';
  refreshSession_(context, session);
  // A ledger update always changes score/counters; refresh persists these and time together.
  var view = sessionView_(context, session);
  return {answer: view.answers[questionId], session: view, replayed: false};
}

function acknowledge_(context, player, id, body) {
  var questionId = requiredText_(body, 'question_id', 80);
  var session = refreshSession_(context, ownedSession_(context, player, id));
  var answer = answerRows_(context, session).find(function (entry) { return entry.question_id === questionId; });
  if (!answer) fail_(409, 'answer_required', 'กรุณาตอบคำถามก่อนอ่านคำอธิบาย');
  if (answer.acknowledged_at) {
    event_(context, session, body, 'ack', {question_id: questionId});
    return {session: sessionView_(context, session), replayed: true};
  }
  if (['in_progress', 'paused'].indexOf(session.status) < 0) fail_(409, 'session_closed', 'รอบการเล่นนี้สิ้นสุดแล้ว');
  var active = requestedTime_(session, body);
  event_(context, session, body, 'ack', {question_id: questionId});
  answer.acknowledged_at = now_();
  save_(context, 'answers', answer);
  session.active_seconds = active;
  session.last_seen_at = now_();
  session.status = 'in_progress';
  refreshSession_(context, session);
  // Acknowledgements within a stage may not change derived counts; still persist time/revision.
  session.revision += 1;
  save_(context, 'sessions', session);
  return {session: sessionView_(context, session), replayed: false};
}

function checkpoint_(context, player, id, body) {
  var session = refreshSession_(context, ownedSession_(context, player, id));
  if (['in_progress', 'paused'].indexOf(session.status) < 0) return {session: sessionView_(context, session)};
  if (body.paused !== undefined && typeof body.paused !== 'boolean') {
    fail_(422, 'invalid_pause', 'สถานะพักต้องเป็นค่าจริงหรือเท็จ');
  }
  session.active_seconds = requestedTime_(session, body);
  session.last_seen_at = now_();
  if (body.paused !== undefined) session.status = body.paused ? 'paused' : 'in_progress';
  save_(context, 'sessions', session);
  return {session: sessionView_(context, session)};
}

function abandon_(context, player, id, body) {
  var session = refreshSession_(context, ownedSession_(context, player, id));
  if (session.status === 'completed') fail_(409, 'already_completed', 'รอบนี้จบแล้ว สามารถเริ่มรอบใหม่ได้');
  if (session.status !== 'abandoned') {
    session.active_seconds = requestedTime_(session, body);
    session.status = 'abandoned';
    session.ended_at = now_();
    session.last_seen_at = session.ended_at;
    session.revision += 1;
    save_(context, 'sessions', session);
  }
  return {session: sessionView_(context, session)};
}

function dashboard_(context, player, query) {
  var page = Number(query.page || 1);
  var pageSize = Number(query.page_size || 1000);
  if (!Number.isInteger(page) || page < 1 || !Number.isInteger(pageSize) || pageSize < 1 || pageSize > 1000) {
    fail_(422, 'invalid_pagination', 'หน้าต้องเริ่มจาก 1 และจำนวนแถวอยู่ระหว่าง 1–1000');
  }
  var players = Object.create(null);
  table_(context, 'players').records.forEach(function (candidate) {
    if (canonicalText_(candidate.class_group) === canonicalText_(player.class_group)) players[candidate.id] = candidate;
  });
  var sessions = table_(context, 'sessions').records.filter(function (session) {
    return players[session.player_id] && session.bank_version === COMLAB_QUESTION_BANK.bank_version;
  });
  var participants = new Set();
  var best = Object.create(null);
  sessions.forEach(function (session) {
    participants.add(session.player_id);
    refreshSession_(context, session);
    if (session.status !== 'completed') return;
    var previous = best[session.player_id];
    if (!previous || session.score > previous.score ||
        (session.score === previous.score && session.ended_at < previous.ended_at)) best[session.player_id] = session;
  });
  var results = Object.keys(best).map(function (id) { return best[id]; }).sort(function (a, b) {
    return b.score - a.score || a.ended_at.localeCompare(b.ended_at) || a.id.localeCompare(b.id);
  });
  var rank = 0;
  var previousScore = null;
  var rows = results.map(function (session, index) {
    if (session.score !== previousScore) rank = index + 1;
    previousScore = session.score;
    return {
      rank: rank, nickname: players[session.player_id].nickname, score: session.score,
      max_score: 120, active_seconds: session.active_seconds, badge: session.badge,
      is_me: session.player_id === player.id
    };
  });
  var totalPages = Math.max(1, Math.ceil(rows.length / pageSize));
  page = Math.min(page, totalPages);
  var leaderboard = rows.slice((page - 1) * pageSize, page * pageSize);
  return {
    source: 'google-sheets', scope: 'class', class_group: player.class_group,
    bank_version: COMLAB_QUESTION_BANK.bank_version, total_players: participants.size,
    completed_players: rows.length,
    average_score: rows.length ? Math.round(rows.reduce(function (sum, row) { return sum + row.score; }, 0) / rows.length * 100) / 100 : null,
    highest_score: rows.length ? rows[0].score : null,
    lowest_score: rows.length ? rows[rows.length - 1].score : null,
    leaderboard: leaderboard, page: page, page_size: pageSize, total_pages: totalPages,
    total_results: rows.length, partial: leaderboard.length < rows.length
  };
}

function parsePath_(path) {
  if (typeof path !== 'string' || path.length > 500 || path.indexOf('/api/') !== 0) {
    fail_(400, 'invalid_path', 'เส้นทาง API ไม่ถูกต้อง');
  }
  var pieces = path.split('?');
  var query = Object.create(null);
  if (pieces[1]) pieces[1].split('&').forEach(function (pair) {
    var parts = pair.split('=');
    try { query[decodeURIComponent(parts[0])] = decodeURIComponent(parts.slice(1).join('=').replace(/\+/g, ' ')); }
    catch (_) { fail_(400, 'invalid_query', 'ข้อมูลค้นหาในคำขอไม่ถูกต้อง'); }
  });
  return {path: pieces[0], query: query};
}

function route_(context, request) {
  var method = request.method;
  if (method !== 'GET' && method !== 'POST') fail_(405, 'method_not_allowed', 'รองรับ method GET หรือ POST เท่านั้น');
  var parsed = parsePath_(request.path);
  var path = parsed.path;
  var body = request.body || {};
  if (method === 'GET' && path === '/api/health') return health_(context);
  if (method === 'POST' && path === '/api/register') return register_(context, body);
  var player = authenticate_(context, request.token);
  if (method === 'GET' && path === '/api/me') return {player: profile_(player)};
  if (method === 'POST' && path === '/api/sessions') return beginSession_(context, player);
  if (method === 'GET' && path === '/api/sessions/current') return currentSession_(context, player);
  if (method === 'GET' && path === '/api/dashboard') return dashboard_(context, player, parsed.query);
  var match = path.match(/^\/api\/sessions\/([0-9a-fA-F-]{36})(?:\/(answers|ack|checkpoint|abandon))?$/);
  if (match && method === 'GET' && !match[2]) {
    return sessionPayload_(context, ownedSession_(context, player, match[1]));
  }
  if (match && method === 'POST' && match[2]) {
    var actions = {answers: answer_, ack: acknowledge_, checkpoint: checkpoint_, abandon: abandon_};
    return actions[match[2]](context, player, match[1], body);
  }
  fail_(404, 'not_found', 'ไม่พบคำสั่งที่ร้องขอ');
}

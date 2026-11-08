import bank from '../data/question-bank.json';

// Gameplay data is independent of the Three.js scene. The same rules support
// the self-contained practice build and the optional authoritative API.
const KEY = 'com-lab-rescue:v1';
const ENDPOINT_KEY = 'com-lab-rescue:google-script-url';
const VERSION = 1;
const MAX_HISTORY = 250;
const STAGES = ['stage_1', 'stage_2', 'stage_3'];
const BANK = new Map(bank.questions.map((question) => [question.id, question]));
const clone = (value) => JSON.parse(JSON.stringify(value));
const now = () => new Date().toISOString();
const number = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const uuid = () => globalThis.crypto?.randomUUID?.() || 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
  const random = globalThis.crypto?.getRandomValues ? globalThis.crypto.getRandomValues(new Uint8Array(1))[0] % 16 : Math.floor(Math.random() * 16);
  return (c === 'x' ? random : ((random & 3) | 8)).toString(16);
});
const shuffle = (items) => {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index--) {
    const sample = globalThis.crypto?.getRandomValues ? globalThis.crypto.getRandomValues(new Uint32Array(1))[0] / 4294967296 : Math.random();
    const other = Math.floor(sample * (index + 1));
    [result[index], result[other]] = [result[other], result[index]];
  }
  return result;
};

function validEndpoint(value) {
  return /^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]{8,300}\/exec$/.test(value);
}

function configuredEndpoint() {
  try {
    const override = globalThis.localStorage?.getItem(ENDPOINT_KEY);
    if (override !== null && override !== undefined) return override.trim().replace(/\/$/, '');
  } catch { /* The in-file configuration is still available without storage. */ }
  const config = globalThis.COM_LAB_CONFIG || globalThis.window?.COM_LAB_CONFIG;
  return typeof config?.googleScriptUrl === 'string' ? config.googleScriptUrl.trim().replace(/\/$/, '') : '';
}

function errorWithCode(code, message, transient = false) {
  const error = new Error(message);
  error.code = code;
  error.transient = transient;
  return error;
}

function cleanProfile(input, id) {
  const limits = { full_name: 120, student_code: 40, class_group: 80, nickname: 40 };
  const result = {};
  for (const [key, limit] of Object.entries(limits)) {
    const value = typeof input?.[key] === 'string' ? input[key].trim() : '';
    if (!value || value.length > limit) throw errorWithCode('invalid_profile', 'กรอกชื่อ รหัสผู้เรียน ชั้น/กลุ่ม และชื่อเล่นให้ครบ โดยใช้ข้อความไม่ยาวเกินไป');
    result[key] = value;
  }
  const color = typeof input.avatar_color === 'string' ? input.avatar_color : '#51D6E4';
  result.avatar_color = /^#[0-9a-f]{6}$/i.test(color) || ['teal', 'blue', 'orange', 'purple'].includes(color) ? color : '#51D6E4';
  result.player_id = id || input.player_id || input.id || uuid();
  result.id = result.player_id;
  return result;
}

function selectQuestions() {
  const selected = [];
  for (const stage of STAGES) {
    for (const difficulty of ['easy', 'medium']) {
      for (const type of ['multiple_choice', 'true_false']) {
        const pool = bank.questions.filter((q) => q.stage_id === stage && q.type === type && q.difficulty === difficulty);
        if (!pool.length) throw errorWithCode('invalid_bank', 'คลังคำถามไม่ครบตามระดับและรูปแบบที่กำหนด');
        selected.push(shuffle(pool)[0].id);
      }
    }
  }
  return selected;
}

function questionList(ids, supplied = []) {
  const incoming = new Map(supplied.map((q) => [q.id, q]));
  return ids.map((id) => {
    const local = BANK.get(id);
    if (!local) throw errorWithCode('bank_version_mismatch', 'คลังคำถามของเกมไม่ตรงกับข้อมูลบันทึก กรุณาใช้เกมรุ่นเดียวกับที่เริ่มเล่น');
    const remote = incoming.get(id);
    if (remote) {
      const publicSnapshot = (question) => JSON.stringify([
        ...['id', 'stage_id', 'type', 'difficulty', 'category', 'prompt', 'points', 'scene_target'].map((key) => question[key]),
        Array.isArray(question.options) ? question.options.map((option) => [option.id, option.label]).sort((a, b) => String(a[0]).localeCompare(String(b[0]))) : null,
      ]);
      if (publicSnapshot(local) !== publicSnapshot(remote)) {
        throw errorWithCode('bank_snapshot_mismatch', 'โจทย์ที่บันทึกไว้หรือโจทย์ออนไลน์ไม่ตรงกับไฟล์เกม กรุณาใช้ไฟล์ HTML รุ่นที่ตรงกันเพื่อไม่ตรวจคำตอบผิดชุด');
      }
    }
    // Answers are bundled for offline practice. The backend independently
    // checks all submitted answers; a bundled practice build is not a secure exam.
    return clone({ ...local, ...(incoming.get(id) || {}) });
  });
}

function recalculate(session) {
  const answers = Object.values(session.answers || {});
  session.correct_count = answers.filter((a) => a.is_correct).length;
  session.wrong_count = answers.length - session.correct_count;
  session.score = answers.reduce((sum, answer) => sum + answer.points, 0);
  session.max_score = 120;
  session.completed_stages = STAGES.filter((stage) => {
    const ids = session.questions.filter((id) => BANK.get(id)?.stage_id === stage);
    return ids.length === 4 && ids.every((id) => session.answers[id]?.acknowledged);
  });
  const incomplete = STAGES.findIndex((stage) => !session.completed_stages.includes(stage));
  session.current_stage = incomplete < 0 ? 2 : incomplete;
  session.current_stage_id = STAGES[session.current_stage];
  const next = session.questions.findIndex((id) => !session.answers[id]?.acknowledged);
  session.current_question_index = next < 0 ? null : next;
  if (session.status !== 'abandoned' && incomplete < 0) {
    session.status = 'completed';
    session.ended_at ||= now();
    session.badge = session.correct_count >= 11 ? 'gold' : session.correct_count >= 9 ? 'silver' : 'bronze';
    session.learning_result = session.correct_count >= 9 ? 'passed' : 'needs_review';
  } else if (session.status !== 'abandoned') {
    session.status = 'in_progress';
    session.badge = null;
    session.learning_result = 'pending';
    session.ended_at = null;
  }
  const start = Date.parse(session.started_at);
  const finish = session.ended_at ? Date.parse(session.ended_at) : Date.now();
  session.elapsed_seconds = Math.max(0, Math.floor((finish - start) / 1000));
  return session;
}

function normalizeSession(raw, playerId, authoritative = false) {
  if (!raw || typeof raw !== 'object') throw errorWithCode('invalid_save', 'ข้อมูลรอบการเล่นไม่สมบูรณ์');
  const session = clone(raw);
  session.id = session.id || session.session_id;
  session.session_id = session.id;
  session.player_id ||= playerId;
  session.bank_version ||= bank.bank_version;
  if (session.bank_version !== bank.bank_version) throw errorWithCode('bank_version_mismatch', 'คลังคำถามคนละรุ่น กรุณาเปิดไฟล์ HTML รุ่นที่ใช้เริ่มรอบนี้ ข้อมูลเดิมยังเก็บไว้');
  if (typeof session.id !== 'string' || !session.id || !Array.isArray(session.questions) || session.questions.length !== 12 || new Set(session.questions).size !== 12 || !Number.isFinite(Date.parse(session.started_at))) {
    throw errorWithCode('invalid_save', 'ข้อมูลบันทึกไม่ตรงกับเกมรุ่นนี้ จึงยังเปิดรอบเดิมไม่ได้');
  }
  for (const stage of STAGES) {
    const questions = session.questions.map((id) => BANK.get(id)).filter((q) => q?.stage_id === stage);
    if (questions.length !== 4 || ['easy', 'medium'].some((difficulty) => ['multiple_choice', 'true_false'].some((type) => !questions.some((q) => q.type === type && q.difficulty === difficulty)))) {
      throw errorWithCode('invalid_save', 'ชุดคำถามที่บันทึกไว้ไม่ครบตามด่าน');
    }
  }
  session.option_orders ||= {};
  for (const id of session.questions) {
    const valid = BANK.get(id).options.map((option) => option.id);
    const order = session.option_orders[id];
    if (!Array.isArray(order) || order.length !== valid.length || new Set(order).size !== valid.length || order.some((option) => !valid.includes(option))) {
      // Do not reroll choices when recovering a legacy checkpoint.
      session.option_orders[id] = valid;
    }
  }
  const answers = {};
  for (const [id, rawAnswer] of Object.entries(session.answers || {})) {
    const question = BANK.get(id);
    if (!session.questions.includes(id) || !rawAnswer || !question.options.some((option) => option.id === rawAnswer.option_id)) throw errorWithCode('invalid_save', 'คำตอบในข้อมูลบันทึกไม่ถูกต้อง');
    const serverCorrectId = question.options.some((option) => option.id === rawAnswer.correct_option_id) ? rawAnswer.correct_option_id : question.correct_option_id;
    const correct = authoritative && typeof rawAnswer.is_correct === 'boolean' ? rawAnswer.is_correct : rawAnswer.option_id === question.correct_option_id;
    answers[id] = {
      question_id: id,
      option_id: rawAnswer.option_id,
      is_correct: correct,
      points: correct ? 10 : 0,
      correct_option_id: authoritative ? serverCorrectId : question.correct_option_id,
      explanation: authoritative && typeof rawAnswer.explanation === 'string' ? rawAnswer.explanation : question.explanation,
      answered_at: Number.isFinite(Date.parse(rawAnswer.answered_at)) ? rawAnswer.answered_at : session.started_at,
      acknowledged: rawAnswer.acknowledged === true,
      acknowledged_at: rawAnswer.acknowledged ? rawAnswer.acknowledged_at || rawAnswer.answered_at : null,
    };
  }
  session.answers = answers;
  session.active_seconds = Math.max(0, Math.floor(number(session.active_seconds)));
  session.status = session.status === 'abandoned' ? 'abandoned' : 'in_progress';
  return recalculate(session);
}

function makeLocalSession(playerId) {
  const questions = selectQuestions();
  const optionOrders = {};
  for (const id of questions) {
    const question = BANK.get(id);
    optionOrders[id] = question.type === 'true_false' ? ['true', 'false'] : shuffle(question.options.map((option) => option.id));
  }
  return recalculate({
    id: uuid(), player_id: playerId, bank_version: bank.bank_version,
    questions, option_orders: optionOrders, answers: {},
    started_at: now(), ended_at: null, active_seconds: 0,
    status: 'in_progress', server_confirmed: false,
  });
}

export class GameStore {
  constructor(onChange = () => {}) {
    this.onChange = onChange;
    this.state = { profile: null, session: null, questions: [], history: [], mode: 'local', syncStatus: 'local', pendingCount: 0, error: '', configuredEndpoint: '', connectionAvailable: false, connectionNote: '' };
    this._token = '';
    this._outbox = [];
    this._serverAvailable = false;
    this._serverOrigin = '';
    this._syncPromise = null;
    this._blocked = false;
    this._fraction = 0;
    this._lastCheckpoint = 0;
    this._storageWarning = '';
    this._revision = 0;
    this._tabId = uuid();
    this._exportedQueue = '';
    this._retryAfter = 0;
    this._failureCount = 0;
    this._lastSyncAt = null;
    this._initialized = false;
    this._incompatibleSave = null;
    this._endpoint = '';
    this._connectionEpoch = 0;
    this._successfulRequests = 0;
    this.connectionPromise = Promise.resolve(this.state);
  }

  _emit() {
    this.state.pendingCount = this._outbox.length;
    this.onChange(this.state);
    return this.state;
  }

  _fail(error) {
    const failure = typeof error === 'string' ? errorWithCode('game_error', error) : error;
    this.state.error = failure.message;
    if (this.state.mode === 'server' && failure.transient) this.state.syncStatus = 'offline';
    this._emit();
    throw failure;
  }

  _clearError() {
    this.state.error = this._storageWarning;
  }

  _recordSession() {
    const { session, profile } = this.state;
    if (!session || !profile) return;
    const entry = { ...clone(session), player: clone(profile), storage_mode: this.state.mode };
    const index = this.state.history.findIndex((item) => item.id === session.id);
    if (index < 0) this.state.history.push(entry);
    else this.state.history[index] = entry;
    if (this.state.history.length > MAX_HISTORY) this.state.history = this.state.history.slice(-MAX_HISTORY);
  }

  _save() {
    if (this._incompatibleSave) return false;
    this._recordSession();
    this.state.pendingCount = this._outbox.length;
    try {
      if (!globalThis.localStorage) throw new Error('storage unavailable');
      const payload = {
        schema_version: VERSION, bank_version: bank.bank_version,
        revision: ++this._revision, saved_by: this._tabId, saved_at: now(),
        profile: this.state.profile, session: this.state.session,
        questions: this.state.questions, history: this.state.history,
        mode: this.state.mode, token: this._token, server_endpoint: this._serverOrigin,
        outbox: this._outbox, last_sync_at: this._lastSyncAt,
      };
      globalThis.localStorage.setItem(KEY, JSON.stringify(payload));
      return true;
    } catch {
      this._storageWarning = 'บันทึกในเครื่องไม่ได้ ข้อมูลอาจหายเมื่อปิดหน้านี้ กรุณาเปิดสิทธิ์จัดเก็บข้อมูลหรือดาวน์โหลดผลไว้';
      this.state.error = this._storageWarning;
      if (this.state.mode === 'local') this.state.syncStatus = 'error';
      return false;
    }
  }

  save() {
    const result = this._save();
    if (!result) this._emit();
    return result;
  }

  _applySaved(data) {
    if (data.schema_version !== VERSION) throw errorWithCode('save_version_mismatch', 'โครงสร้างข้อมูลบันทึกเป็นคนละรุ่น กรุณาใช้ไฟล์ HTML รุ่นเดิม');
    if (data.bank_version !== bank.bank_version) {
      const closed = !data.session || ['completed', 'abandoned'].includes(data.session.status);
      if (!closed || data.outbox?.length) throw errorWithCode('save_version_mismatch', 'รอบที่ยังไม่จบหรือยังรอส่งข้อมูลต้องใช้ไฟล์ HTML รุ่นเดิม');
      // A finalized, synced run needs no more grading. Keep it as versioned
      // history while retaining the player identity for a fresh-bank round.
      const history = Array.isArray(data.history) ? [...data.history] : [];
      if (data.session && data.profile && !history.some((entry) => entry.id === data.session.id)) history.push({ ...data.session, player: data.profile, storage_mode: data.mode });
      data = { ...data, bank_version: bank.bank_version, session: null, questions: [], history };
    }
    const profile = data.profile ? cleanProfile(data.profile, data.profile.player_id || data.profile.id) : null;
    const session = data.session ? normalizeSession(data.session, profile?.player_id, data.mode === 'server' && data.session.server_confirmed === true) : null;
    const restoredQuestions = session ? questionList(session.questions, Array.isArray(data.questions) ? data.questions : []) : [];
    if (session && (!profile || session.player_id !== profile.player_id)) throw errorWithCode('invalid_save', 'เจ้าของข้อมูลบันทึกไม่ตรงกับผู้เล่น');
    const outbox = Array.isArray(data.outbox) ? data.outbox : [];
    if (outbox.length > 256 || outbox.some((event) => !event || typeof event.event_id !== 'string' || typeof event.session_id !== 'string' || !['answer', 'ack', 'checkpoint', 'abandon'].includes(event.kind) || !event.payload || (session && event.session_id !== session.id))) {
      throw errorWithCode('invalid_save', 'คิวบันทึกข้อมูลไม่สมบูรณ์ กรุณาเก็บสำเนาผลก่อนเริ่มใหม่');
    }
    const history = [];
    for (const entry of (Array.isArray(data.history) ? data.history : []).slice(-MAX_HISTORY)) {
      try {
        const player = cleanProfile(entry.player, entry.player?.player_id || entry.player?.id);
        if (typeof entry.bank_version === 'string' && entry.bank_version !== bank.bank_version && typeof entry.id === 'string') {
          history.push({ ...clone(entry), player, storage_mode: entry.storage_mode === 'server' ? 'server' : 'local', archived: true });
          continue;
        }
        const normalized = normalizeSession(entry, player.player_id, entry.storage_mode === 'server' && entry.server_confirmed === true);
        history.push({ ...normalized, player, storage_mode: entry.storage_mode === 'server' ? 'server' : 'local' });
      } catch { /* Keep usable history even when one old record is damaged. */ }
    }
    this.state.profile = profile;
    this.state.session = session;
    this.state.questions = restoredQuestions;
    this.state.history = history;
    this.state.mode = data.mode === 'server' ? 'server' : 'local';
    this._token = typeof data.token === 'string' && data.token.length < 1024 ? data.token : '';
    this._serverOrigin = typeof data.server_endpoint === 'string' ? data.server_endpoint : typeof data.server_origin === 'string' ? data.server_origin : '';
    this._outbox = clone(outbox);
    this._revision = Math.max(this._revision, number(data.revision));
    this._lastSyncAt = data.last_sync_at || null;
    this._lastCheckpoint = session?.active_seconds || 0;
    this.state.pendingCount = this._outbox.length;
    this.state.syncStatus = this.state.mode === 'local' ? 'local' : this._outbox.length ? 'pending' : 'saved';
  }

  _hydrate() {
    let raw;
    try {
      raw = globalThis.localStorage?.getItem(KEY);
      if (!raw) return;
      if (raw.length > 5_000_000) throw new Error('checkpoint too large');
      this._applySaved(JSON.parse(raw));
    } catch (error) {
      // Do not silently destroy the only copy of an unreadable checkpoint.
      if (raw) {
        try { globalThis.localStorage.setItem(`${KEY}:recovery`, raw); } catch { /* Storage failure is reported below. */ }
      }
      if (raw && ['save_version_mismatch', 'bank_version_mismatch', 'bank_snapshot_mismatch'].includes(error.code)) {
        this._incompatibleSave = { raw, error };
        this.state.saveIncompatible = true;
        this.state.syncStatus = 'error';
        this.state.error = 'ข้อมูลบันทึกเป็นคนละรุ่นกับไฟล์เกม กรุณาเปิด HTML รุ่นเดิมเพื่อเล่นต่อ ระบบเก็บข้อมูลต้นฉบับไว้โดยไม่เขียนทับ';
        this._storageWarning = this.state.error;
        return;
      }
      this.state.error = raw ? 'เปิดข้อมูลบันทึกเดิมไม่ได้ เกมจะเริ่มรอบใหม่ สำเนาข้อมูลเดิมยังเก็บไว้ในเครื่องเมื่อพื้นที่จัดเก็บอนุญาต' : 'เบราว์เซอร์นี้ไม่อนุญาตการบันทึกในเครื่อง กรุณาดาวน์โหลดผลก่อนปิดหน้า';
      if (!raw) this._storageWarning = this.state.error;
    }
  }

  _requireCompatibleSave() {
    if (this._incompatibleSave) throw errorWithCode('bank_version_mismatch', this.state.error || 'ใช้ไฟล์ HTML รุ่นเดิมเพื่อเปิดข้อมูลบันทึกนี้');
  }

  _readNewerCheckpoint() {
    // Reconcile a newer tab's persisted state before a local mutation. Online
    // uniqueness constraints remain the final authority for simultaneous tabs.
    if (this._syncPromise) return;
    try {
      const raw = globalThis.localStorage?.getItem(KEY);
      if (!raw) return;
      const saved = JSON.parse(raw);
      if (saved.saved_by !== this._tabId && number(saved.revision) > this._revision) this._applySaved(saved);
    } catch { /* A bad external checkpoint must never replace our usable state. */ }
  }

  async _request(path, { method = 'GET', body, auth = true, timeout = 25000, endpoint = this._endpoint } = {}) {
    if (!endpoint) throw errorWithCode('google_not_configured', 'ยังไม่ได้เชื่อม Google Sheets กรุณาตั้งค่าลิงก์ Google Apps Script ก่อน');
    if (!validEndpoint(endpoint)) throw errorWithCode('invalid_google_url', 'ใช้ลิงก์ Google Apps Script ที่ขึ้นต้นด้วย https://script.google.com/macros/s/ และลงท้าย /exec');
    if (typeof globalThis.fetch !== 'function') throw errorWithCode('network_unavailable', 'ติดต่อ Google Sheets ไม่ได้ ข้อมูลที่ทำไปยังอยู่ในเครื่อง', true);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);
    try {
      // A text/plain POST is a CORS-simple request. Apps Script redirects its
      // readable JSON response to googleusercontent.com; never use no-cors.
      const response = await globalThis.fetch(endpoint, {
        method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ method, path, body: body === undefined ? {} : body, token: auth ? this._token : '' }),
        signal: controller.signal, credentials: 'omit', redirect: 'follow',
      });
      let envelope;
      try { envelope = await response.json(); }
      catch { throw errorWithCode('invalid_response', 'Google Apps Script ไม่ได้ส่งข้อมูลที่อ่านได้ ตรวจลิงก์ /exec และสิทธิ์ Anyone ของ Deployment', true); }
      if (!response.ok || envelope?.ok !== true) {
        const status = Number(envelope?.error?.status) || (response.ok ? 400 : response.status);
        const code = envelope?.error?.code || `http_${status}`;
        const fallback = status === 401 || status === 403 ? 'สิทธิ์เชื่อมต่อหมดอายุ กรุณาดาวน์โหลดผลและเข้าสู่ระบบใหม่' : 'บันทึกใน Google Sheets ไม่สำเร็จ กรุณาลองใหม่';
        const failure = errorWithCode(code, envelope?.error?.message || fallback, status >= 500 || status === 408 || status === 429);
        failure.status = status;
        throw failure;
      }
      if (!envelope.data || typeof envelope.data !== 'object') throw errorWithCode('invalid_response', 'ข้อมูลตอบกลับจาก Google Apps Script ไม่ครบถ้วน', true);
      this._successfulRequests++;
      return envelope.data;
    } catch (error) {
      if (error.code) throw error;
      throw errorWithCode(error.name === 'AbortError' ? 'network_timeout' : 'network_unavailable', 'เชื่อมต่อ Google Sheets ไม่ได้ ข้อมูลยังอยู่ในเครื่อง ตรวจอินเทอร์เน็ตและสิทธิ์ Deployment แล้วลองอีกครั้ง', true);
    } finally {
      clearTimeout(timer);
    }
  }

  async init() {
    if (this._initialized) return this.state;
    this._initialized = true;
    this._hydrate();
    this._endpoint = configuredEndpoint();
    this.state.configuredEndpoint = this._endpoint;
    if (this._incompatibleSave) return this._emit();
    if (!this.state.profile) {
      this.state.mode = this._endpoint ? 'server' : 'local';
      this.state.syncStatus = this._endpoint ? 'pending' : 'local';
    } else if (this.state.mode === 'server') {
      if (!this._endpoint || (this._serverOrigin && this._serverOrigin !== this._endpoint)) {
        this._blocked = true;
        this.state.syncStatus = 'error';
        this.state.error = 'ลิงก์ Google Sheets ไม่ตรงกับรอบที่บันทึกไว้ กรุณาใช้ Deployment เดิมหรือดาวน์โหลดผลก่อนเปลี่ยนผู้เล่น';
      } else if (!this._token) {
        this._blocked = true;
        this.state.syncStatus = 'error';
        this.state.error = 'ไม่พบสิทธิ์ของผู้เล่น กรุณาดาวน์โหลดผลแล้วเข้าสู่ระบบใหม่';
      } else this.state.syncStatus = 'pending';
    }
    globalThis.addEventListener?.('online', () => { if (this.state.mode === 'server') void this.sync(); });
    this._save();
    this._emit();
    // Apps Script can cold-start slowly. Render cached gameplay immediately;
    // observers receive the final connection result without blocking the UI.
    this.connectionPromise = this._endpoint ? this._checkConnection() : Promise.resolve(this.state);
    return this.state;
  }

  async _checkConnection() {
    const endpoint = this._endpoint;
    const epoch = ++this._connectionEpoch;
    const successesBefore = this._successfulRequests;
    try {
      const health = await this._request('/api/health', { auth: false, timeout: 15000, endpoint });
      if (epoch !== this._connectionEpoch || endpoint !== this._endpoint) return this.state;
      if (health.ok !== true || health.storage !== 'google-sheets') throw errorWithCode('wrong_backend', 'ลิงก์นี้ไม่ใช่ Google Sheets backend ของเกม COM LAB RESCUE');
      this._serverAvailable = true;
      this.state.connectionAvailable = true;
      if (!this.state.profile) {
        this.state.mode = 'server';
        this.state.syncStatus = 'saved';
      } else if (this.state.mode === 'local') {
        this.state.connectionNote = 'เชื่อม Google Sheets แล้ว รอบฝึกเดิมยังอยู่ในเครื่อง เปลี่ยนผู้เล่นเพื่อเริ่มรอบออนไลน์';
      } else if (!this._blocked && this._token) {
        if (this._outbox.length) await this.sync();
        else if (!this.state.session || this.state.session.status === 'in_progress') {
          const revision = this._revision;
          const current = await this._request('/api/sessions/current');
          if (epoch !== this._connectionEpoch || endpoint !== this._endpoint) return this.state;
          if (!this._outbox.length && revision === this._revision) {
            if (current.session) this._adoptServer(current.session, current.questions);
            else if (this.state.session?.status === 'in_progress') {
              this.state.session = null;
              this.state.questions = [];
            }
          }
          if (!this._outbox.length) this.state.syncStatus = 'saved';
        } else this.state.syncStatus = 'saved';
      }
      this._save();
    } catch (error) {
      if (epoch !== this._connectionEpoch || endpoint !== this._endpoint) return this.state;
      if (error.transient && this._successfulRequests > successesBefore && this.state.connectionAvailable) return this._emit();
      this._serverAvailable = false;
      this.state.connectionAvailable = false;
      this.state.error = error.message;
      if (this.state.mode === 'server') this.state.syncStatus = error.transient ? 'offline' : 'error';
      if (!error.transient && this.state.profile?.player_id && this.state.mode === 'server') this._blocked = true;
    }
    return this._emit();
  }

  async connectGoogle(value) {
    const endpoint = typeof value === 'string' ? value.trim().replace(/\/$/, '') : '';
    try {
      this._requireCompatibleSave();
      if (endpoint && !validEndpoint(endpoint)) throw errorWithCode('invalid_google_url', 'ใช้ URL ของ Google Apps Script Web app ที่ลงท้าย /exec ไม่ใช่ลิงก์แก้ไขโค้ดหรือ /dev');
      const changed = endpoint !== this._endpoint;
      if (changed && (this._outbox.length || this._syncPromise)) throw errorWithCode('pending_sync', 'ยังมีข้อมูลรอส่ง กรุณาบันทึกหรือดาวน์โหลดผลและเปลี่ยนผู้เล่นก่อนเปลี่ยนลิงก์');
      if (changed && this.state.mode === 'server' && this.state.session?.status === 'in_progress') throw errorWithCode('active_session', 'จบหรือยุติรอบออนไลน์ปัจจุบันก่อนเปลี่ยนลิงก์ เพื่อรักษาความคืบหน้าของผู้เล่น');
      if (endpoint) {
        const health = await this._request('/api/health', { auth: false, timeout: 15000, endpoint });
        if (health.ok !== true || health.storage !== 'google-sheets') throw errorWithCode('wrong_backend', 'ลิงก์นี้ไม่ใช่ Google Sheets backend ของเกม COM LAB RESCUE');
      }
      if (changed && this.state.mode === 'server' && this.state.profile) {
        this._recordSession();
        this.state.profile = null;
        this.state.session = null;
        this.state.questions = [];
        this._token = '';
        this._serverOrigin = '';
        this._blocked = false;
      }
      ++this._connectionEpoch;
      this._endpoint = endpoint;
      this.state.configuredEndpoint = endpoint;
      this._serverAvailable = Boolean(endpoint);
      this.state.connectionAvailable = Boolean(endpoint);
      this._clearError();
      this.state.connectionNote = '';
      try { globalThis.localStorage?.setItem(ENDPOINT_KEY, endpoint); }
      catch {
        this._storageWarning = 'บันทึกลิงก์ในเครื่องไม่ได้ การเชื่อมต่อนี้จะใช้ได้เฉพาะตอนที่ยังเปิดหน้าอยู่';
        this.state.error = this._storageWarning;
      }
      if (!this.state.profile) {
        this.state.mode = endpoint ? 'server' : 'local';
        this.state.syncStatus = endpoint ? 'saved' : 'local';
      } else if (this.state.mode === 'local') {
        this.state.syncStatus = 'local';
        if (endpoint) this.state.connectionNote = 'เชื่อม Google Sheets แล้ว รอบฝึกเดิมยังอยู่ในเครื่อง เปลี่ยนผู้เล่นเพื่อเริ่มรอบออนไลน์';
      } else if (!this._blocked) this.state.syncStatus = this._outbox.length ? 'pending' : 'saved';
      this._save();
      return this._emit();
    } catch (error) { return this._fail(error); }
  }

  async register(input) {
    this._readNewerCheckpoint();
    try {
      this._requireCompatibleSave();
      if (this._outbox.length) throw errorWithCode('pending_sync', 'ยังมีผลที่รอบันทึก กรุณาซิงก์หรือดาวน์โหลดผลก่อนเปลี่ยนผู้เล่น');
      if (this.state.profile && this.state.session?.status === 'in_progress') throw errorWithCode('active_session', 'มีรอบที่กำลังเล่นอยู่ กรุณาเล่นต่อหรือเริ่มใหม่ผ่านเมนูก่อน');
      const profile = cleanProfile(input);
      this._clearError();
      this._blocked = false;
      if (this._endpoint) {
        const { id, player_id, ...registration } = profile;
        const response = await this._request('/api/register', { method: 'POST', body: registration, auth: false });
        if (!response.player || typeof response.token !== 'string') throw errorWithCode('invalid_response', 'ลงทะเบียนไม่สำเร็จ ระบบไม่ได้ส่งสิทธิ์ผู้เล่นกลับมา', true);
        this.state.profile = cleanProfile(response.player, response.player.player_id || response.player.id);
        this._token = response.token;
        this._serverOrigin = this._endpoint;
        this._serverAvailable = true;
        this.state.connectionAvailable = true;
        this.state.mode = 'server';
        this.state.syncStatus = 'saved';
      } else {
        const previous = this.state.history.find((entry) => entry.storage_mode === 'local' && entry.player?.student_code === profile.student_code && entry.player?.class_group === profile.class_group);
        this.state.profile = cleanProfile(profile, previous?.player?.player_id || profile.player_id);
        this._token = '';
        this._serverOrigin = '';
        this.state.mode = 'local';
        this.state.syncStatus = 'local';
      }
      this.state.session = null;
      this.state.questions = [];
      this.state.connectionNote = '';
      this._fraction = 0;
      this._exportedQueue = '';
      this._save();
      return this._emit();
    } catch (error) { return this._fail(error); }
  }

  async start() {
    this._readNewerCheckpoint();
    try {
      this._requireCompatibleSave();
      if (!this.state.profile) throw errorWithCode('registration_required', 'กรอกข้อมูลผู้เล่นก่อนเริ่มภารกิจ');
      if (this.state.session?.status === 'in_progress') return this._emit();
      if (this._outbox.length) {
        await this.sync();
        if (this._outbox.length) throw errorWithCode('pending_sync', 'รอบก่อนยังรอบันทึกออนไลน์ กรุณาเชื่อมต่อและกดบันทึกอีกครั้งก่อนเริ่มรอบใหม่');
      }
      this._clearError();
      if (this.state.mode === 'server') {
        if (this._blocked) throw errorWithCode('session_blocked', 'ต้องกู้สิทธิ์ผู้เล่นก่อนเริ่มรอบใหม่ กรุณาดาวน์โหลดผลแล้วเข้าสู่ระบบใหม่');
        const response = await this._request('/api/sessions', { method: 'POST', body: {} });
        this._adoptServer(response.session, response.questions);
      } else {
        this.state.session = makeLocalSession(this.state.profile.player_id);
        this.state.questions = questionList(this.state.session.questions);
        this.state.syncStatus = 'local';
      }
      this._fraction = 0;
      this._lastCheckpoint = this.state.session.active_seconds;
      this._save();
      return this._emit();
    } catch (error) { return this._fail(error); }
  }

  _checkQuestion(questionId) {
    const session = this.state.session;
    if (!session) throw errorWithCode('no_session', 'เริ่มภารกิจก่อนตอบคำถาม');
    if (!session.questions.includes(questionId)) throw errorWithCode('invalid_question', 'ข้อนี้ไม่ได้อยู่ในรอบที่กำลังเล่น');
    const question = BANK.get(questionId);
    if (session.status !== 'in_progress') throw errorWithCode('session_finished', 'รอบนี้จบแล้ว เริ่มรอบใหม่เพื่อฝึกอีกครั้ง');
    if (question.stage_id !== session.current_stage_id) throw errorWithCode('stage_locked', 'ทำภารกิจและอ่านคำอธิบายในด่านปัจจุบันให้ครบก่อน');
    return question;
  }

  _queue(kind, payload) {
    const session = this.state.session;
    if (this.state.mode !== 'server' || !session) return;
    const event = { event_id: uuid(), kind, session_id: session.id, payload, created_at: now() };
    event.payload.event_id = event.event_id;
    if (kind === 'checkpoint' && this._outbox.at(-1)?.kind === 'checkpoint' && this._outbox.at(-1)?.session_id === session.id && !this._syncPromise) {
      this._outbox[this._outbox.length - 1].payload.active_seconds = payload.active_seconds;
    } else this._outbox.push(event);
    session.server_confirmed = false;
    this._exportedQueue = '';
    this.state.syncStatus = this._blocked ? 'error' : globalThis.navigator?.onLine === false ? 'offline' : 'pending';
  }

  _maybeSync() {
    if (this.state.mode === 'server' && !this._blocked && Date.now() >= this._retryAfter) void this.sync();
  }

  async answer(questionId, optionId) {
    this._readNewerCheckpoint();
    try {
      this._requireCompatibleSave();
      const previous = this.state.session?.answers?.[questionId];
      if (previous) {
        if (previous.option_id !== optionId) throw errorWithCode('immutable_answer', 'ข้อนี้บันทึกคำตอบแรกแล้ว การฝึกซ้ำจะไม่เปลี่ยนคะแนน');
        return previous;
      }
      const question = this._checkQuestion(questionId);
      if (!question.options.some((option) => option.id === optionId)) throw errorWithCode('invalid_option', 'เลือกคำตอบจากตัวเลือกของข้อนี้');
      this._clearError();
      const correct = optionId === question.correct_option_id;
      const answer = {
        question_id: questionId, option_id: optionId, is_correct: correct,
        points: correct ? 10 : 0, correct_option_id: question.correct_option_id,
        explanation: question.explanation, answered_at: now(), acknowledged: false, acknowledged_at: null,
      };
      this.state.session.answers[questionId] = answer;
      recalculate(this.state.session);
      this._queue('answer', { question_id: questionId, option_id: optionId, active_seconds: this.state.session.active_seconds });
      this._save();
      this._emit();
      this._maybeSync();
      return answer;
    } catch (error) { return this._fail(error); }
  }

  async acknowledge(questionId) {
    this._readNewerCheckpoint();
    try {
      this._requireCompatibleSave();
      const answer = this.state.session?.answers?.[questionId];
      if (!answer) throw errorWithCode('answer_required', 'เลือกคำตอบก่อนอ่านสรุปและไปต่อ');
      if (answer.acknowledged) return this._emit();
      this._checkQuestion(questionId);
      this._clearError();
      answer.acknowledged = true;
      answer.acknowledged_at = now();
      this._queue('ack', { question_id: questionId, active_seconds: this.state.session.active_seconds });
      recalculate(this.state.session);
      this._save();
      this._emit();
      this._maybeSync();
      return this.state;
    } catch (error) { return this._fail(error); }
  }

  tick(seconds) {
    const session = this.state.session;
    if (!session || session.status !== 'in_progress' || !Number.isFinite(seconds) || seconds <= 0) return;
    // The UI only calls tick while the play screen is visible and unpaused.
    this._fraction += Math.min(seconds, 60);
    const whole = Math.floor(this._fraction);
    if (!whole) return;
    this._fraction -= whole;
    session.active_seconds += whole;
    session.elapsed_seconds = Math.max(0, Math.floor((Date.now() - Date.parse(session.started_at)) / 1000));
    if (session.active_seconds - this._lastCheckpoint >= 15) {
      this._lastCheckpoint = session.active_seconds;
      this._queue('checkpoint', { active_seconds: session.active_seconds });
      this._save();
      this._maybeSync();
    }
  }

  _adoptServer(raw, questions = []) {
    const previous = this.state.session;
    const normalized = normalizeSession(raw, this.state.profile?.player_id, true);
    const supplied = questions.length ? questions : previous?.id === normalized.id ? this.state.questions : [];
    if (supplied.length !== normalized.questions.length) throw errorWithCode('invalid_response', 'ระบบไม่ได้ส่งชุดโจทย์ที่ครบถ้วน จึงยังเริ่มรอบออนไลน์ไม่ได้');
    const matchedQuestions = questionList(normalized.questions, supplied);
    if (previous?.id === normalized.id) normalized.active_seconds = Math.max(normalized.active_seconds, previous.active_seconds);
    normalized.server_confirmed = true;
    this.state.session = normalized;
    this.state.questions = matchedQuestions;
    this.state.syncStatus = 'saved';
    this._lastSyncAt = now();
    this._serverAvailable = true;
    this.state.connectionAvailable = true;
    this._failureCount = 0;
    this._retryAfter = 0;
  }

  async sync() {
    if (this._syncPromise) return this._syncPromise;
    if (this.state.mode !== 'server' || !this._token || this._blocked) return this.state;
    this._syncPromise = this._drain();
    try { return await this._syncPromise; }
    finally { this._syncPromise = null; }
  }

  async _drain() {
    if (!this._outbox.length) {
      if (this.state.syncStatus !== 'offline' && this.state.syncStatus !== 'error') return this.state;
      try {
        const current = await this._request('/api/sessions/current');
        if (current.session && (!this.state.session || current.session.id === this.state.session.id)) this._adoptServer(current.session, current.questions);
        this._clearError();
        this._serverAvailable = true;
        this.state.connectionAvailable = true;
        this.state.syncStatus = 'saved';
        this._save();
      } catch (error) {
        this.state.error = error.message;
        this.state.syncStatus = error.transient ? 'offline' : 'error';
        this._blocked = !error.transient;
      }
      return this._emit();
    }
    this.state.syncStatus = 'pending';
    this._emit();
    let latest = null;
    let processed = 0;
    try {
      while (this._outbox.length && processed < 64) {
        const event = this._outbox[0];
        const routes = { answer: 'answers', ack: 'ack', checkpoint: 'checkpoint', abandon: 'abandon' };
        const response = await this._request(`/api/sessions/${encodeURIComponent(event.session_id)}/${routes[event.kind]}`, { method: 'POST', body: event.payload });
        latest = response.session || latest;
        if (this._outbox[0]?.event_id === event.event_id) this._outbox.shift();
        processed++;
        // Only reconcile when every newer local operation has been accepted.
        // A response for Q1 must not erase locally queued Q2/Q3 answers.
        if (!this._outbox.length && latest && latest.id === this.state.session?.id) {
          this._adoptServer(latest);
          this._clearError();
        }
        this._save();
      }
      this.state.syncStatus = this._outbox.length ? 'pending' : 'saved';
      this._failureCount = 0;
      this._retryAfter = 0;
    } catch (error) {
      this._failureCount++;
      this._retryAfter = Date.now() + Math.min(30_000, 1000 * 2 ** Math.min(this._failureCount, 5));
      this.state.error = error.message;
      this.state.syncStatus = error.transient ? 'offline' : 'error';
      this._blocked = !error.transient;
      this._save();
    }
    return this._emit();
  }

  async abandon() {
    this._readNewerCheckpoint();
    try {
      this._requireCompatibleSave();
      const session = this.state.session;
      if (!session || session.status !== 'in_progress') return this.state;
      this._clearError();
      this._queue('abandon', { active_seconds: session.active_seconds });
      session.status = 'abandoned';
      session.ended_at = now();
      recalculate(session);
      this._save();
      this._emit();
      if (this.state.mode === 'server') await this.sync();
      return this.state;
    } catch (error) { return this._fail(error); }
  }

  _localDashboard(serverCache = false) {
    this._recordSession();
    const group = this.state.profile?.class_group;
    const records = this.state.history.filter((entry) => group && entry.player?.class_group === group && entry.bank_version === bank.bank_version && entry.storage_mode === (serverCache ? 'server' : 'local'));
    const players = new Set(records.map((entry) => entry.player_id));
    const best = new Map();
    for (const entry of records) {
      if (entry.status !== 'completed' || (serverCache && !entry.server_confirmed)) continue;
      const previous = best.get(entry.player_id);
      if (!previous || entry.score > previous.score || (entry.score === previous.score && entry.ended_at < previous.ended_at)) best.set(entry.player_id, entry);
    }
    const ordered = [...best.values()].sort((a, b) => b.score - a.score || a.ended_at.localeCompare(b.ended_at));
    let lastScore = null;
    let rank = 0;
    const leaderboard = ordered.map((entry, index) => {
      if (lastScore !== entry.score) rank = index + 1;
      lastScore = entry.score;
      return { rank, nickname: entry.player.nickname, score: entry.score, max_score: 120, active_seconds: entry.active_seconds, badge: entry.badge, is_me: entry.player_id === this.state.profile?.player_id };
    });
    const scores = ordered.map((entry) => entry.score);
    return {
      total_players: players.size,
      average_score: scores.length ? Math.round(scores.reduce((sum, value) => sum + value, 0) / scores.length * 10) / 10 : null,
      highest_score: scores.length ? Math.max(...scores) : null,
      lowest_score: scores.length ? Math.min(...scores) : null,
      leaderboard, class_group: group || null,
      source: serverCache ? 'device-cache' : 'local', scope: 'this_device',
      partial: serverCache, updated_at: now(), requires_registration: !this.state.profile,
    };
  }

  async getDashboard() {
    if (this.state.mode === 'server' && this._token && !this._blocked) {
      try {
        const data = await this._request('/api/dashboard');
        return { ...data, source: 'server', scope: 'class', partial: Boolean(data.partial), updated_at: now() };
      } catch (error) {
        this.state.error = error.message;
        this.state.syncStatus = error.transient ? 'offline' : 'error';
        this._blocked = !error.transient;
        this._emit();
        return this._localDashboard(true);
      }
    }
    return this._localDashboard(this.state.mode === 'server');
  }

  exportData() {
    if (this._incompatibleSave) {
      const saved = JSON.parse(this._incompatibleSave.raw);
      const redact = (value) => {
        if (Array.isArray(value)) return value.map(redact);
        if (!value || typeof value !== 'object') return value;
        return Object.fromEntries(Object.entries(value).filter(([key]) => !['token', 'token_hash', 'Authorization'].includes(key)).map(([key, item]) => [key, redact(item)]));
      };
      const owner = saved.profile?.player_id || saved.profile?.id;
      return redact({
        schema_version: VERSION, game: 'COM LAB RESCUE', bank_version: saved.bank_version,
        exported_at: now(), storage_mode: saved.mode, incompatible_checkpoint: true,
        profile: saved.profile || null, current_session: saved.session || null,
        sessions: (saved.history || []).filter((entry) => entry.player_id === owner),
        pending_events: saved.outbox || [],
        note: 'สำเนาผลจากเกมคนละรุ่น ใช้ HTML รุ่นเดิมกับข้อมูลในเบราว์เซอร์เดิมเพื่อเล่นต่อ ไฟล์ส่งออกไม่รวมสิทธิ์เข้าใช้งาน',
      });
    }
    this._recordSession();
    const playerId = this.state.profile?.player_id;
    this._exportedQueue = this._outbox.map((event) => event.event_id).join('|');
    return {
      schema_version: VERSION, game: 'COM LAB RESCUE', bank_version: bank.bank_version,
      exported_at: now(), storage_mode: this.state.mode,
      profile: clone(this.state.profile), current_session: clone(this.state.session),
      sessions: clone(this.state.history.filter((entry) => entry.player_id === playerId)),
      pending_events: clone(this._outbox),
      note: this.state.mode === 'local' ? 'ผลการฝึกบนอุปกรณ์นี้ ไม่ใช่ผลที่ยืนยันบนเซิร์ฟเวอร์' : this._outbox.length ? 'มีรายการที่ยังไม่ได้ยืนยันบนเซิร์ฟเวอร์' : 'รายการออนไลน์ที่ส่งแล้ว',
    };
  }

  signOut() {
    if (this._incompatibleSave) return this._fail(errorWithCode('bank_version_mismatch', this.state.error));
    this._readNewerCheckpoint();
    if (this._syncPromise) return this._fail(errorWithCode('sync_in_progress', 'กำลังบันทึกผล กรุณารอสักครู่ก่อนเปลี่ยนผู้เล่น'));
    const fingerprint = this._outbox.map((event) => event.event_id).join('|');
    if (this._outbox.length && this._exportedQueue !== fingerprint) return this._fail(errorWithCode('pending_sync', 'มีผลที่ยังส่งไม่สำเร็จ กรุณาซิงก์หรือดาวน์โหลดข้อมูลก่อนเปลี่ยนผู้เล่น'));
    this._recordSession();
    this.state.profile = null;
    this.state.session = null;
    this.state.questions = [];
    this.state.connectionNote = '';
    this._token = '';
    this._outbox = [];
    this._serverOrigin = '';
    this._blocked = false;
    this._fraction = 0;
    this._exportedQueue = '';
    this.state.mode = this._endpoint ? 'server' : 'local';
    this.state.syncStatus = this._endpoint ? (this._serverAvailable ? 'saved' : 'offline') : 'local';
    this._clearError();
    this._save();
    return this._emit();
  }
}

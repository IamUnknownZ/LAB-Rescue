/**
 * Local logic tests, not a live Google deployment test.
 * Google services are mocked; no external accounts or network requests are used.
 */
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {createHash, randomUUID} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const code = readFileSync(path.join(root, 'apps-script/Code.gs'), 'utf8');
const questionsCode = readFileSync(path.join(root, 'apps-script/Questions.gs'), 'utf8');
const bank = JSON.parse(readFileSync(path.join(root, 'data/question-bank.json'), 'utf8'));
const questionsById = Object.fromEntries(bank.questions.map(q => [q.id, q]));

function harness({runSetup = true} = {}) {
  const state = {
    sheets: new Map(), properties: new Map(), held: false, forceBusy: false,
    failNextWrite: null, flushes: 0, unlockedWrites: 0, boundAvailable: true,
  };
  class Range {
    constructor(sheet, row, column, rows, columns) {
      Object.assign(this, {sheet, row, column, rows, columns});
    }
    getValues() {
      return Array.from({length: this.rows}, (_, r) =>
        Array.from({length: this.columns}, (_, c) =>
          this.sheet.rows[this.row - 1 + r]?.[this.column - 1 + c] ?? ''));
    }
    setValues(values) {
      if (!state.held) {
        state.unlockedWrites++;
        throw new Error('Sheet write outside ScriptLock');
      }
      if (state.failNextWrite === this.sheet.name) {
        state.failNextWrite = null;
        throw new Error('Injected transient write failure');
      }
      assert.equal(values.length, this.rows);
      for (let r = 0; r < this.rows; r++) {
        assert.equal(values[r].length, this.columns);
        const at = this.row - 1 + r;
        this.sheet.rows[at] ??= [];
        for (let c = 0; c < this.columns; c++) {
          this.sheet.rows[at][this.column - 1 + c] = values[r][c];
        }
      }
      return this;
    }
    setNumberFormat(format) { assert.equal(format, '@'); return this; }
    setFontWeight() { return this; }
    setBackground() { return this; }
    setFontColor() { return this; }
  }
  class Sheet {
    constructor(name) { this.name = name; this.rows = []; this.maxRows = 1000; this.maxColumns = 26; }
    getName() { return this.name; }
    getLastRow() {
      for (let index = this.rows.length - 1; index >= 0; index--) {
        if (this.rows[index]?.some(cell => cell !== '')) return index + 1;
      }
      return 0;
    }
    getMaxRows() { return this.maxRows; }
    getMaxColumns() { return this.maxColumns; }
    insertRowsAfter(_after, count) { this.maxRows += count; }
    insertColumnsAfter(_after, count) { this.maxColumns += count; }
    setFrozenRows(rows) { assert.equal(rows, 1); return this; }
    getRange(row, column, rows, columns) {
      assert.ok(row >= 1 && column >= 1 && rows >= 1 && columns >= 1);
      assert.ok(row + rows - 1 <= this.maxRows);
      assert.ok(column + columns - 1 <= this.maxColumns);
      return new Range(this, row, column, rows, columns);
    }
  }
  const spreadsheet = {
    getId() { return 'mock-private-spreadsheet'; },
    getSheetByName(name) { return state.sheets.get(name) ?? null; },
    insertSheet(name) {
      assert.ok(state.held);
      const sheet = new Sheet(name); state.sheets.set(name, sheet); return sheet;
    },
  };
  const sandbox = {
    console: {error() {}},
    SpreadsheetApp: {
      getActiveSpreadsheet() { return state.boundAvailable ? spreadsheet : null; },
      openById(id) { assert.equal(id, 'mock-private-spreadsheet'); return spreadsheet; },
      flush() { state.flushes++; },
    },
    PropertiesService: {
      getScriptProperties() {
        return {
          getProperty(key) { return state.properties.get(key) ?? null; },
          setProperty(key, value) { state.properties.set(key, String(value)); return this; },
        };
      },
    },
    LockService: {
      getScriptLock() {
        return {
          tryLock(ms) {
            assert.equal(ms, 10000);
            if (state.forceBusy || state.held) return false;
            state.held = true; return true;
          },
          releaseLock() { assert.ok(state.held); state.held = false; },
        };
      },
    },
    Utilities: {
      DigestAlgorithm: {SHA_256: 'SHA_256'},
      Charset: {UTF_8: 'UTF_8'},
      getUuid: randomUUID,
      computeDigest(algorithm, value, charset) {
        assert.equal(algorithm, 'SHA_256'); assert.equal(charset, 'UTF_8');
        return [...createHash('sha256').update(value).digest()];
      },
      newBlob(value) { return {getBytes() { return [...Buffer.from(value, 'utf8')]; }}; },
    },
    ContentService: {
      MimeType: {JSON: 'application/json'},
      createTextOutput(content) {
        return {setMimeType(mime) { assert.equal(mime, 'application/json'); return this; },
          getContent() { return content; }};
      },
    },
  };
  vm.createContext(sandbox);
  vm.runInContext(questionsCode + '\n' + code, sandbox, {filename: 'AppsScript.gs'});
  if (runSetup) sandbox.setup();
  function rpc(method, route, body = {}, token) {
    const raw = JSON.stringify({method, path: route, body, token});
    const output = sandbox.doPost({postData: {contents: raw, type: 'text/plain', length: Buffer.byteLength(raw)}});
    return JSON.parse(output.getContent());
  }
  function ok(method, route, body = {}, token) {
    const result = rpc(method, route, body, token);
    assert.equal(result.ok, true, JSON.stringify(result));
    return result.data;
  }
  function register({group = 'ปวช.1/1', student = randomUUID(), nickname = 'บิต', name = 'นักเรียน ทดสอบ'} = {}) {
    return ok('POST', '/api/register', {
      full_name: name, student_code: student, class_group: group, nickname, avatar_color: '#51D6E4',
    });
  }
  function answer(token, session, qid, correct = true, event = randomUUID()) {
    const question = questionsById[qid];
    const option = correct ? question.correct_option_id :
      question.options.find(o => o.id !== question.correct_option_id).id;
    return ok('POST', '/api/sessions/' + session + '/answers', {
      question_id: qid, option_id: option, event_id: event, active_seconds: 0,
    }, token);
  }
  function ack(token, session, qid, event = randomUUID()) {
    return ok('POST', '/api/sessions/' + session + '/ack', {
      question_id: qid, event_id: event, active_seconds: 0,
    }, token);
  }
  function complete(token, count = 12) {
    const {session} = ok('POST', '/api/sessions', {}, token);
    let result;
    for (let index = 0; index < session.questions.length; index++) {
      const qid = session.questions[index];
      answer(token, session.id, qid, index < count);
      result = ack(token, session.id, qid);
    }
    return result.session;
  }
  return {state, sandbox, rpc, ok, register, answer, ack, complete};
}


export {harness, questionsById};

# COM LAB RESCUE API สำหรับ Google Sheets

ระบบบันทึกออนไลน์ของเกมนี้ใช้ Google Apps Script และ Google Sheets เท่านั้น ตัวเกมเป็นเว็บ static ส่วน API อยู่ที่ Web app URL ของผู้สอน ไม่ต้องติดตั้งฐานข้อมูลหรือเก็บรหัสผ่านฐานข้อมูลในเกม

ไฟล์ backend คือ apps-script/Code.gs, Questions.gs และ appsscript.json วิธีติดตั้งจริงอยู่ใน [GOOGLE-SHEETS-SETUP.md](GOOGLE-SHEETS-SETUP.md)

## Transport

ทุกคำขอส่ง HTTP POST ไป URL ที่ลงท้าย /exec โดยใช้ Content-Type: text/plain;charset=utf-8 เพื่อไม่เพิ่ม custom headers ที่ทำให้เกิด preflight ส่วน method ภายใน JSON บอกชนิด API:

~~~json
{
  "method": "POST",
  "path": "/api/sessions/UUID/answers",
  "body": {
    "question_id": "s1_q01",
    "option_id": "b",
    "event_id": "UUID-ของการตอบครั้งนี้",
    "active_seconds": 15
  },
  "token": "TOKEN-ของผู้เล่น"
}
~~~

สำเร็จ:

~~~json
{"ok": true, "data": {"session": {}, "answer": {}}}
~~~

ผิดพลาด:

~~~json
{
  "ok": false,
  "error": {
    "code": "stage_locked",
    "status": 409,
    "message": "กรุณาทำภารกิจและอ่านคำอธิบายของด่านปัจจุบันให้ครบก่อน"
  }
}
~~~

Google ContentService ไม่ให้กำหนด HTTP status ของ TextOutput ในรูปแบบ API server ทั่วไป ดังนั้นต้องอ่าน ok และ error.status ใน JSON แม้ HTTP เป็น 200 ห้ามใช้ mode: no-cors เพราะจะอ่านผลตอบกลับไม่ได้

fetch ตัวอย่าง:

~~~js
async function rpc(scriptUrl, path, {method = 'GET', body = {}, token} = {}) {
  const response = await fetch(scriptUrl, {
    method: 'POST',
    headers: {'Content-Type': 'text/plain;charset=utf-8'},
    credentials: 'omit',
    redirect: 'follow',
    body: JSON.stringify({method, path, body, token})
  });
  const envelope = await response.json();
  if (!envelope.ok) {
    const error = new Error(envelope.error.message);
    error.code = envelope.error.code;
    error.status = envelope.error.status;
    throw error;
  }
  return envelope.data;
}
~~~

ContentService เปลี่ยนเส้นทางไป script.googleusercontent.com เพื่อส่งผลลัพธ์ client จึงต้องติดตาม redirect ตามปกติ และต้องตรวจสิทธิ์ deployment หากได้รับหน้า HTML เข้าสู่ระบบแทน JSON ดู [คู่มือ ContentService](https://developers.google.com/apps-script/guides/content)

ขนาด JSON request จำกัด 16 KiB token อยู่ใน body เท่านั้น ไม่ใส่ใน URL, query string หรือ log

## Logical endpoints

คอลัมน์ method หมายถึงค่าใน JSON envelope ไม่ใช่ HTTP method ของ fetch ซึ่งใช้ POST เสมอ

| method | path | token | ผลลัพธ์ |
| --- | --- | --- | --- |
| GET | /api/health | ไม่ต้อง | {ok:true, storage:"google-sheets", version:"1.0.0"} |
| POST | /api/register | ไม่ต้อง | {player, token} |
| GET | /api/me | ต้อง | {player} |
| POST | /api/sessions | ต้อง | {session, questions} |
| GET | /api/sessions/current | ต้อง | {session, questions} หรือ {session:null, questions:[]} |
| GET | /api/sessions/:id | ต้อง | {session, questions} ของผู้เล่นเจ้าของรอบ |
| POST | /api/sessions/:id/answers | ต้อง | {answer, session, replayed} |
| POST | /api/sessions/:id/ack | ต้อง | {session, replayed} |
| POST | /api/sessions/:id/checkpoint | ต้อง | {session} |
| POST | /api/sessions/:id/abandon | ต้อง | {session} |
| GET | /api/dashboard | ต้อง | สถิติและอันดับเฉพาะชั้น/กลุ่ม |

การเปิด /exec ด้วย HTTP GET โดยตรงรองรับเฉพาะ health check ไม่รับ token ผ่าน URL

## ลงทะเบียนและสิทธิ์

body ของ /api/register:

~~~json
{
  "full_name": "ชื่อ นามสกุล",
  "student_code": "000123",
  "class_group": "ปวช.1/1",
  "nickname": "บิต",
  "avatar_color": "#51D6E4"
}
~~~

ผล player มี id และ player_id ซึ่งมีค่าเดียวกัน รวมกับข้อมูลที่สมัครและ created_at เก็บรหัสผู้เรียนเป็นข้อความเพื่อรักษาเลขศูนย์นำหน้า สีรับค่า #RRGGBB รวมถึงสีทั้งสี่ที่มีในเกม

เซิร์ฟเวอร์ออก token สุ่มสอง UUID ต่อกันและบันทึกเฉพาะ SHA-256 hash ผู้เล่นใช้ token นี้อ่าน/เขียนเฉพาะข้อมูลตนเอง คู่ class_group + student_code ซ้ำจะตอบ recovery_required โดยไม่คืน token ของบัญชีเดิม การรู้รหัสนักเรียนอย่างเดียวไม่ใช่สิทธิ์เข้าใช้บัญชีนั้น

นี่เป็นการลงทะเบียนด้วยตนเองและ browser เดิม ยังไม่ใช่การตรวจตัวตนกับบัญชีสถาบัน การกู้บัญชีข้ามเครื่องต้องมีขั้นตอนของผู้สอนหรือระบบยืนยันตัวตนที่เพิ่มเติมอย่างเหมาะสม

## รอบการเล่น

POST /api/sessions body เป็น {} หากมีรอบที่กำลังเล่นอยู่จะคืนรอบเดิม จึงไม่สร้างรอบซ้ำเมื่อ client retry

Session fields:

| กลุ่ม | Fields |
| --- | --- |
| ตัวตน | id, session_id, player_id, schema_version, bank_version |
| คำถาม | questions (ID 12 ข้อ), option_orders |
| ความก้าวหน้า | current_stage (0–2), current_stage_id, completed_stages, answers |
| ผล | score, max_score, correct_count, wrong_count, badge, learning_result |
| เวลา | started_at, ended_at, last_seen_at, active_seconds, elapsed_seconds |
| สถานะ | status: in_progress / paused / completed / abandoned, revision |

questions ระดับบนของ response เป็นโจทย์พร้อมตัวเลือกที่จัดลำดับแล้ว ไม่มี correct_option_id หรือ explanation จนกว่าผู้เล่นจะตอบข้อนั้น

แต่ละด่านสุ่ม 4 ข้อ แยกเลือกตอบ/ถูก–ผิด × ง่าย/ปานกลางอย่างละหนึ่ง รวม 12 ข้อต่อรอบ เซิร์ฟเวอร์บันทึก snapshot ของคำถามและเฉลยที่ใช้จริง ทำให้รอบเดิมเล่นต่อได้แม้คลังคำถามถูกแก้ในรุ่นถัดไป

GET /api/sessions/current คืน null เมื่อไม่มีรอบค้าง รอบที่จบแล้วยังอ่านด้วย GET /api/sessions/:id ได้โดยเจ้าของ token เท่านั้น

## คำตอบแรกและการรับทราบ

body ของ /answers:

~~~json
{
  "question_id": "s1_q01",
  "option_id": "b",
  "event_id": "UUID-คงเดิมเมื่อส่งซ้ำ",
  "active_seconds": 15
}
~~~

answer ที่ได้มี question_id, option_id, is_correct, points, correct_option_id, explanation, answered_at, acknowledged และ acknowledged_at

คะแนนคิดจากเฉลยที่อยู่ใน Apps Script เท่านั้น ไม่รับ score หรือ is_correct จาก browser มาใช้ คำตอบต้องเป็นข้อที่สุ่มและอยู่ในด่านที่เปิดแล้ว

- ข้อเดิมและตัวเลือกเดิม: คืนคำตอบแรก โดยไม่บวกคะแนนเพิ่ม
- ข้อเดิมแต่เปลี่ยนตัวเลือก: immutable_answer
- event_id เดิมแต่เปลี่ยนชนิดการกระทำหรือข้อมูล: event_conflict
- ส่งคำตอบด่านถัดไปก่อนผ่านด่านเดิม: stage_locked

body ของ /ack:

~~~json
{"question_id": "s1_q01", "event_id": "UUID-อีกค่า", "active_seconds": 20}
~~~

ต้องตอบก่อนจึงรับทราบได้ รับทราบครบ 4 ข้อจะเปิดด่านถัดไป ครั้งที่ 12 ทำให้จบเกมอัตโนมัติและได้เหรียญ:

- 11–12 ข้อถูก: gold
- 9–10 ข้อถูก: silver
- 0–8 ข้อถูก: bronze เมื่อทำครบ
- อย่างน้อย 9 ข้อถูก: learning_result เป็น passed นอกนั้น needs_review

คะแนนข้อละ 10 รวม 120 คะแนน เฉพาะคำตอบแรก

## เวลา พัก และเริ่มใหม่

/checkpoint body: {active_seconds: 42, paused: true} โดย paused ไม่บังคับ เวลาเล่นต้องไม่ติดลบและไม่ลดจากค่าก่อนหน้า เซิร์ฟเวอร์จำกัดตามเวลาที่ผ่านจริงตั้งแต่เริ่มรอบพร้อมเผื่อ 2 วินาที สูงสุด 7 วัน

elapsed_seconds รวมเวลาที่ผ่านตั้งแต่เริ่มถึงจบ active_seconds ให้ frontend นับเฉพาะเวลาที่ไม่ได้พัก/ซ่อนแท็บ เวลาไม่ใช้เป็นคะแนนหรือใช้แยกอันดับเสมอ

/abandon body: {active_seconds: 42} หรือ {} เปลี่ยนรอบที่ยังไม่จบเป็น abandoned โดยเก็บประวัติไว้ จากนั้นเริ่มรอบใหม่ได้ รอบ completed เริ่มรอบใหม่ได้โดยไม่ต้อง abandon

## Dashboard

GET /api/dashboard หรือ /api/dashboard?page=1&page_size=1000

ผลมี source: google-sheets, scope: class, class_group, bank_version, total_players, completed_players, average_score, highest_score, lowest_score, leaderboard, page, page_size, total_pages, total_results และ partial

- จำนวนผู้เล่นนับผู้ที่เริ่มรอบอย่างน้อยหนึ่งครั้งในกลุ่มและรุ่นคำถามเดียวกัน
- คะแนนเฉลี่ย/สูงสุด/ต่ำสุดและอันดับใช้รอบที่จบดีที่สุดหนึ่งรอบต่อผู้เล่น
- คะแนนเท่ากันได้อันดับร่วม เช่น 1, 1, 3
- leaderboard มี rank, nickname, score, max_score, active_seconds, badge, is_me ไม่มีชื่อจริง รหัสผู้เรียน token หรือ UUID ผู้เล่น
- ค่าเริ่มต้นคืนได้สูงสุด 1,000 แถวเพื่อให้หน้าจอแบ่งครั้งละ 10 แถวเอง หากมากกว่านั้น partial เป็น true และ total_results บอกจำนวนจริง
- หากยังไม่มีรอบที่จบ คะแนนรวมต่าง ๆ เป็น null และรายการเป็น [] ไม่สร้างข้อมูลตัวอย่าง

## Google Sheets และความทนทานต่อการส่งซ้ำ

| แท็บ | เนื้อหา |
| --- | --- |
| players | ข้อมูลสมัครและ token hash |
| sessions | รอบ คำถามที่สุ่ม คะแนน ความก้าวหน้า เวลา และ snapshot |
| answers | คำตอบแรกและการรับทราบคำอธิบาย |
| events | event_id กับ hash ของการกระทำเพื่อรองรับ retry |

แต่ละแท็บมีคอลัมน์อ่านรายงานได้และ record_json ที่เก็บค่าต้นฉบับอย่างครบถ้วน การอ่านกลับใช้ record_json เพื่อคงชนิดข้อมูล รหัสที่มีเลขศูนย์นำหน้า และข้อความที่อาจขึ้นต้นเหมือนสูตร คอลัมน์แสดงผล escape ข้อความที่คล้ายสูตรก่อนเขียนลง Sheets

ทุกการเข้าถึง API ที่ใช้ชีตอยู่ใน ScriptLock และอ่าน/เขียนแต่ละช่วงด้วย getValues/setValues ไม่เขียนทีละเซลล์ Google Sheets ไม่มี SQL transaction ข้ามแท็บ: โค้ดถือ answers เป็นหลักและคำนวณ session ใหม่ได้ เมื่อเขียนคำตอบสำเร็จแต่เขียนยอดรวมขัดข้อง การ retry จึงไม่บวกคะแนนซ้ำและซ่อมยอดรวมจากคำตอบที่บันทึกแล้ว

อย่าแก้ record_json หรือย้ายเฉพาะบางคอลัมน์ของแถวโดยตรงหากต้องการรักษาข้อมูลเกม การ export/report ควรทำในชีตสำเนาหรือแท็บรายงานแยก

## ออฟไลน์

รอบออนไลน์ต้องเริ่มด้วยชุดคำถามที่เซิร์ฟเวอร์ออกให้ เมื่อเน็ตหลุด client เก็บคำตอบ/ack ตามลำดับและ event_id เดิม ก่อนส่งใหม่เมื่อเชื่อมต่อได้ ผลยังเป็นรอซิงก์จนเซิร์ฟเวอร์ยืนยันครบ

รอบที่เริ่มในโหมดฝึกในเครื่องจะยังเป็นผลในเครื่อง ไม่รับการนำเข้าคะแนนรวม client เป็นผลออนไลน์ ก่อนใช้บันทึกส่งงานให้เชื่อม Google Sheets แล้วเปลี่ยนผู้เล่น/เริ่มรอบออนไลน์ใหม่ตามข้อความในเกม

## ทดสอบ

~~~bash
npm run test:apps-script
~~~

tests/apps-script-test.mjs จำลอง SpreadsheetApp, PropertiesService, LockService, Utilities และ ContentService ทดสอบตรรกะจริงใน Code.gs รวมถึง partial-write recovery โดยไม่เรียกบัญชี Google หรือเครือข่าย ผลนี้ไม่ได้ยืนยันสิทธิ์ deployment, CORS, โควตา หรือการเขียนชีตจริง ต้องตรวจขั้นตอน live ในคู่มือหลังติดตั้ง

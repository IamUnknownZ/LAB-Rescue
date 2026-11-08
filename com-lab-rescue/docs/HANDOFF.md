# COM LAB RESCUE — ส่งต่องานและเชื่อมระบบจริง

## สถานะของชิ้นงาน

เกมเป็นเว็บไฟล์เดียวที่สร้างจาก source หลายไฟล์ ใช้ Three.js และธีม Neo Brutalist ภาษาไทย มีโหมดฝึกบนเครื่อง และเตรียมโค้ดออนไลน์สำหรับ **Google Apps Script + Google Sheets** ไว้แยกชัดเจน

สิ่งที่ยังต้องทำในบัญชีของผู้สอนคือสร้าง Google Sheet, ติดตั้งโค้ด Apps Script, อนุญาตสิทธิ์, Deploy Web app และใส่ URL /exec ในเกม ขั้นตอนนี้ต้องดำเนินการด้วยบัญชี Google ที่จะเป็นเจ้าของข้อมูลจริง จึงไม่มี deployment หรือข้อมูลเชื่อมต่อที่ตั้งไว้ล่วงหน้า

## 1. ขอบเขตที่ส่งให้

| ส่วน | สิ่งที่อยู่ใน source |
| --- | --- |
| ภาพเกม | ฉากห้องคอม Three.js หุ่นยนต์เปลี่ยนสี 3 สถานี ระบบคลิก/แตะและ DOM ทางเลือก |
| หน้าจอ | เริ่มต้น ลงทะเบียน วิธีเล่น เกม สรุปผล ทบทวนคำตอบ และ Dashboard |
| กติกา | คลัง 18 ข้อ สุ่ม 12 ข้อต่อรอบ 3 ด่าน 2 รูปแบบ 2 ความยาก คะแนน เหรียญ และการปลดล็อก |
| ข้อมูลในเครื่อง | Checkpoint, ชุดคำถามเดิม, ลำดับตัวเลือก, ประวัติ และ export JSON |
| การเชื่อมออนไลน์ | URL ของ Apps Script, health check, คิวส่งซ้ำ, ตรวจสิทธิ์และคำนวณคะแนนฝั่ง backend |
| Backend | Apps Script source, คลังคำถามฝั่ง server และ manifest |
| คู่มือ | วิธีตั้ง Google Sheets/API, การแก้ source, ข้อจำกัดและวิธีทดสอบก่อนใช้จริง |

ไฟล์ COM-LAB-RESCUE.html และ dist/index.html เป็น output จาก build ไม่ควรแก้เฉพาะไฟล์ output แล้วปล่อย source ไม่ตรงกัน

## 2. แผนที่ไฟล์

| พาธ | เจ้าของหน้าที่ |
| --- | --- |
| src/app.js | UI, navigation, form, dialog, timer presentation, audio และ settings |
| src/scene.js | รูปทรง 3D, กล้อง, หุ่นยนต์, raycast, repair animation และ fallback |
| src/store.js | State, scoring, question selection, save/load, outbox และ Google transport |
| src/style.css | CSS tokens, Neo Brutalist components และ responsive layout |
| src/template.html | เอกสาร HTML และโครง UI ส่วนกลาง |
| data/question-bank.json | คำถามสำหรับตัวเกมฝึก |
| config.json | ค่า Google Apps Script URL ที่ฝังตอน build |
| apps-script/Code.gs | จุดรับคำขอและการอ่าน/เขียน Google Sheets |
| apps-script/Questions.gs | คลังคำถามและเฉลยฝั่ง Apps Script |
| apps-script/appsscript.json | Manifest ของ Apps Script |
| scripts/build.mjs | รวม bundle, CSS และฟอนต์เป็น HTML เดี่ยว |
| scripts/serve.py | Static server สำหรับ dist เท่านั้น |
| tests/store-test.mjs | ตรวจ state/save/score/queue ของ frontend |
| tests/apps-script-test.mjs | ตรวจ Apps Script ด้วย Google services จำลองใน Node |
| tests/store-apps-script-test.mjs | ตรวจ store กับโค้ด Apps Script จริงผ่านบริการ Google จำลอง |
| tests/apps-script-harness.mjs | Google services จำลองที่ใช้ร่วมกันในการทดสอบ |
| docs/API.md | ข้อตกลงคำขอ ผลตอบกลับ และ validation ของ backend |
| docs/GOOGLE-SHEETS-SETUP.md | ขั้นตอนติดตั้งและ deploy ด้วยบัญชีผู้สอน |
| DESIGN.md / UX-CONTRACT.md | ภาพและพฤติกรรม UI ที่ควรรักษาเมื่อแก้ต่อ |
| vendor/ | Three.js, ฟอนต์ และใบอนุญาต |

## 3. ส่วนที่ต้องตั้งค่าภายนอก

### เจ้าของ Google Sheet

ผู้สอนหรือผู้ดูแลที่รับผิดชอบข้อมูลเป็นผู้สร้างชีตและ Apps Script ดูรายละเอียดใน [GOOGLE-SHEETS-SETUP.md](GOOGLE-SHEETS-SETUP.md) และใช้โค้ดจาก apps-script โดยไม่ต้องส่งรหัสผ่าน Google ให้ผู้พัฒนา

เก็บชีตเป็นส่วนตัวและให้สิทธิ์เฉพาะผู้สอนที่ต้องเข้าถึงข้อมูล การเข้าถึง Web app เป็นคนละเรื่องกับการแชร์ Google Sheet

### Web app URL

ใช้ URL deployment ของ Apps Script ที่ลงท้าย /exec ไม่ใช่หน้าแก้ไข script ไม่ใช่ลิงก์ Google Sheet และไม่ใช่ /dev

ตั้งผ่านเกมได้ที่ **การตั้งค่า → เชื่อม Google Sheets ของผู้สอน → ตรวจสอบและบันทึก** หรือแก้ config.json แล้ว build ใหม่ ค่า endpoint ในเบราว์เซอร์มีลำดับความสำคัญเหนือค่าใน bundle

หลังเชื่อมจากโหมดฝึก ให้เก็บผลเดิมแล้วเปลี่ยนผู้เล่นเพื่อเริ่มรอบออนไลน์ ผลที่เคยเริ่มในเครื่องไม่ถูกนำไปสร้างคะแนนยืนยันบนชีตย้อนหลังอัตโนมัติ

### นโยบายบัญชีโรงเรียน

รูปแบบ RPC จากเว็บ static ต้องเข้าถึง Web app ได้โดยไม่ติดหน้า login/consent คั่นระหว่าง fetch หากบัญชี Google Workspace ของโรงเรียนไม่อนุญาตการเข้าถึงแบบ Anyone ให้ผู้ดูแลเลือกและอนุมัติแนวทางยืนยันตัวตนที่องค์กรใช้ แล้วปรับ transport/deployment ให้ตรงก่อนใช้โหมดออนไลน์ ไม่ต้องเปลี่ยน Google Sheet เป็นสาธารณะเพื่อแก้ปัญหานี้

### ลิงก์เกมสำหรับส่งงาน

ไม่มี public hosting URL ที่ Deploy ไว้ในชุดนี้ หากต้องการให้ผู้เรียนเปิดด้วยลิงก์ ให้นำ dist/index.html ไปวางบน static hosting แบบ HTTPS ที่ผู้สอนเลือก แล้วทดสอบกับ /exec URL จริงจากอุปกรณ์ผู้เรียน

การรัน npm run dev หรือ python3 scripts/serve.py เป็นการเปิดทดสอบเครื่องที่รันคำสั่ง ไม่ใช่บริการโฮสต์ถาวรหรือฐานข้อมูล

## 4. วิธีส่งต่อให้ผู้พัฒนา

1. ติดตั้ง Node.js 22 ขึ้นไป แล้วรัน npm ci และ npm run build
2. เปิดเกมด้วย COM-LAB-RESCUE.html หรือ static server ที่ให้
3. ตรวจ config.json และค่า endpoint ที่บันทึกในเบราว์เซอร์
4. ติดตั้ง Apps Script ตามคู่มือ Google แล้วทดสอบ health และการลงทะเบียน
5. เล่นหนึ่งรอบจริง จากนั้นตรวจข้อมูลผู้เล่น รอบการเล่น และคำตอบในชีต
6. ทดสอบคำตอบผิด ปิด–เปิดหน้า เน็ตขาดระหว่างรอบ และการส่งซ้ำ
7. ทดสอบมือถือและลิงก์ HTTPS ที่จะส่งให้อาจารย์หรือผู้เรียน

ดู request/response และ action names ที่ [API.md](API.md) เป็นแหล่งอ้างอิงหลัก อย่าสร้าง endpoint แบบ REST อีกชุดแทน Apps Script RPC

## 5. กติกาข้อมูลที่ต้องรักษา

- คิดคะแนนจากคำตอบแรกเท่านั้น เฉลยและคะแนนฝั่ง Apps Script เป็นผู้ตรวจผลออนไลน์
- เก็บ question IDs และ option order ของรอบเดิมเพื่อเล่นต่อได้ถูกชุด
- ยืนยันตัวตนของผู้เล่นผ่าน token ของรอบ/โปรไฟล์ ไม่ใช้รหัสนักเรียนเพียงอย่างเดียวเพื่อเปิดข้อมูลคนอื่น
- คำตอบที่ส่งซ้ำต้องไม่สร้างคะแนนหรือแถวคำตอบซ้ำ
- การข้ามด่านและคำตอบที่ไม่อยู่ในชุดสุ่มต้องถูกปฏิเสธ
- บันทึกเวลาเล่นจริงแยกจากเวลาปฏิทินที่ผ่านไป
- ใช้คะแนนดีที่สุดจากรอบที่จบและระบบยืนยันแล้วต่อผู้เล่นหนึ่งคนในชั้น/รุ่นคลังเดียวกัน
- อันดับแสดงชื่อเล่น การดูชื่อจริงและรหัสผู้เรียนให้อยู่ในสิทธิ์ของผู้สอน
- โหมดฝึกต้องติดป้ายว่าเป็นข้อมูลในอุปกรณ์นี้ ไม่ใช้แทนสถิติทั้งชั้น
- รักษา event IDs ของ outbox เมื่อ retry และส่งตามลำดับ

ตัวเกมบรรจุเฉลยไว้เพื่อเล่นออฟไลน์ จึงไม่ใช่ระบบสอบที่ปิดบังข้อสอบหรือป้องกันการเปิดอ่านเฉลย การตรวจคะแนนฝั่ง server ช่วยตรวจความถูกต้องของข้อมูลที่รับ แต่ไม่ได้ทำให้เฉลยในไฟล์ HTML เป็นความลับ

## 6. การแก้คำถามและหน้าตา

แก้คำถามใน data/question-bank.json และปรับ Questions.gs ให้ตรงกัน โดยรักษาเงื่อนไขด่านละ 6 ข้อและการมีคำถามครบทั้งสี่กลุ่ม: เลือกตอบง่าย เลือกตอบปานกลาง ถูก–ผิดง่าย ถูก–ผิดปานกลาง ทุกครั้งที่แก้คำถาม ตัวเลือก เฉลย คำอธิบาย ประเภท ระดับความยาก หรือคะแนน ต้องเพิ่ม bank_version ให้ตรงกันทั้งสองไฟล์แล้ว build HTML ใหม่

เก็บ HTML รุ่นเดิมไว้สำหรับผู้เรียนที่ยังมีรอบไม่จบหรือมีข้อมูลรอส่ง เพราะ snapshot ที่ Apps Script เก็บไว้ต้องใช้คู่กับคลังคำถามใน HTML รุ่นเดียวกันเพื่อเล่นต่อออฟไลน์ ตัวเกมตรวจ bank_version และเนื้อหาคำถามที่ API เปิดเผยก่อนรับรอบมาเล่น หากไม่ตรงจะหยุดโดยเก็บ checkpoint เดิมและให้ส่งออกได้ ไม่เขียนทับผลค้างด้วยรอบใหม่ ให้กลับไปเปิด HTML รุ่นเดิมใน browser เดิมเพื่อจบและส่งข้อมูล เมื่อรอบเก่าจบหรือยุติและไม่มีคิวค้างแล้ว รุ่นใหม่จะเก็บผลเก่าเป็นประวัติ คงโปรไฟล์เดิม และเริ่มรอบชุดใหม่ได้ สถิติไม่รวมคะแนนข้ามรุ่นคลัง

การเปลี่ยนเฉพาะเฉลยหรือคำอธิบายตรวจจากคำถามสาธารณะไม่ได้ เพราะ API ไม่แนบเฉลยทั้งหมดมาก่อนตอบ จึงต้องรักษากฎเพิ่ม bank_version ทุกครั้งที่แก้ส่วนนี้ด้วย ก่อนเปลี่ยนชุดสำหรับทั้งชั้น ควรให้รอบที่กำลังเล่นจบและส่งข้อมูลครบก่อน

แก้ธีมผ่าน CSS variables ใน src/style.css โดยใช้ DESIGN.md เป็นคู่มือ และรักษา UX-CONTRACT.md เมื่อเปลี่ยนการนำทาง การบันทึก หรือความหมายของปุ่ม

Three.js ใช้ไฟล์ที่เก็บไว้ใน vendor เวอร์ชัน 0.186.1 การอัปเกรดควรอัปเดต module/core เป็นคู่และทดสอบ build กับฉากจริง ไม่อัปเดตเพียงไฟล์เดียว

## 7. Asset และใบอนุญาต

| ส่วน | แหล่งและใบอนุญาต |
| --- | --- |
| ห้อง หุ่นยนต์ อุปกรณ์ ป้าย | รูปทรงและ CanvasTexture ที่เขียนขึ้นสำหรับเกมนี้ใน src/scene.js |
| เสียงตอบกลับ | สังเคราะห์จากโค้ดใน browser หลังผู้เล่นมีปฏิสัมพันธ์ |
| Three.js 0.186.1 | MIT; เก็บ vendor/THREE-LICENSE.txt ไว้ |
| Noto Sans Thai | SIL Open Font License; เก็บ vendor/fonts/OFL.txt ไว้ |
| esbuild | เครื่องมือ build ไม่จำเป็นต้องติดตั้งเพื่อเล่น output; dependency ระบุใน package-lock.json |

รุ่นนี้ไม่ได้ใช้โมเดล Kenney แม้จะเคยเป็นแหล่งตัวเลือกในแผน จึงไม่มี asset ภายนอกที่ต้องดาวน์โหลดเพิ่มตอนเล่น หากเพิ่มโมเดลภายหลัง ให้เก็บ license และแหล่งที่มาไปพร้อม source

## 8. การตรวจสอบก่อนส่งมอบ

<!-- RELEASE_VALIDATION_START -->
ตรวจ release วันที่ 8 พฤศจิกายน 2026:

| รายการ | สถานะ/หลักฐาน |
| --- | --- |
| Static server | ผ่าน 9 HTTP scenarios: GET/HEAD, security header, traversal, symlink escape, source/API hiding และ POST rejection |
| DESIGN.md | ผ่าน designmd lint: 0 errors, 0 warnings; CSS token หลักตรงกับเอกสาร |
| npm run build | ผ่าน สร้าง HTML เดี่ยวประมาณ 0.85 MiB รวม Three.js ฟอนต์และใบอนุญาต |
| npm run test:store | ผ่าน 18 tests |
| npm run test:apps-script | ผ่าน 16 tests โดยจำลอง Google services |
| npm run test:integration | ผ่าน 7 tests ใช้โค้ด store และ Apps Script จริง จำลองเฉพาะ platform/network |
| npm test | ผ่านรวม 41/41 ไม่มี fail หรือ skip |
| Browser desktop complete flow | เล่นครบ 3 ด่าน ได้ 110/120 จากถูก 11 ผิด 1; ผล เหรียญ คำแนะนำ และ Dashboard ตรงกัน |
| Browser narrow layout | ตรวจหน้าเริ่ม ลงทะเบียน Dashboard และคำถามที่ความกว้าง CSS 454 px ผ่าน zoom 300%; ไม่มี horizontal overflow |
| Reload/resume and duplicate answers | Browser กลับมาข้อเดิมหลังตอบก่อนกดซ่อมได้ คำตอบถูกล็อก; ชุดทดสอบยืนยัน retry ไม่บวกคะแนนซ้ำ |
| ภาพฉากสำรอง | ตรวจ SVG ห้องคอมมุมเฉียงใน browser แล้ว; agent ตรวจ XML และ 8 state/input cases |
| ฉาก WebGL จริง | สภาพแวดล้อมทดสอบปิด WebGL จึงยังไม่ได้ตรวจภาพ/ประสิทธิภาพ GPU จริง; เกมเล่นได้ด้วย fallback |
| Static interaction audit | มี 5 false positives จาก data-action delegation; ตรวจปุ่มจริงครบแล้ว ดู QA.md และ audit-static.json |
| Google authorization / deployed Web app | ยังไม่ได้ทำกับบัญชีของผู้สอน ต้องทำตาม GOOGLE-SHEETS-SETUP.md |
| Real Sheet writes / quota / concurrent classroom use | ต้องตรวจบนบัญชีปลายทางและจำนวนผู้เรียนจริง |

รายละเอียดอยู่ใน [QA.md](QA.md)
<!-- RELEASE_VALIDATION_END -->

ไม่ควรอ้างผล mock tests ว่าเชื่อม Google สำเร็จแล้ว การทดสอบบัญชีจริงต้องครอบคลุมสิทธิ์ Web app, redirect ของ ContentService, การอ่าน JSON จาก browser, การเขียนแถวจริง และการตอบพร้อมกันหลายผู้เล่น

## 9. ปัญหาที่อาจพบตอนตั้งค่า

| อาการ | ตรวจอะไร |
| --- | --- |
| เปิดเกมได้ แต่มีเฉพาะข้อมูลในเครื่อง | ยังไม่ได้ตั้ง endpoint หรือยังใช้รอบฝึกที่เริ่มก่อนเชื่อม |
| ทดสอบเชื่อมต่อไม่ได้ | URL ลงท้าย /exec, เวอร์ชัน deployment, สิทธิ์เข้าถึง และนโยบายบัญชี |
| ได้หน้า HTML แทนผล API | อาจเป็นหน้า login/consent หรือใช้ URL หน้าแก้ไขแทน Web app |
| แก้ Apps Script แล้วพฤติกรรมไม่เปลี่ยน | อัปเดต deployment ให้เป็นเวอร์ชันใหม่ตามคู่มือ |
| เปลี่ยนเครื่องแล้วไม่พบรอบเดิม | รุ่นนี้เน้นกลับมาใช้ browser เดิม; cross-device recovery ต้องทำตามระบบยืนยันตัวตนของผู้สอน |
| เน็ตกลับมาแต่ยังมีคิวค้าง | เปิดสถานะบันทึกและส่งอีกครั้ง ตรวจ error และเก็บ export ก่อนเปลี่ยนผู้เล่น |
| ฉาก 3D แสดงไม่ได้ | เกมมีฉากแบบเบาและปุ่มสถานีให้ทำกิจกรรมต่อ ลองเปลี่ยน browser/โหมดภาพเมื่อสะดวก |
| คะแนนใน Dashboard ไม่เพิ่มทุกรอบ | ใช้รอบดีที่สุดต่อผู้เล่น ไม่รวมทุก attempt เป็นผู้เล่นใหม่ |


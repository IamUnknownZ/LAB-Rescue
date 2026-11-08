import { createLab } from './scene.js';
import { GameStore } from './store.js';
import bank from '../data/question-bank.json';

const main = document.querySelector('#main');
const dialog = document.querySelector('#dialog');
const dialogContent = document.querySelector('#dialog-content');
const sceneHost = document.createElement('div');
sceneHost.className = 'scene-host';
sceneHost.setAttribute('aria-label', 'ห้องคอมสามมิติ มีสถานีซ่อมสามจุด');
const stages = [
  { title: 'ต่ออุปกรณ์', subtitle: 'รู้จักอุปกรณ์รับข้อมูลและแสดงผล', objective: 'เลือกสถานี 1 แล้วต่ออุปกรณ์ให้ถูกหน้าที่', color: '#FBE34A', repair: 'ต่ออุปกรณ์', learn: 'ทบทวนการรับข้อมูล เช่น แป้นพิมพ์และไมโครโฟน กับการแสดงผล เช่น จอภาพและลำโพง' },
  { title: 'ซ่อมเครื่องหลัก', subtitle: 'ทำความรู้จัก CPU, RAM และ SSD', objective: 'เลือกสถานี 2 เพื่อซ่อมหัวใจของเครื่องคอม', color: '#51D6E4', repair: 'ติดตั้งชิ้นส่วน', learn: 'ทบทวน CPU ที่ประมวลผล RAM ที่เก็บข้อมูลชั่วคราว และ SSD ที่เก็บไฟล์หลังปิดเครื่อง' },
  { title: 'เปิดห้องอย่างปลอดภัย', subtitle: 'บันทึกงานและปกป้องบัญชีของเรา', objective: 'เลือกสถานี 3 แล้วเปิดระบบอย่างปลอดภัย', color: '#FF91BB', repair: 'ตรวจระบบ', learn: 'ฝึกบันทึกงานเป็นระยะ ใช้รหัสผ่านต่างกัน และตรวจสอบลิงก์ผ่านช่องทางที่เชื่อถือได้' }
];
const colors = ['#51D6E4', '#FBE34A', '#FF91BB', '#C8F36A'];
const colorNames = ['ฟ้า', 'เหลือง', 'ชมพู', 'เขียว'];
const icons = {
  arrow: '<path d="M4 12h15M13 5l7 7-7 7"/>',
  play: '<path d="m8 4 12 8-12 8z"/>',
  pause: '<path d="M8 4v16M16 4v16"/>',
  check: '<path d="m4 12 5 5L20 6"/>',
  close: '<path d="m6 6 12 12M18 6 6 18"/>',
  bolt: '<path d="m14 2-9 12h7l-2 8 9-12h-7z"/>',
  download: '<path d="M12 3v12m-5-5 5 5 5-5M4 17v4h16v-4"/>',
  trophy: '<path d="M7 3h10v5a5 5 0 0 1-10 0zM7 5H3v3c0 3 3 4 5 4m9-7h4v3c0 3-3 4-5 4M12 13v7m-5 1h10"/>'
};
function icon(name) { return '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true">' + (icons[name] || icons.bolt) + '</svg>'; }
function esc(value) { return String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function number(value) { return new Intl.NumberFormat('th-TH', {maximumFractionDigits:1}).format(value || 0); }
function time(value) { const n = Math.max(0, Math.floor(value || 0)); return Math.floor(n/60).toString().padStart(2,'0') + ':' + (n%60).toString().padStart(2,'0'); }
function safeRead(key, fallback) { try { return JSON.parse(localStorage.getItem(key)) || fallback; } catch { return fallback; } }
let prefs = safeRead('com-lab-rescue:prefs', {sound:true, quality:'high'});
let starting = false;
let route = 'home', activeQuestion = null, busy = false, dashboardPage = 1, dashboard = null, registrationColor = colors[0], resultSession = null;
let store, lab, audioContext, toastTimer, dialogResolver, focusBeforeDialog;
store = new GameStore(() => { if (store) { updateStatus(); updateHud(); } });
function state() { return store.state; }
function currentSession() { return resultSession || state().session; }
function answeredCount(s) { return Object.values(s?.answers || {}).filter(a => a.acknowledged).length; }
function completion(s) { return [0,1,2].map(i => (s?.questions || []).slice(i*4,i*4+4).filter(id => s.answers?.[id]?.acknowledged).length); }
function questionById(id) { return state().questions?.find(q => q.id === id) || bank.questions.find(q => q.id === id); }
function nextQuestion(s) { return (s?.questions || []).find(id => !s.answers?.[id]?.acknowledged); }
function screenTitle(text) {
  const title = text + ' — COM LAB RESCUE';
  if (document.title !== title) { document.title = title; window.scrollTo(0, 0); }
}
function announce(text) { const t = document.querySelector('#toast'); t.textContent = text; t.hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(() => t.hidden = true, 3600); }
function playSound(type = 'tap') {
  if (!prefs.sound) return;
  try {
    audioContext ||= new (window.AudioContext || window.webkitAudioContext)();
    audioContext.resume().catch(() => {});
    const notes = type === 'success' ? [523,659,784] : type === 'wrong' ? [220,165] : type === 'finish' ? [523,659,784,1046] : [440];
    notes.forEach((f,i) => { const osc=audioContext.createOscillator(), gain=audioContext.createGain(), t=audioContext.currentTime+i*.09;
      osc.type='triangle'; osc.frequency.value=f; gain.gain.setValueAtTime(0,t); gain.gain.linearRampToValueAtTime(.045,t+.01); gain.gain.exponentialRampToValueAtTime(.001,t+.16);
      osc.connect(gain); gain.connect(audioContext.destination); osc.start(t); osc.stop(t+.18); });
  } catch {}
}
function robotSVG(color = colors[0]) {
  return '<svg viewBox="0 0 130 130" aria-hidden="true"><path d="M65 18V6" stroke="#171717" stroke-width="5"/><circle cx="65" cy="7" r="5" fill="#FBE34A" stroke="#171717" stroke-width="3"/><rect x="21" y="24" width="88" height="64" rx="11" fill="'+esc(color)+'" stroke="#171717" stroke-width="5"/><rect x="31" y="37" width="68" height="37" rx="6" fill="#171717"/><rect x="42" y="48" width="10" height="12" rx="2" fill="#FFFDF5"/><rect x="77" y="48" width="10" height="12" rx="2" fill="#FFFDF5"/><path d="M56 65h18" stroke="#FFFDF5" stroke-width="3"/><rect x="33" y="89" width="64" height="26" rx="3" fill="#FFFDF5" stroke="#171717" stroke-width="5"/><rect x="24" y="106" width="22" height="17" rx="4" fill="#171717"/><rect x="84" y="106" width="22" height="17" rx="4" fill="#171717"/><path d="M20 51H8v31M110 51h12v31" fill="none" stroke="#171717" stroke-width="6"/><circle cx="66" cy="102" r="5" fill="#FBE34A" stroke="#171717" stroke-width="2"/></svg>';
}
function medalSVG(badge) {
  const fill = badge === 'gold' ? '#FBE34A' : badge === 'silver' ? '#51D6E4' : '#FF91BB';
  return '<svg class="medal-art" viewBox="0 0 120 140" aria-hidden="true"><path d="m31 80-8 54 32-20 5-35m29 1 8 54-32-20-5-35" fill="#51D6E4" stroke="#171717" stroke-width="4"/><path d="m60 5 12 9 15-1 7 14 14 7-1 15 9 12-9 12 1 15-14 7-7 14-15-1-12 9-12-9-15 1-7-14-14-7 1-15-9-12 9-12-1-15 14-7 7-14 15 1z" fill="'+fill+'" stroke="#171717" stroke-width="4"/><circle cx="60" cy="61" r="31" fill="#FFFDF5" stroke="#171717" stroke-width="3"/><path d="m60 39 7 14 16 3-12 11 3 16-14-8-14 8 3-16-12-11 16-3z" fill="'+fill+'" stroke="#171717" stroke-width="3"/></svg>';
}
function shellHTML(extraClass = '', sticker = true) {
  return '<div class="scene-shell '+extraClass+'"><div class="scene-topline"><span>BIT’S COMPUTER LAB</span><span class="window-dots"><i></i><i></i><i></i></span></div>' +
    (sticker ? '<span class="scene-sticker">ช่างคอมตัวจิ๋ว<br>ภารกิจใหญ่!</span>' : '') +
    '<div class="scene-area" id="scene-slot"></div><div class="scene-bottomline"><span>ห้องคอมพร้อมให้คุณมาซ่อม</span><span>01 / 02 / 03</span></div></div>';
}
function mountScene() {
  const slot = document.querySelector('#scene-slot');
  if (!slot) return;
  slot.appendChild(sceneHost);
  if (!lab) {
    lab = createLab(sceneHost, {onStation: index => activateStation(index), onError: () => announce('แสดงฉากแบบประหยัด คุณยังเล่นภารกิจได้ครบ')});
    lab.setQuality(prefs.quality);
  }
  applyScene();
  requestAnimationFrame(() => lab.resize());
}
function applyScene() {
  if (!lab) return;
  const s = state().session;
  lab.setState({stage:s?.current_stage || 0, completed:completion(s), active:route==='play' && !activeQuestion && !dialog.open && !busy, mode:route==='play'?'play':route==='results'?'results':'home', color:state().profile?.avatar_color || registrationColor});
}
function updateStatus() {
  const el = document.querySelector('#sync-indicator');
  if (!el || !store) return;
  const s = state();
  let label = ({local:'บันทึกในเครื่องนี้',saved:'บันทึกใน Google Sheets แล้ว',pending:'รอส่งข้อมูล '+(s.pendingCount||0)+' รายการ',offline:'ออฟไลน์ · เก็บไว้รอส่ง',error:'บันทึกไม่สำเร็จ · ดูรายละเอียด'})[s.syncStatus] || 'บันทึกในเครื่องนี้';
  if (!s.profile && s.mode==='server' && s.connectionAvailable===true) label = 'เชื่อม Google Sheets พร้อมแล้ว';
  if (s.error && s.syncStatus !== 'offline') label = 'ตรวจสอบการบันทึก';
  el.textContent = label; el.dataset.status = s.error?'error':s.syncStatus;
}
function updateHud() {
  const s=state().session;
  const timer=document.querySelector('#game-time'); if(timer) timer.textContent=time(s?.active_seconds);
  const score=document.querySelector('#game-score'); if(score) score.textContent=s?.score||0;
}
function home() {
  route='home'; resultSession=null; activeQuestion=null; screenTitle('ภารกิจกู้ห้องคอม');
  const s=state().session, resume=s && s.status==='in_progress', profile=state().profile;
  main.innerHTML='<section class="home"><div class="home-copy"><div class="eyebrow eyebrow-label"><i class="tiny-square"></i> LEARN. REPAIR. REBOOT.</div><h1 class="hero-title">COM LAB<br><span class="highlight">RESCUE.</span></h1><h2 class="hero-thai">กู้ห้องคอมให้กลับมามีชีวิต!</h2><p class="hero-desc">สวมบทช่างคอมตัวจิ๋ว ช่วย Bit ต่ออุปกรณ์ ซ่อมเครื่อง และเปิดระบบอย่างปลอดภัย<br>เรียนรู้ไปพร้อมกับลงมือซ่อมทีละจุด</p><div class="hero-actions"><button class="btn btn-primary btn-lg" data-action="'+(resume?'resume':profile?'start':'register')+'">'+icon('play')+(resume?'เล่นภารกิจต่อ':'เริ่มภารกิจ')+icon('arrow')+'</button><button class="btn btn-lg" data-action="help">วิธีเล่น</button></div><div class="hero-note">'+icon('check')+(profile?'ช่าง '+esc(profile.nickname)+' พร้อมแล้ว':'เล่นได้ทั้งคอมและมือถือ · ไม่จำกัดเวลา')+'</div><div class="hero-stats"><div><strong>03</strong><span>ด่านซ่อมห้องคอม</span></div><div><strong>12</strong><span>กิจกรรมต่อรอบ</span></div><div><strong>120</strong><span>คะแนนเต็ม</span></div></div>'+(profile?'<div style="margin-top:16px"><button class="back-btn" data-action="switch-player">เปลี่ยนผู้เล่น</button>'+(s?.status==='completed'?' · <button class="back-btn" data-action="results">ดูผลรอบล่าสุด</button>':'')+'</div>':'')+'</div><div class="home-visual">'+shellHTML()+'<div class="stage-strips">'+stages.map((st,i)=>'<div class="stage-strip"><b>0'+(i+1)+'</b><span>'+st.title+'</span></div>').join('')+'</div></div></section>';
  mountScene(); updateStatus();
}
function registration() {
  route='register'; screenTitle('ลงทะเบียนช่างคอม'); applyScene();
  main.innerHTML='<section class="page registration"><div class="registration-intro"><button class="back-btn" data-action="home">← กลับหน้าหลัก</button><h1>ช่างคนใหม่<br>รายงานตัว!</h1><p>บอก Bit ว่าคุณชื่ออะไร<br>แล้วมาช่วยกันเปิดห้องคอมให้สำเร็จ</p><div class="robot-card"><div class="robot-avatar" id="registration-robot">'+robotSVG(registrationColor)+'</div><p class="robot-caption">“ยินดีต้อนรับเข้าทีม!” — Bit</p></div></div><form id="registration-form" class="panel" novalidate><div class="panel-head"><h2>บัตรประจำตัวช่าง</h2><span class="eyebrow">PLAYER ID</span></div><div class="panel-body"><div id="registration-error" role="alert"></div>'+field('full_name','ชื่อ–นามสกุล','ชื่อและนามสกุลของคุณ','name')+'<div class="field-row">'+field('student_code','รหัสนักเรียน / นักศึกษา','เช่น 6601234567','off')+field('class_group','ชั้น / กลุ่มเรียน','เช่น ม.1/1 หรือ CED 3','off')+'</div>'+field('nickname','ชื่อเล่นในเกม','เช่น มงคล หรือ ช่างบิท','nickname')+'<fieldset class="fieldset"><legend>เลือกสีหุ่นยนต์ของคุณ</legend><div class="color-picker">'+colors.map((c,i)=>'<button type="button" class="color-btn" style="background:'+c+'" data-action="color" data-color="'+c+'" aria-label="หุ่นยนต์สี'+colorNames[i]+'" aria-pressed="'+(c===registrationColor)+'"></button>').join('')+'</div></fieldset><p class="form-note">ชื่อเล่นจะแสดงในอันดับ ส่วนชื่อจริงและรหัสผู้เรียนใช้บันทึกผลการเรียนของคุณ<br>'+ (state().mode==='server'?'รอบนี้จะบันทึกลง Google Sheets ของผู้สอน':'รอบนี้บันทึกบนอุปกรณ์นี้ สามารถดาวน์โหลดผลเก็บไว้ได้') +'</p><button class="btn btn-primary btn-wide btn-lg" type="submit" id="register-submit">รับภารกิจ '+icon('arrow')+'</button></div></form></section>';
  document.querySelector('#registration-form').addEventListener('submit', registerSubmit);
}
function field(id,label,placeholder,autocomplete) {
  return '<div class="field"><label for="'+id+'">'+label+' <span aria-hidden="true">*</span></label><input id="'+id+'" name="'+id+'" required maxlength="'+(id==='full_name'?100:50)+'" autocomplete="'+autocomplete+'" placeholder="'+placeholder+'" aria-describedby="'+id+'-error"><div id="'+id+'-error" class="field-error"></div></div>';
}
async function registerSubmit(e) {
  e.preventDefault(); if(busy)return;
  const data=Object.fromEntries(new FormData(e.currentTarget)); let first;
  for(const name of ['full_name','student_code','class_group','nickname']){
    const input=document.getElementById(name), valid=Boolean(String(data[name]||'').trim());
    input.setAttribute('aria-invalid',String(!valid)); document.getElementById(name+'-error').textContent=valid?'':'กรุณากรอก'+({full_name:'ชื่อ–นามสกุล',student_code:'รหัสผู้เรียน',class_group:'ชั้นหรือกลุ่มเรียน',nickname:'ชื่อเล่น'})[name];
    if(!valid&&!first)first=input; data[name]=String(data[name]||'').trim();
  }
  if(first){first.focus();return;}
  busy=true; const btn=document.querySelector('#register-submit');btn.disabled=true;btn.setAttribute('aria-busy','true');
  try { await store.register({...data,avatar_color:registrationColor}); await begin(); }
  catch(err){document.querySelector('#registration-error').innerHTML='<p class="form-error">'+esc(err.message||'ลงทะเบียนไม่สำเร็จ กรุณาลองอีกครั้ง')+'</p>';}
  finally {busy=false;applyScene();if(document.body.contains(btn)){btn.disabled=false;btn.removeAttribute('aria-busy');}}
}
async function begin() {
  if(starting)return;starting=true;
  try { await store.start(); activeQuestion=null; resultSession=null; play(); playSound('tap'); }
  catch(err){announce(err.message||'เริ่มเกมไม่ได้ กรุณาตรวจสอบการบันทึก');}
  finally {starting=false;applyScene();}
}
function play() {
  if(!state().profile){registration();return;}
  if(!state().session){begin();return;}
  if(state().session.status==='completed'){results();return;}
  route='play'; screenTitle('กำลังซ่อมห้องคอม');
  const s=state().session, stage=stages[s.current_stage||0], done=answeredCount(s);
  if(activeQuestion && s.answers?.[activeQuestion]?.acknowledged) activeQuestion=nextQuestion(s);
  main.innerHTML='<section class="play-page"><div class="play-hud"><div class="mission-heading"><span class="mission-number" style="background:'+stage.color+'">0'+((s.current_stage||0)+1)+'</span><div><h1>'+stage.title+'</h1><p>ช่าง '+esc(state().profile.nickname)+' · '+stage.subtitle+'</p></div></div><div class="hud-stats"><span class="score-block">'+icon('bolt')+'<strong id="game-score">'+s.score+'</strong><small>/120</small></span><span id="game-time" class="hud-time">'+time(s.active_seconds)+'</span><button class="icon-btn" data-action="pause" aria-label="พักเกม">'+icon('pause')+'</button></div></div><div class="play-layout '+(activeQuestion?'with-question':'')+'"><div><div class="scene-shell"><div class="quest-objective">'+icon('bolt')+'<span>'+(activeQuestion?'เลือกคำตอบ แล้วลงมือซ่อมจุดนี้':stage.objective)+'</span></div><div class="scene-area" id="scene-slot"></div></div><div class="station-nav">'+stages.map((st,i)=>'<button class="station-btn '+(i<s.current_stage?'done':i===s.current_stage?'current':'')+'" data-action="station" data-stage="'+i+'" '+(i!==s.current_stage||Boolean(activeQuestion)?'disabled':'')+'><span class="stage-num">'+(i<s.current_stage?'✓':'0'+(i+1))+'</span><span><strong>'+st.title+'</strong><small>'+completion(s)[i]+'/4 จุดซ่อม'+(i>s.current_stage?' · ยังล็อก':'')+'</small></span></button>').join('')+'</div><div class="progress-row"><span>ห้องคอมกลับมาทำงานแล้ว</span><span>'+done+' / 12 จุด</span></div><div class="progress-track" role="progressbar" aria-label="ความก้าวหน้าทั้งเกม" aria-valuenow="'+done+'" aria-valuemin="0" aria-valuemax="12"><div class="progress-fill" style="width:'+(done/12*100)+'%"></div></div></div>'+(activeQuestion?questionHTML(activeQuestion):'')+'</div></section>';
  mountScene(); updateStatus();
}
function questionHTML(id) {
  const s=state().session,q=questionById(id); if(!q)return '';
  const answer=s.answers?.[id], localIndex=s.questions.indexOf(id)%4;
  const order=s.option_orders?.[id]||q.options.map(o=>o.id);
  const opts=order.map(o=>q.options.find(a=>a.id===o)).filter(Boolean);
  return '<aside class="question-panel" id="question-panel" aria-labelledby="question-title"><div class="question-head"><span>ภารกิจซ่อม '+(localIndex+1)+' / 4</span><span>+10 คะแนน</span></div><div class="question-body"><div class="question-meta"><span class="tag '+(q.difficulty==='medium'?'tag-medium':'')+'">'+(q.difficulty==='easy'?'ระดับง่าย · รู้จัก':'ระดับปานกลาง · ลองใช้')+'</span><span class="question-dots" aria-hidden="true">'+[0,1,2,3].map(i=>'<i class="'+(i<localIndex?'filled':'')+'"></i>').join('')+'</span></div><h2 class="question-title" id="question-title" tabindex="-1">'+esc(q.prompt)+'</h2><div class="answers '+(q.type==='true_false'?'tf':'')+'">'+opts.map((o,i)=>{
    const selected=answer?.option_id===o.id,correct=Boolean(answer)&&o.id===answer.correct_option_id;
    const cls=answer?(correct?'correct':selected?'incorrect':'other'):'';
    const letter=q.type==='true_false'?(o.id==='true'?'✓':'✕'):String.fromCharCode(65+i);
    return '<button class="answer-btn '+cls+'" data-action="answer" data-option="'+esc(o.id)+'" '+(answer||busy?'disabled':'')+'><span class="answer-letter" aria-hidden="true">'+letter+'</span><span>'+esc(o.label)+(answer?(correct?' ✓':selected?' ✕':''):'')+'</span></button>';
  }).join('')+'</div>'+(answer?'<div class="feedback '+(!answer.is_correct?'wrong':'')+'" role="status"><h3>'+(answer.is_correct?'ถูกต้อง! ได้ 10 คะแนน':'ยังไม่ถูก ลองเรียนรู้ไปด้วยกัน')+'</h3>'+(!answer.is_correct?'<p class="correct-label">คำตอบ: '+esc(q.options.find(o=>o.id===answer.correct_option_id)?.label)+'</p>':'')+'<p>'+esc(answer.explanation||q.explanation)+'</p></div><button class="btn btn-wide '+(answer.is_correct?'btn-lime':'btn-cyan')+' question-next" data-action="ack">'+(answer.is_correct?stages[s.current_stage].repair:'ทำตามคำแนะนำแล้วซ่อมต่อ')+icon('arrow')+'</button>':'<p class="question-hint">คิดคะแนนจากคำตอบแรก · ไม่จำกัดเวลา</p>')+'</div></aside>';
}
async function activateStation(index) {
  if(route!=='play'||busy||dialog.open||index!==state().session?.current_stage||activeQuestion)return;
  busy=true; applyScene();playSound();
  try {if(lab)await lab.moveToStation(index);if(route==='play'){busy=false;activeQuestion=nextQuestion(state().session);play();focusQuestion();}}
  finally {busy=false;applyScene();}
}
function focusQuestion() {
  requestAnimationFrame(()=>{const title=document.querySelector('#question-title');title?.focus({preventScroll:true}); if(innerWidth<761)document.querySelector('#question-panel')?.scrollIntoView({behavior:matchMedia('(prefers-reduced-motion:reduce)').matches?'auto':'smooth',block:'start'});});
}
async function answer(option) {
  if(busy||!activeQuestion)return;busy=true;
  try {const result=await store.answer(activeQuestion,option);playSound(result.is_correct?'success':'wrong');}
  catch(err){announce(err.message);}
  finally {busy=false;play();}
}
async function acknowledge() {
  if(busy||!activeQuestion)return;busy=true;
  const oldStage=state().session.current_stage;
  try {
    await store.acknowledge(activeQuestion);busy=false;lab?.celebrate(oldStage);
    const s=state().session;
    if(s.status==='completed'){activeQuestion=null;results();playSound('finish');}
    else if(s.current_stage!==oldStage){
      activeQuestion=null;play();playSound('finish');
      const correct=s.questions.slice(oldStage*4,oldStage*4+4).filter(id=>s.answers[id]?.is_correct).length;
      openDialog('สถานี '+(oldStage+1)+' พร้อมทำงาน!', '<div class="celebrate-text">REPAIRED!</div><p style="text-align:center">คุณช่วย Bit ทำภารกิจ «'+stages[oldStage].title+'» สำเร็จแล้ว</p><div class="mini-stage-score"><span>ตอบถูก '+correct+'/4</span><span>+'+(correct*10)+' คะแนน</span></div><button class="btn btn-primary btn-wide" data-action="close-dialog">ไปสถานีถัดไป '+icon('arrow')+'</button>');
    } else {activeQuestion=nextQuestion(s);play();focusQuestion();}
  } catch(err){announce(err.message);}
  finally {busy=false;applyScene();}
}
function results(session) {
  resultSession=session||state().session;
  const s=currentSession(); if(!s||s.status!=='completed'){home();return;}
  route='results';activeQuestion=null;screenTitle('ผลภารกิจกู้ห้องคอม');applyScene();
  const badge=s.badge||s.badge_id||'bronze', names={gold:'ผู้เชี่ยวชาญห้องคอม',silver:'นักแก้ปัญหาห้องคอม',bronze:'ช่างคอมผู้เริ่มต้น'}, passed=s.correct_count>=9;
  const suggestions=stages.filter((st,i)=>s.questions.slice(i*4,i*4+4).some(id=>!s.answers[id]?.is_correct));
  main.innerHTML='<section class="result-page"><div class="result-title">'+medalSVG(badge)+'<div><span class="eyebrow">MISSION COMPLETE</span><h1>ห้องคอมกลับมาแล้ว!</h1><p>ขอบคุณช่าง '+esc(state().profile?.nickname||'Bit')+' · '+esc(state().profile?.full_name||'')+'</p><span class="result-badge">'+names[badge]+'</span></div></div><div class="result-grid"><div class="score-poster"><h2>คะแนนภารกิจของคุณ</h2><div class="big-score">'+s.score+'<small> / 120</small></div><span class="result-badge">'+number(s.score/120*100)+'% · '+(passed?'ผ่านเกณฑ์ความรู้':'ฝึกอีกนิด แล้วลองใหม่ได้')+'</span><div class="score-details"><div><strong>'+s.correct_count+'</strong><span>ตอบถูก</span></div><div><strong>'+s.wrong_count+'</strong><span>ตอบผิด</span></div><div><strong>'+time(s.active_seconds)+'</strong><span>เวลาเล่นจริง</span></div></div></div><div class="panel"><div class="panel-head"><h2>รายงานการซ่อม</h2><span>3 / 3 ด่าน</span></div><div class="result-breakdown">'+stages.map((st,i)=>{const count=s.questions.slice(i*4,i*4+4).filter(id=>s.answers[id]?.is_correct).length;return '<div class="breakdown-row"><div class="breakdown-label"><span>0'+(i+1)+' '+st.title+'</span><span>'+count+'/4</span></div><div class="progress-track"><div class="progress-fill" style="width:'+(count*25)+'%;background:'+st.color+'"></div></div></div>';}).join('')+'<p class="context-note">เกณฑ์ผ่าน: ตอบถูกอย่างน้อย 9 ข้อ (75%)<br>เหรียญทองแดงให้จากการทำภารกิจครบ</p></div></div></div><div class="recommendations"><h2>'+icon('bolt')+' '+(suggestions.length?'ฝึกอีกนิด เก่งขึ้นแน่นอน':'เยี่ยมมาก! คุณรู้จักห้องคอมดีแล้ว')+'</h2>'+ (suggestions.length?suggestions.map(st=>'<p>• '+st.learn+'</p>').join(''):'<p>ลองอธิบายหน้าที่อุปกรณ์ให้เพื่อนฟัง แล้วเล่นอีกรอบเพื่อเจอคำถามชุดใหม่</p>')+'</div><div class="result-actions"><button class="btn btn-primary" data-action="restart">'+icon('play')+'เล่นอีกรอบ</button><button class="btn" data-action="review">ทบทวนคำตอบ</button><button class="btn" data-action="dashboard">'+icon('trophy')+'ดูอันดับ</button><button class="btn" data-action="export">'+icon('download')+'เก็บผลการเล่น</button></div><button class="back-btn" data-action="home">← กลับหน้าหลัก</button></section>';
  updateStatus();
}
async function showDashboard(page=1) {
  route='dashboard';dashboardPage=page;screenTitle('สถิติผู้เล่น');applyScene();
  main.innerHTML='<section class="page"><button class="back-btn" data-action="home">← กลับหน้าหลัก</button><div class="loading-screen" role="status"><h1>กำลังรวบรวมผลการเล่น…</h1><p>ตรวจสอบคะแนนและอันดับของกลุ่มเรียน</p></div></section>';
  try {
    dashboard=await store.getDashboard();
    if(route!=='dashboard')return;
    renderDashboard();
  } catch(err) {if(route==='dashboard')main.innerHTML='<section class="page"><button class="back-btn" data-action="home">← กลับหน้าหลัก</button><div class="panel empty-state"><h1>ยังเปิดสถิติไม่ได้</h1><p>'+esc(err.message)+'</p><button class="btn btn-primary" data-action="dashboard">ลองอีกครั้ง</button></div></section>';}
}
function renderDashboard() {
  const d=dashboard||{},rows=d.leaderboard||[],pageSize=10,pages=Math.max(1,Math.ceil(rows.length/pageSize));
  dashboardPage=Math.min(Math.max(1,dashboardPage),pages);
  const shown=rows.slice((dashboardPage-1)*pageSize,dashboardPage*pageSize),local=d.source!=='server';
  const stat=value=>value===null||value===undefined?'—':number(value);
  main.innerHTML='<section class="page"><button class="back-btn" data-action="home">← กลับหน้าหลัก</button><div class="page-heading"><div><span class="eyebrow">REPAIR CREW / SCOREBOARD</span><h1>ทีมช่างคอมของเรา</h1><p>'+ (local?'ผลที่บันทึกบนอุปกรณ์นี้':('ผลจาก Google Sheets · กลุ่ม '+esc(state().profile?.class_group||'')))+'</p></div><button class="btn btn-small" data-action="dashboard">อัปเดตข้อมูล</button></div>'+(d.source==='device-cache'?'<div class="status-message">เชื่อมต่อออนไลน์ไม่ได้ กำลังแสดงเฉพาะผลที่มีในอุปกรณ์นี้</div>':d.source==='server'&&d.partial?'<div class="status-message">แสดง '+rows.length+' จาก '+number(d.total_results||rows.length)+' อันดับ · สถิติคำนวณจากทั้งกลุ่ม</div>':'')+'<div class="dashboard-stats">'+[['ผู้เล่นทั้งหมด',d.total_players||0],['คะแนนเฉลี่ย /120',d.average_score],['คะแนนสูงสุด /120',d.highest_score],['คะแนนต่ำสุด /120',d.lowest_score]].map(([label,value])=>'<div class="stat-card"><span>'+label+'</span><strong>'+stat(value)+'</strong></div>').join('')+'</div><div class="panel"><div class="panel-head"><h2>อันดับช่างคอม</h2><span class="tag">รอบที่ดีที่สุดต่อคน</span></div>'+(rows.length?'<div class="table-wrap"><table><caption class="sr-only">อันดับตามคะแนนสูงสุดต่อผู้เล่น คะแนนเท่ากันได้อันดับร่วม</caption><thead><tr><th scope="col">อันดับ</th><th scope="col">ชื่อเล่น</th><th scope="col">คะแนน</th><th scope="col">เวลาเล่นจริง</th><th scope="col">เหรียญ</th></tr></thead><tbody>'+shown.map((r,i)=>'<tr><td><span class="rank-badge '+((r.rank||i+1)===1?'first':'')+'">'+(r.rank||i+1)+'</span></td><td>'+esc(r.nickname)+'</td><td><strong>'+r.score+'</strong> /120</td><td>'+time(r.active_seconds)+'</td><td>'+({gold:'ทอง',silver:'เงิน',bronze:'ทองแดง'}[r.badge||r.badge_id]||'—')+'</td></tr>').join('')+'</tbody></table></div><div class="pagination"><span>หน้า '+dashboardPage+' / '+pages+' · '+rows.length+' ผลการเล่น</span><div><button class="btn btn-small btn-plain" data-action="page-prev" '+(dashboardPage===1?'disabled':'')+'>ก่อนหน้า</button><button class="btn btn-small btn-plain" data-action="page-next" '+(dashboardPage===pages?'disabled':'')+'>ถัดไป</button></div></div>':'<div class="empty-state">'+icon('trophy')+'<h2>ตำแหน่งแรกกำลังรอคุณอยู่</h2><p>ทำภารกิจครบ 3 ด่าน แล้วคะแนนจะปรากฏที่นี่</p><button class="btn btn-primary" data-action="'+(state().profile?'start':'register')+'">เริ่มซ่อมห้องคอม '+icon('arrow')+'</button></div>')+'</div><p class="context-note">นับเฉพาะรอบที่เล่นจบ คะแนนเท่ากันได้อันดับร่วม เวลาแสดงเพื่อการเรียนรู้ ไม่ใช้ตัดสินอันดับ</p></section>';
}
function openDialog(title,body) {
  if(dialog.open)closeDialog(false);
  focusBeforeDialog=document.activeElement;
  dialogContent.innerHTML='<div class="dialog-head"><h2 id="dialog-title">'+title+'</h2><button class="icon-btn" data-action="close-dialog" aria-label="ปิดหน้าต่าง">'+icon('close')+'</button></div><div class="dialog-body">'+body+'</div>';
  dialog.showModal();applyScene();
}
function closeDialog(value=false) {
  if(!dialog.open)return;
  const resolve=dialogResolver;dialogResolver=null;dialog.close();resolve?.(value);
  if(focusBeforeDialog?.isConnected)focusBeforeDialog.focus({preventScroll:true});
  applyScene();
}
function ask(title,message,label) {
  openDialog(title,'<p>'+message+'</p><div class="dialog-actions"><button class="btn" data-action="close-dialog" autofocus>ยกเลิก</button><button class="btn btn-pink" data-action="confirm-yes">'+label+'</button></div>');
  return new Promise(resolve=>dialogResolver=resolve);
}
function help() {
  openDialog('คู่มือช่างคอมตัวจิ๋ว',[
    ['01','เลือกจุดซ่อม','คลิกสถานีในห้อง หรือใช้ปุ่มชื่อสถานีใต้ฉาก มือถือแตะได้เหมือนกัน'],
    ['02','คิด แล้วลงมือ','ตอบคำถามเลือกตอบหรือถูก–ผิด จากนั้นอ่านคำอธิบายและกดซ่อมจุดนั้น'],
    ['03','เปิดห้องให้สำเร็จ','ทำครบด่านละ 4 จุด รวม 12 จุด แล้วรับเหรียญและดูผลการเรียนรู้']
  ].map(([n,t,p])=>'<div class="help-step"><strong>'+n+'</strong><div><h3>'+t+'</h3><p>'+p+'</p></div></div>').join('')+'<div class="help-rules">ตอบถูกครั้งแรก +10 คะแนน · รวม 120 คะแนน<br>ผ่านเกณฑ์ 9/12 ข้อ · ไม่มีเวลานับถอยหลัง<br>ทอง 11–12 ข้อ / เงิน 9–10 / ทองแดงเมื่อทำครบ<br>ใช้ Tab และ Enter เพื่อเลือกปุ่มได้ทุกขั้นตอน</div><div class="dialog-actions"><button class="btn btn-primary btn-wide" data-action="close-dialog">เข้าใจแล้ว '+icon('check')+'</button></div>');
}
function pause() {store.save();openDialog('พักก่อน เดี๋ยวค่อยมาซ่อม','<p>ความคืบหน้าถูกเก็บไว้แล้ว เวลาเล่นหยุดระหว่างพัก</p><div class="setting-actions"><button class="btn btn-primary" data-action="close-dialog">'+icon('play')+'กลับไปเล่นต่อ</button><button class="btn" data-action="paused-home">กลับหน้าหลัก</button><button class="btn btn-plain" data-action="restart">เริ่มรอบใหม่</button></div>');}
function settings() {
  openDialog('ตั้งค่าให้เล่นสบาย','<div class="setting-row"><div><strong>เสียงเอฟเฟกต์</strong><p>เสียงตอบคำถามและซ่อมสำเร็จ</p></div><button class="switch" data-action="toggle-sound" aria-label="เปิดเสียงเอฟเฟกต์" aria-pressed="'+prefs.sound+'"><span></span></button></div><div class="setting-row"><div><strong>ภาพสามมิติ</strong><p>โหมดประหยัดช่วยให้เครื่องเบาทำงานลื่นขึ้น</p></div><button class="btn btn-small" data-action="toggle-quality">'+(prefs.quality==='low'?'โหมดประหยัด':'ภาพปกติ')+'</button></div><div class="setting-actions"><button class="btn btn-cyan" data-action="google-setup">เชื่อม Google Sheets ของผู้สอน</button><button class="btn" data-action="export">'+icon('download')+'ดาวน์โหลดข้อมูลการเล่น</button>'+(state().profile?'<button class="btn btn-plain" data-action="switch-player">เปลี่ยนผู้เล่น</button>':'')+'</div><p class="context-note">ความคืบหน้าในเครื่องผูกกับเบราว์เซอร์นี้ โปรดเก็บผลก่อนล้างข้อมูลเว็บไซต์</p>');
}
function endpointValue() {try{return localStorage.getItem('com-lab-rescue:google-script-url')??window.COM_LAB_CONFIG?.googleScriptUrl??'';}catch{return window.COM_LAB_CONFIG?.googleScriptUrl||'';}}
function googleSetup() {
  openDialog('เชื่อม Google Sheets','<p>สำหรับผู้สอน: นำ URL Web app จาก Apps Script ที่เตรียมไว้มาใส่ แล้วตรวจสอบการเชื่อมต่อ</p><form id="google-form" novalidate><div class="field"><label for="google-url">URL ของ Apps Script</label><input id="google-url" type="url" inputmode="url" autocomplete="off" value="'+esc(endpointValue())+'" placeholder="https://script.google.com/macros/s/…/exec" aria-describedby="google-error"><div class="field-error" id="google-error"></div></div><p class="form-note">ใช้ URL ที่ลงท้าย /exec และตั้ง Web app ให้ผู้เรียนเข้าถึงได้ ชีตไม่ต้องเปิดเป็นสาธารณะ<br>รอบฝึกที่เริ่มไว้ในเครื่องจะยังเป็นผลในเครื่อง เมื่อเชื่อมสำเร็จให้เปลี่ยนผู้เล่นเพื่อเริ่มบันทึกออนไลน์</p><button type="submit" class="btn btn-primary btn-wide" id="google-submit">ตรวจสอบและบันทึก</button><div id="google-message" role="status"></div></form>'+(endpointValue()?'<button class="back-btn" data-action="disconnect-google">กลับไปใช้โหมดฝึกในเครื่อง</button>':''));
  document.querySelector('#google-form').addEventListener('submit',async e=>{
    e.preventDefault();if(busy)return;
    const input=document.querySelector('#google-url'),url=input.value.trim(),msg=document.querySelector('#google-error'),btn=document.querySelector('#google-submit'),status=document.querySelector('#google-message');
    if(!/^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]+\/exec$/.test(url)){msg.textContent='ใช้ URL Web app ของ Google Apps Script ที่ลงท้าย /exec';input.setAttribute('aria-invalid','true');input.focus();return;}
    input.removeAttribute('aria-invalid');
    busy=true;btn.disabled=true;btn.setAttribute('aria-busy','true');msg.textContent='';status.textContent='กำลังทดสอบการเชื่อมต่อ…';
    try{await store.connectGoogle(url);status.innerHTML='<p class="help-rules" style="margin-top:16px">เชื่อมต่อสำเร็จ! '+(state().profile?'เปลี่ยนผู้เล่นเพื่อเริ่มรอบที่บันทึกออนไลน์':'ลงทะเบียนผู้เล่นเพื่อเริ่มบันทึกออนไลน์')+'</p>';if(!status.isConnected)announce('ตรวจสอบการเชื่อม Google Sheets สำเร็จแล้ว');updateStatus();}
    catch(err){msg.textContent=err.message||'เชื่อมต่อไม่ได้ ตรวจสอบ URL และสิทธิ์ Web app';status.textContent='';if(input.isConnected)input.focus();}
    finally{busy=false;if(btn.isConnected){btn.disabled=false;btn.removeAttribute('aria-busy');}}
  });
}
function review() {
  const s=currentSession();if(!s)return;
  openDialog('ทบทวนสิ่งที่ได้เรียนรู้','<div class="review-list">'+s.questions.map((id,i)=>{const q=questionById(id),a=s.answers[id];return '<article class="review-item"><h3>'+(i+1)+'. '+esc(q.prompt)+'</h3><p>'+ (a?.is_correct?'✓ ตอบถูก':'✕ ตอบผิด') +' · '+(a?.points||0)+' คะแนน</p><p class="review-answer">คำตอบ: '+esc(q.options.find(o=>o.id===(a?.correct_option_id||q.correct_option_id))?.label)+'</p><p>'+esc(a?.explanation||q.explanation)+'</p></article>';}).join('')+'</div><div class="dialog-actions"><button class="btn btn-primary btn-wide" data-action="close-dialog">กลับไปดูผล</button></div>');
}
function downloadResults() {
  const data=store.exportData(),blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'});
  const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='com-lab-rescue-results-'+new Date().toISOString().slice(0,10)+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);announce('ดาวน์โหลดผลการเล่นแล้ว');
}
async function restart() {
  closeDialog();
  if(state().session?.status==='in_progress'){
    if(!await ask('เริ่มภารกิจรอบใหม่?','รอบที่กำลังเล่นจะสิ้นสุดลง แล้วเริ่มสุ่มคำถามชุดใหม่ คะแนนรอบที่เล่นจบแล้วจะยังอยู่','เริ่มรอบใหม่'))return;
  }
  try {await store.abandon();activeQuestion=null;resultSession=null;await begin();}catch(err){announce(err.message);}
}
async function switchPlayer() {
  closeDialog();
  if(!state().profile){registration();return;}
  const ok=await ask('เปลี่ยนผู้เล่น?','การเปลี่ยนผู้เล่นจะออกจากตัวตนปัจจุบัน จึงกลับมาเล่นรอบเดิมต่อจากหน้านี้ไม่ได้ โปรดเล่นให้จบและส่งข้อมูลก่อน ผลที่บันทึกสำเร็จและประวัติในเครื่องยังอยู่','เปลี่ยนผู้เล่น');
  if(!ok)return;
  try {await store.signOut();resultSession=null;activeQuestion=null;registration();}
  catch(err){announce(err.message);}
}
document.addEventListener('click',async event=>{
  const button=event.target.closest('[data-action]');if(!button||button.disabled)return;
  const action=button.dataset.action;
  try {
    if(action==='home'){if(dialog.open)closeDialog();store.save();home();}
    else if(action==='register')registration();
    else if(action==='start')await begin();
    else if(action==='resume'){activeQuestion=null;play();}
    else if(action==='help')help();
    else if(action==='settings')settings();
    else if(action==='station')await activateStation(Number(button.dataset.stage));
    else if(action==='answer')await answer(button.dataset.option);
    else if(action==='ack')await acknowledge();
    else if(action==='pause')pause();
    else if(action==='paused-home'){closeDialog();store.save();home();}
    else if(action==='close-dialog')closeDialog();
    else if(action==='confirm-yes')closeDialog(true);
    else if(action==='dashboard'){if(dialog.open)closeDialog();await showDashboard();}
    else if(action==='page-prev'){dashboardPage--;renderDashboard();}
    else if(action==='page-next'){dashboardPage++;renderDashboard();}
    else if(action==='results')results();
    else if(action==='review')review();
    else if(action==='restart')await restart();
    else if(action==='export')downloadResults();
    else if(action==='switch-player')await switchPlayer();
    else if(action==='color'){
      registrationColor=button.dataset.color;
      document.querySelectorAll('.color-btn').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.color===registrationColor)));
      document.querySelector('#registration-robot').innerHTML=robotSVG(registrationColor);
    }
    else if(action==='toggle-sound'){prefs.sound=!prefs.sound;try{localStorage.setItem('com-lab-rescue:prefs',JSON.stringify(prefs));}catch{}settings();playSound();}
    else if(action==='toggle-quality'){prefs.quality=prefs.quality==='low'?'high':'low';lab?.setQuality(prefs.quality);try{localStorage.setItem('com-lab-rescue:prefs',JSON.stringify(prefs));}catch{}settings();}
    else if(action==='google-setup')googleSetup();
    else if(action==='disconnect-google'){
      if(await ask('ใช้โหมดฝึกในเครื่อง?','รอบออนไลน์ที่ยังรอส่งควรส่งให้สำเร็จก่อน รอบใหม่หลังเปลี่ยนผู้เล่นจะเก็บในอุปกรณ์นี้','ใช้โหมดฝึก')){
        await store.connectGoogle('');announce('ตั้งค่าโหมดฝึกในเครื่องแล้ว');settings();
      }
    }
    else if(action==='sync'){
      openDialog('สถานะการบันทึก','<p>'+esc(state().error||document.querySelector('#sync-indicator').textContent)+'</p><p class="context-note">'+(state().mode==='server'?'ข้อมูลที่รอส่งจะเก็บไว้ในเครื่องและส่งตามลำดับเมื่อเชื่อมต่อได้':'ผลที่เก็บในเครื่องนี้ยังไม่ใช่ข้อมูลรวมของชั้นเรียน')+'</p><div class="dialog-actions">'+(state().mode==='server'?'<button class="btn btn-primary" data-action="retry-sync">ส่งข้อมูลอีกครั้ง</button>':'<button class="btn btn-cyan" data-action="google-setup">เชื่อม Google Sheets</button>')+'<button class="btn" data-action="export">เก็บข้อมูลเป็นไฟล์</button></div>');
    }
    else if(action==='retry-sync'){closeDialog();await store.sync();announce(state().pendingCount?'ยังมีข้อมูลรอส่ง':'ตรวจสอบการส่งข้อมูลแล้ว');}
  }catch(err){announce(err.message||'ทำรายการไม่สำเร็จ ลองอีกครั้งได้');}
});
dialog.addEventListener('cancel',e=>{e.preventDefault();closeDialog();});
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!dialog.open&&route==='play'&&!e.isComposing)pause();});
document.addEventListener('visibilitychange',()=>{if(document.hidden)store.save();else store.sync().catch(()=>{});});
window.addEventListener('online',()=>store.sync().catch(()=>{}));
window.addEventListener('pagehide',()=>store.save());
window.addEventListener('storage',e=>{
  if(e.key==='com-lab-rescue:v1'&&route==='play'&&!document.hidden&&!dialog.open){
    openDialog('พบการเล่นจากอีกแท็บ','<p>เพื่อให้คะแนนและความคืบหน้าตรงกัน กรุณาเล่นเพียงแท็บเดียว แล้วโหลดข้อมูลล่าสุดก่อนเล่นต่อ</p><button class="btn btn-primary" id="reload-game">โหลดความคืบหน้าล่าสุด</button>');
    document.querySelector('#reload-game').addEventListener('click',()=>location.reload());
  }
});
let ticks=0;
setInterval(()=>{
  if(route==='play'&&!dialog.open&&!document.hidden&&state().session?.status==='in_progress'){store.tick(1);updateHud();ticks++;if(ticks%15===0)store.save();if(ticks%60===0)store.sync().catch(()=>{});}
},1000);
home();
store.init().then(()=>{updateStatus();if(route==='home')home();}).catch(err=>{announce(err.message||'เริ่มในโหมดฝึกบนเครื่อง');home();});


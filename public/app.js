// app.js — ExamOnline front-end
// หน้าตา/โครงหน้า/โทเค็นสี = Stitch (DESIGN.md + code.html), การทำงาน = ระบบเดิมของ examonline
// (auth จริง, ตรวจข้อสอบฝั่งเซิร์ฟเวอร์, รูปภาพ, นำเข้าไฟล์ด้วย AI, ห้องสอบสด Socket.IO)
'use strict';
const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const L = 'กขคงจฉชซ';
const CATS = ['ทั่วไป', 'ภาษาไทย', 'ภาษาอังกฤษ', 'คณิตศาสตร์', 'วิทยาศาสตร์', 'สังคมศึกษา', 'คอมพิวเตอร์/เทคโนโลยี', 'สุขศึกษาและพลศึกษา', 'ศิลปะ', 'ภาษาต่างประเทศอื่นๆ'];

// ---------- UI atoms (ตามชุดคอมโพเนนต์ใน DESIGN.md) ----------
const FOCUS = 'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2563EB]';
const BASE = `inline-flex items-center justify-center gap-1.5 h-11 px-4 rounded-lg font-label-lg text-label-lg transition-colors disabled:opacity-40 disabled:cursor-default ${FOCUS}`;
const BTN = {
  pri: `${BASE} bg-primary text-on-primary hover:bg-primary-container`,
  sec: `${BASE} bg-transparent border border-[#CBD5E1] text-on-surface hover:bg-[#F1F5F9]`,
  warn: `${BASE} bg-[#FEF3C7] text-[#92400E] border border-[#FDE68A] hover:bg-[#FDE68A]/60`,
  del: `${BASE} bg-transparent border border-error-container text-error hover:bg-error-container/40`,
};
const SM = '!h-8 !px-3 !text-label-md';
const ic = (n, cls = '') => `<span class="material-symbols-outlined ${cls}" aria-hidden="true">${n}</span>`;
const btn = (k, label, attrs = '', icon = '', sm = false) => `<button type="button" class="${BTN[k]} ${sm ? SM : ''}" ${attrs}>${icon ? ic(icon, '!text-[18px]') : ''}${label}</button>`;
const CARD = 'rounded-xl bg-surface-container-lowest border border-[#E2E8F0] shadow-sm';
const INP = `w-full h-11 px-3 rounded-lg border border-[#CBD5E1] bg-surface-container-lowest text-body-md focus:outline-none focus:border-primary-container focus:ring-4 focus:ring-[#2563EB]/15`;
const INPA = INP.replace('h-11 ', 'py-2 ');
const LBL = 'block font-label-md text-label-md text-on-surface-variant mb-1 mt-3';
const WARNBOX = 'rounded-lg bg-[#FEF3C7] text-[#92400E] border border-[#FDE68A] px-4 py-3 font-body-sm text-body-sm';
const OKBOX = 'rounded-lg bg-secondary-container/50 text-on-secondary-container px-4 py-3 font-body-sm text-body-sm';
const BADBOX = 'rounded-lg bg-error-container text-on-error-container px-4 py-3 font-body-sm text-body-sm';
const H2 = 'font-headline-lg-mobile text-headline-lg-mobile md:font-headline-lg md:text-headline-lg text-on-surface';

// ---------- API client ----------
let token = localStorage.getItem('examonline.token') || localStorage.getItem('examhub.token') || null;
async function api(p, opt = {}) {
  const h = {}; let body = opt.body;
  if (body && !(body instanceof FormData)) { h['Content-Type'] = 'application/json'; body = JSON.stringify(body); }
  if (token) h['Authorization'] = 'Bearer ' + token;
  const r = await fetch(p, { method: opt.method || (body ? 'POST' : 'GET'), headers: h, body });
  let j = null; try { j = await r.json(); } catch (e) { /* ไม่ใช่ JSON */ }
  if (!r.ok) throw new Error((j && j.error) || 'เกิดข้อผิดพลาด (' + r.status + ')');
  return j;
}
async function uploadImg(file) { const fd = new FormData(); fd.append('image', file); return (await api('/api/upload', { body: fd })).url; }
function setToken(t) { token = t; if (t) localStorage.setItem('examonline.token', t); else { localStorage.removeItem('examonline.token'); localStorage.removeItem('examhub.token'); } }

// ---------- State ----------
let me = null, sets = [], view = 'home', cat = 'ทั้งหมด', X = null, R = null, tm = null, RF = 'all', AUTHMODE = 'login';
let resultsList = [], adminUsers = [], edSet = null, EID = null, QID = null, edQ = null, CB = null, IMP = [], SDIRTY = false, HALL = false;
let socket = null, LIVE = null, liveTick = null, lastKey = '';

const adm = () => me && me.role === 'admin';
const fmt = s => String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0');
const dur = s => { s = Math.round(s || 0); const m = Math.floor(s / 60); return m ? `${m} นาที ${s % 60} วินาที` : `${s} วินาที`; };
const dateTh = t => new Date(t).toLocaleString('th-TH', { dateStyle: 'medium', timeStyle: 'short' });
const myA = x => x.type === 'mc' ? (x.given == null ? '—' : (x.choices[x.given] ? (L[x.given] + '. ' + (x.choices[x.given].text || '(รูปภาพ)')) : '—')) : ((x.given && String(x.given).trim()) ? x.given : '—');

function renderMath(el) {
  if (typeof renderMathInElement !== 'function' || !el) return;
  try { renderMathInElement(el, { delimiters: [{ left: '\\(', right: '\\)', display: false }, { left: '\\[', right: '\\]', display: true }, { left: '$$', right: '$$', display: true }], throwOnError: false }); } catch (e) { /* ข้ามถ้าสูตรผิด */ }
}
function modal(h, wide) {
  closeM();
  const d = document.createElement('div');
  d.id = 'ov'; d.className = 'fixed inset-0 z-[60] grid place-items-center p-4 bg-[#0F172A]/60 backdrop-blur-[4px]';
  d.innerHTML = `<div role="dialog" aria-modal="true" class="w-full ${wide ? 'max-w-2xl' : 'max-w-lg'} max-h-[90vh] overflow-auto rounded-xl bg-surface-container-lowest p-space-lg shadow-[0_20px_25px_-5px_rgba(15,23,42,0.12)]">${h}</div>`;
  document.body.appendChild(d); renderMath(d);
  const f = d.querySelector('input:not([type=file]):not([type=radio]):not([type=checkbox]),textarea'); if (f && !('ontouchstart' in window)) f.focus();
}
const closeM = () => { const o = $('#ov'); o && o.remove(); };
function toast(m) {
  const t = document.createElement('div');
  t.className = 'rounded-full bg-inverse-surface text-inverse-on-surface px-5 py-2.5 font-label-lg text-label-lg shadow-lg';
  t.setAttribute('role', 'status'); t.textContent = m; $('#toasts').appendChild(t); setTimeout(() => t.remove(), 2600);
}
function ask(msg, fn, label = 'ยืนยัน', danger = false) {
  CB = fn;
  modal(`<h3 class="font-headline-sm text-headline-sm mb-4">${msg}</h3><div class="flex flex-wrap gap-2 justify-end">${btn('sec', 'ยกเลิก', 'data-a="cm"')}${btn(danger ? 'del' : 'pri', label, 'data-a="cb"')}</div>`);
}
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeM(); });

// ---------- Boot ----------
async function boot() {
  if (token) { try { const r = await api('/api/auth/me'); me = r.user; } catch (e) { setToken(null); } }
  await loadSets(); render();
}
async function loadSets() { try { sets = await api('/api/sets'); } catch (e) { sets = []; } }

// ---------- Shell: header (ตาม Stitch) + footer ----------
const head = () => {
  const NAV = [['home', 'Portal ข้อสอบ'], ['live', 'ห้องสอบ Live Exam'], ...(adm() ? [['admin', 'จัดการข้อสอบ']] : []), ['hist', 'ผลสอบ & สถิติ']];
  const on = k => view === k || (k === 'admin' && view === 'edit') || (k === 'hist' && view === 'result');
  const links = (cls) => NAV.map(([k, l]) => `<button type="button" data-a="go" data-v="${k}" ${on(k) ? 'aria-current="page"' : ''} class="${cls} px-space-md py-space-sm rounded-lg font-label-lg text-label-lg whitespace-nowrap transition-colors ${on(k) ? 'bg-surface-container-high text-on-surface font-semibold' : 'text-on-surface-variant hover:bg-surface-container-low hover:text-on-surface'}">${l}</button>`).join('');
  return `<header class="fixed top-0 w-full z-50 bg-surface-container-lowest/90 backdrop-blur-md shadow-[0_1px_8px_rgba(0,0,0,0.04)]" style="padding-top:env(safe-area-inset-top,0px)">
  <div class="h-16 w-full px-margin-mobile md:px-margin flex items-center justify-between gap-space-md">
    <div class="flex items-center gap-space-lg">
      <button type="button" data-a="go" data-v="home" class="flex items-center gap-space-sm ${FOCUS} rounded-lg" aria-label="ExamOnline หน้าแรก">
        <span class="w-8 h-8 rounded-lg bg-primary text-on-primary grid place-items-center">${ic('school', '!text-[20px]')}</span>
        <span class="font-headline-md text-headline-md text-primary tracking-tight">ExamOnline</span>
      </button>
      <div class="hidden xl:flex items-center gap-space-xs px-space-sm py-1 bg-surface-container-low rounded-full">
        <span class="w-2 h-2 rounded-full bg-secondary"></span><span class="font-label-sm text-label-sm text-on-surface-variant">ทำข้อสอบได้ทันทีโดยไม่ต้องสมัครสมาชิก</span>
      </div>
    </div>
    <nav class="hidden md:flex items-center gap-space-xs" aria-label="เมนูหลัก">${links('')}</nav>
    <div class="flex items-center gap-space-sm">${me
      ? `<span class="w-8 h-8 rounded-full bg-primary text-on-primary grid place-items-center font-label-lg text-label-lg" aria-hidden="true">${esc(me.name[0] || '?')}</span><span class="hidden sm:inline font-label-lg text-label-lg text-on-surface-variant max-w-[140px] truncate">${esc(me.name)}</span><button type="button" data-a="out" aria-label="ออกจากระบบ" title="ออกจากระบบ" class="p-space-sm rounded-full text-on-surface-variant hover:bg-surface-container hover:text-on-surface transition-colors ${FOCUS}">${ic('logout')}</button>`
      : btn('pri', 'เข้าสู่ระบบ', 'data-a="authm" data-v="login"', 'login', true)}</div>
  </div>
  <nav class="md:hidden flex gap-space-xs overflow-x-auto nosb px-margin-mobile pb-2" aria-label="เมนูหลัก (มือถือ)">${links('flex-none')}</nav>
</header>`;
};
const foot = () => `<footer class="w-full bg-surface-container-lowest shadow-[0_-1px_8px_rgba(0,0,0,0.04)] py-space-lg mt-auto"><div class="w-full px-margin-mobile md:px-margin flex flex-col md:flex-row items-center justify-between gap-space-sm"><div class="flex items-center gap-space-sm"><span class="font-headline-sm text-headline-sm text-primary">ExamOnline</span><span class="font-label-md text-label-md text-on-surface-variant">| ระบบสอบออนไลน์ พร้อมห้องสอบสด</span></div><div class="font-label-md text-label-md text-on-surface-variant">© ${new Date().getFullYear()} ExamOnline</div></div></footer>`;
const page = (inner, w = 'max-w-7xl') => `<main class="w-full pt-[108px] md:pt-16 flex-1"><div class="w-full ${w} mx-auto px-margin-mobile md:px-margin py-space-lg flex flex-col gap-space-lg">${inner}</div></main>`;

// ---------- Views ----------
const V = {};

V.home = () => {
  const cats = ['ทั้งหมด', ...new Set(sets.map(s => s.cat))], l = sets.filter(s => cat === 'ทั้งหมด' || s.cat === cat);
  return page(`<div><h1 class="${H2}">${me ? 'สวัสดี ' + esc(me.name) : 'Portal ข้อสอบ'}</h1><p class="font-body-md text-on-surface-variant mt-1">เลือกชุดข้อสอบที่ต้องการทำ — ทำได้เลยแม้ไม่ได้เข้าสู่ระบบ</p></div>
  <div class="flex flex-wrap gap-space-sm" role="group" aria-label="หมวดข้อสอบ">${cats.map(c => `<button type="button" data-a="cat" data-v="${esc(c)}" aria-pressed="${c === cat}" class="px-4 py-1.5 rounded-full border font-label-lg text-label-lg transition-colors ${FOCUS} ${c === cat ? 'bg-primary text-on-primary border-primary' : 'bg-surface-container-lowest border-[#E2E8F0] text-on-surface hover:bg-surface-container-low'}">${esc(c)}</button>`).join('')}</div>
  <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-space-md">${l.map(s => `<article class="${CARD} p-space-lg flex flex-col gap-space-sm">
    <span class="self-start px-space-sm py-0.5 rounded-full bg-surface-container-high text-on-secondary-fixed-variant font-label-sm text-label-sm">${esc(s.cat)}</span>
    <h2 class="font-headline-sm text-headline-sm text-on-surface">${esc(s.title)}</h2>
    <p class="font-body-sm text-body-sm text-on-surface-variant flex-1">${esc(s.desc || '')}</p>
    <div class="flex flex-wrap gap-x-4 gap-y-1 font-label-md text-label-md text-on-surface-variant">
      <span class="inline-flex items-center gap-1">${ic('description', '!text-[16px]')}${s.qCount} ข้อ (ปรนัย ${s.mcCount} · อัตนัย ${s.saCount})</span>
      <span class="inline-flex items-center gap-1">${ic('timer', '!text-[16px]')}${s.time ? s.time + ' นาที' : 'ไม่จำกัดเวลา'}</span></div>
    <div class="flex flex-wrap gap-space-sm mt-space-xs">${btn('pri', 'เริ่มทำข้อสอบ', `data-a="setup" data-v="${s.id}" ${s.qCount ? '' : 'disabled'}`, 'play_arrow')}${me && s.mcCount ? btn('sec', 'ชวนเพื่อนเล่นสด', `data-a="hostRoom" data-v="${s.id}"`, 'sensors') : ''}</div></article>`).join('') || `<p class="text-on-surface-variant">ยังไม่มีข้อสอบ${adm() ? ' — ไปที่ "จัดการข้อสอบ" เพื่อเพิ่มชุดแรก' : ''}</p>`}</div>`);
};

// ----- Exam room (DESIGN.md: Exam Room Master Layout) -----
const palBtns = (cls = '') => X.qs.map((x, i) => `<button type="button" data-a="jp" data-v="${i}" aria-label="ไปข้อ ${i + 1}" class="qp ${i === X.i ? 'cur' : X.flag[x.id] ? 'fl' : (X.ans[x.id] != null && X.ans[x.id] !== '') ? 'ans' : ''} ${cls}">${i + 1}</button>`).join('');
V.exam = () => {
  const q = X.qs[X.i], n = X.qs.length, fbk = X.fb[q.id], a = X.ans[q.id], pr = X.mode === 'p';
  const done = Object.values(X.ans).filter(v => v !== '' && v != null).length, fl = Object.values(X.flag).filter(Boolean).length, pct = Math.round((X.i + 1) / n * 100), last = X.i === n - 1;
  let body;
  if (q.type === 'mc') body = q.choices.map((c, k) => {
    const st = pr && fbk ? (k === fbk.rightIdx ? 'ok' : (a === k ? 'bad' : '')) : '';
    return `<label class="opt ${st} ${fbk ? 'locked' : ''}"><input type="radio" class="sr-only" name="o" ${a === k ? 'checked' : ''} ${fbk ? 'disabled' : ''} data-a="pick" data-v="${k}"><span class="ind" aria-hidden="true"></span>${c.image ? `<img class="th" alt="" src="${esc(c.image)}">` : ''}<span class="lt">${L[k]}</span><span class="flex-1">${esc(c.text || '')}</span>${st === 'ok' ? ic('check_circle', 'text-secondary fill') : st === 'bad' ? ic('cancel', 'text-error fill') : ''}</label>`;
  }).join('');
  else body = `<label class="${LBL}" for="sa">คำตอบของคุณ</label><input class="${INP}" id="sa" placeholder="พิมพ์คำตอบ" autocomplete="off" value="${esc(a || '')}" ${fbk ? 'disabled' : ''} oninput="X.ans['${q.id}']=this.value" onkeydown="if(event.key==='Enter')A.chk()">`;
  const fb = fbk ? `<div class="mt-space-md rounded-lg px-4 py-3 ${fbk.ok ? 'bg-secondary-container/50 text-on-secondary-container' : 'bg-error-container/60 text-on-error-container'}" role="status"><div class="font-label-lg text-label-lg inline-flex items-center gap-1.5">${fbk.ok ? ic('check_circle', '!text-[18px] fill') + 'ถูกต้อง' : ic('cancel', '!text-[18px] fill') + 'ยังไม่ถูก · เฉลย: ' + esc(fbk.rightAnswer)}</div>${fbk.explanation ? `<div class="font-body-sm text-body-sm text-on-surface mt-1 whitespace-pre-line">${esc(fbk.explanation)}</div>` : ''}</div>` : '';
  const legend = `<div class="flex flex-wrap gap-x-3 gap-y-1 font-label-sm text-label-sm text-on-surface-variant mt-3"><span class="inline-flex items-center gap-1"><i class="w-3 h-3 rounded-full bg-[#0D9488]"></i>ตอบแล้ว</span><span class="inline-flex items-center gap-1"><i class="w-3 h-3 rounded-full bg-[#F59E0B]"></i>ปักธง</span><span class="inline-flex items-center gap-1"><i class="w-3 h-3 rounded-full border-2 border-[#1E40AF] bg-[#EFF6FF]"></i>ข้อปัจจุบัน</span></div>`;
  return `<div class="sticky top-0 z-40 bg-surface-container-lowest/95 backdrop-blur border-b border-[#E2E8F0]" style="padding-top:env(safe-area-inset-top,0px)"><div class="max-w-[1180px] mx-auto px-margin-mobile md:px-margin h-16 flex items-center gap-space-md">
    <h1 class="flex-1 min-w-0 truncate font-headline-sm text-headline-sm">${esc(X.title)}</h1>
    <span class="tpill" aria-live="off">${ic('timer', '!text-[18px]" id="tmi')}<span id="tm">--:--</span></span>
    ${btn('pri', 'ส่งข้อสอบ', 'data-a="sub"', 'task_alt', true)}</div></div>
  <main class="flex-1 w-full max-w-[1180px] mx-auto px-margin-mobile md:px-margin py-space-lg">
    <div class="mb-space-md"><div class="font-label-md text-label-md text-on-surface-variant mb-1.5">ข้อที่ ${X.i + 1} จาก ${n} • ${pct}% เสร็จแล้ว</div><div class="h-1.5 rounded-full bg-[#E2E8F0] overflow-hidden" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pct}"><div class="h-full rounded-full bg-primary-container transition-[width] duration-300 ease-out" style="width:${pct}%"></div></div></div>
    <div class="lg:hidden flex gap-2 overflow-x-auto nosb pb-3" aria-label="แผนผังข้อสอบ">${palBtns()}</div>
    <div class="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_300px] gap-gutter items-start">
      <section class="${CARD} p-space-lg w-full max-w-[780px]">
        ${q.section_note ? `<div class="${WARNBOX} font-semibold whitespace-pre-line mb-space-md inline-flex gap-2 w-full">${ic('bookmark', '!text-[18px]')}<span>${esc(q.section_note)}</span></div>` : ''}
        <div class="font-label-md text-label-md text-primary-container mb-1">${q.type === 'mc' ? 'ปรนัย' : 'อัตนัย (คำตอบตายตัว)'}</div>
        ${q.q_image ? `<img class="max-w-full max-h-80 rounded-lg border border-[#E2E8F0] mb-space-md block" alt="รูปประกอบโจทย์" src="${esc(q.q_image)}">` : ''}
        <p class="font-body-lg text-body-lg whitespace-pre-line mb-space-md">${esc(q.q)}</p>${body}${fb}
        <div class="flex flex-wrap gap-space-sm mt-space-lg pt-space-md border-t border-[#E2E8F0]">
          ${btn('sec', 'ก่อนหน้า', `data-a="pv" ${X.i ? '' : 'disabled'}`, 'arrow_back')}
          ${btn('warn', X.flag[q.id] ? 'ยกเลิกปักธง' : 'ปักธงทบทวน', 'data-a="fl"', 'flag')}
          ${pr && q.type === 'sa' && !fbk ? btn('sec', 'ตรวจคำตอบ', 'data-a="chk"', 'fact_check') : ''}
          <span class="flex-1"></span>
          ${last ? btn('pri', 'ส่งข้อสอบ', 'data-a="sub"', 'task_alt') : btn('pri', 'ถัดไป', 'data-a="nx"', 'arrow_forward')}</div>
      </section>
      <aside class="hidden lg:block ${CARD} p-space-lg sticky top-20" aria-label="แผนผังข้อสอบ">
        <div class="font-label-lg text-label-lg mb-space-sm">แผนผังข้อสอบ</div>
        <div class="flex flex-wrap gap-2">${palBtns()}</div>${legend}
        <div class="flex mt-space-md pt-space-md border-t border-[#E2E8F0] text-center"><div class="flex-1"><div class="font-headline-sm text-headline-sm text-secondary">${done}/${n}</div><div class="font-label-sm text-label-sm text-on-surface-variant">ตอบแล้ว</div></div><div class="flex-1 border-l border-[#E2E8F0]"><div class="font-headline-sm text-headline-sm text-[#B45309]">${fl}</div><div class="font-label-sm text-label-sm text-on-surface-variant">ปักธง</div></div></div>
        <div class="text-center font-label-md text-label-md text-on-surface-variant mt-space-md">${pr ? 'โหมดฝึกฝน · เฉลยทันที' : 'โหมดสอบจริง · เฉลยหลังส่ง'}</div>
      </aside></div></main>`;
};

// ----- Results (Stitch: results-analytics screen) -----
const SEC_COL = [['bg-primary', 'text-primary'], ['bg-secondary', 'text-secondary'], ['bg-surface-tint', 'text-surface-tint'], ['bg-tertiary-container', 'text-tertiary-container']];
function sectionStats(d) {
  const m = new Map();
  d.forEach(x => { if (!x.section) return; const g = m.get(x.section) || { name: x.section, ok: 0, n: 0 }; g.n++; if (x.correct) g.ok++; m.set(x.section, g); });
  return [...m.values()].map(g => ({ ...g, pct: Math.round(g.ok / g.n * 100) }));
}
function radarSvg(S) {
  const n = S.length, cx = 150, cy = 150, r0 = 110;
  const pt = (i, r) => { const a = -Math.PI / 2 + i * 2 * Math.PI / n; return [cx + r * Math.cos(a), cy + r * Math.sin(a)]; };
  const ring = f => S.map((_, i) => pt(i, r0 * f).map(v => v.toFixed(1)).join(',')).join(' ');
  const short = s => { const t = s.split(' · ')[0].split(':')[0].trim(); return t.length > 14 ? t.slice(0, 14) + '…' : t; };
  return `<svg class="w-full h-full overflow-visible" viewBox="0 0 300 300" role="img" aria-label="เรดาร์สมรรถนะรายหมวด">
  ${[1, .75, .5, .25].map(f => `<polygon class="text-surface-container-highest" fill="none" stroke="currentColor" stroke-width="1.5" points="${ring(f)}"/>`).join('')}
  ${S.map((_, i) => { const [x, y] = pt(i, r0); return `<line class="text-surface-container-highest" stroke="currentColor" stroke-width="1.5" x1="${cx}" y1="${cy}" x2="${x.toFixed(1)}" y2="${y.toFixed(1)}"/>`; }).join('')}
  <polygon fill="rgba(30,64,175,0.2)" stroke="#1e40af" stroke-width="2.5" points="${S.map((s, i) => pt(i, r0 * s.pct / 100).map(v => v.toFixed(1)).join(',')).join(' ')}"/>
  ${S.map((s, i) => { const [x, y] = pt(i, r0 * s.pct / 100), [lx, ly] = pt(i, r0 + 16), c = Math.cos(-Math.PI / 2 + i * 2 * Math.PI / n); return `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="4.5" fill="#1e40af"/><text x="${lx.toFixed(1)}" y="${(ly + 4).toFixed(1)}" font-size="11" font-weight="600" fill="#131b2e" text-anchor="${Math.abs(c) < .25 ? 'middle' : c > 0 ? 'start' : 'end'}"><title>${esc(s.name)}</title>${esc(short(s.name))} (${s.pct}%)</text>`; }).join('')}</svg>`;
}
function reviewCard(x, i) {
  const ok = x.correct, unans = x.given == null || x.given === '';
  const rightIdx = x.type === 'mc' ? (x.rightIndex != null ? x.rightIndex : (x.choices || []).findIndex(c => c.text === x.rightAnswer)) : null;
  let ch = '';
  if (x.type === 'mc') ch = `<div class="grid grid-cols-1 md:grid-cols-2 gap-space-sm">${(x.choices || []).map((c, k) => {
    const given = x.given === k, right = k === rightIdx;
    const tone = right ? 'bg-secondary-container/40 text-on-surface' : given ? 'bg-error-container/40 text-on-surface' : 'bg-surface-container-low text-on-surface-variant';
    const badge = right ? 'bg-secondary text-on-secondary font-bold' : given ? 'bg-error text-on-error font-bold' : 'bg-surface-container';
    const note = right ? (given ? 'คำตอบของคุณ (ถูกต้อง)' : 'เฉลยคำตอบที่ถูกต้อง') : given ? 'คำตอบที่คุณเลือก (ผิดพลาด)' : '';
    return `<div class="p-space-md rounded-lg ${tone} flex items-start justify-between gap-space-sm"><div class="flex items-start gap-space-sm"><span class="w-6 h-6 rounded-full ${badge} flex-shrink-0 flex items-center justify-center font-label-sm text-label-sm">${L[k]}</span><div class="flex flex-col gap-1">${c.image ? `<img class="max-h-28 rounded-lg" alt="" src="${esc(c.image)}">` : ''}${c.text ? `<span class="font-body-md text-body-md ${right || given ? 'font-semibold' : ''}">${esc(c.text)}</span>` : ''}${note ? `<span class="font-label-sm text-label-sm ${right ? 'text-secondary' : 'text-error'} font-semibold">${note}</span>` : ''}</div></div>${right ? ic('check_circle', 'text-secondary !text-[22px] fill') : given ? ic('close', 'text-error !text-[22px]') : ''}</div>`;
  }).join('')}</div>`;
  else ch = `<div class="grid grid-cols-1 md:grid-cols-2 gap-space-sm"><div class="p-space-md rounded-lg ${ok ? 'bg-secondary-container/40' : 'bg-error-container/40'}"><div class="font-label-sm text-label-sm ${ok ? 'text-secondary' : 'text-error'} font-semibold mb-1">คำตอบของคุณ</div><div class="font-body-md text-body-md font-semibold">${esc(myA(x))}</div></div>${ok ? '' : `<div class="p-space-md rounded-lg bg-secondary-container/40"><div class="font-label-sm text-label-sm text-secondary font-semibold mb-1">เฉลยคำตอบที่ถูกต้อง</div><div class="font-body-md text-body-md font-semibold">${esc(x.rightAnswer)}</div></div>`}</div>`;
  return `<article class="${CARD} p-space-lg flex flex-col gap-space-md brk"><div class="flex flex-wrap items-center justify-between gap-space-xs"><div class="flex items-center gap-space-sm"><span class="w-8 h-8 rounded-full ${ok ? 'bg-secondary text-on-secondary' : 'bg-error text-on-error'} flex items-center justify-center font-label-lg text-label-lg font-bold">${i + 1}</span><h3 class="font-headline-sm text-headline-sm">ข้อที่ ${i + 1} <span class="font-label-md text-label-md text-on-surface-variant font-normal">${x.type === 'mc' ? 'ปรนัย' : 'อัตนัย'}</span></h3></div>
    <div class="flex items-center gap-space-xs"><span class="px-space-sm py-1 rounded ${ok ? 'bg-secondary-container text-on-secondary-container' : 'bg-error-container text-on-error-container'} font-label-sm text-label-sm font-semibold flex items-center gap-1">${ic(ok ? 'check_circle' : 'cancel', '!text-[16px]')}${ok ? 'ตอบถูกต้อง (+1.0 คะแนน)' : (unans ? 'ยังไม่ได้ตอบ (0.0 คะแนน)' : 'ตอบไม่ถูกต้อง (0.0 คะแนน)')}</span>${x.sec > 0 ? `<span class="px-space-sm py-1 rounded bg-surface-container font-label-sm text-label-sm text-on-surface-variant">เวลาที่ใช้: ${dur(x.sec)}</span>` : ''}</div></div>
    <p class="font-body-md text-body-md leading-relaxed whitespace-pre-line">${esc(x.q)}</p>
    ${x.q_image ? `<div class="p-space-md rounded-lg bg-surface-container-low"><img class="max-h-64 max-w-full rounded-lg object-contain bg-surface-container-lowest" alt="รูปประกอบโจทย์" src="${esc(x.q_image)}"></div>` : ''}
    ${ch}
    ${x.explanation ? `<div class="rounded-lg bg-surface-container p-space-md flex flex-col gap-space-xs"><div class="flex items-center gap-space-xs text-primary">${ic(ok ? 'lightbulb' : 'psychology_alt')}<span class="font-label-lg text-label-lg font-bold">${ok ? 'คำอธิบายเฉลย' : 'วิเคราะห์และวิธีคิดที่ถูกต้อง'}</span></div><div class="font-body-sm text-body-sm leading-relaxed whitespace-pre-line">${esc(x.explanation)}</div></div>` : ''}</article>`;
}
V.result = () => {
  const d = R.detail, n = d.length, okN = d.filter(x => x.correct).length, pct = R.total ? Math.round(R.score / R.total * 100) : 0, st = R.stats, pass = pct >= 60;
  const secs = sectionStats(d), showRadar = secs.length >= 3 && secs.length <= 8;
  const name = R.examinee || (me && me.name) || 'ผู้เยี่ยมชม', mins = R.sec >= 60 ? Math.floor(R.sec / 60) : R.sec;
  const rows = d.map((x, i) => [x, i]).filter(([x]) => RF === 'all' || (RF === 'ok' ? x.correct : !x.correct));
  const tab = (k, l, c, extra = '') => `<button type="button" data-a="rf" data-v="${k}" aria-pressed="${RF === k}" class="px-space-md py-1.5 rounded font-label-md text-label-md ${RF === k ? 'bg-surface-container-lowest text-on-surface font-semibold shadow-sm' : 'hover:bg-surface-container text-on-surface-variant'} ${extra} ${FOCUS}">${l} (${c})</button>`;
  const cardHead = (t, i, c = 'text-primary') => `<div class="flex items-center justify-between"><span class="font-label-md text-label-md text-on-surface-variant">${t}</span><span class="w-8 h-8 rounded-full bg-surface-container-low flex items-center justify-center ${c}">${ic(i)}</span></div>`;
  return page(`
  <div class="${CARD} p-space-lg flex flex-col lg:flex-row lg:items-center lg:justify-between gap-space-lg brk">
    <div class="flex items-center gap-space-md min-w-0"><span class="w-16 h-16 rounded-full bg-primary text-on-primary grid place-items-center font-headline-md text-headline-md flex-shrink-0">${esc(name[0] || '?')}</span>
      <div class="flex flex-col min-w-0"><div class="flex flex-wrap items-center gap-space-xs"><span class="font-headline-sm text-headline-sm truncate">${esc(name)}</span><span class="px-space-xs py-0.5 rounded-full bg-surface-container-high text-on-secondary-fixed-variant font-label-sm text-label-sm flex items-center gap-1"><span class="w-1.5 h-1.5 rounded-full bg-secondary"></span>${R.mode === 'm' ? 'โหมดสอบจริง' : 'โหมดฝึกฝน'}</span></div>
      <span class="font-body-sm text-body-sm text-on-surface-variant">ชุดข้อสอบ: ${esc(R.title)} • ${dateTh(R.date)}</span></div></div>
    <div class="flex flex-wrap items-center gap-space-sm noprint">${btn('sec', 'ประวัติผลสอบ', 'data-a="go" data-v="hist"', 'history')}${btn('pri', 'พิมพ์ / บันทึกเป็น PDF', 'data-a="print"', 'download')}</div></div>
  ${R.mode === 'm' && R.away ? `<div class="${WARNBOX} inline-flex items-center gap-2">${ic('warning', '!text-[18px]')}ออกจากหน้าจอข้อสอบ ${R.away} ครั้งระหว่างสอบ</div>` : ''}
  <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-space-md">
    <div class="${CARD} p-space-lg flex flex-col justify-between brk">${cardHead('คะแนนรวมสุทธิ', 'military_tech')}<div class="my-space-md"><div class="flex items-baseline gap-space-xs"><span class="font-headline-xl text-headline-xl text-primary font-bold">${R.score}</span><span class="font-headline-sm text-headline-sm text-on-surface-variant">/ ${R.total}</span></div><span class="inline-block mt-1 px-2 py-0.5 rounded font-label-sm text-label-sm font-semibold ${pass ? 'bg-secondary-container text-on-secondary-container' : 'bg-error-container text-on-error-container'}">${pass ? 'ผ่านเกณฑ์' : 'ยังไม่ผ่านเกณฑ์'} (${pct}%)</span></div><div class="w-full bg-surface-container-low h-1.5 rounded-full overflow-hidden"><div class="bg-primary h-full rounded-full" style="width:${pct}%"></div></div></div>
    <div class="${CARD} p-space-lg flex flex-col justify-between brk">${cardHead('อันดับคะแนนในชุดนี้', 'leaderboard', 'text-secondary')}${st ? `<div class="my-space-md"><div class="flex items-baseline gap-space-xs"><span class="font-headline-xl text-headline-xl text-secondary font-bold">#${st.rank}</span><span class="font-headline-sm text-headline-sm text-on-surface-variant">/ ${st.participants} คน</span></div><span class="text-secondary font-label-sm text-label-sm font-semibold">อยู่ในกลุ่ม Top ${Math.max(1, Math.round(st.rank / st.participants * 100))}% ของผู้สอบ</span></div><div class="text-on-surface-variant font-label-sm text-label-sm flex items-center justify-between"><span>เฉลี่ย: ${Math.round((st.avg_pct || 0) * 100)}%</span><span>สูงสุด: ${Math.round((st.max_pct || 0) * 100)}%</span></div>` : `<div class="my-space-md"><span class="font-headline-xl text-headline-xl text-on-surface-variant font-bold">—</span><div class="font-label-sm text-label-sm text-on-surface-variant mt-1">อันดับแสดงเฉพาะโหมดสอบจริง</div></div><div></div>`}</div>
    <div class="${CARD} p-space-lg flex flex-col justify-between brk">${cardHead('เวลาที่ใช้ทำข้อสอบ', 'timer', 'text-on-surface')}<div class="my-space-md"><div class="flex items-baseline gap-space-xs"><span class="font-headline-xl text-headline-xl font-bold">${mins}</span><span class="font-headline-sm text-headline-sm text-on-surface-variant">${R.sec >= 60 ? 'นาที' : 'วินาที'}</span></div><span class="font-label-sm text-label-sm text-on-surface-variant">${st && st.time_limit ? `จากเวลาที่กำหนด ${st.time_limit} นาที` : 'ไม่จำกัดเวลา'}${st && st.avg_sec ? ` (เฉลี่ยผู้สอบ ${dur(st.avg_sec)})` : ''}</span></div><div class="w-full bg-surface-container-low h-1.5 rounded-full overflow-hidden"><div class="bg-secondary-fixed-dim h-full rounded-full" style="width:${st && st.time_limit ? Math.min(100, Math.round(R.sec / (st.time_limit * 60) * 100)) : 0}%"></div></div></div>
    <div class="${CARD} p-space-lg flex flex-col justify-between brk">${cardHead('สัดส่วนความถูกต้อง', 'pie_chart', 'text-primary-container')}<div class="my-space-md flex items-center justify-between"><div><div class="font-headline-xl text-headline-xl font-bold">${pct}%</div><div class="text-on-surface-variant font-label-sm text-label-sm">ตอบถูก ${okN} จาก ${n} ข้อ</div></div><div class="flex flex-col gap-1 text-right"><span class="font-label-sm text-label-sm text-secondary font-semibold">✓ ถูก ${okN} ข้อ</span><span class="font-label-sm text-label-sm text-error font-semibold">✗ ผิด ${n - okN} ข้อ</span></div></div><div class="flex items-center gap-1 w-full"><div class="h-1.5 rounded-l-full bg-secondary" style="flex:${okN || 0.001}"></div><div class="h-1.5 rounded-r-full bg-error" style="flex:${(n - okN) || 0.001}"></div></div></div></div>
  ${secs.length ? `<div class="grid grid-cols-1 lg:grid-cols-12 gap-space-lg">
    <div class="${showRadar ? 'lg:col-span-7' : 'lg:col-span-12'} ${CARD} p-space-lg flex flex-col gap-space-md brk"><div class="flex items-center justify-between"><div class="flex flex-col"><span class="font-headline-sm text-headline-sm">การวิเคราะห์ผลรายตอน/หมวด</span><span class="font-body-sm text-body-sm text-on-surface-variant">แยกตามหัวข้อช่วงตอนที่ระบุไว้ในชุดข้อสอบ</span></div>${ic('analytics', 'text-primary !text-[24px]')}</div>
      ${secs.map((s, i) => { const [bg, tx] = SEC_COL[i % 4]; return `<div class="p-space-md rounded-lg bg-surface-container-low flex flex-col gap-space-xs"><div class="flex items-center justify-between gap-space-sm"><div class="flex items-center gap-space-xs min-w-0"><span class="w-3 h-3 rounded-full ${bg} flex-none"></span><span class="font-label-lg text-label-lg">${esc(s.name)}</span></div><div class="flex items-center gap-space-sm flex-none"><span class="font-label-md text-label-md text-on-surface-variant">${s.ok}/${s.n} ข้อ</span><span class="font-headline-sm text-headline-sm ${tx} font-bold">${s.pct}%</span></div></div><div class="w-full bg-surface-container h-2 rounded-full overflow-hidden"><div class="${bg} h-full rounded-full" style="width:${s.pct}%"></div></div><span class="font-body-sm text-body-sm text-on-surface-variant">${s.pct >= 80 ? 'เข้าใจดีมาก' : s.pct >= 60 ? 'อยู่ในเกณฑ์ดี' : 'ควรทบทวนเพิ่มเติม'}</span></div>`; }).join('')}</div>
    ${showRadar ? `<div class="lg:col-span-5 ${CARD} p-space-lg flex flex-col items-center justify-between brk"><div class="w-full"><span class="font-headline-sm text-headline-sm">เรดาร์สมรรถนะ (Competency Radar)</span><p class="font-body-sm text-body-sm text-on-surface-variant">สัดส่วนที่ตอบถูกในแต่ละตอน/หมวด</p></div><div class="w-full max-w-[320px] aspect-square my-space-md px-8">${radarSvg(secs)}</div><div class="flex items-center gap-space-xs text-on-surface-variant font-label-sm text-label-sm"><span class="w-3 h-3 rounded-sm bg-primary"></span>คะแนนของคุณ</div></div>` : ''}</div>` : ''}
  <div class="flex flex-col gap-space-md"><div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-space-sm"><div><h2 class="font-headline-md text-headline-md">เฉลยข้อสอบและวิเคราะห์รายข้อ (Itemized Solution Key)</h2><p class="font-body-sm text-body-sm text-on-surface-variant">ตรวจสอบคำตอบ เฉลย และคำอธิบายของแต่ละข้อ</p></div>
    <div class="flex items-center p-1 rounded-lg bg-surface-container-low shadow-sm noprint self-start">${tab('all', 'ทั้งหมด', n)}${tab('ok', 'ตอบถูก', okN)}${tab('bad', 'ข้อที่ต้องปรับปรุง', n - okN, 'text-error font-semibold')}</div></div>
    ${rows.map(([x, i]) => reviewCard(x, i)).join('') || '<p class="text-on-surface-variant">ไม่มีข้อในหมวดนี้</p>'}</div>
  <div class="rounded-xl bg-surface-container-low p-space-lg shadow-sm flex flex-col md:flex-row items-center justify-between gap-space-md noprint"><div class="flex items-center gap-space-md"><span class="w-12 h-12 rounded-full bg-primary flex-shrink-0 flex items-center justify-center text-on-primary">${ic('replay', '!text-[24px]')}</span><div><div class="font-headline-sm text-headline-sm">อยากทบทวนต่อหรือลองชุดอื่น?</div><p class="font-body-sm text-body-sm text-on-surface-variant">ทำชุดนี้ซ้ำในโหมดฝึกฝนเพื่อดูเฉลยทีละข้อ หรือเลือกชุดข้อสอบอื่นจากหน้า Portal</p></div></div>
    <div class="flex flex-wrap items-center gap-space-sm">${R.set_id && sets.some(s => s.id === R.set_id) ? btn('sec', 'ทำชุดนี้อีกครั้ง', `data-a="setup" data-v="${R.set_id}"`, 'replay') : ''}${btn('pri', 'ทำชุดอื่น', 'data-a="go" data-v="home"', 'quiz')}</div></div>`, 'max-w-7xl');
};

V.hist = () => {
  if (!me) return page(`<h1 class="${H2}">ผลสอบ &amp; สถิติ</h1><div class="${CARD} p-space-lg flex flex-col items-start gap-space-md"><p class="text-on-surface-variant">เข้าสู่ระบบเพื่อบันทึกและดูประวัติผลสอบของคุณ (การทำข้อสอบแบบผู้เยี่ยมชมจะไม่ถูกผูกกับบัญชี)</p>${btn('pri', 'เข้าสู่ระบบ', 'data-a="authm" data-v="login"', 'login')}</div>`);
  const real = resultsList.filter(r => r.total > 0), avg = real.length ? Math.round(real.reduce((a, r) => a + r.score / r.total, 0) / real.length * 100) : 0, best = real.length ? Math.round(Math.max(...real.map(r => r.score / r.total)) * 100) : 0;
  const stat = (t, v, i) => `<div class="${CARD} p-space-lg"><div class="flex items-center justify-between"><span class="font-label-md text-label-md text-on-surface-variant">${t}</span>${ic(i, 'text-primary')}</div><div class="font-headline-xl text-headline-xl text-primary font-bold mt-space-sm">${v}</div></div>`;
  return page(`<div class="flex flex-wrap items-center justify-between gap-space-sm"><div><h1 class="${H2}">ผลสอบ &amp; สถิติ</h1><p class="text-on-surface-variant">${adm() && HALL ? 'ผลสอบของผู้สอบทุกคน' : 'ประวัติการสอบของคุณ'}</p></div>${adm() ? `<label class="inline-flex items-center gap-2 font-label-lg text-label-lg text-on-surface-variant"><input type="checkbox" class="w-4 h-4 accent-[#1E40AF]" ${HALL ? 'checked' : ''} onchange="A.histAll(this.checked)">แสดงของทุกคน</label>` : ''}</div>
  <div class="grid grid-cols-1 sm:grid-cols-3 gap-space-md">${stat('จำนวนครั้งที่สอบ', resultsList.length, 'history_edu')}${stat('คะแนนเฉลี่ย', real.length ? avg + '%' : '—', 'analytics')}${stat('คะแนนสูงสุด', real.length ? best + '%' : '—', 'military_tech')}</div>
  ${resultsList.length ? `<div class="${CARD} p-space-md"><div class="tw"><table><tr><th>ชุดข้อสอบ</th>${adm() && HALL ? '<th>ผู้สอบ</th>' : ''}<th>โหมด</th><th>คะแนน</th><th>วันที่</th><th></th></tr>${resultsList.map(r => `<tr><td class="wrap">${esc(r.title)}</td>${adm() && HALL ? `<td>${esc(r.email || '-')}</td>` : ''}<td>${r.mode === 'm' ? 'สอบจริง' : 'ฝึกฝน'}</td><td class="font-semibold">${r.score}/${r.total} <span class="text-on-surface-variant font-normal">(${r.total ? Math.round(r.score / r.total * 100) : 0}%)</span></td><td>${dateTh(r.date)}</td><td>${btn('sec', 'ดูเฉลย', `data-a="open" data-v="${r.id}"`, '', true)}</td></tr>`).join('')}</table></div></div>` : `<div class="${CARD} p-space-lg text-on-surface-variant">ยังไม่มีประวัติการสอบ — เริ่มทำข้อสอบชุดแรกได้จากหน้า Portal</div>`}`);
};

// ----- Admin (จัดการข้อสอบ) -----
const th = (a, b) => `<th>${a}</th>${b || ''}`;
V.admin = () => {
  const nq = sets.reduce((n, s) => n + s.qCount, 0);
  const stat = (t, v) => `<div class="${CARD} p-space-lg text-center"><div class="font-headline-xl text-headline-xl text-primary font-bold">${v}</div><div class="font-label-md text-label-md text-on-surface-variant">${t}</div></div>`;
  return page(`<div class="flex flex-wrap items-center justify-between gap-space-sm"><div><h1 class="${H2}">จัดการข้อสอบ</h1><p class="text-on-surface-variant">จัดการชุดข้อสอบ ข้อสอบ และผู้ใช้งาน</p></div>${btn('pri', 'เพิ่มชุดข้อสอบ', 'data-a="sadd"', 'add')}</div>
  <div class="grid grid-cols-3 gap-space-md">${stat('ชุดข้อสอบ', sets.length)}${stat('ข้อสอบทั้งหมด', nq)}${stat('ผู้ใช้งาน', adminUsers.length)}</div>
  <section><h2 class="font-headline-sm text-headline-sm mb-space-sm">ชุดข้อสอบ</h2><div class="${CARD} p-space-md"><div class="tw"><table><tr><th>ชื่อชุด</th><th>ประเภท</th><th>ข้อ</th><th>สถานะ</th><th></th></tr>${sets.map(s => `<tr><td class="wrap font-semibold">${esc(s.title)}</td><td>${esc(s.cat)}</td><td>${s.qCount}</td><td>${s.is_public ? '<span class="px-2 py-0.5 rounded-full bg-secondary-container text-on-secondary-container font-label-sm text-label-sm">สาธารณะ</span>' : '<span class="px-2 py-0.5 rounded-full bg-surface-container text-on-surface-variant font-label-sm text-label-sm">ซ่อน</span>'}</td><td><div class="flex gap-2">${btn('sec', 'จัดการข้อสอบ', `data-a="sed" data-v="${s.id}"`, 'edit', true)}${btn('del', 'ลบ', `data-a="sdel" data-v="${s.id}"`, 'delete', true)}</div></td></tr>`).join('')}</table></div></div></section>
  <section><h2 class="font-headline-sm text-headline-sm mb-space-sm">ผู้ใช้งาน</h2><div class="${CARD} p-space-md"><div class="tw"><table><tr><th>อีเมล</th><th>ชื่อ</th><th>สิทธิ์</th><th></th></tr>${adminUsers.map(u => `<tr><td>${esc(u.email)}</td><td>${esc(u.name)}</td><td>${u.role === 'admin' ? 'ผู้ดูแล' : 'ผู้สอบ'}</td><td>${u.id === me.id ? '' : btn('sec', u.role === 'admin' ? 'ปรับเป็นผู้สอบ' : 'ตั้งเป็นผู้ดูแล', `data-a="role" data-v="${u.id}|${u.role}"`, '', true)}</td></tr>`).join('')}</table></div></div></section>`);
};

V.edit = () => {
  const s = edSet, catOpts = [...new Set([...CATS, s.cat])];
  const sv = (extra = '') => `<button type="button" data-a="ssave" class="ssaveBtn ${SDIRTY ? BTN.pri : BTN.sec} ${extra}">${ic(SDIRTY ? 'save' : 'check', '!text-[18px]')}${SDIRTY ? 'บันทึกการเปลี่ยนแปลง' : 'บันทึกแล้ว'}</button>`;
  return page(`<div class="flex flex-wrap items-center justify-between gap-space-sm"><h1 class="${H2}">แก้ไขชุดข้อสอบ</h1><div class="flex gap-2 flex-wrap">${btn('sec', 'กลับ', 'data-a="go" data-v="admin"', 'arrow_back')}${sv()}</div></div>
  <div id="dirtyBar" class="${WARNBOX}" style="display:${SDIRTY ? '' : 'none'}">มีการแก้ไขที่ยังไม่ได้บันทึก — กด "บันทึกการเปลี่ยนแปลง" เพื่อจัดเก็บ</div>
  <div class="${CARD} p-space-lg"><div class="grid grid-cols-1 md:grid-cols-[1fr_1fr_120px] gap-x-space-md"><div><label class="${LBL} !mt-0">ชื่อชุดข้อสอบ</label><input class="${INP}" value="${esc(s.title)}" oninput="A.setField('title',this.value)"></div><div><label class="${LBL} !mt-0">ประเภท</label><select class="${INP}" onchange="A.setField('cat',this.value)">${catOpts.map(c => `<option value="${esc(c)}" ${s.cat === c ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select></div><div><label class="${LBL} !mt-0">เวลา (นาที)</label><input class="${INP}" type="number" min="0" value="${s.time}" oninput="A.setField('time',+this.value||0)"></div></div>
    <label class="${LBL}">คำอธิบายสั้น ๆ</label><input class="${INP}" value="${esc(s.desc || '')}" oninput="A.setField('desc',this.value)">
    <label class="inline-flex items-center gap-2 mt-space-md font-label-lg text-label-lg"><input type="checkbox" class="w-4 h-4 accent-[#1E40AF]" ${s.is_public ? 'checked' : ''} onchange="A.setField('is_public',this.checked)">เผยแพร่แบบสาธารณะ (ทุกคนเห็นใน Portal)</label></div>
  <div class="flex flex-wrap items-center justify-between gap-space-sm"><h2 class="font-headline-md text-headline-md">ข้อสอบ (${s.questions.length} ข้อ)</h2><div class="flex gap-2 flex-wrap">${btn('sec', 'นำเข้าจากไฟล์', 'data-a="imp"', 'upload_file')}${btn('pri', 'เพิ่มข้อสอบ', 'data-a="qed" data-v=""', 'add')}</div></div>
  <div class="${CARD} p-space-md"><div class="tw"><table>${s.questions.map((q, i) => (q.section_note ? `<tr><td colspan="3" class="!bg-[#FEF3C7] !text-[#92400E] font-semibold" style="white-space:pre-line">${esc(q.section_note)}</td></tr>` : '') + `<tr><td>${i + 1}</td><td class="wrap">${q.q_image ? ic('image', '!text-[16px]') + ' ' : ''}${esc(q.q)}<div class="text-on-surface-variant font-body-sm text-body-sm">${q.type === 'mc' ? 'ปรนัย' : 'อัตนัย'} · เฉลย: ${esc(q.type === 'mc' ? (q.choices[q.answer]?.text || '(รูปภาพ)') : q.answer.join(' / '))}</div></td><td><div class="flex gap-2">${btn('sec', 'แก้ไข', `data-a="qed" data-v="${q.id}"`, '', true)}${btn('del', 'ลบ', `data-a="qdel" data-v="${q.id}"`, '', true)}</div></td></tr>`).join('') || '<tr><td class="text-on-surface-variant">ยังไม่มีข้อสอบในชุดนี้ — กด "เพิ่มข้อสอบ" หรือ "นำเข้าจากไฟล์"</td></tr>'}</table></div></div>`);
};

// ----- Live exam room -----
const timeLeftPct = () => { if (!LIVE || !LIVE.question) return 0; const el = Date.now() - LIVE.question.startedAt; return Math.max(0, 100 - el / (LIVE.question.seconds * 1000) * 100); };
const tbar = () => `<div class="h-2 rounded-full bg-surface-container-high overflow-hidden my-space-md" role="progressbar" aria-label="เวลาที่เหลือ"><div class="tbar-f h-full bg-primary-container" style="width:${timeLeftPct()}%"></div></div>`;
const lboard = (list, me2) => `<div class="flex flex-col">${list.map((p, i) => `<div class="flex items-center justify-between gap-3 px-3 py-2.5 border-b border-[#E2E8F0] ${i === 0 ? 'font-bold text-primary' : ''} ${me2 && p.nickname === me2 ? 'bg-surface-container-low rounded-lg' : ''}"><span class="flex items-center gap-3"><span class="w-7 h-7 rounded-full ${i === 0 ? 'bg-primary text-on-primary' : 'bg-surface-container text-on-surface-variant'} grid place-items-center font-label-md text-label-md">${i + 1}</span>${esc(p.nickname)}</span><span class="tabular-nums">${p.score}</span></div>`).join('')}</div>`;
const sNote = q => q.section_note ? `<div class="${WARNBOX} font-semibold whitespace-pre-line mb-space-md">${esc(q.section_note)}</div>` : '';
const qHead = q => `${sNote(q)}${q.q_image ? `<img class="max-w-full max-h-72 rounded-lg border border-[#E2E8F0] mb-space-md block" alt="" src="${esc(q.q_image)}">` : ''}<p class="font-headline-sm text-headline-sm whitespace-pre-line">${esc(q.q)}</p>`;
const center = inner => page(`<div class="${CARD} p-space-lg w-full max-w-xl mx-auto text-center">${inner}</div>`, 'max-w-3xl');
V.live = () => {
  if (!LIVE) return page(`<div><h1 class="${H2}">ห้องสอบ Live Exam</h1><p class="text-on-surface-variant">เข้าร่วมห้องด้วย PIN จากเพื่อน หรือเปิดห้องใหม่จากชุดข้อสอบปรนัยใน Portal (ต้องเข้าสู่ระบบ)</p></div>
    <div class="${CARD} p-space-lg w-full max-w-sm"><label class="${LBL} !mt-0" for="jpin">PIN ห้อง (6 หลัก)</label><input class="${INP} tracking-widest" id="jpin" inputmode="numeric" maxlength="6" placeholder="123456"><label class="${LBL}" for="jnick">ชื่อเล่นของคุณ</label><input class="${INP}" id="jnick" placeholder="เช่น น้องเอ" maxlength="24" onkeydown="if(event.key==='Enter')A.joinRoom()"><div class="mt-space-md">${btn('pri', 'เข้าร่วมห้อง', 'data-a="joinRoom" style="width:100%"', 'login')}</div></div>`);
  const l = LIVE;
  if (l.role === 'host') {
    if (l.status === 'lobby') return center(`<h1 class="font-headline-md text-headline-md">${esc(l.title)}</h1><p class="text-on-surface-variant mt-1">บอก PIN นี้ให้เพื่อนพิมพ์เพื่อเข้าร่วม</p><div class="font-headline-xl text-headline-xl text-primary tracking-[0.2em] my-space-md" style="font-size:3rem;line-height:1.1">${l.pin}</div><div class="flex flex-wrap justify-center gap-2 my-space-md">${(l.players || []).map(p => `<span class="px-3 py-1 rounded-full bg-surface-container-high text-primary font-label-lg text-label-lg">${esc(p.nickname)}</span>`).join('') || '<span class="text-on-surface-variant font-body-sm text-body-sm">ยังไม่มีใครเข้าร่วม…</span>'}</div>${btn('pri', `เริ่มเล่น (${(l.players || []).length} คน)`, `data-a="liveStart" style="width:100%" ${(l.players || []).length ? '' : 'disabled'}`, 'play_arrow')}`);
    if (l.status === 'question') { const q = l.question; return page(`<div class="${CARD} p-space-lg"><div class="flex items-center justify-between gap-3"><h1 class="font-headline-sm text-headline-sm">ข้อ ${q.qIndex + 1} / ${q.total}</h1>${btn('sec', 'เฉลยตอนนี้', 'data-a="liveNext"', 'visibility', true)}</div>${tbar()}${qHead(q)}<p class="text-on-surface-variant mt-space-md">ผู้เล่นกำลังตอบ… (โฮสต์ไม่เห็นคำตอบจนกว่าจะเฉลย)</p></div>`, 'max-w-3xl'); }
    if (l.status === 'reveal') { const rv = l.lastReveal; return page(`<div class="${CARD} p-space-lg"><div class="font-label-md text-label-md text-secondary">เฉลย</div><h1 class="font-headline-md text-headline-md">${esc(rv.rightAnswer)}</h1>${rv.explanation ? `<p class="text-on-surface-variant mt-1 whitespace-pre-line">${esc(rv.explanation)}</p>` : ''}<h2 class="font-label-lg text-label-lg mt-space-lg mb-space-xs">กระดานคะแนน</h2>${lboard(rv.leaderboard)}<div class="flex justify-end mt-space-md">${btn('pri', 'ข้อถัดไป / ดูผลสรุป', 'data-a="liveNext"', 'arrow_forward')}</div></div>`, 'max-w-3xl'); }
    if (l.status === 'ended') return page(`<div class="${CARD} p-space-lg"><h1 class="font-headline-md text-headline-md inline-flex items-center gap-2">${ic('emoji_events', 'text-[#B45309] !text-[28px]')}จบเกม!</h1><h2 class="font-label-lg text-label-lg mt-space-md mb-space-xs">อันดับสุดท้าย</h2>${lboard(l.leaderboard)}<div class="mt-space-md">${btn('pri', 'กลับ Portal', 'data-a="go" data-v="home"', 'home')}</div></div>`, 'max-w-3xl');
  } else {
    if (l.status === 'lobby') return center(`<h1 class="font-headline-md text-headline-md">${esc(l.title)}</h1><p class="text-on-surface-variant mt-2">เข้าร่วมในชื่อ <b>${esc(l.nickname)}</b> แล้ว — รอโฮสต์เริ่มเกม…</p>`);
    if (l.status === 'question') {
      if (l.myAnswered) return center(`<h1 class="font-headline-md text-headline-md inline-flex items-center gap-2">${ic('check_circle', 'text-secondary fill !text-[28px]')}ส่งคำตอบแล้ว</h1><p class="text-on-surface-variant mt-2">รอผู้เล่นคนอื่น…</p>`);
      const q = l.question, cols = ['bg-primary', 'bg-secondary', 'bg-tertiary-container', 'bg-inverse-surface'];
      return page(`<div class="${CARD} p-space-lg">${tbar()}${qHead(q)}<div class="grid grid-cols-1 sm:grid-cols-2 gap-space-md mt-space-lg">${(q.choices || []).map((c, i) => `<button type="button" class="lt-tile ${FOCUS}" data-a="liveAnswer" data-v="${i}"><span class="bd ${cols[i % 4]}">${L[i]}</span>${c.image ? `<img alt="" src="${esc(c.image)}">` : ''}<span class="font-body-md text-body-md font-semibold">${esc(c.text || '')}</span></button>`).join('')}</div></div>`, 'max-w-3xl');
    }
    if (l.status === 'reveal') { const rv = l.lastReveal; return center(`<h1 class="font-headline-md text-headline-md inline-flex items-center gap-2">${l.myLastCorrect ? ic('check_circle', 'text-secondary fill !text-[28px]') + 'ถูกต้อง!' : ic('cancel', 'text-error fill !text-[28px]') + 'ยังไม่ถูก'}</h1>${l.myLastCorrect ? `<p class="text-secondary font-semibold mt-1">+${l.myLastPoints} คะแนน</p>` : ''}<p class="text-on-surface-variant mt-1">เฉลย: ${esc(rv.rightAnswer)}</p><h2 class="font-label-lg text-label-lg mt-space-lg mb-space-xs text-left">อันดับปัจจุบัน</h2><div class="text-left">${lboard(rv.leaderboard.slice(0, 5), l.nickname)}</div>`); }
    if (l.status === 'ended') return page(`<div class="${CARD} p-space-lg"><h1 class="font-headline-md text-headline-md inline-flex items-center gap-2">${ic('emoji_events', 'text-[#B45309] !text-[28px]')}จบเกม!</h1><h2 class="font-label-lg text-label-lg mt-space-md mb-space-xs">อันดับสุดท้าย</h2>${lboard(l.leaderboard, l.nickname)}<div class="mt-space-md">${btn('pri', 'กลับ Portal', 'data-a="go" data-v="home"', 'home')}</div></div>`, 'max-w-3xl');
  }
};

function render() {
  const noHead = view === 'exam' || (view === 'live' && LIVE && LIVE.status === 'question');
  $('#app').innerHTML = (noHead ? '' : head()) + V[view]() + (view === 'exam' ? '' : foot());
  renderMath($('#app'));
  if (view === 'exam') tick();
  const key = view + (LIVE ? LIVE.status : '') + (X ? X.i : '') + (R ? R.id : '');
  if (key !== lastKey) { lastKey = key; window.scrollTo(0, 0); }
}
function tick() {
  if (!X) return; const e = $('#tm'); if (!e) return;
  let warn = false;
  if (X.end) { const l = Math.max(0, Math.round((X.end - Date.now()) / 1e3)); e.textContent = fmt(l); warn = l < 300; if (!l) A.sub(true); }
  else e.textContent = fmt(Math.round((Date.now() - X.t0) / 1e3));
  const p = e.parentElement; p.classList.toggle('warn', warn); const i = $('#tmi'); if (i) i.textContent = warn ? 'warning' : 'timer';
}

// ---------- Actions ----------
const A = {
  go(v) {
    if (X && view === 'exam') return;
    if (view === 'edit' && SDIRTY && !confirm('มีการแก้ไขที่ยังไม่ได้บันทึก ต้องการออกโดยไม่บันทึกใช่หรือไม่?')) return;
    SDIRTY = false; view = v; render();
    if (v === 'hist') A.histAll(HALL); if (v === 'admin') A.loadAdmin(); if (v === 'home') loadSets().then(() => view === 'home' && render());
  },
  cat(v) { cat = v; render(); }, cm: closeM, cb() { closeM(); CB && CB(); }, rf(v) { RF = v; render(); }, print() { window.print(); },

  // ---- auth ----
  authm(m) {
    const em = $('#aem')?.value || '', nm = $('#anm')?.value || ''; AUTHMODE = m === 'register' ? 'register' : 'login';
    const reg = AUTHMODE === 'register', tab = (k, l) => `<button type="button" data-a="authm" data-v="${k}" class="flex-1 py-2 rounded font-label-lg text-label-lg ${AUTHMODE === k ? 'bg-surface-container-lowest shadow-sm text-on-surface' : 'text-on-surface-variant'}">${l}</button>`;
    modal(`<h3 class="font-headline-sm text-headline-sm mb-space-md">${reg ? 'สมัครสมาชิก' : 'เข้าสู่ระบบ'}</h3><div class="flex p-1 rounded-lg bg-surface-container-low mb-space-sm">${tab('login', 'เข้าสู่ระบบ')}${tab('register', 'สมัครสมาชิกใหม่')}</div>
    <label class="${LBL}" for="aem">อีเมล</label><input class="${INP}" id="aem" type="email" autocomplete="email" value="${esc(em)}" onkeydown="if(event.key==='Enter')A.authSubmit()">
    <label class="${LBL}" for="apw">รหัสผ่าน${reg ? ' (อย่างน้อย 6 ตัว)' : ''}</label><input class="${INP}" id="apw" type="password" autocomplete="${reg ? 'new-password' : 'current-password'}" onkeydown="if(event.key==='Enter')A.authSubmit()">
    ${reg ? `<label class="${LBL}" for="anm">ชื่อที่แสดง</label><input class="${INP}" id="anm" placeholder="ชื่อของคุณ" value="${esc(nm)}" onkeydown="if(event.key==='Enter')A.authSubmit()">` : ''}
    <div id="aerr" class="${BADBOX} mt-space-md" style="display:none" role="alert"></div>
    <div class="flex flex-wrap gap-2 justify-end mt-space-lg">${btn('sec', 'ยกเลิก', 'data-a="cm"')}${btn('pri', reg ? 'สมัครสมาชิก' : 'เข้าสู่ระบบ', 'data-a="authSubmit"')}</div>`);
  },
  async authSubmit() {
    const email = $('#aem').value.trim(), pw = $('#apw').value, name = ($('#anm')?.value || '').trim(), err = $('#aerr'), reg = AUTHMODE === 'register';
    try {
      const r = await api(reg ? '/api/auth/register' : '/api/auth/login', { body: reg ? { email, password: pw, name } : { email, password: pw } });
      setToken(r.token); me = r.user; if (socket) { socket.disconnect(); socket = null; }
      closeM(); await loadSets(); if (adm()) await A.loadAdmin(); view = 'home'; render(); toast('ยินดีต้อนรับ ' + r.user.name);
    } catch (e) { err.style.display = ''; err.textContent = e.message; }
  },
  out() { setToken(null); me = null; HALL = false; if (socket) { socket.disconnect(); socket = null; } LIVE = null; view = 'home'; render(); },
  histAll(all) { HALL = !!all; api('/api/results' + (adm() && all ? '?all=1' : '')).then(r => { resultsList = r; render(); }).catch(() => { }); },
  async loadAdmin() { if (!adm()) return; try { adminUsers = await api('/api/admin/users'); } catch (e) { /* ข้าม */ } render(); },
  role(v) { const [id, role] = v.split('|'); api('/api/admin/users/' + id + '/role', { method: 'PUT', body: { role: role === 'admin' ? 'user' : 'admin' } }).then(() => A.loadAdmin()); },
  async open(id) {
    try { const r = await api('/api/results/' + id); if (!Array.isArray(r.detail)) return toast('ผลจากห้องสอบสดไม่มีรายละเอียดรายข้อ'); R = r; RF = 'all'; view = 'result'; render(); }
    catch (e) { toast(e.message); }
  },

  // ---- admin: sets / questions ----
  async sadd() { try { const s = await api('/api/admin/sets', { body: { title: 'ชุดข้อสอบใหม่', cat: 'ทั่วไป', time: 10, desc: '' } }); await loadSets(); edSet = await api('/api/admin/sets/' + s.id); EID = s.id; SDIRTY = false; view = 'edit'; render(); } catch (e) { toast(e.message); } },
  async sed(id) { edSet = await api('/api/admin/sets/' + id); EID = id; SDIRTY = false; view = 'edit'; render(); },
  sdel(id) { ask('ลบชุดข้อสอบนี้?', async () => { await api('/api/admin/sets/' + id, { method: 'DELETE' }); await loadSets(); render(); }, 'ลบ', true); },
  setField(k, v) { edSet[k] = v; SDIRTY = true; document.querySelectorAll('.ssaveBtn').forEach(b => { b.className = BTN.pri + ' ssaveBtn'; b.innerHTML = ic('save', '!text-[18px]') + 'บันทึกการเปลี่ยนแปลง'; }); const bar = $('#dirtyBar'); if (bar) bar.style.display = ''; },
  async ssave() { try { await api('/api/admin/sets/' + EID, { method: 'PUT', body: { title: edSet.title, cat: edSet.cat, time: edSet.time, desc: edSet.desc, is_public: edSet.is_public } }); await loadSets(); SDIRTY = false; render(); toast('บันทึกการเปลี่ยนแปลงแล้ว'); } catch (e) { toast(e.message); } },
  qdel(id) { ask('ลบข้อสอบข้อนี้?', async () => { if (SDIRTY) await A.ssave(); await api('/api/admin/questions/' + id, { method: 'DELETE' }); edSet = await api('/api/admin/sets/' + EID); await loadSets(); render(); }, 'ลบ', true); },

  qed(id) {
    QID = id || null; const src = id ? edSet.questions.find(x => String(x.id) === String(id)) : null;
    edQ = src ? JSON.parse(JSON.stringify(src)) : { type: 'mc', q: '', q_image: null, choices: [{ text: '', image: null }, { text: '', image: null }], answer: 0, saAnswer: '', explanation: '', section_note: '' };
    if (edQ.type === 'sa') edQ.saAnswer = (edQ.answer || []).join('\n');
    modal(A.qEditorHtml(), true);
  },
  qEditorHtml() {
    const q = edQ, fileIn = (cb) => `<input type="file" accept="image/*" class="font-body-sm text-body-sm" onchange="${cb}">`;
    const mcBlock = () => `<label class="${LBL}">ตัวเลือกคำตอบ (แต่ละข้อใส่ข้อความและ/หรือรูปภาพได้)</label>${(q.choices || []).map((c, i) => `<div class="flex flex-wrap items-start gap-2 p-3 mb-2 rounded-lg bg-surface-container-low"><span class="w-7 h-7 mt-2 rounded-full bg-surface-container grid place-items-center font-label-md text-label-md">${L[i]}</span><div class="flex-1 min-w-[180px] flex flex-col gap-2"><input class="${INP}" placeholder="ข้อความตัวเลือก (เว้นว่างได้ถ้าใช้รูป)" value="${esc(c.text || '')}" oninput="edQ.choices[${i}].text=this.value">${c.image ? `<div class="flex items-center gap-2"><img class="w-14 h-14 object-cover rounded-lg border border-[#E2E8F0]" alt="" src="${esc(c.image)}">${btn('del', 'ลบรูป', `onclick="edQ.choices[${i}].image=null;A.refreshQ()"`, '', true)}</div>` : fileIn(`A.qImg(this.files[0],'c',${i})`)}</div><label class="inline-flex items-center gap-1 mt-3 font-label-md text-label-md whitespace-nowrap"><input type="radio" class="accent-[#1E40AF]" name="qans" ${q.answer === i ? 'checked' : ''} onchange="edQ.answer=${i}">ถูกต้อง</label>${q.choices.length > 2 ? `<button type="button" aria-label="ลบตัวเลือก" class="mt-2 p-1 rounded-full text-error hover:bg-error-container/40" onclick="edQ.choices.splice(${i},1);if(edQ.answer>=edQ.choices.length)edQ.answer=0;A.refreshQ()">${ic('close')}</button>` : ''}</div>`).join('')}${btn('sec', 'เพิ่มตัวเลือก', 'onclick="edQ.choices.push({text:\'\',image:null});A.refreshQ()"', 'add', true)}`;
    const saBlock = () => `<label class="${LBL}">คำตอบที่ยอมรับ (1 บรรทัดต่อ 1 คำตอบ ไม่สนตัวพิมพ์เล็ก/ใหญ่)</label><textarea class="${INPA}" rows="3" oninput="edQ.saAnswer=this.value">${esc(q.saAnswer || '')}</textarea>`;
    return `<h3 class="font-headline-sm text-headline-sm">${QID ? 'แก้ไข' : 'เพิ่ม'}ข้อสอบ</h3>
    <label class="${LBL}">คำอธิบายช่วงตอน (ไม่บังคับ)</label><textarea class="${INPA}" rows="2" placeholder="เช่น ตอนที่ 1: เลือกความหมายที่ถูกต้อง (ข้อ 1-10) — จะแสดงเป็นหัวข้อก่อนข้อนี้ และใช้แยกสถิติรายตอนในหน้าผลสอบ" oninput="edQ.section_note=this.value">${esc(q.section_note || '')}</textarea>
    <label class="${LBL}">รูปแบบคำตอบ</label><select class="${INP}" onchange="edQ.type=this.value;if(edQ.type==='mc'&&(!edQ.choices||!edQ.choices.length)){edQ.choices=[{text:'',image:null},{text:'',image:null}];edQ.answer=0}A.refreshQ()"><option value="mc" ${q.type === 'mc' ? 'selected' : ''}>ปรนัย (เลือกตัวเลือก) — รองรับห้องสอบสด</option><option value="sa" ${q.type === 'sa' ? 'selected' : ''}>อัตนัย (พิมพ์ตอบ คำตอบตายตัว)</option></select>
    <label class="${LBL}">โจทย์ (พิมพ์สูตรได้ เช่น \\( x^2 + 1 \\))</label><textarea class="${INPA}" rows="2" oninput="edQ.q=this.value">${esc(q.q)}</textarea>
    <label class="${LBL}">รูปประกอบโจทย์ (ไม่บังคับ)</label>${q.q_image ? `<div class="flex items-center gap-2"><img class="w-28 h-28 object-cover rounded-lg border border-[#E2E8F0]" alt="" src="${esc(q.q_image)}">${btn('del', 'ลบรูป', 'onclick="edQ.q_image=null;A.refreshQ()"', '', true)}</div>` : fileIn("A.qImg(this.files[0],'q')")}
    ${q.type === 'mc' ? mcBlock() : saBlock()}
    <label class="${LBL}">คำอธิบายเฉลย</label><textarea class="${INPA}" rows="2" oninput="edQ.explanation=this.value">${esc(q.explanation || '')}</textarea>
    <div class="flex flex-wrap gap-2 justify-end mt-space-lg">${btn('sec', 'ยกเลิก', 'data-a="cm"')}${btn('pri', 'บันทึก', 'data-a="qsave"', 'save')}</div>`;
  },
  refreshQ() { modal(A.qEditorHtml(), true); },
  async qImg(file, kind, idx) { if (!file) return; try { const url = await uploadImg(file); if (kind === 'q') edQ.q_image = url; else edQ.choices[idx].image = url; A.refreshQ(); } catch (e) { toast(e.message); } },
  async qsave() {
    const q = edQ, body = { type: q.type, q: (q.q || '').trim(), q_image: q.q_image || null, explanation: (q.explanation || '').trim(), section_note: (q.section_note || '').trim() };
    if (!body.q) return toast('กรุณากรอกโจทย์');
    if (q.type === 'mc') { body.choices = q.choices.map(c => ({ text: (c.text || '').trim(), image: c.image || null })); if (body.choices.some(c => !c.text && !c.image)) return toast('ทุกตัวเลือกต้องมีข้อความหรือรูปภาพ'); body.answer = q.answer; }
    else { const a = (q.saAnswer || '').split('\n').map(x => x.trim()).filter(Boolean); if (!a.length) return toast('ใส่คำตอบที่ถูกอย่างน้อย 1 คำตอบ'); body.answer = a; }
    try { if (SDIRTY) await A.ssave(); if (QID) await api('/api/admin/questions/' + QID, { method: 'PUT', body }); else await api('/api/admin/sets/' + EID + '/questions', { body }); edSet = await api('/api/admin/sets/' + EID); await loadSets(); closeM(); render(); } catch (e) { toast(e.message); }
  },

  // ---- import from file (Upload Dropzone ตาม DESIGN.md) ----
  imp() {
    IMP = [];
    modal(`<h3 class="font-headline-sm text-headline-sm">นำเข้าข้อสอบจากไฟล์</h3><p class="font-body-sm text-body-sm text-on-surface-variant mt-1 mb-space-md">รองรับ Word (.docx), Excel (.xlsx/.xls/.csv), PDF, รูปภาพ (JPG/PNG/GIF/WEBP), Markdown และ .txt — ระบบใช้ AI แยกโจทย์ ตัวเลือก และเฉลยให้อัตโนมัติ แล้วให้คุณตรวจทานก่อนบันทึก</p>
    <div id="dz" class="dz" tabindex="0" role="button" aria-label="เลือกไฟล์ข้อสอบ" onclick="$('#ifl').click()" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();$('#ifl').click()}" ondragover="event.preventDefault();this.classList.add('over')" ondragleave="this.classList.remove('over')" ondrop="event.preventDefault();this.classList.remove('over');A.impRun(event.dataTransfer.files[0])">${ic('cloud_upload', '!text-[36px] text-[#2563EB]')}<div class="font-label-lg text-label-lg">ลากไฟล์มาวางที่นี่ หรือกดเพื่อเลือกไฟล์</div><div class="font-body-sm text-body-sm text-on-surface-variant">ขนาดไม่เกิน 15 MB</div></div>
    <input type="file" id="ifl" class="hidden" accept=".docx,.xlsx,.xls,.csv,.pdf,.txt,.md,image/*" onchange="A.impRun(this.files[0])"><div id="ist" class="mt-space-md"></div>
    <div class="flex justify-end mt-space-md">${btn('sec', 'ปิด', 'data-a="cm"')}</div>`, true);
  },
  async impRun(file) {
    if (!file) return; const set = h => { const e = $('#ist'); if (e) e.innerHTML = h; };
    const pill = `<div class="flex items-center justify-between gap-2 px-3 py-2 rounded-lg bg-surface-container-low">${ic('description', 'text-primary')}<span class="flex-1 truncate font-label-lg text-label-lg">${esc(file.name)}</span><span class="font-label-md text-label-md text-on-surface-variant">${(file.size / 1024).toFixed(0)} KB</span></div>`;
    set(`${pill}<div class="mt-2"><div class="h-1.5 rounded-full bg-[#E2E8F0] overflow-hidden"><div class="h-full w-1/3 rounded-full bg-primary-container animate-pulse"></div></div><div class="font-label-md text-label-md text-on-surface-variant mt-1">กำลังอ่านและแยกข้อสอบ… (ไฟล์รูปภาพ/PDF อาจใช้เวลาถึง 1 นาที)</div></div>`);
    try { const fd = new FormData(); fd.append('file', file); const r = await api('/api/admin/import', { body: fd }); IMP = r.questions.map(x => ({ ...x, on: true })); set(pill + A.impListHtml(r.source)); }
    catch (e) { set(`${pill}<div class="${BADBOX} mt-2" role="alert">${esc(e.message)}</div>`); }
  },
  impListHtml(source) {
    return `<div class="${OKBOX} mt-2">พบ ${IMP.length} ข้อ (แยกโดย${esc(source)}) — ตรวจสอบก่อนเพิ่มเข้าชุดข้อสอบ</div><div class="max-h-[40vh] overflow-auto mt-2">${IMP.map((x, i) => `<div class="mb-2"><input class="${INP} !h-9 !text-body-sm !bg-[#FEF3C7] !text-[#92400E] !border-transparent mb-1" placeholder="คำอธิบายช่วงตอน (ไม่บังคับ) เช่น ตอนที่ 1: ... (ข้อ 1-10)" value="${esc(x.section_note || '')}" oninput="IMP[${i}].section_note=this.value"><label class="opt !mb-0 items-start"><input type="checkbox" class="accent-[#1E40AF] mt-1" ${x.on ? 'checked' : ''} onchange="IMP[${i}].on=this.checked"><span class="flex-1"><span class="inline-block px-2 py-0.5 rounded-full bg-surface-container-high font-label-sm text-label-sm mr-1">${x.t === 'mc' ? 'ปรนัย' : 'อัตนัย'}</span>${esc(x.q)}<div class="text-on-surface-variant font-body-sm text-body-sm">${x.t === 'mc' ? x.ch.map((c, k) => (k === x.a ? '✅ ' : '') + L[k] + '. ' + esc(c)).join(' · ') : 'เฉลย: ' + esc(x.a.join(' / '))}</div></span></label></div>`).join('')}</div><div class="flex justify-end mt-2">${btn('pri', 'เพิ่มเข้าชุดข้อสอบ', 'data-a="impAdd"', 'playlist_add')}</div>`;
  },
  async impAdd() {
    const sel = IMP.filter(x => x.on).map(({ on, ...x }) => x); if (!sel.length) return toast('เลือกอย่างน้อย 1 ข้อ');
    try { if (SDIRTY) await A.ssave(); const r = await api('/api/admin/sets/' + EID + '/questions/bulk', { body: { questions: sel } }); edSet = await api('/api/admin/sets/' + EID); await loadSets(); closeM(); render(); toast('เพิ่ม ' + r.added + ' ข้อแล้ว'); } catch (e) { toast(e.message); }
  },

  // ---- taking an exam ----
  setup(id) {
    const s = sets.find(x => x.id === id); if (!s) return; const nm = s.mcCount, ns = s.saCount;
    const radio = (name, val, title, sub, checked, dis) => `<label class="opt ${dis ? 'opacity-40 pointer-events-none' : ''}"><input type="radio" class="sr-only" name="${name}" value="${val}" ${checked ? 'checked' : ''} ${dis ? 'disabled' : ''}><span class="ind" aria-hidden="true"></span><span><span class="font-label-lg text-label-lg block">${title}</span><span class="font-body-sm text-body-sm text-on-surface-variant">${sub}</span></span></label>`;
    modal(`<h3 class="font-headline-sm text-headline-sm">${esc(s.title)}</h3><p class="font-body-sm text-body-sm text-on-surface-variant">${s.qCount} ข้อ · ${s.time ? s.time + ' นาที' : 'ไม่จำกัดเวลา'}</p>
    ${!me ? `<label class="${LBL}" for="gname">ชื่อที่ใช้แสดงผล (ทำในฐานะผู้เยี่ยมชม)</label><input class="${INP}" id="gname" placeholder="ชื่อของคุณ">` : ''}
    <div class="font-label-lg text-label-lg mt-space-md mb-2">โหมดการสอบ</div>${radio('md', 'm', 'โหมดสอบจริง', 'จับเวลา · ดูเฉลยหลังส่งข้อสอบ', true)}${radio('md', 'p', 'โหมดฝึกฝน', 'ไม่จับเวลา · ตรวจและดูเฉลยทีละข้อ')}
    <div class="font-label-lg text-label-lg mt-space-sm mb-2">รูปแบบข้อสอบ</div>${radio('fm', 'all', 'แบบผสม ปรนัย + อัตนัย', s.qCount + ' ข้อ', true)}${radio('fm', 'mc', 'ปรนัยล้วน', nm + ' ข้อ', false, !nm)}${radio('fm', 'sa', 'อัตนัยล้วน', ns + ' ข้อ', false, !ns)}
    <label class="inline-flex items-center gap-2 mt-space-sm font-label-lg text-label-lg"><input type="checkbox" id="shf" class="w-4 h-4 accent-[#1E40AF]">สลับลำดับข้อสอบ</label>
    <div class="flex flex-wrap gap-2 justify-end mt-space-lg">${btn('sec', 'ยกเลิก', 'data-a="cm"')}${btn('pri', 'เริ่มสอบ', `data-a="start" data-v="${id}"`, 'play_arrow')}</div>`);
  },
  async start(id) {
    const md = $('input[name=md]:checked').value, fm = $('input[name=fm]:checked').value, shuffle = $('#shf').checked, gname = $('#gname');
    if (gname && !gname.value.trim()) return toast('กรุณากรอกชื่อที่ใช้แสดงผล');
    try {
      const r = await api('/api/exam/start', { body: { setId: id, mode: md, format: fm, shuffle } });
      X = { sid: r.sessionId, title: r.set.title, qs: r.questions, ans: {}, flag: {}, fb: {}, qt: {}, i: 0, mode: md, t0: Date.now(), lap: Date.now(), end: md === 'm' && r.set.time ? Date.now() + r.set.time * 6e4 : 0, away: 0, guestName: gname ? gname.value.trim() : null };
      closeM(); RF = 'all'; view = 'exam'; render(); clearInterval(tm); tm = setInterval(tick, 1000);
    } catch (e) { toast(e.message); }
  },
  lap() { if (!X) return; const now = Date.now(), id = X.qs[X.i].id; X.qt[id] = (X.qt[id] || 0) + (now - X.lap) / 1000; X.lap = now; },
  pick(v) { const q = X.qs[X.i]; X.ans[q.id] = +v; if (X.mode === 'p') A.checkAns(q.id, +v); render(); },
  async chk() { const q = X.qs[X.i]; if (X.mode !== 'p' || X.fb[q.id]) return; const v = $('#sa')?.value; if (!(v || '').trim()) return toast('กรุณาพิมพ์คำตอบก่อน'); X.ans[q.id] = v; await A.checkAns(q.id, v); },
  async checkAns(qid, val) { try { const r = await api('/api/exam/' + X.sid + '/check', { body: { questionId: qid, answer: val } }); X.fb[qid] = { ok: r.ok, rightAnswer: r.rightAnswer, explanation: r.explanation, rightIdx: r.rightIndex }; render(); } catch (e) { toast(e.message); } },
  nx() { A.lap(); X.i++; render(); }, pv() { A.lap(); X.i--; render(); }, jp(v) { A.lap(); X.i = +v; render(); },
  fl() { const id = X.qs[X.i].id; X.flag[id] = !X.flag[id]; render(); },
  sub(auto) {
    const un = X.qs.filter(q => X.ans[q.id] == null || X.ans[q.id] === '').length, fl = Object.values(X.flag).filter(Boolean).length;
    if (auto) return A.finish();
    ask(`ส่งข้อสอบหรือไม่?<div class="font-body-sm text-body-sm text-on-surface-variant font-normal mt-1">ยังไม่ได้ตอบ ${un} ข้อ · ปักธงไว้ ${fl} ข้อ</div>`, A.finish, 'ส่งข้อสอบ');
  },
  async finish() {
    A.lap(); clearInterval(tm); closeM();
    try {
      const r = await api('/api/exam/' + X.sid + '/submit', { body: { answers: X.ans, qtimes: X.qt, sec: Math.round((Date.now() - X.t0) / 1e3), away: X.away, guestName: X.guestName } });
      R = await api('/api/results/' + r.id); RF = 'all'; X = null; view = 'result'; render(); if (me) A.histAll(HALL);
    } catch (e) { toast(e.message); }
  },

  // ---- live rooms ----
  connectSocket() {
    if (socket) return socket; socket = io({ auth: { token: token || undefined }, transports: ['websocket'] });
    socket.on('room:players', list => { if (LIVE) { LIVE.players = list; render(); } });
    socket.on('room:question', q => { if (LIVE) { LIVE.status = 'question'; LIVE.question = q; LIVE.myAnswered = false; LIVE.lastReveal = null; render(); clearInterval(liveTick); liveTick = setInterval(() => { const f = $('.tbar-f'); if (f) f.style.width = timeLeftPct() + '%'; }, 250); } });
    socket.on('room:reveal', d => { if (LIVE) { clearInterval(liveTick); LIVE.status = 'reveal'; LIVE.lastReveal = d; render(); } });
    socket.on('room:ended', d => { if (LIVE) { clearInterval(liveTick); LIVE.status = 'ended'; LIVE.leaderboard = d.leaderboard; render(); } });
    socket.on('room:hostLeft', () => { if (LIVE) { toast('ผู้เปิดห้องออกจากห้องแล้ว'); LIVE = null; clearInterval(liveTick); view = 'home'; render(); } });
    return socket;
  },
  hostRoom(setId) { if (!me) return toast('เข้าสู่ระบบก่อนเพื่อเปิดห้องสอบสด'); const sk = A.connectSocket(); sk.emit('host:create', { setId }, res => { if (res.error) return toast(res.error); LIVE = { role: 'host', pin: res.pin, title: res.title, total: res.total, players: [], status: 'lobby' }; view = 'live'; render(); }); },
  joinRoom() { const pin = $('#jpin')?.value.trim(), nick = $('#jnick')?.value.trim(); if (!pin || !nick) return toast('กรอก PIN และชื่อเล่นให้ครบ'); const sk = A.connectSocket(); sk.emit('player:join', { pin, nickname: nick }, res => { if (res.error) return toast(res.error); LIVE = { role: 'player', pin, title: res.title, nickname: nick, status: 'lobby', myAnswered: false }; view = 'live'; render(); }); },
  liveStart() { socket.emit('host:start', { pin: LIVE.pin }, res => { res && res.error && toast(res.error); }); },
  liveNext() { socket.emit('host:next', { pin: LIVE.pin }, res => { res && res.error && toast(res.error); }); },
  liveAnswer(v) { if (!LIVE || LIVE.myAnswered) return; LIVE.myAnswered = true; render(); socket.emit('player:answer', { pin: LIVE.pin, answer: +v }, res => { if (res && res.error) { toast(res.error); return; } LIVE.myLastCorrect = res.correct; LIVE.myLastPoints = res.points; }); },
};
document.addEventListener('click', e => { const b = e.target.closest('[data-a]'); if (b && A[b.dataset.a]) A[b.dataset.a](b.dataset.v); });
// นับครั้งที่ออกจากหน้าจอระหว่างสอบจริง (แสดงเป็นคำเตือนในหน้าผลสอบ)
document.addEventListener('visibilitychange', () => { if (document.hidden && X && X.mode === 'm') X.away++; });
window.addEventListener('beforeunload', e => { if (SDIRTY) { e.preventDefault(); e.returnValue = ''; } });
boot();

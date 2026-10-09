// app.js — หน้าเว็บ ExamFlow (เปลือก/ดีไซน์จาก Stitch) เชื่อมกับ backend ของ ExamHub
// ใช้ Tailwind config + design tokens จาก index.html (ที่มาจาก Stitch) ไม่ได้เปลี่ยนค่าสีหรือฟอนต์ใดๆ
(() => {
const $ = (s, r = document) => r.querySelector(s), $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const L = 'กขคงจฉชซฌ';
const fmt = s => String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(Math.floor(s % 60)).padStart(2, '0');
const dt = ms => new Date(+ms).toLocaleString('th-TH', { dateStyle: 'medium', timeStyle: 'short' });

// ----- class ชุดกลางตาม DESIGN.md -----
const K = {
  wrap: 'w-full max-w-7xl mx-auto px-margin-mobile md:px-margin py-space-lg flex flex-col gap-space-lg',
  card: 'rounded-xl bg-surface-container-lowest border border-[#E2E8F0] p-space-lg',
  pri: 'h-11 px-space-lg rounded-lg bg-primary-container text-on-primary font-label-lg text-label-lg hover:opacity-90 transition disabled:opacity-50',
  ghost: 'h-11 px-space-lg rounded-lg border border-[#CBD5E1] text-[#0F172A] font-label-lg text-label-lg hover:bg-[#F1F5F9] transition',
  flag: 'h-11 px-space-lg rounded-lg bg-[#FEF3C7] text-[#92400E] border border-[#FDE68A] font-label-lg text-label-lg',
  inp: 'w-full h-11 px-space-md rounded-lg border border-[#CBD5E1] bg-white focus:outline-none focus:border-primary-container focus:ring-4 focus:ring-[#2563EB]/15',
  ta: 'w-full px-space-md py-space-sm rounded-lg border border-[#CBD5E1] bg-white focus:outline-none focus:border-primary-container focus:ring-4 focus:ring-[#2563EB]/15',
  h1: 'font-headline-lg text-headline-lg text-on-surface',
  h2: 'font-headline-sm text-headline-sm text-on-surface',
  mut: 'text-body-sm text-[#64748B]',
  lbl: 'font-label-md text-label-md text-on-surface-variant',
  badge: 'inline-flex items-center px-space-sm py-0.5 rounded-full font-label-sm text-label-sm',
};
const tile = (state) => 'w-full min-h-[52px] flex items-center gap-space-md text-left px-space-md py-space-sm rounded-lg border transition ' + ({
  sel: 'bg-[#EFF6FF] border-primary-container border-[1.5px]',
  ok: 'bg-secondary-container/60 border-secondary',
  bad: 'bg-error-container border-error',
  dim: 'bg-surface-container-lowest border-[#E2E8F0] opacity-70',
  idle: 'bg-surface-container-lowest border-[#E2E8F0] hover:border-[#CBD5E1] hover:shadow-sm cursor-pointer',
}[state || 'idle']);
const dot = (i, state) => `<span class="w-7 h-7 shrink-0 rounded-full flex items-center justify-center font-label-md text-label-md ${state === 'ok' ? 'bg-secondary text-on-secondary' : state === 'bad' ? 'bg-error text-on-error' : state === 'sel' ? 'bg-primary-container text-on-primary' : 'bg-surface-container text-on-surface-variant'}">${L[i] || i + 1}</span>`;
const icon = n => `<span class="material-symbols-outlined">${n}</span>`;

// ----- state -----
let token = localStorage.getItem('examflow.token'), me = null, sets = [], socket = null;
let view = 'portal', F = { q: '', cat: '' };
let X = null, R = null, RF = 'all', HIST = [], HALL = false, SHOWDEMO = false;
let EDS = null, USERS = [], QF = null, IMP = null, LIVE = null, timerId = null, liveId = null;
const isAdmin = () => me && me.role === 'admin';

async function api(p, o = {}) {
  const h = {}; if (token) h.Authorization = 'Bearer ' + token;
  let body = o.body;
  if (body && !(body instanceof FormData)) { h['Content-Type'] = 'application/json'; body = JSON.stringify(body); }
  const r = await fetch(p, { method: o.method || (body ? 'POST' : 'GET'), headers: h, body });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error || 'เกิดข้อผิดพลาด (' + r.status + ')');
  return d;
}
function toast(m) {
  const t = document.createElement('div');
  t.className = 'fixed bottom-6 left-1/2 -translate-x-1/2 z-[80] px-space-lg py-space-sm rounded-lg bg-inverse-surface text-inverse-on-surface font-label-lg text-label-lg shadow-lg';
  t.textContent = m; document.body.appendChild(t); setTimeout(() => t.remove(), 3200);
}
function modal(html, wide) {
  closeM();
  const d = document.createElement('div'); d.id = 'ov';
  d.className = 'fixed inset-0 z-[60] bg-[#0F172A]/60 backdrop-blur-[4px] flex items-center justify-center p-4';
  d.innerHTML = `<div class="w-full ${wide ? 'max-w-3xl' : 'max-w-lg'} max-h-[90vh] overflow-auto rounded-xl bg-white p-space-lg shadow-[0_20px_25px_-5px_rgba(15,23,42,0.12)] flex flex-col gap-space-md">${html}</div>`;
  document.body.appendChild(d);
}
function closeM() { const o = $('#ov'); if (o) o.remove(); }
let CB = null;
function ask(msg, fn, label = 'ยืนยัน') {
  CB = fn;
  modal(`<h3 class="${K.h2}">${msg}</h3><div class="flex justify-end gap-space-sm"><button class="${K.ghost}" data-a="cm">ยกเลิก</button><button class="${K.pri}" data-a="cok">${label}</button></div>`);
}

// ----- routing -----
const NAVMAP = { portal: 'exam-portal', exam: 'exam-portal', live: 'live-exam', manage: 'exam-management', edit: 'exam-management', results: 'results-analytics', result: 'results-analytics' };
const PATH2VIEW = { 'exam-portal': 'portal', 'live-exam': 'live', 'exam-management': 'manage', 'results-analytics': 'results' };
function go(v) { view = v; if (v === 'results') loadHist(); if (v === 'manage') loadAdmin(); render(); window.scrollTo(0, 0); }
function nav() {
  const act = ($('nav[data-active-classes]').dataset.activeClasses || '').split(' ').filter(Boolean);
  $$('nav a[data-path]').forEach(a => {
    const on = a.dataset.path === NAVMAP[view];
    act.forEach(c => a.classList.toggle(c, on));
    a.classList.toggle('text-on-surface-variant', !on);
    on ? a.setAttribute('aria-current', 'page') : a.removeAttribute('aria-current');
  });
}
function userBox() {
  let b = $('#userbox');
  if (!b) {
    b = document.createElement('div'); b.id = 'userbox'; b.className = 'flex items-center gap-space-sm';
    const right = $('header > div > div:last-child'); right.insertBefore(b, right.firstChild);
  }
  b.innerHTML = me
    ? `<span class="hidden sm:inline font-label-md text-label-md text-on-surface-variant">${esc(me.name)}${isAdmin() ? ' · แอดมิน' : ''}</span><button class="px-space-md py-space-xs rounded-lg border border-[#CBD5E1] font-label-md text-label-md hover:bg-[#F1F5F9]" data-a="logout">ออกจากระบบ</button>`
    : `<button class="px-space-md py-space-xs rounded-lg bg-primary-container text-on-primary font-label-md text-label-md" data-a="authm">เข้าสู่ระบบ</button>`;
}

// ----- data loaders -----
async function loadSets() { try { sets = await api('/api/sets'); } catch (e) { sets = []; } }
async function loadHist() { try { HIST = await api('/api/results' + (isAdmin() && HALL ? '?all=1' : '')); } catch (e) { HIST = []; } if (view === 'results') render(); }
async function loadAdmin() { if (!isAdmin()) return; try { USERS = await api('/api/admin/users'); } catch (e) { } if (view === 'manage') render(); }

// ----- views -----
const V = {};
const page = inner => `<div class="${K.wrap}">${inner}</div>`;
const needLogin = msg => page(`<div class="${K.card} text-center flex flex-col items-center gap-space-md"><h2 class="${K.h2}">${msg}</h2><button class="${K.pri}" data-a="authm">เข้าสู่ระบบ / สมัครสมาชิก</button></div>`);

// ===== Portal ข้อสอบ =====
function gridHtml() {
  const q = F.q.toLowerCase();
  const list = sets.filter(s => (!F.cat || s.cat === F.cat) && (!q || (s.title + ' ' + s.desc).toLowerCase().includes(q)));
  if (!list.length) return `<div class="${K.card} text-center ${K.mut} col-span-full">ไม่พบชุดข้อสอบที่ตรงกับเงื่อนไข</div>`;
  return list.map(s => `<article class="${K.card} flex flex-col gap-space-md hover:shadow-[0_2px_4px_-1px_rgba(15,23,42,0.04),0_4px_6px_-1px_rgba(15,23,42,0.06)] transition">
    <div class="flex items-center justify-between gap-space-sm"><span class="${K.badge} bg-primary-fixed text-on-primary-fixed-variant">${esc(s.cat)}</span>${s.is_public ? '' : `<span class="${K.badge} bg-[#FEF3C7] text-[#92400E]">ไม่เผยแพร่</span>`}</div>
    <div><h3 class="font-headline-sm text-headline-sm">${esc(s.title)}</h3><p class="${K.mut} mt-1">${esc(s.desc || '')}</p></div>
    <div class="flex flex-wrap gap-space-md ${K.mut}"><span>${s.qCount} ข้อ</span><span>ปรนัย ${s.mcCount}</span><span>อัตนัย ${s.saCount}</span><span>${s.time ? s.time + ' นาที' : 'ไม่จำกัดเวลา'}</span></div>
    <div class="flex flex-wrap gap-space-sm mt-auto"><button class="${K.pri}" data-a="start" data-v="${s.id}">เริ่มทำข้อสอบ</button>${me && s.mcCount ? `<button class="${K.ghost}" data-a="hostRoom" data-v="${s.id}">เปิดห้องสอบสด</button>` : ''}</div>
  </article>`).join('');
}
V.portal = () => {
  const cats = [...new Set(sets.map(s => s.cat))];
  return page(`<div class="flex flex-col md:flex-row md:items-end md:justify-between gap-space-md">
    <div><h1 class="${K.h1}">Portal ข้อสอบ</h1><p class="${K.mut}">เลือกชุดข้อสอบแล้วเริ่มทำได้ทันที — ไม่ต้องมีบัญชี ตรวจคำตอบที่เซิร์ฟเวอร์ทั้งหมด</p></div>
    <input class="${K.inp} md:max-w-xs" data-i="q" placeholder="ค้นหาชุดข้อสอบ" value="${esc(F.q)}"></div>
    <div class="flex flex-wrap gap-space-sm"><button class="${K.badge} ${!F.cat ? 'bg-primary-container text-on-primary' : 'bg-surface-container text-on-surface-variant'}" data-a="cat" data-v="">ทั้งหมด</button>${cats.map(c => `<button class="${K.badge} ${F.cat === c ? 'bg-primary-container text-on-primary' : 'bg-surface-container text-on-surface-variant'}" data-a="cat" data-v="${esc(c)}">${esc(c)}</button>`).join('')}</div>
    <div id="grid" class="grid gap-gutter sm:grid-cols-2 lg:grid-cols-3">${gridHtml()}</div>`);
};

// ===== ทำข้อสอบ (Exam room: canvas ซ้าย + palette ขวา ตาม DESIGN.md) =====
const answered = q => X.ans[q.id] !== undefined && X.ans[q.id] !== '' && X.ans[q.id] !== null;
V.exam = () => {
  const q = X.qs[X.i], fb = X.fb[q.id], a = X.ans[q.id];
  const done = X.qs.filter(answered).length, pct = Math.round(done / X.qs.length * 100);
  let body;
  if (q.type === 'mc') {
    body = q.choices.map((c, i) => {
      let st = a === i ? 'sel' : 'idle';
      if (fb) st = i === fb.rightIndex ? 'ok' : a === i ? 'bad' : 'dim';
      return `<button class="${tile(st)}" ${fb ? 'disabled' : ''} data-a="pick" data-v="${i}">${dot(i, st)}<span class="flex-1 flex flex-col gap-1"><span>${esc(c.text)}</span>${c.image ? `<img src="${esc(c.image)}" class="max-h-40 rounded-lg object-contain self-start">` : ''}</span></button>`;
    }).join('');
  } else {
    body = `<input id="sa" class="${K.inp}" data-i="sa" placeholder="พิมพ์คำตอบของคุณ" autocomplete="off" value="${esc(a || '')}" ${fb ? 'disabled' : ''}>`;
  }
  const fbHtml = fb ? `<div class="rounded-lg p-space-md ${fb.ok ? 'bg-secondary-container/50 text-on-secondary-container' : 'bg-error-container text-on-error-container'}"><b>${fb.ok ? 'ถูกต้อง' : 'ยังไม่ถูก'}</b> · เฉลย: ${esc(fb.rightAnswer)}${fb.explanation ? `<div class="mt-1">${esc(fb.explanation)}</div>` : ''}</div>` : '';
  const pal = X.qs.map((x, i) => {
    const cls = i === X.i ? 'ring-2 ring-primary-container bg-[#EFF6FF] text-primary-container' : X.flag[x.id] ? 'bg-[#F59E0B] text-white' : answered(x) ? 'bg-[#0D9488] text-white' : 'bg-[#F8FAFC] text-[#64748B] border border-[#E2E8F0]';
    return `<button class="w-9 h-9 rounded-full font-label-md text-label-md tabular-nums ${cls}" data-a="jump" data-v="${i}">${i + 1}</button>`;
  }).join('');
  return page(`<div class="flex flex-col lg:flex-row gap-gutter items-start">
    <section class="w-full lg:flex-1 flex flex-col gap-space-md"><div class="${K.card} flex flex-col gap-space-lg max-w-[780px]">
      <div class="flex items-center justify-between"><span class="${K.badge} bg-primary-fixed text-on-primary-fixed-variant">ข้อ ${X.i + 1} จาก ${X.qs.length}</span>${X.flag[q.id] ? `<span class="${K.badge} bg-[#FEF3C7] text-[#92400E]">ปักธงทบทวน</span>` : ''}</div>
      ${q.section_note ? `<div class="rounded-lg bg-surface-container-low p-space-md ${K.mut} whitespace-pre-wrap">${esc(q.section_note)}</div>` : ''}
      <p class="font-body-lg text-body-lg whitespace-pre-wrap">${esc(q.q)}</p>
      ${q.q_image ? `<img src="${esc(q.q_image)}" class="max-h-72 rounded-lg object-contain self-start border border-[#E2E8F0]">` : ''}
      <div class="flex flex-col gap-space-sm">${body}</div>${fbHtml}
      <div class="flex flex-wrap gap-space-sm justify-between pt-space-md border-t border-[#E2E8F0]">
        <div class="flex gap-space-sm"><button class="${K.ghost}" data-a="prev" ${X.i === 0 ? 'disabled' : ''}>← ก่อนหน้า</button><button class="${K.flag}" data-a="flagq">${X.flag[q.id] ? 'เอาธงออก' : 'ปักธงทบทวน'}</button></div>
        <div class="flex gap-space-sm">${X.mode === 'p' && !fb ? `<button class="${K.ghost}" data-a="check">ตรวจคำตอบ</button>` : ''}${X.i < X.qs.length - 1 ? `<button class="${K.pri}" data-a="next">ถัดไป →</button>` : `<button class="${K.pri}" data-a="sub">ส่งข้อสอบ</button>`}</div>
      </div></div></section>
    <aside class="w-full lg:w-[28%] lg:sticky lg:top-24 flex flex-col gap-space-md">
      <div class="${K.card} flex flex-col gap-space-md shadow-[0_10px_15px_-3px_rgba(15,23,42,0.08)]">
        <div class="flex items-center justify-between"><span class="${K.lbl}">${esc(X.title)}</span><span id="tm" class="px-space-md py-space-xs rounded-full bg-[#F1F5F9] text-[#0F172A] font-label-lg text-label-lg tabular-nums">--:--</span></div>
        <div><div class="h-1.5 rounded-full bg-[#E2E8F0] overflow-hidden"><div class="h-full rounded-full bg-primary-container transition-[width] duration-300 ease-out" style="width:${pct}%"></div></div><p class="${K.mut} mt-1">ตอบแล้ว ${done} จาก ${X.qs.length} ข้อ • ${pct}%</p></div>
        <div class="flex flex-wrap gap-space-sm">${pal}</div>
        <div class="flex flex-wrap gap-space-md ${K.mut}"><span><i class="inline-block w-2 h-2 rounded-full bg-[#0D9488]"></i> ตอบแล้ว</span><span><i class="inline-block w-2 h-2 rounded-full bg-[#F59E0B]"></i> ปักธง</span></div>
        <button class="${K.pri} w-full" data-a="sub">ส่งข้อสอบ</button>
      </div></aside></div>`);
};
function tick() {
  const e = $('#tm'); if (!X || !e) return;
  if (X.time > 0) {
    const left = Math.max(0, Math.round((X.t0 + X.time * 60000 - Date.now()) / 1e3));
    e.textContent = fmt(left);
    const warn = left < 300;
    e.className = 'px-space-md py-space-xs rounded-full font-label-lg text-label-lg tabular-nums ' + (warn ? 'bg-[#FEE2E2] text-[#991B1B] animate-pulse' : 'bg-[#F1F5F9] text-[#0F172A]');
    if (left === 0 && !X.submitting) finish();
  } else e.textContent = fmt((Date.now() - X.t0) / 1e3);
}
document.addEventListener('visibilitychange', () => { if (X && document.hidden && view === 'exam') X.away++; });

// ===== รายละเอียดผลสอบ (เฉลยรายข้อ สไตล์ Itemized Solution Key ของ Stitch) =====
V.result = () => {
  const d = R.detail, ok = d.filter(x => x.correct).length, pct = R.total ? Math.round(R.score / R.total * 100) : 0;
  const shown = d.map((x, i) => ({ x, i })).filter(({ x }) => RF === 'all' || (RF === 'ok' ? x.correct : !x.correct));
  const stat = (label, big, sub, bar, color) => `<div class="${K.card} flex flex-col gap-space-sm"><span class="${K.lbl}">${label}</span><div class="font-headline-lg text-headline-lg tabular-nums">${big}</div><span class="${K.mut}">${sub}</span>${bar != null ? `<div class="h-1.5 rounded-full bg-[#E2E8F0] overflow-hidden"><div class="h-full rounded-full ${color}" style="width:${bar}%"></div></div>` : ''}</div>`;
  const item = ({ x, i }) => {
    const mc = x.type === 'mc';
    const ri = mc ? x.choices.findIndex(z => z.text === x.rightAnswer) : -1;
    const ch = mc ? x.choices.map((c, k) => {
      const isRight = k === ri;
      const st = isRight ? 'ok' : x.given === k ? 'bad' : 'dim';
      return `<div class="${tile(st)}">${dot(k, st)}<span>${esc(c.text)}</span>${isRight ? `<span class="ml-auto text-secondary">${icon('check_circle')}</span>` : x.given === k ? `<span class="ml-auto text-error">${icon('cancel')}</span>` : ''}</div>`;
    }).join('') : `<div class="grid sm:grid-cols-2 gap-space-sm"><div class="rounded-lg p-space-md ${x.correct ? 'bg-secondary-container/60' : 'bg-error-container'}"><div class="${K.lbl}">คำตอบของคุณ</div>${esc(x.given ?? '— ไม่ได้ตอบ —')}</div><div class="rounded-lg p-space-md bg-secondary-container/60"><div class="${K.lbl}">เฉลย</div>${esc(x.rightAnswer)}</div></div>`;
    return `<article class="${K.card} flex flex-col gap-space-md"><div class="flex items-center gap-space-sm"><span class="w-8 h-8 rounded-full flex items-center justify-center font-label-lg text-label-lg text-white ${x.correct ? 'bg-secondary' : 'bg-error'}">${i + 1}</span><span class="${K.badge} ${x.correct ? 'bg-secondary-container text-on-secondary-container' : 'bg-error-container text-on-error-container'}">${x.correct ? 'ตอบถูกต้อง' : (x.given == null ? 'ไม่ได้ตอบ' : 'ตอบไม่ถูกต้อง')}</span></div>
      <p class="whitespace-pre-wrap">${esc(x.q)}</p><div class="flex flex-col gap-space-sm">${ch}</div>
      ${x.explanation ? `<div class="rounded-lg bg-surface-container-low p-space-md"><div class="${K.lbl} text-primary mb-1">คำอธิบายเฉลย</div>${esc(x.explanation)}</div>` : ''}</article>`;
  };
  const tab = (k, t) => `<button class="px-space-md py-space-xs rounded-lg font-label-md text-label-md ${RF === k ? 'bg-surface-container-high text-on-surface' : 'text-on-surface-variant'}" data-a="rf" data-v="${k}">${t}</button>`;
  return page(`<div class="${K.card} flex flex-col md:flex-row md:items-center md:justify-between gap-space-md"><div><h1 class="${K.h1}">${esc(R.title)}</h1><p class="${K.mut}">${dt(R.date)} • ${R.mode === 'p' ? 'โหมดฝึกฝน' : 'โหมดสอบจริง'}</p></div><button class="${K.ghost}" data-a="go" data-v="results">← กลับไปผลสอบทั้งหมด</button></div>
    <div class="grid gap-gutter sm:grid-cols-2 lg:grid-cols-4">
      ${stat('คะแนนรวม', `${R.score} <span class="text-body-lg text-[#64748B]">/ ${R.total}</span>`, `${pct}%`, pct, 'bg-primary-container')}
      ${stat('อันดับในชุดข้อสอบนี้', R.rank ? '#' + R.rank : '-', R.of ? `จาก ${R.of} ครั้ง • เฉลี่ย ${R.avg.toFixed(1)}` : '', null)}
      ${stat('เวลาที่ใช้', R.sec ? Math.round(R.sec / 60) + ' นาที' : '-', R.away ? `ออกจากหน้าจอ ${R.away} ครั้ง` : 'ไม่ออกจากหน้าจอ', null)}
      ${stat('ความแม่นยำ', pct + '%', `ถูก ${ok} ข้อ • ผิด ${R.total - ok} ข้อ`, pct, 'bg-secondary')}</div>
    <div class="flex items-center justify-between"><h2 class="${K.h2}">เฉลยและวิเคราะห์รายข้อ</h2><div class="flex gap-1 p-1 rounded-lg bg-surface-container-low">${tab('all', 'ทั้งหมด (' + d.length + ')')}${tab('ok', 'ตอบถูก (' + ok + ')')}${tab('bad', 'ต้องปรับปรุง (' + (d.length - ok) + ')')}</div></div>
    <div class="flex flex-col gap-space-md">${shown.map(item).join('') || `<p class="${K.mut}">ไม่มีรายการ</p>`}</div>`);
};

// ===== ผลสอบ & สถิติ =====
V.results = () => {
  const rows = HIST.map(r => `<button class="w-full text-left grid grid-cols-12 gap-space-sm items-center px-space-md py-space-sm rounded-lg hover:bg-surface-container-low" data-a="open" data-v="${r.id}"><span class="col-span-12 md:col-span-5 font-label-lg text-label-lg">${esc(r.title)}</span><span class="col-span-4 md:col-span-2 tabular-nums">${r.score}/${r.total}${r.total ? ' (' + Math.round(r.score / r.total * 100) + '%)' : ''}</span><span class="col-span-4 md:col-span-2 ${K.mut}">${r.mode === 'p' ? 'ฝึกฝน' : 'สอบจริง'}</span><span class="col-span-4 md:col-span-3 ${K.mut}">${dt(r.date)}${HALL && r.email ? ' • ' + esc(r.email) : ''}</span></button>`).join('');
  return page(`<div class="flex items-end justify-between flex-wrap gap-space-md"><div><h1 class="${K.h1}">ผลสอบ &amp; สถิติ</h1><p class="${K.mut}">${me ? 'ประวัติการสอบของคุณ' : 'ผลสอบของผู้เยี่ยมชมไม่ถูกเก็บเป็นประวัติ — เข้าสู่ระบบเพื่อดูย้อนหลัง'}</p></div>${isAdmin() ? `<label class="${K.lbl} flex items-center gap-space-sm"><input type="checkbox" data-c="hall" ${HALL ? 'checked' : ''}> แสดงผลของทุกคน</label>` : ''}</div>
    <div class="${K.card} flex flex-col gap-1">${rows || `<p class="${K.mut} text-center py-space-lg">ยังไม่มีผลสอบ</p>`}</div>
    <div class="${K.card} flex items-center justify-between flex-wrap gap-space-md"><div><h2 class="${K.h2}">รายงานต้นแบบจากดีไซน์ Stitch</h2><p class="${K.mut}">หน้ารายงานเดิมจาก Stitch เก็บไว้ครบถ้วน (ข้อมูลในหน้านี้เป็นตัวอย่าง ไม่ใช่ข้อมูลจริง)</p></div><button class="${K.ghost}" data-a="demo">${SHOWDEMO ? 'ซ่อนรายงานต้นแบบ' : 'ดูรายงานต้นแบบ'}</button></div>
    ${SHOWDEMO ? `<div class="rounded-xl border-2 border-dashed border-[#94A3B8] -mx-margin-mobile md:mx-0">${$('#stitch-original').innerHTML}</div>` : ''}`);
};

// ===== ห้องสอบ Live =====
const lbHtml = list => `<ol class="flex flex-col gap-space-sm">${list.slice(0, 10).map((p, i) => `<li class="flex items-center gap-space-md px-space-md py-space-sm rounded-lg bg-surface-container-low"><span class="w-7 h-7 rounded-full bg-primary-container text-on-primary flex items-center justify-center font-label-md text-label-md">${i + 1}</span><span class="flex-1">${esc(p.nickname)}</span><span class="tabular-nums font-label-lg text-label-lg">${p.score}</span></li>`).join('')}</ol>`;
V.live = () => {
  if (!LIVE) {
    const mine = sets.filter(s => s.mcCount);
    return page(`<div><h1 class="${K.h1}">ห้องสอบ Live Exam</h1><p class="${K.mut}">ตอบพร้อมกันแบบเรียลไทม์ คะแนนโบนัสตามความเร็ว</p></div>
      <div class="grid gap-gutter md:grid-cols-2"><div class="${K.card} flex flex-col gap-space-md"><h2 class="${K.h2}">เข้าร่วมด้วย PIN</h2><input id="pin" class="${K.inp} tabular-nums tracking-widest" maxlength="6" inputmode="numeric" placeholder="PIN 6 หลัก"><input id="nick" class="${K.inp}" maxlength="24" placeholder="ชื่อเล่น" value="${esc(me ? me.name : '')}"><button class="${K.pri}" data-a="join">เข้าร่วมห้อง</button></div>
      <div class="${K.card} flex flex-col gap-space-md"><h2 class="${K.h2}">เปิดห้องใหม่</h2>${me ? `<select id="hostSet" class="${K.inp}">${mine.map(s => `<option value="${s.id}">${esc(s.title)} (${s.mcCount} ข้อ)</option>`).join('')}</select><button class="${K.pri}" data-a="hostGo" ${mine.length ? '' : 'disabled'}>เปิดห้องสอบสด</button><p class="${K.mut}">ใช้ได้เฉพาะข้อปรนัย</p>` : `<p class="${K.mut}">ต้องเข้าสู่ระบบก่อนจึงจะเปิดห้องได้</p><button class="${K.ghost}" data-a="authm">เข้าสู่ระบบ</button>`}</div></div>`);
  }
  const host = LIVE.role === 'host', q = LIVE.question;
  const exit = `<button class="${K.ghost}" data-a="liveExit">ออกจากห้อง</button>`;
  if (LIVE.status === 'lobby') return page(`<div class="${K.card} text-center flex flex-col items-center gap-space-md"><span class="${K.lbl}">${esc(LIVE.title)}</span><div class="font-headline-xl text-headline-xl tabular-nums tracking-[0.3em]">${LIVE.pin}</div><p class="${K.mut}">${host ? 'ให้เพื่อนใส่ PIN นี้ที่หน้า Live Exam' : 'รอผู้เปิดห้องเริ่มสอบ…'}</p><div class="flex flex-wrap gap-space-sm justify-center">${LIVE.players.map(p => `<span class="${K.badge} bg-surface-container">${esc(p.nickname)}</span>`).join('') || `<span class="${K.mut}">ยังไม่มีผู้เล่น</span>`}</div><div class="flex gap-space-sm">${host ? `<button class="${K.pri}" data-a="liveStart">เริ่มสอบ</button>` : ''}${exit}</div></div>`);
  if (LIVE.status === 'question') return page(`<div class="${K.card} flex flex-col gap-space-lg max-w-3xl mx-auto w-full"><div class="flex items-center justify-between"><span class="${K.badge} bg-primary-fixed text-on-primary-fixed-variant">ข้อ ${q.qIndex + 1} / ${q.total}</span><div class="flex-1 mx-space-md h-1.5 rounded-full bg-[#E2E8F0] overflow-hidden"><div id="lbar" class="h-full bg-primary-container" style="width:100%"></div></div></div>
    <p class="font-body-lg text-body-lg whitespace-pre-wrap">${esc(q.q)}</p>${q.q_image ? `<img src="${esc(q.q_image)}" class="max-h-60 rounded-lg object-contain self-start">` : ''}
    <div class="flex flex-col gap-space-sm">${q.choices.map((c, i) => `<button class="${tile(LIVE.mine === i ? 'sel' : LIVE.myAnswered ? 'dim' : 'idle')}" ${host || LIVE.myAnswered ? 'disabled' : ''} data-a="liveAns" data-v="${i}">${dot(i, LIVE.mine === i ? 'sel' : '')}<span>${esc(c.text)}</span></button>`).join('')}</div>
    ${host ? `<button class="${K.pri} self-end" data-a="liveNext">แสดงเฉลย</button>` : `<p class="${K.mut}">${LIVE.myAnswered ? 'ส่งคำตอบแล้ว รอเพื่อนๆ…' : 'เลือกคำตอบ'}</p>`}</div>`);
  if (LIVE.status === 'reveal') { const r = LIVE.lastReveal; return page(`<div class="${K.card} flex flex-col gap-space-md max-w-3xl mx-auto w-full"><h2 class="${K.h2}">เฉลย: ${esc(r.rightAnswer)}</h2>${!host && LIVE.myRes ? `<p class="${LIVE.myRes.correct ? 'text-secondary' : 'text-error'} font-label-lg text-label-lg">${LIVE.myRes.correct ? 'ถูกต้อง! +' + LIVE.myRes.points : 'ยังไม่ถูก'}</p>` : ''}${r.explanation ? `<p class="${K.mut}">${esc(r.explanation)}</p>` : ''}<h3 class="${K.lbl}">กระดานผู้นำ</h3>${lbHtml(r.leaderboard)}${host ? `<button class="${K.pri} self-end" data-a="liveNext">ข้อถัดไป →</button>` : ''}</div>`); }
  return page(`<div class="${K.card} flex flex-col gap-space-md max-w-3xl mx-auto w-full"><h2 class="${K.h1}">จบเกม</h2>${lbHtml(LIVE.leaderboard || [])}<button class="${K.pri} self-end" data-a="liveExit">เสร็จสิ้น</button></div>`);
};

// ===== จัดการข้อสอบ (แอดมิน) =====
V.manage = () => {
  if (!me) return needLogin('เข้าสู่ระบบเพื่อจัดการข้อสอบ');
  if (!isAdmin()) return page(`<div class="${K.card} text-center ${K.mut}">ต้องเป็นผู้ดูแลระบบ (ผู้สมัครสมาชิกคนแรกของระบบจะได้สิทธิ์แอดมินอัตโนมัติ)</div>`);
  const rows = sets.map(s => `<div class="flex flex-wrap items-center gap-space-md px-space-md py-space-sm rounded-lg hover:bg-surface-container-low"><div class="flex-1 min-w-[200px]"><div class="font-label-lg text-label-lg">${esc(s.title)}</div><div class="${K.mut}">${esc(s.cat)} • ${s.qCount} ข้อ • ${s.time ? s.time + ' นาที' : 'ไม่จำกัดเวลา'} • ${s.is_public ? 'เผยแพร่' : 'ไม่เผยแพร่'}</div></div><button class="${K.ghost}" data-a="sed" data-v="${s.id}">แก้ไข</button><button class="${K.ghost} text-error" data-a="sdel" data-v="${s.id}">ลบ</button></div>`).join('');
  const urows = USERS.map(u => `<div class="flex items-center gap-space-md px-space-md py-space-sm"><span class="flex-1">${esc(u.name)} <span class="${K.mut}">${esc(u.email)}</span></span><span class="${K.badge} ${u.role === 'admin' ? 'bg-primary-fixed text-on-primary-fixed-variant' : 'bg-surface-container'}">${u.role === 'admin' ? 'แอดมิน' : 'ผู้ใช้'}</span>${u.id !== me.uid && u.id !== me.id ? `<button class="${K.ghost} !h-9" data-a="role" data-v="${u.id}|${u.role}">${u.role === 'admin' ? 'ถอนสิทธิ์' : 'ตั้งเป็นแอดมิน'}</button>` : ''}</div>`).join('');
  return page(`<div class="flex items-end justify-between flex-wrap gap-space-md"><div><h1 class="${K.h1}">จัดการข้อสอบ</h1><p class="${K.mut}">สร้าง/แก้ไขชุดข้อสอบ หรือนำเข้าจากไฟล์ Word, Excel, PDF, รูปภาพ</p></div><div class="flex gap-space-sm flex-wrap"><button class="${K.ghost}" data-a="imp" data-v="">${icon('upload_file')} นำเข้าจากไฟล์ (ชุดใหม่)</button><button class="${K.pri}" data-a="sadd">+ สร้างชุดข้อสอบ</button></div></div>
    <div class="${K.card} flex flex-col gap-1">${rows || `<p class="${K.mut} text-center">ยังไม่มีชุดข้อสอบ</p>`}</div>
    <h2 class="${K.h2}">ผู้ใช้</h2><div class="${K.card} flex flex-col">${urows}</div>`);
};
V.edit = () => {
  const s = EDS;
  const qs = s.questions.map((q, i) => `<div class="flex items-start gap-space-md px-space-md py-space-sm rounded-lg hover:bg-surface-container-low"><span class="w-7 h-7 shrink-0 rounded-full bg-surface-container flex items-center justify-center font-label-md text-label-md">${i + 1}</span><div class="flex-1 min-w-0"><div class="whitespace-pre-wrap">${esc(q.q)}</div><div class="${K.mut}">${q.type === 'mc' ? 'ปรนัย • เฉลย: ' + esc(q.choices[q.answer] ? q.choices[q.answer].text : '?') : 'อัตนัย • เฉลย: ' + esc(q.answer.join(' / '))}${q.q_image ? ' • มีรูป' : ''}</div></div><button class="${K.ghost} !h-9" data-a="qedit" data-v="${q.id}">แก้ไข</button><button class="${K.ghost} !h-9 text-error" data-a="qdel" data-v="${q.id}">ลบ</button></div>`).join('');
  return page(`<div class="flex items-center justify-between flex-wrap gap-space-md"><h1 class="${K.h1}">แก้ไขชุดข้อสอบ</h1><div class="flex gap-space-sm"><button class="${K.ghost}" data-a="go" data-v="manage">← กลับ</button><button class="${K.pri}" data-a="ssave">บันทึกข้อมูลชุดข้อสอบ</button></div></div>
    <div class="${K.card} grid gap-space-md md:grid-cols-2"><label class="flex flex-col gap-1 md:col-span-2"><span class="${K.lbl}">ชื่อชุดข้อสอบ</span><input class="${K.inp}" data-i="s.title" value="${esc(s.title)}"></label><label class="flex flex-col gap-1"><span class="${K.lbl}">หมวดหมู่</span><input class="${K.inp}" data-i="s.cat" value="${esc(s.cat)}"></label><label class="flex flex-col gap-1"><span class="${K.lbl}">เวลา (นาที, 0 = ไม่จำกัด)</span><input type="number" min="0" class="${K.inp}" data-i="s.time" value="${s.time}"></label><label class="flex flex-col gap-1 md:col-span-2"><span class="${K.lbl}">คำอธิบาย</span><textarea class="${K.ta}" rows="2" data-i="s.desc">${esc(s.desc || '')}</textarea></label><label class="flex items-center gap-space-sm"><input type="checkbox" data-c="s.pub" ${s.is_public ? 'checked' : ''}> <span>เผยแพร่ใน Portal</span></label></div>
    <div class="flex items-center justify-between flex-wrap gap-space-md"><h2 class="${K.h2}">ข้อสอบ (${s.questions.length} ข้อ)</h2><div class="flex gap-space-sm"><button class="${K.ghost}" data-a="imp" data-v="${s.id}">${icon('upload_file')} นำเข้าจากไฟล์</button><button class="${K.pri}" data-a="qadd">+ เพิ่มข้อสอบ</button></div></div>
    <div class="${K.card} flex flex-col gap-1">${qs || `<p class="${K.mut} text-center">ยังไม่มีข้อสอบ</p>`}</div>`);
};

function render() {
  clearInterval(timerId);
  $('#view').innerHTML = V[view]();
  nav(); userBox();
  if (view === 'exam') { tick(); timerId = setInterval(tick, 500); }
  clearInterval(liveId);
  if (view === 'live' && LIVE && LIVE.status === 'question') liveId = setInterval(() => { const b = $('#lbar'); if (b && LIVE.question) b.style.width = Math.max(0, 100 - (Date.now() - LIVE.question.startedAt) / (LIVE.question.seconds * 10)) + '%'; }, 200);
}

// ----- question editor modal -----
function qfHtml() {
  const f = QF;
  const ch = f.choices.map((c, i) => `<div class="flex items-start gap-space-sm"><input type="radio" name="ans" class="mt-3" ${f.answer === i ? 'checked' : ''} data-c="qans" value="${i}"><div class="flex-1 flex flex-col gap-1"><input class="${K.inp}" data-qc="${i}" placeholder="ตัวเลือก ${L[i] || i + 1}" value="${esc(c.text)}"><div class="flex items-center gap-space-sm">${c.image ? `<img src="${esc(c.image)}" class="h-10 rounded"><button class="${K.mut} underline" data-a="cimgx" data-v="${i}">เอารูปออก</button>` : `<label class="${K.mut} underline cursor-pointer">+ รูปประกอบ<input type="file" accept="image/*" class="hidden" data-c="cimg" data-idx="${i}"></label>`}</div></div>${f.choices.length > 2 ? `<button class="mt-2 text-error" data-a="cdel" data-v="${i}">${icon('close')}</button>` : ''}</div>`).join('');
  return `<h3 class="${K.h2}">${f.id ? 'แก้ไขข้อสอบ' : 'เพิ่มข้อสอบ'}</h3>
    <label class="flex flex-col gap-1"><span class="${K.lbl}">รูปแบบ</span><select class="${K.inp}" data-c="qtype"><option value="mc" ${f.type === 'mc' ? 'selected' : ''}>ปรนัย (เลือกตอบ)</option><option value="sa" ${f.type === 'sa' ? 'selected' : ''}>อัตนัย (พิมพ์คำตอบ)</option></select></label>
    <label class="flex flex-col gap-1"><span class="${K.lbl}">หัวข้อ/ตอน (ไม่บังคับ — แสดงเหนือข้อนี้)</span><input id="qsec" class="${K.inp}" value="${esc(f.section_note || '')}"></label>
    <label class="flex flex-col gap-1"><span class="${K.lbl}">โจทย์</span><textarea id="qq" class="${K.ta}" rows="3">${esc(f.q)}</textarea></label>
    <div class="flex items-center gap-space-sm">${f.q_image ? `<img src="${esc(f.q_image)}" class="h-16 rounded"><button class="${K.mut} underline" data-a="qimgx">เอารูปโจทย์ออก</button>` : `<label class="${K.mut} underline cursor-pointer">+ รูปประกอบโจทย์ (ไม่เกิน 1.5MB)<input type="file" accept="image/*" class="hidden" data-c="qimg"></label>`}</div>
    ${f.type === 'mc' ? `<div class="flex flex-col gap-space-sm"><span class="${K.lbl}">ตัวเลือก (เลือกวงกลมที่เป็นเฉลย)</span>${ch}<button class="${K.ghost} !h-9 self-start" data-a="cadd">+ เพิ่มตัวเลือก</button></div>`
      : `<label class="flex flex-col gap-1"><span class="${K.lbl}">คำตอบที่ยอมรับ (บรรทัดละ 1 คำตอบ)</span><textarea id="qsa" class="${K.ta}" rows="3">${esc(f.answers.join('\n'))}</textarea></label>`}
    <label class="flex flex-col gap-1"><span class="${K.lbl}">คำอธิบายเฉลย (ไม่บังคับ)</span><textarea id="qex" class="${K.ta}" rows="2">${esc(f.explanation)}</textarea></label>
    <div class="flex justify-end gap-space-sm"><button class="${K.ghost}" data-a="cm">ยกเลิก</button><button class="${K.pri}" data-a="qsave">บันทึก</button></div>`;
}
function qfSync() {
  if (!$('#qq')) return;
  QF.q = $('#qq').value; QF.section_note = $('#qsec').value; QF.explanation = $('#qex').value;
  $$('[data-qc]').forEach(e => { QF.choices[+e.dataset.qc].text = e.value; });
  if ($('#qsa')) QF.answers = $('#qsa').value.split('\n').map(x => x.trim()).filter(Boolean);
}
const qfShow = () => modal(qfHtml());

// ----- import modal (ไฟล์ → AI/regex แยกโจทย์+เฉลย → ตรวจทาน → บันทึก) -----
function impHtml() {
  if (!IMP.items) return `<h3 class="${K.h2}">นำเข้าข้อสอบจากไฟล์</h3><p class="${K.mut}">รองรับ .docx .xlsx .xls .csv .pdf .jpg .png .gif .webp .md .txt — ระบบจะจับคู่เฉลย (รวมถึงหน้าเฉลยท้ายเล่ม) ให้อัตโนมัติ และให้ตรวจทานก่อนบันทึกเสมอ</p>
    <label id="dz" class="min-h-[180px] flex flex-col items-center justify-center gap-space-sm text-center rounded-xl border-[1.5px] border-dashed border-[#94A3B8] bg-[#F8FAFC] cursor-pointer hover:bg-[#EFF6FF] hover:border-[#2563EB] transition px-space-md"><span class="text-[#2563EB] [&>span]:!text-5xl">${icon(IMP.busy ? 'hourglass_top' : 'upload_file')}</span><span class="font-label-lg text-label-lg">${IMP.busy ? 'กำลังอ่านไฟล์ ' + esc(IMP.busy) + ' …' : 'ลากไฟล์มาวาง หรือคลิกเพื่อเลือกไฟล์'}</span><span class="${K.mut}">ขนาดสูงสุด 15MB</span><input type="file" class="hidden" data-c="impfile" accept=".docx,.xlsx,.xls,.csv,.pdf,.jpg,.jpeg,.png,.gif,.webp,.md,.txt"></label>
    <div class="flex justify-end"><button class="${K.ghost}" data-a="cm">ปิด</button></div>`;
  const sel = IMP.items.filter(x => x._on).length;
  return `<h3 class="${K.h2}">ตรวจทานก่อนบันทึก (${IMP.items.length} ข้อ)</h3><p class="${K.mut}">แหล่งที่มา: ${esc(IMP.source)}</p>
    ${IMP.keyMissing ? `<div class="rounded-lg bg-[#FEF3C7] text-[#92400E] p-space-md">พบ ${IMP.keyMissing} ข้อที่ไม่เจอเฉลยในไฟล์ — ตั้งค่าเริ่มต้นเป็นตัวเลือกแรก กรุณาเลือกเฉลยที่ถูกต้องในข้อที่ไฮไลต์สีเหลือง</div>` : ''}
    ${/AI/.test(IMP.source) ? `<div class="rounded-lg bg-surface-container-low p-space-md ${K.mut}">AI อาจตีความผิด และถ้าไฟล์ไม่มีเฉลย AI จะเดาจากความรู้ทั่วไป — ตรวจเฉลยทุกข้อก่อนบันทึก</div>` : ''}
    <div class="flex flex-col gap-space-sm max-h-[50vh] overflow-auto">${IMP.items.map((x, i) => `<div class="rounded-lg border ${x.keyMissing ? 'border-[#FDE68A] bg-[#FFFBEB]' : 'border-[#E2E8F0]'} p-space-md flex gap-space-sm"><input type="checkbox" class="mt-1" data-c="impon" data-idx="${i}" ${x._on ? 'checked' : ''}><div class="flex-1 min-w-0 flex flex-col gap-1">${x.section_note ? `<div class="${K.mut} whitespace-pre-wrap">${esc(x.section_note)}</div>` : ''}<div class="whitespace-pre-wrap">${i + 1}. ${esc(x.q)}</div>${x.t === 'mc' ? x.ch.map((c, k) => `<label class="flex items-center gap-space-sm ${K.mut}"><input type="radio" name="ia${i}" data-c="impans" data-idx="${i}" value="${k}" ${x.a === k ? 'checked' : ''}> ${L[k] || k + 1}. ${esc(c)}</label>`).join('') : `<div class="${K.mut}">อัตนัย • เฉลย: ${esc(x.a.join(' / '))}</div>`}</div></div>`).join('')}</div>
    <div class="flex justify-between gap-space-sm"><button class="${K.ghost}" data-a="impreset">เลือกไฟล์ใหม่</button><div class="flex gap-space-sm"><button class="${K.ghost}" data-a="cm">ยกเลิก</button><button class="${K.pri}" data-a="impsave" ${sel ? '' : 'disabled'}>นำเข้า ${sel} ข้อ</button></div></div>`;
}
const impShow = () => modal(impHtml(), true);
async function impRun(file) {
  if (!file) return;
  IMP.busy = file.name; IMP.name = file.name; impShow();
  try {
    const fd = new FormData(); fd.append('file', file);
    const r = await api('/api/admin/import', { body: fd });
    IMP.items = r.questions.map(x => ({ ...x, _on: true })); IMP.source = r.source; IMP.keyMissing = r.keyMissing || 0;
  } catch (e) { toast(e.message); }
  IMP.busy = null; impShow();
}

// ----- live socket -----
function ensureSocket() {
  if (socket) return socket;
  if (typeof io !== 'function') throw new Error('โหลดระบบห้องสอบสดไม่สำเร็จ');
  socket = io({ auth: { token } });
  socket.on('room:players', l => { if (LIVE) { LIVE.players = l; if (view === 'live') render(); } });
  socket.on('room:question', q => { if (LIVE) { LIVE.status = 'question'; LIVE.question = q; LIVE.myAnswered = false; LIVE.mine = null; LIVE.myRes = null; if (view === 'live') render(); } });
  socket.on('room:reveal', d => { if (LIVE) { LIVE.status = 'reveal'; LIVE.lastReveal = d; if (view === 'live') render(); } });
  socket.on('room:ended', d => { if (LIVE) { LIVE.status = 'ended'; LIVE.leaderboard = d.leaderboard; if (view === 'live') render(); } });
  socket.on('room:hostLeft', () => { if (LIVE) { toast('ผู้เปิดห้องออกจากห้องแล้ว'); LIVE = null; if (view === 'live') render(); } });
  return socket;
}
function resetSocket() { if (socket) { socket.disconnect(); socket = null; } LIVE = null; }

// ----- actions (data-a) -----
const A = {
  cm: closeM, cok() { const f = CB; closeM(); f && f(); },
  go: v => go(v),
  cat(v) { F.cat = v; render(); },
  authm(_, __, mode) { authModal('login'); },
  logout() { token = null; me = null; localStorage.removeItem('examflow.token'); resetSocket(); loadSets().then(() => go('portal')); },
  // --- ทำข้อสอบ ---
  start(id) {
    const s = sets.find(x => x.id === id);
    modal(`<h3 class="${K.h2}">${esc(s.title)}</h3><p class="${K.mut}">${s.qCount} ข้อ • ${s.time ? s.time + ' นาที' : 'ไม่จำกัดเวลา'}</p>
      ${!me ? `<label class="flex flex-col gap-1"><span class="${K.lbl}">ชื่อที่ใช้แสดงผล</span><input id="gn" class="${K.inp}" placeholder="ผู้เยี่ยมชม"></label>` : ''}
      <label class="flex flex-col gap-1"><span class="${K.lbl}">โหมด</span><select id="md" class="${K.inp}"><option value="p">ฝึกฝน — ตรวจเฉลยได้ทีละข้อ</option><option value="m">สอบจริง — เห็นเฉลยหลังส่งเท่านั้น</option></select></label>
      ${s.mcCount && s.saCount ? `<label class="flex flex-col gap-1"><span class="${K.lbl}">ประเภทข้อสอบ</span><select id="fm" class="${K.inp}"><option value="">ทั้งหมด</option><option value="mc">ปรนัยเท่านั้น</option><option value="sa">อัตนัยเท่านั้น</option></select></label>` : ''}
      <label class="flex items-center gap-space-sm"><input type="checkbox" id="sh"> สลับลำดับข้อ</label>
      <div class="flex justify-end gap-space-sm"><button class="${K.ghost}" data-a="cm">ยกเลิก</button><button class="${K.pri}" data-a="begin" data-v="${id}">เริ่มสอบ</button></div>`);
  },
  async begin(id) {
    const guest = ($('#gn') || {}).value || '', mode = $('#md').value, format = ($('#fm') || {}).value || '', shuffle = $('#sh').checked;
    const r = await api('/api/exam/start', { body: { setId: id, mode, format, shuffle } });
    closeM();
    X = { sid: r.sessionId, title: r.set.title, time: r.set.time, qs: r.questions, i: 0, ans: {}, flag: {}, fb: {}, t0: Date.now(), mode, guest, away: 0 };
    view = 'exam'; render(); window.scrollTo(0, 0);
  },
  pick(v) { X.ans[X.qs[X.i].id] = +v; render(); },
  jump(v) { X.i = +v; render(); }, prev() { if (X.i > 0) { X.i--; render(); } }, next() { if (X.i < X.qs.length - 1) { X.i++; render(); } },
  flagq() { const id = X.qs[X.i].id; X.flag[id] = !X.flag[id]; render(); },
  async check() {
    const q = X.qs[X.i];
    if (!answered(q)) return toast('เลือกหรือพิมพ์คำตอบก่อน');
    const r = await api('/api/exam/' + X.sid + '/check', { body: { questionId: q.id, answer: X.ans[q.id] } });
    X.fb[q.id] = r; render();
  },
  sub() {
    const left = X.qs.filter(q => !answered(q)).length, fl = X.qs.filter(q => X.flag[q.id]).length;
    ask(`ส่งข้อสอบเลยไหม?${left ? ` (ยังไม่ได้ตอบ ${left} ข้อ)` : ''}${fl ? ` (ปักธงไว้ ${fl} ข้อ)` : ''}`, finish, 'ส่งข้อสอบ');
  },
  rf(v) { RF = v; render(); },
  // --- ผลสอบ ---
  async open(id) { R = await api('/api/results/' + id); RF = 'all'; view = 'result'; render(); window.scrollTo(0, 0); },
  demo() { SHOWDEMO = !SHOWDEMO; render(); },
  // --- ห้องสอบสด ---
  hostRoom(id) { go('live'); setTimeout(() => { const s = $('#hostSet'); if (s) { s.value = id; A.hostGo(); } }, 0); },
  hostGo() {
    const setId = $('#hostSet').value;
    ensureSocket().emit('host:create', { setId }, r => {
      if (r.error) return toast(r.error);
      LIVE = { role: 'host', pin: r.pin, title: r.title, status: 'lobby', players: [] }; render();
    });
  },
  join() {
    const pin = $('#pin').value.trim(), nickname = $('#nick').value.trim();
    ensureSocket().emit('player:join', { pin, nickname }, r => {
      if (r.error) return toast(r.error);
      LIVE = { role: 'player', pin, title: r.title, status: 'lobby', players: [] }; render();
    });
  },
  liveStart() { socket.emit('host:start', { pin: LIVE.pin }, r => r && r.error && toast(r.error)); },
  liveNext() { socket.emit('host:next', { pin: LIVE.pin }, r => r && r.error && toast(r.error)); },
  liveAns(v) {
    if (LIVE.myAnswered) return; LIVE.myAnswered = true; LIVE.mine = +v; render();
    socket.emit('player:answer', { pin: LIVE.pin, answer: +v }, r => { if (r && r.error) toast(r.error); else LIVE.myRes = r; });
  },
  liveExit() { resetSocket(); render(); },
  // --- จัดการ ---
  async sadd() { const s = await api('/api/admin/sets', { body: { title: 'ชุดข้อสอบใหม่', cat: 'ทั่วไป', time: 10, desc: '' } }); await loadSets(); await A.sed(s.id); },
  async sed(id) { EDS = await api('/api/admin/sets/' + id); view = 'edit'; render(); },
  sdel(id) { ask('ลบชุดข้อสอบนี้และข้อสอบทั้งหมดในชุด?', async () => { await api('/api/admin/sets/' + id, { method: 'DELETE' }); await loadSets(); render(); }, 'ลบ'); },
  async ssave() { EDS = await api('/api/admin/sets/' + EDS.id, { method: 'PUT', body: { title: EDS.title, cat: EDS.cat, time: EDS.time, desc: EDS.desc, is_public: !!EDS.is_public } }); await loadSets(); toast('บันทึกแล้ว'); render(); },
  role(v) { const [id, role] = v.split('|'); return api('/api/admin/users/' + id + '/role', { method: 'PUT', body: { role: role === 'admin' ? 'user' : 'admin' } }).then(loadAdmin); },
  qadd() { QF = { id: null, type: 'mc', q: '', q_image: null, choices: [{ text: '', image: null }, { text: '', image: null }, { text: '', image: null }, { text: '', image: null }], answer: 0, answers: [], explanation: '', section_note: '' }; qfShow(); },
  qedit(id) { const q = EDS.questions.find(x => x.id === id); QF = { id, type: q.type, q: q.q, q_image: q.q_image, choices: q.choices ? q.choices.map(c => ({ ...c })) : [{ text: '', image: null }, { text: '', image: null }], answer: q.type === 'mc' ? q.answer : 0, answers: q.type === 'sa' ? [...q.answer] : [], explanation: q.explanation || '', section_note: q.section_note || '' }; qfShow(); },
  cadd() { qfSync(); QF.choices.push({ text: '', image: null }); qfShow(); },
  cdel(v) { qfSync(); QF.choices.splice(+v, 1); if (QF.answer >= QF.choices.length) QF.answer = 0; qfShow(); },
  cimgx(v) { qfSync(); QF.choices[+v].image = null; qfShow(); },
  qimgx() { qfSync(); QF.q_image = null; qfShow(); },
  async qsave() {
    qfSync();
    const body = { type: QF.type, q: QF.q.trim(), q_image: QF.q_image, explanation: QF.explanation, section_note: QF.section_note, choices: QF.type === 'mc' ? QF.choices.map(c => ({ text: c.text.trim(), image: c.image })) : undefined, answer: QF.type === 'mc' ? QF.answer : QF.answers };
    if (QF.type === 'mc' && body.choices.some(c => !c.text && !c.image)) return toast('ตัวเลือกต้องไม่ว่าง');
    if (QF.id) await api('/api/admin/questions/' + QF.id, { method: 'PUT', body }); else await api('/api/admin/sets/' + EDS.id + '/questions', { body });
    EDS = await api('/api/admin/sets/' + EDS.id); await loadSets(); closeM(); render();
  },
  qdel(id) { ask('ลบข้อสอบข้อนี้?', async () => { await api('/api/admin/questions/' + id, { method: 'DELETE' }); EDS = await api('/api/admin/sets/' + EDS.id); await loadSets(); render(); }, 'ลบ'); },
  imp(v) { IMP = { target: v || null }; impShow(); },
  impreset() { IMP = { target: IMP.target }; impShow(); },
  async impsave() {
    const items = IMP.items.filter(x => x._on).map(({ _on, keyMissing, ...r }) => r);
    let id = IMP.target;
    if (!id) { const s = await api('/api/admin/sets', { body: { title: (IMP.name || 'ชุดข้อสอบนำเข้า').replace(/\.[^.]+$/, ''), cat: 'ทั่วไป', time: 0, desc: 'นำเข้าจากไฟล์' } }); id = s.id; }
    const r = await api('/api/admin/sets/' + id + '/questions/bulk', { body: { questions: items } });
    await loadSets(); closeM(); toast('นำเข้า ' + r.added + ' ข้อแล้ว'); await A.sed(id);
  },
};

async function finish() {
  if (!X || X.submitting) return; X.submitting = true; clearInterval(timerId);
  const r = await api('/api/exam/' + X.sid + '/submit', { body: { answers: X.ans, sec: Math.round((Date.now() - X.t0) / 1e3), away: X.away, guestName: X.guest } }).catch(e => { X.submitting = false; toast(e.message); });
  if (!r) return;
  X = null;
  R = await api('/api/results/' + r.id).catch(() => ({ ...r, date: Date.now(), detail: r.detail }));
  RF = 'all'; view = 'result'; render(); window.scrollTo(0, 0);
}

// ----- auth modal -----
function authModal(mode) {
  const reg = mode === 'register';
  modal(`<h3 class="${K.h2}">${reg ? 'สมัครสมาชิก' : 'เข้าสู่ระบบ'}</h3>
    ${reg ? `<input id="an" class="${K.inp}" placeholder="ชื่อที่ใช้แสดงผล">` : ''}<input id="ae" type="email" class="${K.inp}" placeholder="อีเมล"><input id="ap" type="password" class="${K.inp}" placeholder="รหัสผ่าน (อย่างน้อย 6 ตัว)">
    <p class="${K.mut}">${reg ? 'ผู้สมัครคนแรกของระบบจะได้สิทธิ์แอดมินอัตโนมัติ' : 'ยังไม่มีบัญชี? '}${reg ? '' : `<button class="underline text-primary" data-a="authreg">สมัครสมาชิก</button>`}</p>
    <div class="flex justify-end gap-space-sm"><button class="${K.ghost}" data-a="cm">ยกเลิก</button><button class="${K.pri}" data-a="authgo" data-v="${mode}">${reg ? 'สมัครสมาชิก' : 'เข้าสู่ระบบ'}</button></div>`);
}
A.authreg = () => authModal('register');
A.authgo = async mode => {
  const body = { email: $('#ae').value.trim(), password: $('#ap').value }; if (mode === 'register') body.name = $('#an').value.trim();
  const r = await api(mode === 'register' ? '/api/auth/register' : '/api/auth/login', { body });
  token = r.token; me = { ...r.user, uid: r.user.id }; localStorage.setItem('examflow.token', token);
  resetSocket(); closeM(); await loadSets(); toast('ยินดีต้อนรับ ' + me.name); render();
};

// ----- input/change handlers -----
const I = {
  q(v) { F.q = v; $('#grid').innerHTML = gridHtml(); },
  sa(v) { X.ans[X.qs[X.i].id] = v; },
  's.title': v => { EDS.title = v; }, 's.cat': v => { EDS.cat = v; }, 's.time': v => { EDS.time = +v || 0; }, 's.desc': v => { EDS.desc = v; },
};
const Ch = {
  hall(_, el) { HALL = el.checked; loadHist(); },
  's.pub'(_, el) { EDS.is_public = el.checked ? 1 : 0; },
  qtype(v) { qfSync(); QF.type = v; qfShow(); },
  qans(v) { QF.answer = +v; },
  async qimg(_, el) { qfSync(); QF.q_image = (await upImg(el.files[0])) || QF.q_image; qfShow(); },
  async cimg(_, el) { qfSync(); const u = await upImg(el.files[0]); if (u) QF.choices[+el.dataset.idx].image = u; qfShow(); },
  impfile(_, el) { impRun(el.files[0]); },
  impon(_, el) { IMP.items[+el.dataset.idx]._on = el.checked; impShow(); },
  impans(v, el) { const it = IMP.items[+el.dataset.idx]; it.a = +v; if (it.keyMissing) { it.keyMissing = false; IMP.keyMissing = Math.max(0, IMP.keyMissing - 1); } },
};
async function upImg(file) {
  if (!file) return null;
  try { const fd = new FormData(); fd.append('image', file); return (await api('/api/upload', { body: fd })).url; } catch (e) { toast(e.message); return null; }
}
document.addEventListener('click', e => {
  const nl = e.target.closest('nav a[data-path], header a[data-path]');
  if (nl) { e.preventDefault(); if (X && view === 'exam' && !confirm('ออกจากการสอบนี้? คำตอบที่ยังไม่ส่งจะหายไป')) return; X = null; go(PATH2VIEW[nl.dataset.path] || 'portal'); return; }
  const el = e.target.closest('[data-a]'); if (!el) return;
  const fn = A[el.dataset.a]; if (!fn) return;
  e.preventDefault();
  Promise.resolve(fn(el.dataset.v, el)).catch(err => toast(err.message));
});
document.addEventListener('input', e => { const el = e.target.closest('[data-i]'); if (el && I[el.dataset.i]) I[el.dataset.i](el.value, el); });
document.addEventListener('change', e => { const el = e.target.closest('[data-c]'); if (el && Ch[el.dataset.c]) Promise.resolve(Ch[el.dataset.c](el.value, el)).catch(err => toast(err.message)); });
['dragover', 'drop'].forEach(t => document.addEventListener(t, e => {
  const dz = e.target.closest('#dz'); if (!dz) return; e.preventDefault();
  if (t === 'drop' && e.dataTransfer.files[0]) impRun(e.dataTransfer.files[0]);
}));

(async function boot() {
  if (token) { try { const r = await api('/api/auth/me'); me = r.user ? { ...r.user, id: r.user.uid } : null; if (!me) throw 0; } catch (e) { token = null; me = null; localStorage.removeItem('examflow.token'); } }
  await loadSets(); render();
})();
})();

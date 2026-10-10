// exam-fixups.js — ตัวแก้ผลลัพธ์หลังแยกข้อสอบ (ใช้ร่วมกันทั้งตัวอ่าน docx / ตัวแยกสำรอง / ผลจาก AI)
// ไม่พึ่งไลบรารีใดๆ
//
//  1) redistributeNotes(items, numOf)
//     หัวข้อ/เนื้อเรื่องที่ระบุช่วงข้อไว้เอง เช่น "Passage 2 (ข้อ 28–30)" ต้องไปอยู่ที่ "ข้อ 28" ตามที่ระบุ
//     ไม่ใช่ไปกองรวมที่ข้อแรกที่ตามหลังหัวข้อ (กรณี Passage 1 และ Passage 2 วางติดกันก่อนข้อ 25)
//  2) repairMergedChoices(items)
//     ตัวเลือกที่ถูกรวมกัน เช่น "C. dog D. fish" เหลือเป็นตัวเลือกเดียว → แยกออกเป็น C และ D
//  3) reconcileChoices(list, structured)
//     เทียบผลจาก AI กับผลจากตัวอ่านโค้ด (ตามตัวอักษร A/B/C/D จริงในไฟล์) ถ้าเนื้อหาเหมือนกันแต่ AI รวมตัวเลือกไว้ ใช้การแยกของตัวอ่านโค้ด

const { noteKind } = require('./section-notes');

const THAI_DIGITS = '๐๑๒๓๔๕๖๗๘๙';
const toAr = s => String(s).replace(/[๐-๙]/g, d => THAI_DIGITS.indexOf(d));

// ---------- 1) กระจาย section_note ตามช่วงข้อที่ระบุ ----------
// ช่วงข้อ: "ข้อ 25–27" "ข้อที่ 28-30" "Questions 28 to 30" "Q28-30" "No. 5 and 6" และข้อเดี่ยว "ข้อ 28"
// (ไม่จับ "(30 ข้อ)" ซึ่งเป็นจำนวนข้อ ไม่ใช่เลขข้อ)
const RANGE_RE = /(?:ข้อที่|ข้อ|questions?|items?|nos?\.?|q\.?)\s*(\d{1,3})(?:\s*(?:[-–—~]|ถึง|to|through|and|&|และ)\s*(\d{1,3}))?/i;

function rangeStartOf(line) {
  const t = toAr(line);
  if (t.length > 200) return null;
  if (noteKind(line) !== 'strong') return null;       // ต้องเป็นบรรทัดหัวข้อ/คำสั่ง/เนื้อเรื่อง ไม่ใช่เนื้อหาในเรื่อง
  const m = t.match(RANGE_RE);
  return m ? +m[1] : null;
}

// แบ่ง note เป็นท่อนๆ: เริ่มท่อนใหม่ทุกครั้งที่เจอ "บรรทัดหัวข้อที่ระบุเลขข้อ" ที่เลขเริ่มต่างจากท่อนปัจจุบัน
function splitNote(note) {
  const segs = []; let cur = null;
  for (const line of String(note).split('\n')) {
    if (!line.trim()) continue;
    const start = rangeStartOf(line);
    if (start != null && (!cur || cur.start !== start)) {
      // หัวข้อที่ไม่มีเลขข้อ (cur.start == null) ที่อยู่นำหน้าท่อนแรก ให้ท่อนนั้นอยู่กับข้อที่ถือ note ไว้ต่อไป ไม่ผูกกับเลข
      cur = { start, lines: [line] }; segs.push(cur);
    } else if (!cur) { cur = { start: null, lines: [line] }; segs.push(cur); }
    else cur.lines.push(line);
  }
  return segs;
}

// items: อาเรย์ข้อสอบตามลำดับในเอกสาร  field ของ note = section_note หรือ note
// numOf(item, index) → เลขข้อตามต้นฉบับ (ถ้าไม่มีให้ใช้ลำดับ index+1)
function redistributeNotes(items, numOf, field = 'section_note') {
  if (!Array.isArray(items) || !items.length) return items;
  const nums = items.map((it, i) => { const n = numOf ? numOf(it, i) : null; return n != null && n !== '' ? +n : i + 1; });
  const dest = items.map(() => []);
  items.forEach((it, i) => {
    const note = it && it[field]; if (!note) return;
    for (const seg of splitNote(note)) {
      let target = i;
      if (seg.start != null) {
        // หาข้อที่เลขตรงกับที่หัวข้อระบุ โดยมองจากข้อที่ถือ note อยู่ไปข้างหน้าเท่านั้น (กันเลขข้อซ้ำเมื่อแต่ละตอนเริ่มนับ 1 ใหม่)
        for (let j = i; j < items.length; j++) if (nums[j] === seg.start) { target = j; break; }
      }
      dest[target].push(...seg.lines);
    }
  });
  items.forEach((it, i) => {
    if (!it) return;
    const text = dest[i].join('\n').trim();
    if (text) it[field] = text; else delete it[field];
  });
  return items;
}

// ---------- 2) แยกตัวเลือกที่ถูกรวมกัน ----------
const LET = 'ABCDEFGH', TH = 'กขคงจฉชซ';
const idxOf = ch => { const i = LET.indexOf(ch.toUpperCase()); return i >= 0 ? i : TH.indexOf(ch); };

// หาตัวคั่นตัวเลือกที่เรียงต่อกันจากตัวอักษรลำดับ startIdx ในข้อความหนึ่งก้อน → [{pos,end}] หรือ []
function findRun(text, startIdx) {
  const re = /(?:^|\s)\(?([A-Ha-hก-ฌ])[.)]\s*(?![A-Za-z]\.)/g;
  const marks = []; let m;
  while ((m = re.exec(text))) {
    const pos = m.index + (m[0].length - m[0].trimStart().length);
    marks.push({ ch: m[1], pos, end: re.lastIndex });
  }
  const run = []; let expect = startIdx;
  for (const mk of marks) if (idxOf(mk.ch) === expect) { run.push(mk); expect++; }
  return run;
}

// items: [{ ch:[...], chImg?:[...], a }]  เช็คเฉพาะข้อที่ตัวเลือกน้อยกว่า 4 (ข้อที่ครบ 4 แล้วไม่แตะ กันแยกผิดจาก "Mrs. D. Lee" ฯลฯ)
function repairMergedChoices(items, { shiftAnswer = false } = {}) {
  let fixed = 0;
  for (const it of items || []) {
    if (!it || it.t !== 'mc' || !Array.isArray(it.ch) || it.ch.length < 2 || it.ch.length >= 4) continue;
    for (let i = 0; i < it.ch.length; i++) {
      const text = String(it.ch[i] ?? '');
      const run = findRun(text, i + 1);
      if (!run.length) continue;
      const parts = [text.slice(0, run[0].pos).trim(), ...run.map((mk, k) => text.slice(mk.end, k + 1 < run.length ? run[k + 1].pos : text.length).trim())];
      if (!parts[0] || parts.slice(1).some(p => !p)) continue;
      it.ch.splice(i, 1, ...parts);
      if (Array.isArray(it.chImg)) it.chImg.splice(i, 1, it.chImg[i] ?? null, ...run.map(() => null));
      if (shiftAnswer && Number.isInteger(it.a) && it.a > i) it.a += run.length;
      fixed++;
      break;
    }
  }
  return fixed;
}

// ---------- 3) เทียบกับผลของตัวอ่านโค้ด ----------
const norm = s => toAr(s).toLowerCase().replace(/[\u200b-\u200d\ufeff]/g, '').replace(/[\s.,;:!?'"“”‘’()\[\]{}\-–—_\/\\]/g, '');
function reconcileChoices(list, structured) {
  let fixed = 0;
  if (!Array.isArray(list) || !Array.isArray(structured)) return fixed;
  const byQ = new Map();
  for (const s of structured) { const k = norm(s.q || '').slice(0, 60); if (k && !byQ.has(k)) byQ.set(k, s); }
  for (const it of list) {
    if (!it || it.t !== 'mc' || !Array.isArray(it.ch)) continue;
    const s = byQ.get(norm(it.q || '').slice(0, 60));
    if (!s || !Array.isArray(s.ch) || s.ch.length <= it.ch.length) continue;
    if (norm(s.ch.join('')) !== norm(it.ch.join(''))) continue;      // ต้องเป็นข้อความเดียวกันเป๊ะๆ ต่างกันแค่การแบ่งตัวเลือก
    it.ch = s.ch.slice();
    if (s.keyFound && Number.isInteger(s.a)) it.a = s.a;
    fixed++;
  }
  return fixed;
}

module.exports = { redistributeNotes, splitNote, repairMergedChoices, reconcileChoices };
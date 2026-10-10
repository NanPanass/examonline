// note-regions.js — จับ "หัวข้อที่ระบุช่วงข้อ (ข้อ N–M)" พร้อมเนื้อหาใต้หัวข้อ (กล่องบทอ่าน/ขั้นตอน/ตาราง ฯลฯ)
// แล้วบังคับให้ไปอยู่ในช่อง "คำอธิบายช่วงตอน" (section_note) ของ "ข้อแรกที่อยู่ด้านล่างหัวข้อนั้น" เสมอ
// ไม่พึ่งไลบรารีใดๆ ใช้ร่วมกันทั้งตัวแยกสำรอง (heuristicExtract) และตรวจทานผลจาก AI
//
// ปัญหาที่แก้ (ตัวอย่างจริง):
//   บทอ่านที่ 5 (ข้อ 21–25): ขั้นตอน        ← เดิมไม่ถูกจับเป็นหัวข้อ ไปต่อท้ายตัวเลือก D ของข้อ 20
//   วิธีปลูกถั่วงอกในขวด
//   1. แช่เมล็ดถั่วเขียวในน้ำนาน 8 ชั่วโมง    ← เดิมถูกอ่านเป็น "ข้อสอบอัตนัย" 5 ข้อ ทำให้เลขข้อเลื่อนและเฉลยผิดทั้งชุด
//   ...
//   21. ขั้นตอนแรกของการปลูกถั่วงอกคือข้อใด  ← ข้อแรกของช่วง = ที่ที่ section_note ต้องไปอยู่
//
// กติกา "เลขข้อในกล่องไม่ใช่ข้อสอบ": บรรทัดขึ้นต้นด้วยเลขที่อยู่ระหว่างหัวข้อกับข้อแรกของช่วง นับเป็นข้อสอบจริงก็ต่อเมื่อ
//   (ก) เลขตรงกับข้อเริ่มต้นที่หัวข้อระบุ หรือ (ข) มีตัวเลือก A/B/C/D หรือ ก/ข/ค/ง ตามหลัง หรือ
//   (ค) หัวข้อไม่มีเลขข้อที่ตรงกันอยู่ที่ไหนในเอกสารอีกเลย (กันกลืนข้อสอบจริงเมื่อเลขในหัวข้อพิมพ์ผิด)

const { noteKind, joinNote, rangeOf } = require('./section-notes');

const THAI_DIGITS = '๐๑๒๓๔๕๖๗๘๙';
const toAr = s => String(s ?? '').replace(/[๐-๙]/g, d => THAI_DIGITS.indexOf(d));
const NUM_LINE = /^\s*(?:ข้อ\s*)?(\d{1,3})\s*[.)]\s*(.*)$/;
const CH_START = /^\s*\(?[A-Ha-hก-ฌ][.)]\s*\S/;
const CH_INLINE = /(?:^|\s)\(?[Aaก][.)]\s*\S.*\s\(?[Bbข][.)]\s*\S/;
const ANS_HEAD = /^\s*(?:เฉลย|คำตอบ|answer\s*keys?|answers?\b)/i;
const PAGE_ONLY = /^(?:หน้า\s*)?\d{1,3}$|^page\s*\d+$/i;
const MAX_REGION_LINES = 80;

const numLine = l => { const m = toAr(l).match(NUM_LINE); return m ? { num: +m[1], rest: String(l).replace(/^\s*(?:ข้อ\s*)?[0-9๐-๙]{1,3}\s*[.)]\s*/, '') } : null; };
const norm = s => toAr(s).toLowerCase().replace(/\[\[IMG:\d+\]\]/g, '').replace(/[\u200b-\u200d\ufeff]/g, '').replace(/[\s.,;:!?'"“”‘’()\[\]{}\-–—_\/\\]/g, '');

// ข้อความที่ขึ้นต้นด้วยเลขข้อที่ i มีตัวเลือกตามหลังก่อนถึงเลขข้อ/หัวข้อถัดไปหรือไม่
function hasChoiceAhead(lines, i) {
  const m = numLine(lines[i]);
  if (m && CH_INLINE.test(m.rest)) return true;
  for (let j = i + 1, seen = 0; j < lines.length && seen < 14; j++) {
    const l = lines[j]; if (!l || !String(l).trim()) continue;
    seen++;
    if (numLine(l) || noteKind(l) === 'strong') return false;
    if (CH_START.test(l) || CH_INLINE.test(l)) return true;
  }
  return false;
}
function docHasNum(lines, from, n) {
  for (let j = from; j < lines.length; j++) { const m = numLine(lines[j] || ''); if (m && m.num === n) return true; }
  return false;
}
// มี "ข้อเลข n ที่มีตัวเลือกตามหลัง" อยู่ข้างหน้าอีกไหม (หยุดค้นเมื่อเจอหัวข้อช่วงข้อถัดไปหรือหน้าเฉลย กันไปจับข้อของตอนอื่นที่เริ่มนับ 1 ใหม่)
function laterChoiceQuestionWithNum(lines, from, n) {
  for (let j = from; j < lines.length; j++) {
    const l = lines[j] || '';
    if (!l) continue;
    const m = numLine(l);
    if (!m) {
      if (ANS_HEAD.test(l)) return false;
      if (noteKind(l) === 'strong' && rangeOf(l)) return false;
      continue;
    }
    if (m.num === n && hasChoiceAhead(lines, j)) return true;
  }
  return false;
}
// บรรทัดที่ i (ขึ้นต้นด้วยเลขข้อ) เป็น "ข้อสอบจริง" หรือเป็นรายการเลขในกล่องเนื้อหา — start = ข้อเริ่มต้นที่หัวข้อระบุ (หรือ null)
function isRealQuestionStart(lines, i, start) {
  const m = numLine(lines[i] || '');
  if (!m) return false;
  if (hasChoiceAhead(lines, i)) return true;                                    // มีตัวเลือกตามหลัง = ข้อสอบจริงแน่นอน
  if (start != null && m.num === start) return !laterChoiceQuestionWithNum(lines, i + 1, start);   // เลขตรงข้อเริ่มต้น แต่ข้อเลขเดียวกันที่มีตัวเลือกอยู่ถัดไป → อันนี้คือรายการในกล่อง
  if (start != null && docHasNum(lines, i + 1, start)) return false;
  return true;
}

// หา "ช่วงหัวข้อ + เนื้อหา" ทั้งหมดในเอกสาร → [{ start, end, heading, lines, headingIdx, endIdx }]
function scanNoteRegions(rawLines) {
  const lines = (rawLines || []).map(l => String(l ?? '').trim());
  const regions = [];
  for (let i = 0; i < lines.length; i++) {
    const h = lines[i];
    if (!h || noteKind(h) !== 'strong' || numLine(h)) continue;
    const r = rangeOf(h); if (!r) continue;
    const body = []; let endIdx = -1;
    for (let j = i + 1; j < lines.length; j++) {
      const l = lines[j]; if (!l) continue;
      if (PAGE_ONLY.test(l)) continue;
      if (ANS_HEAD.test(l) && !numLine(l)) break;                                   // ถึงหน้าเฉลยแล้ว ไม่พบข้อแรก → ทิ้ง
      if (numLine(l) && isRealQuestionStart(lines, j, r.start)) { endIdx = j; break; }
      if (noteKind(l) === 'strong' && rangeOf(l) && !numLine(l)) { endIdx = j; break; }   // หัวข้อช่วงถัดไป (ข้อแรกจะถูกหาโดย region ถัดไป)
      body.push(l);
      if (body.length > MAX_REGION_LINES) break;
    }
    if (endIdx < 0 || body.length > MAX_REGION_LINES) continue;
    regions.push({ start: r.start, end: r.end, heading: h, headingIdx: i, endIdx, lines: [h, ...body] });
    i = endIdx - 1;
  }
  return regions;
}

// ตัดข้อความตั้งแต่ตำแหน่งที่หัวข้อติดมา (เทียบแบบไม่สนช่องว่าง/เลขไทย) ไปจนจบ — คืน null ถ้าไม่พบ
//  พบได้ 2 แบบ: (1) หัวข้อทั้งบรรทัดอยู่กลางข้อความ  (2) AI/ตัวอ่านตัดหัวข้อมาแค่ช่วงต้น (เช่น \"บทอ่านที่ 5 (ข้อ 21–25)\" ทั้งที่ต้นฉบับมี \": ขั้นตอน\" ต่อท้าย) และอยู่ท้ายข้อความ
const MIN_PREFIX = 8;   // ต้องตรงกันอย่างน้อย 8 ตัวอักษร (ไม่นับช่องว่าง) กันตัดผิดเมื่อบังเอิญขึ้นต้นคล้ายกัน
function cutAtHeading(field, heading) {
  const f = String(field ?? ''), hk = toAr(heading).replace(/\s+/g, '');
  if (!hk) return null;
  const idxMap = []; let stripped = '';
  for (let k = 0; k < f.length; k++) if (!/\s/.test(f[k])) { idxMap.push(k); stripped += toAr(f[k]); }
  let at = stripped.indexOf(hk);
  if (at < 0) {
    for (let n = Math.min(hk.length - 1, stripped.length); n >= MIN_PREFIX; n--) {
      if (stripped.endsWith(hk.slice(0, n))) { at = stripped.length - n; break; }
    }
  }
  return at < 0 ? null : f.slice(0, idxMap[at]).trim();
}
const lineKeys = lines => new Set(lines.map(l => norm(numLine(l) ? numLine(l).rest : l)).filter(Boolean));
const noteLines = n => String(n || '').split('\n').map(x => x.trim()).filter(Boolean);

// ตรวจทาน/แก้รายการข้อสอบ (ผลจาก AI หรือตัวแยกสำรอง) ตามข้อความต้นฉบับ — แก้ในที่เดิม (list ถูก splice) คืนสถิติ
//  1) ลบ "ข้อสอบเทียม" ที่จริงคือรายการเลขในกล่องเนื้อหา (ข้ออัตนัย/ไม่มีตัวเลือก ที่ข้อความตรงกับบรรทัดในกล่อง)
//  2) ตัดหัวข้อ (และเนื้อหาตามหลัง) ที่ติดเข้าไปในโจทย์/ตัวเลือก/คำอธิบายเฉลยของข้อก่อนหน้า
//  3) ย้ายหัวข้อ + เนื้อหาไปไว้ที่ section_note ของข้อแรกของช่วง (ข้อ N ที่หัวข้อระบุ หรือข้อที่ตรงกับบรรทัดข้อแรกใต้หัวข้อ)
//  4) ถอดบรรทัดเดียวกันออกจาก section_note ของข้ออื่น (กัน AI ใส่ผิดข้อ/ซ้ำ)
function applyNoteRegions(list, rawLines) {
  const stat = { regions: 0, removed: 0, cleaned: 0, moved: 0 };
  if (!Array.isArray(list) || !list.length) return stat;
  const lines = (rawLines || []).map(l => String(l ?? '').trim());
  for (const reg of scanNoteRegions(lines)) {
    stat.regions++;
    const bodyKeys = lineKeys(reg.lines.slice(1));
    const allKeys = lineKeys(reg.lines);

    // 1) ลบข้อเทียม
    for (let i = list.length - 1; i >= 0; i--) {
      const it = list[i]; if (!it) continue;
      const stub = it.t === 'sa' || !Array.isArray(it.ch) || it.ch.length < 2;
      if (!stub) continue;
      const qk = norm(it.q);
      if (qk.length < 3) continue;
      let hit = false;
      for (const k of bodyKeys) if (k === qk || (qk.length >= 10 && k.length >= 10 && (k.includes(qk) || qk.includes(k)))) { hit = true; break; }
      if (hit) { list.splice(i, 1); stat.removed++; }
    }

    // 2) ตัดหัวข้อที่ติดอยู่ในโจทย์/ตัวเลือก/คำอธิบายเฉลย
    for (const it of list) {
      if (!it) continue;
      const q2 = cutAtHeading(it.q, reg.heading);
      if (q2 !== null) { it.q = q2; stat.cleaned++; }
      const ex2 = cutAtHeading(it.ex, reg.heading);
      if (ex2 !== null) { it.ex = ex2; stat.cleaned++; }
      if (Array.isArray(it.ch)) {
        for (let k = 0; k < it.ch.length; k++) {
          if (typeof it.ch[k] !== 'string') continue;
          const c2 = cutAtHeading(it.ch[k], reg.heading);
          if (c2 === null) continue;
          stat.cleaned++;
          if (c2) it.ch[k] = c2;
          else {                                                 // ตัวเลือกนี้มีแต่หัวข้อล้วน → เอาออก ปรับตำแหน่งเฉลย
            it.ch.splice(k, 1); if (Array.isArray(it.chImg)) it.chImg.splice(k, 1);
            if (Number.isInteger(it.a)) { if (it.a > k) it.a--; else if (it.a === k) it.a = 0; }
            k--;
          }
        }
      }
    }

    // 3) หาข้อแรกของช่วง: เทียบข้อความโจทย์ของบรรทัดข้อแรกใต้หัวข้อก่อน (ทนเลขข้อซ้ำข้ามตอน) แล้วค่อยใช้เลขข้อ
    const firstRest = (numLine(lines[reg.endIdx]) || {}).rest || '';
    const fk = norm(firstRest).slice(0, 24);
    let ti = fk.length >= 6 ? list.findIndex(it => it && norm(it.q).slice(0, 24) === fk) : -1;
    if (ti < 0) ti = list.findIndex(it => it && it.num != null && it.num !== '' && +it.num === reg.start);
    if (ti < 0) ti = list.findIndex(it => it && it.num != null && it.num !== '' && +it.num > reg.start);
    if (ti < 0) continue;

    // 4) ถอดบรรทัดของช่วงนี้ออกจากข้ออื่น แล้วใส่ที่ข้อแรกของช่วง
    list.forEach((it, i) => {
      if (!it || i === ti || !it.section_note) return;
      const keep = noteLines(it.section_note).filter(l => !allKeys.has(norm(numLine(l) ? numLine(l).rest : l)));
      const next = joinNote(keep);
      if (next !== String(it.section_note)) { if (next) it.section_note = next; else delete it.section_note; stat.moved++; }
    });
    const tgt = list[ti];
    const have = noteLines(tgt.section_note);
    const haveKeys = lineKeys(have);
    if (![...allKeys].every(k => haveKeys.has(k))) {
      const base = have.filter(l => !allKeys.has(norm(numLine(l) ? numLine(l).rest : l)));
      tgt.section_note = joinNote([...base, ...reg.lines]);
      stat.moved++;
    }
  }
  return stat;
}

module.exports = { scanNoteRegions, applyNoteRegions, isRealQuestionStart, hasChoiceAhead, numLine };
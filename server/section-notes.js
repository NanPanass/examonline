// section-notes.js — ตัวจับ "ข้อความอธิบายช่วงตอน" (section_note) ใช้ร่วมกันทั้งตัวอ่าน docx และตัวแยกข้อความสำรอง
// ไม่พึ่งไลบรารีใดๆ
//
// noteKind(line) คืนค่า:
//   'strong' = เป็นหัวข้อ/คำสั่ง/เนื้อเรื่องแน่ชัด (ตอนที่ คำสั่ง Part Directions Passage Phrase ... หรือบอกว่า "ตอบคำถามข้อ x-y")
//   'weak'   = ประโยคสั่งทั่วไป เช่น "จงเลือก..." "Read the..." "Look at..." — ใช้เป็น note ได้เฉพาะตอนที่ผู้เรียกเช็คแล้วว่า
//              ไม่ได้อยู่กลางโจทย์ (เช่น หลังตัวเลือกครบแล้ว หรือยังไม่เริ่มข้อ) เพื่อกันตัดโจทย์ที่ขึ้นบรรทัดใหม่ผิดที่
//   null     = ไม่ใช่
// ข้อยกเว้นเสมอ: บรรทัดขึ้นต้นด้วยเลขข้อ ("1." "ข้อ 3)") และหัวข้อเฉลยท้ายไฟล์ จะไม่ถูกนับเป็น note

const LEAD = /^[\s#*>_\-–—•·\[\]()]+/;          // ตัดสัญลักษณ์ markdown / bullet นำหน้า
const NUM_START = /^\s*(?:ข้อ\s*)?\d{1,3}\s*[.)]\s*\S/;   // "1. xxx" "ข้อ 3) xxx"
const KEY_START = /^\s*\(?[A-Ha-hก-ฌ][.)]\s/;            // "A. xxx" "ก. xxx" (ตัวเลือก)

// หัวข้อเฉลย: "เฉลย", "เฉลย (Answer Key)", "Answer Key:", "คำตอบ:" ฯลฯ
// แต่ "Answer the questions 5-7" ไม่เข้า (หลังคำว่า Answer ไม่ใช่ : หรือจบบรรทัด)
const ANSWER_HEAD = /^(?:เฉลย[ก-๙]*|คำตอบ(?:ที่ถูกต้อง)?|ตอบ|answer\s*keys?|answer\s*sheet|answers?|ans|keys?)\s*(?:\(.*\))?\s*(?:[:：\-–—]|$)/i;

// บรรทัดเฉลยของข้อเดียว: "Answer B" "Ans: C" "ตอบ ข" "เฉลย ก. ช้าง" — ห้ามนับเป็น note (ตัวอักษรเฉลยต้องจบบรรทัดหรือตามด้วย . ) )
const ANSWER_LINE = /^(?:เฉลย[ก-๙]*|คำตอบ|ตอบ|answers?|ans)\s*[:：\-–—]?\s*\(?[A-Ha-hก-ฌ1-8](?:\)|\.|\s*$)/i;

const ID = '[0-9๐-๙]+|[A-Za-zก-ฮ]|[IVXivx]{1,5}';   // เลข / ตัวอักษรเดี่ยว / เลขโรมัน

const STRONG = [
  // --- โครงสร้างหัวข้อ (ภาษาไทย) --- ของเดิม: "ตอนที่" "หมวดที่" ตามด้วยอะไรก็ได้
  /^(?:ตอนที่|หมวดที่)/,
  new RegExp(`^(?:ส่วนที่|ภาคที่|ภาค|หมวด|ตอน|บทที่|ชุดที่|ชุด)\\s*(?:${ID})(?![ก-๙A-Za-z])`),
  // --- คำสั่ง / คำอธิบายโจทย์ (ภาษาไทย) ---
  /^(?:คำสั่ง|คำชี้แจง|คำอธิบาย|คำแนะนำ|วิธีทำ|วิธีตอบ|วิธีการตอบ|ข้อกำหนด|หมายเหตุ|ตัวอย่าง|โจทย์ร่วม|ข้อมูลประกอบ)(?![ก-๙])/,
  // --- หัวข้อไทยแบบ "<ชนิด>ที่ N" เช่น "บทอ่านที่ 5" "เรื่องที่ 2" "กิจกรรมที่ 3" "ใบงานที่ 1" (ของเดิมตกเพราะ lookahead (?![ก-๙]) ชน "ที่") ---
  new RegExp(`^(?:บทอ่าน|บทความ|เนื้อเรื่อง|เรื่อง|ข้อความ|แบบฝึกหัด|แบบทดสอบ|กิจกรรม|ใบงาน|สถานการณ์|บทสนทนา|บทประพันธ์|บทร้อยกรอง|นิทาน|เรื่องสั้น|จดหมาย|ประกาศ|ตาราง|แผนภาพ|แผนภูมิ|กราฟ|รูปภาพ|ภาพ)\\s*ที่\\s*(?:${ID})(?![ก-๙A-Za-z])`),
  // --- เนื้อเรื่อง / ข้อความที่ใช้ตอบข้อถัดไป (ภาษาไทย) ---
  /^(?:บทความ|บทอ่าน|เนื้อเรื่อง|เรื่องสั้น|นิทาน|บทสนทนา|บทประพันธ์|ข้อความต่อไปนี้|ข้อมูลต่อไปนี้|สถานการณ์)(?![ก-๙])/,
  // --- โครงสร้างหัวข้อ (อังกฤษ): ต้องมีเลข/ตัวอักษรตามหลัง เช่น Part 1, Section B, Unit 3 ---
  new RegExp(`^(?:part|section|unit|chapter|level|set|task|exercise|activity)\\s*(?:${ID})(?![A-Za-z])`, 'i'),
  // --- คำสั่ง (อังกฤษ) ---
  /^(?:directions?|instructions?|rubric|notes?|example|examples|warm[\s-]?up|reminder)\s*(?:\d+\s*)?(?:[:：.\-–—]|$)/i,
  // --- เนื้อเรื่อง / phrase (อังกฤษ): "Passage 1" "Text A" "Phrase: ..." "Phrases" "Dialogue 2" "Story" ---
  new RegExp(`^(?:passages?|texts?|reading|readings|phrases?|dialogues?|dialogs?|conversations?|stor(?:y|ies)|paragraphs?|poems?|letters?|e-?mails?|notices?|signs?|menus?|advertisements?|situations?|vocabulary|grammar|listening)\\s*(?:(?:${ID})(?![A-Za-z])\\s*)?(?:[:：.\\-–—]|$)`, 'i'),
  /^(?:passages?|texts?|phrases?|dialogues?|dialogs?|conversations?|stor(?:y|ies))\s+(?:(?:[0-9]+|[A-Z]|[IVX]{1,4})(?![A-Za-z])|one|two|three|four|five)\b/i,
  /^(?:จง|โปรด|กรุณา)?\s*(?:อ่าน|ฟัง)\s*(?:ข้อความ|เรื่อง|บทความ|บทสนทนา|บทประพันธ์|นิทาน|ประกาศ|จดหมาย|โฆษณา|บทกลอน|โคลง|กลอน)/,
  // --- บอกตรงๆ ว่าใช้ตอบข้อไหน (อยู่ตรงไหนของบรรทัดก็ได้) ---
  /(?:ตอบคำถาม|ใช้ตอบ|ใช้ในการตอบ|สำหรับตอบ|ตอบโจทย์)\s*(?:คำถาม\s*)?(?:ข้อ|ข้อที่)\s*\d/,
  /(?:^|\s)ข้อ\s*\d{1,3}\s*(?:[-–—~]|ถึง|และ)\s*\d{1,3}\s*(?:จง|ให้|โดย|ใช้|อ้างอิง|พิจารณา|ตอบ)/,
  /(?:questions?|items?|nos?\.?)\s*\d{1,3}\s*(?:[-–—~]|to|through|and|&)\s*\d{1,3}\s*(?:refer|are based|relate|use|:)/i,
  /(?:answer|do|complete|use\b.*\bfor)\s+(?:the\s+)?(?:following\s+)?questions?\s*\d{1,3}\s*(?:[-–—~]|to|through|and|&)\s*\d{1,3}/i,
  /^(?:refer(?:ring)?\s+to|based\s+on|according\s+to)\s+the\s+(?:following|text|passage|story|picture|dialogue|conversation|table|chart|graph|notice|menu|email|letter)/i,
  /^(?:read|look\s+at|listen\s+to|study)\s+(?:the\s+)?(?:following\s+)?(?:text|passage|story|dialogue|dialog|conversation|poem|paragraph|letter|e-?mail|notice|menu|sign|advertisement|information)\b/i,
];

const WEAK = [
  // คำสั่งทั่วไปภาษาไทย: "จงเลือกคำตอบที่ถูกต้อง" "อ่านข้อความแล้วตอบ" "ดูภาพแล้ว..." "พิจารณา..." "เลือก..."
  /^(?:จง|โปรด|กรุณา|ให้นักเรียน|ให้ผู้สอบ|นักเรียนต้อง)/,
  /^(?:อ่าน|ดู|ฟัง|พิจารณา|สังเกต|เลือก|ตอบ|เติม|จับคู่|เรียง|ใช้|จาก)\s*(?:ข้อความ|เรื่อง|บทความ|ภาพ|รูป|ตาราง|กราฟ|แผนภูมิ|ข้อมูล|บทสนทนา|คำ|ประโยค|โจทย์|คำถาม|คำตอบ|ตัวเลือก)/,
  // คำสั่งทั่วไปภาษาอังกฤษ: ต้องมีคำตามหลังอย่างน้อย 1 คำ ("Choose the best answer.")
  /^(?:read|look|listen|study|choose|circle|select|match|complete|fill|answer|use|underline|write|put|decide|find|identify|observe|check|tick|mark|rearrange|arrange|number|name|say|think|choose)\s+\S+/i,
];

// ---------- กฎช่วงเลขข้อ ----------
// บรรทัดที่มีป้ายช่วงข้อ เช่น "(ข้อ 21–25)" "ข้อที่ 1-10" "Questions 5 to 7" "ข้อ 5 และ 6" ไม่ว่าจะขึ้นต้นด้วยคำอะไร
// (บทอ่านที่ / ตอนที่ / ขั้นตอน / ชื่อเรื่องอะไรก็ได้) = หัวข้อ/คำอธิบายช่วงตอน → ต้องเป็น section_note ของข้อที่อยู่ด้านล่างเสมอ
const THAI_DIGITS = '๐๑๒๓๔๕๖๗๘๙';
const toAr = s => String(s || '').replace(/[๐-๙]/g, d => THAI_DIGITS.indexOf(d));
// ต้องมีเลข 2 ตัวคั่นด้วย - – — ~ ถึง to through และ and & (ไม่จับ "(30 ข้อ)" ซึ่งเป็นจำนวนข้อ)
const RANGE_LABEL = /(?:ข้อที่|ข้อ|questions?|items?|nos?\.?|q\.?)\s*(\d{1,3})\s*(?:[-–—~]|ถึง|to|through|และ|and|&)\s*(\d{1,3})(?!\d)/i;
function rangeOf(line) {
  const m = toAr(String(line || '').replace(/\[\[IMG:\d+\]\]/g, ' ')).match(RANGE_LABEL);
  if (!m) return null;
  const a = +m[1], b = +m[2];
  return b >= a ? { start: a, end: b } : null;
}

function clean(line) { return String(line || '').replace(/\[\[IMG:\d+\]\]/g, ' ').replace(/\s+/g, ' ').replace(LEAD, '').trim(); }

function noteKind(line) {
  const raw = String(line || '').trim();
  if (!raw || raw.length > 600) return null;
  if (NUM_START.test(raw) || KEY_START.test(raw)) return null;
  const t = clean(raw);
  if (!t || ANSWER_HEAD.test(t) || ANSWER_LINE.test(t)) return null;
  if (STRONG.some(re => re.test(t))) return 'strong';
  if (t.length <= 300 && rangeOf(t)) return 'strong';   // ป้ายช่วงข้อ (ข้อ N–M) ในหัวข้อใดๆ
  if (WEAK.some(re => re.test(t))) return 'weak';
  return null;
}

// ต่อข้อความ note: หลายบรรทัดคั่นด้วย \n (ตามกติกาเดิมของระบบ) ตัดมาร์กเกอร์รูป [[IMG:n]] ออก และจำกัดความยาวไม่ให้บวม
const NOTE_MAX = 4000;
function joinNote(lines) {
  const out = []; let len = 0;
  for (const l of lines) {
    const t = String(l).replace(/\[\[IMG:\d+\]\]/g, '').replace(/[ \t]+/g, ' ').trim();
    if (!t) continue;
    if (len + t.length > NOTE_MAX) break;
    out.push(t); len += t.length + 1;
  }
  return out.join('\n');
}

// หัวข้อที่ถูกต่อท้ายบรรทัดเดียวกับตัวเลือก/โจทย์ (เช่น ขึ้นบรรทัดใหม่ด้วย Shift+Enter ใน Word หรือไฟล์ข้อความที่ย่อหน้าหาย):
//   "D. ควรเลิกเมื่อพบอุปสรรค บทอ่านที่ 5 (ข้อ 21–25): ขั้นตอน" → ["D. ควรเลิกเมื่อพบอุปสรรค", "บทอ่านที่ 5 (ข้อ 21–25): ขั้นตอน"]
// ตัดเฉพาะเมื่อส่วนท้ายขึ้นต้นด้วยคำหัวข้อ + เลข และมีป้ายช่วงข้อ (ข้อ N–M) — กันตัดผิดกลางประโยคทั่วไป
const GLUED_HEAD = /^(.*?\S)\s+((?:ส่วนที่|ตอนที่|บทอ่านที่|บทความที่|หมวดที่|ภาคที่|เรื่องที่|กิจกรรมที่|ใบงานที่|แบบฝึกหัดที่|part|passage|section|text|reading|story|dialogue|unit)\s*[0-9๐-๙A-Za-zก-ฮ]{1,3}(?![A-Za-zก-๙]).*)$/i;
function splitGluedHeading(line) {
  const raw = String(line ?? '');
  if (!raw.trim()) return [raw];
  if (noteKind(raw) === 'strong') return [raw];            // ทั้งบรรทัดเป็นหัวข้ออยู่แล้ว ไม่ต้องแยก
  const m = raw.match(GLUED_HEAD);
  if (!m) return [raw];
  const tail = m[2].trim();
  return (rangeOf(tail) && noteKind(tail) === 'strong') ? [m[1].trim(), tail] : [raw];
}

module.exports = { noteKind, joinNote, rangeOf, splitGluedHeading };
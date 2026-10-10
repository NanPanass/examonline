// answer-table.js — อ่าน "ตารางเฉลย" จากตารางจริง (แถว × เซลล์) โดยไม่พึ่งไลบรารีใด
//
// รองรับรูปแบบที่พบบ่อย:
//  (1) คู่ [เลขข้อ | เฉลย] เรียงซ้ำเป็นกลุ่มคอลัมน์ในแถวเดียวกัน (แบบในภาพตัวอย่าง)
//        ข้อ | เฉลย | ข้อ | เฉลย | ข้อ | เฉลย
//         1  |  B   | 11  |  B   | 21  |  C
//  (2) ตารางสองคอลัมน์ ข้อ | เฉลย  (มีคอลัมน์คำอธิบายต่อท้ายได้)
//  (3) แนวนอน: แถวเลขข้อ ตามด้วยแถวเฉลย   ข้อ | 1 | 2 | 3 ...   เฉลย | B | C | D ...
// เฉลยในเซลล์เป็นได้ทั้ง "B" "(B)" "B." "B. cat" "ข" "ข. ช้าง" และตัวเลข 1-8 (เฉพาะเมื่อมีหัวตาราง ข้อ/เฉลย กำกับ)
// คืนค่า { entries: { เลขข้อ: 'A'..'H' หรือ 'ก'..'ฌ' }, count, ok }
//   ok = เชื่อได้ว่าเป็นตารางเฉลยจริง (มีหัว ข้อ/เฉลย หรือมีอย่างน้อย 3 คู่)

const THAI_DIGITS = '๐๑๒๓๔๕๖๗๘๙';
const EN = 'ABCDEFGH';
const NUM_LABEL = /^(?:ข้อ(?:ที่)?|no\.?|number|q\.?|question|item)$/i;
const ANS_LABEL = /^(?:เฉลย|คำตอบ|answers?|ans\.?|key)$/i;

const clean = c => String(c ?? '').replace(/[๐-๙]/g, d => THAI_DIGITS.indexOf(d))
  .replace(/[\u200b-\u200d\ufeff\u00a0]/g, ' ').replace(/\s+/g, ' ').trim();

// เซลล์ที่เป็นเลขข้อล้วนๆ: "12" "12." "12)" "ข้อ 12"
function numOf(c) {
  const m = clean(c).match(/^(?:ข้อ\s*)?(\d{1,3})\s*[.)]?$/i);
  return m ? +m[1] : null;
}
// เซลล์ที่เป็นตัวเลือกเฉลย: "B" "(B)" "B." "B. cat" "ข" ; ตัวเลข 1-8 รับเมื่อ allowDigit
function tokOf(c, allowDigit) {
  const t = clean(c);
  const m = t.match(/^\(?([A-Ha-hก-ฌ])\)?(?:[.)]|\s|$)/);
  if (m) return /[a-h]/i.test(m[1]) ? m[1].toUpperCase() : m[1];
  if (allowDigit) { const d = t.match(/^\(?([1-8])\)?[.)]?$/); if (d) return EN[+d[1] - 1]; }
  return null;
}
const consecutive = ns => ns.every((n, i) => i === 0 || n === ns[i - 1] + 1);

function parseKeyGrid(rowsIn) {
  const rows = (rowsIn || []).map(r => (r || []).map(clean));
  const headerSeen = rows.some(r => r.some(c => NUM_LABEL.test(c)) && r.some(c => ANS_LABEL.test(c)))
    || rows.some((r, i) => NUM_LABEL.test(r[0] || '') && rows[i + 1] && ANS_LABEL.test(rows[i + 1][0] || ''));
  const entries = {};
  const put = (n, t) => { if (!(n in entries)) entries[n] = t; };
  const consumed = new Set();

  // (3) แนวนอน: แถวเลขข้อ + แถวเฉลย (ตัดเซลล์หัวแถว "ข้อ"/"เฉลย" ถ้ามี)
  for (let r = 0; r + 1 < rows.length; r++) {
    const a = rows[r], b = rows[r + 1];
    const off = (NUM_LABEL.test(a[0] || '') && ANS_LABEL.test(b[0] || '')) ? 1 : 0;
    const nums = a.slice(off).map(numOf);
    if (nums.length < 3 || nums.some(n => n === null) || !(off || consecutive(nums))) continue;
    const toks = b.slice(off).map(c => tokOf(c, !!off || headerSeen));
    if (toks.length !== nums.length || toks.some(t => !t)) continue;
    nums.forEach((n, i) => put(n, toks[i]));
    consumed.add(r); consumed.add(r + 1); r++;
  }

  // (1)/(2) คู่ [เลขข้อ | เฉลย] เรียงจากซ้ายไปขวาในแต่ละแถว
  rows.forEach((row, r) => {
    if (consumed.has(r)) return;
    for (let i = 0; i < row.length;) {
      const n = numOf(row[i]);
      const t = n !== null && i + 1 < row.length ? tokOf(row[i + 1], headerSeen) : null;
      if (t) { put(n, t); i += 2; } else i++;
    }
  });

  const count = Object.keys(entries).length;
  return { entries, count, ok: count >= 2 && (headerSeen || count >= 3) };
}

module.exports = { parseKeyGrid };
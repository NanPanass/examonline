// docx-images.js — ดึงรูปภาพ + จัดโครงข้อสอบจาก .docx โดยไม่ใช้ AI
// ใช้ mammoth (แปลง docx → HTML พร้อมรูปแบบ data URI ตามลำดับในเอกสาร) + cheerio (อ่าน HTML)
const mammoth = require('mammoth');
const cheerio = require('cheerio');
const { noteKind, joinNote, splitGluedHeading } = require('./section-notes');   // ตัวจับหัวข้อ/คำสั่ง/เนื้อเรื่อง ใช้ร่วมกับ server.js
const { redistributeNotes, repairMergedChoices } = require('./exam-fixups');   // กระจาย note ตามช่วงข้อที่ระบุ + แก้ตัวเลือกที่ถูกรวมกัน
const { parseKeyGrid } = require('./answer-table');   // อ่านตารางเฉลย (ข้อ|เฉลย) จากแถว×เซลล์จริง
const keyLines = entries => Object.keys(entries).map(Number).sort((a, b) => a - b).map(n => n + '. ' + entries[n]);

const KEY_RE = /^\s*\(?([A-Ha-hก-ฌ])[.)]\s*/;        // A.  B)  ก.  ข)
const NUM_RE = /^\s*(?:ข้อ\s*)?(\d{1,3})\s*[.)]\s*/;   // 1.  2)  ข้อ 3.
const IMG_RE = /\[\[IMG:(\d+)\]\]/g;
const LETTERS = 'ABCDEFGH', TH = 'กขคงจฉชซ';
const letterIdx = ch => { const i = LETTERS.indexOf(ch.toUpperCase()); return i >= 0 ? i : TH.indexOf(ch); };

// block ของข้อสอบที่เปิดอยู่มีตัวเลือกครบแล้วหรือยัง (มี "A." หรือ "ก." อย่างน้อย 1 บรรทัด)
const blockHasChoices = b => !!b && b.some(l => KEY_RE.test(l) || splitInlineChoices(l).length >= 2);
// ย่อหน้านี้เป็นจุดเริ่ม "ข้อความอธิบาย" (หัวข้อ/คำสั่ง/เนื้อเรื่อง) ที่ต้องตัดออกจากข้อสอบข้อก่อนหน้าหรือไม่
//  - strong: ตัดเสมอ  - weak (เช่น "Choose the best answer."): ตัดเฉพาะเมื่อข้อก่อนหน้ามีตัวเลือกแล้ว/ไม่ได้อยู่กลางข้อ
function startsNote(l, flowOpen, lastBlock) {
  const k = noteKind(l);
  return k === 'strong' || (k === 'weak' && (!flowOpen || blockHasChoices(lastBlock)));
}

async function docxToBlocks(buffer) {
  const images = [];
  const { value: html } = await mammoth.convertToHtml({ buffer }, {
    convertImage: mammoth.images.imgElement(async (img) => {
      const b64 = await img.read('base64');
      images.push(`data:${img.contentType};base64,${b64}`);
      return { src: `IMG:${images.length}` };          // เก็บลำดับรูปไว้ใน src
    }),
  });
  const $ = cheerio.load(html);
  // <br> (ขึ้นบรรทัดใหม่ด้วย Shift+Enter) ต้องกลายเป็นช่องว่าง ไม่งั้น cheerio.text() จะต่อคำติดกัน "C. dogD. fish" แล้วตัวเลือก D ถูกรวมเข้ากับ C
  const lineOf = p => {
    const c = $(p).clone();
    c.find('br').replaceWith(' ');
    c.find('img').replaceWith(function () { return `[[IMG:${$(this).attr('src').split(':')[1]}]]`; });
    return c.text().replace(/\s+/g, ' ').trim();
  };

  // block = ข้อความทีละย่อหน้าใน "เซลล์ตาราง" หรือ "ย่อหน้านอกตาราง" ตามลำดับเอกสารจริง
  const blocks = []; let flowOpen = false;
  $('body').children().each((_, el) => {
    if (el.tagName === 'table') {
      const wasOpen = flowOpen;
      flowOpen = false;
      // อ่านทั้งตารางเป็นแถว×เซลล์ ถ้าเป็น "ตารางเฉลย" (ข้อ|เฉลย เรียงซ้ำหลายคอลัมน์ / ตารางสองคอลัมน์ / แนวนอน) แปลงเป็นบรรทัด "N. X" ใน block เดียว
      const rows = [];
      $(el).find('tr').each((_, tr) => rows.push($(tr).find('td,th').map((_, td) => $(td).find('p').map((_, p) => lineOf(p)).get().filter(Boolean).join(' ')).get()));
      const g = parseKeyGrid(rows);
      if (g.ok) blocks.push(keyLines(g.entries));
      else if (wasOpen && tableIsChoiceGrid($, el, lineOf)) {
        // ตัวเลือกจัดเป็นตาราง (เช่น 2×2: A | B / C | D) ต่อท้ายข้อที่เปิดอยู่ ตามลำดับแถว→เซลล์ ไม่แตกเป็นคนละ block
        const last = blocks[blocks.length - 1];
        $(el).find('td,th').each((_, td) => $(td).find('p').each((_, p) => { const l = lineOf(p); if (l) last.push(l); }));
        flowOpen = true;
      }
      else $(el).find('td,th').each((_, td) => blocks.push($(td).find('p').map((_, p) => lineOf(p)).get().filter(Boolean)));
    }
    else if (el.tagName === 'p') {
      // ย่อหน้านอกตาราง: เริ่ม block ใหม่ทุกครั้งที่เจอ "เลขข้อ." แล้วต่อย่อหน้าถัดไปเข้า block เดิมจนกว่าจะเจอเลขข้อใหม่
      // หัวข้อที่ถูกต่อท้ายบรรทัดเดียวกับตัวเลือก (Shift+Enter) ต้องแยกออกเป็นบรรทัดหัวข้อของตัวเอง
      const whole = lineOf(el); if (!whole) return;
      for (const l of splitGluedHeading(whole)) {
      const isKeyLine = /^\s*\d{1,3}\s*[.)]\s*[A-Ha-hก-ฌ]\s*$/.test(l);
      if (isKeyLine) { blocks.push([l]); flowOpen = false; }
      else if (NUM_RE.test(l)) { blocks.push([l]); flowOpen = true; }
      else if (/^\s*(?:เฉลย|คำตอบ|answer)/i.test(l)) { blocks.push([l]); flowOpen = false; }   // หัวข้อเฉลย ตัด block ก่อนหน้า
      else if (startsNote(l, flowOpen, blocks[blocks.length - 1])) { blocks.push([l]); flowOpen = false; }   // หัวข้อ/คำสั่ง/เนื้อเรื่อง ต้องไม่ไหลไปต่อท้ายตัวเลือกข้อก่อนหน้า
      else if (flowOpen) blocks[blocks.length - 1].push(l);
      else blocks.push([l]);
      }
    }
  });
  return { blocks, images };
}

// แตกบรรทัดที่มีตัวเลือกหลายตัว เช่น "A. cat\tB. bird\tC. dog\tD. fish" ให้เป็นหลายบรรทัด
// ตัดเฉพาะจุดที่ตัวอักษรเรียงต่อกันจริง (A→B→C→D / ก→ข→ค→ง) เพื่อไม่ตัดผิดกลางประโยค
// startIdx = จำนวนตัวเลือกที่เก็บไว้แล้วในข้อนี้ (0 = ยังไม่มี) — บรรทัด "C. x   D. y" ที่เป็นแถวที่ 2 ของตัวเลือก 2 คอลัมน์ ต้องเริ่มนับที่ C ไม่ใช่ A
// (เดิมบังคับเริ่มที่ A เสมอ ทำให้ D ถูกรวมเข้ากับ C)
function splitInlineChoices(line, startIdx = 0) {
  // ยอมให้ไม่มีช่องว่างหลังจุด ("A.cat") แต่ไม่ตัดที่ตัวย่อ เช่น "a.m." "p.m."
  const re = /(?:^|\s)\(?([A-Ha-hก-ฌ])[.)]\s*(?![A-Za-z]\.)/g;
  const cuts = []; let expect = startIdx, m;
  while ((m = re.exec(line))) {
    const i = letterIdx(m[1]);
    if (i === expect) {
      cuts.push(m.index + (m[0].length - m[0].trimStart().length));
      expect = i + 1;
    }
  }
  // เริ่มที่ A/ก ต้องมีอย่างน้อย 2 ตัวถึงจะตัด (กันข้อความธรรมดา) | เริ่มกลางทาง (ต่อจากตัวเลือกที่มีแล้ว) ตัวเดียวก็ตัดได้
  if (cuts.length < (startIdx > 0 ? 1 : 2)) return [line];
  const out = [];
  if (cuts[0] > 0) out.push(line.slice(0, cuts[0]).trim());
  cuts.forEach((c, k) => out.push(line.slice(c, cuts[k + 1]).trim()));
  return out.filter(Boolean);
}

// อ่าน 1 block เป็นข้อสอบปรนัย: "N." → (ข้อความ/รูปโจทย์) → "A." "B." ... (ข้อความ/รูปตัวเลือก)
function parseQuestionBlock(lines, images) {
  let num = null, mode = 'q'; const q = { text: [], img: null }, ch = [];
  for (const raw of lines) {
    let first = raw;
    if (num === null) { const m = first.match(NUM_RE); if (!m) return null; num = +m[1]; first = first.slice(m[0].length); }
    // แตกตัวเลือกหลายตัวในบรรทัดเดียว โดยนับต่อจากจำนวนตัวเลือกที่มีอยู่แล้ว ("A. x  B. y" แล้วบรรทัดถัดไป "C. z  D. w")
    for (let line of splitInlineChoices(first, ch.length)) {
      const k = line.match(KEY_RE);
      if (k && letterIdx(k[1]) === ch.length) { ch.push({ text: [], image: null }); mode = 'c'; line = line.slice(k[0].length); }
      const target = mode === 'q' ? q : ch[ch.length - 1];
      line = line.replace(IMG_RE, (_, n) => { target.img = images[+n - 1]; return ''; }).trim();
      if (line) target.text.push(line);
    }
  }
  if (num === null || ch.length < 2) return null;
  return { num, q: q.text.join(' '), q_image: q.img, ch: ch.map(c => ({ text: c.text.join(' '), image: c.img ?? null })) };
}

// อ่านเฉลยจาก block ที่เป็น "N. A" (ตารางเฉลยท้ายไฟล์)
function parseKeyBlock(lines) {
  const out = {};
  for (const l of lines) { const m = l.match(/^\s*(\d{1,3})\s*[.)]\s*([A-Ha-hก-ฌ])\s*$/); if (m) out[+m[1]] = letterIdx(m[2]); }
  return out;
}

async function extractDocxExam(buffer) {
  const { blocks, images } = await docxToBlocks(buffer);
  const questions = [], key = {};
  // pending = ข้อความอธิบายที่รอผูกกับ "ข้อถัดไป" (หัวข้อ + คำสั่ง + เนื้อเรื่อง ที่อยู่ติดกัน รวมเป็น note เดียว)
  let pending = [];
  for (const b of blocks) {
    const k = parseKeyBlock(b);
    if (Object.keys(k).length) { Object.assign(key, k); continue; }
    const q = parseQuestionBlock(b, images);
    if (q) {
      if (pending.length) { const note = joinNote(pending); if (note) q.note = note; pending = []; }
      questions.push(q);
      continue;
    }
    if (noteKind(b[0])) pending.push(...b);        // เริ่ม/ต่อหัวข้อ-คำสั่ง
    else if (pending.length) pending.push(...b);   // ย่อหน้าเนื้อเรื่องที่ตามหลังหัวข้อ (ก่อนถึงข้อแรกของช่วง)
    // ไม่ใช่ทั้งสองอย่าง และไม่มี note ค้าง = ข้อความอื่นในไฟล์ (ชื่อเรื่อง ช่องกรอกชื่อ หัวเฉลย) ข้ามไป
  }
  // รูปแบบเดียวกับที่หน้า "นำเข้าจากไฟล์" เดิมใช้อยู่: ch = ข้อความตัวเลือก, chImg = รูปของตัวเลือก
  const out = questions.map(q => ({
    t: 'mc', q: q.q, q_image: q.q_image,
    ch: q.ch.map(c => c.text), chImg: q.ch.map(c => c.image),
    a: Number.isInteger(key[q.num]) ? key[q.num] : 0, ex: '',
    keyFound: q.num in key,
    num: q.num,
    ...(q.note ? { section_note: q.note } : {}),
  }));
  repairMergedChoices(out);                          // เฉลยในโหมดนี้อ่านตามตัวอักษรจริง (A/B/C/D) จึงไม่ต้องเลื่อนค่า a
  redistributeNotes(out, it => it.num);              // "Passage 2 (ข้อ 28–30)" ไปอยู่ที่ข้อ 28 ตามที่ระบุ
  return out;
}
// ตารางที่ทุกเซลล์ขึ้นต้นด้วยตัวเลือก (A. / B. / ก. ...) = ตารางจัดวางตัวเลือก ไม่ใช่โจทย์ใหม่
function tableIsChoiceGrid($, el, lineOf) {
  const cells = $(el).find('td,th').map((_, td) => $(td).find('p').map((_, p) => lineOf(p)).get().filter(Boolean)[0] || '').get().filter(Boolean);
  return cells.length >= 2 && cells.every(c => KEY_RE.test(c));
}
// อ่านเฉพาะ "ตารางเฉลย" ในไฟล์ Word → { entries: {เลขข้อ: ตัวอักษร}, count } (ใช้กับไฟล์ที่ไม่มีรูป ซึ่ง server.js อ่านเป็นข้อความล้วน)
// mammoth.extractRawText ทิ้งโครงสร้างตาราง (ได้ "ข้อ/เฉลย/1/B/11/B/21/C/2/C..." เซลล์ละบรรทัดเรียงตามแถว) จึงต้องอ่านจากตารางโดยตรง
async function extractDocxKey(buffer) {
  const { value: html } = await mammoth.convertToHtml({ buffer }, { convertImage: mammoth.images.imgElement(async () => ({ src: '' })) });
  const $ = cheerio.load(html);
  const entries = {};
  $('table').each((_, t) => {
    const rows = [];
    $(t).find('tr').each((_, tr) => rows.push($(tr).find('td,th').map((_, td) => $(td).text()).get()));
    const g = parseKeyGrid(rows);
    if (g.ok) for (const [n, v] of Object.entries(g.entries)) if (!(n in entries)) entries[n] = v;
  });
  return { entries, count: Object.keys(entries).length };
}
// ข้อความล้วนจาก Word แบบรักษา "การขึ้นบรรทัดใหม่ภายในย่อหน้า" (Shift+Enter / <br>)
// mammoth.extractRawText ทิ้ง <br> ทำให้ "A. by bus⏎B. by bicycle⏎C. by car⏎D. on foot" กลายเป็น "A. by busB. by bicycleC. by carD. on foot"
// → ตัวเลือก D (และตัวอื่น) ถูกรวมเข้าด้วยกัน ทั้งในตัวแยกสำรองและในข้อความที่ส่งให้ AI
async function docxRawText(buffer) {
  const { value: html } = await mammoth.convertToHtml({ buffer }, { convertImage: mammoth.images.imgElement(async () => ({ src: '' })) });
  const marked = html.replace(/<br\s*\/?>/gi, '\n').replace(/<\/(?:p|h[1-6]|li|tr)>/gi, '$&\n\n');
  return cheerio.load(marked).text().replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n');
}
module.exports = { extractDocxExam, docxToBlocks, extractDocxKey, docxRawText };
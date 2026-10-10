// docx-images.js — ดึงรูปภาพ + จัดโครงข้อสอบจาก .docx โดยไม่ใช้ AI
// ใช้ mammoth (แปลง docx → HTML พร้อมรูปแบบ data URI ตามลำดับในเอกสาร) + cheerio (อ่าน HTML)
const mammoth = require('mammoth');
const cheerio = require('cheerio');

const KEY_RE = /^\s*\(?([A-Ha-hก-ฌ])[.)]\s*/;        // A.  B)  ก.  ข)
const NUM_RE = /^\s*(?:ข้อ\s*)?(\d{1,3})\s*[.)]\s*/;   // 1.  2)  ข้อ 3.
const IMG_RE = /\[\[IMG:(\d+)\]\]/g;
const LETTERS = 'ABCDEFGH', TH = 'กขคงจฉชซ';
const letterIdx = ch => { const i = LETTERS.indexOf(ch.toUpperCase()); return i >= 0 ? i : TH.indexOf(ch); };

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
  const lineOf = p => $(p).clone().find('img').replaceWith(function () {
    return `[[IMG:${$(this).attr('src').split(':')[1]}]]`;
  }).end().text().replace(/\s+/g, ' ').trim();

  // block = ข้อความทีละย่อหน้าใน "เซลล์ตาราง" หรือ "ย่อหน้านอกตาราง" ตามลำดับเอกสารจริง
  const blocks = []; let flowOpen = false;
  $('body').children().each((_, el) => {
    if (el.tagName === 'table') { flowOpen = false; $(el).find('td,th').each((_, td) => blocks.push($(td).find('p').map((_, p) => lineOf(p)).get().filter(Boolean))); }
    else if (el.tagName === 'p') {
      // ย่อหน้านอกตาราง: เริ่ม block ใหม่ทุกครั้งที่เจอ "เลขข้อ." แล้วต่อย่อหน้าถัดไปเข้า block เดิมจนกว่าจะเจอเลขข้อใหม่
      const l = lineOf(el); if (!l) return;
      const isKeyLine = /^\s*\d{1,3}\s*[.)]\s*[A-Ha-hก-ฌ]\s*$/.test(l);
      if (isKeyLine) { blocks.push([l]); flowOpen = false; }
      else if (NUM_RE.test(l)) { blocks.push([l]); flowOpen = true; }
      else if (/^\s*(?:เฉลย|คำตอบ|answer)/i.test(l)) { blocks.push([l]); flowOpen = false; }   // หัวข้อเฉลย ตัด block ก่อนหน้า
      else if (flowOpen) blocks[blocks.length - 1].push(l);
      else blocks.push([l]);
    }
  });
  return { blocks, images };
}

// อ่าน 1 block เป็นข้อสอบปรนัย: "N." → (ข้อความ/รูปโจทย์) → "A." "B." ... (ข้อความ/รูปตัวเลือก)
function parseQuestionBlock(lines, images) {
  let num = null, mode = 'q'; const q = { text: [], img: null }, ch = [];
  for (let raw of lines) {
    let line = raw;
    if (num === null) { const m = line.match(NUM_RE); if (!m) return null; num = +m[1]; line = line.slice(m[0].length); }
    const k = mode === 'q' || true ? line.match(KEY_RE) : null;
    if (k && letterIdx(k[1]) === ch.length) { ch.push({ text: [], image: null }); mode = 'c'; line = line.slice(k[0].length); }
    const target = mode === 'q' ? q : ch[ch.length - 1];
    line = line.replace(IMG_RE, (_, n) => { (mode === 'q' ? q : target).img = images[+n - 1]; return ''; }).trim();
    if (line) target.text.push(line);
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
  for (const b of blocks) {
    const k = parseKeyBlock(b);
    if (Object.keys(k).length) { Object.assign(key, k); continue; }
    const q = parseQuestionBlock(b, images);
    if (q) questions.push(q);
  }
  // รูปแบบเดียวกับที่หน้า "นำเข้าจากไฟล์" เดิมใช้อยู่: ch = ข้อความตัวเลือก, chImg = รูปของตัวเลือก
  return questions.map(q => ({
    t: 'mc', q: q.q, q_image: q.q_image,
    ch: q.ch.map(c => c.text), chImg: q.ch.map(c => c.image),
    a: Number.isInteger(key[q.num]) ? key[q.num] : 0, ex: '',
    keyFound: q.num in key,
  }));
}
module.exports = { extractDocxExam, docxToBlocks };
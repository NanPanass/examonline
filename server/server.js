// server.js — ExamHub backend
// - REST API สำหรับชุดข้อสอบ/ผู้ใช้/ผลสอบ (ฐานข้อมูลกลางบน Turso — ทุกคนเห็นชุดเดียวกัน)
// - เฉลยข้อสอบไม่เคยถูกส่งไปฝั่ง client ระหว่างทำข้อสอบ ตรวจให้คะแนนที่ฝั่งเซิร์ฟเวอร์เท่านั้น
// - Socket.io: ห้องสอบสดแบบ Kahoot (host เปิดห้อง ได้ PIN, เพื่อนพิมพ์ชื่อเล่น join, ตอบพร้อมกัน, กระดานคะแนนสด)
//
// หมายเหตุการย้ายมา Turso + Vercel:
// - db.prepare(...).get/all/run(...) ทุกจุดเป็น "async" แล้ว ต้องมี await เสมอ (ดู server/db.js)
// - route handler ทุกตัวถูกครอบด้วย ah(...) เพื่อดัก error จาก await แล้วส่ง 500 กลับ แทนที่แอปจะล่ม
// - export `app` ไว้ให้ Vercel Functions เรียกใช้ตรงๆ (ดู /api/index.js) และยังคง server.listen()
//   ไว้ให้รันแบบปกติ (Render/เครื่องตัวเอง) ได้เหมือนเดิมด้วย
const path = require('path');
const fs = require('fs');
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const mammoth = require('mammoth');
const XLSX = require('xlsx');
const { v4: uuid } = require('uuid');
const http = require('http');
const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');

const db = require('./db');
const { sign, hash, check, optionalAuth, requireAuth, requireAdmin } = require('./auth');

const SECRET = process.env.JWT_SECRET || 'examhub-dev-secret-change-me-in-production';
const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

app.use(cors());
app.use(express.json({ limit: '2mb' }));
// รอให้ schema/seed ของ Turso พร้อมก่อนตอบทุก request แรก (กันปัญหา cold start บน Vercel)
app.use((req, res, next) => { db.ready.then(() => next()).catch(next); });

// ครอบ route handler แบบ async ไว้ในนี้ เพื่อดัก error (เช่น Turso ต่อไม่ติดชั่วคราว) ไม่ให้เซิร์ฟเวอร์ล่ม
const ah = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(err => {
  console.error(err);
  if (!res.headersSent) res.status(500).json({ error: 'เกิดข้อผิดพลาดที่เซิร์ฟเวอร์ กรุณาลองใหม่' });
});

// อัปโหลดรูปภาพ: บน Vercel /tmp เป็นที่เดียวที่เขียนไฟล์ได้ และไม่ถาวร (หายเมื่อ instance ถูกเลิกใช้)
// ใช้ได้สำหรับดีพลอยที่มีดิสก์ถาวร (Render ฯลฯ); บน Vercel ควรย้ายไป object storage ในอนาคต
const uploadDir = process.env.VERCEL ? '/tmp/uploads' : path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
app.use('/uploads', express.static(uploadDir));
app.use(express.static(path.join(__dirname, '..', 'public')));

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _f, cb) => cb(null, uploadDir),
    filename: (_req, f, cb) => cb(null, uuid() + path.extname(f.originalname || '').slice(0, 10)),
  }),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, f, cb) => cb(null, /^image\/(png|jpe?g|webp|gif)$/.test(f.mimetype)),
});

app.use(optionalAuth);

// ---------- Auth ----------
app.post('/api/auth/register', ah(async (req, res) => {
  const { email, password, name } = req.body || {};
  if (!email || !password || password.length < 6) return res.status(400).json({ error: 'อีเมลและรหัสผ่าน (อย่างน้อย 6 ตัว) จำเป็นต้องกรอก' });
  const existing = await db.prepare('SELECT id FROM users WHERE email=?').get(email.toLowerCase());
  if (existing) return res.status(409).json({ error: 'อีเมลนี้ถูกใช้แล้ว' });
  const isFirst = (await db.prepare('SELECT COUNT(*) c FROM users').get()).c === 0;
  const user = { id: uuid(), email: email.toLowerCase(), password_hash: hash(password), name: name || email.split('@')[0], role: isFirst ? 'admin' : 'user', created_at: Date.now() };
  try {
    await db.prepare('INSERT INTO users (id,email,password_hash,name,role,created_at) VALUES (@id,@email,@password_hash,@name,@role,@created_at)').run(user);
  } catch (err) {
    if (String(err.message || '').includes('UNIQUE')) return res.status(409).json({ error: 'อีเมลนี้ถูกใช้แล้ว' });
    throw err;
  }
  res.json({ token: sign(user), user: { id: user.id, email: user.email, name: user.name, role: user.role } });
}));

app.post('/api/auth/login', ah(async (req, res) => {
  const { email, password } = req.body || {};
  const user = await db.prepare('SELECT * FROM users WHERE email=?').get((email || '').toLowerCase());
  if (!user || !check(password || '', user.password_hash)) return res.status(401).json({ error: 'อีเมลหรือรหัสผ่านไม่ถูกต้อง' });
  res.json({ token: sign(user), user: { id: user.id, email: user.email, name: user.name, role: user.role } });
}));

app.get('/api/auth/me', (req, res) => res.json({ user: req.user || null }));

// ---------- Sets: public catalog ----------
async function withCounts(s) {
  const qs = await db.prepare('SELECT type FROM questions WHERE set_id=?').all(s.id);
  return { ...s, qCount: qs.length, mcCount: qs.filter(q => q.type === 'mc').length, saCount: qs.filter(q => q.type === 'sa').length };
}
app.get('/api/sets', ah(async (req, res) => {
  const isAdmin = req.user && req.user.role === 'admin';
  const rows = isAdmin ? await db.prepare('SELECT * FROM sets ORDER BY created_at DESC').all()
    : await db.prepare('SELECT * FROM sets WHERE is_public=1 ORDER BY created_at DESC').all();
  res.json(await Promise.all(rows.map(withCounts)));
}));

// ---------- Admin: manage sets & questions ----------
app.get('/api/admin/sets/:id', requireAuth, requireAdmin, ah(async (req, res) => {
  const s = await db.prepare('SELECT * FROM sets WHERE id=?').get(req.params.id);
  if (!s) return res.status(404).json({ error: 'ไม่พบชุดข้อสอบ' });
  const rows = await db.prepare('SELECT * FROM questions WHERE set_id=? ORDER BY ord ASC').all(s.id);
  const qs = rows.map(q => ({ ...q, choices: q.choices ? JSON.parse(q.choices) : null, answer: JSON.parse(q.answer) }));
  res.json({ ...s, questions: qs });
}));
app.post('/api/admin/sets', requireAuth, requireAdmin, ah(async (req, res) => {
  const { title, cat, time, desc, is_public } = req.body || {};
  if (!title) return res.status(400).json({ error: 'กรุณาระบุชื่อชุดข้อสอบ' });
  const s = { id: uuid(), title, cat: cat || 'ทั่วไป', time: +time || 0, desc: desc || '', is_public: is_public === false ? 0 : 1, created_by: req.user.uid, created_at: Date.now() };
  await db.prepare('INSERT INTO sets (id,title,cat,time,desc,is_public,created_by,created_at) VALUES (@id,@title,@cat,@time,@desc,@is_public,@created_by,@created_at)').run(s);
  res.json(await withCounts(s));
}));
app.put('/api/admin/sets/:id', requireAuth, requireAdmin, ah(async (req, res) => {
  const s = await db.prepare('SELECT * FROM sets WHERE id=?').get(req.params.id);
  if (!s) return res.status(404).json({ error: 'ไม่พบชุดข้อสอบ' });
  const b = req.body || {};
  const merged = { ...s, title: b.title ?? s.title, cat: b.cat ?? s.cat, time: b.time != null ? +b.time : s.time, desc: b.desc ?? s.desc, is_public: b.is_public != null ? (b.is_public ? 1 : 0) : s.is_public };
  await db.prepare('UPDATE sets SET title=@title,cat=@cat,time=@time,desc=@desc,is_public=@is_public WHERE id=@id').run(merged);
  // คืนค่าพร้อม questions เต็ม (เหมือน GET /api/admin/sets/:id) เพราะฝั่งหน้าเว็บเอา response
  // นี้ไปแทนที่ edSet ทั้งก้อนหลังบันทึก ถ้าไม่มี questions ติดมาด้วย ปุ่ม "แก้ไข" ข้อสอบแต่ละข้อ
  // ที่กดหลังจากนี้จะพังเงียบๆ เพราะ edSet.questions เป็น undefined
  const rows = await db.prepare('SELECT * FROM questions WHERE set_id=? ORDER BY ord ASC').all(merged.id);
  const qs = rows.map(q => ({ ...q, choices: q.choices ? JSON.parse(q.choices) : null, answer: JSON.parse(q.answer) }));
  res.json({ ...(await withCounts(merged)), questions: qs });
}));
app.delete('/api/admin/sets/:id', requireAuth, requireAdmin, ah(async (req, res) => {
  await db.prepare('DELETE FROM questions WHERE set_id=?').run(req.params.id);
  await db.prepare('DELETE FROM sets WHERE id=?').run(req.params.id);
  res.json({ ok: true });
}));

function validQuestionBody(b) {
  if (!b || !b.q || !b.type) return 'กรุณากรอกโจทย์และเลือกรูปแบบคำตอบ';
  if (b.type === 'mc') {
    if (!Array.isArray(b.choices) || b.choices.length < 2) return 'ต้องมีอย่างน้อย 2 ตัวเลือก';
    if (!Number.isInteger(b.answer) || b.answer < 0 || b.answer >= b.choices.length) return 'ระบุตัวเลือกที่ถูกให้ตรง';
  } else if (b.type === 'sa') {
    if (!Array.isArray(b.answer) || !b.answer.length) return 'ใส่คำตอบที่ถูกอย่างน้อย 1 คำตอบ';
  } else return 'รูปแบบคำถามไม่ถูกต้อง';
  return null;
}
app.post('/api/admin/sets/:id/questions', requireAuth, requireAdmin, ah(async (req, res) => {
  const err = validQuestionBody(req.body);
  if (err) return res.status(400).json({ error: err });
  const s = await db.prepare('SELECT id FROM sets WHERE id=?').get(req.params.id);
  if (!s) return res.status(404).json({ error: 'ไม่พบชุดข้อสอบ' });
  const ord = (await db.prepare('SELECT COALESCE(MAX(ord),-1)+1 n FROM questions WHERE set_id=?').get(s.id)).n;
  const b = req.body;
  const q = { id: uuid(), set_id: s.id, ord, type: b.type, q: b.q, q_image: b.q_image || null, choices: b.type === 'mc' ? JSON.stringify(b.choices) : null, answer: JSON.stringify(b.answer), explanation: b.explanation || '' };
  await db.prepare('INSERT INTO questions (id,set_id,ord,type,q,q_image,choices,answer,explanation) VALUES (@id,@set_id,@ord,@type,@q,@q_image,@choices,@answer,@explanation)').run(q);
  res.json({ ...q, choices: b.type === 'mc' ? b.choices : null, answer: b.answer });
}));
app.put('/api/admin/questions/:id', requireAuth, requireAdmin, ah(async (req, res) => {
  const err = validQuestionBody(req.body);
  if (err) return res.status(400).json({ error: err });
  const existing = await db.prepare('SELECT * FROM questions WHERE id=?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'ไม่พบข้อสอบ' });
  const b = req.body;
  await db.prepare('UPDATE questions SET type=@type,q=@q,q_image=@q_image,choices=@choices,answer=@answer,explanation=@explanation WHERE id=@id')
    .run({ id: existing.id, type: b.type, q: b.q, q_image: b.q_image || null, choices: b.type === 'mc' ? JSON.stringify(b.choices) : null, answer: JSON.stringify(b.answer), explanation: b.explanation || '' });
  res.json({ ok: true });
}));
app.delete('/api/admin/questions/:id', requireAuth, requireAdmin, ah(async (req, res) => {
  await db.prepare('DELETE FROM questions WHERE id=?').run(req.params.id);
  res.json({ ok: true });
}));

app.post('/api/upload', requireAuth, requireAdmin, upload.single('image'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'ไม่พบไฟล์รูปภาพ หรือไฟล์ไม่ใช่ png/jpg/webp/gif' });
  res.json({ url: '/uploads/' + req.file.filename });
});

// ---------- Import questions from a file (Word / Excel / PDF / image / md / txt) ----------
// ไฟล์ที่อ่านออกเป็นข้อความ (docx, xlsx, md, txt) ถูกดึงข้อความออกมาก่อนแล้วส่งให้ AI ช่วยแยกข้อสอบ
// ไฟล์ที่เป็นภาพ/PDF ส่งเป็นรูป/เอกสารตรงให้ AI (Claude รองรับ vision อยู่แล้ว) โดยไม่ต้อง OCR เอง
// ถ้าไม่ได้ตั้งค่า ANTHROPIC_API_KEY ไว้ ระบบจะ fallback ไปใช้ตัวแยกแบบ regex สำหรับไฟล์ข้อความล้วน
const importUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 15 * 1024 * 1024 } });
const IMPORT_PROMPT = `คุณคือผู้ช่วยแยกข้อสอบจากเอกสาร อ่านเนื้อหาที่แนบมาทั้งหมดอย่างละเอียด แล้วแยกข้อสอบทุกข้อออกมา
ตอบกลับเป็น JSON array เท่านั้น ห้ามมีข้อความอื่นนอกเหนือจาก JSON ห้ามใช้ \`\`\` ล้อมคำตอบ
แต่ละข้อในอาเรย์เป็นหนึ่งในสองรูปแบบ:
ปรนัย: {"t":"mc","q":"โจทย์","ch":["ตัวเลือกที่ 1","ตัวเลือกที่ 2", ...],"a":เลขลำดับตัวเลือกที่ถูกเริ่มที่ 0,"ex":"คำอธิบายเฉลยสั้นๆ หรือค่าว่าง"}
อัตนัย (มีคำตอบตายตัว): {"t":"sa","q":"โจทย์","a":["คำตอบที่ยอมรับ 1","คำตอบที่ยอมรับ 2 ถ้ามี"],"ex":""}
กติกา:
- อย่าใส่ตัวอักษรนำหน้าตัวเลือก (ก. ข. A. B. 1. 2.) ปนอยู่ในข้อความตัวเลือก ให้ตัดออก
- ถ้าเอกสารระบุเฉลยไว้ (ไม่ว่าจะอยู่ติดกับโจทย์หรือแยกเป็นหน้าเฉลยท้ายเล่ม) ให้จับคู่แล้วใช้เฉลยนั้น
- ถ้าไม่มีเฉลยระบุไว้เลย ให้เลือกคำตอบที่ถูกต้องที่สุดตามความรู้ทั่วไป
- คงภาษาของเอกสารต้นฉบับ ไม่แปล
- ข้ามส่วนที่ไม่ใช่ข้อสอบ เช่น คำนำ หน้าปก เลขหน้า
- ถ้าไม่พบข้อสอบเลย ให้ตอบเป็น [] (อาเรย์ว่าง)`;

async function callClaudeExtract({ text, fileBuffer, mediaType }) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) { const e = new Error('NO_API_KEY'); e.code = 'NO_API_KEY'; throw e; }
  const content = [];
  if (fileBuffer) {
    const isPdf = mediaType === 'application/pdf';
    content.push({ type: isPdf ? 'document' : 'image', source: { type: 'base64', media_type: mediaType, data: fileBuffer.toString('base64') } });
  }
  content.push({ type: 'text', text: text ? `เนื้อหาที่แยกได้จากเอกสาร:\n\n${text.slice(0, 60000)}` : 'แยกข้อสอบจากไฟล์ที่แนบมา' });
  const resp = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({ model: process.env.ANTHROPIC_MODEL || 'claude-sonnet-5', max_tokens: 8000, system: IMPORT_PROMPT, messages: [{ role: 'user', content }] }),
  });
  if (!resp.ok) { const t = await resp.text().catch(() => ''); throw new Error('เรียก AI ไม่สำเร็จ (' + resp.status + ') ' + t.slice(0, 200)); }
  const data = await resp.json();
  const raw = (data.content || []).map(b => b.text || '').join('').trim().replace(/^```json?/i, '').replace(/```$/,'').trim();
  let parsed;
  try { parsed = JSON.parse(raw); } catch (e) { throw new Error('AI ตอบกลับไม่ใช่ JSON ที่อ่านได้ ลองใหม่อีกครั้ง'); }
  return Array.isArray(parsed) ? parsed : (parsed.questions || []);
}

// ตัวแยกสำรองแบบไม่ใช้ AI (ใช้เมื่อไม่ได้ตั้งค่า ANTHROPIC_API_KEY) รองรับเฉพาะไฟล์ข้อความ
function heuristicExtract(text) {
  const T = 'กขคงจฉชซฌ';
  let blocks = ('\n' + text).split(/\n(?=\s*(?:ข้อ\s*)?\d{1,3}\s*[.)]\s)/);
  if (blocks.length < 3) blocks = text.split('\n').filter(l => l.includes('='));
  const out = [];
  for (const b of blocks) {
    const qLines = [], choices = []; let ans = '';
    for (const l of b.split('\n').map(x => x.trim()).filter(Boolean)) {
      let m;
      if ((m = l.match(/^(?:เฉลย|คำตอบ|ตอบ|answer|ans)\s*[:：\-]?\s*(.+)$/i))) { ans = m[1].trim(); continue; }
      if ((m = l.match(/^\(?([A-Ha-hก-ฌ])[.)]\s*(.+)$/))) { choices.push(m[2]); continue; }
      qLines.push(l);
    }
    const q = qLines.join(' ').replace(/^(?:ข้อ\s*)?\d{1,3}\s*[.)]\s*/, '').trim();
    if (!q) continue;
    const eq = q.match(/^(.*?)\s*[=＝]\s*(.+)$/);
    if (choices.length > 1) {
      const k = ans.replace(/[().\s]/g, '').charAt(0);
      let idx = T.indexOf(k); if (idx < 0) idx = 'abcdefgh'.indexOf(k.toLowerCase());
      out.push({ t: 'mc', q, ch: choices, a: idx >= 0 && idx < choices.length ? idx : 0, ex: '' });
    } else if (ans) out.push({ t: 'sa', q, a: ans.split(/\s*[\/|]\s*/).filter(Boolean), ex: '' });
    else if (eq) out.push({ t: 'sa', q: eq[1].trim(), a: eq[2].split(/\s*[\/|]\s*/).filter(Boolean), ex: '' });
  }
  return out;
}

const IMAGE_MEDIA = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.gif': 'image/gif', '.webp': 'image/webp' };

app.post('/api/admin/import', requireAuth, requireAdmin, importUpload.single('file'), ah(async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'ไม่พบไฟล์ที่อัปโหลด' });
  const ext = path.extname(req.file.originalname || '').toLowerCase();
  const buf = req.file.buffer;
  let list, source;
  try {
    if (ext === '.pdf' || IMAGE_MEDIA[ext]) {
      list = await callClaudeExtract({ fileBuffer: buf, mediaType: ext === '.pdf' ? 'application/pdf' : IMAGE_MEDIA[ext] });
      source = 'AI (อ่านไฟล์โดยตรง)';
    } else {
      let text = '';
      if (ext === '.docx') text = (await mammoth.extractRawText({ buffer: buf })).value;
      else if (ext === '.xlsx' || ext === '.xls' || ext === '.csv') {
        const wb = XLSX.read(buf, { type: 'buffer' });
        text = wb.SheetNames.map(n => XLSX.utils.sheet_to_csv(wb.Sheets[n])).join('\n\n');
      } else if (ext === '.txt' || ext === '.md') text = buf.toString('utf-8');
      else return res.status(400).json({ error: 'ไม่รองรับไฟล์นามสกุลนี้ รองรับ .docx .xlsx .xls .csv .pdf .jpg .png .gif .webp .txt .md' });
      if (!text.trim()) return res.status(400).json({ error: 'ไม่พบข้อความในไฟล์นี้' });
      try { list = await callClaudeExtract({ text }); source = 'AI'; }
      catch (e) { if (e.code !== 'NO_API_KEY') throw e; list = heuristicExtract(text); source = 'ตัวแยกอัตโนมัติ (ยังไม่ได้ตั้งค่า AI — ผลลัพธ์อาจไม่แม่นยำเท่า)'; }
    }
  } catch (e) {
    if (e.code === 'NO_API_KEY') return res.status(400).json({ error: 'ไฟล์นี้ต้องใช้ AI ช่วยอ่าน (รูปภาพ/PDF) แต่เซิร์ฟเวอร์ยังไม่ได้ตั้งค่า ANTHROPIC_API_KEY กรุณาตั้งค่าก่อนใช้งาน' });
    throw e;
  }
  list = (list || []).filter(x => x && x.q && (
    x.t === 'mc' ? Array.isArray(x.ch) && x.ch.length >= 2 && Number.isInteger(x.a) && x.a >= 0 && x.a < x.ch.length
      : Array.isArray(x.a) && x.a.length
  )).map(x => ({ ...x, ex: x.ex || '' }));
  if (!list.length) return res.status(400).json({ error: 'ไม่พบข้อสอบในไฟล์นี้ ลองตรวจรูปแบบไฟล์หรือใช้ไฟล์อื่น' });
  res.json({ source, questions: list });
}));

app.post('/api/admin/sets/:id/questions/bulk', requireAuth, requireAdmin, ah(async (req, res) => {
  const s = await db.prepare('SELECT id FROM sets WHERE id=?').get(req.params.id);
  if (!s) return res.status(404).json({ error: 'ไม่พบชุดข้อสอบ' });
  const items = Array.isArray(req.body.questions) ? req.body.questions : [];
  let ord = (await db.prepare('SELECT COALESCE(MAX(ord),-1)+1 n FROM questions WHERE set_id=?').get(s.id)).n;
  let added = 0;
  for (const it of items) {
    const type = it.t === 'sa' ? 'sa' : 'mc';
    const q = { id: uuid(), set_id: s.id, ord: ord++, type,
      q: String(it.q || '').trim(), q_image: null,
      choices: type === 'mc' ? JSON.stringify((it.ch || []).map(c => ({ text: c, image: null }))) : null,
      answer: JSON.stringify(type === 'mc' ? it.a : (it.a || [])),
      explanation: it.ex || '' };
    if (!q.q) continue;
    if (type === 'mc' && (!it.ch || it.ch.length < 2)) continue;
    if (type === 'sa' && (!it.a || !it.a.length)) continue;
    await db.prepare('INSERT INTO questions (id,set_id,ord,type,q,q_image,choices,answer,explanation) VALUES (@id,@set_id,@ord,@type,@q,@q_image,@choices,@answer,@explanation)').run(q);
    added++;
  }
  res.json({ ok: true, added });
}));

app.get('/api/admin/users', requireAuth, requireAdmin, ah(async (req, res) => {
  res.json(await db.prepare('SELECT id,email,name,role,created_at FROM users ORDER BY created_at ASC').all());
}));
app.put('/api/admin/users/:id/role', requireAuth, requireAdmin, ah(async (req, res) => {
  const role = req.body.role === 'admin' ? 'admin' : 'user';
  await db.prepare('UPDATE users SET role=? WHERE id=?').run(role, req.params.id);
  res.json({ ok: true });
}));

// ---------- Exam taking: answers never leave the server until grading ----------
const sessions = new Map(); // sessionId -> { qs:[fullQuestion...], setId, setTitle, mode, startedAt }
const sanitizeQ = q => ({ id: q.id, type: q.type, q: q.q, q_image: q.q_image, choices: q.choices ? JSON.parse(q.choices).map(c => ({ text: c.text, image: c.image })) : null });

app.post('/api/exam/start', ah(async (req, res) => {
  const { setId, mode, format, shuffle } = req.body || {};
  const s = await db.prepare('SELECT * FROM sets WHERE id=?').get(setId);
  if (!s) return res.status(404).json({ error: 'ไม่พบชุดข้อสอบ' });
  let qs = await db.prepare('SELECT * FROM questions WHERE set_id=? ORDER BY ord ASC').all(setId);
  if (format === 'mc' || format === 'sa') qs = qs.filter(q => q.type === format);
  if (shuffle) qs = qs.slice().sort(() => Math.random() - 0.5);
  if (!qs.length) return res.status(400).json({ error: 'ชุดข้อสอบนี้ไม่มีข้อสอบในรูปแบบที่เลือก' });
  const sessionId = uuid();
  sessions.set(sessionId, { qs, setId, setTitle: s.title, mode: mode === 'p' ? 'p' : 'm', startedAt: Date.now() });
  res.json({ sessionId, set: { title: s.title, time: s.time }, questions: qs.map(sanitizeQ) });
}));

function gradeOne(q, ans) {
  if (q.type === 'mc') return ans === JSON.parse(q.answer);
  const accepted = JSON.parse(q.answer);
  const norm = x => String(x ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
  return ans != null && accepted.some(a => norm(a) === norm(ans));
}
function rightAnswerText(q) {
  return q.type === 'mc' ? JSON.parse(q.choices)[JSON.parse(q.answer)].text : JSON.parse(q.answer).join(' / ');
}

app.post('/api/exam/:sid/check', (req, res) => {
  const sess = sessions.get(req.params.sid);
  if (!sess) return res.status(410).json({ error: 'เซสชันหมดอายุ กรุณาเริ่มทำข้อสอบใหม่' });
  const q = sess.qs.find(x => x.id === req.body.questionId);
  if (!q) return res.status(404).json({ error: 'ไม่พบข้อสอบข้อนี้' });
  const ok = gradeOne(q, req.body.answer);
  res.json({ ok, rightAnswer: rightAnswerText(q), rightIndex: q.type === 'mc' ? JSON.parse(q.answer) : null, explanation: q.explanation || '' });
});

app.post('/api/exam/:sid/submit', ah(async (req, res) => {
  const sess = sessions.get(req.params.sid);
  if (!sess) return res.status(410).json({ error: 'เซสชันหมดอายุ กรุณาเริ่มทำข้อสอบใหม่' });
  const { answers = {}, sec = 0, away = 0, guestName } = req.body || {};
  const detail = sess.qs.map(q => {
    const a = answers[q.id];
    return { questionId: q.id, q: q.q, type: q.type, choices: q.choices ? JSON.parse(q.choices) : null, given: a ?? null, correct: gradeOne(q, a), rightAnswer: rightAnswerText(q), explanation: q.explanation || '' };
  });
  const score = detail.filter(d => d.correct).length;
  const result = {
    id: uuid(), user_id: req.user ? req.user.uid : null, guest_name: req.user ? null : (guestName || 'ผู้เยี่ยมชม'),
    set_id: sess.setId, set_title: sess.setTitle, mode: sess.mode, score, total: detail.length, sec: +sec || 0, away: +away || 0,
    detail: JSON.stringify(detail), created_at: Date.now(),
  };
  await db.prepare('INSERT INTO results (id,user_id,guest_name,set_id,set_title,mode,score,total,sec,away,detail,created_at) VALUES (@id,@user_id,@guest_name,@set_id,@set_title,@mode,@score,@total,@sec,@away,@detail,@created_at)').run(result);
  sessions.delete(req.params.sid);
  res.json({ id: result.id, score, total: detail.length, sec: result.sec, away: result.away, mode: result.mode, title: sess.setTitle, detail });
}));

// ---------- Results / history ----------
app.get('/api/results', ah(async (req, res) => {
  if (!req.user) return res.json([]); // guests don't have a persistent identity to list history by
  const isAdmin = req.user.role === 'admin' && req.query.all === '1';
  const rows = isAdmin ? await db.prepare('SELECT r.*, u.email FROM results r LEFT JOIN users u ON u.id=r.user_id ORDER BY created_at DESC').all()
    : await db.prepare('SELECT * FROM results WHERE user_id=? ORDER BY created_at DESC').all(req.user.uid);
  res.json(rows.map(r => ({ id: r.id, title: r.set_title, score: r.score, total: r.total, mode: r.mode, sec: r.sec, away: r.away, date: r.created_at, email: r.email || r.guest_name })));
}));
app.get('/api/results/:id', ah(async (req, res) => {
  const r = await db.prepare('SELECT * FROM results WHERE id=?').get(req.params.id);
  if (!r) return res.status(404).json({ error: 'ไม่พบผลสอบ' });
  res.json({ id: r.id, title: r.set_title, score: r.score, total: r.total, mode: r.mode, sec: r.sec, away: r.away, date: r.created_at, detail: JSON.parse(r.detail) });
}));

// =====================================================================
// Live rooms (Kahoot-style): host opens a room from a set -> gets a PIN.
// Friends join with just a nickname (no account needed) and answer live.
// Room state lives in memory (it's a live session, not a durable record).
// หมายเหตุ: ห้องสอบสดใช้ memory ของ process เดียว — ถ้ารันบน Vercel serverless
// ที่กระจาย instance หลายตัว โฮสต์กับผู้เล่นอาจสุ่มไปคนละ instance ทำให้ใช้งานไม่ได้จริง
// แนะนำให้รันฟีเจอร์นี้บนโฮสต์ที่มี process รันต่อเนื่องตัวเดียว เช่น Render แทน
// =====================================================================
const rooms = new Map(); // pin -> room state
const socketRoom = new Map(); // socket.id -> pin
const QUESTION_SECONDS = 20;

io.use((socket, next) => {
  const t = socket.handshake.auth && socket.handshake.auth.token;
  if (t) { try { socket.user = jwt.verify(t, SECRET); } catch (e) { /* treat as guest */ } }
  next();
});

function genPin() { let p; do { p = String(Math.floor(100000 + Math.random() * 900000)); } while (rooms.has(p)); return p; }
function playerList(room) { return [...room.players.values()].map(p => ({ nickname: p.nickname, score: p.score })).sort((a, b) => b.score - a.score); }
function clearTimer(room) { if (room.timer) { clearTimeout(room.timer); room.timer = null; } }

function revealCurrent(pin) {
  const room = rooms.get(pin);
  if (!room || room.status !== 'question') return;
  clearTimer(room);
  room.status = 'reveal';
  const q = room.set.qs[room.qIndex];
  io.to('pin:' + pin).emit('room:reveal', { rightAnswer: rightAnswerText(q), explanation: q.explanation || '', leaderboard: playerList(room) });
}
function askCurrent(pin) {
  const room = rooms.get(pin);
  if (!room) return;
  room.status = 'question';
  room.qStartedAt = Date.now();
  room.players.forEach(p => { p.answered = false; });
  const q = room.set.qs[room.qIndex];
  const payload = { qIndex: room.qIndex, total: room.set.qs.length, startedAt: room.qStartedAt, seconds: QUESTION_SECONDS, ...sanitizeQ(q) };
  io.to('pin:' + pin).emit('room:question', payload);
  clearTimer(room);
  room.timer = setTimeout(() => revealCurrent(pin), QUESTION_SECONDS * 1000);
}

async function finishRoom(pin, room) {
  room.status = 'ended';
  clearTimer(room);
  const board = playerList(room);
  io.to('pin:' + pin).emit('room:ended', { leaderboard: board });
  for (const p of board) {
    await db.prepare('INSERT INTO results (id,user_id,guest_name,set_id,set_title,mode,score,total,sec,away,detail,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)')
      .run(uuid(), null, p.nickname + ' (ห้องสอบสด)', room.setId, room.set.title, 'm', 0, room.set.qs.length, 0, 0, JSON.stringify({ livePoints: p.score }), Date.now());
  }
}

io.on('connection', socket => {
  socket.on('host:create', async ({ setId }, cb) => {
    try {
      if (!socket.user) return cb && cb({ error: 'ต้องเข้าสู่ระบบก่อนจึงจะเปิดห้องสอบสดได้' });
      const s = await db.prepare('SELECT * FROM sets WHERE id=?').get(setId);
      if (!s) return cb && cb({ error: 'ไม่พบชุดข้อสอบ' });
      const qs = await db.prepare("SELECT * FROM questions WHERE set_id=? AND type='mc' ORDER BY ord ASC").all(setId);
      if (!qs.length) return cb && cb({ error: 'ชุดข้อสอบนี้ยังไม่มีข้อสอบปรนัย (ห้องสอบสดใช้ได้เฉพาะข้อแบบเลือกตอบ)' });
      const pin = genPin();
      const room = { pin, setId, set: { title: s.title, qs }, hostSocket: socket.id, status: 'lobby', qIndex: -1, players: new Map(), timer: null };
      rooms.set(pin, room);
      socketRoom.set(socket.id, pin);
      socket.join('pin:' + pin);
      await db.prepare('INSERT INTO rooms (id,pin,set_id,host_name,status,created_at) VALUES (?,?,?,?,?,?)').run(uuid(), pin, setId, socket.user.name, 'lobby', Date.now());
      cb && cb({ ok: true, pin, title: s.title, total: qs.length });
    } catch (err) { console.error(err); cb && cb({ error: 'เกิดข้อผิดพลาด กรุณาลองใหม่' }); }
  });

  socket.on('player:join', ({ pin, nickname }, cb) => {
    const room = rooms.get(pin);
    if (!room) return cb && cb({ error: 'ไม่พบห้องนี้ ตรวจสอบ PIN อีกครั้ง' });
    if (room.status !== 'lobby') return cb && cb({ error: 'ห้องนี้เริ่มสอบไปแล้ว เข้าร่วมไม่ได้' });
    const nick = String(nickname || '').trim().slice(0, 24) || 'ผู้เล่น';
    room.players.set(socket.id, { nickname: nick, score: 0, answered: false });
    socketRoom.set(socket.id, pin);
    socket.join('pin:' + pin);
    io.to('pin:' + pin).emit('room:players', playerList(room));
    cb && cb({ ok: true, title: room.set.title });
  });

  socket.on('host:start', ({ pin }, cb) => {
    const room = rooms.get(pin);
    if (!room || room.hostSocket !== socket.id) return cb && cb({ error: 'ไม่มีสิทธิ์ควบคุมห้องนี้' });
    if (!room.players.size) return cb && cb({ error: 'ยังไม่มีผู้เล่นเข้าห้อง' });
    room.qIndex = 0;
    askCurrent(pin);
    cb && cb({ ok: true });
  });

  socket.on('host:next', async ({ pin }, cb) => {
    try {
      const room = rooms.get(pin);
      if (!room || room.hostSocket !== socket.id) return cb && cb({ error: 'ไม่มีสิทธิ์ควบคุมห้องนี้' });
      if (room.status === 'question') { revealCurrent(pin); return cb && cb({ ok: true }); }
      room.qIndex++;
      if (room.qIndex >= room.set.qs.length) await finishRoom(pin, room);
      else askCurrent(pin);
      cb && cb({ ok: true });
    } catch (err) { console.error(err); cb && cb({ error: 'เกิดข้อผิดพลาด กรุณาลองใหม่' }); }
  });

  socket.on('player:answer', ({ pin, answer }, cb) => {
    const room = rooms.get(pin);
    const player = room && room.players.get(socket.id);
    if (!room || !player || room.status !== 'question') return cb && cb({ error: 'ตอบไม่ได้ในตอนนี้' });
    if (player.answered) return cb && cb({ error: 'ตอบไปแล้ว' });
    player.answered = true;
    const q = room.set.qs[room.qIndex];
    const correct = gradeOne(q, answer);
    const elapsed = Date.now() - (room.qStartedAt || Date.now());
    const pts = correct ? Math.round(500 + 500 * Math.max(0, 1 - elapsed / (QUESTION_SECONDS * 1000))) : 0;
    player.score += pts;
    cb && cb({ ok: true, correct, points: pts });
    const allAnswered = [...room.players.values()].every(p => p.answered);
    if (allAnswered) revealCurrent(pin);
  });

  socket.on('disconnect', () => {
    const pin = socketRoom.get(socket.id);
    if (!pin) return;
    const room = rooms.get(pin);
    if (!room) return;
    if (room.players.delete(socket.id)) io.to('pin:' + pin).emit('room:players', playerList(room));
    if (room.hostSocket === socket.id) { clearTimer(room); io.to('pin:' + pin).emit('room:hostLeft'); rooms.delete(pin); }
    socketRoom.delete(socket.id);
  });
});

const PORT = process.env.PORT || 3000;
// รันแบบ process ปกติ (Render/เครื่องตัวเอง) เท่านั้น — บน Vercel ไฟล์ api/index.js
// จะ import { app } จากไฟล์นี้ไปใช้กับ Vercel Functions แทนโดยไม่เรียก listen()
if (require.main === module) {
  db.ready
    .then(() => server.listen(PORT, () => console.log(`ExamHub server running on http://localhost:${PORT}`)))
    .catch(err => { console.error('เชื่อมต่อฐานข้อมูล Turso ไม่สำเร็จ:', err); process.exit(1); });
}

module.exports = { app, server, io, dbReady: db.ready };

// db.js — ชั้นข้อมูลกลางบน Turso (libSQL) แทน better-sqlite3 ไฟล์เดียว
// เหตุผลที่ย้าย: Vercel (และ serverless ทั่วไป) ไม่มีดิสก์ถาวรให้เขียนไฟล์ .db
// ทุกฟังก์ชันที่ไฟล์นี้ export เป็น "async" ทั้งหมด (ต่างจาก better-sqlite3 เดิมที่เป็น sync)
// ต้องใส่ await หน้าทุกจุดที่เรียก db.prepare(...).get/all/run(...) ใน server.js
const { createClient } = require('@libsql/client');

const url = process.env.TURSO_DATABASE_URL;
const authToken = process.env.TURSO_AUTH_TOKEN;
if (!url) {
  console.error('ขาด environment variable TURSO_DATABASE_URL — สมัคร Turso แล้วตั้งค่านี้ก่อนรัน');
}
const client = createClient({ url, authToken });

// เลียนแบบ API เดิมของ better-sqlite3: db.prepare(sql).get(params) / .all(params) / .run(params)
// รองรับทั้ง named params แบบ @name (ของเดิมในโค้ดใช้แบบนี้อยู่แล้ว) และ positional (?)
// แปลง named params (@name) เป็น positional (?) โดยใช้เฉพาะ key ที่ SQL อ้างถึงจริง
// เหตุผล: เซิร์ฟเวอร์ Turso (remote) จะ error "Input error" ถ้าส่ง named args เกินหรือไม่ตรงกับ
// placeholder ใน SQL (เช่น ส่ง created_by/created_at เกินมา) ขณะที่ SQLite local ยอมให้ผ่าน
function prepareCall(sql, args) {
  if (args.length === 1 && args[0] && typeof args[0] === 'object' && !Array.isArray(args[0])) {
    const obj = args[0];
    const values = [];
    const text = sql.replace(/@([A-Za-z_][A-Za-z0-9_]*)/g, (_, name) => {
      if (!(name in obj)) throw new Error('Missing SQL parameter: ' + name);
      const v = obj[name];
      values.push(v === undefined ? null : v);
      return '?';
    });
    return { sql: text, args: values };
  }
  return { sql, args: args.map(v => (v === undefined ? null : v)) };
}
function prepare(sql) {
  return {
    async get(...args) {
      const rs = await client.execute(prepareCall(sql, args));
      return rs.rows[0] || undefined;
    },
    async all(...args) {
      const rs = await client.execute(prepareCall(sql, args));
      return rs.rows.map(r => ({ ...r }));
    },
    async run(...args) {
      const rs = await client.execute(prepareCall(sql, args));
      return { changes: rs.rowsAffected, lastInsertRowid: rs.lastInsertRowid };
    },
  };
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'user',
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS sets (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  cat TEXT NOT NULL DEFAULT 'ทั่วไป',
  time INTEGER NOT NULL DEFAULT 0,
  desc TEXT DEFAULT '',
  is_public INTEGER NOT NULL DEFAULT 1,
  created_by TEXT,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS questions (
  id TEXT PRIMARY KEY,
  set_id TEXT NOT NULL REFERENCES sets(id) ON DELETE CASCADE,
  ord INTEGER NOT NULL DEFAULT 0,
  type TEXT NOT NULL,
  q TEXT NOT NULL,
  q_image TEXT,
  choices TEXT,
  answer TEXT NOT NULL,
  explanation TEXT DEFAULT '',
  section_note TEXT
);
CREATE TABLE IF NOT EXISTS results (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  guest_name TEXT,
  set_id TEXT,
  set_title TEXT NOT NULL,
  mode TEXT NOT NULL,
  score INTEGER NOT NULL,
  total INTEGER NOT NULL,
  sec INTEGER NOT NULL,
  away INTEGER NOT NULL DEFAULT 0,
  detail TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS rooms (
  id TEXT PRIMARY KEY,
  pin TEXT UNIQUE NOT NULL,
  set_id TEXT NOT NULL,
  host_name TEXT,
  status TEXT NOT NULL DEFAULT 'lobby',
  created_at INTEGER NOT NULL
);
`;

async function seedIfEmpty() {
  const n = (await client.execute('SELECT COUNT(*) c FROM sets')).rows[0].c;
  if (n > 0) return;
  const { v4: uuid } = require('uuid');
  const now = Date.now();
  const mk = async (title, cat, time, desc, qs) => {
    const setId = uuid();
    await client.execute({
      sql: 'INSERT INTO sets (id,title,cat,time,desc,is_public,created_by,created_at) VALUES (?,?,?,?,?,1,NULL,?)',
      args: [setId, title, cat, time, desc, now],
    });
    for (let i = 0; i < qs.length; i++) {
      const q = qs[i];
      await client.execute({
        sql: 'INSERT INTO questions (id,set_id,ord,type,q,q_image,choices,answer,explanation) VALUES (?,?,?,?,?,?,?,?,?)',
        args: [uuid(), setId, i, q.t, q.q, null,
          q.t === 'mc' ? JSON.stringify(q.ch.map(c => ({ text: c, image: null }))) : null,
          JSON.stringify(q.a), q.ex || ''],
      });
    }
  };
  await mk('คำศัพท์อังกฤษพื้นฐาน', 'ภาษาอังกฤษ', 5, 'คำศัพท์ที่ใช้บ่อยในชีวิตประจำวัน', [
    { t: 'sa', q: 'Red แปลว่าอะไร', a: ['สีแดง', 'แดง'], ex: 'Red คือสีแดง' },
    { t: 'mc', q: '"Apple" แปลว่าอะไร', ch: ['กล้วย', 'แอปเปิล', 'ส้ม', 'องุ่น'], a: 1, ex: 'Apple = แอปเปิล' },
    { t: 'sa', q: 'Book แปลว่าอะไร', a: ['หนังสือ', 'สมุด'], ex: 'Book คือหนังสือ' },
    { t: 'mc', q: 'คำตรงข้ามของ "Hot" คือ?', ch: ['Warm', 'Cold', 'Big', 'Fast'], a: 1, ex: 'Hot ↔ Cold' },
  ]);
  await mk('คณิตศาสตร์คิดเร็ว', 'คณิตศาสตร์', 5, 'บวก ลบ คูณ หาร พื้นฐาน', [
    { t: 'sa', q: '5 + 3 = ?', a: ['8'], ex: '5 + 3 = 8' },
    { t: 'sa', q: '12 × 4 = ?', a: ['48'], ex: '12 × 4 = 48' },
    { t: 'mc', q: 'ข้อใดเป็นจำนวนเฉพาะ', ch: ['9', '15', '17', '21'], a: 2, ex: '17 หารลงตัวเฉพาะ 1 และ 17' },
  ]);
}

// ต้องรอ schema+seed เสร็จก่อนเซิร์ฟเวอร์เริ่มรับ request จริง — server.js จะ await ตัวนี้ก่อน listen()
// ฐานข้อมูลที่ deploy ไปแล้วก่อนหน้านี้มีตาราง questions อยู่แล้วโดยไม่มีคอลัมน์ section_note
// CREATE TABLE IF NOT EXISTS ด้านบนจะไม่เพิ่มคอลัมน์ใหม่ให้ตารางที่มีอยู่แล้ว ต้อง ALTER TABLE เพิ่มเอง
// (ครอบ try/catch เพราะถ้าเพิ่มไปแล้วครั้งก่อน รันซ้ำจะ error "duplicate column" ซึ่งไม่ใช่ปัญหา)
async function migrate() {
  try { await client.execute('ALTER TABLE questions ADD COLUMN section_note TEXT'); }
  catch (e) { if (!/duplicate column|already exists/i.test(e.message || '')) throw e; }
}

const ready = (async () => {
  await client.executeMultiple(SCHEMA);
  await migrate();
  await seedIfEmpty();
})();

module.exports = { prepare, ready, client };

// db.js — ชั้นข้อมูลกลาง (SQLite ไฟล์เดียว, ไม่ต้องติดตั้ง DB server แยก)
// ทุกคนที่เรียก API ตัวเดียวกันจะเห็นข้อมูลชุดเดียวกัน — นี่คือสิ่งที่ localStorage ทำไม่ได้
const path = require('path');
const Database = require('better-sqlite3');

const db = new Database(path.join(__dirname, 'examhub.db'));
db.pragma('journal_mode = WAL');

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'user', -- 'user' | 'admin'
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
  type TEXT NOT NULL, -- 'mc' | 'sa'
  q TEXT NOT NULL,
  q_image TEXT,
  choices TEXT,   -- JSON: [{text,image}]  (mc only)
  answer TEXT NOT NULL, -- JSON: number (mc, index) | string[] (sa, accepted answers)
  explanation TEXT DEFAULT ''
);

CREATE TABLE IF NOT EXISTS results (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  guest_name TEXT,
  set_id TEXT,
  set_title TEXT NOT NULL,
  mode TEXT NOT NULL, -- 'm' real | 'p' practice
  score INTEGER NOT NULL,
  total INTEGER NOT NULL,
  sec INTEGER NOT NULL,
  away INTEGER NOT NULL DEFAULT 0,
  detail TEXT NOT NULL, -- JSON
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS rooms (
  id TEXT PRIMARY KEY,
  pin TEXT UNIQUE NOT NULL,
  set_id TEXT NOT NULL,
  host_name TEXT,
  status TEXT NOT NULL DEFAULT 'lobby', -- lobby|question|reveal|ended
  created_at INTEGER NOT NULL
);
`);

function seedIfEmpty() {
  const n = db.prepare('SELECT COUNT(*) c FROM sets').get().c;
  if (n > 0) return;
  const { v4: uuid } = require('uuid');
  const now = Date.now();
  const mk = (title, cat, time, desc, qs) => {
    const setId = uuid();
    db.prepare('INSERT INTO sets (id,title,cat,time,desc,is_public,created_by,created_at) VALUES (?,?,?,?,?,1,NULL,?)')
      .run(setId, title, cat, time, desc, now);
    qs.forEach((q, i) => {
      db.prepare('INSERT INTO questions (id,set_id,ord,type,q,q_image,choices,answer,explanation) VALUES (?,?,?,?,?,?,?,?,?)')
        .run(uuid(), setId, i, q.t, q.q, null,
          q.t === 'mc' ? JSON.stringify(q.ch.map(c => ({ text: c, image: null }))) : null,
          JSON.stringify(q.a), q.ex || '');
    });
  };
  mk('คำศัพท์อังกฤษพื้นฐาน', 'ภาษาอังกฤษ', 5, 'คำศัพท์ที่ใช้บ่อยในชีวิตประจำวัน', [
    { t: 'sa', q: 'Red แปลว่าอะไร', a: ['สีแดง', 'แดง'], ex: 'Red คือสีแดง' },
    { t: 'mc', q: '"Apple" แปลว่าอะไร', ch: ['กล้วย', 'แอปเปิล', 'ส้ม', 'องุ่น'], a: 1, ex: 'Apple = แอปเปิล' },
    { t: 'sa', q: 'Book แปลว่าอะไร', a: ['หนังสือ', 'สมุด'], ex: 'Book คือหนังสือ' },
    { t: 'mc', q: 'คำตรงข้ามของ "Hot" คือ?', ch: ['Warm', 'Cold', 'Big', 'Fast'], a: 1, ex: 'Hot ↔ Cold' },
  ]);
  mk('คณิตศาสตร์คิดเร็ว', 'คณิตศาสตร์', 5, 'บวก ลบ คูณ หาร พื้นฐาน', [
    { t: 'sa', q: '5 + 3 = ?', a: ['8'], ex: '5 + 3 = 8' },
    { t: 'sa', q: '12 × 4 = ?', a: ['48'], ex: '12 × 4 = 48' },
    { t: 'mc', q: 'ข้อใดเป็นจำนวนเฉพาะ', ch: ['9', '15', '17', '21'], a: 2, ex: '17 หารลงตัวเฉพาะ 1 และ 17' },
  ]);
}
seedIfEmpty();

module.exports = db;

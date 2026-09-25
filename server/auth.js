// auth.js — สมัคร/ล็อกอินจริง (bcrypt + JWT) แทนปุ่ม "จำลอง Google" เดิม
// หมายเหตุ: นี่คือ auth ของระบบเอง (email+password) ใช้งานได้จริงทันที
// ถ้าต้องการ "Sign in with Google" ของจริงในอนาคต ให้เพิ่ม passport-google-oauth20
// และสมัคร OAuth Client ID/Secret ของคุณเองใน Google Cloud Console (ไม่มีใครทำแทนได้
// เพราะต้องผูกกับโดเมนที่คุณ deploy จริง) — โครง route ไว้ให้พร้อมต่อที่ /api/auth/google (TODO)
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

const SECRET = process.env.JWT_SECRET || 'examhub-dev-secret-change-me-in-production';

function sign(user) {
  return jwt.sign({ uid: user.id, role: user.role, name: user.name, email: user.email }, SECRET, { expiresIn: '30d' });
}

function hash(pw) { return bcrypt.hashSync(pw, 10); }
function check(pw, h) { return bcrypt.compareSync(pw, h); }

// แนบ req.user ถ้ามี token ที่ถูกต้อง แต่ไม่บังคับ (ให้ guest เข้าดูของสาธารณะได้)
function optionalAuth(req, _res, next) {
  const h = req.headers.authorization;
  if (h && h.startsWith('Bearer ')) {
    try { req.user = jwt.verify(h.slice(7), SECRET); } catch (e) { /* token เสีย/หมดอายุ -> ถือเป็น guest */ }
  }
  next();
}
function requireAuth(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'กรุณาเข้าสู่ระบบ' });
  next();
}
function requireAdmin(req, res, next) {
  if (!req.user || req.user.role !== 'admin') return res.status(403).json({ error: 'ต้องเป็นผู้ดูแลระบบ' });
  next();
}

module.exports = { sign, hash, check, optionalAuth, requireAuth, requireAdmin };

// api/index.js — จุดเข้าของ Vercel Functions
// Vercel เปิดรองรับ WebSocket ใน Functions แล้ว (public beta, มิ.ย. 2026) โดย export
// เป็น http.Server ตรงๆ (เหมือนตัวอย่างในเอกสารของ Vercel) แทนที่จะ export แค่ express app
// เท่ากับ Socket.IO (ห้องสอบสด) ใช้งานได้จากไฟล์เดียวกันนี้โดยไม่ต้องแก้ server/server.js เพิ่ม
const { server } = require('../server/server');

module.exports = server;

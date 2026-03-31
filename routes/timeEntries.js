const express = require('express');
const db = require('../db/database');
const router = express.Router();

function requireAuth(req, res, next) {
  if (!req.session.userId) return res.status(401).json({ error: 'Not authenticated' });
  next();
}
function requireAdmin(req, res, next) {
  if (!req.session.userId || req.session.role !== 'admin') return res.status(403).json({ error: 'Admin only' });
  next();
}

// Clock in
router.post('/clock-in', requireAuth, (req, res) => {
  const techId = req.session.userId;
  const open = db.prepare("SELECT id FROM time_entries WHERE tech_id=? AND clock_out IS NULL").get(techId);
  if (open) return res.status(409).json({ error: 'Already clocked in' });
  const { notes } = req.body;
  const result = db.prepare("INSERT INTO time_entries (tech_id, clock_in, notes) VALUES (?,?,?)").run(techId, Date.now(), notes || null);
  res.json({ id: result.lastInsertRowid });
});

// Clock out
router.post('/clock-out', requireAuth, (req, res) => {
  const techId = req.session.userId;
  const open = db.prepare("SELECT id FROM time_entries WHERE tech_id=? AND clock_out IS NULL").get(techId);
  if (!open) return res.status(409).json({ error: 'Not clocked in' });
  db.prepare("UPDATE time_entries SET clock_out=? WHERE id=?").run(Date.now(), open.id);
  res.json({ ok: true });
});

// Get current session for logged-in tech
router.get('/current', requireAuth, (req, res) => {
  const entry = db.prepare("SELECT * FROM time_entries WHERE tech_id=? AND clock_out IS NULL").get(req.session.userId);
  res.json(entry || null);
});

// Get entries for current tech
router.get('/mine', requireAuth, (req, res) => {
  const entries = db.prepare("SELECT * FROM time_entries WHERE tech_id=? AND clock_out IS NOT NULL ORDER BY clock_in DESC").all(req.session.userId);
  res.json(entries);
});

// Admin: get all entries with filters
router.get('/', requireAdmin, (req, res) => {
  const { techId, from, to } = req.query;
  let sql = `SELECT te.*, u.name as tech_name, u.pay_rate FROM time_entries te JOIN users u ON u.id=te.tech_id WHERE te.clock_out IS NOT NULL`;
  const params = [];
  if (techId) { sql += ` AND te.tech_id=?`; params.push(parseInt(techId)); }
  if (from)   { sql += ` AND te.clock_in >= ?`; params.push(new Date(from).getTime()); }
  if (to)     { sql += ` AND te.clock_in <= ?`; params.push(new Date(to + 'T23:59:59').getTime()); }
  sql += ` ORDER BY te.clock_in DESC`;
  const entries = db.prepare(sql).all(...params);
  res.json(entries);
});

// Admin: who is currently clocked in
router.get('/active', requireAdmin, (req, res) => {
  const active = db.prepare(`SELECT te.*, u.name as tech_name FROM time_entries te JOIN users u ON u.id=te.tech_id WHERE te.clock_out IS NULL`).all();
  res.json(active);
});

module.exports = router;

// Admin: add a manual time entry for any technician
router.post('/admin-add', requireAdmin, (req, res) => {
  const { techId, clockIn, clockOut, notes } = req.body;
  if (!techId || !clockIn) return res.status(400).json({ error: 'Technician and clock-in time are required' });
  const ci = new Date(clockIn).getTime();
  const co = clockOut ? new Date(clockOut).getTime() : null;
  if (isNaN(ci)) return res.status(400).json({ error: 'Invalid clock-in time' });
  if (co && co <= ci) return res.status(400).json({ error: 'Clock-out must be after clock-in' });
  const result = db.prepare("INSERT INTO time_entries (tech_id, clock_in, clock_out, notes) VALUES (?,?,?,?)")
    .run(parseInt(techId), ci, co, notes || null);
  res.json({ id: result.lastInsertRowid });
});

// Admin: edit any time entry
router.put('/:id', requireAdmin, (req, res) => {
  const id = parseInt(req.params.id);
  const { clockIn, clockOut, notes } = req.body;
  if (!clockIn) return res.status(400).json({ error: 'Clock-in time is required' });
  const ci = new Date(clockIn).getTime();
  const co = clockOut ? new Date(clockOut).getTime() : null;
  if (isNaN(ci)) return res.status(400).json({ error: 'Invalid clock-in time' });
  if (co && co <= ci) return res.status(400).json({ error: 'Clock-out must be after clock-in' });
  db.prepare("UPDATE time_entries SET clock_in=?, clock_out=?, notes=? WHERE id=?")
    .run(ci, co, notes || null, id);
  res.json({ ok: true });
});

// Admin: delete a time entry
router.delete('/:id', requireAdmin, (req, res) => {
  db.prepare("DELETE FROM time_entries WHERE id=?").run(parseInt(req.params.id));
  res.json({ ok: true });
});

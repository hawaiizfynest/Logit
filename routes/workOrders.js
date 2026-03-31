const express = require('express');
const db = require('../db/database');
const router = express.Router();

function requireAdmin(req, res, next) {
  if (!req.session.userId || req.session.role !== 'admin') return res.status(403).json({ error: 'Admin only' });
  next();
}
function requireAuth(req, res, next) {
  if (!req.session.userId) return res.status(401).json({ error: 'Not authenticated' });
  next();
}

// Get work orders (admin sees all, tech sees assigned)
router.get('/', requireAuth, (req, res) => {
  const { status, techId } = req.query;
  let sql = `SELECT wo.*, u.name as tech_name FROM work_orders wo LEFT JOIN users u ON u.id=wo.assigned_to WHERE 1=1`;
  const params = [];
  if (req.session.role === 'tech') {
    sql += ` AND wo.assigned_to=?`; params.push(req.session.userId);
  } else {
    if (techId) { sql += ` AND wo.assigned_to=?`; params.push(parseInt(techId)); }
  }
  if (status) { sql += ` AND wo.status=?`; params.push(status); }
  sql += ` ORDER BY wo.created_at DESC`;
  res.json(db.prepare(sql).all(...params));
});

// Create work order
router.post('/', requireAdmin, (req, res) => {
  const { title, customer, address, description, assignedTo } = req.body;
  if (!title || !customer) return res.status(400).json({ error: 'Title and customer required' });
  const result = db.prepare("INSERT INTO work_orders (title, customer, address, description, assigned_to) VALUES (?,?,?,?,?)").run(title.trim(), customer.trim(), address||null, description||null, assignedTo ? parseInt(assignedTo) : null);
  res.json({ id: result.lastInsertRowid });
});

// Update work order
router.put('/:id', requireAuth, (req, res) => {
  const id = parseInt(req.params.id);
  if (req.session.role === 'tech') {
    // Tech can only update notes and status (in-progress)
    const { notes, status } = req.body;
    const allowed = ['open','in-progress'];
    if (status && !allowed.includes(status)) return res.status(403).json({ error: 'Not allowed' });
    db.prepare("UPDATE work_orders SET notes=?, status=COALESCE(?,status) WHERE id=? AND assigned_to=?").run(notes||null, status||null, id, req.session.userId);
  } else {
    const { title, customer, address, description, assignedTo, status, notes } = req.body;
    db.prepare("UPDATE work_orders SET title=?, customer=?, address=?, description=?, assigned_to=?, status=?, notes=? WHERE id=?").run(title, customer, address||null, description||null, assignedTo ? parseInt(assignedTo) : null, status, notes||null, id);
  }
  res.json({ ok: true });
});

// Close work order
router.post('/:id/close', requireAdmin, (req, res) => {
  db.prepare("UPDATE work_orders SET status='closed', closed_at=? WHERE id=?").run(Date.now(), parseInt(req.params.id));
  res.json({ ok: true });
});

// Delete work order
router.delete('/:id', requireAdmin, (req, res) => {
  db.prepare("DELETE FROM work_orders WHERE id=?").run(parseInt(req.params.id));
  res.json({ ok: true });
});

module.exports = router;

const express = require('express');
const bcrypt  = require('bcryptjs');
const db      = require('../db/database');
const router  = express.Router();

function requireAdmin(req, res, next) {
  if (!req.session.userId || req.session.role !== 'admin') return res.status(403).json({ error: 'Admin only' });
  next();
}

// GET all admins
router.get('/', requireAdmin, (req, res) => {
  const admins = db.prepare("SELECT id, name, username, role, email, mfa_enabled, mfa_method, active, created_at FROM users WHERE role='admin' ORDER BY name").all();
  res.json(admins);
});

// POST create admin
router.post('/', requireAdmin, (req, res) => {
  const { name, username, password, email } = req.body;
  if (!name || !username || !password) return res.status(400).json({ error: 'Name, username and password required' });
  if (password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' });
  const exists = db.prepare("SELECT id FROM users WHERE username=?").get(username.toLowerCase().trim());
  if (exists) return res.status(409).json({ error: 'Username already exists' });
  const hash = bcrypt.hashSync(password, 10);
  const result = db.prepare("INSERT INTO users (name, username, password, role, pay_rate, email) VALUES (?,?,?,'admin',0,?)")
    .run(name.trim(), username.toLowerCase().trim(), hash, email || null);
  res.json({ id: result.lastInsertRowid });
});

// PUT update admin
router.put('/:id', requireAdmin, (req, res) => {
  const id = parseInt(req.params.id);
  const { name, username, password, email } = req.body;
  if (!name || !username) return res.status(400).json({ error: 'Name and username required' });

  // Prevent editing yourself via this route (use profile instead)
  if (id === req.session.userId) return res.status(400).json({ error: 'Use My Profile to edit your own account' });

  const dup = db.prepare("SELECT id FROM users WHERE username=? AND id!=?").get(username.toLowerCase().trim(), id);
  if (dup) return res.status(409).json({ error: 'Username already exists' });

  if (password) {
    if (password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' });
    const hash = bcrypt.hashSync(password, 10);
    db.prepare("UPDATE users SET name=?, username=?, password=?, email=? WHERE id=? AND role='admin'")
      .run(name.trim(), username.toLowerCase().trim(), hash, email || null, id);
  } else {
    db.prepare("UPDATE users SET name=?, username=?, email=? WHERE id=? AND role='admin'")
      .run(name.trim(), username.toLowerCase().trim(), email || null, id);
  }
  res.json({ ok: true });
});

// DELETE admin (cannot delete yourself)
router.delete('/:id', requireAdmin, (req, res) => {
  const id = parseInt(req.params.id);
  if (id === req.session.userId) return res.status(400).json({ error: 'You cannot delete your own account' });
  // Make sure at least one admin remains
  const count = db.prepare("SELECT COUNT(*) as c FROM users WHERE role='admin' AND active=1").get();
  if (count.c <= 1) return res.status(400).json({ error: 'Cannot delete the last admin account' });
  db.prepare("UPDATE users SET active=0 WHERE id=? AND role='admin'").run(id);
  res.json({ ok: true });
});

module.exports = router;

// Change role
router.put('/:id/role', requireAdmin, (req, res) => {
  const id   = parseInt(req.params.id);
  const role = req.body.role;
  if (!['admin', 'tech'].includes(role)) return res.status(400).json({ error: 'Invalid role' });
  if (id === req.session.userId) return res.status(400).json({ error: 'You cannot change your own role' });
  if (role === 'tech') {
    const count = db.prepare("SELECT COUNT(*) as c FROM users WHERE role='admin' AND active=1").get();
    if (count.c <= 1) return res.status(400).json({ error: 'Cannot demote the last admin' });
  }
  db.prepare("UPDATE users SET role=? WHERE id=?").run(role, id);
  res.json({ ok: true });
});

// Hard delete
router.delete('/:id/hard', requireAdmin, (req, res) => {
  const id = parseInt(req.params.id);
  if (id === req.session.userId) return res.status(400).json({ error: 'You cannot delete your own account' });
  const count = db.prepare("SELECT COUNT(*) as c FROM users WHERE role='admin' AND active=1").get();
  if (count.c <= 1) return res.status(400).json({ error: 'Cannot delete the last admin account' });
  db.prepare("DELETE FROM users WHERE id=?").run(id);
  res.json({ ok: true });
});

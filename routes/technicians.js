const express = require('express');
const bcrypt  = require('bcryptjs');
const db      = require('../db/database');
const { requireAuth } = require('./auth');
const router  = express.Router();

function requireAdmin(req, res, next) {
  if (!req.session.userId || req.session.role !== 'admin') return res.status(403).json({ error: 'Admin only' });
  next();
}

// GET all technicians
router.get('/', requireAdmin, (req, res) => {
  const techs = db.prepare("SELECT id, name, username, role, pay_rate, active, email, mfa_enabled, mfa_method, created_at FROM users WHERE role='tech' AND active=1 ORDER BY name").all();
  res.json(techs);
});

// POST create technician
router.post('/', requireAdmin, (req, res) => {
  const { name, username, password, payRate, email } = req.body;
  if (!name || !username || !password) return res.status(400).json({ error: 'Name, username and password required' });
  const exists = db.prepare("SELECT id FROM users WHERE username=?").get(username.toLowerCase().trim());
  if (exists) return res.status(409).json({ error: 'Username already exists' });
  const hash = bcrypt.hashSync(password, 10);
  const result = db.prepare("INSERT INTO users (name, username, password, role, pay_rate, email) VALUES (?,?,?,?,?,?)")
    .run(name.trim(), username.toLowerCase().trim(), hash, 'tech', parseFloat(payRate) || 0, email || null);
  res.json({ id: result.lastInsertRowid });
});

// PUT update technician
router.put('/:id', requireAdmin, (req, res) => {
  const { name, username, password, payRate, email, mfaEnabled } = req.body;
  const id = parseInt(req.params.id);
  if (!name || !username) return res.status(400).json({ error: 'Name and username required' });
  const dup = db.prepare("SELECT id FROM users WHERE username=? AND id!=?").get(username.toLowerCase().trim(), id);
  if (dup) return res.status(409).json({ error: 'Username already exists' });

  if (password) {
    const hash = bcrypt.hashSync(password, 10);
    if (mfaEnabled !== undefined) {
      db.prepare("UPDATE users SET name=?, username=?, password=?, pay_rate=?, email=?, mfa_enabled=? WHERE id=?")
        .run(name.trim(), username.toLowerCase().trim(), hash, parseFloat(payRate)||0, email||null, mfaEnabled?1:0, id);
    } else {
      db.prepare("UPDATE users SET name=?, username=?, password=?, pay_rate=?, email=? WHERE id=?")
        .run(name.trim(), username.toLowerCase().trim(), hash, parseFloat(payRate)||0, email||null, id);
    }
  } else {
    if (mfaEnabled !== undefined) {
      db.prepare("UPDATE users SET name=?, username=?, pay_rate=?, email=?, mfa_enabled=? WHERE id=?")
        .run(name.trim(), username.toLowerCase().trim(), parseFloat(payRate)||0, email||null, mfaEnabled?1:0, id);
    } else {
      db.prepare("UPDATE users SET name=?, username=?, pay_rate=?, email=? WHERE id=?")
        .run(name.trim(), username.toLowerCase().trim(), parseFloat(payRate)||0, email||null, id);
    }
  }
  res.json({ ok: true });
});

// DELETE (deactivate) technician
router.delete('/:id', requireAdmin, (req, res) => {
  db.prepare("UPDATE users SET active=0 WHERE id=? AND role='tech'").run(parseInt(req.params.id));
  res.json({ ok: true });
});

module.exports = router;

// Change role (tech -> admin or admin -> tech)
router.put('/:id/role', requireAdmin, (req, res) => {
  const id   = parseInt(req.params.id);
  const role = req.body.role;
  if (!['admin', 'tech'].includes(role)) return res.status(400).json({ error: 'Invalid role' });
  if (id === req.session.userId) return res.status(400).json({ error: 'You cannot change your own role' });
  db.prepare("UPDATE users SET role=? WHERE id=?").run(role, id);
  res.json({ ok: true });
});

// Hard delete a user (admin only, cannot delete yourself)
router.delete('/:id/hard', requireAdmin, (req, res) => {
  const id = parseInt(req.params.id);
  if (id === req.session.userId) return res.status(400).json({ error: 'You cannot delete your own account' });
  // Ensure at least one admin remains
  const user = db.prepare("SELECT role FROM users WHERE id=?").get(id);
  if (user?.role === 'admin') {
    const count = db.prepare("SELECT COUNT(*) as c FROM users WHERE role='admin' AND active=1").get();
    if (count.c <= 1) return res.status(400).json({ error: 'Cannot delete the last admin account' });
  }
  // Anonymize entries rather than breaking foreign keys
  db.prepare("UPDATE time_entries SET notes='[deleted user]' WHERE tech_id=?").run(id);
  db.prepare("DELETE FROM users WHERE id=?").run(id);
  res.json({ ok: true });
});

const express = require('express');
const db      = require('../db/database');
const router  = express.Router();

function requireAdmin(req, res, next) {
  if (!req.session.userId || req.session.role !== 'admin') return res.status(403).json({ error: 'Admin only' });
  next();
}

// GET all bans
router.get('/', requireAdmin, (req, res) => {
  const bans = db.prepare(`
    SELECT b.*, u.username as banned_by_username
    FROM bans b LEFT JOIN users u ON u.id = b.banned_by
    ORDER BY b.created_at DESC
  `).all();
  res.json(bans);
});

// POST add ban
router.post('/', requireAdmin, (req, res) => {
  const { type, value, reason } = req.body;
  if (!type || !value) return res.status(400).json({ error: 'Type and value are required' });
  if (!['ip', 'email', 'username'].includes(type)) return res.status(400).json({ error: 'Type must be ip, email, or username' });

  // Prevent banning yourself
  const self = db.prepare("SELECT * FROM users WHERE id=?").get(req.session.userId);
  if (type === 'username' && value.toLowerCase() === self.username) return res.status(400).json({ error: 'You cannot ban yourself' });
  if (type === 'email' && self.email && value.toLowerCase() === self.email.toLowerCase()) return res.status(400).json({ error: 'You cannot ban yourself' });

  const exists = db.prepare("SELECT id FROM bans WHERE type=? AND LOWER(value)=LOWER(?)").get(type, value);
  if (exists) return res.status(409).json({ error: 'This ban already exists' });

  db.prepare("INSERT INTO bans (type, value, reason, banned_by) VALUES (?,?,?,?)")
    .run(type, value.trim(), reason || null, req.session.userId);
  res.json({ ok: true });
});

// DELETE remove ban
router.delete('/:id', requireAdmin, (req, res) => {
  db.prepare("DELETE FROM bans WHERE id=?").run(parseInt(req.params.id));
  res.json({ ok: true });
});

// GET recent login IPs for all users (admin view)
router.get('/logins', requireAdmin, (req, res) => {
  const logs = db.prepare(`
    SELECT ll.user_id, ll.ip, ll.created_at, u.username, u.name, u.role
    FROM login_logs ll
    JOIN users u ON u.id = ll.user_id
    WHERE ll.id IN (
      SELECT MAX(id) FROM login_logs GROUP BY user_id
    )
    ORDER BY ll.created_at DESC
  `).all();
  res.json(logs);
});

module.exports = router;

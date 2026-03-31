const express    = require('express');
const bcrypt     = require('bcryptjs');
const nodemailer = require('nodemailer');
const db         = require('../db/database');
const router     = express.Router();

function sendAdminNotification(request) {
  if (!process.env.SMTP_HOST) return Promise.resolve();
  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT) || 587,
    secure: false,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });
  return transporter.sendMail({
    from: process.env.SMTP_FROM || 'noreply@logged.digital',
    to: process.env.SMTP_USER,
    subject: `Logit — New Registration Request from ${request.name}`,
    text: `A new technician registration request has been submitted.\n\nName: ${request.name}\nUsername: ${request.username}\nEmail: ${request.email || 'Not provided'}\n\nLog in to Logit to approve or deny this request.`,
  });
}

// POST — submit registration request (public, no auth needed)
router.post('/', (req, res) => {
  const { name, username, email, password, confirmPassword } = req.body;

  if (!name || !username || !password) return res.status(400).json({ error: 'Name, username and password are required' });
  if (password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' });
  if (password !== confirmPassword) return res.status(400).json({ error: 'Passwords do not match' });

  const uname = username.toLowerCase().trim();

  // Check username not already taken by active user
  const exists = db.prepare("SELECT id FROM users WHERE username=? AND active=1").get(uname);
  if (exists) return res.status(409).json({ error: 'That username is already taken' });

  // Check no pending request with same username
  const pending = db.prepare("SELECT id FROM registration_requests WHERE username=? AND status='pending'").get(uname);
  if (pending) return res.status(409).json({ error: 'A request with that username is already pending' });

  const hash = bcrypt.hashSync(password, 10);
  const result = db.prepare("INSERT INTO registration_requests (name, username, password, email) VALUES (?,?,?,?)")
    .run(name.trim(), uname, hash, email?.trim() || null);

  const request = db.prepare("SELECT * FROM registration_requests WHERE id=?").get(result.lastInsertRowid);
  sendAdminNotification(request).catch(e => console.error('Notification email error:', e));

  res.json({ ok: true });
});

// GET — list all pending requests (admin only)
router.get('/', (req, res) => {
  if (!req.session.userId || req.session.role !== 'admin') return res.status(403).json({ error: 'Admin only' });
  const requests = db.prepare("SELECT * FROM registration_requests WHERE status='pending' ORDER BY created_at DESC").all();
  res.json(requests);
});

// POST approve
router.post('/:id/approve', (req, res) => {
  if (!req.session.userId || req.session.role !== 'admin') return res.status(403).json({ error: 'Admin only' });
  const id  = parseInt(req.params.id);
  const reg = db.prepare("SELECT * FROM registration_requests WHERE id=? AND status='pending'").get(id);
  if (!reg) return res.status(404).json({ error: 'Request not found or already reviewed' });

  // Check username still available
  const exists = db.prepare("SELECT id FROM users WHERE username=? AND active=1").get(reg.username);
  if (exists) {
    db.prepare("UPDATE registration_requests SET status='denied', reviewed_at=?, reviewed_by=? WHERE id=?")
      .run(Date.now(), req.session.userId, id);
    return res.status(409).json({ error: 'Username was taken by someone else. Request denied.' });
  }

  // Create technician account
  db.prepare("INSERT INTO users (name, username, password, role, pay_rate, email) VALUES (?,?,?,'tech',0,?)")
    .run(reg.name, reg.username, reg.password, reg.email || null);
  db.prepare("UPDATE registration_requests SET status='approved', reviewed_at=?, reviewed_by=? WHERE id=?")
    .run(Date.now(), req.session.userId, id);

  res.json({ ok: true });
});

// POST deny
router.post('/:id/deny', (req, res) => {
  if (!req.session.userId || req.session.role !== 'admin') return res.status(403).json({ error: 'Admin only' });
  const id = parseInt(req.params.id);
  const reg = db.prepare("SELECT * FROM registration_requests WHERE id=? AND status='pending'").get(id);
  if (!reg) return res.status(404).json({ error: 'Request not found or already reviewed' });
  db.prepare("UPDATE registration_requests SET status='denied', reviewed_at=?, reviewed_by=? WHERE id=?")
    .run(Date.now(), req.session.userId, id);
  res.json({ ok: true });
});

module.exports = router;

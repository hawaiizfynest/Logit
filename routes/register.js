const express    = require('express');
const bcrypt     = require('bcryptjs');
const nodemailer = require('nodemailer');
const db         = require('../db/database');
const router     = express.Router();

// ── Discord webhook notification ──
async function sendDiscordNotification(registration) {
  const webhookUrl = process.env.DISCORD_WEBHOOK_URL;
  if (!webhookUrl) return; // silently skip if not configured

  const payload = {
    username: 'Logit',
    embeds: [{
      title: '🔔 New Registration Request',
      color: 0xf97316,
      fields: [
        { name: 'Name',     value: registration.name,           inline: true },
        { name: 'Username', value: `@${registration.username}`, inline: true },
        { name: 'Email',    value: registration.email || '—',   inline: true },
        { name: 'Time',     value: new Date().toLocaleString(), inline: false },
      ],
      footer: { text: 'Log in to Logit to approve or deny this request.' },
    }],
  };

  try {
    const res = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      console.error(`Discord webhook failed: ${res.status} ${res.statusText}`);
    }
  } catch(e) {
    console.error('Discord webhook error:', e.message);
  }
}

// ── Email notification ──
function sendAdminEmailNotification(registration) {
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
    subject: `Logit — New Registration Request from ${registration.name}`,
    text: `A new technician registration request has been submitted.\n\nName: ${registration.name}\nUsername: ${registration.username}\nEmail: ${registration.email || 'Not provided'}\n\nLog in to Logit to approve or deny this request.`,
  });
}

// ── POST — submit registration (public) ──
router.post('/', (req, res) => {
  const { name, username, email, password, confirmPassword } = req.body;

  if (!name || !username || !password) return res.status(400).json({ error: 'Name, username and password are required' });
  if (password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' });
  if (password !== confirmPassword) return res.status(400).json({ error: 'Passwords do not match' });

  const uname = username.toLowerCase().trim();

  const exists = db.prepare("SELECT id FROM users WHERE username=? AND active=1").get(uname);
  if (exists) return res.status(409).json({ error: 'That username is already taken' });

  const pending = db.prepare("SELECT id FROM registration_requests WHERE username=? AND status='pending'").get(uname);
  if (pending) return res.status(409).json({ error: 'A request with that username is already pending' });

  const hash = bcrypt.hashSync(password, 10);
  const result = db.prepare("INSERT INTO registration_requests (name, username, password, email) VALUES (?,?,?,?)")
    .run(name.trim(), uname, hash, email?.trim() || null);

  const registration = db.prepare("SELECT * FROM registration_requests WHERE id=?").get(result.lastInsertRowid);

  // Fire notifications (don't await — don't block the response)
  sendDiscordNotification(registration).catch(e => console.error('Discord error:', e.message));
  sendAdminEmailNotification(registration).catch(e => console.error('Email error:', e.message));

  res.json({ ok: true });
});

// ── GET — list pending (admin only) ──
router.get('/', (req, res) => {
  if (!req.session.userId || req.session.role !== 'admin') return res.status(403).json({ error: 'Admin only' });
  const requests = db.prepare("SELECT * FROM registration_requests WHERE status='pending' ORDER BY created_at DESC").all();
  res.json(requests);
});

// ── POST approve ──
router.post('/:id/approve', (req, res) => {
  if (!req.session.userId || req.session.role !== 'admin') return res.status(403).json({ error: 'Admin only' });
  const id  = parseInt(req.params.id);
  const reg = db.prepare("SELECT * FROM registration_requests WHERE id=? AND status='pending'").get(id);
  if (!reg) return res.status(404).json({ error: 'Request not found or already reviewed' });

  const exists = db.prepare("SELECT id FROM users WHERE username=? AND active=1").get(reg.username);
  if (exists) {
    db.prepare("UPDATE registration_requests SET status='denied', reviewed_at=?, reviewed_by=? WHERE id=?")
      .run(Date.now(), req.session.userId, id);
    return res.status(409).json({ error: 'Username was taken by someone else. Request denied.' });
  }

  db.prepare("INSERT INTO users (name, username, password, role, pay_rate, email) VALUES (?,?,?,'tech',0,?)")
    .run(reg.name, reg.username, reg.password, reg.email || null);
  db.prepare("UPDATE registration_requests SET status='approved', reviewed_at=?, reviewed_by=? WHERE id=?")
    .run(Date.now(), req.session.userId, id);

  res.json({ ok: true });
});

// ── POST deny ──
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

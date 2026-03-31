const express    = require('express');
const bcrypt     = require('bcryptjs');
const nodemailer = require('nodemailer');
const crypto     = require('crypto');
const db         = require('../db/database');
const router     = express.Router();

function getIP(req) {
  return req.headers['cf-connecting-ip'] ||
         req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
         req.socket.remoteAddress ||
         'unknown';
}

function checkBanned(req, user) {
  const ip = getIP(req);
  const bans = db.prepare("SELECT * FROM bans WHERE (type='ip' AND LOWER(value)=?) OR (type='username' AND LOWER(value)=?) OR (type='email' AND LOWER(value)=?)")
    .all(ip.toLowerCase(), (user?.username || '').toLowerCase(), (user?.email || '').toLowerCase());
  return bans.length > 0 ? bans[0] : null;
}

const SESSION_TIMEOUT = 30 * 60 * 1000;
const MAX_ATTEMPTS    = 5;
const LOCKOUT_TIME    = 15 * 60 * 1000;

function requireAuth(req, res, next) {
  if (!req.session.userId) return res.status(401).json({ error: 'Not authenticated' });
  if (req.session.lastActive && (Date.now() - req.session.lastActive) > SESSION_TIMEOUT) {
    req.session.destroy();
    return res.status(401).json({ error: 'Session expired', expired: true });
  }
  req.session.lastActive = Date.now();
  next();
}

function sendMFAEmail(to, name, code) {
  const transporter = nodemailer.createTransport(
    process.env.SMTP_HOST
      ? {
          host: process.env.SMTP_HOST,
          port: parseInt(process.env.SMTP_PORT) || 587,
          secure: false,
          auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
        }
      : { sendmail: true, path: '/usr/sbin/sendmail' }
  );
  return transporter.sendMail({
    from: process.env.SMTP_FROM || 'noreply@logged.digital',
    to,
    subject: `Logit Login Code: ${code}`,
    text: `Hi ${name},\n\nYour Logit verification code is:\n\n    ${code}\n\nExpires in 10 minutes.\n\n— Logit`,
  });
}

function userToJSON(u) {
  return {
    id: u.id, name: u.name, role: u.role, username: u.username,
    payRate: u.pay_rate, email: u.email || '',
    mfaEnabled: !!u.mfa_enabled, mfaMethod: u.mfa_method || null,
    sessionTimeout: SESSION_TIMEOUT / 1000,
  };
}

// ── LOGIN ──
router.post('/login', (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'Missing credentials' });

  const user = db.prepare("SELECT * FROM users WHERE username=? AND active=1")
                 .get(username.toLowerCase().trim());

  if (user && user.locked_until && user.locked_until > Date.now()) {
    const mins = Math.ceil((user.locked_until - Date.now()) / 60000);
    return res.status(429).json({ error: `Too many failed attempts. Try again in ${mins} minute(s).` });
  }

  if (!user || !bcrypt.compareSync(password, user.password)) {
    if (user) {
      const attempts = user.login_attempts + 1;
      const locked   = attempts >= MAX_ATTEMPTS ? Date.now() + LOCKOUT_TIME : null;
      db.prepare("UPDATE users SET login_attempts=?, locked_until=? WHERE id=?").run(attempts, locked, user.id);
      if (locked) return res.status(429).json({ error: 'Too many failed attempts. Account locked for 15 minutes.' });
    }
    return res.status(401).json({ error: 'Invalid username or password' });
  }

  db.prepare("UPDATE users SET login_attempts=0, locked_until=NULL WHERE id=?").run(user.id);

  // Check bans
  const ban = checkBanned(req, user);
  if (ban) return res.status(403).json({ error: `Your account has been suspended. Reason: ${ban.reason || 'Contact administrator.'}` });

  // Log the IP
  const ip = getIP(req);
  db.prepare("INSERT INTO login_logs (user_id, ip) VALUES (?,?)").run(user.id, ip);

  // Email MFA
  if (user.mfa_enabled && user.mfa_method === 'email') {
    if (!user.email) return res.status(400).json({ error: 'No email on file for MFA' });
    const code     = String(Math.floor(100000 + Math.random() * 900000));
    const expires  = Date.now() + 10 * 60 * 1000;
    const mfaToken = crypto.randomBytes(32).toString('hex');
    db.prepare("DELETE FROM mfa_codes WHERE user_id=?").run(user.id);
    db.prepare("INSERT INTO mfa_codes (user_id, code, expires_at) VALUES (?,?,?)").run(user.id, code, expires);
    db.prepare("DELETE FROM mfa_pending WHERE user_id=?").run(user.id);
    db.prepare("INSERT INTO mfa_pending (user_id, token, expires_at) VALUES (?,?,?)").run(user.id, mfaToken, Date.now() + 5 * 60 * 1000);
    sendMFAEmail(user.email, user.name, code).catch(e => console.error('Email error:', e));
    return res.json({ mfaRequired: true, mfaMethod: 'email', mfaToken });
  }

  req.session.userId     = user.id;
  req.session.role       = user.role;
  req.session.lastActive = Date.now();
  res.json(userToJSON(user));
});

// ── MFA VERIFY ──
router.post('/mfa-verify', (req, res) => {
  const { code, mfaToken } = req.body;
  if (!mfaToken) return res.status(401).json({ error: 'No MFA token. Please log in again.' });

  const pending = db.prepare("SELECT * FROM mfa_pending WHERE token=? AND expires_at>?").get(mfaToken, Date.now());
  if (!pending) return res.status(401).json({ error: 'MFA session expired. Please log in again.' });

  const user = db.prepare("SELECT * FROM users WHERE id=?").get(pending.user_id);
  if (!user) return res.status(404).json({ error: 'User not found' });

  const cleanCode = (code || '').replace(/\s/g, '');
  const row = db.prepare("SELECT * FROM mfa_codes WHERE user_id=? AND used=0 AND expires_at>? ORDER BY created_at DESC LIMIT 1")
                .get(user.id, Date.now());

  if (!row || row.code !== cleanCode) return res.status(401).json({ error: 'Invalid or expired code' });

  db.prepare("UPDATE mfa_codes SET used=1 WHERE id=?").run(row.id);
  db.prepare("DELETE FROM mfa_pending WHERE user_id=?").run(user.id);

  req.session.userId     = user.id;
  req.session.role       = user.role;
  req.session.lastActive = Date.now();
  res.json(userToJSON(user));
});

// ── MFA RESEND ──
router.post('/mfa-resend', (req, res) => {
  const { mfaToken } = req.body;
  const pending = mfaToken ? db.prepare("SELECT * FROM mfa_pending WHERE token=? AND expires_at>?").get(mfaToken, Date.now()) : null;
  if (!pending) return res.status(401).json({ error: 'MFA session expired. Please log in again.' });

  const user = db.prepare("SELECT * FROM users WHERE id=?").get(pending.user_id);
  if (!user || !user.email) return res.status(400).json({ error: 'Cannot resend' });

  const code    = String(Math.floor(100000 + Math.random() * 900000));
  const expires = Date.now() + 10 * 60 * 1000;
  db.prepare("DELETE FROM mfa_codes WHERE user_id=?").run(user.id);
  db.prepare("INSERT INTO mfa_codes (user_id, code, expires_at) VALUES (?,?,?)").run(user.id, code, expires);
  sendMFAEmail(user.email, user.name, code).catch(e => console.error('Email error:', e));
  res.json({ ok: true });
});

// ── LOGOUT ──
router.post('/logout', (req, res) => {
  req.session.destroy();
  res.json({ ok: true });
});

// ── ME ──
router.get('/me', requireAuth, (req, res) => {
  const user = db.prepare("SELECT * FROM users WHERE id=?").get(req.session.userId);
  if (!user) return res.status(404).json({ error: 'Not found' });
  res.json(userToJSON(user));
});

// ── UPDATE PROFILE ──
router.put('/profile', requireAuth, (req, res) => {
  const { name, username, email, currentPassword, newPassword } = req.body;
  if (!name || !username) return res.status(400).json({ error: 'Name and username are required' });

  const user = db.prepare("SELECT * FROM users WHERE id=?").get(req.session.userId);
  if (!user) return res.status(404).json({ error: 'Not found' });
  if (!currentPassword) return res.status(400).json({ error: 'Current password is required' });
  if (!bcrypt.compareSync(currentPassword, user.password)) return res.status(401).json({ error: 'Current password is incorrect' });

  const dup = db.prepare("SELECT id FROM users WHERE username=? AND id!=?").get(username.toLowerCase().trim(), user.id);
  if (dup) return res.status(409).json({ error: 'Username already taken' });

  if (newPassword) {
    if (newPassword.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' });
    const hash = bcrypt.hashSync(newPassword, 10);
    db.prepare("UPDATE users SET name=?, username=?, password=?, email=? WHERE id=?")
      .run(name.trim(), username.toLowerCase().trim(), hash, email || null, user.id);
  } else {
    db.prepare("UPDATE users SET name=?, username=?, email=? WHERE id=?")
      .run(name.trim(), username.toLowerCase().trim(), email || null, user.id);
  }

  const updated = db.prepare("SELECT * FROM users WHERE id=?").get(user.id);
  res.json(userToJSON(updated));
});

// ── EMAIL MFA ENABLE ──
router.post('/mfa-email-enable', requireAuth, (req, res) => {
  const user = db.prepare("SELECT * FROM users WHERE id=?").get(req.session.userId);
  if (!user.email) return res.status(400).json({ error: 'Add an email address to your profile first' });
  const code    = String(Math.floor(100000 + Math.random() * 900000));
  const expires = Date.now() + 10 * 60 * 1000;
  db.prepare("DELETE FROM mfa_codes WHERE user_id=?").run(user.id);
  db.prepare("INSERT INTO mfa_codes (user_id, code, expires_at) VALUES (?,?,?)").run(user.id, code, expires);
  sendMFAEmail(user.email, user.name, code).catch(e => console.error('Email error:', e));
  res.json({ ok: true, email: user.email });
});

// ── EMAIL MFA CONFIRM ──
router.post('/mfa-email-confirm', requireAuth, (req, res) => {
  const code = (req.body.code || '').replace(/\s/g, '');
  const row  = db.prepare("SELECT * FROM mfa_codes WHERE user_id=? AND used=0 AND expires_at>? ORDER BY created_at DESC LIMIT 1")
                 .get(req.session.userId, Date.now());
  if (!row || row.code !== code) return res.status(400).json({ error: 'Invalid or expired code' });
  db.prepare("UPDATE mfa_codes SET used=1 WHERE id=?").run(row.id);
  db.prepare("UPDATE users SET mfa_enabled=1, mfa_method='email' WHERE id=?").run(req.session.userId);
  res.json({ ok: true });
});

// ── DISABLE MFA ──
router.post('/mfa-disable', requireAuth, (req, res) => {
  const user = db.prepare("SELECT * FROM users WHERE id=?").get(req.session.userId);
  if (!bcrypt.compareSync(req.body.password || '', user.password)) return res.status(401).json({ error: 'Incorrect password' });
  db.prepare("UPDATE users SET mfa_enabled=0, mfa_method=NULL WHERE id=?").run(req.session.userId);
  res.json({ ok: true });
});

module.exports = router;
module.exports.requireAuth = requireAuth;
module.exports.SESSION_TIMEOUT = SESSION_TIMEOUT;

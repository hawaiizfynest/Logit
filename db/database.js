const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');
const path = require('path');
const fs = require('fs');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, '..', 'data', 'logit.db');

// Ensure directory exists
const dbDir = path.dirname(DB_PATH);
if (!fs.existsSync(dbDir)) fs.mkdirSync(dbDir, { recursive: true });

const db = new Database(DB_PATH);

function init() {
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  // Core tables
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      name           TEXT NOT NULL,
      username       TEXT NOT NULL UNIQUE,
      password       TEXT NOT NULL,
      role           TEXT NOT NULL DEFAULT 'tech',
      pay_rate       REAL NOT NULL DEFAULT 0,
      active         INTEGER NOT NULL DEFAULT 1,
      email          TEXT,
      mfa_enabled    INTEGER NOT NULL DEFAULT 0,
      mfa_method     TEXT,
      totp_secret    TEXT,
      totp_verified  INTEGER NOT NULL DEFAULT 0,
      login_attempts INTEGER NOT NULL DEFAULT 0,
      locked_until   INTEGER,
      last_active    INTEGER,
      created_at     INTEGER NOT NULL DEFAULT (strftime('%s','now') * 1000)
    );

    CREATE TABLE IF NOT EXISTS mfa_codes (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id    INTEGER NOT NULL REFERENCES users(id),
      code       TEXT NOT NULL,
      expires_at INTEGER NOT NULL,
      used       INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL DEFAULT (strftime('%s','now') * 1000)
    );

    CREATE TABLE IF NOT EXISTS time_entries (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      tech_id    INTEGER NOT NULL REFERENCES users(id),
      clock_in   INTEGER NOT NULL,
      clock_out  INTEGER,
      notes      TEXT,
      created_at INTEGER NOT NULL DEFAULT (strftime('%s','now') * 1000)
    );

    CREATE TABLE IF NOT EXISTS work_orders (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      title       TEXT NOT NULL,
      customer    TEXT NOT NULL,
      address     TEXT,
      description TEXT,
      assigned_to INTEGER REFERENCES users(id),
      status      TEXT NOT NULL DEFAULT 'open',
      notes       TEXT,
      created_at  INTEGER NOT NULL DEFAULT (strftime('%s','now') * 1000),
      closed_at   INTEGER
    );

    CREATE TABLE IF NOT EXISTS expenses (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      tech_id      INTEGER REFERENCES users(id),
      wo_id        INTEGER REFERENCES work_orders(id),
      category     TEXT NOT NULL,
      description  TEXT NOT NULL,
      amount       REAL NOT NULL,
      expense_date INTEGER NOT NULL,
      created_at   INTEGER NOT NULL DEFAULT (strftime('%s','now') * 1000)
    );
  `);

  // Migrate existing users table — add new columns if they don't exist
  const cols = db.prepare("PRAGMA table_info(users)").all().map(c => c.name);
  const migrations = [
    ['email',          'ALTER TABLE users ADD COLUMN email TEXT'],
    ['mfa_enabled',    'ALTER TABLE users ADD COLUMN mfa_enabled INTEGER NOT NULL DEFAULT 0'],
    ['mfa_method',     'ALTER TABLE users ADD COLUMN mfa_method TEXT'],
    ['totp_secret',    'ALTER TABLE users ADD COLUMN totp_secret TEXT'],
    ['totp_verified',  'ALTER TABLE users ADD COLUMN totp_verified INTEGER NOT NULL DEFAULT 0'],
    ['login_attempts', 'ALTER TABLE users ADD COLUMN login_attempts INTEGER NOT NULL DEFAULT 0'],
    ['locked_until',   'ALTER TABLE users ADD COLUMN locked_until INTEGER'],
    ['last_active',    'ALTER TABLE users ADD COLUMN last_active INTEGER'],
  ];
  for (const [col, sql] of migrations) {
    if (!cols.includes(col)) {
      db.exec(sql);
      console.log(`✅ Migrated: added column ${col}`);
    }
  }

  // Seed default admin
  const admin = db.prepare("SELECT id FROM users WHERE role='admin' LIMIT 1").get();
  if (!admin) {
    const hash = bcrypt.hashSync('admin123', 10);
    db.prepare("INSERT INTO users (name, username, password, role, pay_rate) VALUES (?,?,?,?,?)")
      .run('Administrator', 'admin', hash, 'admin', 0);
    console.log('✅ Default admin created: admin / admin123');
  }
}

init();
module.exports = db;

// Add mfa_pending table if it doesn't exist
db.exec(`
  CREATE TABLE IF NOT EXISTS mfa_pending (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id    INTEGER NOT NULL REFERENCES users(id),
    token      TEXT NOT NULL UNIQUE,
    expires_at INTEGER NOT NULL,
    created_at INTEGER NOT NULL DEFAULT (strftime('%s','now') * 1000)
  );
`);

// Registration requests table
db.exec(`
  CREATE TABLE IF NOT EXISTS registration_requests (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    name       TEXT NOT NULL,
    username   TEXT NOT NULL,
    password   TEXT NOT NULL,
    email      TEXT,
    status     TEXT NOT NULL DEFAULT 'pending',
    created_at INTEGER NOT NULL DEFAULT (strftime('%s','now') * 1000),
    reviewed_at INTEGER,
    reviewed_by INTEGER
  );
`);

// Login logs — track IP per login
db.exec(`
  CREATE TABLE IF NOT EXISTS login_logs (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id    INTEGER NOT NULL REFERENCES users(id),
    ip         TEXT NOT NULL,
    created_at INTEGER NOT NULL DEFAULT (strftime('%s','now') * 1000)
  );
`);

// Bans — by IP, email, or username
db.exec(`
  CREATE TABLE IF NOT EXISTS bans (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    type       TEXT NOT NULL,
    value      TEXT NOT NULL,
    reason     TEXT,
    banned_by  INTEGER REFERENCES users(id),
    created_at INTEGER NOT NULL DEFAULT (strftime('%s','now') * 1000)
  );
`);

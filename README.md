# Logit — Technician Time Management System

A self-hosted web application for managing field technician time tracking, work orders, expenses, and payroll reporting.

![Node.js](https://img.shields.io/badge/Node.js-20-green) ![Express](https://img.shields.io/badge/Express-4-blue) ![SQLite](https://img.shields.io/badge/SQLite-3-lightgrey) ![Docker](https://img.shields.io/badge/Docker-ready-blue)

---

## Features

**For Technicians**
- Clock in/out with shift notes
- View assigned work orders, update status and notes
- Personal time history with earnings summary
- Request access (admin approval required)

**For Admins**
- Dashboard — active technicians, work order overview, pending registrations
- Full technician management (add, edit, remove, promote to admin)
- Admin account management
- Work order management — create, assign, track, close
- Expense tracking
- Time log — view, edit, add, or delete any entry
- PDF pay stubs per technician (period + YTD)
- Pay summary and expense PDF + CSV reports
- Registration approvals
- Ban management — ban by IP, email, or username
- Login IP tracking per user

**Security**
- Rate limiting — 5 failed logins locks account for 15 minutes
- Session timeout — auto logout after 30 minutes of inactivity
- Email MFA (optional per user)
- Secure session cookies

---

## Tech Stack

- **Backend:** Node.js, Express
- **Database:** SQLite (via better-sqlite3)
- **Auth:** bcryptjs, express-session
- **Email:** Nodemailer
- **PDFs:** PDFKit
- **Frontend:** Vanilla HTML/CSS/JS (no build step)

---

## Deployment

### Docker (recommended)

1. Clone the repo
2. Copy the example compose file:
```bash
cp docker-compose.yml docker-compose.override.yml
```
3. Edit `docker-compose.override.yml` and fill in your environment variables:
```yaml
environment:
  - SESSION_SECRET=your-long-random-secret-here
  - DB_PATH=/app/data/logit.db
  - PORT=3000
  - SMTP_HOST=smtp.gmail.com
  - SMTP_PORT=587
  - SMTP_USER=you@gmail.com
  - SMTP_PASS=your-gmail-app-password
  - SMTP_FROM=you@gmail.com
```
4. Start:
```bash
docker compose up -d
```

### Manual (Node.js)

```bash
npm install
SESSION_SECRET=your-secret node server.js
```

### Default Login
- **Username:** `admin`
- **Password:** `admin123`

> ⚠️ Change the default password immediately after first login.

---

## Environment Variables

| Variable | Description | Required |
|---|---|---|
| `SESSION_SECRET` | Secret key for session signing | Yes |
| `DB_PATH` | Path to SQLite database file | No (default: `./data/logit.db`) |
| `PORT` | Server port | No (default: `3000`) |
| `SMTP_HOST` | SMTP server hostname | For email MFA |
| `SMTP_PORT` | SMTP port | For email MFA |
| `SMTP_USER` | SMTP username | For email MFA |
| `SMTP_PASS` | SMTP password / app password | For email MFA |
| `SMTP_FROM` | From address for emails | For email MFA |

---

## Project Structure

```
logit-server/
├── server.js           # Express app entry point
├── db/
│   └── database.js     # SQLite setup + auto-migration
├── routes/
│   ├── auth.js         # Login, MFA, session, profile
│   ├── admins.js       # Admin account management
│   ├── technicians.js  # Technician management
│   ├── timeEntries.js  # Clock in/out, time log
│   ├── workOrders.js   # Work order CRUD
│   ├── expenses.js     # Expense tracking
│   ├── reports.js      # PDF/CSV report generation
│   ├── register.js     # Registration requests
│   └── bans.js         # Ban management + IP logging
└── public/
    ├── index.html      # App shell + login
    ├── register.html   # Registration page
    ├── css/style.css   # Dark industrial theme
    └── js/
        ├── api.js      # Fetch wrapper
        ├── utils.js    # Shared helpers
        ├── app.js      # App controller, auth, profile, MFA
        ├── admin.js    # All admin panels
        └── tech.js     # Technician panels
```

---

## Companion App

A React Native / Expo mobile app is available in the [logit-app](https://github.com/hawaiizfynest/logit-ios-app) repository.

---

## License

MIT

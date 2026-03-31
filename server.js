const express = require('express');
const session = require('express-session');
const path    = require('path');

const app  = express();
const PORT = process.env.PORT || 3000;

app.set('trust proxy', 1);

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use(session({
  secret: process.env.SESSION_SECRET || 'logit-secret-change-in-prod',
  resave: false,
  saveUninitialized: false,
  cookie: {
    maxAge: 1000 * 60 * 60 * 12,
    httpOnly: true,
    sameSite: 'none',
    secure: true,
  }
}));

// Routes
app.use('/api/auth',        require('./routes/auth'));
app.use('/api/admins',      require('./routes/admins'));
app.use('/api/technicians', require('./routes/technicians'));
app.use('/api/register',    require('./routes/register'));
app.use('/api/bans',         require('./routes/bans'));
app.use('/api/time',        require('./routes/timeEntries'));
app.use('/api/workorders',  require('./routes/workOrders'));
app.use('/api/expenses',    require('./routes/expenses'));
app.use('/api/reports',     require('./routes/reports'));

// SPA fallback
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`\n🚀 Logit running at http://localhost:${PORT}`);
  console.log(`   Default login: admin / admin123\n`);
});

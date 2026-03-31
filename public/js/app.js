// ═══════════════════════════════════════
// SESSION TIMEOUT
// ═══════════════════════════════════════
let _sessionTimeout = 30 * 60 * 1000; // 30 min default
let _sessionTimer   = null;
let _warnTimer      = null;
let _lastActivity   = Date.now();

function resetActivityTimer() {
  _lastActivity = Date.now();
}

function startSessionTimers() {
  clearTimeout(_sessionTimer);
  clearTimeout(_warnTimer);

  // Warn at 25 minutes
  _warnTimer = setTimeout(() => {
    if (!document.getElementById('session-warning')) {
      const div = document.createElement('div');
      div.id = 'session-warning';
      div.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:9999;background:#f59e0b;color:#000;text-align:center;padding:12px 20px;font-weight:700;font-size:0.95rem;display:flex;align-items:center;justify-content:center;gap:16px';
      div.innerHTML = '⚠ Your session will expire in 5 minutes due to inactivity. <button onclick="keepAlive()" style="background:#000;color:#fff;border:none;padding:6px 16px;border-radius:4px;cursor:pointer;font-weight:bold">Stay Logged In</button>';
      document.body.appendChild(div);
    }
  }, _sessionTimeout - (5 * 60 * 1000));

  // Auto logout at 30 minutes
  _sessionTimer = setTimeout(() => {
    doLogout(true);
  }, _sessionTimeout);
}

async function keepAlive() {
  try {
    await API.get('/auth/me');
    const w = document.getElementById('session-warning');
    if (w) w.remove();
    startSessionTimers();
    toast('Session extended', 'ok');
  } catch(e) {}
}

// Track user activity
['click','keydown','mousemove','touchstart'].forEach(ev => {
  document.addEventListener(ev, () => {
    resetActivityTimer();
  }, { passive: true });
});

// ═══════════════════════════════════════
// APP CONTROLLER
// ═══════════════════════════════════════
const App = {
  user: null,
  currentPanel: null,

  adminTabs: [
    { id: 'dashboard',   label: 'Dashboard',    render: renderAdminDashboard },
    { id: 'technicians', label: 'Technicians',  render: renderAdminTechnicians },
    { id: 'workorders',  label: 'Work Orders',  render: renderAdminWorkOrders },
    { id: 'timelog',     label: 'Time Log',     render: renderAdminTimeLog },
    { id: 'expenses',    label: 'Expenses',     render: renderAdminExpenses },
    { id: 'reports',     label: 'Reports',      render: renderAdminReports },
    { id: 'admins',     label: 'Admins',       render: renderAdminManagement },
    { id: 'bans',        label: '🚫 Bans',       render: renderBanManagement },
    { id: 'profile',     label: '⚙ My Profile', render: renderProfile },
  ],
  techTabs: [
    { id: 'clock',        label: '⏱ Clock In/Out', render: renderTechClock },
    { id: 'myworkorders', label: 'My Work Orders',  render: renderTechWorkOrders },
    { id: 'history',      label: 'My History',      render: renderTechHistory },
    { id: 'profile',      label: '⚙ My Profile',   render: renderProfile },
  ],

  async init() {
    try {
      const user = await API.get('/auth/me');
      if (user.sessionTimeout) _sessionTimeout = user.sessionTimeout * 1000;
      this.launch(user);
    } catch(e) { show('login-screen'); }
  },

  launch(user) {
    this.user = user;
    hide('login-screen');
    hide('mfa-screen');
    show('app');
    el('user-chip-name').textContent = user.name;
    el('user-chip-role').textContent = user.role;
    const tabs = user.role === 'admin' ? this.adminTabs : this.techTabs;
    this.buildTabBar(tabs);
    this.loadPanel(tabs[0].id);
    startSessionTimers();
  },

  buildTabBar(tabs) {
    el('tab-bar').innerHTML = tabs.map(t =>
      `<button class="tab-btn" data-panel="${t.id}" onclick="App.loadPanel('${t.id}')">${t.label}</button>`
    ).join('');
  },

  async loadPanel(panelId) {
    if (_clockInterval) clearInterval(_clockInterval);
    this.currentPanel = panelId;
    const tabs = this.user?.role === 'admin' ? this.adminTabs : this.techTabs;
    const tab  = tabs.find(t => t.id === panelId);
    if (!tab) return;
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.toggle('active', b.dataset.panel === panelId));
    el('main-content').innerHTML = `<div style="display:flex;justify-content:center;padding:80px"><div class="spinner"></div></div>`;
    try {
      const html = await tab.render();
      el('main-content').innerHTML = `<div class="panel active">${html}</div>`;
      if (panelId === 'clock') startClockTick();
    } catch(e) {
      if (e.message && e.message.includes('expired')) { doLogout(true); return; }
      el('main-content').innerHTML = `<div class="panel active"><div class="empty-state" style="color:var(--red)">Error: ${e.message}</div></div>`;
    }
  }
};

// ═══════════════════════════════════════
// LOGIN
// ═══════════════════════════════════════
async function doLogin() {
  const username = el('login-user').value.trim();
  const password = el('login-pass').value;
  const btn = el('login-btn');
  hide('login-error');
  btn.disabled = true; btn.textContent = 'Signing in…';
  try {
    const res = await API.post('/auth/login', { username, password });
    if (res.mfaRequired) {
      window._mfaToken = res.mfaToken;
      showMFAScreen(res.mfaMethod);
    } else {
      if (res.sessionTimeout) _sessionTimeout = res.sessionTimeout * 1000;
      App.launch(res);
      el('login-user').value = ''; el('login-pass').value = '';
    }
  } catch(e) {
    const errEl = el('login-error');
    errEl.querySelector ? errEl.innerHTML = `<span>⚠</span> ${e.message}` : null;
    show('login-error');
    el('login-error').innerHTML = `<span>⚠</span> ${e.message}`;
  } finally {
    btn.disabled = false;
    btn.innerHTML = 'Sign In <span class="btn-arrow">→</span>';
  }
}

// ═══════════════════════════════════════
// MFA
// ═══════════════════════════════════════
function showMFAScreen(method) {
  hide('login-screen');
  show('mfa-screen');
  el('mfa-method-label').textContent = method === 'totp'
    ? 'Enter the 6-digit code from your authenticator app'
    : 'Enter the 6-digit code sent to your email address';
  el('mfa-resend-btn').style.display = method === 'email' ? 'inline-flex' : 'none';
  el('mfa-code').value = '';
  hide('mfa-error');
  setTimeout(() => el('mfa-code').focus(), 100);
}

async function doMFAVerify() {
  const code = el('mfa-code').value.trim();
  const btn  = el('mfa-btn');
  hide('mfa-error');
  btn.disabled = true; btn.textContent = 'Verifying…';
  try {
    const user = await API.post('/auth/mfa-verify', { code, mfaToken: window._mfaToken });
    if (user.sessionTimeout) _sessionTimeout = user.sessionTimeout * 1000;
    App.launch(user);
  } catch(e) {
    el('mfa-error').textContent = e.message;
    show('mfa-error');
  } finally {
    btn.disabled = false; btn.textContent = 'Verify';
  }
}

async function doMFAResend() {
  try {
    await API.post('/auth/mfa-resend', { mfaToken: window._mfaToken });
    toast('New code sent to your email', 'ok');
  } catch(e) { toast(e.message, 'err'); }
}

function cancelMFA() {
  window._mfaToken = null;
  hide('mfa-screen');
  show('login-screen');
  el('login-pass').value = '';
}

// ═══════════════════════════════════════
// LOGOUT
// ═══════════════════════════════════════
async function doLogout(expired = false) {
  try { await API.post('/auth/logout'); } catch(e) {}
  App.user = null;
  clearTimeout(_sessionTimer);
  clearTimeout(_warnTimer);
  if (_clockInterval) clearInterval(_clockInterval);
  el('tab-bar').innerHTML = ''; el('main-content').innerHTML = '';
  const w = document.getElementById('session-warning');
  if (w) w.remove();
  hide('app'); show('login-screen');
  if (expired) toast('Your session expired. Please log in again.', 'err');
}

// ═══════════════════════════════════════
// PROFILE
// ═══════════════════════════════════════
async function renderProfile() {
  const user = await API.get('/auth/me');
  App.user = user;

  const mfaBadge = user.mfaEnabled
    ? `<span class="badge badge-green" style="margin-left:8px">MFA ON — Email</span>`
    : `<span class="badge badge-red" style="margin-left:8px">MFA OFF</span>`;

  return `
  <div class="section-title mb-5">My Profile</div>
  <div style="max-width:560px;display:flex;flex-direction:column;gap:20px">

    <div class="card">
      <div class="card-title">Account Details</div>
      <div class="profile-meta mb-4">
        <div class="profile-avatar">${user.name.charAt(0).toUpperCase()}</div>
        <div>
          <div style="font-size:1.1rem;font-weight:700">${user.name}</div>
          <div class="text-muted">@${user.username}</div>
          <div style="margin-top:6px">
            <span class="badge ${user.role==='admin'?'badge-orange':'badge-blue'}">${user.role}</span>
            ${user.role==='tech'?`<span class="badge badge-green" style="margin-left:6px">$${parseFloat(user.payRate).toFixed(2)}/hr</span>`:''}
            ${mfaBadge}
          </div>
        </div>
      </div>
      <div class="form-group"><label>Full Name</label><input type="text" id="p-name" value="${user.name}"></div>
      <div class="form-group"><label>Username</label><input type="text" id="p-username" value="${user.username}"></div>
      <div class="form-group"><label>Email Address <span class="text-muted">(required for email MFA)</span></label>
        <input type="email" id="p-email" value="${user.email||''}" placeholder="you@example.com">
      </div>
      <hr class="divider">
      <div style="font-family:var(--font-d);font-size:0.85rem;letter-spacing:1px;text-transform:uppercase;color:var(--text-muted);margin-bottom:16px">Change Password</div>
      <div class="form-group"><label>Current Password <span style="color:var(--red)">*</span></label>
        <input type="password" id="p-current-pass" placeholder="Required to save any changes">
      </div>
      <div class="form-group"><label>New Password <span class="text-muted">(leave blank to keep current)</span></label>
        <input type="password" id="p-new-pass" placeholder="Min. 6 characters">
      </div>
      <div class="form-group"><label>Confirm New Password</label>
        <input type="password" id="p-confirm-pass" placeholder="Re-enter new password">
      </div>
      <div id="profile-msg" class="hidden" style="padding:10px 14px;border-radius:6px;margin-bottom:14px;font-size:0.88rem;font-weight:600"></div>
      <button class="btn btn-primary" onclick="saveProfile()">Save Changes</button>
    </div>

    <div class="card">
      <div class="card-title">Two-Factor Authentication</div>
      ${user.mfaEnabled ? `
        <div style="background:rgba(34,197,94,0.08);border:1px solid rgba(34,197,94,0.25);border-radius:8px;padding:14px 16px;margin-bottom:18px;font-size:0.9rem">
          ✅ MFA is active. A 6-digit code will be sent to <b>${user.email}</b> each time you log in.
        </div>
        <div class="form-group"><label>Current Password (to disable MFA)</label>
          <input type="password" id="mfa-disable-pass" placeholder="Enter your password">
        </div>
        <button class="btn btn-danger" onclick="disableMFA()">Disable MFA</button>
      ` : `
        <div style="color:var(--text-dim);font-size:0.9rem;margin-bottom:20px;line-height:1.6">
          When enabled, you'll receive a 6-digit code by email each time you log in.
          ${!user.email ? '<br><b style="color:var(--accent)">Add an email address above first.</b>' : ''}
        </div>
        <button class="btn btn-primary" onclick="setupEmailMFA()" ${!user.email?'disabled':''}>
          ✉️ Enable Email MFA
        </button>
      `}
      <div id="mfa-msg" class="hidden mt-3" style="padding:10px 14px;border-radius:6px;font-size:0.88rem;font-weight:600"></div>

      <div id="email-mfa-setup-flow" class="hidden mt-4">
        <hr class="divider">
        <div style="font-family:var(--font-d);font-size:1rem;font-weight:800;margin-bottom:14px;text-transform:uppercase;letter-spacing:1px">Verify Your Email</div>
        <div style="color:var(--text-dim);font-size:0.88rem;margin-bottom:14px">
          A 6-digit code has been sent to <b id="mfa-email-display"></b>. Enter it below to confirm.
        </div>
        <div class="form-group"><label>6-digit code</label>
          <input type="text" id="email-mfa-code" maxlength="6" placeholder="000000" style="letter-spacing:4px;font-size:1.2rem;text-align:center">
        </div>
        <div class="actions-row">
          <button class="btn btn-primary" onclick="confirmEmailMFA()">Confirm & Enable</button>
          <button class="btn btn-ghost" onclick="cancelEmailMFASetup()">Cancel</button>
        </div>
      </div>
    </div>
  </div>

  <style>
    .profile-meta{display:flex;align-items:center;gap:16px}
    .profile-avatar{width:56px;height:56px;border-radius:50%;background:var(--accent);color:#fff;display:flex;align-items:center;justify-content:center;font-family:var(--font-d);font-size:1.8rem;font-weight:900;flex-shrink:0}
  </style>`;
}

function showProfileMsg(msg, isErr, elId = 'profile-msg') {
  const m = el(elId);
  m.textContent = msg;
  m.style.background = isErr ? 'rgba(239,68,68,0.1)' : 'rgba(34,197,94,0.1)';
  m.style.border = isErr ? '1px solid rgba(239,68,68,0.3)' : '1px solid rgba(34,197,94,0.3)';
  m.style.color = isErr ? 'var(--red)' : 'var(--green)';
  m.classList.remove('hidden');
}

async function saveProfile() {
  const name = el('p-name').value.trim(), username = el('p-username').value.trim();
  const email = el('p-email').value.trim();
  const currentPassword = el('p-current-pass').value;
  const newPassword = el('p-new-pass').value, confirmPassword = el('p-confirm-pass').value;
  if (!name || !username) return showProfileMsg('Name and username are required.', true);
  if (!currentPassword) return showProfileMsg('Enter your current password to save changes.', true);
  if (newPassword && newPassword.length < 6) return showProfileMsg('New password must be at least 6 characters.', true);
  if (newPassword && newPassword !== confirmPassword) return showProfileMsg('New passwords do not match.', true);
  try {
    const updated = await API.put('/auth/profile', { name, username, email, currentPassword, newPassword: newPassword || undefined });
    App.user = updated;
    el('user-chip-name').textContent = updated.name;
    el('p-current-pass').value = ''; el('p-new-pass').value = ''; el('p-confirm-pass').value = '';
    showProfileMsg('✓ Profile updated successfully.', false);
  } catch(e) { showProfileMsg(e.message, true); }
}

async function setupEmailMFA() {
  try {
    const res = await API.post('/auth/mfa-email-enable');
    el('mfa-email-display').textContent = res.email;
    el('email-mfa-code').value = '';
    show('email-mfa-setup-flow');
    hide('mfa-msg');
  } catch(e) { showProfileMsg(e.message, true, 'mfa-msg'); }
}
async function confirmEmailMFA() {
  const code = el('email-mfa-code').value.trim();
  if (!code) return;
  try {
    await API.post('/auth/mfa-email-confirm', { code });
    showProfileMsg('✓ Email MFA enabled!', false, 'mfa-msg');
    hide('email-mfa-setup-flow');
    setTimeout(() => App.loadPanel('profile'), 1500);
  } catch(e) { showProfileMsg(e.message, true, 'mfa-msg'); }
}
function cancelEmailMFASetup() { hide('email-mfa-setup-flow'); }

async function disableMFA() {
  const password = el('mfa-disable-pass').value;
  if (!password) return showProfileMsg('Enter your password to disable MFA.', true, 'mfa-msg');
  try {
    await API.post('/auth/mfa-disable', { password });
    showProfileMsg('✓ MFA disabled.', false, 'mfa-msg');
    setTimeout(() => App.loadPanel('profile'), 1500);
  } catch(e) { showProfileMsg(e.message, true, 'mfa-msg'); }
}

// ── Keyboard shortcuts ──
document.addEventListener('keydown', e => {
  if (e.key === 'Enter') {
    if (!el('login-screen').classList.contains('hidden')) doLogin();
    if (!el('mfa-screen').classList.contains('hidden'))  doMFAVerify();
  }
});

App.init();

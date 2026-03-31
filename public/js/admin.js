// ═══════════════════════════════════════
// ADMIN — DASHBOARD
// ═══════════════════════════════════════
async function renderAdminDashboard() {
  const [active, techs, wos] = await Promise.all([
    API.get('/time/active'),
    API.get('/technicians'),
    API.get('/workorders'),
  ]);
  const openWOs = wos.filter(w => w.status !== 'closed');
  const entries = await API.get('/time');
  const totalPay = entries.reduce((s, e) => s + parseFloat(calcPay(e.clock_in, e.clock_out, e.pay_rate)), 0);
  const expenses = await API.get('/expenses');
  const totalExp = expenses.reduce((s, e) => s + parseFloat(e.amount || 0), 0);

  return `
  <div class="section-hdr">
    <div class="section-title">Dashboard</div>
    <div class="text-muted">${new Date().toLocaleDateString('en-US',{weekday:'long',year:'numeric',month:'long',day:'numeric'})}</div>
  </div>
  <div class="stats-grid">
    <div class="stat-tile orange"><div class="stat-label">Technicians</div><div class="stat-value orange">${techs.length}</div></div>
    <div class="stat-tile green"><div class="stat-label">Clocked In Now</div><div class="stat-value green">${active.length}</div></div>
    <div class="stat-tile yellow"><div class="stat-label">Open Work Orders</div><div class="stat-value yellow">${openWOs.length}</div></div>
    <div class="stat-tile blue"><div class="stat-label">Total Labor Cost</div><div class="stat-value blue">$${totalPay.toFixed(2)}</div><div class="stat-sub">All time</div></div>
  </div>
  <div class="grid-2">
    <div class="card">
      <div class="card-title">Currently Clocked In</div>
      ${active.length ? `<table><tbody>${active.map(a => `
        <tr>
          <td><b>${a.tech_name}</b></td>
          <td><span class="badge badge-green">Active</span></td>
          <td class="text-dim">${liveElapsed(a.clock_in)} elapsed</td>
        </tr>`).join('')}</tbody></table>`
      : '<div class="empty-state"><div class="empty-icon">👷</div>No technicians currently clocked in</div>'}
    </div>
    <div class="card">
      <div class="card-title">Open Work Orders</div>
      ${openWOs.length ? `<table><tbody>${openWOs.slice(0,8).map(w => `
        <tr>
          <td><b>#${w.id}</b> ${w.title}</td>
          <td>${w.tech_name || '<span class="text-muted">Unassigned</span>'}</td>
          <td>${woBadge(w.status)}</td>
        </tr>`).join('')}</tbody></table>`
      : '<div class="empty-state"><div class="empty-icon">✅</div>No open work orders</div>'}
    </div>
  </div>`;
}

// ═══════════════════════════════════════
// ADMIN — TECHNICIANS
// ═══════════════════════════════════════
async function renderAdminTechnicians() {
  const [techs, active] = await Promise.all([API.get('/technicians'), API.get('/time/active')]);
  const activeIds = new Set(active.map(a => a.tech_id));

  // Load pending registrations too
  const pending = await API.get('/register');

  return `
  <div class="section-hdr">
    <div class="section-title">Technicians</div>
    <button class="btn btn-primary" onclick="modalAddTech()">+ Add Technician</button>
  </div>

  ${pending.length ? `
  <div class="card mb-4" style="border-color:rgba(249,115,22,0.4)">
    <div class="card-title" style="color:var(--accent)">
      Pending Registration Requests
      <span class="badge badge-orange" style="margin-left:8px">${pending.length}</span>
    </div>
    <div class="tbl-wrap"><table>
      <thead><tr><th>Name</th><th>Username</th><th>Email</th><th>Requested</th><th>Actions</th></tr></thead>
      <tbody>${pending.map(r => `
        <tr>
          <td><b>${r.name}</b></td>
          <td><span class="mono">${r.username}</span></td>
          <td>${r.email || '<span class="text-muted">—</span>'}</td>
          <td class="text-muted">${new Date(r.created_at).toLocaleDateString()}</td>
          <td><div class="td-actions">
            <button class="btn btn-success btn-sm" onclick="approveReg(${r.id})">✓ Approve</button>
            <button class="btn btn-danger btn-sm" onclick="denyReg(${r.id}, '${r.name}')">✗ Deny</button>
          </div></td>
        </tr>`).join('')}
      </tbody>
    </table></div>
  </div>
  ` : ''}

  <div class="card">
    <div class="tbl-wrap"><table>
      <thead><tr><th>Name</th><th>Username</th><th>Pay Rate</th><th>Status</th><th>Actions</th></tr></thead>
      <tbody>${techs.length ? techs.map(t => `
        <tr>
          <td><b>${t.name}</b></td>
          <td><span class="mono">${t.username}</span></td>
          <td><span class="pay-chip">$${parseFloat(t.pay_rate).toFixed(2)}/hr</span></td>
          <td>${clockBadge(activeIds.has(t.id))}</td>
          <td><div class="td-actions">
            <button class="btn btn-secondary btn-sm" onclick="modalEditTech(${t.id})">Edit</button>
            <button class="btn btn-secondary btn-sm" onclick="promoteUser(${t.id}, '${t.name}', 'admin')">→ Admin</button>
            <button class="btn btn-danger btn-sm" onclick="hardDeleteUser(${t.id}, '${t.name}')">Delete</button>
          </div></td>
        </tr>`).join('')
      : `<tr><td colspan="5"><div class="empty-state">No technicians yet. Add one to get started.</div></td></tr>`}
      </tbody>
    </table></div>
  </div>`;
}

function modalAddTech() {
  openModal(`
    <div class="modal-title">Add Technician</div>
    <div class="form-group"><label>Full Name</label><input type="text" id="m-tech-name" placeholder="John Smith"></div>
    <div class="form-row">
      <div class="form-group"><label>Username</label><input type="text" id="m-tech-user" placeholder="jsmith"></div>
      <div class="form-group"><label>Password</label><input type="password" id="m-tech-pass" placeholder="Choose a password"></div>
    </div>
    <div class="form-group"><label>Pay Rate ($/hr)</label><input type="number" id="m-tech-pay" placeholder="25.00" step="0.01" min="0"></div>
    <div class="modal-actions">
      <button class="btn btn-ghost" onclick="closeModal()">Cancel</button>
      <button class="btn btn-primary" onclick="saveTech()">Save Technician</button>
    </div>`);
}

async function modalEditTech(id) {
  const techs = await API.get('/technicians');
  const t = techs.find(x => x.id === id);
  if (!t) return;
  openModal(`
    <div class="modal-title">Edit Technician</div>
    <div class="form-group"><label>Full Name</label><input type="text" id="m-tech-name" value="${t.name}"></div>
    <div class="form-row">
      <div class="form-group"><label>Username</label><input type="text" id="m-tech-user" value="${t.username}"></div>
      <div class="form-group"><label>New Password</label><input type="password" id="m-tech-pass" placeholder="Leave blank to keep"></div>
    </div>
    <div class="form-group"><label>Pay Rate ($/hr)</label><input type="number" id="m-tech-pay" value="${t.pay_rate}" step="0.01" min="0"></div>
    <div class="modal-actions">
      <button class="btn btn-ghost" onclick="closeModal()">Cancel</button>
      <button class="btn btn-primary" onclick="saveTech(${id})">Save Changes</button>
    </div>`);
}

async function saveTech(id = null) {
  const name = el('m-tech-name').value.trim();
  const username = el('m-tech-user').value.trim();
  const password = el('m-tech-pass').value;
  const payRate = parseFloat(el('m-tech-pay').value) || 0;
  if (!name || !username) { toast('Name and username are required', 'err'); return; }
  if (!id && !password) { toast('Password is required for new technicians', 'err'); return; }
  try {
    if (id) await API.put(`/technicians/${id}`, { name, username, password, payRate });
    else await API.post('/technicians', { name, username, password, payRate });
    closeModal();
    toast(id ? 'Technician updated' : 'Technician added', 'ok');
    App.loadPanel('technicians');
  } catch(e) { toast(e.message, 'err'); }
}

async function deleteTech(id, name) {
  if (!confirm(`Remove technician "${name}"? Their time entries will be kept.`)) return;
  try {
    await API.delete(`/technicians/${id}`);
    toast('Technician removed', 'ok');
    App.loadPanel('technicians');
  } catch(e) { toast(e.message, 'err'); }
}

// ═══════════════════════════════════════
// ADMIN — WORK ORDERS
// ═══════════════════════════════════════
async function renderAdminWorkOrders() {
  const [wos, techs] = await Promise.all([API.get('/workorders'), API.get('/technicians')]);

  return `
  <div class="section-hdr">
    <div class="section-title">Work Orders</div>
    <button class="btn btn-primary" onclick="modalAddWO()">+ New Work Order</button>
  </div>
  <div class="filter-bar">
    <select id="f-wo-status" onchange="filterWOs()">
      <option value="">All Statuses</option>
      <option value="open">Open</option>
      <option value="in-progress">In Progress</option>
      <option value="closed">Closed</option>
    </select>
    <select id="f-wo-tech" onchange="filterWOs()">
      <option value="">All Technicians</option>
      ${techs.map(t=>`<option value="${t.id}">${t.name}</option>`).join('')}
    </select>
    <input type="text" id="f-wo-search" placeholder="Search title / customer…" oninput="filterWOs()">
  </div>
  <div class="card">
    <div class="tbl-wrap"><table>
      <thead><tr><th>WO #</th><th>Title</th><th>Customer</th><th>Assigned To</th><th>Status</th><th>Created</th><th>Actions</th></tr></thead>
      <tbody id="wo-tbody">${renderWORows(wos)}</tbody>
    </table></div>
  </div>
  <script>
    window._allWOs = ${JSON.stringify(wos)};
  <\/script>`;
}

function renderWORows(wos) {
  if (!wos.length) return `<tr><td colspan="7"><div class="empty-state">No work orders found.</div></td></tr>`;
  return wos.map(w => `
    <tr>
      <td><b>#${w.id}</b></td>
      <td>${w.title}<br><small class="text-muted">${w.address || ''}</small></td>
      <td>${w.customer}</td>
      <td>${w.tech_name || '<span class="text-muted">Unassigned</span>'}</td>
      <td>${woBadge(w.status)}</td>
      <td class="text-muted">${fmtDate(w.created_at)}</td>
      <td><div class="td-actions">
        <button class="btn btn-secondary btn-sm" onclick="modalEditWO(${w.id})">Edit</button>
        ${w.status !== 'closed' ? `<button class="btn btn-success btn-sm" onclick="closeWO(${w.id})">Close</button>` : ''}
        <button class="btn btn-danger btn-sm" onclick="deleteWO(${w.id})">Delete</button>
      </div></td>
    </tr>`).join('');
}

function filterWOs() {
  const status = el('f-wo-status').value;
  const techId = el('f-wo-tech').value;
  const search = (el('f-wo-search').value || '').toLowerCase();
  let wos = window._allWOs || [];
  if (status) wos = wos.filter(w => w.status === status);
  if (techId) wos = wos.filter(w => String(w.assigned_to) === techId);
  if (search) wos = wos.filter(w => (w.title + w.customer + (w.address||'')).toLowerCase().includes(search));
  el('wo-tbody').innerHTML = renderWORows(wos);
}

async function modalAddWO() {
  const techs = await API.get('/technicians');
  openModal(`
    <div class="modal-title">New Work Order</div>
    <div class="form-group"><label>WO Title</label><input type="text" id="m-wo-title" placeholder="AC Unit Repair"></div>
    <div class="form-row">
      <div class="form-group"><label>Customer Name</label><input type="text" id="m-wo-customer" placeholder="Acme Corp"></div>
      <div class="form-group"><label>Address / Location</label><input type="text" id="m-wo-address" placeholder="123 Main St"></div>
    </div>
    <div class="form-group"><label>Assign Technician</label>
      <select id="m-wo-tech">${techOptions(techs)}</select>
    </div>
    <div class="form-group"><label>Description</label><textarea id="m-wo-desc" placeholder="Describe the work to be done…"></textarea></div>
    <div class="modal-actions">
      <button class="btn btn-ghost" onclick="closeModal()">Cancel</button>
      <button class="btn btn-primary" onclick="saveWO()">Create Work Order</button>
    </div>`);
}

async function modalEditWO(id) {
  const [wos, techs] = await Promise.all([API.get('/workorders'), API.get('/technicians')]);
  const w = wos.find(x => x.id === id);
  if (!w) return;
  openModal(`
    <div class="modal-title">Edit Work Order #${w.id}</div>
    <div class="form-group"><label>WO Title</label><input type="text" id="m-wo-title" value="${w.title}"></div>
    <div class="form-row">
      <div class="form-group"><label>Customer Name</label><input type="text" id="m-wo-customer" value="${w.customer}"></div>
      <div class="form-group"><label>Address / Location</label><input type="text" id="m-wo-address" value="${w.address||''}"></div>
    </div>
    <div class="form-group"><label>Assign Technician</label>
      <select id="m-wo-tech">${techOptions(techs, w.assigned_to)}</select>
    </div>
    <div class="form-group"><label>Status</label>
      <select id="m-wo-status">
        <option value="open" ${w.status==='open'?'selected':''}>Open</option>
        <option value="in-progress" ${w.status==='in-progress'?'selected':''}>In Progress</option>
        <option value="closed" ${w.status==='closed'?'selected':''}>Closed</option>
      </select>
    </div>
    <div class="form-group"><label>Description</label><textarea id="m-wo-desc">${w.description||''}</textarea></div>
    <div class="form-group"><label>Admin Notes</label><textarea id="m-wo-notes">${w.notes||''}</textarea></div>
    <div class="modal-actions">
      <button class="btn btn-ghost" onclick="closeModal()">Cancel</button>
      <button class="btn btn-primary" onclick="saveWO(${id})">Save Changes</button>
    </div>`);
}

async function saveWO(id = null) {
  const title = el('m-wo-title').value.trim();
  const customer = el('m-wo-customer').value.trim();
  const address = el('m-wo-address').value.trim();
  const assignedTo = el('m-wo-tech').value || null;
  const description = el('m-wo-desc').value.trim();
  const status = id ? el('m-wo-status').value : 'open';
  const notes = id ? el('m-wo-notes').value : '';
  if (!title || !customer) { toast('Title and customer required', 'err'); return; }
  try {
    if (id) await API.put(`/workorders/${id}`, { title, customer, address, assignedTo, description, status, notes });
    else await API.post('/workorders', { title, customer, address, assignedTo, description });
    closeModal();
    toast(id ? 'Work order updated' : 'Work order created', 'ok');
    App.loadPanel('workorders');
  } catch(e) { toast(e.message, 'err'); }
}

async function closeWO(id) {
  if (!confirm('Mark this work order as closed?')) return;
  try {
    await API.post(`/workorders/${id}/close`);
    toast('Work order closed', 'ok');
    App.loadPanel('workorders');
  } catch(e) { toast(e.message, 'err'); }
}

async function deleteWO(id) {
  if (!confirm('Delete this work order permanently?')) return;
  try {
    await API.delete(`/workorders/${id}`);
    toast('Work order deleted', 'ok');
    App.loadPanel('workorders');
  } catch(e) { toast(e.message, 'err'); }
}

// ═══════════════════════════════════════
// ADMIN — TIME LOG
// ═══════════════════════════════════════
async function renderAdminTimeLog() {
  const techs = await API.get('/technicians');
  const entries = await API.get('/time');
  window._allEntries = entries;
  window._tlTechs = techs;

  return `
  <div class="section-hdr">
    <div class="section-title">Time Log</div>
    <div class="actions-row">
      <button class="btn btn-primary" onclick="modalAddTimeEntry()">+ Add Entry</button>
      <button class="btn btn-secondary" onclick="exportTimeCSV()">⬇ Export CSV</button>
    </div>
  </div>
  <div class="filter-bar">
    <select id="f-tl-tech" onchange="filterTimelog()">
      <option value="">All Technicians</option>
      ${techs.map(t=>`<option value="${t.id}">${t.name}</option>`).join('')}
    </select>
    <input type="date" id="f-tl-from" onchange="filterTimelog()">
    <input type="date" id="f-tl-to" onchange="filterTimelog()">
    <button class="btn btn-secondary btn-sm" onclick="clearTLFilters()">Clear</button>
  </div>
  <div class="card">
    <div class="tbl-wrap"><table>
      <thead><tr><th>Technician</th><th>Clock In</th><th>Clock Out</th><th>Duration</th><th>Pay Earned</th><th>Notes</th><th>Actions</th></tr></thead>
      <tbody id="tl-tbody">${renderTLRows(entries)}</tbody>
    </table></div>
  </div>`;
}

function renderTLRows(entries) {
  if (!entries.length) return `<tr><td colspan="7"><div class="empty-state">No time entries found.</div></td></tr>`;
  return entries.map(e => `<tr>
    <td><b>${e.tech_name}</b></td>
    <td>${fmtDT(e.clock_in)}</td>
    <td>${e.clock_out ? fmtDT(e.clock_out) : '<span class="badge badge-green">Active</span>'}</td>
    <td><span class="duration-chip">${e.clock_out ? msToHHMM(e.clock_out - e.clock_in) : '—'}</span></td>
    <td><span class="pay-chip">${e.clock_out ? '$'+calcPay(e.clock_in, e.clock_out, e.pay_rate) : '—'}</span></td>
    <td><span class="note-text">${e.notes || '—'}</span></td>
    <td><div class="td-actions">
      <button class="btn btn-secondary btn-sm" onclick="modalEditTimeEntry(${e.id})">Edit</button>
      <button class="btn btn-danger btn-sm" onclick="deleteTimeEntry(${e.id})">Delete</button>
    </div></td>
  </tr>`).join('');
}

function filterTimelog() {
  const techId = el('f-tl-tech').value;
  const from = el('f-tl-from').value;
  const to = el('f-tl-to').value;
  let entries = window._allEntries || [];
  if (techId) entries = entries.filter(e => String(e.tech_id) === techId);
  if (from)   entries = entries.filter(e => e.clock_in >= new Date(from).getTime());
  if (to)     entries = entries.filter(e => e.clock_in <= new Date(to+'T23:59:59').getTime());
  el('tl-tbody').innerHTML = renderTLRows(entries);
}
function clearTLFilters() {
  ['f-tl-tech','f-tl-from','f-tl-to'].forEach(id => el(id).value = '');
  el('tl-tbody').innerHTML = renderTLRows(window._allEntries || []);
}

function exportTimeCSV() {
  const entries = window._allEntries || [];
  const rows = entries.map(e => [
    e.tech_name, fmtDT(e.clock_in), fmtDT(e.clock_out),
    e.clock_out ? msToHHMM(e.clock_out - e.clock_in) : '',
    e.clock_out ? calcPay(e.clock_in, e.clock_out, e.pay_rate) : '', e.notes || ''
  ]);
  downloadCSV(rows, ['Technician','Clock In','Clock Out','Duration','Pay Earned','Notes'], 'timelog.csv');
}

function tsToInput(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  const pad = n => String(n).padStart(2,'0');
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

async function modalAddTimeEntry() {
  const techs = window._tlTechs || await API.get('/technicians');
  const now = tsToInput(Date.now());
  openModal(`
    <div class="modal-title">Add Time Entry</div>
    <div class="form-group"><label>Technician</label>
      <select id="m-te-tech">
        <option value="">Select technician…</option>
        ${techs.map(t=>`<option value="${t.id}">${t.name}</option>`).join('')}
      </select>
    </div>
    <div class="form-row">
      <div class="form-group"><label>Clock In</label>
        <input type="datetime-local" id="m-te-in" value="${now}">
      </div>
      <div class="form-group"><label>Clock Out <span class="text-muted">(leave blank if still active)</span></label>
        <input type="datetime-local" id="m-te-out">
      </div>
    </div>
    <div class="form-group"><label>Notes</label>
      <textarea id="m-te-notes" placeholder="Optional notes…"></textarea>
    </div>
    <div class="modal-actions">
      <button class="btn btn-ghost" onclick="closeModal()">Cancel</button>
      <button class="btn btn-primary" onclick="saveTimeEntry()">Add Entry</button>
    </div>`);
}

async function modalEditTimeEntry(id) {
  const entries = window._allEntries || [];
  const e = entries.find(x => x.id === id);
  if (!e) return;
  openModal(`
    <div class="modal-title">Edit Time Entry</div>
    <div style="color:var(--text-dim);margin-bottom:16px;font-size:0.9rem">Technician: <b>${e.tech_name}</b></div>
    <div class="form-row">
      <div class="form-group"><label>Clock In</label>
        <input type="datetime-local" id="m-te-in" value="${tsToInput(e.clock_in)}">
      </div>
      <div class="form-group"><label>Clock Out <span class="text-muted">(leave blank if active)</span></label>
        <input type="datetime-local" id="m-te-out" value="${tsToInput(e.clock_out)}">
      </div>
    </div>
    <div class="form-group"><label>Notes</label>
      <textarea id="m-te-notes" placeholder="Optional notes…">${e.notes||''}</textarea>
    </div>
    <div class="modal-actions">
      <button class="btn btn-ghost" onclick="closeModal()">Cancel</button>
      <button class="btn btn-primary" onclick="saveTimeEntry(${id})">Save Changes</button>
    </div>`);
}

async function saveTimeEntry(id = null) {
  const clockIn  = el('m-te-in').value;
  const clockOut = el('m-te-out').value;
  const notes    = el('m-te-notes').value;
  if (!clockIn) { toast('Clock-in time is required', 'err'); return; }
  try {
    if (id) {
      await API.put(`/time/${id}`, { clockIn, clockOut: clockOut || null, notes });
    } else {
      const techId = el('m-te-tech').value;
      if (!techId) { toast('Please select a technician', 'err'); return; }
      await API.post('/time/admin-add', { techId, clockIn, clockOut: clockOut || null, notes });
    }
    closeModal();
    toast(id ? 'Entry updated' : 'Entry added', 'ok');
    App.loadPanel('timelog');
  } catch(e) { toast(e.message, 'err'); }
}

async function deleteTimeEntry(id) {
  if (!confirm('Delete this time entry? This cannot be undone.')) return;
  try {
    await API.delete(`/time/${id}`);
    toast('Entry deleted', 'ok');
    App.loadPanel('timelog');
  } catch(e) { toast(e.message, 'err'); }
}

// ═══════════════════════════════════════
// ADMIN — EXPENSES
// ═══════════════════════════════════════
async function renderAdminExpenses() {
  const [exps, techs, wos] = await Promise.all([API.get('/expenses'), API.get('/technicians'), API.get('/workorders')]);
  const total = exps.reduce((s, e) => s + parseFloat(e.amount||0), 0);

  return `
  <div class="section-hdr">
    <div class="section-title">Expenses</div>
    <button class="btn btn-primary" onclick="modalAddExpense()">+ Add Expense</button>
  </div>
  <div class="filter-bar">
    <select id="f-exp-tech" onchange="filterExpenses()">
      <option value="">All Technicians</option>
      ${techs.map(t=>`<option value="${t.id}">${t.name}</option>`).join('')}
    </select>
    <select id="f-exp-wo" onchange="filterExpenses()">
      <option value="">All Work Orders</option>
      ${wos.map(w=>`<option value="${w.id}">#${w.id} ${w.title}</option>`).join('')}
    </select>
  </div>
  <div class="card">
    <div class="tbl-wrap"><table>
      <thead><tr><th>Date</th><th>Technician</th><th>Work Order</th><th>Category</th><th>Description</th><th>Amount</th><th>Actions</th></tr></thead>
      <tbody id="exp-tbody">${renderExpRows(exps)}</tbody>
    </table></div>
    <div style="text-align:right;padding:14px 0 0;font-family:var(--font-d);font-size:1.1rem;font-weight:800">
      Total: <span class="pay-chip">$${total.toFixed(2)}</span>
    </div>
  </div>
  <script>window._allExps=${JSON.stringify(exps)};<\/script>`;
}

function renderExpRows(exps) {
  if (!exps.length) return `<tr><td colspan="7"><div class="empty-state">No expenses found.</div></td></tr>`;
  return exps.map(e => `<tr>
    <td>${fmtDate(e.expense_date)}</td>
    <td>${e.tech_name || '—'}</td>
    <td>${e.wo_title ? `#${e.wo_id} ${e.wo_title}` : '—'}</td>
    <td><span class="badge badge-orange">${e.category}</span></td>
    <td>${e.description}</td>
    <td><span class="pay-chip">$${parseFloat(e.amount).toFixed(2)}</span></td>
    <td><button class="btn btn-danger btn-sm" onclick="deleteExpense(${e.id})">Remove</button></td>
  </tr>`).join('');
}

function filterExpenses() {
  const techId = el('f-exp-tech').value;
  const woId = el('f-exp-wo').value;
  let exps = window._allExps || [];
  if (techId) exps = exps.filter(e => String(e.tech_id) === techId);
  if (woId) exps = exps.filter(e => String(e.wo_id) === woId);
  el('exp-tbody').innerHTML = renderExpRows(exps);
}

async function modalAddExpense() {
  const [techs, wos] = await Promise.all([API.get('/technicians'), API.get('/workorders')]);
  openModal(`
    <div class="modal-title">Add Expense</div>
    <div class="form-row">
      <div class="form-group"><label>Date</label><input type="date" id="m-exp-date" value="${new Date().toISOString().split('T')[0]}"></div>
      <div class="form-group"><label>Category</label>
        <select id="m-exp-cat">
          <option>Parts</option><option>Labor</option><option>Travel</option><option>Tools</option><option>Other</option>
        </select>
      </div>
    </div>
    <div class="form-group"><label>Technician</label>
      <select id="m-exp-tech">${techOptions(techs, null, 'Select technician…')}</select>
    </div>
    <div class="form-group"><label>Work Order (optional)</label>
      <select id="m-exp-wo">${woOptions(wos.filter(w=>w.status!=='closed'))}</select>
    </div>
    <div class="form-group"><label>Description</label><input type="text" id="m-exp-desc" placeholder="Describe the expense"></div>
    <div class="form-group"><label>Amount ($)</label><input type="number" id="m-exp-amount" step="0.01" placeholder="0.00"></div>
    <div class="modal-actions">
      <button class="btn btn-ghost" onclick="closeModal()">Cancel</button>
      <button class="btn btn-primary" onclick="saveExpense()">Save Expense</button>
    </div>`);
}

async function saveExpense() {
  const techId = el('m-exp-tech').value || null;
  const woId = el('m-exp-wo').value || null;
  const category = el('m-exp-cat').value;
  const description = el('m-exp-desc').value.trim();
  const amount = parseFloat(el('m-exp-amount').value);
  const expenseDate = el('m-exp-date').value;
  if (!description || !amount || !expenseDate) { toast('Fill all required fields', 'err'); return; }
  try {
    await API.post('/expenses', { techId, woId, category, description, amount, expenseDate });
    closeModal();
    toast('Expense added', 'ok');
    App.loadPanel('expenses');
  } catch(e) { toast(e.message, 'err'); }
}

async function deleteExpense(id) {
  if (!confirm('Remove this expense?')) return;
  try {
    await API.delete(`/expenses/${id}`);
    toast('Expense removed', 'ok');
    App.loadPanel('expenses');
  } catch(e) { toast(e.message, 'err'); }
}

// ═══════════════════════════════════════
// ADMIN — REPORTS
// ═══════════════════════════════════════
async function renderAdminReports() {
  const techs = await API.get('/technicians');
  return `
  <div class="section-title mb-5">Reports & Export</div>
  <div style="display:flex;flex-direction:column;gap:20px">

    <!-- PAYSTUB -->
    <div class="card" style="border-color:rgba(249,115,22,0.4)">
      <div class="card-title">Technician Pay Stub</div>
      <div style="color:var(--text-dim);font-size:0.88rem;margin-bottom:16px">
        Generates a professional pay stub PDF for a single technician showing hours worked, hourly rate, period pay, and year-to-date totals.
      </div>
      <div class="form-row">
        <div class="form-group"><label>Technician <span style="color:var(--red)">*</span></label>
          <select id="stub-tech">
            <option value="">Select technician…</option>
            ${techs.map(t=>`<option value="${t.id}">${t.name}</option>`).join('')}
          </select>
        </div>
        <div class="form-group"><label>Pay Period Label</label>
          <select id="stub-period" onchange="toggleCustomDates()">
            <option value="week">This Week</option>
            <option value="biweek">Last 2 Weeks</option>
            <option value="month">This Month</option>
            <option value="lastmonth">Last Month</option>
            <option value="custom">Custom Dates</option>
          </select>
        </div>
      </div>
      <div id="stub-custom-dates" class="form-row hidden">
        <div class="form-group"><label>From</label><input type="date" id="stub-from"></div>
        <div class="form-group"><label>To</label><input type="date" id="stub-to"></div>
      </div>
      <button class="btn btn-primary" onclick="genPayStub()">⬇ Download Pay Stub PDF</button>
    </div>

    <div class="grid-2">
      <!-- PAY SUMMARY -->
      <div class="card">
        <div class="card-title">Pay Summary Report</div>
        <div class="form-row">
          <div class="form-group"><label>Date From</label><input type="date" id="rpt-from"></div>
          <div class="form-group"><label>Date To</label><input type="date" id="rpt-to"></div>
        </div>
        <div class="form-group"><label>Technician</label>
          <select id="rpt-tech">
            <option value="">All Technicians</option>
            ${techs.map(t=>`<option value="${t.id}">${t.name}</option>`).join('')}
          </select>
        </div>
        <div class="actions-row mt-3">
          <button class="btn btn-primary" onclick="genPayPDF()">⬇ PDF Report</button>
          <button class="btn btn-secondary" onclick="exportPayCSV()">⬇ CSV</button>
        </div>
      </div>

      <!-- OTHER REPORTS -->
      <div class="card">
        <div class="card-title">Work Order Report</div>
        <div class="form-group"><label>Filter by Status</label>
          <select id="rpt-wo-status">
            <option value="">All Statuses</option>
            <option value="open">Open</option>
            <option value="in-progress">In Progress</option>
            <option value="closed">Closed</option>
          </select>
        </div>
        <button class="btn btn-secondary mt-3" onclick="exportWOCSV()">⬇ Export Work Orders CSV</button>
        <hr class="divider">
        <div class="card-title">Expense Report</div>
        <div class="actions-row">
          <button class="btn btn-primary" onclick="genExpensePDF()">⬇ PDF</button>
          <button class="btn btn-secondary" onclick="exportExpCSV()">⬇ CSV</button>
        </div>
      </div>
    </div>
  </div>`;
}

function toggleCustomDates() {
  const v = el('stub-period').value;
  v === 'custom' ? show('stub-custom-dates') : hide('stub-custom-dates');
}

function getPeriodDates(period) {
  const now = new Date();
  const pad = n => String(n).padStart(2,'0');
  const fmt = d => `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
  const today = fmt(now);
  switch(period) {
    case 'week': {
      const d = new Date(now); d.setDate(d.getDate() - 6);
      return { from: fmt(d), to: today };
    }
    case 'biweek': {
      const d = new Date(now); d.setDate(d.getDate() - 13);
      return { from: fmt(d), to: today };
    }
    case 'month': {
      const d = new Date(now.getFullYear(), now.getMonth(), 1);
      return { from: fmt(d), to: today };
    }
    case 'lastmonth': {
      const s = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const e = new Date(now.getFullYear(), now.getMonth(), 0);
      return { from: fmt(s), to: fmt(e) };
    }
    default: return { from: '', to: '' };
  }
}

function genPayStub() {
  const techId = el('stub-tech').value;
  if (!techId) { toast('Please select a technician', 'err'); return; }
  const period = el('stub-period').value;
  let from, to;
  if (period === 'custom') {
    from = el('stub-from').value;
    to   = el('stub-to').value;
  } else {
    ({ from, to } = getPeriodDates(period));
  }
  let url = `/api/reports/paystub?techId=${techId}`;
  if (from) url += `&from=${from}`;
  if (to)   url += `&to=${to}`;
  downloadPDF(url);
}

function genPayPDF() {
  const from = el('rpt-from').value;
  const to = el('rpt-to').value;
  const techId = el('rpt-tech').value;
  let url = '/api/reports/pay?x=1';
  if (from) url += `&from=${from}`;
  if (to)   url += `&to=${to}`;
  if (techId) url += `&techId=${techId}`;
  downloadPDF(url);
}

function genExpensePDF() {
  downloadPDF('/api/reports/expenses');
}

async function exportPayCSV() {
  const from = el('rpt-from').value;
  const to = el('rpt-to').value;
  const techId = el('rpt-tech').value;
  let path = '/time?x=1';
  if (from) path += `&from=${from}`;
  if (to)   path += `&to=${to}`;
  if (techId) path += `&techId=${techId}`;
  const entries = await API.get(path);
  const rows = entries.map(e => [
    e.tech_name, fmtDT(e.clock_in), fmtDT(e.clock_out),
    msToHHMM(e.clock_out - e.clock_in),
    `$${e.pay_rate}/hr`, `$${calcPay(e.clock_in, e.clock_out, e.pay_rate)}`
  ]);
  downloadCSV(rows, ['Technician','Clock In','Clock Out','Duration','Pay Rate','Pay Earned'], 'pay_report.csv');
}

async function exportWOCSV() {
  const status = el('rpt-wo-status').value;
  const path = status ? `/workorders?status=${status}` : '/workorders';
  const wos = await API.get(path);
  const rows = wos.map(w => [
    w.id, w.title, w.customer, w.address||'', w.tech_name||'Unassigned',
    w.status, fmtDate(w.created_at), w.notes||''
  ]);
  downloadCSV(rows, ['WO#','Title','Customer','Address','Assigned To','Status','Created','Notes'], 'workorders.csv');
}

async function exportExpCSV() {
  const exps = await API.get('/expenses');
  const rows = exps.map(e => [
    fmtDate(e.expense_date), e.tech_name||'', e.wo_title ? `#${e.wo_id} ${e.wo_title}` : '',
    e.category, e.description, `$${parseFloat(e.amount).toFixed(2)}`
  ]);
  downloadCSV(rows, ['Date','Technician','Work Order','Category','Description','Amount'], 'expenses.csv');
}

// ═══════════════════════════════════════
// ADMIN — ADMIN MANAGEMENT
// ═══════════════════════════════════════
async function renderAdminManagement() {
  const [admins, me] = await Promise.all([API.get('/admins'), API.get('/auth/me')]);

  return `
  <div class="section-hdr">
    <div class="section-title">Admin Accounts</div>
    <button class="btn btn-primary" onclick="modalAddAdmin()">+ Add Admin</button>
  </div>
  <div class="card">
    <div class="tbl-wrap"><table>
      <thead><tr><th>Name</th><th>Username</th><th>Email</th><th>MFA</th><th>Actions</th></tr></thead>
      <tbody>${admins.length ? admins.map(a => `
        <tr>
          <td><b>${a.name}</b> ${a.id === me.id ? '<span class="badge badge-orange" style="margin-left:6px">You</span>' : ''}</td>
          <td><span class="mono">${a.username}</span></td>
          <td>${a.email || '<span class="text-muted">—</span>'}</td>
          <td>${a.mfa_enabled
            ? `<span class="badge badge-green">${a.mfa_method === 'totp' ? 'App' : 'Email'}</span>`
            : '<span class="badge badge-gray">Off</span>'}</td>
          <td><div class="td-actions">
            ${a.id !== me.id ? `
              <button class="btn btn-secondary btn-sm" onclick="modalEditAdmin(${a.id})">Edit</button>
              <button class="btn btn-secondary btn-sm" onclick="demoteUser(${a.id}, '${a.name}')">→ Tech</button>
              <button class="btn btn-danger btn-sm" onclick="hardDeleteUser(${a.id}, '${a.name}', true)">Delete</button>
            ` : `<span class="text-muted" style="font-size:0.82rem">Use My Profile to edit</span>`}
          </div></td>
        </tr>`).join('')
      : `<tr><td colspan="5"><div class="empty-state">No admin accounts found.</div></td></tr>`}
      </tbody>
    </table></div>
  </div>`;
}

function modalAddAdmin() {
  openModal(`
    <div class="modal-title">Add Admin Account</div>
    <div class="form-group"><label>Full Name</label><input type="text" id="m-adm-name" placeholder="Jane Smith"></div>
    <div class="form-row">
      <div class="form-group"><label>Username</label><input type="text" id="m-adm-user" placeholder="jsmith"></div>
      <div class="form-group"><label>Password</label><input type="password" id="m-adm-pass" placeholder="Min. 6 characters"></div>
    </div>
    <div class="form-group"><label>Email Address <span class="text-muted">(optional)</span></label>
      <input type="email" id="m-adm-email" placeholder="jane@example.com">
    </div>
    <div style="background:rgba(249,115,22,0.08);border:1px solid rgba(249,115,22,0.25);border-radius:6px;padding:12px 14px;font-size:0.85rem;color:var(--text-dim);margin-bottom:4px">
      ⚠ Admin accounts have full access to all data, settings, and technician management.
    </div>
    <div class="modal-actions">
      <button class="btn btn-ghost" onclick="closeModal()">Cancel</button>
      <button class="btn btn-primary" onclick="saveAdmin()">Create Admin</button>
    </div>`);
}

async function modalEditAdmin(id) {
  const admins = await API.get('/admins');
  const a = admins.find(x => x.id === id);
  if (!a) return;
  openModal(`
    <div class="modal-title">Edit Admin Account</div>
    <div class="form-group"><label>Full Name</label><input type="text" id="m-adm-name" value="${a.name}"></div>
    <div class="form-row">
      <div class="form-group"><label>Username</label><input type="text" id="m-adm-user" value="${a.username}"></div>
      <div class="form-group"><label>New Password <span class="text-muted">(leave blank to keep)</span></label>
        <input type="password" id="m-adm-pass" placeholder="Leave blank to keep current">
      </div>
    </div>
    <div class="form-group"><label>Email Address</label>
      <input type="email" id="m-adm-email" value="${a.email || ''}">
    </div>
    <div class="modal-actions">
      <button class="btn btn-ghost" onclick="closeModal()">Cancel</button>
      <button class="btn btn-primary" onclick="saveAdmin(${id})">Save Changes</button>
    </div>`);
}

async function saveAdmin(id = null) {
  const name     = el('m-adm-name').value.trim();
  const username = el('m-adm-user').value.trim();
  const password = el('m-adm-pass').value;
  const email    = el('m-adm-email').value.trim();
  if (!name || !username) { toast('Name and username are required', 'err'); return; }
  if (!id && !password)  { toast('Password is required for new admins', 'err'); return; }
  try {
    if (id) await API.put(`/admins/${id}`, { name, username, password, email });
    else    await API.post('/admins', { name, username, password, email });
    closeModal();
    toast(id ? 'Admin updated' : 'Admin account created', 'ok');
    App.loadPanel('admins');
  } catch(e) { toast(e.message, 'err'); }
}

async function deleteAdmin(id, name) {
  if (!confirm(`Remove admin "${name}"? This cannot be undone.`)) return;
  try {
    await API.delete(`/admins/${id}`);
    toast('Admin removed', 'ok');
    App.loadPanel('admins');
  } catch(e) { toast(e.message, 'err'); }
}

// ── Registration approval ──
async function approveReg(id) {
  try {
    await API.post(`/register/${id}/approve`);
    toast('Registration approved — technician account created', 'ok');
    App.loadPanel('technicians');
  } catch(e) { toast(e.message, 'err'); }
}

async function denyReg(id, name) {
  if (!confirm(`Deny registration request from "${name}"?`)) return;
  try {
    await API.post(`/register/${id}/deny`);
    toast('Registration denied', 'ok');
    App.loadPanel('technicians');
  } catch(e) { toast(e.message, 'err'); }
}

// ═══════════════════════════════════════
// BAN MANAGEMENT
// ═══════════════════════════════════════
async function renderBanManagement() {
  const [bans, logins] = await Promise.all([API.get('/bans'), API.get('/bans/logins')]);

  return `
  <div class="section-title mb-5">Bans & Access Control</div>
  <div class="grid-2" style="gap:20px">

    <div>
      <!-- Active Sessions / IPs -->
      <div class="card mb-4">
        <div class="card-title">Recent Login IPs</div>
        ${logins.length ? `<div class="tbl-wrap"><table>
          <thead><tr><th>User</th><th>Role</th><th>Last IP</th><th>Last Login</th><th>Actions</th></tr></thead>
          <tbody>${logins.map(l => `<tr>
            <td><b>${l.name}</b><br><span class="text-muted">@${l.username}</span></td>
            <td><span class="badge ${l.role==='admin'?'badge-orange':'badge-blue'}">${l.role}</span></td>
            <td><span class="mono">${l.ip}</span></td>
            <td class="text-muted">${fmtDT(l.created_at)}</td>
            <td><div class="td-actions">
              <button class="btn btn-danger btn-sm" onclick="quickBan('ip','${l.ip}')">Ban IP</button>
              <button class="btn btn-danger btn-sm" onclick="quickBan('username','${l.username}')">Ban User</button>
            </div></td>
          </tr>`).join('')}</tbody>
        </table></div>`
        : '<div class="empty-state">No login history yet.</div>'}
      </div>

      <!-- Add Ban -->
      <div class="card">
        <div class="card-title">Add Ban</div>
        <div class="form-group"><label>Ban Type</label>
          <select id="ban-type">
            <option value="ip">IP Address</option>
            <option value="email">Email Address</option>
            <option value="username">Username</option>
          </select>
        </div>
        <div class="form-group"><label>Value</label>
          <input type="text" id="ban-value" placeholder="e.g. 192.168.1.1 or user@example.com or jsmith">
        </div>
        <div class="form-group"><label>Reason <span class="text-muted">(optional)</span></label>
          <input type="text" id="ban-reason" placeholder="Reason shown to banned user">
        </div>
        <button class="btn btn-danger" onclick="addBan()">🚫 Add Ban</button>
      </div>
    </div>

    <!-- Active Bans List -->
    <div class="card">
      <div class="card-title">Active Bans <span class="badge badge-red" style="margin-left:8px">${bans.length}</span></div>
      ${bans.length ? `<div class="tbl-wrap"><table>
        <thead><tr><th>Type</th><th>Value</th><th>Reason</th><th>Banned By</th><th>Date</th><th></th></tr></thead>
        <tbody>${bans.map(b => `<tr>
          <td><span class="badge ${b.type==='ip'?'badge-red':b.type==='email'?'badge-yellow':'badge-orange'}">${b.type.toUpperCase()}</span></td>
          <td><span class="mono">${b.value}</span></td>
          <td>${b.reason || '<span class="text-muted">—</span>'}</td>
          <td class="text-muted">${b.banned_by_username || '—'}</td>
          <td class="text-muted">${new Date(b.created_at).toLocaleDateString()}</td>
          <td><button class="btn btn-secondary btn-sm" onclick="removeBan(${b.id})">Remove</button></td>
        </tr>`).join('')}</tbody>
      </table></div>`
      : '<div class="empty-state">No active bans.</div>'}
    </div>
  </div>`;
}

async function addBan(type, value, reason) {
  const t = type || el('ban-type').value;
  const v = value || el('ban-value')?.value?.trim();
  const r = reason || el('ban-reason')?.value?.trim();
  if (!v) { toast('Please enter a value to ban', 'err'); return; }
  try {
    await API.post('/bans', { type: t, value: v, reason: r });
    toast(`${t.toUpperCase()} ban added`, 'ok');
    App.loadPanel('bans');
  } catch(e) { toast(e.message, 'err'); }
}

async function quickBan(type, value) {
  const reason = prompt(`Reason for banning ${type} "${value}" (optional):`);
  if (reason === null) return; // cancelled
  await addBan(type, value, reason || null);
}

async function removeBan(id) {
  if (!confirm('Remove this ban?')) return;
  try {
    await API.delete(`/bans/${id}`);
    toast('Ban removed', 'ok');
    App.loadPanel('bans');
  } catch(e) { toast(e.message, 'err'); }
}

// ── Role switching ──
async function promoteUser(id, name, newRole) {
  if (!confirm(`Promote "${name}" to Admin? They will have full access to all data.`)) return;
  try {
    await API.put(`/technicians/${id}/role`, { role: newRole });
    toast(`${name} promoted to Admin`, 'ok');
    App.loadPanel('technicians');
  } catch(e) { toast(e.message, 'err'); }
}

async function demoteUser(id, name) {
  if (!confirm(`Demote "${name}" to Technician?`)) return;
  try {
    await API.put(`/admins/${id}/role`, { role: 'tech' });
    toast(`${name} changed to Technician`, 'ok');
    App.loadPanel('admins');
  } catch(e) { toast(e.message, 'err'); }
}

// ── Hard delete ──
async function hardDeleteUser(id, name, isAdmin = false) {
  if (!confirm(`Permanently delete "${name}"? This cannot be undone. Their time entries will be kept but anonymized.`)) return;
  try {
    const endpoint = isAdmin ? `/admins/${id}/hard` : `/technicians/${id}/hard`;
    await API.delete(endpoint);
    toast(`${name} permanently deleted`, 'ok');
    App.loadPanel(isAdmin ? 'admins' : 'technicians');
  } catch(e) { toast(e.message, 'err'); }
}

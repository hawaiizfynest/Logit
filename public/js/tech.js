// ═══════════════════════════════════════
// TECH — CLOCK IN/OUT
// ═══════════════════════════════════════
let _clockInterval = null;

async function renderTechClock() {
  const current = await API.get('/time/current');
  window._currentEntry = current;

  const noteSection = current ? '' : `
    <div class="clock-note-wrap">
      <div class="form-group">
        <label>Note (optional)</label>
        <textarea id="clock-note" placeholder="Add a note for this session…"></textarea>
      </div>
    </div>`;

  const pillHtml = current
    ? `<div class="status-pill in"><span class="pulse-dot green"></span> Clocked In</div>`
    : `<div class="status-pill out"><span class="pulse-dot red"></span> Clocked Out</div>`;

  const sessionInfo = current
    ? `<div class="session-info">Clocked in at <b>${fmtDT(current.clock_in)}</b> — <span id="elapsed-live">${liveElapsed(current.clock_in)}</span> elapsed</div>`
    : `<div class="session-info"></div>`;

  const btnHtml = current
    ? `<button class="btn-clock btn-clock-out" onclick="doClockOut()">⏹ CLOCK OUT</button>`
    : `<button class="btn-clock btn-clock-in" onclick="doClockIn()">▶ CLOCK IN</button>`;

  return `
  <div class="clock-hero">
    <div class="clock-display">
      <div class="clock-time" id="live-clock">--:--:--</div>
      <div class="clock-date" id="live-date"></div>
      ${pillHtml}
      ${sessionInfo}
      ${noteSection}
      <div class="clock-btn-wrap">${btnHtml}</div>
    </div>
  </div>`;
}

function startClockTick() {
  if (_clockInterval) clearInterval(_clockInterval);
  _clockInterval = setInterval(() => {
    const timeEl = el('live-clock');
    const dateEl = el('live-date');
    const elapsedEl = el('elapsed-live');
    if (timeEl) timeEl.textContent = new Date().toLocaleTimeString('en-US', { hour12: false });
    if (dateEl) dateEl.textContent = new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    if (elapsedEl && window._currentEntry) {
      elapsedEl.textContent = liveElapsed(window._currentEntry.clock_in);
    }
  }, 1000);
}

async function doClockIn() {
  const notes = el('clock-note') ? el('clock-note').value : '';
  try {
    await API.post('/time/clock-in', { notes });
    toast('Clocked in successfully!', 'ok');
    App.loadPanel('clock');
  } catch(e) { toast(e.message, 'err'); }
}

async function doClockOut() {
  try {
    await API.post('/time/clock-out');
    toast('Clocked out. Good work!', 'ok');
    App.loadPanel('clock');
  } catch(e) { toast(e.message, 'err'); }
}

// ═══════════════════════════════════════
// TECH — MY WORK ORDERS
// ═══════════════════════════════════════
async function renderTechWorkOrders() {
  const wos = await API.get('/workorders');
  const active = wos.filter(w => w.status !== 'closed');

  if (!active.length) {
    return `
    <div class="section-title mb-4">My Work Orders</div>
    <div class="empty-state card"><div class="empty-icon">📋</div>No work orders assigned to you yet.</div>`;
  }

  return `
  <div class="section-title mb-4">My Work Orders</div>
  ${active.map(w => `
    <div class="wo-card">
      <div class="wo-card-hdr">
        <div>
          <span style="color:var(--text-muted);font-size:0.78rem">#${w.id}</span>
          <div class="wo-card-title">${w.title}</div>
        </div>
        ${woBadge(w.status)}
      </div>
      <div class="wo-card-meta mb-2">
        <b>Customer:</b> ${w.customer}
        ${w.address ? ` &nbsp;|&nbsp; <b>Location:</b> ${w.address}` : ''}
      </div>
      ${w.description ? `<div class="text-dim mb-2" style="font-size:0.85rem">${w.description}</div>` : ''}
      ${w.notes ? `<div class="note-text mb-2">📝 ${w.notes}</div>` : ''}
      <div class="td-actions mt-3">
        ${w.status === 'open' ? `<button class="btn btn-primary btn-sm" onclick="startWO(${w.id})">▶ Start Work</button>` : ''}
        <button class="btn btn-secondary btn-sm" onclick="modalWONotes(${w.id})">✏ Add Notes</button>
      </div>
    </div>`).join('')}`;
}

async function startWO(id) {
  try {
    await API.put(`/workorders/${id}`, { status: 'in-progress' });
    toast('Work order started!', 'ok');
    App.loadPanel('myworkorders');
  } catch(e) { toast(e.message, 'err'); }
}

async function modalWONotes(id) {
  const wos = await API.get('/workorders');
  const w = wos.find(x => x.id === id);
  openModal(`
    <div class="modal-title">Work Order Notes</div>
    <div style="color:var(--text-dim);margin-bottom:16px">#${w.id} — ${w.title}</div>
    <div class="form-group"><label>Progress Notes</label>
      <textarea id="m-wo-notes" rows="5" placeholder="Describe work completed, parts used, issues found…">${w.notes||''}</textarea>
    </div>
    <div class="modal-actions">
      <button class="btn btn-ghost" onclick="closeModal()">Cancel</button>
      <button class="btn btn-primary" onclick="saveWONotesTech(${id})">Save Notes</button>
    </div>`);
}

async function saveWONotesTech(id) {
  const notes = el('m-wo-notes').value;
  try {
    await API.put(`/workorders/${id}`, { notes });
    closeModal();
    toast('Notes saved', 'ok');
    App.loadPanel('myworkorders');
  } catch(e) { toast(e.message, 'err'); }
}

// ═══════════════════════════════════════
// TECH — MY HISTORY
// ═══════════════════════════════════════
async function renderTechHistory() {
  const [entries, me] = await Promise.all([API.get('/time/mine'), API.get('/auth/me')]);
  const totalHours = entries.reduce((s,e) => s + calcHours(e.clock_in, e.clock_out), 0);
  const totalPay   = entries.reduce((s,e) => s + parseFloat(calcPay(e.clock_in, e.clock_out, me.payRate)), 0);

  return `
  <div class="section-hdr">
    <div class="section-title">My Time History</div>
    <button class="btn btn-secondary" onclick="exportMyCSV()">⬇ Export CSV</button>
  </div>
  <div class="grid-3 mb-4">
    <div class="stat-tile orange"><div class="stat-label">Total Sessions</div><div class="stat-value orange">${entries.length}</div></div>
    <div class="stat-tile blue"><div class="stat-label">Total Hours</div><div class="stat-value blue">${totalHours.toFixed(1)}</div></div>
    <div class="stat-tile green"><div class="stat-label">Total Pay Earned</div><div class="stat-value green">$${totalPay.toFixed(2)}</div><div class="stat-sub">at $${parseFloat(me.payRate).toFixed(2)}/hr</div></div>
  </div>
  <div class="card">
    <div class="tbl-wrap"><table>
      <thead><tr><th>Clock In</th><th>Clock Out</th><th>Duration</th><th>Pay Earned</th><th>Notes</th></tr></thead>
      <tbody>${entries.length ? entries.map(e => `<tr>
        <td>${fmtDT(e.clock_in)}</td>
        <td>${fmtDT(e.clock_out)}</td>
        <td><span class="duration-chip">${msToHHMM(e.clock_out - e.clock_in)}</span></td>
        <td><span class="pay-chip">$${calcPay(e.clock_in, e.clock_out, me.payRate)}</span></td>
        <td><span class="note-text">${e.notes||'—'}</span></td>
      </tr>`).join('') : `<tr><td colspan="5"><div class="empty-state">No time entries yet.</div></td></tr>`}
      </tbody>
    </table></div>
  </div>
  <script>window._myEntries=${JSON.stringify(entries)};window._myRate=${me.payRate};<\/script>`;
}

async function exportMyCSV() {
  const entries = window._myEntries || [];
  const rate = window._myRate || 0;
  const rows = entries.map(e => [
    fmtDT(e.clock_in), fmtDT(e.clock_out),
    msToHHMM(e.clock_out - e.clock_in),
    `$${calcPay(e.clock_in, e.clock_out, rate)}`,
    e.notes || ''
  ]);
  downloadCSV(rows, ['Clock In','Clock Out','Duration','Pay Earned','Notes'], 'my_timelog.csv');
}

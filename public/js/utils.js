// ── Time formatting ──
function fmtDT(ts) {
  if (!ts) return '—';
  return new Date(ts).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}
function fmtDate(ts) {
  if (!ts) return '—';
  return new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}
function fmtDateInput(ts) {
  return new Date(ts).toISOString().split('T')[0];
}
function msToHHMM(ms) {
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  return `${h}h ${m}m`;
}
function calcHours(a, b) { return (b - a) / 3600000; }
function calcPay(a, b, rate) { return (calcHours(a, b) * rate).toFixed(2); }
function liveElapsed(start) { return msToHHMM(Date.now() - start); }

// ── DOM helpers ──
function el(id) { return document.getElementById(id); }
function html(id, content) { el(id).innerHTML = content; }
function show(id) { el(id).classList.remove('hidden'); }
function hide(id) { el(id).classList.add('hidden'); }

// ── Toast ──
let toastTimer;
function toast(msg, type = 'ok') {
  const t = el('toast');
  t.textContent = msg;
  t.className = `toast-${type}`;
  show('toast');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => hide('toast'), 3000);
}

// ── Modal ──
function openModal(innerHtml) {
  el('modal-inner').innerHTML = innerHtml;
  show('modal-overlay');
}
function closeModal() {
  hide('modal-overlay');
  el('modal-inner').innerHTML = '';
}

// ── CSV Export ──
function downloadCSV(rows, headers, filename) {
  const esc = v => '"' + String(v ?? '').replace(/"/g, '""') + '"';
  const content = [headers, ...rows].map(r => r.map(esc).join(',')).join('\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([content], { type: 'text/csv' }));
  a.download = filename;
  a.click();
}

// ── PDF download ──
function downloadPDF(url) {
  const a = document.createElement('a');
  a.href = url;
  a.target = '_blank';
  a.click();
}

// ── Status badge ──
function woBadge(status) {
  const map = { open: 'badge-yellow', 'in-progress': 'badge-blue', closed: 'badge-green' };
  return `<span class="badge ${map[status] || 'badge-gray'}">${status}</span>`;
}
function clockBadge(clocked) {
  return clocked
    ? '<span class="badge badge-green">Clocked In</span>'
    : '<span class="badge badge-red">Clocked Out</span>';
}

// ── Technician select options ──
function techOptions(techs, selectedId = null, addBlank = 'Unassigned') {
  let opts = addBlank ? `<option value="">${addBlank}</option>` : '';
  techs.forEach(t => opts += `<option value="${t.id}" ${t.id == selectedId ? 'selected' : ''}>${t.name}</option>`);
  return opts;
}
function woOptions(wos, selectedId = null, addBlank = 'None') {
  let opts = addBlank ? `<option value="">${addBlank}</option>` : '';
  wos.forEach(w => opts += `<option value="${w.id}" ${w.id == selectedId ? 'selected' : ''}>#${w.id} — ${w.title}</option>`);
  return opts;
}

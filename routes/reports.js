const express     = require('express');
const PDFDocument = require('pdfkit');
const db          = require('../db/database');
const router      = express.Router();

function requireAdmin(req, res, next) {
  if (!req.session.userId || req.session.role !== 'admin') return res.status(403).json({ error: 'Admin only' });
  next();
}

function fmtDT(ts) {
  return new Date(ts).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
}
function fmtDate(ts) {
  return new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}
function fmtDuration(ms) {
  const totalMins = Math.round(ms / 60000);
  const h = Math.floor(totalMins / 60);
  const m = totalMins % 60;
  return `${h}h ${m}m`;
}
function fmtPay(ms, rate) {
  return ((ms / 3600000) * rate).toFixed(2);
}

// ── Shared header ──
function drawHeader(doc, title, period) {
  // Dark header bar
  doc.rect(0, 0, doc.page.width, 72).fill('#0f1117');

  // Logo
  doc.fontSize(28).font('Helvetica-Bold').fillColor('#f97316');
  doc.text('LOGIT', 48, 20);

  // Title
  doc.fontSize(11).font('Helvetica').fillColor('#94a3b8');
  doc.text(title, 48, 50);

  // Period right-aligned
  doc.fontSize(10).fillColor('#94a3b8');
  doc.text(period, 0, 50, { align: 'right', width: doc.page.width - 48 });

  // Generated date
  doc.fontSize(8).fillColor('#64748b');
  doc.text(`Generated: ${new Date().toLocaleString()}`, 0, doc.page.height - 30, { align: 'center', width: doc.page.width });
}

// ── PAY REPORT ──
router.get('/pay', requireAdmin, (req, res) => {
  const { techId, from, to } = req.query;
  let sql = `SELECT te.*, u.name as tech_name, u.pay_rate
             FROM time_entries te
             JOIN users u ON u.id = te.tech_id
             WHERE te.clock_out IS NOT NULL`;
  const params = [];
  if (techId) { sql += ` AND te.tech_id=?`;    params.push(parseInt(techId)); }
  if (from)   { sql += ` AND te.clock_in>=?`;  params.push(new Date(from).getTime()); }
  if (to)     { sql += ` AND te.clock_in<=?`;  params.push(new Date(to + 'T23:59:59').getTime()); }
  sql += ` ORDER BY u.name, te.clock_in`;
  const entries = db.prepare(sql).all(...params);

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', 'attachment; filename="logit_pay_report.pdf"');

  const doc = new PDFDocument({ margin: 0, size: 'LETTER' });
  doc.pipe(res);

  const period = (from || to) ? `${from || 'Start'} — ${to || 'Present'}` : 'All Time';
  drawHeader(doc, 'Pay Report', period);

  // Group by technician
  const byTech = {};
  entries.forEach(e => {
    if (!byTech[e.tech_name]) byTech[e.tech_name] = { rate: e.pay_rate, entries: [] };
    byTech[e.tech_name].entries.push(e);
  });

  let grandTotalMs = 0;
  let grandTotalPay = 0;
  let y = 90;
  const L = 48;
  const W = doc.page.width - 96;

  // Column X positions
  const C = {
    clockIn:  L,
    clockOut: L + 145,
    duration: L + 290,
    rate:     L + 360,
    earned:   L + 430,
  };

  if (Object.keys(byTech).length === 0) {
    doc.fontSize(11).fillColor('#64748b').text('No time entries found for the selected period.', L, y + 20);
  }

  Object.entries(byTech).forEach(([name, data]) => {
    // Tech name bar
    if (y > 680) { doc.addPage(); y = 20; }
    doc.rect(L, y, W, 24).fill('#1e2535');
    doc.fontSize(10).font('Helvetica-Bold').fillColor('#f97316');
    doc.text(name.toUpperCase(), L + 8, y + 7);
    doc.fontSize(9).fillColor('#94a3b8');
    doc.text(`$${parseFloat(data.rate).toFixed(2)}/hr`, C.earned, y + 7, { width: 80, align: 'right' });
    y += 28;

    // Column headers
    doc.fontSize(7.5).font('Helvetica-Bold').fillColor('#64748b');
    doc.text('CLOCK IN',  C.clockIn,  y);
    doc.text('CLOCK OUT', C.clockOut, y);
    doc.text('DURATION',  C.duration, y);
    doc.text('RATE',      C.rate,     y);
    doc.text('EARNED',    C.earned,   y, { width: 80, align: 'right' });
    y += 14;
    doc.moveTo(L, y).lineTo(L + W, y).lineWidth(0.5).strokeColor('#2a3044').stroke();
    y += 4;

    let techMs = 0;
    let techPay = 0;

    data.entries.forEach((e, i) => {
      if (y > 700) { doc.addPage(); y = 20; }
      const ms  = e.clock_out - e.clock_in;
      const pay = parseFloat(fmtPay(ms, data.rate));
      techMs  += ms;
      techPay += pay;

      // Alternating row bg
      if (i % 2 === 0) doc.rect(L, y - 1, W, 16).fill('#f8f9fa');

      doc.fontSize(8.5).font('Helvetica').fillColor('#1e293b');
      doc.text(fmtDT(e.clock_in),  C.clockIn,  y, { width: 140 });
      doc.text(fmtDT(e.clock_out), C.clockOut, y, { width: 140 });
      doc.text(fmtDuration(ms),    C.duration, y, { width: 65 });
      doc.text(`$${parseFloat(data.rate).toFixed(2)}/hr`, C.rate, y, { width: 65 });
      doc.fillColor('#15803d').text(`$${pay.toFixed(2)}`, C.earned, y, { width: 80, align: 'right' });
      y += 16;

      if (e.notes) {
        doc.fontSize(7.5).font('Helvetica').fillColor('#94a3b8');
        doc.text(`↳ ${e.notes}`, C.clockIn + 10, y, { width: W - 10 });
        y += 12;
      }
    });

    grandTotalMs  += techMs;
    grandTotalPay += techPay;

    // Subtotal row
    doc.moveTo(L, y).lineTo(L + W, y).lineWidth(0.5).strokeColor('#e2e8f0').stroke();
    y += 4;
    doc.rect(L, y, W, 18).fill('#fff7ed');
    doc.fontSize(8.5).font('Helvetica-Bold').fillColor('#f97316');
    doc.text(`Subtotal: ${fmtDuration(techMs)}`, C.clockIn + 4, y + 5);
    doc.text(`$${techPay.toFixed(2)}`, C.earned, y + 5, { width: 80, align: 'right' });
    y += 26;
  });

  // Grand total
  if (y > 700) { doc.addPage(); y = 20; }
  y += 8;
  doc.rect(L, y, W, 28).fill('#f97316');
  doc.fontSize(12).font('Helvetica-Bold').fillColor('#ffffff');
  doc.text(`GRAND TOTAL — ${fmtDuration(grandTotalMs)}`, L + 10, y + 8);
  doc.text(`$${grandTotalPay.toFixed(2)}`, C.earned, y + 8, { width: 80, align: 'right' });

  doc.end();
});

// ── EXPENSE REPORT ──
router.get('/expenses', requireAdmin, (req, res) => {
  const expenses = db.prepare(`
    SELECT e.*, u.name as tech_name, wo.title as wo_title
    FROM expenses e
    LEFT JOIN users u ON u.id = e.tech_id
    LEFT JOIN work_orders wo ON wo.id = e.wo_id
    ORDER BY e.expense_date DESC
  `).all();

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', 'attachment; filename="logit_expense_report.pdf"');

  const doc = new PDFDocument({ margin: 0, size: 'LETTER' });
  doc.pipe(res);

  drawHeader(doc, 'Expense Report', `Generated ${new Date().toLocaleDateString()}`);

  const L = 48;
  const W = doc.page.width - 96;
  let y = 90;

  // Column positions
  const C = {
    date:   L,
    tech:   L + 70,
    wo:     L + 165,
    cat:    L + 290,
    desc:   L + 355,
    amount: L + W - 70,
  };

  // Headers
  doc.fontSize(7.5).font('Helvetica-Bold').fillColor('#64748b');
  doc.text('DATE',        C.date,   y);
  doc.text('TECHNICIAN',  C.tech,   y);
  doc.text('WORK ORDER',  C.wo,     y);
  doc.text('CATEGORY',    C.cat,    y);
  doc.text('DESCRIPTION', C.desc,   y);
  doc.text('AMOUNT',      C.amount, y, { width: 70, align: 'right' });
  y += 14;
  doc.moveTo(L, y).lineTo(L + W, y).lineWidth(0.5).strokeColor('#2a3044').stroke();
  y += 4;

  let total = 0;

  if (expenses.length === 0) {
    doc.fontSize(11).fillColor('#64748b').text('No expenses found.', L, y + 20);
  }

  expenses.forEach((e, i) => {
    if (y > 700) { doc.addPage(); y = 20; }
    const amount = parseFloat(e.amount);
    total += amount;

    if (i % 2 === 0) doc.rect(L, y - 1, W, 16).fill('#f8f9fa');

    doc.fontSize(8.5).font('Helvetica').fillColor('#1e293b');
    doc.text(fmtDate(e.expense_date),                              C.date,   y, { width: 68 });
    doc.text(e.tech_name || '—',                                   C.tech,   y, { width: 90 });
    doc.text(e.wo_title ? `#${e.wo_id} ${e.wo_title}` : '—',      C.wo,     y, { width: 120 });
    doc.text(e.category,                                           C.cat,    y, { width: 60 });
    doc.text(e.description,                                        C.desc,   y, { width: 130 });
    doc.fillColor('#15803d').text(`$${amount.toFixed(2)}`,         C.amount, y, { width: 70, align: 'right' });
    y += 16;
  });

  // Total bar
  if (y > 700) { doc.addPage(); y = 20; }
  y += 8;
  doc.rect(L, y, W, 28).fill('#f97316');
  doc.fontSize(12).font('Helvetica-Bold').fillColor('#ffffff');
  doc.text('TOTAL EXPENSES', L + 10, y + 8);
  doc.text(`$${total.toFixed(2)}`, C.amount, y + 8, { width: 70, align: 'right' });

  doc.end();
});

// ── PAYSTUB REPORT ──
router.get('/paystub', requireAdmin, (req, res) => {
  const { techId, from, to } = req.query;
  if (!techId) return res.status(400).json({ error: 'Technician required' });

  const tech = db.prepare("SELECT * FROM users WHERE id=? AND role='tech'").get(parseInt(techId));
  if (!tech) return res.status(404).json({ error: 'Technician not found' });

  // Pay period entries
  let sql = `SELECT * FROM time_entries WHERE tech_id=? AND clock_out IS NOT NULL`;
  const params = [parseInt(techId)];
  if (from) { sql += ` AND clock_in >= ?`; params.push(new Date(from).getTime()); }
  if (to)   { sql += ` AND clock_in <= ?`; params.push(new Date(to + 'T23:59:59').getTime()); }
  sql += ` ORDER BY clock_in ASC`;
  const periodEntries = db.prepare(sql).all(...params);

  // YTD entries (full current year)
  const yearStart = new Date(new Date().getFullYear(), 0, 1).getTime();
  const ytdEntries = db.prepare(
    "SELECT * FROM time_entries WHERE tech_id=? AND clock_out IS NOT NULL AND clock_in >= ?"
  ).all(parseInt(techId), yearStart);

  const periodMs  = periodEntries.reduce((s, e) => s + (e.clock_out - e.clock_in), 0);
  const periodPay = (periodMs / 3600000) * tech.pay_rate;
  const ytdMs     = ytdEntries.reduce((s, e) => s + (e.clock_out - e.clock_in), 0);
  const ytdPay    = (ytdMs / 3600000) * tech.pay_rate;
  const periodHrs = periodMs / 3600000;
  const ytdHrs    = ytdMs / 3600000;

  const periodLabel = from || to
    ? `${from || 'Start'} — ${to || 'Present'}`
    : 'All Time';
  const yearLabel = new Date().getFullYear().toString();

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="paystub_${tech.username}.pdf"`);

  const doc = new PDFDocument({ margin: 0, size: 'LETTER' });
  doc.pipe(res);

  const PW = doc.page.width;
  const PH = doc.page.height;

  // ── Header ──
  doc.rect(0, 0, PW, 80).fill('#0f1117');
  doc.fontSize(28).font('Helvetica-Bold').fillColor('#f97316').text('LOGIT', 48, 20);
  doc.fontSize(11).font('Helvetica').fillColor('#94a3b8').text('Pay Statement', 48, 52);
  doc.fontSize(9).fillColor('#64748b').text(`Generated: ${new Date().toLocaleString()}`, PW - 48, 52, { align: 'right', width: PW - 96 });

  // ── Employee Info Box ──
  const boxY = 100;
  doc.rect(48, boxY, PW - 96, 70).fill('#f8fafc').stroke('#e2e8f0');
  doc.fontSize(9).font('Helvetica-Bold').fillColor('#64748b').text('EMPLOYEE', 64, boxY + 10);
  doc.fontSize(15).font('Helvetica-Bold').fillColor('#0f172a').text(tech.name, 64, boxY + 22);
  doc.fontSize(9).font('Helvetica').fillColor('#64748b').text(`@${tech.username}`, 64, boxY + 42);
  if (tech.email) doc.text(tech.email, 64, boxY + 54);

  doc.fontSize(9).font('Helvetica-Bold').fillColor('#64748b').text('PAY PERIOD', PW / 2, boxY + 10);
  doc.fontSize(12).font('Helvetica-Bold').fillColor('#0f172a').text(periodLabel, PW / 2, boxY + 22);
  doc.fontSize(9).font('Helvetica').fillColor('#64748b').text(`Pay Rate: $${parseFloat(tech.pay_rate).toFixed(2)}/hr`, PW / 2, boxY + 42);

  // ── Big summary tiles ──
  const tileY = 192;
  const tileW = (PW - 96 - 16) / 2;
  const tileH = 90;

  // Period tile
  doc.rect(48, tileY, tileW, tileH).fill('#0f1117');
  doc.fontSize(8).font('Helvetica-Bold').fillColor('#94a3b8').text('THIS PAY PERIOD', 64, tileY + 12);
  doc.fontSize(9).font('Helvetica').fillColor('#64748b').text(`${formatHrs(periodHrs)} worked`, 64, tileY + 26);
  doc.fontSize(26).font('Helvetica-Bold').fillColor('#f97316').text(`$${periodPay.toFixed(2)}`, 64, tileY + 42);
  doc.fontSize(8).fillColor('#64748b').text('GROSS PAY', 64, tileY + 74);

  // YTD tile
  doc.rect(48 + tileW + 16, tileY, tileW, tileH).fill('#1e2535');
  doc.fontSize(8).font('Helvetica-Bold').fillColor('#94a3b8').text(`YEAR TO DATE (${yearLabel})`, 64 + tileW + 16, tileY + 12);
  doc.fontSize(9).font('Helvetica').fillColor('#64748b').text(`${formatHrs(ytdHrs)} worked`, 64 + tileW + 16, tileY + 26);
  doc.fontSize(26).font('Helvetica-Bold').fillColor('#22c55e').text(`$${ytdPay.toFixed(2)}`, 64 + tileW + 16, tileY + 42);
  doc.fontSize(8).fillColor('#64748b').text('GROSS YTD', 64 + tileW + 16, tileY + 74);

  // ── Earnings breakdown ──
  const secY = tileY + tileH + 24;
  doc.rect(48, secY, PW - 96, 24).fill('#1e2535');
  doc.fontSize(9).font('Helvetica-Bold').fillColor('#94a3b8').text('EARNINGS DETAIL', 64, secY + 8);

  // Column headers
  const hY = secY + 32;
  doc.fontSize(7.5).font('Helvetica-Bold').fillColor('#64748b');
  doc.text('DATE',       64,       hY);
  doc.text('CLOCK IN',  160,       hY);
  doc.text('CLOCK OUT', 280,       hY);
  doc.text('HOURS',     400,       hY);
  doc.text('AMOUNT',    PW - 96,   hY, { width: 48, align: 'right' });

  doc.moveTo(48, hY + 13).lineTo(PW - 48, hY + 13).lineWidth(0.5).strokeColor('#e2e8f0').stroke();

  let rowY = hY + 18;
  periodEntries.forEach((e, i) => {
    if (rowY > 680) { doc.addPage(); rowY = 40; }
    const ms  = e.clock_out - e.clock_in;
    const pay = (ms / 3600000) * tech.pay_rate;
    if (i % 2 === 0) doc.rect(48, rowY - 2, PW - 96, 15).fill('#f8fafc');
    doc.fontSize(8).font('Helvetica').fillColor('#334155');
    doc.text(fmtDate(e.clock_in),   64,       rowY);
    doc.text(fmtDT(e.clock_in),     160,      rowY);
    doc.text(fmtDT(e.clock_out),    280,      rowY);
    doc.text(formatHrs(ms/3600000), 400,      rowY);
    doc.fillColor('#15803d').text(`$${pay.toFixed(2)}`, PW - 96, rowY, { width: 48, align: 'right' });
    rowY += 15;
    if (e.notes) {
      doc.fontSize(7).fillColor('#94a3b8').text(`↳ ${e.notes}`, 72, rowY, { width: PW - 120 });
      rowY += 11;
    }
  });

  if (periodEntries.length === 0) {
    doc.fontSize(10).fillColor('#94a3b8').text('No time entries for this period.', 64, rowY + 10);
    rowY += 30;
  }

  // ── Summary footer bar ──
  const footY = Math.max(rowY + 20, PH - 120);
  doc.rect(48, footY, PW - 96, 0.5).fill('#e2e8f0');

  // Summary table
  const sumRows = [
    ['Regular Hours',        `${formatHrs(periodHrs)}`],
    ['Hourly Rate',          `$${parseFloat(tech.pay_rate).toFixed(2)}/hr`],
    ['Gross Pay This Period', `$${periodPay.toFixed(2)}`],
    ['Gross Pay YTD',        `$${ytdPay.toFixed(2)}`],
  ];

  let sumY = footY + 16;
  sumRows.forEach(([label, value], i) => {
    const isLast = i === sumRows.length - 1;
    if (isLast) {
      doc.rect(48, sumY - 4, PW - 96, 22).fill('#f97316');
      doc.fontSize(10).font('Helvetica-Bold').fillColor('#fff').text(label, 64, sumY + 2);
      doc.text(value, PW - 96, sumY + 2, { width: 48, align: 'right' });
    } else {
      doc.fontSize(9).font('Helvetica').fillColor('#334155').text(label, 64, sumY);
      doc.font('Helvetica-Bold').text(value, PW - 96, sumY, { width: 48, align: 'right' });
    }
    sumY += isLast ? 0 : 18;
  });

  // ── Footer ──
  doc.fontSize(7.5).font('Helvetica').fillColor('#94a3b8')
     .text('This document is computer generated and does not require a signature.', 48, PH - 28, { align: 'center', width: PW - 96 });

  doc.end();
});

function formatHrs(hrs) {
  const h = Math.floor(hrs);
  const m = Math.round((hrs - h) * 60);
  return `${h}h ${m}m`;
}

module.exports = router;

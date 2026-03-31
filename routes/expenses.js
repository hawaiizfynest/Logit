const express = require('express');
const db = require('../db/database');
const router = express.Router();

function requireAdmin(req, res, next) {
  if (!req.session.userId || req.session.role !== 'admin') return res.status(403).json({ error: 'Admin only' });
  next();
}

// Get expenses
router.get('/', requireAdmin, (req, res) => {
  const { techId, woId } = req.query;
  let sql = `SELECT e.*, u.name as tech_name, wo.title as wo_title FROM expenses e LEFT JOIN users u ON u.id=e.tech_id LEFT JOIN work_orders wo ON wo.id=e.wo_id WHERE 1=1`;
  const params = [];
  if (techId) { sql += ` AND e.tech_id=?`; params.push(parseInt(techId)); }
  if (woId)   { sql += ` AND e.wo_id=?`;   params.push(parseInt(woId)); }
  sql += ` ORDER BY e.expense_date DESC`;
  res.json(db.prepare(sql).all(...params));
});

// Create expense
router.post('/', requireAdmin, (req, res) => {
  const { techId, woId, category, description, amount, expenseDate } = req.body;
  if (!description || !amount || !expenseDate) return res.status(400).json({ error: 'Description, amount and date required' });
  const result = db.prepare("INSERT INTO expenses (tech_id, wo_id, category, description, amount, expense_date) VALUES (?,?,?,?,?,?)").run(techId ? parseInt(techId) : null, woId ? parseInt(woId) : null, category || 'Other', description.trim(), parseFloat(amount), new Date(expenseDate).getTime());
  res.json({ id: result.lastInsertRowid });
});

// Delete expense
router.delete('/:id', requireAdmin, (req, res) => {
  db.prepare("DELETE FROM expenses WHERE id=?").run(parseInt(req.params.id));
  res.json({ ok: true });
});

module.exports = router;

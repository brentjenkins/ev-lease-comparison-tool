import { Router } from 'express';
import { db } from '../db.js';

export const makesRouter = Router();

makesRouter.get('/', (req, res) => {
  const rows = db.prepare('SELECT * FROM makes ORDER BY name').all();
  res.json(rows);
});

makesRouter.post('/', (req, res) => {
  const body = req.body || {};
  if (!body.name || !body.name.trim()) {
    return res.status(400).json({ error: 'name is required' });
  }
  try {
    const info = db.prepare(
      'INSERT INTO makes (name, acquisition_fee, disposition_fee) VALUES (@name, @acquisition_fee, @disposition_fee)'
    ).run(buildValues(body));
    const row = db.prepare('SELECT * FROM makes WHERE id = ?').get(info.lastInsertRowid);
    res.status(201).json(row);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

makesRouter.put('/:id', (req, res) => {
  const existing = db.prepare('SELECT * FROM makes WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Not found' });

  const merged = { ...existing, ...req.body };
  try {
    db.prepare(
      'UPDATE makes SET name=@name, acquisition_fee=@acquisition_fee, disposition_fee=@disposition_fee WHERE id=@id'
    ).run({ ...buildValues(merged), id: req.params.id });
    const row = db.prepare('SELECT * FROM makes WHERE id = ?').get(req.params.id);
    res.json(row);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

makesRouter.delete('/:id', (req, res) => {
  db.prepare('DELETE FROM makes WHERE id = ?').run(req.params.id);
  res.status(204).end();
});

function buildValues(body) {
  return {
    name: String(body.name).trim(),
    acquisition_fee: body.acquisition_fee != null && body.acquisition_fee !== '' ? Number(body.acquisition_fee) : 0,
    disposition_fee: body.disposition_fee != null && body.disposition_fee !== '' ? Number(body.disposition_fee) : 0,
  };
}

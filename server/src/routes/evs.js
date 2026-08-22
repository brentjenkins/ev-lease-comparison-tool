import { Router } from 'express';
import { db } from '../db.js';
import { serializeEv as serialize } from '../lib/evScore.js';

export const evsRouter = Router();

evsRouter.get('/', (req, res) => {
  const rows = db.prepare('SELECT * FROM evs ORDER BY year DESC, make, model, trim').all();
  res.json(rows.map(serialize));
});

evsRouter.get('/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM evs WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Not found' });
  res.json(serialize(row));
});

evsRouter.post('/', (req, res) => {
  const body = req.body || {};
  if (!body.year || !body.make || !body.model) {
    return res.status(400).json({ error: 'year, make, and model are required' });
  }
  const values = buildValues(body);
  const stmt = db.prepare(`
    INSERT INTO evs (year, make, model, trim, msrp, seats, range_miles, awd, powered_liftgate, heated_seats, cooled_seats, charging_800v, notes)
    VALUES (@year, @make, @model, @trim, @msrp, @seats, @range_miles, @awd, @powered_liftgate, @heated_seats, @cooled_seats, @charging_800v, @notes)
  `);
  const info = stmt.run(values);
  const row = db.prepare('SELECT * FROM evs WHERE id = ?').get(info.lastInsertRowid);
  res.status(201).json(serialize(row));
});

evsRouter.put('/:id', (req, res) => {
  const existing = db.prepare('SELECT * FROM evs WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Not found' });

  const merged = { ...existing, ...req.body };
  const values = buildValues(merged);
  db.prepare(`
    UPDATE evs SET year=@year, make=@make, model=@model, trim=@trim, msrp=@msrp, seats=@seats,
      range_miles=@range_miles, awd=@awd, powered_liftgate=@powered_liftgate,
      heated_seats=@heated_seats, cooled_seats=@cooled_seats, charging_800v=@charging_800v, notes=@notes
    WHERE id=@id
  `).run({ ...values, id: req.params.id });

  const row = db.prepare('SELECT * FROM evs WHERE id = ?').get(req.params.id);
  res.json(serialize(row));
});

evsRouter.delete('/:id', (req, res) => {
  db.prepare('DELETE FROM evs WHERE id = ?').run(req.params.id);
  res.status(204).end();
});

function buildValues(body) {
  return {
    year: parseInt(body.year, 10),
    make: String(body.make).trim(),
    model: String(body.model).trim(),
    trim: body.trim ? String(body.trim).trim() : null,
    msrp: body.msrp != null && body.msrp !== '' ? Number(body.msrp) : null,
    seats: body.seats != null && body.seats !== '' ? parseInt(body.seats, 10) : null,
    range_miles: body.range_miles != null && body.range_miles !== '' ? parseInt(body.range_miles, 10) : null,
    awd: body.awd ? 1 : 0,
    powered_liftgate: body.powered_liftgate ? 1 : 0,
    heated_seats: body.heated_seats ? 1 : 0,
    cooled_seats: body.cooled_seats ? 1 : 0,
    charging_800v: body.charging_800v ? 1 : 0,
    notes: body.notes || null,
  };
}

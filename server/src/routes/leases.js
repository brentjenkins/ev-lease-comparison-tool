import { Router } from 'express';
import { db } from '../db.js';
import { computeLeaseMetrics, suggestMonthlyPayment } from '../lib/leaseCalc.js';

export const leasesRouter = Router();

const NUMERIC_FIELDS = [
  'msrp', 'selling_price', 'residual_value', 'money_factor', 'excess_mileage_fee',
  'down_payment', 'taxed_incentives', 'untaxed_incentives',
  'acquisition_fee', 'registration_fee', 'doc_fee', 'tire_fee', 'electronic_filing_fee', 'disposition_fee', 'security_deposit',
  'tax_rate_percent', 'monthly_payment',
];
const INT_FIELDS = ['term_months', 'annual_mileage'];

function withEvAndMetrics(row) {
  const ev = db.prepare('SELECT * FROM evs WHERE id = ?').get(row.ev_id);
  return {
    ...row,
    ev: ev ? { ...ev, awd: !!ev.awd, powered_liftgate: !!ev.powered_liftgate, heated_seats: !!ev.heated_seats, cooled_seats: !!ev.cooled_seats } : null,
    metrics: computeLeaseMetrics(row),
  };
}

leasesRouter.get('/', (req, res) => {
  const rows = db.prepare('SELECT * FROM leases ORDER BY created_at DESC').all();
  res.json(rows.map(withEvAndMetrics));
});

leasesRouter.get('/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM leases WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Not found' });
  res.json(withEvAndMetrics(row));
});

// Returns a suggested pre-tax monthly payment for the given (unsaved) lease terms,
// used by the "suggest payment" button in the Add/Edit Lease form.
leasesRouter.post('/suggest-payment', (req, res) => {
  const payment = suggestMonthlyPayment(normalize(req.body || {}));
  res.json({ monthly_payment: payment });
});

leasesRouter.post('/', (req, res) => {
  const body = req.body || {};
  if (!body.ev_id) return res.status(400).json({ error: 'ev_id is required' });
  const ev = db.prepare('SELECT id FROM evs WHERE id = ?').get(body.ev_id);
  if (!ev) return res.status(400).json({ error: 'ev_id does not reference an existing EV' });

  const values = normalize(body);
  const info = db.prepare(`
    INSERT INTO leases (
      ev_id, source_url, listing_title, image_url, notes,
      msrp, selling_price, term_months, annual_mileage, excess_mileage_fee, residual_value, money_factor,
      down_payment, taxed_incentives, untaxed_incentives,
      acquisition_fee, registration_fee, doc_fee, tire_fee, electronic_filing_fee, disposition_fee, security_deposit,
      tax_rate_percent, tax_method, monthly_payment
    ) VALUES (
      @ev_id, @source_url, @listing_title, @image_url, @notes,
      @msrp, @selling_price, @term_months, @annual_mileage, @excess_mileage_fee, @residual_value, @money_factor,
      @down_payment, @taxed_incentives, @untaxed_incentives,
      @acquisition_fee, @registration_fee, @doc_fee, @tire_fee, @electronic_filing_fee, @disposition_fee, @security_deposit,
      @tax_rate_percent, @tax_method, @monthly_payment
    )
  `).run({ ...values, ev_id: body.ev_id });

  const row = db.prepare('SELECT * FROM leases WHERE id = ?').get(info.lastInsertRowid);
  res.status(201).json(withEvAndMetrics(row));
});

leasesRouter.put('/:id', (req, res) => {
  const existing = db.prepare('SELECT * FROM leases WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Not found' });

  const merged = { ...existing, ...req.body };
  const values = normalize(merged);
  db.prepare(`
    UPDATE leases SET
      ev_id=@ev_id, source_url=@source_url, listing_title=@listing_title, image_url=@image_url, notes=@notes,
      msrp=@msrp, selling_price=@selling_price, term_months=@term_months, annual_mileage=@annual_mileage,
      excess_mileage_fee=@excess_mileage_fee, residual_value=@residual_value, money_factor=@money_factor,
      down_payment=@down_payment, taxed_incentives=@taxed_incentives, untaxed_incentives=@untaxed_incentives,
      acquisition_fee=@acquisition_fee, registration_fee=@registration_fee, doc_fee=@doc_fee, tire_fee=@tire_fee, electronic_filing_fee=@electronic_filing_fee, disposition_fee=@disposition_fee, security_deposit=@security_deposit,
      tax_rate_percent=@tax_rate_percent, tax_method=@tax_method, monthly_payment=@monthly_payment
    WHERE id=@id
  `).run({ ...values, ev_id: merged.ev_id, id: req.params.id });

  const row = db.prepare('SELECT * FROM leases WHERE id = ?').get(req.params.id);
  res.json(withEvAndMetrics(row));
});

leasesRouter.delete('/:id', (req, res) => {
  db.prepare('DELETE FROM leases WHERE id = ?').run(req.params.id);
  res.status(204).end();
});

function normalize(body) {
  const out = {
    source_url: body.source_url || null,
    listing_title: body.listing_title || null,
    image_url: body.image_url || null,
    notes: body.notes || null,
    tax_method: body.tax_method === 'upfront' ? 'upfront' : 'monthly',
  };
  for (const f of NUMERIC_FIELDS) {
    out[f] = body[f] != null && body[f] !== '' ? Number(body[f]) : (f === 'residual_value' || f === 'money_factor' || f === 'selling_price' || f === 'excess_mileage_fee' ? null : 0);
  }
  for (const f of INT_FIELDS) {
    out[f] = body[f] != null && body[f] !== '' ? parseInt(body[f], 10) : (f === 'term_months' ? 36 : null);
  }
  return out;
}

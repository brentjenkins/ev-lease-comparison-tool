import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { mkdirSync } from 'node:fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const dataDir = join(__dirname, '..', 'data');
mkdirSync(dataDir, { recursive: true });

export const db = new DatabaseSync(join(dataDir, 'leasecomparison.db'));
db.exec('PRAGMA foreign_keys = ON;');

db.exec(`
  CREATE TABLE IF NOT EXISTS evs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    year INTEGER NOT NULL,
    make TEXT NOT NULL,
    model TEXT NOT NULL,
    trim TEXT,
    msrp REAL,
    seats INTEGER,
    range_miles INTEGER,
    awd INTEGER NOT NULL DEFAULT 0,
    powered_liftgate INTEGER NOT NULL DEFAULT 0,
    heated_seats INTEGER NOT NULL DEFAULT 0,
    cooled_seats INTEGER NOT NULL DEFAULT 0,
    charging_800v INTEGER NOT NULL DEFAULT 0,
    notes TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS leases (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ev_id INTEGER NOT NULL REFERENCES evs(id) ON DELETE CASCADE,
    source_url TEXT,
    listing_title TEXT,
    image_url TEXT,
    dealer_name TEXT,
    notes TEXT,

    msrp REAL NOT NULL DEFAULT 0,
    selling_price REAL,

    term_months INTEGER NOT NULL DEFAULT 36,
    annual_mileage INTEGER,
    excess_mileage_fee REAL,
    residual_value REAL,
    money_factor REAL,

    down_payment REAL NOT NULL DEFAULT 0,
    manufacturer_incentives REAL NOT NULL DEFAULT 0,
    dealer_incentives REAL NOT NULL DEFAULT 0,
    untaxed_incentives REAL NOT NULL DEFAULT 0,

    acquisition_fee REAL NOT NULL DEFAULT 0,
    registration_fee REAL NOT NULL DEFAULT 0,
    doc_fee REAL NOT NULL DEFAULT 0,
    tire_fee REAL NOT NULL DEFAULT 0,
    electronic_filing_fee REAL NOT NULL DEFAULT 0,
    disposition_fee REAL NOT NULL DEFAULT 0,
    security_deposit REAL NOT NULL DEFAULT 0,

    tax_rate_percent REAL NOT NULL DEFAULT 0,
    tax_method TEXT NOT NULL DEFAULT 'monthly',

    monthly_payment REAL NOT NULL DEFAULT 0,

    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS makes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    acquisition_fee REAL NOT NULL DEFAULT 0,
    disposition_fee REAL NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
`);

// Fee line items were split out from generic dealer_fees/government_fees into
// specifically-named fields (dealers label the same fixed CA fees differently).
const existingLeaseColumns = new Set(db.prepare('PRAGMA table_info(leases)').all().map((c) => c.name));
for (const col of ['registration_fee', 'doc_fee', 'tire_fee', 'electronic_filing_fee']) {
  if (!existingLeaseColumns.has(col)) {
    db.exec(`ALTER TABLE leases ADD COLUMN ${col} REAL NOT NULL DEFAULT 0`);
  }
}
for (const col of ['dealer_fees', 'government_fees', 'trade_in_equity']) {
  if (existingLeaseColumns.has(col)) {
    db.exec(`ALTER TABLE leases DROP COLUMN ${col}`);
  }
}
if (!existingLeaseColumns.has('excess_mileage_fee')) {
  db.exec('ALTER TABLE leases ADD COLUMN excess_mileage_fee REAL');
}
if (!existingLeaseColumns.has('dealer_name')) {
  db.exec('ALTER TABLE leases ADD COLUMN dealer_name TEXT');
}

// Taxed incentives split by source (manufacturer lease cash vs. dealer discount) so
// they can be tracked separately — both are still taxed the same way, so anywhere the
// old single field fed the tax math now sums the two.
if (!existingLeaseColumns.has('manufacturer_incentives')) {
  db.exec('ALTER TABLE leases ADD COLUMN manufacturer_incentives REAL NOT NULL DEFAULT 0');
  if (existingLeaseColumns.has('taxed_incentives')) {
    db.exec('UPDATE leases SET manufacturer_incentives = taxed_incentives');
  }
}
if (!existingLeaseColumns.has('dealer_incentives')) {
  db.exec('ALTER TABLE leases ADD COLUMN dealer_incentives REAL NOT NULL DEFAULT 0');
}
if (existingLeaseColumns.has('taxed_incentives')) {
  db.exec('ALTER TABLE leases DROP COLUMN taxed_incentives');
}

// Manufacturer's baseline MSRP for the trim, distinct from a lease's own msrp
// (which reflects the specific listing/build, options included).
const existingEvColumns = new Set(db.prepare('PRAGMA table_info(evs)').all().map((c) => c.name));
if (!existingEvColumns.has('msrp')) {
  db.exec('ALTER TABLE evs ADD COLUMN msrp REAL');
}
if (!existingEvColumns.has('charging_800v')) {
  db.exec('ALTER TABLE evs ADD COLUMN charging_800v INTEGER NOT NULL DEFAULT 0');
}

// Seed the captive-finance acquisition/disposition fee schedule from LeaseHackr's
// calculator (leasehackr.com/calculator "Select Make" dropdown, read 2026-08-21).
// INSERT OR IGNORE so re-running this never clobbers a fee the user has since edited.
const MAKE_FEE_SEED = [
  ['Acura', 650, 350], ['Alfa Romeo', 595, 395], ['Aston Martin', 1195, 695], ['Audi', 895, 495],
  ['BMW', 925, 495], ['Bentley', 1495, 500], ['Buick', 0, 495], ['Cadillac', 0, 595],
  ['Chevrolet', 0, 395], ['Chrysler', 595, 395], ['Dodge', 595, 395], ['FIAT', 595, 395],
  ['Ford', 695, 495], ['GMC', 0, 495], ['Genesis', 750, 400], ['Honda', 595, 350],
  ['Hyundai', 650, 400], ['INEOS', 895, 395], ['INFINITI', 795, 395], ['Jaguar', 1075, 495],
  ['Jeep', 1075, 395], ['Kia', 650, 400], ['Lamborghini', 1495, 750], ['Land Rover', 1075, 495],
  ['Lexus', 895, 350], ['Lincoln', 825, 495], ['Lucid', 995, 450], ['MINI', 925, 395],
  ['Maserati', 795, 495], ['Mazda', 750, 350], ['Mclaren', 1450, 895], ['Mercedes-Benz', 795, 595],
  ['Mitsubishi', 595, 395], ['Nissan', 695, 395], ['Polestar', 695, 450], ['Porsche', 1095, 595],
  ['Ram', 1095, 395], ['Rivian', 895, 495], ['Rolls-Royce', 895, 495], ['Subaru', 650, 300],
  ['Tesla', 650, 395], ['Toyota', 750, 350], ['VinFast', 695, 395], ['Volkswagen', 695, 395],
  ['Volvo', 995, 450],
];
const insertMake = db.prepare(
  'INSERT OR IGNORE INTO makes (name, acquisition_fee, disposition_fee) VALUES (?, ?, ?)'
);
for (const row of MAKE_FEE_SEED) insertMake.run(...row);

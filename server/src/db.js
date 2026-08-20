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
    seats INTEGER,
    range_miles INTEGER,
    awd INTEGER NOT NULL DEFAULT 0,
    powered_liftgate INTEGER NOT NULL DEFAULT 0,
    heated_seats INTEGER NOT NULL DEFAULT 0,
    cooled_seats INTEGER NOT NULL DEFAULT 0,
    notes TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS leases (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ev_id INTEGER NOT NULL REFERENCES evs(id) ON DELETE CASCADE,
    source_url TEXT,
    listing_title TEXT,
    image_url TEXT,
    notes TEXT,

    msrp REAL NOT NULL DEFAULT 0,
    selling_price REAL,

    term_months INTEGER NOT NULL DEFAULT 36,
    annual_mileage INTEGER,
    residual_percent REAL,
    money_factor REAL,

    down_payment REAL NOT NULL DEFAULT 0,
    trade_in_equity REAL NOT NULL DEFAULT 0,
    taxed_incentives REAL NOT NULL DEFAULT 0,
    untaxed_incentives REAL NOT NULL DEFAULT 0,

    acquisition_fee REAL NOT NULL DEFAULT 0,
    dealer_fees REAL NOT NULL DEFAULT 0,
    government_fees REAL NOT NULL DEFAULT 0,
    disposition_fee REAL NOT NULL DEFAULT 0,
    security_deposit REAL NOT NULL DEFAULT 0,

    tax_rate_percent REAL NOT NULL DEFAULT 0,
    tax_method TEXT NOT NULL DEFAULT 'monthly',

    monthly_payment REAL NOT NULL DEFAULT 0,

    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
`);

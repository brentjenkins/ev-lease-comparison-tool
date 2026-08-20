# EV Lease Comparison

A local tool for comparing EV lease deals: an **EVs** catalog (year/make/model/trim + specs) and a **Leases**
tracker (add a deal by pasting a listing link, review the best-effort scraped guess, fill in the lease terms,
and get comparison metrics: total lease cost, cost-by-month, and years-to-MSRP).

## Setup

```bash
npm install
```

## Run (development)

```bash
npm run dev
```

Starts the API on `http://localhost:3001` and the frontend (with hot reload) on `http://localhost:5173` —
open that URL in your browser. Data is stored in `server/data/leasecomparison.db` (SQLite, created
automatically).

## Run (single command, production build)

```bash
npm run build
npm start
```

Serves everything from `http://localhost:3001`.

## Notes

- Adding a lease starts by pasting a link to a dealer/marketplace listing page and clicking **Scrape** — this
  fetches the page server-side and best-effort extracts a title, image, price/MSRP, and year/make/model/trim
  guess (from JSON-LD structured data if present, else Open Graph tags / page text). Results vary a lot by
  site; everything is editable before saving. Lease terms (money factor, residual %, fees, tax) are not on
  listing pages and are entered manually.
- "Suggest payment" in the lease form computes a payment from selling price / residual % / money factor /
  fees, mirroring the standard depreciation + rent-charge lease formula (as used by LeaseHackr's calculator).
  You can also just type in a dealer-quoted payment directly and skip those fields.

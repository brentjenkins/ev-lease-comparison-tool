import { useMemo, useState } from 'react';
import { api } from '../api';
import type { EV, EVInput, Lease, LeaseInput, ScrapeGuess, TaxMethod } from '../types';
import { ScrapePreview } from './ScrapePreview';
import { EVForm, evLabel } from './EVForm';

interface Props {
  evs: EV[];
  initial?: Lease;
  onCancel: () => void;
  onSaved: () => void;
  onEvCreated: () => Promise<EV[]>;
}

const emptyTerms = {
  msrp: 0,
  selling_price: null as number | null,
  term_months: 36,
  annual_mileage: 10000 as number | null,
  residual_percent: null as number | null,
  money_factor: null as number | null,
  down_payment: 0,
  trade_in_equity: 0,
  taxed_incentives: 0,
  untaxed_incentives: 0,
  acquisition_fee: 0,
  dealer_fees: 0,
  government_fees: 0,
  disposition_fee: 0,
  security_deposit: 0,
  // Sales tax is set by home address, not by deal — 9.625% is the fixed rate.
  tax_rate_percent: 9.625,
  tax_method: 'monthly' as TaxMethod,
  monthly_payment: 0,
  notes: '',
};

export function LeaseForm({ evs, initial, onCancel, onSaved, onEvCreated }: Props) {
  const [sourceUrl, setSourceUrl] = useState(initial?.source_url ?? '');
  const [scraping, setScraping] = useState(false);
  const [scrapeError, setScrapeError] = useState<string | null>(null);
  const [guess, setGuess] = useState<ScrapeGuess | null>(null);
  const [listingTitle, setListingTitle] = useState(initial?.listing_title ?? '');
  const [imageUrl, setImageUrl] = useState(initial?.image_url ?? '');

  const [evId, setEvId] = useState<number | ''>(initial?.ev_id ?? '');
  const [showCreateEV, setShowCreateEV] = useState(false);

  const [terms, setTerms] = useState(() => (initial ? extractTerms(initial) : emptyTerms));
  const [suggesting, setSuggesting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const suggestedEv = useMemo(() => {
    if (!guess || (!guess.year && !guess.make)) return null;
    return (
      evs.find(
        (e) =>
          (!guess.year || e.year === guess.year) &&
          (!guess.make || e.make.toLowerCase() === guess.make!.toLowerCase()) &&
          (!guess.model || e.model.toLowerCase().includes(guess.model!.toLowerCase()))
      ) || null
    );
  }, [guess, evs]);

  function setTerm<K extends keyof typeof emptyTerms>(key: K, value: (typeof emptyTerms)[K]) {
    setTerms((t) => ({ ...t, [key]: value }));
  }

  async function handleScrape() {
    if (!sourceUrl.trim()) return;
    setScraping(true);
    setScrapeError(null);
    try {
      const g = await api.scrape(sourceUrl.trim());
      setGuess(g);
      setListingTitle(g.listing_title || '');
      setImageUrl(g.image_url || '');
      if (g.msrp) setTerm('msrp', g.msrp);
      else if (g.price) setTerm('msrp', g.price);
    } catch (err) {
      setScrapeError(err instanceof Error ? err.message : String(err));
    } finally {
      setScraping(false);
    }
  }

  async function handleSuggestPayment() {
    setSuggesting(true);
    try {
      const result = await api.suggestPayment(terms);
      if (result.monthly_payment != null) setTerm('monthly_payment', result.monthly_payment);
      else setError('Not enough detail to suggest a payment — need selling price, residual %, and money factor.');
    } finally {
      setSuggesting(false);
    }
  }

  async function handleCreateEV(input: EVInput) {
    const ev = await api.createEV(input);
    const updated = await onEvCreated();
    void updated;
    setEvId(ev.id);
    setShowCreateEV(false);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!evId) {
      setError('Choose or create an EV for this lease');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const payload: LeaseInput = {
        ev_id: Number(evId),
        source_url: sourceUrl || null,
        listing_title: listingTitle || null,
        image_url: imageUrl || null,
        ...terms,
      };
      if (initial) {
        await api.updateLease(initial.id, payload);
      } else {
        await api.createLease(payload);
      }
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="modal wide" onClick={(e) => e.stopPropagation()}>
        <h2>{initial ? 'Edit Lease' : 'Add Lease'}</h2>
        <form onSubmit={handleSubmit}>
          <section>
            <h3>1. Listing</h3>
            <div className="url-row">
              <input
                placeholder="https://dealer.com/inventory/..."
                value={sourceUrl}
                onChange={(e) => setSourceUrl(e.target.value)}
              />
              <button type="button" onClick={handleScrape} disabled={scraping || !sourceUrl.trim()}>
                {scraping ? 'Scraping…' : 'Scrape'}
              </button>
            </div>
            {scrapeError && <div className="form-error">{scrapeError}</div>}
            {guess && <ScrapePreview guess={guess} />}
          </section>

          <section>
            <h3>2. Vehicle</h3>
            <div className="form-grid">
              <label className="span-2">
                EV
                <select value={evId} onChange={(e) => setEvId(e.target.value ? Number(e.target.value) : '')}>
                  <option value="">— choose —</option>
                  {evs.map((ev) => (
                    <option key={ev.id} value={ev.id}>
                      {evLabel(ev)}
                      {suggestedEv?.id === ev.id ? '  (suggested match)' : ''}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <button type="button" className="link" onClick={() => setShowCreateEV(true)}>
              + Create new EV{guess?.make ? ` (from "${guess.year ?? ''} ${guess.make ?? ''} ${guess.model ?? ''}")` : ''}
            </button>
          </section>

          <section>
            <h3>3. Cost &amp; program</h3>
            <div className="form-grid">
              <label>
                MSRP ($)
                <input type="number" value={terms.msrp} onChange={(e) => setTerm('msrp', Number(e.target.value))} />
              </label>
              <label>
                Selling price ($)
                <input
                  type="number"
                  value={terms.selling_price ?? ''}
                  onChange={(e) => setTerm('selling_price', e.target.value === '' ? null : Number(e.target.value))}
                />
              </label>
              <label>
                Term (months)
                <input
                  type="number"
                  value={terms.term_months}
                  onChange={(e) => setTerm('term_months', Number(e.target.value))}
                />
              </label>
              <label>
                Annual mileage
                <input
                  type="number"
                  value={terms.annual_mileage ?? ''}
                  onChange={(e) => setTerm('annual_mileage', e.target.value === '' ? null : Number(e.target.value))}
                />
              </label>
              <label>
                Residual (%)
                <input
                  type="number"
                  step="0.01"
                  value={terms.residual_percent ?? ''}
                  onChange={(e) => setTerm('residual_percent', e.target.value === '' ? null : Number(e.target.value))}
                />
              </label>
              <label>
                Money factor
                <input
                  type="number"
                  step="0.00001"
                  value={terms.money_factor ?? ''}
                  onChange={(e) => setTerm('money_factor', e.target.value === '' ? null : Number(e.target.value))}
                />
              </label>
            </div>
          </section>

          <section>
            <h3>4. Cap cost reductions</h3>
            <div className="form-grid">
              <label>
                Down payment ($)
                <input
                  type="number"
                  value={terms.down_payment}
                  onChange={(e) => setTerm('down_payment', Number(e.target.value))}
                />
              </label>
              <label>
                Trade-in equity ($)
                <input
                  type="number"
                  value={terms.trade_in_equity}
                  onChange={(e) => setTerm('trade_in_equity', Number(e.target.value))}
                />
              </label>
              <label>
                Taxed incentives ($)
                <input
                  type="number"
                  value={terms.taxed_incentives}
                  onChange={(e) => setTerm('taxed_incentives', Number(e.target.value))}
                />
              </label>
              <label>
                Untaxed incentives ($)
                <input
                  type="number"
                  value={terms.untaxed_incentives}
                  onChange={(e) => setTerm('untaxed_incentives', Number(e.target.value))}
                />
              </label>
            </div>
          </section>

          <section>
            <h3>5. Fees</h3>
            <div className="form-grid">
              <label>
                Acquisition fee ($)
                <input
                  type="number"
                  value={terms.acquisition_fee}
                  onChange={(e) => setTerm('acquisition_fee', Number(e.target.value))}
                />
              </label>
              <label>
                Dealer fees ($)
                <input
                  type="number"
                  value={terms.dealer_fees}
                  onChange={(e) => setTerm('dealer_fees', Number(e.target.value))}
                />
              </label>
              <label>
                Government fees ($)
                <input
                  type="number"
                  value={terms.government_fees}
                  onChange={(e) => setTerm('government_fees', Number(e.target.value))}
                />
              </label>
              <label>
                Disposition fee ($)
                <input
                  type="number"
                  value={terms.disposition_fee}
                  onChange={(e) => setTerm('disposition_fee', Number(e.target.value))}
                />
              </label>
              <label>
                Security deposit ($)
                <input
                  type="number"
                  value={terms.security_deposit}
                  onChange={(e) => setTerm('security_deposit', Number(e.target.value))}
                />
              </label>
            </div>
          </section>

          <section>
            <h3>6. Tax &amp; payment</h3>
            <div className="form-grid">
              <label>
                Tax rate (%)
                <input
                  type="number"
                  step="0.01"
                  value={terms.tax_rate_percent}
                  onChange={(e) => setTerm('tax_rate_percent', Number(e.target.value))}
                />
              </label>
              <label>
                Tax method
                <select value={terms.tax_method} onChange={(e) => setTerm('tax_method', e.target.value as TaxMethod)}>
                  <option value="monthly">Taxed monthly (most states)</option>
                  <option value="upfront">Taxed upfront on selling price</option>
                </select>
              </label>
              <label>
                Monthly payment ($, pre-tax)
                <input
                  type="number"
                  step="0.01"
                  value={terms.monthly_payment}
                  onChange={(e) => setTerm('monthly_payment', Number(e.target.value))}
                />
              </label>
            </div>
            <button type="button" className="link" onClick={handleSuggestPayment} disabled={suggesting}>
              {suggesting ? 'Calculating…' : 'Suggest payment from selling price / residual / MF'}
            </button>
          </section>

          <label>
            Notes
            <textarea value={terms.notes} onChange={(e) => setTerm('notes', e.target.value)} rows={2} />
          </label>

          {error && <div className="form-error">{error}</div>}

          <div className="form-actions">
            <button type="button" className="secondary" onClick={onCancel}>
              Cancel
            </button>
            <button type="submit" disabled={saving}>
              {saving ? 'Saving…' : 'Save lease'}
            </button>
          </div>
        </form>

        {showCreateEV && (
          <EVForm
            title="Create EV"
            initial={{
              year: guess?.year ?? new Date().getFullYear(),
              make: guess?.make ?? '',
              model: guess?.model ?? '',
              trim: guess?.trim ?? '',
            }}
            onCancel={() => setShowCreateEV(false)}
            onSave={handleCreateEV}
          />
        )}
      </div>
    </div>
  );
}

function extractTerms(lease: Lease): typeof emptyTerms {
  return {
    msrp: lease.msrp,
    selling_price: lease.selling_price,
    term_months: lease.term_months,
    annual_mileage: lease.annual_mileage,
    residual_percent: lease.residual_percent,
    money_factor: lease.money_factor,
    down_payment: lease.down_payment,
    trade_in_equity: lease.trade_in_equity,
    taxed_incentives: lease.taxed_incentives,
    untaxed_incentives: lease.untaxed_incentives,
    acquisition_fee: lease.acquisition_fee,
    dealer_fees: lease.dealer_fees,
    government_fees: lease.government_fees,
    disposition_fee: lease.disposition_fee,
    security_deposit: lease.security_deposit,
    tax_rate_percent: lease.tax_rate_percent,
    tax_method: lease.tax_method,
    monthly_payment: lease.monthly_payment,
    notes: lease.notes ?? '',
  };
}

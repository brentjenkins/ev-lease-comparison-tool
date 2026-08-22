import { useEffect, useMemo, useState } from 'react';
import { api } from '../api';
import type { EV, EVInput, Lease, LeaseInput, Make, ScrapeGuess, TaxMethod } from '../types';
import { ScrapePreview } from './ScrapePreview';
import { DealPicker } from './DealPicker';
import { EVForm, evLabel } from './EVForm';

interface Props {
  evs: EV[];
  makes: Make[];
  initial?: Lease;
  onCancel: () => void;
  onSaved: () => void;
  onEvCreated: () => Promise<EV[]>;
}

const money = (n: number) => `$${n.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;

// Number fields are `number | null` (not just `number`) so a cleared input can sit
// empty while the user retypes it — binding these directly to a number default
// makes Number('') snap back to 0 on every keystroke that passes through empty,
// which fights typing and makes the field feel "stuck". Coalesced back to a
// real number at submit time (see toPayload / suggestPayment).
const emptyTerms = {
  msrp: null as number | null,
  selling_price: null as number | null,
  term_months: 36 as number | null,
  annual_mileage: 10000 as number | null,
  // $0.20/mile is the typical excess-mileage rate, though it varies by deal.
  excess_mileage_fee: 0.2 as number | null,
  residual_value: null as number | null,
  money_factor: null as number | null,
  down_payment: null as number | null,
  manufacturer_incentives: null as number | null,
  dealer_incentives: null as number | null,
  untaxed_incentives: null as number | null,
  acquisition_fee: null as number | null,
  // Fixed CA fees — same regardless of dealer, though dealers label them differently.
  registration_fee: 536 as number | null,
  doc_fee: 85 as number | null,
  tire_fee: 7 as number | null,
  electronic_filing_fee: 33 as number | null,
  disposition_fee: null as number | null,
  security_deposit: null as number | null,
  // Sales tax is set by home address, not by deal — 9.625% is the fixed rate.
  tax_rate_percent: 9.625 as number | null,
  tax_method: 'monthly' as TaxMethod,
  monthly_payment: null as number | null,
  notes: '',
};

const ZERO_DEFAULT_FIELDS = [
  'msrp', 'down_payment', 'manufacturer_incentives', 'dealer_incentives', 'untaxed_incentives',
  'acquisition_fee', 'registration_fee', 'doc_fee', 'tire_fee', 'electronic_filing_fee',
  'disposition_fee', 'security_deposit', 'tax_rate_percent', 'monthly_payment',
] as const;

function toPayload(terms: typeof emptyTerms) {
  const out = { ...terms };
  for (const f of ZERO_DEFAULT_FIELDS) out[f] = out[f] ?? 0;
  out.term_months = out.term_months ?? 36;
  return out as typeof emptyTerms & Record<(typeof ZERO_DEFAULT_FIELDS)[number], number> & { term_months: number };
}

export function LeaseForm({ evs, makes, initial, onCancel, onSaved, onEvCreated }: Props) {
  const [sourceUrl, setSourceUrl] = useState(initial?.source_url ?? '');
  const [dealHint, setDealHint] = useState('');
  const [scraping, setScraping] = useState(false);
  const [scrapeError, setScrapeError] = useState<string | null>(null);
  const [guess, setGuess] = useState<ScrapeGuess | null>(null);
  // Set when a scrape finds multiple deals on the page, so the user can pick which one
  // applies. Cleared once a choice is made (or a fresh scrape resolves unambiguously).
  const [dealChoices, setDealChoices] = useState<ScrapeGuess[] | null>(null);
  const [listingTitle, setListingTitle] = useState(initial?.listing_title ?? '');
  const [imageUrl, setImageUrl] = useState(initial?.image_url ?? '');
  const [dealerName, setDealerName] = useState(initial?.dealer_name ?? '');
  const [expiresAt, setExpiresAt] = useState(initial?.expires_at ?? '');

  const [evId, setEvId] = useState<number | ''>(initial?.ev_id ?? '');
  const [showCreateEV, setShowCreateEV] = useState(false);

  const [terms, setTerms] = useState(() => (initial ? extractTerms(initial) : emptyTerms));
  const [suggesting, setSuggesting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedEv = useMemo(() => evs.find((e) => e.id === evId) ?? null, [evs, evId]);

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

  const residualPercent = useMemo(() => {
    if (!terms.residual_value || !terms.msrp) return null;
    return (terms.residual_value / terms.msrp) * 100;
  }, [terms.residual_value, terms.msrp]);

  const taxOnCcr = useMemo(() => {
    const ccr = (terms.down_payment ?? 0) + (terms.manufacturer_incentives ?? 0) + (terms.dealer_incentives ?? 0);
    const rate = (terms.tax_rate_percent ?? 0) / 100;
    return ccr * rate;
  }, [terms.down_payment, terms.manufacturer_incentives, terms.dealer_incentives, terms.tax_rate_percent]);

  // Mirrors leaseCalc.js's paymentWithTax/totalCustomerDown so the form shows the same
  // figures the lease will be saved with, without a round trip to the server.
  const paymentWithTax = useMemo(() => {
    const basePayment = terms.monthly_payment ?? 0;
    const rate = (terms.tax_rate_percent ?? 0) / 100;
    const monthlyTax = terms.tax_method !== 'upfront' ? basePayment * rate : 0;
    return basePayment + monthlyTax;
  }, [terms.monthly_payment, terms.tax_rate_percent, terms.tax_method]);

  const totalMoneyDown = useMemo(() => {
    return (terms.down_payment ?? 0) + (terms.acquisition_fee ?? 0) + paymentWithTax;
  }, [terms.down_payment, terms.acquisition_fee, paymentWithTax]);

  // The first month's payment is due at signing (folded into totalMoneyDown above), so
  // the remaining payments over the term are one fewer than term_months.
  const totalPayments = useMemo(() => {
    const remainingMonths = Math.max((terms.term_months ?? 0) - 1, 0);
    return paymentWithTax * remainingMonths;
  }, [paymentWithTax, terms.term_months]);

  function setTerm<K extends keyof typeof emptyTerms>(key: K, value: (typeof emptyTerms)[K]) {
    setTerms((t) => ({ ...t, [key]: value }));
  }

  // Every listing defaults its acquisition/disposition fees from its make's fee
  // schedule — only fills in fields still blank, so a scraped or manually-entered
  // figure for this specific deal is never overwritten.
  useEffect(() => {
    if (!evId) return;
    const ev = evs.find((e) => e.id === evId);
    if (!ev) return;
    const make = makes.find((m) => m.name.toLowerCase() === ev.make.toLowerCase());
    if (!make) return;
    setTerms((t) => ({
      ...t,
      acquisition_fee: t.acquisition_fee ?? make.acquisition_fee,
      disposition_fee: t.disposition_fee ?? make.disposition_fee,
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [evId]);

  function applyGuess(g: ScrapeGuess) {
    setGuess(g);
    setListingTitle(g.listing_title || '');
    setImageUrl(g.image_url || '');
    setDealerName(g.dealer_name || '');
    setExpiresAt(g.expires_at || '');
    if (g.msrp) setTerm('msrp', g.msrp);
    else if (g.price) setTerm('msrp', g.price);
    // Deal terms pulled from the ad's fine print — best-effort, still editable below.
    if (g.monthly_payment) setTerm('monthly_payment', g.monthly_payment);
    if (g.down_payment) setTerm('down_payment', g.down_payment);
    if (g.acquisition_fee) setTerm('acquisition_fee', g.acquisition_fee);
    // Fine-print incentives are almost always the manufacturer's lease cash, not a
    // dealer-specific discount — dealer incentives are rarely itemized in ad copy.
    if (g.incentive) setTerm('manufacturer_incentives', g.incentive);
    if (g.annual_mileage) setTerm('annual_mileage', g.annual_mileage);
    if (g.excess_mileage_fee) setTerm('excess_mileage_fee', g.excess_mileage_fee);
    if (g.term_months) setTerm('term_months', g.term_months);
    if (g.residual_value) setTerm('residual_value', g.residual_value);
    if (g.money_factor) setTerm('money_factor', g.money_factor);
    if (g.security_deposit != null) setTerm('security_deposit', g.security_deposit);
  }

  function handlePickDeal(g: ScrapeGuess) {
    applyGuess(g);
    setDealChoices(null);
  }

  async function handleScrape() {
    if (!sourceUrl.trim()) return;
    setScraping(true);
    setScrapeError(null);
    setDealChoices(null);
    try {
      const { deals, matchedIndex } = await api.scrape(sourceUrl.trim(), dealHint.trim() || undefined);
      if (deals.length > 1) {
        // Multiple deals on the page. If the hint matched one confidently, apply it but
        // still surface the full list in case the match is wrong; otherwise wait for a pick.
        setDealChoices(deals);
        if (matchedIndex != null) applyGuess(deals[matchedIndex]);
        else setGuess(null);
      } else {
        applyGuess(deals[0]);
      }
    } catch (err) {
      setScrapeError(err instanceof Error ? err.message : String(err));
    } finally {
      setScraping(false);
    }
  }

  async function handleSuggestPayment() {
    setSuggesting(true);
    try {
      const result = await api.suggestPayment(toPayload(terms));
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
        dealer_name: dealerName || null,
        expires_at: expiresAt || null,
        ...toPayload(terms),
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
            <input
              className="deal-hint-input"
              placeholder="Deal (optional) — e.g. 2026 Ioniq 9 SEL AWD, for pages listing several deals"
              value={dealHint}
              onChange={(e) => setDealHint(e.target.value)}
            />
            <label className="expires-label">
              Offer expires
              <input type="date" className="expires-input" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} />
            </label>
            {scrapeError && <div className="form-error">{scrapeError}</div>}
            {dealChoices && dealChoices.length > 1 && (
              <DealPicker deals={dealChoices} selected={guess} onPick={handlePickDeal} />
            )}
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
                {selectedEv?.msrp != null && (
                  <span className="computed-hint">Base MSRP: {money(selectedEv.msrp)}</span>
                )}
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
                As equipped MSRP ($)
                <input type="number" value={terms.msrp ?? ''} onChange={(e) => setTerm('msrp', e.target.value === '' ? null : Number(e.target.value))} />
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
                Monthly payment ($, pre-tax)
                <input
                  type="number"
                  step="0.01"
                  value={terms.monthly_payment ?? ''}
                  onChange={(e) => setTerm('monthly_payment', e.target.value === '' ? null : Number(e.target.value))}
                />
              </label>
              <label>
                Term (months)
                <input
                  type="number"
                  value={terms.term_months ?? ''}
                  onChange={(e) => setTerm('term_months', e.target.value === '' ? null : Number(e.target.value))}
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
                $/mile over limit
                <input
                  type="number"
                  step="0.01"
                  value={terms.excess_mileage_fee ?? ''}
                  onChange={(e) => setTerm('excess_mileage_fee', e.target.value === '' ? null : Number(e.target.value))}
                />
              </label>
              <label>
                Residual value ($)
                <input
                  type="number"
                  value={terms.residual_value ?? ''}
                  onChange={(e) => setTerm('residual_value', e.target.value === '' ? null : Number(e.target.value))}
                />
                {residualPercent != null && (
                  <span className="computed-hint">= {residualPercent.toFixed(1)}% of MSRP</span>
                )}
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
            <button type="button" className="link" onClick={handleSuggestPayment} disabled={suggesting}>
              {suggesting ? 'Calculating…' : 'Suggest payment from selling price / residual / MF'}
            </button>
          </section>

          <section>
            <h3>4. Cap cost reductions</h3>
            <div className="form-grid">
              <label>
                Down payment ($)
                <input
                  type="number"
                  value={terms.down_payment ?? ''}
                  onChange={(e) => setTerm('down_payment', e.target.value === '' ? null : Number(e.target.value))}
                />
              </label>
              <label>
                Manufacturer incentives ($)
                <input
                  type="number"
                  value={terms.manufacturer_incentives ?? ''}
                  onChange={(e) => setTerm('manufacturer_incentives', e.target.value === '' ? null : Number(e.target.value))}
                />
              </label>
              <label>
                Dealer incentives ($)
                <input
                  type="number"
                  value={terms.dealer_incentives ?? ''}
                  onChange={(e) => setTerm('dealer_incentives', e.target.value === '' ? null : Number(e.target.value))}
                />
              </label>
              <label>
                Untaxed incentives ($)
                <input
                  type="number"
                  value={terms.untaxed_incentives ?? ''}
                  onChange={(e) => setTerm('untaxed_incentives', e.target.value === '' ? null : Number(e.target.value))}
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
                  value={terms.acquisition_fee ?? ''}
                  onChange={(e) => setTerm('acquisition_fee', e.target.value === '' ? null : Number(e.target.value))}
                />
              </label>
              <label>
                Registration ($)
                <input
                  type="number"
                  value={terms.registration_fee ?? ''}
                  onChange={(e) => setTerm('registration_fee', e.target.value === '' ? null : Number(e.target.value))}
                />
              </label>
              <label>
                Document processing charge ($)
                <input
                  type="number"
                  value={terms.doc_fee ?? ''}
                  onChange={(e) => setTerm('doc_fee', e.target.value === '' ? null : Number(e.target.value))}
                />
              </label>
              <label>
                California tire fee ($)
                <input
                  type="number"
                  value={terms.tire_fee ?? ''}
                  onChange={(e) => setTerm('tire_fee', e.target.value === '' ? null : Number(e.target.value))}
                />
              </label>
              <label>
                Electronic registration charge ($)
                <input
                  type="number"
                  value={terms.electronic_filing_fee ?? ''}
                  onChange={(e) => setTerm('electronic_filing_fee', e.target.value === '' ? null : Number(e.target.value))}
                />
              </label>
              <label>
                Disposition fee ($)
                <input
                  type="number"
                  value={terms.disposition_fee ?? ''}
                  onChange={(e) => setTerm('disposition_fee', e.target.value === '' ? null : Number(e.target.value))}
                />
              </label>
              <label>
                Security deposit ($)
                <input
                  type="number"
                  value={terms.security_deposit ?? ''}
                  onChange={(e) => setTerm('security_deposit', e.target.value === '' ? null : Number(e.target.value))}
                />
              </label>
            </div>
          </section>

          <section>
            <h3>6. Tax</h3>
            <div className="form-grid">
              <label>
                Tax rate (%)
                <input
                  type="number"
                  step="0.01"
                  value={terms.tax_rate_percent ?? ''}
                  onChange={(e) => setTerm('tax_rate_percent', e.target.value === '' ? null : Number(e.target.value))}
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
                Tax on CCR (down payment + incentives, taxed upfront)
                <input type="text" disabled value={money(taxOnCcr)} />
              </label>
              <label>
                Total money down
                <input type="text" disabled value={money(totalMoneyDown)} />
              </label>
              <label>
                Monthly payment (with tax)
                <input type="text" disabled value={`${money(paymentWithTax)}/mo`} />
              </label>
              <label>
                Total payments (term, minus first payment)
                <input type="text" disabled value={money(totalPayments)} />
              </label>
            </div>
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
    excess_mileage_fee: lease.excess_mileage_fee,
    residual_value: lease.residual_value,
    money_factor: lease.money_factor,
    down_payment: lease.down_payment,
    manufacturer_incentives: lease.manufacturer_incentives,
    dealer_incentives: lease.dealer_incentives,
    untaxed_incentives: lease.untaxed_incentives,
    acquisition_fee: lease.acquisition_fee,
    registration_fee: lease.registration_fee,
    doc_fee: lease.doc_fee,
    tire_fee: lease.tire_fee,
    electronic_filing_fee: lease.electronic_filing_fee,
    disposition_fee: lease.disposition_fee,
    security_deposit: lease.security_deposit,
    tax_rate_percent: lease.tax_rate_percent,
    tax_method: lease.tax_method,
    monthly_payment: lease.monthly_payment,
    notes: lease.notes ?? '',
  };
}

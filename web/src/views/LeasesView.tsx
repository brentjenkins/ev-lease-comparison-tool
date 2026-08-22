import { useEffect, useState } from 'react';
import { api } from '../api';
import type { EV, Lease, Make } from '../types';
import { SortableTable, type Column } from '../components/SortableTable';
import { LeaseForm } from '../components/LeaseForm';
import { evLabel } from '../components/EVForm';
import { numericRange, scoreGradient } from '../lib/colorScale';

const money = (n: number | null) => (n == null ? '—' : `$${n.toLocaleString(undefined, { maximumFractionDigits: 0 })}`);
const years = (n: number | null) => (n == null ? '—' : `${n.toFixed(1)} yr`);

// Leases scraped before dealer_name was captured (or entered by hand without it) fall
// back to the bare hostname, so the link still reads as "who" rather than just "Listing".
function dealerLabel(l: Lease): string | null {
  if (l.dealer_name) return l.dealer_name;
  if (!l.source_url) return null;
  try {
    return new URL(l.source_url).hostname.replace(/^www\./, '');
  } catch {
    return null;
  }
}

// expires_at is stored as an ISO date (YYYY-MM-DD); build the local date from parts
// rather than `new Date(iso)` so it doesn't shift a day in negative-UTC timezones.
function formatExpiry(iso: string | null): string {
  if (!iso) return '—';
  const [y, m, d] = iso.split('-').map(Number);
  if (!y || !m || !d) return iso;
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function isExpired(iso: string | null): boolean {
  if (!iso) return false;
  const today = new Date();
  const todayIso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  return iso < todayIso;
}

export function LeasesView() {
  const [leases, setLeases] = useState<Lease[]>([]);
  const [evs, setEvs] = useState<EV[]>([]);
  const [makes, setMakes] = useState<Make[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Lease | null>(null);
  const [expanded, setExpanded] = useState<Lease | null>(null);

  useEffect(() => {
    refresh();
  }, []);

  async function refresh() {
    setLoading(true);
    try {
      const [l, e, m] = await Promise.all([api.listLeases(), api.listEVs(), api.listMakes()]);
      setLeases(l);
      setEvs(e);
      setMakes(m);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  async function refreshEvs() {
    const e = await api.listEVs();
    setEvs(e);
    return e;
  }

  async function handleDelete(lease: Lease) {
    if (!confirm(`Delete this lease on ${lease.ev ? evLabel(lease.ev) : 'this vehicle'}?`)) return;
    await api.deleteLease(lease.id);
    if (expanded?.id === lease.id) setExpanded(null);
    await refresh();
  }

  const [effMin, effMax] = numericRange(leases.map((l) => l.metrics.effectiveMonthlyCost));
  const [yrsMin, yrsMax] = numericRange(leases.map((l) => l.metrics.yearsToMsrp));
  const [scoreMin, scoreMax] = numericRange(leases.map((l) => l.ev?.score));
  const [residualMin, residualMax] = numericRange(leases.map((l) => l.metrics.residualPercent));

  const columns: Column<Lease>[] = [
    { key: 'ev', label: 'Vehicle', accessor: (l) => (l.ev ? evLabel(l.ev) : `EV #${l.ev_id}`) },
    {
      key: 'score',
      label: 'Score',
      accessor: (l) => l.ev?.score ?? null,
      align: 'right',
      cellStyle: (l) => scoreGradient(l.ev?.score, scoreMin, scoreMax),
    },
    { key: 'msrp', label: 'MSRP', accessor: (l) => l.msrp, render: (l) => money(l.msrp), align: 'right' },
    { key: 'term_months', label: 'Term', accessor: (l) => l.term_months, render: (l) => `${l.term_months} mo`, align: 'right' },
    {
      key: 'incentives',
      label: 'Incentives',
      accessor: (l) => l.manufacturer_incentives + l.dealer_incentives + l.untaxed_incentives,
      render: (l) => money(l.manufacturer_incentives + l.dealer_incentives + l.untaxed_incentives),
      align: 'right',
    },
    { key: 'down_payment', label: 'Down', accessor: (l) => l.down_payment, render: (l) => money(l.down_payment), align: 'right' },
    {
      key: 'monthly_payment',
      label: 'Payment',
      accessor: (l) => l.metrics.basePayment,
      render: (l) => `${money(l.metrics.basePayment)}/mo`,
      align: 'right',
    },
    {
      key: 'annual_mileage',
      label: 'Miles/yr',
      accessor: (l) => l.annual_mileage,
      render: (l) => (l.annual_mileage == null ? '—' : l.annual_mileage.toLocaleString()),
      align: 'right',
    },
    {
      key: 'totalCost',
      label: 'Total',
      accessor: (l) => l.metrics.totalCost,
      render: (l) => money(l.metrics.totalCost),
      align: 'right',
    },
    {
      key: 'residualPercent',
      label: 'Residual %',
      accessor: (l) => l.metrics.residualPercent,
      render: (l) => (l.metrics.residualPercent == null ? '—' : `${l.metrics.residualPercent.toFixed(1)}%`),
      align: 'right',
      cellStyle: (l) => scoreGradient(l.metrics.residualPercent, residualMin, residualMax),
    },
    {
      key: 'effectiveMonthlyCost',
      label: 'Eff $/mo',
      accessor: (l) => l.metrics.effectiveMonthlyCost,
      render: (l) => money(l.metrics.effectiveMonthlyCost),
      align: 'right',
      // Lower effective cost is better, so the gradient is inverted.
      cellStyle: (l) => scoreGradient(l.metrics.effectiveMonthlyCost, effMin, effMax, true),
    },
    {
      key: 'yearsToMsrp',
      label: 'Yrs/MSRP',
      accessor: (l) => l.metrics.yearsToMsrp,
      render: (l) => years(l.metrics.yearsToMsrp),
      align: 'right',
      cellStyle: (l) => scoreGradient(l.metrics.yearsToMsrp, yrsMin, yrsMax),
    },
    {
      key: 'expires_at',
      label: 'Expires',
      accessor: (l) => l.expires_at,
      render: (l) => <span className={isExpired(l.expires_at) ? 'expired' : undefined}>{formatExpiry(l.expires_at)}</span>,
    },
    {
      key: 'actions',
      label: '',
      accessor: () => null,
      render: (l) => (
        <div className="row-actions">
          {l.source_url && (
            <a className="link" href={l.source_url} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}>
              {dealerLabel(l) ?? 'Listing'}
            </a>
          )}
          <button
            className="link"
            onClick={(e) => {
              e.stopPropagation();
              setEditing(l);
            }}
          >
            Edit
          </button>
          <button
            className="link danger"
            onClick={(e) => {
              e.stopPropagation();
              handleDelete(l);
            }}
          >
            Delete
          </button>
        </div>
      ),
    },
  ];

  return (
    <div>
      <div className="view-header">
        <h1>Leases</h1>
        <button onClick={() => setShowForm(true)}>+ Add Lease</button>
      </div>

      {error && <div className="form-error">{error}</div>}
      {loading ? (
        <p>Loading…</p>
      ) : (
        <SortableTable
          columns={columns}
          rows={leases}
          rowKey={(l) => l.id}
          defaultSortKey="yearsToMsrp"
          defaultSortDir="desc"
          onRowClick={(l) => setExpanded(expanded?.id === l.id ? null : l)}
          emptyMessage="No leases yet — add one by pasting a listing link."
        />
      )}

      {expanded && <LeaseDetail lease={expanded} onClose={() => setExpanded(null)} />}

      {showForm && (
        <LeaseForm
          evs={evs}
          makes={makes}
          onCancel={() => setShowForm(false)}
          onSaved={() => {
            setShowForm(false);
            refresh();
          }}
          onEvCreated={refreshEvs}
        />
      )}
      {editing && (
        <LeaseForm
          evs={evs}
          makes={makes}
          initial={editing}
          onCancel={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            refresh();
          }}
          onEvCreated={refreshEvs}
        />
      )}
    </div>
  );
}

function LeaseDetail({ lease, onClose }: { lease: Lease; onClose: () => void }) {
  const m = lease.metrics;
  return (
    <div className="detail-panel">
      <div className="detail-header">
        <h3>{lease.ev ? evLabel(lease.ev) : `EV #${lease.ev_id}`}</h3>
        <button className="link" onClick={onClose}>
          Close
        </button>
      </div>
      <div className="detail-grid">
        <div>
          <span className="label">Residual</span>
          <span>
            {money(lease.residual_value)}
            {m.residualPercent != null ? ` (${m.residualPercent.toFixed(1)}%)` : ''}
          </span>
        </div>
        <div>
          <span className="label">Due at signing</span>
          <span>{money(m.dueAtSigning)}</span>
        </div>
        <div>
          <span className="label">Total customer down</span>
          <span>{money(m.totalCustomerDown)}</span>
        </div>
        <div>
          <span className="label">Payment (with tax)</span>
          <span>{money(m.paymentWithTax)}/mo</span>
        </div>
        <div>
          <span className="label">Tax on CCR</span>
          <span>{money(m.taxOnCcr)}</span>
        </div>
        <div>
          <span className="label">Total taxes paid</span>
          <span>{money(m.totalTaxesPaid)}</span>
        </div>
        <div>
          <span className="label">Total cost of lease</span>
          <span>{money(m.totalCost)}</span>
        </div>
        <div>
          <span className="label">Effective $/mo</span>
          <span>{money(m.effectiveMonthlyCost)}</span>
        </div>
        <div>
          <span className="label">Years to MSRP</span>
          <span>{years(m.yearsToMsrp)}</span>
        </div>
      </div>

      <h4>Total cost by month</h4>
      <div className="month-scroll">
        <table className="month-table">
          <thead>
            <tr>
              {m.totalCostByMonth.map((_, i) => (
                <th key={i}>{i + 1}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr>
              {m.totalCostByMonth.map((v, i) => (
                <td key={i}>{money(v)}</td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>

      {lease.notes && (
        <>
          <h4>Notes</h4>
          <p>{lease.notes}</p>
        </>
      )}
    </div>
  );
}

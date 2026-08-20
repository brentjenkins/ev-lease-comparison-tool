import { useEffect, useState } from 'react';
import { api } from '../api';
import type { EV, Lease } from '../types';
import { SortableTable, type Column } from '../components/SortableTable';
import { LeaseForm } from '../components/LeaseForm';
import { evLabel } from '../components/EVForm';

const money = (n: number | null) => (n == null ? '—' : `$${n.toLocaleString(undefined, { maximumFractionDigits: 0 })}`);
const years = (n: number | null) => (n == null ? '—' : `${n.toFixed(1)} yr`);

export function LeasesView() {
  const [leases, setLeases] = useState<Lease[]>([]);
  const [evs, setEvs] = useState<EV[]>([]);
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
      const [l, e] = await Promise.all([api.listLeases(), api.listEVs()]);
      setLeases(l);
      setEvs(e);
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

  const columns: Column<Lease>[] = [
    { key: 'ev', label: 'Vehicle', accessor: (l) => (l.ev ? evLabel(l.ev) : `EV #${l.ev_id}`) },
    { key: 'selling_price', label: 'Selling price', accessor: (l) => l.selling_price, render: (l) => money(l.selling_price), align: 'right' },
    { key: 'term_months', label: 'Term', accessor: (l) => l.term_months, render: (l) => `${l.term_months} mo`, align: 'right' },
    {
      key: 'monthly_payment',
      label: 'Payment',
      accessor: (l) => l.metrics.paymentWithTax,
      render: (l) => `${money(l.metrics.paymentWithTax)}/mo`,
      align: 'right',
    },
    {
      key: 'totalCost',
      label: 'Total cost',
      accessor: (l) => l.metrics.totalCost,
      render: (l) => money(l.metrics.totalCost),
      align: 'right',
    },
    {
      key: 'effectiveMonthlyCost',
      label: 'Effective $/mo',
      accessor: (l) => l.metrics.effectiveMonthlyCost,
      render: (l) => money(l.metrics.effectiveMonthlyCost),
      align: 'right',
    },
    {
      key: 'yearsToMsrp',
      label: 'Years to MSRP',
      accessor: (l) => l.metrics.yearsToMsrp,
      render: (l) => years(l.metrics.yearsToMsrp),
      align: 'right',
    },
    {
      key: 'actions',
      label: '',
      accessor: () => null,
      render: (l) => (
        <div className="row-actions">
          {l.source_url && (
            <a className="link" href={l.source_url} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}>
              Listing
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
          <span className="label">Due at signing</span>
          <span>{money(m.dueAtSigning)}</span>
        </div>
        <div>
          <span className="label">Payment (with tax)</span>
          <span>{money(m.paymentWithTax)}/mo</span>
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

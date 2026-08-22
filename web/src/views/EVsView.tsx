import { useEffect, useState } from 'react';
import { api } from '../api';
import type { EV, EVInput } from '../types';
import { SortableTable, type Column } from '../components/SortableTable';
import { EVForm } from '../components/EVForm';
import { numericRange, scoreGradient } from '../lib/colorScale';

const YES = '✓';
const NO = '';
const money = (n: number | null) => (n == null ? '—' : `$${n.toLocaleString(undefined, { maximumFractionDigits: 0 })}`);

export function EVsView() {
  const [evs, setEvs] = useState<EV[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<EV | null>(null);

  useEffect(() => {
    refresh();
  }, []);

  async function refresh() {
    setLoading(true);
    try {
      setEvs(await api.listEVs());
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  async function handleCreate(input: EVInput) {
    await api.createEV(input);
    setShowForm(false);
    await refresh();
  }

  async function handleUpdate(input: EVInput) {
    if (!editing) return;
    await api.updateEV(editing.id, input);
    setEditing(null);
    await refresh();
  }

  async function handleDelete(ev: EV) {
    if (!confirm(`Delete ${ev.year} ${ev.make} ${ev.model} ${ev.trim ?? ''}? Any leases linked to it will also be removed.`)) return;
    await api.deleteEV(ev.id);
    await refresh();
  }

  const [scoreMin, scoreMax] = numericRange(evs.map((e) => e.score));

  const columns: Column<EV>[] = [
    { key: 'year', label: 'Year', accessor: (e) => e.year },
    { key: 'make', label: 'Make', accessor: (e) => e.make },
    { key: 'model', label: 'Model', accessor: (e) => e.model },
    { key: 'trim', label: 'Trim', accessor: (e) => e.trim },
    { key: 'msrp', label: 'MSRP', accessor: (e) => e.msrp, render: (e) => money(e.msrp), align: 'right' },
    { key: 'seats', label: 'Seats', accessor: (e) => e.seats, align: 'right' },
    { key: 'range_miles', label: 'Range (mi)', accessor: (e) => e.range_miles, align: 'right' },
    { key: 'awd', label: 'AWD', accessor: (e) => (e.awd ? 1 : 0), render: (e) => (e.awd ? YES : NO) },
    {
      key: 'powered_liftgate',
      label: 'Liftgate',
      accessor: (e) => (e.powered_liftgate ? 1 : 0),
      render: (e) => (e.powered_liftgate ? YES : NO),
    },
    {
      key: 'heated_seats',
      label: 'Heated',
      accessor: (e) => (e.heated_seats ? 1 : 0),
      render: (e) => (e.heated_seats ? YES : NO),
    },
    {
      key: 'cooled_seats',
      label: 'Cooled',
      accessor: (e) => (e.cooled_seats ? 1 : 0),
      render: (e) => (e.cooled_seats ? YES : NO),
    },
    {
      key: 'charging_800v',
      label: '800V',
      accessor: (e) => (e.charging_800v ? 1 : 0),
      render: (e) => (e.charging_800v ? YES : NO),
    },
    {
      key: 'score',
      label: 'Score',
      accessor: (e) => e.score,
      align: 'right',
      cellStyle: (e) => scoreGradient(e.score, scoreMin, scoreMax),
    },
    {
      key: 'actions',
      label: '',
      accessor: () => null,
      render: (e) => (
        <div className="row-actions">
          <button className="link" onClick={() => setEditing(e)}>
            Edit
          </button>
          <button className="link danger" onClick={() => handleDelete(e)}>
            Delete
          </button>
        </div>
      ),
    },
  ];

  return (
    <div>
      <div className="view-header">
        <h1>EVs</h1>
        <button onClick={() => setShowForm(true)}>+ Add EV</button>
      </div>

      {error && <div className="form-error">{error}</div>}
      {loading ? (
        <p>Loading…</p>
      ) : (
        <SortableTable
          columns={columns}
          rows={evs}
          rowKey={(e) => e.id}
          defaultSortKey="year"
          defaultSortDir="desc"
          emptyMessage="No EVs yet — add one, or add a lease and create one on the fly."
        />
      )}

      {showForm && <EVForm title="Add EV" onCancel={() => setShowForm(false)} onSave={handleCreate} />}
      {editing && (
        <EVForm title="Edit EV" initial={editing} onCancel={() => setEditing(null)} onSave={handleUpdate} />
      )}
    </div>
  );
}

import { useEffect, useState } from 'react';
import { api } from '../api';
import type { Make, MakeInput } from '../types';
import { SortableTable, type Column } from '../components/SortableTable';
import { MakeForm } from '../components/MakeForm';

const money = (n: number) => `$${n.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;

export function MakesView() {
  const [makes, setMakes] = useState<Make[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Make | null>(null);

  useEffect(() => {
    refresh();
  }, []);

  async function refresh() {
    setLoading(true);
    try {
      setMakes(await api.listMakes());
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  async function handleCreate(input: MakeInput) {
    await api.createMake(input);
    setShowForm(false);
    await refresh();
  }

  async function handleUpdate(input: MakeInput) {
    if (!editing) return;
    await api.updateMake(editing.id, input);
    setEditing(null);
    await refresh();
  }

  async function handleDelete(make: Make) {
    if (!confirm(`Delete ${make.name}? Leases already using its fees keep their saved values.`)) return;
    await api.deleteMake(make.id);
    await refresh();
  }

  const columns: Column<Make>[] = [
    { key: 'name', label: 'Make', accessor: (m) => m.name },
    {
      key: 'acquisition_fee',
      label: 'Acquisition / bank fee',
      accessor: (m) => m.acquisition_fee,
      render: (m) => money(m.acquisition_fee),
      align: 'right',
    },
    {
      key: 'disposition_fee',
      label: 'Disposition fee',
      accessor: (m) => m.disposition_fee,
      render: (m) => money(m.disposition_fee),
      align: 'right',
    },
    {
      key: 'actions',
      label: '',
      accessor: () => null,
      render: (m) => (
        <div className="row-actions">
          <button className="link" onClick={() => setEditing(m)}>
            Edit
          </button>
          <button className="link danger" onClick={() => handleDelete(m)}>
            Delete
          </button>
        </div>
      ),
    },
  ];

  return (
    <div>
      <div className="view-header">
        <h1>Makes</h1>
        <button onClick={() => setShowForm(true)}>+ Add Make</button>
      </div>

      <p className="hint">
        New leases default their acquisition and disposition fees from the vehicle's make, seeded from
        LeaseHackr's calculator. Edit a make here if a fee schedule changes.
      </p>

      {error && <div className="form-error">{error}</div>}
      {loading ? (
        <p>Loading…</p>
      ) : (
        <SortableTable
          columns={columns}
          rows={makes}
          rowKey={(m) => m.id}
          defaultSortKey="name"
          emptyMessage="No makes yet."
        />
      )}

      {showForm && <MakeForm title="Add Make" onCancel={() => setShowForm(false)} onSave={handleCreate} />}
      {editing && (
        <MakeForm title="Edit Make" initial={editing} onCancel={() => setEditing(null)} onSave={handleUpdate} />
      )}
    </div>
  );
}

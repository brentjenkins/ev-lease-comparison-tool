import { useState } from 'react';
import type { EV, EVInput } from '../types';

interface Props {
  initial?: Partial<EVInput>;
  onCancel: () => void;
  onSave: (input: EVInput) => Promise<void>;
  title: string;
}

const empty: EVInput = {
  year: new Date().getFullYear(),
  make: '',
  model: '',
  trim: '',
  seats: null,
  range_miles: null,
  awd: false,
  powered_liftgate: false,
  heated_seats: false,
  cooled_seats: false,
  notes: '',
};

export function EVForm({ initial, onCancel, onSave, title }: Props) {
  const [form, setForm] = useState<EVInput>({ ...empty, ...initial });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function set<K extends keyof EVInput>(key: K, value: EVInput[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.make.trim() || !form.model.trim()) {
      setError('Make and model are required');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onSave(form);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>{title}</h2>
        <form onSubmit={handleSubmit}>
          <div className="form-grid">
            <label>
              Year
              <input type="number" required value={form.year} onChange={(e) => set('year', Number(e.target.value))} />
            </label>
            <label>
              Make
              <input required value={form.make} onChange={(e) => set('make', e.target.value)} />
            </label>
            <label>
              Model
              <input required value={form.model} onChange={(e) => set('model', e.target.value)} />
            </label>
            <label>
              Trim
              <input value={form.trim ?? ''} onChange={(e) => set('trim', e.target.value)} />
            </label>
            <label>
              Seats
              <input
                type="number"
                value={form.seats ?? ''}
                onChange={(e) => set('seats', e.target.value === '' ? null : Number(e.target.value))}
              />
            </label>
            <label>
              Range (miles)
              <input
                type="number"
                value={form.range_miles ?? ''}
                onChange={(e) => set('range_miles', e.target.value === '' ? null : Number(e.target.value))}
              />
            </label>
          </div>

          <div className="checkbox-row">
            <label className="checkbox">
              <input type="checkbox" checked={form.awd} onChange={(e) => set('awd', e.target.checked)} />
              AWD
            </label>
            <label className="checkbox">
              <input
                type="checkbox"
                checked={form.powered_liftgate}
                onChange={(e) => set('powered_liftgate', e.target.checked)}
              />
              Powered liftgate
            </label>
            <label className="checkbox">
              <input
                type="checkbox"
                checked={form.heated_seats}
                onChange={(e) => set('heated_seats', e.target.checked)}
              />
              Heated seats
            </label>
            <label className="checkbox">
              <input
                type="checkbox"
                checked={form.cooled_seats}
                onChange={(e) => set('cooled_seats', e.target.checked)}
              />
              Cooled seats
            </label>
          </div>

          <label>
            Notes
            <textarea value={form.notes ?? ''} onChange={(e) => set('notes', e.target.value)} rows={2} />
          </label>

          {error && <div className="form-error">{error}</div>}

          <div className="form-actions">
            <button type="button" className="secondary" onClick={onCancel}>
              Cancel
            </button>
            <button type="submit" disabled={saving}>
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export function evLabel(ev: Pick<EV, 'year' | 'make' | 'model' | 'trim'>) {
  return [ev.year, ev.make, ev.model, ev.trim].filter(Boolean).join(' ');
}

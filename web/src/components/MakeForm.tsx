import { useState } from 'react';
import type { MakeInput } from '../types';
import { blockEnterSubmit } from '../lib/formGuards';

interface Props {
  initial?: Partial<MakeInput>;
  onCancel: () => void;
  onSave: (input: MakeInput) => Promise<void>;
  title: string;
}

const empty: MakeInput = {
  name: '',
  acquisition_fee: 0,
  disposition_fee: 0,
};

export function MakeForm({ initial, onCancel, onSave, title }: Props) {
  const [form, setForm] = useState<MakeInput>({ ...empty, ...initial });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function set<K extends keyof MakeInput>(key: K, value: MakeInput[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) {
      setError('Name is required');
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
        <form onSubmit={handleSubmit} onKeyDown={blockEnterSubmit}>
          <div className="form-grid">
            <label className="span-2">
              Make
              <input required value={form.name} onChange={(e) => set('name', e.target.value)} />
            </label>
            <label>
              Acquisition / bank fee ($)
              <input
                type="number"
                value={form.acquisition_fee}
                onChange={(e) => set('acquisition_fee', Number(e.target.value))}
              />
            </label>
            <label>
              Disposition fee ($)
              <input
                type="number"
                value={form.disposition_fee}
                onChange={(e) => set('disposition_fee', Number(e.target.value))}
              />
            </label>
          </div>

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

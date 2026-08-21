import type { EV, EVInput, Lease, LeaseInput, Make, MakeInput, ScrapeGuess } from './types';

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...init,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Request failed: ${res.status}`);
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

export const api = {
  listEVs: () => request<EV[]>('/evs'),
  createEV: (input: EVInput) => request<EV>('/evs', { method: 'POST', body: JSON.stringify(input) }),
  updateEV: (id: number, input: Partial<EVInput>) =>
    request<EV>(`/evs/${id}`, { method: 'PUT', body: JSON.stringify(input) }),
  deleteEV: (id: number) => request<void>(`/evs/${id}`, { method: 'DELETE' }),

  listLeases: () => request<Lease[]>('/leases'),
  createLease: (input: LeaseInput) => request<Lease>('/leases', { method: 'POST', body: JSON.stringify(input) }),
  updateLease: (id: number, input: Partial<LeaseInput>) =>
    request<Lease>(`/leases/${id}`, { method: 'PUT', body: JSON.stringify(input) }),
  deleteLease: (id: number) => request<void>(`/leases/${id}`, { method: 'DELETE' }),
  suggestPayment: (input: Partial<LeaseInput>) =>
    request<{ monthly_payment: number | null }>('/leases/suggest-payment', {
      method: 'POST',
      body: JSON.stringify(input),
    }),

  scrape: (url: string) => request<ScrapeGuess>('/scrape', { method: 'POST', body: JSON.stringify({ url }) }),

  listMakes: () => request<Make[]>('/makes'),
  createMake: (input: MakeInput) => request<Make>('/makes', { method: 'POST', body: JSON.stringify(input) }),
  updateMake: (id: number, input: Partial<MakeInput>) =>
    request<Make>(`/makes/${id}`, { method: 'PUT', body: JSON.stringify(input) }),
  deleteMake: (id: number) => request<void>(`/makes/${id}`, { method: 'DELETE' }),
};

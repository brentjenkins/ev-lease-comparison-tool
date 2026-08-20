import { useState } from 'react';
import { EVsView } from './views/EVsView';
import { LeasesView } from './views/LeasesView';

type Tab = 'evs' | 'leases';

export default function App() {
  const [tab, setTab] = useState<Tab>('leases');

  return (
    <div className="app">
      <nav className="tabs">
        <div className="brand">EV Lease Comparison</div>
        <button className={`tab ${tab === 'leases' ? 'active' : ''}`} onClick={() => setTab('leases')}>
          Leases
        </button>
        <button className={`tab ${tab === 'evs' ? 'active' : ''}`} onClick={() => setTab('evs')}>
          EVs
        </button>
      </nav>
      <main>{tab === 'leases' ? <LeasesView /> : <EVsView />}</main>
    </div>
  );
}

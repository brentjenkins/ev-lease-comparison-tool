import { useState } from 'react';
import { EVsView } from './views/EVsView';
import { LeasesView } from './views/LeasesView';
import { MakesView } from './views/MakesView';

type Tab = 'evs' | 'leases' | 'makes';

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
        <button className={`tab ${tab === 'makes' ? 'active' : ''}`} onClick={() => setTab('makes')}>
          Makes
        </button>
      </nav>
      <main>{tab === 'leases' ? <LeasesView /> : tab === 'evs' ? <EVsView /> : <MakesView />}</main>
    </div>
  );
}

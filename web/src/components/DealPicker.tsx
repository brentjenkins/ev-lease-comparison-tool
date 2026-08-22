import type { ScrapeGuess } from '../types';

interface Props {
  deals: ScrapeGuess[];
  selected: ScrapeGuess | null;
  onPick: (deal: ScrapeGuess) => void;
}

// Shown when a scrape finds more than one deal on the page (e.g. a dealer specials page
// listing several vehicles) so the user can say which one they actually want.
export function DealPicker({ deals, selected, onPick }: Props) {
  return (
    <div className="deal-picker">
      <p className="hint">Found {deals.length} deals on this page — pick the one you want:</p>
      <div className="deal-picker-list">
        {deals.map((deal, i) => (
          <button
            type="button"
            key={i}
            className={`secondary deal-picker-item${deal === selected ? ' selected' : ''}`}
            onClick={() => onPick(deal)}
          >
            {deal.image_url && <img src={deal.image_url} alt="" />}
            <span className="deal-picker-title">{deal.listing_title || 'Untitled deal'}</span>
            {deal.monthly_payment && <span className="deal-picker-price">${deal.monthly_payment}/mo</span>}
          </button>
        ))}
      </div>
    </div>
  );
}

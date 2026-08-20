import type { ScrapeGuess } from '../types';

export function ScrapePreview({ guess }: { guess: ScrapeGuess }) {
  const foundVehicle = guess.year || guess.make || guess.model;
  const foundPrice = guess.price || guess.msrp;

  return (
    <div className="scrape-preview">
      {guess.image_url && <img src={guess.image_url} alt="" className="scrape-image" />}
      <div className="scrape-details">
        <div className="scrape-title">{guess.listing_title || 'No title found'}</div>
        <div className="scrape-fields">
          {foundVehicle ? (
            <span>
              Guessed: {[guess.year, guess.make, guess.model, guess.trim].filter(Boolean).join(' ')}
            </span>
          ) : (
            <span className="muted">Couldn't guess year/make/model — enter it below.</span>
          )}
          {foundPrice ? (
            <span>
              {guess.msrp ? `MSRP ≈ $${guess.msrp.toLocaleString()}` : `Price ≈ $${guess.price!.toLocaleString()}`}
            </span>
          ) : (
            <span className="muted">No price/MSRP found on the page — enter it below.</span>
          )}
        </div>
        <p className="hint">
          Lease terms (money factor, residual, fees, tax) are almost never on listing pages — fill those in from
          your deal sheet below.
        </p>
      </div>
    </div>
  );
}

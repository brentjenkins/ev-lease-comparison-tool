import type { ScrapeGuess } from '../types';

export function ScrapePreview({ guess }: { guess: ScrapeGuess }) {
  const foundVehicle = guess.year || guess.make || guess.model;
  const foundPrice = guess.price || guess.msrp;

  const dealTerms: string[] = [];
  if (guess.term_months) dealTerms.push(`${guess.term_months} mo`);
  if (guess.annual_mileage) dealTerms.push(`${guess.annual_mileage.toLocaleString()} mi/yr`);
  if (guess.down_payment) dealTerms.push(`$${guess.down_payment.toLocaleString()} down`);
  if (guess.monthly_payment) dealTerms.push(`$${guess.monthly_payment.toLocaleString()}/mo`);
  if (guess.acquisition_fee) dealTerms.push(`$${guess.acquisition_fee.toLocaleString()} acq. fee`);
  if (guess.incentive) dealTerms.push(`$${guess.incentive.toLocaleString()} incentive`);
  if (guess.residual_value) dealTerms.push(`$${guess.residual_value.toLocaleString()} residual`);
  if (guess.money_factor) dealTerms.push(`MF ${guess.money_factor}`);
  if (guess.security_deposit === 0) dealTerms.push('no security deposit');
  if (guess.due_at_signing) dealTerms.push(`$${guess.due_at_signing.toLocaleString()} due at signing`);

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
        {dealTerms.length > 0 ? (
          <>
            <p className="hint">Found in the fine print — double-check these below before saving:</p>
            <div className="scrape-fields">
              <span>{dealTerms.join(' · ')}</span>
            </div>
          </>
        ) : (
          <p className="hint">
            No lease terms (payment, fees, mileage, residual) found in the page text — fill those in from your
            deal sheet below.
          </p>
        )}
      </div>
    </div>
  );
}

import * as cheerio from 'cheerio';

const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

// Common EV makes, used to anchor the year/make/model/trim title-splitting
// heuristic. Not exhaustive — anything not recognized just falls back to
// "everything after the year is model/trim" so the user can still correct it.
const KNOWN_MAKES = [
  'Tesla', 'Ford', 'Chevrolet', 'Chevy', 'GMC', 'Cadillac', 'Buick', 'Hyundai', 'Kia', 'Genesis',
  'Rivian', 'Lucid', 'Volvo', 'Polestar', 'BMW', 'Mercedes-Benz', 'Mercedes', 'Audi', 'Porsche',
  'Volkswagen', 'VW', 'Nissan', 'Toyota', 'Lexus', 'Honda', 'Acura', 'Mazda', 'Subaru', 'Jeep',
  'Chrysler', 'Dodge', 'RAM', 'Fisker', 'Mini', 'Jaguar', 'Land Rover',
];

const PRICE_RE = /\$\s?[\d,]{4,7}(?:\.\d{2})?/;
const MSRP_LABEL_RE = /MSRP[^$]{0,20}(\$\s?[\d,]{4,7})/i;
const YEAR_RE = /\b(19|20)\d{2}\b/;

// Lease terms are frequently in an ad's fine-print disclaimer (dealer.com/DealerOn-style
// specials pages commonly read like: "MSRP $42,145 - $14,079 due at lease signing including
// $184 first monthly payment, $5,995 customer cash down, $650 acquisition fee, $7,250 Lease
// Cash... Option to purchase at lease end $26,129.90 ... responsible for $.20/mile over
// 7,500 miles/year"). These patterns pull the real deal terms out of that prose so the form
// isn't left entirely to manual entry.
const FINE_PRINT_PATTERNS = {
  dueAtSigning: /\$\s?([\d,]{3,7})\s*due at (?:lease )?signing/i,
  firstMonthPayment: /\$\s?([\d,]{2,5})(?:\.\d{2})?\s*first month/i,
  monthlyPayment: /\$\s?([\d,]{2,5})(?:\.\d{2})?\s*(?:\/\s?mo\.?|per month|\/month|a month)\b/i,
  downPayment: /\$\s?([\d,]{2,7})\s*\(?(?:customer cash down|cap(?:italized)? cost reduction|down payment)/i,
  acquisitionFee: /\$\s?([\d,]{2,5})\s*acquisition fee/i,
  incentive: /\$\s?([\d,]{3,7})\s*(?:[A-Za-z.]+\s){0,4}?(?:lease cash|rebate|incentive|bonus cash)/i,
  annualMileage: /([\d,]{3,6})\s*miles?\s*\/?\s*(?:per\s*)?year/i,
  termMonths: /\b(\d{2,3})[\s-]?month(?:s)?\b(?!\s*payment)/i,
  residualPurchaseOption: /purchase(?:\s+option)? at lease end[^\$]{0,10}\$\s?([\d,]+(?:\.\d{2})?)/i,
  residualPercent: /residual[^\d%]{0,20}(\d{2,3})\s?%/i,
  moneyFactor: /money factor[^\d]{0,15}(0?\.\d{3,6})/i,
  noSecurityDeposit: /no security deposit/i,
};

export async function scrapeListing(url) {
  const res = await fetch(url, {
    headers: { 'User-Agent': UA, Accept: 'text/html' },
    redirect: 'follow',
  });
  if (!res.ok) {
    throw new Error(`Fetch failed: ${res.status} ${res.statusText}`);
  }
  const html = await res.text();
  const $ = cheerio.load(html);

  const guess = {
    source_url: url,
    listing_title: null,
    image_url: null,
    price: null,
    msrp: null,
    year: null,
    make: null,
    model: null,
    trim: null,
    // Deal terms pulled from fine print, when present — all best-effort.
    monthly_payment: null,
    down_payment: null,
    acquisition_fee: null,
    incentive: null,
    annual_mileage: null,
    term_months: null,
    residual_value: null,
    money_factor: null,
    security_deposit: null,
    due_at_signing: null,
  };

  // 1. JSON-LD structured data (schema.org Vehicle / Product / Car)
  $('script[type="application/ld+json"]').each((_, el) => {
    let parsed;
    try {
      parsed = JSON.parse($(el).contents().text());
    } catch {
      return;
    }
    const candidates = Array.isArray(parsed) ? parsed : [parsed, ...(parsed['@graph'] || [])];
    for (const node of candidates) {
      if (!node || typeof node !== 'object') continue;
      const type = String(node['@type'] || '').toLowerCase();
      if (!['vehicle', 'car', 'product'].includes(type)) continue;

      guess.make = guess.make || pickString(node.brand?.name || node.brand || node.manufacturer);
      guess.model = guess.model || pickString(node.model);
      guess.year = guess.year || pickString(node.vehicleModelDate || node.productionDate);
      guess.image_url = guess.image_url || pickString(node.image);
      guess.listing_title = guess.listing_title || pickString(node.name);
      const offerPrice = node.offers?.price ?? node.offers?.[0]?.price;
      if (offerPrice) guess.price = guess.price || Number(String(offerPrice).replace(/[^0-9.]/g, ''));
    }
  });

  // 2. Open Graph fallbacks
  guess.listing_title =
    guess.listing_title || $('meta[property="og:title"]').attr('content') || $('title').first().text().trim() || null;
  guess.image_url = guess.image_url || $('meta[property="og:image"]').attr('content') || null;
  const ogPrice = $('meta[property="og:price:amount"]').attr('content') || $('meta[property="product:price:amount"]').attr('content');
  if (ogPrice) guess.price = guess.price || Number(ogPrice);

  // 3. Regex scan of visible text for price / MSRP patterns
  const bodyText = $('body').text().replace(/\s+/g, ' ');
  const msrpMatch = bodyText.match(MSRP_LABEL_RE);
  if (msrpMatch) guess.msrp = toNumber(msrpMatch[1]);
  if (!guess.price) {
    const priceMatch = bodyText.match(PRICE_RE);
    if (priceMatch) guess.price = toNumber(priceMatch[0]);
  }

  // 4. Fine-print deal terms (down payment, payment, fees, mileage, term, residual, etc.)
  extractFinePrintTerms(bodyText, guess);

  // 5. Heuristic year/make/model/trim split from the title
  if (guess.listing_title) {
    const parsedTitle = parseVehicleTitle(guess.listing_title);
    guess.year = guess.year || parsedTitle.year;
    guess.make = guess.make || parsedTitle.make;
    guess.model = guess.model || parsedTitle.model;
    guess.trim = guess.trim || parsedTitle.trim;
  }

  if (guess.year) guess.year = parseInt(String(guess.year).match(YEAR_RE)?.[0] || guess.year, 10) || null;

  return guess;
}

function extractFinePrintTerms(bodyText, guess) {
  const dueAtSigningMatch = bodyText.match(FINE_PRINT_PATTERNS.dueAtSigning);
  if (dueAtSigningMatch) guess.due_at_signing = toNumber(dueAtSigningMatch[1]);

  const firstMonthMatch = bodyText.match(FINE_PRINT_PATTERNS.firstMonthPayment);
  if (firstMonthMatch) guess.monthly_payment = toNumber(firstMonthMatch[1]);
  if (!guess.monthly_payment) {
    const monthlyMatch = bodyText.match(FINE_PRINT_PATTERNS.monthlyPayment);
    if (monthlyMatch) guess.monthly_payment = toNumber(monthlyMatch[1]);
  }

  const downMatch = bodyText.match(FINE_PRINT_PATTERNS.downPayment);
  if (downMatch) guess.down_payment = toNumber(downMatch[1]);

  const acqMatch = bodyText.match(FINE_PRINT_PATTERNS.acquisitionFee);
  if (acqMatch) guess.acquisition_fee = toNumber(acqMatch[1]);

  const incentiveMatch = bodyText.match(FINE_PRINT_PATTERNS.incentive);
  if (incentiveMatch) guess.incentive = toNumber(incentiveMatch[1]);

  const mileageMatch = bodyText.match(FINE_PRINT_PATTERNS.annualMileage);
  if (mileageMatch) guess.annual_mileage = toNumber(mileageMatch[1]);

  const termMatch = bodyText.match(FINE_PRINT_PATTERNS.termMonths);
  if (termMatch) {
    const months = parseInt(termMatch[1], 10);
    if (months >= 12 && months <= 60) guess.term_months = months;
  }

  const moneyFactorMatch = bodyText.match(FINE_PRINT_PATTERNS.moneyFactor);
  if (moneyFactorMatch) guess.money_factor = Number(moneyFactorMatch[1]);

  // Residual as a dollar figure (purchase option at lease end) is preferred since that's
  // what the form takes directly; only fall back to converting a stated % if that's all
  // the page gives us, using whatever MSRP was found.
  const residualDollarMatch = bodyText.match(FINE_PRINT_PATTERNS.residualPurchaseOption);
  if (residualDollarMatch) {
    guess.residual_value = toNumber(residualDollarMatch[1]);
  } else {
    const residualPercentMatch = bodyText.match(FINE_PRINT_PATTERNS.residualPercent);
    if (residualPercentMatch && guess.msrp) {
      guess.residual_value = Math.round(guess.msrp * (Number(residualPercentMatch[1]) / 100));
    }
  }

  if (FINE_PRINT_PATTERNS.noSecurityDeposit.test(bodyText)) guess.security_deposit = 0;
}

function parseVehicleTitle(title) {
  const result = { year: null, make: null, model: null, trim: null };
  const yearMatch = title.match(YEAR_RE);
  if (!yearMatch) return result;

  result.year = yearMatch[0];
  const afterYear = title.slice(yearMatch.index + yearMatch[0].length).trim();
  const tokens = afterYear.split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return result;

  const makeMatch = KNOWN_MAKES.find((m) =>
    afterYear.toLowerCase().startsWith(m.toLowerCase())
  );

  if (makeMatch) {
    result.make = makeMatch;
    const rest = afterYear.slice(makeMatch.length).trim().split(/\s+/).filter(Boolean);
    result.model = rest[0] || null;
    result.trim = rest.slice(1).join(' ') || null;
  } else {
    result.make = tokens[0] || null;
    result.model = tokens[1] || null;
    result.trim = tokens.slice(2).join(' ') || null;
  }

  return result;
}

function pickString(val) {
  if (!val) return null;
  if (Array.isArray(val)) return pickString(val[0]);
  return String(val).trim() || null;
}

function toNumber(str) {
  const n = Number(String(str).replace(/[^0-9.]/g, ''));
  return Number.isFinite(n) ? n : null;
}

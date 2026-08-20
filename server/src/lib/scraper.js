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

  // 4. Heuristic year/make/model/trim split from the title
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

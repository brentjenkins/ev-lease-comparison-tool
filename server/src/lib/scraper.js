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

// Deal-card titles are almost always in heading tags (h1-h6), which is also
// standard markup for a11y on these pages. We don't try to match on div/span
// "title" classes since those vary too much by dealer platform and risk
// grabbing unrelated wrapper text.
const HEADING_SELECTOR = 'h1, h2, h3, h4, h5, h6';

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
  excessMileageFee: /\$(\.?\d+(?:\.\d+)?)\s*(?:per mile|\/\s?mile|\/\s?mi\b|a mile)/i,
};

function blankGuess(url) {
  return {
    source_url: url,
    listing_title: null,
    image_url: null,
    dealer_name: null,
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
    excess_mileage_fee: null,
  };
}

// Many specials pages (dealer.com, DealerOn, and similar dealer-site platforms) list several
// vehicles' lease deals on one page. Scanning the whole page's text for "the" price/MSRP/fine
// print grabs whichever deal happens to match first, which is wrong as soon as there's more
// than one card. So: detect repeated deal-card structures first, and if there's more than
// one, extract each separately and let the caller (via `dealHint`, or the UI showing a
// picker) pick which one applies.
export async function scrapeListing(url, dealHint) {
  const res = await fetch(url, {
    headers: { 'User-Agent': UA, Accept: 'text/html' },
    redirect: 'follow',
  });
  if (!res.ok) {
    throw new Error(`Fetch failed: ${res.status} ${res.statusText}`);
  }
  const html = await res.text();
  const $ = cheerio.load(html);

  const dealerName = extractDealerName($, url);
  const cardEls = findDealCards($);

  if (cardEls.length > 1) {
    const deals = cardEls.map((el) => extractDealFromCard($, el, url));
    deals.forEach((d) => { d.dealer_name = dealerName; });
    return { deals, matchedIndex: matchDealHint(deals, dealHint) };
  }

  const guess = extractWholePage($, url);
  guess.dealer_name = dealerName;
  return { deals: [guess], matchedIndex: 0 };
}

// The dealer's own name (for showing "Fremont Hyundai" instead of a raw URL as the
// listing link). Dealer sites commonly publish a schema.org AutoDealer/LocalBusiness
// node for local SEO — that's the most reliable source when present; otherwise fall
// back to a site-name meta tag, and finally to the bare hostname.
const DEALER_SCHEMA_TYPES = ['autodealer', 'automotivebusiness', 'localbusiness', 'organization', 'corporation'];

function extractDealerName($, url) {
  let name = null;

  $('script[type="application/ld+json"]').each((_, el) => {
    if (name) return;
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
      if (DEALER_SCHEMA_TYPES.includes(type) && node.name) {
        name = pickString(node.name);
        break;
      }
    }
  });

  if (!name) {
    name = pickString($('meta[property="og:site_name"]').attr('content'));
  }

  if (!name) {
    try {
      name = new URL(url).hostname.replace(/^www\./, '');
    } catch {
      name = null;
    }
  }

  return name;
}

// Finds distinct "deal card" container elements by locating headings that look like a
// vehicle title (a year plus a known make) and, for each, walking up the DOM until the
// ancestor would start covering more than one such heading — i.e. the smallest ancestor
// that wraps exactly this one card.
function findDealCards($) {
  const headings = [];
  $(HEADING_SELECTOR).each((_, el) => {
    if (looksLikeVehicleHeading($(el).text())) headings.push(el);
  });
  if (headings.length < 2) return [];

  const seen = new Set();
  const containers = [];
  for (const heading of headings) {
    const container = findCardContainer($, heading);
    if (!seen.has(container)) {
      seen.add(container);
      containers.push(container);
    }
  }
  // If multiple headings collapsed onto the same container, we couldn't actually tell
  // the cards apart — fall back to whole-page extraction rather than guessing.
  return containers.length > 1 ? containers : [];
}

function looksLikeVehicleHeading(text) {
  const clean = text.replace(/\s+/g, ' ').trim();
  if (!YEAR_RE.test(clean)) return false;
  const lower = clean.toLowerCase();
  return KNOWN_MAKES.some((m) => lower.includes(m.toLowerCase()));
}

function countVehicleHeadingsWithin($, el) {
  let count = 0;
  $(el)
    .find(HEADING_SELECTOR)
    .each((_, h) => {
      if (looksLikeVehicleHeading($(h).text())) count += 1;
    });
  return count;
}

function findCardContainer($, headingEl) {
  let candidate = headingEl;
  let parent = $(headingEl).parent();
  while (parent.length && !parent.is('body')) {
    const parentEl = parent.get(0);
    if (countVehicleHeadingsWithin($, parentEl) > 1) break;
    candidate = parentEl;
    parent = parent.parent();
  }
  return candidate;
}

function extractDealFromCard($, cardEl, url) {
  const $card = $(cardEl);
  const guess = blankGuess(url);

  const heading = $card
    .find(HEADING_SELECTOR)
    .filter((_, el) => looksLikeVehicleHeading($(el).text()))
    .first();
  guess.listing_title = heading.text().replace(/\s+/g, ' ').trim() || null;

  const img = $card.find('img').first();
  guess.image_url = resolveUrl(img.attr('src') || img.attr('data-src') || img.attr('data-lazy-src'), url);

  const cardText = $card.text().replace(/\s+/g, ' ').trim();
  const msrpMatch = cardText.match(MSRP_LABEL_RE);
  if (msrpMatch) guess.msrp = toNumber(msrpMatch[1]);
  const priceMatch = cardText.match(PRICE_RE);
  if (priceMatch) guess.price = toNumber(priceMatch[0]);

  extractFinePrintTerms(cardText, guess);

  if (guess.listing_title) {
    const parsedTitle = parseVehicleTitle(guess.listing_title);
    guess.year = parsedTitle.year;
    guess.make = parsedTitle.make;
    guess.model = parsedTitle.model;
    guess.trim = parsedTitle.trim;
  }
  if (guess.year) guess.year = parseInt(String(guess.year).match(YEAR_RE)?.[0] || guess.year, 10) || null;

  return guess;
}

// Scores how well a user-supplied hint (e.g. "Ioniq 9 SEL" or a full pasted title) matches
// a detected deal's title: exact substring either direction wins outright, otherwise it's
// the fraction of the hint's words found in the title. Only returns an index when there's a
// confident, unambiguous winner — otherwise the caller should let the user pick.
function matchDealHint(deals, hint) {
  if (!hint || !hint.trim()) return null;

  let bestIndex = null;
  let bestScore = 0;
  let tied = false;

  deals.forEach((deal, i) => {
    const score = scoreTitleMatch(hint, deal.listing_title || '');
    if (score > bestScore) {
      bestScore = score;
      bestIndex = i;
      tied = false;
    } else if (score === bestScore && score > 0) {
      tied = true;
    }
  });

  if (bestIndex !== null && bestScore >= 0.5 && !tied) return bestIndex;
  return null;
}

function scoreTitleMatch(hint, title) {
  const nHint = normalizeForMatch(hint);
  const nTitle = normalizeForMatch(title);
  if (!nHint || !nTitle) return 0;
  if (nTitle.includes(nHint) || nHint.includes(nTitle)) return 1;

  const hintTokens = nHint.split(' ').filter(Boolean);
  if (hintTokens.length === 0) return 0;
  const titleTokens = new Set(nTitle.split(' ').filter(Boolean));
  const matched = hintTokens.filter((t) => titleTokens.has(t)).length;
  return matched / hintTokens.length;
}

function normalizeForMatch(s) {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function extractWholePage($, url) {
  const guess = blankGuess(url);

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
      guess.image_url = guess.image_url || resolveUrl(pickString(node.image), url);
      guess.listing_title = guess.listing_title || pickString(node.name);
      const offerPrice = node.offers?.price ?? node.offers?.[0]?.price;
      if (offerPrice) guess.price = guess.price || Number(String(offerPrice).replace(/[^0-9.]/g, ''));
    }
  });

  // 2. Open Graph fallbacks
  guess.listing_title =
    guess.listing_title || $('meta[property="og:title"]').attr('content') || $('title').first().text().trim() || null;
  guess.image_url = guess.image_url || resolveUrl($('meta[property="og:image"]').attr('content'), url);
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

  const excessMileageMatch = bodyText.match(FINE_PRINT_PATTERNS.excessMileageFee);
  if (excessMileageMatch) guess.excess_mileage_fee = toNumber(excessMileageMatch[1]);
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

function resolveUrl(src, pageUrl) {
  if (!src) return null;
  try {
    return new URL(src, pageUrl).href;
  } catch {
    return src;
  }
}

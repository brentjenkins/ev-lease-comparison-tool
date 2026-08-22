export interface EV {
  id: number;
  year: number;
  make: string;
  model: string;
  trim: string | null;
  msrp: number | null;
  seats: number | null;
  range_miles: number | null;
  awd: boolean;
  powered_liftgate: boolean;
  heated_seats: boolean;
  cooled_seats: boolean;
  charging_800v: boolean;
  notes: string | null;
  created_at: string;
  score: number;
}

export type EVInput = Omit<EV, 'id' | 'created_at' | 'score'>;

export interface Make {
  id: number;
  name: string;
  acquisition_fee: number;
  disposition_fee: number;
  created_at: string;
}

export type MakeInput = Omit<Make, 'id' | 'created_at'>;

export type TaxMethod = 'monthly' | 'upfront';

export interface Lease {
  id: number;
  ev_id: number;
  source_url: string | null;
  listing_title: string | null;
  image_url: string | null;
  dealer_name: string | null;
  expires_at: string | null;
  notes: string | null;

  msrp: number;
  selling_price: number | null;

  term_months: number;
  annual_mileage: number | null;
  excess_mileage_fee: number | null;
  residual_value: number | null;
  money_factor: number | null;

  down_payment: number;
  manufacturer_incentives: number;
  dealer_incentives: number;
  untaxed_incentives: number;

  acquisition_fee: number;
  registration_fee: number;
  doc_fee: number;
  tire_fee: number;
  electronic_filing_fee: number;
  disposition_fee: number;
  security_deposit: number;

  tax_rate_percent: number;
  tax_method: TaxMethod;

  monthly_payment: number;

  created_at: string;
  ev: EV | null;
  metrics: LeaseMetrics;
}

export interface LeaseMetrics {
  basePayment: number;
  monthlyTax: number;
  paymentWithTax: number;
  dueAtSigning: number;
  totalCustomerDown: number;
  taxOnCcr: number;
  totalTaxesPaid: number;
  totalCost: number;
  totalCostByMonth: number[];
  effectiveMonthlyCost: number | null;
  yearsToMsrp: number | null;
  residualPercent: number | null;
}

export type LeaseInput = Omit<Lease, 'id' | 'created_at' | 'ev' | 'metrics'>;

export interface ScrapeGuess {
  source_url: string;
  listing_title: string | null;
  image_url: string | null;
  dealer_name: string | null;
  price: number | null;
  msrp: number | null;
  year: number | null;
  make: string | null;
  model: string | null;
  trim: string | null;
  monthly_payment: number | null;
  down_payment: number | null;
  acquisition_fee: number | null;
  incentive: number | null;
  annual_mileage: number | null;
  term_months: number | null;
  residual_value: number | null;
  money_factor: number | null;
  security_deposit: number | null;
  due_at_signing: number | null;
  excess_mileage_fee: number | null;
  expires_at: string | null;
}

export interface ScrapeResult {
  deals: ScrapeGuess[];
  // Index into `deals` that confidently matched the supplied deal hint, or null if no
  // hint was given, or the page has multiple deals and none matched confidently — in
  // either of those last two cases the caller should let the user pick.
  matchedIndex: number | null;
}

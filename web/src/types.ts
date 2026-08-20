export interface EV {
  id: number;
  year: number;
  make: string;
  model: string;
  trim: string | null;
  seats: number | null;
  range_miles: number | null;
  awd: boolean;
  powered_liftgate: boolean;
  heated_seats: boolean;
  cooled_seats: boolean;
  notes: string | null;
  created_at: string;
}

export type EVInput = Omit<EV, 'id' | 'created_at'>;

export type TaxMethod = 'monthly' | 'upfront';

export interface Lease {
  id: number;
  ev_id: number;
  source_url: string | null;
  listing_title: string | null;
  image_url: string | null;
  notes: string | null;

  msrp: number;
  selling_price: number | null;

  term_months: number;
  annual_mileage: number | null;
  residual_value: number | null;
  money_factor: number | null;

  down_payment: number;
  trade_in_equity: number;
  taxed_incentives: number;
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
  price: number | null;
  msrp: number | null;
  year: number | null;
  make: string | null;
  model: string | null;
  trim: string | null;
}

// Standard lease math (mirrors LeaseHackr calculator terminology) plus the
// comparison metrics requested for this tool. Nothing here is persisted —
// it's recomputed from the stored lease terms on every read so it always
// reflects the current inputs.

/**
 * Suggests a base (pre-tax) monthly payment from a full deal breakdown.
 * Returns null if not enough inputs are present (selling price / residual /
 * money factor are optional — the user can just type a quoted payment instead).
 */
export function suggestMonthlyPayment(lease) {
  const { selling_price, residual_value, money_factor, term_months } = lease;
  if (!selling_price || !residual_value || money_factor == null || !term_months) {
    return null;
  }

  const capitalizedFees = (lease.acquisition_fee || 0) + (lease.doc_fee || 0);
  const reductions =
    (lease.down_payment || 0) +
    (lease.manufacturer_incentives || 0) +
    (lease.dealer_incentives || 0) +
    (lease.untaxed_incentives || 0);

  const adjustedCapCost = selling_price + capitalizedFees - reductions;

  const depreciation = (adjustedCapCost - residual_value) / term_months;
  const rentCharge = (adjustedCapCost + residual_value) * money_factor;

  return round2(depreciation + rentCharge);
}

/**
 * Residual % is derived, not entered — dealers post the residual as a dollar
 * figure for the specific deal, not a percentage of MSRP.
 */
export function residualPercent(lease) {
  if (!lease.residual_value || !lease.msrp) return null;
  return round2((lease.residual_value / lease.msrp) * 100);
}

/**
 * Computes the comparison metrics for a lease record (as returned by the DB,
 * snake_case fields). basePayment is the pre-tax monthly payment to use —
 * either the stored monthly_payment (a manual/dealer-quoted figure) or the
 * suggested figure, decided by the caller.
 */
export function computeLeaseMetrics(lease) {
  const termMonths = lease.term_months || 0;
  const basePayment = lease.monthly_payment || 0;
  const taxRate = (lease.tax_rate_percent || 0) / 100;
  const isMonthlyTax = lease.tax_method !== 'upfront';

  const monthlyTax = isMonthlyTax ? basePayment * taxRate : 0;
  const paymentWithTax = basePayment + monthlyTax;

  const upfrontTax = isMonthlyTax ? 0 : (lease.selling_price || 0) * taxRate;

  // CA (and some other states) taxes the capitalized cost reduction — cash down
  // plus any taxed incentives (manufacturer or dealer) applied to reduce cap cost —
  // upfront at signing, separately from however the recurring payment itself is taxed.
  const capCostReduction =
    (lease.down_payment || 0) + (lease.manufacturer_incentives || 0) + (lease.dealer_incentives || 0);
  const taxOnCcr = round2(capCostReduction * taxRate);

  const totalTaxesPaid = (isMonthlyTax ? monthlyTax * termMonths : upfrontTax) + taxOnCcr;

  const dueAtSigning =
    (lease.down_payment || 0) +
    (lease.acquisition_fee || 0) +
    (lease.doc_fee || 0) +
    (lease.registration_fee || 0) +
    (lease.tire_fee || 0) +
    (lease.electronic_filing_fee || 0) +
    (lease.security_deposit || 0) +
    taxOnCcr +
    upfrontTax +
    paymentWithTax;

  // Cash the customer puts toward the deal at signing, distinct from other
  // due-at-signing fees: down payment + acquisition fee + first month's payment.
  const totalCustomerDown = round2((lease.down_payment || 0) + (lease.acquisition_fee || 0) + paymentWithTax);

  // total cost = down payment + taxes + monthly payments
  const totalCost = round2((lease.down_payment || 0) + totalTaxesPaid + basePayment * termMonths);

  const upfrontCash = (lease.down_payment || 0) + taxOnCcr + upfrontTax;
  const totalCostByMonth = [];
  for (let i = 1; i <= termMonths; i++) {
    totalCostByMonth.push(round2(upfrontCash + i * paymentWithTax));
  }

  const effectiveMonthlyCost = termMonths ? round2(totalCost / termMonths) : null;
  const yearsToMsrp =
    effectiveMonthlyCost && lease.msrp
      ? round2(lease.msrp / (effectiveMonthlyCost * 12))
      : null;

  return {
    basePayment: round2(basePayment),
    monthlyTax: round2(monthlyTax),
    paymentWithTax: round2(paymentWithTax),
    dueAtSigning: round2(dueAtSigning),
    totalCustomerDown,
    taxOnCcr,
    totalTaxesPaid: round2(totalTaxesPaid),
    totalCost,
    totalCostByMonth,
    effectiveMonthlyCost,
    yearsToMsrp,
    residualPercent: residualPercent(lease),
  };
}

function round2(n) {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

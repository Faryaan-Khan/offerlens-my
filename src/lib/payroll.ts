import { MY_RATES, type RateTable, type TaxBand } from '../data/rates';

export interface PayInput {
  /** Basic monthly salary in RM. */
  monthlyGross: number;
  /** Fixed monthly allowances in RM (treated as taxable wages subject to EPF/SOCSO/EIS). */
  monthlyAllowance?: number;
  /** Contractual or expected bonus, in months of basic salary. */
  bonusMonths?: number;
  /** Employee EPF share as a fraction (default 11%). */
  epfEmployeeRate?: number;
  /** Lifestyle relief claimed for the year, capped by the rate table. */
  lifestyleRelief?: number;
  /** Any other annual reliefs (medical, education, PRS, SSPN, ...), RM. */
  otherReliefs?: number;
  /** Annual zakat paid, deducted ringgit-for-ringgit from tax. */
  zakat?: number;
}

export interface PayBreakdown {
  monthlyWage: number;
  monthly: {
    gross: number;
    epf: number;
    socso: number;
    eis: number;
    /** Estimated tax in a regular (non-bonus) month: yearly tax on salary alone ÷ 12. */
    tax: number;
    net: number;
  };
  annual: {
    gross: number;
    bonus: number;
    epf: number;
    socso: number;
    eis: number;
    reliefs: number;
    chargeableIncome: number;
    taxBeforeRebate: number;
    rebate: number;
    zakat: number;
    tax: number;
    /** Part of the yearly tax caused by the bonus (deducted in the bonus month). */
    bonusTax: number;
    net: number;
  };
  employer: {
    epfMonthly: number;
    socsoMonthly: number;
    eisMonthly: number;
    /** Total yearly cost of this hire to the employer. */
    annualCost: number;
  };
  /** Tax as a share of annual gross. */
  effectiveTaxRate: number;
  /** Rate applied to the next ringgit of chargeable income. */
  marginalTaxRate: number;
  /** Take-home including bonus, averaged per month. */
  averageMonthlyNet: number;
}

const clampNonNegative = (n: number | undefined): number =>
  Number.isFinite(n) && (n as number) > 0 ? (n as number) : 0;

/** Round to the nearest 5 sen, the granularity used by SOCSO/EIS schedules. */
export const roundTo5Sen = (n: number): number => Math.round(n * 20) / 20;

/** Round to 2 decimal places without floating point drift. */
export const round2 = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100;

/** Progressive income tax on a chargeable income, before rebates. */
export function progressiveTax(chargeable: number, bands: TaxBand[] = MY_RATES.taxBands): number {
  const income = clampNonNegative(chargeable);
  let tax = 0;
  for (const band of bands) {
    if (income <= band.from) break;
    const slice = Math.min(income, band.to) - band.from;
    tax += slice * band.rate;
  }
  return round2(tax);
}

export function marginalRate(chargeable: number, bands: TaxBand[] = MY_RATES.taxBands): number {
  const income = clampNonNegative(chargeable);
  for (const band of bands) {
    if (income < band.to) return band.rate;
  }
  return bands[bands.length - 1].rate;
}

/** EPF contributions are rounded up to the next ringgit. */
export const epfAmount = (wage: number, rate: number): number =>
  Math.ceil(round2(clampNonNegative(wage) * rate));

export function computePay(input: PayInput, rates: RateTable = MY_RATES): PayBreakdown {
  const basic = clampNonNegative(input.monthlyGross);
  const allowance = clampNonNegative(input.monthlyAllowance);
  const bonusMonths = clampNonNegative(input.bonusMonths);
  const epfRate = Math.min(input.epfEmployeeRate ?? rates.epf.employeeRate, 1);
  const epfRateSafe = epfRate >= 0 ? epfRate : rates.epf.employeeRate;

  const monthlyWage = basic + allowance;
  const bonus = round2(basic * bonusMonths);

  const epfMonthly = epfAmount(monthlyWage, epfRateSafe);
  const epfBonus = epfAmount(bonus, epfRateSafe);
  const insurable = Math.min(monthlyWage, rates.socso.wageCeiling);
  const socsoMonthly = roundTo5Sen(insurable * rates.socso.employeeRate);
  const eisMonthly = roundTo5Sen(Math.min(monthlyWage, rates.eis.wageCeiling) * rates.eis.employeeRate);

  const annualGross = round2(monthlyWage * 12 + bonus);
  const annualEpf = epfMonthly * 12 + epfBonus;
  const annualSocso = round2(socsoMonthly * 12);
  const annualEis = round2(eisMonthly * 12);

  const lifestyle = Math.min(clampNonNegative(input.lifestyleRelief), rates.reliefs.lifestyleMax);
  const other = clampNonNegative(input.otherReliefs);
  const socsoEisRelief = Math.min(annualSocso + annualEis, rates.reliefs.socsoEisMax);
  const taxFor = (gross: number, epf: number) => {
    const reliefs = round2(rates.reliefs.individual + Math.min(epf, rates.reliefs.epfMax) + socsoEisRelief + lifestyle + other);
    const chargeable = Math.max(0, round2(gross - reliefs));
    const before = progressiveTax(chargeable, rates.taxBands);
    const rebate = chargeable <= rates.rebate.threshold ? Math.min(rates.rebate.amount, before) : 0;
    const afterRebate = round2(before - rebate);
    const zakat = Math.min(clampNonNegative(input.zakat), afterRebate);
    return { reliefs, chargeable, before, rebate, zakat, tax: round2(afterRebate - zakat) };
  };

  // Full-year position (what you actually owe LHDN).
  const year = taxFor(annualGross, annualEpf);
  const { reliefs, chargeable: chargeableIncome, before: taxBeforeRebate, rebate, zakat } = year;
  const annualTax = year.tax;
  // Regular months, as on a normal payslip: tax on salary alone. The extra tax
  // caused by the bonus is deducted in the bonus month instead.
  const regularTax = taxFor(monthlyWage * 12, epfMonthly * 12).tax;
  const bonusTax = round2(Math.max(0, annualTax - regularTax));

  const monthlyTax = round2(Math.min(regularTax, annualTax) / 12);
  const monthlyNet = round2(monthlyWage - epfMonthly - socsoMonthly - eisMonthly - monthlyTax);
  const annualNet = round2(annualGross - annualEpf - annualSocso - annualEis - annualTax);

  const employerEpfRate =
    monthlyWage <= rates.epf.employerThreshold ? rates.epf.employerRateLow : rates.epf.employerRateHigh;
  const employerEpfMonthly = epfAmount(monthlyWage, employerEpfRate);
  const employerSocso = roundTo5Sen(insurable * rates.socso.employerRate);
  const employerEis = roundTo5Sen(Math.min(monthlyWage, rates.eis.wageCeiling) * rates.eis.employerRate);
  const employerAnnualCost = round2(
    annualGross + employerEpfMonthly * 12 + epfAmount(bonus, employerEpfRate) + (employerSocso + employerEis) * 12,
  );

  return {
    monthlyWage,
    monthly: {
      gross: monthlyWage,
      epf: epfMonthly,
      socso: socsoMonthly,
      eis: eisMonthly,
      tax: monthlyTax,
      net: monthlyNet,
    },
    annual: {
      gross: annualGross,
      bonus,
      epf: annualEpf,
      socso: annualSocso,
      eis: annualEis,
      reliefs,
      chargeableIncome,
      taxBeforeRebate,
      rebate,
      zakat,
      tax: annualTax,
      bonusTax,
      net: annualNet,
    },
    employer: {
      epfMonthly: employerEpfMonthly,
      socsoMonthly: employerSocso,
      eisMonthly: employerEis,
      annualCost: employerAnnualCost,
    },
    effectiveTaxRate: annualGross > 0 ? annualTax / annualGross : 0,
    marginalTaxRate: marginalRate(chargeableIncome, rates.taxBands),
    averageMonthlyNet: round2(annualNet / 12),
  };
}

/**
 * Find a basic monthly salary (whole ringgit) that reliably meets `target`,
 * where `metric` reads the figure to compare.
 *
 * Net pay is *almost* monotonic in gross, but not quite: EPF rounds up to the
 * next ringgit, and the RM400 tax rebate disappears once chargeable income
 * passes RM35,000, so a small raise can briefly lower take-home. We therefore
 * binary-search for a boundary, then walk upward through a safety window and
 * move past any salary that would dip back below the target. The result `r`
 * satisfies metric(r) >= target, and every salary in [r, r + SAFETY_WINDOW]
 * stays within a tiny tolerance (0.02%, min RM1) of the target, so it's a safe number to ask for.
 */
export const SAFETY_WINDOW = 1_500;

export function solveGross(
  target: number,
  metric: (b: PayBreakdown) => number,
  base: Omit<PayInput, 'monthlyGross'> = {},
  rates: RateTable = MY_RATES,
): number {
  if (!Number.isFinite(target) || target <= 0) return 0;
  const at = (g: number) => metric(computePay({ ...base, monthlyGross: g }, rates));
  let lo = 0;
  let hi = 1_000;
  while (at(hi) < target) {
    lo = hi;
    hi *= 2;
    if (hi > 50_000_000) return Number.POSITIVE_INFINITY;
  }
  while (hi - lo > 1) {
    const mid = Math.floor((lo + hi) / 2);
    if (at(mid) >= target) hi = mid;
    else lo = mid;
  }
  const wobble = Math.max(1, target * 0.0002);
  let r = hi;
  for (let g = r + 1; g <= r + SAFETY_WINDOW; g++) {
    // Ignore sen-level wobble from EPF rounding; react to real dips such as the rebate cliff.
    if (at(g) < target - wobble) r = g + 1;
  }
  while (at(r) < target) r++;
  return r;
}

/** Basic salary needed to take home `targetNet` in a regular (non-bonus) month. */
export const grossForMonthlyNet = (
  targetNet: number,
  base: Omit<PayInput, 'monthlyGross'> = {},
  rates: RateTable = MY_RATES,
): number => solveGross(targetNet, (b) => b.monthly.net, base, rates);

/** Basic salary needed to match a given annual take-home (bonus included). */
export const grossForAnnualNet = (
  targetAnnualNet: number,
  base: Omit<PayInput, 'monthlyGross'> = {},
  rates: RateTable = MY_RATES,
): number => solveGross(targetAnnualNet, (b) => b.annual.net, base, rates);

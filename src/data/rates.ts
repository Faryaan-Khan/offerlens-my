/**
 * Malaysian statutory rates used by the payroll engine.
 *
 * Every figure here is public information. Sources are listed in docs/METHODOLOGY.md.
 * When the government changes a rate, update this file and the matching tests.
 */

export interface TaxBand {
  /** Lower bound of chargeable income for this band (inclusive of the next ringgit). */
  from: number;
  /** Upper bound, or Infinity for the top band. */
  to: number;
  /** Marginal rate as a fraction, e.g. 0.03 for 3%. */
  rate: number;
}

export interface RateTable {
  /** Year of assessment these rates describe. */
  year: number;
  taxBands: TaxBand[];
  reliefs: {
    individual: number;
    /** Cap on EPF contributions claimable (shared with life insurance in law; EPF part only here). */
    epfMax: number;
    /** Cap on SOCSO + EIS contributions claimable. */
    socsoEisMax: number;
    /** Lifestyle relief cap (books, gadgets, internet, gym). */
    lifestyleMax: number;
  };
  /** Rebate applied when chargeable income is at or below the threshold. */
  rebate: { threshold: number; amount: number };
  epf: {
    /** Default employee share for employees below 60. */
    employeeRate: number;
    /** Employer share when monthly wage is at or below the threshold. */
    employerRateLow: number;
    /** Employer share when monthly wage is above the threshold. */
    employerRateHigh: number;
    employerThreshold: number;
  };
  socso: {
    /** Employee share of the Employment Injury + Invalidity scheme. */
    employeeRate: number;
    employerRate: number;
    /** Monthly insurable wage ceiling. */
    wageCeiling: number;
  };
  eis: {
    employeeRate: number;
    employerRate: number;
    wageCeiling: number;
  };
}

export const MY_RATES: RateTable = {
  year: 2025,
  taxBands: [
    { from: 0, to: 5_000, rate: 0 },
    { from: 5_000, to: 20_000, rate: 0.01 },
    { from: 20_000, to: 35_000, rate: 0.03 },
    { from: 35_000, to: 50_000, rate: 0.06 },
    { from: 50_000, to: 70_000, rate: 0.11 },
    { from: 70_000, to: 100_000, rate: 0.19 },
    { from: 100_000, to: 400_000, rate: 0.25 },
    { from: 400_000, to: 600_000, rate: 0.26 },
    { from: 600_000, to: 2_000_000, rate: 0.28 },
    { from: 2_000_000, to: Infinity, rate: 0.3 },
  ],
  reliefs: {
    individual: 9_000,
    epfMax: 4_000,
    socsoEisMax: 350,
    lifestyleMax: 2_500,
  },
  rebate: { threshold: 35_000, amount: 400 },
  epf: {
    employeeRate: 0.11,
    employerRateLow: 0.13,
    employerRateHigh: 0.12,
    employerThreshold: 5_000,
  },
  socso: { employeeRate: 0.005, employerRate: 0.0175, wageCeiling: 6_000 },
  eis: { employeeRate: 0.002, employerRate: 0.002, wageCeiling: 6_000 },
};

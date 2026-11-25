import { describe, it, expect } from 'vitest';
import {
  computePay,
  epfAmount,
  grossForAnnualNet,
  grossForMonthlyNet,
  marginalRate,
  progressiveTax,
  round2,
  roundTo5Sen,
  solveGross,
} from '../src/lib/payroll';
import { MY_RATES } from '../src/data/rates';

/** Cent-level equality helper: |a - b| < half a sen. */
const cents = (a: number, b: number) => expect(Math.abs(a - b)).toBeLessThan(0.005);

describe('rate table sanity', () => {
  it('tax bands are contiguous, ascending and end at Infinity', () => {
    const bands = MY_RATES.taxBands;
    expect(bands[0].from).toBe(0);
    for (let i = 1; i < bands.length; i++) {
      expect(bands[i].from).toBe(bands[i - 1].to);
      expect(bands[i].rate).toBeGreaterThan(bands[i - 1].rate);
    }
    expect(bands[bands.length - 1].to).toBe(Infinity);
  });
});

describe('progressiveTax', () => {
  // Cumulative tax at each band edge (YA2025 resident rates):
  //   5k:   0
  //   20k:  15,000 x 1%  = 150
  //   35k:  150 + 15,000 x 3%   = 600
  //   50k:  600 + 15,000 x 6%   = 1,500
  //   70k:  1,500 + 20,000 x 11% = 3,700
  //   100k: 3,700 + 30,000 x 19% = 9,400
  //   400k: 9,400 + 300,000 x 25% = 84,400
  //   600k: 84,400 + 200,000 x 26% = 136,400
  //   2M:   136,400 + 1,400,000 x 28% = 528,400
  //   2.5M: 528,400 + 500,000 x 30% = 678,400
  it.each([
    [0, 0],
    [5_000, 0],
    [5_001, 0.01],
    [20_000, 150],
    [35_000, 600],
    [50_000, 1_500],
    [70_000, 3_700],
    [100_000, 9_400],
    [400_000, 84_400],
    [600_000, 136_400],
    [2_000_000, 528_400],
    [2_500_000, 678_400],
  ])('tax on RM%d chargeable = RM%d', (income, tax) => {
    cents(progressiveTax(income), tax);
  });

  it('mid-band values', () => {
    // 22,788: 150 + 2,788 x 3% = 150 + 83.64 = 233.64
    expect(progressiveTax(22_788)).toBe(233.64);
    // 106,650: 9,400 + 6,650 x 25% = 9,400 + 1,662.50 = 11,062.50
    expect(progressiveTax(106_650)).toBe(11_062.5);
  });

  it('treats negative, NaN and Infinity-like garbage as zero income', () => {
    expect(progressiveTax(-10_000)).toBe(0);
    expect(progressiveTax(NaN)).toBe(0);
    expect(progressiveTax(Number.NEGATIVE_INFINITY)).toBe(0);
  });

  it('is monotonic non-decreasing', () => {
    let prev = -1;
    for (let i = 0; i <= 2_600_000; i += 1_337) {
      const t = progressiveTax(i);
      expect(t).toBeGreaterThanOrEqual(prev);
      prev = t;
    }
  });

  it('accepts a custom band table', () => {
    const flat = [{ from: 0, to: Infinity, rate: 0.1 }];
    expect(progressiveTax(12_345, flat)).toBe(1_234.5);
  });
});

describe('marginalRate', () => {
  it.each([
    [0, 0],
    [4_999, 0],
    // At exactly 5,000 the *next* ringgit is taxed at 1%.
    [5_000, 0.01],
    [5_001, 0.01],
    [19_999, 0.01],
    [20_000, 0.03],
    [35_000, 0.06],
    [50_000, 0.11],
    [70_000, 0.19],
    [100_000, 0.25],
    [400_000, 0.26],
    [600_000, 0.28],
    [2_000_000, 0.3],
    [50_000_000, 0.3],
  ])('marginal rate at RM%d = %d', (income, rate) => {
    expect(marginalRate(income)).toBe(rate);
  });

  it('negative / NaN income → bottom band', () => {
    expect(marginalRate(-1)).toBe(0);
    expect(marginalRate(NaN)).toBe(0);
  });
});

describe('rounding helpers', () => {
  it('roundTo5Sen rounds to the nearest 0.05', () => {
    expect(roundTo5Sen(16.665)).toBe(16.65); // 333.3 -> 333 -> 16.65
    expect(roundTo5Sen(6.666)).toBe(6.65); // 133.32 -> 133
    expect(roundTo5Sen(6.02)).toBe(6); // 120.4 -> 120
    expect(roundTo5Sen(58.3275)).toBe(58.35); // 1166.55 -> 1167
    expect(roundTo5Sen(15)).toBe(15);
  });
  it('round2 avoids float drift', () => {
    expect(round2(1.005)).toBe(1.01);
    expect(round2(0.1 + 0.2)).toBe(0.3);
  });
  it('epfAmount rounds up to the next ringgit', () => {
    expect(epfAmount(54, 0.11)).toBe(6); // 5.94 -> 6
    expect(epfAmount(55, 0.11)).toBe(7); // 6.05 -> 7
    expect(epfAmount(3_000, 0.11)).toBe(330); // exact, no extra ringgit
    expect(epfAmount(3_333, 0.11)).toBe(367); // 366.63 -> 367
    expect(epfAmount(-100, 0.11)).toBe(0);
  });
});

describe('computePay — worked examples', () => {
  it('RM3,000/month, no bonus: rebate wipes out the tax', () => {
    // EPF 3,000 x 11% = 330; SOCSO 3,000 x 0.5% = 15; EIS 3,000 x 0.2% = 6
    // Annual gross 36,000; EPF 3,960 (capped relief 4,000 → 3,960 claimable)
    // SOCSO+EIS 180 + 72 = 252 (< 350 cap)
    // Reliefs 9,000 + 3,960 + 252 = 13,212 → chargeable 22,788
    // Tax 150 + 2,788 x 3% = 233.64; chargeable ≤ 35k → rebate min(400, 233.64) = 233.64 → tax 0
    const p = computePay({ monthlyGross: 3_000 });
    expect(p.monthly).toEqual({ gross: 3_000, epf: 330, socso: 15, eis: 6, tax: 0, net: 2_649 });
    expect(p.annual.gross).toBe(36_000);
    expect(p.annual.epf).toBe(3_960);
    expect(p.annual.socso).toBe(180);
    expect(p.annual.eis).toBe(72);
    expect(p.annual.reliefs).toBe(13_212);
    expect(p.annual.chargeableIncome).toBe(22_788);
    expect(p.annual.taxBeforeRebate).toBe(233.64);
    expect(p.annual.rebate).toBe(233.64);
    expect(p.annual.tax).toBe(0);
    // Net 36,000 - 3,960 - 180 - 72 = 31,788
    expect(p.annual.net).toBe(31_788);
    expect(p.averageMonthlyNet).toBe(2_649);
    expect(p.effectiveTaxRate).toBe(0);
    expect(p.marginalTaxRate).toBe(0.03);
    // Employer: ≤ RM5,000 → 13% = 390; SOCSO 1.75% = 52.50; EIS 0.2% = 6
    // Cost 36,000 + 390 x 12 + (52.50 + 6) x 12 = 36,000 + 4,680 + 702 = 41,382
    expect(p.employer).toEqual({ epfMonthly: 390, socsoMonthly: 52.5, eisMonthly: 6, annualCost: 41_382 });
  });

  it('RM4,500 + 1 bonus month + RM1,500 lifestyle relief', () => {
    // EPF 495/month; bonus 4,500 → EPF 495. SOCSO 22.50, EIS 9.
    // Annual gross 54,000 + 4,500 = 58,500; EPF 495 x 13 = 6,435 (relief capped 4,000)
    // SOCSO 270 + EIS 108 = 378 → relief capped 350
    // Reliefs 9,000 + 4,000 + 350 + 1,500 = 14,850 → chargeable 43,650
    // Tax 600 + 8,650 x 6% = 600 + 519 = 1,119; no rebate (> 35k)
    // Regular-month tax: salary-only chargeable 54,000 - 14,850 = 39,150 -> 600 + 4,150 x 6% = 849 / 12 = 70.75
    // Monthly net 4,500 - 495 - 22.50 - 9 - 70.75 = 3,902.75 (bonus tax 1,119 - 849 = 270 hits the bonus month)
    // Annual net 58,500 - 6,435 - 270 - 108 - 1,119 = 50,568 → avg 4,214
    const p = computePay({ monthlyGross: 4_500, bonusMonths: 1, lifestyleRelief: 1_500 });
    expect(p.annual.bonus).toBe(4_500);
    expect(p.annual.gross).toBe(58_500);
    expect(p.annual.epf).toBe(6_435);
    expect(p.annual.reliefs).toBe(14_850);
    expect(p.annual.chargeableIncome).toBe(43_650);
    expect(p.annual.taxBeforeRebate).toBe(1_119);
    expect(p.annual.rebate).toBe(0);
    expect(p.annual.tax).toBe(1_119);
    expect(p.monthly.tax).toBe(70.75);
    expect(p.annual.bonusTax).toBe(270);
    expect(p.monthly.net).toBe(3_902.75);
    expect(p.annual.net).toBe(50_568);
    expect(p.averageMonthlyNet).toBe(4_214);
    expect(p.marginalTaxRate).toBe(0.06);
    cents(p.effectiveTaxRate, 1_119 / 58_500);
    // Employer 13%: 585/month + 585 on bonus; SOCSO 78.75; EIS 9
    // Cost 58,500 + 7,020 + 585 + (78.75 + 9) x 12 = 58,500 + 7,020 + 585 + 1,053 = 67,158
    expect(p.employer).toEqual({ epfMonthly: 585, socsoMonthly: 78.75, eisMonthly: 9, annualCost: 67_158 });
  });

  it('lifestyle relief is capped at RM2,500', () => {
    const capped = computePay({ monthlyGross: 4_500, lifestyleRelief: 99_999 });
    const atCap = computePay({ monthlyGross: 4_500, lifestyleRelief: 2_500 });
    expect(capped.annual.reliefs).toBe(atCap.annual.reliefs);
  });

  it('RM10,000: SOCSO/EIS hit the RM6,000 ceiling, employer EPF is 12%', () => {
    // EPF 1,100; SOCSO 6,000 x 0.5% = 30; EIS 6,000 x 0.2% = 12
    // Annual gross 120,000; EPF 13,200 (relief 4,000); SOCSO 360 + EIS 144 = 504 → relief 350
    // Reliefs 13,350 → chargeable 106,650 → tax 9,400 + 6,650 x 25% = 11,062.50
    // Monthly tax 921.875 → 921.88; monthly net 10,000 - 1,100 - 30 - 12 - 921.88 = 7,936.12
    // Annual net 120,000 - 13,200 - 360 - 144 - 11,062.50 = 95,233.50
    const p = computePay({ monthlyGross: 10_000 });
    expect(p.monthly).toEqual({ gross: 10_000, epf: 1_100, socso: 30, eis: 12, tax: 921.88, net: 7_936.12 });
    expect(p.annual.chargeableIncome).toBe(106_650);
    expect(p.annual.tax).toBe(11_062.5);
    expect(p.annual.net).toBe(95_233.5);
    expect(p.averageMonthlyNet).toBe(7_936.13); // 95,233.50 / 12 = 7,936.125 → .13
    expect(p.marginalTaxRate).toBe(0.25);
    // Employer: 12% = 1,200; SOCSO 6,000 x 1.75% = 105; EIS 12
    // Cost 120,000 + 14,400 + (105 + 12) x 12 = 135,804
    expect(p.employer).toEqual({ epfMonthly: 1_200, socsoMonthly: 105, eisMonthly: 12, annualCost: 135_804 });
  });

  it('SOCSO/EIS are identical for every wage above the ceiling', () => {
    const a = computePay({ monthlyGross: 6_000 });
    const b = computePay({ monthlyGross: 25_000 });
    expect(b.monthly.socso).toBe(a.monthly.socso);
    expect(b.monthly.eis).toBe(a.monthly.eis);
    expect(b.employer.socsoMonthly).toBe(a.employer.socsoMonthly);
  });

  it('employer EPF switches from 13% to 12% just above RM5,000', () => {
    expect(computePay({ monthlyGross: 5_000 }).employer.epfMonthly).toBe(650); // 13%
    expect(computePay({ monthlyGross: 5_001 }).employer.epfMonthly).toBe(601); // 600.12 → 601
    // Allowance counts toward the wage for the threshold: 4,800 + 300 = 5,100 → 12% = 612
    expect(computePay({ monthlyGross: 4_800, monthlyAllowance: 300 }).employer.epfMonthly).toBe(612);
  });

  it('EPF rounds up and SOCSO/EIS round to 5 sen (RM3,333)', () => {
    // EPF 366.63 → 367; SOCSO 16.665 → 16.65; EIS 6.666 → 6.65
    // Employer EPF 433.29 → 434; employer SOCSO 58.3275 → 58.35; employer EIS 6.65
    const p = computePay({ monthlyGross: 3_333 });
    expect(p.monthly.epf).toBe(367);
    expect(p.monthly.socso).toBe(16.65);
    expect(p.monthly.eis).toBe(6.65);
    expect(p.employer.epfMonthly).toBe(434);
    expect(p.employer.socsoMonthly).toBe(58.35);
    expect(p.employer.eisMonthly).toBe(6.65);
    // Net 3,333 - 367 - 16.65 - 6.65 = 2,942.70 (tax rebated to zero)
    expect(p.monthly.net).toBe(2_942.7);
  });

  it('RM3,010: EIS 6.02 rounds down to 6.00, SOCSO is exactly 15.05', () => {
    const p = computePay({ monthlyGross: 3_010 });
    expect(p.monthly.socso).toBe(15.05);
    expect(p.monthly.eis).toBe(6);
    expect(p.monthly.epf).toBe(332); // 331.10 → 332
  });

  it('rebate applies at exactly RM35,000 chargeable but not at RM35,001', () => {
    // RM5,000/month: gross 60,000; reliefs 9,000 + 4,000 + 350 = 13,350 → 46,650 chargeable.
    // otherReliefs 11,650 → chargeable 35,000 → tax 600 - 400 rebate = 200.
    const at = computePay({ monthlyGross: 5_000, otherReliefs: 11_650 });
    expect(at.annual.chargeableIncome).toBe(35_000);
    expect(at.annual.rebate).toBe(400);
    expect(at.annual.tax).toBe(200);
    // One ringgit less relief → chargeable 35,001 → tax 600.06, no rebate.
    const over = computePay({ monthlyGross: 5_000, otherReliefs: 11_649 });
    expect(over.annual.chargeableIncome).toBe(35_001);
    expect(over.annual.rebate).toBe(0);
    expect(over.annual.tax).toBe(600.06);
  });

  it('allowance is a wage, but bonus months are on basic only', () => {
    const p = computePay({ monthlyGross: 3_000, monthlyAllowance: 500, bonusMonths: 2 });
    expect(p.monthlyWage).toBe(3_500);
    expect(p.annual.bonus).toBe(6_000);
    expect(p.annual.gross).toBe(3_500 * 12 + 6_000);
    expect(p.monthly.epf).toBe(385);
  });

  it('zero salary → everything zero', () => {
    const p = computePay({ monthlyGross: 0 });
    expect(p.monthly).toEqual({ gross: 0, epf: 0, socso: 0, eis: 0, tax: 0, net: 0 });
    expect(p.annual.net).toBe(0);
    expect(p.annual.tax).toBe(0);
    expect(p.employer.annualCost).toBe(0);
    expect(p.effectiveTaxRate).toBe(0);
    expect(p.marginalTaxRate).toBe(0);
  });

  it('negative and NaN inputs are treated as zero', () => {
    const zero = computePay({ monthlyGross: 0 });
    expect(computePay({ monthlyGross: -5_000 })).toEqual(zero);
    expect(computePay({ monthlyGross: NaN })).toEqual(zero);
    expect(computePay({ monthlyGross: Infinity })).toEqual(zero);
    const base = computePay({ monthlyGross: 4_000 });
    expect(
      computePay({
        monthlyGross: 4_000,
        monthlyAllowance: -300,
        bonusMonths: NaN,
        lifestyleRelief: -1,
        otherReliefs: NaN,
        zakat: -50,
      }),
    ).toEqual(base);
  });

  it('bad EPF rates fall back to 11% or cap at 100%', () => {
    expect(computePay({ monthlyGross: 3_000, epfEmployeeRate: -0.5 }).monthly.epf).toBe(330);
    expect(computePay({ monthlyGross: 3_000, epfEmployeeRate: NaN }).monthly.epf).toBe(330);
    expect(computePay({ monthlyGross: 3_000, epfEmployeeRate: 5 }).monthly.epf).toBe(3_000);
    expect(computePay({ monthlyGross: 3_000, epfEmployeeRate: 0 }).monthly.epf).toBe(0);
    // Voluntary 13% employee rate: 390
    expect(computePay({ monthlyGross: 3_000, epfEmployeeRate: 0.13 }).monthly.epf).toBe(390);
  });

  it('zakat larger than tax only reduces tax to zero', () => {
    // RM10,000 → tax 11,062.50; zakat 20,000 → only 11,062.50 offsets
    const p = computePay({ monthlyGross: 10_000, zakat: 20_000 });
    expect(p.annual.zakat).toBe(11_062.5);
    expect(p.annual.tax).toBe(0);
    expect(p.annual.net).toBe(120_000 - 13_200 - 360 - 144);
    // Partial zakat 1,062.50 → tax exactly 10,000
    expect(computePay({ monthlyGross: 10_000, zakat: 1_062.5 }).annual.tax).toBe(10_000);
  });

  it('zakat is not counted on top of a rebate (tax already zero)', () => {
    const p = computePay({ monthlyGross: 3_000, zakat: 500 });
    expect(p.annual.zakat).toBe(0);
    expect(p.annual.tax).toBe(0);
  });
});

describe('computePay — invariants', () => {
  it('monthly and annual net never fall as gross rises (RM1..30,000 step 250)', () => {
    let prevM = -Infinity;
    let prevA = -Infinity;
    for (let g = 1; g <= 30_000; g += 250) {
      const p = computePay({ monthlyGross: g });
      expect(p.monthly.net).toBeGreaterThanOrEqual(prevM);
      expect(p.annual.net).toBeGreaterThanOrEqual(prevA);
      prevM = p.monthly.net;
      prevA = p.annual.net;
    }
  });

  it('annual.net == gross - epf - socso - eis - tax to the cent', () => {
    const inputs = [
      { monthlyGross: 1_234.56 },
      { monthlyGross: 3_333, bonusMonths: 1.5 },
      { monthlyGross: 7_777, monthlyAllowance: 450, bonusMonths: 2, lifestyleRelief: 2_500, zakat: 300 },
      { monthlyGross: 55_000, bonusMonths: 6 },
    ];
    for (let g = 1; g <= 30_000; g += 373) inputs.push({ monthlyGross: g, bonusMonths: (g % 4) / 2 } as any);
    for (const input of inputs) {
      const p = computePay(input);
      const a = p.annual;
      cents(a.net, a.gross - a.epf - a.socso - a.eis - a.tax);
      cents(a.tax, a.taxBeforeRebate - a.rebate - a.zakat);
      expect(a.tax).toBeGreaterThanOrEqual(0);
      expect(a.chargeableIncome).toBeGreaterThanOrEqual(0);
      cents(p.monthly.net, p.monthly.gross - p.monthly.epf - p.monthly.socso - p.monthly.eis - p.monthly.tax);
      expect(p.employer.annualCost).toBeGreaterThanOrEqual(a.gross);
    }
  });
});

describe('solveGross / grossForMonthlyNet / grossForAnnualNet', () => {
  const monthlyNet = (g: number, base = {}) => computePay({ ...base, monthlyGross: g }).monthly.net;
  const annualNet = (g: number, base = {}) => computePay({ ...base, monthlyGross: g }).annual.net;

  it.each([100, 1_500, 2_649, 3_000, 4_000, 7_936.12, 12_345, 25_000])(
    'grossForMonthlyNet(%d) is the boundary ringgit',
    (target) => {
      const r = grossForMonthlyNet(target);
      expect(monthlyNet(r)).toBeGreaterThanOrEqual(target);
      expect(monthlyNet(r - 1)).toBeLessThan(target);
    },
  );

  it('exact known nets solve back to their gross', () => {
    expect(grossForMonthlyNet(2_649)).toBe(3_000);
    expect(grossForMonthlyNet(7_936.12)).toBe(10_000);
    expect(grossForAnnualNet(95_233.5)).toBe(10_000);
  });

  it.each([10_000, 31_788, 50_568, 120_000, 400_000])('grossForAnnualNet(%d) with bonus is the boundary', (target) => {
    const base = { bonusMonths: 1, lifestyleRelief: 1_500 };
    const r = grossForAnnualNet(target, base);
    expect(annualNet(r, base)).toBeGreaterThanOrEqual(target);
    expect(annualNet(r - 1, base)).toBeLessThan(target);
  });

  it('keeps allowance in the base input', () => {
    const base = { monthlyAllowance: 800 };
    const r = grossForMonthlyNet(5_000, base);
    expect(monthlyNet(r, base)).toBeGreaterThanOrEqual(5_000);
    expect(monthlyNet(r - 1, base)).toBeLessThan(5_000);
  });

  it('target 0, negative or NaN → 0', () => {
    expect(grossForMonthlyNet(0)).toBe(0);
    expect(grossForAnnualNet(0)).toBe(0);
    expect(grossForMonthlyNet(-100)).toBe(0);
    expect(grossForMonthlyNet(NaN)).toBe(0);
  });

  it('unreachable target → Infinity', () => {
    expect(solveGross(1, () => 0)).toBe(Number.POSITIVE_INFINITY);
    expect(grossForMonthlyNet(Infinity)).toBe(0); // non-finite target is rejected up front
  });

  it('handles the RM35k rebate cliff without violating the boundary property', () => {
    // Around RM4,029/month chargeable income crosses 35,000 and net drops by ~RM389/yr,
    // so net is not strictly monotonic. The solver must still return a valid boundary.
    for (let g = 4_000; g <= 4_080; g += 3) {
      const target = annualNet(g);
      const r = grossForAnnualNet(target);
      expect(annualNet(r)).toBeGreaterThanOrEqual(target);
      expect(annualNet(r - 1)).toBeLessThan(target);
    }
  });
});

describe('solveGross safety window', () => {
  it('never recommends a salary that a small raise would push back below the target', () => {
    for (let target = 3_400; target <= 3_700; target += 7) {
      const r = grossForMonthlyNet(target);
      expect(computePay({ monthlyGross: r }).monthly.net).toBeGreaterThanOrEqual(target);
      for (let g = r; g <= r + 600; g += 1) {
        expect(computePay({ monthlyGross: g }).monthly.net).toBeGreaterThanOrEqual(target - Math.max(1, target * 0.0002));
      }
    }
  });
});

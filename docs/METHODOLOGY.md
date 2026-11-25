# Methodology

This document is the calculation spec for OfferLens MY. It mirrors the code
exactly; if the two ever disagree, the code is wrong or this document is out of
date, and either is a bug worth reporting.

| Topic | Code |
| --- | --- |
| Statutory rates (YA 2025) | [`src/data/rates.ts`](../src/data/rates.ts) |
| Take-home pay and the solver | [`src/lib/payroll.ts`](../src/lib/payroll.ts) |
| Offer scoring and negotiation | [`src/lib/offers.ts`](../src/lib/offers.ts) |
| Application tracker metrics | [`src/lib/tracker.ts`](../src/lib/tracker.ts) |
| CPI-adjusted living costs | [`src/lib/market.ts`](../src/lib/market.ts), see also [DATA.md](DATA.md) |

All figures are in Malaysian ringgit (RM). The rules below assume a Malaysian
tax resident below age 60.

---

## 1. Inputs and wages

| Input | Meaning | Default in the calculator |
| --- | --- | --- |
| `monthlyGross` | Basic monthly salary | RM4,500 |
| `monthlyAllowance` | Fixed monthly allowances | RM0 |
| `bonusMonths` | Expected bonus, in months of **basic** salary | 1 |
| `epfEmployeeRate` | Employee EPF share | 11% |
| `lifestyleRelief` | Lifestyle relief claimed for the year | RM1,500 |
| `otherReliefs` | Any other yearly reliefs (medical, education, PRS, SSPN, ...) | RM0 |
| `zakat` | Zakat paid in the year | RM0 |

Input hygiene: any amount that is negative, missing or not a finite number is
treated as 0. The EPF rate is capped at 100%; a negative rate falls back to the
default 11%.

Definitions used throughout:

```
monthlyWage = basic + allowance          (subject to EPF, SOCSO, EIS and tax)
bonus       = round2(basic x bonusMonths) (subject to EPF and tax only)
annualGross = round2(monthlyWage x 12 + bonus)
```

`round2` rounds to 2 decimal places (sen) with a small epsilon to avoid
floating-point drift.

## 2. EPF (KWSP)

```
epf(wage, rate) = ceil(round2(wage x rate))     // rounded UP to the next ringgit

epfMonthly = epf(monthlyWage, employeeRate)
epfBonus   = epf(bonus, employeeRate)           // bonus rounded separately
annualEpf  = epfMonthly x 12 + epfBonus
```

**Employer share:** 13% when `monthlyWage` is at or below RM5,000, otherwise
12%. The same rate is applied to the bonus. (KWSP's rule actually looks at wage
plus bonus in the month the bonus is paid; see *Known limitations*.)

## 3. SOCSO (PERKESO) and EIS

```
insurable    = min(monthlyWage, 6,000)
socsoMonthly = roundTo5Sen(insurable x 0.5%)    // employee, Employment Injury + Invalidity
eisMonthly   = roundTo5Sen(insurable x 0.2%)    // employee

employer SOCSO = roundTo5Sen(insurable x 1.75%)
employer EIS   = roundTo5Sen(insurable x 0.2%)
```

`roundTo5Sen(n) = round(n x 20) / 20`. The wage ceiling is RM6,000 a month for
both schemes, so the employee pays at most RM30.00 SOCSO and RM12.00 EIS.

**Bonus is excluded** from SOCSO and EIS.

PERKESO actually publishes contributions as a bracketed table of wage bands
(for example RM4,400.01 to RM4,500.00). Taking a flat percentage of the exact
wage and rounding to 5 sen **approximates** that table; results can differ from
a real payslip by a few sen.

## 4. Income tax (YA 2025)

### Reliefs

```
reliefs = 9,000                                  // individual
        + min(annualEpf, 4,000)                  // EPF
        + min(annualSocso + annualEis, 350)      // SOCSO + EIS
        + min(lifestyleRelief, 2,500)            // lifestyle
        + otherReliefs                           // uncapped, user-entered

chargeableIncome = max(0, round2(annualGross - reliefs))
```

### Progressive bands

| Chargeable income (RM) | Rate | Tax at top of band (RM) |
| --- | ---: | ---: |
| 0 – 5,000 | 0% | 0 |
| 5,001 – 20,000 | 1% | 150 |
| 20,001 – 35,000 | 3% | 600 |
| 35,001 – 50,000 | 6% | 1,500 |
| 50,001 – 70,000 | 11% | 3,700 |
| 70,001 – 100,000 | 19% | 9,400 |
| 100,001 – 400,000 | 25% | 84,400 |
| 400,001 – 600,000 | 26% | 136,400 |
| 600,001 – 2,000,000 | 28% | 528,400 |
| Above 2,000,000 | 30% | |

`taxBeforeRebate` is the sum over bands of `(min(income, band.to) - band.from) x rate`,
rounded to sen. The **marginal rate** shown in the app is the rate of the first
band whose upper bound is above the chargeable income.

### Rebate, zakat, final tax

```
rebate      = chargeableIncome <= 35,000 ? min(400, taxBeforeRebate) : 0
afterRebate = taxBeforeRebate - rebate
zakat       = min(zakat paid, afterRebate)       // ringgit-for-ringgit, cannot go below 0
tax         = afterRebate - zakat
```

### Yearly tax and regular-month tax

The same tax function (`taxFor(gross, epf)` in the code) is run twice:

```
// Full year: what you actually owe LHDN
annualTax  = taxFor(annualGross, annualEpf)

// Regular months: salary alone, as on a normal payslip
regularTax = taxFor(monthlyWage x 12, epfMonthly x 12)

bonusTax   = round2(max(0, annualTax - regularTax))   // reported as annual.bonusTax
monthlyTax = round2(min(regularTax, annualTax) / 12)
```

Both runs use the same SOCSO + EIS relief, lifestyle relief, other reliefs and
zakat; only the gross and the EPF relief differ (the EPF relief is still capped
at RM4,000). The rebate is decided separately for each run, so the regular-month
figure can include the RM400 rebate even when the full year does not.

The **monthly** tax and take-home therefore describe a regular (non-bonus)
month. The extra tax caused by the bonus, `bonusTax`, is deducted in the bonus
month on a real payslip and only affects the **yearly** figures here.

### How this compares with real PCB

Employers deduct PCB (Potongan Cukai Bulanan, also called MTD) using LHDN's
monthly formula, which projects the year's income from the months so far and
taxes additional remuneration such as a bonus in the month it is paid. The
app's approach (salary-only tax ÷ 12 for regular months, plus a separate bonus
tax) follows the same idea but is not that formula, so individual payslips can
differ. Over a full year the yearly tax here is what you owe, and any
difference in PCB is settled when you file your e-BE.

## 5. Take-home and employer cost

```
monthly net        = round2(monthlyWage - epfMonthly - socsoMonthly - eisMonthly - monthlyTax)
annual net         = round2(annualGross - annualEpf - annualSocso - annualEis - annualTax)
averageMonthlyNet  = round2(annual net / 12)         // bonus spread over the year
effectiveTaxRate   = annualTax / annualGross

employer annual cost = annualGross
                     + employerEpfMonthly x 12 + epf(bonus, employerRate)
                     + (employerSocso + employerEis) x 12
```

`annualSocso = round2(socsoMonthly x 12)` and likewise for EIS.

Monthly net **excludes** the bonus and the tax on it (it is what a regular
month's payslip shows). Annual net and `averageMonthlyNet` **include** both, and
`averageMonthlyNet` is the figure used to compare offers. With no bonus,
`regularTax` equals `annualTax`, so 12 x monthly net equals annual net (to the
sen, apart from the rounding of monthly tax).

## 6. Worked examples

Both examples use a 1-month bonus, RM1,500 lifestyle relief, 11% EPF, no
allowance, no other reliefs and no zakat (the calculator defaults).

### Example A: RM4,500 basic

| Step | Working | Result |
| --- | --- | ---: |
| Monthly wage | 4,500 + 0 | 4,500.00 |
| Bonus | 4,500 x 1 | 4,500.00 |
| EPF (monthly) | ceil(4,500 x 11% = 495.00) | 495.00 |
| EPF (bonus) | ceil(495.00) | 495.00 |
| SOCSO | 4,500 x 0.5% = 22.50 | 22.50 |
| EIS | 4,500 x 0.2% = 9.00 | 9.00 |
| Annual gross | 4,500 x 12 + 4,500 | 58,500.00 |
| Annual EPF | 495 x 12 + 495 | 6,435.00 |
| Annual SOCSO + EIS | 270.00 + 108.00 = 378.00 | 378.00 |
| Reliefs (year) | 9,000 + min(6,435, 4,000) + min(378, 350) + 1,500 | 14,850.00 |
| Chargeable income (year) | 58,500 − 14,850 | 43,650.00 |
| Tax before rebate (year) | 600 + (43,650 − 35,000) x 6% = 600 + 519 | 1,119.00 |
| Rebate (year) | 43,650 > 35,000, so none | 0.00 |
| **Annual tax** | | **1,119.00** |
| Regular-month reliefs | 9,000 + min(5,940, 4,000) + 350 + 1,500 | 14,850.00 |
| Regular chargeable income | 4,500 x 12 − 14,850 = 54,000 − 14,850 | 39,150.00 |
| Regular tax | 600 + (39,150 − 35,000) x 6% = 600 + 249; no rebate | 849.00 |
| Tax on the bonus (`bonusTax`) | 1,119 − 849 | 270.00 |
| Monthly tax | 849 / 12 | 70.75 |
| **Monthly take-home** | 4,500 − 495 − 22.50 − 9.00 − 70.75 | **3,902.75** |
| **Annual take-home** | 58,500 − 6,435 − 270 − 108 − 1,119 | **50,568.00** |
| Average monthly take-home | 50,568 / 12 | 4,214.00 |
| Effective / marginal tax rate | 1,119 / 58,500 | 1.9% / 6% |
| Employer EPF | ceil(4,500 x 13%) = 585 (wage ≤ RM5,000) | 585.00 / month |
| Employer SOCSO + EIS | 78.75 + 9.00 | 87.75 / month |
| Employer annual cost | 58,500 + 585 x 12 + 585 + 87.75 x 12 | 67,158.00 |

### Example B: RM10,000 basic (above the SOCSO/EIS ceiling)

| Step | Working | Result |
| --- | --- | ---: |
| Monthly wage | 10,000 + 0 | 10,000.00 |
| Bonus | 10,000 x 1 | 10,000.00 |
| EPF (monthly) | ceil(10,000 x 11% = 1,100.00) | 1,100.00 |
| EPF (bonus) | ceil(1,100.00) | 1,100.00 |
| SOCSO | capped: 6,000 x 0.5% | 30.00 |
| EIS | capped: 6,000 x 0.2% | 12.00 |
| Annual gross | 10,000 x 12 + 10,000 | 130,000.00 |
| Annual EPF | 1,100 x 12 + 1,100 | 14,300.00 |
| Annual SOCSO + EIS | 360.00 + 144.00 = 504.00 | 504.00 |
| Reliefs (year) | 9,000 + min(14,300, 4,000) + min(504, 350) + 1,500 | 14,850.00 |
| Chargeable income (year) | 130,000 − 14,850 | 115,150.00 |
| Tax before rebate (year) | 9,400 + (115,150 − 100,000) x 25% = 9,400 + 3,787.50 | 13,187.50 |
| Rebate (year) | none | 0.00 |
| **Annual tax** | | **13,187.50** |
| Regular-month reliefs | 9,000 + min(13,200, 4,000) + 350 + 1,500 | 14,850.00 |
| Regular chargeable income | 10,000 x 12 − 14,850 = 120,000 − 14,850 | 105,150.00 |
| Regular tax | 9,400 + (105,150 − 100,000) x 25% = 9,400 + 1,287.50 | 10,687.50 |
| Tax on the bonus (`bonusTax`) | 13,187.50 − 10,687.50 (all at the 25% marginal rate) | 2,500.00 |
| Monthly tax | 10,687.50 / 12 = 890.625 | 890.63 |
| **Monthly take-home** | 10,000 − 1,100 − 30 − 12 − 890.63 | **7,967.37** |
| **Annual take-home** | 130,000 − 14,300 − 360 − 144 − 13,187.50 | **102,008.50** |
| Average monthly take-home | 102,008.50 / 12 | 8,500.71 |
| Effective / marginal tax rate | 13,187.50 / 130,000 | 10.1% / 25% |
| Employer EPF | ceil(10,000 x 12%) = 1,200 (wage > RM5,000) | 1,200.00 / month |
| Employer SOCSO + EIS | 6,000 x 1.75% + 6,000 x 0.2% = 105.00 + 12.00 | 117.00 / month |
| Employer annual cost | 130,000 + 1,200 x 12 + 1,200 + 117 x 12 | 147,004.00 |

Note how the bonus is taxed at the marginal rate: in Example A the extra
RM4,500 of income costs RM270 of tax (6%), in Example B the extra RM10,000 costs
RM2,500 (25%).

Run `npm test` to check the engine against worked figures like these after any
rate change; `tests/payroll.test.ts` pins Example A step by step.

## 7. Comparing offers

For each offer, `computePay` is called with the offer's basic salary, allowance
and bonus months only. Offer comparison therefore uses the default 11% EPF and
the automatic reliefs (individual, EPF, SOCSO + EIS), and **not** the lifestyle
relief, other reliefs or zakat entered in the calculator. This keeps offers
comparable with each other.

```
livingCost        = CPI-adjusted monthly cost of the offer's city (0 if unknown)
monthlyDisposable = round2(averageMonthlyNet - livingCost - extraMonthlyCost)
savingsRate       = averageMonthlyNet > 0 ? monthlyDisposable / averageMonthlyNet : 0
```

### Score (0 to 100)

```
money(o)  = (disposable(o) - min) / (max - min)  // min-max across your offers;
                                                  // 1 for every offer if all are equal
rating(r) = (clamp(r, 1, 5) - 1) / 4              // 1 -> 0, 3 -> 0.5, 5 -> 1; invalid -> 3

raw   = wMoney x money + wGrowth x rating(growth)
      + wLearning x rating(learning) + wWorkLife x rating(workLife)
score = round(raw / (wMoney + wGrowth + wLearning + wWorkLife) x 100)
```

Default weights: money 40, growth 25, learning 20, work-life 15. Weights are
relative, so they do not need to add up to 100 (if they are all 0, the divisor
is treated as 1). Offers are ranked by score, with ties broken by higher monthly
disposable.

Because the money score is relative, the worst offer always scores 0 on money
and the best scores 1. Adding or removing an offer can change the other offers'
scores, but not their RM figures.

### Negotiation helper

Given a candidate offer and a benchmark offer, the helper finds the basic salary
the candidate needs so that its monthly disposable matches the benchmark's:

```
neededAverageNet = benchmark.monthlyDisposable + candidate city cost + candidate extraMonthlyCost
counter          = solveGross(neededAverageNet, b => b.averageMonthlyNet,
                              { allowance and bonus months of the candidate })
```

It solves on `averageMonthlyNet` directly (the same rounded figure disposable is
built from), so the answer cannot overshoot by a few ringgit due to rounding.

## 8. The solver (reverse calculator and negotiation)

`solveGross(target, metric)` returns a whole-ringgit basic salary for which
`metric` (monthly net, annual net or average monthly net) reaches `target`.

**Why not a plain binary search?** Take-home is *almost* monotonic in basic
salary, but not quite:

- EPF is rounded **up** to the next ringgit, so a one-ringgit raise can cost a
  few sen of take-home.
- The **RM400 rebate cliff**: the rebate disappears as soon as chargeable income
  passes RM35,000. With no bonus and no extra reliefs that happens just above
  RM4,025 a month:

  | Basic | Chargeable income | Rebate | Monthly take-home |
  | ---: | ---: | ---: | ---: |
  | 4,025 | 34,961.60 | 400 | 3,537.23 |
  | 4,029 | 35,009.60 | 0 | 3,506.75 |

  A RM4 raise lowers take-home by RM30.48 a month. A plain binary search could
  land on a salary just below the cliff that looks fine, while asking for
  slightly more would actually be worse.

**Algorithm:**

1. If `target` is not a positive finite number, return 0.
2. Start with `lo = 0, hi = 1,000` and double `hi` until `metric(hi) >= target`.
   If `hi` passes RM50,000,000, return infinity (unreachable target).
3. Binary-search integers between `lo` and `hi` for the smallest salary found
   to meet the target; call it `r`.
4. **Safety window:** walk every salary `g` from `r + 1` up to `r + 1,500`
   (`SAFETY_WINDOW`). If `metric(g)` drops below `target - wobble`, move the
   answer past the dip (`r = g + 1`); the window then extends from the new `r`.
   `wobble = max(RM1, 0.02% of target)` so that sen-level noise from EPF rounding
   is ignored, while real dips such as the rebate cliff are not.
5. Finally step `r` up until `metric(r) >= target`.

The result `r` satisfies `metric(r) >= target`, and every salary in the RM1,500
above it stays at or above the target within the 0.02% (minimum RM1) tolerance.
In other words it is a safe number to ask for: an employer offering slightly
more than you asked will not leave you worse off than your target.

Example: a monthly take-home target of RM4,000 with a 1-month bonus and RM1,500
lifestyle relief needs a basic salary of **RM4,620** (the target is a regular
month's take-home, so the bonus does not count towards it).

## 9. Application tracker metrics

Stages: Wishlist, Applied, Assessment, Interview, Offer, and Closed (stored as
`rejected`). The forward **pipeline** is Applied → Assessment → Interview →
Offer. Every stage change is recorded in the application's history with a date.

- **Furthest stage**: the furthest pipeline stage the application ever reached,
  across its history and current stage. Wishlist and Closed are not pipeline
  stages, so an application closed after an interview still counts as having
  reached Interview.
- **Total**: all applications.
- **Active**: applications not in Wishlist or Closed.
- **Submitted**: applications that reached at least Applied.
- **Response rate**: of submitted applications, the share that reached
  Assessment or beyond, or are now Closed (any reply, including a rejection).
- **Interview rate**: of submitted applications, the share that reached
  Interview or beyond.
- **Offers**: applications currently in the Offer stage.
- **Funnel**: for each pipeline stage, the number of applications whose furthest
  stage is at or beyond it.
- **Applications per week**: the last 8 weeks (weeks start on Monday), counting
  each application in the week of its first Applied date.
- **Follow-ups due**: applications with a follow-up date on or before today that
  are not in Offer or Closed, oldest first.

Dates are local calendar dates (`YYYY-MM-DD`).

## 10. Living costs

Each city has an editable RM baseline at January 2025 prices and a DOSM state
series. For every city you have not edited:

```
monthlyCost = round(baseline x latestCPI[state] / baselineCPI[state])
```

The factor is 1 if data is missing, and ignored if it falls outside 0.5 to 2.
Your saved city list is merged with the defaults, so a city added in a new
release appears alongside your own figures.
The baselines are the project's own rough estimates for a single young
professional (room rental, food, transport, utilities, phone), not official
statistics. Full details are in [DATA.md](DATA.md).

## 11. Known limitations

- **SOCSO and EIS** use a percentage of the exact wage rounded to 5 sen, not
  PERKESO's official wage-band table. Expect differences of a few sen.
- **Monthly tax** is the yearly tax on salary alone divided by 12, with the tax
  on the bonus shown separately. This is not LHDN's PCB (MTD) formula, so a real
  payslip can differ, especially in the bonus month.
- **Employer EPF rate** is chosen from the monthly wage alone. KWSP looks at
  wage plus bonus in the month the bonus is paid, so the employer share on a
  bonus month can be 12% where the app uses 13%. This affects employer cost
  only, not your take-home.
- **Reliefs** are simplified. The EPF relief is capped at RM4,000 (the EPF part
  of the combined RM7,000 EPF and life insurance relief). Spouse, child, parent,
  medical, education, PRS, SSPN and other reliefs are not added automatically;
  enter them as *other reliefs*.
- **Allowances** are treated as fully taxable wages subject to EPF, SOCSO and
  EIS. Tax-exempt allowances, perquisites and benefits-in-kind are not modelled.
- **Residency and age**: non-resident tax (flat rate) and the different rates
  for employees aged 60 and above are not modelled, though you can change the
  employee EPF rate.
- **One year of assessment** is modelled at a time (YA 2025 in this release).
- **Rounding**: all money is rounded to sen at each step shown above, so totals
  may differ by a sen from a calculation done in a single step.

## 12. Sources

- LHDN (Inland Revenue Board of Malaysia), income tax rates:
  <https://www.hasil.gov.my/en/individual/individual-life-cycle/income-declaration/tax-rate/>
- LHDN, tax reliefs:
  <https://www.hasil.gov.my/en/individual/individual-life-cycle/income-declaration/tax-reliefs/>
- KWSP (EPF), mandatory contribution rates:
  <https://www.kwsp.gov.my/en/employer/responsibilities/mandatory-contribution>
- PERKESO (SOCSO), Employment Injury scheme:
  <https://www.perkeso.gov.my/en/our-services/protection/employment-injury.html>
- PERKESO, Employment Insurance System:
  <https://www.perkeso.gov.my/en/our-services/employment-insurance-system.html>
- DOSM CPI via data.gov.my (CC BY 4.0):
  <https://data.gov.my/data-catalogue/cpi_state>,
  <https://data.gov.my/data-catalogue/cpi_headline>

These are estimates for planning and negotiation, not tax or financial advice.

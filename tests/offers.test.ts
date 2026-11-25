import { describe, it, expect } from 'vitest';
import { counterOffer, evaluateOffers, DEFAULT_WEIGHTS, type Offer, type Weights } from '../src/lib/offers';
import { DEFAULT_CITIES, type City } from '../src/data/cities';

const offer = (over: Partial<Offer> = {}): Offer => ({
  id: 'o',
  company: 'Co',
  role: 'Engineer',
  cityId: 'kl',
  monthlyGross: 5_000,
  monthlyAllowance: 0,
  bonusMonths: 0,
  extraMonthlyCost: 0,
  growth: 3,
  learning: 3,
  workLife: 3,
  ...over,
});

const cities: City[] = DEFAULT_CITIES.map((c) => ({ ...c }));

describe('evaluateOffers', () => {
  it('returns [] for no offers', () => {
    expect(evaluateOffers([], cities)).toEqual([]);
  });

  it('computes disposable from average net, city cost and extra cost', () => {
    // RM3,000 in KL: average monthly net 2,649 (see payroll tests) - 2,300 - 100 = 249
    const [e] = evaluateOffers([offer({ monthlyGross: 3_000, extraMonthlyCost: 100 })], cities);
    expect(e.pay.averageMonthlyNet).toBe(2_649);
    expect(e.livingCost).toBe(2_300);
    expect(e.city?.id).toBe('kl');
    expect(e.monthlyDisposable).toBe(249);
    expect(e.savingsRate).toBeCloseTo(249 / 2_649, 10);
  });

  it('ranks by score, keeping input order in the returned array', () => {
    const offers = [
      offer({ id: 'low', monthlyGross: 4_000 }),
      offer({ id: 'high', monthlyGross: 9_000 }),
      offer({ id: 'mid', monthlyGross: 6_000 }),
    ];
    const res = evaluateOffers(offers, cities);
    expect(res.map((e) => e.offer.id)).toEqual(['low', 'high', 'mid']);
    const rank = Object.fromEntries(res.map((e) => [e.offer.id, e.rank]));
    expect(rank).toEqual({ high: 1, mid: 2, low: 3 });
    // Money term: high = 1, low = 0. Ratings 3 → 0.5 each.
    // high: (40 x 1 + 60 x 0.5) / 100 = 70; low: (0 + 30) / 100 = 30
    const score = Object.fromEntries(res.map((e) => [e.offer.id, e.score]));
    expect(score.high).toBe(70);
    expect(score.low).toBe(30);
    expect(score.mid).toBeGreaterThan(30);
    expect(score.mid).toBeLessThan(70);
  });

  it('ratings can outweigh money', () => {
    const res = evaluateOffers(
      [
        offer({ id: 'rich', monthlyGross: 9_000, growth: 1, learning: 1, workLife: 1 }),
        offer({ id: 'nice', monthlyGross: 8_500, growth: 5, learning: 5, workLife: 5 }),
      ],
      cities,
    );
    // rich: 40 x 1 + 0 = 40; nice: 40 x 0 + 60 x 1 = 60
    expect(res.find((e) => e.offer.id === 'rich')!.score).toBe(40);
    expect(res.find((e) => e.offer.id === 'nice')!.score).toBe(60);
    expect(res.find((e) => e.offer.id === 'nice')!.rank).toBe(1);
  });

  it('a city with lower living cost can win on disposable', () => {
    // Same pay: Ipoh (1,450) beats KL (2,300) by exactly RM850 disposable
    const res = evaluateOffers([offer({ id: 'kl', cityId: 'kl' }), offer({ id: 'ipoh', cityId: 'ipoh' })], cities);
    const kl = res.find((e) => e.offer.id === 'kl')!;
    const ipoh = res.find((e) => e.offer.id === 'ipoh')!;
    expect(ipoh.monthlyDisposable - kl.monthlyDisposable).toBeCloseTo(850, 2);
    expect(ipoh.rank).toBe(1);
  });

  it('single offer gets full money score', () => {
    const [e] = evaluateOffers([offer({ growth: 5, learning: 5, workLife: 5 })], cities);
    expect(e.score).toBe(100);
    expect(e.rank).toBe(1);
    const [w] = evaluateOffers([offer({ growth: 1, learning: 1, workLife: 1 })], cities);
    expect(w.score).toBe(40); // money weight 40 out of 100
  });

  it('all weights zero → score 0, ties broken by disposable', () => {
    const zero: Weights = { money: 0, growth: 0, learning: 0, workLife: 0 };
    const res = evaluateOffers(
      [offer({ id: 'a', monthlyGross: 4_000 }), offer({ id: 'b', monthlyGross: 7_000 })],
      cities,
      zero,
    );
    expect(res.every((e) => e.score === 0)).toBe(true);
    expect(res.every((e) => Number.isFinite(e.score))).toBe(true);
    expect(res.find((e) => e.offer.id === 'b')!.rank).toBe(1);
  });

  it('only money weight → 100 for best, 0 for worst', () => {
    const res = evaluateOffers(
      [offer({ id: 'a', monthlyGross: 4_000 }), offer({ id: 'b', monthlyGross: 7_000 })],
      cities,
      { money: 1, growth: 0, learning: 0, workLife: 0 },
    );
    expect(res.map((e) => e.score)).toEqual([0, 100]);
  });

  it('missing city → zero living cost and undefined city', () => {
    const [e] = evaluateOffers([offer({ cityId: 'atlantis', monthlyGross: 3_000 })], cities);
    expect(e.city).toBeUndefined();
    expect(e.livingCost).toBe(0);
    expect(e.monthlyDisposable).toBe(2_649);
  });

  it('out-of-range / NaN ratings are clamped (NaN → neutral 3)', () => {
    const [a] = evaluateOffers([offer({ growth: 99, learning: -4, workLife: NaN })], cities);
    // money 1 x 40 + growth 1 x 25 + learning 0 x 20 + workLife 0.5 x 15 = 72.5 → 73
    expect(a.score).toBe(73);
  });

  it('zero salary does not divide by zero in savings rate', () => {
    const [e] = evaluateOffers([offer({ monthlyGross: 0 })], cities);
    expect(e.savingsRate).toBe(0);
    expect(e.monthlyDisposable).toBe(-2_300);
  });

  it('default weights sum to 100', () => {
    const w = DEFAULT_WEIGHTS;
    expect(w.money + w.growth + w.learning + w.workLife).toBe(100);
  });
});

describe('counterOffer', () => {
  const disposableAt = (o: Offer, gross: number) =>
    evaluateOffers([{ ...o, monthlyGross: gross }], cities)[0].monthlyDisposable;

  const cases: [string, Offer, Offer][] = [
    [
      'Penang candidate vs KL benchmark',
      offer({ id: 'c', cityId: 'penang', monthlyGross: 4_300, monthlyAllowance: 300, bonusMonths: 1.5, extraMonthlyCost: 120 }),
      offer({ id: 'b', cityId: 'kl', monthlyGross: 6_500, bonusMonths: 2, extraMonthlyCost: 250 }),
    ],
    [
      'KL candidate vs remote benchmark',
      offer({ id: 'c', cityId: 'kl', monthlyGross: 5_000, extraMonthlyCost: 300 }),
      offer({ id: 'b', cityId: 'remote', monthlyGross: 4_000, bonusMonths: 1 }),
    ],
    [
      'high earner',
      offer({ id: 'c', cityId: 'jb', monthlyGross: 15_000, bonusMonths: 3 }),
      offer({ id: 'b', cityId: 'kl', monthlyGross: 22_000, bonusMonths: 4, monthlyAllowance: 1_000 }),
    ],
  ];

  it.each(cases)('%s: solved salary makes disposable >= benchmark (within RM15)', (_, candidate, bench) => {
    const benchmark = evaluateOffers([bench], cities)[0];
    const ask = counterOffer(candidate, benchmark, cities);
    expect(Number.isInteger(ask)).toBe(true);
    const got = disposableAt(candidate, ask);
    expect(got).toBeGreaterThanOrEqual(benchmark.monthlyDisposable - 0.01);
    expect(got - benchmark.monthlyDisposable).toBeLessThanOrEqual(15);
    // One ringgit less would fall short of the benchmark
    expect(disposableAt(candidate, ask - 1)).toBeLessThan(benchmark.monthlyDisposable);
  });

  it('benchmarking an offer against itself asks for its own salary (within a few ringgit)', () => {
    // Regression: RM6,000 + 1 bonus month has annual net 65,804.50 but averageMonthlyNet
    // 5,483.71 (x12 = 65,804.52). Solving on annual net asked for RM6,002.
    const o = offer({ monthlyGross: 6_000, bonusMonths: 1 });
    expect(counterOffer(o, evaluateOffers([o], cities)[0], cities)).toBe(6_000);
    for (let g = 1_000; g <= 20_000; g += 777) {
      const x = offer({ monthlyGross: g, bonusMonths: 1.5, monthlyAllowance: 200, extraMonthlyCost: 80 });
      const ask = counterOffer(x, evaluateOffers([x], cities)[0], cities);
      // Net pay is not strictly monotonic (EPF rounds up to the ringgit, so +RM1 gross can
      // cost 5-60 sen of net), so binary search may land a couple of ringgit above g.
      expect(ask).toBeLessThanOrEqual(g + 5);
      expect(ask).toBeGreaterThanOrEqual(g - 5);
      expect(disposableAt(x, ask)).toBeGreaterThanOrEqual(evaluateOffers([x], cities)[0].monthlyDisposable);
    }
  });

  it('negative needed net → 0 ask', () => {
    const poor = evaluateOffers([offer({ monthlyGross: 0, cityId: 'kl' })], cities)[0]; // disposable -2,300
    expect(counterOffer(offer({ cityId: 'remote' }), poor, cities)).toBe(0);
  });
});

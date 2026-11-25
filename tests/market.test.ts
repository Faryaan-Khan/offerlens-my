import { describe, it, expect, vi, afterEach } from 'vitest';
import { adjustCities, cpiFactor, fetchMarket, isMarketData, type MarketData } from '../src/lib/market';
import { DEFAULT_CITIES, type City } from '../src/data/cities';

const market = (overrides: Partial<MarketData> = {}): MarketData => ({
  generatedAt: '2026-11-25T00:00:00Z',
  source: 'test',
  baseline: {
    'W.P. Kuala Lumpur': { date: '2025-09-01', index: 100 },
    Selangor: { date: '2025-09-01', index: 100 },
    Johor: { date: '2025-09-01', index: 100 },
    Perak: { date: '2025-09-01', index: 100 },
  },
  latest: {
    'W.P. Kuala Lumpur': { date: '2026-10-01', index: 103.45 },
    Selangor: { date: '2026-10-01', index: 300 }, // absurd
    Johor: { date: '2026-10-01', index: 40 }, // absurd the other way
  },
  ...overrides,
});

describe('isMarketData', () => {
  it('accepts a well-formed document', () => {
    expect(isMarketData(market())).toBe(true);
    expect(isMarketData({ generatedAt: 'x', baseline: {}, latest: {} })).toBe(true);
  });
  it.each([
    ['null', null],
    ['number', 3],
    ['string', 'x'],
    ['missing generatedAt', { baseline: {}, latest: {} }],
    ['generatedAt not string', { generatedAt: 1, baseline: {}, latest: {} }],
    ['missing latest', { generatedAt: 'x', baseline: {} }],
    ['null baseline', { generatedAt: 'x', baseline: null, latest: {} }],
    ['index 0', { generatedAt: 'x', baseline: { A: { date: 'd', index: 0 } }, latest: {} }],
    ['negative index', { generatedAt: 'x', baseline: {}, latest: { A: { date: 'd', index: -1 } } }],
    ['NaN index', { generatedAt: 'x', baseline: {}, latest: { A: { date: 'd', index: NaN } } }],
    ['string index', { generatedAt: 'x', baseline: {}, latest: { A: { date: 'd', index: '100' } } }],
    ['date not string', { generatedAt: 'x', baseline: {}, latest: { A: { date: 20250901, index: 100 } } }],
    ['null point', { generatedAt: 'x', baseline: {}, latest: { A: null } }],
  ])('rejects %s', (_, v) => {
    expect(isMarketData(v)).toBe(false);
  });
});

describe('cpiFactor', () => {
  const m = market();
  it('returns latest / baseline', () => {
    expect(cpiFactor(m, 'W.P. Kuala Lumpur')).toBeCloseTo(1.0345, 10);
  });
  it('returns 1 when market or state is unknown', () => {
    expect(cpiFactor(undefined, 'Selangor')).toBe(1);
    expect(cpiFactor(m, undefined)).toBe(1);
    expect(cpiFactor(m, 'Atlantis')).toBe(1);
    expect(cpiFactor(m, 'Perak')).toBe(1); // baseline but no latest
    expect(cpiFactor(m, 'constructor')).toBe(1); // prototype keys are not data
  });
  it('returns 1 for absurd factors (outside 0.5..2)', () => {
    expect(cpiFactor(m, 'Selangor')).toBe(1); // 3x
    expect(cpiFactor(m, 'Johor')).toBe(1); // 0.4x
  });
});

describe('adjustCities', () => {
  it('scales default cities from their default baseline, skipping custom and unknown cities', () => {
    const cities: City[] = [
      { id: 'kl', name: 'KL', monthlyCost: 9_999, cpiState: 'W.P. Kuala Lumpur' }, // stale value is replaced
      { id: 'pj', name: 'PJ', monthlyCost: 3_000, cpiState: 'Selangor', custom: true },
      { id: 'mine', name: 'My town', monthlyCost: 1_234 },
      { id: 'jb', name: 'JB', monthlyCost: 1_850, cpiState: 'Johor' },
    ];
    const out = adjustCities(cities, DEFAULT_CITIES, market());
    // KL: round(2,300 x 1.0345) = round(2,379.35) = 2,379
    expect(out[0].monthlyCost).toBe(2_379);
    expect(out[1]).toBe(cities[1]); // custom untouched (same reference)
    expect(out[2]).toBe(cities[2]); // not a default city
    expect(out[3].monthlyCost).toBe(1_850); // absurd factor → 1
    expect(cities[0].monthlyCost).toBe(9_999); // input not mutated
  });
  it('without market data, resets non-custom cities to defaults', () => {
    const out = adjustCities([{ id: 'ipoh', name: 'Ipoh', monthlyCost: 1 }], DEFAULT_CITIES, undefined);
    expect(out[0].monthlyCost).toBe(1_450);
  });
});

describe('fetchMarket', () => {
  afterEach(() => vi.unstubAllGlobals());
  const stub = (impl: () => Promise<unknown>) => vi.stubGlobal('fetch', vi.fn(impl));

  it('returns valid data', async () => {
    const data = market();
    stub(async () => ({ ok: true, json: async () => data }));
    expect(await fetchMarket('/x.json')).toEqual(data);
  });
  it('rejects invalid data, HTTP errors and network failures', async () => {
    stub(async () => ({ ok: true, json: async () => ({ hello: 1 }) }));
    expect(await fetchMarket('/x.json')).toBeUndefined();
    stub(async () => ({ ok: false, json: async () => market() }));
    expect(await fetchMarket('/x.json')).toBeUndefined();
    stub(async () => { throw new TypeError('offline'); });
    expect(await fetchMarket('/x.json')).toBeUndefined();
    stub(async () => ({ ok: true, json: async () => { throw new SyntaxError('bad json'); } }));
    expect(await fetchMarket('/x.json')).toBeUndefined();
  });
});

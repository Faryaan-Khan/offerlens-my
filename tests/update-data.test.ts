import { describe, it, expect } from 'vitest';
// @ts-ignore - plain ESM script without type declarations
import * as upd from '../scripts/update-data.mjs';

const { pickLatest, buildLatest, mergeMarket, extractRows, sameSeries, validateMarket } = upd as any;

const NOW = new Date('2026-12-01T01:17:00Z');

const stateRows = [
  { state: 'Selangor', date: '2025-08-01', division: 'overall', index: 135.1 },
  { state: 'Selangor', date: '2025-09-01', division: 'overall', index: 135.9 },
  { state: 'Selangor', date: '2025-07-01', division: 'overall', index: 134.8 },
  { state: 'Johor', date: '2025-09-01', division: 'overall', index: 134.6 },
  { state: 'Johor', date: '2025-10-01', division: '01', index: 170.2 }, // food division
  { state: 'Johor', date: '2025-10-01', division: 'transport', index: 120 },
];

const seed = {
  generatedAt: '2026-11-25T00:00:00Z',
  source: 'seed',
  baseline: {
    Selangor: { date: '2025-09-01', index: 135.9 },
    Malaysia: { date: '2025-09-01', index: 133.4 },
  },
  latest: {
    Selangor: { date: '2025-09-01', index: 135.9 },
    Malaysia: { date: '2025-09-01', index: 133.4 },
  },
};

describe('pickLatest', () => {
  it('selects the most recent overall point per state regardless of order', () => {
    expect(pickLatest(stateRows)).toEqual({
      Selangor: { date: '2025-09-01', index: 135.9 },
      Johor: { date: '2025-09-01', index: 134.6 },
    });
  });

  it('ignores non-overall divisions', () => {
    const out = pickLatest([{ state: 'Perak', date: '2025-10-01', division: '01', index: 150 }]);
    expect(out).toEqual({});
  });

  it('drops malformed rows', () => {
    const rows = [
      null,
      'garbage',
      { state: 'Sabah', date: '2025-10-01', division: 'overall', index: 'n/a' },
      { state: 'Sabah', date: '2025-10-01', division: 'overall', index: NaN },
      { state: 'Sabah', date: '2025-10-01', division: 'overall', index: -5 },
      { state: 'Sabah', date: 'October', division: 'overall', index: 130 },
      { state: '', date: '2025-10-01', division: 'overall', index: 130 },
      { date: '2025-10-01', division: 'overall', index: 130 },
      { state: 'Sabah', date: '2025-08-01', division: 'overall', index: 129.5 },
    ];
    expect(pickLatest(rows)).toEqual({ Sabah: { date: '2025-08-01', index: 129.5 } });
  });

  it('accepts numeric strings and YYYY-MM dates', () => {
    const out = pickLatest([{ state: 'Perak', date: '2025-10', division: 'overall', index: '132.4' }]);
    expect(out).toEqual({ Perak: { date: '2025-10-01', index: 132.4 } });
  });

  it('maps headline rows onto Malaysia via buildLatest', () => {
    const headline = [
      { date: '2025-09-01', division: 'overall', index: 133.4 },
      { date: '2025-10-01', division: 'overall', index: 133.7 },
      { date: '2025-10-01', division: '01', index: 160 },
    ];
    const latest = buildLatest(stateRows, headline);
    expect(latest.Malaysia).toEqual({ date: '2025-10-01', index: 133.7 });
    expect(latest.Selangor).toEqual({ date: '2025-09-01', index: 135.9 });
  });
});

describe('extractRows', () => {
  it('handles a bare array or a wrapping object', () => {
    expect(extractRows([1, 2])).toEqual([1, 2]);
    expect(extractRows({ data: [1] })).toEqual([1]);
    expect(extractRows({ meta: {}, whatever: [3] })).toEqual([3]);
    expect(extractRows(null)).toEqual([]);
    expect(extractRows({ error: 'x' })).toEqual([]);
  });
});

describe('mergeMarket', () => {
  it('preserves the existing baseline when latest moves', () => {
    const { market, changed } = mergeMarket(
      seed,
      { Selangor: { date: '2025-10-01', index: 136.3 } },
      { now: NOW },
    );
    expect(changed).toBe(true);
    expect(market.baseline.Selangor).toEqual({ date: '2025-09-01', index: 135.9 });
    expect(market.latest.Selangor).toEqual({ date: '2025-10-01', index: 136.3 });
    // states not in this fetch keep their previous value
    expect(market.latest.Malaysia).toEqual(seed.latest.Malaysia);
    expect(market.generatedAt).toBe('2026-12-01T01:17:00Z');
    expect(validateMarket(market)).toBe(true);
  });

  it('sets a baseline only the first time a state appears', () => {
    const { market } = mergeMarket(seed, { Johor: { date: '2025-10-01', index: 134.9 } }, { now: NOW });
    expect(market.baseline.Johor).toEqual({ date: '2025-10-01', index: 134.9 });
    const again = mergeMarket(market, { Johor: { date: '2025-11-01', index: 135.2 } }, { now: NOW }).market;
    expect(again.baseline.Johor).toEqual({ date: '2025-10-01', index: 134.9 });
  });

  it('rebaseline resets baseline to latest', () => {
    const { market, changed } = mergeMarket(
      seed,
      { Selangor: { date: '2025-10-01', index: 136.3 } },
      { rebaseline: true, now: NOW },
    );
    expect(changed).toBe(true);
    expect(market.baseline).toEqual(market.latest);
  });

  it('detects no change and keeps generatedAt', () => {
    const { market, changed } = mergeMarket(
      seed,
      { Selangor: { date: '2025-09-01', index: 135.9 }, Malaysia: { date: '2025-09-01', index: 133.4 } },
      { now: NOW },
    );
    expect(changed).toBe(false);
    expect(market.generatedAt).toBe(seed.generatedAt);
    expect(market.source).toBe(seed.source);
  });

  it('starts fresh from a missing or corrupt file', () => {
    for (const existing of [undefined, { baseline: 'x', latest: [] }]) {
      const { market, changed } = mergeMarket(existing, { Perak: { date: '2025-09-01', index: 131.9 } }, { now: NOW });
      expect(changed).toBe(true);
      expect(market.baseline).toEqual({ Perak: { date: '2025-09-01', index: 131.9 } });
      expect(validateMarket(market)).toBe(true);
    }
  });

  it('ignores a fetched point older than the stored latest', () => {
    const { market, changed } = mergeMarket(seed, { Selangor: { date: '2025-08-01', index: 135.1 } }, { now: NOW });
    expect(changed).toBe(false);
    expect(market.latest.Selangor).toEqual(seed.latest.Selangor);
  });

  it('sameSeries ignores key order', () => {
    expect(sameSeries({ a: { date: 'd', index: 1 }, b: { date: 'd', index: 2 } },
      { b: { date: 'd', index: 2 }, a: { date: 'd', index: 1 } })).toBe(true);
  });
});

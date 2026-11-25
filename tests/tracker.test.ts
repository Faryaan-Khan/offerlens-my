import { describe, it, expect } from 'vitest';
import {
  appliedOn,
  computeStats,
  furthestStage,
  moveTo,
  PIPELINE,
  STAGES,
  todayISO,
  weekStart,
  type Application,
  type Stage,
  type StageEvent,
} from '../src/lib/tracker';

const app = (id: string, stage: Stage, history: StageEvent[] = [], followUpOn?: string): Application => ({
  id,
  company: `Co ${id}`,
  role: 'Dev',
  source: 'LinkedIn',
  stage,
  history,
  followUpOn,
});
const ev = (stage: Stage, on: string): StageEvent => ({ stage, on });

describe('moveTo', () => {
  it('returns a new object and records history without mutating the input', () => {
    const a = app('1', 'applied', [ev('applied', '2026-11-01')]);
    const snapshot = structuredClone(a);
    const b = moveTo(a, 'interview', '2026-11-10');
    expect(b).not.toBe(a);
    expect(b.history).not.toBe(a.history);
    expect(b.stage).toBe('interview');
    expect(b.history).toEqual([ev('applied', '2026-11-01'), ev('interview', '2026-11-10')]);
    expect(a).toEqual(snapshot);
  });

  it('same stage is a no-op returning the same reference', () => {
    const a = app('1', 'applied', [ev('applied', '2026-11-01')]);
    expect(moveTo(a, 'applied', '2026-11-02')).toBe(a);
  });

  it('defaults the date to today', () => {
    const b = moveTo(app('1', 'wishlist'), 'applied');
    expect(b.history[0].on).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe('furthestStage / appliedOn', () => {
  it('wishlist only → -1', () => {
    expect(furthestStage(app('1', 'wishlist'))).toBe(-1);
  });
  it('rejected after interview keeps interview (2)', () => {
    const a = app('1', 'rejected', [ev('applied', '2026-10-01'), ev('interview', '2026-10-10'), ev('rejected', '2026-10-20')]);
    expect(furthestStage(a)).toBe(PIPELINE.indexOf('interview'));
    expect(furthestStage(a)).toBe(2);
  });
  it('current stage counts even without history', () => {
    expect(furthestStage(app('1', 'offer'))).toBe(3);
  });
  it('moving backwards does not lose progress', () => {
    const a = app('1', 'applied', [ev('applied', '2026-10-01'), ev('assessment', '2026-10-05'), ev('applied', '2026-10-06')]);
    expect(furthestStage(a)).toBe(1);
  });
  it('appliedOn returns the first applied date', () => {
    const a = app('1', 'applied', [ev('applied', '2026-10-01'), ev('assessment', '2026-10-05'), ev('applied', '2026-10-06')]);
    expect(appliedOn(a)).toBe('2026-10-01');
    expect(appliedOn(app('2', 'wishlist'))).toBeUndefined();
  });
});

describe('weekStart', () => {
  it.each([
    ['2026-01-01', '2025-12-29'], // Thursday, crosses a year boundary
    ['2026-11-23', '2026-11-23'], // Monday stays
    ['2026-11-25', '2026-11-23'], // Wednesday
    ['2026-11-29', '2026-11-23'], // Sunday belongs to the week before
    ['2026-03-01', '2026-02-23'], // Sunday, crosses month boundary (non-leap Feb)
    ['2024-03-01', '2024-02-26'], // Friday, leap year
    ['2027-01-01', '2026-12-28'], // Friday
    ['2026-12-31', '2026-12-28'],
  ])('weekStart(%s) = %s', (iso, expected) => {
    expect(weekStart(iso)).toBe(expected);
  });
});

describe('todayISO', () => {
  it('formats a local date as YYYY-MM-DD', () => {
    expect(todayISO(new Date(2026, 0, 5, 23, 59))).toBe('2026-01-05');
    expect(todayISO(new Date(2026, 11, 31, 0, 1))).toBe('2026-12-31');
  });
});

describe('computeStats', () => {
  // today = Wed 2026-11-25 → current week 2026-11-23; 8 buckets start 2026-10-05.
  const today = '2026-11-25';
  const apps: Application[] = [
    app('a1', 'wishlist'),
    app('a2', 'applied', [ev('applied', '2026-11-24')], '2026-11-20'),
    app('a3', 'assessment', [ev('applied', '2026-11-16'), ev('assessment', '2026-11-18')], '2026-11-25'),
    app('a4', 'rejected', [ev('applied', '2026-11-01'), ev('assessment', '2026-11-05'), ev('interview', '2026-11-10'), ev('rejected', '2026-11-15')], '2026-11-01'),
    app('a5', 'offer', [ev('applied', '2026-10-05'), ev('interview', '2026-10-20'), ev('offer', '2026-11-01')], '2026-11-01'),
    app('a6', 'rejected', [ev('applied', '2026-09-01'), ev('rejected', '2026-09-20')], '2026-11-26'),
    app('a7', 'applied', [ev('applied', '2026-11-22')], '2026-11-10'),
  ];
  const s = computeStats(apps, today);

  it('counts totals and stages', () => {
    expect(s.total).toBe(7);
    expect(s.byStage).toEqual({ wishlist: 1, applied: 2, assessment: 1, interview: 0, offer: 1, rejected: 2 });
    expect(s.active).toBe(4); // a2, a3, a5, a7
    expect(s.offers).toBe(1);
    expect(s.submitted).toBe(6); // everyone except the wishlist item
  });

  it('funnel uses furthest stage ever reached', () => {
    // applied: a2..a7 = 6; assessment+: a3, a4, a5 = 3 (a5 skipped assessment but passed it)
    // interview+: a4, a5 = 2; offer: a5 = 1
    expect(s.funnel.map((f) => [f.stage, f.count])).toEqual([
      ['applied', 6],
      ['assessment', 3],
      ['interview', 2],
      ['offer', 1],
    ]);
    expect(s.funnel[0].label).toBe('Applied');
  });

  it('response and interview rates', () => {
    // responded: a3, a4, a5 (moved on) + a6 (rejected) = 4 of 6
    expect(s.responseRate).toBeCloseTo(4 / 6, 12);
    // interviewed: a4, a5 = 2 of 6
    expect(s.interviewRate).toBeCloseTo(2 / 6, 12);
  });

  it('per-week buckets by application date', () => {
    expect(s.perWeek).toEqual([
      { week: '2026-10-05', count: 1 }, // a5
      { week: '2026-10-12', count: 0 },
      { week: '2026-10-19', count: 0 },
      { week: '2026-10-26', count: 1 }, // a4 applied Sunday 2026-11-01
      { week: '2026-11-02', count: 0 },
      { week: '2026-11-09', count: 0 },
      { week: '2026-11-16', count: 2 }, // a3 (Mon), a7 (Sun)
      { week: '2026-11-23', count: 1 }, // a2
    ]);
    // a6 applied 2026-09-01, outside the window
    expect(s.perWeek.reduce((n, w) => n + w.count, 0)).toBe(5);
  });

  it('overdue: due today or earlier, excluding closed and offers, oldest first', () => {
    expect(s.overdue.map((a) => a.id)).toEqual(['a7', 'a2', 'a3']);
  });

  it('per-week buckets across a year boundary', () => {
    const st = computeStats([app('x', 'applied', [ev('applied', '2026-01-01')])], '2026-01-07', 3);
    expect(st.perWeek).toEqual([
      { week: '2025-12-22', count: 0 },
      { week: '2025-12-29', count: 1 },
      { week: '2026-01-05', count: 0 },
    ]);
  });

  it('empty list → zero rates, no NaN', () => {
    const e = computeStats([], today);
    expect(e.responseRate).toBe(0);
    expect(e.interviewRate).toBe(0);
    expect(e.perWeek).toHaveLength(8);
    expect(e.funnel.every((f) => f.count === 0)).toBe(true);
    expect(Object.keys(e.byStage).sort()).toEqual([...STAGES].sort());
  });
});

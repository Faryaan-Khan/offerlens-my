import { describe, it, expect } from 'vitest';
import { defaultState, loadState, sanitizeState, saveState, STORAGE_KEY, SCHEMA_VERSION } from '../src/lib/storage';

class FakeStorage {
  map = new Map<string, string>();
  getItem(k: string) {
    return this.map.has(k) ? this.map.get(k)! : null;
  }
  setItem(k: string, v: string) {
    this.map.set(k, String(v));
  }
}

describe('sanitizeState — garbage in', () => {
  it.each([null, undefined, 42, 'hello', true, NaN])('%s → default state', (raw) => {
    expect(sanitizeState(raw)).toEqual(defaultState());
  });

  it('empty object / array → default state', () => {
    expect(sanitizeState({})).toEqual(defaultState());
    expect(sanitizeState([])).toEqual(defaultState());
  });

  it('defaultState returns fresh copies', () => {
    const a = defaultState();
    a.cities[0].monthlyCost = 1;
    a.weights.money = 0;
    expect(defaultState().cities[0].monthlyCost).not.toBe(1);
    expect(defaultState().weights.money).toBe(40);
  });

  it('clamps and coerces calculator numbers', () => {
    const s = sanitizeState({
      calculator: {
        monthlyGross: '5000',
        monthlyAllowance: -100,
        bonusMonths: 100,
        epfEmployeeRate: 5,
        lifestyleRelief: 'abc',
        otherReliefs: 1e12,
        zakat: Infinity,
      },
      targetNet: -5,
    });
    expect(s.calculator).toEqual({
      monthlyGross: 5_000,
      monthlyAllowance: 0,
      bonusMonths: 24,
      epfEmployeeRate: 1,
      lifestyleRelief: 1_500, // fallback
      otherReliefs: 1_000_000,
      zakat: 0, // non-finite → fallback 0
    });
    expect(s.targetNet).toBe(0);
    expect(s.version).toBe(SCHEMA_VERSION);
  });

  it('clamps weights and theme', () => {
    const s = sanitizeState({ weights: { money: -5, growth: 500, learning: 'x', workLife: 10 }, theme: 'neon' });
    expect(s.weights).toEqual({ money: 0, growth: 100, learning: 20, workLife: 10 });
    expect(s.theme).toBe('system');
    expect(sanitizeState({ theme: 'dark' }).theme).toBe('dark');
    expect(sanitizeState({ theme: 'light' }).theme).toBe('light');
  });

  it('truncates huge arrays', () => {
    const apps = Array.from({ length: 5_000 }, (_, i) => ({ id: `a${i}`, company: 'X', stage: 'applied' }));
    const offers = Array.from({ length: 120 }, (_, i) => ({ id: `o${i}` }));
    const cities = Array.from({ length: 80 }, (_, i) => ({ id: `c${i}`, monthlyCost: 1000 }));
    const history = Array.from({ length: 300 }, () => ({ stage: 'applied', on: '2026-01-01' }));
    const s = sanitizeState({ applications: [...apps.slice(0, 1).map((a) => ({ ...a, history })), ...apps.slice(1)], offers, cities });
    expect(s.applications).toHaveLength(2_000);
    expect(s.applications[0].history).toHaveLength(50);
    expect(s.offers).toHaveLength(50);
    // 50 saved cities are kept, plus the 9 defaults that were missing from the saved list
    expect(s.cities).toHaveLength(59);
  });

  it('drops non-object entries', () => {
    const s = sanitizeState({ offers: [null, 1, 'x', { company: 'Ok' }], applications: [null, [], 7, { company: 'A' }] });
    expect(s.offers.map((o) => o.company)).toEqual(['Ok']);
    // [] is an object, so it survives as an "Untitled" record
    expect(s.applications.map((a) => a.company)).toEqual(['Untitled', 'A']);
  });

  it('fixes bad stages and drops bad history entries and dates', () => {
    const s = sanitizeState({
      applications: [
        {
          id: 'x',
          company: 'Acme',
          stage: 'hired',
          history: [
            { stage: 'applied', on: '2026-01-05' },
            { stage: 'hired', on: '2026-01-06' },
            { stage: 'interview', on: '2026/01/07' },
            { stage: 'interview', on: 'yesterday' },
            { stage: 'interview', on: 20260108 },
            null,
            { stage: 'offer', on: '2026-01-09', extra: 'dropped' },
          ],
          followUpOn: 'next week',
        },
      ],
    });
    const a = s.applications[0];
    expect(a.stage).toBe('wishlist');
    expect(a.history).toEqual([
      { stage: 'applied', on: '2026-01-05' },
      { stage: 'offer', on: '2026-01-09' },
    ]);
    expect(a.followUpOn).toBeUndefined();
    expect(sanitizeState({ applications: [{ followUpOn: '2026-12-01' }] }).applications[0].followUpOn).toBe('2026-12-01');
  });

  it('keeps script strings as plain text but truncates them', () => {
    const xss = '<script>alert(1)</script>';
    const s = sanitizeState({
      offers: [{ company: xss, notes: xss.repeat(100) }],
      applications: [{ company: xss + 'x'.repeat(200), notes: 'n'.repeat(5_000), link: 'javascript:alert(1)' }],
    });
    expect(s.offers[0].company).toBe(xss);
    expect(s.offers[0].notes).toHaveLength(1_000);
    expect(s.applications[0].company).toHaveLength(80);
    expect(s.applications[0].company.startsWith(xss)).toBe(true);
    expect(s.applications[0].notes).toHaveLength(2_000);
    // unsafe schemes are dropped at load time (safeUrl() also guards at render time)
    expect(s.applications[0].link).toBeUndefined();
  });

  it('non-string text fields become empty / defaults', () => {
    const s = sanitizeState({ offers: [{ company: { evil: true }, role: 42, cityId: [] }] });
    expect(s.offers[0].company).toBe('Untitled');
    expect(s.offers[0].role).toBe('');
    expect(s.offers[0].cityId).toBe('kl');
    expect(typeof s.offers[0].id).toBe('string');
    expect(s.offers[0].id.length).toBeGreaterThan(0);
  });

  it('clamps offer ratings and money', () => {
    const [o] = sanitizeState({ offers: [{ growth: 10, learning: 0, workLife: 'x', bonusMonths: 99, monthlyGross: -1 }] }).offers;
    expect([o.growth, o.learning, o.workLife]).toEqual([5, 1, 3]);
    expect(o.bonusMonths).toBe(24);
    expect(o.monthlyGross).toBe(0);
  });

  it('cities: drops entries without a string id; custom only when === true', () => {
    const s = sanitizeState({
      cities: [{ id: 'kl', name: 'KL', monthlyCost: 2500, custom: 'true' }, { name: 'no id' }, null, { id: 'x', monthlyCost: -5, custom: true }],
    });
    // saved rows override defaults by id (keeping the default CPI series), missing defaults
    // are added back, and unknown-but-valid cities are appended
    expect(s.cities[0]).toEqual({ id: 'kl', name: 'KL', monthlyCost: 2_500, cpiState: 'W.P. Kuala Lumpur', custom: false });
    expect(s.cities.map((c) => c.id)).toEqual(['kl', 'pj', 'cyberjaya', 'penang', 'jb', 'ipoh', 'kk', 'kuching', 'remote', 'x']);
    expect(s.cities[s.cities.length - 1]).toEqual({ id: 'x', name: 'x', monthlyCost: 0, cpiState: undefined, custom: true });
  });

  it('cities: an offer city missing from a backup never costs RM0', () => {
    const s = sanitizeState({ cities: [{ id: 'penang', name: 'Penang', monthlyCost: 1_900 }] });
    expect(s.cities.find((c) => c.id === 'kl')?.monthlyCost).toBe(2_300);
    expect(s.cities.find((c) => c.id === 'penang')?.monthlyCost).toBe(1_900);
  });

  it('gives duplicate ids a fresh id so edits and deletes hit one row', () => {
    const s = sanitizeState({ offers: [{ id: 'x', company: 'A' }, { id: 'x', company: 'B' }], applications: [{ id: 'y' }, { id: 'y' }] });
    expect(new Set(s.offers.map((o) => o.id)).size).toBe(2);
    expect(s.offers[0].id).toBe('x');
    expect(new Set(s.applications.map((a) => a.id)).size).toBe(2);
  });

  it('rejects impossible calendar dates', () => {
    const s = sanitizeState({ applications: [{ id: 'a', stage: 'applied', followUpOn: '2026-13-45', history: [{ stage: 'applied', on: '2026-02-30' }] }] });
    expect(s.applications[0].followUpOn).toBeUndefined();
    expect(s.applications[0].history).toEqual([]);
  });

  it('does not propagate __proto__ pollution', () => {
    const s = sanitizeState(JSON.parse('{"__proto__": {"polluted": true}, "calculator": {"__proto__": {"x": 1}}}'));
    expect(({} as any).polluted).toBeUndefined();
    expect((s as any).polluted).toBeUndefined();
    expect(Object.keys(s.calculator).sort()).toEqual(
      ['bonusMonths', 'epfEmployeeRate', 'lifestyleRelief', 'monthlyAllowance', 'monthlyGross', 'otherReliefs', 'zakat'],
    );
  });

  it('drops unknown top-level fields', () => {
    const s = sanitizeState({ evil: 'x', calculator: { monthlyGross: 1 } }) as any;
    expect(s.evil).toBeUndefined();
  });
});

describe('save/load round-trip', () => {
  it('saves under the versioned key and loads an equal state', () => {
    const store = new FakeStorage();
    const st = defaultState();
    st.calculator.monthlyGross = 7_777;
    st.theme = 'dark';
    st.offers = [
      { id: 'o1', company: 'A', role: 'R', cityId: 'pj', monthlyGross: 5_000, monthlyAllowance: 100, bonusMonths: 1.5, extraMonthlyCost: 50, growth: 4, learning: 2, workLife: 5, notes: 'n' },
    ];
    st.applications = [
      { id: 'a1', company: 'B', role: 'R', source: 'JobStreet', link: 'https://example.com', stage: 'interview', history: [{ stage: 'applied', on: '2026-11-01' }, { stage: 'interview', on: '2026-11-10' }], followUpOn: '2026-11-30', notes: '' },
    ];
    // A sanitised state is a fixed point: sanitize(st) adds only normalised defaults
    // (e.g. custom: false on built-in cities), and round-tripping it changes nothing.
    const clean = sanitizeState(st);
    expect(clean.offers).toEqual(st.offers);
    expect(clean.applications).toEqual(st.applications);
    expect(clean.calculator).toEqual(st.calculator);
    expect(saveState(clean, store)).toBe(true);
    expect(store.map.has(STORAGE_KEY)).toBe(true);
    expect(loadState(store)).toEqual(clean);
    expect(sanitizeState(loadState(store))).toEqual(clean);
  });

  it('loadState: missing key → undefined', () => {
    expect(loadState(new FakeStorage())).toBeUndefined();
  });

  it('loadState: invalid JSON → undefined', () => {
    const store = new FakeStorage();
    store.setItem(STORAGE_KEY, '{not json');
    expect(loadState(store)).toBeUndefined();
  });

  it('loadState: valid JSON of the wrong shape is sanitised', () => {
    const store = new FakeStorage();
    store.setItem(STORAGE_KEY, '"just a string"');
    expect(loadState(store)).toEqual(defaultState());
  });

  it('loadState: throwing storage → undefined', () => {
    expect(loadState({ getItem: () => { throw new Error('denied'); } })).toBeUndefined();
  });

  it('saveState: throwing storage (quota) → false', () => {
    expect(saveState(defaultState(), { setItem: () => { throw new Error('QuotaExceededError'); } })).toBe(false);
  });
});

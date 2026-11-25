import { DEFAULT_CITIES, type City } from '../data/cities';
import { DEFAULT_WEIGHTS, type Offer, type Weights } from './offers';
import { STAGES, type Application } from './tracker';
import type { PayInput } from './payroll';
import { safeUrl, uid } from './format';

export const SCHEMA_VERSION = 1;
export const STORAGE_KEY = 'offerlens-my:v1';

export interface AppState {
  version: number;
  calculator: Required<Pick<PayInput, 'monthlyGross' | 'monthlyAllowance' | 'bonusMonths' | 'epfEmployeeRate' | 'lifestyleRelief' | 'otherReliefs' | 'zakat'>>;
  targetNet: number;
  offers: Offer[];
  weights: Weights;
  cities: City[];
  applications: Application[];
  theme: 'system' | 'light' | 'dark';
}

export const defaultState = (): AppState => ({
  version: SCHEMA_VERSION,
  calculator: {
    monthlyGross: 4_500,
    monthlyAllowance: 0,
    bonusMonths: 1,
    epfEmployeeRate: 0.11,
    lifestyleRelief: 1_500,
    otherReliefs: 0,
    zakat: 0,
  },
  targetNet: 4_000,
  offers: [],
  weights: { ...DEFAULT_WEIGHTS },
  cities: DEFAULT_CITIES.map((c) => ({ ...c })),
  applications: [],
  theme: 'system',
});

const num = (v: unknown, fallback: number, min = 0, max = 1e9): number => {
  if (typeof v !== 'number' && (typeof v !== 'string' || v.trim() === '')) return fallback;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
};
const str = (v: unknown, max = 200): string => (typeof v === 'string' ? v.slice(0, max) : '');
const isoDate = (v: unknown): string | undefined => {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return undefined;
  const d = new Date(`${v}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v ? v : undefined;
};

/**
 * Validate and normalise untrusted data (from localStorage or an imported file).
 * Unknown fields are dropped and every value is coerced to a safe type.
 */
export function sanitizeState(raw: unknown): AppState {
  const base = defaultState();
  if (!raw || typeof raw !== 'object') return base;
  const r = raw as Record<string, any>;
  const c = r.calculator ?? {};

  const parsedCities: City[] = Array.isArray(r.cities)
    ? r.cities
        .filter((x: any) => x && typeof x.id === 'string')
        .slice(0, 50)
        .map((x: any) => ({
          id: str(x.id, 40),
          name: str(x.name, 60) || str(x.id, 40),
          monthlyCost: num(x.monthlyCost, 0, 0, 100_000),
          cpiState: str(x.cpiState, 60) || undefined,
          custom: x.custom === true,
        }))
    : [];
  // Merge with the defaults: saved rows win by id, defaults missing from the saved
  // list are added back (so new cities in later releases appear, and offers never
  // point at a city that silently costs RM0), and extra saved cities are kept.
  const seenCity = new Set<string>();
  const uniqueCities = parsedCities.filter((c) => c.id && !seenCity.has(c.id) && seenCity.add(c.id));
  const cities: City[] = [
    ...base.cities.map((d) => {
      const saved = uniqueCities.find((c) => c.id === d.id);
      return saved ? { ...saved, cpiState: d.cpiState } : d;
    }),
    ...uniqueCities.filter((c) => !base.cities.some((d) => d.id === c.id)),
  ];

  const offers: Offer[] = Array.isArray(r.offers)
    ? r.offers.slice(0, 50).filter((o: any) => o && typeof o === 'object').map((o: any) => ({
        id: str(o.id, 60) || uid(),
        company: str(o.company, 80) || 'Untitled',
        role: str(o.role, 80),
        cityId: str(o.cityId, 40) || 'kl',
        monthlyGross: num(o.monthlyGross, 0, 0, 1_000_000),
        monthlyAllowance: num(o.monthlyAllowance, 0, 0, 1_000_000),
        bonusMonths: num(o.bonusMonths, 0, 0, 24),
        extraMonthlyCost: num(o.extraMonthlyCost, 0, 0, 100_000),
        growth: num(o.growth, 3, 1, 5),
        learning: num(o.learning, 3, 1, 5),
        workLife: num(o.workLife, 3, 1, 5),
        notes: str(o.notes, 1000),
      }))
    : [];

  const applications: Application[] = Array.isArray(r.applications)
    ? r.applications.slice(0, 2000).filter((a: any) => a && typeof a === 'object').map((a: any) => {
        const stage = (STAGES as readonly string[]).includes(a.stage) ? a.stage : 'wishlist';
        const history = Array.isArray(a.history)
          ? a.history
              .filter((h: any) => h && (STAGES as readonly string[]).includes(h.stage) && isoDate(h.on))
              .slice(0, 50)
              .map((h: any) => ({ stage: h.stage, on: h.on }))
          : [];
        return {
          id: str(a.id, 60) || uid(),
          company: str(a.company, 80) || 'Untitled',
          role: str(a.role, 80),
          source: str(a.source, 60),
          link: safeUrl(str(a.link, 500)) ? str(a.link, 500) : undefined,
          stage,
          history,
          followUpOn: isoDate(a.followUpOn),
          notes: str(a.notes, 2000),
        };
      })
    : [];

  // Duplicate ids (e.g. a hand-edited backup) would make edit/delete hit several rows.
  const dedupe = <T extends { id: string }>(rows: T[]): T[] => {
    const seen = new Set<string>();
    return rows.map((row) => {
      const id = seen.has(row.id) ? uid() : row.id;
      seen.add(id);
      return id === row.id ? row : { ...row, id };
    });
  };

  const w = r.weights ?? {};
  return {
    version: SCHEMA_VERSION,
    calculator: {
      monthlyGross: num(c.monthlyGross, base.calculator.monthlyGross, 0, 1_000_000),
      monthlyAllowance: num(c.monthlyAllowance, 0, 0, 1_000_000),
      bonusMonths: num(c.bonusMonths, base.calculator.bonusMonths, 0, 24),
      epfEmployeeRate: num(c.epfEmployeeRate, 0.11, 0, 1),
      lifestyleRelief: num(c.lifestyleRelief, base.calculator.lifestyleRelief, 0, 1_000_000),
      otherReliefs: num(c.otherReliefs, 0, 0, 1_000_000),
      zakat: num(c.zakat, 0, 0, 1_000_000),
    },
    targetNet: num(r.targetNet, base.targetNet, 0, 1_000_000),
    offers: dedupe(offers),
    weights: {
      money: num(w.money, DEFAULT_WEIGHTS.money, 0, 100),
      growth: num(w.growth, DEFAULT_WEIGHTS.growth, 0, 100),
      learning: num(w.learning, DEFAULT_WEIGHTS.learning, 0, 100),
      workLife: num(w.workLife, DEFAULT_WEIGHTS.workLife, 0, 100),
    },
    cities,
    applications: dedupe(applications),
    theme: r.theme === 'light' || r.theme === 'dark' ? r.theme : 'system',
  };
}

export function loadState(storage: Pick<Storage, 'getItem'> | undefined = safeStorage()): AppState | undefined {
  try {
    const raw = storage?.getItem(STORAGE_KEY);
    return raw ? sanitizeState(JSON.parse(raw)) : undefined;
  } catch {
    return undefined;
  }
}

export function saveState(state: AppState, storage: Pick<Storage, 'setItem'> | undefined = safeStorage()): boolean {
  try {
    storage?.setItem(STORAGE_KEY, JSON.stringify(state));
    return true;
  } catch {
    return false;
  }
}

function safeStorage(): Storage | undefined {
  try {
    return globalThis.localStorage;
  } catch {
    return undefined;
  }
}

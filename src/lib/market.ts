import type { City } from '../data/cities';

export interface CpiPoint {
  /** First day of the reference month, YYYY-MM-DD. */
  date: string;
  index: number;
}

/** Shape of public/data/market.json, written by scripts/update-data.mjs. */
export interface MarketData {
  generatedAt: string;
  source: string;
  /** CPI at the time the city baselines were set. */
  baseline: Record<string, CpiPoint>;
  /** Most recent CPI per state, plus 'Malaysia' for the national index. */
  latest: Record<string, CpiPoint>;
}

export function isMarketData(v: unknown): v is MarketData {
  if (!v || typeof v !== 'object') return false;
  const m = v as Record<string, unknown>;
  const okMap = (x: unknown) =>
    !!x && typeof x === 'object' &&
    Object.values(x as object).every((p: any) => p && typeof p.date === 'string' && Number.isFinite(p.index) && p.index > 0);
  return typeof m.generatedAt === 'string' && okMap(m.baseline) && okMap(m.latest);
}

/** Inflation factor for a state since the baseline, or 1 when unknown. */
export function cpiFactor(market: MarketData | undefined, state: string | undefined): number {
  if (!market || !state) return 1;
  const b = market.baseline[state];
  const l = market.latest[state];
  if (!b || !l) return 1;
  const f = l.index / b.index;
  // Guard against bad data: a monthly CPI series should never move this much.
  return f > 0.5 && f < 2 ? f : 1;
}

/** Apply CPI scaling to every city the user hasn't customised. */
export function adjustCities(cities: City[], defaults: City[], market: MarketData | undefined): City[] {
  return cities.map((c) => {
    if (c.custom) return c;
    const d = defaults.find((x) => x.id === c.id);
    if (!d) return c;
    return { ...c, monthlyCost: Math.round(d.monthlyCost * cpiFactor(market, d.cpiState)) };
  });
}

export async function fetchMarket(url = `${import.meta.env.BASE_URL}data/market.json`): Promise<MarketData | undefined> {
  try {
    const res = await fetch(url, { cache: 'no-cache' });
    if (!res.ok) return undefined;
    const data = await res.json();
    return isMarketData(data) ? data : undefined;
  } catch {
    return undefined;
  }
}

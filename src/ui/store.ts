import { DEFAULT_CITIES, type City } from '../data/cities';
import { adjustCities, type MarketData } from '../lib/market';
import { defaultState, loadState, saveState, STORAGE_KEY, type AppState } from '../lib/storage';
import { sampleApplications, sampleOffers } from '../data/sample';

type Listener = (s: AppState) => void;

let warnedSaveFailure = false;
function persist(s: AppState): void {
  if (saveState(s) || warnedSaveFailure) return;
  warnedSaveFailure = true;
  // Lazy import keeps the store free of UI dependencies in tests.
  import('./dom').then(({ toast }) =>
    toast("Couldn't save to this browser (storage full or blocked). Changes will be lost on reload; use Settings › Backup.", 'danger'),
  );
}

let state: AppState = initialState();
let market: MarketData | undefined;
const listeners = new Set<Listener>();

function initialState(): AppState {
  const saved = loadState();
  if (saved) return saved;
  // Unreadable data: keep a copy before demo data overwrites it, so it can be recovered.
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) localStorage.setItem(`${STORAGE_KEY}:corrupt-${Date.now()}`, raw);
  } catch {
    /* storage unavailable */
  }
  // First visit: show a populated, clearly-labelled demo so the dashboard isn't empty.
  return { ...defaultState(), offers: sampleOffers(), applications: sampleApplications() };
}

export const getState = (): AppState => state;

export function setState(update: Partial<AppState> | ((s: AppState) => Partial<AppState>)): void {
  const patch = typeof update === 'function' ? update(state) : update;
  state = { ...state, ...patch };
  persist(state);
  listeners.forEach((l) => l(state));
}

export function replaceState(next: AppState): void {
  state = next;
  persist(state);
  listeners.forEach((l) => l(state));
}

export const subscribe = (l: Listener): (() => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

export const setMarket = (m: MarketData | undefined): void => {
  market = m;
  listeners.forEach((l) => l(state));
};
export const getMarket = (): MarketData | undefined => market;

/** Cities with living costs adjusted for inflation since the baseline. */
export const effectiveCities = (): City[] => adjustCities(state.cities, DEFAULT_CITIES, market);

export const isDemoData = (): boolean =>
  state.offers.some((o) => o.id.startsWith('s-')) || state.applications.some((a) => a.id.startsWith('s-'));

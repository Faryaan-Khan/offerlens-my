#!/usr/bin/env node
/**
 * Refresh public/data/market.json with the latest Consumer Price Index from
 * the free, keyless data.gov.my / OpenDOSM API.
 *
 *   node scripts/update-data.mjs                 # fetch + write if changed
 *   node scripts/update-data.mjs --dry-run       # fetch + print, never write
 *   node scripts/update-data.mjs --rebaseline    # reset baseline = latest
 *   node scripts/update-data.mjs --fixtures dir  # read cpi_state.json and
 *                                                # cpi_headline.json from dir
 *   OFFERLENS_FIXTURES=dir node scripts/update-data.mjs   # same as --fixtures
 *   node scripts/update-data.mjs --out path.json # write elsewhere
 *
 * Zero dependencies; requires Node 20+ (global fetch).
 * Data: Department of Statistics Malaysia (DOSM), CC BY 4.0. See docs/DATA.md.
 */
import { readFile, writeFile, rename } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

export const NATIONAL = 'Malaysia';
export const SOURCE = 'OpenDOSM / data.gov.my (cpi_state, cpi_headline)';
export const ENDPOINTS = {
  cpi_state: 'https://api.data.gov.my/data-catalogue?id=cpi_state&sort=-date&filter=overall@division&limit=100',
  cpi_headline: 'https://api.data.gov.my/data-catalogue?id=cpi_headline&sort=-date&filter=overall@division&limit=50',
};
const USER_AGENT = 'offerlens-my-data-bot/1.0 (+scheduled CPI refresh)';

/* ------------------------------------------------------------------ */
/* Pure helpers (exported for tests)                                   */
/* ------------------------------------------------------------------ */

/** Accept a bare array or an object wrapping one ({data:[...]}, {rows:[...]}, ...). */
export function extractRows(payload) {
  if (Array.isArray(payload)) return payload;
  if (payload && typeof payload === 'object') {
    for (const key of ['data', 'rows', 'results', 'items', 'records']) {
      if (Array.isArray(payload[key])) return payload[key];
    }
    const arr = Object.values(payload).find(Array.isArray);
    if (arr) return arr;
  }
  return [];
}

/** Normalise "2025-09-01", "2025-09" or "2025-09-01T00:00:00" to YYYY-MM-DD, else null. */
export function normaliseDate(d) {
  if (typeof d !== 'string') return null;
  const m = /^(\d{4})-(\d{2})(?:-(\d{2}))?/.exec(d.trim());
  if (!m) return null;
  const [, y, mo, day = '01'] = m;
  if (+mo < 1 || +mo > 12 || +day < 1 || +day > 31) return null;
  return `${y}-${mo}-${day}`;
}

/** Parse a CPI index value; must be a finite, plausible positive number. */
export function parseIndex(v) {
  const n = typeof v === 'string' && v.trim() !== '' ? Number(v) : v;
  return typeof n === 'number' && Number.isFinite(n) && n > 1 && n < 10_000 ? n : null;
}

/**
 * Pick the most recent valid 'overall' CPI point per state.
 * @param {unknown[]} rows   raw API rows
 * @param {{ state?: string }} [opts]  force every row onto this key (used for
 *   cpi_headline, which has no state column → 'Malaysia')
 * @returns {Record<string, {date: string, index: number}>}
 */
export function pickLatest(rows, opts = {}) {
  const out = {};
  for (const r of Array.isArray(rows) ? rows : []) {
    if (!r || typeof r !== 'object') continue;
    const division = r.division ?? 'overall';
    if (String(division).toLowerCase() !== 'overall') continue;
    const state = opts.state ?? (typeof r.state === 'string' ? r.state.trim() : '');
    if (!state) continue;
    const date = normaliseDate(r.date);
    const index = parseIndex(r.index);
    if (!date || index === null) continue;
    const prev = out[state];
    if (!prev || date > prev.date) out[state] = { date, index };
  }
  return out;
}

/** Combine per-state and national series into one `latest` map. */
export function buildLatest(stateRows, headlineRows) {
  const latest = { ...pickLatest(stateRows) };
  const national = pickLatest(headlineRows, { state: NATIONAL })[NATIONAL];
  if (national) latest[NATIONAL] = national;
  // A 'Malaysia' row in cpi_state (if the API ever includes one) is only a fallback.
  return latest;
}

const samePoint = (a, b) => !!a && !!b && a.date === b.date && a.index === b.index;

/** Deep-equal for {state: {date,index}} maps, ignoring key order. */
export function sameSeries(a = {}, b = {}) {
  const ka = Object.keys(a);
  const kb = Object.keys(b);
  return ka.length === kb.length && ka.every((k) => samePoint(a[k], b[k]));
}

/**
 * Merge freshly fetched `latest` into the existing market file.
 * - baseline is kept; a state gets a baseline only the first time it appears
 *   (or all states are reset with { rebaseline: true }).
 * - states missing from this fetch keep their previous latest value, and a
 *   fetched point older than the stored one is ignored.
 * - generatedAt only changes when something changed.
 * @returns {{ market: object, changed: boolean }}
 */
export function mergeMarket(existing, latest, { rebaseline = false, now = new Date() } = {}) {
  const prev = existing && typeof existing === 'object' ? existing : {};
  const prevBaseline = isSeries(prev.baseline) ? prev.baseline : {};
  const prevLatest = isSeries(prev.latest) ? prev.latest : {};

  // Never move a series backwards (e.g. a stale API cache or partial response).
  const merged = { ...prevLatest };
  for (const [state, point] of Object.entries(latest ?? {})) {
    if (!merged[state] || point.date >= merged[state].date) merged[state] = point;
  }
  const nextLatest = sortKeys(merged);
  const nextBaseline = rebaseline ? { ...nextLatest } : { ...prevBaseline };
  if (!rebaseline) {
    for (const [state, point] of Object.entries(nextLatest)) {
      if (!nextBaseline[state]) nextBaseline[state] = point;
    }
  }
  const baseline = sortKeys(nextBaseline);

  const changed = !sameSeries(prevLatest, nextLatest) || !sameSeries(prevBaseline, baseline);
  const market = {
    generatedAt: changed || typeof prev.generatedAt !== 'string'
      ? now.toISOString().replace(/\.\d{3}Z$/, 'Z')
      : prev.generatedAt,
    source: changed || typeof prev.source !== 'string' ? SOURCE : prev.source,
    baseline,
    latest: nextLatest,
  };
  return { market, changed };
}

/** Same rules as isMarketData() in src/lib/market.ts. */
export function validateMarket(m) {
  return !!m && typeof m === 'object' && typeof m.generatedAt === 'string' &&
    isSeries(m.baseline) && isSeries(m.latest) && Object.keys(m.latest).length > 0;
}

function isSeries(x) {
  return !!x && typeof x === 'object' && !Array.isArray(x) &&
    Object.values(x).every((p) => p && typeof p.date === 'string' && Number.isFinite(p.index) && p.index > 0);
}

function sortKeys(obj) {
  return Object.fromEntries(Object.entries(obj).sort(([a], [b]) => a.localeCompare(b)));
}

/* ------------------------------------------------------------------ */
/* I/O                                                                 */
/* ------------------------------------------------------------------ */

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function fetchJson(url, { tries = 3, baseDelayMs = 1500, fetchImpl = globalThis.fetch } = {}) {
  let lastErr;
  for (let i = 1; i <= tries; i++) {
    try {
      const res = await fetchImpl(url, {
        headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
        signal: AbortSignal.timeout(30_000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
      return await res.json();
    } catch (err) {
      lastErr = err;
      if (i < tries) {
        const delay = baseDelayMs * 2 ** (i - 1);
        console.warn(`  attempt ${i}/${tries} failed for ${url}: ${err.message}; retrying in ${delay}ms`);
        await sleep(delay);
      }
    }
  }
  throw new Error(`fetch failed after ${tries} tries: ${url}: ${lastErr?.message}`);
}

async function loadRows(id, fixturesDir) {
  if (fixturesDir) {
    const file = path.resolve(fixturesDir, `${id}.json`);
    return extractRows(JSON.parse(await readFile(file, 'utf8')));
  }
  return extractRows(await fetchJson(ENDPOINTS[id]));
}

async function readExisting(file) {
  try {
    return JSON.parse(await readFile(file, 'utf8'));
  } catch (err) {
    if (err.code !== 'ENOENT') console.warn(`  could not read ${file} (${err.message}); starting fresh`);
    return undefined;
  }
}

function parseArgs(argv, env) {
  const args = { dryRun: false, rebaseline: false, fixtures: env.OFFERLENS_FIXTURES || '', out: '' };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--dry-run') args.dryRun = true;
    else if (a === '--rebaseline') args.rebaseline = true;
    else if (a === '--fixtures') args.fixtures = argv[++i] ?? '';
    else if (a.startsWith('--fixtures=')) args.fixtures = a.slice(11);
    else if (a === '--out') args.out = argv[++i] ?? '';
    else if (a.startsWith('--out=')) args.out = a.slice(6);
    else if (a === '-h' || a === '--help') args.help = true;
    else throw new Error(`unknown argument: ${a}`);
  }
  return args;
}

export async function main(argv = process.argv.slice(2), env = process.env) {
  const args = parseArgs(argv, env);
  if (args.help) {
    console.log('usage: node scripts/update-data.mjs [--dry-run] [--rebaseline] [--fixtures DIR] [--out FILE]');
    return 0;
  }
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const outFile = path.resolve(args.out || path.join(root, 'public/data/market.json'));

  const [stateRes, headRes] = await Promise.allSettled([
    loadRows('cpi_state', args.fixtures),
    loadRows('cpi_headline', args.fixtures),
  ]);
  for (const [name, r] of [['cpi_state', stateRes], ['cpi_headline', headRes]]) {
    if (r.status === 'rejected') console.error(`! ${name}: ${r.reason?.message ?? r.reason}`);
  }
  const latest = buildLatest(
    stateRes.status === 'fulfilled' ? stateRes.value : [],
    headRes.status === 'fulfilled' ? headRes.value : [],
  );
  if (Object.keys(latest).length === 0) {
    console.error('! no valid CPI rows from either dataset; leaving market.json untouched');
    return 1;
  }
  console.log(`Fetched ${Object.keys(latest).length} series:`);
  for (const [s, p] of Object.entries(latest)) console.log(`  ${s.padEnd(22)} ${p.date}  ${p.index}`);

  const existing = await readExisting(outFile);
  const { market, changed } = mergeMarket(existing, latest, { rebaseline: args.rebaseline });
  if (!validateMarket(market)) {
    console.error('! merged result failed validation; not writing');
    return 1;
  }
  if (!changed) {
    console.log(`No change; ${path.relative(process.cwd(), outFile)} left as is.`);
    return 0;
  }
  const json = JSON.stringify(market, null, 2) + '\n';
  if (args.dryRun) {
    console.log('--dry-run: would write:\n' + json);
    return 0;
  }
  const tmp = `${outFile}.tmp-${process.pid}`;
  await writeFile(tmp, json, 'utf8');
  await rename(tmp, outFile); // atomic: never leave a half-written file
  console.log(`Wrote ${path.relative(process.cwd(), outFile)}`);
  return 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().then(
    (code) => process.exit(code),
    (err) => {
      console.error(`! ${err.stack ?? err}`);
      process.exit(1);
    },
  );
}

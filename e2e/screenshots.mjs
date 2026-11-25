#!/usr/bin/env node
/**
 * Regenerates the README screenshots in docs/screenshots/ from the built-in demo data.
 *
 *   npm run build && node e2e/screenshots.mjs
 *
 * Serves dist/ with `vite preview` on a spare port (or uses BASE_URL if set, e.g.
 * BASE_URL=http://localhost:5173 for a running dev server). Set PW_CHROMIUM_PATH to
 * use an already-installed Chromium instead of Playwright's bundled one.
 */
import { spawn } from 'node:child_process';
import { mkdir, stat } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(root, 'docs', 'screenshots');
const PORT = Number(process.env.SCREENSHOT_PORT || 4179);
const MAX_BYTES = 1.5 * 1024 * 1024;
const CHART_SETTLE_MS = 1500;

const desktop = { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 };
const mobile = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true };

/** @type {{ file: string; hash: string; context: object; prepare?: (page: import('playwright').Page) => Promise<void> }[]} */
const shots = [
  { file: 'overview-light.png', hash: '#/', context: { ...desktop, colorScheme: 'light' } },
  { file: 'take-home-light.png', hash: '#/take-home', context: { ...desktop, colorScheme: 'light' } },
  {
    file: 'offers-light.png',
    hash: '#/offers',
    context: { ...desktop, colorScheme: 'light' },
    // Scroll past the page header and summary so the offer cards and the chart share the frame.
    prepare: async (page) => {
      await page.evaluate(() => {
        const first = document.querySelector('[data-testid="offer-card"]');
        if (first) window.scrollTo(0, first.getBoundingClientRect().top + window.scrollY - 24);
      });
    },
  },
  { file: 'tracker-light.png', hash: '#/tracker', context: { ...desktop, colorScheme: 'light' } },
  { file: 'overview-dark.png', hash: '#/', context: { ...desktop, colorScheme: 'dark' } },
  {
    file: 'mobile-take-home.png',
    hash: '#/take-home',
    context: { ...mobile, colorScheme: 'light' },
    // On phones the form comes first; scroll to the results so the shot shows the answer.
    prepare: async (page) => {
      await page.evaluate(() => {
        const card = document.querySelector('[data-testid="monthly-net"]')?.closest('.card');
        if (card) window.scrollTo(0, card.getBoundingClientRect().top + window.scrollY - 16);
      });
    },
  },
];

async function waitForServer(url, timeoutMs = 30_000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url);
      if (res.ok) return;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`Server at ${url} did not start within ${timeoutMs / 1000}s`);
}

async function startPreview() {
  if (process.env.BASE_URL) return { baseURL: process.env.BASE_URL.replace(/\/$/, ''), stop: () => {} };
  const child = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], {
    cwd: root,
    stdio: 'ignore',
    detached: process.platform !== 'win32',
  });
  const baseURL = `http://localhost:${PORT}`;
  const stop = () => {
    try {
      if (process.platform === 'win32') child.kill();
      else process.kill(-child.pid);
    } catch {
      /* already exited */
    }
  };
  try {
    await waitForServer(baseURL);
  } catch (e) {
    stop();
    throw e;
  }
  return { baseURL, stop };
}

async function capture(browser, baseURL, shot, scaleOverride) {
  const context = await browser.newContext({
    ...shot.context,
    ...(scaleOverride ? { deviceScaleFactor: scaleOverride } : {}),
    locale: 'en-MY',
    timezoneId: 'Asia/Kuala_Lumpur',
  });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`${baseURL}/${shot.hash}`, { waitUntil: 'networkidle' });
  await page.locator('#view .view').waitFor();
  await page.evaluate(() => document.fonts.ready);
  if (shot.prepare) await shot.prepare(page);
  await page.waitForTimeout(CHART_SETTLE_MS); // let ApexCharts finish animating
  const path = join(outDir, shot.file);
  await page.screenshot({ path, fullPage: false, animations: 'disabled', caret: 'hide' });
  await context.close();
  if (errors.length) throw new Error(`${shot.file}: page errors\n${errors.join('\n')}`);
  return (await stat(path)).size;
}

async function main() {
  await mkdir(outDir, { recursive: true });
  const { baseURL, stop } = await startPreview();
  const browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM_PATH || undefined });
  try {
    for (const shot of shots) {
      let size = await capture(browser, baseURL, shot);
      // Keep the repo light: retake oversized desktop shots at a lower density.
      if (size > MAX_BYTES && !shot.context.isMobile) size = await capture(browser, baseURL, shot, 1.5);
      console.log(`${shot.file.padEnd(24)} ${(size / 1024).toFixed(0).padStart(5)} KB`);
    }
  } finally {
    await browser.close();
    stop();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

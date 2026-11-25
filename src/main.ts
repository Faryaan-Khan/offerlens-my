import '@tabler/core/dist/css/tabler.min.css';
import '@tabler/icons-webfont/dist/tabler-icons.min.css';
import './styles.css';
import { Collapse } from '@tabler/core';

import { destroyCharts } from './ui/charts';
import { $, $$ } from './ui/dom';
import { getMarket, getState, setMarket, setState, subscribe } from './ui/store';
import { fetchMarket } from './lib/market';
import { esc } from './lib/format';
import type { View } from './ui/view';
import { overviewView } from './ui/views/overview';
import { calculatorView } from './ui/views/calculator';
import { offersView } from './ui/views/offers';
import { trackerView } from './ui/views/tracker';
import { settingsView } from './ui/views/settings';
import { aboutView } from './ui/views/about';

const routes: Record<string, View> = {
  '/': overviewView,
  '/take-home': calculatorView,
  '/offers': offersView,
  '/tracker': trackerView,
  '/settings': settingsView,
  '/about': aboutView,
};

let cleanup: (() => void) | undefined;

function renderNav(path: string): void {
  const nav = $('#nav')!;
  nav.innerHTML = Object.entries(routes)
    .filter(([, v]) => v.nav)
    .map(
      ([p, v]) => `<li class="nav-item ${p === path ? 'active' : ''}">
        <a class="nav-link" href="#${p}" ${p === path ? 'aria-current="page"' : ''}>
          <span class="nav-link-icon d-md-none d-lg-inline-block"><i aria-hidden="true" class="ti ti-${v.icon}"></i></span>
          <span class="nav-link-title">${esc(v.title)}</span>
        </a></li>`,
    )
    .join('');
}

function renderFreshness(): void {
  const el = $('#data-freshness');
  if (!el) return;
  const latest = getMarket()?.latest?.Malaysia?.date;
  el.innerHTML = latest
    ? `<i aria-hidden="true" class="ti ti-database me-1"></i>CPI data to ${esc(new Date(latest).toLocaleDateString('en-MY', { month: 'short', year: 'numeric', timeZone: 'UTC' }))}<br><span class="opacity-75">Source: DOSM via data.gov.my</span>`
    : `<i aria-hidden="true" class="ti ti-database me-1"></i>Using built-in cost baselines`;
}

function route(): void {
  const path = (location.hash.replace(/^#/, '') || '/').split('?')[0];
  const view = routes[path] ?? routes['/'];
  cleanup?.();
  cleanup = undefined;
  destroyCharts();
  renderNav(path);
  $('#page-title')!.textContent = view.heading ?? view.title;
  $('#page-pretitle')!.textContent = view.pretitle ?? '';
  const actions = $('#page-actions')!;
  actions.innerHTML = '';
  document.title = `${view.title} · OfferLens MY`;
  // A fresh element per route, so listeners from the previous view can't leak.
  const host = document.createElement('div');
  host.className = 'view';
  $('#view')!.replaceChildren(host);
  cleanup = view.render(host, actions) || undefined;
  const menu = document.getElementById('sidebar-menu');
  if (menu?.classList.contains('show')) (Collapse.getOrCreateInstance(menu) as unknown as { hide(): void }).hide();
}

function applyTheme(): void {
  const pref = getState().theme;
  const theme = pref === 'system' ? (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light') : pref;
  document.documentElement.setAttribute('data-bs-theme', theme);
  document.body.setAttribute('data-bs-theme', theme);
  $$('.theme-toggle i').forEach((i) => (i.className = `ti ti-${theme === 'dark' ? 'sun' : 'moon'}`));
}

function init(): void {
  applyTheme();
  $$('.theme-toggle').forEach((b) =>
    b.addEventListener('click', () => {
      const dark = document.body.getAttribute('data-bs-theme') === 'dark';
      setState({ theme: dark ? 'light' : 'dark' });
      applyTheme();
      route(); // re-render charts with the new palette
    }),
  );
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    if (getState().theme === 'system') {
      applyTheme();
      route();
    }
  });
  window.addEventListener('hashchange', () => {
    route();
    window.scrollTo(0, 0);
    // Move focus to the new content so keyboard and screen-reader users land on it.
    $('#main')?.focus({ preventScroll: true });
  });
  window.addEventListener('offerlens:rerender', () => {
    applyTheme();
    route();
  });
  subscribe(() => renderFreshness());
  renderFreshness();
  route();
  fetchMarket().then((m) => {
    if (!m) return;
    setMarket(m);
    route();
  });
}

init();

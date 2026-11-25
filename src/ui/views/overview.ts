import type { View } from '../view';
import { computePay } from '../../lib/payroll';
import { evaluateOffers } from '../../lib/offers';
import { computeStats, STAGE_LABELS } from '../../lib/tracker';
import { esc, money, money2, pct } from '../../lib/format';
import { $ } from '../dom';
import { palette, renderChart } from '../charts';
import { effectiveCities, getMarket, getState, isDemoData, setState } from '../store';
import { defaultState } from '../../lib/storage';
import { DEFAULT_CITIES } from '../../data/cities';
import { cpiFactor } from '../../lib/market';

export const overviewView: View = {
  title: 'Overview',
  heading: 'Your job-offer dashboard',
  pretitle: 'OfferLens MY',
  icon: 'layout-dashboard',
  nav: true,
  render(host) {
    const s = getState();
    const pay = computePay(s.calculator);
    const cities = effectiveCities();
    const evals = s.offers.length ? evaluateOffers(s.offers, cities, s.weights) : [];
    const best = [...evals].sort((a, b) => a.rank - b.rank)[0];
    const stats = computeStats(s.applications);
    const market = getMarket();

    host.innerHTML = `
    ${isDemoData() ? `<div class="alert alert-info alert-dismissible" role="alert">
      <div class="d-flex gap-2"><i aria-hidden="true" class="ti ti-info-circle alert-icon"></i><div>
        <h4 class="alert-title">You're looking at demo data</h4>
        <div class="text-secondary">The offers and applications are fictional examples. Everything you enter is saved only in this browser.</div>
        <div class="btn-list mt-2"><button class="btn btn-info btn-sm" id="clear-demo">Start fresh</button><a class="btn btn-sm" href="#/about">How the maths works</a></div>
      </div></div></div>` : ''}

    <div class="row row-deck row-cards">
      <div class="col-sm-6 col-lg-3"><div class="card"><div class="card-body">
        <div class="subheader">Monthly take-home</div>
        <div class="h1 mb-1 metric">${money2(pay.monthly.net)}</div>
        <div class="text-secondary small">From ${money(pay.monthly.gross)} gross · <a href="#/take-home">adjust</a></div>
      </div></div></div>
      <div class="col-sm-6 col-lg-3"><div class="card"><div class="card-body">
        <div class="subheader">Best offer</div>
        <div class="h1 mb-1 text-truncate">${best ? esc(best.offer.company) : '—'}</div>
        <div class="text-secondary small">${best ? `Score ${best.score}/100 · ${money(best.monthlyDisposable)} left over/mo` : '<a href="#/offers">Add offers to compare</a>'}</div>
      </div></div></div>
      <div class="col-sm-6 col-lg-3"><div class="card"><div class="card-body">
        <div class="subheader">Active applications</div>
        <div class="h1 mb-1 metric">${stats.active}</div>
        <div class="text-secondary small">${stats.submitted} submitted · ${pct(stats.responseRate, 0)} response rate</div>
      </div></div></div>
      <div class="col-sm-6 col-lg-3"><div class="card"><div class="card-body">
        <div class="subheader">Follow-ups due</div>
        <div class="h1 mb-1 metric ${stats.overdue.length ? 'text-warning' : ''}">${stats.overdue.length}</div>
        <div class="text-secondary small">${stats.overdue.length ? esc(stats.overdue.slice(0, 2).map((a) => a.company).join(', ')) : 'All caught up'}</div>
      </div></div></div>

      <div class="col-lg-7"><div class="card">
        <div class="card-header"><div><h3 class="card-title">Offers at a glance</h3><p class="card-subtitle">Money left each month after tax, EPF, SOCSO, EIS and city living costs.</p></div>
        <div class="card-actions"><a href="#/offers" class="btn btn-sm">Compare <i aria-hidden="true" class="ti ti-arrow-right ms-1"></i></a></div></div>
        <div class="card-body">${evals.length ? '<div id="ov-offers" class="chart-md"></div>' : emptyHint('No offers yet.', '#/offers', 'Add an offer')}</div>
      </div></div>

      <div class="col-lg-5"><div class="card">
        <div class="card-header"><h3 class="card-title">Pipeline</h3>
        <div class="card-actions"><a href="#/tracker" class="btn btn-sm">Open board <i aria-hidden="true" class="ti ti-arrow-right ms-1"></i></a></div></div>
        <div class="card-body">${s.applications.length ? '<div id="ov-pipeline" class="chart-md"></div>' : emptyHint('No applications tracked yet.', '#/tracker', 'Add an application')}</div>
      </div></div>

      <div class="col-lg-6"><div class="card">
        <div class="card-header"><h3 class="card-title">Your RM ${Math.round(pay.monthly.gross).toLocaleString('en-MY')} payslip</h3></div>
        <div class="card-body">
          ${bar('Take-home', pay.monthly.net, pay.monthly.gross, 'primary')}
          ${bar('EPF (your retirement savings)', pay.monthly.epf, pay.monthly.gross, 'green')}
          ${bar('Income tax (PCB estimate)', pay.monthly.tax, pay.monthly.gross, 'red')}
          ${bar('SOCSO + EIS', pay.monthly.socso + pay.monthly.eis, pay.monthly.gross, 'yellow')}
          <div class="text-secondary small mt-3">Plus ${money2(pay.employer.epfMonthly)} EPF from your employer every month that doesn't show on your payslip.</div>
        </div>
      </div></div>

      <div class="col-lg-6"><div class="card">
        <div class="card-header"><div><h3 class="card-title">Cost of living by city</h3>
        <p class="card-subtitle">${market ? `Baselines adjusted by state CPI (DOSM), latest ${esc(new Date(market.latest.Malaysia?.date ?? market.generatedAt).toLocaleDateString('en-MY', { month: 'long', year: 'numeric', timeZone: 'UTC' }))}.` : 'Built-in baselines; edit them in Settings.'}</p></div></div>
        <div class="table-responsive"><table class="table table-vcenter card-table">
          <thead><tr><th>City</th><th class="text-end">Monthly cost</th><th class="text-end">Inflation since baseline</th></tr></thead>
          <tbody>${cities
            .map((c) => {
              const d = DEFAULT_CITIES.find((x) => x.id === c.id);
              const f = c.custom ? 1 : cpiFactor(market, d?.cpiState);
              return `<tr><td>${esc(c.name)}${c.custom ? ' <span class="badge bg-secondary-lt">custom</span>' : ''}</td><td class="text-end">${money(c.monthlyCost)}</td><td class="text-end ${f > 1 ? 'text-danger' : 'text-secondary'}">${c.custom ? '—' : `${f >= 1 ? '+' : ''}${((f - 1) * 100).toFixed(1)}%`}</td></tr>`;
            })
            .join('')}</tbody>
        </table></div>
      </div></div>
    </div>`;

    $('#clear-demo', host)?.addEventListener('click', () => {
      const fresh = defaultState();
      setState({ offers: [], applications: [], calculator: s.calculator, weights: fresh.weights });
      window.dispatchEvent(new Event('offerlens:rerender'));
    });

    const p = palette();
    if (evals.length) {
      const ranked = [...evals].sort((a, b) => b.monthlyDisposable - a.monthlyDisposable);
      renderChart($('#ov-offers', host), {
        chart: { type: 'bar', height: 260 },
        series: [{ name: 'Left over / month', data: ranked.map((e) => Math.round(e.monthlyDisposable)) }],
        xaxis: { categories: ranked.map((e) => e.offer.company) },
        yaxis: { labels: { formatter: (v: number) => money(v) } },
        colors: [p.green],
        plotOptions: { bar: { columnWidth: '45%', borderRadius: 4, dataLabels: { position: 'top' } } },
        dataLabels: { enabled: true, offsetY: -20, formatter: (v: number) => money(v), style: { colors: [p.text] } },
        tooltip: { x: { formatter: (v: unknown) => esc(String(v)) }, y: { formatter: (v: number) => money(v) } },
      });
    }
    if (s.applications.length) {
      const labels = Object.keys(stats.byStage).filter((k) => stats.byStage[k as keyof typeof stats.byStage] > 0);
      renderChart($('#ov-pipeline', host), {
        chart: { type: 'donut', height: 260 },
        series: labels.map((k) => stats.byStage[k as keyof typeof stats.byStage]),
        labels: labels.map((k) => STAGE_LABELS[k as keyof typeof STAGE_LABELS]),
        colors: labels.map((k) => ({ wishlist: p.muted, applied: p.primary, assessment: p.purple, interview: p.orange, offer: p.green, rejected: p.red })[k] ?? p.muted),
        legend: { show: true, position: 'bottom' },
        stroke: { width: 0 },
        plotOptions: { pie: { donut: { size: '70%', labels: { show: true, total: { show: true, label: 'Tracked' } } } } },
      });
    }
  },
};

function bar(label: string, value: number, total: number, color: string): string {
  const share = total > 0 ? Math.max(0, value / total) : 0;
  return `<div class="mb-2">
    <div class="d-flex mb-1"><span>${esc(label)}</span><span class="ms-auto fw-medium">${money2(value)} <span class="text-secondary fw-normal">· ${pct(share, 0)}</span></span></div>
    <div class="progress progress-sm"><div class="progress-bar bg-${color}" style="width:${(share * 100).toFixed(1)}%" role="progressbar" aria-valuenow="${Math.round(share * 100)}" aria-valuemin="0" aria-valuemax="100" aria-label="${esc(label)}"></div></div>
  </div>`;
}

function emptyHint(text: string, href: string, cta: string): string {
  return `<div class="text-center text-secondary py-5">${esc(text)}<br><a class="btn btn-primary btn-sm mt-2" href="${href}">${esc(cta)}</a></div>`;
}

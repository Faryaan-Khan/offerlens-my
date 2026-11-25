import type { View } from '../view';
import { computePay, grossForMonthlyNet, type PayBreakdown } from '../../lib/payroll';
import { MY_RATES } from '../../data/rates';
import { esc, money, money2, pct } from '../../lib/format';
import { $, numVal } from '../dom';
import { palette, renderChart } from '../charts';
import { getState, setState } from '../store';
import type ApexCharts from 'apexcharts';

const field = (id: string, label: string, value: number, opts: { step?: number; min?: number; max?: number; prefix?: string; suffix?: string; hint?: string } = {}) => `
  <div class="mb-3">
    <label class="form-label" for="${id}">${esc(label)}</label>
    <div class="input-group">
      ${opts.prefix ? `<span class="input-group-text">${esc(opts.prefix)}</span>` : ''}
      <input type="number" inputmode="decimal" class="form-control" id="${id}" value="${value}" step="${opts.step ?? 50}" min="${opts.min ?? 0}" ${opts.max !== undefined ? `max="${opts.max}"` : ''}>
      ${opts.suffix ? `<span class="input-group-text">${esc(opts.suffix)}</span>` : ''}
    </div>
    ${opts.hint ? `<small class="form-hint">${opts.hint}</small>` : ''}
  </div>`;

export const calculatorView: View = {
  title: 'Take-home pay',
  pretitle: `Malaysia · YA ${MY_RATES.year} rates`,
  icon: 'calculator',
  nav: true,
  render(host) {
    const c = getState().calculator;
    host.innerHTML = `
    <div class="row row-cards">
      <div class="col-lg-4">
        <form class="card" id="calc-form" onsubmit="return false">
          <div class="card-header"><h3 class="card-title">Your package</h3></div>
          <div class="card-body">
            ${field('in-gross', 'Basic monthly salary', c.monthlyGross, { prefix: 'RM', step: 100 })}
            ${field('in-allow', 'Fixed monthly allowances', c.monthlyAllowance, { prefix: 'RM', hint: 'Taxable allowances paid every month (e.g. transport, phone).' })}
            ${field('in-bonus', 'Bonus', c.bonusMonths, { step: 0.5, suffix: 'months', max: 24 })}
            <div class="mb-3">
              <label class="form-label" for="in-epf">Your EPF contribution</label>
              <select class="form-select" id="in-epf">
                ${[0.11, 0.09, 0.07, 0.12, 0.13, 0.15, 0.2].map((r) => `<option value="${r}" ${Math.abs(r - c.epfEmployeeRate) < 1e-9 ? 'selected' : ''}>${Math.round(r * 100)}%${r === 0.11 ? ' (standard)' : r > 0.11 ? ' (voluntary top-up)' : ' (reduced)'}</option>`).join('')}
              </select>
            </div>
          </div>
          <div class="card-header border-top"><h3 class="card-title">Tax reliefs (yearly)</h3></div>
          <div class="card-body">
            ${field('in-life', 'Lifestyle relief', c.lifestyleRelief, { prefix: 'RM', max: 1_000_000, hint: `Books, gadgets, internet, gym. Capped at ${money(MY_RATES.reliefs.lifestyleMax)}.` })}
            ${field('in-other', 'Other reliefs', c.otherReliefs, { prefix: 'RM', hint: 'Medical, education, PRS, SSPN, parents… Individual, EPF and SOCSO reliefs are added automatically.' })}
            ${field('in-zakat', 'Zakat paid', c.zakat, { prefix: 'RM', hint: 'Reduces tax ringgit-for-ringgit.' })}
          </div>
        </form>
      </div>
      <div class="col-lg-8">
        <div class="row row-cards">
          <div class="col-sm-6 col-xl-4"><div class="card card-sm"><div class="card-body">
            <div class="subheader">Monthly take-home</div>
            <div class="money-lg text-primary" id="out-net" data-testid="monthly-net">—</div>
            <div class="text-secondary small" id="out-net-sub"></div>
          </div></div></div>
          <div class="col-sm-6 col-xl-4"><div class="card card-sm"><div class="card-body">
            <div class="subheader">Yearly take-home</div>
            <div class="h1 mb-0 metric" id="out-annual">—</div>
            <div class="text-secondary small" id="out-annual-sub"></div>
          </div></div></div>
          <div class="col-sm-12 col-xl-4"><div class="card card-sm"><div class="card-body">
            <div class="subheader">Income tax</div>
            <div class="h1 mb-0 metric" id="out-tax">—</div>
            <div class="text-secondary small" id="out-tax-sub"></div>
          </div></div></div>

          <div class="col-md-5"><div class="card h-100">
            <div class="card-header"><h3 class="card-title">Where a month's pay goes</h3></div>
            <div class="card-body"><div id="chart-donut" class="chart-md"></div></div>
          </div></div>
          <div class="col-md-7"><div class="card h-100">
            <div class="card-header"><h3 class="card-title">Payslip breakdown</h3></div>
            <div class="table-responsive">
              <table class="table table-vcenter card-table" id="out-table" aria-label="Payslip breakdown"></table>
            </div>
          </div></div>

          <div class="col-12"><div class="card">
            <div class="card-header">
              <div><h3 class="card-title">Take-home across salaries</h3>
              <p class="card-subtitle">How much of each extra ringgit you keep. The dot is your salary.</p></div>
            </div>
            <div class="card-body"><div id="chart-curve" class="chart-lg"></div></div>
          </div></div>

          <div class="col-12"><div class="card">
            <div class="card-header"><div>
              <h3 class="card-title"><i aria-hidden="true" class="ti ti-target-arrow me-1 text-primary"></i>Reverse calculator</h3>
              <p class="card-subtitle">Know the take-home you need? Get the basic salary to ask for (uses the allowance, bonus and reliefs above).</p>
            </div></div>
            <div class="card-body">
              <div class="row g-3 align-items-end">
                <div class="col-sm-5">
                  <label class="form-label" for="in-target">Target monthly take-home</label>
                  <div class="input-group"><span class="input-group-text">RM</span>
                  <input type="number" inputmode="decimal" class="form-control" id="in-target" min="0" step="100" value="${getState().targetNet}"></div>
                </div>
                <div class="col-sm-7">
                  <div class="text-secondary small">Ask for a basic salary of at least</div>
                  <div class="h1 mb-0 metric" id="out-required" data-testid="required-gross">—</div>
                  <div class="text-secondary small" id="out-required-sub"></div>
                </div>
              </div>
            </div>
          </div></div>
        </div>
      </div>
    </div>`;

    let donut: ApexCharts | undefined;
    let curve: ApexCharts | undefined;

    const read = () => ({
      monthlyGross: numVal($('#in-gross')),
      monthlyAllowance: numVal($('#in-allow')),
      bonusMonths: numVal($('#in-bonus')),
      epfEmployeeRate: parseFloat(($('#in-epf') as unknown as HTMLSelectElement).value) || 0.11,
      lifestyleRelief: numVal($('#in-life')),
      otherReliefs: numVal($('#in-other')),
      zakat: numVal($('#in-zakat')),
    });

    const update = () => {
      if (!host.isConnected) return; // view was left before a debounced update fired
      const input = read();
      const target = numVal($('#in-target'));
      setState({ calculator: input, targetNet: target });
      const b = computePay(input);
      renderNumbers(b);
      renderTable(b);
      const p = palette();
      const series = [b.monthly.net, b.monthly.epf, round(b.monthly.socso + b.monthly.eis), b.monthly.tax];
      if (donut) donut.updateSeries(series);
      else
        donut = renderChart($('#chart-donut'), {
          chart: { type: 'donut', height: 260 },
          series,
          labels: ['Take-home', 'EPF', 'SOCSO + EIS', 'Income tax (PCB)'],
          colors: [p.primary, p.green, p.yellow, p.red],
          legend: { show: true, position: 'bottom' },
          stroke: { width: 0 },
          plotOptions: { pie: { donut: { size: '72%', labels: { show: true, total: { show: true, label: 'Gross', formatter: () => money(b.monthly.gross) } } } } },
          tooltip: { y: { formatter: (v: number) => money2(v) } },
        });
      if (donut) donut.updateOptions({ plotOptions: { pie: { donut: { labels: { total: { formatter: () => money(b.monthly.gross) } } } } } }, false, false);

      const { points, me } = curveData(input);
      const curveSeries = [
        { name: 'Monthly take-home', data: points.map(([x, y]) => ({ x, y })) },
        { name: 'Basic salary', data: points.map(([x]) => ({ x, y: x })) },
      ];
      const annotations = { points: [{ x: me[0], y: me[1], marker: { size: 6, fillColor: p.primary, strokeColor: '#fff', strokeWidth: 2 }, label: { text: money(me[1]), borderColor: p.primary, style: { background: p.primary, color: '#fff' } } }] };
      if (curve) curve.updateOptions({ series: curveSeries, annotations }, false, false);
      else
        curve = renderChart($('#chart-curve'), {
          chart: { type: 'line', height: 320, zoom: { enabled: false } },
          series: curveSeries,
          colors: [p.primary, p.muted],
          stroke: { width: [3, 1.5], curve: 'straight', dashArray: [0, 6] },
          xaxis: { type: 'numeric', title: { text: 'Basic monthly salary (RM)' }, labels: { formatter: (v: string) => `${+(+v / 1000).toFixed(1)}k` }, tickAmount: 6 },
          yaxis: { labels: { formatter: (v: number) => `${Math.round(v / 1000)}k` } },
          tooltip: { shared: true, x: { formatter: (v: number) => `Basic ${money(v)}` }, y: { formatter: (v: number) => money(v) } },
          legend: { show: true, position: 'top', horizontalAlign: 'left' },
          annotations,
        });

      const required = grossForMonthlyNet(target, {
        monthlyAllowance: input.monthlyAllowance,
        bonusMonths: input.bonusMonths,
        epfEmployeeRate: input.epfEmployeeRate,
        lifestyleRelief: input.lifestyleRelief,
        otherReliefs: input.otherReliefs,
        zakat: input.zakat,
      });
      $('#out-required')!.textContent = target > 0 && Number.isFinite(required) ? money(required) : '—';
      if (target > 0 && Number.isFinite(required)) {
        const check = computePay({ ...input, monthlyGross: required });
        const diff = required - input.monthlyGross;
        $('#out-required-sub')!.innerHTML = `Gives ${money2(check.monthly.net)} a month. ${
          diff > 0 ? `That's <strong>${money(diff)}</strong> more than your current figure.` : diff < 0 ? `Your current salary already beats this by ${money(-diff)}.` : 'Exactly your current salary.'
        }`;
      } else $('#out-required-sub')!.textContent = 'Enter a target above zero.';
    };

    host.addEventListener('input', debounce(update, 120));
    host.addEventListener('change', update);
    update();
  },
};

function renderNumbers(b: PayBreakdown): void {
  $('#out-net')!.textContent = money2(b.monthly.net);
  $('#out-net-sub')!.textContent = `${pct(b.monthly.gross ? b.monthly.net / b.monthly.gross : 0)} of monthly gross`;
  $('#out-annual')!.textContent = money(b.annual.net);
  $('#out-annual-sub')!.textContent = `≈ ${money(b.averageMonthlyNet)}/month with bonus`;
  $('#out-tax')!.textContent = money(b.annual.tax);
  $('#out-tax-sub')!.textContent = `Effective ${pct(b.effectiveTaxRate)} · next ringgit taxed at ${pct(b.marginalTaxRate, 0)}${b.annual.bonusTax ? ` · ${money(b.annual.bonusTax)} of it in the bonus month` : ''}`;
}

function renderTable(b: PayBreakdown): void {
  const row = (label: string, m: number | string, a: number | string, cls = '') =>
    `<tr class="${cls}"><td>${label}</td><td class="text-end">${typeof m === 'number' ? money2(m) : m}</td><td class="text-end">${typeof a === 'number' ? money2(a) : a}</td></tr>`;
  $('#out-table')!.innerHTML = `
    <thead><tr><th>Item</th><th class="text-end">Monthly</th><th class="text-end">Yearly</th></tr></thead>
    <tbody>
      ${row('Gross pay', b.monthly.gross, b.annual.gross - b.annual.bonus)}
      ${b.annual.bonus ? row('Bonus', '—', b.annual.bonus) : ''}
      ${row('EPF (employee)', -b.monthly.epf, -b.annual.epf, 'text-secondary')}
      ${row('SOCSO', -b.monthly.socso, -b.annual.socso, 'text-secondary')}
      ${row('EIS', -b.monthly.eis, -b.annual.eis, 'text-secondary')}
      ${row('Income tax (PCB estimate)', -b.monthly.tax, -(b.annual.tax - b.annual.bonusTax), 'text-secondary')}
      ${b.annual.bonusTax ? row('Extra tax in bonus month', '—', -b.annual.bonusTax, 'text-secondary') : ''}
      ${row('<strong>Take-home</strong>', `<strong>${money2(b.monthly.net)}</strong>`, `<strong>${money2(b.annual.net)}</strong>`)}
    </tbody>
    <tfoot class="small">
      <tr><td colspan="3" class="text-secondary">
        Reliefs ${money(b.annual.reliefs)} · chargeable income ${money(b.annual.chargeableIncome)}${b.annual.rebate ? ` · RM${b.annual.rebate} rebate applied` : ''}.
        Your employer also pays ${money2(b.employer.epfMonthly)} EPF + ${money2(b.employer.socsoMonthly + b.employer.eisMonthly)} SOCSO/EIS a month (total cost to them ${money(b.employer.annualCost)}/year).
      </td></tr>
    </tfoot>`;
}

function curveData(input: ReturnType<typeof Object>) {
  const base = input as Parameters<typeof computePay>[0];
  const mine = base.monthlyGross || 0;
  const max = Math.max(15_000, Math.ceil((mine * 1.6) / 1000) * 1000);
  const step = max / 60;
  const points: [number, number][] = [];
  for (let x = 0; x <= max + 1e-6; x += step) {
    const gx = Math.round(x);
    points.push([gx, round(computePay({ ...base, monthlyGross: gx }).monthly.net)]);
  }
  return { points, me: [mine, round(computePay(base).monthly.net)] as [number, number] };
}

const round = (n: number) => Math.round(n * 100) / 100;

function debounce<T extends (...a: any[]) => void>(fn: T, ms: number): T {
  let t: ReturnType<typeof setTimeout> | undefined;
  return ((...a: any[]) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...a), ms);
  }) as T;
}

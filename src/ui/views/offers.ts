import type { View } from '../view';
import { counterOffer, evaluateOffers, type Offer, type OfferEvaluation, type Weights } from '../../lib/offers';
import { esc, money, pct, uid } from '../../lib/format';
import { $, $$, confirmAction, openModal, toast } from '../dom';
import { destroyCharts, palette, renderChart } from '../charts';
import { effectiveCities, getState, setState } from '../store';

const WEIGHT_LABELS: Record<keyof Weights, string> = {
  money: 'Money left over',
  growth: 'Career growth',
  learning: 'Learning & mentorship',
  workLife: 'Work-life balance',
};

export const offersView: View = {
  title: 'Compare offers',
  pretitle: 'Every offer turned into the money you keep after tax, EPF and living costs.',
  icon: 'scale',
  nav: true,
  render(host, actions) {
    actions.innerHTML = `<button class="btn btn-primary" id="add-offer"><i aria-hidden="true" class="ti ti-plus me-1"></i>Add offer</button>`;
    $('#add-offer', actions)!.addEventListener('click', () => editOffer());

    const draw = (focusId?: string) => {
      destroyCharts();
      const { offers, weights } = getState();
      const cities = effectiveCities();
      if (!offers.length) {
        host.innerHTML = emptyState();
        $('#empty-add', host)?.addEventListener('click', () => editOffer());
        return;
      }
      const evals = evaluateOffers(offers, cities, weights);
      const ranked = [...evals].sort((a, b) => a.rank - b.rank);
      const best = ranked[0];

      host.innerHTML = `
      <div class="row row-cards">
        <div class="col-12">
          <div class="card spark-hero">
            <div class="card-body pe-lg-6">
              <span class="spark-chip mb-3">Top pick</span>
              <div class="h2 mb-1 text-white">${esc(best.offer.company)} comes out on top with ${best.score}/100</div>
              <div class="text-secondary">After tax, EPF, SOCSO, EIS and ${esc(best.city?.name ?? 'living')} costs, you'd keep about <strong class="text-white">${money(best.monthlyDisposable)}</strong> a month (${pct(best.savingsRate, 0)} of take-home).</div>
            </div>
            <i aria-hidden="true" class="ti ti-asterisk spark-hero-mark"></i>
          </div>
        </div>

        ${ranked.map((e) => offerCard(e)).join('')}

        <div class="col-lg-8"><div class="card h-100">
          <div class="card-header"><div><h3 class="card-title">Monthly money, side by side</h3>
          <p class="card-subtitle">Average take-home (bonus spread over 12 months) split into living costs, job costs and what's left.</p></div></div>
          <div class="card-body"><div id="chart-offers" class="chart-lg"></div></div>
        </div></div>

        <div class="col-lg-4"><div class="card h-100">
          <div class="card-header"><div><h3 class="card-title">What matters to you</h3>
          <p class="card-subtitle">Drag to re-weight the score.</p></div></div>
          <div class="card-body">
            ${(Object.keys(WEIGHT_LABELS) as (keyof Weights)[])
              .map(
                (k) => `<div class="mb-3">
                <label class="form-label d-flex justify-content-between" for="w-${k}"><span>${WEIGHT_LABELS[k]}</span><span class="text-secondary" id="w-${k}-v">${weights[k]}</span></label>
                <input type="range" class="form-range" min="0" max="100" step="5" id="w-${k}" data-weight="${k}" value="${weights[k]}">
              </div>`,
              )
              .join('')}
          </div>
        </div></div>

        ${offers.length > 1 ? negotiationCard(ranked) : ''}

        <div class="col-12"><div class="card">
          <div class="card-header"><h3 class="card-title">Full comparison</h3></div>
          <div class="table-responsive">
            <table class="table table-vcenter card-table table-striped table-nowrap">
              <thead><tr><th>Offer</th><th>City</th><th class="text-end">Basic</th><th class="text-end">Bonus</th><th class="text-end">Take-home / mo</th><th class="text-end">Yearly take-home</th><th class="text-end">Living + job costs</th><th class="text-end">Left over / mo</th><th class="text-end">Employer EPF / yr</th><th class="text-end">Score</th></tr></thead>
              <tbody>${ranked
                .map(
                  (e) => `<tr>
                  <td><div class="fw-medium">${esc(e.offer.company)}</div><div class="text-secondary small">${esc(e.offer.role)}</div></td>
                  <td>${esc(e.city?.name ?? '—')}</td>
                  <td class="text-end">${money(e.offer.monthlyGross)}</td>
                  <td class="text-end">${e.offer.bonusMonths} mo</td>
                  <td class="text-end">${money(e.pay.monthly.net)}</td>
                  <td class="text-end">${money(e.pay.annual.net)}</td>
                  <td class="text-end">${money(e.livingCost + e.offer.extraMonthlyCost)}</td>
                  <td class="text-end fw-bold ${e.monthlyDisposable < 0 ? 'text-danger' : ''}">${money(e.monthlyDisposable)}</td>
                  <td class="text-end">${money(e.pay.employer.epfMonthly * 12)}</td>
                  <td class="text-end"><span class="badge ${e.rank === 1 ? 'bg-primary text-white' : 'bg-secondary-lt'}">${e.score}</span></td>
                </tr>`,
                )
                .join('')}</tbody>
            </table>
          </div>
        </div></div>
      </div>`;

      const p = palette();
      renderChart($('#chart-offers', host), {
        chart: { type: 'bar', height: 320, stacked: true },
        series: [
          { name: 'Living costs', data: ranked.map((e) => Math.round(e.livingCost)) },
          { name: 'Job costs', data: ranked.map((e) => Math.round(e.offer.extraMonthlyCost)) },
          { name: 'Left over', data: ranked.map((e) => Math.round(e.monthlyDisposable)) },
        ],
        colors: [p.muted, p.orange, p.green],
        plotOptions: { bar: { horizontal: true, barHeight: '55%', borderRadius: 3 } },
        xaxis: { categories: ranked.map((e) => e.offer.company), labels: { formatter: (v: string) => `RM${Math.round(+v / 100) / 10}k` } },
        yaxis: { labels: { maxWidth: 180, offsetX: 4 } },
        grid: { padding: { left: 12 } },
        tooltip: { x: { formatter: (v: unknown) => esc(String(v)) }, y: { formatter: (v: number) => money(v) } },
        legend: { show: true, position: 'top', horizontalAlign: 'left' },
      });

      $$('[data-edit]', host).forEach((b) => b.addEventListener('click', () => editOffer(offers.find((o) => o.id === b.dataset.edit))));
      $$('[data-weight]', host).forEach((r) =>
        r.addEventListener('input', () => {
          const k = r.dataset.weight as keyof Weights;
          $(`#w-${k}-v`, host)!.textContent = (r as HTMLInputElement).value;
        }),
      );
      $$('[data-weight]', host).forEach((r) =>
        r.addEventListener('change', () => {
          const w = { ...getState().weights, [r.dataset.weight as keyof Weights]: +(r as HTMLInputElement).value };
          setState({ weights: w });
          draw(`w-${r.dataset.weight}`);
        }),
      );
      const updateNegotiation = () => {
        const a = ($('#neg-a', host) as HTMLSelectElement | null)?.value;
        const b = ($('#neg-b', host) as HTMLSelectElement | null)?.value;
        const out = $('#neg-out', host);
        if (!a || !b || !out) return;
        if (a === b) {
          out.innerHTML = `<span class="text-secondary">Pick two different offers.</span>`;
          return;
        }
        const cand = offers.find((o) => o.id === a)!;
        const bench = evals.find((e) => e.offer.id === b)!;
        const need = counterOffer(cand, bench, cities);
        const diff = need - cand.monthlyGross;
        out.innerHTML =
          diff <= 0
            ? `<div class="h2 mb-1 text-success">No raise needed</div><div class="text-secondary">${esc(cand.company)} already leaves you at least as much each month as ${esc(bench.offer.company)}.</div>`
            : `<div class="text-secondary small">Ask ${esc(cand.company)} for a basic salary of</div>
               <div class="h1 mb-1 metric" data-testid="counter-offer">${money(need)}</div>
               <div class="text-secondary">That's <strong>+${money(diff)}</strong> (${pct(diff / cand.monthlyGross, 0)}) to match what ${esc(bench.offer.company)} leaves you after tax and living costs.</div>`;
      };
      $('#neg-a', host)?.addEventListener('change', updateNegotiation);
      $('#neg-b', host)?.addEventListener('change', updateNegotiation);
      updateNegotiation();
      if (focusId) ($(`#${focusId}`, host) as HTMLElement | null)?.focus();
    };

    function editOffer(existing?: Offer): void {
      const o: Offer = existing ?? {
        id: uid(),
        company: '',
        role: '',
        cityId: 'kl',
        monthlyGross: 4_000,
        monthlyAllowance: 0,
        bonusMonths: 1,
        extraMonthlyCost: 0,
        growth: 3,
        learning: 3,
        workLife: 3,
        notes: '',
      };
      const cities = effectiveCities();
      const rate = (name: keyof Offer, label: string) => `
        <div class="col-sm-4"><label class="form-label" for="f-${name}">${label}</label>
          <select class="form-select" id="f-${name}" name="${name}">
            ${[1, 2, 3, 4, 5].map((n) => `<option value="${n}" ${o[name] === n ? 'selected' : ''}>${n} ${['', '· poor', '· below avg', '· average', '· good', '· excellent'][n]}</option>`).join('')}
          </select></div>`;
      openModal({
        title: existing ? `Edit ${o.company}` : 'Add a job offer',
        size: 'lg',
        submitLabel: existing ? 'Save changes' : 'Add offer',
        danger: existing
          ? {
              label: 'Delete',
              onClick: () =>
                confirmAction('Delete offer?', `Remove ${o.company} from your comparison?`, 'Delete', () => {
                  setState((s) => ({ offers: s.offers.filter((x) => x.id !== o.id) }));
                  toast('Offer deleted');
                  draw();
                }),
            }
          : undefined,
        body: `
          <div class="row g-3">
            <div class="col-sm-6"><label class="form-label required" for="f-company">Company</label>
              <input class="form-control" id="f-company" name="company" required maxlength="80" value="${esc(o.company)}" placeholder="e.g. Kopi Labs">
              <div class="invalid-feedback">Company is required.</div></div>
            <div class="col-sm-6"><label class="form-label" for="f-role">Role</label>
              <input class="form-control" id="f-role" name="role" maxlength="80" value="${esc(o.role)}" placeholder="e.g. Junior Software Engineer"></div>
            <div class="col-sm-4"><label class="form-label required" for="f-gross">Basic salary / month</label>
              <div class="input-group"><span class="input-group-text">RM</span><input type="number" class="form-control" id="f-gross" name="monthlyGross" min="1" step="any" required value="${o.monthlyGross}"></div></div>
            <div class="col-sm-4"><label class="form-label" for="f-allow">Allowances / month</label>
              <div class="input-group"><span class="input-group-text">RM</span><input type="number" class="form-control" id="f-allow" name="monthlyAllowance" min="0" step="any" value="${o.monthlyAllowance}"></div></div>
            <div class="col-sm-4"><label class="form-label" for="f-bonus">Bonus</label>
              <div class="input-group"><input type="number" class="form-control" id="f-bonus" name="bonusMonths" min="0" max="24" step="any" value="${o.bonusMonths}"><span class="input-group-text">months</span></div></div>
            <div class="col-sm-6"><label class="form-label" for="f-city">City</label>
              <select class="form-select" id="f-city" name="cityId">${cities.map((c) => `<option value="${esc(c.id)}" ${c.id === o.cityId ? 'selected' : ''}>${esc(c.name)} (≈${money(c.monthlyCost)}/mo)</option>`).join('')}</select></div>
            <div class="col-sm-6"><label class="form-label" for="f-extra">Job-specific costs / month</label>
              <div class="input-group"><span class="input-group-text">RM</span><input type="number" class="form-control" id="f-extra" name="extraMonthlyCost" min="0" step="any" value="${o.extraMonthlyCost}"></div>
              <small class="form-hint">Commute, tolls, parking, a second rental…</small></div>
            ${rate('growth', 'Career growth')}
            ${rate('learning', 'Learning')}
            ${rate('workLife', 'Work-life balance')}
            <div class="col-12"><label class="form-label" for="f-notes">Notes</label>
              <textarea class="form-control" id="f-notes" name="notes" rows="2" maxlength="1000">${esc(o.notes ?? '')}</textarea></div>
          </div>`,
        onSubmit: (form) => {
          const fd = new FormData(form);
          const n = (k: string) => Math.max(0, parseFloat(String(fd.get(k) ?? '0')) || 0);
          const next: Offer = {
            ...o,
            company: String(fd.get('company') ?? '').trim().slice(0, 80) || 'Untitled',
            role: String(fd.get('role') ?? '').trim().slice(0, 80),
            cityId: String(fd.get('cityId') ?? 'kl'),
            monthlyGross: n('monthlyGross'),
            monthlyAllowance: n('monthlyAllowance'),
            bonusMonths: Math.min(24, n('bonusMonths')),
            extraMonthlyCost: n('extraMonthlyCost'),
            growth: n('growth') || 3,
            learning: n('learning') || 3,
            workLife: n('workLife') || 3,
            notes: String(fd.get('notes') ?? '').slice(0, 1000),
          };
          setState((s) => ({ offers: existing ? s.offers.map((x) => (x.id === o.id ? next : x)) : [...s.offers, next] }));
          toast(existing ? 'Offer updated' : 'Offer added');
          draw();
        },
      });
    }

    draw();
  },
};

function offerCard(e: OfferEvaluation): string {
  return `
  <div class="col-md-6 col-xl-4">
    <div class="card card-link-pop h-100" data-testid="offer-card">
      <div class="card-body">
        <div class="d-flex align-items-center gap-3 mb-3">
          <div class="score-ring" style="--p:${e.score}" aria-label="Score ${e.score} out of 100"><span>${e.score}</span></div>
          <div class="flex-fill text-truncate">
            <h3 class="card-title mb-0 text-truncate">${esc(e.offer.company)}${e.rank === 1 ? ' <span class="badge bg-primary text-white ms-1 align-middle">Top pick</span>' : ''}</h3>
            <div class="text-secondary text-truncate">${esc(e.offer.role || '—')}</div>
          </div>
          <button class="btn btn-icon btn-ghost-secondary" data-edit="${esc(e.offer.id)}" aria-label="Edit ${esc(e.offer.company)}"><i aria-hidden="true" class="ti ti-pencil"></i></button>
        </div>
        <div class="datagrid">
          <div class="datagrid-item"><div class="datagrid-title">Basic</div><div class="datagrid-content">${money(e.offer.monthlyGross)}</div></div>
          <div class="datagrid-item"><div class="datagrid-title">Take-home / mo</div><div class="datagrid-content">${money(e.pay.monthly.net)}</div></div>
          <div class="datagrid-item"><div class="datagrid-title">City</div><div class="datagrid-content"><i aria-hidden="true" class="ti ti-map-pin text-secondary me-1"></i>${esc(e.city?.name ?? '—')}</div></div>
          <div class="datagrid-item"><div class="datagrid-title">Left over / mo</div><div class="datagrid-content fw-bold ${e.monthlyDisposable < 0 ? 'text-danger' : 'text-success'}">${money(e.monthlyDisposable)}</div></div>
        </div>
      </div>
      <div class="card-footer text-secondary small">Rank #${e.rank} · ${e.offer.bonusMonths} mo bonus · growth ${e.offer.growth}/5 · learning ${e.offer.learning}/5 · WLB ${e.offer.workLife}/5</div>
    </div>
  </div>`;
}

function negotiationCard(ranked: OfferEvaluation[]): string {
  const opts = (sel: string) => ranked.map((e) => `<option value="${esc(e.offer.id)}" ${e.offer.id === sel ? 'selected' : ''}>${esc(e.offer.company)}</option>`).join('');
  const richest = [...ranked].sort((a, b) => b.monthlyDisposable - a.monthlyDisposable)[0];
  const preferred = ranked.find((e) => e.offer.id !== richest.offer.id) ?? ranked[0];
  return `
  <div class="col-12"><div class="card">
    <div class="card-header"><div>
      <h3 class="card-title"><i aria-hidden="true" class="ti ti-arrows-exchange me-1 text-primary"></i>Negotiation helper</h3>
      <p class="card-subtitle">Prefer one company but another pays better? See the exact basic salary that makes them equal after tax, EPF and city costs.</p>
    </div></div>
    <div class="card-body">
      <div class="row g-3 align-items-center">
        <div class="col-md-3"><label class="form-label" for="neg-a">I want to join</label><select class="form-select" id="neg-a">${opts(preferred.offer.id)}</select></div>
        <div class="col-md-3"><label class="form-label" for="neg-b">…and be as well off as</label><select class="form-select" id="neg-b">${opts(richest.offer.id)}</select></div>
        <div class="col-md-6" id="neg-out" aria-live="polite"></div>
      </div>
    </div>
  </div></div>`;
}

function emptyState(): string {
  return `<div class="card"><div class="empty">
    <div class="empty-icon"><i aria-hidden="true" class="ti ti-scale" style="font-size:3rem"></i></div>
    <p class="empty-title">No offers yet</p>
    <p class="empty-subtitle text-secondary">Add the offers you're weighing up. OfferLens works out what each one really pays after tax, EPF and the cost of living in its city.</p>
    <div class="empty-action"><button class="btn btn-primary" id="empty-add"><i aria-hidden="true" class="ti ti-plus me-1"></i>Add your first offer</button></div>
  </div></div>`;
}

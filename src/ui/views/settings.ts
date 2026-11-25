import type { View } from '../view';
import { DEFAULT_CITIES } from '../../data/cities';
import { sampleApplications, sampleOffers } from '../../data/sample';
import { appliedOn, STAGE_LABELS } from '../../lib/tracker';
import { esc, toCsv } from '../../lib/format';
import { defaultState, sanitizeState } from '../../lib/storage';
import { computePay } from '../../lib/payroll';
import { $, $$, confirmAction, download, toast } from '../dom';
import { effectiveCities, getState, replaceState, setState } from '../store';

export const settingsView: View = {
  title: 'Settings & data',
  pretitle: 'Living costs, appearance, backups and exports.',
  icon: 'settings',
  nav: true,
  render(host) {
    const draw = (focusSelector?: string) => {
      const s = getState();
      const cities = effectiveCities();
      host.innerHTML = `
      <div class="row row-cards">
        <div class="col-lg-7"><div class="card">
          <div class="card-header"><div><h3 class="card-title">Monthly living costs</h3>
          <p class="card-subtitle">Rent, food, transport, utilities and phone for one person. Cities you haven't edited follow official state inflation (CPI) automatically.</p></div></div>
          <div class="table-responsive"><table class="table table-vcenter card-table">
            <thead><tr><th>City</th><th style="width:12rem">Monthly cost (RM)</th><th></th></tr></thead>
            <tbody>${cities
              .map(
                (c) => `<tr>
                <td>${esc(c.name)} ${c.custom ? '<span class="badge bg-secondary-lt ms-1">custom</span>' : '<span class="badge bg-green-lt ms-1">auto</span>'}</td>
                <td><input type="number" class="form-control form-control-sm" min="0" step="50" value="${c.monthlyCost}" data-city="${esc(c.id)}" aria-label="Monthly cost for ${esc(c.name)}"></td>
                <td class="text-end">${c.custom ? `<button class="btn btn-sm btn-ghost-secondary" data-reset-city="${esc(c.id)}">Use auto</button>` : ''}</td>
              </tr>`,
              )
              .join('')}</tbody>
          </table></div>
        </div></div>

        <div class="col-lg-5">
          <div class="card mb-3">
            <div class="card-header"><h3 class="card-title">Appearance</h3></div>
            <div class="card-body">
              <div class="form-selectgroup">
                ${(['system', 'light', 'dark'] as const)
                  .map(
                    (t) => `<label class="form-selectgroup-item"><input type="radio" name="theme" value="${t}" class="form-selectgroup-input" ${s.theme === t ? 'checked' : ''}>
                    <span class="form-selectgroup-label"><i aria-hidden="true" class="ti ti-${t === 'system' ? 'device-desktop' : t === 'light' ? 'sun' : 'moon'} me-1"></i>${t[0].toUpperCase() + t.slice(1)}</span></label>`,
                  )
                  .join('')}
              </div>
            </div>
          </div>

          <div class="card mb-3">
            <div class="card-header"><div><h3 class="card-title">Your data</h3>
            <p class="card-subtitle">Stored only in this browser's local storage. Back it up or move it to another device.</p></div></div>
            <div class="card-body">
              <div class="btn-list">
                <button class="btn" id="export-json"><i aria-hidden="true" class="ti ti-download me-1"></i>Backup (JSON)</button>
                <label class="btn mb-0" for="import-json"><i aria-hidden="true" class="ti ti-upload me-1"></i>Restore</label>
                <input type="file" id="import-json" accept="application/json,.json" class="d-none">
                <button class="btn" id="export-apps"><i aria-hidden="true" class="ti ti-file-spreadsheet me-1"></i>Applications CSV</button>
                <button class="btn" id="export-offers"><i aria-hidden="true" class="ti ti-file-spreadsheet me-1"></i>Offers CSV</button>
              </div>
            </div>
          </div>

          <div class="card">
            <div class="card-header"><h3 class="card-title">Reset</h3></div>
            <div class="card-body">
              <div class="btn-list">
                <button class="btn btn-outline-primary" id="load-demo"><i aria-hidden="true" class="ti ti-wand me-1"></i>Load demo data</button>
                <button class="btn btn-outline-danger" id="reset-all"><i aria-hidden="true" class="ti ti-trash me-1"></i>Erase everything</button>
              </div>
            </div>
          </div>
        </div>
      </div>`;

      $$('[data-city]', host).forEach((inp) =>
        inp.addEventListener('change', () => {
          const id = inp.dataset.city!;
          const v = Math.max(0, parseFloat((inp as HTMLInputElement).value) || 0);
          setState((st) => ({ cities: st.cities.map((c) => (c.id === id ? { ...c, monthlyCost: v, custom: true } : c)) }));
          toast('Living cost saved');
          draw(`[data-city="${CSS.escape(id)}"]`);
        }),
      );
      $$('[data-reset-city]', host).forEach((b) =>
        b.addEventListener('click', () => {
          const id = b.dataset.resetCity!;
          const d = DEFAULT_CITIES.find((c) => c.id === id);
          setState((st) => ({ cities: st.cities.map((c) => (c.id === id && d ? { ...d } : c)) }));
          draw();
        }),
      );
      $$('input[name="theme"]', host).forEach((r) =>
        r.addEventListener('change', () => {
          setState({ theme: (r as HTMLInputElement).value as 'system' | 'light' | 'dark' });
          window.dispatchEvent(new Event('offerlens:rerender'));
        }),
      );
      if (focusSelector) ($(focusSelector, host) as HTMLElement | null)?.focus();
      $('#export-json', host)!.addEventListener('click', () =>
        download(`offerlens-my-backup-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(getState(), null, 2), 'application/json'),
      );
      $('#import-json', host)!.addEventListener('change', async (e) => {
        const file = (e.target as HTMLInputElement).files?.[0];
        if (!file) return;
        if (file.size > 5_000_000) return toast('That file is too large to be a backup.', 'danger');
        try {
          const next = sanitizeState(JSON.parse(await file.text()));
          replaceState(next);
          toast(`Restored ${next.offers.length} offers and ${next.applications.length} applications`);
          window.dispatchEvent(new Event('offerlens:rerender'));
        } catch {
          toast("Couldn't read that file. Is it an OfferLens backup?", 'danger');
        }
      });
      $('#export-apps', host)!.addEventListener('click', () => {
        const rows: (string | number)[][] = [['Company', 'Role', 'Stage', 'Source', 'Applied on', 'Follow up on', 'Link', 'Notes']];
        getState().applications.forEach((a) => rows.push([a.company, a.role, STAGE_LABELS[a.stage], a.source, appliedOn(a) ?? '', a.followUpOn ?? '', a.link ?? '', a.notes ?? '']));
        download('offerlens-applications.csv', toCsv(rows), 'text/csv');
      });
      $('#export-offers', host)!.addEventListener('click', () => {
        const rows: (string | number)[][] = [['Company', 'Role', 'City', 'Basic', 'Allowance', 'Bonus months', 'Monthly take-home', 'Yearly take-home', 'Notes']];
        getState().offers.forEach((o) => {
          const p = computePay(o);
          rows.push([o.company, o.role, cities.find((c) => c.id === o.cityId)?.name ?? o.cityId, o.monthlyGross, o.monthlyAllowance, o.bonusMonths, p.monthly.net, p.annual.net, o.notes ?? '']);
        });
        download('offerlens-offers.csv', toCsv(rows), 'text/csv');
      });
      $('#load-demo', host)!.addEventListener('click', () =>
        confirmAction('Load demo data?', 'This replaces your current offers and applications with fictional examples.', 'Load demo', () => {
          setState({ offers: sampleOffers(), applications: sampleApplications() });
          toast('Demo data loaded');
          draw();
        }),
      );
      $('#reset-all', host)!.addEventListener('click', () =>
        confirmAction('Erase everything?', 'All offers, applications and settings stored in this browser will be deleted. Download a backup first if you might need them.', 'Erase', () => {
          replaceState(defaultState());
          toast('All data erased');
          window.dispatchEvent(new Event('offerlens:rerender'));
        }),
      );
    };
    draw();
  },
};

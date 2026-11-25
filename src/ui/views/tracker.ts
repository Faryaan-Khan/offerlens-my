import type { View } from '../view';
import { STAGES, STAGE_LABELS, appliedOn, computeStats, moveTo, todayISO, type Application, type Stage } from '../../lib/tracker';
import { esc, pct, safeUrl, uid } from '../../lib/format';
import { $, $$, confirmAction, openModal, toast } from '../dom';
import { destroyCharts, palette, renderChart } from '../charts';
import { getState, setState } from '../store';

const STAGE_COLORS: Record<Stage, string> = {
  wishlist: 'secondary',
  applied: 'blue',
  assessment: 'purple',
  interview: 'orange',
  offer: 'green',
  rejected: 'red',
};

export const trackerView: View = {
  title: 'Applications',
  heading: 'Application tracker',
  pretitle: 'Track every application from wishlist to offer, with follow-up reminders.',
  icon: 'briefcase',
  nav: true,
  render(host, actions) {
    actions.innerHTML = `<button class="btn btn-primary" id="add-app"><i aria-hidden="true" class="ti ti-plus me-1"></i>Add application</button>`;
    $('#add-app', actions)!.addEventListener('click', () => edit());

    let filter = '';

    const draw = (focusSelector?: string) => {
      destroyCharts();
      const apps = getState().applications;
      const stats = computeStats(apps);
      const q = filter.trim().toLowerCase();
      const visible = q ? apps.filter((a) => `${a.company} ${a.role} ${a.source}`.toLowerCase().includes(q)) : apps;

      host.innerHTML = `
      <div class="row row-cards mb-3">
        ${kpi('Submitted', String(stats.submitted), 'send', 'blue')}
        ${kpi('Response rate', pct(stats.responseRate, 0), 'message-circle', 'purple')}
        ${kpi('Interview rate', pct(stats.interviewRate, 0), 'users', 'orange')}
        ${kpi('Offers', String(stats.offers), 'confetti', 'green')}
      </div>
      ${stats.overdue.length ? `<div class="alert alert-warning" role="alert"><div class="d-flex gap-2"><i aria-hidden="true" class="ti ti-calendar-due alert-icon"></i><div>
        <h4 class="alert-title">Follow-ups due</h4>
        <div class="text-secondary">${stats.overdue.map((a) => `<a href="#" data-open="${esc(a.id)}">${esc(a.company)}</a> (${esc(a.followUpOn!)})`).join(', ')}</div>
      </div></div></div>` : ''}
      <div class="card mb-3"><div class="card-body py-2">
        <div class="input-icon">
          <span class="input-icon-addon"><i aria-hidden="true" class="ti ti-search"></i></span>
          <input type="search" class="form-control" placeholder="Filter by company, role or source…" id="app-filter" value="${esc(filter)}" aria-label="Filter applications">
        </div>
      </div></div>
      <div class="kanban mb-3" role="list" aria-label="Application board">
        ${STAGES.map((s) => column(s, visible.filter((a) => a.stage === s))).join('')}
      </div>
      <div class="row row-cards">
        <div class="col-md-6"><div class="card h-100">
          <div class="card-header"><h3 class="card-title">Funnel</h3></div>
          <div class="card-body"><div id="chart-funnel" class="chart-md"></div></div>
        </div></div>
        <div class="col-md-6"><div class="card h-100">
          <div class="card-header"><h3 class="card-title">Applications per week</h3></div>
          <div class="card-body"><div id="chart-weekly" class="chart-md"></div></div>
        </div></div>
      </div>`;

      const p = palette();
      renderChart($('#chart-funnel', host), {
        chart: { type: 'bar', height: 260 },
        series: [{ name: 'Reached this stage', data: stats.funnel.map((f) => f.count) }],
        xaxis: { categories: stats.funnel.map((f) => f.label), labels: { formatter: (v: string) => String(Math.round(+v)) } },
        colors: [p.primary, p.purple, p.orange, p.green],
        plotOptions: { bar: { horizontal: true, distributed: true, barHeight: '60%', borderRadius: 3 } },
        dataLabels: { enabled: true, style: { colors: ['#fff'] } },
        tooltip: { y: { formatter: (v: number) => `${v} application${v === 1 ? '' : 's'}` } },
      });
      renderChart($('#chart-weekly', host), {
        chart: { type: 'bar', height: 260 },
        series: [{ name: 'Applied', data: stats.perWeek.map((w) => w.count) }],
        xaxis: { categories: stats.perWeek.map((w) => new Date(w.week).toLocaleDateString('en-MY', { day: 'numeric', month: 'short', timeZone: 'UTC' })) },
        yaxis: { forceNiceScale: true, labels: { formatter: (v: number) => String(Math.round(v)) } },
        colors: [p.primary],
        plotOptions: { bar: { columnWidth: '50%', borderRadius: 3 } },
      });

      const filterEl = $('#app-filter', host) as HTMLInputElement;
      filterEl.addEventListener('input', () => {
        filter = filterEl.value;
        const pos = filterEl.selectionStart;
        draw();
        const again = $('#app-filter', host) as HTMLInputElement;
        again.focus();
        again.setSelectionRange(pos, pos);
      });
      $$('[data-open]', host).forEach((el) =>
        el.addEventListener('click', (e) => {
          e.preventDefault();
          edit(getState().applications.find((a) => a.id === el.dataset.open));
        }),
      );
      // Debounced so arrowing through a closed <select> (Windows/Linux) doesn't record every option.
      $$('select[data-move]', host).forEach((sel) => {
        let t: ReturnType<typeof setTimeout> | undefined;
        sel.addEventListener('change', () => {
          clearTimeout(t);
          t = setTimeout(() => move(sel.dataset.move!, (sel as HTMLSelectElement).value as Stage, true), 600);
        });
      });
      if (focusSelector) ($(focusSelector, host) as HTMLElement | null)?.focus();
      // Drag and drop between columns (the stage dropdown on each card is the keyboard-accessible equivalent).
      $$('.kanban-card', host).forEach((card) => {
        card.addEventListener('dragstart', (e) => {
          (e as DragEvent).dataTransfer?.setData('text/plain', card.dataset.id!);
          card.classList.add('dragging');
        });
        card.addEventListener('dragend', () => card.classList.remove('dragging'));
      });
      $$('.kanban-col', host).forEach((col) => {
        col.addEventListener('dragover', (e) => {
          e.preventDefault();
          col.classList.add('drag-over');
        });
        col.addEventListener('dragleave', () => col.classList.remove('drag-over'));
        col.addEventListener('drop', (e) => {
          e.preventDefault();
          col.classList.remove('drag-over');
          const id = (e as DragEvent).dataTransfer?.getData('text/plain');
          if (id) move(id, col.dataset.stage as Stage);
        });
      });
    };

    function move(id: string, stage: Stage, refocus = false): void {
      if (!host.isConnected) return;
      const app = getState().applications.find((a) => a.id === id);
      if (!app || app.stage === stage) return;
      setState((s) => ({ applications: s.applications.map((a) => (a.id === id ? moveTo(a, stage) : a)) }));
      toast(`${app.company} moved to ${STAGE_LABELS[stage]}`);
      draw(refocus ? `select[data-move="${CSS.escape(id)}"]` : undefined);
    }

    function edit(existing?: Application): void {
      const a: Application = existing ?? { id: uid(), company: '', role: '', source: '', stage: 'applied', history: [], notes: '' };
      const sources = ['LinkedIn', 'JobStreet', 'Hiredly', 'Maukerja', 'Company site', 'Referral', 'Career fair', 'Other'];
      openModal({
        title: existing ? `Edit ${a.company}` : 'Add an application',
        submitLabel: existing ? 'Save changes' : 'Add',
        danger: existing
          ? {
              label: 'Delete',
              onClick: () =>
                confirmAction('Delete application?', `Remove ${a.company} from your tracker?`, 'Delete', () => {
                  setState((s) => ({ applications: s.applications.filter((x) => x.id !== a.id) }));
                  toast('Application deleted');
                  draw();
                }),
            }
          : undefined,
        body: `
          <div class="row g-3">
            <div class="col-sm-6"><label class="form-label required" for="a-company">Company</label>
              <input class="form-control" id="a-company" name="company" required maxlength="80" value="${esc(a.company)}">
              <div class="invalid-feedback">Company is required.</div></div>
            <div class="col-sm-6"><label class="form-label" for="a-role">Role</label>
              <input class="form-control" id="a-role" name="role" maxlength="80" value="${esc(a.role)}"></div>
            <div class="col-sm-6"><label class="form-label" for="a-stage">Stage</label>
              <select class="form-select" id="a-stage" name="stage">${STAGES.map((s) => `<option value="${s}" ${s === a.stage ? 'selected' : ''}>${STAGE_LABELS[s]}</option>`).join('')}</select></div>
            <div class="col-sm-6"><label class="form-label" for="a-source">Source</label>
              <input class="form-control" id="a-source" name="source" list="a-sources" maxlength="60" value="${esc(a.source)}">
              <datalist id="a-sources">${sources.map((s) => `<option value="${s}">`).join('')}</datalist></div>
            <div class="col-sm-6"><label class="form-label" for="a-applied">Applied on</label>
              <input type="date" class="form-control" id="a-applied" name="appliedOn" value="${esc(appliedOn(a) ?? (existing ? '' : todayISO()))}"></div>
            <div class="col-sm-6"><label class="form-label" for="a-follow">Follow up on</label>
              <input type="date" class="form-control" id="a-follow" name="followUpOn" value="${esc(a.followUpOn ?? '')}"></div>
            <div class="col-12"><label class="form-label" for="a-link">Job posting link</label>
              <input type="url" class="form-control" id="a-link" name="link" maxlength="500" placeholder="https://" value="${esc(a.link ?? '')}">
              <div class="invalid-feedback">Enter a full http(s) link.</div></div>
            <div class="col-12"><label class="form-label" for="a-notes">Notes</label>
              <textarea class="form-control" id="a-notes" name="notes" rows="3" maxlength="2000">${esc(a.notes ?? '')}</textarea></div>
          </div>`,
        onSubmit: (form) => {
          const fd = new FormData(form);
          const s = (k: string) => String(fd.get(k) ?? '').trim();
          const stage = s('stage') as Stage;
          const applied = /^\d{4}-\d{2}-\d{2}$/.test(s('appliedOn')) ? s('appliedOn') : undefined;
          let next: Application = {
            ...a,
            company: s('company').slice(0, 80) || 'Untitled',
            role: s('role').slice(0, 80),
            source: s('source').slice(0, 60),
            link: safeUrl(s('link')),
            followUpOn: /^\d{4}-\d{2}-\d{2}$/.test(s('followUpOn')) ? s('followUpOn') : undefined,
            notes: s('notes').slice(0, 2000),
          };
          // Keep the "applied" date in history in sync with the form.
          const hist = next.history.filter((h) => h.stage !== 'applied');
          next.history = applied && (stage !== 'wishlist' || appliedOn(a)) ? [{ stage: 'applied', on: applied }, ...hist] : hist;
          next = moveTo(next, stage);
          if (!next.history.length || next.history[next.history.length - 1].stage !== stage) next.history.push({ stage, on: todayISO() });
          setState((st) => ({ applications: existing ? st.applications.map((x) => (x.id === a.id ? next : x)) : [next, ...st.applications] }));
          toast(existing ? 'Application updated' : 'Application added');
          draw();
        },
      });
    }

    draw();
  },
};

function kpi(label: string, value: string, icon: string, color: string): string {
  return `<div class="col-sm-6 col-lg-3"><div class="card card-sm"><div class="card-body"><div class="row align-items-center">
    <div class="col-auto"><span class="bg-${color} text-white avatar"><i aria-hidden="true" class="ti ti-${icon}"></i></span></div>
    <div class="col"><div class="font-weight-medium h3 mb-0 metric">${esc(value)}</div><div class="text-secondary">${esc(label)}</div></div>
  </div></div></div></div>`;
}

function column(stage: Stage, apps: Application[]): string {
  return `<section class="kanban-col" data-stage="${stage}" role="listitem" aria-label="${STAGE_LABELS[stage]} column">
    <div class="d-flex align-items-center mb-2">
      <span class="badge bg-${STAGE_COLORS[stage]}-lt me-2">${apps.length}</span>
      <h3 class="h4 mb-0">${STAGE_LABELS[stage]}</h3>
    </div>
    ${apps.map(card).join('') || `<div class="text-secondary small px-1 py-3 text-center">Nothing here</div>`}
  </section>`;
}

function card(a: Application): string {
  const link = safeUrl(a.link);
  const applied = appliedOn(a);
  const due = a.followUpOn && a.followUpOn <= todayISO() && a.stage !== 'rejected' && a.stage !== 'offer';
  return `<article class="card card-sm mb-2 kanban-card" draggable="true" data-id="${esc(a.id)}" data-testid="app-card">
    <div class="card-body p-2">
      <div class="d-flex align-items-start gap-2">
        <div class="flex-fill text-truncate">
          <a href="#" class="fw-medium text-reset d-block text-truncate" data-open="${esc(a.id)}">${esc(a.company)}</a>
          <div class="text-secondary small text-truncate">${esc(a.role || '—')}</div>
        </div>
        ${link ? `<a href="${esc(link)}" target="_blank" rel="noopener noreferrer" class="text-secondary" aria-label="Open job posting"><i aria-hidden="true" class="ti ti-external-link"></i></a>` : ''}
      </div>
      <div class="d-flex align-items-center gap-2 mt-2 small text-secondary">
        ${a.source ? `<span class="badge bg-secondary-lt">${esc(a.source)}</span>` : ''}
        ${applied ? `<span class="text-nowrap"><i aria-hidden="true" class="ti ti-clock"></i> ${esc(applied)}</span>` : ''}
        ${due ? `<span class="text-warning ms-auto" title="Follow-up due"><i aria-hidden="true" class="ti ti-bell-ringing"></i></span>` : ''}
      </div>
      <select class="form-select form-select-sm mt-2" data-move="${esc(a.id)}" aria-label="Move ${esc(a.company)} to stage">
        ${STAGES.map((s) => `<option value="${s}" ${s === a.stage ? 'selected' : ''}>${STAGE_LABELS[s]}</option>`).join('')}
      </select>
    </div>
  </article>`;
}

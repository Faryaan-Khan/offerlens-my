import type { View } from '../view';
import { MY_RATES } from '../../data/rates';
import { money, pct } from '../../lib/format';

export const aboutView: View = {
  title: 'Methodology',
  heading: 'How the numbers are worked out',
  pretitle: 'Transparent by design',
  icon: 'info-circle',
  nav: true,
  render(host) {
    const r = MY_RATES;
    host.innerHTML = `
    <div class="row row-cards">
      <div class="col-lg-8">
        <div class="card"><div class="card-body markdown">
          <h2>What OfferLens MY does</h2>
          <p>It turns a Malaysian job offer into the number that matters: <strong>what you actually keep each month</strong>, after statutory deductions and the cost of living where the job is. Everything runs in your browser, and nothing you type is sent anywhere.</p>

          <h3>Statutory deductions (employee side)</h3>
          <ul>
            <li><strong>EPF (KWSP):</strong> ${pct(r.epf.employeeRate, 0)} of monthly wages (basic + fixed allowances) and of bonus, rounded up to the next ringgit. Employer pays ${pct(r.epf.employerRateLow, 0)} at or below ${money(r.epf.employerThreshold)}/month, ${pct(r.epf.employerRateHigh, 0)} above.</li>
            <li><strong>SOCSO (PERKESO):</strong> ${pct(r.socso.employeeRate, 1)} of wages up to the ${money(r.socso.wageCeiling)} ceiling, rounded to 5 sen. Bonus is excluded.</li>
            <li><strong>EIS (SIP):</strong> ${pct(r.eis.employeeRate, 1)} of wages up to ${money(r.eis.wageCeiling)}.</li>
          </ul>
          <p class="text-secondary">PERKESO publishes contributions as a bracketed table, so results can differ from your payslip by a few sen.</p>

          <h3>Income tax (YA ${r.year})</h3>
          <p>Chargeable income = yearly gross (12 months + bonus) − reliefs. Reliefs added automatically: individual ${money(r.reliefs.individual)}, EPF up to ${money(r.reliefs.epfMax)}, SOCSO + EIS up to ${money(r.reliefs.socsoEisMax)}, plus whatever lifestyle (max ${money(r.reliefs.lifestyleMax)}) and other reliefs you enter. A ${money(r.rebate.amount)} rebate applies when chargeable income is at most ${money(r.rebate.threshold)}, then zakat is deducted.</p>
          <div class="table-responsive"><table class="table table-sm">
            <thead><tr><th>Chargeable income</th><th class="text-end">Rate</th></tr></thead>
            <tbody>${r.taxBands
              .map((b) => `<tr><td>${money(b.from)} – ${Number.isFinite(b.to) ? money(b.to) : 'above'}</td><td class="text-end">${pct(b.rate, 0)}</td></tr>`)
              .join('')}</tbody>
          </table></div>
          <p class="text-secondary">The monthly tax shown is for a regular month: the yearly tax on your salary alone, divided by 12. The extra tax caused by a bonus is shown separately, because employers deduct it in the bonus month. Your employer's PCB (MTD) uses LHDN's monthly formula, which lands close to this over the year; any difference is settled when you file your e-BE.</p>

          <h3>Comparing offers</h3>
          <p>Offers are compared using basic salary, allowances and bonus with the standard reliefs (the lifestyle, other-relief and zakat inputs on the take-home page don't apply). <em>Left over</em> = average monthly take-home (bonus spread across 12 months) − the city's living cost − job-specific costs such as commuting. The score blends that figure (scaled from worst to best of your offers) with your 1–5 ratings for growth, learning and work-life balance, using the weights you choose.</p>
          <p>The <strong>negotiation helper</strong> and <strong>reverse calculator</strong> solve the maths backwards: they search for the basic salary whose after-tax result reaches the target, then check the next RM1,500 above it. Take-home isn't perfectly smooth (EPF rounds up to the next ringgit, and the RM400 rebate disappears just above RM35,000 chargeable income), so the answer is a salary that stays at or above your target even if you're offered a little more.</p>

          <h3>Keeping the data fresh</h3>
          <p>City living costs start from editable baselines and are scaled by each state's Consumer Price Index from the Department of Statistics Malaysia (DOSM). A scheduled job refreshes that data every day from the free <a href="https://data.gov.my/data-catalogue/cpi_state" rel="noopener">data.gov.my API</a> and redeploys the site. Tax and contribution rates change only with the national Budget, and are updated in one reviewed file.</p>
        </div></div>
      </div>
      <div class="col-lg-4">
        <div class="card mb-3"><div class="card-body">
          <h3 class="card-title"><i aria-hidden="true" class="ti ti-alert-triangle text-warning me-1"></i>Not advice</h3>
          <p class="text-secondary mb-0">These are careful estimates for planning and negotiation. For your actual tax position, check with LHDN or a licensed tax agent.</p>
        </div></div>
        <div class="card"><div class="card-body">
          <h3 class="card-title">Sources</h3>
          <ul class="list-unstyled mb-0">
            <li><a href="https://www.hasil.gov.my/en/individual/individual-life-cycle/income-declaration/tax-rate/" rel="noopener">LHDN: income tax rates</a></li>
            <li><a href="https://www.kwsp.gov.my/en/employer/responsibilities/mandatory-contribution" rel="noopener">KWSP: contribution rates</a></li>
            <li><a href="https://www.perkeso.gov.my/" rel="noopener">PERKESO: SOCSO &amp; EIS</a></li>
            <li><a href="https://data.gov.my/" rel="noopener">data.gov.my: CPI by state (CC BY 4.0)</a></li>
            <li><a href="https://tabler.io/" rel="noopener">UI built on Tabler (MIT)</a></li>
          </ul>
        </div></div>
      </div>
    </div>`;
  },
};

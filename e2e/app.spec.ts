import { test as base, expect, type Locator, type Page } from '@playwright/test';

/**
 * End-to-end flows for OfferLens MY. Every test gets a fresh browser context,
 * so localStorage starts empty and the app shows its built-in demo data.
 *
 * Tests tagged @mobile also run in the 390x844 mobile project;
 * @mobile-only tests run there and nowhere else.
 */

// Fail any test that logs a console error or throws an uncaught page error.
const test = base.extend<{ failOnConsoleErrors: void }>({
  failOnConsoleErrors: [
    async ({ page }, use) => {
      const errors: string[] = [];
      page.on('console', (msg) => {
        if (msg.type() === 'error') errors.push(`console.error: ${msg.text()}`);
      });
      page.on('pageerror', (err) => errors.push(`pageerror: ${err.message}`));
      await use();
      expect(errors, 'no console or page errors').toEqual([]);
    },
    { auto: true },
  ],
});

const ROUTES = [
  { hash: '#/', nav: 'Overview', heading: 'Your job-offer dashboard' },
  { hash: '#/take-home', nav: 'Take-home pay', heading: 'Take-home pay' },
  { hash: '#/offers', nav: 'Compare offers', heading: 'Compare offers' },
  { hash: '#/tracker', nav: 'Applications', heading: 'Application tracker' },
  { hash: '#/settings', nav: 'Settings & data', heading: 'Settings & data' },
  { hash: '#/about', nav: 'Methodology', heading: 'How the numbers are worked out' },
] as const;

const pageTitle = (page: Page) => page.locator('#page-title');
/** Sidebar link by its label. Matches the end of the name, since icon-font glyphs can prefix it. */
const navLink = (page: Page, label: string) =>
  page.locator('#nav').getByRole('link', { name: new RegExp(`${label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`) });
/** The modal Bootstrap is currently showing (closing modals linger briefly while they fade out). */
const dialog = (page: Page, name: string | RegExp) => page.getByRole('dialog', { name });
/** Parse "RM 4,567" / "RM 4,567.89" into a number. */
const ringgit = async (loc: Locator) => Number((await loc.innerText()).replace(/[^\d.]/g, ''));

async function open(page: Page, hash: string) {
  await page.goto(`/${hash}`);
  await expect(page.locator('#view .view')).not.toBeEmpty();
}

test.describe('routing', () => {
  for (const r of ROUTES) {
    test(`${r.hash} loads with its heading and document title`, { tag: '@mobile' }, async ({ page }) => {
      await open(page, r.hash);
      await expect(pageTitle(page)).toHaveText(r.heading);
      await expect(page).toHaveTitle(`${r.nav} · OfferLens MY`);
    });
  }

  test('sidebar links navigate between every page', async ({ page }) => {
    await open(page, '#/');
    for (const r of [...ROUTES.slice(1), ROUTES[0]]) {
      await navLink(page, r.nav).click();
      await expect(page).toHaveURL(new RegExp(`${r.hash.replace(/[/#]/g, '\\$&')}$`));
      await expect(pageTitle(page)).toHaveText(r.heading);
      await expect(page).toHaveTitle(`${r.nav} · OfferLens MY`);
      await expect(navLink(page, r.nav)).toHaveAttribute('aria-current', 'page');
      await expect(page.locator('#nav [aria-current="page"]')).toHaveCount(1);
    }
  });

  test('unknown routes fall back to the overview', async ({ page }) => {
    await open(page, '#/does-not-exist');
    await expect(pageTitle(page)).toHaveText('Your job-offer dashboard');
  });
});

test.describe('take-home calculator', () => {
  async function fillPackage(page: Page) {
    await page.getByLabel('Basic monthly salary').fill('4500');
    await page.getByLabel('Fixed monthly allowances').fill('0');
    await page.getByLabel('Bonus').fill('1');
    await page.getByLabel('Your EPF contribution').selectOption('0.11');
    await page.getByLabel('Lifestyle relief').fill('1500');
    await page.getByLabel('Other reliefs').fill('0');
    await page.getByLabel('Zakat paid').fill('0');
  }

  test('computes monthly take-home and the reverse calculator', { tag: '@mobile' }, async ({ page }) => {
    await open(page, '#/take-home');
    await fillPackage(page);
    // Intl en-MY currency format: "RM 3,902.75" (with a no-break space).
    await expect(page.getByTestId('monthly-net')).toHaveText(/^RM\s3,902\.75$/);

    await page.getByLabel('Target monthly take-home').fill('4000');
    const required = page.getByTestId('required-gross');
    await expect(required).toHaveText(/^RM\s[\d,]+$/);
    expect(await ringgit(required)).toBeGreaterThan(4500);
    await expect(page.locator('#out-required-sub')).toContainText('more than your current figure');
  });

  test('a higher salary updates the result live', async ({ page }) => {
    await open(page, '#/take-home');
    await fillPackage(page);
    const net = page.getByTestId('monthly-net');
    await expect(net).toHaveText(/3,902\.75/);
    await page.getByLabel('Basic monthly salary').fill('6000');
    await expect(net).not.toHaveText(/3,902\.75/);
    expect(await ringgit(net)).toBeGreaterThan(3902.75);
  });

  test('inputs persist across a reload', async ({ page }) => {
    await open(page, '#/take-home');
    await page.getByLabel('Basic monthly salary').fill('5250');
    await page.getByLabel('Bonus').fill('2.5');
    await page.getByLabel('Target monthly take-home').fill('4321');
    await expect
      .poll(() =>
        page.evaluate(() => {
          const s = JSON.parse(localStorage.getItem('offerlens-my:v1') || '{}');
          return [s.calculator?.monthlyGross, s.calculator?.bonusMonths, s.targetNet];
        }),
      )
      .toEqual([5250, 2.5, 4321]);

    await page.reload();
    await expect(page.getByLabel('Basic monthly salary')).toHaveValue('5250');
    await expect(page.getByLabel('Bonus')).toHaveValue('2.5');
    await expect(page.getByLabel('Target monthly take-home')).toHaveValue('4321');
  });
});

test.describe('offers', () => {
  test('demo data shows three ranked offers and a counter-offer', async ({ page }) => {
    await open(page, '#/offers');
    await expect(page.getByTestId('offer-card')).toHaveCount(3);
    await expect(page.getByTestId('offer-card').first()).toContainText('Top pick');
    await expect(page.locator('#chart-offers .apexcharts-canvas')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Negotiation helper' })).toBeVisible();
    await expect(page.getByTestId('counter-offer')).toHaveText(/^RM\s[\d,]+$/);
  });

  test('add, edit and delete an offer', async ({ page }) => {
    await open(page, '#/offers');
    const cards = page.getByTestId('offer-card');
    await expect(cards).toHaveCount(3);

    // Add: company is required.
    await page.locator('#page-actions').getByRole('button', { name: 'Add offer' }).click();
    const add = dialog(page, 'Add a job offer');
    await expect(add).toBeVisible();
    await add.getByRole('button', { name: 'Add offer' }).click();
    await expect(add.getByText('Company is required.')).toBeVisible();
    await expect(add).toBeVisible();

    await add.getByLabel('Company').fill('Nasi Lemak Tech');
    await add.getByLabel('Role').fill('Platform Engineer');
    await add.getByLabel('Basic salary / month').fill('6500');
    await add.getByLabel('City').selectOption('penang');
    await add.getByRole('button', { name: 'Add offer' }).click();
    await expect(add).toBeHidden();
    await expect(cards).toHaveCount(4);
    const mine = cards.filter({ hasText: 'Nasi Lemak Tech' });
    await expect(mine).toContainText('Platform Engineer');
    await expect(mine).toContainText('Penang');

    // Edit.
    await page.getByRole('button', { name: 'Edit Nasi Lemak Tech' }).click();
    const edit = dialog(page, 'Edit Nasi Lemak Tech');
    await expect(edit.getByLabel('Company')).toHaveValue('Nasi Lemak Tech');
    await edit.getByLabel('Company').fill('Teh Tarik Tech');
    // Any ringgit amount is accepted, not just multiples of the spinner step.
    await edit.getByLabel('Basic salary / month').fill('4123');
    await edit.getByRole('button', { name: 'Save changes' }).click();
    await expect(edit).toBeHidden();
    await expect(cards.filter({ hasText: 'Teh Tarik Tech' })).toHaveCount(1);
    await expect(cards.filter({ hasText: 'Teh Tarik Tech' })).toContainText(/RM\s4,123/);
    await expect(cards.filter({ hasText: 'Nasi Lemak Tech' })).toHaveCount(0);

    // Delete via the confirm modal.
    await page.getByRole('button', { name: 'Edit Teh Tarik Tech' }).click();
    await dialog(page, 'Edit Teh Tarik Tech').getByRole('button', { name: 'Delete' }).click();
    const confirm = dialog(page, 'Delete offer?');
    await expect(confirm).toContainText('Remove Teh Tarik Tech from your comparison?');
    await confirm.getByRole('button', { name: 'Delete' }).click();
    await expect(confirm).toBeHidden();
    await expect(cards).toHaveCount(3);
    await expect(cards.filter({ hasText: 'Teh Tarik Tech' })).toHaveCount(0);
    await expect(page.locator('.modal-backdrop')).toHaveCount(0);
  });
});

test.describe('application tracker', () => {
  test('demo data flags follow-ups that are due', async ({ page }) => {
    await open(page, '#/tracker');
    const alert = page.getByRole('alert').filter({ hasText: 'Follow-ups due' });
    await expect(alert).toBeVisible();
    await expect(alert.getByRole('link').first()).toBeVisible();
  });

  test('add an application, move it to Interview and filter the board', async ({ page }) => {
    await open(page, '#/tracker');
    const column = (stage: string) => page.getByRole('listitem', { name: `${stage} column` });
    const cards = page.getByTestId('app-card');
    const before = await cards.count();
    expect(before).toBeGreaterThan(1);

    await page.locator('#page-actions').getByRole('button', { name: 'Add application' }).click();
    const add = dialog(page, 'Add an application');
    await add.getByRole('button', { name: 'Add', exact: true }).click();
    await expect(add.getByText('Company is required.')).toBeVisible();
    await add.getByLabel('Company').fill('Durian Robotics');
    await add.getByLabel('Role').fill('Embedded Engineer');
    await add.getByLabel('Source').fill('Referral');
    await add.getByRole('button', { name: 'Add', exact: true }).click();
    await expect(add).toBeHidden();

    await expect(cards).toHaveCount(before + 1);
    await expect(column('Applied').getByTestId('app-card').filter({ hasText: 'Durian Robotics' })).toBeVisible();

    await page.getByLabel('Move Durian Robotics to stage').selectOption('interview');
    await expect(column('Interview').getByTestId('app-card').filter({ hasText: 'Durian Robotics' })).toBeVisible();
    await expect(column('Applied').getByTestId('app-card').filter({ hasText: 'Durian Robotics' })).toHaveCount(0);

    const filter = page.getByLabel('Filter applications');
    await filter.fill('durian');
    await expect(cards).toHaveCount(1);
    await expect(cards.first()).toContainText('Durian Robotics');
    await expect(filter).toBeFocused();
    await filter.fill('');
    await expect(cards).toHaveCount(before + 1);
  });
});

test.describe('settings & data', () => {
  test('editing a city cost marks it custom and "Use auto" reverts it', async ({ page }) => {
    await open(page, '#/settings');
    const row = page.getByRole('row').filter({ has: page.getByLabel('Monthly cost for Penang') });
    await expect(row.getByText('auto', { exact: true })).toBeVisible();

    const input = row.getByLabel('Monthly cost for Penang');
    await input.fill('2750');
    await input.blur();
    await expect(row.getByText('custom', { exact: true })).toBeVisible();
    await expect(row.getByLabel('Monthly cost for Penang')).toHaveValue('2750');

    await row.getByRole('button', { name: 'Use auto' }).click();
    await expect(row.getByText('auto', { exact: true })).toBeVisible();
    await expect(row.getByRole('button', { name: 'Use auto' })).toHaveCount(0);
    await expect(row.getByLabel('Monthly cost for Penang')).not.toHaveValue('2750');
  });

  test('backup, erase everything, then restore from the backup file', async ({ page }) => {
    await open(page, '#/settings');

    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: 'Backup (JSON)' }).click(),
    ]);
    expect(download.suggestedFilename()).toMatch(/^offerlens-my-backup-\d{4}-\d{2}-\d{2}\.json$/);
    const backupPath = await download.path();

    await page.getByRole('button', { name: 'Erase everything' }).click();
    const confirm = dialog(page, 'Erase everything?');
    await confirm.getByRole('button', { name: 'Erase' }).click();
    await expect(confirm).toBeHidden();

    await navLink(page, 'Overview').click();
    await expect(page.getByText('No offers yet.')).toBeVisible();
    await expect(page.getByText('No applications tracked yet.')).toBeVisible();
    await expect(page.getByText("You're looking at demo data")).toHaveCount(0);

    // Erased state survives a reload (demo data is not re-seeded).
    await page.reload();
    await expect(page.getByText('No offers yet.')).toBeVisible();

    await navLink(page, 'Settings & data').click();
    await page.locator('#import-json').setInputFiles(backupPath);
    await expect(page.getByRole('status').filter({ hasText: /Restored 3 offers and 11 applications/ })).toBeVisible();

    await navLink(page, 'Compare offers').click();
    await expect(page.getByTestId('offer-card')).toHaveCount(3);
  });

  test('CSV exports download', async ({ page }) => {
    await open(page, '#/settings');
    for (const [label, file] of [
      ['Applications CSV', 'offerlens-applications.csv'],
      ['Offers CSV', 'offerlens-offers.csv'],
    ]) {
      const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: label }).click()]);
      expect(download.suggestedFilename()).toBe(file);
    }
  });
});

test.describe('theme', () => {
  test('dark-mode toggle switches data-bs-theme and persists', async ({ page }) => {
    await open(page, '#/');
    const html = page.locator('html');
    await expect(html).toHaveAttribute('data-bs-theme', 'light');
    const toggle = page.getByRole('button', { name: 'Toggle dark mode' }).filter({ visible: true });
    await toggle.click();
    await expect(html).toHaveAttribute('data-bs-theme', 'dark');
    await page.reload();
    await expect(html).toHaveAttribute('data-bs-theme', 'dark');
    await page.getByRole('button', { name: 'Toggle dark mode' }).filter({ visible: true }).click();
    await expect(html).toHaveAttribute('data-bs-theme', 'light');
  });
});

test.describe('mobile', () => {
  test('navbar toggler opens the menu and navigates', { tag: '@mobile-only' }, async ({ page }) => {
    await open(page, '#/');
    const menu = page.locator('#sidebar-menu');
    await expect(menu).toBeHidden();
    const toggler = page.getByRole('button', { name: 'Toggle navigation' });
    await toggler.click();
    await expect(menu).toBeVisible();
    await expect(toggler).toHaveAttribute('aria-expanded', 'true');
    await menu.getByRole('link', { name: 'Compare offers' }).click();
    await expect(pageTitle(page)).toHaveText('Compare offers');
    await expect(menu).toBeHidden();
    await expect(page.getByTestId('offer-card')).toHaveCount(3);
  });

  test('the theme toggle is reachable on mobile', { tag: '@mobile-only' }, async ({ page }) => {
    await open(page, '#/');
    await page.getByRole('button', { name: 'Toggle dark mode' }).filter({ visible: true }).click();
    await expect(page.locator('html')).toHaveAttribute('data-bs-theme', 'dark');
  });
});

test.describe('accessibility smoke checks', () => {
  test('every take-home form control has a label', { tag: '@mobile' }, async ({ page }) => {
    await open(page, '#/take-home');
    const unlabelled = await page.evaluate(() =>
      Array.from(document.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>('input, select, textarea'))
        .filter((el) => el.type !== 'hidden')
        .filter((el) => !(el.labels && el.labels.length) && !el.getAttribute('aria-label') && !el.getAttribute('aria-labelledby'))
        .map((el) => el.outerHTML.slice(0, 120)),
    );
    expect(unlabelled).toEqual([]);
    expect(await page.locator('#view input, #view select').count()).toBeGreaterThanOrEqual(8);
  });

  for (const r of ROUTES) {
    test(`${r.hash}: icon-only buttons and links have accessible names`, async ({ page }) => {
      await open(page, r.hash);
      const problems = await page.evaluate(() => {
        const out: string[] = [];
        const named = (el: Element) =>
          !!(el.textContent || '').trim() || !!el.getAttribute('aria-label') || !!el.getAttribute('aria-labelledby') || !!el.getAttribute('title');
        document.querySelectorAll('button, a[href], [role="button"]').forEach((el) => {
          if (!named(el)) out.push(`unnamed control: ${el.outerHTML.slice(0, 120)}`);
        });
        document.querySelectorAll('img').forEach((img) => {
          if (!img.hasAttribute('alt')) out.push(`img without alt: ${img.outerHTML.slice(0, 120)}`);
        });
        document.querySelectorAll('input, select, textarea').forEach((el) => {
          const f = el as HTMLInputElement;
          if (f.type === 'hidden' || f.classList.contains('d-none')) return;
          if (!(f.labels && f.labels.length) && !f.getAttribute('aria-label') && !f.getAttribute('aria-labelledby'))
            out.push(`unlabelled field: ${f.outerHTML.slice(0, 120)}`);
        });
        if (document.querySelectorAll('h1').length !== 1) out.push('page should have exactly one h1');
        return out;
      });
      expect(problems).toEqual([]);
    });
  }
});

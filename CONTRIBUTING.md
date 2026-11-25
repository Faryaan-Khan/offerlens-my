# Contributing to OfferLens MY

Thanks for helping make job offers in Malaysia easier to understand. Bug
reports, rate updates, new cities and UI improvements are all welcome.

By taking part you agree to follow the [Code of Conduct](CODE_OF_CONDUCT.md).

## Development setup

You need **Node.js 22 or later** (see `.nvmrc`; `nvm use` picks it up).

```bash
git clone https://github.com/Faryaan-Khan/offerlens-my.git
cd offerlens-my
npm ci
npm run dev
```

Open the URL Vite prints. The app has no backend; everything is stored in your
browser's `localStorage`, so use a private window or *Settings → Erase
everything* to start fresh.

### Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Start the Vite dev server |
| `npm test` | Run the Vitest unit tests once |
| `npm run typecheck` | Type-check with `tsc --noEmit` |
| `npm run e2e` | Run the Playwright end-to-end tests (first time: `npx playwright install --with-deps chromium`) |
| `npm run build` | Type-check, then build to `dist/` |
| `npm run preview` | Serve the production build |
| `npm run data:update` | Fetch the latest CPI from data.gov.my into `public/data/market.json` |

## Code style

- **TypeScript in strict mode.** No `any` in new logic unless you are
  sanitising untrusted input, and no unused locals or parameters.
- **Logic in `src/lib/`, as pure functions.** Payroll, offer scoring, tracker
  stats, storage sanitising and market data are plain functions with no DOM
  access. Every change there needs a matching test in `tests/`.
- **UI in `src/ui/`.** One file per view in `src/ui/views/`, shared helpers in
  `dom.ts`, `charts.ts` and `store.ts`. Views read from the store and call into
  `src/lib`; they do not do maths themselves.
- **Data in `src/data/`.** Statutory rates live only in `rates.ts`, city
  baselines only in `cities.ts`. Do not hard-code a rate anywhere else.
- **Safe HTML.** Escape every user-supplied value with `esc()` and pass links
  through `safeUrl()` before interpolating them into markup.
- **Formatting** follows `.editorconfig`: 2-space indent, LF line endings,
  final newline.

## Commit messages

Use [Conventional Commits](https://www.conventionalcommits.org/):

```
feat(offers): show savings rate in the comparison table
fix(payroll): round EIS to 5 sen above the wage ceiling
docs(methodology): add RM10,000 worked example
chore(data): refresh CPI from data.gov.my
```

Common types: `feat`, `fix`, `docs`, `test`, `refactor`, `perf`, `chore`, `ci`.

## Updating rates after a Budget

Tax bands, reliefs, the rebate, and EPF, SOCSO and EIS rates change only with
the national Budget or an official announcement. To update them:

1. Wait until the change is gazetted or published on the official site (LHDN,
   KWSP or PERKESO). Links are in [docs/DATA.md](docs/DATA.md) and
   [docs/METHODOLOGY.md](docs/METHODOLOGY.md#12-sources).
2. Edit `src/data/rates.ts`. If the year of assessment changes, update `year`.
3. Update the expected figures in `tests/payroll.test.ts` (and any other test
   that depends on the rate). Work out at least one example by hand in the test
   comment, as the existing tests do.
4. Update the tables and worked examples in `docs/METHODOLOGY.md`, the summary
   example in `README.md` if it changes, and add a `CHANGELOG.md` entry.
5. Open a pull request with the official source link and the effective date.

If you are not sure how to make the change, open a **Statutory rate changed**
issue instead and include the source link.

## Pull request checklist

- [ ] `npm test` passes
- [ ] `npm run typecheck` passes
- [ ] `npm run e2e` passes for UI changes
- [ ] New or changed logic in `src/lib/` has tests
- [ ] Docs updated (`README.md`, `docs/METHODOLOGY.md`, `docs/DATA.md`) where relevant
- [ ] Screenshots attached for visible UI changes (light and dark, desktop and mobile if layout changed)
- [ ] `CHANGELOG.md` updated under **Unreleased**

## Reporting bugs and ideas

Use the issue forms on GitHub. For a wrong number, please include the inputs
you used and the figure you expected (a payslip figure is ideal, with personal
details removed). For security problems, follow [SECURITY.md](SECURITY.md)
instead of opening a public issue.

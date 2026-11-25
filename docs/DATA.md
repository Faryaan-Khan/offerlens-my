# Data sources and refresh

OfferLens MY uses two kinds of data: **statutory rates**, which change once a
year at most and are maintained by hand, and **consumer prices**, which change
every month and are refreshed automatically.

| Data | Where it lives | How it is updated |
| --- | --- | --- |
| Income tax bands, reliefs, rebate | `src/data/rates.ts` | Manually, after each Budget |
| EPF (KWSP) contribution rates | `src/data/rates.ts` | Manually, when KWSP announces changes |
| SOCSO (PERKESO) and EIS rates and wage ceiling | `src/data/rates.ts` | Manually, when PERKESO announces changes |
| City living-cost baselines | `src/data/cities.ts` | Manually (rare); kept current by CPI scaling |
| Consumer Price Index by state and national | `public/data/market.json` | Automatically, daily, by `.github/workflows/refresh-data.yml` |

## Statutory rates (manual)

`src/data/rates.ts` holds the rate table for one year of assessment. After each
Budget speech (usually in October) and once the measures are gazetted, check:

- **Income tax**: LHDN (Inland Revenue Board), tax rates and reliefs:
  <https://www.hasil.gov.my/en/individual/individual-life-cycle/income-declaration/tax-rate/>
  and <https://www.hasil.gov.my/en/individual/individual-life-cycle/income-declaration/tax-reliefs/>
- **EPF**: KWSP contribution rates (Third Schedule):
  <https://www.kwsp.gov.my/en/employer/responsibilities/mandatory-contribution>
- **SOCSO and EIS**: PERKESO contribution tables:
  <https://www.perkeso.gov.my/en/our-services/protection/employment-injury.html>
  and <https://www.perkeso.gov.my/en/our-services/employment-insurance-system.html>

Update `rates.ts`, then update the matching tests so the expected figures follow
the new rates. These values are not fetched automatically because no official
machine-readable API exists for them, and a silent change to tax maths would be
worse than a stale one.

## Consumer Price Index (automatic)

The living-cost figure for each city in `src/data/cities.ts` is a fixed RM
baseline plus a `cpiState`: the DOSM state series used to keep it current.
`scripts/update-data.mjs` fetches the latest CPI from the free, keyless
data.gov.my / OpenDOSM API and writes `public/data/market.json`.

| Dataset id | Catalogue page | Used for |
| --- | --- | --- |
| `cpi_state` | <https://data.gov.my/data-catalogue/cpi_state> | Each state (`Selangor`, `W.P. Kuala Lumpur`, ...) |
| `cpi_headline` | <https://data.gov.my/data-catalogue/cpi_headline> | The national index, stored under `Malaysia` |

API calls. The response is a plain JSON array of rows such as
`{"date":"2026-10-01","index":145.0,"state":"W.P. Putrajaya","division":"overall"}`.
Other divisions use codes such as `"06"`; the URL filters to `overall` on the
server and the script filters again on its side, then keeps the latest month per
state (16 states per month):

```
https://api.data.gov.my/data-catalogue?id=cpi_state&sort=-date&filter=overall@division&limit=100
https://api.data.gov.my/data-catalogue?id=cpi_headline&sort=-date&filter=overall@division&limit=50
```

The workflow runs daily at 01:17 UTC (09:17 Malaysia time) and can be started by
hand from the Actions tab. DOSM publishes CPI once a month, so most runs find
nothing new. The script then leaves the file alone, nothing is committed and no
deploy is started. When a new month arrives, the bot commits
`chore(data): refresh CPI from data.gov.my` and calls the Pages deploy workflow.

### market.json

```jsonc
{
  "generatedAt": "2026-12-24T01:17:04Z",   // changes only when the file is rewritten
  "source": "OpenDOSM / data.gov.my ...",
  "baseline": { "Selangor": { "date": "2025-01-01", "index": 139.8 }, ... },
  "latest":   { "Selangor": { "date": "2026-10-01", "index": 144.7 }, ... }
}
```

- `baseline` is the CPI at the time the RM figures in `cities.ts` were set. A
  state gets a baseline the first time it appears and is never changed after
  that, unless you rebaseline.
- `latest` is the most recent month seen for each state. If a state is missing
  from a fetch, its previous value is kept.

**Current baseline: January 2025** (`date: "2025-01-01"`). The RM figures in
`cities.ts` describe January 2025 price levels, and the baseline CPI values were
taken from the live API on 25 November 2026 (e.g. Selangor 139.8, W.P. Kuala
Lumpur 133.6, Malaysia 133.6). The seed `latest` is October 2026 (Selangor 144.7,
W.P. Kuala Lumpur 138.1, Malaysia 137.7), so the app already shows roughly 3–4%
inflation on top of the baselines, and the daily workflow keeps moving `latest`
forward as DOSM publishes new months.

### How the scaling works

For every city the user has not edited (`custom` is not set), the app computes:

```
monthlyCost = round(baselineCost x latest[cpiState].index / baseline[cpiState].index)
```

Worked example: Petaling Jaya has a baseline of RM 2,100 and `cpiState:
'Selangor'`. The baseline Selangor CPI is 139.8 (Jan 2025) and the latest is
144.7 (Oct 2026), so:

```
2,100 x 144.7 / 139.8 = 2,100 x 1.03505 = 2,173.61  ->  RM 2,174
```

Safeguards in `src/lib/market.ts`:

- If the file is missing or invalid, or a state has no baseline or latest, the
  factor is 1 (no change).
- A factor outside 0.5 to 2 is treated as bad data and ignored.
- Once the user types their own figure for a city, scaling stops for that city.

### Rebaselining

When you revise the RM figures in `cities.ts` (for example after a new cost
survey), reset the baseline so that today's CPI matches the new figures:

```bash
node scripts/update-data.mjs --rebaseline
```

Commit both `cities.ts` and `public/data/market.json` together. You can also run
the **Refresh CPI data** workflow by hand with the `rebaseline` box ticked.

### Running the script locally

Node 20 or later is needed. The script has no dependencies.

```bash
node scripts/update-data.mjs              # fetch, and write only if something changed
node scripts/update-data.mjs --dry-run    # fetch and print the result; never writes
node scripts/update-data.mjs --rebaseline # set baseline = latest for every state
node scripts/update-data.mjs --out /tmp/market.json   # write to another file
```

Offline, read rows from local files instead of the API. The folder must contain
`cpi_state.json` and `cpi_headline.json`, each a JSON array of rows or an object
wrapping one:

```bash
node scripts/update-data.mjs --fixtures ./fixtures --dry-run
OFFERLENS_FIXTURES=./fixtures node scripts/update-data.mjs --dry-run
```

Behaviour:

- Each request is tried 3 times with backoff (1.5 s, then 3 s) and a 30 s
  timeout, using the User-Agent `offerlens-my-data-bot`.
- Rows that are not `overall`, or that have an invalid date or index, are dropped.
- If neither dataset yields a valid row, the script exits with code 1 and does
  not touch the file. If one dataset fails, the other is still used.
- The file is written to a temporary file and then renamed, so a crash cannot
  leave half-written JSON.

The pure functions (`pickLatest`, `buildLatest`, `mergeMarket`, ...) are exported
and tested in `tests/update-data.test.ts`:

```bash
npx vitest run tests/update-data.test.ts
```

## Licensing and attribution

Data from data.gov.my and OpenDOSM is open data published under the
[Creative Commons Attribution 4.0 International licence (CC BY 4.0)](https://creativecommons.org/licenses/by/4.0/).
Any page or export that shows CPI-derived figures must credit:

> Source: Department of Statistics Malaysia (DOSM), via data.gov.my / OpenDOSM. CC BY 4.0.

The figures in the app are adjusted (scaled city baselines), so say that they
are derived from DOSM data and not published by DOSM. Statutory rates come from
public LHDN, KWSP and PERKESO publications. The city living-cost baselines are
the project's own rough estimates, not official statistics.

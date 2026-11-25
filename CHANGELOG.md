# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Dependency updates that pass the full test suite are merged and deployed automatically.
- Monthly check that opens a review issue when the tax and contribution rates year falls behind.

### Changed

- ApexCharts 8, TypeScript 7 and newer GitHub Actions (Pages, Node setup, artifacts).

## [1.1.0] - 2026-11-25

### Added

- Installable app: web app manifest, home-screen icons (including maskable) and
  shortcuts to Take-home pay, Compare offers and Applications.
- Offline support through a service worker (network first for pages and CPI
  data, cache first for built assets).
- Share previews (Open Graph and Twitter card image), canonical URL and robots.txt.

### Changed

- Restyled the whole interface on the Spark Admin design (ThemeWagon): dark forest
  sidebar with grouped menu, topbar with quick jump search, rounded cards, lime
  accent hero cards, Plus Jakarta Sans and a matching chart palette in light and
  dark mode. Footer credits the template.
- New O-ring logo (the O of Offer, drawn larger than a capital) in the brand,
  hero cards and favicon; thinner large ring on hero cards.
- Sun and moon theme toggle now animates; top-bar icons are centred.
- Tracker stat icons and stage counts use the Spark palette.
- Take-home curve label is readable in both themes.

## [1.0.0] - 2026-11-25

### Added

- **Take-home calculator** for YA 2025: EPF (rounded up to the next ringgit),
  SOCSO and EIS (RM6,000 ceiling, 5-sen rounding), progressive income tax with
  individual, EPF, SOCSO/EIS, lifestyle and other reliefs, the RM400 rebate and
  zakat. Regular-month payslip breakdown (bonus tax reported separately in the
  yearly figures), monthly pay chart, employer cost, effective and marginal tax
  rates.
- **Take-home curve** across a range of basic salaries, with your salary marked.
- **Reverse calculator** that finds the basic salary needed for a target monthly
  take-home, robust to EPF rounding and the rebate cliff.
- **Offer comparison** with city living costs, job-specific monthly costs,
  1–5 ratings for growth, learning and work-life balance, adjustable weights and
  a ranked score out of 100.
- **Negotiation helper** that computes the basic salary one offer needs to match
  another's monthly disposable income.
- **Application tracker**: kanban board with drag and drop and a stage menu,
  stage history, funnel, applications-per-week chart, response and interview
  rates, and follow-up reminders.
- **Overview dashboard** combining offers, pipeline, payslip and city costs,
  with sample data for first-time visitors.
- **CPI-adjusted living costs** for nine city options, with baselines at
  January 2025 price levels scaled by DOSM state CPI.
- **Daily data refresh**: a scheduled GitHub Action fetches CPI from
  data.gov.my and redeploys when a new month is published.
- **Settings**: editable city costs, light/dark/system theme, JSON backup and
  restore, CSV export of offers and applications, and erase everything.
- Local-only storage with validation of stored and imported data.
- Responsive layout for mobile.
- Unit tests (Vitest), end-to-end tests (Playwright), CI, and GitHub Pages
  deployment that runs the unit tests before building.
- Documentation: README, methodology, data sources, contributing guide, code of
  conduct and security policy.

[Unreleased]: https://github.com/Faryaan-Khan/offerlens-my/compare/v1.1.0...HEAD
[1.1.0]: https://github.com/Faryaan-Khan/offerlens-my/compare/v1.0.0...v1.1.0
[1.0.0]: https://github.com/Faryaan-Khan/offerlens-my/releases/tag/v1.0.0

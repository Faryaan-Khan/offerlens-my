# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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

[Unreleased]: https://github.com/Faryaan-Khan/offerlens-my/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/Faryaan-Khan/offerlens-my/releases/tag/v1.0.0

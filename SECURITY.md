# Security Policy

## How OfferLens MY handles your data

OfferLens MY is a static site. It has **no backend, no accounts, no analytics
and no tracking**.

- Everything you enter (salaries, offers, applications, notes) is stored only in
  your browser's `localStorage`, under the key `offerlens-my:v1`.
- Nothing you type is sent to any server. The only network request the app
  makes is to load its own `data/market.json` (public CPI figures) from the same
  site.
- Backups you export (JSON or CSV) are files on your own device. Treat them
  like any other personal document.
- Imported backups and stored data are validated and sanitised before use, user
  text is HTML-escaped, links are limited to `http(s)`, and CSV exports are
  protected against spreadsheet formula injection.

To remove all data, use **Settings → Erase everything** or clear site data in
your browser.

## Supported versions

Only the latest release (the live site and the `main` branch) receives fixes.

| Version | Supported |
| --- | --- |
| 1.x | Yes |
| < 1.0 | No |

## Reporting a vulnerability

Please **do not open a public issue** for security problems.

Report privately through GitHub Security Advisories:

1. Go to the repository's **Security** tab.
2. Choose **Report a vulnerability**.
3. Describe the issue, how to reproduce it, and its impact.

Or use this link directly:
<https://github.com/Faryaan-Khan/offerlens-my/security/advisories/new>

I aim to acknowledge reports within 7 days and to fix confirmed issues as
quickly as their severity requires. You will be credited in the advisory unless
you prefer otherwise.

Examples of things worth reporting: script injection through stored or imported
data, a way to make the app send data off the device, or a compromised
dependency or workflow.

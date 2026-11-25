const rm = new Intl.NumberFormat('en-MY', { style: 'currency', currency: 'MYR', maximumFractionDigits: 0 });
const rm2 = new Intl.NumberFormat('en-MY', { style: 'currency', currency: 'MYR', minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** RM 1,234 */
export const money = (n: number): string => (Number.isFinite(n) ? rm.format(n) : '—');
/** RM 1,234.56 */
export const money2 = (n: number): string => (Number.isFinite(n) ? rm2.format(n) : '—');
export const pct = (n: number, digits = 1): string => (Number.isFinite(n) ? `${(n * 100).toFixed(digits)}%` : '—');

/** Escape text for safe interpolation into HTML. */
export function esc(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Allow only http(s) links, so stored data can never inject a javascript: URL. */
export function safeUrl(url: string | undefined): string | undefined {
  if (!url) return undefined;
  try {
    const u = new URL(url);
    return u.protocol === 'http:' || u.protocol === 'https:' ? u.href : undefined;
  } catch {
    return undefined;
  }
}

export const uid = (): string =>
  (globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`);

/** Convert rows to RFC 4180 CSV, neutralising spreadsheet formula injection. */
export function toCsv(rows: (string | number)[][]): string {
  return rows
    .map((row) =>
      row
        .map((cell) => {
          let s = String(cell ?? '');
          if (/^[=+\-@\t\r]/.test(s) && typeof cell === 'string') s = `'${s}`;
          return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
        })
        .join(','),
    )
    .join('\r\n');
}

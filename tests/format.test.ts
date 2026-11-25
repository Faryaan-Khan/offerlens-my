import { describe, it, expect } from 'vitest';
import { esc, money, money2, pct, safeUrl, toCsv, uid } from '../src/lib/format';

describe('esc', () => {
  it('escapes the five HTML-significant characters', () => {
    expect(esc(`<a href="x" onclick='y'>&</a>`)).toBe('&lt;a href=&quot;x&quot; onclick=&#39;y&#39;&gt;&amp;&lt;/a&gt;');
  });
  it('escapes & first (no double-escaping artefacts)', () => {
    expect(esc('&lt;')).toBe('&amp;lt;');
  });
  it('handles non-strings', () => {
    expect(esc(null)).toBe('');
    expect(esc(undefined)).toBe('');
    expect(esc(0)).toBe('0');
    expect(esc(12.5)).toBe('12.5');
  });
  it('leaves plain text alone', () => {
    expect(esc('Kuala Lumpur, RM 4,500')).toBe('Kuala Lumpur, RM 4,500');
  });
});

describe('safeUrl', () => {
  it('accepts http and https', () => {
    expect(safeUrl('https://example.com/a?b=1')).toBe('https://example.com/a?b=1');
    expect(safeUrl('http://example.com')).toBe('http://example.com/');
    expect(safeUrl('HTTPS://EXAMPLE.COM/x')).toBe('https://example.com/x');
  });
  it.each([
    'javascript:alert(1)',
    'JavaScript:alert(1)',
    '  javascript:alert(1)',
    'java\tscript:alert(1)',
    'data:text/html,<script>alert(1)</script>',
    'vbscript:msgbox(1)',
    'file:///etc/passwd',
    'ftp://example.com',
    '/relative/path',
    'example.com',
    '',
  ])('rejects %j', (u) => {
    expect(safeUrl(u)).toBeUndefined();
  });
  it('undefined → undefined', () => {
    expect(safeUrl(undefined)).toBeUndefined();
  });
  it('returned href is normalised (no raw quotes to break attributes)', () => {
    const u = safeUrl('https://example.com/"onmouseover="x');
    expect(u).toBeDefined();
    expect(u).not.toContain('"');
  });
});

describe('toCsv', () => {
  it('joins with commas and CRLF', () => {
    expect(toCsv([['a', 'b'], [1, 2]])).toBe('a,b\r\n1,2');
  });
  it('quotes commas, quotes and newlines (RFC 4180)', () => {
    expect(toCsv([['b,c', 'say "hi"', 'line\nbreak', 'cr\rx']])).toBe('"b,c","say ""hi""","line\nbreak","cr\rx"');
  });
  it('neutralises formula injection in strings', () => {
    expect(toCsv([['=SUM(A1:A9)', '+1', '-2', '@cmd', '\tx']])).toBe("'=SUM(A1:A9),'+1,'-2,'@cmd,'\tx");
    // prefixed and quoted when it also has a quote or CR
    expect(toCsv([['=HYPERLINK("http://evil")']])).toBe(`"'=HYPERLINK(""http://evil"")"`);
    expect(toCsv([['\r=1']])).toBe(`"'\r=1"`);
  });
  it('does not touch negative numbers', () => {
    expect(toCsv([[-5, -0.5, 0]])).toBe('-5,-0.5,0');
  });
  it('null-ish cells become empty', () => {
    expect(toCsv([[null as any, undefined as any, 'x']])).toBe(',,x');
  });
  it('empty input → empty string', () => {
    expect(toCsv([])).toBe('');
  });
});

describe('money / pct / uid', () => {
  it('formats ringgit', () => {
    expect(money(1_234)).toMatch(/RM\s?1,234$/);
    expect(money2(1_234.5)).toMatch(/RM\s?1,234\.50$/);
    expect(money(NaN)).toBe('—');
    expect(money2(Infinity)).toBe('—');
  });
  it('formats percentages', () => {
    expect(pct(0.1234)).toBe('12.3%');
    expect(pct(0.5, 0)).toBe('50%');
    expect(pct(NaN)).toBe('—');
  });
  it('uid is unique-ish and non-empty', () => {
    const ids = new Set(Array.from({ length: 200 }, uid));
    expect(ids.size).toBe(200);
  });
});

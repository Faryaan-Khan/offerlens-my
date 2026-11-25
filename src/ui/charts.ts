import ApexCharts from 'apexcharts';

const active = new Set<ApexCharts>();

/** Read a Tabler CSS variable so charts follow the current light/dark theme. */
export const cssVar = (name: string, fallback: string): string => {
  const v = getComputedStyle(document.body).getPropertyValue(name).trim();
  return v || fallback;
};

export const palette = () => ({
  primary: cssVar('--tblr-primary', '#066fd1'),
  green: cssVar('--tblr-green', '#2fb344'),
  orange: cssVar('--tblr-orange', '#f76707'),
  red: cssVar('--tblr-red', '#d63939'),
  purple: cssVar('--tblr-purple', '#ae3ec9'),
  cyan: cssVar('--tblr-cyan', '#17a2b8'),
  yellow: cssVar('--tblr-yellow', '#f59f00'),
  muted: cssVar('--tblr-secondary', '#6c7a91'),
  text: cssVar('--tblr-body-color', '#1d273b'),
  border: cssVar('--tblr-border-color', '#e6e7e9'),
});

export function baseOptions(): ApexCharts.ApexOptions {
  const p = palette();
  const dark = document.body.getAttribute('data-bs-theme') === 'dark';
  return {
    chart: {
      fontFamily: 'inherit',
      foreColor: p.muted,
      toolbar: { show: false },
      animations: { enabled: !matchMedia('(prefers-reduced-motion: reduce)').matches },
      parentHeightOffset: 0,
      background: 'transparent',
    },
    theme: { mode: dark ? 'dark' : 'light' },
    grid: { borderColor: p.border, strokeDashArray: 4, padding: { top: -10, right: 0, left: -4, bottom: -4 } },
    dataLabels: { enabled: false },
    tooltip: { theme: dark ? 'dark' : 'light' },
    legend: { show: false },
  };
}

export function renderChart(el: Element | null, options: ApexCharts.ApexOptions): ApexCharts | undefined {
  if (!el) return undefined;
  el.innerHTML = '';
  const merged = deepMerge(baseOptions(), options);
  const chart = new ApexCharts(el, merged);
  chart.render();
  active.add(chart);
  return chart;
}

export function destroyCharts(): void {
  active.forEach((c) => {
    try {
      c.destroy();
    } catch {
      /* already gone */
    }
  });
  active.clear();
}

function deepMerge<T extends Record<string, any>>(a: T, b: Record<string, any>): T {
  const out: Record<string, any> = { ...a };
  for (const [k, v] of Object.entries(b)) {
    out[k] = v && typeof v === 'object' && !Array.isArray(v) && a[k] && typeof a[k] === 'object' ? deepMerge(a[k], v) : v;
  }
  return out as T;
}

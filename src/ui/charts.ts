import ApexCharts from 'apexcharts';

const active = new Set<ApexCharts>();

/** Read a Tabler CSS variable so charts follow the current light/dark theme. */
export const cssVar = (name: string, fallback: string): string => {
  const v = getComputedStyle(document.body).getPropertyValue(name).trim();
  return v || fallback;
};

/** Spark Admin palette: forest greens with a lime accent (see src/theme-spark.css). */
export const palette = () => {
  const dark = document.body.getAttribute('data-bs-theme') === 'dark';
  return {
    primary: dark ? '#B4F105' : '#072F1F',
    lime: '#B4F105',
    green: '#22C55E',
    orange: '#F97316',
    red: '#EF4444',
    purple: dark ? '#7FA493' : '#1A3E30',
    cyan: '#0EA5E9',
    yellow: '#EAB308',
    muted: dark ? '#4B5E55' : '#C9D3CE',
    text: cssVar('--tblr-body-color', dark ? '#E7EFEA' : '#0B130F'),
    border: dark ? 'rgba(255,255,255,0.08)' : '#E9EFEF',
  };
};

export function baseOptions(): ApexCharts.ApexOptions {
  const p = palette();
  const dark = document.body.getAttribute('data-bs-theme') === 'dark';
  return {
    chart: {
      fontFamily: 'inherit',
      foreColor: document.body.getAttribute('data-bs-theme') === 'dark' ? '#879A91' : '#6C7E75',
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
  const chart = new ApexCharts(el as HTMLElement, merged);
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

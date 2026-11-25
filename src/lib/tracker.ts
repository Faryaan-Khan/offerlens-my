export const STAGES = ['wishlist', 'applied', 'assessment', 'interview', 'offer', 'rejected'] as const;
export type Stage = (typeof STAGES)[number];

export const STAGE_LABELS: Record<Stage, string> = {
  wishlist: 'Wishlist',
  applied: 'Applied',
  assessment: 'Assessment',
  interview: 'Interview',
  offer: 'Offer',
  rejected: 'Closed',
};

/** Stages that represent forward progress, in order. */
export const PIPELINE: Stage[] = ['applied', 'assessment', 'interview', 'offer'];

export interface StageEvent {
  stage: Stage;
  /** ISO date, YYYY-MM-DD. */
  on: string;
}

export interface Application {
  id: string;
  company: string;
  role: string;
  source: string;
  link?: string;
  stage: Stage;
  history: StageEvent[];
  /** ISO date of the next follow-up, if any. */
  followUpOn?: string;
  notes?: string;
}

export const todayISO = (d: Date = new Date()): string => {
  const off = d.getTimezoneOffset();
  return new Date(d.getTime() - off * 60_000).toISOString().slice(0, 10);
};

/** Move an application to a new stage, recording the change. Returns a new object. */
export function moveTo(app: Application, stage: Stage, on: string = todayISO()): Application {
  if (app.stage === stage) return app;
  return { ...app, stage, history: [...app.history, { stage, on }] };
}

/** Furthest forward pipeline stage the application ever reached. */
export function furthestStage(app: Application): number {
  let best = -1;
  for (const ev of [...app.history, { stage: app.stage, on: '' }]) {
    const idx = PIPELINE.indexOf(ev.stage);
    if (idx > best) best = idx;
  }
  return best;
}

export const appliedOn = (app: Application): string | undefined =>
  app.history.find((h) => h.stage === 'applied')?.on;

export interface TrackerStats {
  total: number;
  active: number;
  submitted: number;
  /** Share of submitted applications that heard anything back (moved on or were closed). */
  responseRate: number;
  /** Share of submitted applications that reached interview or beyond. */
  interviewRate: number;
  offers: number;
  funnel: { stage: Stage; label: string; count: number }[];
  perWeek: { week: string; count: number }[];
  overdue: Application[];
  byStage: Record<Stage, number>;
}

/** Monday of the ISO week containing `iso`, as YYYY-MM-DD. */
export function weekStart(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  const day = (date.getUTCDay() + 6) % 7;
  date.setUTCDate(date.getUTCDate() - day);
  return date.toISOString().slice(0, 10);
}

export function computeStats(apps: Application[], today: string = todayISO(), weeks = 8): TrackerStats {
  const byStage = Object.fromEntries(STAGES.map((s) => [s, 0])) as Record<Stage, number>;
  apps.forEach((a) => byStage[a.stage]++);

  const submittedApps = apps.filter((a) => furthestStage(a) >= 0);
  const submitted = submittedApps.length;
  const responded = submittedApps.filter((a) => furthestStage(a) >= 1 || a.stage === 'rejected').length;
  const interviewed = submittedApps.filter((a) => furthestStage(a) >= 2).length;

  const funnel = PIPELINE.map((stage, i) => ({
    stage,
    label: STAGE_LABELS[stage],
    count: apps.filter((a) => furthestStage(a) >= i).length,
  }));

  const thisWeek = weekStart(today);
  const perWeek: { week: string; count: number }[] = [];
  for (let i = weeks - 1; i >= 0; i--) {
    const [y, m, d] = thisWeek.split('-').map(Number);
    const dt = new Date(Date.UTC(y, m - 1, d - i * 7));
    perWeek.push({ week: dt.toISOString().slice(0, 10), count: 0 });
  }
  for (const a of apps) {
    const on = appliedOn(a);
    if (!on) continue;
    const bucket = perWeek.find((w) => w.week === weekStart(on));
    if (bucket) bucket.count++;
  }

  const overdue = apps
    .filter((a) => a.followUpOn && a.followUpOn <= today && a.stage !== 'rejected' && a.stage !== 'offer')
    .sort((a, b) => (a.followUpOn! < b.followUpOn! ? -1 : 1));

  return {
    total: apps.length,
    active: apps.filter((a) => a.stage !== 'rejected' && a.stage !== 'wishlist').length,
    submitted,
    responseRate: submitted ? responded / submitted : 0,
    interviewRate: submitted ? interviewed / submitted : 0,
    offers: byStage.offer,
    funnel,
    perWeek,
    overdue,
    byStage,
  };
}

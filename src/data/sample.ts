import type { Offer } from '../lib/offers';
import type { Application } from '../lib/tracker';

/** Illustrative data so first-time visitors see a populated dashboard. Company names are fictional. */
export function sampleOffers(): Offer[] {
  return [
    { id: 's-o1', company: 'Kopi Labs', role: 'Junior Software Engineer', cityId: 'kl', monthlyGross: 5_200, monthlyAllowance: 0, bonusMonths: 2, extraMonthlyCost: 250, growth: 4, learning: 4, workLife: 3, notes: 'Hybrid, 3 days in office near KL Sentral.' },
    { id: 's-o2', company: 'Pulau Systems', role: 'Graduate Developer', cityId: 'penang', monthlyGross: 4_300, monthlyAllowance: 300, bonusMonths: 1.5, extraMonthlyCost: 120, growth: 3, learning: 4, workLife: 5, notes: 'Bayan Lepas campus, structured grad programme.' },
    { id: 's-o3', company: 'Rimba Data', role: 'Data Analyst', cityId: 'cyberjaya', monthlyGross: 4_800, monthlyAllowance: 200, bonusMonths: 1, extraMonthlyCost: 300, growth: 5, learning: 3, workLife: 3, notes: 'Fast-growing startup, equity on confirmation.' },
  ];
}

const daysAgo = (n: number): string => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  const off = d.getTimezoneOffset();
  return new Date(d.getTime() - off * 60_000).toISOString().slice(0, 10);
};

export function sampleApplications(): Application[] {
  const mk = (id: string, company: string, role: string, source: string, path: [Application['stage'], number][], followUp?: number): Application => ({
    id,
    company,
    role,
    source,
    stage: path[path.length - 1][0],
    history: path.map(([stage, ago]) => ({ stage, on: daysAgo(ago) })),
    followUpOn: followUp === undefined ? undefined : daysAgo(followUp),
    notes: '',
  });
  return [
    mk('s-a1', 'Kopi Labs', 'Junior Software Engineer', 'LinkedIn', [['applied', 40], ['assessment', 33], ['interview', 25], ['offer', 10]]),
    mk('s-a2', 'Pulau Systems', 'Graduate Developer', 'Career fair', [['applied', 38], ['interview', 24], ['offer', 8]]),
    mk('s-a3', 'Rimba Data', 'Data Analyst', 'Referral', [['applied', 30], ['assessment', 26], ['interview', 18], ['offer', 5]]),
    mk('s-a4', 'Selat Fintech', 'Backend Intern-to-Hire', 'JobStreet', [['applied', 28], ['assessment', 21]], 2),
    mk('s-a5', 'Awan Cloud', 'Cloud Support Engineer', 'Company site', [['applied', 20], ['interview', 9]], -3),
    mk('s-a6', 'Batik Commerce', 'Frontend Developer', 'LinkedIn', [['applied', 18], ['rejected', 6]]),
    mk('s-a7', 'Hijau Energy', 'IT Graduate Trainee', 'Hiredly', [['applied', 14]], 0),
    mk('s-a8', 'Merdeka Games', 'Gameplay Programmer', 'Company site', [['applied', 10]]),
    mk('s-a9', 'Tanjung Logistics', 'Software Engineer', 'JobStreet', [['applied', 6], ['rejected', 1]]),
    mk('s-a10', 'Gunung AI', 'ML Engineer', 'Referral', [['wishlist', 2]]),
    mk('s-a11', 'Seri Health', 'Full-stack Developer', 'LinkedIn', [['applied', 3]]),
  ];
}

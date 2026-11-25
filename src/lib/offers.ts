import { computePay, round2, solveGross, type PayBreakdown } from './payroll';
import type { City } from '../data/cities';

export interface Offer {
  id: string;
  company: string;
  role: string;
  cityId: string;
  monthlyGross: number;
  monthlyAllowance: number;
  bonusMonths: number;
  /** Extra monthly costs specific to this job (commute, parking, tolls), RM. */
  extraMonthlyCost: number;
  /** Ratings from 1 (poor) to 5 (excellent). */
  growth: number;
  learning: number;
  workLife: number;
  notes?: string;
}

export interface Weights {
  money: number;
  growth: number;
  learning: number;
  workLife: number;
}

export const DEFAULT_WEIGHTS: Weights = { money: 40, growth: 25, learning: 20, workLife: 15 };

export interface OfferEvaluation {
  offer: Offer;
  pay: PayBreakdown;
  city: City | undefined;
  livingCost: number;
  /** Average monthly take-home (bonus included) minus living and job costs. */
  monthlyDisposable: number;
  /** Disposable as a share of average monthly take-home. */
  savingsRate: number;
  /** Weighted score from 0 to 100. */
  score: number;
  rank: number;
}

const rating = (n: number): number => {
  const v = Number.isFinite(n) ? Math.min(5, Math.max(1, n)) : 3;
  return (v - 1) / 4;
};

export function evaluateOffers(offers: Offer[], cities: City[], weights: Weights = DEFAULT_WEIGHTS): OfferEvaluation[] {
  const base = offers.map((offer) => {
    const pay = computePay({
      monthlyGross: offer.monthlyGross,
      monthlyAllowance: offer.monthlyAllowance,
      bonusMonths: offer.bonusMonths,
    });
    const city = cities.find((c) => c.id === offer.cityId);
    const livingCost = city?.monthlyCost ?? 0;
    const monthlyDisposable = round2(pay.averageMonthlyNet - livingCost - (offer.extraMonthlyCost || 0));
    const savingsRate = pay.averageMonthlyNet > 0 ? monthlyDisposable / pay.averageMonthlyNet : 0;
    return { offer, pay, city, livingCost, monthlyDisposable, savingsRate };
  });

  const disposables = base.map((b) => b.monthlyDisposable);
  const min = Math.min(...disposables);
  const max = Math.max(...disposables);
  const totalWeight = weights.money + weights.growth + weights.learning + weights.workLife || 1;

  const scored = base.map((b) => {
    const money = max === min ? 1 : (b.monthlyDisposable - min) / (max - min);
    const raw =
      weights.money * money +
      weights.growth * rating(b.offer.growth) +
      weights.learning * rating(b.offer.learning) +
      weights.workLife * rating(b.offer.workLife);
    return { ...b, score: Math.round((raw / totalWeight) * 100), rank: 0 };
  });

  const order = [...scored].sort((a, b) => b.score - a.score || b.monthlyDisposable - a.monthlyDisposable);
  order.forEach((e, i) => (e.rank = i + 1));
  return scored;
}

/**
 * How much basic salary `candidate` would need so that its monthly disposable
 * income matches `benchmark`, keeping candidate's bonus, allowance and city.
 * This is the number to ask for when negotiating.
 */
export function counterOffer(candidate: Offer, benchmark: OfferEvaluation, cities: City[]): number {
  const city = cities.find((c) => c.id === candidate.cityId);
  const living = city?.monthlyCost ?? 0;
  const neededAverageNet = round2(benchmark.monthlyDisposable + living + (candidate.extraMonthlyCost || 0));
  // Solve on averageMonthlyNet (the rounded figure monthlyDisposable is built from), not on
  // annual net vs neededAverageNet * 12: the rounding mismatch could overshoot by a few ringgit.
  return solveGross(neededAverageNet, (b) => b.averageMonthlyNet, {
    monthlyAllowance: candidate.monthlyAllowance,
    bonusMonths: candidate.bonusMonths,
  });
}

/**
 * Rough monthly living-cost baselines for a single young professional, in RM
 * (room rental, food, transport, utilities, phone). They are deliberately
 * simple, editable starting points and NOT official statistics. They describe
 * January 2025 price levels (the CPI baseline in public/data/market.json).
 *
 * `cpiState` names the DOSM state series used to keep each baseline current:
 * the app scales `monthlyCost` by (latest CPI / baseline CPI) using
 * public/data/market.json, which a scheduled GitHub Action refreshes from
 * the free data.gov.my API. See docs/DATA.md.
 */
export interface City {
  id: string;
  name: string;
  /** Monthly cost in RM. */
  monthlyCost: number;
  /** DOSM state name for CPI scaling, or 'Malaysia' for the national index. */
  cpiState?: string;
  /** True once the user has typed their own figure; CPI scaling then stops. */
  custom?: boolean;
}

export const DEFAULT_CITIES: City[] = [
  { id: 'kl', name: 'Kuala Lumpur', monthlyCost: 2_300, cpiState: 'W.P. Kuala Lumpur' },
  { id: 'pj', name: 'Petaling Jaya / Subang', monthlyCost: 2_100, cpiState: 'Selangor' },
  { id: 'cyberjaya', name: 'Cyberjaya / Putrajaya', monthlyCost: 1_850, cpiState: 'W.P. Putrajaya' },
  { id: 'penang', name: 'Penang', monthlyCost: 1_800, cpiState: 'Pulau Pinang' },
  { id: 'jb', name: 'Johor Bahru', monthlyCost: 1_850, cpiState: 'Johor' },
  { id: 'ipoh', name: 'Ipoh', monthlyCost: 1_450, cpiState: 'Perak' },
  { id: 'kk', name: 'Kota Kinabalu', monthlyCost: 1_650, cpiState: 'Sabah' },
  { id: 'kuching', name: 'Kuching', monthlyCost: 1_550, cpiState: 'Sarawak' },
  { id: 'remote', name: 'Remote (living at home)', monthlyCost: 900, cpiState: 'Malaysia' },
];

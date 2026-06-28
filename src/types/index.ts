export type ReportType = 'bilans' | 'rzis';
export type ViewType = ReportType | 'kontrola' | 'analiza' | 'raport_miesieczny' | 'raport_grupy';

export interface ReportRow {
  segment: string;
  name: string;
  level: number;
  values: { period1: number; period2: number; period3?: number };
  definition: string | null;
  positionId: string | null;
  drilldownAccounts: string[];
}

export interface AccountRow {
  numer: string;
  nazwa: string;
  nazwa2: string | null;
  boWn: number; boMa: number;
  obrotyWn: number; obrotyMa: number;
  obrotyNWn: number; obrotyNMa: number;
  saldoWn: number; saldoMa: number;
  persaldo: number;
}

export interface JournalEntry {
  nrDziennika: string;
  nrDziennikaC: string;
  dataKsiegowania: string;
  dokument: string;
  podmiot: string | null;
  nazwaPodmiotu: string | null;
  konto: string;
  kontoPrzeciwstawne: string | null;
  kwotaWn: number;
  kwotaMa: number;
  idKsiegowy: string;
  opis: string | null;
}

// ── Raport miesięczny (zarządczy) — dane statyczne EXCO, generowane skryptem
//    scripts/convert-raport-miesieczny.mjs do src/data/raportMiesieczny.json ──

/** Pełny rok obrachunkowy (10.(rok-1) – 09.(rok)) odtworzony z arkuszy porównawczych. */
export interface YearlyHistory {
  fy: string;
  label: string;
  monthly: number[];
  total: number;
}

/** Konto z planu kont (4xx/7xx/5xx) dopasowane przez tabelę korespondencji „BAZA". */
export interface AccountRef {
  number: string;
  name: string;
}

export interface MonthlyReportLine {
  id: string;
  labelPl: string;
  labelFr?: string;
  /** 12 wartości miesięcznych: 10/2024 .. 09/2025 */
  monthly: number[];
  /** suma okresu (kolumna TOTAL) */
  total: number;
  /** historia 3 lat obrachunkowych (2023/2024/2025), ten sam układ wierszy co bieżący raport */
  history?: YearlyHistory[];
  /** konta księgowe powiązane wg tabeli korespondencji „BAZA" */
  accounts?: AccountRef[];
}

export interface DepartmentMargin {
  key: string;
  label: string;
  revenue: MonthlyReportLine;
  cost: MonthlyReportLine;
  margin: MonthlyReportLine;
}

export interface CostCategory extends MonthlyReportLine {
  children?: CostCategory[];
}

export interface YearComparisonItem {
  id: string;
  labelPl: string;
  values: { y2025: number; y2024: number; y2023: number };
  deltaRY1: number;
  deltaRY2: number;
  deltaPctRY1: number | null;
}

export interface MonthlyReportTotals {
  revenue: MonthlyReportLine;
  costOfSales: MonthlyReportLine;
  grossMargin: MonthlyReportLine;
  adminCosts: MonthlyReportLine;
  grossMarginTotal: MonthlyReportLine;
}

export interface MonthlyReportData {
  company: string;
  period: string;
  periodLabels: string[];
  comparisonLabel: string;
  /** metadane lat obrachunkowych dostępnych w polach `history` (2023/2024/2025) */
  history: { fy: string; label: string }[];
  departments: DepartmentMargin[];
  totals: MonthlyReportTotals;
  costCategories: CostCategory[];
  result: MonthlyReportLine[];
  yearComparison: YearComparisonItem[];
}

// ── Raport Grupy Pracy ────────────────────────────────────────────────────

export interface GrpMonthly {
  przychod: number[];
  koszt: number[];
  mb: number[];
  mbPct: number[];
}

export interface GrpTotal {
  przychod: number;
  koszt: number;
  mb: number;
  mbPct: number;
}

export interface GroupRow {
  lider: string;
  groupNr: string;
  miasto: string;
  dzial: string;
  bk: string;
  komentarz: string;
  headcount: number;
  monthly: GrpMonthly;
  total: GrpTotal;
  totalExt: GrpTotal;
}

export interface GroupKosztPrac {
  groupNr: string;
  name: string;
  monthly: number[];
  razem: number;
}

export interface GrpEmployee {
  lider: string;
  groupNr: string;
  sort: string;
  akronim: string;
  centrum: string;
  bk: string;
  miasto: string;
  dzial: string;
}

export interface GrpData {
  periodLabels: string[];
  groups: GroupRow[];
  employees: GrpEmployee[];
  kosztPrac: GroupKosztPrac[];
  sumaKosztPrac: { monthly: number[]; razem: number } | null;
}

export interface Company {
  id: string;
  name: string;
  period: string;
  createdAt: string;
  bilans: ReportRow[];
  rzis: ReportRow[];
  obroty: AccountRow[];
  zapisy: JournalEntry[];
  /** Etykiety okresów, np. ["10.2024-09.2025", "10.2023-09.2024", "10.2022-09.2023"] */
  periodLabels?: string[];
  /** URL do lazy-load dużego pliku zapisów (np. /data/zapisy.json) */
  zapisyUrl?: string;
  /** Dane raportu miesięcznego (zarządczego), opcjonalnie z importu */
  raportMiesieczny?: MonthlyReportData;
  /** Dane raportu grup pracy, opcjonalnie z importu */
  grpData?: GrpData;
}

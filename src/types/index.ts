export type ReportType = 'bilans' | 'rzis';
export type ViewType = ReportType | 'kontrola' | 'analiza';

export interface ReportRow {
  segment: string;
  name: string;
  level: number;
  values: { period1: number; period2: number };
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

export interface Company {
  id: string;
  name: string;
  period: string;
  createdAt: string;
  bilans: ReportRow[];
  rzis: ReportRow[];
  obroty: AccountRow[];
  zapisy: JournalEntry[];
  /** URL do lazy-load dużego pliku zapisów (np. /data/zapisy.json) */
  zapisyUrl?: string;
}

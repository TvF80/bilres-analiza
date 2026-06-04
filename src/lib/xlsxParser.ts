import * as XLSX from 'xlsx';
import type { ReportRow, AccountRow, JournalEntry } from '../types';

// --- helpers ---

function parseNumber(val: unknown): number {
  if (val === null || val === undefined || val === '') return 0;
  if (typeof val === 'number') return val;
  const s = String(val).replace(/\s/g, '').replace(',', '.');
  const n = parseFloat(s);
  return isNaN(n) ? 0 : n;
}

function extractAccounts(definition: string | null): string[] {
  if (!definition) return [];
  const regex = /@(?:Saldo(?:Wn|Ma)|obroty(?:Wn|Ma))\(([^)]+)\)/gi;
  const accounts = new Set<string>();
  let m: RegExpExecArray | null;
  while ((m = regex.exec(definition)) !== null) accounts.add(m[1].trim());
  return [...accounts];
}

function getLevel(segment: string): number {
  if (segment === '-') return 0;
  if (/^[A-Z]$/.test(segment)) return 1;
  if (/^[IVX]+$/.test(segment)) return 2;
  if (/^[a-z]$/.test(segment)) return 3;
  return 4;
}

function getSheet(wb: XLSX.WorkBook, preferredName: string): XLSX.WorkSheet {
  return wb.Sheets[preferredName] ?? wb.Sheets[wb.SheetNames[0]];
}

async function fileToWorkbook(file: File): Promise<XLSX.WorkBook> {
  const buffer = await file.arrayBuffer();
  return XLSX.read(buffer, { type: 'array' });
}

// --- parsers ---

export function parseBilans(schemaWb: XLSX.WorkBook, dataWb: XLSX.WorkBook): ReportRow[] {
  const schemaRows: unknown[][] = XLSX.utils.sheet_to_json(
    getSheet(schemaWb, 'Pozycje zestawienia'), { header: 1 }
  );
  const dataRows: unknown[][] = XLSX.utils.sheet_to_json(
    getSheet(dataWb, 'Wyniki zestawienia księgowego'), { header: 1 }
  );

  const rows: ReportRow[] = [];
  for (let i = 1; i < schemaRows.length; i++) {
    const s = schemaRows[i] as unknown[];
    const d = (dataRows[i] ?? []) as unknown[];
    const segment = String(s[0] ?? '').trim();
    const name = String(s[1] ?? '').trim();
    if (!name) continue;
    const definition = String(s[2] ?? '').trim() || null;
    const positionId = String(s[3] ?? '').trim() || null;
    rows.push({
      segment,
      name,
      level: getLevel(segment),
      values: { period1: parseNumber(d[3]), period2: parseNumber(d[2]) },
      definition,
      positionId,
      drilldownAccounts: extractAccounts(definition),
    });
  }
  return rows;
}

export function parseRzis(schemaWb: XLSX.WorkBook, dataWb: XLSX.WorkBook): ReportRow[] {
  const schemaRows: unknown[][] = XLSX.utils.sheet_to_json(
    getSheet(schemaWb, 'Pozycje zestawienia'), { header: 1 }
  );
  const dataRows: unknown[][] = XLSX.utils.sheet_to_json(
    getSheet(dataWb, 'Wyniki zestawienia księgowego'), { header: 1 }
  );

  const rows: ReportRow[] = [];
  for (let i = 1; i < schemaRows.length; i++) {
    const s = schemaRows[i] as unknown[];
    const d = (dataRows[i] ?? []) as unknown[];
    const segment = String(s[0] ?? '').trim();
    const name = String(s[1] ?? '').trim();
    if (!name) continue;
    const definition = String(s[2] ?? '').trim() || null;
    const positionId = String(s[3] ?? '').trim() || null;
    rows.push({
      segment,
      name,
      level: getLevel(segment),
      values: { period1: parseNumber(d[3]), period2: parseNumber(d[2]) },
      definition,
      positionId,
      drilldownAccounts: extractAccounts(definition),
    });
  }
  return rows;
}

export function parseObroty(wb: XLSX.WorkBook): AccountRow[] {
  const raw: unknown[][] = XLSX.utils.sheet_to_json(
    getSheet(wb, 'Obroty i salda'), { header: 1 }
  );
  const rows: AccountRow[] = [];
  for (let i = 1; i < raw.length; i++) {
    const r = raw[i] as unknown[];
    const numer = String(r[0] ?? '').trim();
    if (!numer) continue;
    rows.push({
      numer,
      nazwa: String(r[1] ?? '').trim(),
      nazwa2: String(r[2] ?? '').trim() || null,
      boWn: parseNumber(r[3]), boMa: parseNumber(r[4]),
      obrotyWn: parseNumber(r[5]), obrotyMa: parseNumber(r[6]),
      obrotyNWn: parseNumber(r[7]), obrotyNMa: parseNumber(r[8]),
      saldoWn: parseNumber(r[9]), saldoMa: parseNumber(r[10]),
      persaldo: parseNumber(r[11]),
    });
  }
  return rows;
}

export function parseZapisy(wb: XLSX.WorkBook): JournalEntry[] {
  const raw: unknown[][] = XLSX.utils.sheet_to_json(
    getSheet(wb, 'Zapisy księgowe'), { header: 1 }
  );
  const rows: JournalEntry[] = [];
  for (let i = 1; i < raw.length; i++) {
    const r = raw[i] as unknown[];
    const nrDziennika = String(r[0] ?? '').trim();
    if (!nrDziennika) continue;

    let dataKsiegowania = '';
    const rawDate = r[2];
    if (typeof rawDate === 'number') {
      const d = XLSX.SSF.parse_date_code(rawDate);
      dataKsiegowania = `${d.y}-${String(d.m).padStart(2, '0')}-${String(d.d).padStart(2, '0')}`;
    } else if (rawDate) {
      const parts = String(rawDate).split('.');
      dataKsiegowania = parts.length === 3
        ? `${parts[2]}-${parts[1]}-${parts[0]}`
        : String(rawDate).trim();
    }

    rows.push({
      nrDziennika,
      nrDziennikaC: String(r[1] ?? '').trim(),
      dataKsiegowania,
      dokument: String(r[3] ?? '').trim(),
      podmiot: String(r[4] ?? '').trim() || null,
      nazwaPodmiotu: String(r[5] ?? '').trim() || null,
      konto: String(r[6] ?? '').trim(),
      kontoPrzeciwstawne: String(r[7] ?? '').trim() || null,
      kwotaWn: parseNumber(r[8]),
      kwotaMa: parseNumber(r[9]),
      idKsiegowy: String(r[10] ?? '').trim(),
      opis: String(r[11] ?? '').trim() || null,
    });
  }
  return rows;
}

// --- auto-detect file role by filename ---

export type FileRole = 'bilansSchema' | 'bilansData' | 'rzisSchema' | 'rzisData' | 'obroty' | 'zapisy';

export function detectRole(filename: string): FileRole | null {
  const u = filename.toUpperCase();
  if (u.includes('ZAPISY')) return 'zapisy';
  if (u.includes('OBROTY')) return 'obroty';
  if (u.includes('BIL') && u.includes('SCHEMAT')) return 'bilansSchema';
  if (u.includes('BIL') && !u.includes('SCHEMAT')) return 'bilansData';
  if ((u.includes('RZIS') || u.includes('RZiS') || u.includes('R_Z')) && u.includes('SCHEMAT')) return 'rzisSchema';
  if ((u.includes('RZIS') || u.includes('RZiS') || u.includes('R_Z')) && !u.includes('SCHEMAT')) return 'rzisData';
  return null;
}

// --- main import entry point ---

export interface ImportedCompanyData {
  bilans: ReportRow[];
  rzis: ReportRow[];
  obroty: AccountRow[];
  zapisy: JournalEntry[];
  period: string;
}

export interface FilesMap {
  bilansSchema?: File;
  bilansData?: File;
  rzisSchema?: File;
  rzisData?: File;
  obroty?: File;
  zapisy?: File;
}

export async function importFiles(files: FilesMap): Promise<ImportedCompanyData> {
  const results: Partial<ImportedCompanyData> = {};

  if (files.bilansSchema && files.bilansData) {
    const schemaWb = await fileToWorkbook(files.bilansSchema);
    const dataWb = await fileToWorkbook(files.bilansData);
    results.bilans = parseBilans(schemaWb, dataWb);
  }

  if (files.rzisSchema && files.rzisData) {
    const schemaWb = await fileToWorkbook(files.rzisSchema);
    const dataWb = await fileToWorkbook(files.rzisData);
    results.rzis = parseRzis(schemaWb, dataWb);
  }

  if (files.obroty) {
    const wb = await fileToWorkbook(files.obroty);
    results.obroty = parseObroty(wb);
  }

  if (files.zapisy) {
    const wb = await fileToWorkbook(files.zapisy);
    results.zapisy = parseZapisy(wb);
  }

  // Infer period from bilans data filename
  const dataFilename = files.bilansData?.name ?? files.rzisData?.name ?? '';
  const periodMatch = dataFilename.match(/(\d{2}\.\d{2})-(\d{2}\.\d{2})/);
  const period = periodMatch ? `${periodMatch[1]} – ${periodMatch[2]}` : 'brak danych';

  return {
    bilans: results.bilans ?? [],
    rzis: results.rzis ?? [],
    obroty: results.obroty ?? [],
    zapisy: results.zapisy ?? [],
    period,
  };
}

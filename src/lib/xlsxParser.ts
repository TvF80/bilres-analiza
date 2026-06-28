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

export interface ParseResult {
  rows: ReportRow[];
  periodLabels: string[];
}

function parseCombinedSheet(wb: XLSX.WorkBook): ParseResult {
  const dataRows: unknown[][] = XLSX.utils.sheet_to_json(
    getSheet(wb, 'Wyniki zestawienia księgowego'), { header: 1 }
  );
  const header = (dataRows[0] ?? []) as unknown[];
  const periodLabels = [
    String(header[2] ?? '').trim(),
    String(header[3] ?? '').trim(),
    String(header[4] ?? '').trim(),
  ].filter(Boolean);

  const rows: ReportRow[] = [];
  for (let i = 1; i < dataRows.length; i++) {
    const d = dataRows[i] as unknown[];
    const segment = String(d[0] ?? '').trim();
    const name = String(d[1] ?? '').trim();
    if (!name) continue;
    rows.push({
      segment,
      name,
      level: getLevel(segment),
      values: {
        period1: parseNumber(d[2]),
        period2: parseNumber(d[3]),
        period3: parseNumber(d[4]),
      },
      definition: null,
      positionId: null,
      drilldownAccounts: [],
    });
  }
  return { rows, periodLabels };
}

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

export type FileRole =
  | 'bilansSchema' | 'bilansData'
  | 'rzisSchema'   | 'rzisData'
  | 'obroty' | 'zapisy'
  | 'raportMiesieczny' | 'raportMiesiecznyComp' | 'raportGrupy';

export function detectRole(filename: string): FileRole | null {
  const u = filename.toUpperCase();
  // raport grupy pracy
  if (u.includes('B_RAP_GP') || (u.includes('GRP') && u.includes('RAP'))) return 'raportGrupy';
  // raport miesięczny comp (porównanie) — sprawdź COMP przed ogólnym RAP MIES
  if ((u.includes('RAP') || u.includes('RES')) && u.includes('COMP')) return 'raportMiesiecznyComp';
  // raport miesięczny główny
  if (u.includes('RAP') && (u.includes('MIES') || u.includes('MIESIECZNY') || u.includes('RES ANA'))) return 'raportMiesieczny';
  if (u.includes('ZAPISY')) return 'zapisy';
  if (u.includes('OBROTY')) return 'obroty';
  if (u.includes('BIL') && u.includes('SCHEMAT')) return 'bilansSchema';
  if (u.includes('BIL') && !u.includes('SCHEMAT')) return 'bilansData';
  if ((u.includes('RZIS') || u.includes('RZiS') || u.includes('R_Z')) && u.includes('SCHEMAT')) return 'rzisSchema';
  if ((u.includes('RZIS') || u.includes('RZiS') || u.includes('R_Z')) && !u.includes('SCHEMAT')) return 'rzisData';
  return null;
}

// --- Raport miesięczny parser (browser) ---

import type {
  MonthlyReportData, MonthlyReportLine, DepartmentMargin, CostCategory,
  YearComparisonItem, MonthlyReportTotals, GrpData, GroupRow, GrpEmployee, GroupKosztPrac,
} from '../types';

const MONTH_COLS_RM = [7, 9, 11, 13, 15, 17, 19, 21, 23, 25, 27, 29];
const TOTAL_COL_RM = 2;
const PERIOD_LABELS_RM = [
  '10/2024','11/2024','12/2024','01/2025','02/2025','03/2025',
  '04/2025','05/2025','06/2025','07/2025','08/2025','09/2025',
];
const HISTORY_SHEETS_RM = [
  { fy: '2023', label: '10.2022–09.2023', sheet: 'RES ANA PLN 2023' },
  { fy: '2024', label: '10.2023–09.2024', sheet: 'RES ANA PLN 2024' },
  { fy: '2025', label: '10.2024–09.2025', sheet: 'RES ANA PLN 2025' },
];
const DEPT_FIRST_ROWS = [8, 11, 14, 17, 20, 23, 26, 29, 32, 35, 38, 41, 44];
const RESULT_ROWS_RM = [119,120,121,122,123,124,125,126,127,128,129,130,132,133,134,135,136];

const PL_CHARS: Record<string, string> = { ą:'a',ć:'c',ę:'e',ł:'l',ń:'n',ó:'o',ś:'s',ź:'z',ż:'z' };
function slug(s: string): string {
  return s.toLowerCase()
    .replace(/[ąćęłńóśźż]/g, ch => PL_CHARS[ch] ?? ch)
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function cellVal(ws: XLSX.WorkSheet, r: number, c: number): unknown {
  const cell = ws[XLSX.utils.encode_cell({ r, c })];
  return cell ? cell.v : undefined;
}

function readRMLine(
  ws: XLSX.WorkSheet, row: number, compWb?: XLSX.WorkBook,
  accountMap?: Map<string, { number: string; name: string }[]>,
): MonthlyReportLine {
  const r = row - 1;
  const labelPl = String(cellVal(ws, r, 0) ?? '').trim();
  const labelFr = String(cellVal(ws, r, 1) ?? '').trim() || undefined;
  const id = slug(labelPl);
  const line: MonthlyReportLine = {
    id,
    labelPl,
    labelFr,
    monthly: MONTH_COLS_RM.map(c => parseNumber(cellVal(ws, r, c))),
    total: parseNumber(cellVal(ws, r, TOTAL_COL_RM)),
  };
  if (compWb) {
    line.history = HISTORY_SHEETS_RM.map(({ fy, label, sheet }) => {
      const hws = compWb.Sheets[sheet];
      if (!hws) return { fy, label, monthly: Array(12).fill(0), total: 0 };
      return {
        fy, label,
        monthly: MONTH_COLS_RM.map(c => parseNumber(cellVal(hws, r, c))),
        total: parseNumber(cellVal(hws, r, TOTAL_COL_RM)),
      };
    });
  }
  if (accountMap) {
    const accounts = accountMap.get(id);
    if (accounts) line.accounts = accounts;
  }
  return line;
}

function parseAccountMap(ws: XLSX.WorkSheet): Map<string, { number: string; name: string }[]> {
  const range = XLSX.utils.decode_range(ws['!ref'] ?? 'A1');
  const map = new Map<string, { number: string; name: string }[]>();
  for (let r = 1; r <= range.e.r; r++) {
    const number = String(cellVal(ws, r, 1) ?? '').trim();
    const name   = String(cellVal(ws, r, 2) ?? '').trim();
    const label  = String(cellVal(ws, r, 4) ?? '').trim();
    if (!number || !label) continue;
    const key = slug(label);
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push({ number, name });
  }
  return map;
}

const COST_TREE_DEF: (number | { row: number; children: unknown[] })[] = [
  { row: 52, children: [53, 54, 55, 56, 57] },
  { row: 58, children: [59, 60, 61, 62, 63, 64] },
  { row: 65, children: [66, 67, 68, 69, 70, 71] },
  {
    row: 72,
    children: [
      { row: 73, children: [74,75,76,77,78,79,80,81,82,83] },
      { row: 84, children: [85,86,87,88,89] },
      { row: 90, children: [91,92,93,94,95,96,97,98,99,100,101,102,103,104,105,106,107] },
      { row: 108, children: [109,110,111,112,113] },
      { row: 114, children: [115,116,117,118] },
    ],
  },
];

function buildCostNode(
  ws: XLSX.WorkSheet,
  node: number | { row: number; children: unknown[] },
  compWb?: XLSX.WorkBook,
  accountMap?: Map<string, { number: string; name: string }[]>,
): CostCategory {
  if (typeof node === 'number') return readRMLine(ws, node, compWb, accountMap) as CostCategory;
  const line = readRMLine(ws, (node as { row: number }).row, compWb, accountMap);
  return {
    ...line,
    children: (node as { children: unknown[] }).children.map(c =>
      buildCostNode(ws, c as number | { row: number; children: unknown[] }, compWb, accountMap)
    ),
  };
}

function parseYearComparison(ws: XLSX.WorkSheet): YearComparisonItem[] {
  const items: YearComparisonItem[] = [];
  for (let r = 7; r <= 135; r++) {
    const labelPl = String(cellVal(ws, r, 0) ?? '').trim();
    if (!labelPl) continue;
    const pct = cellVal(ws, r, 10);
    items.push({
      id: slug(labelPl),
      labelPl,
      values: {
        y2025: parseNumber(cellVal(ws, r, 2)),
        y2024: parseNumber(cellVal(ws, r, 4)),
        y2023: parseNumber(cellVal(ws, r, 6)),
      },
      deltaRY1: parseNumber(cellVal(ws, r, 8)),
      deltaRY2: parseNumber(cellVal(ws, r, 9)),
      deltaPctRY1: typeof pct === 'number' ? pct : null,
    });
  }
  return items;
}

export function parseRaportMiesieczny(
  reportWb: XLSX.WorkBook,
  compWb?: XLSX.WorkBook,
): MonthlyReportData {
  const ws = reportWb.Sheets['RES ANA PLN'] ?? reportWb.Sheets[reportWb.SheetNames[0]];
  const bazaWs = reportWb.Sheets['BAZA'];
  const accountMap = bazaWs ? parseAccountMap(bazaWs) : undefined;

  const depts: DepartmentMargin[] = DEPT_FIRST_ROWS.map(r => {
    const revenue = readRMLine(ws, r,     compWb, accountMap);
    const cost    = readRMLine(ws, r + 1, compWb, accountMap);
    const margin  = readRMLine(ws, r + 2, compWb);
    const key = revenue.labelPl.replace(/^Sprzedaż usług\s+/i, '').trim();
    return { key, label: key, revenue, cost, margin };
  });

  const totals: MonthlyReportTotals = {
    revenue:          readRMLine(ws, 47, compWb),
    costOfSales:      readRMLine(ws, 48, compWb),
    grossMargin:      readRMLine(ws, 49, compWb),
    adminCosts:       readRMLine(ws, 50, compWb),
    grossMarginTotal: readRMLine(ws, 51, compWb),
  };

  const costCategories = COST_TREE_DEF.map(n =>
    buildCostNode(ws, n as number | { row: number; children: unknown[] }, compWb, accountMap)
  );

  const result = RESULT_ROWS_RM.map(r => readRMLine(ws, r, compWb));

  let yearComparison: YearComparisonItem[] = [];
  if (compWb) {
    const compWs = compWb.Sheets['B_RAP_COMP CUMUL'] ?? compWb.Sheets[compWb.SheetNames[0]];
    if (compWs) yearComparison = parseYearComparison(compWs);
  }

  return {
    company: 'Import',
    period: '10.2024 – 09.2025',
    periodLabels: PERIOD_LABELS_RM,
    comparisonLabel: 'Wartości roczne narastające (TOTAL): 2023 / 2024 / 2025',
    history: HISTORY_SHEETS_RM.map(({ fy, label }) => ({ fy, label })),
    departments: depts,
    totals,
    costCategories,
    result,
    yearComparison,
  };
}

// --- Raport Grupy Pracy parser (browser) ---

const MONTH_START_COLS_GRP = [5,9,13,17,21,25,29,33,37,41,45,49];
const TOTAL_COL_GRP   = 53;
const TOTAL2_COL_GRP  = 61;
const PERIOD_LABELS_GRP = [
  '10/2024','11/2024','12/2024','01/2025','02/2025','03/2025',
  '04/2025','05/2025','06/2025','07/2025','08/2025','09/2025',
];

function strCell(v: unknown): string {
  return typeof v === 'string' ? v.trim() : String(v ?? '').trim();
}

export function parseRaportGrupy(wb: XLSX.WorkBook): GrpData {
  // Arkusz 1: MB GRP — szukamy po nazwie lub pierwszym
  const ws1Name = wb.SheetNames.find(n => n.includes('MB GRP')) ?? wb.SheetNames[0];
  const raw1 = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[ws1Name], { header: 1, defval: 0 });

  const groups: GroupRow[] = [];
  for (let r = 2; r < raw1.length; r++) {
    const row = raw1[r] as unknown[];
    const lider = strCell(row[0]);
    if (!lider || lider === '0' || lider === 'TOTAL' || !lider) continue;
    const bk = strCell(row[4]);
    if (bk === 'TOTAL' || bk === '' || bk === '0') continue;
    const monthly = {
      przychod: [] as number[], koszt: [] as number[],
      mb: [] as number[], mbPct: [] as number[],
    };
    for (const startCol of MONTH_START_COLS_GRP) {
      monthly.przychod.push(parseNumber(row[startCol]));
      monthly.koszt.push(parseNumber(row[startCol + 1]));
      monthly.mb.push(parseNumber(row[startCol + 2]));
      monthly.mbPct.push(parseNumber(row[startCol + 3]));
    }
    groups.push({
      lider,
      groupNr:   strCell(row[1]),
      miasto:    strCell(row[2]),
      dzial:     strCell(row[3]),
      bk,
      komentarz: strCell(row[57]) || strCell(row[58]) || '',
      headcount: 0,
      monthly,
      total: {
        przychod: parseNumber(row[TOTAL_COL_GRP]),
        koszt:    parseNumber(row[TOTAL_COL_GRP + 1]),
        mb:       parseNumber(row[TOTAL_COL_GRP + 2]),
        mbPct:    parseNumber(row[TOTAL_COL_GRP + 3]),
      },
      totalExt: {
        przychod: parseNumber(row[TOTAL2_COL_GRP]),
        koszt:    parseNumber(row[TOTAL2_COL_GRP + 1]),
        mb:       parseNumber(row[TOTAL2_COL_GRP + 2]),
        mbPct:    parseNumber(row[TOTAL2_COL_GRP + 3]),
      },
    });
  }

  // Arkusz 2: pracownicy
  const ws2Name = wb.SheetNames.find(n => n.includes('pracownik') || n.includes('Lista')) ?? '';
  const employees: GrpEmployee[] = [];
  const headcountMap: Record<string, number> = {};
  if (ws2Name && wb.Sheets[ws2Name]) {
    const raw2 = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[ws2Name], { header: 1, defval: '' });
    for (let r = 1; r < raw2.length; r++) {
      const row = raw2[r] as unknown[];
      const lider = strCell(row[0]);
      if (!lider) continue;
      const groupNr = strCell(row[1]);
      employees.push({
        lider, groupNr,
        sort:    strCell(row[2]),
        akronim: strCell(row[3]),
        centrum: strCell(row[4]),
        bk:      strCell(row[7]),
        miasto:  strCell(row[8]),
        dzial:   strCell(row[9]),
      });
      if (groupNr) headcountMap[groupNr] = (headcountMap[groupNr] ?? 0) + 1;
    }
    for (const g of groups) g.headcount = headcountMap[g.groupNr] ?? 0;
  }

  // Arkusz 3: koszt prac
  const ws3Name = wb.SheetNames.find(n => n.includes('KOSZT') || n.includes('PRAC')) ?? '';
  const kosztPrac: GroupKosztPrac[] = [];
  let sumaKosztPrac: { monthly: number[]; razem: number } | null = null;
  if (ws3Name && wb.Sheets[ws3Name]) {
    const raw3 = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[ws3Name], { header: 1, defval: 0 });
    for (let r = 1; r < raw3.length; r++) {
      const row = raw3[r] as unknown[];
      const groupNr = strCell(row[0]);
      const name    = strCell(row[1]);
      if (!name || name === '0' || name.startsWith('#')) continue;
      const monthly: number[] = [];
      for (let c = 2; c <= 13; c++) monthly.push(parseNumber(row[c]));
      const razem = parseNumber(row[14]);
      if (name === 'SUMA') { sumaKosztPrac = { monthly, razem }; continue; }
      kosztPrac.push({ groupNr, name, monthly, razem });
    }
  }

  return { periodLabels: PERIOD_LABELS_GRP, groups, employees, kosztPrac, sumaKosztPrac };
}

// --- main import entry point ---

export interface ImportedCompanyData {
  bilans: ReportRow[];
  rzis: ReportRow[];
  obroty: AccountRow[];
  zapisy: JournalEntry[];
  period: string;
  periodLabels?: string[];
  raportMiesieczny?: MonthlyReportData;
  grpData?: GrpData;
}

export interface FilesMap {
  bilansSchema?: File;
  bilansData?: File;
  rzisSchema?: File;
  rzisData?: File;
  obroty?: File;
  zapisy?: File;
  raportMiesieczny?: File;
  raportMiesiecznyComp?: File;
  raportGrupy?: File;
}

export async function importFiles(files: FilesMap): Promise<ImportedCompanyData> {
  const results: Partial<ImportedCompanyData> = {};
  let periodLabels: string[] | undefined;

  if (files.bilansSchema && files.bilansData) {
    const schemaWb = await fileToWorkbook(files.bilansSchema);
    const dataWb = await fileToWorkbook(files.bilansData);
    results.bilans = parseBilans(schemaWb, dataWb);
  } else if (files.bilansData) {
    const wb = await fileToWorkbook(files.bilansData);
    const parsed = parseCombinedSheet(wb);
    results.bilans = parsed.rows;
    periodLabels = parsed.periodLabels;
  }

  if (files.rzisSchema && files.rzisData) {
    const schemaWb = await fileToWorkbook(files.rzisSchema);
    const dataWb = await fileToWorkbook(files.rzisData);
    results.rzis = parseRzis(schemaWb, dataWb);
  } else if (files.rzisData) {
    const wb = await fileToWorkbook(files.rzisData);
    const parsed = parseCombinedSheet(wb);
    results.rzis = parsed.rows;
    if (!periodLabels) periodLabels = parsed.periodLabels;
  }

  if (files.obroty) {
    const wb = await fileToWorkbook(files.obroty);
    results.obroty = parseObroty(wb);
  }

  if (files.zapisy) {
    const wb = await fileToWorkbook(files.zapisy);
    results.zapisy = parseZapisy(wb);
  }

  if (files.raportMiesieczny) {
    const reportWb = await fileToWorkbook(files.raportMiesieczny);
    const compWb = files.raportMiesiecznyComp ? await fileToWorkbook(files.raportMiesiecznyComp) : undefined;
    results.raportMiesieczny = parseRaportMiesieczny(reportWb, compWb);
  }

  if (files.raportGrupy) {
    const wb = await fileToWorkbook(files.raportGrupy);
    results.grpData = parseRaportGrupy(wb);
  }

  // Infer period label
  let period = 'brak danych';
  if (periodLabels?.[0]) {
    period = periodLabels[0];
  } else {
    const dataFilename = files.bilansData?.name ?? files.rzisData?.name ?? '';
    const m = dataFilename.match(/(\d{2}\.\d{4})-(\d{2}\.\d{4})/);
    if (m) period = `${m[1]} – ${m[2]}`;
    else {
      const m2 = dataFilename.match(/(\d{2}\.\d{2})-(\d{2}\.\d{2})/);
      if (m2) period = `${m2[1]} – ${m2[2]}`;
    }
  }

  return {
    bilans:    results.bilans    ?? [],
    rzis:      results.rzis      ?? [],
    obroty:    results.obroty    ?? [],
    zapisy:    results.zapisy    ?? [],
    period,
    periodLabels,
    raportMiesieczny: results.raportMiesieczny,
    grpData:          results.grpData,
  };
}

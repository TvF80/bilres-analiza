import type { ReportRow, AccountRow, JournalEntry } from '../types';

export type CheckStatus = 'ok' | 'error' | 'warning' | 'nodata' | 'loading';

export interface CheckResult {
  id: string;
  name: string;
  status: CheckStatus;
  value?: string;
  expected?: string;
  detail?: string;
}

export interface RatioResult {
  id: string;
  name: string;
  formula: string;
  value1: number | null;
  value2: number | null;
  unit?: string;
  norm?: string;
  status1?: CheckStatus;
  status2?: CheckStatus;
}

// --- helpers ---

function fmt(n: number): string {
  return new Intl.NumberFormat('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
}

function findRow(rows: ReportRow[], ...keywords: string[]): ReportRow | undefined {
  const lower = keywords.map(k => k.toLowerCase());
  // exact segment + level match first, then name keyword match
  return rows.find(r => lower.every(k => r.name.toLowerCase().includes(k)));
}

function val(row: ReportRow | undefined, period: 1 | 2): number | null {
  if (!row) return null;
  return period === 1 ? row.values.period1 : row.values.period2;
}

function ratio(a: number | null, b: number | null): number | null {
  if (a === null || b === null || b === 0) return null;
  return a / b;
}

function statusForRatio(v: number | null, low: number, high: number): CheckStatus {
  if (v === null) return 'nodata';
  if (v >= low && v <= high) return 'ok';
  if (v < low * 0.7 || v > high * 1.5) return 'error';
  return 'warning';
}

// --- Completeness checks ---

export function checkCompleteness(
  bilans: ReportRow[], rzis: ReportRow[], obroty: AccountRow[], zapisy: JournalEntry[], zapisyLoading: boolean
): CheckResult[] {
  return [
    {
      id: 'comp-bilans',
      name: 'Bilans',
      status: bilans.length > 0 ? 'ok' : 'nodata',
      value: bilans.length > 0 ? `${bilans.length} pozycji` : undefined,
      detail: bilans.length === 0 ? 'Brak danych — zaimportuj pliki Excel' : undefined,
    },
    {
      id: 'comp-rzis',
      name: 'Rachunek zysków i strat',
      status: rzis.length > 0 ? 'ok' : 'nodata',
      value: rzis.length > 0 ? `${rzis.length} pozycji` : undefined,
      detail: rzis.length === 0 ? 'Brak danych — zaimportuj pliki Excel' : undefined,
    },
    {
      id: 'comp-obroty',
      name: 'Obroty i salda kont',
      status: obroty.length > 0 ? 'ok' : 'nodata',
      value: obroty.length > 0 ? `${obroty.length} kont` : undefined,
      detail: obroty.length === 0 ? 'Brak danych — zaimportuj pliki Excel' : undefined,
    },
    {
      id: 'comp-zapisy',
      name: 'Zapisy księgowe (dziennik FK)',
      status: zapisyLoading ? 'loading' : zapisy.length > 0 ? 'ok' : 'nodata',
      value: zapisy.length > 0 ? `${zapisy.length.toLocaleString('pl-PL')} zapisów` : undefined,
      detail: zapisyLoading ? 'Ładowanie…' : zapisy.length === 0 ? 'Oczekiwanie na plik lub brak danych' : undefined,
    },
  ];
}

// --- Integrity checks ---

export function checkBilansBalance(bilans: ReportRow[]): CheckResult[] {
  if (bilans.length === 0) {
    return [
      { id: 'bil-bal-p1', name: 'Bilans: Aktywa = Pasywa (okres 1)', status: 'nodata' },
      { id: 'bil-bal-p2', name: 'Bilans: Aktywa = Pasywa (okres 2)', status: 'nodata' },
    ];
  }

  // Find totals: level-0 rows (segment '-')
  const level0 = bilans.filter(r => r.level === 0);
  // Typically: first level-0 = Aktywa razem, second = Pasywa razem
  // Or a single total row with both sides equal
  const aktRazem = level0.find(r => /aktyw/i.test(r.name)) ?? level0[0];
  const pasRazem = level0.find(r => /pasyw/i.test(r.name)) ?? level0[level0.length - 1];

  const results: CheckResult[] = [];
  for (const p of [1, 2] as const) {
    const akt = val(aktRazem, p);
    const pas = val(pasRazem, p);
    const label = p === 1 ? 'okres 1 (bieżący)' : 'okres 2 (porównawczy)';

    if (akt === null || pas === null || aktRazem === pasRazem) {
      // single total row - can't compare
      results.push({
        id: `bil-bal-p${p}`,
        name: `Bilans: Aktywa = Pasywa (${label})`,
        status: 'nodata',
        detail: 'Nie znaleziono odrębnych sum aktywów i pasywów',
      });
      continue;
    }

    const diff = Math.abs(akt - pas);
    results.push({
      id: `bil-bal-p${p}`,
      name: `Bilans: Aktywa = Pasywa (${label})`,
      status: diff < 1 ? 'ok' : 'error',
      value: `Aktywa: ${fmt(akt)} PLN`,
      expected: `Pasywa: ${fmt(pas)} PLN`,
      detail: diff >= 1 ? `Różnica: ${fmt(diff)} PLN` : undefined,
    });
  }
  return results;
}

export function checkDoubleEntry(zapisy: JournalEntry[]): CheckResult {
  if (zapisy.length === 0) {
    return { id: 'double-entry', name: 'Zasada podwójnego zapisu (Σ Wn = Σ Ma)', status: 'nodata' };
  }

  let sumWn = 0, sumMa = 0;
  for (const z of zapisy) { sumWn += z.kwotaWn || 0; sumMa += z.kwotaMa || 0; }
  const diff = Math.abs(sumWn - sumMa);

  return {
    id: 'double-entry',
    name: 'Zasada podwójnego zapisu (Σ Wn = Σ Ma)',
    status: diff < 0.01 ? 'ok' : diff < 1 ? 'warning' : 'error',
    value: `Σ Wn: ${fmt(sumWn)} PLN`,
    expected: `Σ Ma: ${fmt(sumMa)} PLN`,
    detail: diff >= 0.01 ? `Różnica: ${fmt(diff)} PLN` : undefined,
  };
}

export function checkAccountBalances(obroty: AccountRow[]): CheckResult {
  if (obroty.length === 0) {
    return { id: 'acct-bal', name: 'Obroty: BO + obroty = saldo (per konto)', status: 'nodata' };
  }

  const errors: string[] = [];
  for (const a of obroty) {
    const expectedNet = (a.boWn - a.boMa) + (a.obrotyWn - a.obrotyMa);
    const actualNet = a.saldoWn - a.saldoMa;
    if (Math.abs(expectedNet - actualNet) > 1) {
      errors.push(a.numer);
    }
  }

  return {
    id: 'acct-bal',
    name: 'Obroty: BO + obroty = saldo (per konto)',
    status: errors.length === 0 ? 'ok' : 'error',
    value: `${obroty.length} kont sprawdzono`,
    detail: errors.length > 0
      ? `${errors.length} kont z niezgodnością: ${errors.slice(0, 5).join(', ')}${errors.length > 5 ? '…' : ''}`
      : undefined,
  };
}

export function checkJournalCompleteness(zapisy: JournalEntry[]): CheckResult {
  if (zapisy.length === 0) {
    return { id: 'journal-complete', name: 'Zapisy: kompletność pól', status: 'nodata' };
  }

  const missingKonto = zapisy.filter(z => !z.konto).length;
  const zeroAll = zapisy.filter(z => (z.kwotaWn || 0) === 0 && (z.kwotaMa || 0) === 0).length;
  const issues = missingKonto + zeroAll;

  return {
    id: 'journal-complete',
    name: 'Zapisy: kompletność pól',
    status: issues === 0 ? 'ok' : issues < 5 ? 'warning' : 'error',
    value: `${zapisy.length.toLocaleString('pl-PL')} zapisów`,
    detail: issues > 0
      ? [
          missingKonto > 0 ? `${missingKonto} bez numeru konta` : '',
          zeroAll > 0 ? `${zeroAll} z kwotą 0 Wn i 0 Ma` : '',
        ].filter(Boolean).join(', ')
      : undefined,
  };
}

export function checkObrotySumsMatchZapisy(obroty: AccountRow[], zapisy: JournalEntry[]): CheckResult {
  if (obroty.length === 0 || zapisy.length === 0) {
    return { id: 'obroty-zapisy', name: 'Obroty vs zapisy: suma Wn/Ma per konto', status: 'nodata' };
  }

  // Build map of zapisy sums per account prefix
  const zapisyMap = new Map<string, { wn: number; ma: number }>();
  for (const z of zapisy) {
    const k = z.konto;
    if (!k) continue;
    const cur = zapisyMap.get(k) ?? { wn: 0, ma: 0 };
    cur.wn += z.kwotaWn || 0;
    cur.ma += z.kwotaMa || 0;
    zapisyMap.set(k, cur);
  }

  // For each obroty account, sum all zapisy that start with that account number
  let mismatches = 0;
  for (const a of obroty) {
    let totalWn = 0, totalMa = 0;
    for (const [k, sums] of zapisyMap) {
      if (k.startsWith(a.numer) || k === a.numer) {
        totalWn += sums.wn;
        totalMa += sums.ma;
      }
    }
    if (totalWn > 0 || totalMa > 0) {
      if (Math.abs(totalWn - a.obrotyWn) > 1 || Math.abs(totalMa - a.obrotyMa) > 1) {
        mismatches++;
      }
    }
  }

  return {
    id: 'obroty-zapisy',
    name: 'Obroty vs zapisy: zgodność obrotów Wn/Ma',
    status: mismatches === 0 ? 'ok' : mismatches < 10 ? 'warning' : 'error',
    value: `${obroty.length} kont porównano`,
    detail: mismatches > 0 ? `${mismatches} kont z rozbieżnością (może wynikać z hierarchii kont)` : undefined,
  };
}

// --- Financial ratios ---

export function computeRatios(bilans: ReportRow[], rzis: ReportRow[]): RatioResult[] {
  // Balance sheet positions
  const aktObrRaw  = findRow(bilans, 'aktywa obrotowe');
  const zapasyRaw  = findRow(bilans, 'zapas');
  const nalezRaw   = findRow(bilans, 'należności krótkoterminowe') ?? findRow(bilans, 'należności');
  const srodkiRaw  = findRow(bilans, 'środki pieniężne') ?? findRow(bilans, 'inwestycje krótkoterminowe');
  const zobKrotRaw = findRow(bilans, 'zobowiązania krótkoterminowe');
  const kapWlasRaw = findRow(bilans, 'kapitał') ?? findRow(bilans, 'fundusz własny');
  const aktRazRaw  = bilans.find(r => r.level === 0 && /aktyw/i.test(r.name)) ?? bilans.find(r => r.level === 0);
  const zobRazRaw  = findRow(bilans, 'zobowiązania i rezerwy') ?? findRow(bilans, 'pasywa') ?? findRow(bilans, 'zobowiązania razem');

  // P&L positions
  const przychodRaw = findRow(rzis, 'przychody netto ze sprzedaży') ?? findRow(rzis, 'przychody netto') ?? findRow(rzis, 'przychody ze sprzedaży');
  const zyskNettRaw = findRow(rzis, 'zysk', 'netto') ?? findRow(rzis, 'strata', 'netto');

  const results: RatioResult[] = [];

  function addRatio(
    id: string, name: string, formula: string,
    numRows: (ReportRow | undefined)[], denRows: (ReportRow | undefined)[],
    unit: string, norm: string,
    okLow: number, okHigh: number,
  ) {
    const numSum = (p: 1 | 2) => numRows.reduce((s, r) => s + (val(r, p) ?? 0), 0);
    const denSum = (p: 1 | 2) => denRows.reduce((s, r) => s + (val(r, p) ?? 0), 0);

    const hasData = numRows.some(r => r !== undefined) && denRows.some(r => r !== undefined);
    const v1 = hasData ? ratio(numSum(1), denSum(1)) : null;
    const v2 = hasData ? ratio(numSum(2), denSum(2)) : null;

    results.push({
      id, name, formula,
      value1: v1, value2: v2,
      unit, norm,
      status1: statusForRatio(v1, okLow, okHigh),
      status2: statusForRatio(v2, okLow, okHigh),
    });
  }

  // Liquidity
  addRatio('liq-current', 'Płynność bieżąca', 'Aktywa obrotowe / Zob. krótkoterm.',
    [aktObrRaw], [zobKrotRaw], 'x', '1,5 – 2,0', 1.2, 2.5);
  addRatio('liq-quick', 'Płynność szybka', '(Aktywa obrotowe − Zapasy) / Zob. krótkoterm.',
    [aktObrRaw], [zobKrotRaw],
    'x', '1,0 – 1,2', 0.8, 1.5);
    // override with custom calc below

  // Override quick ratio with correct formula
  const v1q = (() => {
    const a = val(aktObrRaw, 1); const z = val(zapasyRaw, 1); const d = val(zobKrotRaw, 1);
    return ratio(a !== null && z !== null ? a - z : a, d);
  })();
  const v2q = (() => {
    const a = val(aktObrRaw, 2); const z = val(zapasyRaw, 2); const d = val(zobKrotRaw, 2);
    return ratio(a !== null && z !== null ? a - z : a, d);
  })();
  const qIdx = results.findIndex(r => r.id === 'liq-quick');
  if (qIdx >= 0) {
    results[qIdx].value1 = v1q;
    results[qIdx].value2 = v2q;
    results[qIdx].status1 = statusForRatio(v1q, 0.8, 1.5);
    results[qIdx].status2 = statusForRatio(v2q, 0.8, 1.5);
  }

  addRatio('liq-cash', 'Płynność gotówkowa', 'Środki pieniężne / Zob. krótkoterm.',
    [srodkiRaw], [zobKrotRaw], 'x', '0,1 – 0,3', 0.05, 0.5);

  // Profitability
  addRatio('prof-roa', 'ROA — rentowność aktywów', 'Zysk netto / Aktywa razem × 100',
    [zyskNettRaw], [aktRazRaw], '%', '> 5%', 3, 20);
  addRatio('prof-roe', 'ROE — rentowność kapitału', 'Zysk netto / Kapitał własny × 100',
    [zyskNettRaw], [kapWlasRaw], '%', '> 10%', 5, 40);
  addRatio('prof-ros', 'ROS — marża netto', 'Zysk netto / Przychody × 100',
    [zyskNettRaw], [przychodRaw], '%', '> 5%', 2, 25);

  // Debt
  addRatio('debt-ratio', 'Wskaźnik zadłużenia ogólnego', 'Zobowiązania razem / Aktywa razem',
    [zobRazRaw], [aktRazRaw], 'x', '0,4 – 0,6', 0.2, 0.7);
  addRatio('debt-equity', 'Dźwignia finansowa', 'Zobowiązania razem / Kapitał własny',
    [zobRazRaw], [kapWlasRaw], 'x', '< 1,0', 0, 1.5);

  // Activity (turnover in days using revenue)
  const p1rev = val(przychodRaw, 1);
  const p2rev = val(przychodRaw, 2);
  const days1 = p1rev && p1rev > 0 ? 365 : null;
  const days2 = p2rev && p2rev > 0 ? 365 : null;

  const dso1 = (val(nalezRaw, 1) !== null && days1) ? (val(nalezRaw, 1)! / (p1rev! / 365)) : null;
  const dso2 = (val(nalezRaw, 2) !== null && days2) ? (val(nalezRaw, 2)! / (p2rev! / 365)) : null;
  const dpo1 = (val(zobKrotRaw, 1) !== null && days1) ? (val(zobKrotRaw, 1)! / (p1rev! / 365)) : null;
  const dpo2 = (val(zobKrotRaw, 2) !== null && days2) ? (val(zobKrotRaw, 2)! / (p2rev! / 365)) : null;

  results.push({
    id: 'activity-dso', name: 'Rotacja należności', formula: 'Należności / Przychody × 365',
    value1: dso1, value2: dso2, unit: 'dni', norm: '30 – 60 dni',
    status1: statusForRatio(dso1, 20, 75), status2: statusForRatio(dso2, 20, 75),
  });
  results.push({
    id: 'activity-dpo', name: 'Rotacja zobowiązań', formula: 'Zob. krótkoterm. / Przychody × 365',
    value1: dpo1, value2: dpo2, unit: 'dni', norm: '30 – 60 dni',
    status1: statusForRatio(dpo1, 20, 75), status2: statusForRatio(dpo2, 20, 75),
  });

  // Scale ROA, ROE, ROS values to %
  for (const id of ['prof-roa', 'prof-roe', 'prof-ros']) {
    const r = results.find(x => x.id === id);
    if (r) {
      if (r.value1 !== null) r.value1 = r.value1 * 100;
      if (r.value2 !== null) r.value2 = r.value2 * 100;
    }
  }

  return results;
}

// --- Stats ---

export interface DataStats {
  bilansRows: number;
  rzisRows: number;
  obrotyCounts: number;
  zapisyCount: number;
  zapisyDateMin: string | null;
  zapisyDateMax: string | null;
  uniqueAccounts: number;
  uniqueDocuments: number;
  sumWn: number;
  sumMa: number;
}

export function computeStats(
  bilans: ReportRow[], rzis: ReportRow[], obroty: AccountRow[], zapisy: JournalEntry[]
): DataStats {
  let dateMin: string | null = null, dateMax: string | null = null;
  const accounts = new Set<string>();
  const docs = new Set<string>();
  let sumWn = 0, sumMa = 0;

  for (const z of zapisy) {
    if (z.dataKsiegowania) {
      if (!dateMin || z.dataKsiegowania < dateMin) dateMin = z.dataKsiegowania;
      if (!dateMax || z.dataKsiegowania > dateMax) dateMax = z.dataKsiegowania;
    }
    if (z.konto) accounts.add(z.konto);
    if (z.dokument) docs.add(z.dokument);
    sumWn += z.kwotaWn || 0;
    sumMa += z.kwotaMa || 0;
  }

  return {
    bilansRows: bilans.length,
    rzisRows: rzis.length,
    obrotyCounts: obroty.length,
    zapisyCount: zapisy.length,
    zapisyDateMin: dateMin,
    zapisyDateMax: dateMax,
    uniqueAccounts: accounts.size,
    uniqueDocuments: docs.size,
    sumWn,
    sumMa,
  };
}

// ── Beneish M-score (1999) ────────────────────────────────────────────────────

export interface BeneishInputRow {
  label: string;
  rowName: string;
  source: 'bilans' | 'rzis';
  t: number;
  t1: number;
}

export interface BeneishStep {
  label: string;
  t: string;
  t1: string;
}

export interface BeneishDetail {
  fullName: string;
  formula: string;
  inputs: BeneishInputRow[];
  steps: BeneishStep[];
}

export interface BeneishIndex {
  key: string;
  value: number;
  weight: number;
  contribution: number;
  detail: BeneishDetail;
}

export interface BeneishResult {
  indices: BeneishIndex[];
  mscore: number;
  highRisk: boolean;
  topDrivers: string[];
}

export function computeBeneish(bilans: ReportRow[], rzis: ReportRow[]): BeneishResult | null {
  if (bilans.length === 0 || rzis.length === 0) return null;

  const lo = (r: ReportRow) => r.name.toLowerCase();
  const val = (r: ReportRow | undefined, p: 1 | 2) =>
    !r ? 0 : p === 1 ? r.values.period1 : r.values.period2;
  const find = (rows: ReportRow[], pred: (r: ReportRow) => boolean) => rows.find(pred);
  const safe = (n: number, d: number) => (d !== 0 ? n / d : 0);
  const pct = (v: number) => `${(v * 100).toFixed(2)}%`;
  const r4 = (v: number) => v.toFixed(4);
  const fmtK = (v: number) => {
    const abs = Math.abs(v);
    if (abs >= 1_000_000) return `${(v / 1_000_000).toFixed(2)} M`;
    if (abs >= 1_000) return `${(v / 1_000).toFixed(0)} k`;
    return v.toFixed(0);
  };

  // Bilans — wiersze
  const rowCA   = find(bilans, r => r.level === 1 && lo(r).includes('aktyw') && lo(r).includes('obrotow'));
  const rowPPE  = find(bilans, r => r.level === 1 && lo(r).includes('aktyw') && lo(r).includes('trwał'));
  const rowTA   = bilans.filter(r => r.level === 0).find(r => lo(r).includes('aktyw'));
  const rowRec  = find(bilans, r => lo(r).includes('należności krótkoterminow'))
               ?? find(bilans, r => lo(r).includes('należności'));
  const rowCash = find(bilans, r => lo(r).includes('środki pieniężne'));
  const rowCL   = find(bilans, r => lo(r).includes('zobowiązania krótkoterminow'));
  const rowLTD  = find(bilans, r => lo(r).includes('zobowiązania długoterminow'));

  // RZiS — wiersze
  const rowRev   = find(rzis, r => r.level <= 2 && lo(r).includes('przychody netto ze sprzedaży'));
  const rowCosts = find(rzis, r => lo(r).includes('koszty działalności operacyjnej'));
  const rowDep   = find(rzis, r => lo(r).includes('amortyzacja'));

  const n = (r: ReportRow | undefined) => r?.name ?? '—';

  // Wartości dla t (period1) i t-1 (period2)
  const CA_t = val(rowCA, 1),    CA_1  = val(rowCA, 2);
  const PPE_t = val(rowPPE, 1),  PPE_1 = val(rowPPE, 2);
  const TA_t  = val(rowTA, 1),   TA_1  = val(rowTA, 2);
  const Rec_t = val(rowRec, 1),  Rec_1 = val(rowRec, 2);
  const Cash_t = val(rowCash, 1), Cash_1 = val(rowCash, 2);
  const CL_t  = val(rowCL, 1),   CL_1  = val(rowCL, 2);
  const LTD_t = val(rowLTD, 1),  LTD_1 = val(rowLTD, 2);
  const Rev_t   = val(rowRev, 1),   Rev_1   = val(rowRev, 2);
  const Costs_t = val(rowCosts, 1), Costs_1 = val(rowCosts, 2);
  const Dep_t   = val(rowDep, 1),   Dep_1   = val(rowDep, 2);

  if (TA_t === 0 || Rev_t === 0 || TA_1 === 0 || Rev_1 === 0) return null;

  // ── Obliczenia ──────────────────────────────────────────────────────────────

  const DSRI = safe(safe(Rec_t, Rev_t), safe(Rec_1, Rev_1));

  const GM_t = safe(Rev_t - Costs_t, Rev_t);
  const GM_1 = safe(Rev_1 - Costs_1, Rev_1);
  const GMI  = safe(GM_1, GM_t);

  const AQI_t = 1 - safe(CA_t + PPE_t, TA_t);
  const AQI_1 = 1 - safe(CA_1 + PPE_1, TA_1);
  const AQI   = safe(AQI_t, AQI_1);

  const SGI = safe(Rev_t, Rev_1);

  const DEPI_1 = safe(Dep_1, PPE_1 + Dep_1);
  const DEPI_t = safe(Dep_t, PPE_t + Dep_t);
  const DEPI   = safe(DEPI_1, DEPI_t);

  const SGAI = safe(safe(Costs_t, Rev_t), safe(Costs_1, Rev_1));

  const LVGI_t = safe(LTD_t + CL_t, TA_t);
  const LVGI_1 = safe(LTD_1 + CL_1, TA_1);
  const LVGI   = safe(LVGI_t, LVGI_1);

  const TATA = safe((CA_t - CA_1 - (Cash_t - Cash_1)) - (CL_t - CL_1) - Dep_t, TA_t);

  // ── Szczegóły dla każdego wskaźnika ────────────────────────────────────────

  const details: Record<string, BeneishDetail> = {
    DSRI: {
      fullName: 'Days Sales Receivable Index',
      formula: '(Nal_t / Prz_t) ÷ (Nal_{t-1} / Prz_{t-1})',
      inputs: [
        { label: 'Należności', rowName: n(rowRec), source: 'bilans', t: Rec_t, t1: Rec_1 },
        { label: 'Przychody', rowName: n(rowRev), source: 'rzis', t: Rev_t, t1: Rev_1 },
      ],
      steps: [
        { label: 'Nal / Prz (t)', t: pct(safe(Rec_t, Rev_t)), t1: pct(safe(Rec_1, Rev_1)) },
        { label: 'DSRI', t: r4(DSRI), t1: '(norma ≈ 1,0)' },
      ],
    },
    GMI: {
      fullName: 'Gross Margin Index',
      formula: 'MB_{t-1}/MB_t  gdzie  MB = (Prz - Koszty) / Prz',
      inputs: [
        { label: 'Przychody', rowName: n(rowRev), source: 'rzis', t: Rev_t, t1: Rev_1 },
        { label: 'Koszty oper.', rowName: n(rowCosts), source: 'rzis', t: Costs_t, t1: Costs_1 },
      ],
      steps: [
        { label: 'Marża brutto', t: pct(GM_t), t1: pct(GM_1) },
        { label: 'GMI', t: r4(GMI), t1: '(norma ≤ 1,0)' },
      ],
    },
    AQI: {
      fullName: 'Asset Quality Index',
      formula: '(1 − (CA_t+PPE_t)/TA_t) ÷ (1 − (CA_{t-1}+PPE_{t-1})/TA_{t-1})',
      inputs: [
        { label: 'Aktywa obrotowe', rowName: n(rowCA), source: 'bilans', t: CA_t, t1: CA_1 },
        { label: 'Aktywa trwałe', rowName: n(rowPPE), source: 'bilans', t: PPE_t, t1: PPE_1 },
        { label: 'Aktywa razem', rowName: n(rowTA), source: 'bilans', t: TA_t, t1: TA_1 },
      ],
      steps: [
        { label: '(CA+PPE)/TA', t: pct(safe(CA_t + PPE_t, TA_t)), t1: pct(safe(CA_1 + PPE_1, TA_1)) },
        { label: '1 − (CA+PPE)/TA', t: r4(AQI_t), t1: r4(AQI_1) },
        { label: 'AQI', t: r4(AQI), t1: '(norma ≤ 1,0)' },
      ],
    },
    SGI: {
      fullName: 'Sales Growth Index',
      formula: 'Prz_t / Prz_{t-1}',
      inputs: [
        { label: 'Przychody', rowName: n(rowRev), source: 'rzis', t: Rev_t, t1: Rev_1 },
      ],
      steps: [
        { label: 'SGI', t: r4(SGI), t1: `(wzrost: ${pct(SGI - 1)})` },
      ],
    },
    DEPI: {
      fullName: 'Depreciation Index',
      formula: '[Dep_{t-1}/(PPE_{t-1}+Dep_{t-1})] ÷ [Dep_t/(PPE_t+Dep_t)]',
      inputs: [
        { label: 'Amortyzacja', rowName: n(rowDep), source: 'rzis', t: Dep_t, t1: Dep_1 },
        { label: 'Aktywa trwałe', rowName: n(rowPPE), source: 'bilans', t: PPE_t, t1: PPE_1 },
      ],
      steps: [
        { label: 'Dep/(PPE+Dep)', t: pct(DEPI_t), t1: pct(DEPI_1) },
        { label: 'DEPI', t: r4(DEPI), t1: '(norma ≤ 1,0)' },
      ],
    },
    SGAI: {
      fullName: 'SGA Expense Index',
      formula: '(Koszty_t/Prz_t) ÷ (Koszty_{t-1}/Prz_{t-1})',
      inputs: [
        { label: 'Koszty oper.', rowName: n(rowCosts), source: 'rzis', t: Costs_t, t1: Costs_1 },
        { label: 'Przychody', rowName: n(rowRev), source: 'rzis', t: Rev_t, t1: Rev_1 },
      ],
      steps: [
        { label: 'Koszty/Prz', t: pct(safe(Costs_t, Rev_t)), t1: pct(safe(Costs_1, Rev_1)) },
        { label: 'SGAI', t: r4(SGAI), t1: '(norma ≤ 1,0)' },
      ],
    },
    LVGI: {
      fullName: 'Leverage Index',
      formula: '(ZDT_t+ZKT_t)/TA_t ÷ (ZDT_{t-1}+ZKT_{t-1})/TA_{t-1}',
      inputs: [
        { label: 'Zob. długoterm.', rowName: n(rowLTD), source: 'bilans', t: LTD_t, t1: LTD_1 },
        { label: 'Zob. krótkot.', rowName: n(rowCL), source: 'bilans', t: CL_t, t1: CL_1 },
        { label: 'Aktywa razem', rowName: n(rowTA), source: 'bilans', t: TA_t, t1: TA_1 },
      ],
      steps: [
        { label: 'ZDT+ZKT', t: fmtK(LTD_t + CL_t), t1: fmtK(LTD_1 + CL_1) },
        { label: '(ZDT+ZKT)/TA', t: pct(LVGI_t), t1: pct(LVGI_1) },
        { label: 'LVGI', t: r4(LVGI), t1: '(norma ≤ 1,0)' },
      ],
    },
    TATA: {
      fullName: 'Total Accruals to Total Assets',
      formula: '[(ΔCA − ΔCash) − ΔCL − Dep_t] / TA_t',
      inputs: [
        { label: 'Aktywa obrotowe', rowName: n(rowCA), source: 'bilans', t: CA_t, t1: CA_1 },
        { label: 'Środki pieniężne', rowName: n(rowCash), source: 'bilans', t: Cash_t, t1: Cash_1 },
        { label: 'Zob. krótkot.', rowName: n(rowCL), source: 'bilans', t: CL_t, t1: CL_1 },
        { label: 'Amortyzacja', rowName: n(rowDep), source: 'rzis', t: Dep_t, t1: Dep_1 },
        { label: 'Aktywa razem', rowName: n(rowTA), source: 'bilans', t: TA_t, t1: TA_1 },
      ],
      steps: [
        { label: 'ΔCA − ΔCash', t: fmtK(CA_t - CA_1 - (Cash_t - Cash_1)), t1: '' },
        { label: 'ΔCL', t: fmtK(CL_t - CL_1), t1: '' },
        { label: 'Licznik', t: fmtK((CA_t - CA_1 - (Cash_t - Cash_1)) - (CL_t - CL_1) - Dep_t), t1: '' },
        { label: 'TATA', t: r4(TATA), t1: '(norma ≤ 0,031)' },
      ],
    },
  };

  const WEIGHTS: Record<string, number> = {
    DSRI: 0.920, GMI: 0.528, AQI: 0.404, SGI: 0.892,
    DEPI: 0.115, SGAI: -0.172, LVGI: -0.327, TATA: 4.679,
  };

  const vals: Record<string, number> = { DSRI, GMI, AQI, SGI, DEPI, SGAI, LVGI, TATA };

  const indices: BeneishIndex[] = Object.entries(WEIGHTS).map(([key, weight]) => ({
    key,
    value: vals[key],
    weight,
    contribution: weight * vals[key],
    detail: details[key],
  }));

  const mscore = -4.84 + indices.reduce((s, i) => s + i.contribution, 0);
  const highRisk = mscore > -1.78;

  const topDrivers = [...indices]
    .sort((a, b) => b.contribution - a.contribution)
    .slice(0, 3)
    .filter(i => i.contribution > 0.05)
    .map(i => i.key);

  return { indices, mscore, highRisk, topDrivers };
}

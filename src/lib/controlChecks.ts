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

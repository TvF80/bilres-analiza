import type { Company, ReportRow } from '../types';
import { mapFields, type FieldMap } from './fieldMapping';
import type { ExportSheet } from './xlsxParser';
import type { WorkerRequest, WorkerResponse } from './xlsxParser.worker';

function reportRowsToAoa(rows: ReportRow[], periodLabels: string[]): (string | number)[][] {
  const header = ['Pozycja', 'Poziom', periodLabels[0] ?? 'Okres 1', periodLabels[1] ?? 'Okres 2', ...(periodLabels[2] ? [periodLabels[2]] : [])];
  const body = rows.map(r => [
    r.name, r.level, r.values.period1, r.values.period2,
    ...(periodLabels[2] ? [r.values.period3 ?? ''] : []),
  ]);
  return [header, ...body];
}

function safeDiv(num: number, den: number): number | null {
  return den !== 0 ? num / den : null;
}

function ratiosAoa(company: Company, periodLabels: string[]): (string | number)[][] {
  const f1 = mapFields(company.bilans, company.rzis, 1);
  const f2 = mapFields(company.bilans, company.rzis, 2);
  const ebitda = (f: FieldMap) => f.ebit + f.amortyzacja;
  const totalDebt = (f: FieldMap) => f.zobowiazaniaDlugo + f.zobowiazaniaKrotko;

  const rowsFor = (f: FieldMap) => ({
    'Przychody (PLN)': f.przychody,
    'Zysk netto (PLN)': f.zyskNetto,
    'EBIT (PLN)': f.ebit,
    'EBITDA (PLN)': ebitda(f),
    'Płynność bieżąca (CR)': safeDiv(f.aktywaObrotowe, f.zobowiazaniaKrotko),
    'Płynność szybka (QR)': safeDiv(f.aktywaObrotowe - f.zapasy, f.zobowiazaniaKrotko),
    'Zadłużenie ogólne (D/A)': safeDiv(totalDebt(f), f.aktywaRazem),
    'ROE': safeDiv(f.zyskNetto, f.kapitalWlasny),
    'ROA': safeDiv(f.zyskNetto, f.aktywaRazem),
    'ROS': safeDiv(f.zyskNetto, f.przychody),
    'Marża EBITDA': safeDiv(ebitda(f), f.przychody),
    'DSO (dni)': f.przychody !== 0 ? (f.naleznosci / f.przychody) * 360 : null,
  });

  const r1 = rowsFor(f1);
  const r2 = rowsFor(f2);
  const header = ['Wskaźnik', periodLabels[0] ?? 'Okres 1', periodLabels[1] ?? 'Okres 2'];
  const body = Object.keys(r1).map(key => [key, (r1 as Record<string, number | null>)[key] ?? '—', (r2 as Record<string, number | null>)[key] ?? '—']);
  return [header, ...body];
}

// Budowa faktycznego pliku .xlsx (biblioteka `xlsx`) dzieje się w Web Workerze
// (xlsxParser.worker.ts) — ten moduł przygotowuje tylko dane (AOA), bez
// importowania `xlsx` bezpośrednio, żeby nie wciągać biblioteki z powrotem do
// głównego bundla (patrz CLAUDE.md „Hardening bezpieczeństwa").
export async function exportCompanyToExcel(company: Company): Promise<void> {
  const periodLabels = company.periodLabels ?? [company.period, ''];

  const sheets: ExportSheet[] = [
    { name: 'Bilans', aoa: reportRowsToAoa(company.bilans, periodLabels) },
    { name: 'RZiS', aoa: reportRowsToAoa(company.rzis, periodLabels) },
  ];
  if (company.bilans.length && company.rzis.length) {
    sheets.push({ name: 'Wskaźniki', aoa: ratiosAoa(company, periodLabels) });
  }

  const buffer = await new Promise<Uint8Array>((resolve, reject) => {
    const worker = new Worker(new URL('./xlsxParser.worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (e: MessageEvent<WorkerResponse>) => {
      worker.terminate();
      if (e.data.ok && e.data.kind === 'export') resolve(e.data.buffer);
      else if (!e.data.ok) reject(new Error(e.data.error));
    };
    worker.onerror = (e: ErrorEvent) => {
      worker.terminate();
      reject(new Error(e.message || 'Błąd Web Workera podczas eksportu'));
    };
    const request: WorkerRequest = { kind: 'export', sheets };
    worker.postMessage(request);
  });

  const safeName = company.name.replace(/[\\/:*?"<>|]/g, '_');
  const blob = new Blob([buffer.slice().buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${safeName} - eksport ${new Date().toISOString().slice(0, 10)}.xlsx`;
  a.click();
  URL.revokeObjectURL(url);
}

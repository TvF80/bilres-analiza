/// <reference lib="webworker" />
// Parsowanie xlsx w osobnym wątku — izoluje ryzyko związane ze znanymi lukami
// biblioteki SheetJS (prototype pollution / ReDoS) od głównego wątku i stanu
// aplikacji. Sam import biblioteki i logika parsowania zostają bez zmian
// (src/lib/xlsxParser.ts) — worker jest cienką powłoką komunikacyjną.
import { importFiles, buildExportWorkbook, type FilesMap, type ImportedCompanyData, type ExportSheet } from './xlsxParser';

export type WorkerRequest =
  | { kind: 'import'; files: FilesMap }
  | { kind: 'export'; sheets: ExportSheet[] };

export type WorkerResponse =
  | { ok: true; kind: 'import'; data: ImportedCompanyData }
  | { ok: true; kind: 'export'; buffer: Uint8Array }
  | { ok: false; error: string };

self.onmessage = async (e: MessageEvent<WorkerRequest>) => {
  try {
    if (e.data.kind === 'export') {
      const buffer = buildExportWorkbook(e.data.sheets);
      const response: WorkerResponse = { ok: true, kind: 'export', buffer };
      self.postMessage(response, [buffer.buffer]);
      return;
    }
    const data = await importFiles(e.data.files);
    const response: WorkerResponse = { ok: true, kind: 'import', data };
    self.postMessage(response);
  } catch (err) {
    const response: WorkerResponse = { ok: false, error: (err as Error).message ?? 'Błąd przetwarzania pliku' };
    self.postMessage(response);
  }
};

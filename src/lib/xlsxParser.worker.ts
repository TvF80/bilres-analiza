/// <reference lib="webworker" />
// Parsowanie xlsx w osobnym wątku — izoluje ryzyko związane ze znanymi lukami
// biblioteki SheetJS (prototype pollution / ReDoS) od głównego wątku i stanu
// aplikacji. Sam import biblioteki i logika parsowania zostają bez zmian
// (src/lib/xlsxParser.ts) — worker jest cienką powłoką komunikacyjną.
import { importFiles, type FilesMap, type ImportedCompanyData } from './xlsxParser';

export interface WorkerRequest {
  files: FilesMap;
}

export type WorkerResponse =
  | { ok: true; data: ImportedCompanyData }
  | { ok: false; error: string };

self.onmessage = async (e: MessageEvent<WorkerRequest>) => {
  try {
    const data = await importFiles(e.data.files);
    const response: WorkerResponse = { ok: true, data };
    self.postMessage(response);
  } catch (err) {
    const response: WorkerResponse = { ok: false, error: (err as Error).message ?? 'Błąd parsowania pliku' };
    self.postMessage(response);
  }
};

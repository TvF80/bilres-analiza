import type { FilesMap, ImportedCompanyData } from './xlsxParser';
import type { WorkerRequest, WorkerResponse } from './xlsxParser.worker';

/** Parsuje pliki Excel w Web Workerze zamiast na głównym wątku (R4 — izolacja
 *  skutków znanych luk w SheetJS: crash/zawieszenie/prototype pollution nie
 *  dotyka głównego wątku ani stanu React). */
export function importFilesInWorker(files: FilesMap): Promise<ImportedCompanyData> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./xlsxParser.worker.ts', import.meta.url), { type: 'module' });

    worker.onmessage = (e: MessageEvent<WorkerResponse>) => {
      worker.terminate();
      if (e.data.ok && e.data.kind === 'import') resolve(e.data.data);
      else if (!e.data.ok) reject(new Error(e.data.error));
    };

    worker.onerror = (e: ErrorEvent) => {
      worker.terminate();
      reject(new Error(e.message || 'Błąd Web Workera podczas importu'));
    };

    const request: WorkerRequest = { kind: 'import', files };
    worker.postMessage(request);
  });
}

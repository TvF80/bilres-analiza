import { useState, useCallback } from 'react';
import { useCompanies } from '../store/CompaniesContext';
import { importFiles, detectRole, type FilesMap, type FileRole } from '../lib/xlsxParser';

interface ImportModalProps {
  onClose: () => void;
  /** Gdy podany — tryb podmiany danych istniejącej firmy */
  replaceCompanyId?: string;
  replaceCompanyName?: string;
}

const ROLE_LABELS: Record<FileRole, string> = {
  bilansSchema: 'Bilans — schemat (formuły)',
  bilansData:   'Bilans — dane (wartości)',
  rzisSchema:   'RZiS — schemat (formuły)',
  rzisData:     'RZiS — dane (wartości)',
  obroty:       'Obroty i salda kont',
  zapisy:       'Zapisy księgowe',
};

const ROLE_ICONS: Record<FileRole, string> = {
  bilansSchema: '📋', bilansData: '📊',
  rzisSchema: '📋', rzisData: '📊',
  obroty: '🔢', zapisy: '📝',
};

export default function ImportModal({ onClose, replaceCompanyId, replaceCompanyName }: ImportModalProps) {
  const { addCompany, replaceCompanyData } = useCompanies();
  const isReplaceMode = !!replaceCompanyId;
  const [companyName, setCompanyName] = useState(isReplaceMode ? (replaceCompanyName ?? '') : '');
  const [filesMap, setFilesMap] = useState<Partial<Record<FileRole, File>>>({});
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [step, setStep] = useState<'form' | 'done'>('form');
  const [importedName, setImportedName] = useState('');

  const assignFile = useCallback((file: File) => {
    const role = detectRole(file.name);
    if (role) {
      setFilesMap(prev => ({ ...prev, [role]: file }));
    }
    return role;
  }, []);

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const files = Array.from(e.dataTransfer.files);
    let unrecognized = 0;
    files.forEach(f => { if (!assignFile(f)) unrecognized++; });
    if (unrecognized > 0) setError(`${unrecognized} plik(ów) nie rozpoznano. Sprawdź nazwy.`);
  }

  function handleFileInput(role: FileRole, file: File | null) {
    if (!file) return;
    setFilesMap(prev => ({ ...prev, [role]: file }));
  }

  const assignedCount = Object.keys(filesMap).length;
  const canImport = (isReplaceMode || companyName.trim()) && (filesMap.bilansSchema || filesMap.bilansData) && assignedCount >= 2;

  async function handleImport() {
    setError('');
    setLoading(true);
    try {
      const data = await importFiles(filesMap as FilesMap);
      if (isReplaceMode && replaceCompanyId) {
        replaceCompanyData(replaceCompanyId, data);
        setImportedName(replaceCompanyName ?? '');
      } else {
        const name = companyName.trim();
        addCompany({ name, period: data.period, bilans: data.bilans, rzis: data.rzis, obroty: data.obroty, zapisy: data.zapisy });
        setImportedName(name);
      }
      setStep('done');
    } catch (e) {
      setError(`Błąd importu: ${(e as Error).message}`);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className={`flex items-center justify-between px-6 py-4 border-b border-slate-100 ${isReplaceMode ? 'bg-amber-50' : ''}`}>
          <div>
            <h2 className="text-base font-semibold text-slate-800">
              {step === 'done'
                ? (isReplaceMode ? 'Dane podmienione' : 'Import zakończony')
                : (isReplaceMode ? 'Podmień dane firmy' : 'Import danych firmy')}
            </h2>
            {isReplaceMode && step === 'form' && (
              <p className="text-xs text-amber-700 mt-0.5">
                Istniejące dane <strong>{replaceCompanyName}</strong> zostaną zastąpione nowymi plikami.
              </p>
            )}
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-xl leading-none">×</button>
        </div>

        {step === 'done' ? (
          <DoneScreen name={importedName} onClose={onClose} isReplace={isReplaceMode} />
        ) : (
          <div className="flex-1 overflow-y-auto px-6 py-4 space-y-5">
            {/* Company name */}
            {isReplaceMode ? (
              <div className="flex items-center gap-3 bg-slate-50 rounded-lg px-3 py-2.5 border border-slate-200">
                <span className="text-slate-400 text-sm">Firma:</span>
                <span className="text-sm font-semibold text-slate-800">{replaceCompanyName}</span>
                <span className="ml-auto text-xs bg-amber-100 text-amber-700 font-medium px-2 py-0.5 rounded-full">podmiana danych</span>
              </div>
            ) : (
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Nazwa firmy</label>
                <input
                  type="text"
                  value={companyName}
                  onChange={e => setCompanyName(e.target.value)}
                  placeholder="np. ABC Sp. z o.o."
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                />
              </div>
            )}

            {/* Drag & drop zone */}
            <div
              onDrop={handleDrop}
              onDragOver={e => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              className={`border-2 border-dashed rounded-xl p-5 text-center transition-colors ${
                dragOver ? 'border-blue-400 bg-blue-50' : 'border-slate-200 bg-slate-50 hover:border-slate-300'
              }`}
            >
              <div className="text-2xl mb-2">📂</div>
              <p className="text-sm font-medium text-slate-600">Przeciągnij pliki xlsx tutaj</p>
              <p className="text-xs text-slate-400 mt-1">Auto-wykrycie po nazwie pliku (BIL, RZIS, OBROTY, ZAPISY, SCHEMAT)</p>
              {assignedCount > 0 && (
                <p className="text-xs text-green-600 mt-2 font-medium">✓ Rozpoznano {assignedCount} plik(ów)</p>
              )}
            </div>

            {/* Manual file pickers */}
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">lub wybierz ręcznie</p>
              <div className="space-y-2">
                {(Object.keys(ROLE_LABELS) as FileRole[]).map(role => (
                  <FileRow
                    key={role}
                    role={role}
                    label={ROLE_LABELS[role]}
                    icon={ROLE_ICONS[role]}
                    file={filesMap[role] ?? null}
                    onChange={f => handleFileInput(role, f)}
                  />
                ))}
              </div>
            </div>

            {error && (
              <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-sm text-red-700">{error}</div>
            )}

            {/* Info */}
            <div className="bg-slate-50 rounded-lg px-3 py-2 text-xs text-slate-500">
              Wymagane minimum: schemat + dane bilansu <strong>lub</strong> schematu RZiS. Pozostałe pliki opcjonalne.
            </div>
          </div>
        )}

        {step === 'form' && (
          <div className="px-6 py-4 border-t border-slate-100 flex gap-3">
            <button onClick={onClose} className="flex-1 py-2 rounded-lg border border-slate-200 text-sm text-slate-600 hover:bg-slate-50 transition-colors">
              Anuluj
            </button>
            <button
              onClick={handleImport}
              disabled={!canImport || loading}
              className={`flex-1 py-2 rounded-lg disabled:opacity-40 text-white font-semibold text-sm transition-colors shadow-sm ${
                isReplaceMode ? 'bg-amber-600 hover:bg-amber-700' : 'bg-blue-600 hover:bg-blue-700'
              }`}
            >
              {loading ? 'Importowanie…' : isReplaceMode ? 'Podmień dane' : 'Importuj'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function FileRow({ label, icon, file, onChange }: {
  role?: FileRole;
  label: string;
  icon: string;
  file: File | null;
  onChange: (f: File | null) => void;
}) {
  return (
    <label className={`flex items-center gap-3 px-3 py-2 rounded-lg border cursor-pointer transition-colors ${
      file ? 'border-green-200 bg-green-50' : 'border-slate-200 bg-white hover:bg-slate-50'
    }`}>
      <span className="text-base shrink-0">{icon}</span>
      <div className="flex-1 min-w-0">
        <div className="text-xs font-medium text-slate-700">{label}</div>
        {file && <div className="text-[10px] text-green-600 truncate mt-0.5">✓ {file.name}</div>}
      </div>
      <input
        type="file"
        accept=".xlsx"
        className="hidden"
        onChange={e => onChange(e.target.files?.[0] ?? null)}
      />
      <span className="text-xs text-slate-400 shrink-0">{file ? '✓' : 'Wybierz'}</span>
    </label>
  );
}

function DoneScreen({ name, onClose, isReplace }: { name: string; onClose: () => void; isReplace?: boolean }) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
      <div className="text-4xl mb-4">{isReplace ? '🔄' : '✅'}</div>
      <h3 className="text-lg font-semibold text-slate-800 mb-2">
        {isReplace ? 'Dane podmienione!' : 'Import zakończony!'}
      </h3>
      <p className="text-sm text-slate-500 mb-6">
        {isReplace
          ? <>Dane firmy <strong>{name}</strong> zostały zastąpione nowymi plikami.</>
          : <>Firma <strong>{name}</strong> została dodana do biblioteki i jest teraz aktywna.</>
        }
      </p>
      <button
        onClick={onClose}
        className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg text-sm transition-colors"
      >
        Przejdź do analizy
      </button>
    </div>
  );
}

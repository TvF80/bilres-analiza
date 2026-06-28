import { useState, useCallback, lazy, Suspense, Component } from 'react';
import type { ReactNode } from 'react';
import type { ReportType, ViewType, ReportRow } from './types';
import type { Lang } from './i18n';

class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { error: null };
  }
  static getDerivedStateFromError(e: Error) { return { error: e }; }
  render() {
    if (this.state.error) {
      return (
        <div className="flex-1 flex flex-col items-center justify-center gap-2 text-slate-500 p-8 text-center">
          <span className="text-2xl">⚠️</span>
          <p className="text-sm font-medium">Błąd ładowania modułu</p>
          <p className="text-xs text-slate-400 font-mono break-all max-w-md">{this.state.error.message}</p>
          <button
            className="mt-2 text-xs text-blue-500 underline"
            onClick={() => { this.setState({ error: null }); window.location.reload(); }}
          >Odśwież stronę</button>
        </div>
      );
    }
    return this.props.children;
  }
}
import { LanguageProvider } from './i18n/LanguageContext';
import { useReportData } from './hooks/useReportData';
import { useCompanies } from './store/CompaniesContext';
import { useAuth } from './store/AuthContext';
import LoginScreen from './components/LoginScreen';
import Sidebar from './components/Sidebar';
import Header from './components/Header';
import ReportTable from './components/ReportTable';
import DrilldownPanel from './components/DrilldownPanel';
import ImportModal from './components/ImportModal';
import EmptyState from './components/EmptyState';
import ControlSheet from './components/ControlSheet';
const RatioAnalysis = lazy(() => import('./components/RatioAnalysis'));
const RaportMiesieczny = lazy(() => import('./components/RaportMiesieczny'));
const RaportGrupy = lazy(() => import('./components/RaportGrupy'));

const ZOOM_LEVELS = [0.75, 0.875, 1, 1.125, 1.25, 1.5];

export default function App() {
  const { currentUser } = useAuth();
  if (!currentUser) return <LoginScreen />;
  return <MainApp />;
}

function MainApp() {
  const [activeView, setActiveView] = useState<ViewType>('bilans');
  const [reportType, setReportType] = useState<ReportType>('bilans');
  const [search, setSearch] = useState('');
  const [selectedRow, setSelectedRow] = useState<ReportRow | null>(null);
  const [showImport, setShowImport] = useState(false);
  const [replaceTarget, setReplaceTarget] = useState<{ id: string; name: string } | null>(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [zoomIdx, setZoomIdx] = useState(2); // default: 1.0
  const [lang, setLang] = useState<Lang>('pl');

  // ── Wszystkie hooki muszą być przed jakimkolwiek return ──
  const zoom = ZOOM_LEVELS[zoomIdx];
  const rows = useReportData(reportType);
  const { activeCompany, companies } = useCompanies();

  const handleRowClick = useCallback((row: ReportRow) => {
    setSelectedRow(prev => prev === row ? null : row);
  }, []);

  const handleViewChange = useCallback((v: ViewType) => {
    setActiveView(v);
    if (v !== 'kontrola' && v !== 'analiza' && v !== 'raport_miesieczny') {
      setReportType(v as ReportType);
      setSelectedRow(null);
      setSearch('');
    }
  }, []);

  const handleReportChange = useCallback((t: ReportType) => {
    setReportType(t);
    setSelectedRow(null);
    setSearch('');
  }, []);

  const zoomIn  = useCallback(() => setZoomIdx(i => Math.min(i + 1, ZOOM_LEVELS.length - 1)), []);
  const zoomOut = useCallback(() => setZoomIdx(i => Math.max(i - 1, 0)), []);
  const zoomReset = useCallback(() => setZoomIdx(2), []);

  return (
    <LanguageProvider lang={lang}>
      {companies.length === 0 ? (
        /* ── Ekran powitalny ── */
        <WelcomeScreen onImport={() => setShowImport(true)} lang={lang} onLangChange={setLang} />
      ) : (
        /* ── Główna aplikacja ── */
        <div className="flex h-screen bg-slate-100 overflow-hidden">
          {mobileSidebarOpen && (
            <div className="fixed inset-0 bg-black/50 z-30 md:hidden" onClick={() => setMobileSidebarOpen(false)} />
          )}

          <div className={`print:hidden fixed md:relative inset-y-0 left-0 z-40 md:z-auto transition-transform duration-200 ease-in-out ${mobileSidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}`}>
            <Sidebar
              collapsed={sidebarCollapsed}
              onToggle={() => setSidebarCollapsed(c => !c)}
              onImport={() => { setShowImport(true); setMobileSidebarOpen(false); }}
              onReplaceData={(id, name) => { setReplaceTarget({ id, name }); setMobileSidebarOpen(false); }}
              onMobileClose={() => setMobileSidebarOpen(false)}
            />
          </div>

          <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
            <Header
              activeView={activeView}
              onViewChange={handleViewChange}
              reportType={reportType}
              onReportChange={handleReportChange}
              search={search}
              onSearchChange={setSearch}
              onMobileMenu={() => setMobileSidebarOpen(true)}
              zoom={zoom}
              zoomIdx={zoomIdx}
              zoomLevels={ZOOM_LEVELS}
              onZoomIn={zoomIn}
              onZoomOut={zoomOut}
              onZoomReset={zoomReset}
              lang={lang}
              onLangChange={setLang}
            />

            <div className="flex flex-1 overflow-hidden">
              {activeView === 'kontrola' ? (
                <ControlSheet />
              ) : activeView === 'analiza' ? (
                <ErrorBoundary>
                  <Suspense fallback={<div className="flex-1 flex items-center justify-center text-slate-400 text-sm">…</div>}>
                    <RatioAnalysis />
                  </Suspense>
                </ErrorBoundary>
              ) : activeView === 'raport_miesieczny' ? (
                <ErrorBoundary>
                  <Suspense fallback={<div className="flex-1 flex items-center justify-center text-slate-400 text-sm">…</div>}>
                    <RaportMiesieczny />
                  </Suspense>
                </ErrorBoundary>
              ) : activeView === 'raport_grupy' ? (
                <ErrorBoundary>
                  <Suspense fallback={<div className="flex-1 flex items-center justify-center text-slate-400 text-sm">…</div>}>
                    <div className="flex-1 flex flex-col min-h-0" style={{zoom}}>
                      <RaportGrupy lang={lang} />
                    </div>
                  </Suspense>
                </ErrorBoundary>
              ) : (
                <>
                  <div className="flex-1 overflow-y-auto flex flex-col">
                    {rows.length === 0 && !search ? (
                      <EmptyState onImport={() => setShowImport(true)} />
                    ) : (
                      <div className="px-2 py-2 sm:px-3 sm:py-3 md:px-4 md:py-4 w-full">
                        <div
                          className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden origin-top"
                          style={{ zoom }}
                        >
                          <ReportTable
                            rows={rows}
                            search={search}
                            selectedRow={selectedRow}
                            onRowClick={handleRowClick}
                            periodLabels={activeCompany?.periodLabels}
                          />
                        </div>
                      </div>
                    )}
                  </div>

                  {selectedRow && (
                    <>
                      <div className="hidden md:flex w-[600px] lg:w-[700px] xl:w-[820px] shrink-0 border-l border-slate-200 bg-white overflow-hidden flex-col shadow-xl" style={{ zoom }}>
                        <DrilldownPanel key={selectedRow.positionId ?? selectedRow.name} row={selectedRow} onClose={() => setSelectedRow(null)} />
                      </div>
                      <div className="md:hidden fixed inset-0 z-50 bg-white flex flex-col">
                        <DrilldownPanel key={selectedRow.positionId ?? selectedRow.name} row={selectedRow} onClose={() => setSelectedRow(null)} />
                      </div>
                    </>
                  )}
                </>
              )}
            </div>
          </div>

          {replaceTarget && (
            <ImportModal
              onClose={() => setReplaceTarget(null)}
              replaceCompanyId={replaceTarget.id}
              replaceCompanyName={replaceTarget.name}
            />
          )}
        </div>
      )}

      {/* ImportModal poza blokiem warunkowym — ta sama instancja React podczas przejścia welcome→app */}
      {showImport && <ImportModal onClose={() => setShowImport(false)} />}
    </LanguageProvider>
  );
}

function WelcomeScreen({ onImport, lang, onLangChange }: { onImport: () => void; lang: Lang; onLangChange: (l: Lang) => void }) {
  const LANGS: { code: Lang; flag: string; label: string }[] = [
    { code: 'pl', flag: '🇵🇱', label: 'PL' },
    { code: 'fr', flag: '🇫🇷', label: 'FR' },
    { code: 'en', flag: '🇬🇧', label: 'EN' },
  ];
  const copy = {
    pl: { title: 'Analiza sprawozdań finansowych', sub: 'Wgraj pliki Excel swojej firmy, aby rozpocząć analizę bilansu, RZiS i wskaźników finansowych.', btn: 'Dodaj firmę — wgraj dane', note: 'Dane przechowywane wyłącznie lokalnie w Twojej przeglądarce. Żadne informacje finansowe nie są wysyłane na serwer.', files: 'Akceptowane pliki Excel' },
    fr: { title: 'Analyse des états financiers', sub: 'Importez vos fichiers Excel pour analyser le bilan, le CdR et les indicateurs financiers.', btn: 'Ajouter une entreprise', note: 'Les données sont stockées uniquement localement dans votre navigateur. Aucune information financière n\'est envoyée au serveur.', files: 'Fichiers Excel acceptés' },
    en: { title: 'Financial Statement Analysis', sub: 'Upload your Excel files to start analysing the balance sheet, P&L and financial ratios.', btn: 'Add company — upload data', note: 'Data is stored locally in your browser only. No financial information is sent to any server.', files: 'Accepted Excel files' },
  };
  const c = copy[lang];
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex flex-col items-center justify-center p-6">
      {/* Lang switcher */}
      <div className="absolute top-4 right-4 flex gap-1">
        {LANGS.map(l => (
          <button key={l.code} onClick={() => onLangChange(l.code)}
            className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-all ${lang === l.code ? 'bg-blue-600 text-white' : 'bg-slate-700 text-slate-300 hover:bg-slate-600'}`}>
            {l.flag} {l.label}
          </button>
        ))}
      </div>

      <div className="max-w-md w-full text-center">
        {/* Logo */}
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-blue-600 shadow-lg mb-6">
          <span className="text-3xl">🧮</span>
        </div>

        <h1 className="text-3xl font-black text-white mb-3 tracking-tight">FinScopePL</h1>
        <h2 className="text-lg font-semibold text-slate-300 mb-3">{c.title}</h2>
        <p className="text-sm text-slate-400 mb-8 leading-relaxed">{c.sub}</p>

        <button
          onClick={onImport}
          className="w-full py-4 bg-blue-600 hover:bg-blue-500 active:scale-[0.98] text-white font-bold text-base rounded-2xl transition-all shadow-lg shadow-blue-900/40 mb-6"
        >
          📂 {c.btn}
        </button>

        {/* Accepted files */}
        <div className="bg-slate-800/60 rounded-2xl p-5 text-left mb-6 border border-slate-700/50">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-3">{c.files}</p>
          <div className="space-y-1.5">
            {[
              ['📋', 'BIL schemat.xlsx', '/ BIL 3okresy.xlsx'],
              ['📊', 'RZIS schemat.xlsx', '/ RZIS 3 okresy.xlsx'],
              ['🔢', 'OBROTY aktualne.xlsx', ''],
              ['📝', 'ZAPISY aktualne.xlsx', ''],
              ['📅', 'RAP_MENS aktualny.xlsx', '/ RAP_MENS_COMP …xlsx (opcjonalnie)'],
              ['👥', 'RAP_GP_aktualny.xlsx', '(opcjonalnie)'],
            ].map(([icon, name, hint]) => (
              <div key={name} className="flex items-start gap-2 text-xs">
                <span className="shrink-0 mt-0.5">{icon}</span>
                <span className="font-mono text-slate-300">{name}</span>
                {hint && <span className="text-slate-500 shrink-0">{hint}</span>}
              </div>
            ))}
          </div>
        </div>

        {/* GDPR note */}
        <div className="flex items-start gap-2 bg-slate-800/40 rounded-xl px-4 py-3 border border-slate-700/40 text-left">
          <span className="text-green-400 shrink-0 mt-0.5">🔒</span>
          <p className="text-[11px] text-slate-400 leading-relaxed">{c.note}</p>
        </div>

        {/* Author */}
        <p className="mt-6 text-[10px] text-slate-600 tracking-wide">
          created by <span className="text-slate-500 font-medium">TvF · Tomasz Fordymacki</span>
        </p>
      </div>
    </div>
  );
}

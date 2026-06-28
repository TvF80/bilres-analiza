import { useState, useCallback, lazy, Suspense } from 'react';
import type { ReportType, ViewType, ReportRow } from './types';
import type { Lang } from './i18n';
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

  const zoom = ZOOM_LEVELS[zoomIdx];
  const rows = useReportData(reportType);
  const { activeCompany, companies } = useCompanies();

  // Brak firm — ekran powitalny
  if (companies.length === 0) {
    return (
      <LanguageProvider lang={lang}>
        <WelcomeScreen onImport={() => setShowImport(true)} lang={lang} onLangChange={setLang} />
        {showImport && <ImportModal onClose={() => setShowImport(false)} />}
      </LanguageProvider>
    );
  }

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
    <div className="flex h-screen bg-slate-100 overflow-hidden">
      {/* ── Mobile sidebar overlay ── */}
      {mobileSidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-30 md:hidden"
          onClick={() => setMobileSidebarOpen(false)}
        />
      )}

      {/* ── Sidebar ── */}
      <div className={`
        print:hidden fixed md:relative inset-y-0 left-0 z-40 md:z-auto
        transition-transform duration-200 ease-in-out
        ${mobileSidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}
      `}>
        <Sidebar
          collapsed={sidebarCollapsed}
          onToggle={() => setSidebarCollapsed(c => !c)}
          onImport={() => { setShowImport(true); setMobileSidebarOpen(false); }}
          onReplaceData={(id, name) => { setReplaceTarget({ id, name }); setMobileSidebarOpen(false); }}
          onMobileClose={() => setMobileSidebarOpen(false)}
        />
      </div>

      {/* ── Main content ── */}
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
            <Suspense fallback={<div className="flex-1 flex items-center justify-center text-slate-400 text-sm">…</div>}>
              <RatioAnalysis />
            </Suspense>
          ) : activeView === 'raport_miesieczny' ? (
            <Suspense fallback={<div className="flex-1 flex items-center justify-center text-slate-400 text-sm">…</div>}>
              <RaportMiesieczny />
            </Suspense>
          ) : activeView === 'raport_grupy' ? (
            <Suspense fallback={<div className="flex-1 flex items-center justify-center text-slate-400 text-sm">…</div>}>
              <div className="flex-1 flex flex-col min-h-0" style={{zoom}}>
                <RaportGrupy lang={lang} />
              </div>
            </Suspense>
          ) : (
            <>
              {/* Report table or empty state */}
              <div className="flex-1 overflow-y-auto flex flex-col">
                {rows.length === 0 && !search ? (
                  <EmptyState onImport={() => setShowImport(true)} />
                ) : (
                  <div className="max-w-2xl mx-auto px-3 py-3 md:px-4 md:py-4 w-full">
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

              {/* Drilldown panel — right side on desktop, bottom sheet on mobile */}
              {selectedRow && (
                <>
                  <div className="hidden md:flex w-[720px] xl:w-[820px] shrink-0 border-l border-slate-200 bg-white overflow-hidden flex-col shadow-xl" style={{ zoom }}>
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

      {showImport && <ImportModal onClose={() => setShowImport(false)} />}
      {replaceTarget && (
        <ImportModal
          onClose={() => setReplaceTarget(null)}
          replaceCompanyId={replaceTarget.id}
          replaceCompanyName={replaceTarget.name}
        />
      )}
    </div>
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
          <span className="text-white text-2xl font-black">EX</span>
        </div>

        <h1 className="text-3xl font-black text-white mb-3 tracking-tight">BilRes</h1>
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
              ['📋', 'EX_BIL …schemat.xlsx', '/ EX_BIL …09.25-09.24-09.23.xlsx'],
              ['📊', 'EX_RZIS …schemat.xlsx', '/ EX_RZIS …09.25-09.24-09.23.xlsx'],
              ['🔢', 'EX_OBROTY …xlsx', ''],
              ['📝', 'EX_ZAPISY …xlsx', ''],
              ['📅', 'ex_rap miesieczny …xlsx', '(opcjonalnie)'],
              ['👥', 'B_RAP_GP …xlsx', '(opcjonalnie)'],
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
      </div>
    </div>
  );
}

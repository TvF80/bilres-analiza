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
  const { activeCompany } = useCompanies();

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

import { useState, useRef, useEffect } from 'react';
import type { ReportType, ViewType } from '../types';
import { useCompanies } from '../store/CompaniesContext';
import type { Lang } from '../i18n';
import { LANG_FLAGS } from '../i18n';
import { useLang } from '../i18n/LanguageContext';

interface HeaderProps {
  activeView: ViewType;
  onViewChange: (view: ViewType) => void;
  reportType: ReportType;
  onReportChange: (type: ReportType) => void;
  search: string;
  onSearchChange: (v: string) => void;
  onMobileMenu: () => void;
  zoom: number;
  zoomIdx: number;
  zoomLevels: number[];
  onZoomIn: () => void;
  onZoomOut: () => void;
  onZoomReset: () => void;
  lang: Lang;
  onLangChange: (l: Lang) => void;
}

export default function Header({
  activeView, onViewChange,
  reportType: _reportType, onReportChange, search, onSearchChange,
  onMobileMenu, zoom, zoomIdx, zoomLevels, onZoomIn, onZoomOut, onZoomReset,
  lang, onLangChange,
}: HeaderProps) {
  const { t: tr } = useLang();
  const { activeCompany, updateCompanyName } = useCompanies();
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  function startEdit() {
    setEditValue(activeCompany?.name ?? '');
    setEditing(true);
  }
  function commitEdit() {
    if (editValue.trim() && activeCompany) updateCompanyName(activeCompany.id, editValue.trim());
    setEditing(false);
  }
  useEffect(() => { if (editing) inputRef.current?.focus(); }, [editing]);

  const canZoomOut = zoomIdx > 0;
  const canZoomIn  = zoomIdx < zoomLevels.length - 1;
  const zoomLabel  = zoom === 1 ? '100%' : `${Math.round(zoom * 100)}%`;

  function handlePrint() {
    window.print();
  }

  return (
    <header className="bg-white border-b border-slate-200 sticky top-0 z-20 shadow-sm print:hidden">
      {/* ── Wiersz górny: hamburger + firma + lang + zoom + search + print ── */}
      <div className="px-3 md:px-5 py-2 flex items-center gap-2">
        {/* Mobile hamburger */}
        <button
          onClick={onMobileMenu}
          className="md:hidden p-1.5 rounded-lg text-slate-500 hover:text-slate-700 hover:bg-slate-100 transition-colors shrink-0"
          aria-label="Menu"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>

        {/* Company name */}
        <div className="flex items-center gap-1.5 min-w-0 flex-1">
          {editing ? (
            <input
              ref={inputRef}
              value={editValue}
              onChange={e => setEditValue(e.target.value)}
              onBlur={commitEdit}
              onKeyDown={e => { if (e.key === 'Enter') commitEdit(); if (e.key === 'Escape') setEditing(false); }}
              className="text-sm font-semibold text-slate-800 border-b-2 border-blue-500 bg-transparent outline-none px-0.5 w-36"
            />
          ) : (
            <button
              onClick={startEdit}
              title={tr('header.editName')}
              className="text-sm font-semibold text-slate-800 hover:text-blue-600 transition-colors flex items-center gap-1 group min-w-0"
            >
              <span className="truncate max-w-[100px] sm:max-w-[150px] md:max-w-[200px]">{activeCompany?.name ?? '—'}</span>
              <span className="text-slate-300 group-hover:text-blue-400 text-xs shrink-0">✎</span>
            </button>
          )}
          {activeCompany && (
            <span className="hidden sm:inline text-xs text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full whitespace-nowrap shrink-0">
              {activeCompany.period}
            </span>
          )}
        </div>

        {/* Language switcher */}
        <div className="flex items-center gap-0.5 bg-slate-100 rounded-lg p-0.5 shrink-0">
          {(['pl','fr','en'] as const).map(l=>(
            <button key={l} onClick={()=>onLangChange(l)} title={l==='pl'?'Polski':l==='fr'?'Français':'English'}
              className={`h-7 px-1.5 sm:px-2 flex items-center gap-1 rounded-md text-xs font-semibold transition-all ${lang===l?'bg-white shadow-sm text-slate-800':'text-slate-500 hover:text-slate-700'}`}>
              <span>{LANG_FLAGS[l]}</span>
              <span className="hidden sm:inline">{l.toUpperCase()}</span>
            </button>
          ))}
        </div>

        {/* Zoom controls — ukryte na mobile */}
        <div className="hidden sm:flex items-center gap-0.5 bg-slate-100 rounded-lg p-0.5 shrink-0">
          <button onClick={onZoomOut} disabled={!canZoomOut} title={tr('header.zoomOut')}
            className="w-7 h-7 flex items-center justify-center rounded-md text-slate-600 hover:bg-white hover:shadow-sm disabled:opacity-30 disabled:cursor-not-allowed transition-all text-base font-bold">−</button>
          <button onClick={onZoomReset} title={tr('header.zoomReset')}
            className={`h-7 px-2 flex items-center justify-center rounded-md text-xs font-mono transition-all ${zoom === 1 ? 'text-slate-400' : 'text-blue-600 font-semibold hover:bg-white hover:shadow-sm'}`}>
            {zoomLabel}
          </button>
          <button onClick={onZoomIn} disabled={!canZoomIn} title={tr('header.zoomIn')}
            className="w-7 h-7 flex items-center justify-center rounded-md text-slate-600 hover:bg-white hover:shadow-sm disabled:opacity-30 disabled:cursor-not-allowed transition-all text-base font-bold">+</button>
        </div>

        {/* Search */}
        <input
          type="search"
          value={search}
          onChange={e => onSearchChange(e.target.value)}
          placeholder={tr('header.search')}
          className="w-28 sm:w-36 md:w-48 px-2.5 py-1.5 text-sm rounded-lg border border-slate-200 bg-slate-50 focus:outline-none focus:border-blue-400 focus:bg-white transition-colors shrink-0"
        />

        {/* Print — ukryty na mobile */}
        <button onClick={handlePrint} title={tr('header.print')}
          className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-medium transition-colors shrink-0">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
          </svg>
          <span className="hidden md:inline">PDF</span>
        </button>
      </div>

      {/* ── Wiersz dolny: zakładki widoków (scrollowalne na mobile) ── */}
      <div className="border-t border-slate-100 overflow-x-auto">
        <div className="flex items-center gap-1 px-3 md:px-5 py-1.5 min-w-max">
          {(['bilans', 'rzis'] as ReportType[]).map(tab => (
            <button
              key={tab}
              onClick={() => { onViewChange(tab); onReportChange(tab); }}
              className={`px-3 py-1 rounded-full text-xs sm:text-sm font-medium transition-all duration-100 whitespace-nowrap ${
                activeView === tab
                  ? 'bg-blue-600 text-white shadow-[0_4px_0_0_rgba(0,0,0,0.2)] translate-y-0 hover:translate-y-0.5 hover:shadow-[0_2px_0_0_rgba(0,0,0,0.2)]'
                  : 'text-slate-600 hover:bg-slate-100 shadow-[0_2px_0_0_#e2e8f0] hover:translate-y-0.5 hover:shadow-[0_1px_0_0_#e2e8f0]'
              }`}
            >
              {tab === 'bilans' ? tr('tab.bilans') : tr('tab.rzis')}
            </button>
          ))}
          <div className="w-px h-4 bg-slate-200 mx-0.5 shrink-0" />
          {([
            ['kontrola',        'tab.kontrola',    'bg-violet-600'],
            ['analiza',         'tab.analiza',     'bg-emerald-600'],
            ['raport_miesieczny','tab.raportMies', 'bg-amber-600'],
            ['raport_grupy',    'tab.grupyPracy',  'bg-orange-600'],
            ['raport_ogolny',   'tab.raportOgolny','bg-rose-600'],
          ] as [ViewType, string, string][]).map(([view, key, activeBg]) => (
            <button
              key={view}
              onClick={() => onViewChange(view)}
              className={`px-3 py-1 rounded-full text-xs sm:text-sm font-medium transition-all duration-100 whitespace-nowrap ${
                activeView === view
                  ? `${activeBg} text-white shadow-[0_4px_0_0_rgba(0,0,0,0.2)] translate-y-0 hover:translate-y-0.5 hover:shadow-[0_2px_0_0_rgba(0,0,0,0.2)]`
                  : 'text-slate-600 hover:bg-slate-100 shadow-[0_2px_0_0_#e2e8f0] hover:translate-y-0.5 hover:shadow-[0_1px_0_0_#e2e8f0]'
              }`}
            >
              {tr(key)}
            </button>
          ))}
        </div>
      </div>
    </header>
  );
}

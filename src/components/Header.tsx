import { useState, useRef, useEffect } from 'react';
import type { ReportType, ViewType } from '../types';
import { useCompanies } from '../store/CompaniesContext';

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
}

export default function Header({
  activeView, onViewChange,
  reportType: _reportType, onReportChange, search, onSearchChange,
  onMobileMenu, zoom, zoomIdx, zoomLevels, onZoomIn, onZoomOut, onZoomReset,
}: HeaderProps) {
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
    <header className="bg-white border-b border-slate-200 px-3 md:px-5 py-2 flex items-center gap-2 md:gap-3 sticky top-0 z-20 shadow-sm flex-wrap md:flex-nowrap print:hidden">
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

      {/* Company name — editable */}
      <div className="flex items-center gap-1.5 min-w-0 flex-1 md:flex-none">
        {editing ? (
          <input
            ref={inputRef}
            value={editValue}
            onChange={e => setEditValue(e.target.value)}
            onBlur={commitEdit}
            onKeyDown={e => { if (e.key === 'Enter') commitEdit(); if (e.key === 'Escape') setEditing(false); }}
            className="text-sm font-semibold text-slate-800 border-b-2 border-blue-500 bg-transparent outline-none px-0.5 w-40"
          />
        ) : (
          <button
            onClick={startEdit}
            title="Kliknij aby edytować nazwę"
            className="text-sm font-semibold text-slate-800 hover:text-blue-600 transition-colors flex items-center gap-1 group min-w-0"
          >
            <span className="truncate max-w-[120px] md:max-w-[180px]">{activeCompany?.name ?? '—'}</span>
            <span className="text-slate-300 group-hover:text-blue-400 text-xs shrink-0">✎</span>
          </button>
        )}
        {activeCompany && (
          <span className="hidden sm:inline text-xs text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full whitespace-nowrap shrink-0">
            {activeCompany.period}
          </span>
        )}
      </div>

      {/* View toggle */}
      <div className="flex items-center gap-1 shrink-0">
        {(['bilans', 'rzis'] as ReportType[]).map(t => (
          <button
            key={t}
            onClick={() => { onViewChange(t); onReportChange(t); }}
            className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
              activeView === t ? 'bg-blue-600 text-white shadow-sm' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            {t === 'bilans' ? 'Bilans' : 'RZiS'}
          </button>
        ))}
        <div className="w-px h-5 bg-slate-200 mx-0.5" />
        <button
          onClick={() => onViewChange('kontrola')}
          className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
            activeView === 'kontrola' ? 'bg-violet-600 text-white shadow-sm' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
          }`}
        >
          Kontrola
        </button>
        <button
          onClick={() => onViewChange('analiza')}
          className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
            activeView === 'analiza' ? 'bg-emerald-600 text-white shadow-sm' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
          }`}
        >
          Analiza
        </button>
      </div>

      <div className="flex-1 hidden md:block" />

      {/* Zoom controls */}
      <div className="flex items-center gap-0.5 bg-slate-100 rounded-lg p-0.5 shrink-0">
        <button
          onClick={onZoomOut}
          disabled={!canZoomOut}
          title="Pomniejsz"
          className="w-7 h-7 flex items-center justify-center rounded-md text-slate-600 hover:bg-white hover:shadow-sm disabled:opacity-30 disabled:cursor-not-allowed transition-all text-base font-bold"
        >−</button>
        <button
          onClick={onZoomReset}
          title="Resetuj zoom (100%)"
          className={`h-7 px-2 flex items-center justify-center rounded-md text-xs font-mono transition-all ${
            zoom === 1 ? 'text-slate-400' : 'text-blue-600 font-semibold hover:bg-white hover:shadow-sm'
          }`}
        >
          {zoomLabel}
        </button>
        <button
          onClick={onZoomIn}
          disabled={!canZoomIn}
          title="Powiększ"
          className="w-7 h-7 flex items-center justify-center rounded-md text-slate-600 hover:bg-white hover:shadow-sm disabled:opacity-30 disabled:cursor-not-allowed transition-all text-base font-bold"
        >+</button>
      </div>

      {/* Search */}
      <input
        type="search"
        value={search}
        onChange={e => onSearchChange(e.target.value)}
        placeholder="Szukaj…"
        className="w-36 md:w-52 px-3 py-1.5 text-sm rounded-lg border border-slate-200 bg-slate-50 focus:outline-none focus:border-blue-400 focus:bg-white transition-colors shrink-0"
      />

      {/* Print to PDF */}
      <button
        onClick={handlePrint}
        title="Drukuj / Zapisz jako PDF"
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-medium transition-colors shrink-0"
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
        </svg>
        <span className="hidden sm:inline">PDF</span>
      </button>
    </header>
  );
}

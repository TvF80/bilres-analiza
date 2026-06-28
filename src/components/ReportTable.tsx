import type { ReportRow } from '../types';
import { formatPLN } from '../hooks/useFormatNumber';
import { useLang } from '../i18n/LanguageContext';
import { ROW_TR } from '../i18n';

interface ReportTableProps {
  rows: ReportRow[];
  search: string;
  selectedRow: ReportRow | null;
  onRowClick: (row: ReportRow) => void;
  periodLabels?: string[];
}

const INDENT_PX = ['pl-2', 'pl-2', 'pl-5', 'pl-8', 'pl-12'];

export default function ReportTable({ rows, search, selectedRow, onRowClick, periodLabels }: ReportTableProps) {
  const { t, lang } = useLang();
  const filtered = search.trim()
    ? rows.filter(r => r.name.toLowerCase().includes(search.toLowerCase()))
    : rows;

  const hasPeriod2 = rows.some(r => r.values.period2 !== 0);
  const hasPeriod3 = rows.some(r => r.values.period3 !== undefined && r.values.period3 !== 0);

  const label1 = periodLabels?.[0] ?? t('table.period1');
  const label2 = periodLabels?.[1] ?? t('table.period2');
  const label3 = periodLabels?.[2] ?? t('table.period3');

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr className="bg-slate-50 border-b-2 border-slate-200">
            <th className="text-left py-2.5 px-2 sm:px-3 font-semibold text-slate-500 text-xs uppercase tracking-wide w-8 sm:w-12 hidden sm:table-cell">{t('chart.seg')}</th>
            <th className="text-left py-2.5 px-2 sm:px-3 font-semibold text-slate-500 text-xs uppercase tracking-wide">{t('chart.position')}</th>
            <th className="text-right py-2.5 px-2 sm:px-4 font-semibold text-blue-600 text-xs whitespace-nowrap w-24 sm:w-32">{label1}</th>
            {hasPeriod2 && <th className="text-right py-2.5 px-2 sm:px-4 font-semibold text-slate-400 text-xs whitespace-nowrap w-24 sm:w-32 hidden sm:table-cell">{label2}</th>}
            {hasPeriod3 && <th className="text-right py-2.5 px-2 sm:px-4 font-semibold text-slate-300 text-xs whitespace-nowrap w-24 sm:w-32 hidden md:table-cell">{label3}</th>}
            <th className="w-5" />
          </tr>
        </thead>
        <tbody>
          {filtered.map((row, idx) => (
            <Row
              key={idx}
              row={row}
              lang={lang}
              isSelected={selectedRow === row}
              onClick={() => onRowClick(row)}
              hasPeriod2={hasPeriod2}
              hasPeriod3={hasPeriod3}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Row({ row, lang, isSelected, onClick, hasPeriod2, hasPeriod3 }: {
  row: ReportRow;
  lang: string;
  isSelected: boolean;
  onClick: () => void;
  hasPeriod2: boolean;
  hasPeriod3: boolean;
}) {
  const isSection = row.level === 0 && row.segment !== '-';
  const hasDetail = !!row.definition || row.drilldownAccounts.length > 0;
  const indent = INDENT_PX[Math.min(row.level, INDENT_PX.length - 1)];
  const v1 = row.values.period1;
  const v2 = row.values.period2;
  const v3 = row.values.period3;

  // delta P1/P2 — główne porównanie (nowy vs stary)
  const delta12 = (v1 !== 0 && v2 !== 0) ? ((v1 / v2) - 1) * 100 : null;
  const delta12Str = delta12 !== null ? `${delta12 > 0 ? '+' : ''}${delta12.toFixed(0)}%` : null;
  const delta12Color = delta12 === null ? '' : delta12 > 5 ? 'text-emerald-500' : delta12 < -5 ? 'text-red-500' : 'text-slate-400';

  // delta P2/P3 — dodatkowe porównanie starszych danych (mniej wyraziste)
  const delta23 = (v2 !== 0 && v3 !== undefined && v3 !== 0) ? ((v2 / v3) - 1) * 100 : null;
  const delta23Str = delta23 !== null ? `${delta23 > 0 ? '+' : ''}${delta23.toFixed(0)}%` : null;
  const delta23Color = delta23 === null ? '' : delta23 > 5 ? 'text-emerald-400' : delta23 < -5 ? 'text-red-400' : 'text-slate-300';

  const isZeroRow = !isSection && v1 === 0 && (v2 === 0 || v2 === undefined) && (!hasPeriod3 || (v3 ?? 0) === 0);

  const rowBg = isSelected
    ? 'bg-blue-50 border-l-2 border-l-blue-500'
    : isSection
    ? 'bg-slate-50/80'
    : 'hover:bg-slate-50/60';

  const nameClass = [
    indent,
    isSection ? 'font-bold text-slate-800 text-sm' : row.level === 1 ? 'font-semibold text-slate-700' : 'text-slate-600',
  ].join(' ');

  const rowName = lang !== 'pl' ? (ROW_TR[row.name]?.[lang as 'fr' | 'en'] ?? row.name) : row.name;

  if (isZeroRow) {
    return (
      <tr className="border-b border-slate-100 opacity-45 select-none">
        <td className="py-1.5 px-2 sm:px-3 text-xs text-slate-300 font-mono hidden sm:table-cell">{row.segment}</td>
        <td className={`py-1.5 px-2 sm:px-3 text-xs text-slate-400 ${indent}`}>{rowName}</td>
        <td className="py-1.5 px-2 sm:px-4 text-right text-xs text-slate-300 font-mono tabular-nums">—</td>
        {hasPeriod2 && <td className="py-1.5 px-2 sm:px-4 text-right text-xs text-slate-300 font-mono tabular-nums hidden sm:table-cell">—</td>}
        {hasPeriod3 && <td className="py-1.5 px-2 sm:px-4 text-right text-xs text-slate-300 font-mono tabular-nums hidden md:table-cell">—</td>}
        <td />
      </tr>
    );
  }

  return (
    <tr
      className={`border-b border-slate-100 transition-colors ${rowBg} ${hasDetail && !isSection ? 'cursor-pointer' : ''}`}
      onClick={hasDetail && !isSection ? onClick : undefined}
    >
      <td className="py-2 px-2 sm:px-3 text-slate-400 text-xs font-mono hidden sm:table-cell">{row.segment}</td>

      {/* Nazwa — zawijanie tekstu zamiast obcinania */}
      <td className={`py-2 px-2 sm:px-3 max-w-0 ${nameClass}`}>
        <span className="block leading-tight">{rowName}</span>
        {hasDetail && !isSection && (
          <span className="text-blue-400 opacity-50 text-xs">↗</span>
        )}
      </td>

      {/* P1 kolumna:
          - Desktop: P1 wartość + delta12% poniżej (pod nową wartością)
          - Mobile: P1+delta12 w jednej linii, poniżej P2+delta23 (mniejsze) */}
      <td className={`py-1.5 px-2 sm:px-4 text-right align-top ${isSection ? 'font-bold' : ''}`}>
        {/* P1 wartość — na mobile: inline z delta12, na desktop: sam */}
        <div className={`font-mono tabular-nums text-sm leading-snug ${v1 < 0 ? 'text-red-600' : v1 === 0 ? 'text-slate-400' : 'text-slate-800'}`}>
          <span>{v1 !== 0 ? formatPLN(v1) : '—'}</span>
          {/* delta12 inline po P1 — tylko mobile */}
          {delta12Str && v1 !== 0 && v2 !== 0 && (
            <span className={`sm:hidden text-[10px] font-semibold ml-1.5 ${delta12Color}`}>{delta12Str}</span>
          )}
        </div>
        {/* delta12 pod P1 — tylko desktop */}
        {delta12Str && v1 !== 0 && v2 !== 0 && (
          <div className={`hidden sm:block text-[10px] font-semibold mt-0.5 ${delta12Color}`}>{delta12Str}</div>
        )}
        {/* P2 + delta23 pod P1 — tylko mobile */}
        {hasPeriod2 && v2 !== 0 && (
          <div className="sm:hidden flex items-center justify-end gap-1 mt-0.5">
            <span className={`font-mono text-[10px] ${v2 < 0 ? 'text-red-400' : 'text-slate-400'}`}>{formatPLN(v2)}</span>
            {delta23Str && <span className={`text-[9px] ${delta23Color}`}>{delta23Str}</span>}
          </div>
        )}
      </td>

      {/* P2 kolumna — desktop: P2 wartość + delta23% poniżej (mniej wyraziste) */}
      {hasPeriod2 && (
        <td className="py-1.5 px-2 sm:px-4 text-right hidden sm:table-cell align-top">
          <div className={`font-mono tabular-nums text-xs leading-snug ${v2 < 0 ? 'text-red-400' : 'text-slate-400'}`}>
            {v2 !== 0 ? formatPLN(v2) : '—'}
          </div>
          {delta23Str && v2 !== 0 && v3 !== undefined && v3 !== 0 && (
            <div className={`text-[9px] mt-0.5 ${delta23Color}`}>{delta23Str}</div>
          )}
        </td>
      )}

      {/* P3 kolumna — desktop (md+): tylko wartość */}
      {hasPeriod3 && (
        <td className={`py-2 px-2 sm:px-4 text-right font-mono tabular-nums text-[11px] hidden md:table-cell ${v3 && v3 < 0 ? 'text-red-300' : 'text-slate-300'}`}>
          {v3 && v3 !== 0 ? formatPLN(v3) : '—'}
        </td>
      )}

      <td className="px-1 text-center">
        {hasDetail && !isSection && (
          <span className={`text-slate-300 transition-transform inline-block text-base ${isSelected ? 'text-blue-400 rotate-90' : ''}`}>›</span>
        )}
      </td>
    </tr>
  );
}

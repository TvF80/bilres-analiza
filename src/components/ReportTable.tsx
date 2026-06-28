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
      <table className="w-full text-sm border-collapse min-w-[480px]">
        <thead>
          <tr className="bg-slate-50 border-b-2 border-slate-200">
            <th className="text-left py-2.5 px-2 sm:px-3 font-semibold text-slate-500 text-xs uppercase tracking-wide w-8 sm:w-12 hidden sm:table-cell">{t('chart.seg')}</th>
            <th className="text-left py-2.5 px-2 sm:px-3 font-semibold text-slate-500 text-xs uppercase tracking-wide">{t('chart.position')}</th>
            <th className="text-right py-2.5 px-3 sm:px-4 font-semibold text-blue-600 text-xs whitespace-nowrap w-28 sm:w-32">{label1}</th>
            {hasPeriod2 && <th className="text-right py-2.5 px-3 sm:px-4 font-semibold text-slate-400 text-xs whitespace-nowrap w-28 sm:w-32 hidden sm:table-cell">{label2}</th>}
            {hasPeriod3 && <th className="text-right py-2.5 px-3 sm:px-4 font-semibold text-slate-300 text-xs whitespace-nowrap w-28 sm:w-32 hidden md:table-cell">{label3}</th>}
            <th className="w-6" />
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

  if (isZeroRow) {
    return (
      <tr className="border-b border-slate-100 opacity-45 select-none">
        <td className="py-1.5 px-2 sm:px-3 text-xs text-slate-300 font-mono hidden sm:table-cell">{row.segment}</td>
        <td className={`py-1.5 px-2 sm:px-3 text-xs text-slate-400 ${indent}`}>{row.name}</td>
        <td className="py-1.5 px-3 sm:px-4 text-right text-xs text-slate-300 font-mono tabular-nums">—</td>
        {hasPeriod2 && <td className="py-1.5 px-3 sm:px-4 text-right text-xs text-slate-300 font-mono tabular-nums hidden sm:table-cell">—</td>}
        {hasPeriod3 && <td className="py-1.5 px-3 sm:px-4 text-right text-xs text-slate-300 font-mono tabular-nums hidden md:table-cell">—</td>}
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

      <td className={`py-2 px-2 sm:px-3 ${nameClass}`}>
        <span>{lang !== 'pl' ? (ROW_TR[row.name]?.[lang as 'fr' | 'en'] ?? row.name) : row.name}</span>
        {hasDetail && !isSection && (
          <span className="ml-1 text-blue-400 opacity-50 text-xs">↗</span>
        )}
      </td>

      <td className={`py-2 px-3 sm:px-4 text-right font-mono tabular-nums text-sm ${isSection ? 'font-bold' : ''} ${v1 < 0 ? 'text-red-600' : v1 === 0 ? 'text-slate-400' : 'text-slate-800'}`}>
        {v1 !== 0 ? formatPLN(v1) : '—'}
      </td>

      {hasPeriod2 && (
        <td className={`py-2 px-3 sm:px-4 text-right font-mono tabular-nums text-xs text-slate-400 hidden sm:table-cell ${v2 < 0 ? 'text-red-400' : ''}`}>
          {v2 !== 0 ? formatPLN(v2) : '—'}
        </td>
      )}

      {hasPeriod3 && (
        <td className={`py-2 px-3 sm:px-4 text-right font-mono tabular-nums text-[11px] hidden md:table-cell ${v3 && v3 < 0 ? 'text-red-300' : 'text-slate-300'}`}>
          {v3 && v3 !== 0 ? formatPLN(v3) : '—'}
        </td>
      )}

      <td className="px-1 sm:px-2 text-center">
        {hasDetail && !isSection && (
          <span className={`text-slate-300 transition-transform inline-block text-base ${isSelected ? 'text-blue-400 rotate-90' : ''}`}>›</span>
        )}
      </td>
    </tr>
  );
}

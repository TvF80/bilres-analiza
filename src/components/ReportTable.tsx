import type { ReportRow } from '../types';
import { formatPLN } from '../hooks/useFormatNumber';

interface ReportTableProps {
  rows: ReportRow[];
  search: string;
  selectedRow: ReportRow | null;
  onRowClick: (row: ReportRow) => void;
}

const INDENT_PX = ['pl-2', 'pl-2', 'pl-6', 'pl-10', 'pl-14'];

export default function ReportTable({ rows, search, selectedRow, onRowClick }: ReportTableProps) {
  const filtered = search.trim()
    ? rows.filter(r => r.name.toLowerCase().includes(search.toLowerCase()))
    : rows;

  return (
    <table className="w-full text-sm border-collapse">
      <thead>
        <tr className="bg-slate-50 border-b-2 border-slate-200">
          <th className="text-left py-2.5 px-3 font-semibold text-slate-500 text-xs uppercase tracking-wide w-14">Seg.</th>
          <th className="text-left py-2.5 px-3 font-semibold text-slate-500 text-xs uppercase tracking-wide">Nazwa pozycji</th>
          <th className="text-right py-2.5 px-4 font-semibold text-slate-500 text-xs uppercase tracking-wide whitespace-nowrap">Wartość (PLN)</th>
          <th className="w-8" />
        </tr>
      </thead>
      <tbody>
        {filtered.map((row, idx) => (
          <Row key={idx} row={row} isSelected={selectedRow === row} onClick={() => onRowClick(row)} />
        ))}
      </tbody>
    </table>
  );
}

function Row({ row, isSelected, onClick }: { row: ReportRow; isSelected: boolean; onClick: () => void }) {
  const isSection = row.level === 0;
  const hasDetail = !!row.definition || row.drilldownAccounts.length > 0;
  const indent = INDENT_PX[Math.min(row.level, INDENT_PX.length - 1)];
  const val = row.values.period1;

  const rowBg = isSelected
    ? 'bg-blue-50 border-l-2 border-l-blue-500'
    : isSection
    ? 'bg-slate-50/80'
    : 'hover:bg-slate-50/60';

  const nameClass = [
    indent,
    isSection ? 'font-bold text-slate-800 text-sm' : row.level === 1 ? 'font-semibold text-slate-700' : 'text-slate-600',
  ].join(' ');

  return (
    <tr
      className={`border-b border-slate-100 transition-colors ${rowBg} ${hasDetail && !isSection ? 'cursor-pointer' : ''}`}
      onClick={hasDetail && !isSection ? onClick : undefined}
    >
      <td className="py-2 px-3 text-slate-400 text-xs font-mono">{row.segment}</td>

      <td className={`py-2 px-3 ${nameClass}`}>
        <span>{row.name}</span>
        {hasDetail && !isSection && (
          <span className="ml-1.5 text-blue-400 opacity-50 text-xs">↗</span>
        )}
      </td>

      <td className={`py-2 px-4 text-right font-mono tabular-nums ${isSection ? 'font-bold' : ''} ${val < 0 ? 'text-red-600' : val === 0 ? 'text-slate-400' : 'text-slate-800'}`}>
        {val !== 0 ? formatPLN(val) : '—'}
      </td>

      <td className="px-2 text-center">
        {hasDetail && !isSection && (
          <span className={`text-slate-300 transition-transform inline-block text-base ${isSelected ? 'text-blue-400 rotate-90' : ''}`}>›</span>
        )}
      </td>
    </tr>
  );
}

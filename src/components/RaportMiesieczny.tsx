import { useMemo, useState, type ReactNode, Fragment } from 'react';
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  Cell, ReferenceLine, PieChart, Pie, LineChart, Line,
} from 'recharts';
import raportDataRaw from '../data/raportMiesieczny.json';
import type {
  MonthlyReportData, DepartmentMargin, CostCategory, MonthlyReportLine,
  MonthlyReportTotals, YearComparisonItem, YearlyHistory, AccountRef,
} from '../types';
import { formatPLN, formatDiff, diffClass } from '../hooks/useFormatNumber';
import { useLang } from '../i18n/LanguageContext';
import { MONTHS_SHORT } from '../i18n';
import type { Lang } from '../i18n';
import { useCompanies } from '../store/CompaniesContext';

const staticData = (raportDataRaw && (raportDataRaw as unknown as MonthlyReportData).departments?.length)
  ? raportDataRaw as unknown as MonthlyReportData
  : null;

// ── Shared helpers / palette ─────────────────────────────────────────────────

const C = { pos: '#10b981', neg: '#f43f5e', p1: '#3b82f6', amber: '#f59e0b' };
const COST_COLORS = ['#3b82f6', '#f97316', '#8b5cf6', '#06b6d4', '#f43f5e', '#10b981', '#f59e0b', '#94a3b8'];
const TOOLTIP_STYLE = { fontSize: 11, borderRadius: 8, border: '1px solid #e2e8f0', boxShadow: '0 2px 8px rgba(0,0,0,.06)' };

function Bar3DShape(props: any) {
  const { x, y, width, height, fill } = props;
  if (!width || height == null || height <= 0) return null;
  const R = 4;
  const hlH = Math.min(7, Math.floor(height * 0.22));
  function onEnter(e: React.MouseEvent<SVGGElement>) {
    const r = e.currentTarget.querySelector('rect.bar-main') as SVGRectElement | null;
    if (r) { r.style.filter = 'drop-shadow(0 3px 6px rgba(0,0,0,0.12)) brightness(1.03)'; r.style.fillOpacity = '1'; }
    const h = e.currentTarget.querySelector('rect.bar-hl') as SVGRectElement | null;
    if (h) h.style.fillOpacity = '0.35';
  }
  function onLeave(e: React.MouseEvent<SVGGElement>) {
    const r = e.currentTarget.querySelector('rect.bar-main') as SVGRectElement | null;
    if (r) { r.style.filter = ''; r.style.fillOpacity = '0.88'; }
    const h = e.currentTarget.querySelector('rect.bar-hl') as SVGRectElement | null;
    if (h) h.style.fillOpacity = '0.16';
  }
  return (
    <g onMouseEnter={onEnter} onMouseLeave={onLeave} style={{ cursor: 'pointer' }}>
      <rect className="bar-main" x={x} y={y} width={width} height={height}
        fill={fill} rx={R} ry={R} fillOpacity={0.88} style={{ transition: 'all 0.12s ease' }} />
      {hlH > 0 && (
        <rect className="bar-hl" x={x+1} y={y+1} width={Math.max(0,width-2)} height={hlH}
          fill="white" fillOpacity={0.16} rx={R-1} pointerEvents="none"
          style={{ transition: 'fill-opacity 0.12s' }} />
      )}
    </g>
  );
}

function plnM(v: number): string {
  if (Math.abs(v) >= 1_000_000) return `${(v / 1_000_000).toFixed(1)} M`;
  if (Math.abs(v) >= 1_000)     return `${(v / 1_000).toFixed(0)} k`;
  return `${v.toFixed(0)}`;
}
function pct(v: number): string {
  return `${(v * 100).toFixed(1)}%`;
}

// Etykiety źródłowe z arkusza miejscami zawierają francuskie nazwy (kolumna „PL" w
// oryginalnym Excelu) — nadpisujemy je polskimi odpowiednikami do wyświetlenia.
// W kolejnych etapach zastąpi to pełen słownik tłumaczeń FR/EN/PL/UA.
const LABEL_OVERRIDES: Record<string, Partial<Record<Lang, string>>> = {
  resultat_de_l_exercice: { pl: 'Wynik netto',             fr: 'Résultat net',              en: 'Net result' },
  koszty_exco_a2a_fr:    { pl: 'Koszty EXCO A2A Francja', fr: 'Charges EXCO A2A France',    en: 'EXCO A2A France costs' },
  publicit:              { pl: 'Reklama',                  fr: 'Publicité',                  en: 'Advertising' },
};
function trLabel(lang: Lang, idOrLine: string | { id: string; labelPl: string }): string {
  const id      = typeof idOrLine === 'string' ? idOrLine : idOrLine.id;
  const labelPl = typeof idOrLine === 'string' ? idOrLine : idOrLine.labelPl;
  const ov = LABEL_OVERRIDES[id];
  if (ov) return ov[lang] ?? ov.pl ?? labelPl;
  return labelPl;
}

function ChartCard({ title, children, height = 220, subtitle }: { title: string; children: ReactNode; height?: number; subtitle?: string }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4" style={{ minHeight: height + 60 }}>
      <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide">{title}</p>
      {subtitle && <p className="text-[10px] text-slate-400 mt-0.5 mb-1">{subtitle}</p>}
      <div className={subtitle ? 'mt-1' : 'mt-3'}>
        <ResponsiveContainer width="100%" height={height}>
          {children as React.ReactElement}
        </ResponsiveContainer>
      </div>
    </div>
  );
}

// ── Slide-over detail drawer (klik w wykres → szczegóły / porównanie historyczne) ──

function Drawer({ title, subtitle, onClose, children }: { title: string; subtitle?: string; onClose: () => void; children: ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex justify-end" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-slate-900/30 backdrop-blur-[1px]" onClick={onClose} />
      <div className="relative w-full sm:w-[520px] bg-white h-full shadow-2xl overflow-y-auto">
        <div className="sticky top-0 bg-white border-b border-slate-100 px-5 py-3.5 flex items-start justify-between gap-3 z-10">
          <div className="min-w-0">
            <p className="text-sm font-bold text-slate-800 truncate">{title}</p>
            {subtitle && <p className="text-[11px] text-slate-400 mt-0.5">{subtitle}</p>}
          </div>
          <button onClick={onClose} className="shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors text-lg leading-none">×</button>
        </div>
        <div className="p-5 space-y-4">{children}</div>
      </div>
    </div>
  );
}

const HISTORY_COLORS: Record<string, string> = { '2023': '#cbd5e1', '2024': '#60a5fa', '2025': '#f59e0b' };

/** Buduje 12-wierszową serię miesięczną z polami fy2023/fy2024/fy2025 — do wykresów porównawczych. */
function historySeries(history: YearlyHistory[] | undefined, months: string[]): Record<string, number | string>[] {
  if (!history?.length) return [];
  return months.map((m, i) => {
    const row: Record<string, number | string> = { month: m };
    for (const h of history) row[`fy${h.fy}`] = h.monthly[i];
    return row;
  });
}

function yoyChange(history: YearlyHistory[] | undefined): number | null {
  if (!history) return null;
  const cur = history.find(h => h.fy === '2025')?.total;
  const prev = history.find(h => h.fy === '2024')?.total;
  if (cur == null || prev == null || prev === 0) return null;
  return (cur - prev) / Math.abs(prev);
}

function TrendBadge({ value, suffix }: { value: number | null; suffix?: string }) {
  const { t } = useLang();
  const defaultSuffix = ' ' + t('trend.yoy');
  const actualSuffix = suffix !== undefined ? suffix : defaultSuffix;
  if (value == null) return <span className="text-[10px] text-slate-300">—</span>;
  const up = value > 0;
  return (
    <span className={`inline-flex items-center gap-0.5 text-[10px] font-semibold ${diffClass(value)}`}>
      <span>{up ? '▲' : value < 0 ? '▼' : '–'}</span>
      {Math.abs(value * 100).toFixed(1)}%{actualSuffix}
    </span>
  );
}

function AccountList({ accounts }: { accounts: AccountRef[] }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {accounts.map(a => (
        <span key={a.number} title={a.name} className="inline-flex items-center gap-1 text-[10px] bg-slate-100 text-slate-600 rounded-md px-1.5 py-0.5 whitespace-nowrap">
          <span className="font-mono font-semibold text-slate-500">{a.number}</span>
          <span className="text-slate-400">·</span>
          <span className="truncate max-w-[160px]">{a.name}</span>
        </span>
      ))}
    </div>
  );
}

/** Mała etykieta z liczbą kont + listą rozwijaną po kliknięciu (korespondencja BAZA). */
function AccountsBadge({ accounts }: { accounts?: AccountRef[] }) {
  const [open, setOpen] = useState(false);
  if (!accounts?.length) return null;
  return (
    <span className="relative inline-block">
      <button
        onClick={(e) => { e.stopPropagation(); setOpen(o => !o); }}
        className="text-[9px] font-semibold uppercase tracking-wide bg-indigo-50 text-indigo-500 hover:bg-indigo-100 rounded-full px-1.5 py-0.5 transition-colors"
        title="Konta księgowe wg tabeli korespondencji BAZA"
      >
        {accounts.length} {accounts.length === 1 ? 'konto' : 'kont'}
      </button>
      {open && (
        <div className="absolute z-20 left-0 mt-1 w-64 bg-white border border-slate-200 rounded-lg shadow-xl p-2.5" onClick={e => e.stopPropagation()}>
          <p className="text-[9px] font-semibold text-slate-400 uppercase tracking-wide mb-1.5">Konta wg tabeli korespondencji „BAZA"</p>
          <AccountList accounts={accounts} />
        </div>
      )}
    </span>
  );
}

/** Wykres porównawczy 3 lat obrachunkowych (FY2023/2024/2025) dla danej linii raportu. */
function HistoryComparisonChart({ history, height = 230, kind: _kind = 'line' }: { history?: YearlyHistory[]; height?: number; kind?: 'area' | 'line' }) {
  const { t, lang } = useLang();
  const months = MONTHS_SHORT[lang];
  const series = useMemo(() => historySeries(history, months), [history, months]);
  if (!series.length || !history) return <p className="text-xs text-slate-400 italic">{t('costs.noHistoryPosition')}</p>;
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={series} margin={{ left: -16, right: 8, top: 6, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
        <XAxis dataKey="month" tick={{ fontSize: 9, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
        <YAxis tick={{ fontSize: 9, fill: '#94a3b8' }} axisLine={false} tickLine={false} tickFormatter={v => plnM(Number(v))} width={48} />
        <Tooltip formatter={(v, name) => [`${formatPLN(Number(v))} PLN`, `FY ${String(name).replace('fy', '')}`]} contentStyle={TOOLTIP_STYLE} />
        <Legend formatter={(v) => `FY ${String(v).replace('fy', '')}`} wrapperStyle={{ fontSize: 10 }} />
        {[...history].sort((a, b) => b.fy.localeCompare(a.fy)).map(h => (
          <Line key={h.fy} type="monotone" dataKey={`fy${h.fy}`} stroke={HISTORY_COLORS[h.fy] ?? '#94a3b8'} strokeWidth={h.fy === '2025' ? 2.5 : 1.5} dot={false} />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}

/** Mini sparkline sumy okresu w 3 latach — do KPI/badge'y. */
function MiniHistorySpark({ history, color = C.amber }: { history?: YearlyHistory[]; color?: string }) {
  const points = useMemo(() => (history ?? []).map(h => ({ fy: h.fy, total: h.total })), [history]);
  if (points.length < 2) return null;
  return (
    <ResponsiveContainer width={64} height={28}>
      <LineChart data={points} margin={{ top: 2, right: 2, bottom: 0, left: 2 }}>
        <Line type="monotone" dataKey="total" stroke={color} strokeWidth={1.75} dot={{ r: 2, fill: color, strokeWidth: 0 }} />
      </LineChart>
    </ResponsiveContainer>
  );
}

// ── Panel KPI / wskaźników podsumowujących (pomysły z zakładki „Analiza wskaźnikowa") ──

interface KpiDef { label: string; value: string; delta: number | null; deltaLabel?: string; history?: YearlyHistory[]; accent: string; hint: string }

function KpiCard({ k, onClick }: { k: KpiDef; onClick: () => void }) {
  const { t } = useLang();
  return (
    <button
      onClick={onClick}
      className="bg-white rounded-xl border border-slate-200 shadow-sm p-3.5 flex items-center gap-3 min-w-0 text-left hover:border-amber-300 hover:shadow-md transition-all cursor-pointer"
      title={t('report.clickTrend')}
    >
      <div className="min-w-0 flex-1">
        <p className="text-[9px] font-semibold text-slate-400 uppercase tracking-wide line-clamp-2 leading-tight" title={k.hint}>{k.label}</p>
        <p className="text-lg font-bold text-slate-800 truncate" style={{ color: k.accent }}>{k.value}</p>
        <TrendBadge value={k.delta} suffix={k.deltaLabel} />
      </div>
      {k.history && <MiniHistorySpark history={k.history} color={k.accent} />}
    </button>
  );
}

function KpiPanel({ totals, result, history, period }: { totals: MonthlyReportTotals; result: MonthlyReportLine[]; history: { fy: string; label: string }[]; period: string }) {
  const { t } = useLang();
  const [selected, setSelected] = useState<KpiDef | null>(null);
  const net = result.find(r => r.id === 'resultat_de_l_exercice');
  const opexLine = result.find(r => r.id === 'koszty_eksploatacji_i');

  const kpis = useMemo<KpiDef[]>(() => {
    const rev = totals.revenue.total;
    const grossPct = rev !== 0 ? totals.grossMargin.total / rev : 0;
    const netPct = rev !== 0 && net ? net.total / rev : 0;
    const opexPct = rev !== 0 && opexLine ? Math.abs(opexLine.total) / rev : 0;
    const costShare = rev !== 0 ? Math.abs(totals.costOfSales.total) / rev : 0;

    return [
      {
        label: t('report.revenueYTD'), value: `${plnM(rev)} PLN`, delta: yoyChange(totals.revenue.history),
        history: totals.revenue.history, accent: '#3b82f6',
        hint: t('kpi.revenueHint', { period }),
      },
      {
        label: t('report.grossMargin'), value: pct(grossPct), delta: yoyChange(totals.grossMargin.history), deltaLabel: ' ' + t('trend.valueYoy'),
        history: totals.grossMargin.history, accent: '#10b981',
        hint: t('kpi.grossMarginHint'),
      },
      {
        label: t('report.costToRevenue'), value: pct(costShare), delta: yoyChange(totals.costOfSales.history), deltaLabel: ' ' + t('trend.valueYoy'),
        history: totals.costOfSales.history, accent: '#f97316',
        hint: t('kpi.costShareHint'),
      },
      {
        label: t('report.opexToRevenue'), value: pct(opexPct), delta: opexLine ? yoyChange(opexLine.history) : null, deltaLabel: ' ' + t('trend.valueYoy'),
        history: opexLine?.history, accent: '#8b5cf6',
        hint: t('kpi.opexHint'),
      },
      {
        label: t('report.netROS'), value: pct(netPct), delta: net ? yoyChange(net.history) : null, deltaLabel: ' ' + t('trend.valueYoy'),
        history: net?.history, accent: netPct >= 0 ? '#059669' : '#e11d48',
        hint: t('kpi.netHint'),
      },
      {
        label: t('report.revenueDynamics'), value: yoyChange(totals.revenue.history) != null ? `${(yoyChange(totals.revenue.history)! * 100).toFixed(1)}%` : '—',
        delta: yoyChange(totals.revenue.history), deltaLabel: '', history: totals.revenue.history, accent: '#0ea5e9',
        hint: t('kpi.dynamicsHint'),
      },
    ];
  }, [totals, net, opexLine, history, t]);

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5">
      {kpis.map(k => <KpiCard key={k.label} k={k} onClick={() => setSelected(k)} />)}

      {selected && (
        <Drawer
          title={selected.label}
          subtitle={`${selected.value} · zmiana: ${selected.delta != null ? `${(selected.delta * 100).toFixed(1)}%${selected.deltaLabel !== undefined ? selected.deltaLabel : ' ' + t('trend.yoy')}` : '—'}`}
          onClose={() => setSelected(null)}
        >
          <p className="text-xs text-slate-500">{selected.hint}</p>
          <div>
            <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide mb-2">{t('report.trend3years')}</p>
            {selected.history?.length
              ? <HistoryComparisonChart history={selected.history} height={220} kind="area" />
              : <p className="text-xs text-slate-400 italic">{t('report.noHistory')}</p>}
          </div>
          {!!selected.history?.length && (
            <div className="grid grid-cols-3 gap-2 text-center">
              {selected.history!.slice().reverse().map(h => (
                <div key={h.fy} className="rounded-lg border border-slate-100 bg-slate-50/60 p-2">
                  <p className="text-[9px] text-slate-400 uppercase font-semibold">FY {h.fy}</p>
                  <p className={`text-xs font-bold ${diffClass(h.total)}`}>{plnM(h.total)} PLN</p>
                  <p className="text-[9px] text-slate-400">{h.label}</p>
                </div>
              ))}
            </div>
          )}
        </Drawer>
      )}
    </div>
  );
}

// ── Sub-tabs ─────────────────────────────────────────────────────────────────

type SubTab = 'marza' | 'heatmapa' | 'koszty' | 'wynik' | 'porownanie';

export default function RaportMiesieczny() {
  const { t } = useLang();
  const { activeCompany } = useCompanies();
  const data: MonthlyReportData | null = activeCompany?.raportMiesieczny ?? staticData;
  const [activeTab, setActiveTab] = useState<SubTab>('marza');

  const SUB_TABS: { key: SubTab; label: string }[] = useMemo(() => [
    { key: 'marza',      label: t('report.marginByDept') },
    { key: 'heatmapa',   label: t('report.heatmap') },
    { key: 'koszty',     label: t('report.operatingCosts') },
    { key: 'wynik',      label: t('report.result') },
    { key: 'porownanie', label: t('report.yoyComparison') },
  ], [t]);

  if (!data) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-3 text-slate-400 text-sm p-8 text-center">
        <div className="text-3xl">📅</div>
        <p className="font-semibold text-slate-600">Brak danych raportu miesięcznego</p>
        <p className="text-xs text-slate-400 max-w-xs">Zaimportuj pliki <em>ex_rap miesieczny</em> i <em>comp</em> podczas dodawania firmy lub podmiana danych.</p>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-5xl mx-auto px-4 py-5 space-y-5">
        {/* Header bar */}
        <div className="flex items-center gap-3 bg-white rounded-xl border border-slate-200 shadow-sm px-4 py-3">
          <div>
            <p className="text-base font-bold text-slate-800">{data.company} — {t('report.managementReport')}</p>
            <p className="text-xs text-slate-400 mt-0.5">{t('report.period')} {data.period}</p>
          </div>
          <div className="ml-auto text-xs text-slate-400 text-right hidden sm:block">{data.comparisonLabel}</div>
        </div>

        {/* Panel KPI / wskaźników */}
        <KpiPanel totals={data.totals} result={data.result} history={data.history} period={data.period} />

        {/* Sub-tabs */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-2 flex flex-wrap gap-1">
          {SUB_TABS.map(tab => {
            const active = activeTab === tab.key;
            return (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-100 ${
                  active
                    ? 'bg-amber-600 text-white shadow-[0_4px_0_0_rgba(0,0,0,0.2)] translate-y-0 hover:translate-y-0.5 hover:shadow-[0_2px_0_0_rgba(0,0,0,0.2)]'
                    : 'text-slate-600 hover:bg-slate-100 shadow-[0_2px_0_0_#e2e8f0] hover:translate-y-0.5 hover:shadow-[0_1px_0_0_#e2e8f0]'
                }`}
              >
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* Content */}
        {activeTab === 'marza'      && <MarzaTab departments={data.departments} totals={data.totals} period={data.period} />}
        {activeTab === 'heatmapa'   && <HeatmapaTab departments={data.departments} periodLabels={data.periodLabels} />}
        {activeTab === 'koszty'     && <KosztyTab costCategories={data.costCategories} totals={data.totals} period={data.period} />}
        {activeTab === 'wynik'      && <WynikTab result={data.result} totals={data.totals} periodLabels={data.periodLabels} costCategories={data.costCategories} departments={data.departments} />}
        {activeTab === 'porownanie' && <PorownanieTab items={data.yearComparison} comparisonLabel={data.comparisonLabel} />}
      </div>
    </div>
  );
}

// ── 1. Marża wg działów ───────────────────────────────────────────────────────

function MarzaTab({ departments, totals, period }: { departments: DepartmentMargin[]; totals: MonthlyReportTotals; period: string }) {
  const { t, lang } = useLang();
  const months = MONTHS_SHORT[lang];
  const [selected, setSelected] = useState<DepartmentMargin & { marginPct: number } | null>(null);
  const [ranking, setRanking] = useState<'best' | 'worst' | null>(null);

  const rows = useMemo(() => departments
    .map(d => ({ ...d, marginPct: d.revenue.total !== 0 ? d.margin.total / d.revenue.total : 0 }))
    .sort((a, b) => b.margin.total - a.margin.total), [departments]);

  const best = rows[0];
  const worst = rows[rows.length - 1];
  const totalMarginPct = totals.revenue.total !== 0 ? totals.grossMargin.total / totals.revenue.total : 0;

  const drawerSeries = useMemo(() => selected ? historySeries(selected.margin.history, months) : [], [selected, months]);
  const drawerYoy = selected ? yoyChange(selected.margin.history) : null;

  const rankingList = ranking === 'best' ? rows.slice(0, 5) : ranking === 'worst' ? [...rows].reverse().slice(0, 5) : [];

  return (
    <div className="space-y-4">
      {/* Ranking cards — klikalne, otwierają pełną listę TOP/najsłabszych działów */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <button
          onClick={() => setRanking('best')}
          className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 flex items-center gap-3 text-left hover:border-emerald-300 hover:shadow-md transition-all cursor-pointer"
        >
          <span className="w-9 h-9 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center text-base shrink-0">🏆</span>
          <div className="min-w-0">
            <p className="text-[10px] text-slate-400 uppercase font-semibold tracking-wide">{t('report.mostProfitable')}</p>
            <p className="text-sm font-bold text-slate-800 truncate">{best.label} — {formatPLN(best.margin.total)} PLN ({pct(best.marginPct)})</p>
          </div>
        </button>
        <button
          onClick={() => setRanking('worst')}
          className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 flex items-center gap-3 text-left hover:border-rose-300 hover:shadow-md transition-all cursor-pointer"
        >
          <span className="w-9 h-9 rounded-full bg-rose-100 text-rose-600 flex items-center justify-center text-base shrink-0">⚠️</span>
          <div className="min-w-0">
            <p className="text-[10px] text-slate-400 uppercase font-semibold tracking-wide">{t('report.leastProfitable')}</p>
            <p className="text-sm font-bold text-slate-800 truncate">{worst.label} — {formatPLN(worst.margin.total)} PLN ({pct(worst.marginPct)})</p>
          </div>
        </button>
      </div>

      {/* Bar chart — margin per department (klikalne — otwiera trend 3-letni) */}
      <ChartCard
        title={t('report.deptBarTitle', { period })}
        subtitle={t('report.deptBarHint')}
        height={Math.max(240, rows.length * 26)}
      >
        <BarChart data={rows.map(r => ({ name: r.label, marza: r.margin.total, key: r.key }))} layout="vertical" margin={{ left: 8, right: 16 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
          <XAxis type="number" tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} tickFormatter={v => plnM(v)} />
          <YAxis type="category" dataKey="name" width={96} tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} />
          <Tooltip formatter={(v) => [`${formatPLN(Number(v))} PLN`, t('trend.margin')]} contentStyle={TOOLTIP_STYLE} />
          <ReferenceLine x={0} stroke="#e2e8f0" />
          <Bar
            dataKey="marza" radius={[0, 5, 5, 0]} maxBarSize={18} cursor="pointer"
            onClick={(_, i) => setSelected(rows[i])}
          >
            {rows.map((r, i) => <Cell key={i} fill={r.margin.total >= 0 ? C.pos : C.neg} />)}
          </Bar>
        </BarChart>
      </ChartCard>

      {/* Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="bg-slate-50 text-slate-500 uppercase text-[10px] tracking-wide">
            <tr>
              <th className="text-left px-3 py-2">{t('report.dept')}</th>
              <th className="text-right px-3 py-2">{t('report.sales')}</th>
              <th className="text-right px-3 py-2">{t('report.costOfSales')}</th>
              <th className="text-right px-3 py-2">{t('report.margin')}</th>
              <th className="text-right px-3 py-2">{t('report.marginPct')}</th>
              <th className="text-right px-3 py-2">{t('report.marginTrend')}</th>
              <th className="text-right px-3 py-2">{t('report.marginDeltaYoY')}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr
                key={r.key}
                onClick={() => setSelected(r)}
                className={`border-t border-slate-100 hover:bg-amber-50/50 cursor-pointer transition-colors ${i % 2 ? 'bg-slate-50/40' : ''}`}
              >
                <td className="px-3 py-1.5 font-medium text-slate-700 whitespace-nowrap">
                  <span className="inline-flex items-center gap-1.5">
                    {r.label}
                    <span className="text-slate-300 group-hover:text-amber-400">↗</span>
                  </span>
                </td>
                <td className="px-3 py-1.5 text-right text-slate-600">{formatPLN(r.revenue.total)}</td>
                <td className="px-3 py-1.5 text-right text-slate-600">{formatPLN(r.cost.total)}</td>
                <td className={`px-3 py-1.5 text-right font-semibold ${diffClass(r.margin.total)}`}>{formatPLN(r.margin.total)}</td>
                <td className={`px-3 py-1.5 text-right font-semibold ${diffClass(r.marginPct)}`}>{pct(r.marginPct)}</td>
                <td className="px-3 py-1.5 text-right">
                  <div className="flex justify-end"><MiniHistorySpark history={r.margin.history} color={r.margin.total >= 0 ? C.pos : C.neg} /></div>
                </td>
                <td className="px-3 py-1.5 text-right"><TrendBadge value={yoyChange(r.margin.history)} /></td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-slate-200 bg-slate-50 font-bold text-slate-800">
              <td className="px-3 py-2">{t('report.total')}</td>
              <td className="px-3 py-2 text-right">{formatPLN(totals.revenue.total)}</td>
              <td className="px-3 py-2 text-right">{formatPLN(totals.costOfSales.total)}</td>
              <td className="px-3 py-2 text-right">{formatPLN(totals.grossMargin.total)}</td>
              <td className="px-3 py-2 text-right">{pct(totalMarginPct)}</td>
              <td className="px-3 py-2" />
              <td className="px-3 py-2 text-right"><TrendBadge value={yoyChange(totals.grossMargin.history)} /></td>
            </tr>
          </tfoot>
        </table>
      </div>

      {/* Drawer — szczegóły działu: trend 3-letni + konta z BAZA */}
      {selected && (
        <Drawer
          title={t('report.deptDetails', { dept: selected.label })}
          subtitle={t('report.deptSubtitle', { margin: formatPLN(selected.margin.total), pct: pct(selected.marginPct), yoy: drawerYoy != null ? `${(drawerYoy * 100).toFixed(1)}%` : '—' })}
          onClose={() => setSelected(null)}
        >
          <div>
            <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide mb-2">{t('report.margin3years')}</p>
            {drawerSeries.length > 0
              ? <HistoryComparisonChart history={selected.margin.history} height={210} kind="line" />
              : <p className="text-xs text-slate-400 italic">{t('report.noHistoryLine')}</p>}
          </div>

          <div className="grid grid-cols-3 gap-2 text-center">
            {selected.margin.history?.slice().reverse().map(h => (
              <div key={h.fy} className="rounded-lg border border-slate-100 bg-slate-50/60 p-2">
                <p className="text-[9px] text-slate-400 uppercase font-semibold">FY {h.fy}</p>
                <p className={`text-xs font-bold ${diffClass(h.total)}`}>{plnM(h.total)} PLN</p>
                <p className="text-[9px] text-slate-400">{h.label}</p>
              </div>
            ))}
          </div>

          <div className="space-y-2">
            <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide">{t('report.salesRevenue')}</p>
            {selected.revenue.accounts?.length
              ? <AccountList accounts={selected.revenue.accounts} />
              : <p className="text-xs text-slate-400 italic">{t('report.noMatchedAccounts')}</p>}
          </div>
          <div className="space-y-2">
            <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide">{t('report.costOfSalesAccounts')}</p>
            {selected.cost.accounts?.length
              ? <AccountList accounts={selected.cost.accounts} />
              : <p className="text-xs text-slate-400 italic">{t('report.noMatchedAccounts')}</p>}
          </div>
        </Drawer>
      )}

      {/* Drawer — ranking TOP 5 najbardziej / najmniej rentownych działów */}
      {ranking && (
        <Drawer
          title={ranking === 'best' ? t('report.rankBest') : t('report.rankWorst')}
          subtitle={t('report.rankSubtitle', { period })}
          onClose={() => setRanking(null)}
        >
          <div className="space-y-1.5">
            {rankingList.map((r, i) => (
              <button
                key={r.key}
                onClick={() => { setRanking(null); setSelected(r); }}
                className="w-full flex items-center gap-3 rounded-lg border border-slate-100 hover:border-amber-300 hover:bg-amber-50/40 transition-colors p-2.5 text-left"
              >
                <span className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 ${
                  ranking === 'best' ? 'bg-emerald-100 text-emerald-600' : 'bg-rose-100 text-rose-600'
                }`}>{i + 1}</span>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-semibold text-slate-700 truncate">{r.label}</p>
                  <p className="text-[10px] text-slate-400">{t('report.sales')}: {formatPLN(r.revenue.total)} PLN</p>
                </div>
                <div className="text-right shrink-0">
                  <p className={`text-xs font-bold ${diffClass(r.margin.total)}`}>{formatPLN(r.margin.total)} PLN</p>
                  <p className={`text-[10px] font-semibold ${diffClass(r.marginPct)}`}>{pct(r.marginPct)}</p>
                </div>
                <TrendBadge value={yoyChange(r.margin.history)} />
              </button>
            ))}
          </div>
        </Drawer>
      )}
    </div>
  );
}

// ── 2. Heatmapa marż w czasie (element ekstra) ───────────────────────────────

function marginColor(p: number): string {
  const t = Math.max(0, Math.min(1, (p + 0.1) / 0.5)); // -10% → 0, +40% → 1
  return `hsl(${Math.round(t * 120)}, 65%, 82%)`;
}

function deltaColor(d: number): string {
  // -15pp → czerwień, 0 → biel/szary, +15pp → zieleń
  const t = Math.max(-1, Math.min(1, d / 0.15));
  if (t >= 0) return `hsl(145, 55%, ${Math.round(96 - t * 26)}%)`;
  return `hsl(355, 65%, ${Math.round(96 + t * 26)}%)`;
}

const HEATMAP_FYS = ['2025', '2024', '2023'] as const;

function HeatmapaTab({ departments, periodLabels }: { departments: DepartmentMargin[]; periodLabels: string[] }) {
  const { t } = useLang();
  const [year, setYear] = useState<typeof HEATMAP_FYS[number]>('2025');
  const [showDelta, setShowDelta] = useState(false);

  const fyLabel = (fy: string) => departments[0]?.margin.history?.find(h => h.fy === fy)?.label ?? fy;

  function monthlyOf(line: MonthlyReportLine, fy: string): number[] {
    if (fy === '2025') return line.monthly;
    return line.history?.find(h => h.fy === fy)?.monthly ?? line.monthly.map(() => 0);
  }
  function totalOf(line: MonthlyReportLine, fy: string): number {
    if (fy === '2025') return line.total;
    return line.history?.find(h => h.fy === fy)?.total ?? 0;
  }

  const prevYear = year === '2025' ? '2024' : year === '2024' ? '2023' : null;

  const grid = useMemo(() => departments.map(d => {
    const revM = monthlyOf(d.revenue, year), marM = monthlyOf(d.margin, year);
    const cells = periodLabels.map((_, i) => (revM[i] !== 0 ? marM[i] / revM[i] : 0));
    const avg = totalOf(d.revenue, year) !== 0 ? totalOf(d.margin, year) / totalOf(d.revenue, year) : 0;

    let deltaCells: number[] | null = null;
    let deltaAvg: number | null = null;
    if (prevYear) {
      const prevRevM = monthlyOf(d.revenue, prevYear), prevMarM = monthlyOf(d.margin, prevYear);
      deltaCells = periodLabels.map((_, i) => {
        const cur = revM[i] !== 0 ? marM[i] / revM[i] : 0;
        const prev = prevRevM[i] !== 0 ? prevMarM[i] / prevRevM[i] : 0;
        return cur - prev;
      });
      const prevAvg = totalOf(d.revenue, prevYear) !== 0 ? totalOf(d.margin, prevYear) / totalOf(d.revenue, prevYear) : 0;
      deltaAvg = avg - prevAvg;
    }
    return { label: d.label, dept: d, cells, avg, deltaCells, deltaAvg };
  }), [departments, periodLabels, year, prevYear]);

  const [cell, setCell] = useState<{ dept: DepartmentMargin; label: string; monthIndex: number } | null>(null);
  const cellMonth = cell ? periodLabels[cell.monthIndex] : null;
  const cellByYear = useMemo(() => {
    if (!cell) return [];
    return HEATMAP_FYS.map(fy => {
      const rev = monthlyOf(cell.dept.revenue, fy)[cell.monthIndex] ?? 0;
      const cost = monthlyOf(cell.dept.cost, fy)[cell.monthIndex] ?? 0;
      const mar = monthlyOf(cell.dept.margin, fy)[cell.monthIndex] ?? 0;
      return { fy, label: fyLabel(fy), revenue: rev, cost, margin: mar, marginPct: rev !== 0 ? mar / rev : 0 };
    });
  }, [cell]);

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
        <div className="flex flex-wrap items-start justify-between gap-3 mb-1">
          <div>
            <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide">
              {t('heat.title')}
            </p>
            <p className="text-xs text-slate-400 mt-1 max-w-2xl">
              {t('heat.description')}
            </p>
          </div>
          <div className="flex flex-col items-end gap-1.5 shrink-0">
            <div className="flex items-center gap-1 bg-slate-100 rounded-lg p-0.5">
              {HEATMAP_FYS.map(fy => (
                <button
                  key={fy}
                  onClick={() => setYear(fy)}
                  className={`px-2.5 py-1 rounded-md text-[10px] font-semibold transition-colors ${year === fy ? 'bg-amber-600 text-white shadow-sm' : 'text-slate-500 hover:bg-white'}`}
                >
                  FY {fy}
                </button>
              ))}
            </div>
            {prevYear && (
              <button
                onClick={() => setShowDelta(s => !s)}
                className={`px-2.5 py-1 rounded-lg text-[10px] font-semibold transition-colors ${showDelta ? 'bg-indigo-600 text-white shadow-sm' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}
                title={`Pokaż zmianę marży FY${year} względem FY${prevYear} w punktach procentowych`}
              >
                {showDelta ? t('heat.deltaVs', { year: prevYear! }) : t('heat.showDelta', { year: prevYear! })}
              </button>
            )}
          </div>
        </div>
        <p className="text-[10px] text-slate-400 mb-3">
          {t('heat.selectedPeriod')} <span className="font-semibold text-slate-500">FY {year} ({fyLabel(year)})</span>
          {showDelta && prevYear && <> · {t('heat.comparedTo')} <span className="font-semibold text-slate-500">FY {prevYear} ({fyLabel(prevYear)})</span> — {t('heat.ppNote')}</>}
        </p>
        <div className="overflow-x-auto">
          <table className="text-[10px] border-separate" style={{ borderSpacing: 3 }}>
            <thead>
              <tr>
                <th className="text-left px-2 py-1 text-slate-400 font-semibold sticky left-0 bg-white">{t('report.dept')}</th>
                {periodLabels.map(p => (
                  <th key={p} className="px-1 py-1 text-slate-400 font-medium text-center whitespace-nowrap">{p}</th>
                ))}
                <th className="px-2 py-1 text-slate-400 font-semibold text-center">{showDelta ? t('heat.deltaAvg') : t('heat.avgPeriod')}</th>
              </tr>
            </thead>
            <tbody>
              {grid.map(row => (
                <tr key={row.label}>
                  <td className="px-2 py-1 font-medium text-slate-700 sticky left-0 bg-white whitespace-nowrap">{row.label}</td>
                  {(showDelta && row.deltaCells ? row.deltaCells : row.cells).map((p, i) => (
                    <td
                      key={i}
                      onClick={() => setCell({ dept: row.dept, label: row.label, monthIndex: i })}
                      className="text-center rounded-md font-medium text-slate-700 px-1 py-1.5 cursor-pointer hover:ring-2 hover:ring-amber-400 transition-shadow"
                      style={{ background: showDelta ? deltaColor(p) : marginColor(p), minWidth: 42 }}
                      title={`${row.label} · ${periodLabels[i]} — kliknij po szczegóły i porównanie 3 lat. ${showDelta ? `Zmiana marży: ${p >= 0 ? '+' : ''}${(p * 100).toFixed(1)} pp` : `Marża: ${(p * 100).toFixed(1)}%`}`}
                    >
                      {showDelta ? `${p >= 0 ? '+' : ''}${(p * 100).toFixed(0)}` : `${(p * 100).toFixed(0)}%`}
                    </td>
                  ))}
                  <td
                    className="text-center rounded-md font-bold text-slate-800 px-2 py-1.5"
                    style={{ background: showDelta && row.deltaAvg != null ? deltaColor(row.deltaAvg) : marginColor(row.avg) }}
                  >
                    {showDelta && row.deltaAvg != null ? `${row.deltaAvg >= 0 ? '+' : ''}${(row.deltaAvg * 100).toFixed(0)} pp` : `${(row.avg * 100).toFixed(0)}%`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="flex items-center gap-2 mt-4 text-[10px] text-slate-400 max-w-xs">
          {showDelta ? (
            <>
              <span className="whitespace-nowrap">{t('heat.marginDrop')}</span>
              <div className="flex-1 h-2 rounded-full" style={{ background: 'linear-gradient(to right, hsl(355,65%,70%), hsl(355,65%,96%), hsl(145,55%,70%))' }} />
              <span className="whitespace-nowrap">{t('heat.marginRise')}</span>
            </>
          ) : (
            <>
              <span className="whitespace-nowrap">{t('heat.low')}</span>
              <div className="flex-1 h-2 rounded-full" style={{ background: 'linear-gradient(to right, hsl(0,65%,82%), hsl(60,65%,82%), hsl(120,65%,82%))' }} />
              <span className="whitespace-nowrap">{t('heat.high')}</span>
            </>
          )}
        </div>
      </div>

      {/* Ranking stabilności / progresji marż na bazie 3-letniej historii */}
      <ChartCard
        title={t('heat.3yearComparison')}
        subtitle={t('heat.3yearSubtitle')}
        height={Math.max(220, departments.length * 24)}
      >
        <BarChart
          data={departments.map(d => {
            const row: Record<string, number | string> = { name: d.label };
            for (const fy of HEATMAP_FYS) {
              const rev = totalOf(d.revenue, fy), mar = totalOf(d.margin, fy);
              row[`fy${fy}`] = rev !== 0 ? mar / rev : 0;
            }
            return row;
          })}
          layout="vertical" margin={{ left: 8, right: 16 }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
          <XAxis type="number" tick={{ fontSize: 9, fill: '#94a3b8' }} axisLine={false} tickLine={false} tickFormatter={v => `${(Number(v) * 100).toFixed(0)}%`} />
          <YAxis type="category" dataKey="name" width={96} tick={{ fontSize: 10, fill: '#64748b' }} axisLine={false} tickLine={false} />
          <Tooltip formatter={(v, name) => [`${(Number(v) * 100).toFixed(1)}%`, `FY ${String(name).replace('fy', '')}`]} contentStyle={TOOLTIP_STYLE} />
          <Legend formatter={(v) => `FY ${String(v).replace('fy', '')}`} wrapperStyle={{ fontSize: 10 }} />
          <ReferenceLine x={0} stroke="#e2e8f0" />
          {HEATMAP_FYS.map(fy => (
            <Bar key={fy} dataKey={`fy${fy}`} fill={HISTORY_COLORS[fy]} radius={[0, 3, 3, 0]} maxBarSize={9} />
          ))}
        </BarChart>
      </ChartCard>

      {/* Drawer — szczegóły komórki heatmapy: dział × miesiąc, porównanie 3 lat */}
      {cell && (
        <Drawer
          title={`${cell.label} — ${cellMonth}`}
          subtitle={`${t('heat.cellComparison')} ${HEATMAP_FYS.map(fy => `FY ${fy}`).join(' / ')}`}
          onClose={() => setCell(null)}
        >
          <div className="space-y-1.5">
            {cellByYear.map(y => (
              <div key={y.fy} className="rounded-lg border border-slate-100 p-2.5 flex items-center gap-3">
                <span
                  className="w-9 h-9 rounded-lg flex items-center justify-center text-[10px] font-bold text-slate-700 shrink-0"
                  style={{ background: marginColor(y.marginPct) }}
                >
                  {(y.marginPct * 100).toFixed(0)}%
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-[10px] text-slate-400 uppercase font-semibold">FY {y.fy} ({y.label}) — {cellMonth}</p>
                  <p className="text-xs text-slate-600">
                    {t('report.sales')}: <span className="font-semibold text-slate-700">{formatPLN(y.revenue)}</span> · {t('trend.cost')}: <span className="font-semibold text-slate-700">{formatPLN(y.cost)}</span>
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <p className={`text-xs font-bold ${diffClass(y.margin)}`}>{formatPLN(y.margin)} PLN</p>
                  <p className={`text-[10px] font-semibold ${diffClass(y.marginPct)}`}>{t('trend.margin').toLowerCase()} {pct(y.marginPct)}</p>
                </div>
              </div>
            ))}
          </div>
          <p className="text-[10px] text-slate-400">
            {t('heat.cellNote', { month: cellMonth ?? '' })}
          </p>
        </Drawer>
      )}
    </div>
  );
}

// ── 3. Koszty operacyjne (4xx) ────────────────────────────────────────────────

function collectParentIds(cats: CostCategory[]): string[] {
  return cats.flatMap(c => (c.children?.length ? [c.id, ...collectParentIds(c.children)] : []));
}

function flattenCostLeaves(cats: CostCategory[]): CostCategory[] {
  return cats.flatMap(c => (c.children?.length ? flattenCostLeaves(c.children) : [c]));
}

function CostRow({ cat, revenue, depth, expanded, onToggle, onSelect }: {
  cat: CostCategory; revenue: number; depth: number;
  expanded: Set<string>; onToggle: (id: string) => void; onSelect: (cat: CostCategory) => void;
}) {
  const { t, lang } = useLang();
  const hasChildren = !!cat.children?.length;
  const isOpen = expanded.has(cat.id);
  const yoy = yoyChange(cat.history);
  return (
    <>
      {/* Konflikt rozwiń/szczegóły rozwiązany przez rozdzielenie celów kliknięcia:
          chevron (z e.stopPropagation()) zwija/rozwija grupę, reszta wiersza zawsze
          otwiera Drawer ze szczegółami i trendem — tak jak w pozycjach liściowych. */}
      <tr
        onClick={() => onSelect(cat)}
        className={`border-t border-slate-100 cursor-pointer transition-colors ${
          depth === 0 ? 'bg-slate-50/70 font-semibold text-slate-800 hover:bg-amber-50/60' : 'text-slate-600 hover:bg-amber-50/40'
        }`}
        title="Kliknij, aby zobaczyć trend i szczegóły tej pozycji"
      >
        <td className="px-3 py-1.5" style={{ paddingLeft: 12 + depth * 16 }}>
          <span className="inline-flex items-center gap-1.5">
            {hasChildren ? (
              <button
                onClick={(e) => { e.stopPropagation(); onToggle(cat.id); }}
                className={`inline-block w-3.5 h-3.5 rounded-sm bg-slate-100 text-slate-400 hover:bg-slate-200 hover:text-slate-600 text-center leading-[14px] text-[9px] font-bold transition-transform ${isOpen ? '' : '-rotate-90'}`}
                title={t('costs.collapseToggle')}
              >▾</button>
            ) : (
              <span className="inline-block w-3.5" />
            )}
            <span>{trLabel(lang, cat)}</span>
            {!hasChildren && <AccountsBadge accounts={cat.accounts} />}
          </span>
        </td>
        <td className="px-3 py-1.5 text-right whitespace-nowrap">{formatPLN(cat.total)}</td>
        <td className="px-3 py-1.5 text-right text-slate-400 whitespace-nowrap">{revenue !== 0 ? pct(cat.total / revenue) : '—'}</td>
        <td className="px-3 py-1.5 text-right">
          <div className="flex justify-end"><MiniHistorySpark history={cat.history} color={COST_COLORS[depth % COST_COLORS.length]} /></div>
        </td>
        <td className="px-3 py-1.5 text-right whitespace-nowrap"><TrendBadge value={yoy} /></td>
      </tr>
      {hasChildren && isOpen && cat.children!.map(c => (
        <CostRow key={c.id} cat={c} revenue={revenue} depth={depth + 1} expanded={expanded} onToggle={onToggle} onSelect={onSelect} />
      ))}
    </>
  );
}

function KosztyTab({ costCategories, totals, period }: { costCategories: CostCategory[]; totals: MonthlyReportTotals; period: string }) {
  const { t, lang } = useLang();
  const revenue = totals.revenue.total;
  const allParentIds = useMemo(() => collectParentIds(costCategories), [costCategories]);
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set(costCategories.map(c => c.id)));
  const [selected, setSelected] = useState<CostCategory | null>(null);

  const toggle = (id: string) => setExpanded(prev => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  const expandAll = () => setExpanded(new Set(allParentIds));
  const collapseAll = () => setExpanded(new Set());

  const pieData = useMemo(() => costCategories.map((c, i) => ({
    name: trLabel(lang, c),
    value: Math.abs(c.total),
    fill: COST_COLORS[i % COST_COLORS.length],
  })), [costCategories, lang]);
  const totalAbs = useMemo(() => pieData.reduce((s, d) => s + d.value, 0), [pieData]);

  // Ranking wzrostu / spadku kosztów rodzajowych r/r — na bazie pozycji liściowych z historią 3 lat
  const costRanking = useMemo(() => {
    const leaves = flattenCostLeaves(costCategories)
      .map(c => ({ cat: c, yoy: yoyChange(c.history) }))
      .filter((x): x is { cat: CostCategory; yoy: number } => x.yoy != null && Math.abs(x.cat.total) > 1000);
    return {
      up: [...leaves].sort((a, b) => b.yoy - a.yoy).slice(0, 4),
      down: [...leaves].sort((a, b) => a.yoy - b.yoy).slice(0, 4),
    };
  }, [costCategories]);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <ChartCard title={t('costs.structureTitle')} height={230}>
          <PieChart>
            <Pie data={pieData} dataKey="value" nameKey="name" innerRadius={48} outerRadius={75} paddingAngle={2} label={({ percent }) => percent != null ? `${(percent * 100).toFixed(0)}%` : ''} labelLine={false}>
              {pieData.map((d, i) => <Cell key={i} fill={d.fill} />)}
            </Pie>
            <Tooltip
              formatter={(v, _name, entry) => {
                const num = Number(v);
                const label = (entry?.payload as { name?: string } | undefined)?.name ?? '';
                return [`${formatPLN(num)} PLN (${totalAbs !== 0 ? (num / totalAbs * 100).toFixed(1) : '0'}%)`, label];
              }}
              contentStyle={TOOLTIP_STYLE}
            />
            <Legend wrapperStyle={{ fontSize: 10 }} layout="horizontal" verticalAlign="bottom" />
          </PieChart>
        </ChartCard>
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
          <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide">{t('costs.rankTitle')}</p>
          <p className="text-[10px] text-slate-400 mt-0.5 mb-2.5">
            {t('costs.totalCosts', { amount: formatPLN(totalAbs), pct: revenue !== 0 ? pct(totalAbs / revenue) : '—', period })}
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <p className="text-[10px] font-semibold text-rose-500 uppercase tracking-wide mb-1.5 inline-flex items-center gap-1"><span>▲</span> {t('costs.topIncreases')}</p>
              <div className="space-y-1">
                {costRanking.up.map(({ cat, yoy }) => (
                  <button
                    key={cat.id}
                    onClick={() => setSelected(cat)}
                    className="w-full flex items-center justify-between gap-2 rounded-lg border border-slate-100 hover:border-rose-300 hover:bg-rose-50/40 transition-colors px-2.5 py-1.5 text-left"
                  >
                    <span className="text-[11px] text-slate-600 truncate">{trLabel(lang, cat)}</span>
                    <span className="text-[10px] font-bold text-rose-500 shrink-0">+{(yoy * 100).toFixed(1)}%</span>
                  </button>
                ))}
                {costRanking.up.length === 0 && <p className="text-[10px] text-slate-300 italic px-2.5">{t('costs.noIncrease')}</p>}
              </div>
            </div>
            <div>
              <p className="text-[10px] font-semibold text-emerald-600 uppercase tracking-wide mb-1.5 inline-flex items-center gap-1"><span>▼</span> {t('costs.topDecreases')}</p>
              <div className="space-y-1">
                {costRanking.down.map(({ cat, yoy }) => (
                  <button
                    key={cat.id}
                    onClick={() => setSelected(cat)}
                    className="w-full flex items-center justify-between gap-2 rounded-lg border border-slate-100 hover:border-emerald-300 hover:bg-emerald-50/40 transition-colors px-2.5 py-1.5 text-left"
                  >
                    <span className="text-[11px] text-slate-600 truncate">{trLabel(lang, cat)}</span>
                    <span className="text-[10px] font-bold text-emerald-600 shrink-0">{(yoy * 100).toFixed(1)}%</span>
                  </button>
                ))}
                {costRanking.down.length === 0 && <p className="text-[10px] text-slate-300 italic px-2.5">{t('costs.noDecrease')}</p>}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="flex items-center justify-between gap-3 px-3 py-2 border-b border-slate-100">
          <p className="text-[11px] text-slate-400">{t('costs.treeNote')}</p>
          <div className="flex items-center gap-1.5 shrink-0">
            <button onClick={expandAll} className="px-2.5 py-1 rounded-lg text-[10px] font-semibold bg-slate-100 text-slate-500 hover:bg-slate-200 transition-colors">{t('costs.expandAll')}</button>
            <button onClick={collapseAll} className="px-2.5 py-1 rounded-lg text-[10px] font-semibold bg-slate-100 text-slate-500 hover:bg-slate-200 transition-colors">{t('costs.collapseAll')}</button>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-slate-50 text-slate-500 uppercase text-[10px] tracking-wide">
              <tr>
                <th className="text-left px-3 py-2">{t('costs.category')}</th>
                <th className="text-right px-3 py-2">{t('costs.periodSum')}</th>
                <th className="text-right px-3 py-2">{t('costs.pctRevenue')}</th>
                <th className="text-right px-3 py-2">{t('costs.trend3years')}</th>
                <th className="text-right px-3 py-2">{t('chart.deltaYoY')}</th>
              </tr>
            </thead>
            <tbody>
              {costCategories.map(c => (
                <CostRow key={c.id} cat={c} revenue={revenue} depth={0} expanded={expanded} onToggle={toggle} onSelect={setSelected} />
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {selected && (
        <Drawer
          title={trLabel(lang, selected)}
          subtitle={t('costs.drawerSubtitle', { amount: formatPLN(selected.total), pct: revenue !== 0 ? pct(selected.total / revenue) : '—', yoy: (() => { const y = yoyChange(selected.history); return y != null ? `${(y * 100).toFixed(1)}%` : '—'; })() })}
          onClose={() => setSelected(null)}
        >
          <div>
            <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide mb-2">{t('costs.3yearComparison')}</p>
            {selected.history?.length
              ? <HistoryComparisonChart history={selected.history} height={210} />
              : <p className="text-xs text-slate-400 italic">{t('costs.noHistoryPosition')}</p>}
          </div>
          <div className="grid grid-cols-3 gap-2 text-center">
            {selected.history?.slice().reverse().map(h => (
              <div key={h.fy} className="rounded-lg border border-slate-100 bg-slate-50/60 p-2">
                <p className="text-[9px] text-slate-400 uppercase font-semibold">FY {h.fy}</p>
                <p className="text-xs font-bold text-slate-700">{plnM(h.total)} PLN</p>
                <p className="text-[9px] text-slate-400">{h.label}</p>
              </div>
            ))}
          </div>
          <div className="space-y-2">
            <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide">{t('costs.accountsTitle')}</p>
            {selected.accounts?.length
              ? <AccountList accounts={selected.accounts} />
              : <p className="text-xs text-slate-400 italic">{t('costs.noAccounts')}</p>}
          </div>
        </Drawer>
      )}
    </div>
  );
}

// ── 4. Wynik — lejek wyniku + porównania r/r (zamiast klasycznej kaskady) ─────

const FUNNEL_STAGE_IDS = [
  { id: '__revenue', tKey: 'funnel.revenue', color: '#3b82f6' },
  { id: 'marza_po_kosztach_eksploatacji', tKey: 'funnel.marginAfterExpl', color: '#06b6d4' },
  { id: 'wynik_po_kosztach', tKey: 'funnel.resultAfterCosts', color: '#8b5cf6' },
  { id: 'wynik_brutto', tKey: 'funnel.grossResult', color: '#f59e0b' },
  { id: 'resultat_de_l_exercice', tKey: 'funnel.netResult', color: '#10b981' },
];

interface FunnelStage { name: string; value: number; fill: string; pctOfRevenue: number; pctOfPrev: number | null }


function costIntensityColor(p: number): string {
  const t = Math.max(0, Math.min(1, p / 0.3)); // 0% → zieleń, 30%+ → czerwień
  return `hsl(${Math.round(120 - t * 120)}, 58%, 83%)`;
}

const FUNNEL_GAP_NAMES: (string | null)[] = [
  null,                          // before stage 0 (revenue itself)
  'Koszty eksploatacji',         // Revenue → Marża
  'Koszty inwestycji',           // Marża → Wynik po kosztach
  'Inne przychody / koszty',     // Wynik → Wynik brutto
  'Podatek',                     // Brutto → Wynik netto
];

function CustomFunnel({ data, onStageClick, onStageHover }: {
  data: FunnelStage[];
  onStageClick: (i: number) => void;
  onStageHover?: (i: number | null) => void;
}) {
  // Lejek odwrócony (szerszy na górze) — wzorowany na klasycznym funnel chart
  const STAGE_H = 46;
  const GAP = 8;           // przerwa między stopniami (przestrzeń na adnotacje)
  const VIEW_W = 360;
  const FUNNEL_X0 = 8;    // lewy margines lejka
  const FUNNEL_W = 200;   // szerokość strefy lejka
  const LABEL_X = FUNNEL_X0 + FUNNEL_W + 12; // start etykiet po prawej
  const TOTAL_H = data.length * (STAGE_H + GAP) + 14;
  const revenue = Math.abs(data[0]?.value ?? 1);
  const cx = FUNNEL_X0 + FUNNEL_W / 2;

  // Szerokości trapezów: max → min (co najmniej 18% szerokości lejka)
  const MIN_W_FRAC = 0.18;
  const widths = data.map(s =>
    FUNNEL_W * Math.max(MIN_W_FRAC, Math.min(1, Math.abs(s.value) / revenue))
  );

  return (
    <svg viewBox={`0 0 ${VIEW_W} ${TOTAL_H}`} className="w-full" style={{ height: TOTAL_H }}>
      {data.map((stage, i) => {
        const y0 = i * (STAGE_H + GAP) + 6;
        const cw = widths[i];
        const pw = i > 0 ? widths[i - 1] : cw;
        const isNeg = stage.value < 0;
        const fill = isNeg ? '#f87171' : stage.fill;

        const tL = cx - pw / 2;
        const tR = cx + pw / 2;
        const bL = cx - cw / 2;
        const bR = cx + cw / 2;

        const shape = i === 0
          ? `M ${bL},${y0+STAGE_H} L ${bL},${y0} L ${bR},${y0} L ${bR},${y0+STAGE_H} Z`
          : `M ${tL},${y0} L ${tR},${y0} L ${bR},${y0+STAGE_H} L ${bL},${y0+STAGE_H} Z`;

        // bevel highlight (top bright strip)
        const bevelH = Math.min(10, STAGE_H * 0.24);
        const bevelShape = i === 0
          ? `M ${bL+1},${y0+1} L ${bR-1},${y0+1} L ${bR-1},${y0+bevelH} L ${bL+1},${y0+bevelH} Z`
          : `M ${tL+1},${y0+1} L ${tR-1},${y0+1} L ${bR-2},${y0+bevelH} L ${bL+2},${y0+bevelH} Z`;

        const pctOfPrevDelta = stage.pctOfPrev != null ? (stage.pctOfPrev - 1) * 100 : null;
        const midW = (cw + pw) / 2; // średnia szerokość — czy jest miejsce na tekst

        return (
          <g key={i}>
            <g onClick={() => onStageClick(i)} onMouseEnter={() => onStageHover?.(i)} onMouseLeave={() => onStageHover?.(null)} style={{ cursor: 'pointer' }}>
              {/* cień (glow) przy hover */}
              <path d={shape} fill={fill} fillOpacity={0.04} transform="translate(0,2)" />
              {/* główny trapez */}
              <path d={shape} fill={fill} fillOpacity={0.92}>
                <title>{stage.name}: {plnM(stage.value)} ({(stage.pctOfRevenue * 100).toFixed(1)}%)</title>
              </path>
              {/* bevel */}
              <path d={bevelShape} fill="white" fillOpacity={0.22} pointerEvents="none" />

              {/* % wewnątrz — tylko gdy jest miejsce */}
              {midW > 44 && (
                <text x={cx} y={y0 + STAGE_H / 2}
                  textAnchor="middle" dominantBaseline="middle"
                  fontSize={midW > 80 ? 11 : 9} fontWeight="800" fill="white"
                  pointerEvents="none" style={{ userSelect: 'none' }}>
                  {(Math.abs(stage.pctOfRevenue) * 100).toFixed(1)}%
                </text>
              )}

              {/* linia łącząca do etykiety */}
              <line
                x1={bR + 2} y1={y0 + STAGE_H / 2}
                x2={LABEL_X - 4} y2={y0 + STAGE_H / 2}
                stroke="#e2e8f0" strokeWidth={0.8} pointerEvents="none"
              />

              {/* etykieta — PRAWA strona */}
              <text x={LABEL_X} y={y0 + STAGE_H / 2 - (pctOfPrevDelta != null ? 6 : 0)}
                textAnchor="start" dominantBaseline="middle"
                fontSize={9.5} fontWeight="600" fill="#334155"
                pointerEvents="none" style={{ userSelect: 'none' }}>
                {stage.name.length > 16 ? stage.name.slice(0, 15) + '…' : stage.name}
              </text>
              <text x={LABEL_X} y={y0 + STAGE_H / 2 + (pctOfPrevDelta != null ? 6 : 7)}
                textAnchor="start" dominantBaseline="middle"
                fontSize={8.5} fill={isNeg ? '#dc2626' : '#64748b'}
                pointerEvents="none" style={{ userSelect: 'none' }}>
                {plnM(stage.value)}
                {pctOfPrevDelta != null && (
                  ` · ${pctOfPrevDelta >= 0 ? '↑' : '↓'}${Math.abs(pctOfPrevDelta).toFixed(1)}%`
                )}
              </text>
            </g>
            {/* Gap annotation showing % consumed going from prev stage to this one */}
            {i > 0 && (() => {
              const prevPct = data[i - 1].pctOfRevenue;
              const thisPct = stage.pctOfRevenue;
              const consumedPct = (prevPct - thisPct) * 100;
              const gapY = i * (STAGE_H + GAP) + 6 - GAP / 2;
              const gapName = FUNNEL_GAP_NAMES[i];
              return (
                <g key={`gap${i}`}>
                  {gapName && (
                    <text
                      x={cx - FUNNEL_W / 2 - 4}
                      y={gapY - 3}
                      textAnchor="end"
                      dominantBaseline="middle"
                      fontSize={7}
                      fontWeight="700"
                      fill="#475569"
                      pointerEvents="none"
                      style={{ userSelect: 'none' }}
                    >
                      {gapName}
                    </text>
                  )}
                  {consumedPct > 0.1 && (
                    <text
                      x={cx}
                      y={gapY + 2}
                      textAnchor="middle"
                      dominantBaseline="middle"
                      fontSize={7}
                      fontWeight="600"
                      fill="#f43f5e"
                      pointerEvents="none"
                      style={{ userSelect: 'none' }}
                    >
                      ↓ −{consumedPct.toFixed(1)}%
                    </text>
                  )}
                </g>
              );
            })()}
          </g>
        );
      })}
    </svg>
  );
}

function WynikTab({ result, totals, periodLabels, costCategories, departments }: { result: MonthlyReportLine[]; totals: MonthlyReportTotals; periodLabels: string[]; costCategories: CostCategory[]; departments: DepartmentMargin[] }) {
  const { t, lang } = useLang();
  const find = (id: string) => result.find(x => x.id === id);
  const netLine = find('resultat_de_l_exercice');
  const [selected, setSelected] = useState<{ label: string; line: MonthlyReportLine } | null>(null);
  const [hoveredStageIdx, setHoveredStageIdx] = useState<number | null>(null);
  const [openGroups, setOpenGroups] = useState<Set<string>>(() => new Set());

  const tableGroups = useMemo(() => {
    const result_groups: { header: MonthlyReportLine; details: MonthlyReportLine[] }[] = [];
    for (const line of result) {
      const isMain = line.labelPl === line.labelPl.toUpperCase();
      if (isMain) {
        result_groups.push({ header: line, details: [] });
      } else if (result_groups.length > 0) {
        result_groups[result_groups.length - 1].details.push(line);
      }
    }
    return result_groups;
  }, [result]);

  const stages = useMemo(() => FUNNEL_STAGE_IDS.map(s => s.id === '__revenue' ? totals.revenue : find(s.id)), [result, totals]);

  const funnelData = useMemo<FunnelStage[]>(() => FUNNEL_STAGE_IDS.map((s, i) => {
    const line = stages[i];
    const value = line?.total ?? 0;
    const prevValue = i > 0 ? (stages[i - 1]?.total ?? 0) : null;
    return {
      name: t(s.tKey),
      value,
      fill: s.color,
      pctOfRevenue: totals.revenue.total !== 0 ? value / totals.revenue.total : 0,
      pctOfPrev: prevValue != null && prevValue !== 0 ? value / prevValue : null,
    };
  }), [stages, totals, t]);

  // Porównanie checkpointów lejka między 3 latami obrachunkowymi (z historii)
  const checkpointComparison = useMemo(() => FUNNEL_STAGE_IDS.map(s => {
    const line = s.id === '__revenue' ? totals.revenue : find(s.id);
    const row: Record<string, number | string> = { name: t(s.tKey) };
    for (const fy of ['2023', '2024', '2025']) {
      row[`fy${fy}`] = line?.history?.find(h => h.fy === fy)?.total ?? 0;
    }
    return row;
  }), [result, totals, t]);

  // Heatmapa kosztów rodzajowych jako % przychodu w danym miesiącu (FY2025) — uzupełnienie heatmapy marż
  const costHeatGrid = useMemo(() => costCategories.map(c => {
    const cells = periodLabels.map((_, i) => {
      const rev = totals.revenue.monthly[i];
      return rev !== 0 ? Math.abs(c.monthly[i]) / rev : 0;
    });
    const avg = totals.revenue.total !== 0 ? Math.abs(c.total) / totals.revenue.total : 0;
    const prevTotal = c.history?.find(h => h.fy === '2024')?.total ?? null;
    const prevRevenue = totals.revenue.history?.find(h => h.fy === '2024')?.total ?? null;
    const prevAvg = prevTotal != null && prevRevenue ? Math.abs(prevTotal) / prevRevenue : null;
    return { id: c.id, label: trLabel(lang, c), cat: c, cells, avg, deltaAvg: prevAvg != null ? avg - prevAvg : null };
  }), [costCategories, periodLabels, totals, lang]);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        <div className="lg:col-span-2 bg-white rounded-xl border border-slate-200 shadow-sm p-4" style={{ minHeight: 320 }}>
          <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide">{t('funnel.title')}</p>
          <p className="text-[10px] text-slate-400 mt-0.5 mb-1">{t('funnel.description')}</p>
          <CustomFunnel
            data={funnelData}
            onStageClick={(i) => { const line = stages[i]; if (line) setSelected({ label: funnelData[i].name, line }); }}
            onStageHover={setHoveredStageIdx}
          />
          {/* Dynamic hover panel — only visible on hover */}
          <div className="mt-3 min-h-[120px]">
            {hoveredStageIdx == null ? (
              <div className="h-full flex items-center justify-center py-6">
                <p className="text-[10px] text-slate-300 italic text-center">↑ Najedź na fragment lejka<br/>aby zobaczyć szczegóły</p>
              </div>
            ) : (() => {
              const stage = funnelData[hoveredStageIdx];
              const stageMonthly = stages[hoveredStageIdx]?.monthly ?? [];
              const maxM = Math.max(...stageMonthly.map(Math.abs), 1);
              const prevStage = hoveredStageIdx > 0 ? funnelData[hoveredStageIdx - 1] : null;
              const consumed = prevStage != null ? prevStage.value - stage.value : null;
              const consumedPct = prevStage != null ? (prevStage.pctOfRevenue - stage.pctOfRevenue) * 100 : null;
              const bestMonthIdx = stageMonthly.length > 0
                ? stageMonthly.reduce((bi, v, i) => Math.abs(v) > Math.abs(stageMonthly[bi]) ? i : bi, 0)
                : 0;

              // Stage-specific breakdown
              const isRevenue = hoveredStageIdx === 0;
              const breakdown = isRevenue
                ? departments
                    .map(d => ({ label: d.label, value: d.revenue.total, color: COST_COLORS[departments.indexOf(d) % COST_COLORS.length] }))
                    .sort((a, b) => b.value - a.value)
                    .slice(0, 5)
                : costCategories
                    .sort((a, b) => Math.abs(b.total) - Math.abs(a.total))
                    .slice(0, 5)
                    .map((c, ci) => ({ label: trLabel(lang, c), value: c.total, color: COST_COLORS[ci % COST_COLORS.length] }));

              const breakdownTotal = isRevenue ? totals.revenue.total : Math.abs(consumed ?? 0);

              return (
                <div
                  className="rounded-xl border-2 p-3 transition-all duration-150"
                  style={{ borderColor: stage.fill + '50', background: stage.fill + '08' }}
                >
                  {/* Header row */}
                  <div className="flex items-center gap-2 mb-2">
                    <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: stage.fill }} />
                    <span className="text-[11px] font-bold text-slate-700 truncate flex-1">{stage.name}</span>
                    <span className="text-lg font-black tabular-nums shrink-0" style={{ color: stage.fill }}>
                      {(Math.abs(stage.pctOfRevenue) * 100).toFixed(1)}%
                    </span>
                  </div>

                  {/* KPI row */}
                  <div className="flex gap-3 mb-2.5 text-center">
                    <div className="flex-1">
                      <p className="text-[9px] text-slate-400 uppercase font-semibold">Wartość</p>
                      <p className={`text-sm font-bold tabular-nums ${stage.value < 0 ? 'text-rose-600' : 'text-slate-800'}`}>{plnM(stage.value)}</p>
                    </div>
                    {consumedPct != null && consumedPct > 0.05 && (
                      <div className="flex-1">
                        <p className="text-[9px] text-slate-400 uppercase font-semibold">Pochłonięto</p>
                        <p className="text-sm font-bold text-rose-500 tabular-nums">−{consumedPct.toFixed(1)}%</p>
                      </div>
                    )}
                    {stageMonthly.length > 0 && (
                      <div className="flex-1">
                        <p className="text-[9px] text-slate-400 uppercase font-semibold">Najlepszy</p>
                        <p className="text-sm font-bold text-slate-700">{periodLabels[bestMonthIdx] ?? `M${bestMonthIdx + 1}`}</p>
                      </div>
                    )}
                  </div>

                  {/* Breakdown items */}
                  {breakdown.length > 0 && (
                    <div className="space-y-1 mb-2.5">
                      <p className="text-[9px] text-slate-400 uppercase font-semibold mb-1">
                        {isRevenue ? 'Główne działy' : 'Składniki kosztów'}
                      </p>
                      {breakdown.map((item, bi) => {
                        const share = breakdownTotal !== 0 ? Math.abs(item.value) / Math.abs(breakdownTotal) : 0;
                        return (
                          <div key={bi} className="flex items-center gap-1.5 min-w-0">
                            <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: item.color }} />
                            <span className="text-[9px] text-slate-600 truncate flex-1 min-w-0">{item.label}</span>
                            <span className="text-[9px] font-semibold text-slate-700 shrink-0 tabular-nums">{plnM(item.value)}</span>
                            <div className="w-12 shrink-0">
                              <div className="h-1 rounded-full bg-slate-100 overflow-hidden">
                                <div className="h-full rounded-full" style={{ width: `${Math.min(100, share * 100)}%`, background: item.color }} />
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* Monthly sparkbars */}
                  {stageMonthly.length > 0 && (
                    <div>
                      <p className="text-[9px] text-slate-400 uppercase font-semibold mb-1">Miesiące</p>
                      <div className="flex items-end gap-px h-6">
                        {stageMonthly.map((v, mi) => {
                          const h = Math.max(2, Math.round((Math.abs(v) / maxM) * 20));
                          const isBest = mi === bestMonthIdx;
                          return (
                            <div
                              key={mi}
                              className="flex-1 rounded-t-sm"
                              title={`${periodLabels[mi] ?? ''}: ${plnM(v)}`}
                              style={{
                                height: h,
                                background: v < 0 ? '#f87171' : stage.fill,
                                opacity: isBest ? 1 : 0.55,
                                alignSelf: 'flex-end',
                                outline: isBest ? `1px solid ${stage.fill}` : 'none',
                              }}
                            />
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              );
            })()}
          </div>
          <div className="flex flex-wrap gap-x-3 gap-y-1 mt-2">
            {funnelData.map(s => (
              <span key={s.name} className="inline-flex items-center gap-1 text-[9px] text-slate-400">
                <span className="w-2 h-2 rounded-sm" style={{ background: s.fill }} />
                {s.name}: <span className="font-semibold text-slate-500">{pct(s.pctOfRevenue)}</span> {t('funnel.ofRevenue')}
              </span>
            ))}
          </div>
        </div>

        <div className="lg:col-span-3 space-y-4">
          <ChartCard
            title={t('funnel.3yearComparison')}
            subtitle={t('funnel.3yearSubtitle')}
            height={260}
          >
            <BarChart data={checkpointComparison} margin={{ bottom: 50 }} barCategoryGap="22%">
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
              <XAxis dataKey="name" tick={{ fontSize: 8.5, fill: '#64748b' }} axisLine={false} tickLine={false} angle={-30} textAnchor="end" height={70} interval={0} />
              <YAxis tick={{ fontSize: 9, fill: '#94a3b8' }} axisLine={false} tickLine={false} tickFormatter={v => plnM(Number(v))} />
              <Tooltip formatter={(v, name) => [`${formatPLN(Number(v))} PLN`, `FY ${String(name).replace('fy', '')}`]} contentStyle={TOOLTIP_STYLE} />
              <Legend formatter={(v) => `FY ${String(v).replace('fy', '')}`} wrapperStyle={{ fontSize: 10 }} />
              <ReferenceLine y={0} stroke="#e2e8f0" />
              {(['2025', '2024', '2023'] as const).map(fy => (
                <Bar
                  key={fy} dataKey={`fy${fy}`} fill={HISTORY_COLORS[fy]} radius={[3, 3, 0, 0]} maxBarSize={20} cursor="pointer"
                  shape={Bar3DShape}
                  onClick={(_, idx) => { const line = stages[idx]; if (line) setSelected({ label: t(FUNNEL_STAGE_IDS[idx].tKey), line }); }}
                />
              ))}
            </BarChart>
          </ChartCard>

          <ChartCard
            title={t('wynik.netMonthly')}
            subtitle={t('wynik.netMonthlySubtitle')}
            height={230}
          >
            {netLine?.history?.length
              ? <HistoryComparisonChart history={netLine.history} height={210} kind="line" />
              : <p className="text-xs text-slate-400 italic">{t('wynik.noHistory')}</p>}
          </ChartCard>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <table className="w-full text-[11px]" style={{ tableLayout: 'fixed' }}>
          <thead className="bg-slate-50 text-slate-500 uppercase text-[10px] tracking-wide">
            <tr>
              <th className="text-left px-3 py-2 sticky left-0 bg-slate-50" style={{ width: '20%' }}>{t('chart.position')}</th>
              <th className="text-right px-3 py-2 font-bold text-slate-700" style={{ width: '9%' }}>{t('chart.total')}</th>
              <th className="text-right px-3 py-2" style={{ width: '8%' }}>{t('chart.deltaYoY')}</th>
              <th className="px-1 py-2 bg-slate-100/60" style={{ width: '12px' }} />
              {periodLabels.map(p => (
                <th key={p} className="text-right px-1 py-2 font-normal text-slate-400" style={{ width: '5.2%' }}>
                  {p.length > 3 ? p.slice(0, 3) : p}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {tableGroups.map(({ header, details }) => {
              const isOpen = openGroups.has(header.id);
              const hasDetails = details.length > 0;
              return (
                <Fragment key={header.id}>
                  {/* Header row */}
                  <tr
                    onClick={() => {
                      if (hasDetails) {
                        setOpenGroups(prev => {
                          const s = new Set(prev);
                          s.has(header.id) ? s.delete(header.id) : s.add(header.id);
                          return s;
                        });
                      } else {
                        setSelected({ label: trLabel(lang, header), line: header });
                      }
                    }}
                    title={hasDetails ? (isOpen ? 'Zwiń' : 'Rozwiń szczegóły') : t('wynik.clickTrendYoY')}
                    className="border-t border-slate-100 cursor-pointer bg-amber-50/50 font-semibold text-slate-800 hover:bg-amber-100/60 transition-colors"
                  >
                    <td className="px-3 py-1.5 whitespace-nowrap sticky left-0 bg-inherit">
                      <span className="inline-flex items-center gap-1.5">
                        {hasDetails && (
                          <span className={`text-slate-400 text-[10px] transition-transform duration-150 ${isOpen ? '' : '-rotate-90'} inline-block`}>▾</span>
                        )}
                        {trLabel(lang, header)}
                      </span>
                    </td>
                    <td className={`text-right px-3 py-1.5 font-semibold ${diffClass(header.total)}`}>{formatPLN(header.total)}</td>
                    <td className="text-right px-3 py-1.5"><TrendBadge value={yoyChange(header.history)} /></td>
                    <td className="px-1 py-1.5 bg-slate-50/60" style={{ width: '12px' }} />
                    {header.monthly.map((v, j) => (
                      <td key={j} className={`text-right px-1 py-1 text-[9px] tabular-nums ${diffClass(v)}`}>{plnM(v)}</td>
                    ))}
                  </tr>
                  {/* Detail rows — only visible when open */}
                  {isOpen && details.map((line, di) => (
                    <tr
                      key={line.id}
                      onClick={() => setSelected({ label: trLabel(lang, line), line })}
                      title={t('wynik.clickTrendYoY')}
                      className={`border-t border-slate-100 cursor-pointer text-slate-600 hover:bg-amber-50/40 transition-colors ${di % 2 ? 'bg-slate-50/40' : ''}`}
                    >
                      <td className="px-3 py-1 sticky left-0 bg-inherit truncate pl-7 text-slate-500">{trLabel(lang, line)}</td>
                      <td className={`text-right px-3 py-1 text-[10px] font-medium ${diffClass(line.total)}`}>{formatPLN(line.total)}</td>
                      <td className="text-right px-3 py-1 text-[10px]"><TrendBadge value={yoyChange(line.history)} /></td>
                      <td className="px-1 py-1 bg-slate-50/60" style={{ width: '12px' }} />
                      {line.monthly.map((v, j) => (
                        <td key={j} className={`text-right px-1 py-0.5 text-[9px] tabular-nums text-slate-400 ${diffClass(v)}`}>{plnM(v)}</td>
                      ))}
                    </tr>
                  ))}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Heatmapa kosztów rodzajowych jako % przychodu — uzupełnienie heatmapy marż z poprzedniej zakładki */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
        <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide">{t('wynik.costHeatTitle')}</p>
        <p className="text-xs text-slate-400 mt-1 mb-3 max-w-2xl">
          {t('wynik.costHeatDesc')}
        </p>
        <div className="overflow-x-auto">
          <table className="text-[10px] border-separate" style={{ borderSpacing: 3 }}>
            <thead>
              <tr>
                <th className="text-left px-2 py-1 text-slate-400 font-semibold sticky left-0 bg-white">{t('costs.category')}</th>
                {periodLabels.map(p => (
                  <th key={p} className="px-1 py-1 text-slate-400 font-medium text-center whitespace-nowrap">{p}</th>
                ))}
                <th className="px-2 py-1 text-slate-400 font-semibold text-center">{t('heat.avgPeriod')}</th>
                <th className="px-2 py-1 text-slate-400 font-semibold text-center">Δ vs FY24</th>
              </tr>
            </thead>
            <tbody>
              {costHeatGrid.map(row => (
                <tr key={row.id}>
                  <td className="px-2 py-1 font-medium text-slate-700 sticky left-0 bg-white whitespace-nowrap">{row.label}</td>
                  {row.cells.map((p, i) => (
                    <td
                      key={i}
                      onClick={() => setSelected({ label: row.label, line: row.cat })}
                      className="text-center rounded-md font-medium text-slate-700 px-1 py-1.5 cursor-pointer hover:ring-2 hover:ring-amber-400 transition-shadow"
                      style={{ background: costIntensityColor(p), minWidth: 42 }}
                      title={`${row.label} · ${periodLabels[i]}: ${(p * 100).toFixed(1)}% ${t('wynik.ofRevenuePct')} — ${t('wynik.clickTrendYoY')}`}
                    >
                      {(p * 100).toFixed(0)}%
                    </td>
                  ))}
                  <td className="text-center rounded-md font-bold text-slate-800 px-2 py-1.5" style={{ background: costIntensityColor(row.avg) }}>
                    {(row.avg * 100).toFixed(0)}%
                  </td>
                  <td className="text-center rounded-md font-semibold px-2 py-1.5 text-slate-600 bg-slate-50">
                    {row.deltaAvg != null ? `${row.deltaAvg >= 0 ? '+' : ''}${(row.deltaAvg * 100).toFixed(1)} pp` : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="flex items-center gap-2 mt-4 text-[10px] text-slate-400 max-w-xs">
          <span className="whitespace-nowrap">{t('wynik.lowShare')}</span>
          <div className="flex-1 h-2 rounded-full" style={{ background: 'linear-gradient(to right, hsl(120,58%,83%), hsl(60,58%,83%), hsl(0,58%,83%))' }} />
          <span className="whitespace-nowrap">{t('wynik.highShare')}</span>
        </div>
      </div>

      {/* Drawer — wspólny dla lejka, etapów i pozycji wyniku: trend + porównanie 3 lat */}
      {selected && (() => {
        const yoy = yoyChange(selected.line.history);
        const rev = totals.revenue.total;
        return (
          <Drawer
            title={selected.label}
            subtitle={`Suma okresu: ${formatPLN(selected.line.total)} PLN${rev !== 0 ? ` · ${pct(selected.line.total / rev)} ${t('wynik.drawerOfRevenue')}` : ''} · zmiana r/r: ${yoy != null ? `${(yoy * 100).toFixed(1)}%` : '—'}`}
            onClose={() => setSelected(null)}
          >
            <div>
              <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide mb-2">{t('costs.3yearComparison')}</p>
              {selected.line.history?.length
                ? <HistoryComparisonChart history={selected.line.history} height={210} kind="line" />
                : <p className="text-xs text-slate-400 italic">{t('costs.noHistoryPosition')}</p>}
            </div>
            {!!selected.line.history?.length && (
              <div className="grid grid-cols-3 gap-2 text-center">
                {selected.line.history!.slice().reverse().map(h => (
                  <div key={h.fy} className="rounded-lg border border-slate-100 bg-slate-50/60 p-2">
                    <p className="text-[9px] text-slate-400 uppercase font-semibold">FY {h.fy}</p>
                    <p className={`text-xs font-bold ${diffClass(h.total)}`}>{plnM(h.total)} PLN</p>
                    <p className="text-[9px] text-slate-400">{h.label}</p>
                  </div>
                ))}
              </div>
            )}
          </Drawer>
        );
      })()}
    </div>
  );
}

// ── 5. Porównanie r/r 2023–2025 ───────────────────────────────────────────────

// Sekcje odzwierciedlają układ wierszy arkusza B_RAP_COMP CUMUL: działy → podsumowania
// sprzedaży/marży → koszty rodzajowe (4xx) → linie wyniku. Pozwala to zwijać szczegóły
// do wierszy podsumowujących (zapisanych WIELKIMI LITERAMI w źródle) bez budowania
// pełnego drzewa — każda sekcja chowa swoje pozycje liściowe za przełącznikiem.
const COMPARISON_SECTIONS: { tKey: string; from: number; to: number }[] = [
  { tKey: 'comp.sectionMargins', from: 0, to: 39 },
  { tKey: 'comp.sectionSalesSummary', from: 39, to: 44 },
  { tKey: 'comp.sectionCosts4xx', from: 44, to: 111 },
  { tKey: 'comp.sectionFinResult', from: 111, to: 128 },
];

function isSummaryRow(label: string): boolean {
  return /[A-ZĄĆĘŁŃÓŚŹŻ]/.test(label) && label === label.toUpperCase();
}

function ComparisonSection({ section, items, filter, onRowClick }: {
  section: { tKey: string; from: number; to: number };
  items: YearComparisonItem[];
  filter: string;
  onRowClick?: (item: YearComparisonItem) => void;
}) {
  const { t, lang } = useLang();
  const [expanded, setExpanded] = useState(false);
  const all = items.slice(section.from, section.to);
  const summaries = all.filter(it => isSummaryRow(it.labelPl));
  const q = filter.trim().toLowerCase();
  const visible = q
    ? all.filter(it => it.labelPl.toLowerCase().includes(q))
    : (expanded ? all : summaries);
  const hiddenCount = all.length - summaries.length;

  return (
    <div className="border-t border-slate-100 first:border-t-0">
      <button
        onClick={() => setExpanded(e => !e)}
        className="w-full flex items-center justify-between gap-3 px-3 py-2 bg-slate-50/70 hover:bg-slate-100/70 transition-colors text-left"
      >
        <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-slate-600">
          <span className={`inline-block w-3 text-slate-400 transition-transform ${expanded ? '' : '-rotate-90'}`}>▾</span>
          {t(section.tKey)}
          <span className="text-[10px] font-normal text-slate-400">({all.length} {t('comp.items')}{hiddenCount > 0 ? `, ${summaries.length} ${t('comp.summaries')}` : ''})</span>
        </span>
        <span className="text-[10px] text-slate-400">{expanded || q ? t('comp.collapseToSummaries') : `${t('comp.expand')} (+${hiddenCount})`}</span>
      </button>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <tbody>
            {visible.map((it, i) => {
              const summary = isSummaryRow(it.labelPl);
              return (
                <tr
                  key={it.id}
                  onClick={() => onRowClick?.(it)}
                  title={onRowClick ? 'Kliknij, aby zobaczyć szczegóły i porównanie 3 lat' : undefined}
                  className={`border-t border-slate-100 hover:bg-amber-50/40 ${onRowClick ? 'cursor-pointer' : ''} ${summary ? 'bg-slate-50/50 font-semibold text-slate-800' : `text-slate-600 ${i % 2 ? 'bg-slate-50/30' : ''}`}`}
                >
                  <td className="px-3 py-1.5 whitespace-nowrap" style={{ paddingLeft: summary ? 12 : 28 }}>{trLabel(lang, it)}</td>
                  <td className="px-3 py-1.5 text-right text-slate-500 w-28">{formatPLN(it.values.y2023)}</td>
                  <td className="px-3 py-1.5 text-right text-slate-500 w-28">{formatPLN(it.values.y2024)}</td>
                  <td className="px-3 py-1.5 text-right text-slate-700 font-medium w-28">{formatPLN(it.values.y2025)}</td>
                  <td className={`px-3 py-1.5 text-right font-semibold w-28 ${diffClass(it.deltaRY1)}`}>{formatDiff(it.deltaRY1)}</td>
                  <td className={`px-3 py-1.5 text-right w-20 ${it.deltaPctRY1 != null ? diffClass(it.deltaPctRY1) : 'text-slate-300'}`}>
                    {it.deltaPctRY1 != null ? `${(it.deltaPctRY1 * 100).toFixed(1)}%` : '—'}
                  </td>
                </tr>
              );
            })}
            {visible.length === 0 && (
              <tr><td colSpan={6} className="px-3 py-4 text-center text-slate-400 text-[11px]">{t('comp.noFilterMatch')}</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── ComparisonItemDrawer — szczegóły pozycji z zakładki Porównanie ─────────────

function ComparisonItemDrawer({ item, onClose }: { item: YearComparisonItem; onClose: () => void }) {
  const { lang, t } = useLang();
  const label = trLabel(lang, item);
  const barData = [
    { name: 'FY 2025', value: item.values.y2025, fy: '2025' },
    { name: 'FY 2024', value: item.values.y2024, fy: '2024' },
    { name: 'FY 2023', value: item.values.y2023, fy: '2023' },
  ];
  return (
    <Drawer
      title={label}
      subtitle={`FY2025: ${formatPLN(item.values.y2025)} · Δ r/r: ${formatDiff(item.deltaRY1)}${item.deltaPctRY1 != null ? ` (${(item.deltaPctRY1 * 100).toFixed(1)}%)` : ''}`}
      onClose={onClose}
    >
      {/* KPI row */}
      <div className="grid grid-cols-3 gap-2">
        <div className="rounded-lg border border-slate-100 bg-slate-50/60 p-2.5 text-center">
          <p className="text-[9px] text-slate-400 uppercase font-semibold">FY 2025</p>
          <p className={`text-sm font-bold ${diffClass(item.values.y2025)}`}>{formatPLN(item.values.y2025)}</p>
        </div>
        <div className="rounded-lg border border-slate-100 bg-slate-50/60 p-2.5 text-center">
          <p className="text-[9px] text-slate-400 uppercase font-semibold">Δ r/r</p>
          <p className={`text-sm font-bold ${diffClass(item.deltaRY1)}`}>{formatDiff(item.deltaRY1)}</p>
        </div>
        <div className="rounded-lg border border-slate-100 bg-slate-50/60 p-2.5 text-center">
          <p className="text-[9px] text-slate-400 uppercase font-semibold">Δ%</p>
          <p className={`text-sm font-bold ${item.deltaPctRY1 != null ? diffClass(item.deltaPctRY1) : 'text-slate-300'}`}>
            {item.deltaPctRY1 != null ? `${(item.deltaPctRY1 * 100).toFixed(1)}%` : '—'}
          </p>
        </div>
      </div>

      {/* Grouped BarChart: FY2023 / FY2024 / FY2025 */}
      <div>
        <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide mb-2">{t('report.trend3years')}</p>
        <ResponsiveContainer width="100%" height={180}>
          <BarChart data={barData} margin={{ left: -10, right: 8, top: 4, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
            <XAxis dataKey="name" tick={{ fontSize: 10, fill: '#64748b' }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 9, fill: '#94a3b8' }} axisLine={false} tickLine={false} tickFormatter={v => plnM(Number(v))} width={48} />
            <Tooltip formatter={(v) => [`${formatPLN(Number(v))} PLN`]} contentStyle={TOOLTIP_STYLE} />
            <ReferenceLine y={0} stroke="#e2e8f0" />
            <Bar dataKey="value" radius={[4, 4, 0, 0]} maxBarSize={40}>
              {barData.map((d, i) => (
                <Cell key={i} fill={HISTORY_COLORS[d.fy] ?? '#94a3b8'} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Tabela 3 lat */}
      <div className="rounded-xl border border-slate-100 overflow-hidden">
        <table className="w-full text-xs">
          <thead className="bg-slate-50 text-slate-500 uppercase text-[10px] tracking-wide">
            <tr>
              <th className="text-center px-3 py-2">FY 2023</th>
              <th className="text-center px-3 py-2">FY 2024</th>
              <th className="text-center px-3 py-2">FY 2025</th>
              <th className="text-center px-3 py-2">Δ</th>
              <th className="text-center px-3 py-2">Δ%</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td className="text-center px-3 py-2 text-slate-500">{formatPLN(item.values.y2023)}</td>
              <td className="text-center px-3 py-2 text-slate-500">{formatPLN(item.values.y2024)}</td>
              <td className={`text-center px-3 py-2 font-semibold ${diffClass(item.values.y2025)}`}>{formatPLN(item.values.y2025)}</td>
              <td className={`text-center px-3 py-2 font-semibold ${diffClass(item.deltaRY1)}`}>{formatDiff(item.deltaRY1)}</td>
              <td className={`text-center px-3 py-2 ${item.deltaPctRY1 != null ? diffClass(item.deltaPctRY1) : 'text-slate-300'}`}>
                {item.deltaPctRY1 != null ? `${(item.deltaPctRY1 * 100).toFixed(1)}%` : '—'}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </Drawer>
  );
}

function PorownanieTab({ items, comparisonLabel }: { items: YearComparisonItem[]; comparisonLabel: string }) {
  const { t, lang } = useLang();
  const [filter, setFilter] = useState('');
  const [selectedItem, setSelectedItem] = useState<YearComparisonItem | null>(null);
  const [inneHoverIdx, setInneHoverIdx] = useState<number | null>(null);

  const topMovers = useMemo(() =>
    [...items].sort((a, b) => Math.abs(b.deltaRY1) - Math.abs(a.deltaRY1)).slice(0, 5),
    [items]);

  const topPctMovers = useMemo(() =>
    [...items]
      .filter(it => it.deltaPctRY1 != null && Math.abs(it.values.y2024) > 50_000)
      .sort((a, b) => Math.abs(b.deltaPctRY1!) - Math.abs(a.deltaPctRY1!))
      .slice(0, 8)
      .reverse(),
    [items]);

  // Marże wg działów — porównanie wieloosiowe (radar) 3 lat — alternatywne spojrzenie na sezonowość/trwałość zmian
  const allMarginDepts = useMemo(() => items
    .filter(it => it.labelPl.startsWith('MARŻA USŁUGI'))
    .map(it => ({
      dept: (s => s.charAt(0) + s.slice(1).toLowerCase())(it.labelPl.replace('MARŻA USŁUGI ', '')),
      y2023: it.values.y2023,
      y2024: it.values.y2024,
      y2025: it.values.y2025,
      item: it,
    })), [items]);

  const marginRadar = useMemo(() => {
    // Sort by abs(y2025) desc, keep top 7, rest → "Inne"
    const sorted = [...allMarginDepts].sort((a, b) => Math.abs(b.y2025) - Math.abs(a.y2025));
    const topN = sorted.slice(0, 7);
    const rest = sorted.slice(7);
    const rows = [...topN];
    if (rest.length > 0) {
      rows.push({
        dept: 'Inne',
        y2023: rest.reduce((s, d) => s + d.y2023, 0),
        y2024: rest.reduce((s, d) => s + d.y2024, 0),
        y2025: rest.reduce((s, d) => s + d.y2025, 0),
        item: rest[0].item,
      });
    }
    return rows;
  }, [allMarginDepts]);

  const marginInneDepts = useMemo(() =>
    [...allMarginDepts]
      .sort((a, b) => Math.abs(b.y2025) - Math.abs(a.y2025))
      .slice(7),
    [allMarginDepts]);



  return (
    <div className="space-y-4">
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
        <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide mb-3">{t('comp.topChanges')}</p>
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
          {topMovers.map(m => (
            <button
              key={m.id}
              onClick={() => setSelectedItem(m)}
              title={`${trLabel(lang, m)} — kliknij, aby zobaczyć szczegóły`}
              className="rounded-lg border border-slate-100 p-2.5 bg-slate-50/60 min-w-0 text-left hover:border-amber-300 hover:bg-amber-50/40 hover:shadow-sm transition-all cursor-pointer"
            >
              <p className="text-[10px] text-slate-500 truncate">{trLabel(lang, m)}</p>
              <p className={`text-sm font-bold ${diffClass(m.deltaRY1)}`}>{formatDiff(m.deltaRY1)}</p>
              {m.deltaPctRY1 != null && (
                <p className={`text-[10px] ${diffClass(m.deltaPctRY1)}`}>{(m.deltaPctRY1 * 100).toFixed(1)}%</p>
              )}
            </button>
          ))}
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="flex items-center justify-between gap-3 px-3 py-2 border-b border-slate-100">
          <p className="text-[11px] text-slate-400">{comparisonLabel} · {t('comp.sectionsHint')}</p>
          <input
            type="search"
            value={filter}
            onChange={e => setFilter(e.target.value)}
            placeholder={t('comp.filterPlaceholder')}
            className="w-52 px-2.5 py-1 text-xs rounded-lg border border-slate-200 bg-slate-50 focus:outline-none focus:border-amber-400 focus:bg-white transition-colors"
          />
        </div>
        <table className="w-full text-xs">
          <thead className="bg-slate-50 text-slate-500 uppercase text-[10px] tracking-wide">
            <tr>
              <th className="text-left px-3 py-2">{t('chart.position')}</th>
              <th className="text-right px-3 py-2 w-28">2023</th>
              <th className="text-right px-3 py-2 w-28">2024</th>
              <th className="text-right px-3 py-2 w-28">2025</th>
              <th className="text-right px-3 py-2 w-28">{t('comp.delta2024to2025')}</th>
              <th className="text-right px-3 py-2 w-20">{t('comp.pctChange')}</th>
            </tr>
          </thead>
        </table>
        {COMPARISON_SECTIONS.map(section => (
          <ComparisonSection key={section.tKey} section={section} items={items} filter={filter} onRowClick={setSelectedItem} />
        ))}
      </div>

      {/* Ciekawe wykresy podsumowujące porównanie 3 lat */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="relative">
          <ChartCard
            title={t('comp.radarTitle')}
            subtitle={t('comp.radarSubtitle')}
            height={320}
          >
            <BarChart
              data={marginRadar.map(r => ({ name: r.dept, y2023: r.y2023, y2024: r.y2024, y2025: r.y2025 }))}
              margin={{ left: 4, right: 4, top: 4, bottom: 4 }}
              onMouseMove={(state: any) => {
                if (state?.activeTooltipIndex != null && marginInneDepts.length > 0 && state.activeTooltipIndex === marginRadar.length - 1) {
                  setInneHoverIdx(state.activeTooltipIndex);
                } else {
                  setInneHoverIdx(null);
                }
              }}
              onMouseLeave={() => setInneHoverIdx(null)}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
              <XAxis dataKey="name" tick={{ fontSize: 8, fill: '#64748b' }} interval={0} />
              <YAxis tick={{ fontSize: 8, fill: '#94a3b8' }} tickFormatter={v => plnM(Number(v))} width={44} />
              <Tooltip formatter={(v, name) => [`${formatPLN(Number(v))} PLN`, `FY ${String(name).replace('y', '')}`]} contentStyle={TOOLTIP_STYLE} />
              <Legend formatter={(v) => `FY ${String(v).replace('y', '')}`} wrapperStyle={{ fontSize: 10 }} />
              <Bar dataKey="y2025" name="2025" fill={HISTORY_COLORS['2025']} radius={[3, 3, 0, 0]} maxBarSize={14} shape={Bar3DShape} cursor="pointer"
                onClick={(_, idx) => { if (marginRadar[idx]?.item && marginRadar[idx].dept !== 'Inne') setSelectedItem(marginRadar[idx].item); }} />
              <Bar dataKey="y2024" name="2024" fill={HISTORY_COLORS['2024']} radius={[3, 3, 0, 0]} maxBarSize={14} shape={Bar3DShape} cursor="pointer"
                onClick={(_, idx) => { if (marginRadar[idx]?.item && marginRadar[idx].dept !== 'Inne') setSelectedItem(marginRadar[idx].item); }} />
              <Bar dataKey="y2023" name="2023" fill={HISTORY_COLORS['2023']} radius={[3, 3, 0, 0]} maxBarSize={14} shape={Bar3DShape} cursor="pointer"
                onClick={(_, idx) => { if (marginRadar[idx]?.item && marginRadar[idx].dept !== 'Inne') setSelectedItem(marginRadar[idx].item); }} />
            </BarChart>
          </ChartCard>

          {/* "Inne" hover detail panel */}
          {inneHoverIdx != null && marginInneDepts.length > 0 && (
            <div className="absolute right-0 top-0 z-20 bg-white border border-slate-200 rounded-xl shadow-xl p-3 w-56 pointer-events-none">
              <p className="text-[10px] font-bold text-slate-600 uppercase tracking-wide mb-2">Pozostałe działy</p>
              <div className="space-y-1">
                {marginInneDepts.map((d, i) => (
                  <div key={i} className="flex items-center justify-between gap-2">
                    <span className="text-[10px] text-slate-600 truncate flex-1">{d.dept}</span>
                    <span className={`text-[10px] font-semibold tabular-nums ${d.y2025 >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                      {formatPLN(d.y2025)}
                    </span>
                  </div>
                ))}
              </div>
              <div className="mt-2 pt-2 border-t border-slate-100 flex justify-between">
                <span className="text-[9px] text-slate-400">Razem FY2025</span>
                <span className="text-[10px] font-bold text-slate-700">{formatPLN(marginInneDepts.reduce((s, d) => s + d.y2025, 0))}</span>
              </div>
            </div>
          )}
        </div>

        <ChartCard
          title={t('comp.topPctTitle')}
          subtitle={t('comp.topPctSubtitle')}
          height={320}
        >
          <BarChart data={topPctMovers.map(m => ({ name: trLabel(lang, m), pct: (m.deltaPctRY1 ?? 0) }))} layout="vertical" margin={{ left: 8, right: 24 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
            <XAxis type="number" tick={{ fontSize: 9, fill: '#94a3b8' }} axisLine={false} tickLine={false} tickFormatter={v => `${(Number(v) * 100).toFixed(0)}%`} />
            <YAxis type="category" dataKey="name" width={150} tick={{ fontSize: 9.5, fill: '#64748b' }} axisLine={false} tickLine={false} />
            <Tooltip formatter={(v) => [`${(Number(v) * 100).toFixed(1)}%`, t('comp.yoyChange')]} contentStyle={TOOLTIP_STYLE} />
            <ReferenceLine x={0} stroke="#e2e8f0" />
            <Bar dataKey="pct" radius={[0, 4, 4, 0]} maxBarSize={14} cursor="pointer" onClick={(_, idx) => setSelectedItem(topPctMovers[idx])}>
              {topPctMovers.map((m, i) => <Cell key={i} fill={(m.deltaPctRY1 ?? 0) >= 0 ? C.pos : C.neg} />)}
            </Bar>
          </BarChart>
        </ChartCard>
      </div>

      {selectedItem && (
        <ComparisonItemDrawer item={selectedItem} onClose={() => setSelectedItem(null)} />
      )}
    </div>
  );
}

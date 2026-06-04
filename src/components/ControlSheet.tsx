import { useMemo } from 'react';
import { useCompanies } from '../store/CompaniesContext';
import {
  checkCompleteness, checkBilansBalance, checkDoubleEntry,
  checkAccountBalances, checkJournalCompleteness, checkObrotySumsMatchZapisy,
  computeRatios, computeStats,
  type CheckResult, type CheckStatus, type RatioResult,
} from '../lib/controlChecks';

// ── Macro data — źródło: GUS / NBP / EXCO, tabela 2010–2026 ──────────────────

// Lata wyświetlane w tabeli historycznej (od najnowszego)
const MACRO_YEARS = [2026, 2025, 2024, 2023, 2022, 2021, 2020] as const;
type MacroYear = typeof MACRO_YEARS[number];

interface MacroSeries {
  label: string;
  unit: string;
  source: string;
  values: Partial<Record<MacroYear, number>>;
  highlight?: boolean; // podświetl jako istotny dla okresu sprawozdawczego
  fmt?: 'pct' | 'pln' | 'num' | 'idx';
}

const MACRO_DATA: MacroSeries[] = [
  {
    label: 'Wskaźnik inflacji (GUS)',
    unit: 'indeks (100=poprz. rok)',
    source: 'GUS / EXCO 2026',
    highlight: true,
    fmt: 'idx',
    values: { 2026: 103.0, 2025: 103.7, 2024: 103.6, 2023: 111.4, 2022: 114.4, 2021: 105.1, 2020: 103.4 },
  },
  {
    label: 'Inflacja % r/r',
    unit: '%',
    source: 'GUS / EXCO 2026',
    highlight: true,
    fmt: 'pct',
    values: { 2026: 2.95, 2025: 3.65, 2024: 3.60, 2023: 11.40, 2022: 14.40, 2021: 5.10, 2020: 3.40 },
  },
  {
    label: 'Wskaźnik usług biznesowych',
    unit: 'indeks',
    source: 'EXCO 2026',
    fmt: 'idx',
    values: { 2024: 106.5, 2023: 110.8, 2022: 118.0, 2021: 113.1, 2020: 105.7, 2019: 113.0 } as any,
  },
  {
    label: 'Wskaźnik usług rachunkowo-księgowych',
    unit: 'indeks',
    source: 'EXCO 2026',
    fmt: 'idx',
    values: { 2024: 104.5, 2023: 114.8, 2022: 118.5, 2021: 115.2, 2020: 101.6, 2019: 116.8 } as any,
  },
  {
    label: 'Kurs EUR/PLN (średni roczny)',
    unit: 'PLN',
    source: 'NBP / EXCO 2026',
    highlight: true,
    fmt: 'num',
    values: { 2026: 4.2000, 2025: 4.3000, 2024: 4.2730, 2023: 4.3480, 2022: 4.6899, 2021: 4.5775, 2020: 4.5268 },
  },
  {
    label: 'WIBOR 3M (śr. roczny)',
    unit: '%',
    source: 'NBP / EXCO 2026',
    highlight: true,
    fmt: 'pct',
    values: { 2026: 3.70, 2025: 4.20, 2024: 5.84, 2023: 5.87, 2022: 7.02, 2021: 2.54, 2020: 0.21 },
  },
  {
    label: 'EURIBOR 3M (śr. roczny)',
    unit: '%',
    source: 'ECB / EXCO 2026',
    fmt: 'pct',
    values: { 2026: 1.90, 2025: 2.10, 2024: 2.72, 2023: 3.35, 2022: 2.13, 2021: -0.57, 2020: -0.55 },
  },
  {
    label: 'Minimalne wynagrodzenie',
    unit: 'PLN/mies.',
    source: 'Dz.U. / EXCO 2026',
    fmt: 'pln',
    values: { 2026: 4806, 2025: 4666, 2024: 4300, 2023: 3600, 2022: 3010, 2021: 2800, 2020: 2600 },
  },
  {
    label: 'Przeciętne wynagrodzenie (przedsiębiorstwa)',
    unit: 'PLN/mies.',
    source: 'GUS / EXCO 2026',
    fmt: 'pln',
    values: { 2026: 9420.00, 2025: 8904.55, 2024: 8265.92, 2023: 7444.39, 2022: 6653.67, 2021: 5889.84, 2020: 5411.45 },
  },
  {
    label: 'Stopa bezrobocia',
    unit: '%',
    source: 'GUS / EXCO 2026',
    fmt: 'pct',
    values: { 2026: 6.30, 2025: 5.00, 2024: 5.10, 2023: 5.18, 2022: 5.39, 2021: 5.96, 2020: 5.93 },
  },
  {
    label: 'PKB',
    unit: 'mld PLN',
    source: 'GUS / EXCO 2026',
    fmt: 'num',
    values: { 2026: 3070.27, 2025: 2962.15, 2024: 2863.37, 2023: 2774.58, 2022: 2769.04, 2021: 2622.20, 2020: 2323.90 },
  },
];

function fmtMacro(v: number | undefined, fmt: MacroSeries['fmt']): string {
  if (v === undefined) return '—';
  if (fmt === 'pct') return `${v.toFixed(2)}%`;
  if (fmt === 'pln') return new Intl.NumberFormat('pl-PL', { minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(v);
  if (fmt === 'idx') return v.toFixed(1);
  return new Intl.NumberFormat('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 4 }).format(v);
}

// Lata odpowiadające okresowi sprawozdawczemu (10.2024–09.2025) → 2024 i 2025
const PERIOD_YEARS: MacroYear[] = [2025, 2024];

// ── Sub-components ──────────────────────────────────────────────────────────

function statusDot(s: CheckStatus) {
  const cls: Record<CheckStatus, string> = {
    ok:      'bg-emerald-500',
    error:   'bg-red-500',
    warning: 'bg-amber-400',
    nodata:  'bg-slate-300',
    loading: 'bg-blue-400 animate-pulse',
  };
  return <span className={`inline-block w-2.5 h-2.5 rounded-full shrink-0 ${cls[s]}`} />;
}

function statusBadge(s: CheckStatus, small = false) {
  const map: Record<CheckStatus, [string, string]> = {
    ok:      ['OK', 'bg-emerald-100 text-emerald-700'],
    error:   ['BŁĄD', 'bg-red-100 text-red-700'],
    warning: ['UWAGA', 'bg-amber-100 text-amber-700'],
    nodata:  ['BRAK', 'bg-slate-100 text-slate-500'],
    loading: ['…', 'bg-blue-100 text-blue-600'],
  };
  const [label, cls] = map[s];
  return (
    <span className={`font-semibold rounded px-1.5 py-0.5 ${small ? 'text-[10px]' : 'text-xs'} ${cls}`}>
      {label}
    </span>
  );
}

function SectionHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="mt-8 mb-3 flex items-baseline gap-3">
      <h2 className="text-sm font-semibold text-slate-700 uppercase tracking-wide">{title}</h2>
      {subtitle && <span className="text-xs text-slate-400">{subtitle}</span>}
    </div>
  );
}

function CheckRow({ c }: { c: CheckResult }) {
  return (
    <div className="flex items-start gap-3 py-2.5 border-b border-slate-100 last:border-0">
      <div className="pt-0.5">{statusDot(c.status)}</div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm text-slate-700">{c.name}</span>
          {statusBadge(c.status)}
        </div>
        {(c.value || c.expected || c.detail) && (
          <div className="mt-0.5 text-xs text-slate-500 flex flex-wrap gap-x-3 gap-y-0.5">
            {c.value && <span>{c.value}</span>}
            {c.expected && <span className="text-slate-400">oczekiwane: {c.expected}</span>}
            {c.detail && <span className={c.status === 'error' ? 'text-red-600 font-medium' : 'text-amber-600'}>{c.detail}</span>}
          </div>
        )}
      </div>
    </div>
  );
}

function RatioCard({ r }: { r: RatioResult }) {
  function fmtVal(v: number | null, unit: string) {
    if (v === null) return <span className="text-slate-300">—</span>;
    const s = unit === '%'
      ? `${v.toFixed(1)} %`
      : unit === 'dni'
        ? `${Math.round(v)} dni`
        : v.toFixed(2);
    return <span>{s}</span>;
  }

  const s1 = r.status1 ?? 'nodata';
  const borderCls = s1 === 'error' ? 'border-red-200' : s1 === 'warning' ? 'border-amber-200' : s1 === 'ok' ? 'border-emerald-200' : 'border-slate-200';

  return (
    <div className={`bg-white rounded-lg border ${borderCls} p-3 flex flex-col gap-1.5`}>
      <div className="flex items-start justify-between gap-2">
        <span className="text-xs font-medium text-slate-600 leading-snug">{r.name}</span>
        {statusBadge(s1, true)}
      </div>
      <div className="flex items-end gap-3 mt-auto">
        <div>
          <div className="text-[10px] text-slate-400 mb-0.5">Okres 1</div>
          <div className="text-base font-semibold text-slate-800">{fmtVal(r.value1, r.unit ?? '')}</div>
        </div>
        {r.value2 !== undefined && (
          <div>
            <div className="text-[10px] text-slate-400 mb-0.5">Okres 2</div>
            <div className="text-sm font-medium text-slate-500">{fmtVal(r.value2, r.unit ?? '')}</div>
          </div>
        )}
      </div>
      <div className="text-[10px] text-slate-400 font-mono leading-tight">{r.formula}</div>
      {r.norm && <div className="text-[10px] text-slate-400">Norma: <span className="text-slate-500">{r.norm}</span></div>}
    </div>
  );
}

function MacroTable() {
  // Show only highlighted rows above the fold, rest in expandable section
  const highlighted = MACRO_DATA.filter(s => s.highlight);
  const rest        = MACRO_DATA.filter(s => !s.highlight);

  function row(s: MacroSeries, idx: number) {
    const v24 = (s.values as any)[2024] as number | undefined;
    const v25 = (s.values as any)[2025] as number | undefined;
    const v26 = (s.values as any)[2026] as number | undefined;

    // Trend arrow: compare latest two available values
    const latest = v26 ?? v25;
    const prev   = v26 !== undefined ? v25 : v24;
    const arrow = (latest !== undefined && prev !== undefined)
      ? latest > prev ? '↑' : latest < prev ? '↓' : '→'
      : null;
    const arrowCls = arrow === '↑' ? 'text-emerald-500' : arrow === '↓' ? 'text-rose-400' : 'text-slate-300';

    return (
      <tr key={s.label} className={idx % 2 === 0 ? 'bg-white' : 'bg-slate-50'}>
        <td className="px-3 py-2 text-xs text-slate-700 font-medium">{s.label}</td>
        <td className="px-2 py-2 text-xs text-slate-500 text-right">{s.unit}</td>
        {MACRO_YEARS.map(y => {
          const val = (s.values as any)[y] as number | undefined;
          const isPeriod = PERIOD_YEARS.includes(y);
          return (
            <td key={y} className={`px-2 py-2 text-xs text-right tabular-nums ${isPeriod ? 'font-semibold text-slate-800 bg-blue-50/50' : 'text-slate-600'}`}>
              {fmtMacro(val, s.fmt)}
            </td>
          );
        })}
        <td className={`px-2 py-2 text-center text-sm font-bold ${arrowCls}`}>{arrow ?? ''}</td>
        <td className="px-2 py-2 text-[10px] text-slate-400">{s.source}</td>
      </tr>
    );
  }

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-x-auto">
      <div className="px-3 py-2 bg-slate-50 border-b border-slate-200 flex items-center gap-2">
        <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Podstawowe wskaźniki makroekonomiczne — Polska 2020–2026</span>
        <span className="text-[10px] text-slate-400">(*) 2026 — dane szacunkowe / prognoza</span>
        <span className="ml-auto text-[10px] text-blue-600 font-medium">Kolumny niebieskie = okres sprawozdawczy 10.2024–09.2025</span>
      </div>
      <table className="w-full text-left border-collapse min-w-[700px]">
        <thead>
          <tr className="border-b border-slate-200">
            <th className="px-3 py-2 text-[10px] font-semibold text-slate-500 uppercase tracking-wide">Wskaźnik</th>
            <th className="px-2 py-2 text-[10px] font-semibold text-slate-500 uppercase tracking-wide text-right">Jednostka</th>
            {MACRO_YEARS.map(y => (
              <th key={y} className={`px-2 py-2 text-[10px] font-semibold uppercase tracking-wide text-right ${PERIOD_YEARS.includes(y) ? 'text-blue-600 bg-blue-50/50' : 'text-slate-500'}`}>
                {y}{y === 2026 ? '*' : ''}
              </th>
            ))}
            <th className="px-2 py-2 text-[10px] font-semibold text-slate-500 uppercase">Trend</th>
            <th className="px-2 py-2 text-[10px] font-semibold text-slate-500 uppercase">Źródło</th>
          </tr>
        </thead>
        <tbody>
          {highlighted.map((s, i) => row(s, i))}
          <tr className="bg-slate-100">
            <td colSpan={MACRO_YEARS.length + 4} className="px-3 py-1.5 text-[10px] text-slate-400 font-semibold uppercase tracking-wide">
              Wynagrodzenia i rynek pracy
            </td>
          </tr>
          {rest.map((s, i) => row(s, highlighted.length + i))}
        </tbody>
      </table>
    </div>
  );
}

function StatCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="bg-white rounded-lg border border-slate-200 p-3">
      <div className="text-[10px] text-slate-400 uppercase tracking-wide mb-1">{label}</div>
      <div className="text-base font-semibold text-slate-800">{value}</div>
      {sub && <div className="text-[10px] text-slate-400 mt-0.5">{sub}</div>}
    </div>
  );
}

// ── Main component ──────────────────────────────────────────────────────────

export default function ControlSheet() {
  const { activeCompany, zapisyLoading } = useCompanies();

  const bilans  = activeCompany?.bilans  ?? [];
  const rzis    = activeCompany?.rzis    ?? [];
  const obroty  = activeCompany?.obroty  ?? [];
  const zapisy  = activeCompany?.zapisy  ?? [];

  const completeness = useMemo(() =>
    checkCompleteness(bilans, rzis, obroty, zapisy, zapisyLoading),
    [bilans, rzis, obroty, zapisy, zapisyLoading]
  );

  const integrityChecks = useMemo(() => [
    ...checkBilansBalance(bilans),
    checkDoubleEntry(zapisy),
    checkAccountBalances(obroty),
    checkJournalCompleteness(zapisy),
    checkObrotySumsMatchZapisy(obroty, zapisy),
  ], [bilans, obroty, zapisy]);

  const ratios = useMemo(() => computeRatios(bilans, rzis), [bilans, rzis]);

  const stats = useMemo(() => computeStats(bilans, rzis, obroty, zapisy), [bilans, rzis, obroty, zapisy]);

  const okCount   = integrityChecks.filter(c => c.status === 'ok').length;
  const errCount  = integrityChecks.filter(c => c.status === 'error').length;
  const warnCount = integrityChecks.filter(c => c.status === 'warning').length;

  if (!activeCompany) {
    return (
      <div className="flex-1 flex items-center justify-center text-slate-400 text-sm">
        Brak aktywnej firmy — zaimportuj dane
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-5xl mx-auto px-4 py-5">

        {/* ── Header summary bar ── */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 mb-2 flex flex-wrap items-center gap-4">
          <div>
            <div className="text-xs text-slate-400 uppercase tracking-wide">Firma</div>
            <div className="text-sm font-semibold text-slate-800">{activeCompany.name}</div>
          </div>
          <div>
            <div className="text-xs text-slate-400 uppercase tracking-wide">Okres</div>
            <div className="text-sm font-semibold text-slate-800">{activeCompany.period}</div>
          </div>
          <div className="ml-auto flex items-center gap-2">
            {errCount > 0  && <span className="text-xs bg-red-100 text-red-700 font-semibold px-2 py-1 rounded-full">{errCount} błąd{errCount > 1 ? 'y' : ''}</span>}
            {warnCount > 0 && <span className="text-xs bg-amber-100 text-amber-700 font-semibold px-2 py-1 rounded-full">{warnCount} ostrzeżenie{warnCount > 1 ? 'ń' : ''}</span>}
            {errCount === 0 && warnCount === 0 && okCount > 0 && (
              <span className="text-xs bg-emerald-100 text-emerald-700 font-semibold px-2 py-1 rounded-full">Wszystkie kontrole OK</span>
            )}
          </div>
        </div>

        {/* ── 1. Completeness ── */}
        <SectionHeader title="Kompletność danych" />
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm divide-y divide-slate-100">
          {completeness.map(c => <CheckRow key={c.id} c={c} />)}
        </div>

        {/* ── 2. Integrity checks ── */}
        <SectionHeader
          title="Kontrole integralności"
          subtitle={`${okCount} OK · ${errCount} błąd · ${warnCount} uwaga · ${integrityChecks.filter(c => c.status === 'nodata').length} brak danych`}
        />
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm divide-y divide-slate-100">
          {integrityChecks.map(c => <CheckRow key={c.id} c={c} />)}
        </div>

        {/* ── 3. Financial ratios ── */}
        <SectionHeader title="Wskaźniki finansowe" subtitle="Obliczone z danych bilansu i RZiS" />
        {bilans.length === 0 && rzis.length === 0 ? (
          <div className="bg-white rounded-xl border border-slate-200 p-6 text-center text-slate-400 text-sm">
            Brak danych bilansu / RZiS — zaimportuj pliki Excel
          </div>
        ) : (
          <>
            <div className="mb-2 text-xs text-slate-400">
              Okres 1 = bieżący · Okres 2 = porównawczy · — = brak danych do obliczenia
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
              {ratios.map(r => <RatioCard key={r.id} r={r} />)}
            </div>
          </>
        )}

        {/* ── 4. Macro data ── */}
        <SectionHeader title="Dane makroekonomiczne" subtitle="GUS · NBP · EXCO · stan VI 2026 · (*) prognoza/szacunek" />
        <MacroTable />

        {/* ── 5. Statistics ── */}
        <SectionHeader title="Statystyki dokumentu" />
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2 mb-8">
          <StatCard label="Wiersze bilansu" value={String(stats.bilansRows)} />
          <StatCard label="Wiersze RZiS" value={String(stats.rzisRows)} />
          <StatCard label="Konta (obroty)" value={stats.obrotyCounts.toLocaleString('pl-PL')} />
          <StatCard
            label="Zapisy FK"
            value={stats.zapisyCount > 0 ? stats.zapisyCount.toLocaleString('pl-PL') : '—'}
            sub={zapisyLoading ? 'Ładowanie…' : undefined}
          />
          <StatCard
            label="Zakres dat"
            value={stats.zapisyDateMin && stats.zapisyDateMax ? `${stats.zapisyDateMin}` : '—'}
            sub={stats.zapisyDateMax ? `do ${stats.zapisyDateMax}` : undefined}
          />
          <StatCard
            label="Unikalne konta (FK)"
            value={stats.uniqueAccounts > 0 ? stats.uniqueAccounts.toLocaleString('pl-PL') : '—'}
          />
          <StatCard
            label="Dokumenty FK"
            value={stats.uniqueDocuments > 0 ? stats.uniqueDocuments.toLocaleString('pl-PL') : '—'}
          />
          <StatCard
            label="Obroty FK Wn"
            value={stats.sumWn > 0 ? `${(stats.sumWn / 1_000_000).toFixed(1)} M PLN` : '—'}
          />
        </div>

      </div>
    </div>
  );
}

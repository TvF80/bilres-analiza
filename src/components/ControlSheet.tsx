import { useMemo } from 'react';
import { useLang } from '../i18n/LanguageContext';
import { useCompanies } from '../store/CompaniesContext';
import {
  checkCompleteness, checkBilansBalance, checkDoubleEntry,
  checkAccountBalances, checkJournalCompleteness, checkObrotySumsMatchZapisy,
  computeRatios, computeStats,
  type CheckResult, type CheckStatus, type RatioResult,
} from '../lib/controlChecks';
import { mapFields, FIELD_LABELS } from '../lib/fieldMapping';
import grpRaw from '../data/grpData.json';
import type { GrpData } from '../types';

// ── Macro data — źródło: GUS / NBP / EXCO, tabela 2010–2026 ──────────────────

// Lata wyświetlane w tabeli historycznej (od najnowszego)
const MACRO_YEARS = [2026, 2025, 2024, 2023, 2022, 2021, 2020] as const;
type MacroYear = typeof MACRO_YEARS[number];

interface MacroSeries {
  label: string;
  key: string;
  unit: string;
  source: string;
  values: Partial<Record<MacroYear, number>>;
  highlight?: boolean;
  fmt?: 'pct' | 'pln' | 'num' | 'idx';
}

const MACRO_DATA: MacroSeries[] = [
  {
    label: 'Wskaźnik inflacji (GUS)',
    key: 'macro.inflation',
    unit: 'indeks (100=poprz. rok)',
    source: 'GUS / EXCO 2026',
    highlight: true,
    fmt: 'idx',
    values: { 2026: 103.0, 2025: 103.7, 2024: 103.6, 2023: 111.4, 2022: 114.4, 2021: 105.1, 2020: 103.4 },
  },
  {
    label: 'Inflacja % r/r',
    key: 'macro.inflationPct',
    unit: '%',
    source: 'GUS / EXCO 2026',
    highlight: true,
    fmt: 'pct',
    values: { 2026: 2.95, 2025: 3.65, 2024: 3.60, 2023: 11.40, 2022: 14.40, 2021: 5.10, 2020: 3.40 },
  },
  {
    label: 'Wskaźnik usług biznesowych',
    key: 'macro.businessServices',
    unit: 'indeks',
    source: 'EXCO 2026',
    fmt: 'idx',
    values: { 2024: 106.5, 2023: 110.8, 2022: 118.0, 2021: 113.1, 2020: 105.7, 2019: 113.0 } as any,
  },
  {
    label: 'Wskaźnik usług rachunkowo-księgowych',
    key: 'macro.accountingServices',
    unit: 'indeks',
    source: 'EXCO 2026',
    fmt: 'idx',
    values: { 2024: 104.5, 2023: 114.8, 2022: 118.5, 2021: 115.2, 2020: 101.6, 2019: 116.8 } as any,
  },
  {
    label: 'Kurs EUR/PLN (średni roczny)',
    key: 'macro.eurPln',
    unit: 'PLN',
    source: 'NBP / EXCO 2026',
    highlight: true,
    fmt: 'num',
    values: { 2026: 4.2000, 2025: 4.3000, 2024: 4.2730, 2023: 4.3480, 2022: 4.6899, 2021: 4.5775, 2020: 4.5268 },
  },
  {
    label: 'WIBOR 3M (śr. roczny)',
    key: 'macro.wibor3m',
    unit: '%',
    source: 'NBP / EXCO 2026',
    highlight: true,
    fmt: 'pct',
    values: { 2026: 3.70, 2025: 4.20, 2024: 5.84, 2023: 5.87, 2022: 7.02, 2021: 2.54, 2020: 0.21 },
  },
  {
    label: 'EURIBOR 3M (śr. roczny)',
    key: 'macro.euribor3m',
    unit: '%',
    source: 'ECB / EXCO 2026',
    fmt: 'pct',
    values: { 2026: 1.90, 2025: 2.10, 2024: 2.72, 2023: 3.35, 2022: 2.13, 2021: -0.57, 2020: -0.55 },
  },
  {
    label: 'Minimalne wynagrodzenie',
    key: 'macro.minWage',
    unit: 'PLN/mies.',
    source: 'Dz.U. / EXCO 2026',
    fmt: 'pln',
    values: { 2026: 4806, 2025: 4666, 2024: 4300, 2023: 3600, 2022: 3010, 2021: 2800, 2020: 2600 },
  },
  {
    label: 'Przeciętne wynagrodzenie (przedsiębiorstwa)',
    key: 'macro.avgWage',
    unit: 'PLN/mies.',
    source: 'GUS / EXCO 2026',
    fmt: 'pln',
    values: { 2026: 9420.00, 2025: 8904.55, 2024: 8265.92, 2023: 7444.39, 2022: 6653.67, 2021: 5889.84, 2020: 5411.45 },
  },
  {
    label: 'Stopa bezrobocia',
    key: 'macro.unemployment',
    unit: '%',
    source: 'GUS / EXCO 2026',
    fmt: 'pct',
    values: { 2026: 6.30, 2025: 5.00, 2024: 5.10, 2023: 5.18, 2022: 5.39, 2021: 5.96, 2020: 5.93 },
  },
  {
    label: 'PKB',
    key: 'macro.gdp',
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

function statusBadge(s: CheckStatus, small = false, t?: (key: string, params?: Record<string, string | number>) => string) {
  const labelMap: Record<CheckStatus, string> = t
    ? { ok: t('status.ok'), error: t('status.error'), warning: t('status.warning'), nodata: t('status.nodata'), loading: '…' }
    : { ok: 'OK', error: 'BŁĄD', warning: 'UWAGA', nodata: 'BRAK', loading: '…' };
  const clsMap: Record<CheckStatus, string> = {
    ok:      'bg-emerald-100 text-emerald-700',
    error:   'bg-red-100 text-red-700',
    warning: 'bg-amber-100 text-amber-700',
    nodata:  'bg-slate-100 text-slate-500',
    loading: 'bg-blue-100 text-blue-600',
  };
  const label = labelMap[s];
  const cls = clsMap[s];
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
  const { t } = useLang();
  return (
    <div className="flex items-start gap-3 py-2.5 border-b border-slate-100 last:border-0">
      <div className="pt-0.5">{statusDot(c.status)}</div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm text-slate-700">{c.name}</span>
          {statusBadge(c.status, false, t)}
        </div>
        {(c.value || c.expected || c.detail) && (
          <div className="mt-0.5 text-xs text-slate-500 flex flex-wrap gap-x-3 gap-y-0.5">
            {c.value && <span>{c.value}</span>}
            {c.expected && <span className="text-slate-400">{t('control.expected')} {c.expected}</span>}
            {c.detail && <span className={c.status === 'error' ? 'text-red-600 font-medium' : 'text-amber-600'}>{c.detail}</span>}
          </div>
        )}
      </div>
    </div>
  );
}

function RatioCard({ r }: { r: RatioResult }) {
  const { t } = useLang();
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
        {statusBadge(s1, true, t)}
      </div>
      <div className="flex items-end gap-3 mt-auto">
        <div>
          <div className="text-[10px] text-slate-400 mb-0.5">{t('status.period1')}</div>
          <div className="text-base font-semibold text-slate-800">{fmtVal(r.value1, r.unit ?? '')}</div>
        </div>
        {r.value2 !== undefined && (
          <div>
            <div className="text-[10px] text-slate-400 mb-0.5">{t('status.period2')}</div>
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
  const { t } = useLang();
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
      <tr key={s.key} className={idx % 2 === 0 ? 'bg-white' : 'bg-slate-50'}>
        <td className="px-3 py-2 text-xs text-slate-700 font-medium">{t(s.key)}</td>
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
        <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">{t('macro.title')}</span>
        <span className="text-[10px] text-slate-400">{t('macro.estimate')}</span>
        <span className="ml-auto text-[10px] text-blue-600 font-medium">{t('macro.periodNote')}</span>
      </div>
      <table className="w-full text-left border-collapse min-w-[700px]">
        <thead>
          <tr className="border-b border-slate-200">
            <th className="px-3 py-2 text-[10px] font-semibold text-slate-500 uppercase tracking-wide">{t('macro.indicator')}</th>
            <th className="px-2 py-2 text-[10px] font-semibold text-slate-500 uppercase tracking-wide text-right">{t('macro.unit')}</th>
            {MACRO_YEARS.map(y => (
              <th key={y} className={`px-2 py-2 text-[10px] font-semibold uppercase tracking-wide text-right ${PERIOD_YEARS.includes(y) ? 'text-blue-600 bg-blue-50/50' : 'text-slate-500'}`}>
                {y}{y === 2026 ? '*' : ''}
              </th>
            ))}
            <th className="px-2 py-2 text-[10px] font-semibold text-slate-500 uppercase">{t('macro.trend')}</th>
            <th className="px-2 py-2 text-[10px] font-semibold text-slate-500 uppercase">{t('macro.source')}</th>
          </tr>
        </thead>
        <tbody>
          {highlighted.map((s, i) => row(s, i))}
          <tr className="bg-slate-100">
            <td colSpan={MACRO_YEARS.length + 4} className="px-3 py-1.5 text-[10px] text-slate-400 font-semibold uppercase tracking-wide">
              {t('macro.salaries')}
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


// ── Raport Grupy Pracy — sekcja kontrolna ──────────────────────────────────
const grpData = grpRaw as GrpData;
const PLN_GRP = new Intl.NumberFormat('pl-PL',{minimumFractionDigits:0,maximumFractionDigits:0});
const fmtM_g = (v:number) => Math.abs(v)>=1_000_000?`${(v/1_000_000).toFixed(2)} M PLN`:Math.abs(v)>=1_000?`${(v/1_000).toFixed(0)} k PLN`:PLN_GRP.format(v)+' PLN';
const CITY_COLORS_G:{[k:string]:string}={WAR:'#3b82f6',KRA:'#8b5cf6',GDA:'#06b6d4',WRO:'#f59e0b',RAD:'#10b981',KAT:'#f97316',POZ:'#ec4899'};
const MIASTO_G:{[k:string]:string}={WAR:'Warszawa',KRA:'Kraków',GDA:'Gdańsk',KAT:'Katowice',WRO:'Wrocław',POZ:'Poznań',RAD:'Radom'};

function GrpSection(){
  const { t } = useLang();
  const activeGrps = useMemo(()=>grpData.groups.filter(g=>g.lider!=='0'&&g.miasto!=='0'&&g.total.przychod>0),[]);
  const totalP = useMemo(()=>activeGrps.reduce((s,g)=>s+g.total.przychod,0),[activeGrps]);
  const totalMB = useMemo(()=>activeGrps.reduce((s,g)=>s+g.total.mb,0),[activeGrps]);
  const avgMBpct = totalP>0?totalMB/totalP:0;
  const totalKP = useMemo(()=>grpData.kosztPrac.reduce((s,k)=>s+k.razem,0),[]);
  const cities = useMemo(()=>{
    const m:{[k:string]:{p:number;mb:number;n:number}}={};
    for(const g of activeGrps){if(!m[g.miasto])m[g.miasto]={p:0,mb:0,n:0};m[g.miasto].p+=g.total.przychod;m[g.miasto].mb+=g.total.mb;m[g.miasto].n++;}
    return Object.entries(m).sort(([,a],[,b])=>b.p-a.p);
  },[activeGrps]);
  const kpShare = totalP>0?totalKP/totalP:0;

  return(
    <>
      <SectionHeader title={t('grp.title')} subtitle={`Okres: ${grpData.periodLabels[0]} – ${grpData.periodLabels[grpData.periodLabels.length-1]} · dane z grpData.json`}/>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2 mb-4">
        <StatCard label={t('grp.activeGroups')} value={String(activeGrps.length)} sub={t('grp.of', { total: grpData.groups.length })}/>
        <StatCard label={t('grp.revenueYTD')} value={fmtM_g(totalP)}/>
        <StatCard label={t('grp.grossMargin')} value={fmtM_g(totalMB)} sub={`${(avgMBpct*100).toFixed(1)}% MB`}/>
        <StatCard label={t('grp.laborCost')} value={fmtM_g(totalKP)} sub={t('grp.ofRevenue', { pct: `${(kpShare*100).toFixed(1)}%` })}/>
        <StatCard label={t('grp.employeesInGP')} value={String(grpData.employees.length)} sub={t('grp.leadersWithKP', { count: grpData.kosztPrac.length })}/>
      </div>
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-x-auto mb-8">
        <div className="px-4 py-2.5 border-b border-slate-100 bg-slate-50">
          <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">{t('grp.cityStats')}</span>
        </div>
        <table className="w-full text-[11px] border-collapse">
          <thead><tr className="border-b border-slate-200 bg-slate-50">
            {[t('grp.city'),t('grp.groups'),t('grp.revenue'),t('grp.grossMarginLabel'),t('grp.mbPct'),t('grp.share')].map((h,hi)=><th key={h} className={`px-3 py-2 font-semibold text-slate-500 ${hi===0?'text-left':'text-right'}`}>{h}</th>)}
          </tr></thead>
          <tbody>
            {cities.map(([miasto,s],i)=>{
              const mp=(s.p>0?s.mb/s.p:0);const share=totalP>0?s.p/totalP:0;
              return(
                <tr key={miasto} className={`border-b border-slate-100 ${i%2===0?'bg-white':'bg-slate-50/50'}`}>
                  <td className="px-3 py-2"><div className="flex items-center gap-2"><div className="w-2 h-2 rounded-full" style={{backgroundColor:CITY_COLORS_G[miasto]??'#64748b'}}/><span className="font-semibold text-slate-700">{MIASTO_G[miasto]??miasto}</span></div></td>
                  <td className="px-3 py-2 text-right text-slate-600">{s.n}</td>
                  <td className="px-3 py-2 text-right font-medium text-slate-700">{fmtM_g(s.p)}</td>
                  <td className={`px-3 py-2 text-right font-semibold ${mp>0?'text-emerald-600':mp>-0.05?'text-amber-600':'text-red-600'}`}>{fmtM_g(s.mb)}</td>
                  <td className="px-3 py-2 text-right"><span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${mp>0.3?'bg-emerald-100 text-emerald-700':mp>0.1?'bg-amber-100 text-amber-700':mp>0?'bg-orange-100 text-orange-700':'bg-red-100 text-red-700'}`}>{(mp*100).toFixed(1)}%</span></td>
                  <td className="px-3 py-2 text-right">
                    <div className="flex items-center justify-end gap-1.5">
                      <div className="w-16 bg-slate-200 rounded-full h-1.5 overflow-hidden"><div className="h-full rounded-full" style={{width:`${share*100}%`,backgroundColor:CITY_COLORS_G[miasto]??'#64748b'}}/></div>
                      <span className="text-slate-500 w-6 text-right">{(share*100).toFixed(0)}%</span>
                    </div>
                  </td>
                </tr>
              );
            })}
            <tr className="bg-orange-50 border-t border-orange-200 font-semibold">
              <td className="px-3 py-2 text-slate-700 text-[10px] uppercase tracking-wide">{t('grp.sum')}</td>
              <td className="px-3 py-2 text-right text-slate-600 text-[11px]">{activeGrps.length}</td>
              <td className="px-3 py-2 text-right text-slate-800 text-[11px]">{fmtM_g(totalP)}</td>
              <td className={`px-3 py-2 text-right text-[11px] font-bold ${avgMBpct>0?'text-emerald-600':'text-red-600'}`}>{fmtM_g(totalMB)}</td>
              <td className="px-3 py-2 text-right text-[11px]"><span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${avgMBpct>0.3?'bg-emerald-100 text-emerald-700':avgMBpct>0.1?'bg-amber-100 text-amber-700':avgMBpct>0?'bg-orange-100 text-orange-700':'bg-red-100 text-red-700'}`}>{(avgMBpct*100).toFixed(1)}%</span></td>
              <td className="px-3 py-2 text-right text-slate-500 text-[10px]">100%</td>
            </tr>
          </tbody>
        </table>
      </div>
    </>
  );
}

// ── Main component ──────────────────────────────────────────────────────────

export default function ControlSheet() {
  const { t } = useLang();
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
  const fieldSources = useMemo(
    () => (bilans.length > 0 || rzis.length > 0) ? mapFields(bilans, rzis, 1).sources : null,
    [bilans, rzis],
  );

  const stats = useMemo(() => computeStats(bilans, rzis, obroty, zapisy), [bilans, rzis, obroty, zapisy]);

  const okCount   = integrityChecks.filter(c => c.status === 'ok').length;
  const errCount  = integrityChecks.filter(c => c.status === 'error').length;
  const warnCount = integrityChecks.filter(c => c.status === 'warning').length;

  if (!activeCompany) {
    return (
      <div className="flex-1 flex items-center justify-center text-slate-400 text-sm">
        {t('control.noCompany')}
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-5xl mx-auto px-4 py-5">

        {/* ── Header summary bar ── */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 mb-2 flex flex-wrap items-center gap-4">
          <div>
            <div className="text-xs text-slate-400 uppercase tracking-wide">{t('control.company')}</div>
            <div className="text-sm font-semibold text-slate-800">{activeCompany.name}</div>
          </div>
          <div>
            <div className="text-xs text-slate-400 uppercase tracking-wide">{t('control.period')}</div>
            <div className="text-sm font-semibold text-slate-800">{activeCompany.period}</div>
          </div>
          <div className="ml-auto flex items-center gap-2">
            {errCount > 0  && <span className="text-xs bg-red-100 text-red-700 font-semibold px-2 py-1 rounded-full">{errCount > 1 ? t('control.errorsPlural', { count: errCount }) : t('control.errors', { count: errCount })}</span>}
            {warnCount > 0 && <span className="text-xs bg-amber-100 text-amber-700 font-semibold px-2 py-1 rounded-full">{warnCount > 1 ? t('control.warningsPlural', { count: warnCount }) : t('control.warnings', { count: warnCount })}</span>}
            {errCount === 0 && warnCount === 0 && okCount > 0 && (
              <span className="text-xs bg-emerald-100 text-emerald-700 font-semibold px-2 py-1 rounded-full">{t('control.allOk')}</span>
            )}
          </div>
        </div>

        {/* ── 1. Completeness ── */}
        <SectionHeader title={t('control.completeness')} />
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm divide-y divide-slate-100">
          {completeness.map(c => <CheckRow key={c.id} c={c} />)}
        </div>

        {/* ── 2. Integrity checks ── */}
        <SectionHeader
          title={t('control.integrity')}
          subtitle={t('control.integritySubtitle', { ok: okCount, err: errCount, warn: warnCount, nodata: integrityChecks.filter(c => c.status === 'nodata').length })}
        />
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm divide-y divide-slate-100">
          {integrityChecks.map(c => <CheckRow key={c.id} c={c} />)}
        </div>

        {/* ── 3. Financial ratios ── */}
        <SectionHeader title={t('control.ratios')} subtitle={t('control.ratiosSubtitle')} />
        {bilans.length === 0 && rzis.length === 0 ? (
          <div className="bg-white rounded-xl border border-slate-200 p-6 text-center text-slate-400 text-sm">
            {t('control.noData')}
          </div>
        ) : (
          <>
            <div className="mb-2 text-xs text-slate-400">
              {t('control.periodInfo')}
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
              {ratios.map(r => <RatioCard key={r.id} r={r} />)}
            </div>
          </>
        )}

        {/* ── 4. Macro data ── */}
        <SectionHeader title={t('control.macro')} subtitle={t('control.macroSubtitle')} />
        <MacroTable />

        {/* ── 5. Statistics ── */}
        <SectionHeader title={t('control.stats')} />
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2 mb-8">
          <StatCard label={t('control.bilansRows')} value={String(stats.bilansRows)} />
          <StatCard label={t('control.rzisRows')} value={String(stats.rzisRows)} />
          <StatCard label={t('control.accounts')} value={stats.obrotyCounts.toLocaleString('pl-PL')} />
          <StatCard
            label={t('control.journalEntries')}
            value={stats.zapisyCount > 0 ? stats.zapisyCount.toLocaleString('pl-PL') : '—'}
            sub={zapisyLoading ? t('control.loading') : undefined}
          />
          <StatCard
            label={t('control.dateRange')}
            value={stats.zapisyDateMin && stats.zapisyDateMax ? `${stats.zapisyDateMin}` : '—'}
            sub={stats.zapisyDateMax ? t('control.to', { date: stats.zapisyDateMax }) : undefined}
          />
          <StatCard
            label={t('control.uniqueAccounts')}
            value={stats.uniqueAccounts > 0 ? stats.uniqueAccounts.toLocaleString('pl-PL') : '—'}
          />
          <StatCard
            label={t('control.uniqueDocuments')}
            value={stats.uniqueDocuments > 0 ? stats.uniqueDocuments.toLocaleString('pl-PL') : '—'}
          />
          <StatCard
            label={t('control.turnoverWn')}
            value={stats.sumWn > 0 ? `${(stats.sumWn / 1_000_000).toFixed(1)} M PLN` : '—'}
          />
        </div>

        {/* ── 6. Raport Grupy Pracy ── */}
        <GrpSection />

        {/* ── 7. Sprawdzenie mapowania pól ── */}
        {fieldSources && (
          <>
            <SectionHeader title={t('analysis.mapping')} subtitle="Diagnostyka dopasowania pozycji bilansu i RZiS do wskaźników finansowych" />
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden mb-8">
              <div className="grid grid-cols-[auto_1fr_auto] gap-0 bg-slate-50 border-b border-slate-200 px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">
                <div className="w-56">{t('mapping.field')}</div>
                <div>{t('mapping.matchedRow')}</div>
                <div className="w-20 text-center">{t('mapping.status')}</div>
              </div>
              <div className="divide-y divide-slate-100">
                {Object.entries(fieldSources).map(([key, src]) => (
                  <div key={key} className="grid grid-cols-[auto_1fr_auto] gap-0 px-4 py-2.5 hover:bg-slate-50/60 transition-colors items-center">
                    <div className="w-56 text-sm font-semibold text-slate-700">{FIELD_LABELS[key] ?? key}</div>
                    <div className="text-sm text-slate-500 font-mono truncate pr-4">{src.name}</div>
                    <div className="w-20 text-center">
                      {src.found ? (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-700 border border-emerald-200">OK</span>
                      ) : (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-red-100 text-red-700 border border-red-200">—</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}

      </div>
    </div>
  );
}

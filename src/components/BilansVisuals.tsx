import { useState, useMemo } from 'react';
import {
  PieChart, Pie, Cell, Tooltip,
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Legend, ResponsiveContainer, ReferenceLine,
} from 'recharts';
import type { ReportRow } from '../types';
import { mapFields } from '../lib/fieldMapping';
import AIAnalysisModal from './AIAnalysisModal';
import { useLang } from '../i18n/LanguageContext';

interface Props {
  reportType: 'bilans' | 'rzis';
  bilans: ReportRow[];
  rzis: ReportRow[];
  periodLabels?: string[];
  lang: string;
}

const fmt = (v: number) =>
  v === 0 ? '—' : (v / 1000).toLocaleString('pl-PL', { maximumFractionDigits: 0 }) + ' tys.';

const pct = (v: number, total: number) =>
  total ? ((v / total) * 100).toFixed(1) + '%' : '—';

const delta = (curr: number, prev: number) => {
  if (!prev || !curr) return null;
  return ((curr - prev) / Math.abs(prev) * 100).toFixed(1);
};

const COLORS_AKTYWA = ['#3b82f6', '#93c5fd'];
const COLORS_PASYWA = ['#10b981', '#f59e0b', '#ef4444'];

const CustomTooltipPie = ({ active, payload }: any) => {
  if (!active || !payload?.length) return null;
  const { name, value } = payload[0];
  return (
    <div className="bg-white border border-slate-200 rounded-lg px-3 py-2 shadow-lg text-xs">
      <p className="font-semibold text-slate-700">{name}</p>
      <p className="text-slate-500">{fmt(value)}</p>
    </div>
  );
};

const CustomTooltipBar = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white border border-slate-200 rounded-lg px-3 py-2 shadow-lg text-xs min-w-[140px]">
      <p className="font-semibold text-slate-700 mb-1">{label}</p>
      {payload.map((p: any) => (
        <p key={p.dataKey} style={{ color: p.color }}>
          {p.name}: {fmt(p.value)}
        </p>
      ))}
    </div>
  );
};

const renderCustomLabel = ({ cx, cy, midAngle, innerRadius, outerRadius, percent }: any) => {
  if (percent < 0.08) return null;
  const RADIAN = Math.PI / 180;
  const r = innerRadius + (outerRadius - innerRadius) * 0.55;
  const x = cx + r * Math.cos(-midAngle * RADIAN);
  const y = cy + r * Math.sin(-midAngle * RADIAN);
  return (
    <text x={x} y={y} fill="white" textAnchor="middle" dominantBaseline="central" fontSize={10} fontWeight={600}>
      {(percent * 100).toFixed(0)}%
    </text>
  );
};

// ── Detail panel ──────────────────────────────────────────────────────────────
interface DetailState {
  key: string;
  label: string;
  bars: { name: string; value: number }[];
  total?: number;
  isPercent?: boolean;
}

function DetailPanel({ d, onClose }: { d: DetailState; onClose: () => void }) {
  const [v1, v2, v3] = [d.bars[0]?.value ?? 0, d.bars[1]?.value ?? 0, d.bars[2]?.value ?? 0];
  const d12 = delta(v1, v2);
  const d23 = delta(v2, v3);
  const formatter = d.isPercent ? (v: number) => `${v.toFixed(1)}%` : (v: number) => fmt(v);

  return (
    <div className="mt-3 bg-violet-50 border border-violet-200 rounded-xl p-3 animate-in fade-in slide-in-from-top-1 duration-150">
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs font-bold text-violet-700">📊 {d.label}</p>
        <button onClick={onClose} className="w-5 h-5 rounded-full bg-violet-100 hover:bg-violet-200 text-violet-500 text-[10px] flex items-center justify-center transition-colors">✕</button>
      </div>
      <div className="grid grid-cols-5 gap-2 items-center">
        <div className="col-span-3">
          <ResponsiveContainer width="100%" height={110}>
            <BarChart data={d.bars} margin={{ top: 2, right: 4, left: 0, bottom: 2 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#ede9fe" />
              <XAxis dataKey="name" tick={{ fontSize: 9 }} />
              <YAxis tick={{ fontSize: 9 }} tickFormatter={d.isPercent ? (v => v + '%') : (v => (v / 1000).toFixed(0) + 'k')} width={36} />
              <Tooltip formatter={(v: any) => formatter(v)} />
              <Bar dataKey="value" fill="#7c3aed" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="col-span-2 space-y-1.5">
          {d.bars.map((bar) => (
            <div key={bar.name} className="bg-white rounded-lg px-2.5 py-1.5 border border-violet-100">
              <p className="text-[9px] text-slate-400">{bar.name}</p>
              <p className="text-xs font-bold text-violet-700">{formatter(bar.value)}</p>
              {d.total && !d.isPercent && <p className="text-[9px] text-slate-400">{pct(bar.value, d.total)}</p>}
            </div>
          ))}
          {d12 !== null && (
            <div className={`text-[10px] font-semibold px-2 ${+d12 >= 0 ? 'text-emerald-600' : 'text-rose-500'}`}>
              r/r {d12 >= '0' ? '+' : ''}{d12}%
              {d23 !== null && <span className="text-slate-400 ml-1">/ {+d23 >= 0 ? '+' : ''}{d23}%</span>}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Clickable KPI tile ────────────────────────────────────────────────────────
function KpiTile({
  label, val, color, active, onClick,
}: { label: string; val: string; color: string; active?: boolean; onClick?: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`text-left w-full bg-${color}-50 border rounded-lg px-3 py-2 transition-all duration-150 ${
        active ? `border-${color}-400 ring-2 ring-${color}-200` : `border-${color}-100 hover:border-${color}-300`
      } ${onClick ? 'cursor-pointer hover:shadow-sm' : 'cursor-default'}`}
    >
      <p className="text-[10px] text-slate-500">{label}</p>
      <p className={`text-sm font-bold text-${color}-700`}>{val}</p>
      {onClick && <p className="text-[8px] text-slate-400 mt-0.5">▼ szczegóły</p>}
    </button>
  );
}

interface AIState { open: boolean; section: string; label: string; data: Record<string, unknown> }

export default function BilansVisuals({ reportType, bilans, rzis, periodLabels, lang }: Props) {
  const { t } = useLang();
  const [ai, setAI] = useState<AIState | null>(null);
  const [detail, setDetail] = useState<DetailState | null>(null);
  const [activeSlice, setActiveSlice] = useState<{ chart: string; idx: number } | null>(null);

  const p1 = periodLabels?.[0] ?? 'Okres 1';
  const p2 = periodLabels?.[1] ?? 'Okres 2';
  const p3 = periodLabels?.[2] ?? 'Okres 3';

  const f1 = useMemo(() => mapFields(bilans, rzis, 1), [bilans, rzis]);
  const f2 = useMemo(() => mapFields(bilans, rzis, 2), [bilans, rzis]);
  const f3 = useMemo(() => mapFields(bilans, rzis, 3), [bilans, rzis]);

  function openAI(section: string, label: string, data: Record<string, unknown>) {
    setAI({ open: true, section, label, data });
  }

  function toggleDetail(d: DetailState) {
    setDetail(prev => prev?.key === d.key ? null : d);
  }

  function onPieClick(chart: string, idx: number, entry: { name?: string; value?: number }, bars: { name: string; value: number }[], total: number) {
    const same = activeSlice?.chart === chart && activeSlice?.idx === idx;
    setActiveSlice(same ? null : { chart, idx });
    if (!same) {
      setDetail({ key: `${chart}_${idx}`, label: entry.name ?? '', bars, total });
    } else {
      setDetail(null);
    }
  }

  // ── BILANS ─────────────────────────────────────────────────────────────────
  if (reportType === 'bilans') {
    const aktywaData = [
      { name: t('bs.fixedAssets'), value: f1.aktywaTrwale },
      { name: t('vis.currentAssets'), value: f1.aktywaObrotowe },
    ].filter(d => d.value > 0);

    const pasywaDData = [
      { name: t('bs.equity'), value: f1.kapitalWlasny },
      { name: t('bs.longTermLiab'), value: f1.zobowiazaniaDlugo },
      { name: t('bs.shortTermLiab'), value: f1.zobowiazaniaKrotko },
    ].filter(d => d.value > 0);

    const barData = [
      { name: t('bs.fixedAssets'),    [p1]: f1.aktywaTrwale,    [p2]: f2.aktywaTrwale,    [p3]: f3.aktywaTrwale },
      { name: t('vis.currentAssets'), [p1]: f1.aktywaObrotowe,  [p2]: f2.aktywaObrotowe,  [p3]: f3.aktywaObrotowe },
      { name: t('bs.equity'),         [p1]: f1.kapitalWlasny,   [p2]: f2.kapitalWlasny,   [p3]: f3.kapitalWlasny },
      { name: t('vis.debtTotal'),     [p1]: f1.zobowiazaniaDlugo + f1.zobowiazaniaKrotko, [p2]: f2.zobowiazaniaDlugo + f2.zobowiazaniaKrotko, [p3]: f3.zobowiazaniaDlugo + f3.zobowiazaniaKrotko },
    ];

    const aiDataBilans = {
      aktywaTrwale: f1.aktywaTrwale, aktywaObrotowe: f1.aktywaObrotowe,
      aktywaRazem: f1.aktywaRazem, kapitalWlasny: f1.kapitalWlasny,
      zobowiazaniaDlugo: f1.zobowiazaniaDlugo, zobowiazaniaKrotko: f1.zobowiazaniaKrotko,
      pctAktywaTrwale: +pct(f1.aktywaTrwale, f1.aktywaRazem),
      pctKapitalWlasny: +pct(f1.kapitalWlasny, f1.aktywaRazem),
    };

    // KPI detail builders
    const kpis = [
      {
        key: 'totalAssets', label: t('vis.totalAssets'), val: fmt(f1.aktywaRazem), color: 'blue',
        bars: [{ name: p1, value: f1.aktywaRazem }, { name: p2, value: f2.aktywaRazem }, { name: p3, value: f3.aktywaRazem }],
      },
      {
        key: 'equity', label: t('bs.equity'), val: fmt(f1.kapitalWlasny), color: 'emerald',
        bars: [{ name: p1, value: f1.kapitalWlasny }, { name: p2, value: f2.kapitalWlasny }, { name: p3, value: f3.kapitalWlasny }],
        total: f1.aktywaRazem,
      },
      {
        key: 'debt', label: t('vis.totalDebt'), val: fmt(f1.zobowiazaniaDlugo + f1.zobowiazaniaKrotko), color: 'amber',
        bars: [
          { name: p1, value: f1.zobowiazaniaDlugo + f1.zobowiazaniaKrotko },
          { name: p2, value: f2.zobowiazaniaDlugo + f2.zobowiazaniaKrotko },
          { name: p3, value: f3.zobowiazaniaDlugo + f3.zobowiazaniaKrotko },
        ],
        total: f1.aktywaRazem,
      },
      {
        key: 'cash', label: t('bs.cash'), val: fmt(f1.srodkiPieniezne), color: 'violet',
        bars: [{ name: p1, value: f1.srodkiPieniezne }, { name: p2, value: f2.srodkiPieniezne }, { name: p3, value: f3.srodkiPieniezne }],
        total: f1.aktywaRazem,
      },
    ];

    return (
      <div className="px-4 pt-4 pb-2">
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-slate-700">{t('vis.bilansTitle')} — {p1}</h3>
            <button
              onClick={() => openAI('bilans_struktura', t('vis.bilansTitle'), aiDataBilans)}
              className="inline-flex items-center gap-1 px-2 py-1 text-[10px] font-semibold text-violet-600 border border-violet-200 rounded-md hover:bg-violet-50 transition-colors"
            >
              🤖 {t('vis.aiAnalysis')}
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Donut: Aktywa */}
            <div className="flex flex-col items-center">
              <p className="text-[11px] font-semibold text-slate-500 mb-1 uppercase tracking-wide">{t('vis.assetStructure')}</p>
              <ResponsiveContainer width="100%" height={180}>
                <PieChart>
                  <Pie
                    data={aktywaData} cx="50%" cy="50%" innerRadius={45} outerRadius={80}
                    dataKey="value" labelLine={false} label={renderCustomLabel}
                    onClick={(entry, idx) => onPieClick('aktywa', idx, entry, [
                      { name: p1, value: idx === 0 ? f1.aktywaTrwale : f1.aktywaObrotowe },
                      { name: p2, value: idx === 0 ? f2.aktywaTrwale : f2.aktywaObrotowe },
                      { name: p3, value: idx === 0 ? f3.aktywaTrwale : f3.aktywaObrotowe },
                    ], f1.aktywaRazem)}
                    style={{ cursor: 'pointer' }}
                  >
                    {aktywaData.map((_, i) => (
                      <Cell key={i} fill={COLORS_AKTYWA[i % COLORS_AKTYWA.length]}
                        opacity={activeSlice && activeSlice.chart === 'aktywa' && activeSlice.idx !== i ? 0.4 : 1} />
                    ))}
                  </Pie>
                  <Tooltip content={<CustomTooltipPie />} />
                </PieChart>
              </ResponsiveContainer>
              <div className="space-y-1 w-full max-w-[160px]">
                {aktywaData.map((d, i) => (
                  <button
                    key={d.name}
                    onClick={() => onPieClick('aktywa', i, d, [
                      { name: p1, value: i === 0 ? f1.aktywaTrwale : f1.aktywaObrotowe },
                      { name: p2, value: i === 0 ? f2.aktywaTrwale : f2.aktywaObrotowe },
                      { name: p3, value: i === 0 ? f3.aktywaTrwale : f3.aktywaObrotowe },
                    ], f1.aktywaRazem)}
                    className="flex items-center justify-between text-[10px] w-full hover:bg-slate-50 rounded px-1 py-0.5 transition-colors"
                  >
                    <div className="flex items-center gap-1">
                      <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: COLORS_AKTYWA[i] }} />
                      <span className="text-slate-600">{d.name}</span>
                    </div>
                    <span className="font-semibold text-slate-700">{pct(d.value, f1.aktywaRazem)}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Donut: Pasywa */}
            <div className="flex flex-col items-center">
              <p className="text-[11px] font-semibold text-slate-500 mb-1 uppercase tracking-wide">{t('vis.liabStructure')}</p>
              <ResponsiveContainer width="100%" height={180}>
                <PieChart>
                  <Pie
                    data={pasywaDData} cx="50%" cy="50%" innerRadius={45} outerRadius={80}
                    dataKey="value" labelLine={false} label={renderCustomLabel}
                    onClick={(entry, idx) => onPieClick('pasywa', idx, entry, [
                      { name: p1, value: [f1.kapitalWlasny, f1.zobowiazaniaDlugo, f1.zobowiazaniaKrotko][idx] ?? 0 },
                      { name: p2, value: [f2.kapitalWlasny, f2.zobowiazaniaDlugo, f2.zobowiazaniaKrotko][idx] ?? 0 },
                      { name: p3, value: [f3.kapitalWlasny, f3.zobowiazaniaDlugo, f3.zobowiazaniaKrotko][idx] ?? 0 },
                    ], f1.aktywaRazem)}
                    style={{ cursor: 'pointer' }}
                  >
                    {pasywaDData.map((_, i) => (
                      <Cell key={i} fill={COLORS_PASYWA[i % COLORS_PASYWA.length]}
                        opacity={activeSlice && activeSlice.chart === 'pasywa' && activeSlice.idx !== i ? 0.4 : 1} />
                    ))}
                  </Pie>
                  <Tooltip content={<CustomTooltipPie />} />
                </PieChart>
              </ResponsiveContainer>
              <div className="space-y-1 w-full max-w-[160px]">
                {pasywaDData.map((d, i) => (
                  <button
                    key={d.name}
                    onClick={() => onPieClick('pasywa', i, d, [
                      { name: p1, value: [f1.kapitalWlasny, f1.zobowiazaniaDlugo, f1.zobowiazaniaKrotko][i] ?? 0 },
                      { name: p2, value: [f2.kapitalWlasny, f2.zobowiazaniaDlugo, f2.zobowiazaniaKrotko][i] ?? 0 },
                      { name: p3, value: [f3.kapitalWlasny, f3.zobowiazaniaDlugo, f3.zobowiazaniaKrotko][i] ?? 0 },
                    ], f1.aktywaRazem)}
                    className="flex items-center justify-between text-[10px] w-full hover:bg-slate-50 rounded px-1 py-0.5 transition-colors"
                  >
                    <div className="flex items-center gap-1">
                      <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: COLORS_PASYWA[i] }} />
                      <span className="text-slate-600">{d.name}</span>
                    </div>
                    <span className="font-semibold text-slate-700">{pct(d.value, f1.aktywaRazem)}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* KPI tiles */}
            <div className="flex flex-col justify-center gap-2">
              {kpis.map(kpi => (
                <KpiTile
                  key={kpi.key}
                  label={kpi.label}
                  val={kpi.val}
                  color={kpi.color}
                  active={detail?.key === kpi.key}
                  onClick={() => toggleDetail({ key: kpi.key, label: kpi.label, bars: kpi.bars, total: kpi.total })}
                />
              ))}
            </div>
          </div>

          {/* Detail panel */}
          {detail && (
            <DetailPanel d={detail} onClose={() => { setDetail(null); setActiveSlice(null); }} />
          )}

          {/* Bar chart: trendy */}
          <div>
            <p className="text-[11px] font-semibold text-slate-500 mb-2 uppercase tracking-wide">{t('vis.compare3periods')}</p>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={barData} margin={{ top: 4, right: 8, left: 8, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} tickFormatter={v => (v / 1000).toFixed(0) + 'k'} />
                <Tooltip content={<CustomTooltipBar />} />
                <Legend wrapperStyle={{ fontSize: 10 }} />
                <Bar dataKey={p1} fill="#3b82f6" radius={[3, 3, 0, 0]} />
                <Bar dataKey={p2} fill="#93c5fd" radius={[3, 3, 0, 0]} />
                {f3.aktywaRazem > 0 && <Bar dataKey={p3} fill="#dbeafe" radius={[3, 3, 0, 0]} />}
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {ai?.open && (
          <AIAnalysisModal
            section={ai.section}
            sectionLabel={ai.label}
            lang={lang}
            period={p1}
            data={ai.data}
            cacheKey={`ai_${ai.section}_${p1}_${lang}`}
            onClose={() => setAI(null)}
          />
        )}
      </div>
    );
  }

  // ── RZiS view ─────────────────────────────────────────────────────────────
  const cascade = [
    { name: t('pnl.revenue'),    abs: f1.przychody,  color: '#3b82f6' },
    { name: t('pnl.salesProfit'), abs: f1.zyskZeSprz, color: '#10b981' },
    { name: t('pnl.ebit'),       abs: f1.ebit,        color: f1.ebit >= 0 ? '#f59e0b' : '#ef4444' },
    { name: t('pnl.netProfit'),  abs: f1.zyskNetto,   color: f1.zyskNetto >= 0 ? '#8b5cf6' : '#ef4444' },
  ];

  const marginBar = [
    {
      name: t('vis.salesMargin'),
      [p1]: f1.przychody ? +((f1.zyskZeSprz / f1.przychody) * 100).toFixed(1) : 0,
      [p2]: f2.przychody ? +((f2.zyskZeSprz / f2.przychody) * 100).toFixed(1) : 0,
      [p3]: f3.przychody ? +((f3.zyskZeSprz / f3.przychody) * 100).toFixed(1) : 0,
    },
    {
      name: t('vis.ebitMargin'),
      [p1]: f1.przychody ? +((f1.ebit / f1.przychody) * 100).toFixed(1) : 0,
      [p2]: f2.przychody ? +((f2.ebit / f2.przychody) * 100).toFixed(1) : 0,
      [p3]: f3.przychody ? +((f3.ebit / f3.przychody) * 100).toFixed(1) : 0,
    },
    {
      name: t('vis.netMargin'),
      [p1]: f1.przychody ? +((f1.zyskNetto / f1.przychody) * 100).toFixed(1) : 0,
      [p2]: f2.przychody ? +((f2.zyskNetto / f2.przychody) * 100).toFixed(1) : 0,
      [p3]: f3.przychody ? +((f3.zyskNetto / f3.przychody) * 100).toFixed(1) : 0,
    },
  ];

  const aiDataRzis = {
    przychody: f1.przychody, zyskZeSprz: f1.zyskZeSprz, ebit: f1.ebit, zyskNetto: f1.zyskNetto,
    kosztyOper: f1.kosztyOper, amortyzacja: f1.amortyzacja,
    marzaZeSprzedazy: f1.przychody ? +((f1.zyskZeSprz / f1.przychody) * 100).toFixed(1) : null,
    marzaEBIT: f1.przychody ? +((f1.ebit / f1.przychody) * 100).toFixed(1) : null,
    marzaNetto: f1.przychody ? +((f1.zyskNetto / f1.przychody) * 100).toFixed(1) : null,
  };

  const rzisKpis = [
    {
      key: 'revenue', label: t('pnl.revenue'), val: fmt(f1.przychody), color: 'blue',
      bars: [{ name: p1, value: f1.przychody }, { name: p2, value: f2.przychody }, { name: p3, value: f3.przychody }],
    },
    {
      key: 'operCosts', label: t('vis.operCosts'), val: fmt(f1.kosztyOper), color: 'rose',
      bars: [{ name: p1, value: f1.kosztyOper }, { name: p2, value: f2.kosztyOper }, { name: p3, value: f3.kosztyOper }],
    },
    {
      key: 'ebit', label: t('pnl.ebit'), val: fmt(f1.ebit), color: f1.ebit >= 0 ? 'amber' : 'rose',
      bars: [{ name: p1, value: f1.ebit }, { name: p2, value: f2.ebit }, { name: p3, value: f3.ebit }],
    },
    {
      key: 'netProfit', label: t('pnl.netProfit'), val: fmt(f1.zyskNetto), color: f1.zyskNetto >= 0 ? 'emerald' : 'rose',
      bars: [{ name: p1, value: f1.zyskNetto }, { name: p2, value: f2.zyskNetto }, { name: p3, value: f3.zyskNetto }],
    },
    {
      key: 'depr', label: t('vis.depreciation'), val: fmt(f1.amortyzacja), color: 'slate',
      bars: [{ name: p1, value: f1.amortyzacja }, { name: p2, value: f2.amortyzacja }, { name: p3, value: f3.amortyzacja }],
    },
    {
      key: 'netMargin', label: t('vis.netMargin'), val: f1.przychody ? pct(f1.zyskNetto, f1.przychody) : '—', color: 'violet',
      bars: [
        { name: p1, value: f1.przychody ? +((f1.zyskNetto / f1.przychody) * 100).toFixed(1) : 0 },
        { name: p2, value: f2.przychody ? +((f2.zyskNetto / f2.przychody) * 100).toFixed(1) : 0 },
        { name: p3, value: f3.przychody ? +((f3.zyskNetto / f3.przychody) * 100).toFixed(1) : 0 },
      ],
      isPercent: true,
    },
  ];

  return (
    <div className="px-4 pt-4 pb-2">
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-slate-700">{t('vis.rzisTitle')} — {p1}</h3>
          <button
            onClick={() => openAI('rzis_rentownosc', t('vis.rzisTitle'), aiDataRzis)}
            className="inline-flex items-center gap-1 px-2 py-1 text-[10px] font-semibold text-violet-600 border border-violet-200 rounded-md hover:bg-violet-50 transition-colors"
          >
            🤖 {t('vis.aiAnalysis')}
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Cascade bars */}
          <div>
            <p className="text-[11px] font-semibold text-slate-500 mb-2 uppercase tracking-wide">{t('vis.cascadeTitle')} — {p1}</p>
            <div className="space-y-1.5">
              {cascade.map(item => {
                const widthPct = f1.przychody > 0 ? Math.max(0, Math.min(100, (Math.abs(item.abs) / f1.przychody) * 100)) : 0;
                return (
                  <div key={item.name} className="flex items-center gap-2">
                    <span className="text-[10px] text-slate-500 w-28 shrink-0 text-right">{item.name}</span>
                    <div className="flex-1 bg-slate-100 rounded-full h-5 overflow-hidden">
                      <div
                        className="h-full rounded-full flex items-center justify-end pr-2 text-[10px] font-semibold text-white transition-all"
                        style={{ width: `${widthPct}%`, background: item.color, minWidth: widthPct > 0 ? 40 : 0 }}
                      >
                        {widthPct > 8 && pct(item.abs, f1.przychody)}
                      </div>
                    </div>
                    <span className="text-[10px] font-semibold text-slate-700 w-24 shrink-0">{fmt(item.abs)}</span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* KPI tiles — 2 columns */}
          <div className="grid grid-cols-2 gap-2">
            {rzisKpis.map(kpi => (
              <KpiTile
                key={kpi.key}
                label={kpi.label}
                val={kpi.val}
                color={kpi.color}
                active={detail?.key === kpi.key}
                onClick={() => toggleDetail({ key: kpi.key, label: kpi.label, bars: kpi.bars, isPercent: (kpi as any).isPercent })}
              />
            ))}
          </div>
        </div>

        {/* Detail panel */}
        {detail && (
          <DetailPanel d={detail} onClose={() => setDetail(null)} />
        )}

        {/* Margin bar */}
        <div>
          <p className="text-[11px] font-semibold text-slate-500 mb-2 uppercase tracking-wide">{t('vis.margins3periods')}</p>
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={marginBar} margin={{ top: 4, right: 8, left: 8, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="name" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 10 }} unit="%" />
              <Tooltip formatter={(v: any) => `${v}%`} />
              <Legend wrapperStyle={{ fontSize: 10 }} />
              <ReferenceLine y={0} stroke="#94a3b8" />
              <Bar dataKey={p1} fill="#3b82f6" radius={[3, 3, 0, 0]} />
              <Bar dataKey={p2} fill="#93c5fd" radius={[3, 3, 0, 0]} />
              {f3.przychody > 0 && <Bar dataKey={p3} fill="#dbeafe" radius={[3, 3, 0, 0]} />}
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {ai?.open && (
        <AIAnalysisModal
          section={ai.section}
          sectionLabel={ai.label}
          lang={lang}
          period={p1}
          data={ai.data}
          cacheKey={`ai_${ai.section}_${p1}_${lang}`}
          onClose={() => setAI(null)}
        />
      )}
    </div>
  );
}

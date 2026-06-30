import { useState, useMemo } from 'react';
import {
  PieChart, Pie, Cell, Tooltip,
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Legend, ResponsiveContainer, ReferenceLine,
} from 'recharts';
import type { ReportRow } from '../types';
import { mapFields } from '../lib/fieldMapping';
import AIAnalysisModal from './AIAnalysisModal';

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

// ── AI button helper ──────────────────────────────────────────────────────────
interface AIState { open: boolean; section: string; label: string; data: Record<string, unknown> }

export default function BilansVisuals({ reportType, bilans, rzis, periodLabels, lang }: Props) {
  const [ai, setAI] = useState<AIState | null>(null);

  const p1 = periodLabels?.[0] ?? 'Okres 1';
  const p2 = periodLabels?.[1] ?? 'Okres 2';
  const p3 = periodLabels?.[2] ?? 'Okres 3';

  const f1 = useMemo(() => mapFields(bilans, rzis, 1), [bilans, rzis]);
  const f2 = useMemo(() => mapFields(bilans, rzis, 2), [bilans, rzis]);
  const f3 = useMemo(() => mapFields(bilans, rzis, 3), [bilans, rzis]);

  function openAI(section: string, label: string, data: Record<string, unknown>) {
    setAI({ open: true, section, label, data });
  }

  if (reportType === 'bilans') {
    // ── Donut: struktura aktywów ──────────────────────────────────────────
    const aktywaData = [
      { name: 'Aktywa trwałe', value: f1.aktywaTrwale },
      { name: 'Aktywa obrotowe', value: f1.aktywaObrotowe },
    ].filter(d => d.value > 0);

    const pasywaDData = [
      { name: 'Kapitał własny', value: f1.kapitalWlasny },
      { name: 'Zobow. długoterm.', value: f1.zobowiazaniaDlugo },
      { name: 'Zobow. krótkoterm.', value: f1.zobowiazaniaKrotko },
    ].filter(d => d.value > 0);

    // ── Bar: trendy bilansowe 3 okresy ────────────────────────────────────
    const barData = [
      { name: 'Aktywa trwałe',    [p1]: f1.aktywaTrwale,    [p2]: f2.aktywaTrwale,    [p3]: f3.aktywaTrwale },
      { name: 'Aktywa obrotowe',  [p1]: f1.aktywaObrotowe,  [p2]: f2.aktywaObrotowe,  [p3]: f3.aktywaObrotowe },
      { name: 'Kapitał własny',   [p1]: f1.kapitalWlasny,   [p2]: f2.kapitalWlasny,   [p3]: f3.kapitalWlasny },
      { name: 'Zobow. ogółem',    [p1]: f1.zobowiazaniaDlugo + f1.zobowiazaniaKrotko, [p2]: f2.zobowiazaniaDlugo + f2.zobowiazaniaKrotko, [p3]: f3.zobowiazaniaDlugo + f3.zobowiazaniaKrotko },
    ];

    const aiDataBilans = {
      aktywaTrwale: f1.aktywaTrwale, aktywaObrotowe: f1.aktywaObrotowe,
      aktywaRazem: f1.aktywaRazem, kapitalWlasny: f1.kapitalWlasny,
      zobowiazaniaDlugo: f1.zobowiazaniaDlugo, zobowiazaniaKrotko: f1.zobowiazaniaKrotko,
      pctAktywaTrwale: +pct(f1.aktywaTrwale, f1.aktywaRazem),
      pctKapitalWlasny: +pct(f1.kapitalWlasny, f1.aktywaRazem),
    };

    return (
      <div className="px-4 pt-4 pb-2">
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-slate-700">Struktura bilansu — {p1}</h3>
            <button
              onClick={() => openAI('bilans_struktura', 'Struktura bilansu', aiDataBilans)}
              className="inline-flex items-center gap-1 px-2 py-1 text-[10px] font-semibold text-violet-600 border border-violet-200 rounded-md hover:bg-violet-50 transition-colors"
            >
              🤖 Analiza AI
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Donut: Aktywa */}
            <div className="flex flex-col items-center">
              <p className="text-[11px] font-semibold text-slate-500 mb-1 uppercase tracking-wide">Struktura aktywów</p>
              <ResponsiveContainer width="100%" height={180}>
                <PieChart>
                  <Pie data={aktywaData} cx="50%" cy="50%" innerRadius={45} outerRadius={80}
                    dataKey="value" labelLine={false} label={renderCustomLabel}>
                    {aktywaData.map((_, i) => <Cell key={i} fill={COLORS_AKTYWA[i % COLORS_AKTYWA.length]} />)}
                  </Pie>
                  <Tooltip content={<CustomTooltipPie />} />
                </PieChart>
              </ResponsiveContainer>
              <div className="space-y-1 w-full max-w-[160px]">
                {aktywaData.map((d, i) => (
                  <div key={d.name} className="flex items-center justify-between text-[10px]">
                    <div className="flex items-center gap-1">
                      <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: COLORS_AKTYWA[i] }} />
                      <span className="text-slate-600">{d.name}</span>
                    </div>
                    <span className="font-semibold text-slate-700">{pct(d.value, f1.aktywaRazem)}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Donut: Pasywa */}
            <div className="flex flex-col items-center">
              <p className="text-[11px] font-semibold text-slate-500 mb-1 uppercase tracking-wide">Struktura pasywów</p>
              <ResponsiveContainer width="100%" height={180}>
                <PieChart>
                  <Pie data={pasywaDData} cx="50%" cy="50%" innerRadius={45} outerRadius={80}
                    dataKey="value" labelLine={false} label={renderCustomLabel}>
                    {pasywaDData.map((_, i) => <Cell key={i} fill={COLORS_PASYWA[i % COLORS_PASYWA.length]} />)}
                  </Pie>
                  <Tooltip content={<CustomTooltipPie />} />
                </PieChart>
              </ResponsiveContainer>
              <div className="space-y-1 w-full max-w-[160px]">
                {pasywaDData.map((d, i) => (
                  <div key={d.name} className="flex items-center justify-between text-[10px]">
                    <div className="flex items-center gap-1">
                      <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: COLORS_PASYWA[i] }} />
                      <span className="text-slate-600">{d.name}</span>
                    </div>
                    <span className="font-semibold text-slate-700">{pct(d.value, f1.aktywaRazem)}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* KPI tiles */}
            <div className="flex flex-col justify-center gap-2">
              {[
                { label: 'Suma bilansowa', val: fmt(f1.aktywaRazem), color: 'blue' },
                { label: 'Kapitał własny', val: fmt(f1.kapitalWlasny), color: 'emerald' },
                { label: 'Zadłużenie', val: fmt(f1.zobowiazaniaDlugo + f1.zobowiazaniaKrotko), color: 'amber' },
                { label: 'Środki pieniężne', val: fmt(f1.srodkiPieniezne), color: 'violet' },
              ].map(kpi => (
                <div key={kpi.label} className={`bg-${kpi.color}-50 border border-${kpi.color}-100 rounded-lg px-3 py-2`}>
                  <p className="text-[10px] text-slate-500">{kpi.label}</p>
                  <p className={`text-sm font-bold text-${kpi.color}-700`}>{kpi.val}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Bar chart: trendy */}
          <div>
            <p className="text-[11px] font-semibold text-slate-500 mb-2 uppercase tracking-wide">Porównanie 3 okresów</p>
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
  // Waterfall cascade: przychody → zysk ze sprzedaży → EBIT → zysk netto
  const cascade = [
    { name: 'Przychody',      abs: f1.przychody,     color: '#3b82f6' },
    { name: 'Zysk ze sprz.',  abs: f1.zyskZeSprz,    color: '#10b981' },
    { name: 'EBIT',           abs: f1.ebit,           color: f1.ebit >= 0 ? '#f59e0b' : '#ef4444' },
    { name: 'Zysk netto',     abs: f1.zyskNetto,      color: f1.zyskNetto >= 0 ? '#8b5cf6' : '#ef4444' },
  ];

  // Margin bar: marże 3 okresy
  const marginBar = [
    {
      name: 'Marża ze sprzedaży',
      [p1]: f1.przychody ? +((f1.zyskZeSprz / f1.przychody) * 100).toFixed(1) : 0,
      [p2]: f2.przychody ? +((f2.zyskZeSprz / f2.przychody) * 100).toFixed(1) : 0,
      [p3]: f3.przychody ? +((f3.zyskZeSprz / f3.przychody) * 100).toFixed(1) : 0,
    },
    {
      name: 'Marża EBIT',
      [p1]: f1.przychody ? +((f1.ebit / f1.przychody) * 100).toFixed(1) : 0,
      [p2]: f2.przychody ? +((f2.ebit / f2.przychody) * 100).toFixed(1) : 0,
      [p3]: f3.przychody ? +((f3.ebit / f3.przychody) * 100).toFixed(1) : 0,
    },
    {
      name: 'Marża netto',
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

  return (
    <div className="px-4 pt-4 pb-2">
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-slate-700">Rachunek wyników — {p1}</h3>
          <button
            onClick={() => openAI('rzis_rentownosc', 'Analiza rentowności RZiS', aiDataRzis)}
            className="inline-flex items-center gap-1 px-2 py-1 text-[10px] font-semibold text-violet-600 border border-violet-200 rounded-md hover:bg-violet-50 transition-colors"
          >
            🤖 Analiza AI
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Cascade bars */}
          <div>
            <p className="text-[11px] font-semibold text-slate-500 mb-2 uppercase tracking-wide">Kaskada wyników — {p1}</p>
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

          {/* KPI tiles */}
          <div className="grid grid-cols-2 gap-2">
            {[
              { label: 'Przychody', val: fmt(f1.przychody), color: 'blue' },
              { label: 'Koszty operac.', val: fmt(f1.kosztyOper), color: 'rose' },
              { label: 'EBIT', val: fmt(f1.ebit), color: f1.ebit >= 0 ? 'amber' : 'rose' },
              { label: 'Zysk netto', val: fmt(f1.zyskNetto), color: f1.zyskNetto >= 0 ? 'emerald' : 'rose' },
              { label: 'Amortyzacja', val: fmt(f1.amortyzacja), color: 'slate' },
              { label: 'Marża netto', val: f1.przychody ? pct(f1.zyskNetto, f1.przychody) : '—', color: 'violet' },
            ].map(kpi => (
              <div key={kpi.label} className={`bg-${kpi.color}-50 border border-${kpi.color}-100 rounded-lg px-3 py-2`}>
                <p className="text-[10px] text-slate-500">{kpi.label}</p>
                <p className={`text-sm font-bold text-${kpi.color}-700`}>{kpi.val}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Margin bar */}
        <div>
          <p className="text-[11px] font-semibold text-slate-500 mb-2 uppercase tracking-wide">Marże — porównanie 3 okresów (%)</p>
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

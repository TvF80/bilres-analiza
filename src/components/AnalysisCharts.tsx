import { useMemo } from 'react';
import {
  ResponsiveContainer,
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ReferenceLine, Cell,
  PieChart, Pie,
  ComposedChart,
} from 'recharts';
import type { FieldMap } from '../lib/fieldMapping';
import type { ReportRow } from '../types';
import { useLang } from '../i18n/LanguageContext';

// ── Palette ──────────────────────────────────────────────────────────────────

const C = {
  p1:     '#3b82f6',   // blue  — bieżący
  p2:     '#94a3b8',   // slate — porównawczy
  p3:     '#c4b5fd',   // violet-300 — najstarszy (wyróżniony pastelowo)
  pos:    '#10b981',
  neg:    '#f43f5e',
  norm:   '#f59e0b',
  violet: '#8b5cf6',
  cyan:   '#06b6d4',
  orange: '#f97316',
};
const PIE_AKTYWA = [C.p1, C.violet, C.cyan, C.pos, C.orange];
const PIE_PASYWA = [C.pos, C.p1, C.neg, C.norm];
const PLN_FMT = new Intl.NumberFormat('pl-PL', { maximumFractionDigits: 0 });

// ── Shared helpers ────────────────────────────────────────────────────────────

function plnM(v: number): string {
  if (Math.abs(v) >= 1_000_000) return `${(v / 1_000_000).toFixed(1)} M`;
  if (Math.abs(v) >= 1_000)     return `${(v / 1_000).toFixed(0)} k`;
  return `${v.toFixed(0)}`;
}

function safeDivide(a: number, b: number): number | null {
  return b !== 0 && isFinite(a / b) ? a / b : null;
}

interface ChartCardProps { title: string; children: React.ReactNode; height?: number; hint?: string }
function ChartCard({ title, children, height = 210, hint }: ChartCardProps) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4" style={{ minHeight: height + 60 }}>
      <div className="flex items-baseline gap-2 mb-3">
        <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide flex-1">{title}</p>
        {hint && <p className="text-[10px] text-slate-300 italic">{hint}</p>}
      </div>
      <ResponsiveContainer width="100%" height={height}>
        {children as React.ReactElement}
      </ResponsiveContainer>
    </div>
  );
}

const TOOLTIP_STYLE = { fontSize: 11, borderRadius: 8, border: '1px solid #e2e8f0', boxShadow: '0 2px 8px rgba(0,0,0,.06)' };

interface ChartProps { f1: FieldMap; f2: FieldMap; f3?: FieldMap | null; onBarClick?: (index: number) => void; periodLabels?: string[] }

// ── Płynność ──────────────────────────────────────────────────────────────────

export function PlynnostChart({ f1, f2, f3, onBarClick, periodLabels }: ChartProps) {
  const { t } = useLang();
  const [l1, l2, l3] = [periodLabels?.[0] ?? t('chart.p1Current'), periodLabels?.[1] ?? t('chart.p2Comparative'), periodLabels?.[2] ?? 'P3'];
  const data = useMemo(() => [
    {
      name: 'Bieżąca (CR)',
      P1: +(safeDivide(f1.aktywaObrotowe, f1.zobowiazaniaKrotko) ?? 0).toFixed(2),
      P2: +(safeDivide(f2.aktywaObrotowe, f2.zobowiazaniaKrotko) ?? 0).toFixed(2),
      ...(f3 ? { P3: +(safeDivide(f3.aktywaObrotowe, f3.zobowiazaniaKrotko) ?? 0).toFixed(2) } : {}),
    },
    {
      name: 'Szybka (QR)',
      P1: +(safeDivide(f1.aktywaObrotowe - f1.zapasy, f1.zobowiazaniaKrotko) ?? 0).toFixed(2),
      P2: +(safeDivide(f2.aktywaObrotowe - f2.zapasy, f2.zobowiazaniaKrotko) ?? 0).toFixed(2),
      ...(f3 ? { P3: +(safeDivide(f3.aktywaObrotowe - f3.zapasy, f3.zobowiazaniaKrotko) ?? 0).toFixed(2) } : {}),
    },
    {
      name: 'Gotówkowa',
      P1: +(safeDivide(f1.srodkiPieniezne, f1.zobowiazaniaKrotko) ?? 0).toFixed(2),
      P2: +(safeDivide(f2.srodkiPieniezne, f2.zobowiazaniaKrotko) ?? 0).toFixed(2),
      ...(f3 ? { P3: +(safeDivide(f3.srodkiPieniezne, f3.zobowiazaniaKrotko) ?? 0).toFixed(2) } : {}),
    },
  ], [f1, f2, f3]);

  return (
    <ChartCard title={t('chart.liquidityP1P2')} hint="kliknij słupek → szczegóły">
      <BarChart data={data} barCategoryGap="35%" barGap={3}
        onClick={(d) => d?.activeTooltipIndex != null && onBarClick?.(d.activeTooltipIndex as number)}
        style={{ cursor: onBarClick ? 'pointer' : undefined }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
        <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} />
        <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
        <Tooltip formatter={(v) => [`${Number(v).toFixed(2)}x`, '']} contentStyle={TOOLTIP_STYLE} />
        <Legend wrapperStyle={{ fontSize: 11 }} />
        <Bar dataKey="P1" name={l1} fill={C.p1} radius={[5, 5, 0, 0]} maxBarSize={36} />
        <Bar dataKey="P2" name={l2} fill={C.p2} radius={[5, 5, 0, 0]} maxBarSize={36} />
        {f3 && <Bar dataKey="P3" name={l3} fill={C.p3} radius={[5, 5, 0, 0]} maxBarSize={36} />}
        <ReferenceLine y={1.2} stroke={C.norm} strokeDasharray="4 3" strokeWidth={1.5}
          label={{ value: 'min 1,2', position: 'insideTopRight', fontSize: 9, fill: C.norm }} />
      </BarChart>
    </ChartCard>
  );
}

// ── Sprawność ─────────────────────────────────────────────────────────────────

export function SprawnostChart({ f1, f2, f3, onBarClick, periodLabels }: ChartProps) {
  const { t } = useLang();
  const [l1, l2, l3] = [periodLabels?.[0] ?? t('chart.p1Current'), periodLabels?.[1] ?? t('chart.p2Comparative'), periodLabels?.[2] ?? 'P3'];
  const data = useMemo(() => {
    const dso = (f: FieldMap) => f.przychody > 0 ? f.naleznosci / f.przychody * 360 : 0;
    const dsi = (f: FieldMap) => f.kosztyOper > 0 ? f.zapasy / f.kosztyOper * 360 : 0;
    const dpo = (f: FieldMap) => f.kosztyOper > 0 ? f.zobowiazaniaKrotko / f.kosztyOper * 360 : 0;
    const ccc = (f: FieldMap) => dso(f) + dsi(f) - dpo(f);
    return [
      { name: 'DSO (należności)', P1: Math.round(dso(f1)), P2: Math.round(dso(f2)), ...(f3 ? { P3: Math.round(dso(f3)) } : {}) },
      { name: 'DSI (zapasy)',     P1: Math.round(dsi(f1)), P2: Math.round(dsi(f2)), ...(f3 ? { P3: Math.round(dsi(f3)) } : {}) },
      { name: 'DPO (zobow.)',     P1: Math.round(dpo(f1)), P2: Math.round(dpo(f2)), ...(f3 ? { P3: Math.round(dpo(f3)) } : {}) },
      { name: 'CCC',              P1: Math.round(ccc(f1)), P2: Math.round(ccc(f2)), ...(f3 ? { P3: Math.round(ccc(f3)) } : {}) },
    ];
  }, [f1, f2, f3]);

  return (
    <ChartCard title={t('chart.rotationDays')} hint="kliknij → szczegóły">
      <BarChart data={data} barCategoryGap="35%" barGap={3}
        onClick={(d) => d?.activeTooltipIndex != null && onBarClick?.(d.activeTooltipIndex as number)}
        style={{ cursor: onBarClick ? 'pointer' : undefined }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
        <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} />
        <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} tickFormatter={v => `${v}d`} />
        <Tooltip formatter={(v) => [`${Number(v)} dni`, '']} contentStyle={TOOLTIP_STYLE} />
        <Legend wrapperStyle={{ fontSize: 11 }} />
        <ReferenceLine y={60} stroke={C.norm} strokeDasharray="4 3" strokeWidth={1.5}
          label={{ value: '60 dni', position: 'insideTopRight', fontSize: 9, fill: C.norm }} />
        <Bar dataKey="P1" name={l1} fill={C.p1} radius={[5, 5, 0, 0]} maxBarSize={36} />
        <Bar dataKey="P2" name={l2} fill={C.p2} radius={[5, 5, 0, 0]} maxBarSize={36} />
        {f3 && <Bar dataKey="P3" name={l3} fill={C.p3} radius={[5, 5, 0, 0]} maxBarSize={36} />}
      </BarChart>
    </ChartCard>
  );
}

// ── Zadłużenie ────────────────────────────────────────────────────────────────

export function ZadluzenieChart({ f1, f2, f3, onBarClick, periodLabels }: ChartProps) {
  const { t } = useLang();
  const [l1, l2, l3] = [periodLabels?.[0] ?? t('chart.p1Current'), periodLabels?.[1] ?? t('chart.p2Comparative'), periodLabels?.[2] ?? 'P3'];
  const data = useMemo(() => {
    const d1 = f1.zobowiazaniaDlugo + f1.zobowiazaniaKrotko;
    const d2 = f2.zobowiazaniaDlugo + f2.zobowiazaniaKrotko;
    const d3 = f3 ? f3.zobowiazaniaDlugo + f3.zobowiazaniaKrotko : 0;
    return [
      { name: 'Ogólne (D/A)',    P1: +(safeDivide(d1, f1.aktywaRazem) ?? 0).toFixed(2), P2: +(safeDivide(d2, f2.aktywaRazem) ?? 0).toFixed(2), ...(f3 ? { P3: +(safeDivide(d3, f3.aktywaRazem) ?? 0).toFixed(2) } : {}) },
      { name: 'Dług / KW',      P1: +(safeDivide(d1, f1.kapitalWlasny) ?? 0).toFixed(2), P2: +(safeDivide(d2, f2.kapitalWlasny) ?? 0).toFixed(2), ...(f3 ? { P3: +(safeDivide(d3, f3.kapitalWlasny) ?? 0).toFixed(2) } : {}) },
      { name: 'ZD / KW',        P1: +(safeDivide(f1.zobowiazaniaDlugo, f1.kapitalWlasny) ?? 0).toFixed(2), P2: +(safeDivide(f2.zobowiazaniaDlugo, f2.kapitalWlasny) ?? 0).toFixed(2), ...(f3 ? { P3: +(safeDivide(f3.zobowiazaniaDlugo, f3.kapitalWlasny) ?? 0).toFixed(2) } : {}) },
      { name: 'ZK / KW',        P1: +(safeDivide(f1.zobowiazaniaKrotko, f1.kapitalWlasny) ?? 0).toFixed(2), P2: +(safeDivide(f2.zobowiazaniaKrotko, f2.kapitalWlasny) ?? 0).toFixed(2), ...(f3 ? { P3: +(safeDivide(f3.zobowiazaniaKrotko, f3.kapitalWlasny) ?? 0).toFixed(2) } : {}) },
    ];
  }, [f1, f2, f3]);

  return (
    <ChartCard title={t('chart.debtP1P2')} hint="kliknij → szczegóły">
      <BarChart data={data} barCategoryGap="30%" barGap={3}
        onClick={(d) => d?.activeTooltipIndex != null && onBarClick?.(d.activeTooltipIndex as number)}
        style={{ cursor: onBarClick ? 'pointer' : undefined }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
        <XAxis dataKey="name" tick={{ fontSize: 10, fill: '#64748b' }} axisLine={false} tickLine={false} />
        <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
        <Tooltip formatter={(v) => [`${Number(v).toFixed(2)}x`, '']} contentStyle={TOOLTIP_STYLE} />
        <Legend wrapperStyle={{ fontSize: 11 }} />
        <ReferenceLine y={0.6} stroke={C.norm} strokeDasharray="4 3" strokeWidth={1.5}
          label={{ value: 'max 0,6', position: 'insideTopRight', fontSize: 9, fill: C.norm }} />
        <Bar dataKey="P1" name={l1} radius={[5, 5, 0, 0]} maxBarSize={32}>
          {data.map((d, i) => <Cell key={i} fill={d.P1 <= 0.6 ? C.p1 : C.neg} />)}
        </Bar>
        <Bar dataKey="P2" name={l2} fill={C.p2} radius={[5, 5, 0, 0]} maxBarSize={32} />
        {f3 && <Bar dataKey="P3" name={l3} fill={C.p3} radius={[5, 5, 0, 0]} maxBarSize={32} />}
      </BarChart>
    </ChartCard>
  );
}

// ── Rentowność ────────────────────────────────────────────────────────────────

export function RentownoscChart({ f1, f2, f3, onBarClick, periodLabels }: ChartProps) {
  const { t } = useLang();
  const [l1, l2, l3] = [periodLabels?.[0] ?? t('chart.p1Current'), periodLabels?.[1] ?? t('chart.p2Comparative'), periodLabels?.[2] ?? 'P3'];
  const data = useMemo(() => {
    const pct = (a: number, b: number) => b !== 0 ? parseFloat((a / b * 100).toFixed(1)) : 0;
    return [
      { name: 'ROE',     P1: pct(f1.zyskNetto, f1.kapitalWlasny), P2: pct(f2.zyskNetto, f2.kapitalWlasny), ...(f3 ? { P3: pct(f3.zyskNetto, f3.kapitalWlasny) } : {}) },
      { name: 'ROA',     P1: pct(f1.zyskNetto, f1.aktywaRazem),   P2: pct(f2.zyskNetto, f2.aktywaRazem),   ...(f3 ? { P3: pct(f3.zyskNetto, f3.aktywaRazem) } : {}) },
      { name: 'ROS',     P1: pct(f1.zyskNetto, f1.przychody),     P2: pct(f2.zyskNetto, f2.przychody),     ...(f3 ? { P3: pct(f3.zyskNetto, f3.przychody) } : {}) },
      { name: 'EBIT%',   P1: pct(f1.ebit, f1.przychody),          P2: pct(f2.ebit, f2.przychody),          ...(f3 ? { P3: pct(f3.ebit, f3.przychody) } : {}) },
      { name: 'EBITDA%', P1: pct(f1.ebit + f1.amortyzacja, f1.przychody), P2: pct(f2.ebit + f2.amortyzacja, f2.przychody), ...(f3 ? { P3: pct(f3.ebit + f3.amortyzacja, f3.przychody) } : {}) },
    ];
  }, [f1, f2, f3]);

  return (
    <ChartCard title={t('chart.profitabilityP1P2')} hint="kliknij → szczegóły">
      <BarChart data={data} barCategoryGap="30%" barGap={3}
        onClick={(d) => d?.activeTooltipIndex != null && onBarClick?.(d.activeTooltipIndex as number)}
        style={{ cursor: onBarClick ? 'pointer' : undefined }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
        <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} />
        <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} tickFormatter={v => `${v}%`} />
        <Tooltip formatter={(v) => [`${Number(v).toFixed(1)}%`, '']} contentStyle={TOOLTIP_STYLE} />
        <Legend wrapperStyle={{ fontSize: 11 }} />
        <ReferenceLine y={0} stroke="#e2e8f0" />
        <ReferenceLine y={5} stroke={C.norm} strokeDasharray="4 3" strokeWidth={1.5}
          label={{ value: 'min 5%', position: 'insideTopRight', fontSize: 9, fill: C.norm }} />
        <Bar dataKey="P1" name={l1} radius={[5, 5, 0, 0]} maxBarSize={36}>
          {data.map((d, i) => <Cell key={i} fill={d.P1 >= 0 ? C.p1 : C.neg} />)}
        </Bar>
        <Bar dataKey="P2" name={l2} fill={C.p2} radius={[5, 5, 0, 0]} maxBarSize={36} />
        {f3 && <Bar dataKey="P3" name={l3} fill={C.p3} radius={[5, 5, 0, 0]} maxBarSize={36} />}
      </BarChart>
    </ChartCard>
  );
}

// ── Bilans — donut + tabela ───────────────────────────────────────────────────

interface SimpleRow {
  segment: string; name: string; level: number;
  p1: number; p2: number; p3?: number;
  share1: number; share2: number; delta: number | null;
}

function buildLevel1(rows: ReportRow[], total1: number, total2: number): SimpleRow[] {
  return rows
    .filter(r => (r.level === 0 || r.level === 1) && r.name.trim())
    .map(r => ({
      segment: r.segment,
      name: r.name,
      level: r.level,
      p1: r.values.period1,
      p2: r.values.period2,
      p3: r.values.period3,
      share1: total1 !== 0 ? (r.values.period1 / total1) * 100 : 0,
      share2: total2 !== 0 ? (r.values.period2 / total2) * 100 : 0,
      delta: r.values.period2 !== 0 ? (r.values.period1 / r.values.period2 - 1) * 100 : null,
    }));
}

function DeltaCell({ v }: { v: number | null }) {
  if (v === null || !isFinite(v)) return <td className="px-3 py-2 text-center text-slate-300 text-xs tabular-nums">—</td>;
  const color = v > 5 ? 'text-emerald-600' : v < -5 ? 'text-rose-600' : 'text-slate-500';
  const arrow = v > 0.5 ? '↑' : v < -0.5 ? '↓' : '→';
  return (
    <td className={`px-3 py-2 text-right text-xs font-semibold tabular-nums font-mono ${color}`}>
      {arrow} {v > 0 ? '+' : ''}{v.toFixed(1)}%
    </td>
  );
}

function StructureTable({ rows, shareLabel, hasP3 }: { rows: SimpleRow[]; shareLabel: string; hasP3?: boolean }) {
  const { t } = useLang();
  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[560px] text-left border-collapse">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200">
              <th className="px-2 py-2 text-[10px] font-semibold text-slate-400 uppercase w-10">{t('chart.seg')}</th>
              <th className="px-3 py-2 text-[10px] font-semibold text-slate-500 uppercase">{t('chart.position')}</th>
              <th className="px-3 py-2 text-[10px] font-semibold text-blue-500 uppercase text-right">P1</th>
              <th className="px-3 py-2 text-[10px] font-semibold text-blue-400 uppercase text-right">{shareLabel} P1</th>
              <th className="px-3 py-2 text-[10px] font-semibold text-slate-400 uppercase text-right">P2</th>
              {hasP3 && <th className="px-3 py-2 text-[10px] font-semibold text-violet-300 uppercase text-right">P3</th>}
              <th className="px-3 py-2 text-[10px] font-semibold text-slate-400 uppercase text-right">{t('chart.deltaYoY')}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => {
              const indent = r.level === 0 ? '' : 'pl-5';
              const weight = r.level === 0 ? 'font-bold text-slate-800' : 'font-medium text-slate-700';
              const bg = r.level === 0 ? 'bg-slate-50/80' : i % 2 === 0 ? 'bg-white' : 'bg-slate-50/30';
              return (
                <tr key={i} className={`border-b border-slate-100 ${bg} hover:bg-blue-50/20 transition-colors`}>
                  <td className="px-2 py-2 text-[10px] text-slate-400 font-mono text-center">{r.segment}</td>
                  <td className={`px-3 py-2 text-xs ${weight} ${indent}`}>{r.name}</td>
                  <td className="px-3 py-2 text-xs text-right font-mono tabular-nums text-slate-800">{PLN_FMT.format(r.p1)}</td>
                  <td className="px-3 py-2 text-xs text-right font-mono tabular-nums text-blue-600 font-semibold">{r.share1.toFixed(1)}%</td>
                  <td className="px-3 py-2 text-xs text-right font-mono tabular-nums text-slate-500">{PLN_FMT.format(r.p2)}</td>
                  {hasP3 && <td className="px-3 py-2 text-xs text-right font-mono tabular-nums text-violet-400">{r.p3 !== undefined ? PLN_FMT.format(r.p3) : '—'}</td>}
                  <DeltaCell v={r.delta} />
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function DonutChart({ title, data, colors, total }: {
  title: string; data: { name: string; value: number }[]; colors: string[]; total: number;
}) {
  const { t } = useLang();
  const filtered = data.filter(d => Math.abs(d.value) > 0).map(d => ({ ...d, value: Math.abs(d.value) }));
  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
      <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide mb-1">{title}</p>
      <p className="text-[10px] text-slate-400 mb-2">{t('chart.total')} <span className="font-semibold text-slate-600">{PLN_FMT.format(Math.abs(total))} PLN</span></p>
      <ResponsiveContainer width="100%" height={200}>
        <PieChart>
          <Pie data={filtered} cx="50%" cy="50%" innerRadius={48} outerRadius={78}
            paddingAngle={2} dataKey="value" nameKey="name"
            label={({ percent }) => (percent ?? 0) > 0.05 ? `${((percent ?? 0) * 100).toFixed(0)}%` : ''}
            labelLine={false}>
            {filtered.map((_, i) => <Cell key={i} fill={colors[i % colors.length]} stroke="white" strokeWidth={2} />)}
          </Pie>
          <Tooltip formatter={(v) => [PLN_FMT.format(Number(v)) + ' PLN', '']} contentStyle={TOOLTIP_STYLE} />
          <Legend iconType="circle" iconSize={7} wrapperStyle={{ fontSize: 10, lineHeight: '1.7' }} />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}

export function BilansStruktura({ bilans, f1, f2, f3 }: { bilans: ReportRow[]; f1: FieldMap; f2: FieldMap; f3?: FieldMap | null }) {
  const { t } = useLang();
  const hasP3 = !!f3;
  const rows = useMemo(() =>
    buildLevel1(bilans, f1.aktywaRazem || 1, f2.aktywaRazem || 1),
    [bilans, f1.aktywaRazem, f2.aktywaRazem]
  );

  const aktywaDonut = useMemo(() => [
    { name: t('bs.fixedAssets'),  value: f1.aktywaTrwale },
    { name: t('bs.inventory'),    value: f1.zapasy },
    { name: t('bs.receivables'),  value: f1.naleznosci },
    { name: t('bs.cash'),         value: f1.srodkiPieniezne },
    { name: t('bs.otherCurrent'), value: Math.max(0, f1.aktywaObrotowe - f1.zapasy - f1.naleznosci - f1.srodkiPieniezne) },
  ].filter(d => d.value > 0), [f1, t]);

  const pasywDonut = useMemo(() => [
    { name: t('bs.equity'),       value: f1.kapitalWlasny },
    { name: t('bs.longTermLiab'), value: f1.zobowiazaniaDlugo },
    { name: t('bs.shortTermLiab'),value: f1.zobowiazaniaKrotko },
    { name: t('bs.other'),        value: Math.max(0, f1.aktywaRazem - f1.kapitalWlasny - f1.zobowiazaniaDlugo - f1.zobowiazaniaKrotko) },
  ].filter(d => d.value > 0), [f1, t]);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <DonutChart title={t('chart.assetsStructure')} data={aktywaDonut} colors={PIE_AKTYWA} total={f1.aktywaRazem} />
        <DonutChart title={t('chart.liabilitiesStructure')} data={pasywDonut} colors={PIE_PASYWA} total={f1.aktywaRazem} />
      </div>
      <StructureTable rows={rows} shareLabel={t('chart.pctBilans')} hasP3={hasP3} />
    </div>
  );
}

// ── RZiS — waterfall + marże ──────────────────────────────────────────────────

interface WfEntry { name: string; base: number; value: number; total: number; isTotal: boolean }

function buildWaterfall(f: FieldMap, t: (key: string) => string): WfEntry[] {
  const steps = [
    { name: t('pnl.revenue'),    value: f.przychody,             isTotal: true },
    { name: t('pnl.operCosts'),  value: -Math.abs(f.kosztyOper) },
    { name: t('pnl.salesProfit'),value: f.zyskZeSprz,            isTotal: true },
    { name: t('pnl.otherOper'),  value: f.ebit - f.zyskZeSprz },
    { name: t('pnl.ebit'),       value: f.ebit,                  isTotal: true },
    { name: t('pnl.financial'),  value: f.zyskBrutto - f.ebit },
    { name: t('pnl.grossProfit'),value: f.zyskBrutto,            isTotal: true },
    { name: t('pnl.tax'),        value: f.zyskNetto - f.zyskBrutto },
    { name: t('pnl.netProfit'),  value: f.zyskNetto,             isTotal: true },
  ];
  let running = 0;
  return steps.map(s => {
    if (s.isTotal) {
      running = s.value;
      return { name: s.name, base: 0, value: s.value, total: s.value, isTotal: true };
    }
    const base = s.value >= 0 ? running : running + s.value;
    const entry = { name: s.name, base, value: Math.abs(s.value), total: running + s.value, isTotal: false };
    running += s.value;
    return entry;
  });
}

function WfTooltip({ active, payload, label }: { active?: boolean; payload?: { payload: WfEntry }[]; label?: string }) {
  if (!active || !payload?.[0]) return null;
  const e = payload[0].payload;
  return (
    <div className="bg-white border border-slate-200 rounded-lg shadow-lg px-3 py-2 text-xs">
      <p className="font-semibold text-slate-700 mb-0.5">{label}</p>
      <p className="font-mono text-slate-600">{PLN_FMT.format(e.total)} PLN</p>
    </div>
  );
}

export function RZiSStruktura({ rzis, f1, f2, f3 }: { rzis: ReportRow[]; f1: FieldMap; f2: FieldMap; f3?: FieldMap | null }) {
  const { t } = useLang();
  const hasP3 = !!f3;
  const rows = useMemo(() =>
    buildLevel1(rzis, f1.przychody || 1, f2.przychody || 1),
    [rzis, f1.przychody, f2.przychody]
  );
  const wf = useMemo(() => buildWaterfall(f1, t), [f1, t]);

  const marginsData = useMemo(() => {
    const pct = (a: number, b: number) => b !== 0 ? parseFloat((a / b * 100).toFixed(1)) : 0;
    return [
      { name: t('pnl.salesMargin'), P1: pct(f1.zyskZeSprz, f1.przychody), P2: pct(f2.zyskZeSprz, f2.przychody), ...(f3 ? { P3: pct(f3.zyskZeSprz, f3.przychody) } : {}) },
      { name: 'EBIT',               P1: pct(f1.ebit, f1.przychody),        P2: pct(f2.ebit, f2.przychody),       ...(f3 ? { P3: pct(f3.ebit, f3.przychody) } : {}) },
      { name: 'EBITDA',             P1: pct(f1.ebit + f1.amortyzacja, f1.przychody), P2: pct(f2.ebit + f2.amortyzacja, f2.przychody), ...(f3 ? { P3: pct(f3.ebit + f3.amortyzacja, f3.przychody) } : {}) },
      { name: t('pnl.net'),         P1: pct(f1.zyskNetto, f1.przychody),   P2: pct(f2.zyskNetto, f2.przychody),  ...(f3 ? { P3: pct(f3.zyskNetto, f3.przychody) } : {}) },
    ];
  }, [f1, f2, f3, t]);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <ChartCard title={t('chart.waterfallP1')} height={230}>
          <ComposedChart data={wf} barCategoryGap="18%">
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
            <XAxis dataKey="name" tick={{ fontSize: 9, fill: '#64748b' }} axisLine={false} tickLine={false} angle={-25} textAnchor="end" height={46} />
            <YAxis tick={{ fontSize: 9, fill: '#94a3b8' }} axisLine={false} tickLine={false} tickFormatter={v => plnM(v)} />
            <Tooltip content={<WfTooltip />} />
            <Bar dataKey="base" stackId="a" fill="transparent" />
            <Bar dataKey="value" stackId="a" radius={[4, 4, 0, 0]} maxBarSize={40}>
              {wf.map((e, i) => (
                <Cell key={i} fill={e.isTotal ? (e.total >= 0 ? C.p1 : C.neg) : (e.total >= (wf[i - 1]?.total ?? 0) ? C.pos : C.neg)} />
              ))}
            </Bar>
            <ReferenceLine y={0} stroke="#e2e8f0" />
          </ComposedChart>
        </ChartCard>

        <ChartCard title={t('chart.marginsP1P2')} height={230}>
          <BarChart data={marginsData} barCategoryGap="30%" barGap={3}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
            <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} tickFormatter={v => `${v}%`} />
            <Tooltip formatter={(v) => [`${Number(v).toFixed(1)}%`, '']} contentStyle={TOOLTIP_STYLE} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <ReferenceLine y={0} stroke="#e2e8f0" />
            <Bar dataKey="P1" name="P1" radius={[5, 5, 0, 0]} maxBarSize={36}>
              {marginsData.map((d, i) => <Cell key={i} fill={d.P1 >= 0 ? C.p1 : C.neg} />)}
            </Bar>
            <Bar dataKey="P2" name="P2" fill={C.p2} radius={[5, 5, 0, 0]} maxBarSize={36} />
            {f3 && <Bar dataKey="P3" name="P3" fill={C.p3} radius={[5, 5, 0, 0]} maxBarSize={36} />}
          </BarChart>
        </ChartCard>
      </div>

      <StructureTable rows={rows} shareLabel={t('chart.pctRevenue')} hasP3={hasP3} />
    </div>
  );
}

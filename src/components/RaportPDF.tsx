import { useState, useCallback, useMemo } from 'react';
import {
  PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis,
  CartesianGrid, Tooltip, Legend, ResponsiveContainer, ReferenceLine,
} from 'recharts';
import { useCompanies } from '../store/CompaniesContext';
import { mapFields } from '../lib/fieldMapping';
import { computeBeneish } from '../lib/controlChecks';
import { useLang } from '../i18n/LanguageContext';

// ── Formatters ────────────────────────────────────────────────────────────────
const fmt = (v: number) =>
  v === 0 ? '—' : (v / 1000).toLocaleString('pl-PL', { maximumFractionDigits: 0 }) + ' tys.';
const pct = (v: number, t: number) => (t ? ((v / t) * 100).toFixed(1) + '%' : '—');
const r2 = (v: number) => v.toFixed(2);
const today = new Date().toLocaleDateString('pl-PL', { day: '2-digit', month: 'long', year: 'numeric' });

// ── Colors ───────────────────────────────────────────────────────────────────
const CA = ['#3b82f6', '#93c5fd'];
const CP = ['#10b981', '#f59e0b', '#ef4444'];

// ── AI fetch with shared sessionStorage cache ─────────────────────────────────
async function fetchAI(section: string, cacheKey: string, data: Record<string, unknown>): Promise<string> {
  const cached = sessionStorage.getItem(cacheKey);
  if (cached) {
    try { const p = JSON.parse(cached); if (p.text) return p.text; } catch {}
  }
  const res = await fetch('/api/analyze', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ section, lang: 'pl', period: 'bieżący', data }),
  });
  if (res.status === 404) throw new Error('Endpoint AI niedostępny lokalnie — użyj "vercel dev" lub wersji produkcyjnej');
  const raw = await res.text();
  if (!raw) throw new Error(`Pusta odpowiedź serwera (HTTP ${res.status})`);
  let json: any;
  try { json = JSON.parse(raw); } catch { throw new Error(`Nieprawidłowa odpowiedź serwera AI`); }
  if (!res.ok) throw new Error(json?.error ?? `Błąd AI (HTTP ${res.status})`);
  sessionStorage.setItem(cacheKey, JSON.stringify({ text: json.text, ts: Date.now() }));
  return json.text ?? '';
}

// ── Pie label ─────────────────────────────────────────────────────────────────
const PieLabel = ({ cx, cy, midAngle, innerRadius, outerRadius, percent }: any) => {
  if (percent < 0.08) return null;
  const R = Math.PI / 180;
  const r = innerRadius + (outerRadius - innerRadius) * 0.55;
  const x = cx + r * Math.cos(-midAngle * R);
  const y = cy + r * Math.sin(-midAngle * R);
  return <text x={x} y={y} fill="white" textAnchor="middle" dominantBaseline="central" fontSize={9} fontWeight={700}>{(percent * 100).toFixed(0)}%</text>;
};

// ── PrintPage wrapper ─────────────────────────────────────────────────────────
function PrintPage({ children, num, total }: { children: React.ReactNode; num: number; total: number }) {
  return (
    <div className="bg-white shadow-lg print:shadow-none" style={{ width: '100%', minHeight: '297mm', padding: '14mm 16mm', boxSizing: 'border-box', pageBreakAfter: 'always', position: 'relative' }}>
      {children}
      <div style={{ position: 'absolute', bottom: '10mm', right: '16mm', fontSize: 8, color: '#94a3b8' }}>
        Strona {num} z {total} · FinScope PL · {today}
      </div>
    </div>
  );
}

// ── AI block ─────────────────────────────────────────────────────────────────
function AIBlock({ text, label }: { text?: string; label?: string }) {
  if (!text) return null;
  return (
    <div className="mt-4 pt-3 border-t border-slate-200">
      <div className="flex items-start gap-2">
        <span className="text-base shrink-0 mt-0.5">🤖</span>
        <div>
          <p className="text-[10px] font-bold text-violet-600 uppercase tracking-wide mb-1">{label ?? 'Komentarz AI'}</p>
          <p className="text-[11px] text-slate-700 leading-relaxed">{text}</p>
        </div>
      </div>
    </div>
  );
}

// ── Section header ────────────────────────────────────────────────────────────
function SectionHeader({ num, title, sub }: { num: string; title: string; sub?: string }) {
  return (
    <div className="flex items-center gap-3 mb-4 pb-2 border-b-2 border-slate-200">
      <div className="w-7 h-7 bg-violet-600 text-white rounded-lg flex items-center justify-center text-xs font-black shrink-0">{num}</div>
      <div>
        <h2 className="text-base font-black text-slate-800 leading-tight">{title}</h2>
        {sub && <p className="text-[10px] text-slate-400">{sub}</p>}
      </div>
    </div>
  );
}

// ── KPI chip ─────────────────────────────────────────────────────────────────
function KPI({ label, val, sub, color = 'blue' }: { label: string; val: string; sub?: string; color?: string }) {
  return (
    <div className={`bg-${color}-50 border border-${color}-100 rounded-lg p-2.5`}>
      <p className="text-[9px] text-slate-500 uppercase tracking-wide">{label}</p>
      <p className={`text-sm font-black text-${color}-700 mt-0.5`}>{val}</p>
      {sub && <p className="text-[9px] text-slate-400 mt-0.5">{sub}</p>}
    </div>
  );
}

// ── Risk badge ────────────────────────────────────────────────────────────────
function RiskBadge({ ok, lowLabel, highLabel }: { ok: boolean; lowLabel?: string; highLabel?: string }) {
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${ok ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'}`}>
      {ok ? (lowLabel ?? '✓ Niskie ryzyko') : (highLabel ?? '⚠ Wysokie ryzyko')}
    </span>
  );
}

type Phase = 'confirm' | 'loading' | 'preview';

// ─────────────────────────────────────────────────────────────────────────────
export default function RaportPDF() {
  const { activeCompany } = useCompanies();
  const { t } = useLang();
  const [phase, setPhase] = useState<Phase>('confirm');
  const [progress, setProgress] = useState(0);
  const [aiTexts, setAITexts] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  const bilans = activeCompany?.bilans ?? [];
  const rzis = activeCompany?.rzis ?? [];
  const grpData = activeCompany?.grpData ?? null;
  const rm = activeCompany?.raportMiesieczny ?? null;
  const companyId = activeCompany?.id ?? 'local';
  const period = activeCompany?.period ?? '';
  const p1 = activeCompany?.periodLabels?.[0] ?? 'Okres bieżący';
  const p2 = activeCompany?.periodLabels?.[1] ?? 'Okres poprzedni';

  const f1 = useMemo(() => mapFields(bilans, rzis, 1), [bilans, rzis]);
  const f2 = useMemo(() => mapFields(bilans, rzis, 2), [bilans, rzis]);
  const beneish = useMemo(() => computeBeneish(bilans, rzis), [bilans, rzis]);

  // ── Discriminant: Hołda Z_H (inline) ─────────────────────────────────────
  const holda = useMemo(() => {
    if (!f1.aktywaRazem) return null;
    const x1 = f1.zobowiazaniaKrotko ? f1.aktywaObrotowe / f1.zobowiazaniaKrotko : 0;
    const x2 = f1.aktywaRazem ? (f1.zobowiazaniaDlugo + f1.zobowiazaniaKrotko) * 100 / f1.aktywaRazem : 0;
    const x3 = f1.aktywaRazem ? f1.przychody / f1.aktywaRazem : 0;
    const x4 = f1.aktywaRazem ? f1.zyskNetto * 100 / f1.aktywaRazem : 0;
    const base = f1.cogs || f1.kosztyOper;
    const x5 = base ? f1.zobowiazaniaKrotko * 360 / base : 0;
    const score = 0.605 + 0.681 * x1 - 0.0196 * x2 + 0.157 * x3 + 0.00969 * x4 + 0.000672 * x5;
    return { score, ok: score > 0, x1, x2, x3, x4, x5 };
  }, [f1]);

  // ── Altman Z' (for non-public companies) ─────────────────────────────────
  const altman = useMemo(() => {
    if (!f1.aktywaRazem) return null;
    const x1 = f1.aktywaRazem ? (f1.aktywaObrotowe - f1.zobowiazaniaKrotko) / f1.aktywaRazem : 0;
    const x2 = f1.aktywaRazem ? f1.kapitalWlasny / f1.aktywaRazem : 0;
    const x3 = f1.aktywaRazem ? f1.ebit / f1.aktywaRazem : 0;
    const x4 = (f1.zobowiazaniaDlugo + f1.zobowiazaniaKrotko) ? f1.kapitalWlasny / (f1.zobowiazaniaDlugo + f1.zobowiazaniaKrotko) : 0;
    const x5 = f1.aktywaRazem ? f1.przychody / f1.aktywaRazem : 0;
    const score = 0.717 * x1 + 0.847 * x2 + 3.107 * x3 + 0.420 * x4 + 0.998 * x5;
    const zone = score > 2.9 ? 'bezpieczna' : score > 1.23 ? 'szara strefa' : 'ryzyko';
    return { score, zone, ok: score > 2.9 };
  }, [f1]);

  // ── Grupy pracy aggregate ─────────────────────────────────────────────────
  const grpSummary = useMemo(() => {
    if (!grpData) return null;
    const byCity: Record<string, { przychod: number; mb: number; count: number }> = {};
    grpData.groups.forEach(g => {
      if (!byCity[g.miasto]) byCity[g.miasto] = { przychod: 0, mb: 0, count: 0 };
      byCity[g.miasto].przychod += g.total.przychod;
      byCity[g.miasto].mb += g.total.mb;
      byCity[g.miasto].count++;
    });
    const rows = Object.entries(byCity).map(([city, d]) => ({
      city, przychod: d.przychod, mb: d.mb, mbPct: d.przychod ? d.mb / d.przychod * 100 : 0, count: d.count,
    })).sort((a, b) => b.przychod - a.przychod);
    const totalP = rows.reduce((s, r) => s + r.przychod, 0);
    const totalMB = rows.reduce((s, r) => s + r.mb, 0);
    return { rows, totalP, totalMB, mbPct: totalP ? totalMB / totalP * 100 : 0 };
  }, [grpData]);

  // ── Monthly report departments ────────────────────────────────────────────
  const rmDepts = useMemo(() => {
    if (!rm) return null;
    return rm.departments.map(d => ({
      name: d.label.length > 16 ? d.label.slice(0, 15) + '…' : d.label,
      fullName: d.label,
      przychod: d.revenue.total,
      koszt: d.cost.total,
      mb: d.margin.total,
      mbPct: d.revenue.total ? d.margin.total / d.revenue.total * 100 : 0,
    })).sort((a, b) => b.przychod - a.przychod).slice(0, 8);
  }, [rm]);

  // ── Section definitions (key = shared sessionStorage cacheKey) ────────────
  const sections = useMemo(() => {
    const s = [
      {
        key: 'bilans_aktywa',
        label: t('pdf.s.bilansAktywa'),
        // Matches BilansVisuals button cacheKey
        cacheKey: `ai_bilans_struktura_${p1}_pl`,
        skip: !bilans.length,
        dataFn: () => ({
          aktywaTrwale: f1.aktywaTrwale, aktywaObrotowe: f1.aktywaObrotowe,
          aktywaRazem: f1.aktywaRazem, zapasy: f1.zapasy, naleznosci: f1.naleznosci,
          srodkiPieniezne: f1.srodkiPieniezne, period: p1,
          pctTrwale: +pct(f1.aktywaTrwale, f1.aktywaRazem),
          pctObrotowe: +pct(f1.aktywaObrotowe, f1.aktywaRazem),
        }),
      },
      {
        key: 'bilans_pasywa',
        label: t('pdf.s.bilansPasywa'),
        cacheKey: `ai_pdf_bilans_pasywa_${p1}_pl`,
        skip: !bilans.length,
        dataFn: () => ({
          kapitalWlasny: f1.kapitalWlasny, zobowiazaniaDlugo: f1.zobowiazaniaDlugo,
          zobowiazaniaKrotko: f1.zobowiazaniaKrotko, aktywaRazem: f1.aktywaRazem,
          pctKapital: +pct(f1.kapitalWlasny, f1.aktywaRazem),
          pctZadluzenie: +pct(f1.zobowiazaniaDlugo + f1.zobowiazaniaKrotko, f1.aktywaRazem),
        }),
      },
      {
        key: 'rzis_wyniki',
        label: t('pdf.s.rzisWyniki'),
        // Matches BilansVisuals button cacheKey for rzis_rentownosc
        cacheKey: `ai_rzis_rentownosc_${p1}_pl`,
        skip: !rzis.length,
        dataFn: () => ({
          przychody: f1.przychody, kosztyOper: f1.kosztyOper, ebit: f1.ebit,
          zyskNetto: f1.zyskNetto, amortyzacja: f1.amortyzacja,
          marzaNetto: f1.przychody ? +((f1.zyskNetto / f1.przychody) * 100).toFixed(1) : null,
          marzaEBIT: f1.przychody ? +((f1.ebit / f1.przychody) * 100).toFixed(1) : null,
          period: p1,
        }),
      },
      {
        key: 'rzis_marze',
        label: t('pdf.s.rzisMarze'),
        cacheKey: `ai_pdf_rzis_marze_${period}_pl`,
        skip: !rzis.length,
        dataFn: () => ({
          p1: { marza_netto: f1.przychody ? +((f1.zyskNetto / f1.przychody) * 100).toFixed(1) : null, przychody: f1.przychody, ebit: f1.ebit },
          p2: { marza_netto: f2.przychody ? +((f2.zyskNetto / f2.przychody) * 100).toFixed(1) : null, przychody: f2.przychody, ebit: f2.ebit },
          period: p1,
        }),
      },
      {
        key: 'beneish',
        label: t('pdf.s.beneish'),
        // Matches RatioAnalysis button cacheKey
        cacheKey: `ai_ratio_${companyId}_beneish_${period}_pl`,
        skip: !beneish,
        dataFn: () => ({
          mscore: beneish?.mscore?.toFixed(3), highRisk: beneish?.highRisk,
          indices: beneish?.indices?.map(i => ({ key: i.key, value: i.value.toFixed(3), weight: i.weight, contribution: i.contribution.toFixed(3) })),
          topDrivers: beneish?.topDrivers,
        }),
      },
      {
        key: 'dyskryminacyjne',
        label: t('pdf.s.dyskryminacyjne'),
        // Matches RatioAnalysis button cacheKey
        cacheKey: `ai_ratio_${companyId}_dyskryminacyjne_${period}_pl`,
        skip: !holda,
        dataFn: () => ({
          holda: holda ? { score: +r2(holda.score), ok: holda.ok, x1: +r2(holda.x1), x2: +r2(holda.x2), x3: +r2(holda.x3), x4: +r2(holda.x4) } : null,
          altman_z_prime: altman ? { score: +r2(altman.score), zone: altman.zone, ok: altman.ok } : null,
          roa: f1.aktywaRazem ? +((f1.zyskNetto / f1.aktywaRazem) * 100).toFixed(2) : null,
          zadluzenie: f1.aktywaRazem ? +((f1.zobowiazaniaDlugo + f1.zobowiazaniaKrotko) / f1.aktywaRazem * 100).toFixed(1) : null,
        }),
      },
      {
        key: 'grupy',
        label: t('pdf.s.grupy'),
        // Matches RaportGrupy button cacheKey
        cacheKey: `ai_grp_${companyId}_grupy_${period}_pl`,
        skip: !grpSummary,
        dataFn: () => ({
          total_revenue: grpSummary?.totalP, total_mb: grpSummary?.totalMB, mb_pct: grpSummary?.mbPct?.toFixed(1),
          by_city: grpSummary?.rows.map(r => ({ city: r.city, przychod: r.przychod, mb: r.mb, mbPct: r.mbPct.toFixed(1), count: r.count })),
        }),
      },
      {
        key: 'raport_miesieczny',
        label: t('pdf.s.raportMies'),
        // Matches RaportMiesieczny kpi button cacheKey
        cacheKey: `ai_${companyId}_kpi_${rm?.period ?? ''}_pl`,
        skip: !rmDepts,
        dataFn: () => ({
          period: rm?.period, total_revenue: rm?.totals.revenue.total,
          departments: rmDepts?.map(d => ({ name: d.fullName, przychod: d.przychod, mb: d.mb, mbPct: d.mbPct.toFixed(1) })),
        }),
      },
      {
        key: 'podsumowanie',
        label: t('pdf.s.podsumowanie'),
        cacheKey: `ai_pdf_podsumowanie_${period}_pl`,
        skip: false,
        dataFn: () => ({
          company: activeCompany?.name, period: p1,
          aktywaRazem: f1.aktywaRazem, kapitalWlasny: f1.kapitalWlasny,
          przychody: f1.przychody, zyskNetto: f1.zyskNetto,
          marzaNetto: f1.przychody ? +((f1.zyskNetto / f1.przychody) * 100).toFixed(1) : null,
          beneishHighRisk: beneish?.highRisk ?? null,
          holdaOk: holda?.ok ?? null,
          grpCities: grpSummary?.rows.length ?? null,
        }),
      },
    ];
    return s.filter(sec => !sec.skip);
  }, [f1, f2, p1, p2, period, companyId, beneish, holda, altman, grpSummary, rmDepts, rm, bilans, rzis, activeCompany]);

  const TOTAL_PAGES = 1 + sections.length; // page 1 = title+TOC

  const startGeneration = useCallback(async () => {
    setPhase('loading');
    setProgress(0);
    setError(null);
    const results: Record<string, string> = {};
    try {
      for (let i = 0; i < sections.length; i++) {
        const s = sections[i];
        results[s.key] = await fetchAI(s.key, s.cacheKey, s.dataFn());
        setProgress(i + 1);
      }
      setAITexts(results);
      setPhase('preview');
    } catch (err: any) {
      setError(err.message ?? 'Błąd generowania raportu');
      setPhase('confirm');
    }
  }, [sections]);

  // ── Confirm ───────────────────────────────────────────────────────────────
  if (phase === 'confirm') {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8 bg-slate-50">
        <div className="bg-white rounded-2xl shadow-lg border border-slate-200 max-w-lg w-full p-8 space-y-5">
          <div className="text-center">
            <div className="w-16 h-16 bg-violet-100 rounded-2xl flex items-center justify-center mx-auto text-3xl mb-3">📄</div>
            <h2 className="text-lg font-bold text-slate-800">{t('pdf.pageTitle')}</h2>
            <p className="text-sm text-slate-500 mt-1">{activeCompany?.name ?? 'Brak firmy'} · {p1}</p>
          </div>
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-xs text-amber-700 leading-relaxed">
            <strong>⚠️ </strong>{t('pdf.confirm.info').replace('{count}', String(sections.length))}
          </div>
          {error && <div className="bg-rose-50 border border-rose-200 rounded-xl p-3 text-xs text-rose-700">{error}</div>}
          <div className="space-y-1.5">
            {[{ n: 1, label: t('pdf.s.title') }, ...sections.map((s, i) => ({ n: i + 2, label: s.label }))].map(({ n, label }) => (
              <div key={n} className="flex items-center gap-2.5 text-xs text-slate-500">
                <span className="w-5 h-5 bg-slate-100 text-slate-500 rounded-full text-[10px] font-bold flex items-center justify-center shrink-0">{n}</span>
                <span>{label}</span>
              </div>
            ))}
          </div>
          <button
            onClick={startGeneration}
            disabled={!activeCompany}
            className="w-full py-2.5 bg-violet-600 hover:bg-violet-700 text-white text-sm font-bold rounded-xl transition-colors disabled:opacity-40"
          >
            {t('pdf.generate').replace('{count}', String(sections.length))}
          </button>
        </div>
      </div>
    );
  }

  // ── Loading ───────────────────────────────────────────────────────────────
  if (phase === 'loading') {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8 bg-slate-50">
        <div className="bg-white rounded-2xl shadow-lg border border-slate-200 max-w-sm w-full p-8 text-center space-y-4">
          <div className="text-3xl animate-pulse">🤖</div>
          <h2 className="text-base font-bold text-slate-700">{t('pdf.generating')}</h2>
          <p className="text-xs text-slate-400">{t('pdf.progress').replace('{done}', String(progress)).replace('{total}', String(sections.length))} · {sections[progress]?.label ?? '✓'}</p>
          <div className="w-full bg-slate-100 rounded-full h-2">
            <div className="h-2 bg-violet-500 rounded-full transition-all duration-500" style={{ width: `${(progress / sections.length) * 100}%` }} />
          </div>
        </div>
      </div>
    );
  }

  // ── Preview ───────────────────────────────────────────────────────────────
  const aktywaData = [
    { name: t('bs.fixedAssets'), value: f1.aktywaTrwale },
    { name: t('vis.currentAssets'), value: f1.aktywaObrotowe },
  ].filter(d => d.value > 0);

  const pasywaDData = [
    { name: t('bs.equity'), value: f1.kapitalWlasny },
    { name: t('bs.longTermLiab'), value: f1.zobowiazaniaDlugo },
    { name: t('bs.shortTermLiab'), value: f1.zobowiazaniaKrotko },
  ].filter(d => d.value > 0);

  const trendData = [
    { name: p1, przychody: f1.przychody, ebit: f1.ebit, zysk: f1.zyskNetto, aktywa: f1.aktywaRazem },
    { name: p2, przychody: f2.przychody, ebit: f2.ebit, zysk: f2.zyskNetto, aktywa: f2.aktywaRazem },
  ].reverse();

  const marginData = [
    {
      name: t('vis.salesMargin'),
      [p1]: f1.przychody ? +((f1.zyskZeSprz / f1.przychody) * 100).toFixed(1) : 0,
      [p2]: f2.przychody ? +((f2.zyskZeSprz / f2.przychody) * 100).toFixed(1) : 0,
    },
    {
      name: t('vis.ebitMargin'),
      [p1]: f1.przychody ? +((f1.ebit / f1.przychody) * 100).toFixed(1) : 0,
      [p2]: f2.przychody ? +((f2.ebit / f2.przychody) * 100).toFixed(1) : 0,
    },
    {
      name: t('vis.netMargin'),
      [p1]: f1.przychody ? +((f1.zyskNetto / f1.przychody) * 100).toFixed(1) : 0,
      [p2]: f2.przychody ? +((f2.zyskNetto / f2.przychody) * 100).toFixed(1) : 0,
    },
  ];

  let pageNum = 2;
  const getPage = () => pageNum++;

  return (
    <div className="flex-1 overflow-y-auto bg-slate-200 print:overflow-visible print:h-auto print:bg-white">
      {/* Print CSS — force full content visibility */}
      <style>{`
        @media print {
          html, body { overflow: visible !important; height: auto !important; }
          #root, #root > *, [class*="flex-1"], [class*="overflow"] {
            overflow: visible !important;
            height: auto !important;
            max-height: none !important;
          }
        }
      `}</style>
      {/* Toolbar */}
      <div className="print:hidden sticky top-0 z-10 bg-white border-b border-slate-200 px-4 py-2 flex items-center gap-3">
        <button onClick={() => setPhase('confirm')} className="px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-100 rounded-lg transition-colors">{t('pdf.back')}</button>
        <span className="text-xs text-slate-300">|</span>
        <button onClick={() => window.print()} className="inline-flex items-center gap-1.5 px-4 py-1.5 bg-violet-600 hover:bg-violet-700 text-white text-xs font-bold rounded-lg transition-colors">
          {t('pdf.print')}
        </button>
        <button onClick={startGeneration} className="px-3 py-1.5 text-xs text-slate-500 hover:bg-slate-100 rounded-lg transition-colors">{t('pdf.regenerate')}</button>
        <span className="text-xs text-slate-400 ml-auto">{TOTAL_PAGES} {t('pdf.pages')} · {activeCompany?.name}</span>
      </div>

      <div className="space-y-4 p-4 max-w-[900px] mx-auto">

        {/* ── PAGE 1: Title + TOC ─────────────────────────────────────────── */}
        <PrintPage num={1} total={TOTAL_PAGES}>
          <div className="flex flex-col h-full">
            {/* Logo */}
            <div className="flex items-center gap-3 mb-8">
              <div className="w-9 h-9 bg-violet-600 rounded-xl flex items-center justify-center text-white text-base font-black">F</div>
              <div>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">FinScope PL</p>
                <p className="text-[9px] text-slate-300">Platforma analiz finansowych</p>
              </div>
            </div>

            {/* Title */}
            <div className="flex-1 flex flex-col justify-center text-center space-y-4 py-8">
              <div className="w-16 h-16 bg-gradient-to-br from-violet-500 to-blue-600 rounded-2xl flex items-center justify-center mx-auto text-3xl">📊</div>
              <div>
                <h1 className="text-2xl font-black text-slate-800">{activeCompany?.name ?? 'Raport Finansowy'}</h1>
                <p className="text-slate-400 text-sm mt-1">Raport Ogólny · Analiza Finansowa</p>
              </div>
              <div className="flex justify-center gap-8 pt-2">
                {[['Okres', p1], ['Wygenerowano', today], ['Status', 'Poufny']].map(([l, v]) => (
                  <div key={l} className="text-center">
                    <p className="text-[9px] text-slate-400 uppercase tracking-wide">{l}</p>
                    <p className="text-sm font-bold text-slate-700 mt-0.5">{v}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* TOC */}
            <div>
              <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-2">{t('pdf.toc')}</p>
              <div className="space-y-1">
                {[{ n: 1, label: t('pdf.s.title') }, ...sections.map((s, i) => ({ n: i + 2, label: s.label }))].map(({ n, label }) => (
                  <div key={n} className="flex items-center gap-2 border-b border-slate-100 py-1">
                    <span className="w-5 h-5 bg-violet-100 text-violet-700 rounded-full text-[9px] font-black flex items-center justify-center shrink-0">{n}</span>
                    <span className="text-[11px] text-slate-600 flex-1">{label}</span>
                    <span className="text-[9px] text-slate-300">{n}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </PrintPage>

        {/* ── PAGE 2: Bilans Aktywów ──────────────────────────────────────── */}
        {sections.find(s => s.key === 'bilans_aktywa') && (() => {
          const pg = getPage();
          return (
            <PrintPage num={pg} total={TOTAL_PAGES}>
              <SectionHeader num={String(pg)} title={t('pdf.s.bilansAktywa')} sub={p1} />
              <div className="grid grid-cols-2 gap-4 mb-3">
                <div>
                  <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-1">{t('vis.assetStructure')}</p>
                  <ResponsiveContainer width="100%" height={180}>
                    <PieChart>
                      <Pie data={aktywaData} cx="50%" cy="50%" innerRadius={45} outerRadius={82} dataKey="value" labelLine={false} label={PieLabel}>
                        {aktywaData.map((_, i) => <Cell key={i} fill={CA[i]} />)}
                      </Pie>
                      <Tooltip formatter={(v: any) => fmt(v)} />
                      <Legend wrapperStyle={{ fontSize: 10 }} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="flex flex-col gap-2 justify-center">
                  <KPI label={t('vis.totalAssets')} val={fmt(f1.aktywaRazem)} color="blue" />
                  <KPI label={t('bs.fixedAssets')} val={fmt(f1.aktywaTrwale)} sub={pct(f1.aktywaTrwale, f1.aktywaRazem)} color="blue" />
                  <KPI label={t('vis.currentAssets')} val={fmt(f1.aktywaObrotowe)} sub={pct(f1.aktywaObrotowe, f1.aktywaRazem)} color="slate" />
                  <KPI label={t('bs.cash')} val={fmt(f1.srodkiPieniezne)} color="emerald" />
                </div>
              </div>
              <table className="w-full text-[10px] mb-2">
                <thead><tr className="border-b-2 border-slate-200">
                  <th className="text-left py-1 text-slate-500">Pozycja</th>
                  <th className="text-right py-1 text-slate-500">{p1}</th>
                  <th className="text-right py-1 text-slate-400">{p2}</th>
                  <th className="text-right py-1 text-slate-400">% sumy</th>
                </tr></thead>
                <tbody>
                  {[
                    { l: 'Aktywa trwałe', v1: f1.aktywaTrwale, v2: f2.aktywaTrwale, bold: true },
                    { l: '  Zapasy', v1: f1.zapasy, v2: f2.zapasy },
                    { l: '  Należności', v1: f1.naleznosci, v2: f2.naleznosci },
                    { l: '  Środki pieniężne', v1: f1.srodkiPieniezne, v2: f2.srodkiPieniezne },
                    { l: 'Aktywa obrotowe', v1: f1.aktywaObrotowe, v2: f2.aktywaObrotowe, bold: true },
                    { l: 'SUMA AKTYWÓW', v1: f1.aktywaRazem, v2: f2.aktywaRazem, bold: true },
                  ].map(row => (
                    <tr key={row.l} className="border-b border-slate-100">
                      <td className={`py-0.5 text-slate-600 ${row.bold ? 'font-bold' : ''}`}>{row.l}</td>
                      <td className={`py-0.5 text-right tabular-nums text-slate-700 ${row.bold ? 'font-bold' : ''}`}>{fmt(row.v1)}</td>
                      <td className="py-0.5 text-right tabular-nums text-slate-400">{fmt(row.v2)}</td>
                      <td className="py-0.5 text-right text-slate-400">{pct(row.v1, f1.aktywaRazem)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {/* Wskaźniki płynności */}
              <div className="mt-2 mb-2">
                <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-1.5">Wskaźniki płynności i struktury</p>
                <div className="grid grid-cols-4 gap-2">
                  {[
                    {
                      l: 'Płynność bieżąca (CR)',
                      v: f1.zobowiazaniaKrotko ? (f1.aktywaObrotowe / f1.zobowiazaniaKrotko).toFixed(2) : '—',
                      ok: f1.zobowiazaniaKrotko ? f1.aktywaObrotowe / f1.zobowiazaniaKrotko >= 1.2 : null,
                      hint: '> 1,2 bezpieczny',
                    },
                    {
                      l: 'Płynność szybka (QR)',
                      v: f1.zobowiazaniaKrotko ? ((f1.aktywaObrotowe - f1.zapasy) / f1.zobowiazaniaKrotko).toFixed(2) : '—',
                      ok: f1.zobowiazaniaKrotko ? (f1.aktywaObrotowe - f1.zapasy) / f1.zobowiazaniaKrotko >= 1.0 : null,
                      hint: '> 1,0 bezpieczny',
                    },
                    {
                      l: 'Gotówkowa (Cash)',
                      v: f1.zobowiazaniaKrotko ? (f1.srodkiPieniezne / f1.zobowiazaniaKrotko).toFixed(2) : '—',
                      ok: f1.zobowiazaniaKrotko ? f1.srodkiPieniezne / f1.zobowiazaniaKrotko >= 0.2 : null,
                      hint: '> 0,2 bezpieczny',
                    },
                    {
                      l: 'Udział AO w aktywach',
                      v: f1.aktywaRazem ? pct(f1.aktywaObrotowe, f1.aktywaRazem) : '—',
                      ok: null,
                      hint: p1,
                    },
                  ].map(r => (
                    <div key={r.l} className={`rounded-lg p-2.5 border ${r.ok === true ? 'bg-emerald-50 border-emerald-200' : r.ok === false ? 'bg-rose-50 border-rose-200' : 'bg-slate-50 border-slate-200'}`}>
                      <p className="text-[8.5px] text-slate-500 leading-tight">{r.l}</p>
                      <p className={`text-sm font-black mt-0.5 ${r.ok === true ? 'text-emerald-700' : r.ok === false ? 'text-rose-600' : 'text-slate-700'}`}>{r.v}</p>
                      <p className="text-[8px] text-slate-400 mt-0.5">{r.hint}</p>
                    </div>
                  ))}
                </div>
              </div>
              <AIBlock text={aiTexts['bilans_aktywa']} label={t('pdf.aiComment')} />
            </PrintPage>
          );
        })()}

        {/* ── PAGE 3: Bilans Pasywów ──────────────────────────────────────── */}
        {sections.find(s => s.key === 'bilans_pasywa') && (() => {
          const pg = getPage();
          return (
            <PrintPage num={pg} total={TOTAL_PAGES}>
              <SectionHeader num={String(pg)} title={t('pdf.s.bilansPasywa')} sub={p1} />
              <div className="grid grid-cols-2 gap-4 mb-3">
                <div>
                  <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-1">{t('vis.liabStructure')}</p>
                  <ResponsiveContainer width="100%" height={180}>
                    <PieChart>
                      <Pie data={pasywaDData} cx="50%" cy="50%" innerRadius={45} outerRadius={82} dataKey="value" labelLine={false} label={PieLabel}>
                        {pasywaDData.map((_, i) => <Cell key={i} fill={CP[i]} />)}
                      </Pie>
                      <Tooltip formatter={(v: any) => fmt(v)} />
                      <Legend wrapperStyle={{ fontSize: 10 }} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="flex flex-col gap-2 justify-center">
                  <KPI label={t('bs.equity')} val={fmt(f1.kapitalWlasny)} sub={pct(f1.kapitalWlasny, f1.aktywaRazem)} color="emerald" />
                  <KPI label={t('bs.longTermLiab')} val={fmt(f1.zobowiazaniaDlugo)} sub={pct(f1.zobowiazaniaDlugo, f1.aktywaRazem)} color="amber" />
                  <KPI label={t('bs.shortTermLiab')} val={fmt(f1.zobowiazaniaKrotko)} sub={pct(f1.zobowiazaniaKrotko, f1.aktywaRazem)} color="rose" />
                  <KPI label={t('vis.debtTotal')} val={pct(f1.zobowiazaniaDlugo + f1.zobowiazaniaKrotko, f1.aktywaRazem)} color={f1.kapitalWlasny < f1.aktywaRazem / 2 ? 'rose' : 'slate'} />
                </div>
              </div>
              <table className="w-full text-[10px] mb-2">
                <thead><tr className="border-b-2 border-slate-200">
                  <th className="text-left py-1 text-slate-500">Pozycja</th>
                  <th className="text-right py-1 text-slate-500">{p1}</th>
                  <th className="text-right py-1 text-slate-400">{p2}</th>
                  <th className="text-right py-1 text-slate-400">% sumy</th>
                </tr></thead>
                <tbody>
                  {[
                    { l: 'Kapitał własny', v1: f1.kapitalWlasny, v2: f2.kapitalWlasny, bold: true },
                    { l: 'Zobow. długoterminowe', v1: f1.zobowiazaniaDlugo, v2: f2.zobowiazaniaDlugo },
                    { l: 'Zobow. krótkoterminowe', v1: f1.zobowiazaniaKrotko, v2: f2.zobowiazaniaKrotko },
                    { l: 'Zadłużenie ogółem', v1: f1.zobowiazaniaDlugo + f1.zobowiazaniaKrotko, v2: f2.zobowiazaniaDlugo + f2.zobowiazaniaKrotko, bold: true },
                    { l: 'SUMA PASYWÓW', v1: f1.pasywaBilans || f1.aktywaRazem, v2: f2.pasywaBilans || f2.aktywaRazem, bold: true },
                  ].map(row => (
                    <tr key={row.l} className="border-b border-slate-100">
                      <td className={`py-0.5 text-slate-600 ${row.bold ? 'font-bold' : ''}`}>{row.l}</td>
                      <td className={`py-0.5 text-right tabular-nums text-slate-700 ${row.bold ? 'font-bold' : ''}`}>{fmt(row.v1)}</td>
                      <td className="py-0.5 text-right tabular-nums text-slate-400">{fmt(row.v2)}</td>
                      <td className="py-0.5 text-right text-slate-400">{pct(row.v1, f1.aktywaRazem)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {/* Wskaźniki zadłużenia */}
              <div className="mt-2 mb-2">
                <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-1.5">Wskaźniki zadłużenia i struktury kapitału</p>
                <div className="grid grid-cols-4 gap-2">
                  {(() => {
                    const zadl = f1.aktywaRazem ? (f1.zobowiazaniaDlugo + f1.zobowiazaniaKrotko) / f1.aktywaRazem : 0;
                    const de = f1.kapitalWlasny ? (f1.zobowiazaniaDlugo + f1.zobowiazaniaKrotko) / f1.kapitalWlasny : 0;
                    const dlugNetto = (f1.zobowiazaniaDlugo + f1.kredytKrotko) - f1.srodkiPieniezne;
                    const eqRatio = f1.aktywaRazem ? f1.kapitalWlasny / f1.aktywaRazem : 0;
                    return [
                      { l: 'Wskaźnik zadłużenia', v: (zadl * 100).toFixed(1) + '%', ok: zadl < 0.6, hint: '< 60% bezpieczny' },
                      { l: 'Dług / Kapitał (D/E)', v: de.toFixed(2), ok: de < 1.5, hint: '< 1,5 bezpieczny' },
                      { l: 'Dług netto', v: fmt(dlugNetto), ok: dlugNetto <= 0, hint: 'netto = kredyty − gotówka' },
                      { l: 'Wskaźnik pokrycia EQ', v: (eqRatio * 100).toFixed(1) + '%', ok: eqRatio >= 0.4, hint: '> 40% bezpieczny' },
                    ].map(r => (
                      <div key={r.l} className={`rounded-lg p-2.5 border ${r.ok === true ? 'bg-emerald-50 border-emerald-200' : r.ok === false ? 'bg-rose-50 border-rose-200' : 'bg-slate-50 border-slate-200'}`}>
                        <p className="text-[8.5px] text-slate-500 leading-tight">{r.l}</p>
                        <p className={`text-sm font-black mt-0.5 ${r.ok === true ? 'text-emerald-700' : r.ok === false ? 'text-rose-600' : 'text-slate-700'}`}>{r.v}</p>
                        <p className="text-[8px] text-slate-400 mt-0.5">{r.hint}</p>
                      </div>
                    ));
                  })()}
                </div>
              </div>
              <AIBlock text={aiTexts['bilans_pasywa']} label={t('pdf.aiComment')} />
            </PrintPage>
          );
        })()}

        {/* ── PAGE 4: RZiS — Przychody i wyniki ──────────────────────────── */}
        {sections.find(s => s.key === 'rzis_wyniki') && (() => {
          const pg = getPage();
          const cascade = [
            { name: t('pnl.revenue'), val: f1.przychody, color: '#3b82f6' },
            { name: t('pnl.salesProfit'), val: f1.zyskZeSprz, color: '#10b981' },
            { name: t('pnl.ebit'), val: f1.ebit, color: f1.ebit >= 0 ? '#f59e0b' : '#ef4444' },
            { name: t('pnl.netProfit'), val: f1.zyskNetto, color: f1.zyskNetto >= 0 ? '#8b5cf6' : '#ef4444' },
          ];
          return (
            <PrintPage num={pg} total={TOTAL_PAGES}>
              <SectionHeader num={String(pg)} title={t('pdf.s.rzisWyniki')} sub={p1} />
              <div className="grid grid-cols-2 gap-4 mb-3">
                <div>
                  <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-2">{t('vis.cascadeTitle')}</p>
                  <div className="space-y-2">
                    {cascade.map(item => {
                      const w = f1.przychody > 0 ? Math.max(2, Math.min(100, Math.abs(item.val) / f1.przychody * 100)) : 0;
                      return (
                        <div key={item.name}>
                          <div className="flex justify-between text-[9px] mb-0.5">
                            <span className="text-slate-600">{item.name}</span>
                            <span className="font-bold text-slate-700">{fmt(item.val)}</span>
                          </div>
                          <div className="bg-slate-100 rounded-full h-4 overflow-hidden">
                            <div className="h-full rounded-full flex items-center justify-end pr-1 text-[8px] font-bold text-white" style={{ width: `${w}%`, background: item.color, minWidth: 24 }}>
                              {w > 12 && pct(item.val, f1.przychody)}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
                <div className="flex flex-col gap-2">
                  <KPI label={t('pnl.revenue')} val={fmt(f1.przychody)} color="blue" />
                  <KPI label={t('vis.operCosts')} val={fmt(f1.kosztyOper)} color="rose" />
                  <KPI label={t('pnl.ebit')} val={fmt(f1.ebit)} sub={f1.przychody ? pct(f1.ebit, f1.przychody) : ''} color={f1.ebit >= 0 ? 'amber' : 'rose'} />
                  <KPI label={t('pnl.netProfit')} val={fmt(f1.zyskNetto)} sub={f1.przychody ? pct(f1.zyskNetto, f1.przychody) : ''} color={f1.zyskNetto >= 0 ? 'emerald' : 'rose'} />
                </div>
              </div>
              <div className="mb-2">
                <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-1">{t('vis.compare3periods')}</p>
                <ResponsiveContainer width="100%" height={130}>
                  <BarChart data={trendData} margin={{ top: 2, right: 4, left: 4, bottom: 2 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                    <XAxis dataKey="name" tick={{ fontSize: 9 }} />
                    <YAxis tick={{ fontSize: 9 }} tickFormatter={v => (v / 1000).toFixed(0) + 'k'} />
                    <Tooltip formatter={(v: any) => fmt(v)} />
                    <Legend wrapperStyle={{ fontSize: 9 }} />
                    <Bar dataKey="przychody" name={t('pnl.revenue')} fill="#3b82f6" radius={[2, 2, 0, 0]} />
                    <Bar dataKey="ebit" name={t('pnl.ebit')} fill="#f59e0b" radius={[2, 2, 0, 0]} />
                    <Bar dataKey="zysk" name={t('pnl.netProfit')} fill="#8b5cf6" radius={[2, 2, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              {/* YoY comparison table */}
              {f2.przychody > 0 && (
                <div className="mt-1 mb-2">
                  <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-1.5">Dynamika rok do roku</p>
                  <table className="w-full text-[10px]">
                    <thead><tr className="border-b-2 border-slate-200">
                      <th className="text-left py-1 text-slate-500">Pozycja</th>
                      <th className="text-right py-1 text-slate-500">{p1}</th>
                      <th className="text-right py-1 text-slate-400">{p2}</th>
                      <th className="text-right py-1 text-slate-500">Zmiana r/r</th>
                      <th className="text-right py-1 text-slate-400">Marża {p1}</th>
                    </tr></thead>
                    <tbody>
                      {[
                        { l: 'Przychody netto', v1: f1.przychody, v2: f2.przychody, showPct: false },
                        { l: 'Koszty operacyjne', v1: f1.kosztyOper, v2: f2.kosztyOper, showPct: true, pctOf: f1.przychody },
                        { l: 'Zysk ze sprzedaży', v1: f1.zyskZeSprz, v2: f2.zyskZeSprz, showPct: true, pctOf: f1.przychody },
                        { l: 'EBIT', v1: f1.ebit, v2: f2.ebit, showPct: true, pctOf: f1.przychody },
                        { l: 'Zysk netto', v1: f1.zyskNetto, v2: f2.zyskNetto, showPct: true, pctOf: f1.przychody },
                        { l: 'Amortyzacja', v1: f1.amortyzacja, v2: f2.amortyzacja, showPct: false },
                      ].map(row => {
                        const chg = row.v2 ? ((row.v1 - row.v2) / Math.abs(row.v2) * 100) : null;
                        return (
                          <tr key={row.l} className="border-b border-slate-100">
                            <td className="py-0.5 text-slate-600">{row.l}</td>
                            <td className="py-0.5 text-right tabular-nums font-semibold text-slate-700">{fmt(row.v1)}</td>
                            <td className="py-0.5 text-right tabular-nums text-slate-400">{fmt(row.v2)}</td>
                            <td className={`py-0.5 text-right font-bold ${chg === null ? 'text-slate-400' : chg >= 0 ? 'text-emerald-600' : 'text-rose-500'}`}>
                              {chg !== null ? `${chg >= 0 ? '+' : ''}${chg.toFixed(1)}%` : '—'}
                            </td>
                            <td className="py-0.5 text-right text-slate-400">
                              {row.showPct && row.pctOf ? pct(row.v1, row.pctOf) : '—'}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
              <AIBlock text={aiTexts['rzis_wyniki']} label={t('pdf.aiComment')} />
            </PrintPage>
          );
        })()}

        {/* ── PAGE 5: Rentowność ─────────────────────────────────────────── */}
        {sections.find(s => s.key === 'rzis_marze') && (() => {
          const pg = getPage();
          return (
            <PrintPage num={pg} total={TOTAL_PAGES}>
              <SectionHeader num={String(pg)} title={t('pdf.s.rzisMarze')} sub={`${p1} vs ${p2}`} />
              <div className="grid grid-cols-2 gap-4 mb-3">
                <div>
                  <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-1">{t('vis.margins3periods')}</p>
                  <ResponsiveContainer width="100%" height={200}>
                    <BarChart data={marginData} margin={{ top: 2, right: 4, left: 4, bottom: 2 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                      <XAxis dataKey="name" tick={{ fontSize: 8.5 }} />
                      <YAxis tick={{ fontSize: 9 }} unit="%" />
                      <Tooltip formatter={(v: any) => `${v}%`} />
                      <Legend wrapperStyle={{ fontSize: 9 }} />
                      <ReferenceLine y={0} stroke="#94a3b8" />
                      <Bar dataKey={p1} fill="#3b82f6" radius={[2, 2, 0, 0]} />
                      <Bar dataKey={p2} fill="#93c5fd" radius={[2, 2, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                <div className="flex flex-col gap-2 justify-center">
                  {[
                    { l: 'Marża ze sprzedaży', v1: f1.przychody ? f1.zyskZeSprz / f1.przychody * 100 : 0, v2: f2.przychody ? f2.zyskZeSprz / f2.przychody * 100 : 0 },
                    { l: 'Marża EBIT', v1: f1.przychody ? f1.ebit / f1.przychody * 100 : 0, v2: f2.przychody ? f2.ebit / f2.przychody * 100 : 0 },
                    { l: 'Marża netto', v1: f1.przychody ? f1.zyskNetto / f1.przychody * 100 : 0, v2: f2.przychody ? f2.zyskNetto / f2.przychody * 100 : 0 },
                    { l: 'ROA', v1: f1.aktywaRazem ? f1.zyskNetto / f1.aktywaRazem * 100 : 0, v2: f2.aktywaRazem ? f2.zyskNetto / f2.aktywaRazem * 100 : 0 },
                  ].map(row => (
                    <div key={row.l} className="bg-slate-50 border border-slate-100 rounded-lg px-3 py-2">
                      <p className="text-[9px] text-slate-500">{row.l}</p>
                      <div className="flex items-end gap-2 mt-0.5">
                        <span className={`text-sm font-black ${row.v1 < 0 ? 'text-rose-600' : 'text-slate-700'}`}>{row.v1.toFixed(1)}%</span>
                        <span className={`text-[10px] mb-0.5 ${row.v1 > row.v2 ? 'text-emerald-500' : 'text-rose-400'}`}>
                          {row.v2 !== 0 ? (row.v1 > row.v2 ? '▲' : '▼') : ''} {row.v2.toFixed(1)}% ({p2.slice(0, 9)})
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              {/* Profitability & efficiency ratios */}
              <div className="mt-2 mb-2">
                <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-1.5">Wskaźniki rentowności i sprawności — {p1}</p>
                <div className="grid grid-cols-4 gap-2">
                  {(() => {
                    const roa = f1.aktywaRazem ? f1.zyskNetto / f1.aktywaRazem * 100 : 0;
                    const roe = f1.kapitalWlasny ? f1.zyskNetto / f1.kapitalWlasny * 100 : 0;
                    const roa2 = f2.aktywaRazem ? f2.zyskNetto / f2.aktywaRazem * 100 : 0;
                    const roe2 = f2.kapitalWlasny ? f2.zyskNetto / f2.kapitalWlasny * 100 : 0;
                    const rotacjaAkt = f1.aktywaRazem ? f1.przychody / f1.aktywaRazem : 0;
                    const ebitda = f1.ebit + f1.amortyzacja;
                    return [
                      { l: 'ROA (netto)', v: roa.toFixed(1) + '%', hint: `poprz. ${roa2.toFixed(1)}%`, ok: roa > roa2 },
                      { l: 'ROE (netto)', v: roe.toFixed(1) + '%', hint: `poprz. ${roe2.toFixed(1)}%`, ok: roe > roe2 },
                      { l: 'Rotacja aktywów', v: rotacjaAkt.toFixed(2) + 'x', hint: 'Przychody / Aktywa', ok: null },
                      { l: 'EBITDA', v: fmt(ebitda), hint: 'EBIT + Amortyzacja', ok: ebitda > 0 },
                    ].map(r => (
                      <div key={r.l} className={`rounded-lg p-2.5 border ${r.ok === true ? 'bg-emerald-50 border-emerald-200' : r.ok === false ? 'bg-rose-50 border-rose-200' : 'bg-slate-50 border-slate-200'}`}>
                        <p className="text-[8.5px] text-slate-500 leading-tight">{r.l}</p>
                        <p className={`text-sm font-black mt-0.5 ${r.ok === true ? 'text-emerald-700' : r.ok === false ? 'text-rose-600' : 'text-slate-700'}`}>{r.v}</p>
                        <p className="text-[8px] text-slate-400 mt-0.5">{r.hint}</p>
                      </div>
                    ));
                  })()}
                </div>
              </div>
              <AIBlock text={aiTexts['rzis_marze']} label={t('pdf.aiComment')} />
            </PrintPage>
          );
        })()}

        {/* ── PAGE 6: Beneish M-Score ────────────────────────────────────── */}
        {sections.find(s => s.key === 'beneish') && beneish && (() => {
          const pg = getPage();
          return (
            <PrintPage num={pg} total={TOTAL_PAGES}>
              <SectionHeader num={String(pg)} title={t('pdf.s.beneish')} />
              <div className="grid grid-cols-2 gap-4 mb-3">
                <div>
                  <table className="w-full text-[10px]">
                    <thead><tr className="border-b-2 border-slate-200">
                      <th className="text-left py-1 text-slate-500">Wskaźnik</th>
                      <th className="text-right py-1 text-slate-500">Wartość</th>
                      <th className="text-right py-1 text-slate-500">Waga</th>
                      <th className="text-right py-1 text-slate-500">Składnik</th>
                    </tr></thead>
                    <tbody>
                      {beneish.indices.map(idx => (
                        <tr key={idx.key} className="border-b border-slate-100">
                          <td className="py-0.5 text-slate-700 font-medium">{idx.key}</td>
                          <td className="py-0.5 text-right tabular-nums text-slate-600">{idx.value.toFixed(3)}</td>
                          <td className="py-0.5 text-right tabular-nums text-slate-400">{idx.weight}</td>
                          <td className={`py-0.5 text-right tabular-nums font-semibold ${idx.contribution > 0 ? 'text-rose-500' : 'text-emerald-500'}`}>{idx.contribution.toFixed(3)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="flex flex-col gap-3 justify-center">
                  <div className={`rounded-xl p-4 text-center ${beneish.highRisk ? 'bg-rose-50 border-2 border-rose-200' : 'bg-emerald-50 border-2 border-emerald-200'}`}>
                    <p className="text-[10px] text-slate-500 mb-1">M-Score</p>
                    <p className={`text-3xl font-black ${beneish.highRisk ? 'text-rose-600' : 'text-emerald-600'}`}>{beneish.mscore.toFixed(2)}</p>
                    <p className="text-[10px] text-slate-400 mt-1">{t('pdf.beneishThreshold')}</p>
                    <div className="mt-2"><RiskBadge ok={!beneish.highRisk} lowLabel={t('pdf.lowRisk')} highLabel={t('pdf.highRisk')} /></div>
                  </div>
                  {beneish.topDrivers.length > 0 && (
                    <div>
                      <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-1">{t('pdf.keyRiskFactors')}</p>
                      {beneish.topDrivers.map(d => (
                        <div key={d} className="text-[10px] text-slate-600 flex items-center gap-1.5 py-0.5">
                          <span className="text-rose-400">▲</span> {d}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
              <AIBlock text={aiTexts['beneish']} label={t('pdf.aiComment')} />
            </PrintPage>
          );
        })()}

        {/* ── PAGE 7: Dyskryminacyjne ────────────────────────────────────── */}
        {sections.find(s => s.key === 'dyskryminacyjne') && holda && (() => {
          const pg = getPage();
          return (
            <PrintPage num={pg} total={TOTAL_PAGES}>
              <SectionHeader num={String(pg)} title={t('pdf.s.dyskryminacyjne')} />
              <div className="grid grid-cols-2 gap-4 mb-3">
                <div className="space-y-3">
                  {/* Hołda */}
                  <div className={`rounded-xl p-4 ${holda.ok ? 'bg-emerald-50 border border-emerald-200' : 'bg-rose-50 border border-rose-200'}`}>
                    <div className="flex items-start justify-between mb-2">
                      <div>
                        <p className="text-xs font-bold text-slate-700">🇵🇱 Model Hołdy (Z_H)</p>
                        <p className="text-[9px] text-slate-400">Próg: Z_H = 0</p>
                      </div>
                      <span className={`text-xl font-black ${holda.ok ? 'text-emerald-600' : 'text-rose-600'}`}>{r2(holda.score)}</span>
                    </div>
                    <RiskBadge ok={holda.ok} lowLabel={t('pdf.lowRisk')} highLabel={t('pdf.highRisk')} />
                  </div>

                  {/* Altman Z' */}
                  {altman && (
                    <div className={`rounded-xl p-4 ${altman.ok ? 'bg-emerald-50 border border-emerald-200' : altman.zone === 'szara strefa' ? 'bg-amber-50 border border-amber-200' : 'bg-rose-50 border border-rose-200'}`}>
                      <div className="flex items-start justify-between mb-2">
                        <div>
                          <p className="text-xs font-bold text-slate-700">🇺🇸 Altman Z'-score</p>
                          <p className="text-[9px] text-slate-400">Strefa: {altman.zone}</p>
                        </div>
                        <span className={`text-xl font-black ${altman.ok ? 'text-emerald-600' : altman.zone === 'szara strefa' ? 'text-amber-600' : 'text-rose-600'}`}>{r2(altman.score)}</span>
                      </div>
                      <RiskBadge ok={altman.ok} lowLabel={t('pdf.lowRisk')} highLabel={t('pdf.highRisk')} />
                    </div>
                  )}
                </div>
                <div className="flex flex-col gap-2 justify-center">
                  <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wide">{t('pdf.keyRiskFactors')}</p>
                  {[
                    { l: 'X₁ Płynność bieżąca', v: r2(holda.x1), ok: holda.x1 > 1.2 },
                    { l: 'X₂ Zadłużenie × 100', v: r2(holda.x2), ok: holda.x2 < 60 },
                    { l: 'X₃ Rotacja aktywów', v: r2(holda.x3), ok: holda.x3 > 0.5 },
                    { l: 'X₄ ROA netto × 100', v: r2(holda.x4), ok: holda.x4 > 0 },
                  ].map(row => (
                    <div key={row.l} className="flex items-center justify-between bg-slate-50 rounded-lg px-3 py-1.5">
                      <span className="text-[10px] text-slate-600">{row.l}</span>
                      <span className={`text-xs font-bold ${row.ok ? 'text-emerald-600' : 'text-rose-500'}`}>{row.v}</span>
                    </div>
                  ))}
                  <div className="mt-1 text-[9px] text-slate-400 leading-relaxed">
                    Modele skalibowane na polskich przedsiębiorstwach — wyniki mają charakter orientacyjny. Pełna analiza dostępna w zakładce "Analiza finansowa".
                  </div>
                </div>
              </div>
              <AIBlock text={aiTexts['dyskryminacyjne']} label={t('pdf.aiComment')} />
            </PrintPage>
          );
        })()}

        {/* ── PAGE 8: Grupy pracy ────────────────────────────────────────── */}
        {sections.find(s => s.key === 'grupy') && grpSummary && (() => {
          const pg = getPage();
          return (
            <PrintPage num={pg} total={TOTAL_PAGES}>
              <SectionHeader num={String(pg)} title={t('pdf.s.grupy')} sub={period} />
              <div className="grid grid-cols-2 gap-4 mb-3">
                <div>
                  <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-1">{t('pdf.salesByCity')}</p>
                  <ResponsiveContainer width="100%" height={200}>
                    <BarChart data={grpSummary.rows.slice(0, 6)} layout="vertical" margin={{ top: 2, right: 4, left: 40, bottom: 2 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
                      <XAxis type="number" tick={{ fontSize: 8 }} tickFormatter={v => (v / 1000).toFixed(0) + 'k'} />
                      <YAxis type="category" dataKey="city" tick={{ fontSize: 9 }} />
                      <Tooltip formatter={(v: any) => fmt(v)} />
                      <Bar dataKey="przychod" name="Przychód" fill="#f97316" radius={[0, 2, 2, 0]} />
                      <Bar dataKey="mb" name="Marża" fill="#10b981" radius={[0, 2, 2, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                <div>
                  <table className="w-full text-[10px]">
                    <thead><tr className="border-b-2 border-slate-200">
                      <th className="text-left py-1 text-slate-500">Miasto</th>
                      <th className="text-right py-1 text-slate-500">Gr.</th>
                      <th className="text-right py-1 text-slate-500">Przychód</th>
                      <th className="text-right py-1 text-slate-500">MB%</th>
                    </tr></thead>
                    <tbody>
                      {grpSummary.rows.map(row => (
                        <tr key={row.city} className="border-b border-slate-100">
                          <td className="py-0.5 text-slate-700 font-medium">{row.city}</td>
                          <td className="py-0.5 text-right text-slate-400">{row.count}</td>
                          <td className="py-0.5 text-right tabular-nums text-slate-600">{fmt(row.przychod)}</td>
                          <td className={`py-0.5 text-right font-bold ${row.mbPct >= 0 ? 'text-emerald-600' : 'text-rose-500'}`}>{row.mbPct.toFixed(1)}%</td>
                        </tr>
                      ))}
                      <tr className="border-t-2 border-slate-300">
                        <td colSpan={2} className="py-1 font-bold text-slate-700">RAZEM</td>
                        <td className="py-1 text-right font-bold tabular-nums text-slate-700">{fmt(grpSummary.totalP)}</td>
                        <td className={`py-1 text-right font-black ${grpSummary.mbPct >= 0 ? 'text-emerald-600' : 'text-rose-500'}`}>{grpSummary.mbPct.toFixed(1)}%</td>
                      </tr>
                    </tbody>
                  </table>
                  <div className="mt-2 grid grid-cols-2 gap-1.5">
                    <KPI label={t('pdf.deptSales').split(' i ')[0]} val={fmt(grpSummary.totalP)} color="orange" />
                    <KPI label={t('pnl.salesProfit')} val={fmt(grpSummary.totalMB)} sub={grpSummary.mbPct.toFixed(1) + '%'} color={grpSummary.mbPct >= 0 ? 'emerald' : 'rose'} />
                  </div>
                </div>
              </div>
              <AIBlock text={aiTexts['grupy']} label={t('pdf.aiComment')} />
            </PrintPage>
          );
        })()}

        {/* ── PAGE 9: Raport miesięczny ──────────────────────────────────── */}
        {sections.find(s => s.key === 'raport_miesieczny') && rmDepts && (() => {
          const pg = getPage();
          return (
            <PrintPage num={pg} total={TOTAL_PAGES}>
              <SectionHeader num={String(pg)} title={t('pdf.s.raportMies')} sub={rm?.period ?? ''} />
              <div className="mb-3">
                <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-1">{t('pdf.deptSales')}</p>
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={rmDepts} margin={{ top: 2, right: 4, left: 4, bottom: 36 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                    <XAxis dataKey="name" tick={{ fontSize: 8.5 }} angle={-30} textAnchor="end" height={44} interval={0} />
                    <YAxis tick={{ fontSize: 9 }} tickFormatter={v => (v / 1000).toFixed(0) + 'k'} />
                    <Tooltip formatter={(v: any) => fmt(v)} />
                    <Legend wrapperStyle={{ fontSize: 9 }} />
                    <Bar dataKey="przychod" name="Przychód" fill="#3b82f6" radius={[2, 2, 0, 0]} />
                    <Bar dataKey="mb" name="Marża brutto" fill="#10b981" radius={[2, 2, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <table className="w-full text-[10px] mb-2">
                <thead><tr className="border-b-2 border-slate-200">
                  <th className="text-left py-1 text-slate-500">Dział</th>
                  <th className="text-right py-1 text-slate-500">Przychód</th>
                  <th className="text-right py-1 text-slate-500">Marża</th>
                  <th className="text-right py-1 text-slate-500">MB%</th>
                </tr></thead>
                <tbody>
                  {rmDepts.map(d => (
                    <tr key={d.name} className="border-b border-slate-100">
                      <td className="py-0.5 text-slate-700">{d.fullName}</td>
                      <td className="py-0.5 text-right tabular-nums text-slate-600">{fmt(d.przychod)}</td>
                      <td className={`py-0.5 text-right tabular-nums font-semibold ${d.mb >= 0 ? 'text-emerald-600' : 'text-rose-500'}`}>{fmt(d.mb)}</td>
                      <td className={`py-0.5 text-right font-bold ${d.mbPct >= 0 ? 'text-emerald-600' : 'text-rose-500'}`}>{d.mbPct.toFixed(1)}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <AIBlock text={aiTexts['raport_miesieczny']} label={t('pdf.aiComment')} />
            </PrintPage>
          );
        })()}

        {/* ── PAGE LAST: Podsumowanie ────────────────────────────────────── */}
        {sections.find(s => s.key === 'podsumowanie') && (() => {
          const pg = getPage();
          return (
            <PrintPage num={pg} total={TOTAL_PAGES}>
              <SectionHeader num={String(pg)} title={t('pdf.s.podsumowanie')} sub={`${activeCompany?.name} · ${p1}`} />
              <div className="grid grid-cols-3 gap-2 mb-4">
                <KPI label={t('vis.totalAssets')} val={fmt(f1.aktywaRazem)} color="blue" />
                <KPI label={t('bs.equity')} val={fmt(f1.kapitalWlasny)} sub={pct(f1.kapitalWlasny, f1.aktywaRazem)} color="emerald" />
                <KPI label={t('vis.totalDebt')} val={pct(f1.zobowiazaniaDlugo + f1.zobowiazaniaKrotko, f1.aktywaRazem)} color={f1.kapitalWlasny > f1.aktywaRazem / 2 ? 'slate' : 'rose'} />
                <KPI label={t('pnl.revenue')} val={fmt(f1.przychody)} color="blue" />
                <KPI label={t('pnl.ebit')} val={fmt(f1.ebit)} sub={f1.przychody ? pct(f1.ebit, f1.przychody) : ''} color={f1.ebit >= 0 ? 'amber' : 'rose'} />
                <KPI label={t('pnl.netProfit')} val={fmt(f1.zyskNetto)} sub={f1.przychody ? pct(f1.zyskNetto, f1.przychody) : ''} color={f1.zyskNetto >= 0 ? 'violet' : 'rose'} />
              </div>
              {(beneish || holda) && (
                <div className="flex gap-3 mb-4">
                  {beneish && (
                    <div className={`flex-1 rounded-xl p-3 text-center ${beneish.highRisk ? 'bg-rose-50 border border-rose-200' : 'bg-emerald-50 border border-emerald-200'}`}>
                      <p className="text-[9px] text-slate-400 mb-1">Beneish M-Score</p>
                      <p className={`text-lg font-black ${beneish.highRisk ? 'text-rose-600' : 'text-emerald-600'}`}>{beneish.mscore.toFixed(2)}</p>
                      <RiskBadge ok={!beneish.highRisk} lowLabel={t('pdf.lowRisk')} highLabel={t('pdf.highRisk')} />
                    </div>
                  )}
                  {holda && (
                    <div className={`flex-1 rounded-xl p-3 text-center ${holda.ok ? 'bg-emerald-50 border border-emerald-200' : 'bg-rose-50 border border-rose-200'}`}>
                      <p className="text-[9px] text-slate-400 mb-1">Model Hołdy Z_H</p>
                      <p className={`text-lg font-black ${holda.ok ? 'text-emerald-600' : 'text-rose-600'}`}>{r2(holda.score)}</p>
                      <RiskBadge ok={holda.ok} lowLabel={t('pdf.lowRisk')} highLabel={t('pdf.highRisk')} />
                    </div>
                  )}
                  {altman && (
                    <div className={`flex-1 rounded-xl p-3 text-center ${altman.ok ? 'bg-emerald-50 border border-emerald-200' : altman.zone === 'szara strefa' ? 'bg-amber-50 border border-amber-200' : 'bg-rose-50 border border-rose-200'}`}>
                      <p className="text-[9px] text-slate-400 mb-1">Altman Z'-score</p>
                      <p className={`text-lg font-black ${altman.ok ? 'text-emerald-600' : altman.zone === 'szara strefa' ? 'text-amber-600' : 'text-rose-600'}`}>{r2(altman.score)}</p>
                      <span className="text-[9px] text-slate-500">{altman.zone}</span>
                    </div>
                  )}
                </div>
              )}
              <AIBlock text={aiTexts['podsumowanie']} label={t('pdf.aiComment')} />
              <div className="mt-6 pt-3 border-t border-slate-200 text-center">
                <p className="text-[8px] text-slate-300">FinScope PL · {today} · {t('pdf.disclaimer')}</p>
              </div>
            </PrintPage>
          );
        })()}

      </div>
    </div>
  );
}

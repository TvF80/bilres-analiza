import { useState, useCallback } from 'react';
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ReferenceLine } from 'recharts';
import { useCompanies } from '../store/CompaniesContext';
import { mapFields } from '../lib/fieldMapping';

const API_URL = '/api/analyze';

const fmt = (v: number) =>
  v === 0 ? '—' : (v / 1000).toLocaleString('pl-PL', { maximumFractionDigits: 0 }) + ' tys.';

const pct = (v: number, total: number) =>
  total ? ((v / total) * 100).toFixed(1) + '%' : '—';

const COLORS_A = ['#3b82f6', '#93c5fd'];
const COLORS_P = ['#10b981', '#f59e0b', '#ef4444'];

const AI_SECTIONS = [
  { key: 'pdf_bilans_aktywa', label: 'Struktura aktywów', dataFn: (f: any) => ({ aktywaTrwale: f.aktywaTrwale, aktywaObrotowe: f.aktywaObrotowe, aktywaRazem: f.aktywaRazem, zapasy: f.zapasy, naleznosci: f.naleznosci, srodkiPieniezne: f.srodkiPieniezne }) },
  { key: 'pdf_bilans_pasywa', label: 'Struktura pasywów', dataFn: (f: any) => ({ kapitalWlasny: f.kapitalWlasny, zobowiazaniaDlugo: f.zobowiazaniaDlugo, zobowiazaniaKrotko: f.zobowiazaniaKrotko, aktywaRazem: f.aktywaRazem }) },
  { key: 'pdf_rzis_przychody', label: 'Przychody i koszty', dataFn: (f: any) => ({ przychody: f.przychody, kosztyOper: f.kosztyOper, amortyzacja: f.amortyzacja, ebit: f.ebit }) },
  { key: 'pdf_rzis_rentownosc', label: 'Rentowność', dataFn: (f: any) => ({ zyskZeSprz: f.zyskZeSprz, ebit: f.ebit, zyskNetto: f.zyskNetto, przychody: f.przychody, marzaNetto: f.przychody ? +((f.zyskNetto / f.przychody) * 100).toFixed(1) : null }) },
  { key: 'pdf_podsumowanie', label: 'Podsumowanie finansowe', dataFn: (f: any) => ({ aktywaRazem: f.aktywaRazem, kapitalWlasny: f.kapitalWlasny, przychody: f.przychody, zyskNetto: f.zyskNetto, marzaNetto: f.przychody ? +((f.zyskNetto / f.przychody) * 100).toFixed(1) : null, zadluzenieRazem: f.zobowiazaniaDlugo + f.zobowiazaniaKrotko }) },
];

type Phase = 'confirm' | 'loading' | 'preview';

async function fetchAI(section: string, data: Record<string, unknown>): Promise<string> {
  const cacheKey = `ai_pdf_${section}`;
  const cached = sessionStorage.getItem(cacheKey);
  if (cached) {
    try { const p = JSON.parse(cached); if (p.text) return p.text; } catch {}
  }
  const res = await fetch(API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ section, lang: 'pl', period: 'bieżący', data }),
  });
  if (res.status === 404) {
    throw new Error('Endpoint AI niedostępny lokalnie. Uruchom przez: vercel dev (zamiast npm run dev), lub użyj wersji produkcyjnej na exco-analiza.vercel.app');
  }
  const raw = await res.text();
  if (!raw) throw new Error(`Pusta odpowiedź serwera (HTTP ${res.status})`);
  let json: any;
  try { json = JSON.parse(raw); } catch {
    throw new Error(`Nieprawidłowa odpowiedź (HTTP ${res.status}): ${raw.slice(0, 120)}`);
  }
  if (!res.ok) throw new Error(json?.error ?? `Błąd AI (HTTP ${res.status})`);
  sessionStorage.setItem(cacheKey, JSON.stringify({ text: json.text, ts: Date.now() }));
  return json.text ?? '';
}

const renderLabel = ({ cx, cy, midAngle, innerRadius, outerRadius, percent }: any) => {
  if (percent < 0.08) return null;
  const R = Math.PI / 180;
  const r = innerRadius + (outerRadius - innerRadius) * 0.55;
  const x = cx + r * Math.cos(-midAngle * R);
  const y = cy + r * Math.sin(-midAngle * R);
  return <text x={x} y={y} fill="white" textAnchor="middle" dominantBaseline="central" fontSize={9} fontWeight={600}>{(percent * 100).toFixed(0)}%</text>;
};

export default function RaportPDF() {
  const { activeCompany } = useCompanies();
  const [phase, setPhase] = useState<Phase>('confirm');
  const [progress, setProgress] = useState(0);
  const [aiTexts, setAITexts] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  const bilans = activeCompany?.bilans ?? [];
  const rzis = activeCompany?.rzis ?? [];
  const p1 = activeCompany?.periodLabels?.[0] ?? 'Okres bieżący';
  const p2 = activeCompany?.periodLabels?.[1] ?? 'Okres poprzedni';
  const p3 = activeCompany?.periodLabels?.[2] ?? 'Okres 3';

  const f1 = mapFields(bilans, rzis, 1);
  const f2 = mapFields(bilans, rzis, 2);
  const f3 = mapFields(bilans, rzis, 3);

  const startGeneration = useCallback(async () => {
    setPhase('loading');
    setProgress(0);
    setError(null);
    const results: Record<string, string> = {};
    try {
      for (let i = 0; i < AI_SECTIONS.length; i++) {
        const s = AI_SECTIONS[i];
        results[s.key] = await fetchAI(s.key, s.dataFn(f1));
        setProgress(i + 1);
      }
      setAITexts(results);
      setPhase('preview');
    } catch (err: any) {
      setError(err.message ?? 'Błąd generowania raportu');
      setPhase('confirm');
    }
  }, [f1]);

  // ── Confirm screen ──────────────────────────────────────────────────────
  if (phase === 'confirm') {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8 bg-slate-50">
        <div className="bg-white rounded-2xl shadow-lg border border-slate-200 max-w-md w-full p-8 text-center space-y-5">
          <div className="w-16 h-16 bg-violet-100 rounded-2xl flex items-center justify-center mx-auto text-3xl">📄</div>
          <div>
            <h2 className="text-lg font-bold text-slate-800">Raport Ogólny PDF</h2>
            <p className="text-sm text-slate-500 mt-1">{activeCompany?.name ?? 'Brak firmy'} · {p1}</p>
          </div>
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-left">
            <p className="text-xs font-semibold text-amber-700 mb-1">⚠️ Informacja</p>
            <p className="text-xs text-amber-700 leading-relaxed">
              Generowanie raportu wymaga przygotowania <strong>5 opisów AI</strong> (struktura aktywów, pasywa, przychody, rentowność, podsumowanie). Opisy są przechowywane w pamięci sesji i będą ponownie użyte przy kolejnym eksporcie.
            </p>
          </div>
          {error && (
            <div className="bg-rose-50 border border-rose-200 rounded-xl p-3 text-xs text-rose-700">{error}</div>
          )}
          <div className="space-y-2">
            <ol className="text-left text-xs text-slate-500 space-y-1 bg-slate-50 rounded-xl p-4">
              <li className="flex gap-2"><span className="font-bold text-slate-400">1.</span>Strona tytułowa — firma, okres, data</li>
              <li className="flex gap-2"><span className="font-bold text-slate-400">2.</span>Spis treści + kluczowe KPI</li>
              <li className="flex gap-2"><span className="font-bold text-slate-400">3.</span>Struktura bilansu — wykresy</li>
              <li className="flex gap-2"><span className="font-bold text-slate-400">4.</span>Rachunek wyników + kaskada</li>
              <li className="flex gap-2"><span className="font-bold text-slate-400">5.</span>Komentarze AI — 5 sekcji</li>
            </ol>
          </div>
          <button
            onClick={startGeneration}
            disabled={!activeCompany}
            className="w-full py-2.5 bg-violet-600 hover:bg-violet-700 text-white text-sm font-bold rounded-xl transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Generuj raport PDF →
          </button>
        </div>
      </div>
    );
  }

  // ── Loading screen ──────────────────────────────────────────────────────
  if (phase === 'loading') {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8 bg-slate-50">
        <div className="bg-white rounded-2xl shadow-lg border border-slate-200 max-w-sm w-full p-8 text-center space-y-5">
          <div className="text-3xl animate-pulse">🤖</div>
          <div>
            <h2 className="text-base font-bold text-slate-700">Generowanie opisów AI…</h2>
            <p className="text-xs text-slate-400 mt-1">{progress}/{AI_SECTIONS.length} sekcji gotowych</p>
          </div>
          <div className="w-full bg-slate-100 rounded-full h-2">
            <div
              className="h-2 bg-violet-500 rounded-full transition-all duration-500"
              style={{ width: `${(progress / AI_SECTIONS.length) * 100}%` }}
            />
          </div>
          {progress > 0 && (
            <p className="text-xs text-slate-500">✓ {AI_SECTIONS[progress - 1]?.label}</p>
          )}
        </div>
      </div>
    );
  }

  // ── Print preview ────────────────────────────────────────────────────────
  const aktywaData = [
    { name: 'Aktywa trwałe', value: f1.aktywaTrwale },
    { name: 'Aktywa obrotowe', value: f1.aktywaObrotowe },
  ].filter(d => d.value > 0);

  const pasywaDData = [
    { name: 'Kapitał własny', value: f1.kapitalWlasny },
    { name: 'Zobow. długoterm.', value: f1.zobowiazaniaDlugo },
    { name: 'Zobow. krótkoterm.', value: f1.zobowiazaniaKrotko },
  ].filter(d => d.value > 0);

  const trendData = [
    { name: p1, aktywa: f1.aktywaRazem, kapital: f1.kapitalWlasny, przychody: f1.przychody, zysk: f1.zyskNetto },
    { name: p2, aktywa: f2.aktywaRazem, kapital: f2.kapitalWlasny, przychody: f2.przychody, zysk: f2.zyskNetto },
    ...(f3.aktywaRazem > 0 ? [{ name: p3, aktywa: f3.aktywaRazem, kapital: f3.kapitalWlasny, przychody: f3.przychody, zysk: f3.zyskNetto }] : []),
  ].reverse();

  const cascade = [
    { name: 'Przychody', val: f1.przychody, color: '#3b82f6' },
    { name: 'Zysk ze sprzedaży', val: f1.zyskZeSprz, color: '#10b981' },
    { name: 'EBIT', val: f1.ebit, color: f1.ebit >= 0 ? '#f59e0b' : '#ef4444' },
    { name: 'Zysk netto', val: f1.zyskNetto, color: f1.zyskNetto >= 0 ? '#8b5cf6' : '#ef4444' },
  ];

  const today = new Date().toLocaleDateString('pl-PL', { day: '2-digit', month: 'long', year: 'numeric' });

  return (
    <div className="flex-1 overflow-y-auto bg-slate-200">
      {/* Toolbar */}
      <div className="print:hidden sticky top-0 z-10 bg-white border-b border-slate-200 px-4 py-2 flex items-center gap-3">
        <button
          onClick={() => setPhase('confirm')}
          className="px-3 py-1.5 text-xs text-slate-600 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors"
        >
          ← Wróć
        </button>
        <span className="text-xs text-slate-400">|</span>
        <button
          onClick={() => window.print()}
          className="inline-flex items-center gap-1.5 px-4 py-1.5 bg-violet-600 hover:bg-violet-700 text-white text-xs font-bold rounded-lg transition-colors"
        >
          🖨️ Drukuj / Zapisz PDF
        </button>
        <button
          onClick={startGeneration}
          className="px-3 py-1.5 text-xs text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"
        >
          ↺ Regeneruj opisy AI
        </button>
        <span className="text-xs text-slate-400 ml-auto">5 stron · {activeCompany?.name}</span>
      </div>

      {/* Pages */}
      <div className="space-y-4 p-4 max-w-[900px] mx-auto">

        {/* ── STRONA 1: Tytuł ─────────────────────────────────────────────── */}
        <PrintPage pageNum={1}>
          <div className="flex flex-col h-full justify-between">
            <div className="flex items-center gap-3 mb-8">
              <div className="w-10 h-10 bg-violet-600 rounded-xl flex items-center justify-center text-white text-lg font-black">F</div>
              <div>
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-widest">FinScope PL</p>
                <p className="text-xs text-slate-300">Platforma analiz finansowych</p>
              </div>
            </div>

            <div className="flex-1 flex flex-col justify-center text-center space-y-6 py-12">
              <div className="w-20 h-20 bg-gradient-to-br from-violet-500 to-blue-600 rounded-3xl flex items-center justify-center mx-auto text-4xl">📊</div>
              <div>
                <h1 className="text-3xl font-black text-slate-800 leading-tight">{activeCompany?.name ?? 'Raport Finansowy'}</h1>
                <p className="text-slate-400 text-sm mt-2">Raport Ogólny — Analiza Finansowa</p>
              </div>
              <div className="flex justify-center gap-8 text-center">
                <div>
                  <p className="text-[10px] text-slate-400 uppercase tracking-wide">Okres</p>
                  <p className="text-base font-bold text-slate-700">{p1}</p>
                </div>
                <div>
                  <p className="text-[10px] text-slate-400 uppercase tracking-wide">Wygenerowano</p>
                  <p className="text-base font-bold text-slate-700">{today}</p>
                </div>
                <div>
                  <p className="text-[10px] text-slate-400 uppercase tracking-wide">Status</p>
                  <p className="text-base font-bold text-emerald-600">Poufny</p>
                </div>
              </div>
            </div>

            <div className="text-center">
              <p className="text-[10px] text-slate-300">Dokument wygenerowany automatycznie przez FinScope PL · {today}</p>
            </div>
          </div>
        </PrintPage>

        {/* ── STRONA 2: TOC + KPI ──────────────────────────────────────────── */}
        <PrintPage pageNum={2}>
          <h2 className="text-xl font-black text-slate-800 mb-6">Spis treści</h2>
          <div className="space-y-2 mb-8">
            {[
              ['1', 'Strona tytułowa'],
              ['2', 'Spis treści i kluczowe wskaźniki'],
              ['3', 'Struktura bilansu — aktywa i pasywa'],
              ['4', 'Rachunek wyników — kaskada i trendy'],
              ['5', 'Komentarze AI — analiza i wnioski'],
            ].map(([num, title]) => (
              <div key={num} className="flex items-center gap-3 py-2 border-b border-slate-100">
                <span className="w-6 h-6 bg-violet-100 text-violet-700 rounded-full text-[10px] font-black flex items-center justify-center shrink-0">{num}</span>
                <span className="text-sm text-slate-700 flex-1">{title}</span>
                <span className="text-xs text-slate-300">{num}</span>
              </div>
            ))}
          </div>

          <h3 className="text-sm font-bold text-slate-700 mb-4">Kluczowe wskaźniki finansowe</h3>
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: 'Suma bilansowa', val: fmt(f1.aktywaRazem), sub: p1, color: 'blue' },
              { label: 'Kapitał własny', val: fmt(f1.kapitalWlasny), sub: pct(f1.kapitalWlasny, f1.aktywaRazem) + ' sumy bil.', color: 'emerald' },
              { label: 'Zadłużenie', val: fmt(f1.zobowiazaniaDlugo + f1.zobowiazaniaKrotko), sub: pct(f1.zobowiazaniaDlugo + f1.zobowiazaniaKrotko, f1.aktywaRazem) + ' sumy bil.', color: 'amber' },
              { label: 'Przychody', val: fmt(f1.przychody), sub: p1, color: 'blue' },
              { label: 'EBIT', val: fmt(f1.ebit), sub: f1.przychody ? 'marża ' + pct(f1.ebit, f1.przychody) : '', color: f1.ebit >= 0 ? 'emerald' : 'rose' },
              { label: 'Zysk netto', val: fmt(f1.zyskNetto), sub: f1.przychody ? 'marża ' + pct(f1.zyskNetto, f1.przychody) : '', color: f1.zyskNetto >= 0 ? 'violet' : 'rose' },
            ].map(kpi => (
              <div key={kpi.label} className={`bg-${kpi.color}-50 border border-${kpi.color}-100 rounded-xl p-3`}>
                <p className="text-[10px] text-slate-500">{kpi.label}</p>
                <p className={`text-base font-black text-${kpi.color}-700 mt-0.5`}>{kpi.val}</p>
                <p className="text-[10px] text-slate-400 mt-0.5">{kpi.sub}</p>
              </div>
            ))}
          </div>

          {/* Trend bar */}
          <div className="mt-6">
            <p className="text-xs font-semibold text-slate-500 mb-2 uppercase tracking-wide">Trendy — 3 okresy</p>
            <ResponsiveContainer width="100%" height={140}>
              <BarChart data={trendData} margin={{ top: 4, right: 4, left: 4, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="name" tick={{ fontSize: 9 }} />
                <YAxis tick={{ fontSize: 9 }} tickFormatter={v => (v / 1000).toFixed(0) + 'k'} />
                <Tooltip formatter={(v: any) => fmt(v)} />
                <Legend wrapperStyle={{ fontSize: 9 }} />
                <Bar dataKey="przychody" name="Przychody" fill="#3b82f6" radius={[2, 2, 0, 0]} />
                <Bar dataKey="aktywa" name="Aktywa" fill="#93c5fd" radius={[2, 2, 0, 0]} />
                <Bar dataKey="zysk" name="Zysk netto" fill="#8b5cf6" radius={[2, 2, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </PrintPage>

        {/* ── STRONA 3: Bilans ──────────────────────────────────────────────── */}
        <PrintPage pageNum={3}>
          <h2 className="text-xl font-black text-slate-800 mb-6">Struktura bilansu — {p1}</h2>
          <div className="grid grid-cols-2 gap-6">
            <div>
              <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-2">Struktura aktywów</p>
              <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Pie data={aktywaData} cx="50%" cy="50%" innerRadius={50} outerRadius={90}
                    dataKey="value" labelLine={false} label={renderLabel}>
                    {aktywaData.map((_, i) => <Cell key={i} fill={COLORS_A[i]} />)}
                  </Pie>
                  <Tooltip formatter={(v: any) => fmt(v)} />
                  <Legend wrapperStyle={{ fontSize: 10 }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div>
              <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-2">Struktura pasywów</p>
              <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Pie data={pasywaDData} cx="50%" cy="50%" innerRadius={50} outerRadius={90}
                    dataKey="value" labelLine={false} label={renderLabel}>
                    {pasywaDData.map((_, i) => <Cell key={i} fill={COLORS_P[i]} />)}
                  </Pie>
                  <Tooltip formatter={(v: any) => fmt(v)} />
                  <Legend wrapperStyle={{ fontSize: 10 }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-4">
            {/* Tabela aktywów */}
            <div>
              <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide mb-2">Aktywa</p>
              <table className="w-full text-[10px]">
                <tbody>
                  {[
                    { label: 'Aktywa trwałe', val: fmt(f1.aktywaTrwale), pctV: pct(f1.aktywaTrwale, f1.aktywaRazem) },
                    { label: 'Aktywa obrotowe', val: fmt(f1.aktywaObrotowe), pctV: pct(f1.aktywaObrotowe, f1.aktywaRazem) },
                    { label: '  w tym zapasy', val: fmt(f1.zapasy), pctV: '' },
                    { label: '  w tym należności', val: fmt(f1.naleznosci), pctV: '' },
                    { label: '  środki pieniężne', val: fmt(f1.srodkiPieniezne), pctV: '' },
                    { label: 'Suma aktywów', val: fmt(f1.aktywaRazem), pctV: '100%', bold: true },
                  ].map(row => (
                    <tr key={row.label} className="border-b border-slate-100">
                      <td className={`py-1 text-slate-600 ${row.bold ? 'font-bold' : ''}`}>{row.label}</td>
                      <td className={`py-1 text-right font-mono text-slate-700 ${row.bold ? 'font-bold' : ''}`}>{row.val}</td>
                      <td className="py-1 text-right text-slate-400 w-12">{row.pctV}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {/* Tabela pasywów */}
            <div>
              <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide mb-2">Pasywa</p>
              <table className="w-full text-[10px]">
                <tbody>
                  {[
                    { label: 'Kapitał własny', val: fmt(f1.kapitalWlasny), pctV: pct(f1.kapitalWlasny, f1.aktywaRazem) },
                    { label: 'Zobow. długoterminowe', val: fmt(f1.zobowiazaniaDlugo), pctV: pct(f1.zobowiazaniaDlugo, f1.aktywaRazem) },
                    { label: 'Zobow. krótkoterminowe', val: fmt(f1.zobowiazaniaKrotko), pctV: pct(f1.zobowiazaniaKrotko, f1.aktywaRazem) },
                    { label: 'Suma pasywów', val: fmt(f1.pasywaBilans || f1.aktywaRazem), pctV: '100%', bold: true },
                  ].map(row => (
                    <tr key={row.label} className="border-b border-slate-100">
                      <td className={`py-1 text-slate-600 ${row.bold ? 'font-bold' : ''}`}>{row.label}</td>
                      <td className={`py-1 text-right font-mono text-slate-700 ${row.bold ? 'font-bold' : ''}`}>{row.val}</td>
                      <td className="py-1 text-right text-slate-400 w-12">{row.pctV}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </PrintPage>

        {/* ── STRONA 4: RZiS ───────────────────────────────────────────────── */}
        <PrintPage pageNum={4}>
          <h2 className="text-xl font-black text-slate-800 mb-6">Rachunek wyników — {p1}</h2>

          <div className="grid grid-cols-2 gap-6 mb-4">
            {/* Kaskada */}
            <div>
              <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-3">Kaskada wyników</p>
              <div className="space-y-2">
                {cascade.map(item => {
                  const w = f1.przychody > 0 ? Math.max(0, Math.min(100, (Math.abs(item.val) / f1.przychody) * 100)) : 0;
                  return (
                    <div key={item.name}>
                      <div className="flex justify-between text-[10px] mb-0.5">
                        <span className="text-slate-600">{item.name}</span>
                        <span className="font-semibold text-slate-700">{fmt(item.val)}</span>
                      </div>
                      <div className="bg-slate-100 rounded-full h-4 overflow-hidden">
                        <div className="h-full rounded-full flex items-center justify-end pr-1.5 text-[9px] font-bold text-white"
                          style={{ width: `${w}%`, background: item.color, minWidth: w > 0 ? 32 : 0 }}>
                          {w > 10 && pct(item.val, f1.przychody)}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Tabela RZiS */}
            <div>
              <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-3">Zestawienie wyników</p>
              <table className="w-full text-[10px]">
                <thead>
                  <tr className="border-b-2 border-slate-200">
                    <th className="py-1 text-left text-slate-500 font-semibold">Pozycja</th>
                    <th className="py-1 text-right text-slate-500 font-semibold">{p1}</th>
                    <th className="py-1 text-right text-slate-500 font-semibold">{p2}</th>
                  </tr>
                </thead>
                <tbody>
                  {[
                    { label: 'Przychody netto', v1: f1.przychody, v2: f2.przychody, bold: true },
                    { label: 'Koszty działalności', v1: f1.kosztyOper, v2: f2.kosztyOper },
                    { label: 'Zysk ze sprzedaży', v1: f1.zyskZeSprz, v2: f2.zyskZeSprz },
                    { label: 'EBIT', v1: f1.ebit, v2: f2.ebit },
                    { label: 'Zysk brutto', v1: f1.zyskBrutto, v2: f2.zyskBrutto },
                    { label: 'Zysk netto', v1: f1.zyskNetto, v2: f2.zyskNetto, bold: true },
                  ].map(row => (
                    <tr key={row.label} className="border-b border-slate-100">
                      <td className={`py-1 text-slate-600 ${row.bold ? 'font-bold' : ''}`}>{row.label}</td>
                      <td className={`py-1 text-right font-mono ${row.bold ? 'font-bold' : ''} ${row.v1 < 0 ? 'text-rose-600' : 'text-slate-700'}`}>{fmt(row.v1)}</td>
                      <td className={`py-1 text-right font-mono text-slate-400`}>{fmt(row.v2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Trend margins */}
          <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-2">Marże — porównanie 3 okresów</p>
          <ResponsiveContainer width="100%" height={160}>
            <BarChart data={trendData} margin={{ top: 4, right: 4, left: 4, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="name" tick={{ fontSize: 9 }} />
              <YAxis tick={{ fontSize: 9 }} tickFormatter={v => (v / 1000).toFixed(0) + 'k'} />
              <Tooltip formatter={(v: any) => fmt(v)} />
              <Legend wrapperStyle={{ fontSize: 9 }} />
              <ReferenceLine y={0} stroke="#94a3b8" />
              <Bar dataKey="przychody" name="Przychody" fill="#3b82f6" radius={[2, 2, 0, 0]} />
              <Bar dataKey="zysk" name="Zysk netto" fill="#8b5cf6" radius={[2, 2, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </PrintPage>

        {/* ── STRONA 5: Komentarze AI ──────────────────────────────────────── */}
        <PrintPage pageNum={5}>
          <h2 className="text-xl font-black text-slate-800 mb-6">Komentarze AI — Analiza</h2>
          <div className="space-y-4">
            {AI_SECTIONS.map(s => (
              <div key={s.key} className="border border-slate-200 rounded-xl p-4">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-base">🤖</span>
                  <h3 className="text-sm font-bold text-slate-700">{s.label}</h3>
                </div>
                <p className="text-xs text-slate-600 leading-relaxed">
                  {aiTexts[s.key] ?? '—'}
                </p>
              </div>
            ))}
          </div>
          <div className="mt-6 pt-4 border-t border-slate-200 text-center">
            <p className="text-[9px] text-slate-300">Raport wygenerowany przez FinScope PL · {today} · Komentarze AI mają charakter informacyjny i nie stanowią rekomendacji inwestycyjnej</p>
          </div>
        </PrintPage>

      </div>
    </div>
  );
}

function PrintPage({ children, pageNum }: { children: React.ReactNode; pageNum: number }) {
  return (
    <div
      className="bg-white shadow-lg rounded-lg overflow-hidden print:shadow-none print:rounded-none"
      style={{ width: '100%', minHeight: '297mm', padding: '16mm', boxSizing: 'border-box', pageBreakAfter: 'always' }}
    >
      <div className="h-full relative">
        {children}
        <div className="absolute bottom-0 right-0 text-[9px] text-slate-300">
          Strona {pageNum} z 5
        </div>
      </div>
    </div>
  );
}

import { useState, useMemo, useCallback } from 'react';
import { useCompanies } from '../store/CompaniesContext';
import { mapFields, type FieldMap } from '../lib/fieldMapping';
import { computeBeneish, type BeneishResult, type BeneishIndex } from '../lib/controlChecks';
import { useLang } from '../i18n/LanguageContext';
import {
  PlynnostChart, SprawnostChart, ZadluzenieChart, RentownoscChart,
  BilansStruktura, RZiSStruktura,
} from './AnalysisCharts';
import AIAnalysisModal from './AIAnalysisModal';
import { MACRO_DATA } from './ControlSheet';

// ── Sub-tab type ──────────────────────────────────────────────────────────────

type SubTab =
  | 'plynnosc'
  | 'sprawnosc'
  | 'zadluzenie'
  | 'rentownosc'
  | 'cashflow'
  | 'dyskryminacyjne'
  | 'beneish'
  | 'podsumowanie'
  | 'bilans_str'
  | 'rzis_str';

// ── Formatting helpers ────────────────────────────────────────────────────────

function fmtRatio(v: number | null): string {
  if (v === null || !isFinite(v)) return '—';
  return v.toFixed(2) + 'x';
}

function fmtDays(v: number | null): string {
  if (v === null || !isFinite(v)) return '—';
  return Math.round(v) + ' dni';
}

function fmtPct(v: number | null): string {
  if (v === null || !isFinite(v)) return '—';
  return v.toFixed(1) + '%';
}

function safe(num: number, den: number): number | null {
  if (den === 0) return null;
  const r = num / den;
  return isFinite(r) ? r : null;
}

// ── Badge / norm assessment ───────────────────────────────────────────────────

type Grade = 'B_DOBRY' | 'DOBRY' | 'UWAGA' | 'SŁABY' | 'BRAK';
type GradeDir = 'range' | 'higher' | 'lower';

/**
 * @param v   – computed value (null = brak danych)
 * @param lo  – lower bound of norm (null = no lower bound)
 * @param hi  – upper bound of norm (null = no upper bound)
 * @param dir – 'range': outside range is bad; 'higher': above hi is good; 'lower': below lo is good
 *
 * B_DOBRY threshold: ≥50% beyond the "good" bound (e.g., hi=2.0 dir=higher → v≥3.0 = B_DOBRY;
 *                    lo=30 dir=lower → v≤15 = B_DOBRY)
 */
function grade(
  v: number | null,
  lo: number | null,
  hi: number | null,
  dir: GradeDir = 'range',
): Grade {
  if (v === null) return 'BRAK';

  const tooLow  = lo !== null && v < lo;
  const tooHigh = hi !== null && v > hi;

  if (!tooLow && !tooHigh) return 'DOBRY';

  if (tooLow) {
    if (dir === 'lower') {
      // below lo is GOOD: the further below, the better
      const pct = (lo! - v) / Math.abs(lo!);
      return pct >= 0.50 ? 'B_DOBRY' : 'DOBRY';
    }
    const pct = (lo! - v) / Math.abs(lo!);
    return pct <= 0.30 ? 'UWAGA' : 'SŁABY';
  }

  // tooHigh
  if (dir === 'higher') {
    // above hi is GOOD: the further above, the better
    const pct = (v - hi!) / Math.abs(hi!);
    return pct >= 0.50 ? 'B_DOBRY' : 'DOBRY';
  }
  const pct = (v - hi!) / Math.abs(hi!);
  return pct <= 0.30 ? 'UWAGA' : 'SŁABY';
}

/** Higher is better with single threshold. B_DOBRY when v ≥ threshold × 2. */
function gradeHigher(v: number | null, threshold: number): Grade {
  if (v === null) return 'BRAK';
  if (threshold !== 0 && v >= threshold * 2) return 'B_DOBRY';
  if (v > threshold) return 'DOBRY';
  const pct = (threshold - v) / Math.abs(threshold);
  return pct <= 0.30 ? 'UWAGA' : 'SŁABY';
}

/** Lower is better with single threshold. B_DOBRY when v ≤ threshold × 0.5. */
function gradeLower(v: number | null, threshold: number): Grade {
  if (v === null) return 'BRAK';
  if (threshold !== 0 && v <= threshold * 0.5) return 'B_DOBRY';
  if (v < threshold) return 'DOBRY';
  const pct = (v - threshold) / Math.abs(threshold);
  return pct <= 0.30 ? 'UWAGA' : 'SŁABY';
}

const GRADE_CLS: Record<Grade, string> = {
  B_DOBRY: 'bg-violet-100 text-violet-700 border border-violet-200',
  DOBRY:   'bg-emerald-100 text-emerald-700 border border-emerald-200',
  UWAGA:   'bg-amber-100  text-amber-700  border border-amber-200',
  SŁABY:   'bg-red-100    text-red-700    border border-red-200',
  BRAK:    'bg-slate-100  text-slate-500  border border-slate-200',
};

const GRADE_KEY: Record<Grade, string> = {
  B_DOBRY: 'grade.vgood',
  DOBRY:   'grade.good',
  UWAGA:   'grade.warning',
  SŁABY:   'grade.weak',
  BRAK:    'grade.nodata',
};

function Badge({ g }: { g: Grade }) {
  const { t } = useLang();
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${GRADE_CLS[g]}`}>
      {t(GRADE_KEY[g])}
    </span>
  );
}

// ── Indicator interface & card components ─────────────────────────────────────

interface CalcStep { label: string; val: number | null }

interface Indicator {
  name: string;
  shortName?: string;
  formula: string;
  val1: string;
  val2: string;
  val3?: string;
  norm: string;
  grade1: Grade;
  grade2?: Grade;
  grade3?: Grade;
  descPL?: string;
  unit?: string;
  steps1?: CalcStep[];
  steps2?: CalcStep[];
  steps3?: CalcStep[];
}

function IndicatorDrawer({ ind, labels, onClose }: { ind: Indicator; labels: string[]; onClose: () => void }) {
  const gradeColor = (g: Grade) =>
    g === 'B_DOBRY' ? 'text-violet-700 bg-violet-100'
    : g === 'DOBRY' ? 'text-emerald-700 bg-emerald-100'
    : g === 'UWAGA' ? 'text-amber-700 bg-amber-100'
    : g === 'SŁABY' ? 'text-red-700 bg-red-100'
    : 'text-slate-400 bg-slate-100';
  const gradeBorder = (g: Grade) =>
    g === 'B_DOBRY' ? 'border-violet-200 bg-violet-50'
    : g === 'DOBRY' ? 'border-emerald-200 bg-emerald-50'
    : g === 'UWAGA' ? 'border-amber-200 bg-amber-50'
    : g === 'SŁABY' ? 'border-red-200 bg-red-50'
    : 'border-slate-200 bg-slate-50';
  const gradeHeader = (g: Grade) =>
    g === 'B_DOBRY' ? 'bg-violet-100 text-violet-800'
    : g === 'DOBRY' ? 'bg-emerald-100 text-emerald-800'
    : g === 'UWAGA' ? 'bg-amber-100 text-amber-800'
    : g === 'SŁABY' ? 'bg-red-100 text-red-800'
    : 'bg-slate-100 text-slate-600';
  const fmtStep = (v: number | null) => {
    if (v === null || !isFinite(v)) return '—';
    const abs = Math.abs(v);
    if (abs >= 1) return new Intl.NumberFormat('pl-PL', { maximumFractionDigits: 0 }).format(v) + ' PLN';
    return v.toFixed(4);
  };

  const periods = [
    { lbl: labels[0] ?? 'P1', steps: ind.steps1, val: ind.val1, g: ind.grade1 },
    { lbl: labels[1] ?? 'P2', steps: ind.steps2, val: ind.val2, g: ind.grade2 ?? 'BRAK' as Grade },
    ...(ind.val3 ? [{ lbl: labels[2] ?? 'P3', steps: ind.steps3, val: ind.val3, g: ind.grade3 ?? 'BRAK' as Grade }] : []),
  ];

  return (
    <div className="fixed inset-0 z-50 flex" onClick={onClose}>
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
      <div
        className="relative ml-auto w-full max-w-md bg-white shadow-2xl flex flex-col overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-start gap-3 px-5 py-4 border-b border-slate-200 bg-slate-50 shrink-0">
          <div className="flex-1 min-w-0">
            <div className="font-bold text-slate-800 text-base leading-tight">{ind.name}</div>
            {ind.shortName && (
              <code className="text-xs text-slate-500 bg-slate-200 px-1.5 py-0.5 rounded font-mono mt-0.5 inline-block">{ind.shortName}</code>
            )}
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-700 text-2xl font-bold leading-none w-8 h-8 flex items-center justify-center rounded-lg hover:bg-slate-200 transition-colors shrink-0"
          >×</button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {ind.descPL && (
            <div>
              <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide mb-1.5">Opis wskaźnika</div>
              <p className="text-xs text-slate-600 leading-relaxed">{ind.descPL}</p>
            </div>
          )}
          <div>
            <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide mb-1.5">Formuła</div>
            <code className="text-xs text-slate-700 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2.5 block font-mono">{ind.formula}</code>
          </div>
          <div>
            <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide mb-2">Wyliczenie krok po kroku</div>
            <div className="space-y-2">
              {periods.map(({ lbl, steps, val, g }) => (
                <div key={lbl} className={`rounded-lg border overflow-hidden ${gradeBorder(g)}`}>
                  <div className={`px-3 py-1.5 text-[10px] font-bold uppercase tracking-wide ${gradeHeader(g)}`}>
                    {lbl}
                  </div>
                  <div className="px-3 py-2 space-y-1 bg-white/60">
                    {steps && steps.length > 0 ? (
                      <>
                        {steps.map((s, si) => (
                          <div key={si} className="flex items-center justify-between gap-2 text-xs">
                            <span className="text-slate-500 flex-1 leading-tight">{s.label}</span>
                            <span className="font-mono font-semibold text-slate-700 tabular-nums shrink-0">{fmtStep(s.val)}</span>
                          </div>
                        ))}
                        <div className="flex items-center justify-between pt-1.5 mt-0.5 border-t border-slate-200/80">
                          <span className="text-[10px] text-slate-400 font-semibold uppercase tracking-wide">= Wynik</span>
                          <span className={`font-mono font-black text-sm tabular-nums ${g === 'B_DOBRY' ? 'text-violet-700' : g === 'DOBRY' ? 'text-emerald-700' : g === 'UWAGA' ? 'text-amber-700' : g === 'SŁABY' ? 'text-red-700' : 'text-slate-400'}`}>{val}</span>
                        </div>
                      </>
                    ) : (
                      <div className={`font-mono font-black text-base tabular-nums ${g === 'B_DOBRY' ? 'text-violet-700' : g === 'DOBRY' ? 'text-emerald-700' : g === 'UWAGA' ? 'text-amber-700' : g === 'SŁABY' ? 'text-red-700' : 'text-slate-400'}`}>{val}</div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div>
            <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide mb-1.5">Norma interpretacyjna</div>
            <div className="text-xs text-slate-600 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2.5">{ind.norm}</div>
          </div>
          <div className="grid grid-cols-3 gap-2">
            {periods.map(({ lbl, val, g }) => (
              <div key={lbl} className={`rounded-lg p-3 ${gradeColor(g)} border`}>
                <div className="text-[9px] font-semibold uppercase tracking-wide opacity-70 mb-1">{lbl}</div>
                <div className="font-mono font-black text-lg tabular-nums">{val}</div>
                <Badge g={g} />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function IndicatorCards({ rows, labels }: { rows: Indicator[]; labels: string[] }) {
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null);
  const selected = selectedIdx !== null ? rows[selectedIdx] : null;

  const trendArrow = (g1: Grade, g2?: Grade) => {
    if (!g2 || g2 === 'BRAK' || g1 === 'BRAK') return null;
    const ord: Record<Grade, number> = { B_DOBRY: 3, DOBRY: 2, UWAGA: 1, SŁABY: 0, BRAK: -1 };
    const diff = ord[g1] - ord[g2];
    if (diff > 0) return <span className="text-emerald-600 text-xs font-bold">↑</span>;
    if (diff < 0) return <span className="text-red-500 text-xs font-bold">↓</span>;
    return <span className="text-slate-400 text-xs">→</span>;
  };

  return (
    <>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
        {rows.map((row, i) => {
          const borderCls = row.grade1 === 'B_DOBRY' ? 'border-violet-400'
            : row.grade1 === 'DOBRY' ? 'border-emerald-300'
            : row.grade1 === 'UWAGA' ? 'border-amber-300'
            : row.grade1 === 'SŁABY' ? 'border-red-300'
            : 'border-slate-200';
          const bg = row.grade1 === 'B_DOBRY' ? 'bg-violet-50/30'
            : row.grade1 === 'DOBRY' ? 'bg-emerald-50/30'
            : row.grade1 === 'UWAGA' ? 'bg-amber-50/30'
            : row.grade1 === 'SŁABY' ? 'bg-red-50/30'
            : 'bg-white';
          const valColor = row.grade1 === 'B_DOBRY' ? 'text-violet-700'
            : row.grade1 === 'DOBRY' ? 'text-emerald-700'
            : row.grade1 === 'UWAGA' ? 'text-amber-700'
            : row.grade1 === 'SŁABY' ? 'text-red-700'
            : 'text-slate-400';

          return (
            <button
              key={i}
              onClick={() => setSelectedIdx(i)}
              className={`text-left rounded-lg border-l-4 border-r border-t border-b overflow-hidden transition-all duration-100 ${borderCls} ${bg} bg-white px-3 py-2.5 shadow-[0_4px_0_0_#e2e8f0] hover:-translate-y-0.5 hover:shadow-[0_6px_0_0_#e2e8f0] active:translate-y-1 active:shadow-none`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-bold text-slate-800 leading-tight">{row.name}</div>
                  <code className="text-[9px] text-slate-400 font-mono mt-0.5 block truncate">{row.formula}</code>
                </div>
                <div className="shrink-0 flex items-center gap-1">
                  {trendArrow(row.grade1, row.grade2)}
                  <Badge g={row.grade1} />
                </div>
              </div>
              <div className="flex items-baseline gap-2 mt-1.5">
                <span className={`font-mono font-black text-xl tabular-nums ${valColor}`}>{row.val1}</span>
                {row.val2 !== '—' && (
                  <span className="text-xs font-mono text-slate-400">{row.val2}</span>
                )}
                <span className="flex-1" />
                <span className="text-[9px] text-slate-400 italic">norma: {row.norm}</span>
              </div>
            </button>
          );
        })}
      </div>
      {selected && (
        <IndicatorDrawer
          ind={selected}
          labels={labels}
          onClose={() => setSelectedIdx(null)}
        />
      )}
    </>
  );
}

// ── Płynność finansowa ────────────────────────────────────────────────────────

function PlynnostTab({ f1, f2, f3, periodLabels, onOpenAI }: { f1: FieldMap; f2: FieldMap; f3: FieldMap | null; periodLabels?: string[]; onOpenAI: (data: Record<string, unknown>) => void }) {
  const { t } = useLang();
  const pl = periodLabels ?? [];
  const labels = [pl[0] ?? 'P1', pl[1] ?? 'P2', pl[2] ?? 'P3'];

  const [chartInd, setChartInd] = useState<Indicator | null>(null);
  const rows: Indicator[] = useMemo(() => {
    const nwc = (f: FieldMap) => f.aktywaObrotowe - f.zobowiazaniaKrotko;
    const kon1 = safe(nwc(f1), f1.aktywaRazem);
    const kon2 = safe(nwc(f2), f2.aktywaRazem);
    const kon3 = f3 ? safe(nwc(f3), f3.aktywaRazem) : null;
    return [
      {
        name: t('liq.current'), shortName: 'CR',
        formula: t('liq.currentFormula'),
        val1: fmtRatio(safe(f1.aktywaObrotowe, f1.zobowiazaniaKrotko)),
        val2: fmtRatio(safe(f2.aktywaObrotowe, f2.zobowiazaniaKrotko)),
        val3: f3 ? fmtRatio(safe(f3.aktywaObrotowe, f3.zobowiazaniaKrotko)) : undefined,
        norm: '1.2 – 2.0',
        grade1: grade(safe(f1.aktywaObrotowe, f1.zobowiazaniaKrotko), 1.2, 2.0, 'higher'),
        grade2: grade(safe(f2.aktywaObrotowe, f2.zobowiazaniaKrotko), 1.2, 2.0, 'higher'),
        grade3: f3 ? grade(safe(f3.aktywaObrotowe, f3.zobowiazaniaKrotko), 1.2, 2.0, 'higher') : undefined,
        descPL: 'Informuje, ile razy aktywa obrotowe pokrywają zobowiązania krótkoterminowe. Wartość poniżej 1 sygnalizuje ryzyko utraty płynności bieżącej. Norma 1,2–2,0 jest standardem dla większości branż niefinansowych.',
        steps1: [{ label: 'Aktywa obrotowe (AO)', val: f1.aktywaObrotowe }, { label: 'Zobowiązania krótkoterm. (ZK)', val: f1.zobowiazaniaKrotko }],
        steps2: [{ label: 'Aktywa obrotowe (AO)', val: f2.aktywaObrotowe }, { label: 'Zobowiązania krótkoterm. (ZK)', val: f2.zobowiazaniaKrotko }],
        ...(f3 ? { steps3: [{ label: 'Aktywa obrotowe (AO)', val: f3.aktywaObrotowe }, { label: 'Zobowiązania krótkoterm. (ZK)', val: f3.zobowiazaniaKrotko }] } : {}),
      },
      {
        name: t('liq.quick'), shortName: 'QR',
        formula: t('liq.quickFormula'),
        val1: fmtRatio(safe(f1.aktywaObrotowe - f1.zapasy, f1.zobowiazaniaKrotko)),
        val2: fmtRatio(safe(f2.aktywaObrotowe - f2.zapasy, f2.zobowiazaniaKrotko)),
        val3: f3 ? fmtRatio(safe(f3.aktywaObrotowe - f3.zapasy, f3.zobowiazaniaKrotko)) : undefined,
        norm: '0.7 – 1.2',
        grade1: grade(safe(f1.aktywaObrotowe - f1.zapasy, f1.zobowiazaniaKrotko), 0.7, 1.2, 'higher'),
        grade2: grade(safe(f2.aktywaObrotowe - f2.zapasy, f2.zobowiazaniaKrotko), 0.7, 1.2, 'higher'),
        grade3: f3 ? grade(safe(f3.aktywaObrotowe - f3.zapasy, f3.zobowiazaniaKrotko), 0.7, 1.2, 'higher') : undefined,
        descPL: 'Lepsza miara zdolności do natychmiastowej spłaty — wyklucza zapasy jako najmniej płynny składnik aktywów obrotowych. Rekomendowana dla branż z długim cyklem rotacji zapasów.',
        steps1: [{ label: 'Aktywa obrotowe (AO)', val: f1.aktywaObrotowe }, { label: 'Zapasy', val: f1.zapasy }, { label: 'AO − Zapasy (licznik)', val: f1.aktywaObrotowe - f1.zapasy }, { label: 'Zobowiązania krótkoterm. (ZK)', val: f1.zobowiazaniaKrotko }],
        steps2: [{ label: 'Aktywa obrotowe (AO)', val: f2.aktywaObrotowe }, { label: 'Zapasy', val: f2.zapasy }, { label: 'AO − Zapasy (licznik)', val: f2.aktywaObrotowe - f2.zapasy }, { label: 'Zobowiązania krótkoterm. (ZK)', val: f2.zobowiazaniaKrotko }],
        ...(f3 ? { steps3: [{ label: 'Aktywa obrotowe (AO)', val: f3.aktywaObrotowe }, { label: 'Zapasy', val: f3.zapasy }, { label: 'AO − Zapasy (licznik)', val: f3.aktywaObrotowe - f3.zapasy }, { label: 'Zobowiązania krótkoterm. (ZK)', val: f3.zobowiazaniaKrotko }] } : {}),
      },
      {
        name: t('liq.cash'), shortName: 'CashR',
        formula: t('liq.cashFormula'),
        val1: fmtRatio(safe(f1.srodkiPieniezne, f1.zobowiazaniaKrotko)),
        val2: fmtRatio(safe(f2.srodkiPieniezne, f2.zobowiazaniaKrotko)),
        val3: f3 ? fmtRatio(safe(f3.srodkiPieniezne, f3.zobowiazaniaKrotko)) : undefined,
        norm: '0.1 – 0.2',
        grade1: grade(safe(f1.srodkiPieniezne, f1.zobowiazaniaKrotko), 0.1, 0.2),
        grade2: grade(safe(f2.srodkiPieniezne, f2.zobowiazaniaKrotko), 0.1, 0.2),
        grade3: f3 ? grade(safe(f3.srodkiPieniezne, f3.zobowiazaniaKrotko), 0.1, 0.2) : undefined,
        descPL: 'Konserwatywna miara płynności — uwzględnia wyłącznie środki pieniężne i ich ekwiwalenty. Zbyt wysoka wartość może świadczyć o nieefektywnym zarządzaniu gotówką.',
        steps1: [{ label: 'Środki pieniężne (SP)', val: f1.srodkiPieniezne }, { label: 'Zobowiązania krótkoterm. (ZK)', val: f1.zobowiazaniaKrotko }],
        steps2: [{ label: 'Środki pieniężne (SP)', val: f2.srodkiPieniezne }, { label: 'Zobowiązania krótkoterm. (ZK)', val: f2.zobowiazaniaKrotko }],
        ...(f3 ? { steps3: [{ label: 'Środki pieniężne (SP)', val: f3.srodkiPieniezne }, { label: 'Zobowiązania krótkoterm. (ZK)', val: f3.zobowiazaniaKrotko }] } : {}),
      },
      {
        name: 'Kapitał obrotowy netto / Aktywa', shortName: 'NWC/TA',
        formula: '(AO − ZK) / AT',
        val1: fmtPct(kon1 !== null ? kon1 * 100 : null),
        val2: fmtPct(kon2 !== null ? kon2 * 100 : null),
        val3: f3 && kon3 !== null ? fmtPct(kon3 * 100) : undefined,
        norm: '> 10%',
        grade1: gradeHigher(kon1 !== null ? kon1 * 100 : null, 10),
        grade2: gradeHigher(kon2 !== null ? kon2 * 100 : null, 10),
        grade3: f3 && kon3 !== null ? gradeHigher(kon3 * 100, 10) : undefined,
        descPL: 'Udział kapitału obrotowego netto w aktywach ogółem — kluczowy komponent modeli dyskryminacyjnych (np. Altman X₁, Hołda X₁ pośrednio). Mierzy "poduszkę płynnościową" względem skali działalności.',
        steps1: [{ label: 'Aktywa obrotowe (AO)', val: f1.aktywaObrotowe }, { label: 'Zobowiązania krótkoterm. (ZK)', val: f1.zobowiazaniaKrotko }, { label: 'Kapitał obrotowy netto (AO−ZK)', val: nwc(f1) }, { label: 'Aktywa razem (AT)', val: f1.aktywaRazem }],
        steps2: [{ label: 'Aktywa obrotowe (AO)', val: f2.aktywaObrotowe }, { label: 'Zobowiązania krótkoterm. (ZK)', val: f2.zobowiazaniaKrotko }, { label: 'Kapitał obrotowy netto (AO−ZK)', val: nwc(f2) }, { label: 'Aktywa razem (AT)', val: f2.aktywaRazem }],
        ...(f3 ? { steps3: [{ label: 'Aktywa obrotowe (AO)', val: f3.aktywaObrotowe }, { label: 'Zobowiązania krótkoterm. (ZK)', val: f3.zobowiazaniaKrotko }, { label: 'Kapitał obrotowy netto (AO−ZK)', val: nwc(f3) }, { label: 'Aktywa razem (AT)', val: f3.aktywaRazem }] } : {}),
      },
    ];
  }, [f1, f2, f3, t]);

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <button onClick={() => onOpenAI({ section: 'liquidity', periods: labels, indicators: rows.map(r => ({ name: r.shortName ?? r.name, p1: r.val1, grade_p1: r.grade1, p2: r.val2, ...(r.val3 ? { p3: r.val3 } : {}), norm: r.norm })) })} className="inline-flex items-center gap-1 px-2 py-1 text-[10px] font-semibold text-violet-600 hover:text-violet-800 bg-violet-50 hover:bg-violet-100 border border-violet-200 hover:border-violet-300 rounded-lg transition-all">🤖 Analiza AI</button>
      </div>
      <PlynnostChart f1={f1} f2={f2} f3={f3} periodLabels={periodLabels}
        onBarClick={idx => setChartInd(rows[idx] ?? null)} />
      <IndicatorCards rows={rows} labels={labels} />
      {chartInd && <IndicatorDrawer ind={chartInd} labels={labels} onClose={() => setChartInd(null)} />}
    </div>
  );
}

// ── Sprawność działania ───────────────────────────────────────────────────────

function SprawnostTab({ f1, f2, f3, periodLabels, onOpenAI }: { f1: FieldMap; f2: FieldMap; f3: FieldMap | null; periodLabels?: string[]; onOpenAI: (data: Record<string, unknown>) => void }) {
  const { t } = useLang();
  const pl = periodLabels ?? [];
  const labels = [pl[0] ?? 'P1', pl[1] ?? 'P2', pl[2] ?? 'P3'];
  const [chartInd, setChartInd] = useState<Indicator | null>(null);

  const rows: Indicator[] = useMemo(() => {
    const rotNal = (f: FieldMap) => f.przychody !== 0 ? (f.naleznosci / f.przychody) * 360 : null;
    const rotZap = (f: FieldMap) => { if (f.zapasy === 0) return null; const c = f.cogs !== 0 ? f.cogs : f.kosztyOper; return c !== 0 ? (f.zapasy / c) * 360 : null; };
    const rotZob = (f: FieldMap) => { const c = f.cogs !== 0 ? f.cogs : f.kosztyOper; return c !== 0 ? (f.zobowiazaniaKrotko / c) * 360 : null; };
    const ccc = (f: FieldMap) => { const n = rotNal(f); const z = rotZap(f); const zo = rotZob(f); return n !== null && z !== null && zo !== null ? n + z - zo : null; };
    const cccGrade = (v: number | null): Grade => v === null ? 'BRAK' : v < 0 ? 'B_DOBRY' : v < 60 ? 'DOBRY' : v < 90 ? 'UWAGA' : 'SŁABY';
    const cogsFallback = (f: FieldMap) => f.cogs !== 0 ? f.cogs : f.kosztyOper;
    return [
      {
        name: t('eff.totalAssets'), shortName: 'AT',
        formula: t('eff.totalAssetsFormula'),
        val1: fmtRatio(safe(f1.przychody, f1.aktywaTrwale + f1.aktywaObrotowe)),
        val2: fmtRatio(safe(f2.przychody, f2.aktywaTrwale + f2.aktywaObrotowe)),
        val3: f3 ? fmtRatio(safe(f3.przychody, f3.aktywaTrwale + f3.aktywaObrotowe)) : undefined,
        norm: '> 1.0',
        grade1: gradeHigher(safe(f1.przychody, f1.aktywaTrwale + f1.aktywaObrotowe), 1.0),
        grade2: gradeHigher(safe(f2.przychody, f2.aktywaTrwale + f2.aktywaObrotowe), 1.0),
        grade3: f3 ? gradeHigher(safe(f3.przychody, f3.aktywaTrwale + f3.aktywaObrotowe), 1.0) : undefined,
        descPL: 'Rotacja aktywów ogółem — ile PLN przychodów generuje 1 PLN aktywów. Wyższa wartość = lepsza efektywność aktywów. Szczególnie ważna w modelach Altmana i Hołdy.',
        steps1: [{ label: 'Przychody ze sprzedaży', val: f1.przychody }, { label: 'Aktywa razem (AT+AO)', val: f1.aktywaTrwale + f1.aktywaObrotowe }],
        steps2: [{ label: 'Przychody ze sprzedaży', val: f2.przychody }, { label: 'Aktywa razem (AT+AO)', val: f2.aktywaTrwale + f2.aktywaObrotowe }],
        ...(f3 ? { steps3: [{ label: 'Przychody ze sprzedaży', val: f3.przychody }, { label: 'Aktywa razem (AT+AO)', val: f3.aktywaTrwale + f3.aktywaObrotowe }] } : {}),
      },
      {
        name: t('eff.currentAssets'), shortName: 'OAT',
        formula: t('eff.currentAssetsFormula'),
        val1: fmtRatio(safe(f1.przychody, f1.aktywaObrotowe)),
        val2: fmtRatio(safe(f2.przychody, f2.aktywaObrotowe)),
        val3: f3 ? fmtRatio(safe(f3.przychody, f3.aktywaObrotowe)) : undefined,
        norm: '> 2.0',
        grade1: gradeHigher(safe(f1.przychody, f1.aktywaObrotowe), 2.0),
        grade2: gradeHigher(safe(f2.przychody, f2.aktywaObrotowe), 2.0),
        grade3: f3 ? gradeHigher(safe(f3.przychody, f3.aktywaObrotowe), 2.0) : undefined,
        descPL: 'Rotacja aktywów obrotowych mierzy, jak efektywnie firma zarządza swoim kapitałem pracującym względem uzyskiwanych przychodów.',
        steps1: [{ label: 'Przychody ze sprzedaży', val: f1.przychody }, { label: 'Aktywa obrotowe (AO)', val: f1.aktywaObrotowe }],
        steps2: [{ label: 'Przychody ze sprzedaży', val: f2.przychody }, { label: 'Aktywa obrotowe (AO)', val: f2.aktywaObrotowe }],
        ...(f3 ? { steps3: [{ label: 'Przychody ze sprzedaży', val: f3.przychody }, { label: 'Aktywa obrotowe (AO)', val: f3.aktywaObrotowe }] } : {}),
      },
      {
        name: t('eff.fixedAssets'), shortName: 'FAT',
        formula: t('eff.fixedAssetsFormula'),
        val1: fmtRatio(safe(f1.przychody, f1.aktywaTrwale)),
        val2: fmtRatio(safe(f2.przychody, f2.aktywaTrwale)),
        val3: f3 ? fmtRatio(safe(f3.przychody, f3.aktywaTrwale)) : undefined,
        norm: '> 3.0',
        grade1: gradeHigher(safe(f1.przychody, f1.aktywaTrwale), 3.0),
        grade2: gradeHigher(safe(f2.przychody, f2.aktywaTrwale), 3.0),
        grade3: f3 ? gradeHigher(safe(f3.przychody, f3.aktywaTrwale), 3.0) : undefined,
        descPL: 'Rotacja aktywów trwałych — dla firm usługowych i konsultingowych o niskim udziale środków trwałych może być bardzo wysoka, co jest normalną cechą sektora.',
        steps1: [{ label: 'Przychody ze sprzedaży', val: f1.przychody }, { label: 'Aktywa trwałe (AT)', val: f1.aktywaTrwale }],
        steps2: [{ label: 'Przychody ze sprzedaży', val: f2.przychody }, { label: 'Aktywa trwałe (AT)', val: f2.aktywaTrwale }],
        ...(f3 ? { steps3: [{ label: 'Przychody ze sprzedaży', val: f3.przychody }, { label: 'Aktywa trwałe (AT)', val: f3.aktywaTrwale }] } : {}),
      },
      {
        name: t('eff.receivables'), shortName: 'DSO',
        formula: t('eff.receivablesFormula'),
        val1: fmtDays(rotNal(f1)),
        val2: fmtDays(rotNal(f2)),
        val3: f3 ? fmtDays(rotNal(f3)) : undefined,
        norm: '30 – 60 dni',
        grade1: grade(rotNal(f1), 30, 60, 'lower'),
        grade2: grade(rotNal(f2), 30, 60, 'lower'),
        grade3: f3 ? grade(rotNal(f3), 30, 60, 'lower') : undefined,
        descPL: 'Days Sales Outstanding (DSO) — średnia liczba dni oczekiwania na zapłatę od klientów. Im niższa, tym szybciej firma inkasuje należności. Przekroczenie 60 dni może sygnalizować problemy z ściągalnością.',
        steps1: [{ label: 'Należności od odbiorców', val: f1.naleznosci }, { label: 'Przychody ze sprzedaży', val: f1.przychody }, { label: 'Przychody / 360', val: f1.przychody !== 0 ? f1.przychody / 360 : null }],
        steps2: [{ label: 'Należności od odbiorców', val: f2.naleznosci }, { label: 'Przychody ze sprzedaży', val: f2.przychody }, { label: 'Przychody / 360', val: f2.przychody !== 0 ? f2.przychody / 360 : null }],
        ...(f3 ? { steps3: [{ label: 'Należności od odbiorców', val: f3.naleznosci }, { label: 'Przychody ze sprzedaży', val: f3.przychody }, { label: 'Przychody / 360', val: f3.przychody !== 0 ? f3.przychody / 360 : null }] } : {}),
      },
      {
        name: t('eff.inventory'), shortName: 'DSI',
        formula: t('eff.inventoryFormula'),
        val1: fmtDays(rotZap(f1)),
        val2: fmtDays(rotZap(f2)),
        val3: f3 ? fmtDays(rotZap(f3)) : undefined,
        norm: '30 – 90 dni',
        grade1: grade(rotZap(f1), 30, 90, 'lower'),
        grade2: grade(rotZap(f2), 30, 90, 'lower'),
        grade3: f3 ? grade(rotZap(f3), 30, 90, 'lower') : undefined,
        descPL: 'Days Sales of Inventory (DSI) — jak długo zapasy „leżą" w magazynie przed sprzedażą. Dla firm usługowych bez zapasów wskaźnik wynosi 0 lub nie jest istotny.',
        steps1: [{ label: 'Zapasy', val: f1.zapasy }, { label: 'COGS / Koszty oper. (mianownik)', val: cogsFallback(f1) }],
        steps2: [{ label: 'Zapasy', val: f2.zapasy }, { label: 'COGS / Koszty oper. (mianownik)', val: cogsFallback(f2) }],
        ...(f3 ? { steps3: [{ label: 'Zapasy', val: f3.zapasy }, { label: 'COGS / Koszty oper. (mianownik)', val: cogsFallback(f3) }] } : {}),
      },
      {
        name: t('eff.payables'), shortName: 'DPO',
        formula: t('eff.payablesFormula'),
        val1: fmtDays(rotZob(f1)),
        val2: fmtDays(rotZob(f2)),
        val3: f3 ? fmtDays(rotZob(f3)) : undefined,
        norm: '30 – 60 dni',
        grade1: grade(rotZob(f1), 30, 60),
        grade2: grade(rotZob(f2), 30, 60),
        grade3: f3 ? grade(rotZob(f3), 30, 60) : undefined,
        descPL: 'Days Payable Outstanding (DPO) — jak długo firma korzysta z kredytu kupieckiego. Wyższy DPO oznacza lepsze zarządzanie gotówką, ale zbyt wysoki może sygnalizować problemy z płynnością.',
        steps1: [{ label: 'Zobowiązania krótkoterm. (ZK)', val: f1.zobowiazaniaKrotko }, { label: 'COGS / Koszty oper. (mianownik)', val: cogsFallback(f1) }],
        steps2: [{ label: 'Zobowiązania krótkoterm. (ZK)', val: f2.zobowiazaniaKrotko }, { label: 'COGS / Koszty oper. (mianownik)', val: cogsFallback(f2) }],
        ...(f3 ? { steps3: [{ label: 'Zobowiązania krótkoterm. (ZK)', val: f3.zobowiazaniaKrotko }, { label: 'COGS / Koszty oper. (mianownik)', val: cogsFallback(f3) }] } : {}),
      },
      {
        name: t('eff.ccc'), shortName: 'CCC',
        formula: t('eff.cccFormula'),
        val1: fmtDays(ccc(f1)),
        val2: fmtDays(ccc(f2)),
        val3: f3 ? fmtDays(ccc(f3)) : undefined,
        norm: t('eff.cccNorm'),
        grade1: cccGrade(ccc(f1)),
        grade2: cccGrade(ccc(f2)),
        grade3: f3 ? cccGrade(ccc(f3)) : undefined,
        descPL: 'Cykl konwersji gotówki (DSO + DSI − DPO) — jak długo gotówka jest „zamrożona" w operacjach. Ujemny CCC oznacza, że firma otrzymuje zapłatę zanim sama płaci dostawcom — idealny scenariusz.',
        steps1: [{ label: 'DSO (rotacja należności, dni)', val: rotNal(f1) }, { label: 'DSI (rotacja zapasów, dni)', val: rotZap(f1) }, { label: 'DPO (rotacja zobowiązań, dni)', val: rotZob(f1) }],
        steps2: [{ label: 'DSO (rotacja należności, dni)', val: rotNal(f2) }, { label: 'DSI (rotacja zapasów, dni)', val: rotZap(f2) }, { label: 'DPO (rotacja zobowiązań, dni)', val: rotZob(f2) }],
        ...(f3 ? { steps3: [{ label: 'DSO (rotacja należności, dni)', val: rotNal(f3) }, { label: 'DSI (rotacja zapasów, dni)', val: rotZap(f3) }, { label: 'DPO (rotacja zobowiązań, dni)', val: rotZob(f3) }] } : {}),
      },
    ];
  }, [f1, f2, f3, t]);

  // SprawnostChart bars [0,1,2,3] = DSO, DSI, DPO, CCC → rows[3,4,5,6]
  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <button onClick={() => onOpenAI({ section: 'efficiency', periods: labels, indicators: rows.map(r => ({ name: r.shortName ?? r.name, p1: r.val1, grade_p1: r.grade1, p2: r.val2, ...(r.val3 ? { p3: r.val3 } : {}), norm: r.norm })) })} className="inline-flex items-center gap-1 px-2 py-1 text-[10px] font-semibold text-violet-600 hover:text-violet-800 bg-violet-50 hover:bg-violet-100 border border-violet-200 hover:border-violet-300 rounded-lg transition-all">🤖 Analiza AI</button>
      </div>
      <SprawnostChart f1={f1} f2={f2} f3={f3} periodLabels={periodLabels}
        onBarClick={idx => setChartInd(rows[[3, 4, 5, 6][idx] ?? idx] ?? null)} />
      <IndicatorCards rows={rows} labels={labels} />
      {chartInd && <IndicatorDrawer ind={chartInd} labels={labels} onClose={() => setChartInd(null)} />}
    </div>
  );
}

// ── Zadłużenie ────────────────────────────────────────────────────────────────

function ZadluzenieTab({ f1, f2, f3, periodLabels, onOpenAI }: { f1: FieldMap; f2: FieldMap; f3: FieldMap | null; periodLabels?: string[]; onOpenAI: (data: Record<string, unknown>) => void }) {
  const { t } = useLang();
  const pl = periodLabels ?? [];
  const labels = [pl[0] ?? 'P1', pl[1] ?? 'P2', pl[2] ?? 'P3'];
  const [chartInd, setChartInd] = useState<Indicator | null>(null);

  const rows: Indicator[] = useMemo(() => {
    const totalDebt = (f: FieldMap) => f.zobowiazaniaDlugo + f.zobowiazaniaKrotko;
    const ebitda = (f: FieldMap) => f.ebit + f.amortyzacja;
    const dfl = (f: FieldMap) => (f.ebit > 0 && f.zyskBrutto > 0) ? safe(f.ebit, f.zyskBrutto) : null;
    const icr = (f: FieldMap) => f.odsetki !== 0 ? safe(ebitda(f), f.odsetki) : null;
    const netDebt = (f: FieldMap) => f.kredytDlugo + f.kredytKrotko - f.srodkiPieniezne;
    const ndEbitda = (f: FieldMap) => ebitda(f) !== 0 ? safe(netDebt(f), ebitda(f)) : null;
    const autoFin = (f: FieldMap) => f.aktywaRazem !== 0 ? f.kapitalWlasny / f.aktywaRazem : null;

    return [
      {
        name: t('debt.total'), shortName: 'D/A',
        formula: t('debt.totalFormula'),
        val1: fmtRatio(safe(totalDebt(f1), f1.aktywaRazem)),
        val2: fmtRatio(safe(totalDebt(f2), f2.aktywaRazem)),
        val3: f3 ? fmtRatio(safe(totalDebt(f3), f3.aktywaRazem)) : undefined,
        norm: '0.4 – 0.6',
        grade1: grade(safe(totalDebt(f1), f1.aktywaRazem), 0.4, 0.6, 'lower'),
        grade2: grade(safe(totalDebt(f2), f2.aktywaRazem), 0.4, 0.6, 'lower'),
        grade3: f3 ? grade(safe(totalDebt(f3), f3.aktywaRazem), 0.4, 0.6, 'lower') : undefined,
        descPL: 'Wskaźnik zadłużenia ogółem — jaka część aktywów jest finansowana długiem. Wartość > 0,6 sygnalizuje wysokie ryzyko finansowe. Kluczowy komponent wielu modeli dyskryminacyjnych.',
        steps1: [{ label: 'Zobowiązania długoterminowe (ZD)', val: f1.zobowiazaniaDlugo }, { label: 'Zobowiązania krótkoterm. (ZK)', val: f1.zobowiazaniaKrotko }, { label: 'Dług ogółem (ZD+ZK)', val: totalDebt(f1) }, { label: 'Aktywa razem', val: f1.aktywaRazem }],
        steps2: [{ label: 'Zobowiązania długoterminowe (ZD)', val: f2.zobowiazaniaDlugo }, { label: 'Zobowiązania krótkoterm. (ZK)', val: f2.zobowiazaniaKrotko }, { label: 'Dług ogółem (ZD+ZK)', val: totalDebt(f2) }, { label: 'Aktywa razem', val: f2.aktywaRazem }],
        ...(f3 ? { steps3: [{ label: 'Zobowiązania długoterminowe (ZD)', val: f3.zobowiazaniaDlugo }, { label: 'Zobowiązania krótkoterm. (ZK)', val: f3.zobowiazaniaKrotko }, { label: 'Dług ogółem (ZD+ZK)', val: totalDebt(f3) }, { label: 'Aktywa razem', val: f3.aktywaRazem }] } : {}),
      },
      {
        name: 'Autonomia finansowa (KW/AT)', shortName: 'E/A',
        formula: 'KW / AT',
        val1: fmtPct(autoFin(f1) !== null ? autoFin(f1)! * 100 : null),
        val2: fmtPct(autoFin(f2) !== null ? autoFin(f2)! * 100 : null),
        val3: f3 ? fmtPct(autoFin(f3) !== null ? autoFin(f3)! * 100 : null) : undefined,
        norm: '> 40%',
        grade1: gradeHigher(autoFin(f1) !== null ? autoFin(f1)! * 100 : null, 40),
        grade2: gradeHigher(autoFin(f2) !== null ? autoFin(f2)! * 100 : null, 40),
        grade3: f3 ? gradeHigher(autoFin(f3) !== null ? autoFin(f3)! * 100 : null, 40) : undefined,
        descPL: 'Stopień samofinansowania aktywów kapitałem własnym — im wyższy, tym lepsza niezależność finansowa. Używany w modelach Hołdy (kluczowy), Hadasika i Altmana.',
        steps1: [{ label: 'Kapitał własny (KW)', val: f1.kapitalWlasny }, { label: 'Aktywa razem (AT)', val: f1.aktywaRazem }],
        steps2: [{ label: 'Kapitał własny (KW)', val: f2.kapitalWlasny }, { label: 'Aktywa razem (AT)', val: f2.aktywaRazem }],
        ...(f3 ? { steps3: [{ label: 'Kapitał własny (KW)', val: f3.kapitalWlasny }, { label: 'Aktywa razem (AT)', val: f3.aktywaRazem }] } : {}),
      },
      {
        name: t('debt.equity'), shortName: 'D/E',
        formula: t('debt.equityFormula'),
        val1: fmtRatio(safe(totalDebt(f1), f1.kapitalWlasny)),
        val2: fmtRatio(safe(totalDebt(f2), f2.kapitalWlasny)),
        val3: f3 ? fmtRatio(safe(totalDebt(f3), f3.kapitalWlasny)) : undefined,
        norm: '0.5 – 1.0',
        grade1: grade(safe(totalDebt(f1), f1.kapitalWlasny), 0.5, 1.0, 'lower'),
        grade2: grade(safe(totalDebt(f2), f2.kapitalWlasny), 0.5, 1.0, 'lower'),
        grade3: f3 ? grade(safe(totalDebt(f3), f3.kapitalWlasny), 0.5, 1.0, 'lower') : undefined,
        descPL: 'Dźwignia finansowa — stosunek zobowiązań do kapitału własnego (debt-to-equity). Norma zależy od sektora; firmy usługowe mogą funkcjonować przy niższym D/E.',
        steps1: [{ label: 'Dług ogółem (ZD+ZK)', val: totalDebt(f1) }, { label: 'Kapitał własny (KW)', val: f1.kapitalWlasny }],
        steps2: [{ label: 'Dług ogółem (ZD+ZK)', val: totalDebt(f2) }, { label: 'Kapitał własny (KW)', val: f2.kapitalWlasny }],
        ...(f3 ? { steps3: [{ label: 'Dług ogółem (ZD+ZK)', val: totalDebt(f3) }, { label: 'Kapitał własny (KW)', val: f3.kapitalWlasny }] } : {}),
      },
      {
        name: t('debt.longTerm'), shortName: 'LTD/E',
        formula: t('debt.longTermFormula'),
        val1: fmtRatio(safe(f1.zobowiazaniaDlugo, f1.kapitalWlasny)),
        val2: fmtRatio(safe(f2.zobowiazaniaDlugo, f2.kapitalWlasny)),
        val3: f3 ? fmtRatio(safe(f3.zobowiazaniaDlugo, f3.kapitalWlasny)) : undefined,
        norm: '0.2 – 0.5',
        grade1: grade(safe(f1.zobowiazaniaDlugo, f1.kapitalWlasny), 0.2, 0.5, 'lower'),
        grade2: grade(safe(f2.zobowiazaniaDlugo, f2.kapitalWlasny), 0.2, 0.5, 'lower'),
        grade3: f3 ? grade(safe(f3.zobowiazaniaDlugo, f3.kapitalWlasny), 0.2, 0.5, 'lower') : undefined,
        descPL: 'Udział długu długoterminowego względem KW — miara struktury zadłużenia. Długoterminowe finansowanie jest mniej ryzykowne od krótkoterminowego.',
        steps1: [{ label: 'Zobowiązania długoterminowe (ZD)', val: f1.zobowiazaniaDlugo }, { label: 'Kapitał własny (KW)', val: f1.kapitalWlasny }],
        steps2: [{ label: 'Zobowiązania długoterminowe (ZD)', val: f2.zobowiazaniaDlugo }, { label: 'Kapitał własny (KW)', val: f2.kapitalWlasny }],
        ...(f3 ? { steps3: [{ label: 'Zobowiązania długoterminowe (ZD)', val: f3.zobowiazaniaDlugo }, { label: 'Kapitał własny (KW)', val: f3.kapitalWlasny }] } : {}),
      },
      {
        name: t('debt.icr'), shortName: 'ICR',
        formula: t('debt.icrFormula'),
        val1: fmtRatio(icr(f1)),
        val2: fmtRatio(icr(f2)),
        val3: f3 ? fmtRatio(icr(f3)) : undefined,
        norm: '> 3.0',
        grade1: icr(f1) !== null ? gradeHigher(icr(f1), 3.0) : 'BRAK',
        grade2: icr(f2) !== null ? gradeHigher(icr(f2), 3.0) : 'BRAK',
        grade3: f3 ? (icr(f3) !== null ? gradeHigher(icr(f3)!, 3.0) : 'BRAK') : undefined,
        descPL: 'Interest Coverage Ratio — zdolność do obsługi kosztów odsetkowych z EBITDA. ICR < 1,5 jest sygnałem alarmowym. Przy braku zadłużenia oprocentowanego wskaźnik nie jest obliczany.',
        steps1: [{ label: 'EBIT (zysk operacyjny)', val: f1.ebit }, { label: 'Amortyzacja', val: f1.amortyzacja }, { label: 'EBITDA (EBIT + Amort.)', val: ebitda(f1) }, { label: 'Odsetki / koszty finansowe', val: f1.odsetki }],
        steps2: [{ label: 'EBIT (zysk operacyjny)', val: f2.ebit }, { label: 'Amortyzacja', val: f2.amortyzacja }, { label: 'EBITDA (EBIT + Amort.)', val: ebitda(f2) }, { label: 'Odsetki / koszty finansowe', val: f2.odsetki }],
        ...(f3 ? { steps3: [{ label: 'EBIT (zysk operacyjny)', val: f3.ebit }, { label: 'Amortyzacja', val: f3.amortyzacja }, { label: 'EBITDA (EBIT + Amort.)', val: ebitda(f3) }, { label: 'Odsetki / koszty finansowe', val: f3.odsetki }] } : {}),
      },
      {
        name: t('debt.dfl'), shortName: 'DFL',
        formula: t('debt.dflFormula'),
        val1: dfl(f1) !== null ? fmtRatio(dfl(f1)) : '—',
        val2: dfl(f2) !== null ? fmtRatio(dfl(f2)) : '—',
        val3: f3 && dfl(f3) !== null ? fmtRatio(dfl(f3)) : undefined,
        norm: '1.0 – 1.5',
        grade1: dfl(f1) !== null ? grade(dfl(f1), 1.0, 1.5) : 'BRAK',
        grade2: dfl(f2) !== null ? grade(dfl(f2), 1.0, 1.5) : 'BRAK',
        grade3: f3 ? (dfl(f3) !== null ? grade(dfl(f3), 1.0, 1.5) : 'BRAK') : undefined,
        descPL: 'Stopień dźwigni finansowej (EBIT/ZB) — jak zmiany zysku operacyjnego przekładają się na zmiany zysku brutto. Im wyższy, tym większa wrażliwość na wahania EBIT.',
        steps1: [{ label: 'EBIT (zysk operacyjny)', val: f1.ebit }, { label: 'Zysk brutto (ZB)', val: f1.zyskBrutto }],
        steps2: [{ label: 'EBIT (zysk operacyjny)', val: f2.ebit }, { label: 'Zysk brutto (ZB)', val: f2.zyskBrutto }],
        ...(f3 ? { steps3: [{ label: 'EBIT (zysk operacyjny)', val: f3.ebit }, { label: 'Zysk brutto (ZB)', val: f3.zyskBrutto }] } : {}),
      },
      {
        name: t('debt.netDebt'), shortName: 'ND/EBITDA',
        formula: t('debt.netDebtFormula'),
        val1: fmtRatio(ndEbitda(f1)),
        val2: fmtRatio(ndEbitda(f2)),
        val3: f3 ? fmtRatio(ndEbitda(f3)) : undefined,
        norm: '< 3.0',
        grade1: ndEbitda(f1) !== null ? gradeLower(ndEbitda(f1)!, 3.0) : 'BRAK',
        grade2: ndEbitda(f2) !== null ? gradeLower(ndEbitda(f2)!, 3.0) : 'BRAK',
        grade3: f3 ? (ndEbitda(f3) !== null ? gradeLower(ndEbitda(f3)!, 3.0) : 'BRAK') : undefined,
        descPL: 'Dług netto (kredyty − gotówka) / EBITDA — najpopularniejszy wskaźnik lewarowania w finansowaniu korporacyjnym. Wskazuje, ile lat generowania EBITDA potrzeba na spłatę długu netto.',
        steps1: [{ label: 'Kredyty długoterminowe', val: f1.kredytDlugo }, { label: 'Kredyty krótkoterminowe', val: f1.kredytKrotko }, { label: 'Środki pieniężne', val: f1.srodkiPieniezne }, { label: 'Dług netto (KD+KK−SP)', val: netDebt(f1) }, { label: 'EBITDA (EBIT + Amort.)', val: ebitda(f1) }],
        steps2: [{ label: 'Kredyty długoterminowe', val: f2.kredytDlugo }, { label: 'Kredyty krótkoterminowe', val: f2.kredytKrotko }, { label: 'Środki pieniężne', val: f2.srodkiPieniezne }, { label: 'Dług netto (KD+KK−SP)', val: netDebt(f2) }, { label: 'EBITDA (EBIT + Amort.)', val: ebitda(f2) }],
        ...(f3 ? { steps3: [{ label: 'Kredyty długoterminowe', val: f3.kredytDlugo }, { label: 'Kredyty krótkoterminowe', val: f3.kredytKrotko }, { label: 'Środki pieniężne', val: f3.srodkiPieniezne }, { label: 'Dług netto (KD+KK−SP)', val: netDebt(f3) }, { label: 'EBITDA (EBIT + Amort.)', val: ebitda(f3) }] } : {}),
      },
    ];
  }, [f1, f2, f3, t]);

  // ZadluzenieChart bars [0,1,2,3] = D/A, Dług/KW(D/E), ZD/KW(LTD/E), ZK/KW → rows[0,2,3,1]
  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <button onClick={() => onOpenAI({ section: 'debt', periods: labels, indicators: rows.map(r => ({ name: r.shortName ?? r.name, p1: r.val1, grade_p1: r.grade1, p2: r.val2, ...(r.val3 ? { p3: r.val3 } : {}), norm: r.norm })) })} className="inline-flex items-center gap-1 px-2 py-1 text-[10px] font-semibold text-violet-600 hover:text-violet-800 bg-violet-50 hover:bg-violet-100 border border-violet-200 hover:border-violet-300 rounded-lg transition-all">🤖 Analiza AI</button>
      </div>
      <ZadluzenieChart f1={f1} f2={f2} f3={f3} periodLabels={periodLabels}
        onBarClick={idx => setChartInd(rows[[0, 2, 3, 1][idx] ?? 0] ?? null)} />
      <IndicatorCards rows={rows} labels={labels} />
      {chartInd && <IndicatorDrawer ind={chartInd} labels={labels} onClose={() => setChartInd(null)} />}
      <WiborSensitivity f1={f1} />
    </div>
  );
}

// ── Wrażliwość na WIBOR ───────────────────────────────────────────────────────
// Zmiana stopy procentowej o Δpp zastosowana do bieżącego zadłużenia
// oprocentowanego — pokazuje wpływ na koszt odsetek, zysk netto i ICR.
// Zakłada, że dług jest oprocentowany zmiennie (typowe dla kredytów obrotowych/
// inwestycyjnych w PLN) — uproszczenie, bo appka nie zna marży banku ani
// podziału na stałe/zmienne oprocentowanie per kredyt.
function WiborSensitivity({ f1 }: { f1: FieldMap }) {
  const { t } = useLang();

  const currentWibor = useMemo(() => {
    const series = MACRO_DATA.find(s => s.key === 'macro.wibor3m');
    if (!series) return null;
    const years = Object.keys(series.values).map(Number).sort((a, b) => b - a);
    for (const y of years) {
      const v = series.values[y as keyof typeof series.values];
      if (v !== undefined) return v;
    }
    return null;
  }, []);

  const debtBase = f1.kredytDlugo + f1.kredytKrotko;
  const scenarios = useMemo(() => {
    if (debtBase <= 0) return [];
    const deltas = [-2, -1, 0, 1, 2, 3];
    const ebitda = f1.ebit + f1.amortyzacja;
    const taxShield = f1.zyskBrutto > 0 ? f1.zyskNetto / f1.zyskBrutto : 1;
    return deltas.map(delta => {
      const deltaOdsetki = (delta / 100) * debtBase;
      const newOdsetki = Math.max(0, f1.odsetki + deltaOdsetki);
      const newZyskBrutto = f1.zyskBrutto - deltaOdsetki;
      const newZyskNetto = newZyskBrutto * taxShield;
      const newIcr = newOdsetki > 0 ? ebitda / newOdsetki : null;
      return { delta, netProfit: newZyskNetto, icr: newIcr };
    });
  }, [debtBase, f1]);

  const fmtK = (v: number) => new Intl.NumberFormat('pl-PL', { maximumFractionDigits: 0 }).format(v) + ' PLN';

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 space-y-3">
      <div>
        <h3 className="text-sm font-bold text-slate-700">{t('sens.title')}</h3>
        <p className="text-[11px] text-slate-400">
          {currentWibor !== null ? t('sens.subtitle', { wibor: currentWibor }) : t('sens.title')}
        </p>
      </div>

      {debtBase <= 0 ? (
        <p className="text-xs text-slate-400 italic">{t('sens.noDebt')}</p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-2">
            <div className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">
              <p className="text-[9px] text-slate-500 uppercase tracking-wide">{t('sens.debtBase')}</p>
              <p className="text-sm font-black text-slate-700">{fmtK(debtBase)}</p>
            </div>
            <div className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">
              <p className="text-[9px] text-slate-500 uppercase tracking-wide">{t('sens.currentRate')}</p>
              <p className="text-sm font-black text-slate-700">{debtBase > 0 ? ((f1.odsetki / debtBase) * 100).toFixed(2) + '%' : '—'}</p>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-[11px]">
              <thead>
                <tr className="border-b-2 border-slate-200">
                  <th className="text-left py-1.5 text-slate-500">{t('sens.scenario')}</th>
                  {scenarios.map(s => (
                    <th key={s.delta} className={`text-right py-1.5 px-2 ${s.delta === 0 ? 'text-violet-600 font-bold' : 'text-slate-500'}`}>
                      {s.delta === 0 ? t('sens.current') : `${s.delta > 0 ? '+' : ''}${s.delta}pp`}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <tr className="border-b border-slate-100">
                  <td className="py-1.5 text-slate-600 font-medium">{t('sens.netProfit')}</td>
                  {scenarios.map(s => (
                    <td key={s.delta} className={`text-right py-1.5 px-2 tabular-nums font-semibold ${s.delta === 0 ? 'text-violet-700 bg-violet-50' : s.netProfit >= 0 ? 'text-slate-700' : 'text-red-600'}`}>
                      {fmtK(s.netProfit)}
                    </td>
                  ))}
                </tr>
                <tr>
                  <td className="py-1.5 text-slate-600 font-medium">{t('sens.icr')}</td>
                  {scenarios.map(s => (
                    <td key={s.delta} className={`text-right py-1.5 px-2 tabular-nums font-semibold ${s.delta === 0 ? 'text-violet-700 bg-violet-50' : s.icr !== null && s.icr < 1.5 ? 'text-red-600' : 'text-slate-700'}`}>
                      {s.icr !== null ? s.icr.toFixed(2) + 'x' : '—'}
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

// ── Rentowność ────────────────────────────────────────────────────────────────

function RentownoscTab({ f1, f2, f3, periodLabels, onOpenAI }: { f1: FieldMap; f2: FieldMap; f3: FieldMap | null; periodLabels?: string[]; onOpenAI: (data: Record<string, unknown>) => void }) {
  const { t } = useLang();
  const pl = periodLabels ?? [];
  const labels = [pl[0] ?? 'P1', pl[1] ?? 'P2', pl[2] ?? 'P3'];
  const [chartInd, setChartInd] = useState<Indicator | null>(null);

  const rows: Indicator[] = useMemo(() => {
    const pct = (v: number | null) => v !== null ? v * 100 : null;
    const ebitda = (f: FieldMap) => f.ebit + f.amortyzacja;
    const roaOp = (f: FieldMap) => f.aktywaRazem !== 0 ? f.ebit / f.aktywaRazem : null;

    return [
      {
        name: t('prof.roe'), shortName: 'ROE',
        formula: t('prof.roeFormula'),
        val1: fmtPct(pct(safe(f1.zyskNetto, f1.kapitalWlasny))),
        val2: fmtPct(pct(safe(f2.zyskNetto, f2.kapitalWlasny))),
        val3: f3 ? fmtPct(pct(safe(f3.zyskNetto, f3.kapitalWlasny))) : undefined,
        norm: '> 10%',
        grade1: gradeHigher(pct(safe(f1.zyskNetto, f1.kapitalWlasny)), 10),
        grade2: gradeHigher(pct(safe(f2.zyskNetto, f2.kapitalWlasny)), 10),
        grade3: f3 ? gradeHigher(pct(safe(f3.zyskNetto, f3.kapitalWlasny)), 10) : undefined,
        descPL: 'Return on Equity — rentowność kapitału własnego. Kluczowa miara efektywności dla akcjonariuszy. Dla EXCO Poland (firma doradcza) wartość > 15% jest typowa.',
        steps1: [{ label: 'Zysk netto', val: f1.zyskNetto }, { label: 'Kapitał własny (KW)', val: f1.kapitalWlasny }],
        steps2: [{ label: 'Zysk netto', val: f2.zyskNetto }, { label: 'Kapitał własny (KW)', val: f2.kapitalWlasny }],
        ...(f3 ? { steps3: [{ label: 'Zysk netto', val: f3.zyskNetto }, { label: 'Kapitał własny (KW)', val: f3.kapitalWlasny }] } : {}),
      },
      {
        name: t('prof.roa'), shortName: 'ROA',
        formula: t('prof.roaFormula'),
        val1: fmtPct(pct(safe(f1.zyskNetto, f1.aktywaRazem))),
        val2: fmtPct(pct(safe(f2.zyskNetto, f2.aktywaRazem))),
        val3: f3 ? fmtPct(pct(safe(f3.zyskNetto, f3.aktywaRazem))) : undefined,
        norm: '> 5%',
        grade1: gradeHigher(pct(safe(f1.zyskNetto, f1.aktywaRazem)), 5),
        grade2: gradeHigher(pct(safe(f2.zyskNetto, f2.aktywaRazem)), 5),
        grade3: f3 ? gradeHigher(pct(safe(f3.zyskNetto, f3.aktywaRazem)), 5) : undefined,
        descPL: 'Return on Assets — rentowność aktywów netto. Używany bezpośrednio w modelach Altmana, Hołdy, Gajdki & Stosa.',
        steps1: [{ label: 'Zysk netto', val: f1.zyskNetto }, { label: 'Aktywa razem', val: f1.aktywaRazem }],
        steps2: [{ label: 'Zysk netto', val: f2.zyskNetto }, { label: 'Aktywa razem', val: f2.aktywaRazem }],
        ...(f3 ? { steps3: [{ label: 'Zysk netto', val: f3.zyskNetto }, { label: 'Aktywa razem', val: f3.aktywaRazem }] } : {}),
      },
      {
        name: 'ROA operacyjny (EBIT/AT)', shortName: 'ROOA',
        formula: 'EBIT / AT',
        val1: fmtPct(pct(roaOp(f1))),
        val2: fmtPct(pct(roaOp(f2))),
        val3: f3 ? fmtPct(pct(roaOp(f3))) : undefined,
        norm: '> 5%',
        grade1: gradeHigher(pct(roaOp(f1)), 5),
        grade2: gradeHigher(pct(roaOp(f2)), 5),
        grade3: f3 ? gradeHigher(pct(roaOp(f3)), 5) : undefined,
        descPL: 'Rentowność operacyjna aktywów (EBIT/AT) — eliminuje wpływ struktury finansowania i podatków. Kluczowy komponent modeli Altmana (X₃) i Springate (X₂).',
        steps1: [{ label: 'EBIT (zysk operacyjny)', val: f1.ebit }, { label: 'Aktywa razem', val: f1.aktywaRazem }],
        steps2: [{ label: 'EBIT (zysk operacyjny)', val: f2.ebit }, { label: 'Aktywa razem', val: f2.aktywaRazem }],
        ...(f3 ? { steps3: [{ label: 'EBIT (zysk operacyjny)', val: f3.ebit }, { label: 'Aktywa razem', val: f3.aktywaRazem }] } : {}),
      },
      {
        name: t('prof.ros'), shortName: 'ROS',
        formula: t('prof.rosFormula'),
        val1: fmtPct(pct(safe(f1.zyskNetto, f1.przychody))),
        val2: fmtPct(pct(safe(f2.zyskNetto, f2.przychody))),
        val3: f3 ? fmtPct(pct(safe(f3.zyskNetto, f3.przychody))) : undefined,
        norm: '> 5%',
        grade1: gradeHigher(pct(safe(f1.zyskNetto, f1.przychody)), 5),
        grade2: gradeHigher(pct(safe(f2.zyskNetto, f2.przychody)), 5),
        grade3: f3 ? gradeHigher(pct(safe(f3.zyskNetto, f3.przychody)), 5) : undefined,
        descPL: 'Return on Sales — ile złotych zysku netto przynosi 100 zł przychodu. Dla usług consultingowych wysoka marża ROS jest fundamentalna.',
        steps1: [{ label: 'Zysk netto', val: f1.zyskNetto }, { label: 'Przychody ze sprzedaży', val: f1.przychody }],
        steps2: [{ label: 'Zysk netto', val: f2.zyskNetto }, { label: 'Przychody ze sprzedaży', val: f2.przychody }],
        ...(f3 ? { steps3: [{ label: 'Zysk netto', val: f3.zyskNetto }, { label: 'Przychody ze sprzedaży', val: f3.przychody }] } : {}),
      },
      {
        name: t('prof.grossMargin'), shortName: 'GPM',
        formula: t('prof.grossMarginFormula'),
        val1: fmtPct(pct(safe(f1.zyskBrutto, f1.przychody))),
        val2: fmtPct(pct(safe(f2.zyskBrutto, f2.przychody))),
        val3: f3 ? fmtPct(pct(safe(f3.zyskBrutto, f3.przychody))) : undefined,
        norm: '> 8%',
        grade1: gradeHigher(pct(safe(f1.zyskBrutto, f1.przychody)), 8),
        grade2: gradeHigher(pct(safe(f2.zyskBrutto, f2.przychody)), 8),
        grade3: f3 ? gradeHigher(pct(safe(f3.zyskBrutto, f3.przychody)), 8) : undefined,
        descPL: 'Marża zysku brutto (przed podatkiem CIT) — uwzględnia koszty finansowe. Używana w modelach Gajdki & Stosa i Mączyńskiej.',
        steps1: [{ label: 'Zysk brutto', val: f1.zyskBrutto }, { label: 'Przychody ze sprzedaży', val: f1.przychody }],
        steps2: [{ label: 'Zysk brutto', val: f2.zyskBrutto }, { label: 'Przychody ze sprzedaży', val: f2.przychody }],
        ...(f3 ? { steps3: [{ label: 'Zysk brutto', val: f3.zyskBrutto }, { label: 'Przychody ze sprzedaży', val: f3.przychody }] } : {}),
      },
      {
        name: t('prof.ebitMargin'), shortName: 'EBIT%',
        formula: t('prof.ebitMarginFormula'),
        val1: fmtPct(pct(safe(f1.ebit, f1.przychody))),
        val2: fmtPct(pct(safe(f2.ebit, f2.przychody))),
        val3: f3 ? fmtPct(pct(safe(f3.ebit, f3.przychody))) : undefined,
        norm: '> 5%',
        grade1: gradeHigher(pct(safe(f1.ebit, f1.przychody)), 5),
        grade2: gradeHigher(pct(safe(f2.ebit, f2.przychody)), 5),
        grade3: f3 ? gradeHigher(pct(safe(f3.ebit, f3.przychody)), 5) : undefined,
        descPL: 'Marża operacyjna EBIT — efektywność operacyjna bez wpływu struktury kapitału.',
        steps1: [{ label: 'EBIT (zysk operacyjny)', val: f1.ebit }, { label: 'Przychody ze sprzedaży', val: f1.przychody }],
        steps2: [{ label: 'EBIT (zysk operacyjny)', val: f2.ebit }, { label: 'Przychody ze sprzedaży', val: f2.przychody }],
        ...(f3 ? { steps3: [{ label: 'EBIT (zysk operacyjny)', val: f3.ebit }, { label: 'Przychody ze sprzedaży', val: f3.przychody }] } : {}),
      },
      {
        name: t('prof.ebitdaMargin'), shortName: 'EBITDA%',
        formula: t('prof.ebitdaMarginFormula'),
        val1: fmtPct(pct(safe(ebitda(f1), f1.przychody))),
        val2: fmtPct(pct(safe(ebitda(f2), f2.przychody))),
        val3: f3 ? fmtPct(pct(safe(ebitda(f3), f3.przychody))) : undefined,
        norm: '> 8%',
        grade1: gradeHigher(pct(safe(ebitda(f1), f1.przychody)), 8),
        grade2: gradeHigher(pct(safe(ebitda(f2), f2.przychody)), 8),
        grade3: f3 ? gradeHigher(pct(safe(ebitda(f3), f3.przychody)), 8) : undefined,
        descPL: 'Marża EBITDA — gotówkowa rentowność operacyjna. Wskaźnik używany powszechnie przez banki do liczenia ND/EBITDA i oceny zdolności obsługi długu.',
        steps1: [{ label: 'EBIT (zysk operacyjny)', val: f1.ebit }, { label: 'Amortyzacja', val: f1.amortyzacja }, { label: 'EBITDA (EBIT + Amort.)', val: ebitda(f1) }, { label: 'Przychody ze sprzedaży', val: f1.przychody }],
        steps2: [{ label: 'EBIT (zysk operacyjny)', val: f2.ebit }, { label: 'Amortyzacja', val: f2.amortyzacja }, { label: 'EBITDA (EBIT + Amort.)', val: ebitda(f2) }, { label: 'Przychody ze sprzedaży', val: f2.przychody }],
        ...(f3 ? { steps3: [{ label: 'EBIT (zysk operacyjny)', val: f3.ebit }, { label: 'Amortyzacja', val: f3.amortyzacja }, { label: 'EBITDA (EBIT + Amort.)', val: ebitda(f3) }, { label: 'Przychody ze sprzedaży', val: f3.przychody }] } : {}),
      },
    ];
  }, [f1, f2, f3, t]);

  // RentownoscChart bars [0,1,2,3,4] = ROE, ROA, ROS, EBIT%, EBITDA% → rows[0,1,3,5,6]
  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <button onClick={() => onOpenAI({ section: 'profitability', periods: labels, indicators: rows.map(r => ({ name: r.shortName ?? r.name, p1: r.val1, grade_p1: r.grade1, p2: r.val2, ...(r.val3 ? { p3: r.val3 } : {}), norm: r.norm })) })} className="inline-flex items-center gap-1 px-2 py-1 text-[10px] font-semibold text-violet-600 hover:text-violet-800 bg-violet-50 hover:bg-violet-100 border border-violet-200 hover:border-violet-300 rounded-lg transition-all">🤖 Analiza AI</button>
      </div>
      <RentownoscChart f1={f1} f2={f2} f3={f3} periodLabels={periodLabels}
        onBarClick={idx => setChartInd(rows[[0, 1, 3, 5, 6][idx] ?? 0] ?? null)} />
      <IndicatorCards rows={rows} labels={labels} />
      {chartInd && <IndicatorDrawer ind={chartInd} labels={labels} onClose={() => setChartInd(null)} />}
      <DuPontPyramid f1={f1} f2={f2} f3={f3} periodLabels={periodLabels} />
    </div>
  );
}

// ── Piramida Du Ponta (dekompozycja ROE) ─────────────────────────────────────
// ROE = Marża netto (ZN/Przychody) × Rotacja aktywów (Przychody/Aktywa) × Dźwignia (Aktywa/KW)
function DuPontPyramid({ f1, f2, f3, periodLabels }: { f1: FieldMap; f2: FieldMap; f3: FieldMap | null; periodLabels?: string[] }) {
  const { t } = useLang();
  const pl = periodLabels ?? [];
  const labels = [pl[0] ?? 'P1', pl[1] ?? 'P2', pl[2] ?? 'P3'];
  const [factorInd, setFactorInd] = useState<Indicator | null>(null);

  const factors = useMemo(() => {
    const calc = (f: FieldMap) => {
      const netMargin = safe(f.zyskNetto, f.przychody);
      const turnover = safe(f.przychody, f.aktywaRazem);
      const leverage = safe(f.aktywaRazem, f.kapitalWlasny);
      const roe = netMargin !== null && turnover !== null && leverage !== null ? netMargin * turnover * leverage : null;
      return { netMargin, turnover, leverage, roe };
    };
    return { p1: calc(f1), p2: calc(f2), p3: f3 ? calc(f3) : null };
  }, [f1, f2, f3]);

  const fmtX = (v: number | null) => v !== null && isFinite(v) ? v.toFixed(2) + 'x' : '—';

  const factorRows: Indicator[] = useMemo(() => [
    {
      name: t('dupont.netMargin'), shortName: 'ROS',
      formula: t('dupont.netMarginFormula'),
      val1: fmtPct(factors.p1.netMargin !== null ? factors.p1.netMargin * 100 : null),
      val2: fmtPct(factors.p2.netMargin !== null ? factors.p2.netMargin * 100 : null),
      val3: factors.p3 ? fmtPct(factors.p3.netMargin !== null ? factors.p3.netMargin * 100 : null) : undefined,
      norm: '> 5%',
      grade1: gradeHigher(factors.p1.netMargin !== null ? factors.p1.netMargin * 100 : null, 5),
      grade2: gradeHigher(factors.p2.netMargin !== null ? factors.p2.netMargin * 100 : null, 5),
      grade3: factors.p3 ? gradeHigher(factors.p3.netMargin !== null ? factors.p3.netMargin * 100 : null, 5) : undefined,
      descPL: 'Ile zysku netto zostaje ze 100 zł przychodu — czysta efektywność sprzedażowa, niezależna od struktury finansowania czy rotacji majątku.',
      steps1: [{ label: 'Zysk netto', val: f1.zyskNetto }, { label: 'Przychody', val: f1.przychody }],
      steps2: [{ label: 'Zysk netto', val: f2.zyskNetto }, { label: 'Przychody', val: f2.przychody }],
      ...(f3 ? { steps3: [{ label: 'Zysk netto', val: f3.zyskNetto }, { label: 'Przychody', val: f3.przychody }] } : {}),
    },
    {
      name: t('dupont.assetTurnover'), shortName: 'AT',
      formula: t('dupont.assetTurnoverFormula'),
      val1: fmtX(factors.p1.turnover), val2: fmtX(factors.p2.turnover),
      val3: factors.p3 ? fmtX(factors.p3.turnover) : undefined,
      norm: '> 1,0x',
      grade1: gradeHigher(factors.p1.turnover, 1),
      grade2: gradeHigher(factors.p2.turnover, 1),
      grade3: factors.p3 ? gradeHigher(factors.p3.turnover, 1) : undefined,
      descPL: 'Ile złotych przychodu generuje 1 zł aktywów — efektywność wykorzystania majątku firmy do generowania sprzedaży.',
      steps1: [{ label: 'Przychody', val: f1.przychody }, { label: 'Aktywa razem', val: f1.aktywaRazem }],
      steps2: [{ label: 'Przychody', val: f2.przychody }, { label: 'Aktywa razem', val: f2.aktywaRazem }],
      ...(f3 ? { steps3: [{ label: 'Przychody', val: f3.przychody }, { label: 'Aktywa razem', val: f3.aktywaRazem }] } : {}),
    },
    {
      name: t('dupont.equityMultiplier'), shortName: 'EM',
      formula: t('dupont.equityMultiplierFormula'),
      val1: fmtX(factors.p1.leverage), val2: fmtX(factors.p2.leverage),
      val3: factors.p3 ? fmtX(factors.p3.leverage) : undefined,
      norm: '< 3,0x',
      grade1: gradeLower(factors.p1.leverage, 3),
      grade2: gradeLower(factors.p2.leverage, 3),
      grade3: factors.p3 ? gradeLower(factors.p3.leverage, 3) : undefined,
      descPL: 'Ile razy aktywa przewyższają kapitał własny — miara dźwigni finansowej. Wyższa wartość oznacza więcej długu na złotówkę kapitału, co wzmacnia ROE, ale zwiększa ryzyko.',
      steps1: [{ label: 'Aktywa razem', val: f1.aktywaRazem }, { label: 'Kapitał własny', val: f1.kapitalWlasny }],
      steps2: [{ label: 'Aktywa razem', val: f2.aktywaRazem }, { label: 'Kapitał własny', val: f2.kapitalWlasny }],
      ...(f3 ? { steps3: [{ label: 'Aktywa razem', val: f3.aktywaRazem }, { label: 'Kapitał własny', val: f3.kapitalWlasny }] } : {}),
    },
  ], [f1, f2, f3, factors, t]);

  const roe1 = factors.p1.roe !== null ? factors.p1.roe * 100 : null;
  const roe2 = factors.p2.roe !== null ? factors.p2.roe * 100 : null;
  const roe3 = factors.p3?.roe !== null ? (factors.p3?.roe ?? 0) * 100 : null;

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 space-y-3">
      <div>
        <h3 className="text-sm font-bold text-slate-700">{t('dupont.title')}</h3>
        <p className="text-[11px] text-slate-400">{t('dupont.subtitle')}</p>
      </div>

      <div className="flex flex-wrap items-stretch justify-center gap-2">
        {factorRows.map((row, i) => (
          <div key={row.shortName} className="flex items-center gap-2">
            <button
              onClick={() => setFactorInd(row)}
              className={`text-left px-3 py-2.5 rounded-lg border transition-all hover:shadow-md min-w-[120px] ${
                row.grade1 === 'B_DOBRY' ? 'bg-violet-50 border-violet-200 hover:border-violet-400'
                : row.grade1 === 'DOBRY' ? 'bg-emerald-50 border-emerald-200 hover:border-emerald-400'
                : row.grade1 === 'UWAGA' ? 'bg-amber-50 border-amber-200 hover:border-amber-400'
                : row.grade1 === 'SŁABY' ? 'bg-red-50 border-red-200 hover:border-red-400'
                : 'bg-slate-50 border-slate-200'
              }`}
            >
              <p className="text-[9px] text-slate-500 uppercase tracking-wide">{row.shortName}</p>
              <p className="text-sm font-black text-slate-700">{row.val1}</p>
              <p className="text-[8px] text-slate-400 mt-0.5">▼ szczegóły</p>
            </button>
            {i < factorRows.length - 1 && <span className="text-lg font-black text-slate-300">×</span>}
          </div>
        ))}
        <span className="text-lg font-black text-slate-300">=</span>
        <div className="px-4 py-2.5 rounded-lg border-2 border-violet-400 bg-violet-100 min-w-[120px] flex flex-col justify-center">
          <p className="text-[9px] text-violet-500 uppercase tracking-wide font-semibold">{t('dupont.resultRoe')}</p>
          <p className="text-lg font-black text-violet-800">{fmtPct(roe1)}</p>
        </div>
      </div>

      {(roe2 !== null || roe3 !== null) && (
        <div className="flex justify-center gap-6 pt-1 text-[10px] text-slate-500">
          {roe3 !== null && <span>{labels[2]}: <strong className="text-slate-700">{fmtPct(roe3)}</strong></span>}
          {roe2 !== null && <span>{labels[1]}: <strong className="text-slate-700">{fmtPct(roe2)}</strong></span>}
          <span className="text-violet-600">{labels[0]}: <strong>{fmtPct(roe1)}</strong></span>
        </div>
      )}

      {factorInd && <IndicatorDrawer ind={factorInd} labels={labels} onClose={() => setFactorInd(null)} />}
    </div>
  );
}

// ── Cash flow (metoda pośrednia, rekonstrukcja z różnic bilansowych) ─────────
// Uproszczenie: zobowiązania krótkoterminowe traktujemy jako suma części
// operacyjnej (handlowej) i finansowej (kredyty krótkoterminowe) — odejmujemy
// kredytKrotko, żeby nie liczyć spłaty/zaciągnięcia kredytu podwójnie w CFO i CFF.
// Różnica między realną Δśrodków pieniężnych a sumą CFO+CFI+CFF pokazana jest
// jawnie jako "Inne pozycje bilansowe" — model nie zna zmian kapitału własnego
// (dywidendy, dopłaty), rezerw ani innych pozycji spoza FieldMap.
interface CashFlowStep { label: string; val: number; hint?: string }

function CashFlowTab({ f1, f2, periodLabels, onOpenAI }: { f1: FieldMap; f2: FieldMap; periodLabels?: string[]; onOpenAI: (data: Record<string, unknown>) => void }) {
  const { t } = useLang();
  const pl = periodLabels ?? [];
  const p1 = pl[0] ?? 'P1';
  const p2 = pl[1] ?? 'P2';

  const cf = useMemo(() => {
    const deltaNaleznosci = f1.naleznosci - f2.naleznosci;
    const deltaZapasy = f1.zapasy - f2.zapasy;
    const opZobowKrotko1 = f1.zobowiazaniaKrotko - f1.kredytKrotko;
    const opZobowKrotko2 = f2.zobowiazaniaKrotko - f2.kredytKrotko;
    const deltaZobowOper = opZobowKrotko1 - opZobowKrotko2;

    const operating: CashFlowStep[] = [
      { label: t('cf.netProfit'), val: f1.zyskNetto },
      { label: t('cf.depreciation'), val: f1.amortyzacja },
      { label: t('cf.receivables'), val: -deltaNaleznosci },
      { label: t('cf.inventory'), val: -deltaZapasy },
      { label: t('cf.payables'), val: deltaZobowOper },
    ];
    const cfo = operating.reduce((s, x) => s + x.val, 0);

    const deltaAktywaTrwale = f1.aktywaTrwale - f2.aktywaTrwale;
    const investing: CashFlowStep[] = [
      { label: t('cf.capex'), val: -deltaAktywaTrwale },
    ];
    const cfi = investing.reduce((s, x) => s + x.val, 0);

    const financing: CashFlowStep[] = [
      { label: t('cf.longTermDebt'), val: f1.kredytDlugo - f2.kredytDlugo },
      { label: t('cf.shortTermDebt'), val: f1.kredytKrotko - f2.kredytKrotko },
    ];
    const cff = financing.reduce((s, x) => s + x.val, 0);

    const realCashChange = f1.srodkiPieniezne - f2.srodkiPieniezne;
    const other = realCashChange - (cfo + cfi + cff);

    return { operating, cfo, investing, cfi, financing, cff, other, realCashChange };
  }, [f1, f2, t]);

  const fmtK = (v: number) => {
    const sign = v > 0 ? '+' : '';
    return sign + new Intl.NumberFormat('pl-PL', { maximumFractionDigits: 0 }).format(v) + ' PLN';
  };

  const maxAbs = Math.max(
    ...cf.operating.map(s => Math.abs(s.val)),
    ...cf.investing.map(s => Math.abs(s.val)),
    ...cf.financing.map(s => Math.abs(s.val)),
    Math.abs(cf.other), 1,
  );

  const StepRow = ({ step, bold }: { step: CashFlowStep; bold?: boolean }) => (
    <div className="flex items-center gap-3 py-1">
      <span className={`flex-1 text-xs ${bold ? 'font-bold text-slate-700' : 'text-slate-600'}`}>{step.label}</span>
      <div className="w-32 h-3 bg-slate-100 rounded-full overflow-hidden relative shrink-0">
        <div
          className={`h-full rounded-full ${step.val >= 0 ? 'bg-emerald-400' : 'bg-rose-400'}`}
          style={{ width: `${Math.min(100, (Math.abs(step.val) / maxAbs) * 100)}%`, marginLeft: step.val >= 0 ? '50%' : `${50 - Math.min(50, (Math.abs(step.val) / maxAbs) * 50)}%` }}
        />
      </div>
      <span className={`w-28 text-right text-xs tabular-nums font-semibold shrink-0 ${step.val >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>{fmtK(step.val)}</span>
    </div>
  );

  const Section = ({ title, steps, subtotal, color }: { title: string; steps: CashFlowStep[]; subtotal: number; color: string }) => (
    <div className="space-y-0.5">
      <p className="text-[10px] font-bold uppercase tracking-wide" style={{ color }}>{title}</p>
      {steps.map((s, i) => <StepRow key={i} step={s} />)}
      <div className="flex items-center justify-between pt-1 mt-1 border-t border-slate-200">
        <span className="text-xs font-bold text-slate-700">{t('cf.subtotal')}</span>
        <span className={`text-sm font-black tabular-nums ${subtotal >= 0 ? 'text-emerald-700' : 'text-rose-600'}`}>{fmtK(subtotal)}</span>
      </div>
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <button
          onClick={() => onOpenAI({
            section: 'cashflow', period_p1: p1, period_p2: p2,
            cfo: cf.cfo, cfi: cf.cfi, cff: cf.cff, other: cf.other, cash_change: cf.realCashChange,
          })}
          className="inline-flex items-center gap-1 px-2 py-1 text-[10px] font-semibold text-violet-600 hover:text-violet-800 bg-violet-50 hover:bg-violet-100 border border-violet-200 hover:border-violet-300 rounded-lg transition-all"
        >🤖 Analiza AI</button>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 space-y-4">
        <div>
          <h3 className="text-sm font-bold text-slate-700">{t('cf.title')}</h3>
          <p className="text-[11px] text-slate-400">{t('cf.subtitle', { p1, p2 })}</p>
        </div>

        <Section title={t('cf.operating')} steps={cf.operating} subtotal={cf.cfo} color="#059669" />
        <Section title={t('cf.investing')} steps={cf.investing} subtotal={cf.cfi} color="#d97706" />
        <Section title={t('cf.financing')} steps={cf.financing} subtotal={cf.cff} color="#7c3aed" />

        <div className="space-y-0.5">
          <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">{t('cf.other')}</p>
          <StepRow step={{ label: t('cf.otherHint'), val: cf.other }} />
        </div>

        <div className="flex items-center justify-between pt-3 border-t-2 border-slate-300">
          <div>
            <span className="text-sm font-black text-slate-800">{t('cf.cashChange')}</span>
            <p className="text-[10px] text-emerald-600">✓ {t('cf.cashChangeCheck')}</p>
          </div>
          <span className={`text-lg font-black tabular-nums ${cf.realCashChange >= 0 ? 'text-emerald-700' : 'text-rose-600'}`}>{fmtK(cf.realCashChange)}</span>
        </div>

        <p className="text-[10px] text-slate-400 italic pt-1">{t('cf.disclaimer')}</p>
      </div>
    </div>
  );
}

// ── Dyskryminacyjne ───────────────────────────────────────────────────────────

// ── Discriminant model definitions ───────────────────────────────────────────

interface VarDef {
  sym: string;
  descPL: string;
  formula: string;
  get: (f: FieldMap) => number | null;
}

interface ZoneDef {
  lo: number;
  hi: number;
  label: string;
  bg: string;
  text: string;
  grade: Grade;
}

interface ModelDef {
  id: string;
  name: string;
  shortName: string;
  author: string;
  year: number;
  flag: string;
  sector: string;
  sectors?: string[];
  descPL: string;
  formula: string;
  vars: VarDef[];
  weights: number[];
  constant: number;
  zones: ZoneDef[];
  vizRange: [number, number];
}

const SECTOR_LABELS: Record<string, string> = {
  all: 'Wszystkie',
  manufacturing: 'Produkcja',
  trade: 'Handel',
  services: 'Usługi',
  construction: 'Budownictwo',
  transport: 'Transport',
  universal: 'Ogólny',
};

const DISC_MODELS: ModelDef[] = [
  {
    id: 'holda', name: 'Model Hołdy', shortName: 'Z_H', author: 'Hołda', year: 2006, flag: '🇵🇱',
    sector: 'Wszystkie branże', sectors: ['all'],
    descPL: 'Model Hołdy (2006) skalibrowany na 1 450 polskich przedsiębiorstw. Łączy płynność bieżącą, zadłużenie ogółem, rotację aktywów, rentowność aktywów (ROA%) i rotację zobowiązań krótkoterminowych. Próg klasyfikacji: Z_H = 0.',
    formula: 'Z_H = 0.605 + 0.681·X₁ − 0.0196·X₂ + 0.157·X₃ + 0.00969·X₄ + 0.000672·X₅',
    vars: [
      { sym: 'X₁', descPL: 'Płynność bieżąca (AO / ZK)', formula: 'AO / ZK', get: f => f.zobowiazaniaKrotko !== 0 ? f.aktywaObrotowe / f.zobowiazaniaKrotko : null },
      { sym: 'X₂', descPL: 'Zadłużenie ogółem × 100', formula: '(ZD+ZK)×100 / AR', get: f => f.aktywaRazem !== 0 ? (f.zobowiazaniaDlugo + f.zobowiazaniaKrotko) * 100 / f.aktywaRazem : null },
      { sym: 'X₃', descPL: 'Rotacja aktywów', formula: 'P / AR', get: f => f.aktywaRazem !== 0 ? f.przychody / f.aktywaRazem : null },
      { sym: 'X₄', descPL: 'ROA netto × 100', formula: 'ZN×100 / AR', get: f => f.aktywaRazem !== 0 ? f.zyskNetto * 100 / f.aktywaRazem : null },
      { sym: 'X₅', descPL: 'Rotacja ZK w dniach (COGS; fallback: KO)', formula: 'ZK×360 / COGS', get: f => { const c = f.cogs !== 0 ? f.cogs : f.kosztyOper; return c !== 0 ? f.zobowiazaniaKrotko * 360 / c : null; } },
    ],
    weights: [0.681, -0.0196, 0.157, 0.00969, 0.000672], constant: 0.605,
    zones: [
      { lo: -Infinity, hi: 0, label: 'Ryzyko bankructwa', bg: 'bg-red-100', text: 'text-red-700', grade: 'SŁABY' },
      { lo: 0, hi: Infinity, label: 'Brak zagrożenia', bg: 'bg-emerald-100', text: 'text-emerald-700', grade: 'DOBRY' },
    ],
    vizRange: [-2, 3],
  },
  {
    id: 'gajdka', name: 'Model Gajdki i Stosa', shortName: 'Z_GS', author: 'Gajdka & Stos', year: 1996, flag: '🇵🇱',
    sector: 'Spółki produkcyjne (GPW)', sectors: ['manufacturing'],
    descPL: 'Model Gajdki i Stosa (1996) skalibrowany na spółkach produkcyjnych notowanych na GPW w Warszawie. Uwzględnia rotację aktywów, obrót zobowiązaniami krótkoterminowymi, ROA, marżę brutto i wskaźnik zadłużenia. Strefy: Z_GS > 0.45 = bezpieczna, 0–0.45 = szara strefa, < 0 = ryzyko.',
    formula: 'Z_GS = 0.7732 − 0.8565·X₁ + 0.000775·X₂ + 0.9221·X₃ + 0.6536·X₄ − 0.5947·X₅',
    vars: [
      { sym: 'X₁', descPL: 'Rotacja aktywów', formula: 'P / AR', get: f => f.aktywaRazem !== 0 ? f.przychody / f.aktywaRazem : null },
      { sym: 'X₂', descPL: 'Rotacja ZK w dniach (COGS; fallback: KO)', formula: 'ZK×360 / COGS', get: f => { const c = f.cogs !== 0 ? f.cogs : f.kosztyOper; return c !== 0 ? f.zobowiazaniaKrotko * 360 / c : null; } },
      { sym: 'X₃', descPL: 'ROA netto', formula: 'ZN / AR', get: f => f.aktywaRazem !== 0 ? f.zyskNetto / f.aktywaRazem : null },
      { sym: 'X₄', descPL: 'Marża zysku brutto', formula: 'ZB / P', get: f => f.przychody !== 0 ? f.zyskBrutto / f.przychody : null },
      { sym: 'X₅', descPL: 'Wskaźnik zadłużenia ogółem', formula: '(ZD+ZK) / AR', get: f => f.aktywaRazem !== 0 ? (f.zobowiazaniaDlugo + f.zobowiazaniaKrotko) / f.aktywaRazem : null },
    ],
    weights: [-0.8565, 0.000775, 0.9221, 0.6536, -0.5947], constant: 0.7732,
    zones: [
      { lo: -Infinity, hi: 0, label: 'Ryzyko bankructwa', bg: 'bg-red-100', text: 'text-red-700', grade: 'SŁABY' },
      { lo: 0, hi: 0.45, label: 'Szara strefa', bg: 'bg-amber-100', text: 'text-amber-700', grade: 'UWAGA' },
      { lo: 0.45, hi: Infinity, label: 'Sytuacja bezpieczna', bg: 'bg-emerald-100', text: 'text-emerald-700', grade: 'DOBRY' },
    ],
    vizRange: [-0.5, 1],
  },
  {
    id: 'prusak', name: 'Model Prusaka BP2', shortName: 'BP2', author: 'Prusak', year: 2005, flag: '🇵🇱',
    sector: 'Przedsiębiorstwa niefinansowe', sectors: ['all', 'universal'],
    descPL: 'Model BP2 Prusaka (2005) łączy zdolność obsługi długu z przepływów pieniężnych, rotację ZK przychodami oraz rentowność pasywów ze sprzedaży. Próg: W = 0. Poprawiona formuła: X₂ = Przychody/ZK (nie koszty operacyjne).',
    formula: 'W = 1.4383·X₁ + 0.1878·X₂ + 5.0229·X₃ − 1.8713',
    vars: [
      { sym: 'X₁', descPL: 'CF / Zobowiązania ogółem', formula: '(ZN+Am)/(ZD+ZK)', get: f => { const d = f.zobowiazaniaDlugo + f.zobowiazaniaKrotko; return d !== 0 ? (f.zyskNetto + f.amortyzacja) / d : null; } },
      { sym: 'X₂', descPL: 'Przychody / Zobowiązania krótkoterminowe', formula: 'P / ZK', get: f => f.zobowiazaniaKrotko !== 0 ? f.przychody / f.zobowiazaniaKrotko : null },
      { sym: 'X₃', descPL: 'Zysk ze sprzedaży / Pasywa ogółem', formula: 'ZSp / AR', get: f => f.pasywaBilans !== 0 ? f.zyskZeSprz / f.pasywaBilans : null },
    ],
    weights: [1.4383, 0.1878, 5.0229], constant: -1.8713,
    zones: [
      { lo: -Infinity, hi: 0, label: 'Ryzyko bankructwa', bg: 'bg-red-100', text: 'text-red-700', grade: 'SŁABY' },
      { lo: 0, hi: Infinity, label: 'Sytuacja bezpieczna', bg: 'bg-emerald-100', text: 'text-emerald-700', grade: 'DOBRY' },
    ],
    vizRange: [-4, 5],
  },
  {
    id: 'poznanska', name: 'Model Poznańskiej', shortName: 'Z_HCP', author: 'Hołda, Cebrowski, Poznańska', year: 1998, flag: '🇵🇱',
    sector: 'Sektor handlowy i produkcyjny', sectors: ['manufacturing', 'trade'],
    descPL: 'Model Z_HCP (1998) ocenia kondycję przez ROA netto, płynność szybką, stopień samofinansowania i rentowność sprzedaży. Próg: Z_HCP = 0.',
    formula: 'Z_HCP = 3.562·X₁ + 1.588·X₂ + 4.288·X₃ + 6.719·X₄ − 2.368',
    vars: [
      { sym: 'X₁', descPL: 'ROA netto', formula: 'ZN / AR', get: f => f.pasywaBilans !== 0 ? f.zyskNetto / f.pasywaBilans : null },
      { sym: 'X₂', descPL: 'Płynność szybka', formula: '(AO−Z)/ZK', get: f => f.zobowiazaniaKrotko !== 0 ? (f.aktywaObrotowe - f.zapasy) / f.zobowiazaniaKrotko : null },
      { sym: 'X₃', descPL: 'Stopa samofinansowania', formula: 'KW / AR', get: f => f.pasywaBilans !== 0 ? f.kapitalWlasny / f.pasywaBilans : null },
      { sym: 'X₄', descPL: 'ROS ze sprzedaży', formula: 'ZSp / P', get: f => f.przychody !== 0 ? f.zyskZeSprz / f.przychody : null },
    ],
    weights: [3.562, 1.588, 4.288, 6.719], constant: -2.368,
    zones: [
      { lo: -Infinity, hi: 0, label: 'Ryzyko bankructwa', bg: 'bg-red-100', text: 'text-red-700', grade: 'SŁABY' },
      { lo: 0, hi: Infinity, label: 'Sytuacja bezpieczna', bg: 'bg-emerald-100', text: 'text-emerald-700', grade: 'DOBRY' },
    ],
    vizRange: [-4, 8],
  },
  {
    id: 'maczynska', name: 'Model Mączyńskiej', shortName: 'E_M', author: 'Mączyńska', year: 1994, flag: '🇵🇱',
    sector: 'Przedsiębiorstwa produkcyjne', sectors: ['manufacturing', 'universal'],
    descPL: 'Sześcioczynnikowy model Mączyńskiej (1994). Ocenia firmę na skali ciągłej: E_M > 9 = dobra kondycja, 6–9 = średnia, 3–6 = zła, < 3 = zagrożenie bankructwem.',
    formula: 'E_M = 1.5·X₁ + 0.08·X₂ + 10·X₃ + 5·X₄ + 0.3·X₅ + 0.1·X₆',
    vars: [
      { sym: 'X₁', descPL: 'Zdolność obsługi długu', formula: '(ZB+Am)/(ZD+ZK)', get: f => { const d = f.zobowiazaniaDlugo + f.zobowiazaniaKrotko; return d !== 0 ? (f.zyskBrutto + f.amortyzacja) / d : null; } },
      { sym: 'X₂', descPL: 'Niezależność finansowa', formula: 'AR/(ZD+ZK)', get: f => { const d = f.zobowiazaniaDlugo + f.zobowiazaniaKrotko; return d !== 0 ? f.pasywaBilans / d : null; } },
      { sym: 'X₃', descPL: 'ROA brutto', formula: 'ZB / AR', get: f => f.pasywaBilans !== 0 ? f.zyskBrutto / f.pasywaBilans : null },
      { sym: 'X₄', descPL: 'Marża brutto', formula: 'ZB / P', get: f => f.przychody !== 0 ? f.zyskBrutto / f.przychody : null },
      { sym: 'X₅', descPL: 'Intensywność zapasów', formula: 'Z / P', get: f => f.przychody !== 0 ? f.zapasy / f.przychody : null },
      { sym: 'X₆', descPL: 'Rotacja aktywów', formula: 'P / AR', get: f => f.aktywaRazem !== 0 ? f.przychody / f.aktywaRazem : null },
    ],
    weights: [1.5, 0.08, 10, 5, 0.3, 0.1], constant: 0,
    zones: [
      { lo: -Infinity, hi: 3, label: '< 3 Zagrożenie', bg: 'bg-red-100', text: 'text-red-700', grade: 'SŁABY' },
      { lo: 3, hi: 6, label: '3–6 Zła kondycja', bg: 'bg-orange-100', text: 'text-orange-700', grade: 'SŁABY' },
      { lo: 6, hi: 9, label: '6–9 Średnia', bg: 'bg-amber-100', text: 'text-amber-700', grade: 'UWAGA' },
      { lo: 9, hi: Infinity, label: '> 9 Dobra kondycja', bg: 'bg-emerald-100', text: 'text-emerald-700', grade: 'DOBRY' },
    ],
    vizRange: [0, 12],
  },
  {
    id: 'jagiello', name: 'Model Jagiełły (handel)', shortName: 'Z_J', author: 'Jagiełło', year: 2003, flag: '🇵🇱',
    sector: 'Sektor handlowy', sectors: ['trade'],
    descPL: 'Model Jagiełły (2003) dedykowany sektorowi handlowemu. Łączy płynność gotówkową, strukturę finansowania, rotację aktywów i niezależność finansową. Próg: Z_J = 0.',
    formula: 'Z_J = −3.237 + 3.638·X₁ + 2.473·X₂ + 0.479·X₃ + 0.404·X₄',
    vars: [
      { sym: 'X₁', descPL: 'Płynność gotówkowa', formula: 'SP / ZK', get: f => f.zobowiazaniaKrotko !== 0 ? f.srodkiPieniezne / f.zobowiazaniaKrotko : null },
      { sym: 'X₂', descPL: 'Netto KW / Aktywa', formula: '(KW−ZD)/AR', get: f => f.aktywaRazem !== 0 ? (f.kapitalWlasny - f.zobowiazaniaDlugo) / f.aktywaRazem : null },
      { sym: 'X₃', descPL: 'Rotacja aktywów', formula: 'P / AR', get: f => f.aktywaRazem !== 0 ? f.przychody / f.aktywaRazem : null },
      { sym: 'X₄', descPL: 'Niezależność finansowa', formula: 'KW / ZK', get: f => f.zobowiazaniaKrotko !== 0 ? f.kapitalWlasny / f.zobowiazaniaKrotko : null },
    ],
    weights: [3.638, 2.473, 0.479, 0.404], constant: -3.237,
    zones: [
      { lo: -Infinity, hi: 0, label: 'Ryzyko bankructwa', bg: 'bg-red-100', text: 'text-red-700', grade: 'SŁABY' },
      { lo: 0, hi: Infinity, label: 'Brak zagrożenia', bg: 'bg-emerald-100', text: 'text-emerald-700', grade: 'DOBRY' },
    ],
    vizRange: [-6, 4],
  },
  // ── International ──
  {
    id: 'altman_z', name: 'Altman Z-score', shortName: 'Z-score', author: 'Altman', year: 1968, flag: '🇺🇸',
    sector: 'Spółki produkcyjne (NYSE)', sectors: ['manufacturing'],
    descPL: 'Pionierski model Altmana (1968) skalibrowany na 66 spółkach produkcyjnych z NYSE. Strefy: Z > 2.99 = bezpieczna, 1.81–2.99 = szara strefa, Z < 1.81 = zagrożenie. Uwaga: X₄ wymaga rynkowej wartości KW — tutaj użyto wartości księgowej.',
    formula: 'Z = 1.2·X₁ + 1.4·X₂ + 3.3·X₃ + 0.6·X₄ + 1.0·X₅',
    vars: [
      { sym: 'X₁', descPL: 'Kapitał obrotowy netto / Aktywa ogółem', formula: '(AO−ZK)/AR', get: f => f.aktywaRazem !== 0 ? (f.aktywaObrotowe - f.zobowiazaniaKrotko) / f.aktywaRazem : null },
      { sym: 'X₂', descPL: 'Zyski zatrzymane / Aktywa (proxy: KW/AR)', formula: 'KW / AR', get: f => f.aktywaRazem !== 0 ? f.kapitalWlasny / f.aktywaRazem : null },
      { sym: 'X₃', descPL: 'EBIT / Aktywa ogółem (ROA operacyjny)', formula: 'EBIT / AR', get: f => f.aktywaRazem !== 0 ? f.ebit / f.aktywaRazem : null },
      { sym: 'X₄', descPL: 'KW / Zobowiązania ogółem (wartość ks.)', formula: 'KW/(ZD+ZK)', get: f => { const d = f.zobowiazaniaDlugo + f.zobowiazaniaKrotko; return d !== 0 ? f.kapitalWlasny / d : null; } },
      { sym: 'X₅', descPL: 'Przychody / Aktywa ogółem (rotacja aktywów)', formula: 'P / AR', get: f => f.aktywaRazem !== 0 ? f.przychody / f.aktywaRazem : null },
    ],
    weights: [1.2, 1.4, 3.3, 0.6, 1.0], constant: 0,
    zones: [
      { lo: -Infinity, hi: 1.81, label: '< 1.81 Niebezpieczeństwo', bg: 'bg-red-100', text: 'text-red-700', grade: 'SŁABY' },
      { lo: 1.81, hi: 2.99, label: '1.81–2.99 Szara strefa', bg: 'bg-amber-100', text: 'text-amber-700', grade: 'UWAGA' },
      { lo: 2.99, hi: Infinity, label: '> 2.99 Strefa bezpieczna', bg: 'bg-emerald-100', text: 'text-emerald-700', grade: 'DOBRY' },
    ],
    vizRange: [0, 5],
  },
  {
    id: 'altman_zprime', name: "Altman Z'-score (niepubliczne)", shortName: "Z'-score", author: 'Altman', year: 1983, flag: '🇺🇸',
    sector: 'Spółki niepubliczne (private)', sectors: ['universal', 'services'],
    descPL: "Rewizja modelu Altmana z 1983 roku dla spółek niepublicznych — X₄ oparty na wartości księgowej KW zamiast rynkowej, inne wagi. Strefy: Z' > 2.9 = bezpieczna, 1.23–2.9 = szara strefa, Z' < 1.23 = zagrożenie.",
    formula: "Z' = 0.717·X₁ + 0.847·X₂ + 3.107·X₃ + 0.420·X₄ + 0.998·X₅",
    vars: [
      { sym: 'X₁', descPL: 'Kapitał obrotowy netto / Aktywa ogółem', formula: '(AO−ZK)/AR', get: f => f.aktywaRazem !== 0 ? (f.aktywaObrotowe - f.zobowiazaniaKrotko) / f.aktywaRazem : null },
      { sym: 'X₂', descPL: 'Zyski zatrzymane / Aktywa (proxy: KW/AR)', formula: 'KW / AR', get: f => f.aktywaRazem !== 0 ? f.kapitalWlasny / f.aktywaRazem : null },
      { sym: 'X₃', descPL: 'EBIT / Aktywa ogółem (ROA operacyjny)', formula: 'EBIT / AR', get: f => f.aktywaRazem !== 0 ? f.ebit / f.aktywaRazem : null },
      { sym: 'X₄', descPL: 'Wartość ks. KW / Zobowiązania ogółem', formula: 'KW/(ZD+ZK)', get: f => { const d = f.zobowiazaniaDlugo + f.zobowiazaniaKrotko; return d !== 0 ? f.kapitalWlasny / d : null; } },
      { sym: 'X₅', descPL: 'Przychody / Aktywa ogółem (rotacja aktywów)', formula: 'P / AR', get: f => f.aktywaRazem !== 0 ? f.przychody / f.aktywaRazem : null },
    ],
    weights: [0.717, 0.847, 3.107, 0.420, 0.998], constant: 0,
    zones: [
      { lo: -Infinity, hi: 1.23, label: '< 1.23 Niebezpieczeństwo', bg: 'bg-red-100', text: 'text-red-700', grade: 'SŁABY' },
      { lo: 1.23, hi: 2.9, label: '1.23–2.9 Szara strefa', bg: 'bg-amber-100', text: 'text-amber-700', grade: 'UWAGA' },
      { lo: 2.9, hi: Infinity, label: '> 2.9 Strefa bezpieczna', bg: 'bg-emerald-100', text: 'text-emerald-700', grade: 'DOBRY' },
    ],
    vizRange: [0, 5],
  },
  {
    id: 'springate', name: 'Model Springate', shortName: 'S-score', author: 'Springate', year: 1978, flag: '🇨🇦',
    sector: 'Spółki produkcyjne', sectors: ['manufacturing'],
    descPL: 'Model Springate (1978) skalibrowany na 40 kanadyjskich spółkach produkcyjnych (Simon Fraser University). Uproszczona wersja modelu Altmana z 4 zmiennymi. Próg: S > 0.862 = brak zagrożenia, S ≤ 0.862 = ryzyko bankructwa.',
    formula: 'S = 1.03·X₁ + 3.07·X₂ + 0.66·X₃ + 0.4·X₄',
    vars: [
      { sym: 'X₁', descPL: 'Kapitał obrotowy netto / Aktywa ogółem', formula: '(AO−ZK)/AR', get: f => f.aktywaRazem !== 0 ? (f.aktywaObrotowe - f.zobowiazaniaKrotko) / f.aktywaRazem : null },
      { sym: 'X₂', descPL: 'EBIT / Aktywa ogółem (ROA operacyjny)', formula: 'EBIT / AR', get: f => f.aktywaRazem !== 0 ? f.ebit / f.aktywaRazem : null },
      { sym: 'X₃', descPL: 'Zysk brutto / Zobowiązania krótkoterminowe', formula: 'ZB / ZK', get: f => f.zobowiazaniaKrotko !== 0 ? f.zyskBrutto / f.zobowiazaniaKrotko : null },
      { sym: 'X₄', descPL: 'Przychody / Aktywa ogółem (rotacja aktywów)', formula: 'P / AR', get: f => f.aktywaRazem !== 0 ? f.przychody / f.aktywaRazem : null },
    ],
    weights: [1.03, 3.07, 0.66, 0.4], constant: 0,
    zones: [
      { lo: -Infinity, hi: 0.862, label: '< 0.862 Ryzyko bankructwa', bg: 'bg-red-100', text: 'text-red-700', grade: 'SŁABY' },
      { lo: 0.862, hi: Infinity, label: '≥ 0.862 Brak zagrożenia', bg: 'bg-emerald-100', text: 'text-emerald-700', grade: 'DOBRY' },
    ],
    vizRange: [-0.5, 3],
  },
  {
    id: 'taffler', name: 'Model Tafflera', shortName: 'T-score', author: 'Taffler', year: 1983, flag: '🇬🇧',
    sector: 'Spółki produkcyjne (LSE)', sectors: ['manufacturing'],
    descPL: 'Model Tafflera (1983) skalibrowany na 92 brytyjskich spółkach giełdowych (London Stock Exchange). X₄ = interwał braku kredytu jako ułamek rocznych gotówkowych kosztów operacyjnych. Próg: T > 0.2 = bezpieczna, 0–0.2 = ryzyko, T < 0 = zagrożenie.',
    formula: 'T = 0.53·X₁ + 0.13·X₂ + 0.18·X₃ + 0.16·X₄',
    vars: [
      { sym: 'X₁', descPL: 'Zysk brutto / Zobowiązania krótkoterminowe', formula: 'ZB / ZK', get: f => f.zobowiazaniaKrotko !== 0 ? f.zyskBrutto / f.zobowiazaniaKrotko : null },
      { sym: 'X₂', descPL: 'Aktywa obrotowe / Zobowiązania ogółem', formula: 'AO/(ZD+ZK)', get: f => { const d = f.zobowiazaniaDlugo + f.zobowiazaniaKrotko; return d !== 0 ? f.aktywaObrotowe / d : null; } },
      { sym: 'X₃', descPL: 'Zobowiązania krótkoterminowe / Aktywa ogółem', formula: 'ZK / AR', get: f => f.aktywaRazem !== 0 ? f.zobowiazaniaKrotko / f.aktywaRazem : null },
      { sym: 'X₄', descPL: 'Interwał braku kredytu (płynne AR − ZK) / roczne koszty gotówkowe', formula: '(SP+Nał−ZK)/(KO−Am)', get: f => { const c = f.kosztyOper - f.amortyzacja; return c > 0 ? (f.srodkiPieniezne + f.naleznosci - f.zobowiazaniaKrotko) / c : null; } },
    ],
    weights: [0.53, 0.13, 0.18, 0.16], constant: 0,
    zones: [
      { lo: -Infinity, hi: 0, label: '< 0 Zagrożenie', bg: 'bg-red-100', text: 'text-red-700', grade: 'SŁABY' },
      { lo: 0, hi: 0.2, label: '0–0.2 Ryzyko', bg: 'bg-amber-100', text: 'text-amber-700', grade: 'UWAGA' },
      { lo: 0.2, hi: Infinity, label: '> 0.2 Bezpieczna', bg: 'bg-emerald-100', text: 'text-emerald-700', grade: 'DOBRY' },
    ],
    vizRange: [-0.3, 0.7],
  },
  // ── Nowe modele PL (Hadasik, Jagiełło MSP sektorowe) ──
  {
    id: 'hadasik', name: 'Model Hadasik', shortName: 'W_H', author: 'Hadasik', year: 1998, flag: '🇵🇱',
    sector: 'Przedsiębiorstwa przemysłowe', sectors: ['manufacturing'],
    descPL: 'Model D. Hadasik (1998) opracowany na polskich firmach przemysłowych. Kładzie nacisk na strukturę kapitałową (autonomię finansową), rentowność aktywów i kapitału własnego oraz marżę brutto. Próg klasyfikacji: W_H = 0. Źródło: Hadasik D., „Upadłość przedsiębiorstw w Polsce i metody jej prognozowania", ZN AE Poznań 1998.',
    formula: 'W_H = 1.38·X₁ − 0.028·X₂ + 0.121·X₃ + 0.014·X₄ + 0.624',
    vars: [
      { sym: 'X₁', descPL: 'Stopień autonomii finansowej (KW/AT)', formula: 'KW / AT', get: f => f.aktywaRazem !== 0 ? f.kapitalWlasny / f.aktywaRazem : null },
      { sym: 'X₂', descPL: 'Zadłużenie ogółem × 100 (%)', formula: '(ZD+ZK)×100/AT', get: f => f.aktywaRazem !== 0 ? (f.zobowiazaniaDlugo + f.zobowiazaniaKrotko) * 100 / f.aktywaRazem : null },
      { sym: 'X₃', descPL: 'ROA netto (ZN/AT)', formula: 'ZN / AT', get: f => f.aktywaRazem !== 0 ? f.zyskNetto / f.aktywaRazem : null },
      { sym: 'X₄', descPL: 'ROE netto (ZN/KW)', formula: 'ZN / KW', get: f => f.kapitalWlasny !== 0 ? f.zyskNetto / f.kapitalWlasny : null },
    ],
    weights: [1.38, -0.028, 0.121, 0.014], constant: 0.624,
    zones: [
      { lo: -Infinity, hi: 0, label: 'Ryzyko bankructwa', bg: 'bg-red-100', text: 'text-red-700', grade: 'SŁABY' },
      { lo: 0, hi: Infinity, label: 'Brak zagrożenia', bg: 'bg-emerald-100', text: 'text-emerald-700', grade: 'DOBRY' },
    ],
    vizRange: [-1.5, 3],
  },
  {
    id: 'jagiello_uslugi', name: 'Model Jagiełły (usługi)', shortName: 'Z_J·S', author: 'Jagiełło', year: 2004, flag: '🇵🇱',
    sector: 'MSP usługowe', sectors: ['services'],
    descPL: 'Wariant modelu Jagiełły (2004) skalibrowany dla małych i średnich firm usługowych. Kładzie większy nacisk na marże i rentowność niż na rotacje zapasów. Rekomendowany dla firm consultingowych, IT i serwisowych. Próg: Z_J·S = 0. Źródło: Jagiełło R., „Analiza dyskryminacyjna i regresja logistyczna w procesie oceny zdolności kredytowej przedsiębiorstw" (2004).',
    formula: 'Z_J·S = −3.102 + 3.512·X₁ + 2.341·X₂ + 0.536·X₃ + 0.431·X₄',
    vars: [
      { sym: 'X₁', descPL: 'Płynność gotówkowa (SP / ZK)', formula: 'SP / ZK', get: f => f.zobowiazaniaKrotko !== 0 ? f.srodkiPieniezne / f.zobowiazaniaKrotko : null },
      { sym: 'X₂', descPL: 'Netto KW / Aktywa', formula: '(KW−ZD)/AR', get: f => f.aktywaRazem !== 0 ? (f.kapitalWlasny - f.zobowiazaniaDlugo) / f.aktywaRazem : null },
      { sym: 'X₃', descPL: 'Rotacja aktywów', formula: 'P / AR', get: f => f.aktywaRazem !== 0 ? f.przychody / f.aktywaRazem : null },
      { sym: 'X₄', descPL: 'Niezależność finansowa (KW/ZK)', formula: 'KW / ZK', get: f => f.zobowiazaniaKrotko !== 0 ? f.kapitalWlasny / f.zobowiazaniaKrotko : null },
    ],
    weights: [3.512, 2.341, 0.536, 0.431], constant: -3.102,
    zones: [
      { lo: -Infinity, hi: 0, label: 'Ryzyko bankructwa', bg: 'bg-red-100', text: 'text-red-700', grade: 'SŁABY' },
      { lo: 0, hi: Infinity, label: 'Brak zagrożenia', bg: 'bg-emerald-100', text: 'text-emerald-700', grade: 'DOBRY' },
    ],
    vizRange: [-5, 5],
  },
  {
    id: 'jagiello_przemysl', name: 'Model Jagiełły (przemysł)', shortName: 'Z_J·M', author: 'Jagiełło', year: 2004, flag: '🇵🇱',
    sector: 'MSP przemysłowe', sectors: ['manufacturing'],
    descPL: 'Wariant modelu Jagiełły (2004) dla małych i średnich firm przemysłowych. Akcentuje strukturę aktywów i zdolność obsługi zadłużenia typową dla branży produkcyjnej. Próg: Z_J·M = 0. Źródło: Jagiełło R., „Analiza dyskryminacyjna i regresja logistyczna w procesie oceny zdolności kredytowej przedsiębiorstw" (2004).',
    formula: 'Z_J·M = −3.178 + 2.974·X₁ + 2.581·X₂ + 0.453·X₃ + 0.372·X₄',
    vars: [
      { sym: 'X₁', descPL: 'Płynność gotówkowa (SP / ZK)', formula: 'SP / ZK', get: f => f.zobowiazaniaKrotko !== 0 ? f.srodkiPieniezne / f.zobowiazaniaKrotko : null },
      { sym: 'X₂', descPL: 'Netto KW / Aktywa', formula: '(KW−ZD)/AR', get: f => f.aktywaRazem !== 0 ? (f.kapitalWlasny - f.zobowiazaniaDlugo) / f.aktywaRazem : null },
      { sym: 'X₃', descPL: 'Rotacja aktywów', formula: 'P / AR', get: f => f.aktywaRazem !== 0 ? f.przychody / f.aktywaRazem : null },
      { sym: 'X₄', descPL: 'Niezależność finansowa (KW/ZK)', formula: 'KW / ZK', get: f => f.zobowiazaniaKrotko !== 0 ? f.kapitalWlasny / f.zobowiazaniaKrotko : null },
    ],
    weights: [2.974, 2.581, 0.453, 0.372], constant: -3.178,
    zones: [
      { lo: -Infinity, hi: 0, label: 'Ryzyko bankructwa', bg: 'bg-red-100', text: 'text-red-700', grade: 'SŁABY' },
      { lo: 0, hi: Infinity, label: 'Brak zagrożenia', bg: 'bg-emerald-100', text: 'text-emerald-700', grade: 'DOBRY' },
    ],
    vizRange: [-5, 5],
  },
  {
    id: 'jagiello_budownictwo', name: 'Model Jagiełły (budownictwo)', shortName: 'Z_J·B', author: 'Jagiełło', year: 2004, flag: '🇵🇱',
    sector: 'MSP budowlane', sectors: ['construction'],
    descPL: 'Wariant modelu Jagiełły (2004) dla firm budowlanych MSP. Duży nacisk na płynność bieżącą i krótkoterminowe zadłużenie — kluczowe ryzyka przy długich cyklach realizacji kontraktów. Próg: Z_J·B = 0. Źródło: Jagiełło R. (2004).',
    formula: 'Z_J·B = −3.067 + 4.124·X₁ + 2.183·X₂ + 0.338·X₃ + 0.267·X₄',
    vars: [
      { sym: 'X₁', descPL: 'Płynność gotówkowa (SP / ZK)', formula: 'SP / ZK', get: f => f.zobowiazaniaKrotko !== 0 ? f.srodkiPieniezne / f.zobowiazaniaKrotko : null },
      { sym: 'X₂', descPL: 'Netto KW / Aktywa', formula: '(KW−ZD)/AR', get: f => f.aktywaRazem !== 0 ? (f.kapitalWlasny - f.zobowiazaniaDlugo) / f.aktywaRazem : null },
      { sym: 'X₃', descPL: 'Rotacja aktywów', formula: 'P / AR', get: f => f.aktywaRazem !== 0 ? f.przychody / f.aktywaRazem : null },
      { sym: 'X₄', descPL: 'Niezależność finansowa (KW/ZK)', formula: 'KW / ZK', get: f => f.zobowiazaniaKrotko !== 0 ? f.kapitalWlasny / f.zobowiazaniaKrotko : null },
    ],
    weights: [4.124, 2.183, 0.338, 0.267], constant: -3.067,
    zones: [
      { lo: -Infinity, hi: 0, label: 'Ryzyko bankructwa', bg: 'bg-red-100', text: 'text-red-700', grade: 'SŁABY' },
      { lo: 0, hi: Infinity, label: 'Brak zagrożenia', bg: 'bg-emerald-100', text: 'text-emerald-700', grade: 'DOBRY' },
    ],
    vizRange: [-5, 5],
  },
  {
    id: 'jagiello_transport', name: 'Model Jagiełły (transport)', shortName: 'Z_J·T', author: 'Jagiełło', year: 2004, flag: '🇵🇱',
    sector: 'MSP transportowe', sectors: ['transport'],
    descPL: 'Wariant modelu Jagiełły (2004) dla firm transportowych i logistycznych. Uwzględnia kapitałochłonność i dźwignię operacyjną typową dla branży transportowej — wyższy nacisk na rotację aktywów. Próg: Z_J·T = 0. Źródło: Jagiełło R. (2004).',
    formula: 'Z_J·T = −3.204 + 3.218·X₁ + 2.412·X₂ + 0.617·X₃ + 0.315·X₄',
    vars: [
      { sym: 'X₁', descPL: 'Płynność gotówkowa (SP / ZK)', formula: 'SP / ZK', get: f => f.zobowiazaniaKrotko !== 0 ? f.srodkiPieniezne / f.zobowiazaniaKrotko : null },
      { sym: 'X₂', descPL: 'Netto KW / Aktywa', formula: '(KW−ZD)/AR', get: f => f.aktywaRazem !== 0 ? (f.kapitalWlasny - f.zobowiazaniaDlugo) / f.aktywaRazem : null },
      { sym: 'X₃', descPL: 'Rotacja aktywów', formula: 'P / AR', get: f => f.aktywaRazem !== 0 ? f.przychody / f.aktywaRazem : null },
      { sym: 'X₄', descPL: 'Niezależność finansowa (KW/ZK)', formula: 'KW / ZK', get: f => f.zobowiazaniaKrotko !== 0 ? f.kapitalWlasny / f.zobowiazaniaKrotko : null },
    ],
    weights: [3.218, 2.412, 0.617, 0.315], constant: -3.204,
    zones: [
      { lo: -Infinity, hi: 0, label: 'Ryzyko bankructwa', bg: 'bg-red-100', text: 'text-red-700', grade: 'SŁABY' },
      { lo: 0, hi: Infinity, label: 'Brak zagrożenia', bg: 'bg-emerald-100', text: 'text-emerald-700', grade: 'DOBRY' },
    ],
    vizRange: [-5, 5],
  },
];

function computeScore(def: ModelDef, f: FieldMap): { score: number | null; varVals: (number | null)[] } {
  const varVals = def.vars.map(v => v.get(f));
  if (varVals.some(v => v === null)) return { score: null, varVals };
  const s = def.constant + def.weights.reduce((acc, w, i) => acc + w * (varVals[i] as number), 0);
  return { score: isFinite(s) ? s : null, varVals };
}

function findZone(def: ModelDef, score: number | null): ZoneDef | null {
  if (score === null || !isFinite(score)) return null;
  for (let i = def.zones.length - 1; i >= 0; i--) {
    if (score >= def.zones[i].lo) return def.zones[i];
  }
  return def.zones[0];
}

function scoreGrade(def: ModelDef, score: number | null): Grade {
  return findZone(def, score)?.grade ?? 'BRAK';
}

function ZoneBar({ def, scores, labels }: { def: ModelDef; scores: (number | null)[]; labels: string[] }) {
  const [vizMin, vizMax] = def.vizRange;
  const range = vizMax - vizMin;
  if (range === 0) return null;
  const pct = (v: number) => Math.max(0, Math.min(100, ((Math.max(vizMin, Math.min(vizMax, v)) - vizMin) / range) * 100));
  return (
    <div className="mt-2">
      <div className="relative h-4 rounded-full overflow-hidden bg-slate-100 shadow-inner">
        {def.zones.map((z, i) => {
          const lo = z.lo === -Infinity ? vizMin : z.lo;
          const hi = z.hi === Infinity ? vizMax : z.hi;
          const cLo = Math.max(vizMin, lo); const cHi = Math.min(vizMax, hi);
          if (cHi <= cLo) return null;
          return <div key={i} className={`absolute top-0 h-full ${z.bg}`} style={{ left: `${pct(cLo)}%`, width: `${pct(cHi) - pct(cLo)}%` }} />;
        })}
        {def.zones.slice(1).map((z, i) => {
          if (z.lo <= vizMin || z.lo >= vizMax) return null;
          return <div key={i} className="absolute top-0 w-px h-full bg-white/70 z-[1]" style={{ left: `${pct(z.lo)}%` }} />;
        })}
        {scores.map((s, i) => {
          if (s === null || !isFinite(s)) return null;
          const sizes = ['w-2', 'w-1.5', 'w-1'];
          const opac  = ['opacity-100', 'opacity-55', 'opacity-35'];
          return <div key={i} className={`absolute top-0 h-full ${sizes[i]??'w-1'} bg-slate-900 rounded-full shadow-md z-10 ${opac[i]??'opacity-20'}`} style={{ left: `${pct(s)}%`, transform: 'translateX(-50%)' }} />;
        })}
      </div>
      <div className="relative h-3.5 mt-0.5">
        {def.zones.slice(1).map((z, i) => {
          if (z.lo <= vizMin || z.lo >= vizMax) return null;
          return <span key={i} className="absolute text-[9px] text-slate-500 -translate-x-1/2" style={{ left: `${pct(z.lo)}%` }}>{z.lo}</span>;
        })}
        <span className="absolute left-0 text-[9px] text-slate-400">{vizMin}</span>
        <span className="absolute right-0 text-[9px] text-slate-400">{vizMax}</span>
      </div>
      <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1">
        {scores.map((s, i) => {
          if (s === null) return null;
          const z = findZone(def, s);
          return (
            <span key={i} className={`text-[10px] font-mono ${i > 0 ? 'opacity-60' : ''}`}>
              <span className="font-semibold text-slate-600">{labels[i]}:</span>{' '}
              <span className={`font-bold ${z?.text ?? 'text-slate-400'}`}>{isFinite(s) ? s.toFixed(3) : '—'}</span>
              {z && <span className={`ml-1 text-[8px] px-1.5 py-0.5 rounded-full font-semibold ${z.bg} ${z.text}`}>{z.label.replace(/^[<>≥≤\d.,– -]+\s+/, '')}</span>}
            </span>
          );
        })}
      </div>
    </div>
  );
}

function ModelCard({ def, f1, f2, f3, onSelect }: {
  def: ModelDef; f1: FieldMap; f2: FieldMap; f3: FieldMap | null; onSelect: () => void;
}) {
  const r1 = computeScore(def, f1);
  const r2 = computeScore(def, f2);
  const r3 = f3 ? computeScore(def, f3) : null;
  const g1 = scoreGrade(def, r1.score);
  const g2 = scoreGrade(def, r2.score);
  const g3 = r3 ? scoreGrade(def, r3.score) : null;

  const borderCls = g1 === 'B_DOBRY' ? 'border-violet-400'
    : g1 === 'DOBRY' ? 'border-emerald-300'
    : g1 === 'UWAGA' ? 'border-amber-300'
    : g1 === 'SŁABY' ? 'border-red-300'
    : 'border-slate-200';
  const scoreColor = g1 === 'B_DOBRY' ? 'text-violet-700'
    : g1 === 'DOBRY' ? 'text-emerald-700'
    : g1 === 'UWAGA' ? 'text-amber-700'
    : g1 === 'SŁABY' ? 'text-red-700'
    : 'text-slate-300';
  const rowBg = g1 === 'B_DOBRY' ? 'bg-violet-50/40'
    : g1 === 'DOBRY' ? 'bg-emerald-50/40'
    : g1 === 'UWAGA' ? 'bg-amber-50/40'
    : g1 === 'SŁABY' ? 'bg-red-50/40'
    : 'bg-white';

  const dotColor = (g: Grade) => g === 'B_DOBRY' ? 'bg-violet-500' : g === 'DOBRY' ? 'bg-emerald-500' : g === 'UWAGA' ? 'bg-amber-500' : g === 'SŁABY' ? 'bg-red-500' : 'bg-slate-300';

  const trendGrades = f3 && r3
    ? [g3!, g2, g1]
    : [g2, g1];

  return (
    <button
      onClick={onSelect}
      className={`w-full text-left rounded-lg border-l-4 border-r border-t border-b shadow-sm overflow-hidden transition-all hover:shadow-md hover:brightness-95 active:scale-[0.99] ${borderCls} ${rowBg} bg-white`}
    >
      <div className="px-3 py-2.5 flex items-center gap-2">
        <span className="text-base leading-none shrink-0">{def.flag}</span>
        <div className="flex-1 min-w-0">
          <div className="text-xs font-bold text-slate-800 leading-tight truncate">{def.name}</div>
          <div className="flex items-center gap-1 mt-0.5">
            <code className="text-[9px] bg-slate-100 text-slate-500 px-1 rounded font-mono">{def.shortName}</code>
            <span className="text-[9px] text-slate-400">{def.year}</span>
          </div>
        </div>
        <div className="shrink-0 text-right">
          <div className={`font-mono font-black text-lg tabular-nums leading-tight ${scoreColor}`}>
            {r1.score !== null && isFinite(r1.score) ? r1.score.toFixed(2) : '—'}
          </div>
          <div className="flex items-center gap-0.5 justify-end mt-0.5">
            {trendGrades.map((g, i) => (
              <span key={i} className={`w-1.5 h-1.5 rounded-full ${dotColor(g)} ${i < trendGrades.length - 1 ? 'opacity-40' : ''}`} />
            ))}
          </div>
        </div>
        <div className="shrink-0">
          <Badge g={g1} />
        </div>
      </div>
    </button>
  );
}

function ModelDrawer({ def, f1, f2, f3, labels, onClose }: {
  def: ModelDef; f1: FieldMap; f2: FieldMap; f3: FieldMap | null; labels: string[]; onClose: () => void;
}) {
  const r1 = computeScore(def, f1);
  const r2 = computeScore(def, f2);
  const r3 = f3 ? computeScore(def, f3) : null;
  const scores = [r1.score, r2.score, r3?.score ?? null] as (number | null)[];
  const g1 = scoreGrade(def, r1.score);
  const fmtV = (v: number | null) => {
    if (v === null || !isFinite(v)) return '—';
    const a = Math.abs(v);
    return a >= 100 ? v.toFixed(1) : a >= 10 ? v.toFixed(2) : v.toFixed(4);
  };

  return (
    <div className="fixed inset-0 z-50 flex" onClick={onClose}>
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
      <div
        className="relative ml-auto w-full max-w-2xl bg-white shadow-2xl flex flex-col overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-start gap-3 px-5 py-4 border-b border-slate-200 bg-slate-50 shrink-0">
          <span className="text-2xl mt-0.5">{def.flag}</span>
          <div className="flex-1 min-w-0">
            <div className="font-bold text-slate-800 text-base leading-tight">{def.name}</div>
            <div className="text-xs text-slate-500 mt-0.5">
              <code className="bg-slate-200 text-slate-700 px-1.5 py-0.5 rounded font-mono">{def.shortName}</code>
              {' '}{def.author}, {def.year}
            </div>
            <div className="text-[10px] text-slate-400 mt-0.5">{def.sector}</div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-700 text-2xl font-bold leading-none w-8 h-8 flex items-center justify-center rounded-lg hover:bg-slate-200 transition-colors shrink-0"
          >×</button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          <div>
            <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide mb-1.5">Opis metody</div>
            <p className="text-xs text-slate-600 leading-relaxed">{def.descPL}</p>
          </div>
          <div>
            <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide mb-1.5">Formuła</div>
            <code className="text-xs text-slate-700 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2.5 block font-mono leading-relaxed">{def.formula}</code>
          </div>
          <ZoneBar def={def} scores={scores} labels={labels} />
          <div>
            <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide mb-1.5">Zmienne i obliczenia</div>
            <div className="overflow-x-auto rounded-lg border border-slate-200">
              <table className="w-full text-xs border-collapse bg-white">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200">
                    <th className="text-left px-2 py-1.5 text-[10px] font-semibold text-slate-500 w-10">Sym.</th>
                    <th className="text-left px-2 py-1.5 text-[10px] font-semibold text-slate-500">Definicja</th>
                    <th className="text-right px-2 py-1.5 text-[10px] font-semibold text-slate-500 w-12">Waga</th>
                    <th className="text-right px-2 py-1.5 text-[10px] font-semibold text-blue-600 w-16">{labels[0]}</th>
                    <th className="text-right px-2 py-1.5 text-[10px] font-semibold text-blue-600 w-16">×w</th>
                    <th className="text-right px-2 py-1.5 text-[10px] font-semibold text-slate-400 w-16">{labels[1]}</th>
                    {f3 && <th className="text-right px-2 py-1.5 text-[10px] font-semibold text-slate-300 w-16">{labels[2]}</th>}
                  </tr>
                </thead>
                <tbody>
                  {def.vars.map((v, i) => {
                    const v1 = r1.varVals[i]; const v2 = r2.varVals[i]; const v3 = r3?.varVals[i] ?? null;
                    const contrib = v1 !== null ? def.weights[i] * v1 : null;
                    return (
                      <tr key={v.sym} className="border-b border-slate-100 hover:bg-slate-50">
                        <td className="px-2 py-1.5 font-mono font-bold text-slate-700 text-[11px]">{v.sym}</td>
                        <td className="px-2 py-1.5">
                          <div className="text-slate-600 leading-tight">{v.descPL}</div>
                          <code className="text-[9px] text-slate-400">{v.formula}</code>
                        </td>
                        <td className="px-2 py-1.5 text-right font-mono text-slate-500 text-[11px]">{def.weights[i] > 0 ? '+' : ''}{def.weights[i]}</td>
                        <td className="px-2 py-1.5 text-right font-mono font-semibold text-blue-700">{fmtV(v1)}</td>
                        <td className="px-2 py-1.5 text-right font-mono font-semibold text-blue-700">{fmtV(contrib)}</td>
                        <td className="px-2 py-1.5 text-right font-mono text-slate-400">{fmtV(v2)}</td>
                        {f3 && <td className="px-2 py-1.5 text-right font-mono text-slate-300">{fmtV(v3)}</td>}
                      </tr>
                    );
                  })}
                  <tr className="bg-slate-50 border-t-2 border-slate-200 font-bold">
                    <td colSpan={2} className="px-2 py-2 text-xs text-slate-600">
                      Wynik{def.constant !== 0 ? ` (stała: ${def.constant > 0 ? '+' : ''}${def.constant})` : ''}
                    </td>
                    <td />
                    <td className={`px-2 py-2 text-right font-mono font-black text-base tabular-nums ${g1 === 'DOBRY' ? 'text-emerald-700' : g1 === 'UWAGA' ? 'text-amber-700' : 'text-red-700'}`}>
                      {r1.score !== null && isFinite(r1.score) ? r1.score.toFixed(3) : '—'}
                    </td>
                    <td />
                    <td className="px-2 py-2 text-right font-mono font-semibold text-slate-500">
                      {r2.score !== null && isFinite(r2.score) ? r2.score.toFixed(3) : '—'}
                    </td>
                    {f3 && <td className="px-2 py-2 text-right font-mono text-slate-400">
                      {r3 != null && r3.score != null && isFinite(r3.score) ? r3.score.toFixed(3) : '—'}
                    </td>}
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            {[
              { s: r1.score, lbl: labels[0] },
              { s: r2.score, lbl: labels[1] },
              ...(f3 && r3 ? [{ s: r3.score, lbl: labels[2] }] : []),
            ].map(({ s, lbl }) => {
              const z = findZone(def, s);
              return z ? (
                <div key={lbl} className={`rounded-lg border p-3 ${z.bg}`}>
                  <div className={`text-[10px] font-semibold uppercase tracking-wide ${z.text}`}>{lbl} · {def.shortName}</div>
                  <div className={`text-2xl font-black font-mono mt-1 tabular-nums ${z.text}`}>{s !== null && isFinite(s) ? s.toFixed(3) : '—'}</div>
                  <div className={`text-xs font-semibold mt-0.5 ${z.text}`}>{z.label}</div>
                </div>
              ) : (
                <div key={lbl} className="rounded-lg bg-slate-50 border border-slate-200 p-3 text-center">
                  <div className="text-[10px] text-slate-400 font-semibold">{lbl}</div>
                  <div className="text-slate-300 text-xl font-mono mt-1">—</div>
                  <div className="text-[10px] text-slate-400 mt-0.5">Brak danych</div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

const GRADE_ORDER: Record<Grade, number> = { 'SŁABY': 0, 'UWAGA': 1, 'DOBRY': 2, 'B_DOBRY': 3, 'BRAK': 4 };

const ALL_SECTORS = ['all', 'universal', 'manufacturing', 'trade', 'services', 'construction', 'transport'] as const;

function DyskryminacyjneTab({ f1, f2, f3, periodLabels, onOpenAI }: { f1: FieldMap; f2: FieldMap; f3: FieldMap | null; periodLabels?: string[]; onOpenAI: (data: Record<string, unknown>) => void }) {
  const pl = periodLabels ?? [];
  const labels = [pl[0] ?? 'P1', pl[1] ?? 'P2', pl[2] ?? 'P3'];
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [sectorFilter, setSectorFilter] = useState<string>('all');

  const filteredModels = useMemo(() =>
    sectorFilter === 'all'
      ? DISC_MODELS
      : DISC_MODELS.filter(m => (m.sectors ?? ['all']).includes(sectorFilter) || (m.sectors ?? []).includes('all')),
    [sectorFilter],
  );

  const modelScores = useMemo(() =>
    filteredModels.map(def => {
      const r = computeScore(def, f1);
      return { def, grade: scoreGrade(def, r.score) };
    }).sort((a, b) => GRADE_ORDER[a.grade] - GRADE_ORDER[b.grade]),
    [filteredModels, f1],
  );

  const counts = useMemo(() => {
    const c: Record<Grade, number> = { B_DOBRY: 0, DOBRY: 0, UWAGA: 0, SŁABY: 0, BRAK: 0 };
    modelScores.forEach(m => c[m.grade]++);
    return c;
  }, [modelScores]);

  const selectedDef = selectedId ? DISC_MODELS.find(d => d.id === selectedId) ?? null : null;

  const activeSectors = useMemo(() =>
    ALL_SECTORS.filter(s =>
      s === 'all' || DISC_MODELS.some(m => (m.sectors ?? ['all']).includes(s)),
    ),
    [],
  );

  return (
    <div className="space-y-3">
      {/* Filtr branży */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm px-4 py-3">
        <div className="flex items-center justify-between mb-2">
          <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide">Branża:</span>
          <button onClick={() => onOpenAI({ section: 'discriminant_models', period: labels[0], models: modelScores.map(m => { const r = computeScore(m.def, f1); return { name: m.def.name, score: r.score !== null ? Math.round(r.score * 100) / 100 : null, grade: m.grade }; }), summary: counts })} className="inline-flex items-center gap-1 px-2 py-1 text-[10px] font-semibold text-violet-600 hover:text-violet-800 bg-violet-50 hover:bg-violet-100 border border-violet-200 hover:border-violet-300 rounded-lg transition-all">🤖 Analiza AI</button>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {activeSectors.map(s => (
            <button
              key={s}
              onClick={() => setSectorFilter(s)}
              className={`px-2.5 py-1 rounded-full text-xs font-semibold transition-all ${
                sectorFilter === s
                  ? 'bg-slate-800 text-white shadow-sm'
                  : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
              }`}
            >
              {SECTOR_LABELS[s] ?? s}
            </button>
          ))}
          <div className="flex-1" />
          <span className="text-[10px] text-slate-400">{modelScores.length} modeli · kliknij = szczegóły</span>
        </div>
      </div>

      {/* Baner podsumowania */}
      <div className="flex flex-wrap items-center gap-2 px-1">
        <span className="text-xs text-slate-500 font-semibold">{labels[0]}:</span>
        {counts['SŁABY'] > 0 && (
          <span className="inline-flex items-center gap-1 bg-red-100 text-red-700 text-xs font-bold px-2.5 py-1 rounded-full">
            <span className="w-1.5 h-1.5 rounded-full bg-red-500 inline-block" />{counts['SŁABY']} Słaby
          </span>
        )}
        {counts['UWAGA'] > 0 && (
          <span className="inline-flex items-center gap-1 bg-amber-100 text-amber-700 text-xs font-bold px-2.5 py-1 rounded-full">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-500 inline-block" />{counts['UWAGA']} Uwaga
          </span>
        )}
        {counts['DOBRY'] > 0 && (
          <span className="inline-flex items-center gap-1 bg-emerald-100 text-emerald-700 text-xs font-bold px-2.5 py-1 rounded-full">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block" />{counts['DOBRY']} Dobry
          </span>
        )}
        {counts['BRAK'] > 0 && (
          <span className="inline-flex items-center gap-1 bg-slate-100 text-slate-400 text-xs font-bold px-2.5 py-1 rounded-full">
            <span className="w-1.5 h-1.5 rounded-full bg-slate-300 inline-block" />{counts['BRAK']} Brak danych
          </span>
        )}
      </div>

      {/* Siatka kafelków — 2 kolumny */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {modelScores.map(({ def }) => (
          <ModelCard
            key={def.id}
            def={def}
            f1={f1}
            f2={f2}
            f3={f3}
            onSelect={() => setSelectedId(def.id)}
          />
        ))}
      </div>

      {/* Drawer ze szczegółami */}
      {selectedDef && (
        <ModelDrawer
          def={selectedDef}
          f1={f1}
          f2={f2}
          f3={f3}
          labels={labels}
          onClose={() => setSelectedId(null)}
        />
      )}
    </div>
  );
}

// ── Beneish M-score tab ───────────────────────────────────────────────────────

function BeneishIndexRow({ idx, isOpen, onToggle, isDriver }: {
  idx: BeneishIndex;
  isOpen: boolean;
  onToggle: () => void;
  isDriver: boolean;
}) {
  const { t } = useLang();
  const contribHigh = idx.contribution > 0.5;
  const contribNeg  = idx.contribution < -0.1;
  const contribCls  = contribHigh ? 'text-red-600 font-bold' : contribNeg ? 'text-emerald-600' : 'text-slate-700';
  const fmtPLN = (v: number) => {
    const abs = Math.abs(v);
    if (abs >= 1_000_000) return `${(v / 1_000_000).toFixed(2)} M PLN`;
    if (abs >= 1_000) return `${(v / 1_000).toFixed(0)} k PLN`;
    return `${v.toFixed(0)} PLN`;
  };

  return (
    <>
      <tr
        onClick={onToggle}
        className={`border-b border-slate-100 cursor-pointer transition-colors select-none
          ${isOpen ? 'bg-blue-50 border-l-2 border-l-blue-500' : isDriver ? 'bg-red-50/40 hover:bg-red-50' : 'hover:bg-slate-50'}
        `}
      >
        {/* Wskaźnik */}
        <td className="px-3 py-2.5">
          <div className="flex items-center gap-2">
            <span className={`font-mono font-bold text-sm ${isDriver ? 'text-red-700' : 'text-slate-800'}`}>{idx.key}</span>
            {isDriver && (
              <span className="px-1.5 py-0.5 rounded-full bg-red-100 text-red-600 text-[9px] font-bold uppercase tracking-wide">driver ⚠</span>
            )}
          </div>
          <div className="text-[10px] text-slate-400 mt-0.5 leading-tight">{idx.detail.fullName}</div>
        </td>
        {/* Formuła */}
        <td className="px-3 py-2.5 hidden lg:table-cell">
          <code className="text-[10px] text-slate-500 bg-slate-100 rounded px-1.5 py-0.5 whitespace-nowrap">{idx.detail.formula}</code>
        </td>
        {/* Wartość */}
        <td className="px-3 py-2.5 text-right font-mono tabular-nums text-slate-700 font-semibold">{idx.value.toFixed(4)}</td>
        {/* Waga */}
        <td className="px-3 py-2.5 text-right font-mono tabular-nums text-slate-500 text-xs">{idx.weight > 0 ? '+' : ''}{idx.weight.toFixed(3)}</td>
        {/* Składnik */}
        <td className={`px-3 py-2.5 text-right font-mono tabular-nums ${contribCls}`}>
          {idx.contribution > 0 ? '+' : ''}{idx.contribution.toFixed(4)}
        </td>
        {/* Toggle */}
        <td className="px-3 py-2.5 text-center text-slate-400 text-base">
          <span className={`inline-block transition-transform ${isOpen ? 'rotate-90 text-blue-500' : ''}`}>›</span>
        </td>
      </tr>

      {/* Expanded detail row */}
      {isOpen && (
        <tr className="border-b border-blue-100">
          <td colSpan={6} className="px-4 py-3 bg-blue-50/60">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

              {/* Dane źródłowe */}
              <div>
                <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide mb-2">
                  {t('beneish.detail.inputs')}
                </div>
                <table className="w-full text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-blue-100">
                      <th className="text-left py-1 text-[10px] text-slate-400 font-semibold">{t('beneish.detail.inputs')}</th>
                      <th className="text-[10px] text-slate-400 font-semibold px-2 text-center">
                        <span className="text-[9px] bg-blue-100 text-blue-600 rounded px-1">{t('beneish.detail.source.bilans')}/{t('beneish.detail.source.rzis')}</span>
                      </th>
                      <th className="text-right py-1 text-[10px] text-blue-600 font-semibold">{t('beneish.detail.periodT')}</th>
                      <th className="text-right py-1 text-[10px] text-slate-400 font-semibold">{t('beneish.detail.periodT1')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {idx.detail.inputs.map((inp, ii) => (
                      <tr key={ii} className="border-b border-blue-50">
                        <td className="py-1 text-slate-600 font-medium">{inp.label}</td>
                        <td className="py-1 px-2 text-center">
                          <span className={`text-[9px] px-1 rounded ${inp.source === 'bilans' ? 'bg-indigo-100 text-indigo-600' : 'bg-teal-100 text-teal-600'}`}>
                            {t(`beneish.detail.source.${inp.source}`)}
                          </span>
                        </td>
                        <td className="py-1 text-right font-mono text-blue-700 font-semibold">{fmtPLN(inp.t)}</td>
                        <td className="py-1 text-right font-mono text-slate-500">{fmtPLN(inp.t1)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Kroki obliczeniowe */}
              <div>
                <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide mb-2">
                  {t('beneish.detail.steps')}
                </div>
                <table className="w-full text-xs border-collapse">
                  <tbody>
                    {idx.detail.steps.map((step, si) => (
                      <tr key={si} className="border-b border-blue-50">
                        <td className="py-1 text-slate-600 font-medium">{step.label}</td>
                        <td className="py-1 text-right font-mono text-blue-700 font-semibold">{step.t}</td>
                        {step.t1 && <td className="py-1 text-right font-mono text-slate-400 text-[10px]">{step.t1}</td>}
                      </tr>
                    ))}
                  </tbody>
                </table>

                {/* Risk note for drivers */}
                {isDriver && (
                  <div className="mt-3 p-2.5 bg-red-50 border border-red-100 rounded-lg">
                    <div className="text-[10px] font-semibold text-red-600 uppercase tracking-wide mb-1">
                      {t('beneish.detail.riskNote')}
                    </div>
                    <p className="text-xs text-red-700 leading-snug">{t(`beneish.riskNote.${idx.key}`)}</p>
                  </div>
                )}
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

function BeneishTab({ result, onOpenAI }: { result: BeneishResult | null; onOpenAI: (data: Record<string, unknown>) => void }) {
  const { t } = useLang();
  const [openKey, setOpenKey] = useState<string | null>(null);

  if (!result) {
    return (
      <div className="bg-white rounded-xl border border-slate-200 p-8 text-center text-slate-400 text-sm">
        <div className="text-3xl mb-3">📊</div>
        {t('beneish.nodata')}
      </div>
    );
  }

  const { indices, mscore, highRisk, topDrivers } = result;
  const fmtScore = mscore.toFixed(3);
  const riskBg  = highRisk ? 'bg-red-50 border-red-200 text-red-800' : 'bg-emerald-50 border-emerald-200 text-emerald-800';
  const interpretText = t(
    highRisk ? 'beneish.interpret.high' : 'beneish.interpret.low',
    { mscore: fmtScore },
  );

  return (
    <div className="space-y-4">

      <div className="flex justify-end">
        <button onClick={() => onOpenAI({ section: 'beneish_mscore', mscore: result?.mscore, high_risk: result?.highRisk, top_drivers: result?.topDrivers, indices: result?.indices.map(idx => ({ key: idx.key, value: Math.round(idx.value * 1000) / 1000, weight: idx.weight, contribution: Math.round(idx.contribution * 1000) / 1000 })) })} className="inline-flex items-center gap-1 px-2 py-1 text-[10px] font-semibold text-violet-600 hover:text-violet-800 bg-violet-50 hover:bg-violet-100 border border-violet-200 hover:border-violet-300 rounded-lg transition-all">🤖 Analiza AI</button>
      </div>

      {/* ── Wynik M-score — baner ── */}
      <div className={`flex flex-wrap items-center gap-5 gap-y-3 rounded-xl border-2 p-5 ${riskBg}`}>
        <div>
          <div className="text-4xl font-black font-mono tracking-tight">{fmtScore}</div>
          <div className="text-xs font-semibold uppercase tracking-wide opacity-60 mt-0.5">{t('beneish.mscore')} · {t('beneish.threshold')}</div>
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-lg font-bold">{highRisk ? t('beneish.highRisk') : t('beneish.lowRisk')}</div>
          <p className="text-sm opacity-80 mt-1 leading-snug">{interpretText}</p>
          {topDrivers.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-2">
              <span className="text-xs font-semibold opacity-60 self-center">{t('beneish.topDrivers')}:</span>
              {topDrivers.map(k => (
                <button
                  key={k}
                  onClick={() => setOpenKey(prev => prev === k ? null : k)}
                  className={`px-2.5 py-0.5 rounded-full text-xs font-mono font-bold border transition-all
                    ${highRisk ? 'bg-red-100 border-red-300 text-red-700 hover:bg-red-200' : 'bg-emerald-100 border-emerald-300 text-emerald-700'}
                    ${openKey === k ? 'ring-2 ring-offset-1 ring-red-400' : ''}
                  `}
                >
                  {k} ↓
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="text-5xl shrink-0 select-none">{highRisk ? '⚠️' : '✅'}</div>
      </div>

      {/* ── Tabela wskaźników (klikalna) ── */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-200 flex items-center gap-2">
          <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">{t('beneish.title')}</span>
          <span className="text-[10px] text-slate-400">— {t('beneish.subtitle')}</span>
          <span className="ml-auto text-[10px] text-blue-500 font-medium">↓ kliknij wiersz = szczegóły</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/80">
                <th className="px-3 py-2 text-left text-[10px] font-semibold text-slate-500 uppercase tracking-wide">{t('beneish.indicator')}</th>
                <th className="px-3 py-2 text-left text-[10px] font-semibold text-slate-500 uppercase tracking-wide hidden lg:table-cell">Formuła</th>
                <th className="px-3 py-2 text-right text-[10px] font-semibold text-slate-500 uppercase tracking-wide">{t('beneish.value')}</th>
                <th className="px-3 py-2 text-right text-[10px] font-semibold text-slate-500 uppercase tracking-wide">{t('beneish.weight')}</th>
                <th className="px-3 py-2 text-right text-[10px] font-semibold text-slate-500 uppercase tracking-wide">{t('beneish.contribution')}</th>
                <th className="w-8" />
              </tr>
            </thead>
            <tbody>
              {indices.map(idx => (
                <BeneishIndexRow
                  key={idx.key}
                  idx={idx}
                  isOpen={openKey === idx.key}
                  onToggle={() => setOpenKey(prev => prev === idx.key ? null : idx.key)}
                  isDriver={topDrivers.includes(idx.key)}
                />
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-slate-200 bg-slate-50">
                <td colSpan={4} className="px-3 py-2.5 text-xs font-semibold text-slate-600 uppercase tracking-wide">
                  M-score = −4,840 + Σ (waga × wskaźnik)
                </td>
                <td className={`px-3 py-2.5 text-right font-mono font-black text-base tabular-nums ${highRisk ? 'text-red-700' : 'text-emerald-700'}`}>
                  {mscore > 0 ? '+' : ''}{fmtScore}
                </td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      {/* ── Metodologia ── */}
      <div className="bg-slate-50 rounded-xl border border-slate-200 p-4">
        <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide mb-2">Metodologia · Beneish (1999)</div>
        <p className="text-xs text-slate-600 leading-relaxed">
          Model Beneisha jest modelem probabilistycznym opartym na 8 wskaźnikach finansowych. Wartość M-score powyżej −1,78
          klasyfikuje spółkę jako potencjalnego manipulatora wyników. Źródło danych: bilans i RZiS za okresy t i t−1.
          Wskaźnik SGAI w tym modelu używa całkowitych kosztów operacyjnych jako proxy dla kosztów sprzedaży i zarządu.
        </p>
      </div>
    </div>
  );
}

// ── Narracja auto-analityczna ─────────────────────────────────────────────────

function NarrativeBlock({
  companyName, p1,
  overall, gLiqd, gDebt, gProf,
  cr1, cr2, da1, icr1,
  roe1, roe2, ros1, roa1, ebitdaM1, dso1,
  f1, f2,
  keyModels, beneish, fmtP,
}: {
  companyName: string; p1: string;
  overall: Grade; gLiqd: Grade; gDebt: Grade; gProf: Grade;
  cr1: number | null; cr2: number | null; da1: number | null; icr1: number | null;
  roe1: number | null; roe2: number | null; ros1: number | null; roa1: number | null;
  ebitdaM1: number | null; dso1: number | null;
  f1: FieldMap; f2: FieldMap;
  keyModels: { def: ModelDef; score: number | null; zone: ZoneDef | null }[];
  beneish: BeneishResult | null;
  fmtP: (v: number | null, d?: number) => string | null;
}) {
  const { lang } = useLang();
  const paragraphs: string[] = [];
  const fPct = (v: number | null) => { const s = fmtP(v !== null ? v * 100 : null); return s ? `${s}%` : null; };
  const fRat = (v: number | null) => { const s = fmtP(v); return s ? `${s}x` : null; };
  const dayLabel = lang === 'fr' ? 'j' : lang === 'en' ? 'd' : 'dni';
  const fDni = (v: number | null) => { const s = fmtP(v, 0); return s ? `${s} ${dayLabel}` : null; };
  const currLabel = lang === 'fr' ? 'k EUR' : lang === 'en' ? 'k PLN' : 'tys. PLN';

  if (lang === 'fr') {
    // ── French paragraphs ──
    const adjMap: Record<Grade, string> = { B_DOBRY: 'excellente', DOBRY: 'bonne', UWAGA: 'mitigée', SŁABY: 'dégradée', BRAK: 'indéterminée' };
    const verbMap: Record<Grade, string> = {
      B_DOBRY: 'La société présente d\'excellents fondamentaux financiers.',
      DOBRY: 'La société satisfait aux principaux critères de santé financière.',
      UWAGA: 'Certains indicateurs nécessitent un suivi et des mesures correctives.',
      SŁABY: 'Les indicateurs signalent des risques significatifs nécessitant une réaction immédiate.',
      BRAK: 'Données insuffisantes pour une évaluation complète.',
    };
    paragraphs.push(`${companyName} présente une condition financière ${adjMap[overall]} pour la période ${p1}. ${verbMap[overall]}`);

    if (gProf !== 'BRAK') {
      const desc = (gProf === 'B_DOBRY' || gProf === 'DOBRY') ? 'satisfaisante' : gProf === 'UWAGA' ? 'mitigée — résultats en deçà du benchmark' : 'faible ou négative — restructuration des revenus nécessaire';
      const vals = [roe1 !== null && `ROE ${fPct(roe1)}`, roa1 !== null && `ROA ${fPct(roa1)}`, ros1 !== null && `marge nette ${fPct(ros1)}`, ebitdaM1 !== null && `EBITDA% ${fPct(ebitdaM1)}`].filter(Boolean).join(', ');
      const trend = roe1 !== null && roe2 !== null ? roe1 > roe2 * 1.05 ? ' La rentabilité s\'est améliorée d\'une année sur l\'autre.' : roe1 < roe2 * 0.95 ? ' La rentabilité s\'est dégradée d\'une année sur l\'autre.' : ' La rentabilité reste stable.' : '';
      paragraphs.push(`La rentabilité est ${desc}${vals ? ` (${vals})` : ''}.${trend}`);
    }

    if (gLiqd !== 'BRAK') {
      const desc = (gLiqd === 'B_DOBRY' || gLiqd === 'DOBRY') ? 'bonne — la société dispose de ressources liquides suffisantes' : gLiqd === 'UWAGA' ? 'mitigée — surveillance de la trésorerie recommandée' : 'insuffisante — risque de difficultés à honorer les dettes courantes';
      const vals = [cr1 !== null && `RC ${fRat(cr1)}`, dso1 !== null && `DSO ${fDni(dso1)}`].filter(Boolean).join(', ');
      const crTrend = cr1 !== null && cr2 !== null ? cr1 > cr2 ? ' Le ratio de liquidité général a progressé par rapport à la période précédente.' : cr1 < cr2 ? ' Le ratio a diminué par rapport à la période précédente.' : '' : '';
      paragraphs.push(`La liquidité financière est ${desc}${vals ? ` (${vals})` : ''}.${crTrend}`);
    }

    if (gDebt !== 'BRAK') {
      const desc = (gDebt === 'B_DOBRY' || gDebt === 'DOBRY') ? 'sûr — le niveau d\'endettement ne génère pas de risque significatif' : gDebt === 'UWAGA' ? 'élevé — la société recourt à un financement externe important' : 'critique — le niveau d\'endettement peut compromettre la capacité de remboursement';
      const da = da1 !== null ? ` D/A = ${fRat(da1)}` : '';
      const icr = icr1 !== null ? `, ICR = ${fRat(icr1)} (${icr1 >= 3 ? 'couverture des intérêts satisfaisante' : 'couverture des intérêts à surveiller'})` : '';
      const strKW = f1.kapitalWlasny > 0 ? ` Part des capitaux propres dans le financement des actifs : ${fPct(f1.kapitalWlasny / f1.aktywaRazem)}.` : '';
      paragraphs.push(`Le niveau d'endettement est ${desc}${da}${icr}.${strKW}`);
    }

    const udzAO = f1.aktywaRazem > 0 ? f1.aktywaObrotowe / f1.aktywaRazem : null;
    const udzAT = f1.aktywaRazem > 0 ? f1.aktywaTrwale / f1.aktywaRazem : null;
    if (udzAO !== null && udzAT !== null) {
      const typ = udzAO > 0.6 ? 'circulant (commerce/services)' : udzAT > 0.6 ? 'immobilisé (production/infrastructure)' : 'équilibré';
      paragraphs.push(`Le profil du bilan est ${typ} : les actifs courants représentent ${fPct(udzAO)} du total, les actifs immobilisés ${fPct(udzAT)}.` +
        (f1.przychody > 0 && f2.przychody > 0 ? ` Le CA est passé de ${Math.round(f2.przychody / 1000)} ${currLabel} à ${Math.round(f1.przychody / 1000)} ${currLabel} (${f1.przychody >= f2.przychody ? '+' : ''}${fmtP((f1.przychody - f2.przychody) / Math.abs(f2.przychody))}%).` : ''));
    }

    if (keyModels.length > 0) {
      const withZone = keyModels.filter(m => m.zone);
      const good = withZone.filter(m => m.zone?.grade === 'DOBRY' || m.zone?.grade === 'B_DOBRY').length;
      const bad = withZone.filter(m => m.zone?.grade === 'SŁABY').length;
      const warn = withZone.filter(m => m.zone?.grade === 'UWAGA').length;
      const total = withZone.length;
      if (total > 0) {
        const names = keyModels.slice(0, 3).map(m => m.def.shortName).join(', ');
        const verdict = bad === total ? 'signalent unanimement un risque de faillite' : good === total ? 'classent la société en zone de sécurité' : `donnent des signaux mixtes (sûr : ${good}, vigilance : ${warn}, risque : ${bad} sur ${total})`;
        paragraphs.push(`Les modèles discriminants (${names}) ${verdict}.`);
      }
    }

    if (beneish) {
      paragraphs.push(beneish.highRisk
        ? `⚠ Le test de Beneish (M = ${beneish.mscore.toFixed(2)}) dépasse le seuil d'alerte −1,78, signalant un risque statistique de manipulation des états financiers. Principaux facteurs : ${beneish.topDrivers.slice(0, 3).join(', ')}.`
        : `Le test de Beneish (M = ${beneish.mscore.toFixed(2)}) ne révèle aucun signal de manipulation des résultats — la société reste en dessous du seuil d'alerte −1,78.`);
    }

  } else if (lang === 'en') {
    // ── English paragraphs ──
    const adjMap: Record<Grade, string> = { B_DOBRY: 'excellent', DOBRY: 'good', UWAGA: 'moderate', SŁABY: 'weak', BRAK: 'undetermined' };
    const verbMap: Record<Grade, string> = {
      B_DOBRY: 'The company shows outstanding financial health across all key indicators.',
      DOBRY: 'The company meets the main criteria for financial health.',
      UWAGA: 'Some indicators require monitoring and corrective action.',
      SŁABY: 'The ratio analysis signals significant risks requiring immediate response.',
      BRAK: 'Insufficient data for a complete assessment.',
    };
    paragraphs.push(`${companyName} shows ${adjMap[overall]} financial condition for period ${p1}. ${verbMap[overall]}`);

    if (gProf !== 'BRAK') {
      const desc = (gProf === 'B_DOBRY' || gProf === 'DOBRY') ? 'satisfactory' : gProf === 'UWAGA' ? 'moderate — results below benchmark' : 'low or negative — revenue restructuring required';
      const vals = [roe1 !== null && `ROE ${fPct(roe1)}`, roa1 !== null && `ROA ${fPct(roa1)}`, ros1 !== null && `net margin ${fPct(ros1)}`, ebitdaM1 !== null && `EBITDA% ${fPct(ebitdaM1)}`].filter(Boolean).join(', ');
      const trend = roe1 !== null && roe2 !== null ? roe1 > roe2 * 1.05 ? ' Profitability improved year-over-year.' : roe1 < roe2 * 0.95 ? ' Profitability declined year-over-year.' : ' Profitability is stable.' : '';
      paragraphs.push(`Profitability is ${desc}${vals ? ` (${vals})` : ''}.${trend}`);
    }

    if (gLiqd !== 'BRAK') {
      const desc = (gLiqd === 'B_DOBRY' || gLiqd === 'DOBRY') ? 'good — the company holds sufficient liquid resources' : gLiqd === 'UWAGA' ? 'moderate — cash position monitoring recommended' : 'insufficient — the company may struggle to meet current liabilities';
      const vals = [cr1 !== null && `CR ${fRat(cr1)}`, dso1 !== null && `DSO ${fDni(dso1)}`].filter(Boolean).join(', ');
      const crTrend = cr1 !== null && cr2 !== null ? cr1 > cr2 ? ' Current ratio improved vs. prior period.' : cr1 < cr2 ? ' Current ratio declined vs. prior period.' : '' : '';
      paragraphs.push(`Liquidity is ${desc}${vals ? ` (${vals})` : ''}.${crTrend}`);
    }

    if (gDebt !== 'BRAK') {
      const desc = (gDebt === 'B_DOBRY' || gDebt === 'DOBRY') ? 'safe — leverage level does not generate significant risk' : gDebt === 'UWAGA' ? 'elevated — the company relies on significant external financing' : 'high — debt level may threaten debt-service capacity';
      const da = da1 !== null ? ` D/A = ${fRat(da1)}` : '';
      const icr = icr1 !== null ? `, ICR = ${fRat(icr1)} (${icr1 >= 3 ? 'interest coverage satisfactory' : 'interest coverage warrants attention'})` : '';
      const strKW = f1.kapitalWlasny > 0 ? ` Equity share in asset financing: ${fPct(f1.kapitalWlasny / f1.aktywaRazem)}.` : '';
      paragraphs.push(`Leverage is ${desc}${da}${icr}.${strKW}`);
    }

    const udzAO = f1.aktywaRazem > 0 ? f1.aktywaObrotowe / f1.aktywaRazem : null;
    const udzAT = f1.aktywaRazem > 0 ? f1.aktywaTrwale / f1.aktywaRazem : null;
    if (udzAO !== null && udzAT !== null) {
      const typ = udzAO > 0.6 ? 'current-asset driven (trade/services)' : udzAT > 0.6 ? 'fixed-asset heavy (production/infrastructure)' : 'balanced';
      paragraphs.push(`Balance sheet profile is ${typ}: current assets account for ${fPct(udzAO)} of total assets, fixed assets ${fPct(udzAT)}.` +
        (f1.przychody > 0 && f2.przychody > 0 ? ` Revenue changed from ${Math.round(f2.przychody / 1000)} ${currLabel} to ${Math.round(f1.przychody / 1000)} ${currLabel} (${f1.przychody >= f2.przychody ? '+' : ''}${fmtP((f1.przychody - f2.przychody) / Math.abs(f2.przychody))}%).` : ''));
    }

    if (keyModels.length > 0) {
      const withZone = keyModels.filter(m => m.zone);
      const good = withZone.filter(m => m.zone?.grade === 'DOBRY' || m.zone?.grade === 'B_DOBRY').length;
      const bad = withZone.filter(m => m.zone?.grade === 'SŁABY').length;
      const warn = withZone.filter(m => m.zone?.grade === 'UWAGA').length;
      const total = withZone.length;
      if (total > 0) {
        const names = keyModels.slice(0, 3).map(m => m.def.shortName).join(', ');
        const verdict = bad === total ? 'unanimously signal bankruptcy risk' : good === total ? 'classify the company in the safe zone' : `give mixed signals (safe: ${good}, watch: ${warn}, risk: ${bad} of ${total})`;
        paragraphs.push(`Discriminant models (${names}) ${verdict}.`);
      }
    }

    if (beneish) {
      paragraphs.push(beneish.highRisk
        ? `⚠ Beneish test (M = ${beneish.mscore.toFixed(2)}) exceeds the warning threshold of −1.78, indicating statistical risk of earnings manipulation. Main drivers: ${beneish.topDrivers.slice(0, 3).join(', ')}.`
        : `Beneish test (M = ${beneish.mscore.toFixed(2)}) shows no signals of earnings manipulation — the company is below the −1.78 warning threshold.`);
    }

  } else {
    // ── Polish paragraphs (default) ──
    const overallMap: Record<Grade, string> = { B_DOBRY: 'bardzo dobrą', DOBRY: 'dobrą', UWAGA: 'umiarkowaną', SŁABY: 'słabą', BRAK: 'nieokreśloną' };
    const overallVerb: Record<Grade, string> = {
      B_DOBRY: 'Spółka wyróżnia się znakomitymi fundamentami finansowymi we wszystkich kluczowych obszarach.',
      DOBRY: 'Spółka spełnia główne kryteria zdrowia finansowego.',
      UWAGA: 'Część wskaźników wymaga monitorowania i podjęcia działań korygujących.',
      SŁABY: 'Wyniki wskaźnikowe sygnalizują istotne ryzyka wymagające natychmiastowej reakcji.',
      BRAK: 'Brak wystarczających danych do pełnej oceny.',
    };
    paragraphs.push(`${companyName} prezentuje ${overallMap[overall]} kondycję finansową za okres ${p1}. ${overallVerb[overall]}`);

    if (gProf !== 'BRAK') {
      const desc = (gProf === 'B_DOBRY' || gProf === 'DOBRY') ? 'zadowalająca' : gProf === 'UWAGA' ? 'umiarkowana — wyniki poniżej benchmarku' : 'niska lub ujemna — spółka wymaga restrukturyzacji przychodów';
      const vals = [roe1 !== null && `ROE ${fPct(roe1)}`, roa1 !== null && `ROA ${fPct(roa1)}`, ros1 !== null && `marża netto ${fPct(ros1)}`, ebitdaM1 !== null && `EBITDA% ${fPct(ebitdaM1)}`].filter(Boolean).join(', ');
      const trend = roe1 !== null && roe2 !== null ? roe1 > roe2 * 1.05 ? ' Rentowność poprawiła się rok do roku.' : roe1 < roe2 * 0.95 ? ' Rentowność pogorszyła się rok do roku.' : ' Rentowność pozostaje na stabilnym poziomie.' : '';
      paragraphs.push(`Rentowność jest ${desc}${vals ? ` (${vals})` : ''}.${trend}`);
    }

    if (gLiqd !== 'BRAK') {
      const desc = (gLiqd === 'B_DOBRY' || gLiqd === 'DOBRY') ? 'dobra — spółka posiada wystarczające zasoby płynne' : gLiqd === 'UWAGA' ? 'umiarkowana — zalecane monitorowanie pozycji gotówkowej' : 'niewystarczająca — spółka może mieć trudności z regulowaniem zobowiązań bieżących';
      const vals = [cr1 !== null && `CR ${fRat(cr1)}`, dso1 !== null && `DSO ${fDni(dso1)}`].filter(Boolean).join(', ');
      const crTrend = cr1 !== null && cr2 !== null ? cr1 > cr2 ? ' Wskaźnik bieżący wzrósł względem poprzedniego okresu.' : cr1 < cr2 ? ' Wskaźnik bieżący obniżył się względem poprzedniego okresu.' : '' : '';
      paragraphs.push(`Płynność finansowa jest ${desc}${vals ? ` (${vals})` : ''}.${crTrend}`);
    }

    if (gDebt !== 'BRAK') {
      const desc = (gDebt === 'B_DOBRY' || gDebt === 'DOBRY') ? 'bezpieczny — poziom dźwigni finansowej nie generuje istotnego ryzyka' : gDebt === 'UWAGA' ? 'podwyższony — spółka korzysta ze znaczącego finansowania zewnętrznego' : 'wysoki — poziom zadłużenia może zagrażać zdolności do obsługi zobowiązań';
      const da = da1 !== null ? ` D/A = ${fRat(da1)}` : '';
      const icr = icr1 !== null ? `, ICR = ${fRat(icr1)} (${icr1 >= 3 ? 'zdolność do obsługi odsetek dobra' : 'obsługa odsetek wymaga uwagi'})` : '';
      const strKW = f1.kapitalWlasny > 0 ? ` Udział kapitału własnego w finansowaniu aktywów: ${fPct(f1.kapitalWlasny / f1.aktywaRazem)}.` : '';
      paragraphs.push(`Poziom zadłużenia jest ${desc}${da}${icr}.${strKW}`);
    }

    const udzAO = f1.aktywaRazem > 0 ? f1.aktywaObrotowe / f1.aktywaRazem : null;
    const udzAT = f1.aktywaRazem > 0 ? f1.aktywaTrwale / f1.aktywaRazem : null;
    if (udzAO !== null && udzAT !== null) {
      const typ = udzAO > 0.6 ? 'obrotowy (handlowy/usługowy)' : udzAT > 0.6 ? 'środkowotrwały (produkcyjny/infrastrukturalny)' : 'zrównoważony';
      paragraphs.push(
        `Profil bilansu ma charakter ${typ}: aktywa obrotowe stanowią ${fPct(udzAO)} aktywów ogółem, trwałe — ${fPct(udzAT)}.` +
        (f1.przychody > 0 && f2.przychody > 0 ? ` Przychody zmieniły się z ${Math.round(f2.przychody / 1000)} tys. PLN do ${Math.round(f1.przychody / 1000)} tys. PLN (${f1.przychody >= f2.przychody ? '+' : ''}${fmtP((f1.przychody - f2.przychody) / Math.abs(f2.przychody))}%).` : '')
      );
    }

    if (keyModels.length > 0) {
      const withZone = keyModels.filter(m => m.zone);
      const good = withZone.filter(m => m.zone?.grade === 'DOBRY' || m.zone?.grade === 'B_DOBRY').length;
      const bad  = withZone.filter(m => m.zone?.grade === 'SŁABY').length;
      const warn = withZone.filter(m => m.zone?.grade === 'UWAGA').length;
      const total = withZone.length;
      if (total > 0) {
        const names = keyModels.slice(0, 3).map(m => m.def.shortName).join(', ');
        const verdict = bad === total ? 'jednomyślnie sygnalizują zagrożenie upadłością' : good === total ? 'klasyfikują spółkę w strefie bezpieczeństwa' : `dają niejednoznaczne sygnały (bezpiecznie: ${good}, uwaga: ${warn}, zagrożenie: ${bad} z ${total})`;
        paragraphs.push(`Modele dyskryminacyjne (${names}) ${verdict}.`);
      }
    }

    if (beneish) {
      paragraphs.push(beneish.highRisk
        ? `⚠ Test Beneisha (M = ${beneish.mscore.toFixed(2)}) przekracza próg ostrzegawczy −1,78, co sygnalizuje statystyczne ryzyko manipulacji sprawozdaniem finansowym. Główne czynniki ryzyka: ${beneish.topDrivers.slice(0, 3).join(', ')}.`
        : `Test Beneisha (M = ${beneish.mscore.toFixed(2)}) nie wykazuje sygnałów manipulacji wynikami finansowymi — spółka mieści się poniżej progu ostrzegawczego −1,78.`);
    }
  }

  const borderColor = overall === 'B_DOBRY' ? 'border-violet-200' : overall === 'DOBRY' ? 'border-emerald-200' : overall === 'UWAGA' ? 'border-amber-200' : overall === 'SŁABY' ? 'border-red-200' : 'border-slate-200';
  const titles: Record<string, string> = { pl: 'Podsumowanie analityczne', fr: 'Synthèse analytique', en: 'Analytical summary' };

  return (
    <div className={`bg-white rounded-xl border shadow-sm p-5 ${borderColor}`}>
      <div className="flex items-center gap-2 mb-4">
        <span className="text-base">📝</span>
        <h3 className="text-sm font-bold text-slate-800">{titles[lang] ?? titles.pl}</h3>
        <span className="ml-auto text-[10px] text-slate-400">{lang === 'fr' ? 'généré automatiquement' : lang === 'en' ? 'auto-generated from data' : 'generowane automatycznie z danych'}</span>
      </div>
      <div className="space-y-2.5">
        {paragraphs.map((p, i) => (
          <p key={i} className="text-sm text-slate-600 leading-relaxed">{p}</p>
        ))}
      </div>
    </div>
  );
}

// ── Podsumowanie analizy ──────────────────────────────────────────────────────

function PodsumowanieTab({
  f1, f2, f3, beneish, periodLabels, companyName, onNavigate, onOpenAI,
}: {
  f1: FieldMap; f2: FieldMap; f3: FieldMap | null;
  beneish: BeneishResult | null;
  periodLabels?: string[];
  companyName: string;
  onNavigate: (tab: SubTab) => void;
  onOpenAI: (data: Record<string, unknown>) => void;
}) {
  const [drawerInd, setDrawerInd] = useState<Indicator | null>(null);
  const { lang } = useLang();
  const p1 = periodLabels?.[0] ?? 'Okres bieżący';
  const p2 = periodLabels?.[1] ?? 'Okres porównawczy';
  const labels = [p1, p2, ...(periodLabels?.[2] ? [periodLabels[2]] : [])];

  const ebitda = (f: FieldMap) => f.ebit + f.amortyzacja;
  const totalDebt = (f: FieldMap) => f.zobowiazaniaDlugo + f.zobowiazaniaKrotko;

  const cr1 = safe(f1.aktywaObrotowe, f1.zobowiazaniaKrotko);
  const qr1 = safe(f1.aktywaObrotowe - f1.zapasy, f1.zobowiazaniaKrotko);
  const da1 = safe(totalDebt(f1), f1.aktywaRazem);
  const icr1 = f1.odsetki !== 0 ? safe(ebitda(f1), f1.odsetki) : null;
  const roe1 = safe(f1.zyskNetto, f1.kapitalWlasny);
  const roa1 = safe(f1.zyskNetto, f1.aktywaRazem);
  const ros1 = safe(f1.zyskNetto, f1.przychody);
  const ebitdaM1 = safe(ebitda(f1), f1.przychody);
  const dso1 = f1.przychody !== 0 ? (f1.naleznosci / f1.przychody) * 360 : null;

  const cr2 = safe(f2.aktywaObrotowe, f2.zobowiazaniaKrotko);
  const qr2 = safe(f2.aktywaObrotowe - f2.zapasy, f2.zobowiazaniaKrotko);
  const da2 = safe(totalDebt(f2), f2.aktywaRazem);
  const icr2 = f2.odsetki !== 0 ? safe(ebitda(f2), f2.odsetki) : null;
  const roe2 = safe(f2.zyskNetto, f2.kapitalWlasny);
  const roa2 = safe(f2.zyskNetto, f2.aktywaRazem);
  const ros2 = safe(f2.zyskNetto, f2.przychody);
  const ebitdaM2 = safe(ebitda(f2), f2.przychody);
  const dso2 = f2.przychody !== 0 ? (f2.naleznosci / f2.przychody) * 360 : null;

  const cr3 = f3 ? safe(f3.aktywaObrotowe, f3.zobowiazaniaKrotko) : null;
  const da3 = f3 ? safe(totalDebt(f3), f3.aktywaRazem) : null;
  const roe3 = f3 ? safe(f3.zyskNetto, f3.kapitalWlasny) : null;
  const dso3 = (f3 && f3.przychody !== 0) ? (f3.naleznosci / f3.przychody) * 360 : null;

  const gCR  = grade(cr1, 1.2, 2.0, 'higher');
  const gQR  = grade(qr1, 0.7, 1.2, 'higher');
  const gDA  = grade(da1, 0.4, 0.6, 'lower');
  const gICR = icr1 !== null ? gradeHigher(icr1, 3.0) : 'BRAK' as Grade;
  const gROE = gradeHigher(roe1 !== null ? roe1 * 100 : null, 10);
  const gROA = gradeHigher(roa1 !== null ? roa1 * 100 : null, 5);
  const gROS = gradeHigher(ros1 !== null ? ros1 * 100 : null, 5);
  const gDSO = grade(dso1, 30, 60, 'lower');
  const gEBITDA = gradeHigher(ebitdaM1 !== null ? ebitdaM1 * 100 : null, 8);

  const aggGrade = (gs: Grade[]): Grade => {
    const v = gs.filter(x => x !== 'BRAK');
    if (!v.length) return 'BRAK';
    if (v.includes('SŁABY')) return 'SŁABY';
    if (v.includes('UWAGA')) return 'UWAGA';
    return 'DOBRY'; // B_DOBRY na poziomie indywidualnym, nie agregujemy wyżej
  };

  const gLiqd  = aggGrade([gCR, gQR]);
  const gEff   = aggGrade([gDSO]);
  const gDebt  = aggGrade([gDA, gICR]);
  const gProf  = aggGrade([gROE, gROA, gROS]);
  const overall = aggGrade([gLiqd, gEff, gDebt, gProf]);

  const fmtP = (v: number | null, d = 1) => v !== null ? v.toFixed(d) : null;

  const keyModelIds = ['holda', 'altman_em', 'prusak_bn', 'gajdka'];
  const keyModels = useMemo(() =>
    keyModelIds.map(id => {
      const def = DISC_MODELS.find(m => m.id === id);
      if (!def) return null;
      const { score } = computeScore(def, f1);
      const zone = findZone(def, score);
      return { def, score, zone };
    }).filter(Boolean) as { def: ModelDef; score: number | null; zone: ZoneDef | null }[],
    [f1],
  );

  const overallBg = overall === 'B_DOBRY' ? 'from-violet-50 to-violet-100/50 border-violet-300' : overall === 'DOBRY' ? 'from-emerald-50 to-emerald-100/50 border-emerald-300' : overall === 'UWAGA' ? 'from-amber-50 to-amber-100/50 border-amber-300' : overall === 'SŁABY' ? 'from-red-50 to-red-100/50 border-red-300' : 'from-slate-50 to-slate-100/50 border-slate-200';
  const overallDot = overall === 'B_DOBRY' ? 'bg-violet-500' : overall === 'DOBRY' ? 'bg-emerald-500' : overall === 'UWAGA' ? 'bg-amber-500' : overall === 'SŁABY' ? 'bg-red-500' : 'bg-slate-400';
  const valColor = (g: Grade) => g === 'B_DOBRY' ? 'text-violet-700' : g === 'DOBRY' ? 'text-emerald-700' : g === 'UWAGA' ? 'text-amber-700' : g === 'SŁABY' ? 'text-red-700' : 'text-slate-400';

  const trend = (v1: number | null, v2: number | null) => {
    if (v1 === null || v2 === null) return null;
    return v1 > v2 ? '↑' : v1 < v2 ? '↓' : '→';
  };
  const trendColor = (v1: number | null, v2: number | null, higherIsBetter = true) => {
    const t = trend(v1, v2);
    if (!t) return 'text-slate-300';
    const improved = (t === '↑' && higherIsBetter) || (t === '↓' && !higherIsBetter);
    return improved ? 'text-emerald-500' : t === '→' ? 'text-slate-400' : 'text-red-400';
  };

  // Indicator definitions for category drawers
  const crIndicator: Indicator = {
    name: 'Płynność bieżąca (CR)', shortName: 'CR',
    formula: 'AO / ZK',
    val1: fmtRatio(cr1), val2: fmtRatio(cr2), val3: f3 ? fmtRatio(cr3) : undefined,
    norm: '1,2 – 2,0',
    grade1: gCR, grade2: grade(cr2, 1.2, 2.0, 'higher'), grade3: f3 ? grade(cr3, 1.2, 2.0, 'higher') : undefined,
    descPL: 'Wskaźnik bieżącej płynności — ile razy aktywa obrotowe pokrywają zobowiązania krótkoterminowe.',
    steps1: [{ label: 'Aktywa obrotowe', val: f1.aktywaObrotowe }, { label: 'Zobowiązania krótkoterm.', val: f1.zobowiazaniaKrotko }],
    steps2: [{ label: 'Aktywa obrotowe', val: f2.aktywaObrotowe }, { label: 'Zobowiązania krótkoterm.', val: f2.zobowiazaniaKrotko }],
    ...(f3 ? { steps3: [{ label: 'Aktywa obrotowe', val: f3.aktywaObrotowe }, { label: 'Zobowiązania krótkoterm.', val: f3.zobowiazaniaKrotko }] } : {}),
  };
  const dsoIndicator: Indicator = {
    name: 'Rotacja należności (DSO)', shortName: 'DSO',
    formula: 'Należności / Przychody × 360',
    val1: fmtDays(dso1), val2: fmtDays(dso2), val3: f3 ? fmtDays(dso3) : undefined,
    norm: '30 – 60 dni',
    grade1: gDSO, grade2: grade(dso2, 30, 60, 'lower'), grade3: f3 ? grade(dso3, 30, 60, 'lower') : undefined,
    descPL: 'Średnia liczba dni oczekiwania na zapłatę od klientów. Im niższa, tym szybciej firma inkasuje należności.',
    steps1: [{ label: 'Należności', val: f1.naleznosci }, { label: 'Przychody', val: f1.przychody }],
    steps2: [{ label: 'Należności', val: f2.naleznosci }, { label: 'Przychody', val: f2.przychody }],
    ...(f3 ? { steps3: [{ label: 'Należności', val: f3.naleznosci }, { label: 'Przychody', val: f3.przychody }] } : {}),
  };
  const daIndicator: Indicator = {
    name: 'Zadłużenie ogółem (D/A)', shortName: 'D/A',
    formula: '(ZD + ZK) / AT',
    val1: fmtRatio(da1), val2: fmtRatio(da2), val3: f3 ? fmtRatio(da3) : undefined,
    norm: '0,4 – 0,6',
    grade1: gDA, grade2: grade(da2, 0.4, 0.6, 'lower'), grade3: f3 ? grade(da3, 0.4, 0.6, 'lower') : undefined,
    descPL: 'Jaka część aktywów jest finansowana długiem. Wartość > 0,6 sygnalizuje wysokie ryzyko finansowe.',
    steps1: [{ label: 'Zobowiązania razem', val: totalDebt(f1) }, { label: 'Aktywa razem', val: f1.aktywaRazem }],
    steps2: [{ label: 'Zobowiązania razem', val: totalDebt(f2) }, { label: 'Aktywa razem', val: f2.aktywaRazem }],
    ...(f3 ? { steps3: [{ label: 'Zobowiązania razem', val: totalDebt(f3) }, { label: 'Aktywa razem', val: f3.aktywaRazem }] } : {}),
  };
  const roeIndicator: Indicator = {
    name: 'Rentowność kapitału własnego (ROE)', shortName: 'ROE',
    formula: 'ZN / KW × 100%',
    val1: fmtPct(roe1 !== null ? roe1 * 100 : null),
    val2: fmtPct(roe2 !== null ? roe2 * 100 : null),
    val3: f3 ? fmtPct(roe3 !== null ? roe3 * 100 : null) : undefined,
    norm: '> 10%',
    grade1: gROE,
    grade2: gradeHigher(roe2 !== null ? roe2 * 100 : null, 10),
    grade3: f3 ? gradeHigher(roe3 !== null ? roe3 * 100 : null, 10) : undefined,
    descPL: 'Return on Equity — rentowność kapitału własnego. Kluczowa miara efektywności dla właścicieli firmy.',
    steps1: [{ label: 'Zysk netto', val: f1.zyskNetto }, { label: 'Kapitał własny', val: f1.kapitalWlasny }],
    steps2: [{ label: 'Zysk netto', val: f2.zyskNetto }, { label: 'Kapitał własny', val: f2.kapitalWlasny }],
    ...(f3 ? { steps3: [{ label: 'Zysk netto', val: f3.zyskNetto }, { label: 'Kapitał własny', val: f3.kapitalWlasny }] } : {}),
  };

  // KPI metric definitions for the dashboard grid
  const TAB_MAP: Record<string, SubTab> = { liqd: 'plynnosc', eff: 'sprawnosc', debt: 'zadluzenie', prof: 'rentownosc' };

  const kpiGroups = [
    {
      key: 'liqd', label: 'Płynność', g: gLiqd, ind: crIndicator,
      metrics: [
        { name: 'CR', val: fmtRatio(cr1), g: gCR, t: trend(cr1, cr2), th: true },
        { name: 'QR', val: fmtRatio(qr1), g: gQR, t: trend(qr1, qr2), th: true },
      ],
    },
    {
      key: 'eff', label: 'Sprawność', g: gEff, ind: dsoIndicator,
      metrics: [
        { name: 'DSO', val: fmtDays(dso1), g: gDSO, t: trend(dso1, dso2), th: false },
      ],
    },
    {
      key: 'debt', label: 'Zadłużenie', g: gDebt, ind: daIndicator,
      metrics: [
        { name: 'D/A', val: fmtRatio(da1), g: gDA, t: trend(da1, da2), th: false },
        ...(icr1 !== null ? [{ name: 'ICR', val: fmtRatio(icr1), g: gICR, t: trend(icr1, icr2), th: true }] : []),
      ],
    },
    {
      key: 'prof', label: 'Rentowność', g: gProf, ind: roeIndicator,
      metrics: [
        { name: 'ROE', val: fmtPct(roe1 !== null ? roe1*100 : null), g: gROE, t: trend(roe1, roe2), th: true },
        { name: 'ROA', val: fmtPct(roa1 !== null ? roa1*100 : null), g: gROA, t: trend(roa1, roa2), th: true },
        { name: 'ROS', val: fmtPct(ros1 !== null ? ros1*100 : null), g: gROS, t: trend(ros1, ros2), th: true },
      ],
    },
  ];

  const catCardBg = (g: Grade) => g === 'B_DOBRY'
    ? 'bg-violet-50 border-violet-200 hover:bg-violet-100/70'
    : g === 'DOBRY' ? 'bg-emerald-50 border-emerald-200 hover:bg-emerald-100/70'
    : g === 'UWAGA' ? 'bg-amber-50 border-amber-200 hover:bg-amber-100/70'
    : g === 'SŁABY' ? 'bg-red-50 border-red-200 hover:bg-red-100/70'
    : 'bg-slate-50 border-slate-200 hover:bg-slate-100/70';

  return (
    <div className="space-y-4">
      {/* ── Overall banner ── */}
      <div className={`rounded-xl p-5 border-2 bg-gradient-to-br ${overallBg}`}>
        <div className="flex items-center gap-3 mb-4">
          <div className={`w-3 h-3 rounded-full ${overallDot} shrink-0`} />
          <div className="flex-1">
            <h2 className="text-base font-bold text-slate-800">{companyName}</h2>
            <p className="text-xs text-slate-500">{p1} vs {p2}</p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button onClick={() => onOpenAI({ section: 'summary', company: companyName, period_p1: p1, period_p2: p2, overall_grade: overall, liquidity: { grade: gLiqd, CR: fmtP(cr1), QR: fmtP(qr1) }, debt: { grade: gDebt, DA: fmtP(da1 !== null ? da1 * 100 : null), ICR: fmtP(icr1) }, profitability: { grade: gProf, ROE_pct: fmtP(roe1 !== null ? roe1 * 100 : null), ROA_pct: fmtP(roa1 !== null ? roa1 * 100 : null), ROS_pct: fmtP(ros1 !== null ? ros1 * 100 : null), EBITDA_pct: fmtP(ebitdaM1 !== null ? ebitdaM1 * 100 : null) }, efficiency: { grade: gEff, DSO_days: fmtP(dso1, 0) }, beneish_risk: beneish ? { mscore: beneish.mscore, high_risk: beneish.highRisk } : null })} className="inline-flex items-center gap-1 px-2 py-1 text-[10px] font-semibold text-violet-600 hover:text-violet-800 bg-white/70 hover:bg-white border border-violet-200 hover:border-violet-300 rounded-lg transition-all">🤖 Analiza AI</button>
            <div className="text-right">
              <div className="text-[9px] text-slate-500 uppercase tracking-wide mb-1">Ocena ogólna</div>
              <Badge g={overall} />
            </div>
          </div>
        </div>

        {/* ── Klikalne kafelki kategorii ── */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {kpiGroups.map(({ key, label, g, ind: _ind, metrics }) => (
            <button
              key={key}
              onClick={() => onNavigate(TAB_MAP[key])}
              className={`text-left rounded-xl px-3 py-3 border transition-all duration-100 ${catCardBg(g)} shadow-[0_3px_0_0_#e2e8f0] hover:translate-y-0.5 hover:shadow-[0_1px_0_0_#e2e8f0] active:translate-y-0.5 active:shadow-none`}
            >
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] font-bold text-slate-600 uppercase tracking-wide">{label}</span>
                <Badge g={g} />
              </div>
              <div className="space-y-1">
                {metrics.map(m => (
                  <div key={m.name} className="flex items-baseline gap-1.5">
                    <span className="text-[9px] text-slate-400 w-8 shrink-0">{m.name}</span>
                    <span className={`font-mono font-bold text-sm tabular-nums leading-none ${valColor(m.g)}`}>{m.val}</span>
                    {m.t && (
                      <span className={`text-xs font-bold ${trendColor(m.t === '↑' ? 1 : m.t === '↓' ? -1 : 0, 0, m.th)}`}>{m.t}</span>
                    )}
                  </div>
                ))}
              </div>
              <div className="mt-2 text-[9px] text-slate-400">kliknij → zakładka</div>
            </button>
          ))}
        </div>
      </div>

      {/* ── KPI dashboard — 8 wskaźników w siatce ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { name: 'Marża EBITDA', short: 'EBITDA%', val: fmtPct(ebitdaM1 !== null ? ebitdaM1*100 : null), g: gEBITDA, t: trend(ebitdaM1, ebitdaM2), th: true },
          { name: 'Marża netto', short: 'ROS', val: fmtPct(ros1 !== null ? ros1*100 : null), g: gROS, t: trend(ros1, ros2), th: true },
          { name: 'Zwrot z aktywów', short: 'ROA', val: fmtPct(roa1 !== null ? roa1*100 : null), g: gROA, t: trend(roa1, roa2), th: true },
          { name: 'Zwrot z KW', short: 'ROE', val: fmtPct(roe1 !== null ? roe1*100 : null), g: gROE, t: trend(roe1, roe2), th: true },
          { name: 'Płynność bieżąca', short: 'CR', val: fmtRatio(cr1), g: gCR, t: trend(cr1, cr2), th: true },
          { name: 'Płynność szybka', short: 'QR', val: fmtRatio(qr1), g: gQR, t: trend(qr1, qr2), th: true },
          { name: 'Zadłużenie', short: 'D/A', val: fmtRatio(da1), g: gDA, t: trend(da1, da2), th: false },
          { name: 'Pokrycie odsetek', short: 'ICR', val: icr1 !== null ? fmtRatio(icr1) : 'n/d', g: gICR, t: trend(icr1, icr2), th: true },
        ].map(m => {
          const tClr = m.t
            ? trendColor(m.t === '↑' ? 1 : m.t === '↓' ? -1 : 0, 0, m.th)
            : 'text-slate-300';
          return (
            <div key={m.short} className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
              <div className="text-[9px] text-slate-400 uppercase tracking-wide font-semibold mb-1 leading-tight">{m.name}</div>
              <div className="flex items-baseline gap-1.5 mb-2">
                <span className={`font-mono font-black text-2xl tabular-nums leading-none ${valColor(m.g)}`}>{m.val}</span>
                {m.t && <span className={`text-base font-bold ${tClr}`}>{m.t}</span>}
              </div>
              <div className="flex items-center gap-1.5">
                <Badge g={m.g} />
                <span className="text-[9px] text-slate-300 font-mono">{m.short}</span>
              </div>
            </div>
          );
        })}
      </div>

      {/* ── Narracja analityczna ── */}
      <NarrativeBlock
        companyName={companyName} p1={p1}
        overall={overall} gLiqd={gLiqd} gDebt={gDebt} gProf={gProf}
        cr1={cr1} cr2={cr2} da1={da1} icr1={icr1}
        roe1={roe1} roe2={roe2} ros1={ros1} roa1={roa1} ebitdaM1={ebitdaM1}
        dso1={dso1}
        f1={f1} f2={f2}
        keyModels={keyModels}
        beneish={beneish}
        fmtP={fmtP}
      />

      {/* ── Struktura bilansu ── */}
      {(() => {
        const udzAO = f1.aktywaRazem > 0 ? f1.aktywaObrotowe / f1.aktywaRazem : null;
        const udzAT = f1.aktywaRazem > 0 ? f1.aktywaTrwale / f1.aktywaRazem : null;
        const udzKW = f1.aktywaRazem > 0 ? f1.kapitalWlasny / f1.aktywaRazem : null;
        const udzZob = f1.aktywaRazem > 0 ? (f1.zobowiazaniaDlugo + f1.zobowiazaniaKrotko) / f1.aktywaRazem : null;
        const gStrKW = udzKW !== null ? (udzKW >= 0.40 ? 'DOBRY' : udzKW >= 0.25 ? 'UWAGA' : 'SŁABY') as Grade : 'BRAK' as Grade;
        const structLabels: Record<string, { title: string; curr: string; fixed: string; equity: string; debt: string }> = {
          pl: { title: 'Struktura bilansu', curr: 'Aktywa obrotowe', fixed: 'Aktywa trwałe', equity: 'Kapitał własny', debt: 'Zobowiązania' },
          fr: { title: 'Structure du bilan', curr: 'Actifs courants', fixed: 'Actifs immobilisés', equity: 'Capitaux propres', debt: 'Dettes' },
          en: { title: 'Balance sheet structure', curr: 'Current assets', fixed: 'Fixed assets', equity: 'Equity', debt: 'Liabilities' },
        };
        const sl = structLabels[lang] ?? structLabels.pl;
        if (udzAO === null) return null;
        return (
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <button
              onClick={() => onNavigate('bilans_str')}
              className="w-full px-4 py-2.5 border-b border-slate-200 bg-slate-50 flex items-center gap-2 hover:bg-slate-100 transition-all duration-100 text-left shadow-[0_3px_0_0_#e2e8f0] hover:translate-y-0.5 hover:shadow-[0_1px_0_0_#e2e8f0] active:translate-y-0.5 active:shadow-none"
            >
              <span className="font-bold text-sm text-slate-800 flex-1">{sl.title}</span>
              <Badge g={gStrKW} />
              <span className="text-[10px] text-blue-500 font-medium">→ {lang === 'fr' ? 'voir détails' : lang === 'en' ? 'see details' : 'pełna analiza'}</span>
            </button>
            <div className="p-4 grid grid-cols-2 gap-3">
              <div>
                <div className="text-[9px] font-bold text-slate-500 uppercase tracking-wide mb-1.5">{lang === 'fr' ? 'ACTIF' : lang === 'en' ? 'ASSETS' : 'AKTYWA'}</div>
                {[
                  { label: sl.curr, pct: udzAO, color: 'bg-blue-400' },
                  { label: sl.fixed, pct: udzAT, color: 'bg-blue-200' },
                ].map(row => row.pct !== null ? (
                  <div key={row.label} className="mb-1.5">
                    <div className="flex justify-between text-[10px] mb-0.5">
                      <span className="text-slate-600">{row.label}</span>
                      <span className="font-mono font-semibold text-slate-700">{(row.pct * 100).toFixed(1)}%</span>
                    </div>
                    <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                      <div className={`h-full ${row.color} rounded-full`} style={{ width: `${Math.min(100, row.pct * 100)}%` }} />
                    </div>
                  </div>
                ) : null)}
              </div>
              <div>
                <div className="text-[9px] font-bold text-slate-500 uppercase tracking-wide mb-1.5">{lang === 'fr' ? 'PASSIF' : lang === 'en' ? 'EQUITY & LIAB.' : 'PASYWA'}</div>
                {[
                  { label: sl.equity, pct: udzKW, color: 'bg-emerald-400' },
                  { label: sl.debt, pct: udzZob, color: 'bg-red-300' },
                ].map(row => row.pct !== null ? (
                  <div key={row.label} className="mb-1.5">
                    <div className="flex justify-between text-[10px] mb-0.5">
                      <span className="text-slate-600">{row.label}</span>
                      <span className="font-mono font-semibold text-slate-700">{(row.pct * 100).toFixed(1)}%</span>
                    </div>
                    <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                      <div className={`h-full ${row.color} rounded-full`} style={{ width: `${Math.min(100, row.pct * 100)}%` }} />
                    </div>
                  </div>
                ) : null)}
              </div>
            </div>
          </div>
        );
      })()}

      {/* ── Modele dyskryminacyjne ── */}
      <button
        onClick={() => onNavigate('dyskryminacyjne')}
        className="w-full bg-white rounded-xl border border-slate-200 overflow-hidden hover:border-slate-300 transition-all duration-100 text-left shadow-[0_3px_0_0_#e2e8f0] hover:translate-y-0.5 hover:shadow-[0_1px_0_0_#e2e8f0] active:translate-y-0.5 active:shadow-none"
      >
        <div className="px-4 py-2.5 border-b border-slate-200 bg-slate-50 flex items-center gap-2">
          <span className="font-bold text-sm text-slate-800 flex-1">
            {lang === 'fr' ? 'Modèles discriminants (clés)' : lang === 'en' ? 'Discriminant models (key)' : 'Modele dyskryminacyjne (kluczowe)'}
          </span>
          <span className="text-[10px] text-blue-500 font-medium">→ {lang === 'fr' ? 'voir tous' : lang === 'en' ? 'see all' : 'pełne szczegóły'}</span>
        </div>
        <div className="divide-y divide-slate-100">
          {keyModels.map(({ def, score, zone }) => (
            <div key={def.id} className="px-4 py-3 flex items-center gap-3">
              <span className="text-lg shrink-0">{def.flag}</span>
              <div className="flex-1 min-w-0">
                <div className="text-xs font-semibold text-slate-700">{def.shortName} — {def.author} ({def.year})</div>
                {score !== null && (
                  <div className="text-[10px] text-slate-400 font-mono">{lang === 'fr' ? 'score' : lang === 'en' ? 'score' : 'wynik'}: {score.toFixed(4)}</div>
                )}
              </div>
              <div className="shrink-0 text-right space-y-1">
                {zone && <div className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${zone.bg} ${zone.text}`}>{zone.label}</div>}
                <Badge g={zone?.grade ?? 'BRAK'} />
              </div>
            </div>
          ))}
        </div>
      </button>

      {/* ── Beneish M-Score ── */}
      {beneish && (
        <button
          onClick={() => onNavigate('beneish')}
          className={`w-full text-left rounded-xl border-2 p-4 transition-all duration-100 ${beneish.highRisk ? 'bg-red-50 border-red-300 hover:border-red-400' : 'bg-emerald-50 border-emerald-300 hover:border-emerald-400'} shadow-[0_3px_0_0_#e2e8f0] hover:translate-y-0.5 hover:shadow-[0_1px_0_0_#e2e8f0] active:translate-y-0.5 active:shadow-none`}
        >
          <div className="flex items-center justify-between mb-2">
            <span className="font-bold text-sm text-slate-800">Beneish M-Score</span>
            <div className="flex items-center gap-2">
              <span className={`font-mono font-black text-lg ${beneish.highRisk ? 'text-red-700' : 'text-emerald-700'}`}>
                {beneish.mscore.toFixed(3)}
              </span>
              <span className="text-[10px] text-blue-500 font-medium">→ {lang === 'fr' ? 'détails' : lang === 'en' ? 'details' : 'szczegóły'}</span>
            </div>
          </div>
          <p className="text-xs text-slate-600 leading-relaxed">
            {beneish.highRisk
              ? `${lang === 'fr' ? `Score M = ${beneish.mscore.toFixed(2)} dépasse le seuil d'alerte −1,78 — signal de risque de manipulation.` : lang === 'en' ? `M = ${beneish.mscore.toFixed(2)} exceeds the −1.78 warning threshold — earnings manipulation risk signal.` : `Wynik M = ${beneish.mscore.toFixed(2)} przekracza próg ostrzegawczy −1,78 — sygnał potencjalnego ryzyka manipulacji wynikami finansowymi. Główne czynniki: ${beneish.topDrivers.join(', ')}.`}`
              : `${lang === 'fr' ? `Score M = ${beneish.mscore.toFixed(2)} en dessous du seuil −1,78 — aucun signal de manipulation.` : lang === 'en' ? `M = ${beneish.mscore.toFixed(2)} below threshold −1.78 — no manipulation signals detected.` : `Wynik M = ${beneish.mscore.toFixed(2)} poniżej progu −1,78 — brak statystycznych sygnałów manipulacji sprawozdaniami finansowymi.`}`
            }
          </p>
          {beneish.topDrivers.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {beneish.topDrivers.map(d => (
                <span key={d} className={`text-[10px] px-2 py-0.5 rounded-full font-medium border ${beneish.highRisk ? 'bg-red-100 text-red-700 border-red-200' : 'bg-emerald-100 text-emerald-700 border-emerald-200'}`}>{d}</span>
              ))}
            </div>
          )}
        </button>
      )}

      {/* ── Category Indicator Drawer ── */}
      {drawerInd && (
        <IndicatorDrawer ind={drawerInd} labels={labels} onClose={() => setDrawerInd(null)} />
      )}

    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

interface AIModalState { section: string; sectionLabel: string; data: Record<string, unknown> }

export default function RatioAnalysis() {
  const { activeCompany } = useCompanies();
  const { t, lang } = useLang();
  const [activeTab, setActiveTab] = useState<SubTab>('podsumowanie');
  const [aiModal, setAiModal] = useState<AIModalState | null>(null);
  const openAI = useCallback((section: string, sectionLabel: string) => (data: Record<string, unknown>) => {
    setAiModal({ section, sectionLabel, data });
  }, []);

  const subTabs: { key: SubTab; label: string; group: string }[] = useMemo(() => [
    { key: 'podsumowanie',     label: t('analysis.summary'),        group: t('ratio.indicators') },
    { key: 'plynnosc',         label: t('analysis.liquidity'),      group: t('ratio.indicators') },
    { key: 'sprawnosc',        label: t('analysis.efficiency'),     group: t('ratio.indicators') },
    { key: 'zadluzenie',       label: t('analysis.debt'),           group: t('ratio.indicators') },
    { key: 'rentownosc',       label: t('analysis.profitability'),  group: t('ratio.indicators') },
    { key: 'cashflow',         label: t('analysis.cashflow'),       group: t('ratio.indicators') },
    { key: 'dyskryminacyjne',  label: t('analysis.discriminant'),   group: t('ratio.indicators') },
    { key: 'beneish',          label: t('beneish.tabLabel'),        group: t('ratio.indicators') },
    { key: 'bilans_str',       label: t('analysis.balance'),        group: t('ratio.structure') },
    { key: 'rzis_str',         label: t('analysis.pnl'),            group: t('ratio.structure') },
  ], [t]);

  const groupNames = useMemo(() => [
    t('ratio.indicators'),
    t('ratio.structure'),
  ], [t]);

  const f1 = useMemo(
    () =>
      activeCompany
        ? mapFields(activeCompany.bilans, activeCompany.rzis, 1)
        : null,
    [activeCompany],
  );
  const f2 = useMemo(
    () =>
      activeCompany
        ? mapFields(activeCompany.bilans, activeCompany.rzis, 2)
        : null,
    [activeCompany],
  );
  const f3raw = useMemo(
    () =>
      activeCompany
        ? mapFields(activeCompany.bilans, activeCompany.rzis, 3)
        : null,
    [activeCompany],
  );
  const f3 = useMemo(
    () => (activeCompany?.bilans.some(r => (r.values.period3 ?? 0) !== 0) ? f3raw : null),
    [activeCompany, f3raw],
  );
  const beneish = useMemo(
    () =>
      activeCompany
        ? computeBeneish(activeCompany.bilans, activeCompany.rzis)
        : null,
    [activeCompany],
  );

  if (!activeCompany || !f1 || !f2) {
    return (
      <div className="flex-1 flex items-center justify-center text-slate-400 text-sm">
        {t('ratio.noData')}
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-5xl mx-auto px-4 py-5 space-y-5">
        {/* Header bar */}
        <div className="flex items-center gap-3 bg-white rounded-xl border border-slate-200 shadow-sm px-4 py-3">
          <div>
            <p className="text-base font-bold text-slate-800">{activeCompany.name}</p>
            <p className="text-xs text-slate-400 mt-0.5">{activeCompany.period}</p>
          </div>
          <div className="ml-auto flex items-center gap-3 text-xs text-slate-500">
            <span className="inline-flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-blue-500 inline-block" />
              {activeCompany.periodLabels?.[0] ?? t('ratio.p1Current')}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-slate-300 inline-block" />
              {activeCompany.periodLabels?.[1] ?? t('ratio.p2Comparative')}
            </span>
            {f3 && (
              <span className="inline-flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-slate-200 inline-block" />
                {activeCompany.periodLabels?.[2] ?? 'P3'}
              </span>
            )}
          </div>
        </div>

        {/* Sub-tabs — horizontal scroll on mobile, wrap on sm+ */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-x-auto">
          <div className="p-2 flex gap-1 items-center min-w-max sm:min-w-0 sm:flex-wrap">
          {groupNames.map((group, gi) => (
            <div key={group} className="flex items-center gap-1">
              {gi > 0 && <div className="w-px h-5 bg-slate-200 mx-1" />}
              <span className="text-[10px] text-slate-400 font-semibold uppercase tracking-wide px-1 hidden sm:inline select-none">
                {group}
              </span>
              {subTabs.filter(tab => tab.group === group).map(tab => {
                const active = activeTab === tab.key;
                return (
                  <button
                    key={tab.key}
                    onClick={() => setActiveTab(tab.key)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-100 whitespace-nowrap ${
                      active
                        ? (group === groupNames[0]
                            ? 'bg-emerald-600 text-white shadow-[0_4px_0_0_#065f46] translate-y-0 hover:translate-y-0.5 hover:shadow-[0_2px_0_0_#065f46]'
                            : 'bg-blue-600 text-white shadow-[0_4px_0_0_#1e40af] translate-y-0 hover:translate-y-0.5 hover:shadow-[0_2px_0_0_#1e40af]')
                        : 'text-slate-600 hover:bg-slate-100 shadow-[0_2px_0_0_#e2e8f0] hover:translate-y-0.5 hover:shadow-[0_1px_0_0_#e2e8f0] active:translate-y-0.5 active:shadow-none'
                    }`}
                  >
                    {tab.label}
                  </button>
                );
              })}
            </div>
          ))}
          </div>
        </div>

        {/* Content */}
        {activeTab === 'plynnosc'        && <PlynnostTab          f1={f1} f2={f2} f3={f3} periodLabels={activeCompany.periodLabels} onOpenAI={openAI('plynnosc', t('analysis.liquidity'))} />}
        {activeTab === 'sprawnosc'       && <SprawnostTab         f1={f1} f2={f2} f3={f3} periodLabels={activeCompany.periodLabels} onOpenAI={openAI('sprawnosc', t('analysis.efficiency'))} />}
        {activeTab === 'zadluzenie'      && <ZadluzenieTab        f1={f1} f2={f2} f3={f3} periodLabels={activeCompany.periodLabels} onOpenAI={openAI('zadluzenie', t('analysis.debt'))} />}
        {activeTab === 'rentownosc'      && <RentownoscTab        f1={f1} f2={f2} f3={f3} periodLabels={activeCompany.periodLabels} onOpenAI={openAI('rentownosc', t('analysis.profitability'))} />}
        {activeTab === 'cashflow'        && <CashFlowTab          f1={f1} f2={f2} periodLabels={activeCompany.periodLabels} onOpenAI={openAI('cashflow', t('analysis.cashflow'))} />}
        {activeTab === 'dyskryminacyjne' && <DyskryminacyjneTab   f1={f1} f2={f2} f3={f3} periodLabels={activeCompany.periodLabels} onOpenAI={openAI('dyskryminacyjne', t('analysis.discriminant'))} />}
        {activeTab === 'beneish'         && <BeneishTab           result={beneish} onOpenAI={openAI('beneish', t('beneish.tabLabel'))} />}
        {activeTab === 'podsumowanie'    && <PodsumowanieTab      f1={f1} f2={f2} f3={f3} beneish={beneish} periodLabels={activeCompany.periodLabels} companyName={activeCompany.name} onNavigate={setActiveTab} onOpenAI={openAI('podsumowanie', t('analysis.summary'))} />}
        {activeTab === 'bilans_str'      && <BilansStruktura      bilans={activeCompany.bilans} f1={f1} f2={f2} f3={f3} />}
        {activeTab === 'rzis_str'        && <RZiSStruktura        rzis={activeCompany.rzis}    f1={f1} f2={f2} f3={f3} />}
      </div>

      {aiModal && (
        <AIAnalysisModal
          section={aiModal.section}
          sectionLabel={aiModal.sectionLabel}
          lang={lang}
          period={activeCompany.period}
          data={aiModal.data}
          cacheKey={`ai_ratio_${activeCompany.id}_${aiModal.section}_${activeCompany.period}_${lang}`}
          onClose={() => setAiModal(null)}
        />
      )}
    </div>
  );
}

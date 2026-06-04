import { useState, useMemo } from 'react';
import { useCompanies } from '../store/CompaniesContext';
import { mapFields, type FieldMap } from '../lib/fieldMapping';
import {
  PlynnostChart, SprawnostChart, ZadluzenieChart, RentownoscChart,
  BilansStruktura, RZiSStruktura,
} from './AnalysisCharts';

// ── Sub-tab type ──────────────────────────────────────────────────────────────

type SubTab =
  | 'plynnosc'
  | 'sprawnosc'
  | 'zadluzenie'
  | 'rentownosc'
  | 'dyskryminacyjne'
  | 'bilans_str'
  | 'rzis_str'
  | 'mapowanie';

const SUB_TABS: { key: SubTab; label: string; group: string }[] = [
  { key: 'plynnosc',         label: 'Płynność',           group: 'Wskaźniki' },
  { key: 'sprawnosc',        label: 'Sprawność',          group: 'Wskaźniki' },
  { key: 'zadluzenie',       label: 'Zadłużenie',         group: 'Wskaźniki' },
  { key: 'rentownosc',       label: 'Rentowność',         group: 'Wskaźniki' },
  { key: 'dyskryminacyjne',  label: 'Dyskryminacyjne',    group: 'Wskaźniki' },
  { key: 'bilans_str',       label: 'Bilans',             group: 'Struktura' },
  { key: 'rzis_str',         label: 'RZiS',               group: 'Struktura' },
  { key: 'mapowanie',        label: 'Mapowanie',          group: 'Narzędzia' },
];

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

type Grade = 'DOBRY' | 'UWAGA' | 'SŁABY' | 'BRAK';

/**
 * @param v   – computed value (null = brak danych)
 * @param lo  – lower bound of norm (null = no lower bound)
 * @param hi  – upper bound of norm (null = no upper bound)
 * @param reverse – true for "lower is better" indicators (e.g. debt ratios where hi is max)
 */
function grade(
  v: number | null,
  lo: number | null,
  hi: number | null,
): Grade {
  if (v === null) return 'BRAK';
  const margin = 0.30; // 30% tolerance for UWAGA

  const tooLow  = lo !== null && v < lo;
  const tooHigh = hi !== null && v > hi;

  if (!tooLow && !tooHigh) return 'DOBRY';

  // check 30% outside
  if (tooLow) {
    const pct = (lo! - v) / Math.abs(lo!);
    return pct <= margin ? 'UWAGA' : 'SŁABY';
  }
  // tooHigh
  const pct = (v - hi!) / Math.abs(hi!);
  return pct <= margin ? 'UWAGA' : 'SŁABY';
}

/** For "lower is better": good if v < threshold */
function gradeLower(v: number | null, threshold: number): Grade {
  if (v === null) return 'BRAK';
  if (v < threshold) return 'DOBRY';
  const pct = (v - threshold) / Math.abs(threshold);
  return pct <= 0.30 ? 'UWAGA' : 'SŁABY';
}

/** For "higher is better": good if v > threshold */
function gradeHigher(v: number | null, threshold: number): Grade {
  if (v === null) return 'BRAK';
  if (v > threshold) return 'DOBRY';
  const pct = (threshold - v) / Math.abs(threshold);
  return pct <= 0.30 ? 'UWAGA' : 'SŁABY';
}

function Badge({ g }: { g: Grade }) {
  const cls: Record<Grade, string> = {
    DOBRY: 'bg-emerald-100 text-emerald-700 border border-emerald-200',
    UWAGA: 'bg-amber-100  text-amber-700  border border-amber-200',
    SŁABY: 'bg-red-100    text-red-700    border border-red-200',
    BRAK:  'bg-slate-100  text-slate-500  border border-slate-200',
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${cls[g]}`}>
      {g}
    </span>
  );
}

// ── Indicator row interface ───────────────────────────────────────────────────

interface Indicator {
  name: string;
  formula: string;
  val1: string;
  val2: string;
  norm: string;
  grade1: Grade;
}

// ── Table component ───────────────────────────────────────────────────────────

function IndicatorTable({ rows }: { rows: Indicator[] }) {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
      {/* Header */}
      <div className="grid grid-cols-[1fr_auto_auto_auto_auto] gap-0 bg-slate-50 border-b border-slate-200 px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">
        <div>Wskaźnik</div>
        <div className="w-24 text-right">Wartość P1</div>
        <div className="w-24 text-right">Wartość P2</div>
        <div className="w-28 text-center">Norma</div>
        <div className="w-20 text-center">Ocena P1</div>
      </div>
      <div className="divide-y divide-slate-100">
        {rows.map((row, i) => (
          <div
            key={i}
            className="grid grid-cols-[1fr_auto_auto_auto_auto] gap-0 px-4 py-3 hover:bg-slate-50/60 transition-colors items-center"
          >
            <div>
              <p className="text-sm font-semibold text-slate-800">{row.name}</p>
              <p className="text-xs text-slate-400 mt-0.5 font-mono">{row.formula}</p>
            </div>
            <div className="w-24 text-right text-sm font-mono text-slate-700">{row.val1}</div>
            <div className="w-24 text-right text-sm font-mono text-slate-500">{row.val2}</div>
            <div className="w-28 text-center text-xs text-slate-500">{row.norm}</div>
            <div className="w-20 text-center"><Badge g={row.grade1} /></div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Płynność finansowa ────────────────────────────────────────────────────────

function PlynnostTab({ f1, f2 }: { f1: FieldMap; f2: FieldMap }) {
  const rows: Indicator[] = useMemo(() => [
    {
      name: 'Wskaźnik bieżącej płynności',
      formula: 'Aktywa obrotowe / Zobowiązania krótkoterminowe',
      val1: fmtRatio(safe(f1.aktywaObrotowe, f1.zobowiazaniaKrotko)),
      val2: fmtRatio(safe(f2.aktywaObrotowe, f2.zobowiazaniaKrotko)),
      norm: '1.2 – 2.0',
      grade1: grade(safe(f1.aktywaObrotowe, f1.zobowiazaniaKrotko), 1.2, 2.0),
    },
    {
      name: 'Wskaźnik szybki (Quick Ratio)',
      formula: '(Aktywa obrotowe − Zapasy) / Zobowiązania krótkoterminowe',
      val1: fmtRatio(safe(f1.aktywaObrotowe - f1.zapasy, f1.zobowiazaniaKrotko)),
      val2: fmtRatio(safe(f2.aktywaObrotowe - f2.zapasy, f2.zobowiazaniaKrotko)),
      norm: '0.7 – 1.2',
      grade1: grade(safe(f1.aktywaObrotowe - f1.zapasy, f1.zobowiazaniaKrotko), 0.7, 1.2),
    },
    {
      name: 'Wskaźnik gotówkowy (Cash Ratio)',
      formula: 'Środki pieniężne / Zobowiązania krótkoterminowe',
      val1: fmtRatio(safe(f1.srodkiPieniezne, f1.zobowiazaniaKrotko)),
      val2: fmtRatio(safe(f2.srodkiPieniezne, f2.zobowiazaniaKrotko)),
      norm: '0.1 – 0.2',
      grade1: grade(safe(f1.srodkiPieniezne, f1.zobowiazaniaKrotko), 0.1, 0.2),
    },
  ], [f1, f2]);

  return (
    <div className="space-y-4">
      <PlynnostChart f1={f1} f2={f2} />
      <IndicatorTable rows={rows} />
    </div>
  );
}

// ── Sprawność działania ───────────────────────────────────────────────────────

function SprawnostTab({ f1, f2 }: { f1: FieldMap; f2: FieldMap }) {
  const rows: Indicator[] = useMemo(() => {
    const rot1Nal  = safe(f1.naleznosci,         f1.przychody) !== null ? (f1.naleznosci / f1.przychody) * 360 : null;
    const rot2Nal  = safe(f2.naleznosci,         f2.przychody) !== null ? (f2.naleznosci / f2.przychody) * 360 : null;
    const rot1Zap  = safe(f1.zapasy,             f1.cogs)      !== null ? (f1.zapasy / f1.cogs) * 360 : null;
    const rot2Zap  = safe(f2.zapasy,             f2.cogs)      !== null ? (f2.zapasy / f2.cogs) * 360 : null;
    const rot1Zob  = safe(f1.zobowiazaniaKrotko, f1.cogs)      !== null ? (f1.zobowiazaniaKrotko / f1.cogs) * 360 : null;
    const rot2Zob  = safe(f2.zobowiazaniaKrotko, f2.cogs)      !== null ? (f2.zobowiazaniaKrotko / f2.cogs) * 360 : null;

    const ccc1 = (rot1Nal !== null && rot1Zap !== null && rot1Zob !== null)
      ? rot1Nal + rot1Zap - rot1Zob : null;
    const ccc2 = (rot2Nal !== null && rot2Zap !== null && rot2Zob !== null)
      ? rot2Nal + rot2Zap - rot2Zob : null;

    return [
      {
        name: 'Rotacja aktywów ogółem',
        formula: 'Przychody / (Aktywa trwałe + Aktywa obrotowe)',
        val1: fmtRatio(safe(f1.przychody, f1.aktywaTrwale + f1.aktywaObrotowe)),
        val2: fmtRatio(safe(f2.przychody, f2.aktywaTrwale + f2.aktywaObrotowe)),
        norm: '> 1.0',
        grade1: gradeHigher(safe(f1.przychody, f1.aktywaTrwale + f1.aktywaObrotowe), 1.0),
      },
      {
        name: 'Rotacja aktywów obrotowych',
        formula: 'Przychody / Aktywa obrotowe',
        val1: fmtRatio(safe(f1.przychody, f1.aktywaObrotowe)),
        val2: fmtRatio(safe(f2.przychody, f2.aktywaObrotowe)),
        norm: '> 2.0',
        grade1: gradeHigher(safe(f1.przychody, f1.aktywaObrotowe), 2.0),
      },
      {
        name: 'Rotacja aktywów trwałych',
        formula: 'Przychody / Aktywa trwałe',
        val1: fmtRatio(safe(f1.przychody, f1.aktywaTrwale)),
        val2: fmtRatio(safe(f2.przychody, f2.aktywaTrwale)),
        norm: '> 3.0',
        grade1: gradeHigher(safe(f1.przychody, f1.aktywaTrwale), 3.0),
      },
      {
        name: 'Rotacja zapasów',
        formula: 'Zapasy / COGS × 360  [dni]',
        val1: fmtDays(rot1Zap),
        val2: fmtDays(rot2Zap),
        norm: '30 – 90 dni',
        grade1: grade(rot1Zap, 30, 90),
      },
      {
        name: 'Rotacja należności',
        formula: 'Należności / Przychody × 360  [dni]',
        val1: fmtDays(rot1Nal),
        val2: fmtDays(rot2Nal),
        norm: '30 – 60 dni',
        grade1: grade(rot1Nal, 30, 60),
      },
      {
        name: 'Rotacja zobowiązań',
        formula: 'Zobow. krótkoterm. / COGS × 360  [dni]',
        val1: fmtDays(rot1Zob),
        val2: fmtDays(rot2Zob),
        norm: '30 – 60 dni',
        grade1: grade(rot1Zob, 30, 60),
      },
      {
        name: 'Cykl konwersji gotówki',
        formula: 'Rot. należn. + Rot. zapasów − Rot. zobow.  [dni]',
        val1: fmtDays(ccc1),
        val2: fmtDays(ccc2),
        norm: 'niższy = lepiej',
        grade1: ccc1 === null ? 'BRAK' : ccc1 < 60 ? 'DOBRY' : ccc1 < 90 ? 'UWAGA' : 'SŁABY',
      },
    ];
  }, [f1, f2]);

  return (
    <div className="space-y-4">
      <SprawnostChart f1={f1} f2={f2} />
      <IndicatorTable rows={rows} />
    </div>
  );
}

// ── Zadłużenie ────────────────────────────────────────────────────────────────

function ZadluzenieTab({ f1, f2 }: { f1: FieldMap; f2: FieldMap }) {
  const rows: Indicator[] = useMemo(() => {
    const totalDebt1 = f1.zobowiazaniaDlugo + f1.zobowiazaniaKrotko;
    const totalDebt2 = f2.zobowiazaniaDlugo + f2.zobowiazaniaKrotko;

    const ebitda1 = f1.ebit + f1.amortyzacja;
    const ebitda2 = f2.ebit + f2.amortyzacja;

    const dfl1 = (f1.ebit > 0 && f1.zyskBrutto > 0)
      ? safe(f1.ebit, f1.zyskBrutto) : null;
    const dfl2 = (f2.ebit > 0 && f2.zyskBrutto > 0)
      ? safe(f2.ebit, f2.zyskBrutto) : null;

    const icr1 = f1.odsetki !== 0 ? safe(ebitda1, f1.odsetki) : null;
    const icr2 = f2.odsetki !== 0 ? safe(ebitda2, f2.odsetki) : null;

    const netDebt1 = f1.kredytDlugo + f1.kredytKrotko - f1.srodkiPieniezne;
    const netDebt2 = f2.kredytDlugo + f2.kredytKrotko - f2.srodkiPieniezne;
    const nd_ebitda1 = ebitda1 !== 0 ? safe(netDebt1, ebitda1) : null;
    const nd_ebitda2 = ebitda2 !== 0 ? safe(netDebt2, ebitda2) : null;

    return [
      {
        name: 'Wskaźnik ogólnego zadłużenia',
        formula: '(Zobow. długoterm. + Zobow. krótkoterm.) / Aktywa razem',
        val1: fmtRatio(safe(totalDebt1, f1.aktywaRazem)),
        val2: fmtRatio(safe(totalDebt2, f2.aktywaRazem)),
        norm: '0.4 – 0.6',
        grade1: grade(safe(totalDebt1, f1.aktywaRazem), 0.4, 0.6),
      },
      {
        name: 'Zadłużenie kapitału własnego',
        formula: '(Zobow. dług. + Zobow. krótk.) / Kapitał własny',
        val1: fmtRatio(safe(totalDebt1, f1.kapitalWlasny)),
        val2: fmtRatio(safe(totalDebt2, f2.kapitalWlasny)),
        norm: '0.5 – 1.0',
        grade1: grade(safe(totalDebt1, f1.kapitalWlasny), 0.5, 1.0),
      },
      {
        name: 'Zadłużenie długoterminowe',
        formula: 'Zobow. długoterminowe / Kapitał własny',
        val1: fmtRatio(safe(f1.zobowiazaniaDlugo, f1.kapitalWlasny)),
        val2: fmtRatio(safe(f2.zobowiazaniaDlugo, f2.kapitalWlasny)),
        norm: '0.2 – 0.5',
        grade1: grade(safe(f1.zobowiazaniaDlugo, f1.kapitalWlasny), 0.2, 0.5),
      },
      {
        name: 'Zadłużenie krótkoterminowe',
        formula: 'Zobow. krótkoterminowe / Kapitał własny',
        val1: fmtRatio(safe(f1.zobowiazaniaKrotko, f1.kapitalWlasny)),
        val2: fmtRatio(safe(f2.zobowiazaniaKrotko, f2.kapitalWlasny)),
        norm: '0.3 – 0.6',
        grade1: grade(safe(f1.zobowiazaniaKrotko, f1.kapitalWlasny), 0.3, 0.6),
      },
      {
        name: 'Dźwignia finansowa (DFL)',
        formula: 'EBIT / Zysk brutto',
        val1: dfl1 !== null ? fmtRatio(dfl1) : '—',
        val2: dfl2 !== null ? fmtRatio(dfl2) : '—',
        norm: '1.0 – 1.5',
        grade1: dfl1 !== null ? grade(dfl1, 1.0, 1.5) : 'BRAK',
      },
      {
        name: 'Pokrycie odsetek (EBITDA/Odsetki)',
        formula: '(EBIT + Amortyzacja) / Odsetki',
        val1: fmtRatio(icr1),
        val2: fmtRatio(icr2),
        norm: '> 3.0',
        grade1: icr1 !== null ? gradeHigher(icr1, 3.0) : 'BRAK',
      },
      {
        name: 'Dług netto / EBITDA',
        formula: '(Kredyty dług. + Kredyty krótk. − Środki pien.) / EBITDA',
        val1: fmtRatio(nd_ebitda1),
        val2: fmtRatio(nd_ebitda2),
        norm: '< 3.0',
        grade1: nd_ebitda1 !== null ? gradeLower(nd_ebitda1, 3.0) : 'BRAK',
      },
    ];
  }, [f1, f2]);

  return (
    <div className="space-y-4">
      <ZadluzenieChart f1={f1} f2={f2} />
      <IndicatorTable rows={rows} />
    </div>
  );
}

// ── Rentowność ────────────────────────────────────────────────────────────────

function RentownoscTab({ f1, f2 }: { f1: FieldMap; f2: FieldMap }) {
  const rows: Indicator[] = useMemo(() => {
    const ebitda1 = f1.ebit + f1.amortyzacja;
    const ebitda2 = f2.ebit + f2.amortyzacja;

    const roe1  = safe(f1.zyskNetto,  f1.kapitalWlasny);
    const roe2  = safe(f2.zyskNetto,  f2.kapitalWlasny);
    const roa1  = safe(f1.zyskNetto,  f1.aktywaRazem);
    const roa2  = safe(f2.zyskNetto,  f2.aktywaRazem);
    const ros1  = safe(f1.zyskNetto,  f1.przychody);
    const ros2  = safe(f2.zyskNetto,  f2.przychody);
    const mgb1  = safe(f1.zyskBrutto, f1.przychody);
    const mgb2  = safe(f2.zyskBrutto, f2.przychody);
    const ebitm1 = safe(f1.ebit,     f1.przychody);
    const ebitm2 = safe(f2.ebit,     f2.przychody);
    const ebitdam1 = safe(ebitda1,   f1.przychody);
    const ebitdam2 = safe(ebitda2,   f2.przychody);

    function pct(v: number | null): number | null {
      return v !== null ? v * 100 : null;
    }

    return [
      {
        name: 'ROE (Rentowność kapitału własnego)',
        formula: 'Zysk netto / Kapitał własny × 100',
        val1: fmtPct(pct(roe1)),
        val2: fmtPct(pct(roe2)),
        norm: '> 10%',
        grade1: gradeHigher(pct(roe1), 10),
      },
      {
        name: 'ROA (Rentowność aktywów)',
        formula: 'Zysk netto / Aktywa razem × 100',
        val1: fmtPct(pct(roa1)),
        val2: fmtPct(pct(roa2)),
        norm: '> 5%',
        grade1: gradeHigher(pct(roa1), 5),
      },
      {
        name: 'ROS (Marża netto)',
        formula: 'Zysk netto / Przychody × 100',
        val1: fmtPct(pct(ros1)),
        val2: fmtPct(pct(ros2)),
        norm: '> 5%',
        grade1: gradeHigher(pct(ros1), 5),
      },
      {
        name: 'Marża brutto',
        formula: 'Zysk brutto / Przychody × 100',
        val1: fmtPct(pct(mgb1)),
        val2: fmtPct(pct(mgb2)),
        norm: '> 8%',
        grade1: gradeHigher(pct(mgb1), 8),
      },
      {
        name: 'Marża operacyjna (EBIT)',
        formula: 'EBIT / Przychody × 100',
        val1: fmtPct(pct(ebitm1)),
        val2: fmtPct(pct(ebitm2)),
        norm: '> 5%',
        grade1: gradeHigher(pct(ebitm1), 5),
      },
      {
        name: 'Marża EBITDA',
        formula: '(EBIT + Amortyzacja) / Przychody × 100',
        val1: fmtPct(pct(ebitdam1)),
        val2: fmtPct(pct(ebitdam2)),
        norm: '> 8%',
        grade1: gradeHigher(pct(ebitdam1), 8),
      },
    ];
  }, [f1, f2]);

  return (
    <div className="space-y-4">
      <RentownoscChart f1={f1} f2={f2} />
      <IndicatorTable rows={rows} />
    </div>
  );
}

// ── Dyskryminacyjne ───────────────────────────────────────────────────────────

interface ModelResult {
  name: string;
  description: string;
  val1: number | null;
  val2: number | null;
  classification: (v: number | null) => string;
  grade: (v: number | null) => Grade;
}

function classifyHolda(v: number | null): string {
  if (v === null) return '—';
  return v > 0 ? 'Brak zagrożenia upadłością' : 'Zagrożenie upadłością';
}
function gradeHolda(v: number | null): Grade {
  if (v === null) return 'BRAK';
  return v > 0 ? 'DOBRY' : 'SŁABY';
}

function classifyGajdka(v: number | null): string {
  if (v === null) return '—';
  if (v > 0.45) return 'Sytuacja bezpieczna';
  if (v < 0)    return 'Zagrożenie upadłością';
  return 'Strefa szara (0 – 0.45)';
}
function gradeGajdka(v: number | null): Grade {
  if (v === null) return 'BRAK';
  if (v > 0.45) return 'DOBRY';
  if (v < 0)    return 'SŁABY';
  return 'UWAGA';
}

function classifyPrusak(v: number | null): string {
  if (v === null) return '—';
  return v > 0 ? 'Sytuacja bezpieczna' : 'Zagrożenie upadłością';
}
function gradePrusak(v: number | null): Grade {
  if (v === null) return 'BRAK';
  return v > 0 ? 'DOBRY' : 'SŁABY';
}

function classifyMaczynska(v: number | null): string {
  if (v === null) return '—';
  if (v > 9) return 'Dobra kondycja (> 9)';
  if (v > 6) return 'Kondycja średnia (6 – 9)';
  if (v > 3) return 'Kondycja zła (3 – 6)';
  return 'Zagrożenie upadłością (< 3)';
}
function gradeMaczynska(v: number | null): Grade {
  if (v === null) return 'BRAK';
  if (v > 9) return 'DOBRY';
  if (v > 6) return 'UWAGA';
  if (v > 3) return 'SŁABY';
  return 'SŁABY';
}

function classifyJagiello(v: number | null): string {
  if (v === null) return '—';
  return v > 0 ? 'Sytuacja bezpieczna' : 'Zagrożenie upadłością';
}
function gradeJagiello(v: number | null): Grade {
  if (v === null) return 'BRAK';
  return v > 0 ? 'DOBRY' : 'SŁABY';
}

function calcHolda(f: FieldMap): number | null {
  if (f.aktywaRazem === 0 || f.cogs === 0) return null;
  const v =
    0.605 +
    0.681 * (f.aktywaObrotowe / f.zobowiazaniaKrotko) -
    0.0196 * ((f.zobowiazaniaDlugo + f.zobowiazaniaKrotko) * 100 / f.aktywaRazem) +
    0.157 * (f.przychody / f.aktywaRazem) +
    0.00969 * (f.zyskNetto * 100 / f.aktywaRazem) +
    0.000672 * (f.zobowiazaniaKrotko * 360 / f.cogs);
  return isFinite(v) ? v : null;
}

function calcGajdka(f: FieldMap): number | null {
  if (f.aktywaRazem === 0 || f.cogs === 0 || f.przychody === 0) return null;
  const v =
    0.7732059 -
    0.856425 * (f.przychody / f.aktywaRazem) +
    0.0007747 * (f.zobowiazaniaKrotko * 360 / f.cogs) +
    0.9220985 * (f.zyskNetto / f.aktywaRazem) +
    0.6535995 * (f.zyskBrutto / f.przychody) -
    0.594687 * ((f.zobowiazaniaDlugo + f.zobowiazaniaKrotko) / f.aktywaRazem);
  return isFinite(v) ? v : null;
}

function calcPrusak(f: FieldMap): number | null {
  const totalDebt = f.zobowiazaniaDlugo + f.zobowiazaniaKrotko;
  if (totalDebt === 0 || f.zobowiazaniaKrotko === 0 || f.pasywaBilans === 0) return null;
  const v =
    1.4383 * ((f.zyskNetto + f.amortyzacja) / totalDebt) +
    0.1878 * (f.kosztyOper / f.zobowiazaniaKrotko) +
    5.0229 * (f.zyskZeSprz / f.pasywaBilans) -
    1.8713;
  return isFinite(v) ? v : null;
}

function calcPoznanska(f: FieldMap): number | null {
  if (f.pasywaBilans === 0 || f.zobowiazaniaKrotko === 0 || f.przychody === 0) return null;
  const v =
    3.562 * (f.zyskNetto / f.pasywaBilans) +
    1.588 * ((f.aktywaObrotowe - f.zapasy) / f.zobowiazaniaKrotko) +
    4.288 * (f.kapitalWlasny / f.pasywaBilans) +
    6.719 * (f.zyskZeSprz / f.przychody) -
    2.368;
  return isFinite(v) ? v : null;
}

function calcMaczynska(f: FieldMap): number | null {
  const totalDebt = f.zobowiazaniaDlugo + f.zobowiazaniaKrotko;
  if (totalDebt === 0 || f.pasywaBilans === 0 || f.przychody === 0 || f.aktywaRazem === 0) return null;
  const v =
    1.5 * ((f.zyskBrutto + f.amortyzacja) / totalDebt) +
    0.08 * (f.pasywaBilans / totalDebt) +
    10 * (f.zyskBrutto / f.pasywaBilans) +
    5 * (f.zyskBrutto / f.przychody) +
    0.3 * (f.zapasy / f.przychody) +
    0.1 * (f.przychody / f.aktywaRazem);
  return isFinite(v) ? v : null;
}

function calcJagiello(f: FieldMap): number | null {
  if (f.zobowiazaniaKrotko === 0 || f.aktywaRazem === 0) return null;
  const v =
    -3.237 +
    3.638 * (f.srodkiPieniezne / f.zobowiazaniaKrotko) +
    2.473 * ((f.kapitalWlasny - f.zobowiazaniaDlugo) / f.aktywaRazem) +
    0.479 * (f.przychody / f.aktywaRazem) +
    0.404 * (f.kapitalWlasny / f.zobowiazaniaKrotko);
  return isFinite(v) ? v : null;
}

function DyskryminacyjneTab({ f1, f2 }: { f1: FieldMap; f2: FieldMap }) {
  const models: ModelResult[] = useMemo(() => {
    const m1 = f1;
    const m2 = f2;
    return [
      {
        name: 'Model Hołdy (Z_H)',
        description:
          '0.605 + 0.681×(AO/ZK) − 0.0196×(ZD+ZK)×100/AR + 0.157×P/AR + 0.00969×ZN×100/AR + 0.000672×ZK×360/COGS',
        val1: calcHolda(m1),
        val2: calcHolda(m2),
        classification: classifyHolda,
        grade: gradeHolda,
      },
      {
        name: 'Model Gajdki i Stosa (Z_GS)',
        description:
          '0.773 − 0.856×P/AR + 0.000775×ZK×360/COGS + 0.922×ZN/AR + 0.654×ZB/P − 0.595×(ZD+ZK)/AR',
        val1: calcGajdka(m1),
        val2: calcGajdka(m2),
        classification: classifyGajdka,
        grade: gradeGajdka,
      },
      {
        name: 'Model Prusaka BP2',
        description:
          '1.438×(ZN+Am)/(ZD+ZK) + 0.188×KO/ZK + 5.023×ZSp/Pasywa − 1.871',
        val1: calcPrusak(m1),
        val2: calcPrusak(m2),
        classification: classifyPrusak,
        grade: gradePrusak,
      },
      {
        name: 'Model Poznańska (Z_HCP)',
        description:
          '3.562×ZN/Pasywa + 1.588×(AO−Z)/ZK + 4.288×KW/Pasywa + 6.719×ZSp/P − 2.368',
        val1: calcPoznanska(m1),
        val2: calcPoznanska(m2),
        classification: classifyPrusak, // same logic: >0 safe, <0 danger
        grade: gradePrusak,
      },
      {
        name: 'Model Mączyńskiej (Z_M)',
        description:
          '1.5×(ZB+Am)/(ZD+ZK) + 0.08×Pasywa/(ZD+ZK) + 10×ZB/Pasywa + 5×ZB/P + 0.3×Z/P + 0.1×P/AR',
        val1: calcMaczynska(m1),
        val2: calcMaczynska(m2),
        classification: classifyMaczynska,
        grade: gradeMaczynska,
      },
      {
        name: 'Model Jagiełły (sektor handlowy)',
        description:
          '−3.237 + 3.638×SP/ZK + 2.473×(KW−ZD)/AR + 0.479×P/AR + 0.404×KW/ZK',
        val1: calcJagiello(m1),
        val2: calcJagiello(m2),
        classification: classifyJagiello,
        grade: gradeJagiello,
      },
    ];
  }, [f1, f2]);

  return (
    <div className="space-y-4">
      {models.map((model) => (
        <div
          key={model.name}
          className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden"
        >
          <div className="bg-slate-50 border-b border-slate-200 px-4 py-3">
            <h3 className="text-sm font-bold text-slate-800">{model.name}</h3>
            <p className="text-xs text-slate-400 font-mono mt-0.5">{model.description}</p>
          </div>
          <div className="grid grid-cols-2 divide-x divide-slate-100">
            {/* Period 1 */}
            <div className="px-4 py-4 flex flex-col gap-2">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Okres P1</p>
              <div className="flex items-baseline gap-3">
                <span className="text-2xl font-bold text-slate-800 font-mono">
                  {model.val1 !== null && isFinite(model.val1) ? model.val1.toFixed(3) : '—'}
                </span>
                <Badge g={model.grade(model.val1)} />
              </div>
              <p className="text-sm text-slate-600">{model.classification(model.val1)}</p>
            </div>
            {/* Period 2 */}
            <div className="px-4 py-4 flex flex-col gap-2">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Okres P2</p>
              <div className="flex items-baseline gap-3">
                <span className="text-2xl font-bold text-slate-800 font-mono">
                  {model.val2 !== null && isFinite(model.val2) ? model.val2.toFixed(3) : '—'}
                </span>
                <Badge g={model.grade(model.val2)} />
              </div>
              <p className="text-sm text-slate-600">{model.classification(model.val2)}</p>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Mapowanie pól ─────────────────────────────────────────────────────────────

const FIELD_LABELS: Record<string, string> = {
  aktywaTrwale:       'Aktywa trwałe',
  aktywaObrotowe:     'Aktywa obrotowe',
  zapasy:             'Zapasy',
  naleznosci:         'Należności',
  srodkiPieniezne:    'Środki pieniężne',
  aktywaRazem:        'Aktywa razem',
  kapitalWlasny:      'Kapitał własny',
  zobowiazaniaDlugo:  'Zobowiązania długoterminowe',
  zobowiazaniaKrotko: 'Zobowiązania krótkoterminowe',
  pasywaBilans:       'Pasywa razem',
  kredytDlugo:        'Kredyty / pożyczki długoterminowe',
  kredytKrotko:       'Kredyty / pożyczki krótkoterminowe',
  przychody:          'Przychody ze sprzedaży',
  kosztyOper:         'Koszty działalności operacyjnej',
  amortyzacja:        'Amortyzacja',
  cogs:               'Wartość sprzedanych towarów (COGS)',
  zyskZeSprz:         'Zysk ze sprzedaży',
  ebit:               'EBIT (zysk operacyjny)',
  odsetki:            'Odsetki / koszty finansowe',
  zyskBrutto:         'Zysk brutto',
  zyskNetto:          'Zysk netto',
};

function MapowanieTab({ sources }: { sources: FieldMap['sources'] }) {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
      <div className="grid grid-cols-[auto_1fr_auto] gap-0 bg-slate-50 border-b border-slate-200 px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">
        <div className="w-48">Pole</div>
        <div>Dopasowana nazwa wiersza</div>
        <div className="w-20 text-center">Status</div>
      </div>
      <div className="divide-y divide-slate-100">
        {Object.entries(sources).map(([key, src]) => (
          <div
            key={key}
            className="grid grid-cols-[auto_1fr_auto] gap-0 px-4 py-2.5 hover:bg-slate-50/60 transition-colors items-center"
          >
            <div className="w-48 text-sm font-semibold text-slate-700">
              {FIELD_LABELS[key] ?? key}
            </div>
            <div className="text-sm text-slate-500 font-mono truncate pr-4">{src.name}</div>
            <div className="w-20 text-center">
              {src.found ? (
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-700 border border-emerald-200">
                  OK
                </span>
              ) : (
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-red-100 text-red-700 border border-red-200">
                  BRAK
                </span>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function RatioAnalysis() {
  const { activeCompany } = useCompanies();
  const [activeTab, setActiveTab] = useState<SubTab>('plynnosc');

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

  if (!activeCompany || !f1 || !f2) {
    return (
      <div className="flex-1 flex items-center justify-center text-slate-400 text-sm">
        Brak danych — zaimportuj firmę.
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
              P1 = Okres bieżący
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-slate-300 inline-block" />
              P2 = Okres porównawczy
            </span>
          </div>
        </div>

        {/* Sub-tabs */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-2 flex flex-wrap gap-1 items-center">
          {(['Wskaźniki', 'Struktura', 'Narzędzia'] as const).map((group, gi) => (
            <div key={group} className="flex items-center gap-1">
              {gi > 0 && <div className="w-px h-5 bg-slate-200 mx-1" />}
              <span className="text-[10px] text-slate-400 font-semibold uppercase tracking-wide px-1 hidden sm:inline select-none">
                {group}
              </span>
              {SUB_TABS.filter(t => t.group === group).map(tab => {
                const active = activeTab === tab.key;
                const colorOn = group === 'Wskaźniki'
                  ? 'bg-emerald-600 text-white shadow-sm'
                  : group === 'Struktura'
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'bg-slate-600 text-white shadow-sm';
                return (
                  <button
                    key={tab.key}
                    onClick={() => setActiveTab(tab.key)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                      active ? colorOn : 'text-slate-600 hover:bg-slate-100'
                    }`}
                  >
                    {tab.label}
                  </button>
                );
              })}
            </div>
          ))}
        </div>

        {/* Content */}
        {activeTab === 'plynnosc'        && <PlynnostTab          f1={f1} f2={f2} />}
        {activeTab === 'sprawnosc'       && <SprawnostTab         f1={f1} f2={f2} />}
        {activeTab === 'zadluzenie'      && <ZadluzenieTab        f1={f1} f2={f2} />}
        {activeTab === 'rentownosc'      && <RentownoscTab        f1={f1} f2={f2} />}
        {activeTab === 'dyskryminacyjne' && <DyskryminacyjneTab   f1={f1} f2={f2} />}
        {activeTab === 'bilans_str'      && <BilansStruktura      bilans={activeCompany.bilans} f1={f1} f2={f2} />}
        {activeTab === 'rzis_str'        && <RZiSStruktura        rzis={activeCompany.rzis}    f1={f1} f2={f2} />}
        {activeTab === 'mapowanie'       && <MapowanieTab         sources={f1.sources} />}
      </div>
    </div>
  );
}

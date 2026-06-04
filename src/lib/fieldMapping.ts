import type { ReportRow } from '../types';

export interface FieldMap {
  // BIL – Aktywa
  aktywaTrwale: number;
  aktywaObrotowe: number;
  zapasy: number;
  naleznosci: number;
  srodkiPieniezne: number;
  aktywaRazem: number;
  // BIL – Pasywa
  kapitalWlasny: number;
  zobowiazaniaDlugo: number;
  zobowiazaniaKrotko: number;
  pasywaBilans: number;
  kredytDlugo: number;
  kredytKrotko: number;
  // RZiS
  przychody: number;
  kosztyOper: number;
  amortyzacja: number;
  cogs: number;
  zyskZeSprz: number;
  ebit: number;
  odsetki: number;
  zyskBrutto: number;
  zyskNetto: number;
  // Diagnostics
  sources: Record<string, { found: boolean; name: string }>;
}

function n(row: ReportRow | undefined, period: 1 | 2): number {
  if (!row) return 0;
  return period === 1 ? row.values.period1 : row.values.period2;
}

function lo(row: ReportRow): string {
  return row.name.toLowerCase();
}

function find(
  rows: ReportRow[],
  pred: (row: ReportRow) => boolean,
): ReportRow | undefined {
  return rows.find(pred);
}

export function mapFields(
  bilans: ReportRow[],
  rzis: ReportRow[],
  period: 1 | 2,
): FieldMap {
  // ── BILANS rows ──────────────────────────────────────────────────────────

  const rowAktywaTrwale = find(
    bilans,
    r => r.level === 1 && lo(r).includes('aktyw') && lo(r).includes('trwał'),
  );

  const rowAktywaObrotowe = find(
    bilans,
    r => r.level === 1 && lo(r).includes('aktyw') && lo(r).includes('obrotow'),
  );

  const rowZapasy = find(bilans, r => lo(r).includes('zapas'));

  const rowNaleznosci = find(bilans, r => {
    const s = lo(r);
    if (s.includes('należności krótkoterminow')) return true;
    if (s.includes('należności') && s.includes('odbiorcó')) return true;
    if (s.includes('należności') && r.level >= 2) return true;
    return false;
  }) ?? find(bilans, r => lo(r).includes('należności'));

  const rowSrodkiPieniezne = find(bilans, r =>
    lo(r).includes('środki pieniężne'),
  );

  // level-0 rows: first is aktywa total, second is pasywa total
  const level0rows = bilans.filter(r => r.level === 0);
  const rowAktywaRazem =
    level0rows.find(r => lo(r).includes('aktyw')) ??
    level0rows[0];

  const rowKapitalWlasny = find(
    bilans,
    r =>
      r.level === 1 &&
      lo(r).includes('kapitał') &&
      (lo(r).includes('własn') || lo(r).includes('fundusz')),
  );

  const rowZobowiazaniaDlugo = find(bilans, r =>
    lo(r).includes('zobowiązania długoterminow'),
  );

  const rowZobowiazaniaKrotko = find(bilans, r =>
    lo(r).includes('zobowiązania krótkoterminow'),
  );

  const rowPasywa =
    level0rows.find(r => lo(r).includes('pasyw')) ??
    level0rows[1];

  const rowKredytDlugo = find(bilans, r => {
    const s = lo(r);
    return (
      (s.includes('kredyt') || s.includes('pożyczk')) &&
      (s.includes('długoterminow') || s.includes('długookres'))
    );
  });

  const rowKredytKrotko = find(bilans, r => {
    const s = lo(r);
    return (
      (s.includes('kredyt') || s.includes('pożyczk')) &&
      s.includes('krótkoterminow')
    );
  });

  // ── RZiS rows ────────────────────────────────────────────────────────────

  const rowPrzychody = find(rzis, r => {
    const s = lo(r);
    if (r.level > 2) return false;
    if (s.includes('przychody netto ze sprzedaży')) return true;
    if (s.includes('przychody') && s.includes('sprzedaży')) return true;
    return false;
  });

  const rowKosztyOper = find(rzis, r =>
    lo(r).includes('koszty działalności operacyjnej'),
  );

  const rowAmortyzacja = find(rzis, r => lo(r).includes('amortyzacja'));

  const rowCogs = find(rzis, r => {
    const s = lo(r);
    if (s.includes('wartość sprzedanych')) return true;
    if (s.includes('towary') && s.includes('materiały')) return true;
    return false;
  });

  const rowZyskZeSprz = find(rzis, r => {
    const s = lo(r);
    return s.includes('zysk') && s.includes('sprzedaży') && !s.includes('operacyjnej');
  });

  const rowEbit = find(rzis, r => {
    const s = lo(r);
    return (
      (s.includes('zysk') || s.includes('strata')) &&
      s.includes('operacyjnej') &&
      !s.includes('sprzedaży')
    );
  });

  const rowOdsetki =
    find(rzis, r => lo(r).includes('odsetki')) ??
    find(rzis, r => lo(r).includes('koszty finansowe') && r.level <= 2);

  const rowZyskBrutto = find(rzis, r => {
    const s = lo(r);
    return (s.includes('zysk') || s.includes('strata')) && s.includes('brutto');
  });

  const rowZyskNetto = find(rzis, r => {
    const s = lo(r);
    return (s.includes('zysk') || s.includes('strata')) && s.includes('netto');
  });

  // ── Sources map ──────────────────────────────────────────────────────────

  const sources: Record<string, { found: boolean; name: string }> = {
    aktywaTrwale:       { found: !!rowAktywaTrwale,      name: rowAktywaTrwale?.name      ?? '—' },
    aktywaObrotowe:     { found: !!rowAktywaObrotowe,    name: rowAktywaObrotowe?.name    ?? '—' },
    zapasy:             { found: !!rowZapasy,            name: rowZapasy?.name            ?? '—' },
    naleznosci:         { found: !!rowNaleznosci,        name: rowNaleznosci?.name        ?? '—' },
    srodkiPieniezne:    { found: !!rowSrodkiPieniezne,   name: rowSrodkiPieniezne?.name   ?? '—' },
    aktywaRazem:        { found: !!rowAktywaRazem,       name: rowAktywaRazem?.name       ?? '—' },
    kapitalWlasny:      { found: !!rowKapitalWlasny,     name: rowKapitalWlasny?.name     ?? '—' },
    zobowiazaniaDlugo:  { found: !!rowZobowiazaniaDlugo, name: rowZobowiazaniaDlugo?.name ?? '—' },
    zobowiazaniaKrotko: { found: !!rowZobowiazaniaKrotko, name: rowZobowiazaniaKrotko?.name ?? '—' },
    pasywaBilans:       { found: !!rowPasywa,            name: rowPasywa?.name            ?? '—' },
    kredytDlugo:        { found: !!rowKredytDlugo,       name: rowKredytDlugo?.name       ?? '—' },
    kredytKrotko:       { found: !!rowKredytKrotko,      name: rowKredytKrotko?.name      ?? '—' },
    przychody:          { found: !!rowPrzychody,         name: rowPrzychody?.name         ?? '—' },
    kosztyOper:         { found: !!rowKosztyOper,        name: rowKosztyOper?.name        ?? '—' },
    amortyzacja:        { found: !!rowAmortyzacja,       name: rowAmortyzacja?.name       ?? '—' },
    cogs:               { found: !!rowCogs,              name: rowCogs?.name              ?? '—' },
    zyskZeSprz:         { found: !!rowZyskZeSprz,        name: rowZyskZeSprz?.name        ?? '—' },
    ebit:               { found: !!rowEbit,              name: rowEbit?.name              ?? '—' },
    odsetki:            { found: !!rowOdsetki,           name: rowOdsetki?.name           ?? '—' },
    zyskBrutto:         { found: !!rowZyskBrutto,        name: rowZyskBrutto?.name        ?? '—' },
    zyskNetto:          { found: !!rowZyskNetto,         name: rowZyskNetto?.name         ?? '—' },
  };

  return {
    aktywaTrwale:       n(rowAktywaTrwale,      period),
    aktywaObrotowe:     n(rowAktywaObrotowe,    period),
    zapasy:             n(rowZapasy,            period),
    naleznosci:         n(rowNaleznosci,        period),
    srodkiPieniezne:    n(rowSrodkiPieniezne,   period),
    aktywaRazem:        n(rowAktywaRazem,       period),
    kapitalWlasny:      n(rowKapitalWlasny,     period),
    zobowiazaniaDlugo:  n(rowZobowiazaniaDlugo, period),
    zobowiazaniaKrotko: n(rowZobowiazaniaKrotko, period),
    pasywaBilans:       n(rowPasywa,            period),
    kredytDlugo:        n(rowKredytDlugo,       period),
    kredytKrotko:       n(rowKredytKrotko,      period),
    przychody:          n(rowPrzychody,         period),
    kosztyOper:         n(rowKosztyOper,        period),
    amortyzacja:        n(rowAmortyzacja,       period),
    cogs:               n(rowCogs,              period),
    zyskZeSprz:         n(rowZyskZeSprz,        period),
    ebit:               n(rowEbit,              period),
    odsetki:            n(rowOdsetki,           period),
    zyskBrutto:         n(rowZyskBrutto,        period),
    zyskNetto:          n(rowZyskNetto,         period),
    sources,
  };
}

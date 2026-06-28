import type { ReportRow } from '../types';

export const FIELD_LABELS: Record<string, string> = {
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

function n(row: ReportRow | undefined, period: 1 | 2 | 3): number {
  if (!row) return 0;
  if (period === 1) return row.values.period1;
  if (period === 2) return row.values.period2;
  return row.values.period3 ?? 0;
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
  period: 1 | 2 | 3,
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

  // Należności krótkoterminowe (w aktywach obrotowych)
  const rowNaleznosciKrotko = find(bilans, r => {
    const s = lo(r);
    if (s.includes('należności krótkoterminow')) return true;
    if (s.includes('należności') && s.includes('odbiorcó')) return true;
    return false;
  }) ?? find(bilans, r => lo(r).includes('należności') && !lo(r).includes('długoterminow'));

  // Należności długoterminowe (w aktywach trwałych)
  const rowNaleznosciDlugo = find(bilans, r => lo(r).includes('należności długoterminow'));

  const rowSrodkiPieniezne = find(bilans, r =>
    lo(r).includes('środki pieniężne'),
  );

  // level-0 rows: first is aktywa total, second is pasywa total
  const level0rows = bilans.filter(r => r.level === 0);
  const rowAktywaRazem =
    level0rows.find(r => lo(r).includes('aktyw')) ??
    level0rows[0];

  // Require 'własn' to avoid "Należne wpłaty na kapitał (fundusz) podstawowy" (no 'własn')
  const rowKapitalWlasny = find(bilans, r => {
    const s = lo(r);
    return s.includes('własn') && (s.includes('kapitał') || s.includes('fundusz'));
  });

  const rowZobowiazaniaDlugo = find(bilans, r =>
    lo(r).includes('zobowiązania długoterminow'),
  );

  const rowZobowiazaniaKrotko = find(bilans, r =>
    lo(r).includes('zobowiązania krótkoterminow'),
  );

  const rowPasywa =
    level0rows.find(r => lo(r).includes('pasyw')) ??
    level0rows[1];

  // Bug fix: row names are "z tytułu kredytów i pożyczek" (no long/short qualifier)
  // → use 1st and 2nd occurrence of 'kredyt' (bilans lists ZD before ZK)
  const rowKredytDlugo = find(bilans, r => {
    const s = lo(r);
    return s.includes('kredyt') || s.includes('pożyczk');
  });
  const kredytDlugoIdx = rowKredytDlugo ? bilans.indexOf(rowKredytDlugo) : -1;
  const rowKredytKrotko =
    kredytDlugoIdx >= 0
      ? bilans.slice(kredytDlugoIdx + 1).find(r => {
          const s = lo(r);
          return s.includes('kredyt') || s.includes('pożyczk');
        })
      : undefined;

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

  // Bug fix: Polish UoR RZiS has no "Zysk operacyjny" row → compute as C + D - E
  const rowPozostPrzychOper = find(rzis, r => {
    const s = lo(r);
    return s.includes('pozostałe') && s.includes('przychody') && s.includes('operacyjne');
  });
  const rowPozostKosztyOper = find(rzis, r => {
    const s = lo(r);
    return s.includes('pozostałe') && s.includes('koszty') && s.includes('operacyjne');
  });
  const rowEbit = find(rzis, r => {
    const s = lo(r);
    return (
      (s.includes('zysk') || s.includes('strata')) &&
      s.includes('operacyjnej') &&
      !s.includes('sprzedaży')
    );
  });
  // EBIT: direct row if exists, else C + D - E
  const ebitForPeriod = rowEbit
    ? n(rowEbit, period)
    : n(rowZyskZeSprz, period) + n(rowPozostPrzychOper, period) - n(rowPozostKosztyOper, period);

  // Bug fix: first 'odsetki' match is F.II (income) — prefer odsetki AFTER koszty finansowe (G)
  const rowKosztyFinansowe = find(rzis, r =>
    lo(r).includes('koszty finansowe') && r.level <= 2,
  );
  const kfIdx = rowKosztyFinansowe ? rzis.indexOf(rowKosztyFinansowe) : -1;
  const rowOdsetki =
    (kfIdx >= 0 ? rzis.slice(kfIdx + 1).find(r => lo(r).includes('odsetki')) : undefined) ??
    rowKosztyFinansowe ??
    find(rzis, r => lo(r).includes('odsetki'));

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
    naleznosci:         { found: !!(rowNaleznosciKrotko ?? rowNaleznosciDlugo), name: [rowNaleznosciDlugo?.name, rowNaleznosciKrotko?.name].filter(Boolean).join(' + ') || '—' },
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
    ebit:               { found: !!(rowEbit ?? rowZyskZeSprz), name: rowEbit?.name ?? (rowZyskZeSprz ? 'C+D-E (wyliczone)' : '—') },
    odsetki:            { found: !!rowOdsetki,           name: rowOdsetki?.name           ?? '—' },
    zyskBrutto:         { found: !!rowZyskBrutto,        name: rowZyskBrutto?.name        ?? '—' },
    zyskNetto:          { found: !!rowZyskNetto,         name: rowZyskNetto?.name         ?? '—' },
  };

  return {
    aktywaTrwale:       n(rowAktywaTrwale,      period),
    aktywaObrotowe:     n(rowAktywaObrotowe,    period),
    zapasy:             n(rowZapasy,            period),
    naleznosci:         n(rowNaleznosciKrotko, period) + n(rowNaleznosciDlugo, period),
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
    ebit:               ebitForPeriod,
    odsetki:            n(rowOdsetki,           period),
    zyskBrutto:         n(rowZyskBrutto,        period),
    zyskNetto:          n(rowZyskNetto,         period),
    sources,
  };
}

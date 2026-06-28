# BilRes Analiza Sprawozdań Finansowych

Aplikacja webowa do interaktywnej analizy Bilansu i RZiS.  
Stack: **React 19 · Vite · TypeScript · Tailwind CSS v4 · Recharts**  
Lokalizacja: `C:\Users\tvf19\exco-analiza`  
Online: **https://tvf80.github.io/bilres-analiza/**

---

## Prywatność danych / RODO

**Aplikacja nie przechowuje żadnych danych wrażliwych w kodzie źródłowym ani na serwerze.**

- Pliki `src/data/*.json` to **puste placeholdery** (`[]` / `null`) — nie zawierają żadnych danych finansowych.
- Wszystkie dane finansowe użytkownik importuje samodzielnie z plików Excel.
- Dane po imporcie przechowywane są wyłącznie w `localStorage` i `sessionStorage` przeglądarki użytkownika.
- Żadne dane finansowe nie są wysyłane na zewnętrzny serwer.
- Usunięcie danych: wystarczy wyczyścić localStorage przeglądarki lub użyć przycisku „Wyczyść dane" w aplikacji.
- Repozytorium GitHub nie zawiera żadnych danych finansowych firm.

---

## Uruchomienie

```bash
npm run dev          # dev server — http://localhost:5173
npm run build        # build produkcyjny → dist/
node scripts/convert-xlsx.mjs "C:\path\to\excel"   # konwersja danych
```

---

## Architektura

```
src/
  i18n.ts               Słownik tłumaczeń PL/FR/EN (~600 kluczy × 3 języki)
  i18n/
    LanguageContext.tsx   React Context + hook useLang() → { lang, t(key, params) }
  lib/
    crypto.ts           SHA-256 hashing (Web Crypto API)
    xlsxParser.ts       Parsowanie xlsx w przeglądarce → typy danych
    fieldMapping.ts     Mapowanie pozycji BIL/RZiS → FieldMap (keyword matching)
    controlChecks.ts    Funkcje kontroli integralności i wskaźników
  store/
    AuthContext.tsx      Użytkownicy + sesja (localStorage + sessionStorage)
    CompaniesContext.tsx Biblioteka firm + isLoaded guard (fix race condition)
  components/
    LoginScreen.tsx      Siatka avatarów → hasło (i18n)
    Sidebar.tsx          Nawigacja lewa — zwijana, podmień/usuń firmę (i18n)
    Header.tsx           Bilans | RZiS | Kontrola | Analiza + zoom + szukaj + lang switcher (i18n)
    ImportModal.tsx      Import 6 xlsx (tryb nowy + tryb podmiana danych), selektywna podmiana komponentów (Partial<CompanyData>) (i18n)
    ReportTable.tsx      Tabela raportu z hierarchią (i18n)
    DrilldownPanel.tsx   Konta (obroty) → Zapisy FK (i18n)
    ControlSheet.tsx     Arkusz kontrolny: integralność, wskaźniki, makro (i18n)
    RatioAnalysis.tsx    Analiza wskaźnikowa: 8 pod-zakładek + wykresy (i18n)
    AnalysisCharts.tsx   Wykresy Recharts (lazy-loaded) (i18n)
    RaportMiesieczny.tsx Raport zarządczy: KPI, marże, heatmapa, koszty (i18n)
    RaportGrupy.tsx      Grupy pracy: mapa, drawery, koszt prac (i18n — własny T{})
  hooks/
    useReportData.ts     useMemo na danych aktywnej firmy
    useFormatNumber.ts   Formatowanie PLN (Intl.NumberFormat pl-PL)
  types/index.ts         ReportRow · AccountRow · JournalEntry · Company · AppUser · ViewType
public/
  data/zapisy.json       Dziennik FK — ~98 k wierszy, ~42 MB — lazy fetch
scripts/
  convert-xlsx.mjs       6 plików Excel → JSON
```

---

## Widoki aplikacji (ViewType)

| Widok | Kolor przycisku | Zawartość |
|-------|----------------|-----------|
| `bilans` | niebieski | Tabela bilansu + drilldown |
| `rzis` | niebieski | Tabela RZiS + drilldown |
| `kontrola` | fioletowy | Arkusz kontrolny (5 sekcji) |
| `analiza` | zielony | Analiza wskaźnikowa (8 pod-zakładek) |
| `raport_miesieczny` | bursztynowy | Raport zarządczy (5 pod-zakładek) |
| `raport_grupy` | pomarańczowy | Grupy pracy (4 pod-zakładki) |

---

## Internacjonalizacja (i18n)

Aplikacja obsługuje 3 języki: **PL**, **FR**, **EN** — przełączane flagami 🇵🇱🇫🇷🇬🇧 w headerze.

### Architektura i18n

- `src/i18n.ts` — centralny słownik: `Record<Lang, Record<string, string>>` + funkcja `t(lang, key, params?)`
- `src/i18n/LanguageContext.tsx` — `LanguageProvider` (w App.tsx) + hook `useLang()` → `{ lang, t }`
- Klucze: `prefix.nazwa`, np. `'tab.bilans'`, `'drill.saldoWn'`, `'report.grossMargin'`
- Interpolacja: `t('import.recognized', { count: 5 })` → `"✓ Rozpoznano 5 plik(ów)"`

### Dodawanie nowego klucza

1. Dodaj klucz w `i18n.ts` w sekcjach `pl`, `fr`, `en`
2. W komponencie: `const { t } = useLang();` → `t('prefix.klucz')`

### Wyjątek: RaportGrupy

`RaportGrupy.tsx` używa własnego obiektu `T: Record<Lang, Record<string,string>>` w pliku (zamiast centralnego i18n.ts) — ze względu na dużą liczbę kluczy specyficznych dla tego widoku.

---

## Arkusz kontrolny (`kontrola`)

1. **Kompletność danych** — status ładowania bilansu/RZiS/obrotów/zapisów
2. **Kontrole integralności** — Aktywa=Pasywa, zasada podwójnego zapisu, BO+obroty=saldo
3. **Wskaźniki finansowe** — 10 wskaźników (płynność, ROA/ROE/ROS, zadłużenie, rotacje)
4. **Dane makroekonomiczne** — tabela GUS/NBP 2020–2026 (inflacja, EUR/PLN, WIBOR, PKB...)
5. **Statystyki dokumentu** — liczniki, zakres dat, sumy FK

---

## Analiza wskaźnikowa (`analiza`)

### Zakładki wskaźnikowe (każda: wykres + tabela + IndicatorDrawer z wyliczeniami)
- **Płynność** — bieżąca, szybka, gotówkowa
- **Sprawność** — rotacje aktywów (×3), DSO/DSI/DPO w dniach, CCC
- **Zadłużenie** — ogólne, KW, dług-/krótkoterminowe, DFL, ICR, dług netto/EBITDA
- **Rentowność** — ROE, ROA, ROS, marża brutto, EBIT, EBITDA
- **Dyskryminacyjne** — 6 modeli: Hołdy, Gajdki i Stosa, Prusaka BP2, Poznańska, Mączyńskiej, Jagiełły
- **Beneish M-Score** — 8 wskaźników, interpretacja strefy ryzyka, drawer szczegółów
- **Analiza wskaźnikowa** (podsumowanie) — overall grade, 4 kategorie, tekst auto, modele kluczowe

### Wykresy — 3 okresy + kliknięcia
Wszystkie wykresy Recharts (`PlynnostChart`, `SprawnostChart`, `ZadluzenieChart`, `RentownoscChart`)
obsługują **3 okresy** i **kliknięcia**:
- `f3: FieldMap | null` — opcjonalny 3. słupek (violet-300 `#c4b5fd`, najstarszy okres)
- `periodLabels?: string[]` — etykiety legendy z danych Excel (zamiast „P1/P2/P3")
- `onBarClick?: (idx: number) => void` — kliknięcie słupka otwiera `IndicatorDrawer` z wyliczeniami
- Każda zakładka (`PlynnostTab` itd.) zarządza `useState<Indicator | null>` dla drawera z wykresu
- Mapowanie `chartIdx → rowsIdx` per zakładka: Płynność=[0,1,2], DSO/DSI/DPO/CCC=[3,4,5,6],
  Zadłużenie=[0,2,3,1], Rentowność=[0,1,3,5,6]

### Tabele Bilans / RZiS — wygaszanie pustych wierszy
`ReportTable.tsx`: wiersze gdzie wszystkie 3 okresy = 0 wyświetlane jako `opacity-30`
z mniejszą czcionką (10px) — skupiają się na danych wypełnionych.
Sekcje (level=0) nigdy nie są wygaszane.

### Zakładki struktury (uproszczone do poziomu 1, obsługa f3)
- **Bilans** — donut aktywów + donut pasywów + tabela: udział% + Δ r/r + kolumna P3
- **RZiS** — kaskada wyników (waterfall) + marże% (3 słupki) + tabela: % przychodów + Δ r/r + P3

### Mapowanie pól → przeniesione do `Kontrola` (sekcja 7 "Sprawdzenie mapowania")

---

## Zarządzanie firmami

- Import: 6 plików xlsx → auto-wykrycie po nazwie
- **Podmiana danych** (⟳ na kafelku): selektywna podmiana — można podmienić tylko wybrane komponenty (np. tylko raportMiesieczny bez bilans/rzis)
- Firmy persystowane w `localStorage` per użytkownik (bez zapisów — za duże)
- **Bug fix**: `isLoaded` guard w CompaniesContext zapobiega nadpisaniu danych zerami przy logowaniu
- Zapisy FK: `fetch('/data/zapisy.json')` async przy pierwszym drilldownie

---

## Dane źródłowe

Obsługa **dwóch formatów** Excel:

### Format combined (3 okresy — zalecany)
| Plik | Format | Rola |
|------|--------|------|
| EX_BIL 09.25-09.24-09.23.xlsx | Segment, Nazwa, P1, P2, P3 | Bilans 3 lata fiskalne |
| EX_RZIS 09.25-09.24-09.23.xlsx | Segment, Nazwa, P1, P2, P3 | RZiS 3 lata fiskalne |

### Format dwuplikowy (schemat + dane)
| Plik | Arkusz | Rola |
|------|--------|------|
| EX_BIL schemat.xlsx | Pozycje zestawienia | Formuły bilansu (drilldown) |
| EX_BIL.xlsx | Wyniki zestawienia | Wartości bilansu (2 okresy) |
| EX_RZIS schemat.xlsx | Pozycje zestawienia | Formuły RZiS |
| EX_RZIS.xlsx | Wyniki zestawienia | Wartości RZiS |
| EX_OBROTY.xlsx | Obroty i salda | Salda kont |
| EX_ZAPISY.xlsx | Zapisy księgowe | Pełny dziennik FK |

### Brak danych wbudowanych
`src/data/*.json` — puste placeholdery. Aplikacja startuje bez żadnych danych.
Przy braku firm w localStorage wyświetlany jest ekran powitalny z przyciskiem importu.

---

## Wydajność

- Recharts (`RatioAnalysis`) lazy-loaded — oddzielny chunk 117 KB gzip
- `RaportMiesieczny` lazy-loaded — 53 KB gzip
- `RaportGrupy` lazy-loaded — 70 KB gzip
- Main bundle: ~194 KB gzip
- `zapisy.json` (~42 MB) ładowany przez `fetch()` — nie blokuje startu
- `CompaniesContext` nie serializuje zapisów do localStorage
- `useMemo` na wszystkich obliczeniach wskaźników i mapowaniu pól

---

## Typy TypeScript

```ts
type ViewType = 'bilans' | 'rzis' | 'kontrola' | 'analiza';
interface ReportRow    { segment, name, level, values: {period1, period2, period3?}, definition, positionId, drilldownAccounts[] }
interface AccountRow   { numer, nazwa, saldoWn, saldoMa, persaldo, obrotyWn, obrotyMa, ... }
interface JournalEntry { konto, kontoPrzeciwstawne, kwotaWn, kwotaMa, dataKsiegowania, opis, ... }
interface Company      { id, name, period, periodLabels?, bilans[], rzis[], obroty[], zapisy[], zapisyUrl? }
interface AppUser      { id, name, passwordHash, hint, color, createdAt }
interface FieldMap     { aktywaTrwale, aktywaObrotowe, zapasy, naleznosci, srodkiPieniezne,
                         aktywaRazem, kapitalWlasny, zobowiazaniaDlugo, zobowiazaniaKrotko,
                         pasywaBilans, kredytDlugo, kredytKrotko, przychody, kosztyOper,
                         amortyzacja, cogs, zyskZeSprz, ebit, odsetki, zyskBrutto, zyskNetto,
                         sources: Record<string, {found, name}> }
```

## Mapowanie pól (fieldMapping.ts) — znane pułapki

1. **EBIT** — polish UoR RZiS nie ma wiersza "Zysk operacyjny" → wyliczany jako C+D-E (zysk ze sprzedaży + pozostałe przychody oper - pozostałe koszty oper)
2. **Odsetki** — szukaj w sekcji "Koszty finansowe" (G), nie "Przychody finansowe" (F)
3. **Kredyty dług/krótk** — wiersze nazwane "z tytułu kredytów i pożyczek" (brak kwalifikatora) → 1. i 2. wystąpienie w bilansie
4. **Kapitał własny** — "Należne wpłaty na kapitał (fundusz) podstawowy" (P1=0) wyprzedza właściwy wiersz → szukaj 'własn' jako wymagane słowo kluczowe

---

## Parsowanie formuł FK

```
@SaldoWn(konto)  @SaldoMa(konto)  @obrotyWn(konto)  @obrotyMa(konto)
CHOOSE(a,b,c)    — reguła warunkowa
```

Regex: `/@(?:Saldo(?:Wn|Ma)|obroty(?:Wn|Ma))\(([^)]+)\)/gi`

---

## Znane problemy i rozwiązania

### Recharts 3.8.1 — tree-shaking w produkcji (Rolldown/Vite 6)
Komponenty recharts które są wrapperami React.memo/forwardRef (typeof = 'object')
są błędnie eliminowane przez Rolldown w buildzie produkcyjnym → stają się `undefined`
w runtime → crash "n is not a function".

**Bezpieczne komponenty** (typeof = 'function', działają w produkcji):
`BarChart, Bar, LineChart, Line, PieChart, Pie, ResponsiveContainer, XAxis, YAxis,
CartesianGrid, Tooltip, Legend, Cell, ReferenceLine`

**Zastąpione komponenty** (były problematyczne):
- `FunnelChart, Funnel` → `CustomFunnel` (CSS, w RaportMiesieczny.tsx)
- `AreaChart, Area` → `LineChart, Line`
- `RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis` → `BarChart` grouped
- `ScatterChart, Scatter` → `CssScatter` (CSS absolute positioning, w RaportGrupy.tsx)

### App.tsx — wrapper zakładek wymaga `overflow-hidden`
Każda zakładka w `App.tsx` (linie ~134-165) musi mieć wrapper z klasą `overflow-hidden`:
```tsx
<div className="flex-1 flex flex-col min-h-0 overflow-hidden" style={{zoom}}>
```
Brak `overflow-hidden` powoduje że poziomy overflow ucieka do body → na mobile
widoczna jest tylko prawa część ekranu.

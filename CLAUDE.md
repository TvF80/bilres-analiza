# exco-analiza — Analiza Sprawozdań Finansowych

Aplikacja webowa do interaktywnej analizy Bilansu i RZiS.  
Stack: **React 19 · Vite 8 (Rolldown) · TypeScript · Tailwind CSS v4 · Recharts 3.8.1**  
Lokalizacja: `C:\Users\tvf19\exco-analiza`  
Online: **https://finscopepl.vercel.app** (Vercel, projekt `prj_bEJ0HCxkKhHinCj8F5yslghrAvcj`, team `tv-f80-s-projects`)

---

## Bezpieczeństwo — zasady krytyczne

**Aplikacja używa Vite — wszystko z prefiksem `VITE_` trafia do bundle klienta.**

| Zmienna | Gdzie | Cel |
|---|---|---|
| `VITE_SUPABASE_URL` | frontend | URL projektu Supabase |
| `VITE_SUPABASE_ANON_KEY` | frontend | klucz publiczny (RLS chroni dane) |
| `ANTHROPIC_API_KEY` | **tylko Vercel serverless** (`api/`) | Claude AI — NIGDY nie dodawaj `VITE_` |

- `zapisy` (42 MB dziennik FK) — **nigdy nie trafia do Supabase**, tylko `sessionStorage`
- Klucze nie są hardcoded w kodzie ani nie trafiają do repo
- **Vercel env vars**: tylko te 3 zmienne + żadnych innych. Projekt miał
  wcześniej 16 nieużywanych zmiennych (service_role key, JWT secret, martwe
  `POSTGRES_*`/`NEXT_PUBLIC_*` z auto-integracji Supabase↔Vercel zakładającej
  Next.js) — usunięte 2026-07, patrz „Hardening bezpieczeństwa” niżej. Nowe
  sekrety dodawaj świadomie i tylko do środowisk, gdzie są faktycznie potrzebne
  (np. `ANTHROPIC_API_KEY` nie musi być w Development)
- **Build produkcyjny bez konfiguracji Supabase = błąd, nie tryb gość** —
  `AuthContext.tsx` sprawdza `import.meta.env.PROD`; cichy fallback do
  guest mode zostaje tylko w dev/local (patrz sekcja Supabase niżej)

---

## Supabase — tryb opcjonalny (od 2026-06)

Supabase jest **opcjonalne**. Gdy brak env vars (`VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY`):

- `src/lib/supabase.ts` eksportuje `supabaseConfigured: boolean` — false gdy brak konfiguracji
- `AuthContext.tsx`: gdy `!supabaseConfigured` **i dev/local** → auto-login jako guest
  `{ id: 'local', name: 'Użytkownik lokalny', ... }`. W buildzie produkcyjnym
  (`import.meta.env.PROD`) brak konfiguracji ustawia `configError` zamiast cichego
  gościa — `App.tsx` renderuje wtedy pełnoekranowy błąd konfiguracji
- `CompaniesContext.tsx`: wszystkie Supabase calls opatrzone `if (supabaseConfigured)` guard
- Tryb lokalny: dane wyłącznie w `localStorage`, AI działa przez `/api/analyze` (Vercel serverless)

### Supabase — pełny tryb
- `AuthContext.tsx` — Supabase Auth: `signInWithPassword`, `signUp`, `signOut`, `resetPasswordForEmail`
- `CompaniesContext.tsx` — localStorage jako write-through cache, optimistic updates, sync w tle
- `MigrateLocalDataBanner.tsx` — amber baner z przyciskiem migracji localStorage → konto

### Tabele SQL (Supabase)
Pełny, zwersjonowany schemat + RLS policies: **`supabase/schema.sql`**.
- `companies` — zgodna 1:1 z `rowToCompany`/`companyToRow` w `CompaniesContext.tsx`.
  `id` to `uuid` (nie `text` — poprawione po weryfikacji na żywej bazie 2026-07).
  RLS: `auth.uid() = user_id` na select/insert/update/delete
- `ai_analysis_log` — audit trail wywołań AI, **tylko metadane** (user_id, section,
  lang, period, model, created_at) — nigdy treść `data` ani odpowiedzi modelu.
  Append-only: RLS ma tylko insert/select (`auth.uid() = user_id`), brak
  update/delete. Insert wykonywany z `api/analyze.ts` jako zalogowany użytkownik
  (jego własny token z nagłówka `Authorization`, przekazywany opcjonalnie przez
  `getAuthHeader()` w `lib/supabase.ts`) — serwer nigdy nie używa service_role

---

## Hardening bezpieczeństwa (2026-07)

Pełny audyt + plan: zobacz historię sesji/pamięć projektu. Skrót zrealizowanych zmian:

- **Vercel env vars** — usunięto 16 nieużywanych sekretów produkcyjnych
  (`SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_JWT_SECRET`, martwe `POSTGRES_*` i
  `NEXT_PUBLIC_*`). Zostały tylko `ANTHROPIC_API_KEY`, `VITE_SUPABASE_URL`,
  `VITE_SUPABASE_ANON_KEY`
- **`xlsx` (SheetJS)** — zaktualizowany z 0.18.5 (npm, porzucony przez
  maintainera, niezałatane luki: prototype pollution + ReDoS) do 0.20.3 z
  oficjalnego CDN SheetJS (`package.json`: `"xlsx": "https://cdn.sheetjs.com/..."`,
  nie npm registry — to jedyny kanał z fixem)
- **Web Worker do parsowania** — `src/lib/xlsxParser.worker.ts` +
  `importInWorker.ts`. Izoluje ewentualny crash/prototype pollution od głównego
  wątku; bonus: `xlsx` wyleciał z głównego bundla do osobnego chunka
- **Limit importu** — 50 MB + walidacja rozszerzenia (`.xlsx`) w `ImportModal.tsx`
  i `xlsxParser.ts` (`MAX_IMPORT_FILE_BYTES`, `ALLOWED_IMPORT_EXTENSIONS`)
- **`/api/analyze`** — rate limiting per-IP w pamięci procesu (15 req/60s,
  best-effort), limit rozmiaru `data` (20 000 znaków JSON), audit trail (patrz
  wyżej), logowanie błędów tylko jako komunikat (nigdy pełny obiekt błędu SDK —
  ryzyko echo requestu z danymi)
- **Guest mode fail-loud w produkcji** — patrz sekcja Supabase wyżej
- **Weryfikacja RLS na żywo** — konto testowe potwierdziło: izolacja odczytu
  działa, insert ze sfałszowanym `user_id` odrzucony (42501), potwierdzenie
  e-mail wymuszone przed logowaniem. Powtarzalny test: `scripts/test-rls.mjs`
  (wymaga 2 potwierdzonych kont testowych w `.env.test`, gitignored)
- **Strona logowania** (`LoginScreen.tsx`, `SecurityInfo`) — treść zaktualizowana
  do stanu faktycznego: dane firm synchronizują się do Supabase (nie tylko
  localStorage), analizy AI wysyłają zagregowane dane do Anthropic — wcześniejsza
  wersja błędnie sugerowała, że dane „nie opuszczają przeglądarki”

**Świadomie odłożone (wymagają decyzji/nowej infrastruktury, nie zrobione automatycznie):**
- Cienki backend zamiast bezpośredniego PostgREST (RLS jako jedyna warstwa dostępu)
- Rozproszony rate limiting (Upstash/Vercel KV) — obecny jest per-instancja, best-effort
- Field-level/app-level encryption (Supabase Vault) — dopiero przy realnym wymogu
  regulacyjnym/kontraktowym, nie proaktywnie
- E2E szyfrowanie po stronie klienta — tylko na wyraźne żądanie klienta

---

## Uruchomienie

```bash
npm run dev          # dev server — http://localhost:5173
npm run build        # build produkcyjny → dist/
vercel dev           # lokalny serverless (wymagane do testowania /api/analyze)
node scripts/convert-xlsx.mjs "C:\path\to\excel"   # konwersja danych
```

---

## Architektura

```
api/
  analyze.ts          Vercel Serverless → Claude claude-sonnet-4-6, max_tokens: 400
src/
  i18n.ts               Słownik tłumaczeń PL/FR/EN (~650 kluczy × 3 języki)
  i18n/
    LanguageContext.tsx   React Context + hook useLang() → { lang, t(key, params) }
  lib/
    xlsxParser.ts       Parsowanie xlsx w przeglądarce → typy danych
    fieldMapping.ts     Mapowanie pozycji BIL/RZiS → FieldMap (keyword matching)
    controlChecks.ts    Funkcje kontroli integralności + computeBeneish() + computeRatios()
    supabase.ts         Klient Supabase — eksportuje supabaseConfigured + client (null gdy brak env)
  store/
    AuthContext.tsx      Auth — Supabase lub guest mode
    CompaniesContext.tsx Biblioteka firm — localStorage cache + Supabase sync (opcjonalny)
  components/
    LoginScreen.tsx        Email+password, tryby login/register/forgot, rate limiting
    MigrateLocalDataBanner.tsx  Baner migracji localStorage → konto Supabase
    Sidebar.tsx            Nawigacja lewa — zwijana, podmień/usuń firmę (i18n)
    Header.tsx             Zakładki widoków + zoom + szukaj + lang switcher (i18n)
    ImportModal.tsx        Import xlsx (tryb nowy + podmiana), selektywna podmiana Partial<CompanyData>
    ReportTable.tsx        Tabela raportu z hierarchią, wygaszanie pustych wierszy (i18n)
    DrilldownPanel.tsx     Konta (obroty) → Zapisy FK (i18n)
    ControlSheet.tsx       Arkusz kontrolny: integralność, wskaźniki, makro, GRP summary (i18n)
    RatioAnalysis.tsx      Analiza wskaźnikowa: 8 pod-zakładek + wykresy + AI (i18n) [lazy]
    AnalysisCharts.tsx     Wykresy Recharts (ładowane z RatioAnalysis) (i18n)
    BilansVisuals.tsx      Wizualizacje Bilansu/RZiS: donuts + kaskada + AI (pokazywane nad tabelą)
    AIAnalysisModal.tsx    Modal AI z sessionStorage cache, przycisk kopiuj/regeneruj
    RaportMiesieczny.tsx   Raport zarządczy: KPI, marże, heatmapa, koszty (i18n) [lazy]
    RaportGrupy.tsx        Grupy pracy: mapa, drawery, koszt prac (własny T{}) [lazy]
    RaportPDF.tsx          Raport Ogólny PDF: 10 stron, 9 sekcji AI, wspólny cache [lazy]
    EmptyState.tsx         Ekran powitalny gdy brak firm
  hooks/
    useReportData.ts     Hooki danych aktywnej firmy (useReportData, useAccountsForRow, ...)
  types/index.ts         ReportRow · AccountRow · JournalEntry · Company · MonthlyReportData · GrpData
public/
  data/zapisy.json       Dziennik FK — ~98 k wierszy, ~42 MB — lazy fetch
scripts/
  convert-xlsx.mjs       Konwersja Excel → JSON
```

---

## Widoki aplikacji (ViewType)

```ts
type ViewType = ReportType | 'kontrola' | 'analiza' | 'raport_miesieczny' | 'raport_grupy' | 'raport_ogolny';
```

| Widok | Kolor zakładki | Zawartość |
|-------|----------------|-----------|
| `bilans` | niebieski | BilansVisuals + tabela bilansu + drilldown |
| `rzis` | niebieski | BilansVisuals + tabela RZiS + drilldown |
| `analiza` | emerald | Analiza wskaźnikowa (8 pod-zakładek) |
| `raport_miesieczny` | amber | Raport zarządczy (5 pod-zakładek) |
| `raport_grupy` | orange | Grupy pracy (4 pod-zakładki) |
| `raport_ogolny` | rose | Raport Ogólny PDF (9 sekcji + AI) |
| `kontrola` | slate | Arkusz kontrolny (7 sekcji) — na końcu nav |

**Uwaga**: Zakładka `kontrola` jest ostatnia w nav (po separatorze) — nie jest powiązana z raportami.

---

## AI — architektura cache

Wszystkie przyciski 🤖 AI używają **sessionStorage** z kluczem jako ID cache. Raport Ogólny PDF
używa tych samych kluczy co przyciski w zakładkach → dwukierunkowe udostępnianie cache.

### Schemat kluczy cache
| Komponent | Format klucza |
|-----------|--------------|
| `BilansVisuals` | `` `ai_${section}_${p1}_${lang}` `` |
| `RatioAnalysis` | `` `ai_ratio_${companyId}_${section}_${period}_${lang}` `` |
| `RaportGrupy` | `` `ai_grp_${companyId}_${section}_${period}_${lang}` `` |
| `RaportMiesieczny` | `` `ai_${companyId}_${section}_${mPeriod}_${lang}` `` |
| `RaportPDF` (PDF-specific) | `` `ai_pdf_${section}_${period}_${lang}` `` |

### Endpoint AI
`api/analyze.ts` → Vercel Serverless → `claude-sonnet-4-6`, max_tokens: 400  
Body: `{ section, lang, period, data }`  
Response: `{ text: string }`  
Błąd 404 lokalnie = "użyj vercel dev" (przyjazny komunikat, nie crash).

**Hardening (2026-07):**
- Limit rozmiaru `data` — max 20 000 znaków JSON (413 gdy przekroczone)
- Rate limiting per-IP w pamięci procesu — max 15 żądań/60s (429 + `Retry-After`).
  Best-effort: licznik nie jest współdzielony między cold-startami/równoległymi
  instancjami funkcji. Dla twardej gwarancji potrzebny Upstash/Vercel KV.
- Endpoint nie weryfikuje tożsamości (brak przekazywanego tokenu Supabase) —
  celowe, żeby AI działało też w trybie lokalnym/guest bez Supabase.

---

## Internacjonalizacja (i18n)

Aplikacja obsługuje 3 języki: **PL**, **FR**, **EN** — przełączane flagami 🇵🇱🇫🇷🇬🇧 w headerze.

- `src/i18n.ts` — centralny słownik: `Record<Lang, Record<string, string>>` + funkcja `t(lang, key, params?)`
- `src/i18n/LanguageContext.tsx` — `LanguageProvider` (w App.tsx) + hook `useLang()` → `{ lang, t }`
- Klucze: `prefix.nazwa`, np. `'tab.bilans'`, `'drill.saldoWn'`, `'report.grossMargin'`
- Interpolacja: `t('import.recognized', { count: 5 })` → `"✓ Rozpoznano 5 plik(ów)"`

**Wyjątek**: `RaportGrupy.tsx` używa własnego obiektu `T: Record<Lang, Record<string,string>>` (za dużo kluczy specyficznych).

---

## BilansVisuals — wizualizacje nad tabelą

`BilansVisuals.tsx` wyświetlany nad `ReportTable` dla widoków `bilans` i `rzis`:

- **Bilans**: donut aktywów + donut pasywów + KPI tiles + bar chart 3 okresy + 🤖 AI
- **RZiS**: kaskada wyników (% przychodu) + KPI tiles + marże% 3 okresy + 🤖 AI
- Props: `{ reportType, bilans, rzis, periodLabels?, lang }`
- Cache key: `` `ai_${section}_${p1}_${lang}` `` (sekcje: `bilans_struktura`, `rzis_rentownosc`)

---

## RaportPDF — Raport Ogólny

`RaportPDF.tsx` (lazy-loaded) w widoku `raport_ogolny`:

### Fazy
1. **Confirm** — lista stron + ostrzeżenie o liczbie zapytań AI → przycisk generuj
2. **Loading** — progress bar sekcja po sekcji
3. **Preview** — podgląd + przycisk drukuj

### Struktura stron
| Str. | Sekcja | AI section key |
|------|--------|---------------|
| 1 | Strona tytułowa + spis treści | — |
| 2 | Struktura aktywów bilansu | `bilans_aktywa` (cache BilansVisuals) |
| 3 | Struktura pasywów bilansu | `bilans_pasywa` (PDF-only) |
| 4 | Przychody i wyniki finansowe | `rzis_wyniki` (cache BilansVisuals) |
| 5 | Rentowność — trend 3 okresów | `rzis_marze` (PDF-only) |
| 6 | Beneish M-Score | `beneish` (cache RatioAnalysis) |
| 7 | Analiza dyskryminacyjna (Hołda + Altman Z') | `dyskryminacyjne` (cache RatioAnalysis) |
| 8 | Grupy pracy (kondycjonalne) | `grupy` (cache RaportGrupy) |
| 9 | Raport miesięczny (kondycjonalne) | `raport_miesieczny` (cache RaportMiesieczny) |
| 10 | Podsumowanie wykonawcze | `podsumowanie` (PDF-only) |

Strony 8 i 9 pojawiają się tylko jeśli firma ma dane `grpData` / `raportMiesieczny`.

---

## Arkusz kontrolny (`kontrola`)

1. Kompletność danych
2. Kontrole integralności (Aktywa=Pasywa, zasada podwójnego zapisu, BO+obroty=saldo)
3. Wskaźniki finansowe — 10 wskaźników
4. Dane makroekonomiczne — GUS/NBP 2020–2026
5. Statystyki dokumentu
6. Raport Grupy Pracy (podsumowanie wg miast, jeśli dostępne)
7. Sprawdzenie mapowania pól (diagnostyka fieldMapping)

**Bug fix (2026-06)**: wrapper w App.tsx musiał mieć `flex flex-col min-h-0` (nie tylko `overflow-hidden`) by `ControlSheet` z `flex-1 overflow-y-auto` mógł scrollować.

---

## Analiza wskaźnikowa (`analiza`)

### Zakładki (każda: wykres + tabela + IndicatorDrawer + 🤖 AI)
- **Płynność** — bieżąca, szybka, gotówkowa
- **Sprawność** — rotacje aktywów (×3), DSO/DSI/DPO w dniach, CCC
- **Zadłużenie** — ogólne, KW, dług-/krótkoterminowe, DFL, ICR, dług netto/EBITDA
- **Rentowność** — ROE, ROA, ROS, marża brutto, EBIT, EBITDA
- **Dyskryminacyjne** — 8 modeli: Hołda, Gajdka-Stos, Prusak, Altman Z, Altman Z', Springate, Jagiełło (usługi/produkcja)
- **Beneish M-Score** — 8 wskaźników, interpretacja strefy ryzyka, drawer szczegółów, 🤖 AI
- **Bilans/RZiS struktura** — donuty + tabela + Δr/r
- **Analiza wskaźnikowa** (podsumowanie) — overall grade, 4 kategorie, 🤖 AI

### Wykresy — 3 okresy + kliknięcia
- `f3: FieldMap | null` — opcjonalny 3. słupek (violet-300, najstarszy okres)
- `periodLabels?: string[]` — etykiety legendy z danych Excel
- `onBarClick?: (idx: number) => void` — kliknięcie otwiera `IndicatorDrawer` z wyliczeniami

---

## Raport zarządczy (`raport_miesieczny`)

### Zakładki
- **Wynik** — lejek wyniku, tabela wynikowa, heatmapa kosztów, wynik netto miesięczny
- **Marże** — marże wg działów, ranking TOP5, trend 3-letni
- **Heatmapa** — heatmapa marż + delta r/r + porównanie 3 lat
- **Koszty** — drzewo kosztów rodzajowych 4xx, trend 3-letni, konta FK
- **Porównanie** — tabela r/r, wykres radarowy marż, top zmiany %, 🤖 AI "Kluczowe P&L"

### Dane
`MonthlyReportData`: `{ company, period, departments: DepartmentMargin[], totals: MonthlyReportTotals, costCategories, result, yearComparison, history }`

---

## Typy TypeScript (aktualne)

```ts
type ReportType = 'bilans' | 'rzis';
type ViewType = ReportType | 'kontrola' | 'analiza' | 'raport_miesieczny' | 'raport_grupy' | 'raport_ogolny';

interface ReportRow    { segment, name, level, values: {period1, period2, period3?}, definition, positionId, drilldownAccounts[] }
interface AccountRow   { numer, nazwa, saldoWn, saldoMa, persaldo, obrotyWn, obrotyMa, ... }
interface JournalEntry { konto, kontoPrzeciwstawne, kwotaWn, kwotaMa, dataKsiegowania, opis, ... }
interface Company      { id, name, period, periodLabels?, bilans[], rzis[], obroty[], zapisy[], zapisyUrl?,
                         raportMiesieczny?: MonthlyReportData, grpData?: GrpData }
interface FieldMap     { aktywaTrwale, aktywaObrotowe, zapasy, naleznosci, srodkiPieniezne, aktywaRazem,
                         kapitalWlasny, zobowiazaniaDlugo, zobowiazaniaKrotko, pasywaBilans,
                         kredytDlugo, kredytKrotko, przychody, kosztyOper, amortyzacja, cogs,
                         zyskZeSprz, ebit, odsetki, zyskBrutto, zyskNetto,
                         sources: Record<string, {found, name}> }
```

---

## Mapowanie pól (fieldMapping.ts) — znane pułapki

1. **EBIT** — Polish UoR RZiS nie ma wiersza "Zysk operacyjny" → wyliczany jako C+D-E
2. **Odsetki** — szukaj w sekcji "Koszty finansowe" (G), nie "Przychody finansowe" (F)
3. **Kredyty dług/krótk** — wiersze "z tytułu kredytów i pożyczek" (brak kwalifikatora) → 1. i 2. wystąpienie w bilansie
4. **Kapitał własny** — "Należne wpłaty na kapitał (fundusz) podstawowy" wyprzedza właściwy wiersz → szukaj `'własn'` jako wymagane słowo kluczowe

---

## Zarządzanie firmami

- Import: xlsx → auto-wykrycie po nazwie (`BIL`, `RZIS`, `OBROTY`, `ZAPISY`, `RAP_MENS`, `RAP_GP`)
- **Podmiana danych** (⟳ na kafelku): selektywna podmiana `Partial<CompanyData>`
- Firmy: `localStorage` per użytkownik + Supabase sync (opcjonalny)
- Zapisy FK: `fetch('/data/zapisy.json')` async przy pierwszym drilldownie

---

## Wydajność (bundle, 2026-06)

| Chunk | Gzip |
|-------|------|
| `RatioAnalysis` | 31 KB |
| `recharts` (shared) | 115 KB |
| `RaportMiesieczny` | 16 KB |
| `RaportGrupy` | 19 KB |
| `RaportPDF` | 9 KB |
| Main bundle | ~228 KB |

- `zapisy.json` (~42 MB) ładowany przez `fetch()` — nie blokuje startu
- `useMemo` na wszystkich obliczeniach wskaźników i mapowaniu pól
- `Recharts`, `RatioAnalysis`, `RaportMiesieczny`, `RaportGrupy`, `RaportPDF` — lazy-loaded

---

## Znane problemy i rozwiązania

### Recharts 3.8.1 — tree-shaking (Rolldown/Vite 8)
Komponenty będące wrapperami `React.memo/forwardRef` (typeof = 'object') są błędnie eliminowane przez Rolldown → stają się `undefined` → crash "n is not a function".

**Bezpieczne komponenty** (typeof = 'function', działają):
`BarChart, Bar, LineChart, Line, PieChart, Pie, ResponsiveContainer, XAxis, YAxis, CartesianGrid, Tooltip, Legend, Cell, ReferenceLine`

**Zastąpione** (były problematyczne):
- `FunnelChart` → `CustomFunnel` (CSS, w RaportMiesieczny.tsx)
- `AreaChart, Area` → `LineChart, Line`
- `RadarChart` → `BarChart` grouped
- `ScatterChart` → `CssScatter` (CSS absolute positioning)

### App.tsx — wrapper zakładek musi mieć `flex flex-col min-h-0`
Każda zakładka w `App.tsx` potrzebuje wrappera:
```tsx
<div className="flex-1 flex flex-col min-h-0 overflow-hidden" style={{zoom}}>
```
Brak `flex flex-col min-h-0` → dziecko z `flex-1 overflow-y-auto` nie będzie scrollować (kontrola bug 2026-06).

### Rolldown — import statements muszą być przed `const`
Vite 8 (Rolldown) nie pozwala na `import` po `const` declarations w tym samym scope.
Wszystkie `import` (w tym `import BilansVisuals`) muszą być na górze pliku, przed `const LazyX = lazy(...)`.

### Supabase — brak env vars
Aplikacja działa bez Supabase w trybie lokalnym (localStorage only + guest user).
`supabaseConfigured` flag w `src/lib/supabase.ts` kontroluje czy Supabase jest aktywny.

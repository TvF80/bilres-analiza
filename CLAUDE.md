# BilRes Analiza Sprawozdań Finansowych

Aplikacja webowa do interaktywnej analizy Bilansu i RZiS.  
Stack: **React 19 · Vite · TypeScript · Tailwind CSS v4 · Recharts**  
Lokalizacja: `C:\Users\tvf19\exco-analiza`  
Online: **https://tvf80.github.io/bilres-analiza/**

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
  lib/
    crypto.ts           SHA-256 hashing (Web Crypto API)
    xlsxParser.ts       Parsowanie xlsx w przeglądarce → typy danych
    fieldMapping.ts     Mapowanie pozycji BIL/RZiS → FieldMap (keyword matching)
    controlChecks.ts    Funkcje kontroli integralności i wskaźników
  store/
    AuthContext.tsx      Użytkownicy + sesja (localStorage + sessionStorage)
    CompaniesContext.tsx Biblioteka firm + isLoaded guard (fix race condition)
  components/
    LoginScreen.tsx      Siatka avatarów → hasło
    Sidebar.tsx          Nawigacja lewa — zwijana, podmień/usuń firmę
    Header.tsx           Bilans | RZiS | Kontrola | Analiza + zoom + szukaj
    ImportModal.tsx      Import 6 xlsx (tryb nowy + tryb podmiana danych)
    ReportTable.tsx      Tabela raportu z hierarchią
    DrilldownPanel.tsx   Konta (obroty) → Zapisy FK
    ControlSheet.tsx     Arkusz kontrolny: integralność, wskaźniki, makro
    RatioAnalysis.tsx    Analiza wskaźnikowa: 8 pod-zakładek + wykresy
    AnalysisCharts.tsx   Wykresy Recharts (lazy-loaded)
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

---

## Arkusz kontrolny (`kontrola`)

1. **Kompletność danych** — status ładowania bilansu/RZiS/obrotów/zapisów
2. **Kontrole integralności** — Aktywa=Pasywa, zasada podwójnego zapisu, BO+obroty=saldo
3. **Wskaźniki finansowe** — 10 wskaźników (płynność, ROA/ROE/ROS, zadłużenie, rotacje)
4. **Dane makroekonomiczne** — tabela GUS/NBP 2020–2026 (inflacja, EUR/PLN, WIBOR, PKB...)
5. **Statystyki dokumentu** — liczniki, zakres dat, sumy FK

---

## Analiza wskaźnikowa (`analiza`)

### Zakładki wskaźnikowe (każda: wykres + tabela)
- **Płynność** — bieżąca, szybka, gotówkowa
- **Sprawność** — rotacje aktywów (×3), DSO/DSI/DPO w dniach, CCC
- **Zadłużenie** — ogólne, KW, dług-/krótkoterminowe, DFL, ICR, dług netto/EBITDA
- **Rentowność** — ROE, ROA, ROS, marża brutto, EBIT, EBITDA
- **Dyskryminacyjne** — 6 modeli: Hołdy, Gajdki i Stosa, Prusaka BP2, Poznańska, Mączyńskiej, Jagiełły

### Zakładki struktury (uproszczone do poziomu 1)
- **Bilans** — donut aktywów + donut pasywów + tabela: udział% + Δ r/r
- **RZiS** — kaskada wyników (waterfall) + marże% + tabela: % przychodów + Δ r/r

### Narzędzia
- **Mapowanie pól** — diagnostyka: które pozycje bilansu/RZiS zostały dopasowane

---

## Zarządzanie firmami

- Import: 6 plików xlsx → auto-wykrycie po nazwie
- **Podmiana danych** (⟳ na kafelku): zastępuje bilans/RZiS/obroty bez zmiany ID firmy
- Firmy persystowane w `localStorage` per użytkownik (bez zapisów — za duże)
- **Bug fix**: `isLoaded` guard w CompaniesContext zapobiega nadpisaniu danych zerami przy logowaniu
- Zapisy FK: `fetch('/data/zapisy.json')` async przy pierwszym drilldownie

---

## Dane źródłowe

| Plik | Arkusz | Wiersze | Rola |
|------|--------|---------|------|
| EX_BIL schemat.xlsx | Pozycje zestawienia | 50 | Formuły bilansu |
| EX_BIL.xlsx | Wyniki zestawienia | 50 | Wartości bilansu |
| EX_RZIS schemat.xlsx | Pozycje zestawienia | 37 | Formuły RZiS |
| EX_RZIS.xlsx | Wyniki zestawienia | 37 | Wartości RZiS |
| EX_OBROTY.xlsx | Obroty i salda | 3 829 | Salda kont |
| EX_ZAPISY.xlsx | Zapisy księgowe | ~98 302 | Pełny dziennik FK |

---

## Wydajność

- Recharts (`RatioAnalysis`) lazy-loaded — oddzielny chunk 117 KB gzip
- Main bundle: ~194 KB gzip
- `zapisy.json` (~42 MB) ładowany przez `fetch()` — nie blokuje startu
- `CompaniesContext` nie serializuje zapisów do localStorage
- `useMemo` na wszystkich obliczeniach wskaźników i mapowaniu pól

---

## Typy TypeScript

```ts
type ViewType = 'bilans' | 'rzis' | 'kontrola' | 'analiza';
interface ReportRow    { segment, name, level, values: {period1, period2}, definition, positionId, drilldownAccounts[] }
interface AccountRow   { numer, nazwa, saldoWn, saldoMa, persaldo, obrotyWn, obrotyMa, ... }
interface JournalEntry { konto, kontoPrzeciwstawne, kwotaWn, kwotaMa, dataKsiegowania, opis, ... }
interface Company      { id, name, period, bilans[], rzis[], obroty[], zapisy[], zapisyUrl? }
interface AppUser      { id, name, passwordHash, hint, color, createdAt }
interface FieldMap     { aktywaTrwale, aktywaObrotowe, zapasy, naleznosci, srodkiPieniezne,
                         aktywaRazem, kapitalWlasny, zobowiazaniaDlugo, zobowiazaniaKrotko,
                         pasywaBilans, kredytDlugo, kredytKrotko, przychody, kosztyOper,
                         amortyzacja, cogs, zyskZeSprz, ebit, odsetki, zyskBrutto, zyskNetto,
                         sources: Record<string, {found, name}> }
```

---

## Parsowanie formuł FK

```
@SaldoWn(konto)  @SaldoMa(konto)  @obrotyWn(konto)  @obrotyMa(konto)
CHOOSE(a,b,c)    — reguła warunkowa
```

Regex: `/@(?:Saldo(?:Wn|Ma)|obroty(?:Wn|Ma))\(([^)]+)\)/gi`

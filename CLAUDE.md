# BilRes Analiza Sprawozdań Finansowych

Aplikacja webowa do interaktywnej analizy Bilansu i RZiS.  
Stack: **React 19 · Vite · TypeScript · Tailwind CSS v4**  
Lokalizacja: `C:\Users\tvf19\exco-analiza`

---

## Uruchomienie

```bash
npm run dev          # dev server — http://localhost:5173
node scripts/convert-xlsx.mjs   # odśwież dane z plików Excel
```

---

## Architektura

```
src/
  lib/
    crypto.ts          SHA-256 hashing (Web Crypto API) — bez zewnętrznych deps
    xlsxParser.ts      Parsowanie xlsx w przeglądarce → typy danych
  store/
    AuthContext.tsx    Lista użytkowników + sesja (localStorage + sessionStorage)
    CompaniesContext.tsx  Biblioteka firm + aktywna firma + lazy-load zapisów
  components/
    LoginScreen.tsx    Lista użytkowników → hasło → opcjonalny reset
    Sidebar.tsx        Lewa nawigacja — zwijana (w-56/w-14), lista firm
    Header.tsx         Nagłówek — edycja nazwy, Bilans/RZiS, zoom (−/+), szukaj, Import
    ImportModal.tsx    Import 6 plików xlsx (drag&drop + auto-wykrycie lub ręcznie)
    ReportTable.tsx    Tabela raportu — hierarchia, formatowanie PL
    DrilldownPanel.tsx Dwupoziomowy panel: konta (obroty) → zapisy dziennika
  hooks/
    useReportData.ts   Dostęp do danych aktywnej firmy (useMemo na 98k wierszach)
    useFormatNumber.ts Formatowanie PLN (Intl.NumberFormat pl-PL)
  data/               Statyczne JSON (bilans, rzis, obroty) — generowane skryptem
  types/index.ts      ReportRow · AccountRow · JournalEntry · Company · AppUser
public/
  data/zapisy.json    Dziennik FK — 98 302 wiersze, ~42 MB — ładowany async w tle
scripts/
  convert-xlsx.mjs    Konwersja 6 plików Excel → src/data/*.json + public/data/zapisy.json
```

---

## Dane źródłowe

| Plik | Arkusz | Wiersze | Rola |
|------|--------|---------|------|
| EX_BIL schemat.xlsx | Pozycje zestawienia | 50 | Formuły bilansu |
| EX_BIL.xlsx | Wyniki zestawienia | 50 | Wartości bilansu |
| EX_RZIS schemat.xlsx | Pozycje zestawienia | 37 | Formuły RZiS |
| EX_RZIS.xlsx | Wyniki zestawienia | 37 | Wartości RZiS |
| EX_OBROTY.xlsx | Obroty i salda | 3 829 | Salda kont |
| EX_ZAPISY.xlsx | Zapisy księgowe | 98 302 | Pełny dziennik FK |

Okres: **10.2024 – 09.2025**. Spółka: BilRes Poland.

---

## Flow danych

```
Excel → convert-xlsx.mjs → src/data/*.json (statyczne)
                         → public/data/zapisy.json (lazy fetch)
                         ↓
CompaniesContext → useReportData / useJournalEntries (memoized)
                         ↓
ReportTable → DrilldownPanel (AccountsView → JournalView)
```

---

## Logowanie i użytkownicy

- **Pierwsza wizyta**: formularz tworzenia konta (imię, hasło, podpowiedź)
- **Kolejne wizyty**: siatka avatarów → klik → hasło
- Hasło: SHA-256 + stały salt, hash w `localStorage`
- Sesja: flaga `ok` w `sessionStorage` (czyszczona przy zamknięciu karty)
- Odzyskiwanie: podpowiedź + reset hasła (dane firm zostają)
- Wylogowanie wraca do siatki użytkowników

---

## Zarządzanie firmami

- Domyślna firma **BilRes Poland** ładowana ze statycznych JSON
- Import nowej firmy: 6 plików xlsx → auto-wykrycie po nazwie (BIL/RZIS/SCHEMAT/OBROTY/ZAPISY)
- Firmy persystowane w `localStorage` (bez zapisów — za duże)
- Zapisy FK dla domyślnej firmy: `fetch('/data/zapisy.json')` przy pierwszym otwarciu panelu

---

## Drilldown (analityczny flow)

```
Pozycja raportu
  └→ [AccountsView] tabela kont z Obrotów
       Numer | Nazwa | Saldo Wn | Saldo Ma | Persaldo
       └→ kliknięcie konta
            └→ [JournalView] zapisy z dziennika FK
                 Filtr: konto = prefix LUB konto_przeciw = prefix
                 Sortowanie: wg daty
                 Suma kontrolna Wn/Ma na dole
```

---

## UX — sterowanie

| Element | Skrót / akcja |
|---------|--------------|
| Sidebar | przycisk `«»` — zwijanie do 56px |
| Zoom tabeli | `−` / `+` / klik `%` = reset 100% |
| Edycja nazwy firmy | klik na nazwę w headerze → Enter / Escape |
| Zmiana nazwy w sidebarze | najechanie → ikona ✎ |
| Drilldown zamknij | `×` w nagłówku panelu |
| Mobile menu | hamburger w lewym rogu headera |
| Mobile drilldown | pełnoekranowy overlay — zamknij `×` |

---

## Typy TypeScript

```ts
interface ReportRow    { segment, name, level, values, definition, positionId, drilldownAccounts[] }
interface AccountRow   { numer, nazwa, saldoWn, saldoMa, persaldo, obrotyWn, obrotyMa, ... }
interface JournalEntry { konto, kontoPrzeciwstawne, kwotaWn, kwotaMa, dataKsiegowania, opis, ... }
interface Company      { id, name, period, bilans[], rzis[], obroty[], zapisy[] }
interface AppUser      { id, name, passwordHash, hint, color, createdAt }
```

---

## Parsowanie formuł FK

Formuły z systemu FK (np. `@SaldoWn(011) - @SaldoMa(071)`):

```
@SaldoWn(konto)    saldo Wn konta
@SaldoMa(konto)    saldo Ma konta
@obrotyWn(konto)   obroty Wn konta
@obrotyMa(konto)   obroty Ma konta
@Zestawienie(X,n)  odwołanie do zestawienia — brak drilldown
CHOOSE(a,b,c)      reguła warunkowa — implementowana jawnie wg definicji
```

Regex ekstrakcji kont: `/@(?:Saldo(?:Wn|Ma)|obroty(?:Wn|Ma))\(([^)]+)\)/gi`

---

## Wydajność

- `useJournalEntries` i `useAccountsForRow` opakowane w `useMemo`
- `zapisy.json` (~42 MB) ładowany przez `fetch()` — nie blokuje startu
- `CompaniesContext` nie serializuje zapisów do localStorage
- Zoom tabeli: CSS `zoom` property (natywne, bez dodatkowego DOM)

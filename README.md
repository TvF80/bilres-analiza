# BilRes — Analiza Sprawozdań Finansowych

Aplikacja webowa do interaktywnej analizy **Bilansu** i **RZiS** na podstawie danych eksportowanych z systemu FK.

## Funkcje

- 📊 **Bilans i RZiS** — hierarchiczna tabela pozycji z wartościami
- 🔍 **Drilldown analityczny** — pozycja raportu → konta (obroty) → zapisy dziennika FK
- 🏢 **Biblioteka firm** — wiele firm, przełączanie z bocznego paska
- 📥 **Import z Excel** — drag & drop lub ręczny wybór 6 plików xlsx
- 👥 **Multi-user** — lista użytkowników z indywidualnym hasłem
- 🔎 **Zoom** — skalowanie tabeli (75%–150%)
- 📱 **Responsive** — działa na komputerze i telefonie

## Wymagania

- Node.js 18+
- npm 9+

## Instalacja

```bash
git clone <repo-url>
cd exco-analiza
npm install
```

## Dane — import z Excel

Aplikacja nie zawiera żadnych danych. Importujesz je bezpośrednio przez UI lub jednorazowym skryptem.

### Opcja A — Import przez UI (zalecana)

1. Uruchom: `npm run dev`
2. Utwórz konto i zaloguj się
3. Kliknij **+ Importuj firmę** w pasku bocznym
4. Przeciągnij pliki xlsx lub wybierz ręcznie

### Opcja B — Skrypt konwersji (dla dużych plików zapisów)

```bash
node scripts/convert-xlsx.mjs "C:\ścieżka\do\foldera\z\plikami"
# lub przez zmienną środowiskową:
set BilRes_DATA_DIR=C:\ścieżka\do\foldera
node scripts/convert-xlsx.mjs
```

Skrypt generuje:
- `src/data/bilans.json`, `rzis.json`, `obroty.json`
- `public/data/zapisy.json` (duże pliki — ładowane asynchronicznie)

## Wymagane pliki Excel

| Wzorzec nazwy pliku | Arkusz | Zawartość |
|---------------------|--------|-----------|
| `*BIL*schemat*` | Pozycje zestawienia | Formuły bilansu |
| `*BIL*` (bez schemat) | Wyniki zestawienia | Wartości bilansu |
| `*RZIS*schemat*` | Pozycje zestawienia | Formuły RZiS |
| `*RZIS*` (bez schemat) | Wyniki zestawienia | Wartości RZiS |
| `*OBROTY*` | Obroty i salda | Salda kont |
| `*ZAPISY*` | Zapisy księgowe | Dziennik FK |

> Auto-wykrycie pliku działa na podstawie słów kluczowych w nazwie (BIL, RZIS, SCHEMAT, OBROTY, ZAPISY).

## Kolumny danych

**Obroty i salda:** `Numer | Nazwa | BO Wn | BO Ma | Obroty Wn | Obroty Ma | Saldo Wn | Saldo Ma | Persaldo`

**Zapisy księgowe:** `Nr dziennika | Data | Dokument | Podmiot | Nazwa podmiotu | Konto | Konto przeciw. | Kwota Wn | Kwota Ma | Opis`

## Uruchomienie

```bash
npm run dev      # http://localhost:5173
npm run build    # produkcyjny build → dist/
npm run preview  # podgląd buildu
```

## Struktura projektu

```
src/
  components/   UI — LoginScreen, Sidebar, Header, ReportTable, DrilldownPanel, ImportModal, EmptyState
  store/        AuthContext (użytkownicy) · CompaniesContext (firmy + dane)
  hooks/        useReportData · useFormatNumber
  lib/          crypto (SHA-256) · xlsxParser (browser Excel import)
  types/        ReportRow · AccountRow · JournalEntry · Company · AppUser
public/data/    zapisy.json — generowany przez skrypt, NIE w repozytorium
scripts/
  convert-xlsx.mjs   Konwersja 6 plików Excel → JSON
```

## Prywatność

Wszystkie dane przechowywane **lokalnie** w przeglądarce (`localStorage`). Aplikacja nie wysyła żadnych danych na zewnątrz. Hasła hashowane SHA-256.

## Technologie

- [React 19](https://react.dev/) + [Vite](https://vite.dev/)
- [TypeScript](https://www.typescriptlang.org/)
- [Tailwind CSS v4](https://tailwindcss.com/)
- [SheetJS (xlsx)](https://sheetjs.com/) — parsowanie Excel w przeglądarce

## Licencja

MIT

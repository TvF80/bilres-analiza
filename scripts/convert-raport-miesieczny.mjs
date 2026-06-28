/**
 * Konwersja raportu miesięcznego (zarządczego) → JSON
 * Uruchamiać: node scripts/convert-raport-miesieczny.mjs ["<raport.xlsx>" "<comp.xlsx>"]
 * Wynik: src/data/raportMiesieczny.json
 *
 * Domyślne ścieżki źródłowe (Pulpit użytkownika):
 *   "ex_rap miesieczny 09.25.xlsx"               — raport za okres 10.2024-09.2025
 *   "ex_rap miesieczny  comp r-1; r-2 09.25.xlsx" — porównanie roczne 2023/2024/2025
 */

import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const XLSX = require('xlsx');
import { writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { homedir } from 'os';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(__dirname, '..', 'src', 'data');
mkdirSync(OUT_DIR, { recursive: true });

const DESKTOP = join(homedir(), 'Desktop');
const REPORT_FILE = process.argv[2] || join(DESKTOP, 'ex_rap miesieczny 09.25.xlsx');
const COMP_FILE = process.argv[3] || join(DESKTOP, 'ex_rap miesieczny  comp r-1; r-2 09.25.xlsx');

const REPORT_SHEET = 'RES ANA PLN';
const COMPARISON_SHEET = 'B_RAP_COMP CUMUL';
const BAZA_SHEET = 'BAZA';

// Arkusze roczne w pliku comp — każdy pokrywa rok obrachunkowy 10.(rok-1) – 09.(rok),
// z DOKŁADNIE tym samym układem wierszy/kolumn co główny raport „RES ANA PLN”.
// Dzięki temu można odtworzyć 36-miesięczną historię (3 lata × 12 mies.) dla każdej linii.
const HISTORY_SHEETS = [
  { fy: '2023', label: '10.2022–09.2023', sheet: 'RES ANA PLN 2023' },
  { fy: '2024', label: '10.2023–09.2024', sheet: 'RES ANA PLN 2024' },
  { fy: '2025', label: '10.2024–09.2025', sheet: 'RES ANA PLN 2025' },
];

// Kolumny miesięczne w arkuszu RES ANA PLN: H,J,L,N,P,R,T,V,X,Z,AB,AD = 10/2024 .. 09/2025
const MONTH_COLS = [7, 9, 11, 13, 15, 17, 19, 21, 23, 25, 27, 29];
const TOTAL_COL = 2; // C — suma okresu (TOTAL)
const PERIOD_LABELS = [
  '10/2024', '11/2024', '12/2024', '01/2025', '02/2025', '03/2025',
  '04/2025', '05/2025', '06/2025', '07/2025', '08/2025', '09/2025',
];

// --- helpers ---

const PL_CHARS = { ą: 'a', ć: 'c', ę: 'e', ł: 'l', ń: 'n', ó: 'o', ś: 's', ź: 'z', ż: 'z' };

function slug(s) {
  return s
    .toLowerCase()
    .replace(/[ąćęłńóśźż]/g, (ch) => PL_CHARS[ch] || ch)
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function num(v) {
  if (typeof v === 'number') return v;
  if (v === null || v === undefined || v === '') return 0;
  const n = Number(String(v).replace(',', '.'));
  return isNaN(n) ? 0 : n;
}

function cellAt(ws, r, c) {
  const cell = ws[XLSX.utils.encode_cell({ r, c })];
  return cell ? cell.v : undefined;
}

// `row` to numer wiersza z arkusza (1-indeksowany, jak w Excelu) — konwertujemy na indeks 0-based.
// Jeśli podano `historyWb` (skoroszyt comp), dokładamy 3-letnią historię z arkuszy HISTORY_SHEETS
// (ten sam numer wiersza = ta sama pozycja raportu — układ jest identyczny we wszystkich arkuszach rocznych).
function readLine(ws, row, historyWb) {
  const r = row - 1;
  const labelPl = String(cellAt(ws, r, 0) ?? '').trim();
  const labelFr = String(cellAt(ws, r, 1) ?? '').trim() || undefined;
  const line = {
    id: slug(labelPl),
    labelPl,
    labelFr,
    monthly: MONTH_COLS.map((c) => num(cellAt(ws, r, c))),
    total: num(cellAt(ws, r, TOTAL_COL)),
  };
  if (historyWb) {
    line.history = HISTORY_SHEETS.map(({ fy, label, sheet }) => {
      const hws = historyWb.Sheets[sheet];
      return {
        fy,
        label,
        monthly: MONTH_COLS.map((c) => num(cellAt(hws, r, c))),
        total: num(cellAt(hws, r, TOTAL_COL)),
      };
    });
  }
  return line;
}

// --- Korespondencja kont księgowych (BAZA): konto GL -> kategoria/etykieta raportu ---
// Kolumny: B=numer konta (KONTO BAL ANA), C=nazwa konta, D=kategoria EXCO, E=etykieta uproszczona
// (ta etykieta odpowiada nazwom pozycji kosztowych/działów w raporcie — łączymy po slug()).

function parseAccountMap(ws) {
  const range = XLSX.utils.decode_range(ws['!ref']);
  const map = new Map(); // slug(etykieta) -> [{ number, name }]
  for (let r = 1; r <= range.e.r; r++) {
    const number = String(cellAt(ws, r, 1) ?? '').trim();
    const name = String(cellAt(ws, r, 2) ?? '').trim();
    const label = String(cellAt(ws, r, 4) ?? '').trim();
    if (!number || !label) continue;
    const key = slug(label);
    if (!map.has(key)) map.set(key, []);
    map.get(key).push({ number, name });
  }
  return map;
}

function attachAccounts(line, accountMap) {
  const accounts = accountMap.get(line.id);
  return accounts ? { ...line, accounts } : line;
}

// --- Działy sprzedaży: trójki wierszy (Sprzedaż / Koszt sprzedaży / Marża), wiersze 8-46 ---

const DEPARTMENT_FIRST_ROWS = [8, 11, 14, 17, 20, 23, 26, 29, 32, 35, 38, 41, 44];

function parseDepartments(ws, historyWb, accountMap) {
  return DEPARTMENT_FIRST_ROWS.map((r) => {
    const revenue = attachAccounts(readLine(ws, r, historyWb), accountMap);
    const cost = attachAccounts(readLine(ws, r + 1, historyWb), accountMap);
    const margin = readLine(ws, r + 2, historyWb);
    const key = revenue.labelPl.replace(/^Sprzedaż usług\s+/i, '').trim();
    return { key, label: key, revenue, cost, margin };
  });
}

// --- Sumy pośrednie: wiersze 47-51 ---

function parseTotals(ws, historyWb) {
  return {
    revenue: readLine(ws, 47, historyWb),
    costOfSales: readLine(ws, 48, historyWb),
    grossMargin: readLine(ws, 49, historyWb),
    adminCosts: readLine(ws, 50, historyWb),
    grossMarginTotal: readLine(ws, 51, historyWb),
  };
}

// --- Hierarchia kosztów rodzajowych (4xx): wiersze 52-118, struktura wg szablonu raportu ---

const COST_TREE = [
  { row: 52, children: [53, 54, 55, 56, 57] },
  { row: 58, children: [59, 60, 61, 62, 63, 64] },
  { row: 65, children: [66, 67, 68, 69, 70, 71] },
  {
    row: 72,
    children: [
      { row: 73, children: [74, 75, 76, 77, 78, 79, 80, 81, 82, 83] },
      { row: 84, children: [85, 86, 87, 88, 89] },
      { row: 90, children: [91, 92, 93, 94, 95, 96, 97, 98, 99, 100, 101, 102, 103, 104, 105, 106, 107] },
      { row: 108, children: [109, 110, 111, 112, 113] },
      { row: 114, children: [115, 116, 117, 118] },
    ],
  },
];

function buildCostNode(ws, node, historyWb, accountMap) {
  if (typeof node === 'number') return attachAccounts(readLine(ws, node, historyWb), accountMap);
  const line = readLine(ws, node.row, historyWb);
  return { ...line, children: node.children.map((c) => buildCostNode(ws, c, historyWb, accountMap)) };
}

function parseCostCategories(ws, historyWb, accountMap) {
  return COST_TREE.map((n) => buildCostNode(ws, n, historyWb, accountMap));
}

// --- Linie wyniku: wiersze 119-130 + 132-136 (131/137/138 to wiersze kontrolne — pomijamy) ---

const RESULT_ROWS = [119, 120, 121, 122, 123, 124, 125, 126, 127, 128, 129, 130, 132, 133, 134, 135, 136];

function parseResult(ws, historyWb) {
  return RESULT_ROWS.map((r) => readLine(ws, r, historyWb));
}

// --- Porównanie roczne narastające 2023/2024/2025 (z pliku comp, arkusz B_RAP_COMP CUMUL) ---
// Kolumny: A=PL, C=2025 (Montant), E=2024, G=2023, I=delta 2025-2024, J=delta 2024-2023, K=% zmiany r/r

function parseYearComparison(ws) {
  const items = [];
  for (let r = 7; r <= 135; r++) {
    const labelPl = String(cellAt(ws, r, 0) ?? '').trim();
    if (!labelPl) continue;
    const pct = cellAt(ws, r, 10);
    items.push({
      id: slug(labelPl),
      labelPl,
      values: {
        y2025: num(cellAt(ws, r, 2)),
        y2024: num(cellAt(ws, r, 4)),
        y2023: num(cellAt(ws, r, 6)),
      },
      deltaRY1: num(cellAt(ws, r, 8)),
      deltaRY2: num(cellAt(ws, r, 9)),
      deltaPctRY1: typeof pct === 'number' ? pct : null,
    });
  }
  return items;
}

// --- run ---

const reportWb = XLSX.readFile(REPORT_FILE);
const reportWs = reportWb.Sheets[REPORT_SHEET];
if (!reportWs) throw new Error(`Nie znaleziono arkusza "${REPORT_SHEET}" w ${REPORT_FILE}`);

const compWb = XLSX.readFile(COMP_FILE);
const compWs = compWb.Sheets[COMPARISON_SHEET];
if (!compWs) throw new Error(`Nie znaleziono arkusza "${COMPARISON_SHEET}" w ${COMP_FILE}`);

const bazaWs = reportWb.Sheets[BAZA_SHEET];
if (!bazaWs) throw new Error(`Nie znaleziono arkusza "${BAZA_SHEET}" w ${REPORT_FILE}`);
const accountMap = parseAccountMap(bazaWs);

const data = {
  company: 'EXCO A2A Polska',
  period: '10.2024 – 09.2025',
  periodLabels: PERIOD_LABELS,
  comparisonLabel: 'Wartości roczne narastające (TOTAL): 2023 / 2024 / 2025',
  history: HISTORY_SHEETS.map(({ fy, label }) => ({ fy, label })),
  departments: parseDepartments(reportWs, compWb, accountMap),
  totals: parseTotals(reportWs, compWb),
  costCategories: parseCostCategories(reportWs, compWb, accountMap),
  result: parseResult(reportWs, compWb),
  yearComparison: parseYearComparison(compWs),
};

let accountedLeaves = 0;
let totalLeaves = 0;
function countLeaves(nodes) {
  for (const n of nodes) {
    if (n.children) countLeaves(n.children);
    else {
      totalLeaves++;
      if (n.accounts) accountedLeaves++;
    }
  }
}
countLeaves(data.costCategories);

writeFileSync(join(OUT_DIR, 'raportMiesieczny.json'), JSON.stringify(data, null, 2));
console.log(
  `raportMiesieczny.json — ${data.departments.length} działów, ` +
  `${data.costCategories.length} grup kosztów (drzewo), ` +
  `${data.result.length} linii wyniku, ` +
  `${data.yearComparison.length} pozycji porównania rocznego, ` +
  `historia 3-letnia: ${data.history.map((h) => h.fy).join('/')}, ` +
  `konta BAZA dopasowane: ${accountedLeaves}/${totalLeaves} pozycji kosztowych (liście)`
);

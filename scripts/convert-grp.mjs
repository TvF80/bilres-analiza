/**
 * Konwersja GRP.xlsx → src/data/grpData.json
 * Uruchamiać: node scripts/convert-grp.mjs ["<ścieżka/GRP.xlsx>"]
 * Domyślnie szuka C:\Users\<user>\Desktop\GRP.xlsx
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
const GRP_FILE = process.argv[2] || join(DESKTOP, 'GRP.xlsx');

console.log('Czytam:', GRP_FILE);
const wb = XLSX.readFile(GRP_FILE);

// ── Arkusz 1: MB GRP 2025 ──────────────────────────────────────────────────
// Row 1 (idx 0): nagłówki miesięcy (co 4 kolumny: C6,C10,...,C50,C54,C62)
// Row 2 (idx 1): LIDER GRUPA(0), GRUPA NR.(1), MIASTO(2), DZIAŁ(3), B/K(4),
//                potem dla każdego miesiąca: PRZYCHOD,KOSZT,MB,MB% (4 kol.)
//                C54-C57: TOTAL FY, C62-C65: TOTAL extended
// Row 3+ (idx 2+): dane grup

const PERIOD_LABELS = [
  '10/2024','11/2024','12/2024','01/2025','02/2025','03/2025',
  '04/2025','05/2025','06/2025','07/2025','08/2025','09/2025',
];

// Kolumny startowe (0-based) dla każdego z 12 miesięcy: C6=5, C10=9, ...
const MONTH_START_COLS = [5, 9, 13, 17, 21, 25, 29, 33, 37, 41, 45, 49];
// TOTAL FY: C54=53, TOTAL extended: C62=61
const TOTAL_COL  = 53; // PRZYCHOD=53, KOSZT=54, MB=55, MB%=56
const TOTAL2_COL = 61; // PRZYCHOD=61, KOSZT=62, MB=63, MB%=64

const ws1 = wb.Sheets['MB GRP 2025'];
const raw1 = XLSX.utils.sheet_to_json(ws1, { header: 1, defval: 0 });

function num(v) {
  if (typeof v === 'number') return v;
  if (typeof v === 'string') {
    const s = v.replace(/\s/g, '').replace(',', '.');
    const n = parseFloat(s);
    return isNaN(n) ? 0 : n;
  }
  return 0;
}
function str(v) { return typeof v === 'string' ? v.trim() : String(v ?? '').trim(); }

const groups = [];
for (let r = 2; r < raw1.length; r++) {
  const row = raw1[r];
  const lider = str(row[0]);
  if (!lider || lider === '0' || lider === 'TOTAL' || lider === '') continue;
  const bk = str(row[4]);
  if (bk === 'TOTAL' || bk === '' || bk === '0') continue;

  const monthly = {
    przychod: [], koszt: [], mb: [], mbPct: [],
  };
  for (const startCol of MONTH_START_COLS) {
    monthly.przychod.push(num(row[startCol]));
    monthly.koszt.push(num(row[startCol + 1]));
    monthly.mb.push(num(row[startCol + 2]));
    monthly.mbPct.push(num(row[startCol + 3]));
  }

  groups.push({
    lider,
    groupNr: str(row[1]),
    miasto: str(row[2]),
    dzial: str(row[3]),
    bk,
    komentarz: str(row[57]) || str(row[58]) || '',
    monthly,
    total: {
      przychod: num(row[TOTAL_COL]),
      koszt:    num(row[TOTAL_COL + 1]),
      mb:       num(row[TOTAL_COL + 2]),
      mbPct:    num(row[TOTAL_COL + 3]),
    },
    totalExt: {
      przychod: num(row[TOTAL2_COL]),
      koszt:    num(row[TOTAL2_COL + 1]),
      mb:       num(row[TOTAL2_COL + 2]),
      mbPct:    num(row[TOTAL2_COL + 3]),
    },
  });
}
console.log(`Grupy (MB GRP): ${groups.length}`);

// ── Arkusz 2: Lista pracowników 25 ────────────────────────────────────────
// C1=LIDER(akronim), C2=opis GP(nr grupy), C3=sort, C4=akronim, C5=centrum_podlegl,
// C6=lider_root, C8=B/K, C9=MIASTO, C10=DZIAL, C11=sub_lider

const ws2 = wb.Sheets['Lista pracowników 25'];
const raw2 = XLSX.utils.sheet_to_json(ws2, { header: 1, defval: '' });

const employees = [];
for (let r = 1; r < raw2.length; r++) {
  const row = raw2[r];
  const lider = str(row[0]);
  if (!lider) continue;
  employees.push({
    lider,
    groupNr: str(row[1]),
    sort: str(row[2]),
    akronim: str(row[3]),
    centrum: str(row[4]),
    bk: str(row[7]),
    miasto: str(row[8]),
    dzial: str(row[9]),
  });
}
console.log(`Pracownicy: ${employees.length}`);

// Liczba pracowników per grupa
const headcountMap = {};
for (const e of employees) {
  const key = e.groupNr;
  if (!key) continue;
  headcountMap[key] = (headcountMap[key] || 0) + 1;
}

// ── Arkusz 3: KOSZT PRAC GRUPA 2025 ───────────────────────────────────────
// Row 1 (idx 0): AKRONIM,GRUPA PRACY,10/2024..09/2025,RAZEM  (cols 0-14)
// Row 2 (idx 1): '',SUMA,...
// Row 3+ (idx 2+): nr grupy, nazwa, 12 miesięcy, razem

const ws3 = wb.Sheets['KOSZT PRAC GRUPA 2025'];
const raw3 = XLSX.utils.sheet_to_json(ws3, { header: 1, defval: 0 });

const kosztPrac = [];
let sumaKosztPrac = null;
for (let r = 1; r < raw3.length; r++) {
  const row = raw3[r];
  const groupNr = str(row[0]);
  const name = str(row[1]);
  if (!name || name === '0' || name === '#N/D' || name.startsWith('#')) continue;
  const monthly = [];
  for (let c = 2; c <= 13; c++) monthly.push(num(row[c]));
  const razem = num(row[14]);
  if (name === 'SUMA') {
    sumaKosztPrac = { monthly, razem };
    continue;
  }
  kosztPrac.push({ groupNr, name, monthly, razem });
}
console.log(`Koszt prac grup: ${kosztPrac.length}`);

// ── Agregaty ───────────────────────────────────────────────────────────────
// Dołącz headcount do grup
for (const g of groups) {
  g.headcount = headcountMap[g.groupNr] ?? 0;
}

// Mapa koszt prac per grupaNr
const kosztPracMap = {};
for (const kp of kosztPrac) {
  kosztPracMap[kp.groupNr] = kp;
}

// ── Hierarchia z centrum kosztów ─────────────────────────────────────────
// Centrum format: [unit]_[city]_[dept]_[nr]_[direct_lider]_[parent]_[root]_[bk]_
// Budujemy mapę: lider → { directParent, rootParent, members[] }
const hierarchyMap = {};
for (const e of employees) {
  const parts = e.centrum.split('_').filter(Boolean);
  if (parts.length < 7) continue;
  const unit = parts[0];
  const directLider = parts[4] ?? '';
  const parent = parts[5] ?? '';
  const root = parts[6] ?? '';
  const lider = e.lider;
  if (!hierarchyMap[lider]) {
    hierarchyMap[lider] = { directParent: parent, rootParent: root, members: [] };
  }
  if (unit && unit !== lider) {
    hierarchyMap[lider].members.push({ unit, directLider });
  }
}

// ── Zapis ─────────────────────────────────────────────────────────────────
const out = {
  periodLabels: PERIOD_LABELS,
  groups,
  employees,
  kosztPrac,
  sumaKosztPrac,
  hierarchyMap,
};

const outPath = join(OUT_DIR, 'grpData.json');
writeFileSync(outPath, JSON.stringify(out));
console.log(`Zapisano: ${outPath} (${Math.round(JSON.stringify(out).length / 1024)} KB)`);

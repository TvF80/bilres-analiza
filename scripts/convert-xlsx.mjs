/**
 * Konwersja plików Excel → JSON
 * Uruchamiać: node scripts/convert-xlsx.mjs
 * Wynik: src/data/{bilans,rzis,obroty,zapisy}.json
 */

import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const XLSX = require('xlsx');
import { writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SRC_DIR = join(__dirname, '..', 'src', 'data');
const PUBLIC_DIR = join(__dirname, '..', 'public', 'data');

// Source directory: pass as CLI arg or set BILRES_DATA_DIR env variable

const DATA_DIR = process.argv[2] || process.env.BILRES_DATA_DIR || null;

if (!DATA_DIR) {
  console.error('Błąd: podaj ścieżkę do folderu z plikami Excel:');
  console.error('  node scripts/convert-xlsx.mjs "C:\\path\\to\\excel\\files"');
  console.error('  lub ustaw zmienną środowiskową BILRES_DATA_DIR');
  process.exit(1);
}

mkdirSync(SRC_DIR, { recursive: true });

// --- helpers ---

function parsePolishNumber(val) {
  if (val === null || val === undefined || val === '') return 0;
  if (typeof val === 'number') return val;
  const s = String(val).replace(/\s/g, '').replace(',', '.');
  const n = parseFloat(s);
  return isNaN(n) ? 0 : n;
}

/** Wyciąga numery kont z formuły FK */
function extractAccounts(definition) {
  if (!definition) return [];
  const regex = /@(?:Saldo(?:Wn|Ma)|obroty(?:Wn|Ma))\(([^)]+)\)/gi;
  const accounts = new Set();
  let m;
  while ((m = regex.exec(definition)) !== null) {
    accounts.add(m[1].trim());
  }
  return [...accounts];
}

/** Wyznacza poziom hierarchii na podstawie segmentu */
function getLevel(segment) {
  if (segment === '-') return 0;
  if (/^[A-Z]$/.test(segment)) return 1;
  if (/^[IVX]+$/.test(segment)) return 2;
  if (/^[a-z]$/.test(segment)) return 3;
  return 4;
}

// --- Bilans ---

function convertBilans() {
  const schemaWb = XLSX.readFile(join(DATA_DIR, 'EX_BIL 10.24-09.25 schemat.xlsx'));
  const dataWb   = XLSX.readFile(join(DATA_DIR, 'EX_BIL 10.24-09.25.xlsx'));

  const schemaRows = XLSX.utils.sheet_to_json(schemaWb.Sheets['Pozycje zestawienia'], { header: 1 });
  const dataRows   = XLSX.utils.sheet_to_json(dataWb.Sheets['Wyniki zestawienia księgowego'], { header: 1 });

  // skip header row (index 0)
  const rows = [];
  for (let i = 1; i < schemaRows.length; i++) {
    const s = schemaRows[i];
    const d = dataRows[i] || [];
    const segment = String(s[0] || '').trim();
    const name    = String(s[1] || '').trim();
    if (!name) continue;

    const definition  = String(s[2] || '').trim() || null;
    const positionId  = String(s[3] || '').trim() || null;

    const val1 = parsePolishNumber(d[3]); // 10.2024-09.2025
    const val2 = parsePolishNumber(d[2]); // 10.2025-03.2026

    rows.push({
      segment,
      name,
      level: getLevel(segment),
      values: { period1: val1, period2: val2 },
      definition,
      positionId,
      drilldownAccounts: extractAccounts(definition),
    });
  }

  writeFileSync(join(SRC_DIR, 'bilans.json'), JSON.stringify(rows, null, 2));
  console.log(`bilans.json — ${rows.length} wierszy`);
}

// --- RZiS ---

function convertRzis() {
  const schemaWb = XLSX.readFile(join(DATA_DIR, 'EX_RZIS 10.24-09.25 schemat.xlsx'));
  const dataWb   = XLSX.readFile(join(DATA_DIR, 'EX_RZIS 10.24-09.25.xlsx'));

  const schemaRows = XLSX.utils.sheet_to_json(schemaWb.Sheets['Pozycje zestawienia'], { header: 1 });
  const dataRows   = XLSX.utils.sheet_to_json(dataWb.Sheets['Wyniki zestawienia księgowego'], { header: 1 });

  const rows = [];
  for (let i = 1; i < schemaRows.length; i++) {
    const s = schemaRows[i];
    const d = dataRows[i] || [];
    const segment = String(s[0] || '').trim();
    const name    = String(s[1] || '').trim();
    if (!name) continue;

    const definition  = String(s[2] || '').trim() || null;
    const positionId  = String(s[3] || '').trim() || null;

    const val1 = parsePolishNumber(d[3]);
    const val2 = parsePolishNumber(d[2]);

    rows.push({
      segment,
      name,
      level: getLevel(segment),
      values: { period1: val1, period2: val2 },
      definition,
      positionId,
      drilldownAccounts: extractAccounts(definition),
    });
  }

  writeFileSync(join(SRC_DIR, 'rzis.json'), JSON.stringify(rows, null, 2));
  console.log(`rzis.json — ${rows.length} wierszy`);
}

// --- Obroty ---

function convertObroty() {
  const wb = XLSX.readFile(join(DATA_DIR, 'EX_OBROTY 10.24-09.25.xlsx'));
  const raw = XLSX.utils.sheet_to_json(wb.Sheets['Obroty i salda'], { header: 1 });

  const rows = [];
  for (let i = 1; i < raw.length; i++) {
    const r = raw[i];
    const numer = String(r[0] || '').trim();
    if (!numer) continue;

    rows.push({
      numer,
      nazwa:    String(r[1] || '').trim(),
      nazwa2:   String(r[2] || '').trim() || null,
      boWn:     parsePolishNumber(r[3]),
      boMa:     parsePolishNumber(r[4]),
      obrotyWn: parsePolishNumber(r[5]),
      obrotyMa: parsePolishNumber(r[6]),
      obrotyNWn:parsePolishNumber(r[7]),
      obrotyNMa:parsePolishNumber(r[8]),
      saldoWn:  parsePolishNumber(r[9]),
      saldoMa:  parsePolishNumber(r[10]),
      persaldo: parsePolishNumber(r[11]),
    });
  }

  writeFileSync(join(SRC_DIR, 'obroty.json'), JSON.stringify(rows, null, 2));
  console.log(`obroty.json — ${rows.length} kont`);
}

// --- Zapisy ---

function convertZapisy() {
  const wb = XLSX.readFile(join(DATA_DIR, 'EX_ZAPISY 10.24-09.25.xlsx'));
  const raw = XLSX.utils.sheet_to_json(wb.Sheets['Zapisy księgowe'], { header: 1 });

  const rows = [];
  for (let i = 1; i < raw.length; i++) {
    const r = raw[i];
    const nrDziennika = String(r[0] || '').trim();
    if (!nrDziennika) continue;

    // Data: Excel serial number or string
    let dataKsiegowania = '';
    const rawDate = r[2];
    if (typeof rawDate === 'number') {
      const d = XLSX.SSF.parse_date_code(rawDate);
      dataKsiegowania = `${d.y}-${String(d.m).padStart(2,'0')}-${String(d.d).padStart(2,'0')}`;
    } else if (rawDate) {
      // Try to parse DD.MM.YYYY
      const parts = String(rawDate).split('.');
      if (parts.length === 3) {
        dataKsiegowania = `${parts[2]}-${parts[1]}-${parts[0]}`;
      } else {
        dataKsiegowania = String(rawDate).trim();
      }
    }

    rows.push({
      nrDziennika,
      nrDziennikaC:    String(r[1] || '').trim(),
      dataKsiegowania,
      dokument:        String(r[3] || '').trim(),
      podmiot:         String(r[4] || '').trim() || null,
      nazwaPodmiotu:   String(r[5] || '').trim() || null,
      konto:           String(r[6] || '').trim(),
      kontoPrzeciwstawne: String(r[7] || '').trim() || null,
      kwotaWn:         parsePolishNumber(r[8]),
      kwotaMa:         parsePolishNumber(r[9]),
      idKsiegowy:      String(r[10] || '').trim(),
      opis:            String(r[11] || '').trim() || null,
    });
  }

  // Zapisy are large — save to public/data for lazy-fetch, not bundled in app
  mkdirSync(PUBLIC_DIR, { recursive: true });
  writeFileSync(join(PUBLIC_DIR, 'zapisy.json'), JSON.stringify(rows, null, 2));
  console.log(`public/data/zapisy.json — ${rows.length} zapisów`);
}

// --- run ---

try {
  convertBilans();
  convertRzis();
  convertObroty();
  convertZapisy();
  console.log('\nKonwersja zakończona. Pliki w src/data/');
} catch (err) {
  console.error('Błąd:', err.message);
  process.exit(1);
}

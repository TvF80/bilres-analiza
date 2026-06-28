/**
 * Konwersja plików Excel → JSON
 * Uruchamiać: node scripts/convert-xlsx.mjs
 * Wynik: src/data/{bilans,rzis,obroty,zapisy}.json
 */

import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const XLSX = require('xlsx');
import { writeFileSync, mkdirSync, existsSync, readdirSync } from 'fs';
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

// --- Nowy format: jeden plik BIL/RZIS z 3 kolumnami danych ---

/** Wczytuje definicje (formuły FK) z pliku schemat → Map<nazwaWiersza, {definition, positionId}> */
function loadSchemaDefinitions(schemaPath) {
  try {
    const wb = XLSX.readFile(schemaPath);
    const sheetName = wb.SheetNames.find(n => n.includes('Pozycje')) ?? wb.SheetNames[0];
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { header: 1 });
    const map = new Map();
    for (let i = 1; i < rows.length; i++) {
      const r = rows[i];
      const name = String(r[1] || '').trim();
      const def  = String(r[2] || '').trim() || null;
      const pid  = String(r[3] || '').trim() || null;
      if (name) map.set(name, { definition: def, positionId: pid });
    }
    console.log(`  Schemat: ${schemaPath} → ${map.size} definicji`);
    return map;
  } catch (e) {
    console.warn(`  Schemat niedostępny: ${e.message}`);
    return new Map();
  }
}

function convertCombined(excelFile, outFile, schemaFile) {
  const wb = XLSX.readFile(excelFile);
  const sheet = wb.Sheets['Wyniki zestawienia księgowego']
    ?? wb.Sheets[wb.SheetNames[0]];
  const dataRows = XLSX.utils.sheet_to_json(sheet, { header: 1 });

  const header = dataRows[0] || [];
  const periodLabels = [
    String(header[2] || '').trim(),
    String(header[3] || '').trim(),
    String(header[4] || '').trim(),
  ].filter(Boolean);

  // Wczytaj definicje ze schema file (dla drilldown)
  const schemaMap = schemaFile ? loadSchemaDefinitions(schemaFile) : new Map();

  const rows = [];
  for (let i = 1; i < dataRows.length; i++) {
    const d = dataRows[i];
    const segment = String(d[0] || '').trim();
    const name    = String(d[1] || '').trim();
    if (!name) continue;

    // Merguj definition z pliku schemat (match po nazwie wiersza)
    const schemaDef = schemaMap.get(name);
    const definition = schemaDef?.definition ?? null;
    const positionId = schemaDef?.positionId ?? null;

    rows.push({
      segment,
      name,
      level: getLevel(segment),
      values: {
        period1: parsePolishNumber(d[2]),
        period2: parsePolishNumber(d[3]),
        period3: parsePolishNumber(d[4]),
      },
      definition,
      positionId,
      drilldownAccounts: extractAccounts(definition),
    });
  }

  writeFileSync(join(SRC_DIR, outFile), JSON.stringify(rows, null, 2));
  // Zapisz też metadane okresów
  const metaFile = outFile.replace('.json', '-meta.json');
  writeFileSync(join(SRC_DIR, metaFile), JSON.stringify({ periodLabels }, null, 2));
  const withDrilldown = rows.filter(r => r.drilldownAccounts.length > 0).length;
  console.log(`${outFile} — ${rows.length} wierszy (${withDrilldown} z drilldownem), okresy: ${periodLabels.join(' | ')}`);
  return rows.length;
}

// --- auto-detect format ---

function findFile(keyword, excludeKeyword) {
  try {
    const files = readdirSync(DATA_DIR);
    return files.find(f => {
      const u = f.toUpperCase();
      return u.includes(keyword.toUpperCase()) && (!excludeKeyword || !u.includes(excludeKeyword.toUpperCase()));
    }) ?? null;
  } catch { return null; }
}

function findSchemaFile(keyword) {
  try {
    const files = readdirSync(DATA_DIR);
    return files.find(f => {
      const u = f.toUpperCase();
      return u.includes(keyword.toUpperCase()) && u.includes('SCHEMAT');
    }) ?? null;
  } catch { return null; }
}

// Nowy format: plik ma 3 okresy w nazwie (np. "09.25-09.24-09.23")
function isCombinedFormat(filename) {
  if (!filename) return false;
  const matches = filename.match(/\d{2}\.\d{2,4}/g) ?? [];
  return matches.length >= 3;
}

// --- run ---

try {
  const bilFile      = findFile('BIL', 'SCHEMAT');
  const rzisFile     = findFile('RZIS', 'SCHEMAT');
  const bilSchema    = findSchemaFile('BIL');
  const rzisSchema   = findSchemaFile('RZIS');

  if (bilFile && isCombinedFormat(bilFile)) {
    convertCombined(
      join(DATA_DIR, bilFile), 'bilans.json',
      bilSchema ? join(DATA_DIR, bilSchema) : null,
    );
  } else {
    convertBilans();
  }

  if (rzisFile && isCombinedFormat(rzisFile)) {
    convertCombined(
      join(DATA_DIR, rzisFile), 'rzis.json',
      rzisSchema ? join(DATA_DIR, rzisSchema) : null,
    );
  } else {
    convertRzis();
  }

  convertObroty();
  convertZapisy();
  console.log('\nKonwersja zakończona. Pliki w src/data/');
} catch (err) {
  console.error('Błąd:', err.message);
  process.exit(1);
}

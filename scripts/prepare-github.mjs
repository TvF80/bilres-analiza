/**
 * Przygotowanie projektu do publikacji na GitHub bez danych firmowych.
 *
 * Uruchamiać: node scripts/prepare-github.mjs
 *
 * Co robi:
 *  1. Tworzy PUSTE placeholder pliki JSON w src/data/ (wymagane do build)
 *  2. Usuwa public/data/ (zapisy.json 42 MB — za duże dla GitHub)
 *  3. Wyświetla instrukcje do push na GitHub
 *
 * Po uruchomieniu możesz robić: git add . && git push
 * Dane firmowe NIE będą opublikowane — app startuje w trybie "zaimportuj pliki".
 */

import { writeFileSync, rmSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SRC_DATA = join(__dirname, '..', 'src', 'data');
const PUBLIC_DATA = join(__dirname, '..', 'public', 'data');

mkdirSync(SRC_DATA, { recursive: true });

// ── Puste placeholdery ──────────────────────────────────────────────────────

const EMPTY_META = JSON.stringify({ periodLabels: [] });
const EMPTY_ARRAY = JSON.stringify([]);
const EMPTY_NULL = JSON.stringify(null);

const placeholders = {
  'bilans.json':           EMPTY_ARRAY,
  'rzis.json':             EMPTY_ARRAY,
  'obroty.json':           EMPTY_ARRAY,
  'zapisy.json':           EMPTY_ARRAY,
  'bilans-meta.json':      EMPTY_META,
  'rzis-meta.json':        EMPTY_META,
  'raportMiesieczny.json': EMPTY_NULL,
  'grpData.json':          EMPTY_NULL,
};

console.log('\n=== Przygotowanie do GitHub ===\n');
console.log('Tworzenie pustych placeholderów w src/data/:');
for (const [name, content] of Object.entries(placeholders)) {
  writeFileSync(join(SRC_DATA, name), content);
  console.log(`  ✓ src/data/${name}`);
}

// ── Usuń public/data/ jeśli istnieje ───────────────────────────────────────
if (existsSync(PUBLIC_DATA)) {
  rmSync(PUBLIC_DATA, { recursive: true, force: true });
  console.log('\nUsunięto public/data/ (zapisy.json — dane prywatne)');
} else {
  console.log('\npublic/data/ nie istnieje — OK');
}

// ── Sprawdź .gitignore ──────────────────────────────────────────────────────
console.log(`
=== Instrukcje ===

1. Sprawdź .gitignore — powinno NIE ignorować src/data/*.json
   (aktualnie ignoruje! zmień na: tylko public/data/)

2. Uruchom: git add -A && git status
3. Zrób commit i push na GitHub

Aplikacja po wdrożeniu:
  - Startuje BEZ danych firmy (EXCO Poland pusta)
  - Użytkownicy importują własne pliki Excel
  - Raport miesięczny / grupy pracy dostępne po imporcie

UWAGA: NIE commituj prawdziwych plików src/data/*.json z danymi!
       Ten skrypt zastępuje je pustymi wersjami.
`);

#!/usr/bin/env node
// Automatyczny test izolacji RLS dla tabeli `companies` (i `ai_analysis_log`).
//
// Wymaga dwóch potwierdzonych (email confirmed) kont testowych w Supabase Auth.
// Jednorazowe przygotowanie:
//   1. Załóż 2 konta w aplikacji (lub przez /auth/v1/signup) i potwierdź e-mail
//      klikając link z maila (Supabase wymaga potwierdzenia przed logowaniem).
//   2. Ustaw zmienne środowiskowe (np. w .env.test — NIE commituj tego pliku):
//        VITE_SUPABASE_URL=...
//        VITE_SUPABASE_ANON_KEY=...
//        RLS_TEST_EMAIL_A=...      RLS_TEST_PASSWORD_A=...
//        RLS_TEST_EMAIL_B=...      RLS_TEST_PASSWORD_B=...
//   3. Uruchom: node --env-file=.env.test scripts/test-rls.mjs
//
// Skrypt sam sprząta po sobie (usuwa testowe wiersze), nie usuwa kont Auth.

import { createClient } from '@supabase/supabase-js';

const url = process.env.VITE_SUPABASE_URL;
const anonKey = process.env.VITE_SUPABASE_ANON_KEY;
const emailA = process.env.RLS_TEST_EMAIL_A;
const passA = process.env.RLS_TEST_PASSWORD_A;
const emailB = process.env.RLS_TEST_EMAIL_B;
const passB = process.env.RLS_TEST_PASSWORD_B;

if (!url || !anonKey || !emailA || !passA || !emailB || !passB) {
  console.error('Brak wymaganych zmiennych środowiskowych — patrz komentarz na górze pliku.');
  process.exit(1);
}

let failures = 0;
function check(label, condition) {
  if (condition) {
    console.log(`  ✓ ${label}`);
  } else {
    console.error(`  ✗ ${label}`);
    failures++;
  }
}

async function loginAndGetClient(email, password) {
  const supabase = createClient(url, anonKey);
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw new Error(`Logowanie nieudane (${email}): ${error.message}`);
  return { supabase, userId: data.user.id };
}

async function main() {
  console.log('=== Test izolacji RLS (companies) ===\n');

  const { supabase: sbA, userId: idA } = await loginAndGetClient(emailA, passA);
  const { supabase: sbB, userId: idB } = await loginAndGetClient(emailB, passB);
  console.log(`Zalogowano: A=${idA}  B=${idB}\n`);

  const rowId = crypto.randomUUID();

  console.log('Test 1: A wstawia własny wiersz');
  const { error: insertErr } = await sbA.from('companies').insert({
    id: rowId, user_id: idA, name: 'RLS test A', period: 'test',
  });
  check('insert jako A powiódł się', !insertErr);

  console.log('\nTest 2: A widzi swój wiersz');
  const { data: seenByA } = await sbA.from('companies').select('id').eq('id', rowId);
  check('A widzi dokładnie 1 wiersz', seenByA?.length === 1);

  console.log('\nTest 3: B NIE widzi wiersza A (izolacja odczytu)');
  const { data: seenByB } = await sbB.from('companies').select('id').eq('id', rowId);
  check('B widzi 0 wierszy', seenByB?.length === 0);

  console.log('\nTest 4: B nie może zaktualizować wiersza A');
  const { data: updatedByB } = await sbB.from('companies').update({ name: 'Hacked by B' }).eq('id', rowId).select();
  check('update przez B nie zmienił żadnego wiersza', (updatedByB?.length ?? 0) === 0);

  console.log('\nTest 5: B nie może wstawić wiersza z cudzym user_id (spoofing)');
  const spoofId = crypto.randomUUID();
  const { error: spoofErr } = await sbB.from('companies').insert({
    id: spoofId, user_id: idA, name: 'Spoofed', period: 'test',
  });
  check('insert ze sfałszowanym user_id odrzucony', !!spoofErr);

  console.log('\nTest 6: B nie może usunąć wiersza A');
  const { data: deletedByB } = await sbB.from('companies').delete().eq('id', rowId).select();
  check('delete przez B nie usunął żadnego wiersza', (deletedByB?.length ?? 0) === 0);

  console.log('\nSprzątanie: usunięcie testowych wierszy (na wypadek nieoczekiwanego przejścia testu 5)');
  const { error: cleanupErr } = await sbA.from('companies').delete().eq('id', rowId);
  check('sprzątanie wiersza A powiodło się', !cleanupErr);
  await sbA.from('companies').delete().eq('id', spoofId);
  await sbB.from('companies').delete().eq('id', spoofId);

  console.log(`\n=== Wynik: ${failures === 0 ? 'WSZYSTKO OK' : `${failures} BŁĘDÓW`} ===`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch(err => {
  console.error('Błąd skryptu:', err.message);
  process.exit(1);
});

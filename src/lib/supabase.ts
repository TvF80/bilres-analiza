import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabaseConfigured = !!(supabaseUrl && supabaseAnonKey);

export const supabase: SupabaseClient = supabaseConfigured
  ? createClient(supabaseUrl!, supabaseAnonKey!)
  : (null as unknown as SupabaseClient);

/** Nagłówek Authorization z aktualnym tokenem sesji, jeśli jest zalogowany
 *  użytkownik Supabase — używane do opcjonalnego audit trail AI (api/analyze).
 *  W trybie gość/lokalnym (brak Supabase) zwraca pusty obiekt — bez błędu. */
export async function getAuthHeader(): Promise<Record<string, string>> {
  if (!supabaseConfigured) return {};
  try {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    return token ? { Authorization: `Bearer ${token}` } : {};
  } catch {
    return {};
  }
}

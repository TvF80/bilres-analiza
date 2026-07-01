import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';
import { supabase, supabaseConfigured } from '../lib/supabase';
import type { User } from '@supabase/supabase-js';

export const USER_COLORS = [
  '#3b82f6','#10b981','#f59e0b','#8b5cf6',
  '#ef4444','#06b6d4','#f97316','#ec4899',
];

export interface AppUser {
  id: string;
  name: string;
  email: string;
  color: string;
}

interface AuthContextValue {
  currentUser: AppUser | null;
  authLoading: boolean;
  /** Ustawione, gdy w buildzie produkcyjnym brakuje konfiguracji Supabase —
   *  zamiast cicho przechodzić w tryb gość (bez uwierzytelnienia), appka ma
   *  to pokazać jako jawny błąd konfiguracji. W dev/local guest mode działa normalnie. */
  configError: string | null;
  login: (email: string, password: string) => Promise<{ error: string | null }>;
  logout: () => Promise<void>;
  signUp: (name: string, email: string, password: string) => Promise<{ error: string | null }>;
  resetPassword: (email: string) => Promise<{ error: string | null }>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function userFromSupabase(user: User): AppUser {
  const meta = user.user_metadata ?? {};
  const colorIndex = user.id.charCodeAt(0) % USER_COLORS.length;
  return {
    id: user.id,
    name: meta.name ?? user.email?.split('@')[0] ?? 'Użytkownik',
    email: user.email ?? '',
    color: meta.color ?? USER_COLORS[colorIndex],
  };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [currentUser, setCurrentUser] = useState<AppUser | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [configError, setConfigError] = useState<string | null>(null);

  useEffect(() => {
    if (!supabaseConfigured) {
      // Build produkcyjny bez konfiguracji Supabase = błąd wdrożenia (brakujące
      // env vary), nie zamierzony tryb gość — appka bez auth w produkcji przez
      // pomyłkę byłaby niewidocznym ryzykiem. W dev/local guest mode zostaje.
      if (import.meta.env.PROD) {
        setConfigError('Brak konfiguracji Supabase (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY) w środowisku produkcyjnym.');
        setAuthLoading(false);
        return;
      }
      // Brak Supabase w trybie lokalnym/dev — tryb gość bez auth
      setCurrentUser({ id: 'local', name: 'Użytkownik lokalny', email: 'local@localhost', color: USER_COLORS[0] });
      setAuthLoading(false);
      return;
    }
    supabase.auth.getSession().then(({ data: { session } }) => {
      setCurrentUser(session?.user ? userFromSupabase(session.user) : null);
      setAuthLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setCurrentUser(session?.user ? userFromSupabase(session.user) : null);
    });

    return () => subscription.unsubscribe();
  }, []);

  const login = useCallback(async (email: string, password: string): Promise<{ error: string | null }> => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error: error?.message ?? null };
  }, []);

  const logout = useCallback(async () => {
    await supabase.auth.signOut();
  }, []);

  const signUp = useCallback(async (name: string, email: string, password: string): Promise<{ error: string | null }> => {
    const colorIndex = Math.floor(Math.random() * USER_COLORS.length);
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { name, color: USER_COLORS[colorIndex] } },
    });
    return { error: error?.message ?? null };
  }, []);

  const resetPassword = useCallback(async (email: string): Promise<{ error: string | null }> => {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/`,
    });
    return { error: error?.message ?? null };
  }, []);

  return (
    <AuthContext.Provider value={{ currentUser, authLoading, configError, login, logout, signUp, resetPassword }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth outside AuthProvider');
  return ctx;
}

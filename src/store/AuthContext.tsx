import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';
import { hashPassword, verifyPassword } from '../lib/crypto';

export const USER_COLORS = [
  '#3b82f6','#10b981','#f59e0b','#8b5cf6',
  '#ef4444','#06b6d4','#f97316','#ec4899',
];

export interface AppUser {
  id: string;
  name: string;
  passwordHash: string;
  hint: string;
  color: string;
  createdAt: string;
}

interface AuthContextValue {
  users: AppUser[];
  currentUser: AppUser | null;
  /** User whose avatar was clicked — waiting for password */
  pendingUser: AppUser | null;
  selectUser: (id: string) => void;
  clearSelection: () => void;
  login: (password: string) => Promise<boolean>;
  logout: () => void;
  addUser: (name: string, password: string, hint: string) => Promise<AppUser>;
  deleteUser: (id: string) => void;
  resetPassword: (userId: string, newPassword: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const KEYS = { users: 'exco_users', session: 'exco_session' };

function loadUsers(): AppUser[] {
  try {
    const raw = localStorage.getItem(KEYS.users);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function saveUsers(users: AppUser[]): void {
  localStorage.setItem(KEYS.users, JSON.stringify(users));
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [users, setUsers] = useState<AppUser[]>(() => loadUsers());
  const [currentUser, setCurrentUser] = useState<AppUser | null>(() => {
    const sid = sessionStorage.getItem(KEYS.session);
    if (!sid) return null;
    const stored = loadUsers();
    return stored.find(u => u.id === sid) ?? null;
  });
  const [pendingUser, setPendingUser] = useState<AppUser | null>(null);

  useEffect(() => { saveUsers(users); }, [users]);

  const selectUser = useCallback((id: string) => {
    const user = users.find(u => u.id === id) ?? null;
    setPendingUser(user);
  }, [users]);

  const clearSelection = useCallback(() => setPendingUser(null), []);

  const login = useCallback(async (password: string): Promise<boolean> => {
    if (!pendingUser) return false;
    const ok = await verifyPassword(password, pendingUser.passwordHash);
    if (ok) {
      sessionStorage.setItem(KEYS.session, pendingUser.id);
      setCurrentUser(pendingUser);
      setPendingUser(null);
    }
    return ok;
  }, [pendingUser]);

  const logout = useCallback(() => {
    sessionStorage.removeItem(KEYS.session);
    setCurrentUser(null);
    setPendingUser(null);
  }, []);

  const addUser = useCallback(async (name: string, password: string, hint: string): Promise<AppUser> => {
    const hash = await hashPassword(password);
    const user: AppUser = {
      id: crypto.randomUUID(),
      name: name.trim(),
      passwordHash: hash,
      hint,
      color: USER_COLORS[users.length % USER_COLORS.length],
      createdAt: new Date().toISOString().slice(0, 10),
    };
    setUsers(prev => [...prev, user]);
    return user;
  }, [users.length]);

  const deleteUser = useCallback((id: string) => {
    setUsers(prev => prev.filter(u => u.id !== id));
    if (currentUser?.id === id) logout();
  }, [currentUser, logout]);

  const resetPassword = useCallback(async (userId: string, newPassword: string) => {
    const hash = await hashPassword(newPassword);
    setUsers(prev => prev.map(u => u.id === userId ? { ...u, passwordHash: hash } : u));
  }, []);

  return (
    <AuthContext.Provider value={{
      users, currentUser, pendingUser,
      selectUser, clearSelection, login, logout,
      addUser, deleteUser, resetPassword,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth outside AuthProvider');
  return ctx;
}

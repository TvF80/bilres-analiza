import {
  createContext, useContext, useState, useEffect, useCallback, useRef, type ReactNode,
} from 'react';
import type { Company, JournalEntry, MonthlyReportData, GrpData, ReportRow, AccountRow } from '../types';
import { useAuth } from './AuthContext';
import { supabase, supabaseConfigured } from '../lib/supabase';

// Per-user storage keys (localStorage cache)
const companyKey  = (uid: string) => `exco_companies_${uid}`;
const activeKey   = (uid: string) => `exco_active_${uid}`;
const zapisyKey   = (cid: string) => `exco_zapisy_${cid}`;

export interface CompanyData {
  period: string;
  bilans: Company['bilans'];
  rzis: Company['rzis'];
  obroty: Company['obroty'];
  zapisy: Company['zapisy'];
  periodLabels?: Company['periodLabels'];
  raportMiesieczny?: MonthlyReportData;
  grpData?: GrpData;
}

interface CompaniesContextValue {
  companies: Company[];
  activeCompany: Company | null;
  zapisyLoading: boolean;
  hasMigratableData: boolean;
  setActiveCompany: (id: string) => void;
  addCompany: (company: Omit<Company, 'id' | 'createdAt'>) => Company;
  replaceCompanyData: (id: string, data: Partial<CompanyData>) => void;
  updateCompanyName: (id: string, name: string) => void;
  deleteCompany: (id: string) => void;
  clearUserData: () => void;
  migrateLocalData: () => Promise<void>;
}

const CompaniesContext = createContext<CompaniesContextValue | null>(null);

// ── Supabase row ↔ Company ──────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function rowToCompany(row: Record<string, any>): Company {
  return {
    id: row.id as string,
    name: row.name as string,
    period: row.period as string,
    createdAt: (row.created_at as string)?.slice(0, 10) ?? '',
    bilans: (row.bilans ?? []) as ReportRow[],
    rzis: (row.rzis ?? []) as ReportRow[],
    obroty: (row.obroty ?? []) as AccountRow[],
    zapisy: [],
    periodLabels: (row.period_labels as string[] | null) ?? undefined,
    zapisyUrl: (row.zapisy_url as string | null) ?? undefined,
    raportMiesieczny: (row.raport_miesieczny as MonthlyReportData | null) ?? undefined,
    grpData: (row.grp_data as GrpData | null) ?? undefined,
  };
}

function companyToRow(c: Company, userId: string) {
  return {
    id: c.id,
    user_id: userId,
    name: c.name,
    period: c.period,
    period_labels: c.periodLabels ?? null,
    bilans: c.bilans,
    rzis: c.rzis,
    obroty: c.obroty,
    zapisy_url: c.zapisyUrl ?? null,
    raport_miesieczny: c.raportMiesieczny ?? null,
    grp_data: c.grpData ?? null,
    updated_at: new Date().toISOString(),
  };
}

// ── localStorage helpers ────────────────────────────────────────────────────

function toStorable(c: Company): Company {
  return { ...c, zapisy: [] };
}

function loadFromStorage(uid: string): Company[] {
  try {
    const raw = localStorage.getItem(companyKey(uid));
    if (!raw) return [];
    const parsed: Company[] = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch { return []; }
}

function saveToStorage(uid: string, companies: Company[]): void {
  try {
    localStorage.setItem(companyKey(uid), JSON.stringify(companies.map(toStorable)));
  } catch (e) {
    // Loguj tylko komunikat (np. QuotaExceededError), nigdy dane firm z localStorage
    console.error('Storage error:', (e as Error)?.message ?? String(e));
  }
}

// ── Zapisy (journal entries) cache in sessionStorage ───────────────────────

function cacheZapisy(cid: string, zapisy: JournalEntry[]): void {
  try { sessionStorage.setItem(zapisyKey(cid), JSON.stringify(zapisy)); } catch { /* ignore */ }
}

function loadCachedZapisy(cid: string): JournalEntry[] | null {
  try {
    const raw = sessionStorage.getItem(zapisyKey(cid));
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

// ── Provider ────────────────────────────────────────────────────────────────

export function CompaniesProvider({ children }: { children: ReactNode }) {
  const { currentUser } = useAuth();
  const uid = currentUser?.id ?? null;

  const [companies, setCompanies] = useState<Company[]>([]);
  const [activeId, setActiveId] = useState<string>('');
  const [zapisyLoading, setZapisyLoading] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);
  const [hasMigratableData, setHasMigratableData] = useState(false);
  const zapisyLoadedRef = useRef<Set<string>>(new Set());

  // ── Load companies: localStorage first (instant), then Supabase (async) ──
  useEffect(() => {
    if (!uid) {
      setIsLoaded(false);
      setCompanies([]);
      setActiveId('');
      setHasMigratableData(false);
      return;
    }

    const localData = loadFromStorage(uid);
    const savedActive = localStorage.getItem(activeKey(uid));

    // Show localStorage data immediately (no flicker)
    setCompanies(localData);
    setActiveId(
      localData.length > 0
        ? (savedActive && localData.some(c => c.id === savedActive) ? savedActive : localData[0].id)
        : ''
    );
    setIsLoaded(true);
    zapisyLoadedRef.current.clear();

    // Fetch from Supabase in background (only when configured)
    if (!supabaseConfigured) return;
    supabase.from('companies').select('*').eq('user_id', uid)
      .then(({ data, error }) => {
        if (error || !data) return; // Keep localStorage data on error

        const sbCompanies = data.map(rowToCompany);
        saveToStorage(uid, sbCompanies);
        setCompanies(sbCompanies);
        setActiveId(prev =>
          sbCompanies.some(c => c.id === prev) ? prev : (sbCompanies[0]?.id ?? '')
        );

        // Detect localStorage data not yet in Supabase
        const sbIds = new Set(sbCompanies.map(c => c.id));
        const migratable = localData.filter(c => !sbIds.has(c.id));
        setHasMigratableData(migratable.length > 0);
      });
  }, [uid]);

  // ── Persist to localStorage whenever companies change ──
  useEffect(() => {
    if (uid && isLoaded) saveToStorage(uid, companies);
  }, [companies, uid, isLoaded]);

  useEffect(() => {
    if (uid && activeId && isLoaded) localStorage.setItem(activeKey(uid), activeId);
  }, [activeId, uid, isLoaded]);

  // ── Lazy-load zapisy (journal entries) ────────────────────────────────────
  const activeCompany = companies.find(c => c.id === activeId) ?? companies[0] ?? null;

  useEffect(() => {
    if (!activeCompany) return;
    if (activeCompany.zapisy.length > 0) return;
    if (zapisyLoadedRef.current.has(activeCompany.id)) return;

    zapisyLoadedRef.current.add(activeCompany.id);

    const cached = loadCachedZapisy(activeCompany.id);
    if (cached && cached.length > 0) {
      setCompanies(prev =>
        prev.map(c => c.id === activeCompany.id ? { ...c, zapisy: cached } : c)
      );
      return;
    }

    if (activeCompany.zapisyUrl) {
      setZapisyLoading(true);
      fetch(activeCompany.zapisyUrl)
        .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
        .then((d: JournalEntry[]) => {
          cacheZapisy(activeCompany.id, d);
          setCompanies(prev =>
            prev.map(c => c.id === activeCompany.id ? { ...c, zapisy: d } : c)
          );
        })
        .catch(err => console.warn('Zapisy not loaded:', err.message))
        .finally(() => setZapisyLoading(false));
    }
  }, [activeCompany?.id]);

  // ── CRUD ──────────────────────────────────────────────────────────────────

  const setActiveCompany = useCallback((id: string) => setActiveId(id), []);

  const addCompany = useCallback((data: Omit<Company, 'id' | 'createdAt'>): Company => {
    const company: Company = {
      ...data,
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString().slice(0, 10),
    };
    if (company.zapisy.length > 0) cacheZapisy(company.id, company.zapisy);
    setCompanies(prev => [...prev, company]);
    setActiveId(company.id);

    // Background sync — optimistic update (UI doesn't wait)
    if (supabaseConfigured && uid) {
      supabase.from('companies').insert(companyToRow(company, uid))
        .then(({ error }) => { if (error) console.error('Supabase insert:', error.message); });
    }

    return company;
  }, [uid]);

  const replaceCompanyData = useCallback((id: string, data: Partial<CompanyData>) => {
    if (data.zapisy !== undefined) {
      sessionStorage.removeItem(zapisyKey(id));
      zapisyLoadedRef.current.delete(id);
      if (data.zapisy.length > 0) cacheZapisy(id, data.zapisy);
    }

    setCompanies(prev => {
      const next = prev.map(c =>
        c.id === id
          ? {
              ...c,
              ...(data.period !== undefined       ? { period: data.period } : {}),
              ...(data.bilans !== undefined        ? { bilans: data.bilans } : {}),
              ...(data.rzis !== undefined          ? { rzis: data.rzis } : {}),
              ...(data.obroty !== undefined        ? { obroty: data.obroty } : {}),
              ...(data.zapisy !== undefined        ? { zapisy: data.zapisy } : {}),
              ...(data.periodLabels !== undefined  ? { periodLabels: data.periodLabels } : {}),
              ...(data.raportMiesieczny !== undefined ? { raportMiesieczny: data.raportMiesieczny } : {}),
              ...(data.grpData !== undefined       ? { grpData: data.grpData } : {}),
            }
          : c
      );

      // Background sync
      if (supabaseConfigured && uid) {
        const updated = next.find(c => c.id === id);
        if (updated) {
          supabase.from('companies').upsert(companyToRow(updated, uid))
            .then(({ error }) => { if (error) console.error('Supabase upsert:', error.message); });
        }
      }

      return next;
    });
  }, [uid]);

  const updateCompanyName = useCallback((id: string, name: string) => {
    setCompanies(prev => prev.map(c => c.id === id ? { ...c, name } : c));

    if (supabaseConfigured && uid) {
      supabase.from('companies')
        .update({ name, updated_at: new Date().toISOString() })
        .eq('id', id).eq('user_id', uid)
        .then(({ error }) => { if (error) console.error('Supabase update:', error.message); });
    }
  }, [uid]);

  const deleteCompany = useCallback((id: string) => {
    sessionStorage.removeItem(zapisyKey(id));
    setCompanies(prev => {
      const next = prev.filter(c => c.id !== id);
      if (activeId === id) setActiveId(next[0]?.id ?? '');
      return next;
    });

    if (supabaseConfigured && uid) {
      supabase.from('companies').delete().eq('id', id).eq('user_id', uid)
        .then(({ error }) => { if (error) console.error('Supabase delete:', error.message); });
    }
  }, [activeId, uid]);

  const clearUserData = useCallback(() => {
    if (!uid) return;
    companies.forEach(c => sessionStorage.removeItem(zapisyKey(c.id)));
    localStorage.removeItem(companyKey(uid));
    localStorage.removeItem(activeKey(uid));
    setCompanies([]);
    setActiveId('');
    setHasMigratableData(false);
    zapisyLoadedRef.current.clear();

    if (supabaseConfigured) {
      supabase.from('companies').delete().eq('user_id', uid)
        .then(({ error }) => { if (error) console.error('Supabase clearAll:', error.message); });
    }
  }, [uid, companies]);

  const migrateLocalData = useCallback(async () => {
    if (!uid) return;
    const localData = loadFromStorage(uid);
    const sbIds = new Set(companies.map(c => c.id));
    const toMigrate = localData.filter(c => !sbIds.has(c.id));
    if (toMigrate.length === 0) { setHasMigratableData(false); return; }

    const rows = toMigrate.map(c => companyToRow(c, uid));
    if (!supabaseConfigured) { setHasMigratableData(false); return; }
    const { error } = await supabase.from('companies').insert(rows);
    if (!error) {
      setCompanies(prev => [...prev, ...toMigrate]);
      setHasMigratableData(false);
    } else {
      console.error('Migration error:', error.message);
    }
  }, [uid, companies]);

  return (
    <CompaniesContext.Provider value={{
      companies, activeCompany, zapisyLoading, hasMigratableData,
      setActiveCompany, addCompany, replaceCompanyData, updateCompanyName,
      deleteCompany, clearUserData, migrateLocalData,
    }}>
      {children}
    </CompaniesContext.Provider>
  );
}

export function useCompanies(): CompaniesContextValue {
  const ctx = useContext(CompaniesContext);
  if (!ctx) throw new Error('useCompanies outside CompaniesProvider');
  return ctx;
}

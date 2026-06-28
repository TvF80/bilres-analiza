import {
  createContext, useContext, useState, useEffect, useCallback, useRef, type ReactNode,
} from 'react';
import type { Company, JournalEntry, MonthlyReportData, GrpData } from '../types';
import { useAuth } from './AuthContext';

// Per-user storage keys
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
  setActiveCompany: (id: string) => void;
  addCompany: (company: Omit<Company, 'id' | 'createdAt'>) => Company;
  replaceCompanyData: (id: string, data: CompanyData) => void;
  updateCompanyName: (id: string, name: string) => void;
  deleteCompany: (id: string) => void;
  clearUserData: () => void;
}

const CompaniesContext = createContext<CompaniesContextValue | null>(null);

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
    console.error('Storage error:', e);
    alert('Brak miejsca w pamięci przeglądarki. Usuń niepotrzebne firmy.');
  }
}

function cacheZapisy(cid: string, zapisy: JournalEntry[]): void {
  try { sessionStorage.setItem(zapisyKey(cid), JSON.stringify(zapisy)); } catch { /* ignore */ }
}

function loadCachedZapisy(cid: string): JournalEntry[] | null {
  try {
    const raw = sessionStorage.getItem(zapisyKey(cid));
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

export function CompaniesProvider({ children }: { children: ReactNode }) {
  const { currentUser } = useAuth();
  const uid = currentUser?.id ?? null;

  const [companies, setCompanies] = useState<Company[]>([]);
  const [activeId, setActiveId] = useState<string>('');
  const [zapisyLoading, setZapisyLoading] = useState(false);
  const zapisyLoadedRef = useRef<Set<string>>(new Set());
  const [isLoaded, setIsLoaded] = useState(false);

  // ── Reload companies when user changes ──
  useEffect(() => {
    if (!uid) {
      setIsLoaded(false);
      setCompanies([]);
      setActiveId('');
      return;
    }
    const loaded = loadFromStorage(uid);
    const saved  = localStorage.getItem(activeKey(uid));
    setCompanies(loaded);
    setActiveId(loaded.length > 0 ? (saved && loaded.some(c => c.id === saved) ? saved : loaded[0].id) : '');
    setIsLoaded(true);
    zapisyLoadedRef.current.clear();
  }, [uid]);

  // ── Persist companies on change ──
  useEffect(() => {
    if (uid && isLoaded) saveToStorage(uid, companies);
  }, [companies, uid, isLoaded]);

  useEffect(() => {
    if (uid && activeId && isLoaded) localStorage.setItem(activeKey(uid), activeId);
  }, [activeId, uid, isLoaded]);

  const activeCompany = companies.find(c => c.id === activeId) ?? companies[0] ?? null;

  // ── Lazy-load zapisy ──
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
        .then((data: JournalEntry[]) => {
          cacheZapisy(activeCompany.id, data);
          setCompanies(prev =>
            prev.map(c => c.id === activeCompany.id ? { ...c, zapisy: data } : c)
          );
        })
        .catch(err => console.warn('Zapisy not loaded:', err.message))
        .finally(() => setZapisyLoading(false));
    }
  }, [activeCompany?.id]);

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
    return company;
  }, []);

  const replaceCompanyData = useCallback((id: string, data: CompanyData) => {
    sessionStorage.removeItem(zapisyKey(id));
    zapisyLoadedRef.current.delete(id);
    if (data.zapisy.length > 0) cacheZapisy(id, data.zapisy);
    setCompanies(prev => prev.map(c =>
      c.id === id
        ? {
            ...c,
            period: data.period, bilans: data.bilans, rzis: data.rzis,
            obroty: data.obroty, zapisy: data.zapisy, periodLabels: data.periodLabels,
            ...(data.raportMiesieczny !== undefined ? { raportMiesieczny: data.raportMiesieczny } : {}),
            ...(data.grpData !== undefined ? { grpData: data.grpData } : {}),
          }
        : c
    ));
  }, []);

  const updateCompanyName = useCallback((id: string, name: string) => {
    setCompanies(prev => prev.map(c => c.id === id ? { ...c, name } : c));
  }, []);

  const deleteCompany = useCallback((id: string) => {
    sessionStorage.removeItem(zapisyKey(id));
    setCompanies(prev => {
      const next = prev.filter(c => c.id !== id);
      if (activeId === id) setActiveId(next[0]?.id ?? '');
      return next;
    });
  }, [activeId]);

  const clearUserData = useCallback(() => {
    if (!uid) return;
    companies.forEach(c => sessionStorage.removeItem(zapisyKey(c.id)));
    localStorage.removeItem(companyKey(uid));
    localStorage.removeItem(activeKey(uid));
    setCompanies([]);
    setActiveId('');
    zapisyLoadedRef.current.clear();
  }, [uid, companies]);

  return (
    <CompaniesContext.Provider value={{
      companies, activeCompany, zapisyLoading,
      setActiveCompany, addCompany, replaceCompanyData, updateCompanyName, deleteCompany, clearUserData,
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

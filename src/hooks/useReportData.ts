import { useMemo } from 'react';
import type { ReportType, AccountRow, JournalEntry } from '../types';
import { useCompanies } from '../store/CompaniesContext';

export function useReportData(type: ReportType) {
  const { activeCompany } = useCompanies();
  return type === 'bilans' ? (activeCompany?.bilans ?? []) : (activeCompany?.rzis ?? []);
}

export function useAccountsForRow(drilldownAccounts: string[]): AccountRow[] {
  const { activeCompany } = useCompanies();
  const obroty = activeCompany?.obroty ?? [];
  const key = drilldownAccounts.join(',');

  return useMemo(() => {
    const seen = new Set<string>();
    const result: AccountRow[] = [];
    for (const prefix of drilldownAccounts) {
      for (const acc of obroty) {
        if ((acc.numer === prefix || acc.numer.startsWith(prefix + '-')) && !seen.has(acc.numer)) {
          seen.add(acc.numer);
          result.push(acc);
        }
      }
    }
    return result;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [obroty, key]);
}

export function useAccountsByPrefix(prefix: string): AccountRow[] {
  const { activeCompany } = useCompanies();
  const obroty = activeCompany?.obroty ?? [];
  return useMemo(
    () => obroty.filter(a => a.numer === prefix || a.numer.startsWith(prefix + '-')),
    [obroty, prefix]
  );
}

export function useJournalEntries(konto: string): JournalEntry[] {
  const { activeCompany } = useCompanies();
  const zapisy = activeCompany?.zapisy ?? [];
  return useMemo(
    () => zapisy.filter(z =>
      z.konto === konto ||
      z.konto.startsWith(konto + '-') ||
      z.kontoPrzeciwstawne === konto ||
      (z.kontoPrzeciwstawne?.startsWith(konto + '-') ?? false)
    ),
    [zapisy, konto]
  );
}

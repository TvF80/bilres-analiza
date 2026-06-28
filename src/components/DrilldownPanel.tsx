import { useState } from 'react';
import type { ReportRow, AccountRow } from '../types';
import { useAccountsForRow, useAccountsByPrefix, useJournalEntries } from '../hooks/useReportData';
import { useCompanies } from '../store/CompaniesContext';
import { formatPLN } from '../hooks/useFormatNumber';
import { useLang } from '../i18n/LanguageContext';
import { ROW_TR } from '../i18n';

interface DrilldownPanelProps {
  row: ReportRow;
  onClose: () => void;
}

export default function DrilldownPanel({ row, onClose }: DrilldownPanelProps) {
  const { lang } = useLang();
  const [selectedAccount, setSelectedAccount] = useState<AccountRow | null>(null);
  const accounts = useAccountsForRow(row.drilldownAccounts);
  const rowDisplayName = lang !== 'pl' ? (ROW_TR[row.name]?.[lang as 'fr' | 'en'] ?? row.name) : row.name;

  if (selectedAccount) {
    return (
      <JournalView
        positionName={rowDisplayName}
        account={selectedAccount}
        onBack={() => setSelectedAccount(null)}
        onClose={onClose}
      />
    );
  }

  return (
    <AccountsView
      row={row}
      accounts={accounts}
      onAccountSelect={setSelectedAccount}
      onClose={onClose}
      displayName={rowDisplayName}
    />
  );
}

// ---------------------------------------------------------------------------
// Poziom 1 — Konta z Obrotów
// ---------------------------------------------------------------------------

function AccountsView({ row, accounts, onAccountSelect, onClose, displayName }: {
  row: ReportRow;
  accounts: AccountRow[];
  onAccountSelect: (acc: AccountRow) => void;
  onClose: () => void;
  displayName: string;
}) {
  const { t } = useLang();
  return (
    <div className="h-full flex flex-col">
      <PanelHeader
        breadcrumb={null}
        title={displayName}
        subtitle={row.positionId ?? undefined}
        onClose={onClose}
      />


      {/* Nagłówek sekcji */}
      <div className="px-4 py-2 flex items-center justify-between border-b border-slate-100 bg-white">
        <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
          {t('drill.accounts')} ({accounts.length})
        </span>
        <span className="text-xs text-slate-400">{t('drill.clickAccount')}</span>
      </div>

      {accounts.length === 0 ? (
        <div className="p-6 text-sm text-slate-400 text-center">
          <div className="text-2xl mb-2">📋</div>
          {t('drill.noAccounts')}
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto">
          <table className="w-full text-xs border-collapse">
            <thead className="sticky top-0 bg-slate-50 z-10">
              <tr className="border-b border-slate-200">
                <th className="text-left py-2 px-3 font-semibold text-slate-500">{t('drill.account')}</th>
                <th className="text-left py-2 px-3 font-semibold text-slate-500">{t('drill.accountName')}</th>
                <th className="text-right py-2 px-3 font-semibold text-slate-500 whitespace-nowrap">{t('drill.saldoWn')}</th>
                <th className="text-right py-2 px-3 font-semibold text-slate-500 whitespace-nowrap">{t('drill.saldoMa')}</th>
                <th className="text-right py-2 px-3 font-semibold text-slate-500 bg-slate-100">{t('drill.persaldo')}</th>
                <th className="w-6" />
              </tr>
            </thead>
            <tbody>
              {accounts.map((acc) => (
                <AccountRow
                  key={acc.numer}
                  acc={acc}
                  onClick={() => onAccountSelect(acc)}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function AccountRow({ acc, onClick }: { acc: AccountRow; onClick: () => void }) {
  const isParent = !acc.numer.includes('-');
  return (
    <tr
      className="border-b border-slate-50 hover:bg-blue-50 cursor-pointer transition-colors"
      onClick={onClick}
    >
      <td className={`py-2 px-3 font-mono font-semibold ${isParent ? 'text-slate-800' : 'text-slate-500 pl-5'}`}>
        {acc.numer}
      </td>
      <td className="py-2 px-3 text-slate-600 max-w-[180px]">
        <div className="truncate" title={acc.nazwa}>{acc.nazwa}</div>
        {acc.nazwa2 && <div className="text-slate-400 truncate text-[10px]" title={acc.nazwa2}>{acc.nazwa2}</div>}
      </td>
      <td className={`py-2 px-3 text-right font-mono tabular-nums ${acc.saldoWn < 0 ? 'text-red-600' : acc.saldoWn === 0 ? 'text-slate-300' : 'text-slate-700'}`}>
        {acc.saldoWn !== 0 ? formatPLN(acc.saldoWn) : '—'}
      </td>
      <td className={`py-2 px-3 text-right font-mono tabular-nums ${acc.saldoMa < 0 ? 'text-red-600' : acc.saldoMa === 0 ? 'text-slate-300' : 'text-slate-700'}`}>
        {acc.saldoMa !== 0 ? formatPLN(acc.saldoMa) : '—'}
      </td>
      <td className={`py-2 px-3 text-right font-mono tabular-nums font-semibold bg-slate-50 ${acc.persaldo < 0 ? 'text-red-600' : acc.persaldo === 0 ? 'text-slate-400' : 'text-slate-800'}`}>
        {formatPLN(acc.persaldo)}
      </td>
      <td className="px-2 text-slate-300 text-center">›</td>
    </tr>
  );
}

// ---------------------------------------------------------------------------
// Poziom 2 — Zapisy księgowe
// ---------------------------------------------------------------------------

function JournalView({ positionName, account, onBack, onClose }: {
  positionName: string;
  account: AccountRow;
  onBack: () => void;
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  onClose: () => void;
}) {
  const { t } = useLang();
  const { zapisyLoading } = useCompanies();
  const entries = useJournalEntries(account.numer);
  const sorted = [...entries].sort((a, b) => a.dataKsiegowania.localeCompare(b.dataKsiegowania));
  const subAccounts = useAccountsByPrefix(account.numer);

  return (
    <div className="h-full flex flex-col">
      <PanelHeader
        breadcrumb={positionName}
        title={`${account.numer} — ${account.nazwa}`}
        subtitle={account.nazwa2 ?? undefined}
        onBack={onBack}
        onClose={onClose}
      />

      {/* Podsumowanie konta */}
      <div className="px-4 py-3 bg-slate-50 border-b border-slate-100">
        <div className="grid grid-cols-3 gap-3">
          <StatBox label={t('drill.saldoWn')} value={account.saldoWn} />
          <StatBox label={t('drill.saldoMa')} value={account.saldoMa} />
          <StatBox label={t('drill.persaldo')} value={account.persaldo} highlight />
        </div>
        <div className="grid grid-cols-2 gap-3 mt-2">
          <StatBox label={t('drill.obrotyWn')} value={account.obrotyWn} small />
          <StatBox label={t('drill.obrotyMa')} value={account.obrotyMa} small />
        </div>
      </div>

      {/* Sub-account selector if multiple */}
      {subAccounts.length > 1 && (
        <SubAccountInfo accounts={subAccounts} selectedNumer={account.numer} />
      )}

      {/* Nagłówek sekcji zapisów */}
      <div className="px-4 py-2 flex items-center justify-between border-b border-slate-100 bg-white">
        <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
          {t('drill.entries')} ({sorted.length})
        </span>
        {sorted.length > 0 && (
          <span className="text-xs text-slate-400">
            {sorted[0].dataKsiegowania} – {sorted[sorted.length - 1].dataKsiegowania}
          </span>
        )}
      </div>

      {zapisyLoading ? (
        <div className="p-6 text-sm text-slate-400 text-center">
          <div className="flex justify-center mb-3">
            <div className="w-6 h-6 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
          </div>
          {t('drill.loadingJournal')}
        </div>
      ) : sorted.length === 0 ? (
        <div className="p-6 text-sm text-slate-400 text-center">
          <div className="text-2xl mb-2">📭</div>
          {t('drill.noEntries', { account: account.numer })}
        </div>
      ) : (
        <div className="flex-1 overflow-auto">
          <table className="w-full border-collapse" style={{ minWidth: 760, fontSize: '10px' }}>
            <thead className="sticky top-0 bg-slate-50 z-10">
              <tr className="border-b border-slate-200">
                <th className="text-left py-2 px-2 font-semibold text-slate-500 whitespace-nowrap">{t('drill.date')}</th>
                <th className="text-left py-2 px-2 font-semibold text-slate-500">{t('drill.document')}</th>
                <th className="text-left py-2 px-2 font-semibold text-slate-500">{t('drill.entity')}</th>
                <th className="text-left py-2 px-2 font-semibold text-slate-500 whitespace-nowrap">Konto</th>
                <th className="text-left py-2 px-2 font-semibold text-slate-500 whitespace-nowrap">{t('drill.contraAccount')}</th>
                <th className="text-right py-2 px-2 font-semibold text-slate-500 whitespace-nowrap">{t('drill.amountWn')}</th>
                <th className="text-right py-2 px-2 font-semibold text-slate-500 whitespace-nowrap">{t('drill.amountMa')}</th>
                <th className="text-left py-2 px-2 font-semibold text-slate-500">{t('drill.description')}</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((z, i) => (
                <tr key={i} className={`border-b border-slate-50 ${i % 2 === 0 ? 'bg-white' : 'bg-slate-50/40'} hover:bg-blue-50/40 transition-colors`}>
                  <td className="py-1.5 px-2 font-mono text-slate-500 whitespace-nowrap">{z.dataKsiegowania}</td>
                  <td className="py-1.5 px-2 text-slate-600 max-w-[130px]">
                    <div className="truncate" title={z.dokument}>{z.dokument}</div>
                  </td>
                  <td className="py-1.5 px-2 text-slate-600 max-w-[130px]">
                    <div className="truncate" title={z.nazwaPodmiotu ?? z.podmiot ?? ''}>
                      {z.nazwaPodmiotu || z.podmiot || '—'}
                    </div>
                  </td>
                  <td className="py-1.5 px-2 font-mono text-blue-700 whitespace-nowrap">{z.konto}</td>
                  <td className="py-1.5 px-2 font-mono text-indigo-600 whitespace-nowrap">{z.kontoPrzeciwstawne || '—'}</td>
                  <td className="py-1.5 px-2 text-right font-mono tabular-nums text-slate-700 whitespace-nowrap">
                    {z.kwotaWn !== 0 ? formatPLN(z.kwotaWn) : ''}
                  </td>
                  <td className="py-1.5 px-2 text-right font-mono tabular-nums text-slate-700 whitespace-nowrap">
                    {z.kwotaMa !== 0 ? formatPLN(z.kwotaMa) : ''}
                  </td>
                  <td className="py-1.5 px-2 text-slate-500">
                    <div className="truncate" title={z.opis ?? ''}>{z.opis || ''}</div>
                  </td>
                </tr>
              ))}
            </tbody>
            {/* Suma kontrolna */}
            <tfoot className="sticky bottom-0 bg-white border-t-2 border-slate-200">
              <tr>
                <td colSpan={5} className="py-1.5 px-2 text-xs font-semibold text-slate-500 uppercase tracking-wide">{t('drill.total')}</td>
                <td className="py-1.5 px-2 text-right font-mono font-bold tabular-nums text-slate-800 whitespace-nowrap">
                  {formatPLN(sorted.reduce((s, z) => s + z.kwotaWn, 0))}
                </td>
                <td className="py-1.5 px-2 text-right font-mono font-bold tabular-nums text-slate-800 whitespace-nowrap">
                  {formatPLN(sorted.reduce((s, z) => s + z.kwotaMa, 0))}
                </td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Shared UI atoms
// ---------------------------------------------------------------------------

function PanelHeader({ breadcrumb, title, subtitle, onBack, onClose }: {
  breadcrumb?: string | null;
  title: string;
  subtitle?: string;
  onBack?: () => void;
  onClose: () => void;
}) {
  return (
    <div className="px-4 py-3 border-b border-slate-100 bg-white flex items-start justify-between gap-3 shrink-0">
      <div className="flex-1 min-w-0">
        {breadcrumb && (
          <button
            onClick={onBack}
            className="flex items-center gap-1 text-xs text-blue-500 hover:text-blue-700 mb-1 font-medium"
          >
            ← {breadcrumb}
          </button>
        )}
        {subtitle && (
          <div className="text-[10px] font-mono text-slate-400 mb-0.5">{subtitle}</div>
        )}
        <div className="text-sm font-semibold text-slate-800 leading-snug">{title}</div>
      </div>
      <button
        onClick={onClose}
        className="text-slate-300 hover:text-slate-500 text-xl leading-none shrink-0 mt-0.5"
      >
        ×
      </button>
    </div>
  );
}

function StatBox({ label, value, highlight, small }: {
  label: string;
  value: number;
  highlight?: boolean;
  small?: boolean;
}) {
  return (
    <div className={`rounded-lg px-3 py-2 ${highlight ? 'bg-blue-50 border border-blue-100' : 'bg-white border border-slate-100'}`}>
      <div className="text-[10px] text-slate-400 font-medium uppercase tracking-wide mb-0.5">{label}</div>
      <div className={`font-mono font-semibold tabular-nums ${small ? 'text-xs' : 'text-sm'} ${value < 0 ? 'text-red-600' : highlight ? 'text-blue-700' : 'text-slate-800'}`}>
        {formatPLN(value)}
      </div>
    </div>
  );
}

function SubAccountInfo({ accounts, selectedNumer }: { accounts: AccountRow[]; selectedNumer: string }) {
  const { t } = useLang();
  if (accounts.length <= 1) return null;
  const hasParent = accounts.some(a => a.numer === selectedNumer && !a.numer.includes('-'));
  if (hasParent) return null;
  return (
    <div className="px-4 py-1.5 bg-amber-50 border-b border-amber-100 text-xs text-amber-700">
      {t('drill.subAccountView')} <strong className="font-mono">{selectedNumer}</strong>
      {' '}{t('drill.subAccounts', { count: accounts.length - 1 })}
    </div>
  );
}

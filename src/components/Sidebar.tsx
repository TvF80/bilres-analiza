import { useState, useRef, useEffect } from 'react';
import { useCompanies } from '../store/CompaniesContext';
import { useAuth, type AppUser } from '../store/AuthContext';
import { useLang } from '../i18n/LanguageContext';
import type { Company } from '../types';

interface SidebarProps {
  collapsed: boolean;
  onToggle: () => void;
  onImport: () => void;
  onReplaceData: (companyId: string, companyName: string) => void;
  onMobileClose: () => void;
}

export default function Sidebar({ collapsed, onToggle, onImport, onReplaceData, onMobileClose }: SidebarProps) {
  const { companies, activeCompany, setActiveCompany, updateCompanyName, deleteCompany, zapisyLoading, clearUserData } = useCompanies();
  const { logout, currentUser } = useAuth();
  const { t } = useLang();
  const [confirmClear, setConfirmClear] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  function startEdit(company: Company) {
    setEditingId(company.id);
    setEditValue(company.name);
  }
  function commitEdit(id: string) {
    if (editValue.trim()) updateCompanyName(id, editValue.trim());
    setEditingId(null);
  }
  function handleKeyDown(e: React.KeyboardEvent, id: string) {
    if (e.key === 'Enter') commitEdit(id);
    if (e.key === 'Escape') setEditingId(null);
  }

  return (
    <div className={`
      h-full bg-slate-900 flex flex-col transition-all duration-200 ease-in-out
      ${collapsed ? 'w-14' : 'w-56'}
    `}>
      {/* Brand + toggle */}
      <div className="px-3 py-3 border-b border-slate-700/60 flex items-center justify-between gap-2 shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-7 h-7 rounded-lg bg-blue-600 flex items-center justify-center shrink-0">
            <span className="text-base">🧮</span>
          </div>
          {!collapsed && (
            <span className="text-white text-sm font-semibold tracking-tight truncate">FinScope</span>
          )}
        </div>
        <button
          onClick={onToggle}
          title={collapsed ? t('sidebar.expand') : t('sidebar.collapse')}
          className="text-slate-500 hover:text-slate-300 transition-colors shrink-0 p-0.5 rounded"
        >
          <svg className={`w-4 h-4 transition-transform duration-200 ${collapsed ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M11 19l-7-7 7-7M18 19l-7-7 7-7" />
          </svg>
        </button>
      </div>

      {/* Logged-in user chip */}
      {currentUser && !collapsed && (
        <div className="px-3 py-2 border-b border-slate-700/60">
          <UserChip user={currentUser} onLogout={logout} />
        </div>
      )}
      {currentUser && collapsed && (
        <div className="flex justify-center py-2 border-b border-slate-700/60">
          <UserAvatar user={currentUser} size="sm" onClick={logout} title={`${currentUser.name} — ${t('sidebar.logout')}`} />
        </div>
      )}

      {/* Zapisy loading */}
      {zapisyLoading && (
        <div className={`bg-blue-900/30 flex items-center gap-2 ${collapsed ? 'justify-center px-2 py-2' : 'px-3 py-2'}`}>
          <div className="w-3 h-3 border-2 border-blue-400 border-t-transparent rounded-full animate-spin shrink-0" />
          {!collapsed && <span className="text-xs text-blue-300 leading-tight">{t('sidebar.loading')}</span>}
        </div>
      )}

      {/* Company list */}
      <div className="flex-1 overflow-y-auto py-2 min-h-0">
        {!collapsed && (
          <div className="px-3 mb-1">
            <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">{t('sidebar.companies')}</span>
          </div>
        )}
        {companies.map(company => (
          collapsed ? (
            <CompanyDot
              key={company.id}
              company={company}
              isActive={activeCompany?.id === company.id}
              onSelect={() => { setActiveCompany(company.id); onMobileClose(); }}
            />
          ) : (
            <CompanyItem
              key={company.id}
              company={company}
              isActive={activeCompany?.id === company.id}
              isEditing={editingId === company.id}
              editValue={editValue}
              onSelect={() => { setActiveCompany(company.id); setEditingId(null); setConfirmDelete(null); onMobileClose(); }}
              onStartEdit={() => startEdit(company)}
              onEditChange={setEditValue}
              onEditKeyDown={e => handleKeyDown(e, company.id)}
              onEditBlur={() => commitEdit(company.id)}
              onDeleteRequest={() => setConfirmDelete(company.id)}
              onReplaceData={() => onReplaceData(company.id, company.name)}
              confirmDelete={confirmDelete === company.id}
              onDeleteConfirm={() => { deleteCompany(company.id); setConfirmDelete(null); }}
              onDeleteCancel={() => setConfirmDelete(null)}
              canDelete={companies.length > 1}
            />
          )
        ))}
      </div>

      {/* Bottom actions */}
      <div className={`border-t border-slate-700/60 py-2 ${collapsed ? 'flex flex-col items-center gap-1' : 'px-3 space-y-0.5'}`}>
        {/* Clear data confirmation */}
        {confirmClear && !collapsed && (
          <div className="mb-1 rounded-lg bg-red-900/40 border border-red-700/40 px-3 py-2">
            <p className="text-xs text-red-300 mb-2">{t('sidebar.clearConfirm')}</p>
            <div className="flex gap-2">
              <button
                onClick={() => { clearUserData(); setConfirmClear(false); }}
                className="flex-1 text-xs bg-red-600 hover:bg-red-700 text-white rounded-md py-1 transition-colors"
              >
                {t('sidebar.delete')}
              </button>
              <button
                onClick={() => setConfirmClear(false)}
                className="flex-1 text-xs bg-slate-700 hover:bg-slate-600 text-slate-300 rounded-md py-1 transition-colors"
              >
                {t('sidebar.cancel')}
              </button>
            </div>
          </div>
        )}

        {collapsed ? (
          <>
            <button onClick={onImport} title={t('sidebar.import')} className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:text-white hover:bg-slate-700/60 transition-colors">
              <span className="text-lg leading-none">+</span>
            </button>
            <button onClick={() => setConfirmClear(true)} title={t('sidebar.clearData')} className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-600 hover:text-red-400 hover:bg-slate-800 transition-colors text-sm">
              🗑
            </button>
          </>
        ) : (
          <>
          <button
            onClick={onImport}
            className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-slate-300 hover:text-white hover:bg-slate-700/60 transition-colors"
          >
            <span className="text-base leading-none">+</span>
            <span>{t('sidebar.import')}</span>
          </button>
          <button
            onClick={() => setConfirmClear(c => !c)}
            className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-slate-500 hover:text-red-400 hover:bg-slate-800 transition-colors"
          >
            <span className="text-sm leading-none">🗑</span>
            <span>{t('sidebar.clearData')}</span>
          </button>
          </>
        )}
      </div>
    </div>
  );
}

// --- Collapsed: company dot ---

function CompanyDot({ company, isActive, onSelect }: {
  company: Company; isActive: boolean; onSelect: () => void;
}) {
  const initials = company.name.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase();
  return (
    <div className="flex justify-center my-1">
      <button
        onClick={onSelect}
        title={company.name}
        className={`w-8 h-8 rounded-full flex items-center justify-center text-white text-[10px] font-bold transition-all ${
          isActive ? 'ring-2 ring-blue-400 ring-offset-1 ring-offset-slate-900' : 'opacity-60 hover:opacity-100'
        }`}
        style={{ backgroundColor: '#3b82f6' }}
      >
        {initials}
      </button>
    </div>
  );
}

// --- Expanded: full company row ---

function CompanyItem({
  company, isActive, isEditing, editValue, canDelete, confirmDelete,
  onSelect, onStartEdit, onEditChange, onEditKeyDown, onEditBlur,
  onDeleteRequest, onReplaceData, onDeleteConfirm, onDeleteCancel,
}: {
  company: Company; isActive: boolean; isEditing: boolean; editValue: string;
  canDelete: boolean; confirmDelete: boolean;
  onSelect: () => void; onStartEdit: () => void;
  onEditChange: (v: string) => void; onEditKeyDown: (e: React.KeyboardEvent) => void;
  onEditBlur: () => void; onDeleteRequest: () => void; onReplaceData: () => void;
  onDeleteConfirm: () => void; onDeleteCancel: () => void;
}) {
  const { t } = useLang();
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => { if (isEditing) inputRef.current?.focus(); }, [isEditing]);

  if (confirmDelete) {
    return (
      <div className="mx-2 mb-1 rounded-lg bg-red-900/40 border border-red-700/40 px-3 py-2">
        <p className="text-xs text-red-300 mb-2">{t('sidebar.delete')} <strong>{company.name}</strong>?</p>
        <div className="flex gap-2">
          <button onClick={onDeleteConfirm} className="flex-1 text-xs bg-red-600 hover:bg-red-700 text-white rounded-md py-1 transition-colors">{t('sidebar.delete')}</button>
          <button onClick={onDeleteCancel} className="flex-1 text-xs bg-slate-700 hover:bg-slate-600 text-slate-300 rounded-md py-1 transition-colors">{t('sidebar.cancel')}</button>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`group mx-2 mb-0.5 rounded-lg flex items-start gap-2 px-2 py-2 cursor-pointer transition-colors ${
        isActive ? 'bg-blue-600/20 border border-blue-500/30' : 'hover:bg-slate-800/60'
      }`}
      onClick={onSelect}
    >
      <div className={`mt-1.5 w-1.5 h-1.5 rounded-full shrink-0 ${isActive ? 'bg-blue-400' : 'bg-slate-700'}`} />
      <div className="flex-1 min-w-0">
        {isEditing ? (
          <input
            ref={inputRef}
            value={editValue}
            onChange={e => onEditChange(e.target.value)}
            onKeyDown={onEditKeyDown}
            onBlur={onEditBlur}
            onClick={e => e.stopPropagation()}
            className="w-full text-sm bg-slate-700 text-white rounded px-1.5 py-0.5 outline-none border border-blue-500"
          />
        ) : (
          <div className={`text-sm font-medium truncate ${isActive ? 'text-white' : 'text-slate-300'}`}>{company.name}</div>
        )}
        <div className="text-[10px] text-slate-500 mt-0.5 truncate">{company.period}</div>
      </div>
      {!isEditing && (
        <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0 mt-0.5">
          <button title={t('sidebar.replaceData')} onClick={e => { e.stopPropagation(); onReplaceData(); }} className="p-0.5 rounded text-slate-500 hover:text-amber-400 text-xs" aria-label={t('sidebar.replaceData')}>
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          </button>
          <button title={t('sidebar.rename')} onClick={e => { e.stopPropagation(); onStartEdit(); }} className="p-0.5 rounded text-slate-500 hover:text-slate-300 text-xs">✎</button>
          {canDelete && <button title={t('sidebar.deleteCompany')} onClick={e => { e.stopPropagation(); onDeleteRequest(); }} className="p-0.5 rounded text-slate-500 hover:text-red-400 text-xs">×</button>}
        </div>
      )}
    </div>
  );
}

// --- User atoms ---

function UserChip({ user, onLogout }: { user: AppUser; onLogout: () => void }) {
  const { t } = useLang();
  const initials = user.name.split(' ').map((w: string) => w[0]).slice(0, 2).join('').toUpperCase();
  return (
    <div className="flex items-center gap-2">
      <div className="w-6 h-6 rounded-full flex items-center justify-center text-white text-[10px] font-bold shrink-0" style={{ backgroundColor: user.color }}>
        {initials}
      </div>
      <span className="text-xs text-slate-400 flex-1 truncate">{user.name}</span>
      <button onClick={onLogout} title={t('sidebar.logout')} className="text-slate-600 hover:text-slate-300 text-xs px-1.5 py-0.5 rounded hover:bg-slate-700/60 transition-colors whitespace-nowrap">↩</button>
    </div>
  );
}

function UserAvatar({ user, size = 'sm', onClick, title }: {
  user: AppUser; size?: 'sm' | 'md'; onClick?: () => void; title?: string;
}) {
  const initials = user.name.split(' ').map((w: string) => w[0]).slice(0, 2).join('').toUpperCase();
  const sz = size === 'sm' ? 'w-7 h-7 text-[10px]' : 'w-9 h-9 text-xs';
  return (
    <button onClick={onClick} title={title} className={`${sz} rounded-full flex items-center justify-center text-white font-bold transition-opacity hover:opacity-80`} style={{ backgroundColor: user.color }}>
      {initials}
    </button>
  );
}

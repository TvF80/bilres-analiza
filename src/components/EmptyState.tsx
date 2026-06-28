import { useLang } from '../i18n/LanguageContext';

interface EmptyStateProps {
  onImport: () => void;
}

export default function EmptyState({ onImport }: EmptyStateProps) {
  const { t } = useLang();
  return (
    <div className="flex-1 flex items-center justify-center p-8">
      <div className="max-w-sm text-center">
        <div className="text-5xl mb-4">📊</div>
        <h2 className="text-xl font-bold text-slate-800 mb-2">{t('empty.title')}</h2>
        <p className="text-sm text-slate-500 mb-6 leading-relaxed">
          {t('empty.description')}
        </p>

        <button
          onClick={onImport}
          className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl text-sm transition-colors shadow-sm"
        >
          {t('empty.importBtn')}
        </button>

        <div className="mt-8 bg-slate-50 rounded-xl p-4 text-left space-y-2">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">{t('empty.requiredFiles')}</p>
          {[
            ['📋', 'BIL schemat', t('empty.bilSchema')],
            ['📊', 'BIL dane', t('empty.bilData')],
            ['📋', 'RZIS schemat', t('empty.rzisSchema')],
            ['📊', 'RZIS dane', t('empty.rzisData')],
            ['🔢', 'OBROTY', t('empty.obroty')],
            ['📝', 'ZAPISY', t('empty.zapisy')],
          ].map(([icon, label, desc]) => (
            <div key={label} className="flex items-center gap-2 text-xs text-slate-600">
              <span>{icon}</span>
              <span className="font-mono font-medium w-24 shrink-0">{label}</span>
              <span className="text-slate-400">{desc}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

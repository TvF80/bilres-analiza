interface EmptyStateProps {
  onImport: () => void;
}

export default function EmptyState({ onImport }: EmptyStateProps) {
  return (
    <div className="flex-1 flex items-center justify-center p-8">
      <div className="max-w-sm text-center">
        <div className="text-5xl mb-4">📊</div>
        <h2 className="text-xl font-bold text-slate-800 mb-2">Brak danych do analizy</h2>
        <p className="text-sm text-slate-500 mb-6 leading-relaxed">
          Zaimportuj dane firmy z plików Excel eksportowanych z systemu FK
          (Bilans, RZiS, Obroty, Zapisy).
        </p>

        <button
          onClick={onImport}
          className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl text-sm transition-colors shadow-sm"
        >
          + Importuj dane firmy
        </button>

        <div className="mt-8 bg-slate-50 rounded-xl p-4 text-left space-y-2">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">Wymagane pliki Excel</p>
          {[
            ['📋', 'BIL schemat', 'Bilans — formuły kont'],
            ['📊', 'BIL dane', 'Bilans — wartości'],
            ['📋', 'RZIS schemat', 'RZiS — formuły kont'],
            ['📊', 'RZIS dane', 'RZiS — wartości'],
            ['🔢', 'OBROTY', 'Obroty i salda kont'],
            ['📝', 'ZAPISY', 'Dziennik zapisów FK'],
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

import { useState } from 'react';
import { useCompanies } from '../store/CompaniesContext';

export default function MigrateLocalDataBanner() {
  const { hasMigratableData, migrateLocalData } = useCompanies();
  const [loading, setLoading] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  if (!hasMigratableData || dismissed) return null;

  async function handleMigrate() {
    setLoading(true);
    await migrateLocalData();
    setLoading(false);
  }

  return (
    <div className="bg-amber-50 border-b border-amber-200 px-4 py-2 flex items-center gap-3 text-sm flex-wrap">
      <span className="text-amber-800 flex-1 min-w-0">
        Znaleziono dane firm zapisane lokalnie w przeglądarce. Czy przenieść je do konta?
      </span>
      <div className="flex gap-2 shrink-0">
        <button
          onClick={handleMigrate}
          disabled={loading}
          className="px-3 py-1 bg-amber-600 hover:bg-amber-700 disabled:opacity-60 text-white rounded text-xs font-medium transition-colors"
        >
          {loading ? 'Przenoszenie…' : 'Przenieś do konta'}
        </button>
        <button
          onClick={() => setDismissed(true)}
          className="px-3 py-1 rounded text-xs text-amber-700 hover:bg-amber-100 transition-colors"
        >
          Pomiń
        </button>
      </div>
    </div>
  );
}

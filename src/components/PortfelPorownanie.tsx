import { useMemo, useState } from 'react';
import { useCompanies } from '../store/CompaniesContext';
import { useLang } from '../i18n/LanguageContext';
import { mapFields, type FieldMap } from '../lib/fieldMapping';
import type { Company } from '../types';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Cell, ResponsiveContainer,
} from 'recharts';

type MetricKey = 'przychody' | 'zyskNetto' | 'roe' | 'cr' | 'da' | 'ebitdaMargin';

function safeDiv(num: number, den: number): number | null {
  return den !== 0 ? num / den : null;
}

function computeMetrics(f: FieldMap) {
  const ebitda = f.ebit + f.amortyzacja;
  return {
    przychody: f.przychody,
    zyskNetto: f.zyskNetto,
    roe: safeDiv(f.zyskNetto, f.kapitalWlasny),
    cr: safeDiv(f.aktywaObrotowe, f.zobowiazaniaKrotko),
    da: safeDiv(f.zobowiazaniaDlugo + f.zobowiazaniaKrotko, f.aktywaRazem),
    ebitdaMargin: safeDiv(ebitda, f.przychody),
  };
}

export default function PortfelPorownanie() {
  const { companies } = useCompanies();
  const { t } = useLang();
  const [metric, setMetric] = useState<MetricKey>('przychody');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  const rows = useMemo(() => {
    return companies
      .filter((c: Company) => c.bilans.length > 0 && c.rzis.length > 0)
      .map((c: Company) => {
        const f1 = mapFields(c.bilans, c.rzis, 1);
        return { company: c, ...computeMetrics(f1) };
      });
  }, [companies]);

  const sorted = useMemo(() => {
    const arr = [...rows];
    arr.sort((a, b) => {
      const va = a[metric] ?? -Infinity;
      const vb = b[metric] ?? -Infinity;
      return sortDir === 'desc' ? vb - va : va - vb;
    });
    return arr;
  }, [rows, metric, sortDir]);

  const metrics: { key: MetricKey; label: string; fmt: (v: number | null) => string; higherIsBetter: boolean }[] = [
    { key: 'przychody', label: t('portfel.revenue'), fmt: v => v === null ? '—' : new Intl.NumberFormat('pl-PL', { maximumFractionDigits: 0 }).format(v) + ' PLN', higherIsBetter: true },
    { key: 'zyskNetto', label: t('portfel.netProfit'), fmt: v => v === null ? '—' : new Intl.NumberFormat('pl-PL', { maximumFractionDigits: 0 }).format(v) + ' PLN', higherIsBetter: true },
    { key: 'roe', label: t('portfel.roe'), fmt: v => v === null ? '—' : (v * 100).toFixed(1) + '%', higherIsBetter: true },
    { key: 'cr', label: t('portfel.cr'), fmt: v => v === null ? '—' : v.toFixed(2) + 'x', higherIsBetter: true },
    { key: 'da', label: t('portfel.da'), fmt: v => v === null ? '—' : (v * 100).toFixed(1) + '%', higherIsBetter: false },
    { key: 'ebitdaMargin', label: t('portfel.ebitdaMargin'), fmt: v => v === null ? '—' : (v * 100).toFixed(1) + '%', higherIsBetter: true },
  ];
  const activeMetric = metrics.find(m => m.key === metric)!;

  const chartData = sorted.map(r => ({ name: r.company.name, value: r[metric] ?? 0 }));

  if (companies.length < 2) {
    return (
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="text-center max-w-sm">
          <span className="text-3xl">🗂️</span>
          <p className="text-sm font-semibold text-slate-600 mt-2">{t('portfel.needMoreTitle')}</p>
          <p className="text-xs text-slate-400 mt-1">{t('portfel.needMoreHint')}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto p-3 md:p-4 space-y-4">
      <div>
        <h2 className="text-base font-bold text-slate-800">{t('portfel.title')}</h2>
        <p className="text-xs text-slate-400">{t('portfel.subtitle', { count: rows.length })}</p>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {metrics.map(m => (
          <button
            key={m.key}
            onClick={() => setMetric(m.key)}
            className={`px-3 py-1 rounded-full text-xs font-medium transition-all whitespace-nowrap ${
              metric === m.key ? 'bg-rose-600 text-white shadow-sm' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >{m.label}</button>
        ))}
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
        <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-2">{t('portfel.rankingTitle', { metric: activeMetric.label })}</p>
        <ResponsiveContainer width="100%" height={Math.max(180, sorted.length * 36)}>
          <BarChart data={chartData} layout="vertical" margin={{ left: 8, right: 24, top: 4, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
            <XAxis type="number" tick={{ fontSize: 9, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
            <YAxis type="category" dataKey="name" tick={{ fontSize: 10, fill: '#64748b' }} axisLine={false} tickLine={false} width={140} />
            <Tooltip formatter={((v: any) => [activeMetric.fmt(Number(v)), activeMetric.label]) as any} />
            <Bar dataKey="value" radius={[0, 4, 4, 0]} maxBarSize={22}>
              {chartData.map((_, i) => <Cell key={i} fill="#e11d48" />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50">
              <th className="text-left px-3 py-2 font-semibold text-slate-500">{t('portfel.company')}</th>
              {metrics.map(m => (
                <th
                  key={m.key}
                  onClick={() => { setMetric(m.key); setSortDir(d => (metric === m.key ? (d === 'desc' ? 'asc' : 'desc') : 'desc')); }}
                  className={`text-right px-3 py-2 font-semibold cursor-pointer select-none whitespace-nowrap ${metric === m.key ? 'text-rose-600' : 'text-slate-500 hover:text-slate-700'}`}
                >
                  {m.label}{metric === m.key ? (sortDir === 'desc' ? ' ↓' : ' ↑') : ''}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.map(r => (
              <tr key={r.company.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
                <td className="px-3 py-2 font-medium text-slate-700 whitespace-nowrap">{r.company.name}</td>
                {metrics.map(m => (
                  <td key={m.key} className="px-3 py-2 text-right tabular-nums text-slate-600 whitespace-nowrap">{m.fmt(r[m.key])}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-[10px] text-slate-400 italic">{t('portfel.disclaimer')}</p>
    </div>
  );
}

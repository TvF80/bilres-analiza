const plFormat = new Intl.NumberFormat('pl-PL', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export function formatPLN(value: number): string {
  return plFormat.format(value);
}

export function formatDiff(value: number): string {
  if (value === 0) return '—';
  const sign = value > 0 ? '+' : '';
  return sign + plFormat.format(value);
}

export function diffClass(value: number): string {
  if (value > 0) return 'text-green-600';
  if (value < 0) return 'text-red-600';
  return 'text-slate-400';
}

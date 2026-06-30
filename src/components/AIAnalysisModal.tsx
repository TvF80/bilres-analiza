import { useState, useEffect, useCallback } from 'react';

interface Props {
  section: string;
  sectionLabel: string;
  lang: string;
  period: string;
  data: Record<string, unknown>;
  cacheKey: string;
  onClose: () => void;
}

export default function AIAnalysisModal({ section, sectionLabel, lang, period, data, cacheKey, onClose }: Props) {
  const [text, setText] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fromCache, setFromCache] = useState(false);
  const [copied, setCopied] = useState(false);

  const fetch_ = useCallback(async (force = false) => {
    if (!force) {
      try {
        const cached = sessionStorage.getItem(cacheKey);
        if (cached) {
          const { text: t } = JSON.parse(cached);
          if (t) { setText(t); setFromCache(true); return; }
        }
      } catch {}
    }

    setLoading(true);
    setError(null);
    setText(null);
    setFromCache(false);

    try {
      const res = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ section, lang, period, data }),
      });
      if (res.status === 404) throw new Error('AI niedostępne lokalnie — użyj "vercel dev" lub wersji produkcyjnej');
      const raw = await res.text();
      if (!raw) throw new Error(`Pusta odpowiedź serwera (HTTP ${res.status})`);
      let json: any;
      try { json = JSON.parse(raw); } catch { throw new Error('Nieprawidłowa odpowiedź z serwera AI'); }
      if (!res.ok) throw new Error(json.error ?? 'Nieznany błąd');
      sessionStorage.setItem(cacheKey, JSON.stringify({ text: json.text, ts: Date.now() }));
      setText(json.text);
    } catch (err: any) {
      setError(err.message ?? 'Błąd generowania analizy');
    } finally {
      setLoading(false);
    }
  }, [section, lang, period, data, cacheKey]);

  useEffect(() => { fetch_(); }, [fetch_]);

  function copy() {
    if (!text) return;
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-slate-900/50 backdrop-blur-[2px]"
        onClick={onClose}
      />

      {/* Card */}
      <div className="relative w-full max-w-lg bg-white rounded-2xl shadow-2xl overflow-hidden">

        {/* Header */}
        <div className="flex items-center gap-3 px-5 py-4 border-b border-slate-100 bg-gradient-to-r from-violet-50 to-slate-50">
          <span className="text-xl shrink-0">🤖</span>
          <div className="flex-1 min-w-0">
            <p className="text-[10px] font-semibold text-violet-500 uppercase tracking-wide">Analiza AI</p>
            <p className="text-sm font-bold text-slate-800 truncate">{sectionLabel}</p>
          </div>
          <span className="text-[10px] text-slate-400 font-medium shrink-0 bg-slate-100 rounded-md px-2 py-0.5">{period}</span>
          <button
            onClick={onClose}
            className="w-7 h-7 rounded-lg bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-500 text-xs transition-colors shrink-0"
          >✕</button>
        </div>

        {/* Body */}
        <div className="px-5 py-5 min-h-[100px]">
          {loading && (
            <div className="space-y-2.5 animate-pulse">
              <div className="h-3 bg-slate-100 rounded-full w-full" />
              <div className="h-3 bg-slate-100 rounded-full w-11/12" />
              <div className="h-3 bg-slate-100 rounded-full w-full" />
              <div className="h-3 bg-slate-100 rounded-full w-4/5" />
              <div className="h-3 bg-slate-100 rounded-full w-full" />
              <div className="h-3 bg-slate-100 rounded-full w-3/5" />
            </div>
          )}
          {error && (
            <div className="flex items-start gap-2.5 bg-rose-50 border border-rose-200 rounded-xl p-3.5">
              <span className="text-rose-400 shrink-0 text-base mt-0.5">⚠</span>
              <p className="text-sm text-rose-700 leading-snug">{error}</p>
            </div>
          )}
          {text && (
            <p className="text-sm text-slate-700 leading-relaxed">{text}</p>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between gap-3 px-5 py-3 border-t border-slate-100 bg-slate-50/60">
          <p className="text-[10px] text-slate-400 leading-tight">
            {fromCache && !loading && (
              <span className="text-emerald-600 font-medium">✓ z cache</span>
            )}
            {!fromCache && !loading && text && (
              <span className="text-violet-500 font-medium">✓ nowa analiza</span>
            )}
            {loading && <span>Generowanie…</span>}
          </p>
          <div className="flex gap-2">
            {(text || error) && !loading && (
              <button
                onClick={() => fetch_(true)}
                className="px-3 py-1.5 text-xs font-medium text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"
                title="Generuj ponownie (ignoruje cache)"
              >
                ↺ Generuj ponownie
              </button>
            )}
            {text && (
              <button
                onClick={copy}
                className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all duration-150 ${
                  copied
                    ? 'bg-emerald-100 text-emerald-700'
                    : 'bg-violet-600 hover:bg-violet-700 text-white shadow-sm'
                }`}
              >
                {copied ? '✓ Skopiowano' : '⎘ Kopiuj'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

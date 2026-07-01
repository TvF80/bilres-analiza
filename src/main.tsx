import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import * as Sentry from '@sentry/react';
import './index.css';
import App from './App.tsx';
import { AuthProvider } from './store/AuthContext.tsx';
import { CompaniesProvider } from './store/CompaniesContext.tsx';

// ── Optional Sentry error monitoring ────────────────────────────────────────
// Ustaw VITE_SENTRY_DSN w zmiennych środowiskowych Vercel, żeby aktywować.
const sentryDsn = import.meta.env.VITE_SENTRY_DSN;
if (sentryDsn) {
  Sentry.init({
    dsn: sentryDsn,
    environment: import.meta.env.MODE,
    tracesSampleRate: 0.1,
    beforeSend(event) {
      if (import.meta.env.DEV) return null;
      return event;
    },
  });
}

// ── Global unhandled promise rejections (e.g. background Supabase sync) ─────
window.addEventListener('unhandledrejection', (event: PromiseRejectionEvent) => {
  const reason = event.reason;
  const msg = reason instanceof Error ? reason.message : String(reason);
  // Suppress noise from expected cases
  if (msg.includes('Load failed') || msg.includes('NetworkError')) return;
  console.error('[unhandledrejection]', msg);
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AuthProvider>
      <CompaniesProvider>
        <App />
      </CompaniesProvider>
    </AuthProvider>
  </StrictMode>
);

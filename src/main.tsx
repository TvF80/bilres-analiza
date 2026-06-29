import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App.tsx';
import { AuthProvider } from './store/AuthContext.tsx';
import { CompaniesProvider } from './store/CompaniesContext.tsx';

// ── Optional Sentry error monitoring ────────────────────────────────────────
// Set VITE_SENTRY_DSN in Vercel env vars to activate.
// Install: npm install @sentry/react
// Docs: https://docs.sentry.io/platforms/javascript/guides/react/
const sentryDsn = import.meta.env.VITE_SENTRY_DSN;
if (sentryDsn) {
  import('@sentry/react').then(Sentry => {
    Sentry.init({
      dsn: sentryDsn,
      environment: import.meta.env.MODE,
      tracesSampleRate: 0.1,
      // Never capture financial data — only error messages and stack traces
      beforeSend(event) {
        if (import.meta.env.DEV) return null;
        return event;
      },
    });
  });
}

// ── Global unhandled promise rejections (e.g. background Supabase sync) ─────
window.addEventListener('unhandledrejection', (event) => {
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

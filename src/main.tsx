import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App.tsx';
import { AuthProvider } from './store/AuthContext.tsx';
import { CompaniesProvider } from './store/CompaniesContext.tsx';

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

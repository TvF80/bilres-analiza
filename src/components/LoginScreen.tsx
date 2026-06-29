import { useState, useEffect, useRef } from 'react';
import { useAuth } from '../store/AuthContext';
import { useLang } from '../i18n/LanguageContext';

type Mode = 'login' | 'register' | 'forgot';

export default function LoginScreen() {
  const [mode, setMode] = useState<Mode>('login');

  return (
    <Shell>
      {mode === 'login'   && <LoginForm    onSwitch={setMode} />}
      {mode === 'register' && <RegisterForm onSwitch={setMode} />}
      {mode === 'forgot'  && <ForgotForm   onSwitch={setMode} />}
    </Shell>
  );
}

// ---------------------------------------------------------------------------
// Shell
// ---------------------------------------------------------------------------

function Shell({ children }: { children: React.ReactNode }) {
  const { t } = useLang();
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex flex-col items-center justify-center p-6">
      <div className="mb-8 text-center">
        <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-blue-600 mb-4 shadow-lg">
          <span className="text-2xl">🧮</span>
        </div>
        <h1 className="text-white text-2xl font-bold tracking-tight">FinScopePL</h1>
        <p className="text-slate-400 text-sm mt-1">{t('login.subtitle')}</p>
      </div>
      <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl p-6">
        {children}
        <SecurityInfo />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Login form
// ---------------------------------------------------------------------------

function LoginForm({ onSwitch }: { onSwitch: (m: Mode) => void }) {
  const { login } = useAuth();
  const { t } = useLang();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [attempts, setAttempts] = useState(0);
  const [coolingDown, setCoolingDown] = useState(false);
  const cooldownRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => { if (cooldownRef.current) clearTimeout(cooldownRef.current); }, []);

  const isBlocked = loading || coolingDown;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (isBlocked) return;
    setError('');
    setLoading(true);
    const { error: err } = await login(email, password);
    setLoading(false);
    if (err) {
      const next = attempts + 1;
      setAttempts(next);
      if (next >= 5) {
        setCoolingDown(true);
        setAttempts(0);
        setError('Zbyt wiele nieudanych prób. Poczekaj 30 sekund.');
        cooldownRef.current = setTimeout(() => {
          setCoolingDown(false);
          setError('');
        }, 30_000);
      } else {
        setError(translateError(err));
      }
      setPassword('');
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <h2 className="text-base font-semibold text-slate-800 mb-1">{t('login.login')}</h2>
      <input
        type="email"
        value={email}
        onChange={e => setEmail(e.target.value)}
        placeholder={t('login.email') || 'E-mail'}
        autoFocus
        required
        disabled={coolingDown}
        className="w-full px-3 py-2.5 rounded-lg border border-slate-200 text-sm focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition disabled:opacity-50"
      />
      <input
        type="password"
        value={password}
        onChange={e => setPassword(e.target.value)}
        placeholder={t('login.password')}
        required
        disabled={coolingDown}
        className="w-full px-3 py-2.5 rounded-lg border border-slate-200 text-sm focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition disabled:opacity-50"
      />
      {error && <p className="text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>}
      <button
        type="submit"
        disabled={isBlocked}
        className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white font-semibold rounded-lg text-sm shadow-[0_4px_0_0_#1d4ed8] hover:translate-y-0.5 hover:shadow-[0_2px_0_0_#1d4ed8] active:translate-y-1 active:shadow-none transition-all duration-100"
      >
        {loading ? t('login.checking') : coolingDown ? 'Zablokowano (30s)' : t('login.login')}
      </button>
      <div className="flex justify-between pt-1">
        <button type="button" onClick={() => onSwitch('forgot')} className="text-xs text-slate-400 hover:text-slate-600">
          {t('login.forgotPassword')}
        </button>
        <button type="button" onClick={() => onSwitch('register')} className="text-xs text-blue-500 hover:text-blue-700 font-medium">
          {t('login.createAccount')}
        </button>
      </div>
    </form>
  );
}

// ---------------------------------------------------------------------------
// Register form
// ---------------------------------------------------------------------------

function RegisterForm({ onSwitch }: { onSwitch: (m: Mode) => void }) {
  const { signUp } = useAuth();
  const { t } = useLang();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (!name.trim()) { setError(t('login.enterName')); return; }
    if (password.length < 6) { setError(t('login.minChars')); return; }
    if (password !== confirm) { setError(t('login.noMatch')); return; }
    setLoading(true);
    const { error: err } = await signUp(name.trim(), email, password);
    setLoading(false);
    if (err) { setError(translateError(err)); return; }
    setSuccess(true);
  }

  if (success) {
    return (
      <div className="space-y-4 text-center">
        <div className="text-4xl">✉️</div>
        <p className="text-sm font-semibold text-slate-800">Sprawdź skrzynkę e-mail</p>
        <p className="text-xs text-slate-500">Wysłaliśmy link potwierdzający na <strong>{email}</strong>. Kliknij go, aby aktywować konto.</p>
        <button onClick={() => onSwitch('login')} className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg text-sm transition-colors">
          Wróć do logowania
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <h2 className="text-base font-semibold text-slate-800 mb-1">{t('login.newUser')}</h2>
      <input
        type="text"
        value={name}
        onChange={e => setName(e.target.value)}
        placeholder={t('login.fullName')}
        autoFocus
        required
        className="w-full px-3 py-2.5 rounded-lg border border-slate-200 text-sm focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition"
      />
      <input
        type="email"
        value={email}
        onChange={e => setEmail(e.target.value)}
        placeholder={t('login.email') || 'E-mail'}
        required
        className="w-full px-3 py-2.5 rounded-lg border border-slate-200 text-sm focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition"
      />
      <input
        type="password"
        value={password}
        onChange={e => setPassword(e.target.value)}
        placeholder={t('login.passwordMin') || 'Hasło (min. 6 znaków)'}
        required
        className="w-full px-3 py-2.5 rounded-lg border border-slate-200 text-sm focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition"
      />
      <input
        type="password"
        value={confirm}
        onChange={e => setConfirm(e.target.value)}
        placeholder={t('login.repeatPassword')}
        required
        className="w-full px-3 py-2.5 rounded-lg border border-slate-200 text-sm focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition"
      />
      {error && <p className="text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>}
      <div className="flex gap-2 pt-1">
        <button type="button" onClick={() => onSwitch('login')} className="flex-1 py-2.5 rounded-lg border border-slate-200 text-sm text-slate-600 hover:bg-slate-50 transition-colors">
          {t('login.back')}
        </button>
        <button
          type="submit"
          disabled={loading}
          className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white font-semibold rounded-lg text-sm shadow-[0_4px_0_0_#1d4ed8] hover:translate-y-0.5 hover:shadow-[0_2px_0_0_#1d4ed8] active:translate-y-1 active:shadow-none transition-all duration-100"
        >
          {loading ? t('login.creating') : t('login.create')}
        </button>
      </div>
    </form>
  );
}

// ---------------------------------------------------------------------------
// Forgot password form
// ---------------------------------------------------------------------------

function ForgotForm({ onSwitch }: { onSwitch: (m: Mode) => void }) {
  const { resetPassword } = useAuth();
  const { t } = useLang();
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    const { error: err } = await resetPassword(email);
    setLoading(false);
    if (err) { setError(translateError(err)); return; }
    setSuccess(true);
  }

  if (success) {
    return (
      <div className="space-y-4 text-center">
        <div className="text-4xl">✉️</div>
        <p className="text-sm font-semibold text-slate-800">Sprawdź skrzynkę e-mail</p>
        <p className="text-xs text-slate-500">Jeśli konto istnieje, wyślemy link do resetu hasła na <strong>{email}</strong>.</p>
        <button onClick={() => onSwitch('login')} className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg text-sm transition-colors">
          Wróć do logowania
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <h2 className="text-base font-semibold text-slate-800 mb-1">{t('login.forgotPassword')}</h2>
      <p className="text-xs text-slate-500">Podaj swój e-mail — wyślemy link do ustawienia nowego hasła.</p>
      <input
        type="email"
        value={email}
        onChange={e => setEmail(e.target.value)}
        placeholder={t('login.email') || 'E-mail'}
        autoFocus
        required
        className="w-full px-3 py-2.5 rounded-lg border border-slate-200 text-sm focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition"
      />
      {error && <p className="text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>}
      <div className="flex gap-2 pt-1">
        <button type="button" onClick={() => onSwitch('login')} className="flex-1 py-2.5 rounded-lg border border-slate-200 text-sm text-slate-600 hover:bg-slate-50 transition-colors">
          {t('login.back')}
        </button>
        <button
          type="submit"
          disabled={loading}
          className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white font-semibold rounded-lg text-sm shadow-[0_4px_0_0_#1d4ed8] hover:translate-y-0.5 hover:shadow-[0_2px_0_0_#1d4ed8] active:translate-y-1 active:shadow-none transition-all duration-100"
        >
          {loading ? '…' : 'Wyślij link'}
        </button>
      </div>
    </form>
  );
}

// ---------------------------------------------------------------------------
// Security info — ZAKTUALIZOWANA (dane idą do Supabase)
// ---------------------------------------------------------------------------

function SecurityInfo() {
  const [open, setOpen] = useState(false);
  return (
    <div className="mt-4 border border-slate-100 rounded-xl overflow-hidden">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-2 px-3 py-2.5 bg-slate-50 hover:bg-slate-100 transition-colors text-left"
      >
        <span className="text-green-500 text-sm">🔒</span>
        <span className="text-xs font-medium text-slate-600 flex-1">Bezpieczeństwo danych</span>
        <span className="text-slate-400 text-xs">{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <div className="px-4 py-3 bg-white space-y-2 text-[11px] text-slate-500 leading-relaxed">
          <p><strong className="text-slate-700">🔑 Konto i hasło</strong> — dane logowania są przechowywane w Supabase (szyfrowana baza PostgreSQL, EU). Hasła nigdy nie są przechowywane w postaci jawnej.</p>
          <p><strong className="text-slate-700">📂 Dane finansowe</strong> — pliki Excel są parsowane lokalnie w Twojej przeglądarce. Dane firm przechowywane są w localStorage i sessionStorage na Twoim urządzeniu.</p>
          <p><strong className="text-slate-700">🌐 Połączenie</strong> — komunikacja z serwerem tylko podczas logowania, rejestracji i resetowania hasła. Dane finansowe nie opuszczają Twojej przeglądarki.</p>
          <p><strong className="text-slate-700">🗑 Usuwanie danych</strong> — aby usunąć dane finansowe, użyj "Wyczyść dane" w sidebarze. Usunięcie konta możliwe poprzez kontakt z administratorem.</p>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Helper — tłumaczenie błędów Supabase na polski
// ---------------------------------------------------------------------------

function translateError(msg: string): string {
  if (msg.includes('Invalid login credentials')) return 'Nieprawidłowy e-mail lub hasło.';
  if (msg.includes('Email not confirmed')) return 'Potwierdź adres e-mail przed zalogowaniem.';
  if (msg.includes('User already registered')) return 'Ten adres e-mail jest już zarejestrowany.';
  if (msg.includes('Password should be at least')) return 'Hasło musi mieć co najmniej 6 znaków.';
  if (msg.includes('rate limit')) return 'Zbyt wiele prób. Poczekaj chwilę i spróbuj ponownie.';
  if (msg.includes('network')) return 'Błąd sieci. Sprawdź połączenie z internetem.';
  return msg;
}

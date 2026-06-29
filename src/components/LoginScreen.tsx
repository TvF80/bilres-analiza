import { useState } from 'react';
import { useAuth, type AppUser } from '../store/AuthContext';
import { useLang } from '../i18n/LanguageContext';

function SecurityInfo() {
  const [open, setOpen] = useState(false);
  return (
    <div className="mt-4 border border-slate-100 rounded-xl overflow-hidden">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-2 px-3 py-2.5 bg-slate-50 hover:bg-slate-100 transition-colors text-left"
      >
        <span className="text-green-500 text-sm">🔒</span>
        <span className="text-xs font-medium text-slate-600 flex-1">Bezpieczeństwo danych finansowych</span>
        <span className="text-slate-400 text-xs">{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <div className="px-4 py-3 bg-white space-y-2 text-[11px] text-slate-500 leading-relaxed">
          <p><strong className="text-slate-700">🛡 Lokalne przechowywanie</strong> — wszystkie dane finansowe są przechowywane wyłącznie w localStorage i sessionStorage Twojej przeglądarki. Nigdy nie są wysyłane na serwer.</p>
          <p><strong className="text-slate-700">🔑 Hasła</strong> — hasła są hashowane algorytmem SHA-256 w Twojej przeglądarce (Web Crypto API). Aplikacja nie przechowuje haseł w postaci jawnej.</p>
          <p><strong className="text-slate-700">📂 Import danych</strong> — pliki Excel są parsowane lokalnie (SheetJS), żaden plik nie jest wysyłany poza Twoją przeglądarkę.</p>
          <p><strong className="text-slate-700">🗑 Usuwanie danych</strong> — użyj przycisku "Wyczyść dane" w sidebarze lub wyczyść localStorage w ustawieniach przeglądarki. Odinstalowanie aplikacji usuwa wszystkie dane.</p>
          <p><strong className="text-slate-700">📋 RODO/GDPR</strong> — aplikacja nie zbiera żadnych danych osobowych ani finansowych poza urządzeniem użytkownika. Nie ma kont online, cookies analitycznych ani zewnętrznych usług śledzenia.</p>
        </div>
      )}
    </div>
  );
}

export default function LoginScreen() {
  const { users, pendingUser, selectUser, clearSelection, addUser } = useAuth();
  const { t } = useLang();
  const [showAddUser, setShowAddUser] = useState(false);

  // No users yet — first run
  if (users.length === 0 && !showAddUser) {
    return (
      <Shell>
        <div className="text-center mb-6">
          <p className="text-slate-500 text-sm">{t('login.noUsers')}</p>
        </div>
        <button
          onClick={() => setShowAddUser(true)}
          className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg text-sm transition-colors shadow-sm"
        >
          {t('login.createAccount')}
        </button>
      </Shell>
    );
  }

  if (showAddUser) {
    return (
      <Shell>
        <AddUserForm
          onAdd={async (name, pass, hint) => {
            await addUser(name, pass, hint);
            setShowAddUser(false);
            // auto-select the new user
            // (handled by parent refresh — user appears in list)
          }}
          onCancel={users.length > 0 ? () => setShowAddUser(false) : undefined}
        />
      </Shell>
    );
  }

  if (pendingUser) {
    return (
      <Shell>
        <PasswordForm user={pendingUser} onBack={clearSelection} />
      </Shell>
    );
  }

  // Main: user picker
  return (
    <Shell>
      <UserPicker
        users={users}
        onSelect={selectUser}
        onAddUser={() => setShowAddUser(true)}
      />
    </Shell>
  );
}

// ---------------------------------------------------------------------------
// Shell — dark background, logo
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
// User picker — grid of avatars
// ---------------------------------------------------------------------------

function UserPicker({ users, onSelect, onAddUser }: {
  users: AppUser[];
  onSelect: (id: string) => void;
  onAddUser: () => void;
}) {
  const { t } = useLang();
  return (
    <div>
      <h2 className="text-base font-semibold text-slate-700 mb-4 text-center">{t('login.selectUser')}</h2>
      <div className={`grid gap-3 mb-5 ${users.length <= 3 ? 'grid-cols-3' : 'grid-cols-4'}`}>
        {users.map(user => (
          <UserTile key={user.id} user={user} onClick={() => onSelect(user.id)} />
        ))}
      </div>
      <div className="border-t border-slate-100 pt-4">
        <button
          onClick={onAddUser}
          className="w-full py-2 rounded-lg border-2 border-dashed border-slate-200 text-slate-400 hover:border-blue-300 hover:text-blue-500 text-sm font-medium transition-colors"
        >
          {t('login.addUser')}
        </button>
      </div>
    </div>
  );
}

function UserTile({ user, onClick }: { user: AppUser; onClick: () => void }) {
  const initials = user.name
    .split(' ')
    .map(w => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  return (
    <button
      onClick={onClick}
      className="flex flex-col items-center gap-2 p-3 rounded-xl transition-all duration-100 group shadow-[0_4px_0_0_#e2e8f0] hover:-translate-y-0.5 hover:shadow-[0_6px_0_0_#e2e8f0] active:translate-y-1 active:shadow-none"
    >
      <div
        className="w-14 h-14 rounded-full flex items-center justify-center text-white font-bold text-lg shadow-sm group-hover:scale-105 group-active:scale-95 transition-transform duration-100"
        style={{ backgroundColor: user.color }}
      >
        {initials}
      </div>
      <span className="text-xs font-medium text-slate-700 text-center leading-tight line-clamp-2">
        {user.name}
      </span>
    </button>
  );
}

// ---------------------------------------------------------------------------
// Password form — after selecting a user
// ---------------------------------------------------------------------------

function PasswordForm({ user, onBack }: { user: AppUser; onBack: () => void }) {
  const { login, resetPassword } = useAuth();
  const { t } = useLang();
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState<'login' | 'recovery'>('login');
  const [newPass, setNewPass] = useState('');
  const [newPassConfirm, setNewPassConfirm] = useState('');
  const [attempts, setAttempts] = useState(0);

  const initials = user.name.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase();

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    const ok = await login(password);
    setLoading(false);
    if (!ok) {
      setAttempts(a => a + 1);
      setError(t('login.wrongPassword'));
      setPassword('');
    }
  }

  async function handleReset(e: React.FormEvent) {
    e.preventDefault();
    if (newPass.length < 4) { setError(t('login.minChars')); return; }
    if (newPass !== newPassConfirm) { setError(t('login.noMatch')); return; }
    setLoading(true);
    await resetPassword(user.id, newPass);
    setLoading(false);
    setMode('login');
    setError('');
    setPassword('');
  }

  return (
    <div>
      {/* User avatar */}
      <div className="flex flex-col items-center mb-5">
        <div
          className="w-16 h-16 rounded-full flex items-center justify-center text-white font-bold text-xl shadow-md mb-2"
          style={{ backgroundColor: user.color }}
        >
          {initials}
        </div>
        <p className="text-sm font-semibold text-slate-800">{user.name}</p>
        <button onClick={onBack} className="text-xs text-blue-500 hover:text-blue-700 mt-1">
          {t('login.changeUser')}
        </button>
      </div>

      {mode === 'login' ? (
        <form onSubmit={handleLogin} className="space-y-3">
          <div>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder={t('login.password')}
              autoFocus
              required
              className="w-full px-3 py-2.5 rounded-lg border border-slate-200 text-sm text-center focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition"
            />
          </div>
          {error && (
            <p className="text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2 text-center">{error}</p>
          )}
          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white font-semibold rounded-lg text-sm shadow-[0_4px_0_0_#1d4ed8] hover:translate-y-0.5 hover:shadow-[0_2px_0_0_#1d4ed8] active:translate-y-1 active:shadow-none transition-all duration-100"
          >
            {loading ? t('login.checking') : t('login.login')}
          </button>
          {attempts >= 2 && (
            <button
              type="button"
              onClick={() => { setMode('recovery'); setError(''); }}
              className="w-full text-xs text-slate-400 hover:text-slate-600 text-center py-1"
            >
              {t('login.forgotPassword')}
            </button>
          )}
        </form>
      ) : (
        <form onSubmit={handleReset} className="space-y-3">
          {user.hint && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-xs text-amber-800">
              <span className="font-semibold">{t('login.hint')}</span> {user.hint}
            </div>
          )}
          <input
            type="password"
            value={newPass}
            onChange={e => setNewPass(e.target.value)}
            placeholder={t('login.newPassword')}
            autoFocus
            required
            className="w-full px-3 py-2.5 rounded-lg border border-slate-200 text-sm focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition"
          />
          <input
            type="password"
            value={newPassConfirm}
            onChange={e => setNewPassConfirm(e.target.value)}
            placeholder={t('login.repeatNewPassword')}
            required
            className="w-full px-3 py-2.5 rounded-lg border border-slate-200 text-sm focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition"
          />
          {error && <p className="text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2 text-center">{error}</p>}
          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white font-semibold rounded-lg text-sm shadow-[0_4px_0_0_#1d4ed8] hover:translate-y-0.5 hover:shadow-[0_2px_0_0_#1d4ed8] active:translate-y-1 active:shadow-none transition-all duration-100"
          >
            {loading ? '…' : t('login.setNewPassword')}
          </button>
          <button type="button" onClick={() => setMode('login')} className="w-full text-xs text-slate-400 hover:text-slate-600 text-center py-1 shadow-[0_3px_0_0_#e2e8f0] hover:translate-y-0.5 hover:shadow-[0_1px_0_0_#e2e8f0] active:translate-y-0.5 active:shadow-none transition-all duration-100">
            {t('login.back')}
          </button>
        </form>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Add user form
// ---------------------------------------------------------------------------

function AddUserForm({ onAdd, onCancel }: {
  onAdd: (name: string, pass: string, hint: string) => Promise<void>;
  onCancel?: () => void;
}) {
  const [name, setName] = useState('');
  const [pass, setPass] = useState('');
  const [confirm, setConfirm] = useState('');
  const [hint, setHint] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { t } = useLang();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (!name.trim()) { setError(t('login.enterName')); return; }
    if (pass.length < 4) { setError(t('login.minChars')); return; }
    if (pass !== confirm) { setError(t('login.noMatch')); return; }
    setLoading(true);
    await onAdd(name, pass, hint);
    setLoading(false);
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
        type="password"
        value={pass}
        onChange={e => setPass(e.target.value)}
        placeholder={t('login.passwordMin')}
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
      <input
        type="text"
        value={hint}
        onChange={e => setHint(e.target.value)}
        placeholder={t('login.passwordHint')}
        className="w-full px-3 py-2.5 rounded-lg border border-slate-200 text-sm focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition"
      />
      {error && <p className="text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>}
      <div className="flex gap-2 pt-1">
        {onCancel && (
          <button type="button" onClick={onCancel} className="flex-1 py-2.5 rounded-lg border border-slate-200 text-sm text-slate-600 hover:bg-slate-50 shadow-[0_3px_0_0_#e2e8f0] hover:translate-y-0.5 hover:shadow-[0_1px_0_0_#e2e8f0] active:translate-y-0.5 active:shadow-none transition-all duration-100">
            {t('sidebar.cancel')}
          </button>
        )}
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

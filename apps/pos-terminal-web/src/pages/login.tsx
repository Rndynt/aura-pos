import { FormEvent, useState } from 'react';
import { useLocation } from 'wouter';
import { ArrowRight, Lock, Mail, Store, UserCircle2, Users } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { loginWithEmailOrUsername } from '@/lib/auth';

type Tab = 'owner' | 'kasir';

export default function LoginPage() {
  const [, setLocation] = useLocation();
  const [tab, setTab] = useState<Tab>('owner');
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleTabChange = (t: Tab) => {
    setTab(t);
    setError(null);
    setIdentifier('');
    setPassword('');
  };

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const result = await loginWithEmailOrUsername({ identifier, password });
    setLoading(false);

    if (!result.ok) {
      setError(result.message || 'Login gagal. Periksa email/username dan password kamu.');
      return;
    }

    setLocation('/');
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-indigo-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Logo & Title */}
        <div className="text-center mb-6">
          <div className="mx-auto w-14 h-14 rounded-2xl bg-blue-600 text-white flex items-center justify-center shadow-lg shadow-blue-200 mb-3">
            <Store size={26} />
          </div>
          <h1 className="text-2xl font-extrabold text-slate-800">AuraPOS</h1>
          <p className="text-sm text-slate-400 mt-1">Sistem kasir modern untuk bisnis kamu</p>
        </div>

        {/* Card */}
        <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="h-1 bg-gradient-to-r from-blue-500 via-blue-600 to-indigo-600" />

          {/* Tab Switcher */}
          <div className="p-4 pb-0">
            <div className="bg-slate-100 p-1 rounded-2xl grid grid-cols-2 gap-1">
              <button
                type="button"
                onClick={() => handleTabChange('owner')}
                className={`flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-bold transition-all ${
                  tab === 'owner'
                    ? 'bg-white text-slate-800 shadow-sm'
                    : 'text-slate-400 hover:text-slate-600'
                }`}
              >
                <UserCircle2 size={16} />
                Owner / Admin
              </button>
              <button
                type="button"
                onClick={() => handleTabChange('kasir')}
                className={`flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-bold transition-all ${
                  tab === 'kasir'
                    ? 'bg-white text-slate-800 shadow-sm'
                    : 'text-slate-400 hover:text-slate-600'
                }`}
              >
                <Users size={16} />
                Kasir / Staff
              </button>
            </div>
          </div>

          <form onSubmit={onSubmit} className="p-6 pt-5 space-y-4">
            {/* Tab description */}
            <div className={`rounded-xl px-4 py-3 text-sm ${tab === 'owner' ? 'bg-blue-50 text-blue-700' : 'bg-slate-50 text-slate-600'}`}>
              {tab === 'owner' ? (
                <p>Login sebagai <strong>pemilik toko</strong> untuk akses penuh ke semua fitur manajemen.</p>
              ) : (
                <p>Login sebagai <strong>kasir atau staff</strong> menggunakan username dan password yang diberikan oleh owner.</p>
              )}
            </div>

            {/* Identifier */}
            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                {tab === 'owner' ? 'Email / Username' : 'Username'}
              </label>
              <div className="relative">
                {tab === 'owner' ? (
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                ) : (
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm select-none">@</span>
                )}
                <Input
                  className="pl-9 h-11 rounded-xl"
                  placeholder={tab === 'owner' ? 'nama@email.com atau username' : 'username kamu'}
                  value={identifier}
                  onChange={e => setIdentifier(e.target.value)}
                  required
                  autoComplete="username"
                />
              </div>
            </div>

            {/* Password */}
            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Password</label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                <Input
                  type="password"
                  className="pl-9 h-11 rounded-xl"
                  placeholder="••••••••"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  required
                  autoComplete="current-password"
                />
              </div>
            </div>

            {error && (
              <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-xl p-3">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-slate-200 disabled:text-slate-400 text-white font-bold py-3.5 rounded-xl flex items-center justify-center gap-2 transition-colors"
            >
              {loading ? 'Memproses...' : 'Masuk'}
              {!loading && <ArrowRight size={16} />}
            </button>

            {tab === 'owner' && (
              <button
                type="button"
                onClick={() => setLocation('/register')}
                className="w-full text-sm text-center py-2 text-slate-400 hover:text-slate-600 transition-colors"
              >
                Belum punya akun? <span className="font-bold text-blue-600">Daftarkan bisnis kamu</span>
              </button>
            )}

            {tab === 'kasir' && (
              <p className="text-xs text-center text-slate-400">
                Tidak punya akun? Minta owner toko untuk membuat akun kasir kamu.
              </p>
            )}
          </form>
        </div>
      </div>
    </div>
  );
}

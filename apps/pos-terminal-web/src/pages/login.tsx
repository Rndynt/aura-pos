import { FormEvent, useState } from 'react';
import { useLocation } from 'wouter';
import { ArrowRight, Lock, Mail, UserCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { loginWithEmailOrUsername } from '@/lib/auth';

export default function LoginPage() {
  const [, setLocation] = useLocation();
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const result = await loginWithEmailOrUsername({ identifier, password });
    setLoading(false);

    if (!result.ok) {
      setError(result.message || 'Login gagal. Coba lagi.');
      return;
    }

    setLocation('/');
  };

  return (
    <div className="min-h-screen bg-slate-100 flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="h-1.5 bg-gradient-to-r from-blue-500 via-blue-600 to-indigo-600" />
        <form onSubmit={onSubmit} className="p-6 md:p-8 space-y-5">
          <div className="text-center space-y-2">
            <div className="mx-auto w-12 h-12 rounded-xl bg-blue-600 text-white flex items-center justify-center shadow-md">
              <UserCircle2 size={24} />
            </div>
            <h1 className="text-2xl font-extrabold text-slate-800">Login AuraPOS</h1>
            <p className="text-sm text-slate-500">Masuk dengan email atau username dan password.</p>
          </div>

          <div className="space-y-2">
            <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Email / Username</label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
              <Input className="pl-9 h-11 rounded-xl" placeholder="nama@email.com atau username" value={identifier} onChange={(e) => setIdentifier(e.target.value)} required />
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Password</label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
              <Input type="password" className="pl-9 h-11 rounded-xl" placeholder="••••••••" value={password} onChange={(e) => setPassword(e.target.value)} required />
            </div>
          </div>

          {error && <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-xl p-3">{error}</p>}

          <Button type="submit" className="w-full h-11 rounded-xl font-bold" disabled={loading}>
            {loading ? 'Memproses...' : 'Masuk'} {!loading && <ArrowRight size={16} className="ml-1" />}
          </Button>

          <Button type="button" variant="outline" className="w-full h-11 rounded-xl font-bold" onClick={() => setLocation('/register')}>
            Belum punya akun? Register
          </Button>
        </form>
      </div>
    </div>
  );
}

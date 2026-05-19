import { FormEvent, useState } from 'react';
import { useLocation } from 'wouter';
import { ArrowRight, Lock, Mail, Store, User } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { registerWithEmailAndUsername } from '@/lib/auth';

export default function RegisterPage() {
  const [, setLocation] = useLocation();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const result = await registerWithEmailAndUsername({ name, email, username, password });
    setLoading(false);

    if (!result.ok) {
      setError(result.message || 'Register gagal. Coba lagi.');
      return;
    }

    setLocation('/login');
  };

  return (
    <div className="min-h-screen bg-slate-100 flex items-center justify-center p-4">
      <div className="w-full max-w-lg bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="h-1.5 bg-gradient-to-r from-blue-500 via-blue-600 to-indigo-600" />
        <form onSubmit={onSubmit} className="p-6 md:p-8 space-y-4">
          <div className="text-center space-y-2 mb-1">
            <div className="mx-auto w-12 h-12 rounded-xl bg-blue-600 text-white flex items-center justify-center shadow-md">
              <Store size={22} />
            </div>
            <h1 className="text-2xl font-extrabold text-slate-800">Register AuraPOS</h1>
            <p className="text-sm text-slate-500">Buat akun kasir dengan email, username, dan password.</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Nama</label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                <Input className="pl-9 h-11 rounded-xl" placeholder="Nama lengkap" value={name} onChange={(e) => setName(e.target.value)} required />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Username</label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                <Input className="pl-9 h-11 rounded-xl" placeholder="username" value={username} onChange={(e) => setUsername(e.target.value)} required />
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Email</label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
              <Input type="email" className="pl-9 h-11 rounded-xl" placeholder="nama@bisnis.com" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Password</label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
              <Input type="password" className="pl-9 h-11 rounded-xl" placeholder="Minimal 8 karakter" value={password} onChange={(e) => setPassword(e.target.value)} required />
            </div>
          </div>

          {error && <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-xl p-3">{error}</p>}

          <Button type="submit" className="w-full h-11 rounded-xl font-bold" disabled={loading}>
            {loading ? 'Memproses...' : 'Buat Akun'} {!loading && <ArrowRight size={16} className="ml-1" />}
          </Button>

          <Button type="button" variant="outline" className="w-full h-11 rounded-xl font-bold" onClick={() => setLocation('/login')}>
            Sudah punya akun? Login
          </Button>
        </form>
      </div>
    </div>
  );
}

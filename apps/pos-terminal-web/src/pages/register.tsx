import { FormEvent, useState } from 'react';
import { useLocation } from 'wouter';
import {
  ArrowRight, ArrowLeft, Store, User, Mail, Lock,
  Building2, MapPin, Phone, Check, ChefHat, ShoppingBag,
  Shirt, Wrench, Wifi, ChevronRight
} from 'lucide-react';
import { Input } from '@/components/ui/input';

type BusinessType = 'CAFE_RESTAURANT' | 'RETAIL_MINIMARKET' | 'LAUNDRY' | 'SERVICE_APPOINTMENT' | 'DIGITAL_PPOB';

const BUSINESS_TYPES: { value: BusinessType; label: string; desc: string; icon: React.ReactNode; color: string }[] = [
  { value: 'CAFE_RESTAURANT', label: 'Kafe / Restoran', desc: 'Makan minum, dine-in & takeaway', icon: <ChefHat size={22} />, color: 'from-orange-400 to-red-500' },
  { value: 'RETAIL_MINIMARKET', label: 'Retail / Toko', desc: 'Minimarket, toko sembako, retail', icon: <ShoppingBag size={22} />, color: 'from-blue-400 to-blue-600' },
  { value: 'LAUNDRY', label: 'Laundry', desc: 'Jasa cuci & setrika pakaian', icon: <Shirt size={22} />, color: 'from-cyan-400 to-teal-500' },
  { value: 'SERVICE_APPOINTMENT', label: 'Jasa / Servis', desc: 'Salon, barbershop, bengkel', icon: <Wrench size={22} />, color: 'from-purple-400 to-purple-600' },
  { value: 'DIGITAL_PPOB', label: 'Digital / PPOB', desc: 'Pulsa, token, pembayaran digital', icon: <Wifi size={22} />, color: 'from-green-400 to-emerald-500' },
];

type FormData = {
  businessName: string;
  slug: string;
  businessType: BusinessType | '';
  businessAddress: string;
  businessPhone: string;
  ownerName: string;
  ownerEmail: string;
  ownerUsername: string;
  ownerPassword: string;
  ownerPasswordConfirm: string;
};

function slugify(str: string) {
  return str.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '').replace(/-+/g, '-').slice(0, 32);
}

export default function RegisterPage() {
  const [, setLocation] = useLocation();
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<FormData>({
    businessName: '',
    slug: '',
    businessType: '',
    businessAddress: '',
    businessPhone: '',
    ownerName: '',
    ownerEmail: '',
    ownerUsername: '',
    ownerPassword: '',
    ownerPasswordConfirm: '',
  });

  const set = (key: keyof FormData, value: string) => {
    setForm(prev => {
      const next = { ...prev, [key]: value };
      if (key === 'businessName') next.slug = slugify(value);
      return next;
    });
  };

  const canGoNext = () => {
    if (step === 1) return form.businessType !== '';
    if (step === 2) return form.businessName.trim() !== '' && form.slug.trim() !== '';
    if (step === 3) return form.ownerName !== '' && form.ownerEmail !== '' && form.ownerUsername !== '' && form.ownerPassword.length >= 8 && form.ownerPassword === form.ownerPasswordConfirm;
    return false;
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!canGoNext()) return;
    setError(null);
    setLoading(true);

    try {
      const tenantRes = await fetch('/api/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          slug: form.slug,
          businessName: form.businessName,
          businessType: form.businessType,
          ownerName: form.ownerName,
          ownerEmail: form.ownerEmail,
          ownerUsername: form.ownerUsername,
          ownerPassword: form.ownerPassword,
          currency: 'IDR',
          locale: 'id-ID',
          timezone: 'Asia/Jakarta',
        }),
      });
      const tenantBody = await tenantRes.json().catch(() => ({}));
      if (!tenantRes.ok) {
        setError(tenantBody?.message || tenantBody?.error || 'Gagal mendaftarkan bisnis. Coba lagi.');
        setLoading(false);
        return;
      }

      setStep(4);
    } catch {
      setError('Terjadi kesalahan jaringan. Periksa koneksi internet kamu.');
    } finally {
      setLoading(false);
    }
  };

  const STEPS = ['Jenis Usaha', 'Info Toko', 'Akun Owner'];

  if (step === 4) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-indigo-50 flex items-center justify-center p-4">
        <div className="w-full max-w-md text-center">
          <div className="w-20 h-20 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-6">
            <Check size={36} className="text-green-600" strokeWidth={3} />
          </div>
          <h1 className="text-2xl font-extrabold text-slate-800 mb-2">Bisnis Berhasil Didaftarkan!</h1>
          <p className="text-slate-500 mb-2">
            Toko <span className="font-bold text-slate-700">{form.businessName}</span> sudah siap.
          </p>
          <p className="text-slate-400 text-sm mb-8">
            Login sekarang untuk mulai menggunakan AuraPOS.
          </p>
          <button
            onClick={() => setLocation('/login')}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3.5 rounded-2xl flex items-center justify-center gap-2 transition-colors"
          >
            Login Sekarang <ArrowRight size={18} />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-indigo-50 flex items-center justify-center p-4">
      <div className="w-full max-w-lg">
        {/* Header */}
        <div className="text-center mb-6">
          <div className="mx-auto w-12 h-12 rounded-2xl bg-blue-600 text-white flex items-center justify-center shadow-lg shadow-blue-200 mb-3">
            <Store size={22} />
          </div>
          <h1 className="text-2xl font-extrabold text-slate-800">Daftarkan Bisnis Anda</h1>
          <p className="text-sm text-slate-500 mt-1">Buat akun AuraPOS untuk toko kamu</p>
        </div>

        {/* Step Indicator */}
        <div className="flex items-center justify-center gap-2 mb-6">
          {STEPS.map((label, i) => {
            const n = i + 1;
            const done = step > n;
            const active = step === n;
            return (
              <div key={n} className="flex items-center gap-2">
                <div className="flex items-center gap-1.5">
                  <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-all ${
                    done ? 'bg-blue-600 text-white' : active ? 'bg-blue-600 text-white ring-4 ring-blue-100' : 'bg-slate-200 text-slate-400'
                  }`}>
                    {done ? <Check size={13} strokeWidth={3} /> : n}
                  </div>
                  <span className={`text-xs font-semibold hidden sm:block ${active ? 'text-blue-600' : done ? 'text-slate-500' : 'text-slate-300'}`}>
                    {label}
                  </span>
                </div>
                {i < STEPS.length - 1 && (
                  <div className={`w-8 h-0.5 rounded-full ${step > n ? 'bg-blue-600' : 'bg-slate-200'}`} />
                )}
              </div>
            );
          })}
        </div>

        {/* Card */}
        <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="h-1 bg-gradient-to-r from-blue-500 via-blue-600 to-indigo-600" />

          <form onSubmit={step === 3 ? handleSubmit : (e) => { e.preventDefault(); if (canGoNext()) setStep(s => s + 1); }} className="p-6 space-y-4">

            {/* Step 1: Business Type */}
            {step === 1 && (
              <div className="space-y-3">
                <div>
                  <h2 className="text-lg font-extrabold text-slate-800">Jenis Usaha</h2>
                  <p className="text-sm text-slate-400">Pilih yang sesuai dengan bisnis kamu</p>
                </div>
                <div className="grid grid-cols-1 gap-2.5">
                  {BUSINESS_TYPES.map(bt => (
                    <button
                      key={bt.value}
                      type="button"
                      onClick={() => set('businessType', bt.value)}
                      className={`flex items-center gap-4 p-3.5 rounded-2xl border-2 text-left transition-all ${
                        form.businessType === bt.value
                          ? 'border-blue-500 bg-blue-50'
                          : 'border-slate-100 hover:border-slate-200 bg-slate-50'
                      }`}
                    >
                      <div className={`w-11 h-11 rounded-xl bg-gradient-to-br ${bt.color} text-white flex items-center justify-center flex-shrink-0 shadow-sm`}>
                        {bt.icon}
                      </div>
                      <div className="flex-1">
                        <p className="font-bold text-slate-800 text-sm">{bt.label}</p>
                        <p className="text-xs text-slate-400">{bt.desc}</p>
                      </div>
                      {form.businessType === bt.value && (
                        <div className="w-5 h-5 rounded-full bg-blue-600 flex items-center justify-center flex-shrink-0">
                          <Check size={11} className="text-white" strokeWidth={3} />
                        </div>
                      )}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Step 2: Business Info */}
            {step === 2 && (
              <div className="space-y-4">
                <div>
                  <h2 className="text-lg font-extrabold text-slate-800">Info Toko</h2>
                  <p className="text-sm text-slate-400">Isi informasi dasar bisnis kamu</p>
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Nama Toko <span className="text-red-400">*</span></label>
                  <div className="relative">
                    <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                    <Input className="pl-9 h-11 rounded-xl" placeholder="Contoh: Kafe Aura" value={form.businessName} onChange={e => set('businessName', e.target.value)} required />
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Slug / ID Toko <span className="text-red-400">*</span></label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm font-mono select-none">@</span>
                    <Input className="pl-8 h-11 rounded-xl font-mono text-sm" placeholder="kafe-aura" value={form.slug} onChange={e => set('slug', slugify(e.target.value))} required />
                  </div>
                  <p className="text-xs text-slate-400">Digunakan sebagai identitas toko. Hanya huruf kecil, angka, dan tanda -</p>
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Alamat</label>
                  <div className="relative">
                    <MapPin className="absolute left-3 top-3 text-slate-400" size={16} />
                    <textarea
                      className="w-full pl-9 pt-2.5 pb-2 pr-3 rounded-xl border border-input text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 min-h-[72px]"
                      placeholder="Jl. Contoh No. 1, Kota"
                      value={form.businessAddress}
                      onChange={e => set('businessAddress', e.target.value)}
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">No. Telepon</label>
                  <div className="relative">
                    <Phone className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                    <Input className="pl-9 h-11 rounded-xl" placeholder="+62 812-xxxx-xxxx" value={form.businessPhone} onChange={e => set('businessPhone', e.target.value)} />
                  </div>
                </div>
              </div>
            )}

            {/* Step 3: Owner Account */}
            {step === 3 && (
              <div className="space-y-4">
                <div>
                  <h2 className="text-lg font-extrabold text-slate-800">Akun Owner</h2>
                  <p className="text-sm text-slate-400">Buat akun untuk login sebagai pemilik toko</p>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Nama <span className="text-red-400">*</span></label>
                    <div className="relative">
                      <User className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={15} />
                      <Input className="pl-9 h-11 rounded-xl text-sm" placeholder="Nama lengkap" value={form.ownerName} onChange={e => set('ownerName', e.target.value)} required />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Username <span className="text-red-400">*</span></label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">@</span>
                      <Input className="pl-8 h-11 rounded-xl text-sm" placeholder="username" value={form.ownerUsername} onChange={e => set('ownerUsername', e.target.value)} required />
                    </div>
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Email <span className="text-red-400">*</span></label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={15} />
                    <Input type="email" className="pl-9 h-11 rounded-xl" placeholder="owner@toko.com" value={form.ownerEmail} onChange={e => set('ownerEmail', e.target.value)} required autoComplete="email" />
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Password <span className="text-red-400">*</span></label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={15} />
                    <Input type="password" className="pl-9 h-11 rounded-xl" placeholder="Minimal 8 karakter" value={form.ownerPassword} onChange={e => set('ownerPassword', e.target.value)} required autoComplete="new-password" minLength={8} />
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Konfirmasi Password <span className="text-red-400">*</span></label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={15} />
                    <Input
                      type="password"
                      className={`pl-9 h-11 rounded-xl ${form.ownerPasswordConfirm && form.ownerPassword !== form.ownerPasswordConfirm ? 'border-red-300 focus-visible:ring-red-400' : ''}`}
                      placeholder="Ulangi password"
                      value={form.ownerPasswordConfirm}
                      onChange={e => set('ownerPasswordConfirm', e.target.value)}
                      required
                      autoComplete="new-password"
                    />
                  </div>
                  {form.ownerPasswordConfirm && form.ownerPassword !== form.ownerPasswordConfirm && (
                    <p className="text-xs text-red-500">Password tidak cocok</p>
                  )}
                </div>
              </div>
            )}

            {error && (
              <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-xl p-3">{error}</p>
            )}

            {/* Navigation */}
            <div className="flex gap-3 pt-1">
              {step > 1 && (
                <button
                  type="button"
                  onClick={() => { setError(null); setStep(s => s - 1); }}
                  className="flex items-center gap-2 px-4 py-3 rounded-xl border-2 border-slate-200 text-slate-600 font-bold hover:bg-slate-50 transition-colors"
                >
                  <ArrowLeft size={16} /> Kembali
                </button>
              )}
              <button
                type="submit"
                disabled={!canGoNext() || loading}
                className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-200 disabled:text-slate-400 text-white font-bold py-3 rounded-xl flex items-center justify-center gap-2 transition-colors"
              >
                {loading ? (
                  <span>Memproses...</span>
                ) : step === 3 ? (
                  <><Check size={16} /> Daftarkan Bisnis</>
                ) : (
                  <>Selanjutnya <ChevronRight size={16} /></>
                )}
              </button>
            </div>

            {step === 1 && (
              <button
                type="button"
                onClick={() => setLocation('/login')}
                className="w-full text-sm text-slate-400 hover:text-slate-600 py-2 text-center transition-colors"
              >
                Sudah punya akun? <span className="font-bold text-blue-600">Login</span>
              </button>
            )}
          </form>
        </div>
      </div>
    </div>
  );
}

// @ts-nocheck
import { useState } from "react";
import { useLocation } from "wouter";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTenant } from "@/context/TenantContext";
import { useTenantProfile } from "@/hooks/api/useTenantProfile";
import { useToast } from "@/hooks/use-toast";
import { getActiveTenantId } from "@/lib/tenant";
import { PageHeader } from "@/components/design";
import {
  Crown, Sparkles, ChevronRight, X, Zap,
  ToggleLeft, ToggleRight, Lock, Info, CheckCircle2,
  LayoutGrid, ChefHat, Heart, Truck, CalendarDays, Package, MapPin,
  Layers, SplitSquareVertical, Tag, ClipboardList, Printer, QrCode,
  BarChart3, PieChart, Globe, Webhook, CalendarClock, Bell, PackageSearch,
  Banknote, Link2,
} from "lucide-react";

// ─── Types ─────────────────────────────────────────────────────────────────────

type PlanTier = "free" | "growth" | "pro";
type TabType = "modul" | "fitur";
type ModuleKey =
  | "enable_table_management" | "enable_kitchen_ticket" | "enable_loyalty"
  | "enable_delivery" | "enable_inventory" | "enable_appointments" | "enable_multi_location";

/** What feature_codes are BUNDLED inside this module (not sold separately) */
type ModuleItem = {
  type: "module";
  moduleKey: ModuleKey;
  /** camelCase version for moduleConfig object */
  moduleConfigKey: string;
  title: string;
  description: string;
  longDesc: string;
  icon: React.ElementType;
  iconBg: string;
  iconColor: string;
  requiredPlan: PlanTier;
  category: string;
  badge?: string;
  /** Feature codes that are part of this module bundle */
  bundledFeatures: Array<{ code: string; label: string }>;
  comingSoon?: boolean;
};

type FeatureItem = {
  type: "feature";
  featureCode: string;
  title: string;
  description: string;
  longDesc: string;
  icon: React.ElementType;
  iconBg: string;
  iconColor: string;
  requiredPlan: PlanTier;
  category: string;
  badge?: string;
  comingSoon?: boolean;
};

type CatalogItem = ModuleItem | FeatureItem;

// ─── Module Catalog ────────────────────────────────────────────────────────────
// Each module may bundle related feature codes that ONLY make sense together.
// These bundled features are NOT shown separately in the Fitur Satuan tab.

const MODULE_CATALOG: ModuleItem[] = [
  {
    type: "module",
    moduleKey: "enable_table_management",
    moduleConfigKey: "enableTableManagement",
    title: "Manajemen Meja",
    category: "Restoran & Meja",
    description: "Denah meja real-time, status duduk, & kelola pesanan per meja.",
    longDesc:
      "Aktifkan denah meja interaktif. Kasir bisa lihat status meja (tersedia / terisi / reservasi) dan lanjutkan pesanan langsung dari tampilan lantai.",
    icon: LayoutGrid,
    iconBg: "bg-blue-100",
    iconColor: "text-blue-600",
    requiredPlan: "free",
    bundledFeatures: [],
  },
  {
    type: "module",
    moduleKey: "enable_kitchen_ticket",
    moduleConfigKey: "enableKitchenTicket",
    title: "Kitchen Display (KDS)",
    category: "Restoran & Meja",
    description: "Tiket dapur, layar KDS, & printer dapur — satu paket lengkap.",
    longDesc:
      "Satu modul, tiga fitur terintegrasi: tiket pesanan otomatis (kitchen_ticket), layar display staf dapur (kitchen_display), dan dukungan printer thermal dapur (kitchen_printer). Ketiganya harus aktif bersama agar workflow dapur bekerja.",
    icon: ChefHat,
    iconBg: "bg-orange-100",
    iconColor: "text-orange-600",
    requiredPlan: "free",
    bundledFeatures: [
      { code: "kitchen_ticket", label: "Tiket Dapur" },
      { code: "kitchen_display", label: "Layar KDS" },
      { code: "kitchen_printer", label: "Printer Dapur" },
    ],
  },
  {
    type: "module",
    moduleKey: "enable_loyalty",
    moduleConfigKey: "enableLoyalty",
    title: "Program Loyalitas",
    category: "Pelanggan",
    description: "Poin reward, member card, & retensi pelanggan jangka panjang.",
    longDesc:
      "Bangun hubungan jangka panjang: kumpulkan poin tiap transaksi, tukarkan dengan diskon atau hadiah. Mendukung member card digital dan riwayat poin per pelanggan.",
    icon: Heart,
    iconBg: "bg-pink-100",
    iconColor: "text-pink-600",
    requiredPlan: "growth",
    badge: "Populer",
    bundledFeatures: [],
  },
  {
    type: "module",
    moduleKey: "enable_delivery",
    moduleConfigKey: "enableDelivery",
    title: "Delivery & Pengiriman",
    category: "Pelanggan",
    description: "Tipe order delivery, input alamat pengiriman, & tracking.",
    longDesc:
      "Tambahkan tipe pesanan delivery ke alur POS. Input alamat dan catatan driver, pantau status pengiriman, dan pisahkan laporan delivery dari transaksi reguler.",
    icon: Truck,
    iconBg: "bg-emerald-100",
    iconColor: "text-emerald-600",
    requiredPlan: "growth",
    bundledFeatures: [],
  },
  {
    type: "module",
    moduleKey: "enable_appointments",
    moduleConfigKey: "enableAppointments",
    title: "Sistem Appointment",
    category: "Pelanggan",
    description: "Jadwal booking, reminder otomatis, & manajemen antrian janji.",
    longDesc:
      "Cocok untuk salon, klinik, bengkel, atau laundry express. Pelanggan booking jadwal, dapat reminder otomatis. Manajer atur kapasitas slot dari kalender.",
    icon: CalendarDays,
    iconBg: "bg-violet-100",
    iconColor: "text-violet-600",
    requiredPlan: "growth",
    bundledFeatures: [],
  },
  {
    type: "module",
    moduleKey: "enable_inventory",
    moduleConfigKey: "enableInventory",
    title: "Manajemen Inventori",
    category: "Inventori",
    description: "Stok otomatis berkurang + laporan inventori — satu paket.",
    longDesc:
      "Dua fitur dalam satu: tracking stok otomatis per transaksi (inventory_tracking) dan laporan pergerakan stok harian/mingguan (inventory_reports). Notifikasi saat stok hampir habis.",
    icon: Package,
    iconBg: "bg-amber-100",
    iconColor: "text-amber-600",
    requiredPlan: "growth",
    bundledFeatures: [
      { code: "inventory_tracking", label: "Tracking Stok Otomatis" },
      { code: "inventory_reports", label: "Laporan Inventori" },
    ],
  },
  {
    type: "module",
    moduleKey: "enable_multi_location",
    moduleConfigKey: "enableMultiLocation",
    title: "Multi Lokasi",
    category: "Ekspansi",
    description: "Kelola beberapa cabang dari satu dashboard terpusat.",
    longDesc:
      "Buka dan kelola beberapa cabang dari satu akun: laporan per cabang, atur produk & harga per lokasi, transfer stok antar cabang.",
    icon: MapPin,
    iconBg: "bg-cyan-100",
    iconColor: "text-cyan-600",
    requiredPlan: "free",
    badge: "Pro",
    bundledFeatures: [],
  },
];

// ─── Feature Catalog ───────────────────────────────────────────────────────────
// ONLY standalone features that work independently.
// Features that are bundled inside a module (kitchen_ticket, kitchen_display,
// kitchen_printer, inventory_tracking, inventory_reports) are NOT listed here
// to avoid confusion and duplicate purchases.

const FEATURE_CATALOG: FeatureItem[] = [
  // Kasir & Transaksi
  {
    type: "feature", featureCode: "product_variants",
    title: "Variasi Produk", category: "Kasir & Transaksi",
    description: "Size, topping, rasa — tambahkan pilihan ke setiap produk.",
    longDesc: "Buat variasi produk fleksibel (ukuran, rasa, topping, add-on). Tiap varian bisa punya harga berbeda. Pelanggan pilih opsi saat checkout.",
    icon: Layers, iconBg: "bg-blue-100", iconColor: "text-blue-600", requiredPlan: "free",
  },
  {
    type: "feature", featureCode: "partial_payment",
    title: "Pembayaran Parsial", category: "Kasir & Transaksi",
    description: "Bayar sebagian, lunasi nanti — split bill & cicilan.",
    longDesc: "Terima pembayaran parsial atau split bill antar pelanggan. Sisa tagihan tercatat dan bisa dilunasi di waktu berbeda dengan metode bayar berbeda.",
    icon: SplitSquareVertical, iconBg: "bg-green-100", iconColor: "text-green-600", requiredPlan: "free",
  },
  {
    type: "feature", featureCode: "discounts",
    title: "Sistem Diskon", category: "Kasir & Transaksi",
    description: "Diskon per item (% atau Rp) dan diskon keseluruhan order.",
    longDesc: "Berikan diskon fleksibel: persentase atau nominal per item, plus diskon total per order. Badge hemat tampil otomatis di struk.",
    icon: Tag, iconBg: "bg-rose-100", iconColor: "text-rose-600", requiredPlan: "free",
  },
  {
    type: "feature", featureCode: "order_queue",
    title: "Panel Antrian Order", category: "Kasir & Transaksi",
    description: "Tampilkan antrian semua order aktif real-time di layar kasir.",
    longDesc: "Panel samping yang menampilkan semua order aktif secara real-time beserta status bayar. Kasir pantau pesanan tanpa berpindah layar.",
    icon: ClipboardList, iconBg: "bg-indigo-100", iconColor: "text-indigo-600", requiredPlan: "free",
  },
  // Notifikasi
  {
    type: "feature", featureCode: "order_notifications",
    title: "Notifikasi Order", category: "Notifikasi",
    description: "Alert bunyi & visual saat order baru masuk atau status berubah.",
    longDesc: "Notifikasi audio dan visual untuk semua tipe order (bukan hanya dapur). Kasir tidak melewatkan pesanan yang baru dibuat atau butuh perhatian.",
    icon: Bell, iconBg: "bg-yellow-100", iconColor: "text-yellow-600", requiredPlan: "growth",
    comingSoon: true,
  },
  // Hardware & Cetak
  {
    type: "feature", featureCode: "receipt_printer",
    title: "Printer Struk", category: "Hardware & Cetak",
    description: "Cetak struk thermal ke pelanggan saat transaksi selesai.",
    longDesc: "Integrasi printer thermal untuk struk pelanggan. Struk mencakup item, harga, diskon, pajak, metode bayar, dan info toko.",
    icon: Printer, iconBg: "bg-slate-100", iconColor: "text-slate-600", requiredPlan: "free",
  },
  {
    type: "feature", featureCode: "label_printer",
    title: "Printer Label", category: "Hardware & Cetak",
    description: "Cetak label harga, barcode, atau stiker pakaian & produk.",
    longDesc: "Cetak label produk dengan barcode, harga, dan nama. Cocok untuk laundry (tag pakaian), retail (label harga), atau usaha dengan banyak SKU.",
    icon: QrCode, iconBg: "bg-teal-100", iconColor: "text-teal-600", requiredPlan: "growth",
    comingSoon: true,
  },
  {
    type: "feature", featureCode: "barcode_scanner",
    title: "Scanner Barcode", category: "Hardware & Cetak",
    description: "Scan produk langsung dari kamera atau scanner USB/Bluetooth.",
    longDesc: "Tambahkan produk ke keranjang dengan scan barcode. Mendukung scanner USB, Bluetooth, dan kamera perangkat. Proses checkout retail jadi lebih cepat.",
    icon: PackageSearch, iconBg: "bg-purple-100", iconColor: "text-purple-600", requiredPlan: "growth",
    comingSoon: true,
  },
  // Laporan & Analitik
  {
    type: "feature", featureCode: "sales_reports",
    title: "Laporan Penjualan", category: "Laporan & Analitik",
    description: "Ringkasan omzet harian, mingguan, dan bulanan dengan export.",
    longDesc: "Laporan penjualan lengkap: omzet per periode, produk terlaris, metode pembayaran, dan tren penjualan. Export ke PDF atau Excel.",
    icon: BarChart3, iconBg: "bg-blue-100", iconColor: "text-blue-600", requiredPlan: "free",
  },
  {
    type: "feature", featureCode: "analytics_dashboard",
    title: "Dashboard Analitik", category: "Laporan & Analitik",
    description: "Grafik real-time, KPI bisnis, & insight penjualan interaktif.",
    longDesc: "Dashboard visual dengan grafik omzet, chart produk terlaris, rata-rata nilai transaksi, dan insight bisnis. Update real-time, bisa filter per periode.",
    icon: PieChart, iconBg: "bg-violet-100", iconColor: "text-violet-600", requiredPlan: "free", badge: "Baru",
  },
  // Integrasi Eksternal
  {
    type: "feature", featureCode: "payment_gateway",
    title: "Payment Gateway", category: "Integrasi Eksternal",
    description: "Terima QRIS, Virtual Account, GoPay, OVO, & kartu kredit.",
    longDesc: "Integrasi payment gateway: QRIS, Virtual Account, GoPay, OVO, ShopeePay, dan kartu kredit. Rekonsiliasi otomatis ke laporan penjualan.",
    icon: Banknote, iconBg: "bg-green-100", iconColor: "text-green-600", requiredPlan: "pro", badge: "Pro",
    comingSoon: true,
  },
  {
    type: "feature", featureCode: "api_integration",
    title: "Integrasi API", category: "Integrasi Eksternal",
    description: "Hubungkan AuraPOS ke sistem ERP, marketplace, atau akuntansi.",
    longDesc: "API key & webhook untuk integrasi dengan sistem eksternal (ERP, marketplace, akuntansi). Dokumentasi REST API lengkap tersedia.",
    icon: Webhook, iconBg: "bg-slate-100", iconColor: "text-slate-600", requiredPlan: "pro", badge: "Pro",
    comingSoon: true,
  },
  {
    type: "feature", featureCode: "online_booking",
    title: "Booking Online", category: "Integrasi Eksternal",
    description: "Halaman booking publik via link atau QR code untuk pelanggan.",
    longDesc: "Halaman booking online yang bisa dibagikan ke pelanggan. Mereka pilih layanan, tanggal, jam — langsung masuk ke kalender appointment toko.",
    icon: Globe, iconBg: "bg-cyan-100", iconColor: "text-cyan-600", requiredPlan: "pro",
    comingSoon: true,
  },
  {
    type: "feature", featureCode: "calendar_sync",
    title: "Sinkronisasi Kalender", category: "Integrasi Eksternal",
    description: "Sync appointment ke Google Calendar atau iCal secara otomatis.",
    longDesc: "Appointment otomatis tersync ke Google Calendar atau iCal. Reminder email & WhatsApp ke pelanggan terkirim otomatis.",
    icon: CalendarClock, iconBg: "bg-indigo-100", iconColor: "text-indigo-600", requiredPlan: "pro",
    comingSoon: true,
  },
];

// ─── Plan config ──────────────────────────────────────────────────────────────

const PLANS = [
  {
    tier: "free" as PlanTier, name: "Starter", price: "Gratis",
    features: ["POS Terminal", "Manajemen Produk", "Laporan Penjualan", "Variasi Produk", "Diskon & Parsial", "Printer Struk", "Panel Antrian"],
  },
  {
    tier: "growth" as PlanTier, name: "Growth", price: "Rp 149.000",
    features: ["Semua Starter", "KDS + Loyalitas + Delivery", "Inventori (tracking + laporan)", "Appointment", "Notifikasi Order", "Dashboard Analitik", "Label Printer + Scanner"],
    popular: true,
  },
  {
    tier: "pro" as PlanTier, name: "Pro", price: "Rp 349.000",
    features: ["Semua Growth", "Multi Lokasi", "Payment Gateway", "API Integration", "Booking Online", "Calendar Sync"],
  },
];

const PLAN_RANK: Record<PlanTier, number> = { free: 0, growth: 1, pro: 2 };
const MODULE_CATS = ["Semua", "Restoran & Meja", "Pelanggan", "Inventori", "Ekspansi"];
const FEATURE_CATS = ["Semua", "Kasir & Transaksi", "Notifikasi", "Hardware & Cetak", "Laporan & Analitik", "Integrasi Eksternal"];

// ─── Hooks ─────────────────────────────────────────────────────────────────────

function useActiveFeatures(tenantId: string) {
  return useQuery({
    queryKey: ["/api/tenants/features", tenantId],
    queryFn: async () => {
      const res = await fetch("/api/tenants/features", {
        headers: { "x-tenant-id": tenantId },
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to fetch features");
      const json = await res.json();
      return (json.data?.features ?? []) as Array<{ feature_code: string; is_active: boolean }>;
    },
    enabled: !!tenantId,
  });
}

// ─── Card Components ───────────────────────────────────────────────────────────

function ModuleCard({
  item, isActive, unlocked, isToggling, onToggle, onSelect,
}: {
  item: ModuleItem; isActive: boolean; unlocked: boolean;
  isToggling: boolean; onToggle: () => void; onSelect: () => void;
}) {
  const comingSoon = item.comingSoon;
  return (
    <div className={`bg-white rounded-2xl border-2 transition-all duration-200 overflow-hidden relative ${
      comingSoon ? "border-slate-100"
      : isActive ? "border-emerald-300 shadow-md shadow-emerald-50"
      : unlocked ? "border-slate-200 hover:border-slate-300 hover:shadow-md"
      : "border-slate-100 opacity-60"
    }`}>
      {/* ── Coming Soon overlay ── */}
      {comingSoon && (
        <div className="absolute inset-0 z-10 bg-white/80 backdrop-blur-[1px] flex flex-col items-center justify-center gap-1.5 rounded-2xl">
          <span className="text-[10px] font-black uppercase tracking-widest text-slate-400 bg-slate-100 px-3 py-1 rounded-full border border-slate-200">
            Segera Hadir
          </span>
          <span className="text-[10px] text-slate-400">Sedang dalam pengembangan</span>
        </div>
      )}

      <button className="w-full text-left p-4" onClick={comingSoon ? undefined : onSelect}>
        <div className="flex items-start justify-between mb-3">
          <div className={`w-10 h-10 rounded-2xl flex items-center justify-center ${item.iconBg}`}>
            <item.icon size={18} className={item.iconColor} />
          </div>
          <div className="flex items-center gap-1.5">
            {/* Active status badge — prominent green pill */}
            {isActive && !comingSoon && (
              <span className="flex items-center gap-1 text-[10px] font-black bg-emerald-500 text-white px-2 py-0.5 rounded-full">
                <CheckCircle2 size={9} /> Aktif
              </span>
            )}
            {item.badge && !isActive && (
              <span className={`text-[10px] font-black px-2 py-0.5 rounded-full border ${
                item.badge === "Pro" ? "bg-violet-50 text-violet-600 border-violet-200"
                : "bg-orange-50 text-orange-600 border-orange-200"
              }`}>{item.badge}</span>
            )}
            {!unlocked && !comingSoon && <Lock size={11} className="text-slate-300" />}
          </div>
        </div>
        <h3 className="font-black text-slate-800 text-sm mb-1">{item.title}</h3>
        <p className="text-[11px] text-slate-400 leading-relaxed">{item.description}</p>

        {/* Bundled features chips */}
        {item.bundledFeatures.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-2.5">
            {item.bundledFeatures.map((f) => (
              <span key={f.code} className="flex items-center gap-1 text-[10px] font-semibold bg-slate-50 border border-slate-200 text-slate-500 px-1.5 py-0.5 rounded-lg">
                <Link2 size={9} className="text-slate-400" />
                {f.label}
              </span>
            ))}
          </div>
        )}
      </button>

      <div className={`px-4 py-3 flex items-center justify-between border-t ${
        isActive && !comingSoon ? "bg-emerald-50/50 border-emerald-100" : "bg-slate-50/50 border-slate-100"
      }`}>
        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
          item.requiredPlan === "free" ? "bg-slate-100 text-slate-500"
          : item.requiredPlan === "growth" ? "bg-blue-50 text-blue-600"
          : "bg-violet-50 text-violet-600"
        }`}>
          {item.requiredPlan === "free" ? "Gratis" : item.requiredPlan === "growth" ? "Growth" : "Pro"}
        </span>
        {comingSoon ? (
          <span className="text-[10px] font-bold text-slate-400 italic">Coming soon</span>
        ) : unlocked ? (
          <button
            onClick={(e) => { e.stopPropagation(); onToggle(); }}
            disabled={isToggling}
            className={`flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-xl transition-all active:scale-95 ${
              isActive
                ? "bg-slate-100 text-slate-600 hover:bg-red-50 hover:text-red-600"
                : "bg-slate-800 text-white hover:bg-slate-700"
            } ${isToggling ? "opacity-60" : ""}`}
          >
            {isToggling ? (
              <span className="w-3 h-3 rounded-full border-2 border-current border-t-transparent animate-spin" />
            ) : isActive ? <ToggleRight size={14} /> : <ToggleLeft size={14} />}
            {isActive ? "Nonaktifkan" : "Aktifkan"}
          </button>
        ) : (
          <button
            onClick={(e) => { e.stopPropagation(); onToggle(); }}
            className="flex items-center gap-1 text-[11px] font-bold text-violet-600 hover:text-violet-700 transition-colors"
          >
            <Crown size={11} /> Upgrade
          </button>
        )}
      </div>
    </div>
  );
}

function FeatureCard({
  item, isActive, unlocked, isToggling, onToggle, onSelect,
}: {
  item: FeatureItem; isActive: boolean; unlocked: boolean;
  isToggling: boolean; onToggle: () => void; onSelect: () => void;
}) {
  const comingSoon = item.comingSoon;
  return (
    <div className={`bg-white rounded-2xl border-2 transition-all duration-200 overflow-hidden relative ${
      comingSoon ? "border-slate-100"
      : isActive ? "border-emerald-300 shadow-md shadow-emerald-50"
      : unlocked ? "border-slate-200 hover:border-slate-300 hover:shadow-md"
      : "border-slate-100 opacity-60"
    }`}>
      {/* ── Coming Soon overlay ── */}
      {comingSoon && (
        <div className="absolute inset-0 z-10 bg-white/80 backdrop-blur-[1px] flex flex-col items-center justify-center gap-1.5 rounded-2xl">
          <span className="text-[10px] font-black uppercase tracking-widest text-slate-400 bg-slate-100 px-3 py-1 rounded-full border border-slate-200">
            Segera Hadir
          </span>
          <span className="text-[10px] text-slate-400">Sedang dalam pengembangan</span>
        </div>
      )}

      <button className="w-full text-left p-4" onClick={comingSoon ? undefined : onSelect}>
        <div className="flex items-start justify-between mb-3">
          <div className={`w-10 h-10 rounded-2xl flex items-center justify-center ${item.iconBg}`}>
            <item.icon size={18} className={item.iconColor} />
          </div>
          <div className="flex items-center gap-1.5">
            {/* Active status badge — prominent green pill */}
            {isActive && !comingSoon && (
              <span className="flex items-center gap-1 text-[10px] font-black bg-emerald-500 text-white px-2 py-0.5 rounded-full">
                <CheckCircle2 size={9} /> Aktif
              </span>
            )}
            {item.badge && !isActive && (
              <span className={`text-[10px] font-black px-2 py-0.5 rounded-full border ${
                item.badge === "Pro" ? "bg-violet-50 text-violet-600 border-violet-200"
                : item.badge === "Baru" ? "bg-emerald-50 text-emerald-600 border-emerald-200"
                : "bg-orange-50 text-orange-600 border-orange-200"
              }`}>{item.badge}</span>
            )}
            {!unlocked && !comingSoon && <Lock size={11} className="text-slate-300" />}
          </div>
        </div>
        <h3 className="font-black text-slate-800 text-sm mb-1">{item.title}</h3>
        <p className="text-[11px] text-slate-400 leading-relaxed line-clamp-2">{item.description}</p>
      </button>
      <div className={`px-4 py-3 flex items-center justify-between border-t ${
        isActive && !comingSoon ? "bg-emerald-50/50 border-emerald-100" : "bg-slate-50/50 border-slate-100"
      }`}>
        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
          item.requiredPlan === "free" ? "bg-slate-100 text-slate-500"
          : item.requiredPlan === "growth" ? "bg-blue-50 text-blue-600"
          : "bg-violet-50 text-violet-600"
        }`}>
          {item.requiredPlan === "free" ? "Gratis" : item.requiredPlan === "growth" ? "Growth" : "Pro"}
        </span>
        {comingSoon ? (
          <span className="text-[10px] font-bold text-slate-400 italic">Coming soon</span>
        ) : unlocked ? (
          <button
            onClick={(e) => { e.stopPropagation(); onToggle(); }}
            disabled={isToggling}
            className={`flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-xl transition-all active:scale-95 ${
              isActive
                ? "bg-slate-100 text-slate-600 hover:bg-red-50 hover:text-red-600"
                : "bg-slate-800 text-white hover:bg-slate-700"
            } ${isToggling ? "opacity-60" : ""}`}
          >
            {isToggling ? (
              <span className="w-3 h-3 rounded-full border-2 border-current border-t-transparent animate-spin" />
            ) : isActive ? <ToggleRight size={14} /> : <ToggleLeft size={14} />}
            {isActive ? "Nonaktifkan" : "Aktifkan"}
          </button>
        ) : (
          <button
            onClick={(e) => { e.stopPropagation(); onToggle(); }}
            className="flex items-center gap-1 text-[11px] font-bold text-violet-600 hover:text-violet-700"
          >
            <Crown size={11} /> Upgrade
          </button>
        )}
      </div>
    </div>
  );
}

// ─── Main Component ────────────────────────────────────────────────────────────

export default function MarketplacePage() {
  const [, setLocation] = useLocation();
  const { tenantId, moduleConfig } = useTenant();
  const { data: profile } = useTenantProfile(tenantId);
  const { data: activeFeaturesList = [], isLoading: featuresLoading } = useActiveFeatures(tenantId);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [activeTab, setActiveTab] = useState<TabType>("modul");
  const [moduleCat, setModuleCat] = useState("Semua");
  const [featureCat, setFeatureCat] = useState("Semua");
  const [selected, setSelected] = useState<CatalogItem | null>(null);
  const [toggling, setToggling] = useState<string | null>(null);
  const [showPlans, setShowPlans] = useState(false);
  const [switchingPlan, setSwitchingPlan] = useState<PlanTier | null>(null);

  // plan_tier uses snake_case in the domain type — planTier (camelCase) is the DB column alias
  const currentPlan: PlanTier = (profile?.tenant?.plan_tier as PlanTier) ?? "free";

  // Build active feature codes Set from API.
  // getActiveFeatures endpoint already filters to is_active=true records only —
  // the FeatureCheck domain type uses `enabled`, not `is_active`, so we must NOT
  // re-filter here or the Set would always be empty.
  const activeFeatureCodes = new Set(
    activeFeaturesList.map((f: any) => f.feature_code)
  );

  // Module active check: moduleConfig uses camelCase keys
  const isModuleActive = (item: ModuleItem): boolean => {
    if (!moduleConfig) return false;
    // Convert snake_case to camelCase for lookup
    const camel = item.moduleKey.replace(/_([a-z])/g, (_, l) => l.toUpperCase());
    return !!(moduleConfig as any)[camel];
  };

  const isFeatureActive = (item: FeatureItem) => activeFeatureCodes.has(item.featureCode);
  const isItemActive = (item: CatalogItem) =>
    item.type === "module" ? isModuleActive(item as ModuleItem) : isFeatureActive(item as FeatureItem);
  const canActivate = (item: CatalogItem) => PLAN_RANK[item.requiredPlan] <= PLAN_RANK[currentPlan];

  // Only count non-comingSoon items in totals (coming soon items aren't activatable yet)
  const availableModules = MODULE_CATALOG.filter((m) => !m.comingSoon);
  const availableFeatures = FEATURE_CATALOG.filter((f) => !f.comingSoon);
  const activeModules = availableModules.filter(isModuleActive).length;
  const activeFeatures = availableFeatures.filter(isFeatureActive).length;
  const totalActive = activeModules + activeFeatures;
  const totalItems = availableModules.length + availableFeatures.length;

  const handleSwitchPlan = async (tier: PlanTier) => {
    if (tier === currentPlan) return;
    setSwitchingPlan(tier);
    try {
      const res = await fetch("/api/tenants/plan", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", "x-tenant-id": getActiveTenantId() },
        body: JSON.stringify({ plan_tier: tier }),
      });
      if (!res.ok) throw new Error("Gagal mengganti paket");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["/api/tenants/profile", tenantId] }),
        queryClient.invalidateQueries({ queryKey: ["/api/tenants/features", tenantId] }),
      ]);
      const planName = PLANS.find((p) => p.tier === tier)?.name ?? tier;
      toast({ title: `Paket ${planName} aktif`, description: "Fitur baru sudah bisa digunakan." });
      setShowPlans(false);
    } catch {
      toast({ title: "Gagal", description: "Coba lagi beberapa saat.", variant: "destructive" });
    } finally {
      setSwitchingPlan(null);
    }
  };

  const handleToggle = async (item: CatalogItem) => {
    if (!canActivate(item)) { setShowPlans(true); return; }

    const key = item.type === "module"
      ? (item as ModuleItem).moduleKey
      : (item as FeatureItem).featureCode;
    setToggling(key);

    try {
      if (item.type === "module") {
        const mItem = item as ModuleItem;
        const newVal = !isModuleActive(mItem);
        const res = await fetch("/api/tenants/modules", {
          method: "PATCH",
          headers: { "Content-Type": "application/json", "x-tenant-id": getActiveTenantId() },
          body: JSON.stringify({ [mItem.moduleConfigKey]: newVal }),
        });
        if (!res.ok) throw new Error();
        await queryClient.invalidateQueries({ queryKey: ["/api/tenants/profile", tenantId] });
        toast({ title: newVal ? `${item.title} diaktifkan` : `${item.title} dinonaktifkan` });
      } else {
        const fItem = item as FeatureItem;
        const res = await fetch("/api/tenants/features/toggle", {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-tenant-id": getActiveTenantId() },
          body: JSON.stringify({ feature_code: fItem.featureCode }),
        });
        if (!res.ok) throw new Error();
        await queryClient.invalidateQueries({ queryKey: ["/api/tenants/features", tenantId] });
        const wasActive = isFeatureActive(fItem);
        toast({ title: !wasActive ? `${item.title} diaktifkan` : `${item.title} dinonaktifkan` });
      }
      setSelected(null);
    } catch {
      toast({ title: "Gagal", description: "Coba lagi beberapa saat.", variant: "destructive" });
    } finally {
      setToggling(null);
    }
  };

  const sortItems = <T extends CatalogItem>(items: T[]): T[] =>
    [...items].sort((a, b) => {
      const rank = (i: T) => {
        if (i.comingSoon) return 3;
        if (isItemActive(i)) return 0;
        if (canActivate(i)) return 1;
        return 2;
      };
      return rank(a) - rank(b);
    });

  const filteredModules = sortItems(
    moduleCat === "Semua" ? MODULE_CATALOG : MODULE_CATALOG.filter((m) => m.category === moduleCat)
  );
  const filteredFeatures = sortItems(
    featureCat === "Semua" ? FEATURE_CATALOG : FEATURE_CATALOG.filter((f) => f.category === featureCat)
  );

  const selectedActive = selected ? isItemActive(selected) : false;
  const selectedUnlocked = selected ? canActivate(selected) : false;
  const selectedTogglingKey = selected
    ? (selected.type === "module" ? (selected as ModuleItem).moduleKey : (selected as FeatureItem).featureCode)
    : null;

  return (
    <div className="flex-1 h-full bg-slate-50 overflow-y-auto pb-8">

      <PageHeader
        title="Marketplace Fitur"
        subtitle="Aktifkan modul & fitur sesuai kebutuhan bisnis"
        onBack={() => setLocation("/hub")}
        actions={
          <button
            onClick={() => setShowPlans(true)}
            className="flex items-center gap-1.5 bg-violet-50 border border-violet-200 text-violet-700 text-xs font-bold px-3 py-1.5 rounded-xl hover:bg-violet-100 transition-colors"
          >
            <Crown size={13} /> Paket
          </button>
        }
        tabs={
          <div className="flex gap-1">
            {(["modul", "fitur"] as TabType[]).map((tab) => {
              const count = tab === "modul" ? activeModules : activeFeatures;
              const total = tab === "modul" ? availableModules.length : availableFeatures.length;
              return (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={`relative px-4 py-3 text-sm font-bold transition-colors ${
                    activeTab === tab ? "text-slate-800" : "text-slate-400 hover:text-slate-600"
                  }`}
                >
                  {tab === "modul" ? "Modul" : "Fitur Satuan"}
                  <span className={`ml-1.5 text-[10px] font-black px-1.5 py-0.5 rounded-full ${
                    activeTab === tab ? "bg-slate-800 text-white" : "bg-slate-100 text-slate-400"
                  }`}>{count}/{total}</span>
                  {activeTab === tab && (
                    <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-slate-800 rounded-full" />
                  )}
                </button>
              );
            })}
          </div>
        }
      />

      <div className="px-4 pt-4 space-y-4">

        {/* ── PLAN BANNER ── */}
        <div className="bg-gradient-to-br from-slate-800 to-slate-900 rounded-2xl p-4 text-white relative overflow-hidden">
          <div className="absolute inset-0 opacity-10 pointer-events-none">
            <div className="absolute -top-8 -right-8 w-36 h-36 rounded-full bg-white" />
            <div className="absolute -bottom-12 -left-6 w-32 h-32 rounded-full bg-white" />
          </div>
          <div className="relative flex items-center justify-between">
            <div>
              <div className="flex items-center gap-1.5 mb-0.5">
                <Sparkles size={12} className="text-yellow-400" />
                <span className="text-[10px] font-bold text-white/60 uppercase tracking-wide">Paket Aktif</span>
              </div>
              <h2 className="text-xl font-black">{PLANS.find((p) => p.tier === currentPlan)?.name ?? "Starter"}</h2>
              <p className="text-white/50 text-[11px] mt-0.5">{totalActive} aktif dari {totalItems} tersedia</p>
            </div>
            <div className="flex flex-col items-end gap-2">
              <button
                onClick={() => setShowPlans(true)}
                className="flex items-center gap-1 bg-white text-slate-800 font-bold text-xs px-3 py-1.5 rounded-xl hover:bg-slate-100 transition-colors"
              >
                Upgrade <ChevronRight size={12} />
              </button>
              <div className="flex gap-2">
                <span className="text-[11px] font-black text-emerald-400">{activeModules} modul</span>
                <span className="text-white/30">·</span>
                <span className="text-[11px] font-black text-blue-400">{activeFeatures} fitur</span>
              </div>
            </div>
          </div>
          <div className="relative mt-3">
            <div className="h-1 bg-white/10 rounded-full overflow-hidden">
              <div
                className="h-full bg-white/60 rounded-full transition-all duration-500"
                style={{ width: `${(totalActive / totalItems) * 100}%` }}
              />
            </div>
          </div>
        </div>

        {/* ── MODUL TAB ── */}
        {activeTab === "modul" && (
          <>
            {/* Category filter */}
            <div className="flex gap-1.5 overflow-x-auto pb-1 no-scrollbar">
              {MODULE_CATS.map((cat) => (
                <button
                  key={cat}
                  onClick={() => setModuleCat(cat)}
                  className={`flex-shrink-0 px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                    moduleCat === cat
                      ? "bg-slate-800 text-white shadow-sm"
                      : "bg-white text-slate-500 border border-slate-200 hover:border-slate-300"
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>

            {/* Note about bundles */}
            <div className="flex items-start gap-2.5 bg-amber-50 border border-amber-200 rounded-2xl px-3.5 py-3">
              <Link2 size={13} className="text-amber-600 flex-shrink-0 mt-0.5" />
              <p className="text-[11px] text-amber-800 leading-relaxed">
                Beberapa modul sudah termasuk fitur-fitur terkait yang saling bergantung. Fitur bundled tidak dijual terpisah — harus diaktifkan bersama modulnya.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {filteredModules.map((item) => (
                <ModuleCard
                  key={item.moduleKey}
                  item={item}
                  isActive={isModuleActive(item)}
                  unlocked={canActivate(item)}
                  isToggling={toggling === item.moduleKey}
                  onToggle={() => handleToggle(item)}
                  onSelect={() => setSelected(item)}
                />
              ))}
            </div>
          </>
        )}

        {/* ── FITUR SATUAN TAB ── */}
        {activeTab === "fitur" && (
          <>
            {/* Category filter */}
            <div className="flex gap-1.5 overflow-x-auto pb-1 no-scrollbar">
              {FEATURE_CATS.map((cat) => (
                <button
                  key={cat}
                  onClick={() => setFeatureCat(cat)}
                  className={`flex-shrink-0 px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                    featureCat === cat
                      ? "bg-slate-800 text-white shadow-sm"
                      : "bg-white text-slate-500 border border-slate-200 hover:border-slate-300"
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>

            {/* Note: what's NOT here */}
            <div className="flex items-start gap-2.5 bg-blue-50 border border-blue-100 rounded-2xl px-3.5 py-3">
              <Info size={13} className="text-blue-500 flex-shrink-0 mt-0.5" />
              <p className="text-[11px] text-blue-700 leading-relaxed">
                Fitur yang sudah tergabung dalam modul (Tiket Dapur, Layar KDS, Printer Dapur, Tracking Stok, Laporan Inventori) dikelola di tab <strong>Modul</strong> — tidak dijual terpisah di sini.
              </p>
            </div>

            {featuresLoading ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {[...Array(6)].map((_, i) => (
                  <div key={i} className="bg-white rounded-2xl border-2 border-slate-100 p-4 animate-pulse">
                    <div className="w-10 h-10 bg-slate-100 rounded-2xl mb-3" />
                    <div className="h-4 bg-slate-100 rounded w-3/4 mb-2" />
                    <div className="h-3 bg-slate-100 rounded w-full" />
                  </div>
                ))}
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {filteredFeatures.map((item) => (
                  <FeatureCard
                    key={item.featureCode}
                    item={item}
                    isActive={isFeatureActive(item)}
                    unlocked={canActivate(item)}
                    isToggling={toggling === item.featureCode}
                    onToggle={() => handleToggle(item)}
                    onSelect={() => setSelected(item)}
                  />
                ))}
              </div>
            )}
          </>
        )}

        <div className="flex items-start gap-3 bg-blue-50 border border-blue-100 rounded-2xl p-3.5">
          <Info size={15} className="text-blue-500 flex-shrink-0 mt-0.5" />
          <p className="text-[11px] text-blue-700 leading-relaxed">
            Perubahan langsung aktif tanpa restart aplikasi. Beberapa fitur & modul membutuhkan upgrade paket terlebih dahulu.
          </p>
        </div>
      </div>

      {/* ── DETAIL DRAWER ── */}
      {selected && (
        <>
          <div
            className="fixed inset-0 bg-black/30 backdrop-blur-[2px] z-[60]"
            onClick={() => setSelected(null)}
          />
          <div className="fixed inset-x-0 bottom-0 z-[70] bg-white rounded-t-3xl shadow-2xl max-h-[85vh] overflow-y-auto">
            <div className="flex justify-center pt-3 pb-1">
              <div className="w-10 h-1 rounded-full bg-slate-200" />
            </div>
            <div className="px-5 pb-8 pt-3">
              <div className="flex items-start justify-between mb-5">
                <div className="flex items-center gap-3">
                  <div className={`w-12 h-12 rounded-2xl flex items-center justify-center ${selected.iconBg}`}>
                    <selected.icon size={22} className={selected.iconColor} />
                  </div>
                  <div>
                    <h3 className="font-black text-slate-800 text-base">{selected.title}</h3>
                    <div className="flex flex-wrap items-center gap-1.5 mt-0.5">
                      <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
                        selectedActive ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-400"
                      }`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${selectedActive ? "bg-emerald-500" : "bg-slate-300"}`} />
                        {selectedActive ? "Aktif" : "Tidak Aktif"}
                      </span>
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                        selected.requiredPlan === "free" ? "bg-slate-100 text-slate-500"
                        : selected.requiredPlan === "growth" ? "bg-blue-50 text-blue-600"
                        : "bg-violet-50 text-violet-600"
                      }`}>
                        {selected.requiredPlan === "free" ? "Gratis" : selected.requiredPlan === "growth" ? "Growth" : "Pro"}
                      </span>
                      <span className="text-[10px] text-slate-400 font-medium bg-slate-50 px-2 py-0.5 rounded-full border border-slate-100">
                        {selected.type === "module" ? "Modul" : "Fitur Satuan"}
                      </span>
                    </div>
                  </div>
                </div>
                <button
                  onClick={() => setSelected(null)}
                  className="p-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-500"
                >
                  <X size={16} />
                </button>
              </div>

              <p className="text-sm text-slate-600 leading-relaxed mb-5">{selected.longDesc}</p>

              {/* Bundled features detail for modules */}
              {selected.type === "module" && (selected as ModuleItem).bundledFeatures.length > 0 && (
                <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 mb-5">
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-wider mb-2.5">
                    Sudah Termasuk dalam Modul Ini
                  </p>
                  <div className="space-y-2">
                    {(selected as ModuleItem).bundledFeatures.map((f) => (
                      <div key={f.code} className="flex items-center gap-2.5">
                        <CheckCircle2 size={14} className="text-emerald-500 flex-shrink-0" />
                        <div>
                          <span className="text-xs font-bold text-slate-700">{f.label}</span>
                          <code className="ml-2 text-[10px] text-slate-400 font-mono">{f.code}</code>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Feature code for standalone features */}
              {selected.type === "feature" && (
                <div className="bg-slate-50 rounded-2xl px-4 py-3 mb-5 border border-slate-100">
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-wider mb-1">Feature Code</p>
                  <code className="text-xs font-mono text-slate-700 font-semibold">
                    {(selected as FeatureItem).featureCode}
                  </code>
                </div>
              )}

              {selectedUnlocked ? (
                <button
                  onClick={() => handleToggle(selected)}
                  disabled={toggling === selectedTogglingKey}
                  className={`w-full py-3.5 rounded-2xl font-bold text-sm flex items-center justify-center gap-2 transition-all active:scale-[0.99] ${
                    selectedActive
                      ? "bg-slate-100 text-slate-700 hover:bg-slate-200"
                      : "bg-slate-800 text-white hover:bg-slate-700 shadow-lg shadow-slate-200"
                  }`}
                >
                  {toggling === selectedTogglingKey ? (
                    <span className="w-4 h-4 rounded-full border-2 border-current border-t-transparent animate-spin" />
                  ) : selectedActive ? (
                    <><ToggleRight size={16} /> Nonaktifkan</>
                  ) : (
                    <><Zap size={16} /> Aktifkan Sekarang</>
                  )}
                </button>
              ) : (
                <button
                  onClick={() => { setSelected(null); setShowPlans(true); }}
                  className="w-full py-3.5 rounded-2xl font-bold text-sm flex items-center justify-center gap-2 bg-violet-600 text-white hover:bg-violet-700 transition-all shadow-lg shadow-violet-200"
                >
                  <Crown size={16} />
                  Upgrade ke {selected.requiredPlan === "growth" ? "Growth" : "Pro"}
                </button>
              )}
            </div>
          </div>
        </>
      )}

      {/* ── PLANS MODAL ── */}
      {showPlans && (
        <>
          <div
            className="fixed inset-0 bg-black/40 backdrop-blur-[3px] z-[80]"
            onClick={() => setShowPlans(false)}
          />
          <div className="fixed inset-0 z-[90] flex items-end md:items-center justify-center p-4">
            <div className="bg-white rounded-3xl w-full max-w-lg shadow-2xl overflow-hidden max-h-[90vh] overflow-y-auto">
              <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-slate-100">
                <div>
                  <h2 className="font-black text-slate-800 text-lg">Pilih Paket</h2>
                  <p className="text-xs text-slate-400 mt-0.5">Unlock lebih banyak fitur untuk bisnis kamu</p>
                </div>
                <button
                  onClick={() => setShowPlans(false)}
                  className="p-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-500"
                >
                  <X size={16} />
                </button>
              </div>
              <div className="p-5 space-y-3">
                {PLANS.map((plan) => {
                  const isCurrent = plan.tier === currentPlan;
                  return (
                    <div
                      key={plan.tier}
                      className={`rounded-2xl border-2 p-4 relative ${
                        plan.popular ? "border-blue-400 bg-blue-50/30"
                        : isCurrent ? "border-slate-300 bg-slate-50"
                        : "border-slate-200"
                      }`}
                    >
                      {plan.popular && (
                        <span className="absolute -top-3 left-4 text-[10px] font-black bg-blue-500 text-white px-2.5 py-0.5 rounded-full">
                          PALING POPULER
                        </span>
                      )}
                      <div className="flex items-start justify-between mb-3">
                        <div>
                          <h3 className="font-black text-slate-800">{plan.name}</h3>
                          <p className="text-lg font-black text-slate-800">
                            {plan.price}
                            {plan.tier !== "free" && (
                              <span className="text-xs font-semibold text-slate-400">/bln</span>
                            )}
                          </p>
                        </div>
                        {isCurrent ? (
                          <span className="text-[11px] font-black bg-emerald-100 text-emerald-700 px-2.5 py-1 rounded-xl">
                            ✓ Aktif
                          </span>
                        ) : (
                          <button
                            onClick={() => handleSwitchPlan(plan.tier)}
                            disabled={switchingPlan !== null}
                            className={`flex items-center gap-1.5 text-xs font-black px-3 py-1.5 rounded-xl text-white ${
                              plan.tier === "free"
                                ? "bg-slate-500 hover:bg-slate-600"
                                : plan.tier === "growth"
                                ? "bg-blue-500 hover:bg-blue-600"
                                : "bg-violet-500 hover:bg-violet-600"
                            } transition-colors disabled:opacity-60`}
                            data-testid={`button-select-plan-${plan.tier}`}
                          >
                            {switchingPlan === plan.tier ? (
                              <span className="w-3 h-3 rounded-full border-2 border-white border-t-transparent animate-spin" />
                            ) : null}
                            {switchingPlan === plan.tier ? "Memproses..." : "Pilih"}
                          </button>
                        )}
                      </div>
                      <div className="space-y-1.5">
                        {plan.features.map((f) => (
                          <div key={f} className="flex items-center gap-2">
                            <CheckCircle2
                              size={12}
                              className={plan.popular ? "text-blue-500" : "text-slate-400"}
                            />
                            <span className="text-xs text-slate-600">{f}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

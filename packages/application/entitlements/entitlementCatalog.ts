export const ENTITLEMENT_CATALOG = {
  meta: {
    version: 2,
    currency: "IDR",
    description:
      "Single source of truth for AuraPoS commercial tenant entitlements.",
  },
  billingIntervals: {
    none: { label: "No billing interval" },
    one_time: { label: "One time" },
    monthly: { label: "Monthly" },
    yearly: { label: "Yearly" },
  },
  plans: {
    starter: {
      label: "Starter",
      sortOrder: 10,
      price: 0,
      billingInterval: "monthly",
      included: ["inventory_basic_stock", "payments_partial_payment"],
    },
    growth: {
      label: "Growth",
      sortOrder: 20,
      price: 99000,
      billingInterval: "monthly",
      included: ["orders_queue", "restaurant_kitchen_ops", "reports_advanced"],
    },
    pro: {
      label: "Pro",
      sortOrder: 30,
      price: 199000,
      billingInterval: "monthly",
      included: [
        "inventory_advanced_stock",
        "payments_multi_payment",
        "payments_split_bill",
        "reports_export",
        "multi_location",
        "integrations_payment_gateway",
        "integrations_api_access",
      ],
    },
  },
  entitlements: {
    inventory_basic_stock: {
      label: "Stok Dasar",
      kind: "module",
      area: "inventory",
      category: "Inventori",
      description: "Lihat stok per produk, status menipis/habis, & adjust qty.",
      longDesc:
        "Fitur stok esensial: tracking stok per produk, status stok, dan penyesuaian stok dasar.",
    },
    inventory_advanced_stock: {
      label: "Stok Lanjutan",
      kind: "module",
      area: "inventory",
      category: "Inventori",
      description:
        "Mutasi stok bertipe, riwayat audit trail, & laporan pergerakan.",
      longDesc:
        "Melengkapi Stok Dasar dengan mutasi bertipe, riwayat audit, opname, transfer, low stock alert, dan laporan stok.",
      bundleItems: [
        { label: "Mutasi Stok" },
        { label: "Opname" },
        { label: "Transfer Stok" },
        { label: "Low Stock Alert" },
        { label: "Laporan Stok" },
      ],
    },
    payments_partial_payment: {
      label: "DP / Bayar Sebagian",
      kind: "feature",
      area: "payments",
      category: "Pembayaran",
      description: "Terima uang muka dan lunasi sisa tagihan nanti.",
      longDesc:
        "Satu order dengan satu total tagihan: customer membayar sebagian sebagai DP/uang muka, lalu sisa tagihan dilunasi kemudian.",
    },
    payments_multi_payment: {
      label: "Multi Payment",
      kind: "feature",
      area: "payments",
      category: "Pembayaran",
      description: "Lunasi satu tagihan dengan beberapa metode pembayaran.",
      longDesc:
        "Satu order dibayar dalam satu checkout menggunakan beberapa metode, misalnya tunai + QRIS. Target normalnya adalah lunas dalam satu sesi bayar.",
    },
    payments_split_bill: {
      label: "Split Bill",
      kind: "feature",
      area: "payments",
      category: "Pembayaran",
      description:
        "Pecah satu order menjadi beberapa tagihan berdasarkan item yang dipilih.",
      longDesc:
        "Kasir dapat memilih item atau sebagian quantity item dari satu order untuk dibuat menjadi bill terpisah, lalu tiap bill dibayar masing-masing.",
    },
    receipt_compact: {
      label: "Struk Ringkas",
      kind: "feature",
      area: "receipt",
      category: "Struk",
      description: "Format struk ringkas hemat kertas untuk printer thermal.",
      longDesc: "Layout struk yang lebih padat untuk menghemat kertas thermal.",
    },
    orders_queue: {
      label: "Antrian Order",
      kind: "feature",
      area: "orders",
      category: "Order",
      description: "Panel antrian semua order aktif real-time di layar kasir.",
      longDesc:
        "Panel yang menampilkan semua order aktif secara real-time beserta status bayar.",
    },
    restaurant_table_service: {
      label: "Layanan Meja",
      kind: "module",
      area: "restaurant",
      category: "Restoran",
      description: "Denah meja real-time, status duduk, & pesanan per meja.",
      longDesc: "Denah meja interaktif untuk status meja dan pesanan per meja.",
      bundleItems: [
        { label: "Denah Meja" },
        { label: "Status Meja" },
        { label: "Order per Meja" },
      ],
    },
    restaurant_kitchen_ops: {
      label: "Kitchen Display (KDS)",
      kind: "module",
      area: "restaurant",
      category: "Restoran",
      description: "Tiket dapur, layar KDS, & printer dapur dalam satu paket.",
      longDesc:
        "Operasional dapur terintegrasi: tiket pesanan ke dapur, layar display staf dapur, dan dukungan printer dapur.",
      bundleItems: [
        { label: "Tiket Dapur" },
        { label: "Layar KDS" },
        { label: "Printer Dapur" },
      ],
    },
    reports_advanced: {
      label: "Laporan Lanjutan",
      kind: "feature",
      area: "reports",
      category: "Laporan",
      description: "Dashboard analitik, grafik real-time, & insight penjualan.",
      longDesc:
        "Dashboard visual untuk omzet, produk terlaris, nilai transaksi, dan insight bisnis.",
      bundleItems: [
        { label: "Analitik Penjualan" },
        { label: "Performa Kasir" },
        { label: "Ringkasan Bisnis" },
      ],
    },
    reports_export: {
      label: "Ekspor Laporan",
      kind: "feature",
      area: "reports",
      category: "Laporan",
      description: "Ekspor laporan ke Excel/PDF untuk akuntansi & arsip.",
      longDesc:
        "Ekspor laporan penjualan dan inventori untuk kebutuhan akuntansi, audit, atau arsip.",
    },
    multi_location: {
      label: "Multi Lokasi",
      kind: "module",
      area: "multi_location",
      category: "Ekspansi",
      description: "Kelola beberapa cabang dari satu dashboard terpusat.",
      longDesc:
        "Kelola beberapa cabang: laporan per cabang, produk/harga per lokasi, dan transfer stok antar cabang.",
      bundleItems: [
        { label: "Cabang" },
        { label: "Stok Cabang" },
        { label: "Laporan Cabang" },
      ],
    },
    hardware_label_printer: {
      label: "Printer Label",
      kind: "feature",
      area: "hardware",
      category: "Hardware",
      description: "Cetak label harga, barcode, atau stiker produk.",
      longDesc: "Cetak label produk dengan barcode, harga, dan nama.",
    },
    hardware_barcode_scanner: {
      label: "Scanner Barcode",
      kind: "feature",
      area: "hardware",
      category: "Hardware",
      description: "Scan produk dari kamera atau scanner USB/Bluetooth.",
      longDesc: "Tambahkan produk ke keranjang dengan scan barcode.",
    },
    integrations_payment_gateway: {
      label: "Payment Gateway",
      kind: "integration",
      area: "integrations",
      category: "Integrasi",
      description: "Terima pembayaran digital dari provider eksternal.",
      longDesc:
        "Integrasi payment gateway untuk pembayaran digital dan rekonsiliasi otomatis.",
    },
    integrations_accounting: {
      label: "Akuntansi",
      kind: "integration",
      area: "integrations",
      category: "Integrasi",
      description: "Sinkron transaksi ke sistem akuntansi atau Excel.",
      longDesc:
        "Sinkron data penjualan dan pembayaran ke software akuntansi atau ekspor otomatis.",
    },
    integrations_webhook: {
      label: "Webhook",
      kind: "integration",
      area: "integrations",
      category: "Integrasi",
      description: "Kirim event transaksi otomatis ke sistem eksternal.",
      longDesc:
        "Webhook untuk mengirim event order dan pembayaran secara real-time ke sistem eksternal.",
    },
    integrations_api_access: {
      label: "API Access",
      kind: "integration",
      area: "integrations",
      category: "Integrasi",
      description: "API key untuk integrasi ke sistem eksternal.",
      longDesc:
        "API key dan dokumentasi REST untuk integrasi ERP, marketplace, akuntansi, atau sistem internal.",
    },
  },
  offers: {
    receipt_compact_monthly: {
      entitlement: "receipt_compact",
      requiredPlan: "starter",
      price: 15000,
      billingInterval: "none",
      expires: false,
    },
    inventory_advanced_stock_addon: {
      entitlement: "inventory_advanced_stock",
      requiredPlan: "growth",
      price: 59000,
      billingInterval: "monthly",
      expires: true,
    },
    orders_queue_addon: {
      entitlement: "orders_queue",
      requiredPlan: "growth",
      price: 25000,
      billingInterval: "monthly",
      expires: true,
    },
    integrations_webhook_monthly: {
      entitlement: "integrations_webhook",
      requiredPlan: "growth",
      price: 49000,
      billingInterval: "monthly",
      expires: true,
    },
  },
  businessTypes: {
    CAFE_RESTAURANT: {
      label: "Cafe / Restaurant",
      defaultPlan: "starter",
      defaultEntitlements: ["inventory_basic_stock"],
      recommendedEntitlements: [
        "restaurant_table_service",
        "restaurant_kitchen_ops",
        "reports_advanced",
        "inventory_advanced_stock",
      ],
      orderTypes: ["DINE_IN", "TAKE_AWAY", "DELIVERY"],
      settings: {
        default_tax_rate: 0.0,
        default_service_charge_rate: 0.0,
        enable_tips: true,
      },
    },
    RETAIL_MINIMARKET: {
      label: "Retail / Minimarket",
      defaultPlan: "starter",
      defaultEntitlements: ["inventory_basic_stock"],
      recommendedEntitlements: [
        "inventory_advanced_stock",
        "hardware_barcode_scanner",
        "hardware_label_printer",
      ],
      orderTypes: ["WALK_IN"],
      settings: {
        default_tax_rate: 0.1,
        enable_barcode_scanner: false,
        low_stock_alert_enabled: false,
      },
    },
    LAUNDRY: {
      label: "Laundry",
      defaultPlan: "starter",
      defaultEntitlements: ["inventory_basic_stock"],
      recommendedEntitlements: [
        "orders_queue",
        "receipt_compact",
        "reports_advanced",
        "hardware_label_printer",
      ],
      orderTypes: ["WALK_IN"],
      settings: {
        default_tax_rate: 0.1,
        enable_item_tagging: false,
        default_turnaround_days: 3,
      },
    },
    SERVICE_APPOINTMENT: {
      label: "Service / Appointment",
      defaultPlan: "starter",
      defaultEntitlements: ["inventory_basic_stock"],
      recommendedEntitlements: [
        "orders_queue",
        "payments_partial_payment",
        "reports_advanced",
      ],
      orderTypes: ["WALK_IN"],
      settings: {
        default_tax_rate: 0.1,
        appointment_duration_minutes: 60,
        booking_buffer_minutes: 15,
      },
    },
    DIGITAL_PPOB: {
      label: "Digital / PPOB",
      defaultPlan: "starter",
      defaultEntitlements: ["inventory_basic_stock"],
      recommendedEntitlements: [
        "integrations_api_access",
        "integrations_webhook",
        "reports_advanced",
      ],
      orderTypes: ["WALK_IN"],
      settings: { enable_digital_receipts: true, auto_process_enabled: false },
    },
  },
} as const;

export type EntitlementCatalog = typeof ENTITLEMENT_CATALOG;
export type PlanCode = keyof EntitlementCatalog["plans"];
export type EntitlementCode = keyof EntitlementCatalog["entitlements"];
export type OfferCode = keyof EntitlementCatalog["offers"];
export type BusinessTypeCode = keyof EntitlementCatalog["businessTypes"];
export type BillingIntervalCode = keyof EntitlementCatalog["billingIntervals"];
export type EntitlementBundleItem = { label: string };

export const ENTITLEMENT_ALIASES = {
  payments_split_payment: "payments_split_bill",
} as const satisfies Record<string, EntitlementCode>;

export type LegacyEntitlementCode = keyof typeof ENTITLEMENT_ALIASES;
export type AnyEntitlementCode = EntitlementCode | LegacyEntitlementCode;

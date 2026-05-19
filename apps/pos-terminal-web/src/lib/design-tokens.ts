/**
 * Design Tokens & UI Utilities
 * Extracted from base-design.md for consistent styling
 */

import {
  LayoutGrid,
  Coffee,
  UtensilsCrossed,
  Pizza,
  Sandwich,
  IceCream,
  type LucideIcon,
} from "lucide-react";

/**
 * Category Icon Mapping
 * Maps product category names to Lucide React icons
 */
export const CATEGORY_ICONS: Record<string, LucideIcon> = {
  "All": LayoutGrid,
  "Semua": LayoutGrid,
  "Burger": UtensilsCrossed,
  "Coffee": Coffee,
  "Kopi": Coffee,
  "Pizza": Pizza,
  "Snack": Sandwich,
  "Dessert": IceCream,
  "Rice Bowl": UtensilsCrossed,
};

/**
 * Get icon for category, fallback to default
 */
export function getCategoryIcon(category: string): LucideIcon {
  return CATEGORY_ICONS[category] || LayoutGrid;
}

/**
 * Table Status Color Mapping
 * Returns Tailwind classes for table status badges
 */
export const TABLE_STATUS_COLORS = {
  available: {
    bg: "bg-green-50",
    text: "text-green-700",
    border: "border-green-200",
    label: "Tersedia",
  },
  occupied: {
    bg: "bg-blue-50",
    text: "text-blue-700",
    border: "border-blue-200",
    label: "Terisi",
  },
  reserved: {
    bg: "bg-yellow-50",
    text: "text-yellow-700",
    border: "border-yellow-200",
    label: "Dipesan",
  },
  maintenance: {
    bg: "bg-red-50",
    text: "text-red-700",
    border: "border-red-200",
    label: "Maintenance",
  },
} as const;

/**
 * Order Status Color Mapping
 */
export const ORDER_STATUS_COLORS = {
  draft: {
    bg: "bg-slate-50",
    text: "text-slate-600",
    label: "Draft",
  },
  confirmed: {
    bg: "bg-blue-50",
    text: "text-blue-600",
    label: "Dikonfirmasi",
  },
  preparing: {
    bg: "bg-yellow-50",
    text: "text-yellow-600",
    label: "Diproses",
  },
  ready: {
    bg: "bg-green-50",
    text: "text-green-600",
    label: "Siap Saji",
  },
  served: {
    bg: "bg-purple-50",
    text: "text-purple-600",
    label: "Sudah Disajikan",
  },
  completed: {
    bg: "bg-slate-50",
    text: "text-slate-500",
    label: "Selesai",
  },
  cancelled: {
    bg: "bg-red-50",
    text: "text-red-600",
    label: "Dibatalkan",
  },
} as const;

/**
 * Payment Status Color Mapping
 */
export const PAYMENT_STATUS_COLORS = {
  paid: {
    bg: "bg-green-50",
    text: "text-green-700",
    label: "Lunas",
  },
  partial: {
    bg: "bg-yellow-50",
    text: "text-yellow-700",
    label: "Sebagian",
  },
  unpaid: {
    bg: "bg-red-50",
    text: "text-red-700",
    label: "Belum Bayar",
  },
} as const;

/**
 * Format price to Indonesian Rupiah
 * Matches base-design.md formatIDR function
 */
export function formatIDR(price: number): string {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(price);
}

/**
 * Format price without currency symbol (compact)
 */
export function formatPrice(price: number): string {
  return formatIDR(price).replace("Rp", "").trim();
}

/**
 * Design System Spacing
 * Consistent spacing values from base-design.md
 */
export const SPACING = {
  xs: "0.5rem",  // 8px
  sm: "0.75rem", // 12px
  md: "1rem",    // 16px
  lg: "1.5rem",  // 24px
  xl: "2rem",    // 32px
} as const;

/**
 * Design System Border Radius
 */
export const RADIUS = {
  sm: "0.5rem",   // 8px - rounded-lg
  md: "0.75rem",  // 12px - rounded-xl
  lg: "1rem",     // 16px - rounded-2xl
  full: "9999px", // rounded-full
} as const;

/**
 * Common shadow styles from base-design
 */
export const SHADOWS = {
  sm: "shadow-sm",
  md: "shadow-md",
  lg: "shadow-lg shadow-slate-300",
  xl: "shadow-2xl",
} as const;

/**
 * Z-index layering
 */
export const Z_INDEX = {
  header: 10,
  sidebar: 30,
  drawer: 55,
  modal: 60,
  toast: 70,
} as const;

/**
 * Responsive Breakpoints (pixels)
 * Matches Tailwind's default breakpoints
 */
export const BREAKPOINTS = {
  xs: 0,      // Extra small
  sm: 640,    // Small
  md: 768,    // Medium - for modal/drawer switching
  lg: 1024,   // Large
  xl: 1280,   // Extra large
  "2xl": 1536, // 2X large
} as const;

/**
 * entitlementIcons.ts
 *
 * Frontend-only icon map for commercial entitlements.
 * Icons are React components and cannot live in the backend-shared pure-data SOT.
 * This is the single place in the frontend where icon+color per EntitlementCode is defined.
 * Both marketplace.tsx and my-features.tsx import from here (DRY).
 */
import type { ElementType } from "react";
import {
  Package, PackageSearch, SplitSquareVertical, Wallet, Layers, Receipt,
  ClipboardList, UtensilsCrossed, ChefHat, BarChart3, Download, MapPin,
  Monitor, Tag, ScanLine, CreditCard, BookOpen, Webhook, KeyRound,
} from "lucide-react";
import type { EntitlementCode } from "@pos/application/entitlements";

export type EntitlementIconStyle = {
  icon: ElementType;
  iconBg: string;
  iconColor: string;
};

export const ENTITLEMENT_ICONS: Record<EntitlementCode, EntitlementIconStyle> = {
  inventory_basic_stock:        { icon: Package,             iconBg: "bg-amber-100",   iconColor: "text-amber-600" },
  inventory_advanced_stock:     { icon: PackageSearch,       iconBg: "bg-emerald-100", iconColor: "text-emerald-600" },
  payments_partial_payment:     { icon: SplitSquareVertical, iconBg: "bg-green-100",   iconColor: "text-green-600" },
  payments_multi_payment:       { icon: Wallet,              iconBg: "bg-teal-100",    iconColor: "text-teal-600" },
  payments_split_bill:          { icon: Layers,              iconBg: "bg-indigo-100",  iconColor: "text-indigo-600" },
  receipt_compact:              { icon: Receipt,             iconBg: "bg-slate-100",   iconColor: "text-slate-600" },
  orders_queue:                 { icon: ClipboardList,       iconBg: "bg-indigo-100",  iconColor: "text-indigo-600" },
  restaurant_table_service:     { icon: UtensilsCrossed,     iconBg: "bg-blue-100",    iconColor: "text-blue-600" },
  restaurant_kitchen_ops:       { icon: ChefHat,             iconBg: "bg-orange-100",  iconColor: "text-orange-600" },
  reports_advanced:             { icon: BarChart3,           iconBg: "bg-violet-100",  iconColor: "text-violet-600" },
  reports_export:               { icon: Download,            iconBg: "bg-blue-100",    iconColor: "text-blue-600" },
  multi_location:               { icon: MapPin,              iconBg: "bg-cyan-100",    iconColor: "text-cyan-600" },
  customer_display:             { icon: Monitor,             iconBg: "bg-sky-100",     iconColor: "text-sky-600" },
  hardware_label_printer:       { icon: Tag,                 iconBg: "bg-teal-100",    iconColor: "text-teal-600" },
  hardware_barcode_scanner:     { icon: ScanLine,            iconBg: "bg-purple-100",  iconColor: "text-purple-600" },
  integrations_payment_gateway: { icon: CreditCard,          iconBg: "bg-green-100",   iconColor: "text-green-600" },
  integrations_accounting:      { icon: BookOpen,            iconBg: "bg-emerald-100", iconColor: "text-emerald-600" },
  integrations_webhook:         { icon: Webhook,             iconBg: "bg-slate-100",   iconColor: "text-slate-600" },
  integrations_api_access:      { icon: KeyRound,            iconBg: "bg-slate-100",   iconColor: "text-slate-600" },
};

export const FALLBACK_ICON: EntitlementIconStyle = {
  icon: Package, iconBg: "bg-slate-100", iconColor: "text-slate-500",
};

export function getEntitlementIcon(code: string): EntitlementIconStyle {
  return ENTITLEMENT_ICONS[code as EntitlementCode] ?? FALLBACK_ICON;
}

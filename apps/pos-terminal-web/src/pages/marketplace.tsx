import { useMemo, useState } from "react";
import { useLocation } from "wouter";
import { useTenant } from "@/context/TenantContext";
import { useEntitlements } from "@/hooks/api/useEntitlements";
import { useToast } from "@/hooks/use-toast";
import { PageHeader } from "@/components/design";
import {
  Crown, Sparkles, ChevronRight, X, Lock, Info, CheckCircle2, ShieldCheck,
} from "lucide-react";
import {
  ENTITLEMENT_CATALOG,
  getPlanIncludedEntitlements,
  type EntitlementCode,
  type PlanCode,
  type OfferCode,
} from "@pos/application/entitlements";

// ─── Single source of truth (imported directly) ────────────────────────────────
// The marketplace renders exclusively from ENTITLEMENT_CATALOG + the tenant's
// effective entitlements from /api/me/entitlements. There is NO frontend
// plan/module/feature catalog and NO module/feature toggling.

const PLAN_ORDER: PlanCode[] = (Object.keys(ENTITLEMENT_CATALOG.plans) as PlanCode[]).sort(
  (a, b) => ENTITLEMENT_CATALOG.plans[a].sortOrder - ENTITLEMENT_CATALOG.plans[b].sortOrder,
);

function planSortOrder(plan: PlanCode): number {
  return ENTITLEMENT_CATALOG.plans[plan]?.sortOrder ?? 0;
}

function formatPrice(price: number): string {
  if (!price) return "Gratis";
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", minimumFractionDigits: 0 }).format(price);
}

type EntitlementRow = {
  code: EntitlementCode;
  label: string;
  area: string;
  /** Lowest plan that includes this entitlement cumulatively, if any. */
  includedFromPlan: PlanCode | null;
  /** Offer that sells this entitlement as an add-on, if any. */
  offerCode: OfferCode | null;
};

function buildEntitlementRows(): EntitlementRow[] {
  const includedFrom = new Map<EntitlementCode, PlanCode>();
  for (const plan of PLAN_ORDER) {
    for (const code of getPlanIncludedEntitlements(plan)) {
      if (!includedFrom.has(code)) includedFrom.set(code, plan);
    }
  }

  const offerByEntitlement = new Map<EntitlementCode, OfferCode>();
  for (const [offerCode, offer] of Object.entries(ENTITLEMENT_CATALOG.offers)) {
    offerByEntitlement.set(offer.entitlement as EntitlementCode, offerCode as OfferCode);
  }

  return (Object.keys(ENTITLEMENT_CATALOG.entitlements) as EntitlementCode[]).map((code) => {
    const meta = ENTITLEMENT_CATALOG.entitlements[code];
    return {
      code,
      label: meta.label,
      area: meta.area,
      includedFromPlan: includedFrom.get(code) ?? null,
      offerCode: offerByEntitlement.get(code) ?? null,
    };
  });
}

export default function MarketplacePage() {
  const [, setLocation] = useLocation();
  const { planTier } = useTenant();
  const { entitlements, grants, isLoading } = useEntitlements();
  const { toast } = useToast();

  const [selected, setSelected] = useState<EntitlementRow | null>(null);
  const [showPlans, setShowPlans] = useState(false);

  const currentPlan: PlanCode =
    (planTier as PlanCode) && ENTITLEMENT_CATALOG.plans[planTier as PlanCode] ? (planTier as PlanCode) : "starter";

  const rows = useMemo(() => buildEntitlementRows(), []);

  const can = (code: EntitlementCode) => entitlements[code] === true;

  // An entitlement is included by the tenant's cumulative plan.
  const includedByPlan = (row: EntitlementRow) =>
    row.includedFromPlan !== null && planSortOrder(currentPlan) >= planSortOrder(row.includedFromPlan);

  // An offer can be purchased only if the tenant's plan meets the offer's
  // requiredPlan AND the entitlement is not already included by the plan.
  const canPurchase = (row: EntitlementRow): boolean => {
    if (!row.offerCode) return false;
    if (includedByPlan(row)) return false;
    const offer = ENTITLEMENT_CATALOG.offers[row.offerCode];
    return planSortOrder(currentPlan) >= planSortOrder(offer.requiredPlan as PlanCode);
  };

  const grantFor = (code: EntitlementCode) =>
    grants.find((g) => g.entitlement_code === code) ?? null;

  const statusOf = (row: EntitlementRow): "active" | "included" | "purchasable" | "locked" => {
    if (can(row.code)) return "active";
    if (includedByPlan(row)) return "included";
    if (canPurchase(row)) return "purchasable";
    return "locked";
  };

  const activeCount = rows.filter((r) => can(r.code)).length;
  const totalCount = rows.length;

  const handlePurchase = (row: EntitlementRow) => {
    // BILLING SAFETY: entitlement purchases/upgrades are processed by the
    // billing/admin system only — never written from the browser.
    toast({
      title: "Aktivasi via billing",
      description:
        "Pembelian add-on & upgrade paket diproses melalui billing/admin. Fitur akan dihubungkan ke pembayaran resmi.",
    });
    setSelected(null);
    setShowPlans(false);
  };

  const areaLabel = (area: string) => {
    const map: Record<string, string> = {
      inventory: "Inventori",
      payments: "Pembayaran",
      receipt: "Struk",
      orders: "Order",
      restaurant: "Restoran",
      reports: "Laporan",
      multi_location: "Multi Lokasi",
      hardware: "Hardware",
      integrations: "Integrasi",
    };
    return map[area] ?? area;
  };

  return (
    <div className="flex-1 h-full bg-slate-50 overflow-y-auto pb-8">
      <PageHeader
        title="Marketplace Entitlement"
        subtitle="Paket & add-on dari katalog resmi"
        onBack={() => setLocation("/hub")}
        actions={
          <button
            onClick={() => setShowPlans(true)}
            className="flex items-center gap-1.5 bg-violet-50 border border-violet-200 text-violet-700 text-xs font-bold px-3 py-1.5 rounded-xl hover:bg-violet-100 transition-colors"
          >
            <Crown size={13} /> Paket
          </button>
        }
      />

      <div className="px-4 pt-4 space-y-4">
        {/* ── PLAN BANNER ── */}
        <div className="bg-gradient-to-br from-slate-800 to-slate-900 rounded-2xl p-4 text-white relative overflow-hidden">
          <div className="relative flex items-center justify-between">
            <div>
              <div className="flex items-center gap-1.5 mb-0.5">
                <Sparkles size={12} className="text-yellow-400" />
                <span className="text-[10px] font-bold text-white/60 uppercase tracking-wide">Paket Aktif</span>
              </div>
              <h2 className="text-xl font-black">{ENTITLEMENT_CATALOG.plans[currentPlan]?.label ?? "Starter"}</h2>
              <p className="text-white/50 text-[11px] mt-0.5">{activeCount} aktif dari {totalCount} entitlement</p>
            </div>
            <button
              onClick={() => setShowPlans(true)}
              className="flex items-center gap-1 bg-white text-slate-800 font-bold text-xs px-3 py-1.5 rounded-xl hover:bg-slate-100 transition-colors"
            >
              Upgrade <ChevronRight size={12} />
            </button>
          </div>
          <div className="relative mt-3">
            <div className="h-1 bg-white/10 rounded-full overflow-hidden">
              <div
                className="h-full bg-white/60 rounded-full transition-all duration-500"
                style={{ width: `${totalCount ? (activeCount / totalCount) * 100 : 0}%` }}
              />
            </div>
          </div>
        </div>

        <div className="flex items-start gap-2.5 bg-blue-50 border border-blue-100 rounded-2xl px-3.5 py-3">
          <Info size={13} className="text-blue-500 flex-shrink-0 mt-0.5" />
          <p className="text-[11px] text-blue-700 leading-relaxed">
            Operasi dasar POS (katalog, order, pembayaran tunai, struk standar) selalu aktif tanpa entitlement.
            Daftar di bawah hanya menampilkan entitlement komersial dari katalog resmi.
          </p>
        </div>

        {/* ── ENTITLEMENT GRID ── */}
        {isLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="bg-white rounded-2xl border-2 border-slate-100 p-4 animate-pulse">
                <div className="h-4 bg-slate-100 rounded w-3/4 mb-2" />
                <div className="h-3 bg-slate-100 rounded w-full" />
              </div>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {rows.map((row) => {
              const status = statusOf(row);
              const grant = grantFor(row.code);
              return (
                <button
                  key={row.code}
                  onClick={() => setSelected(row)}
                  className={`text-left bg-white rounded-2xl border-2 p-4 transition-all duration-200 ${
                    status === "active" ? "border-emerald-300 shadow-md shadow-emerald-50"
                    : status === "locked" ? "border-slate-100 opacity-70"
                    : "border-slate-200 hover:border-slate-300 hover:shadow-md"
                  }`}
                  data-testid={`card-entitlement-${row.code}`}
                >
                  <div className="flex items-start justify-between mb-2">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wide bg-slate-50 px-2 py-0.5 rounded-full border border-slate-100">
                      {areaLabel(row.area)}
                    </span>
                    {status === "active" && (
                      <span className="flex items-center gap-1 text-[10px] font-black bg-emerald-500 text-white px-2 py-0.5 rounded-full">
                        <CheckCircle2 size={9} /> Aktif
                      </span>
                    )}
                    {status === "included" && (
                      <span className="text-[10px] font-black bg-blue-50 text-blue-600 border border-blue-200 px-2 py-0.5 rounded-full">
                        Termasuk paket
                      </span>
                    )}
                    {status === "purchasable" && row.offerCode && (
                      <span className="text-[10px] font-black bg-orange-50 text-orange-600 border border-orange-200 px-2 py-0.5 rounded-full">
                        {formatPrice(ENTITLEMENT_CATALOG.offers[row.offerCode].price)}
                      </span>
                    )}
                    {status === "locked" && <Lock size={11} className="text-slate-300" />}
                  </div>
                  <h3 className="font-black text-slate-800 text-sm mb-1">{row.label}</h3>
                  <p className="text-[11px] text-slate-400 leading-relaxed">
                    {row.includedFromPlan
                      ? `Termasuk paket ${ENTITLEMENT_CATALOG.plans[row.includedFromPlan].label}`
                      : row.offerCode
                        ? `Add-on (butuh paket ${ENTITLEMENT_CATALOG.plans[ENTITLEMENT_CATALOG.offers[row.offerCode].requiredPlan as PlanCode].label})`
                        : "Add-on komersial"}
                    {grant?.status === "expired" && " · grant kedaluwarsa"}
                    {grant?.status === "cancelled" && " · grant dibatalkan"}
                  </p>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* ── DETAIL DRAWER ── */}
      {selected && (
        <>
          <div className="fixed inset-0 bg-black/30 backdrop-blur-[2px] z-[60]" onClick={() => setSelected(null)} />
          <div className="fixed inset-x-0 bottom-0 z-[70] bg-white rounded-t-3xl shadow-2xl max-h-[85vh] overflow-y-auto">
            <div className="flex justify-center pt-3 pb-1">
              <div className="w-10 h-1 rounded-full bg-slate-200" />
            </div>
            <div className="px-5 pb-8 pt-3">
              <div className="flex items-start justify-between mb-5">
                <div>
                  <h3 className="font-black text-slate-800 text-base">{selected.label}</h3>
                  <span className="text-[10px] text-slate-400 font-medium bg-slate-50 px-2 py-0.5 rounded-full border border-slate-100">
                    {areaLabel(selected.area)} · {selected.code}
                  </span>
                </div>
                <button onClick={() => setSelected(null)} className="p-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-500">
                  <X size={16} />
                </button>
              </div>

              {statusOf(selected) === "active" ? (
                <div className="w-full py-3.5 rounded-2xl bg-emerald-50 border border-emerald-200 flex items-center justify-center gap-2">
                  <ShieldCheck size={16} className="text-emerald-600" />
                  <span className="text-sm font-black text-emerald-700">Sudah Aktif</span>
                </div>
              ) : statusOf(selected) === "included" ? (
                <div className="w-full py-3.5 rounded-2xl bg-blue-50 border border-blue-200 flex items-center justify-center gap-2">
                  <CheckCircle2 size={16} className="text-blue-600" />
                  <span className="text-sm font-black text-blue-700">Termasuk Paket Aktif</span>
                </div>
              ) : statusOf(selected) === "purchasable" ? (
                <button
                  onClick={() => handlePurchase(selected)}
                  className="w-full py-3.5 rounded-2xl font-bold text-sm flex items-center justify-center gap-2 bg-slate-800 text-white hover:bg-slate-700"
                >
                  <Crown size={16} /> Aktifkan Add-on
                </button>
              ) : (
                <button
                  onClick={() => { setSelected(null); setShowPlans(true); }}
                  className="w-full py-3.5 rounded-2xl font-bold text-sm flex items-center justify-center gap-2 bg-violet-600 text-white hover:bg-violet-700"
                >
                  <Crown size={16} /> Upgrade Paket
                </button>
              )}
            </div>
          </div>
        </>
      )}

      {/* ── PLANS MODAL ── */}
      {showPlans && (
        <>
          <div className="fixed inset-0 bg-black/40 backdrop-blur-[3px] z-[80]" onClick={() => setShowPlans(false)} />
          <div className="fixed inset-0 z-[90] flex items-end md:items-center justify-center p-4">
            <div className="bg-white rounded-3xl w-full max-w-lg shadow-2xl overflow-hidden max-h-[90vh] overflow-y-auto">
              <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-slate-100">
                <div>
                  <h2 className="font-black text-slate-800 text-lg">Pilih Paket</h2>
                  <p className="text-xs text-slate-400 mt-0.5">Entitlement kumulatif dari katalog resmi</p>
                </div>
                <button onClick={() => setShowPlans(false)} className="p-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-500">
                  <X size={16} />
                </button>
              </div>
              <div className="p-5 space-y-3">
                {PLAN_ORDER.map((planCode) => {
                  const plan = ENTITLEMENT_CATALOG.plans[planCode];
                  const isCurrent = planCode === currentPlan;
                  const included = getPlanIncludedEntitlements(planCode);
                  return (
                    <div
                      key={planCode}
                      className={`rounded-2xl border-2 p-4 relative ${isCurrent ? "border-slate-300 bg-slate-50" : "border-slate-200"}`}
                    >
                      <div className="flex items-start justify-between mb-3">
                        <div>
                          <h3 className="font-black text-slate-800">{plan.label}</h3>
                          <p className="text-lg font-black text-slate-800">
                            {formatPrice(plan.price)}
                            {plan.price > 0 && <span className="text-xs font-semibold text-slate-400">/bln</span>}
                          </p>
                        </div>
                        {isCurrent ? (
                          <span className="text-[11px] font-black bg-emerald-100 text-emerald-700 px-2.5 py-1 rounded-xl">✓ Aktif</span>
                        ) : (
                          <button
                            onClick={() => handlePurchase({ code: included[0] as EntitlementCode, label: plan.label, area: "", includedFromPlan: planCode, offerCode: null })}
                            className="text-xs font-black px-3 py-1.5 rounded-xl text-white bg-violet-500 hover:bg-violet-600 transition-colors"
                            data-testid={`button-select-plan-${planCode}`}
                          >
                            Pilih
                          </button>
                        )}
                      </div>
                      <div className="space-y-1.5">
                        {included.map((code) => (
                          <div key={code} className="flex items-center gap-2">
                            <CheckCircle2 size={12} className="text-slate-400" />
                            <span className="text-xs text-slate-600">
                              {ENTITLEMENT_CATALOG.entitlements[code]?.label ?? code}
                            </span>
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

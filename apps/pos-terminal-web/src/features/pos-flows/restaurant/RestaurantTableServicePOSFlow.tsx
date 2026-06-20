import { Loader2 } from "lucide-react";
import { ProductOptionsDialog } from "@/components/pos/ProductOptionsDialog";
import { POSLayout } from "@/features/pos/components/POSLayout";
import { ProductSection } from "@/features/pos/components/ProductSection";
import { CartSection, MobileCartSection } from "@/features/pos/components/CartSection";
import { POSOrderLifecycleSheet, POSPaymentDialog } from "@/features/pos-core";
import { useToast } from "@/hooks/use-toast";
import { useRestaurantTableServicePOSFlow } from "./useRestaurantTableServicePOSFlow";
import { RestaurantTableContextPanel } from "./RestaurantTableContextPanel";
import { RestaurantOrderLifecyclePanel } from "./RestaurantOrderLifecyclePanel";

export function RestaurantTableServicePOSFlow() {
  const flow = useRestaurantTableServicePOSFlow();
  const { toast } = useToast();

  return (
    <POSLayout isOffline={!flow.isOnline}>
      <ProductSection products={flow.products} isLoading={flow.productsLoading} error={flow.productsError} onAddToCart={flow.handleAddToCart} orders={[]} onUpdateOrderStatus={undefined} onOpenDraftSheet={() => flow.setCombinedDraftOpen(true)} />
      <div>
        <RestaurantTableContextPanel tables={flow.tables} selectedTableNumber={flow.cart.tableNumber || ""} onSelectTable={flow.cart.setTableNumber} manualTableNumber={flow.cart.tableNumber || ""} onManualTableNumberChange={flow.cart.setTableNumber} isLoading={flow.tablesLoading} error={flow.tablesError} />
        <RestaurantOrderLifecyclePanel orders={flow.activeOrders} isLoading={flow.openOrdersLoading} onPayActiveOrder={flow.payActiveOrder} />
        <CartSection cartProps={flow.cartPanelProps} />
      </div>
      <MobileCartSection isMobile={flow.isMobile} mobileCartOpen={flow.mobileCartOpen} setMobileCartOpen={flow.setMobileCartOpen} cartCount={flow.cart.items.length} cartProps={flow.cartPanelProps} />
      <POSOrderLifecycleSheet open={flow.combinedDraftOpen} onOpenChange={flow.setCombinedDraftOpen} onContinueOrder={(orderId) => { flow.cart.clearCart(); window.history.pushState({}, "", `/pos?continueOrderId=${orderId}`); window.dispatchEvent(new PopStateEvent("popstate")); }} onResumeLocalDraft={flow.handleResumeLocalDraft} onPayActiveOrder={flow.payActiveOrder} />
      <ProductOptionsDialog product={flow.selectedProduct} open={!!flow.selectedProduct} onClose={() => flow.setSelectedProduct(null)} onAdd={flow.handleVariantAdd} />
      <POSPaymentDialog open={flow.paymentMethodDialogOpen} onClose={() => { if (flow.pendingOrderForPayment) toast({ title: "Pesanan aktif restoran", description: `Order #${flow.pendingOrderForPayment.orderNumber} belum dilunasi.` }); flow.setPaymentMethodDialogOpen(false); flow.setPendingOrderForPayment(null); }} onMethodChange={flow.handleCFDMethodChange} onConfirm={flow.handlePaymentMethodConfirm} cartTotal={flow.pendingOrderForPayment?.totalAmount || flow.cart.total} cartItems={flow.cart.items} isSubmitting={flow.isProcessingQuickCharge} defaultPaymentMethod={flow.cart.paymentMethod} allowPartial={flow.hasPartialPayment} allowMultiPayment={flow.hasMultiPayment} allowSplitBill={flow.hasSplitBill} />
      {flow.isProcessingQuickCharge && <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"><div className="bg-white rounded-lg p-8 flex flex-col items-center gap-4 max-w-xs"><Loader2 className="w-10 h-10 animate-spin text-primary" /><h2 className="text-lg font-semibold">Processing Restaurant Payment</h2><p className="text-center text-sm text-muted-foreground">Mencatat pembayaran tagihan restoran...</p></div></div>}
    </POSLayout>
  );
}

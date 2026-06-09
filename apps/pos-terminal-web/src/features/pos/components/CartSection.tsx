import { CartPanel } from "@/components/pos/CartPanel";
import { MobileCartDrawer } from "@/components/pos/MobileCartDrawer";
import { UnifiedBottomNav } from "@/components/navigation/UnifiedBottomNav";

export function CartSection({ cartProps }: { cartProps: any }) {
  return (
    <div className="hidden md:flex md:flex-col w-[360px] min-h-0 h-full overflow-hidden flex-col">
      <div className="flex-1 min-h-0 overflow-hidden flex flex-col">
        <CartPanel {...cartProps} />
      </div>
    </div>
  );
}

export function MobileCartSection({ isMobile, mobileCartOpen, setMobileCartOpen, cartCount, cartProps }: any) {
  if (!isMobile) return null;

  return (
    <>
      <UnifiedBottomNav cartCount={cartCount} onCartClick={() => setMobileCartOpen(true)} />
      <MobileCartDrawer
        {...cartProps}
        open={mobileCartOpen}
        onOpenChange={setMobileCartOpen}
        onCharge={() => {
          cartProps.onCharge();
          setMobileCartOpen(false);
        }}
      />
    </>
  );
}

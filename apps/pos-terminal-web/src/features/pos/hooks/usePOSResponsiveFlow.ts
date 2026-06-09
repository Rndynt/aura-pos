import { useEffect } from "react";

export function useCloseMobileCartOnDesktop(isMobile: boolean, setMobileCartOpen: (open: boolean) => void) {
  useEffect(() => {
    if (!isMobile) {
      setMobileCartOpen(false);
    }
  }, [isMobile, setMobileCartOpen]);
}

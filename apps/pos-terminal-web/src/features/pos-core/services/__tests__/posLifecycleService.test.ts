import assert from "node:assert/strict";
import {
  canContinueServerDraft,
  canPayActiveOrder,
  getOrderRemainingAmount,
  isActivePOSOrder,
  isTrueServerDraft,
} from "../posLifecycleService";

assert.equal(canContinueServerDraft({ id: "draft-1", status: "confirmed", isEditableDraft: true }), true);
assert.equal(isTrueServerDraft({ id: "draft-2", status: "draft", payment_status: "unpaid" }), true);
assert.equal(isTrueServerDraft({ id: "kitchen-draft", status: "draft", hasKitchenTicket: true }), false);
assert.equal(isActivePOSOrder({ id: "active-1", status: "served", payment_status: "partial" }), true);
assert.equal(canPayActiveOrder({ id: "active-2", status: "draft", allowedActions: ["PAY_ACTIVE_ORDER"] }), true);
assert.equal(getOrderRemainingAmount({ id: "remaining-explicit", remaining_amount: 25_000 } as any), 25_000);
assert.equal(getOrderRemainingAmount({ id: "remaining-fallback", total_amount: 90_000, paid_amount: 30_000 }), 60_000);

console.log("posLifecycleService tests passed");

import assert from "node:assert/strict";
import { ORDER_TYPE_UNAVAILABLE_MESSAGE, resolveValidOrderTypeSelection } from "../orderTypeGuard";

const activeOrderTypes = [
  { id: "dine-in", code: "DINE_IN", isActive: true },
  { id: "takeaway", code: "TAKEAWAY", isActive: true },
];

const current = resolveValidOrderTypeSelection(activeOrderTypes, "takeaway");
assert.deepEqual(current, { ok: true, orderTypeId: "takeaway", orderTypeCode: "takeaway", wasReplaced: false });

const stale = resolveValidOrderTypeSelection(activeOrderTypes, "disabled-type");
assert.deepEqual(stale, { ok: true, orderTypeId: "dine-in", orderTypeCode: "dine-in", wasReplaced: true });

const missing = resolveValidOrderTypeSelection([], "disabled-type");
assert.deepEqual(missing, { ok: false, message: ORDER_TYPE_UNAVAILABLE_MESSAGE });

console.log("orderTypeGuard tests passed");

import { readFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const testDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(testDir, "../../../../../..");

const cashierRuntimeFiles = [
  "apps/pos-terminal-web/src/features/pos-flows/food-beverage/FoodBeveragePOSFlow.tsx",
  "apps/pos-terminal-web/src/features/pos-flows/service/ServiceCorePOSFlow.tsx",
  "apps/pos-terminal-web/src/features/pos-flows/core/CoreStandardPOSFlow.tsx",
  "apps/pos-terminal-web/src/features/pos-flows/retail/RetailStandardPOSFlow.tsx",
  "apps/pos-terminal-web/src/features/pos-flows/root/POSFlowRoot.tsx",
];

const phraseParts = [
  ["Food &", "Beverage mode"],
  ["Service", "mode"],
  ["Table &", "floor service"],
  ["Kitchen", "/ KDS"],
  ["Order", "queue"],
  ["DP /", "partial payment"],
  ["Entitlement", "aktif"],
  ["Baseline", ":"],
];

const colon = String.fromCharCode(58);
const forbiddenCashierCopy = phraseParts.map((parts) => parts.join(" ").replace(`Baseline ${colon}`, `Baseline${colon}`));

const failures = cashierRuntimeFiles.flatMap((file) => {
  const absolutePath = resolve(repoRoot, file);
  const source = readFileSync(absolutePath, "utf8");

  return forbiddenCashierCopy
    .filter((phrase) => source.includes(phrase))
    .map((phrase) => `${relative(repoRoot, absolutePath)} contains forbidden cashier copy: ${phrase}`);
});

if (failures.length > 0) {
  throw new Error(
    [
      "Internal/debug capability copy must not be rendered by cashier runtime POS flow components.",
      ...failures,
    ].join("\n"),
  );
}

console.log("cashierCopyGuard: no internal/debug capability copy in cashier runtime components");

/**
 * Guard test: prevents reintroduction of the legacy feature/module subsystem.
 *
 * Scans active app/package source (excluding tests, docs, roadmap, migrations,
 * and node_modules) for forbidden legacy symbols. Effective entitlements come
 * exclusively from the entitlement SOT, so none of these may appear in runtime
 * or frontend source.
 */

import '../../register-paths';
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../../../../');

const FORBIDDEN = [
  'tenantModuleConfigs',
  'tenantFeatures',
  'tenant_module_configs',
  'tenant_features',
  'enableInventory',
  'enableInventoryAdvanced',
  'resolveBasicStockEntitlement',
  'repairBasicStockEntitlement',
  'BASIC_STOCK_DEFAULT_PLAN_TIERS',
  'MODULE_CATALOG_DATA',
  'FEATURE_CATALOG_DATA',
  'MODULE_REQUIRED_PLAN',
  'FEATURE_REQUIRED_PLAN',
  'PLAN_FEATURE_MAP',
];

// Scan only active runtime/frontend source. Tests are allowed to mention these
// symbols (proof-of-absence assertions, like this very file).
const SCAN_DIRS = [
  'apps/api/src',
  'apps/pos-terminal-web/src',
  'packages/application',
  'packages/infrastructure',
  'packages/domain',
  'packages/core',
];

const SCAN_EXT = new Set(['.ts', '.tsx', '.js', '.jsx']);

function collectFiles(dir: string, acc: string[]): void {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return;
  }
  for (const entry of entries) {
    const full = path.join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      if (entry === 'node_modules' || entry === '__tests__' || entry === 'dist') continue;
      collectFiles(full, acc);
    } else if (SCAN_EXT.has(path.extname(entry)) && !entry.endsWith('.test.ts')) {
      acc.push(full);
    }
  }
}

const ALL_FILES: string[] = [];
for (const d of SCAN_DIRS) collectFiles(path.join(repoRoot, d), ALL_FILES);

function filesContaining(symbol: string): string[] {
  const hits: string[] = [];
  for (const file of ALL_FILES) {
    const content = readFileSync(file, 'utf8');
    if (content.includes(symbol)) hits.push(path.relative(repoRoot, file));
  }
  return hits;
}

describe('no legacy entitlement symbols in active source', () => {
  for (const symbol of FORBIDDEN) {
    it(`'${symbol}' has no active source references`, () => {
      const hits = filesContaining(symbol);
      assert.deepEqual(hits, [], `Found legacy symbol '${symbol}' in active source:\n${hits.join('\n')}`);
    });
  }
});

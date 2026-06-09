#!/usr/bin/env tsx
/**
 * AuraPoS Architecture Boundary Validator — P8 S1-S3
 *
 * Enforces import boundary rules defined in:
 *   roadmap/refactor/p8-s1-s3-import-boundary-enforcement-prompt.md
 *
 * Scans .ts / .tsx source files in all defined zones and applies 7 rules.
 * Violations exit with status 1 and print actionable messages.
 * Temporary exceptions are listed in the ALLOWLIST with a reason and expiry phase.
 *
 * Run: pnpm check:boundaries
 */

import fs from 'node:fs';
import path from 'node:path';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Violation {
  rule: string;
  file: string;
  importSpecifier: string;
  reason: string;
  suggestedFix: string;
}

interface AllowlistEntry {
  file: string;         // path relative to workspace root (forward-slash)
  importPattern: string; // exact specifier or prefix match
  reason: string;
  expiryPhase: string;
}

// ─── Temporary exceptions ────────────────────────────────────────────────────
//
// Goal: zero permanent exceptions.
// Every entry MUST have a reason and an expiry phase.
// Remove each entry once the referenced migration is complete.

// Post-P8.1: All 3 @shared/schema Table type exceptions removed.
// Frontend files now import Table from @pos/domain/seating.
const ALLOWLIST: AllowlistEntry[] = [];

function isAllowed(relFilePath: string, specifier: string): boolean {
  const normalised = relFilePath.replace(/\\/g, '/');
  return ALLOWLIST.some(
    (entry) =>
      normalised === entry.file &&
      (specifier === entry.importPattern ||
        specifier.startsWith(entry.importPattern + '/')),
  );
}

// ─── File collection ──────────────────────────────────────────────────────────

const IGNORED_DIR_NAMES = new Set([
  'node_modules', 'dist', 'build', '.next', 'coverage', 'migrations',
]);
const SOURCE_EXTENSIONS = new Set(['.ts', '.tsx']);

function collectSourceFiles(absDir: string): string[] {
  const results: string[] = [];
  if (!fs.existsSync(absDir)) return results;

  const walk = (current: string): void => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      if (IGNORED_DIR_NAMES.has(entry.name)) continue;
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath);
      } else {
        const ext = path.extname(entry.name);
        if (SOURCE_EXTENSIONS.has(ext) && !entry.name.endsWith('.d.ts')) {
          results.push(fullPath);
        }
      }
    }
  };

  walk(absDir);
  return results;
}

// ─── Import extraction ────────────────────────────────────────────────────────
//
// Extracts specifiers from:
//   import ... from 'specifier'
//   export ... from 'specifier'
//   import('specifier')   (dynamic)

const STATIC_IMPORT_RE =
  /(?:^|[\r\n])[ \t]*(?:import|export)\b[^'"]*?['"]([^'"]+)['"]/g;
const DYNAMIC_IMPORT_RE = /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g;

function extractImports(source: string): string[] {
  const specifiers: string[] = [];
  for (const re of [STATIC_IMPORT_RE, DYNAMIC_IMPORT_RE]) {
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(source)) !== null) {
      specifiers.push(m[1]);
    }
  }
  return specifiers;
}

// ─── Matching helpers ─────────────────────────────────────────────────────────

/** Returns true if `specifier` equals `pattern` or starts with `pattern + '/'`. */
function matchesPattern(specifier: string, pattern: string): boolean {
  return specifier === pattern || specifier.startsWith(pattern + '/');
}

/** Returns true if `specifier` matches any pattern in the list. */
function matchesAny(specifier: string, patterns: string[]): boolean {
  return patterns.some((p) => matchesPattern(specifier, p));
}

/** Returns true if specifier is a relative import (starts with '.' or '..') */
function isRelative(specifier: string): boolean {
  return specifier.startsWith('.');
}

/** Returns true if specifier looks like an apps/ path. */
function isAppsPath(specifier: string): boolean {
  return specifier.startsWith('apps/') || specifier.includes('/apps/');
}

// ─── Rule 1 — Domain purity ───────────────────────────────────────────────────
//
// packages/domain/** must not import:
//   apps/**, @pos/application, @pos/infrastructure, @shared/schema,
//   shared/schema, drizzle-orm, express, react, @tanstack/react-query

const DOMAIN_FORBIDDEN_PATTERNS = [
  '@pos/application',
  '@pos/infrastructure',
  '@shared/schema',
  'shared/schema',
  'drizzle-orm',
  'drizzle-zod',
  'express',
  'react',
  'react-dom',
  '@tanstack/react-query',
];

function checkDomain(relPath: string, specifiers: string[]): Violation[] {
  return specifiers.flatMap((spec) => {
    if (isRelative(spec)) return [];
    if (isAllowed(relPath, spec)) return [];
    if (!matchesAny(spec, DOMAIN_FORBIDDEN_PATTERNS) && !isAppsPath(spec)) return [];

    return [{
      rule: 'Rule 1 — Domain purity',
      file: relPath,
      importSpecifier: spec,
      reason:
        `packages/domain must be framework-free and persistence-free. ` +
        `Importing '${spec}' violates domain purity.`,
      suggestedFix:
        `Define a pure TypeScript type inside @pos/domain or @pos/core. ` +
        `Never import infrastructure, framework, or app-layer code from domain.`,
    }];
  });
}

// ─── Rule 2 — Application boundary ───────────────────────────────────────────
//
// packages/application/** must not import:
//   @pos/infrastructure, @shared/schema, shared/schema,
//   drizzle-orm, express, react, @tanstack/react-query, apps/**

const APPLICATION_FORBIDDEN_PATTERNS = [
  '@pos/infrastructure',
  '@shared/schema',
  'shared/schema',
  'drizzle-orm',
  'drizzle-zod',
  'express',
  'react',
  'react-dom',
  '@tanstack/react-query',
];

function checkApplication(relPath: string, specifiers: string[]): Violation[] {
  return specifiers.flatMap((spec) => {
    if (isRelative(spec)) return [];
    if (isAllowed(relPath, spec)) return [];
    if (!matchesAny(spec, APPLICATION_FORBIDDEN_PATTERNS) && !isAppsPath(spec)) return [];

    return [{
      rule: 'Rule 2 — Application boundary',
      file: relPath,
      importSpecifier: spec,
      reason:
        `packages/application must not import infrastructure, schema, framework, or app packages. ` +
        `Importing '${spec}' violates application boundary. ` +
        `This is the critical P2/P3 guard.`,
      suggestedFix:
        `Define an application port (interface) in packages/application/*/ports/ and inject it via constructor. ` +
        `The use case must depend on the port contract, not the adapter. ` +
        `Implement the adapter in packages/infrastructure/.`,
    }];
  });
}

// ─── Rule 3 — Infrastructure direction ───────────────────────────────────────
//
// packages/infrastructure/** must not import:
//   apps/api, apps/pos-terminal-web, react, @tanstack/react-query, frontend-only

const INFRASTRUCTURE_FORBIDDEN_PATTERNS = [
  'react',
  'react-dom',
  '@tanstack/react-query',
];

function checkInfrastructure(relPath: string, specifiers: string[]): Violation[] {
  return specifiers.flatMap((spec) => {
    if (isRelative(spec)) return [];
    if (isAllowed(relPath, spec)) return [];

    const isFrontendLib = matchesAny(spec, INFRASTRUCTURE_FORBIDDEN_PATTERNS);
    const isApiApp = matchesPattern(spec, 'apps/api') || spec.includes('/apps/api');
    const isFrontendApp =
      matchesPattern(spec, 'apps/pos-terminal-web') ||
      spec.includes('/apps/pos-terminal-web');

    if (!isFrontendLib && !isApiApp && !isFrontendApp) return [];

    return [{
      rule: 'Rule 3 — Infrastructure direction',
      file: relPath,
      importSpecifier: spec,
      reason:
        `packages/infrastructure must not import from apps or frontend-only packages. ` +
        `Importing '${spec}' violates infrastructure direction.`,
      suggestedFix:
        `Remove this import. Infrastructure implements application ports and must only depend on ` +
        `@pos/application (ports), @pos/domain, @pos/core, and DB/adapter libraries (drizzle-orm, postgres, etc.).`,
    }];
  });
}

// ─── Rule 4 — API app role ────────────────────────────────────────────────────
//
// apps/api/src/** must not import from apps/pos-terminal-web

function checkApi(relPath: string, specifiers: string[]): Violation[] {
  return specifiers.flatMap((spec) => {
    if (isRelative(spec)) return [];
    if (isAllowed(relPath, spec)) return [];

    const isFrontendApp =
      matchesPattern(spec, 'apps/pos-terminal-web') ||
      spec.includes('/apps/pos-terminal-web');
    if (!isFrontendApp) return [];

    return [{
      rule: 'Rule 4 — API app role',
      file: relPath,
      importSpecifier: spec,
      reason:
        `apps/api must not import from apps/pos-terminal-web. ` +
        `'${spec}' creates a forbidden cross-app dependency.`,
      suggestedFix:
        `Remove this import. If shared types are needed, place them in @pos/domain or @pos/core. ` +
        `API and frontend apps must remain independent. Communicate via HTTP API only.`,
    }];
  });
}

// ─── Rule 5 — POS frontend boundary ──────────────────────────────────────────
//
// apps/pos-terminal-web/src/** must not import:
//   @pos/infrastructure, drizzle-orm, apps/api, Node.js-only built-ins
//
// Exception: *.test.ts / *.spec.ts files are run by Node.js test runner,
// not by the browser build, so Node.js built-in imports are legitimate there.

const FRONTEND_FORBIDDEN_PATTERNS = [
  '@pos/infrastructure',
  'drizzle-orm',
  'drizzle-zod',
];

// Node.js built-ins that are NOT available in the browser
const NODE_ONLY_BUILTINS = new Set([
  'fs', 'path', 'crypto', 'os', 'child_process', 'cluster', 'net', 'tls',
  'dgram', 'dns', 'readline', 'repl', 'vm', 'worker_threads', 'perf_hooks',
  'http', 'https', 'http2', 'stream', 'zlib', 'buffer', 'process', 'v8',
  'assert', 'util', 'events', 'url',
]);

// node: protocol prefix
function isNodeBuiltin(spec: string): boolean {
  const bare = spec.startsWith('node:') ? spec.slice(5) : spec;
  return NODE_ONLY_BUILTINS.has(bare);
}

/** Test files are run by Node.js, not the browser — Node built-ins are OK. */
function isTestFile(relPath: string): boolean {
  return /\.(test|spec)\.(ts|tsx)$/.test(relPath);
}

function checkFrontend(relPath: string, specifiers: string[]): Violation[] {
  const inTestFile = isTestFile(relPath);

  return specifiers.flatMap((spec) => {
    if (isRelative(spec)) return [];
    if (isAllowed(relPath, spec)) return [];

    const isInfra = matchesAny(spec, FRONTEND_FORBIDDEN_PATTERNS);
    const isApiApp =
      matchesPattern(spec, 'apps/api') || spec.includes('/apps/api');
    // Test files run in Node.js (not the browser) — built-ins are OK there
    const isNodeOnly = !inTestFile && isNodeBuiltin(spec);

    if (!isInfra && !isApiApp && !isNodeOnly) return [];

    let reason: string;
    let suggestedFix: string;

    if (isInfra) {
      reason =
        `apps/pos-terminal-web must not import infrastructure packages. ` +
        `'${spec}' is server/DB-only code that is not available in the browser.`;
      suggestedFix =
        `Import domain types from @pos/domain or @pos/core instead. ` +
        `Use HTTP API calls (React Query / fetch) to get server data. ` +
        `Do not import Drizzle schemas or infrastructure adapters in the browser.`;
    } else if (isApiApp) {
      reason =
        `apps/pos-terminal-web must not import from apps/api. ` +
        `'${spec}' creates a forbidden cross-app dependency.`;
      suggestedFix =
        `Use HTTP API calls (fetch / React Query) to communicate with the backend. ` +
        `Share types via @pos/domain or @pos/core only.`;
    } else {
      reason =
        `apps/pos-terminal-web must not import Node.js built-in '${spec}'. ` +
        `It is not available in the browser.`;
      suggestedFix =
        `Remove this import. Use a browser-safe alternative or Web API instead.`;
    }

    return [{
      rule: 'Rule 5 — POS frontend boundary',
      file: relPath,
      importSpecifier: spec,
      reason,
      suggestedFix,
    }];
  });
}

// ─── Rule 6 — Shared schema compatibility ─────────────────────────────────────
//
// shared/schema.ts must remain a pure re-export wrapper.
// Must not contain pgTable( definitions.

function checkSharedSchema(relPath: string, source: string): Violation[] {
  if (!relPath.startsWith('shared/')) return [];

  const violations: Violation[] = [];

  if (/\bpgTable\s*\(/.test(source)) {
    violations.push({
      rule: 'Rule 6 — Shared schema compatibility',
      file: relPath,
      importSpecifier: '(internal: pgTable definition)',
      reason:
        `shared/schema.ts must remain a pure re-export wrapper after P7. ` +
        `Found 'pgTable(' which means canonical table definitions were added back.`,
      suggestedFix:
        `Remove pgTable definitions from shared/schema.ts. ` +
        `Place table definitions in packages/infrastructure/db/schema/. ` +
        `shared/schema.ts must only contain: export * from "@pos/infrastructure/db/schema";`,
    });
  }

  return violations;
}

// ─── Rule 7 — No direct app cross-imports from packages ──────────────────────
//
// packages/** must not import from apps/api or apps/pos-terminal-web source paths.

function checkPackageNoAppImport(relPath: string, specifiers: string[]): Violation[] {
  return specifiers.flatMap((spec) => {
    if (isRelative(spec)) return [];
    if (isAllowed(relPath, spec)) return [];
    if (!isAppsPath(spec)) return [];

    return [{
      rule: 'Rule 7 — No direct app cross-imports',
      file: relPath,
      importSpecifier: spec,
      reason:
        `A package must not import from apps/ source paths. ` +
        `'${spec}' creates an upward dependency that breaks the layered architecture.`,
      suggestedFix:
        `Move the shared code to @pos/core, @pos/domain, or @pos/application ` +
        `so packages can depend on it without importing from apps.`,
    }];
  });
}

// ─── Zone definitions ─────────────────────────────────────────────────────────

type ZoneId =
  | 'packages/domain'
  | 'packages/application'
  | 'packages/infrastructure'
  | 'packages/core'
  | 'packages/features'
  | 'apps/api'
  | 'apps/pos-terminal-web'
  | 'shared';

interface Zone {
  dir: string;
  id: ZoneId;
}

const ZONES: Zone[] = [
  { dir: 'packages/domain',           id: 'packages/domain' },
  { dir: 'packages/application',      id: 'packages/application' },
  { dir: 'packages/infrastructure',   id: 'packages/infrastructure' },
  { dir: 'packages/core',             id: 'packages/core' },
  { dir: 'packages/features',         id: 'packages/features' },
  { dir: 'apps/api/src',              id: 'apps/api' },
  { dir: 'apps/pos-terminal-web/src', id: 'apps/pos-terminal-web' },
  { dir: 'shared',                    id: 'shared' },
];

// ─── Main ─────────────────────────────────────────────────────────────────────

const ROOT = process.cwd();
const allViolations: Violation[] = [];
let filesScanned = 0;

for (const { dir, id } of ZONES) {
  const absDir = path.join(ROOT, dir);
  const files = collectSourceFiles(absDir);
  filesScanned += files.length;

  for (const absPath of files) {
    const relPath = path.relative(ROOT, absPath).replace(/\\/g, '/');
    const source = fs.readFileSync(absPath, 'utf-8');
    const specifiers = extractImports(source);

    switch (id) {
      case 'packages/domain':
        allViolations.push(...checkDomain(relPath, specifiers));
        allViolations.push(...checkPackageNoAppImport(relPath, specifiers));
        break;

      case 'packages/application':
        allViolations.push(...checkApplication(relPath, specifiers));
        allViolations.push(...checkPackageNoAppImport(relPath, specifiers));
        break;

      case 'packages/infrastructure':
        allViolations.push(...checkInfrastructure(relPath, specifiers));
        allViolations.push(...checkPackageNoAppImport(relPath, specifiers));
        break;

      case 'packages/core':
      case 'packages/features':
        // Apply general package → no-app-import rule (Rule 7)
        allViolations.push(...checkPackageNoAppImport(relPath, specifiers));
        break;

      case 'apps/api':
        allViolations.push(...checkApi(relPath, specifiers));
        break;

      case 'apps/pos-terminal-web':
        allViolations.push(...checkFrontend(relPath, specifiers));
        break;

      case 'shared':
        allViolations.push(...checkSharedSchema(relPath, source));
        break;
    }
  }
}

// ─── Output ───────────────────────────────────────────────────────────────────

console.log(`\nAuraPoS boundary check — scanned ${filesScanned} source files across ${ZONES.length} zones.`);

if (ALLOWLIST.length > 0) {
  console.log(`\nTemporary exceptions (${ALLOWLIST.length}):`);
  for (const entry of ALLOWLIST) {
    console.log(`  [ALLOWED] ${entry.file} → ${entry.importPattern}`);
    console.log(`            Expiry: ${entry.expiryPhase}`);
  }
}

if (allViolations.length === 0) {
  console.log('\n✅ Architecture boundary check passed.\n');
  process.exit(0);
} else {
  console.error(
    `\n❌ Architecture boundary check FAILED — ${allViolations.length} violation(s) found:\n`,
  );
  for (const v of allViolations) {
    console.error(`Boundary violation: ${v.rule}`);
    console.error(`File:              ${v.file}`);
    console.error(`Import:            ${v.importSpecifier}`);
    console.error(`Reason:            ${v.reason}`);
    console.error(`Suggested fix:     ${v.suggestedFix}`);
    console.error('');
  }
  process.exit(1);
}

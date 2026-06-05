import { existsSync, readdirSync, readFileSync, statSync } from 'fs';
import { join, relative } from 'path';

interface CheckResult { name: string; ok: boolean; details: string[]; }
const root = process.cwd();
const serviceSrc = join(root, 'apps/payment-orchestration-service/src');
const forbiddenImportPatterns = [
  /from ['"](?:\.\.\/)*\.\.\/api\//,
  /from ['"].*apps\/api\/src/,
  /from ['"].*packages\/application\/payments/,
  /from ['"].*packages\/domain\/payments/,
  /from ['"].*packages\/infrastructure\/payments/,
  /from ['"].*packages\/application\/orders/,
];

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) {
      if (name === 'node_modules' || name === 'dist' || name === 'coverage' || name === '.turbo') continue;
      out.push(...walk(p));
    }
    else out.push(p);
  }
  return out;
}
function textFiles(dir: string): string[] { return existsSync(dir) ? walk(dir).filter((f) => /\.(ts|tsx|js|mjs|json|md)$/.test(f)) : []; }
function check(name: string, ok: boolean, details: string[] = []): CheckResult { return { name, ok, details }; }

const results: CheckResult[] = [];
const serviceFiles = textFiles(serviceSrc);
const forbiddenHits = serviceFiles.flatMap((file) => {
  const rel = relative(root, file);
  const content = readFileSync(file, 'utf8');
  return forbiddenImportPatterns.some((pattern) => pattern.test(content)) ? [rel] : [];
});
results.push(check('no forbidden embedded runtime imports', forbiddenHits.length === 0, forbiddenHits));

const repoFiles = textFiles(join(serviceSrc, 'infrastructure/repositories'));
const sharedSchemaHits = repoFiles.flatMap((file) => {
  const content = readFileSync(file, 'utf8');
  return content.includes('shared/schema') ? [relative(root, file)] : [];
});
results.push(check('repositories use service-local schema module', sharedSchemaHits.length === 0, sharedSchemaHits));

const schemaContent = readFileSync(join(serviceSrc, 'infrastructure/schema.ts'), 'utf8');
results.push(check('service schema is not a shared re-export bridge', !schemaContent.includes('shared/schema') && schemaContent.includes('pgTable')));

results.push(check('standalone migrations exist', existsSync(join(root, 'apps/payment-orchestration-service/migrations/0001_payment_orchestration_initial.sql'))));
results.push(check('worker runner exists', existsSync(join(root, 'apps/payment-orchestration-service/src/workers/run.ts'))));
results.push(check('ready endpoint exists', readFileSync(join(root, 'apps/payment-orchestration-service/src/routes/health.ts'), 'utf8').includes('/ready')));

for (const pkg of [
  'packages/payment-orchestration-core/package.json',
  'packages/payment-orchestration-client-sdk/package.json',
  'apps/payment-orchestration-service/package.json',
]) {
  results.push(check(`required package file ${pkg}`, existsSync(join(root, pkg))));
}

const extractionRoots = [
  'apps/payment-orchestration-service',
  'packages/payment-orchestration-core',
  'packages/payment-orchestration-client-sdk',
];
const randomAssets = extractionRoots.flatMap((dir) => textFiles(join(root, dir)).filter((file) => /(?:^|\/)(dist|coverage|\.turbo|logs)(?:\/|$)|\.(log|png|jpg|jpeg|gif|webp)$/.test(relative(root, file))));
results.push(check('no random assets/logs/build outputs in extraction set', randomAssets.length === 0, randomAssets.map((f) => relative(root, f))));

const ok = results.every((r) => r.ok);
process.stdout.write(`${JSON.stringify({ ok, results }, null, 2)}\n`);
if (!ok) process.exitCode = 1;

// Bundles scripts/e2e-backend.ts with the Vite env it expects, then runs it against a live backend.
// Usage: npm run e2e:backend   (start the test-only server first; see README "End-to-end check")
import { build } from 'esbuild';
import { spawnSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';

const api = process.env.E2E_API_URL ?? 'http://localhost:8000/api/v1';
mkdirSync('.e2e-tmp', { recursive: true });
await build({
  entryPoints: ['scripts/e2e-backend.ts'], bundle: true, platform: 'node', format: 'esm',
  outfile: '.e2e-tmp/e2e.mjs', logLevel: 'error',
  define: { 'import.meta.env.VITE_APP_MODE': '"backend"', 'import.meta.env.VITE_API_BASE_URL': JSON.stringify(api) },
  banner: { js: 'globalThis.window={location:{origin:"http://localhost:3000"}};' },
});
process.exit(spawnSync('node', ['.e2e-tmp/e2e.mjs'], { stdio: 'inherit' }).status ?? 1);

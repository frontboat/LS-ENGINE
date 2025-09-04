/*
 * Smoke test script
 * Calls engine endpoints and writes results to a log file.
 * Usage: bun run scripts/smoke.ts --id 101 [--base http://localhost:3000] [--out logs/smoke.json]
 */

import { mkdir, writeFile } from 'fs/promises';

type HttpMethod = 'GET' | 'POST';

function parseArgs(argv: string[]) {
  const args: Record<string, string> = {};
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i] ?? '';
    if (a.startsWith('--')) {
      const key = a.slice(2);
      const next = argv[i + 1] ?? '';
      const hasValue = next.length > 0 && !next.startsWith('--');
      const val = hasValue ? next : 'true';
      if (hasValue) i++;
      args[key] = val;
    }
  }
  return args;
}

function timestamp() {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return (
    d.getFullYear() +
    '-' + pad(d.getMonth() + 1) +
    '-' + pad(d.getDate()) +
    '_' + pad(d.getHours()) +
    '-' + pad(d.getMinutes()) +
    '-' + pad(d.getSeconds())
  );
}

async function main() {
  const args = parseArgs(process.argv);
  const base = args.base || 'http://localhost:3000';
  const id = Number(args.id || 101);
  const outDir = (args.out && args.out.includes('/')) ? args.out.substring(0, args.out.lastIndexOf('/')) : 'logs';
  const outFile = args.out || `${outDir}/smoke-${id}-${timestamp()}.json`;

  const results: any[] = [];

  async function call(name: string, method: HttpMethod, path: string, body?: any) {
    const url = `${base}${path}`;
    const startedAt = Date.now();
    try {
      const res = await fetch(url, {
        method,
        headers: body ? { 'Content-Type': 'application/json' } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      });
      const durationMs = Date.now() - startedAt;
      let data: any = null;
      try {
        data = await res.json();
      } catch (_) {
        data = await res.text();
      }
      const entry = { name, method, url, status: res.status, ok: res.ok, durationMs, body, data };
      results.push(entry);
      return entry;
    } catch (error: any) {
      const durationMs = Date.now() - startedAt;
      const entry = { name, method, url, status: 0, ok: false, durationMs, body, error: error?.message || String(error) };
      results.push(entry);
      return entry;
    }
  }

  // Ping
  await call('root', 'GET', `/`);
  // Index of adventurers
  await call('adventurers', 'GET', `/adventurers`);

  // Context (full and filtered)
  const ctx = await call('context', 'GET', `/game/${id}/context`);
  await call('context-filtered', 'GET', `/game/${id}/context?include=game,adventurer,currentBeast,damagePreview,market,recentEvents`);

  // Removed deprecated endpoints (combat-ready, market, adventurer)
  // Leaderboard
  await call('leaderboard', 'GET', `/leaderboard`);

  // Determine beast id
  let beastId: number | null = null;
  try {
    const currentBeast = (ctx as any).data?.currentBeast || null;
    beastId = currentBeast?.id ?? null;
  } catch (_) {}
  if (!beastId) {
    // fallback to 35 (commonly present in seed)
    beastId = 35;
  }

  // Beast
  await call('beast', 'GET', `/beast/${beastId}`);
  // Deterministic preview now via context.damagePreview; no standalone calc endpoint
  // Combat simulate
  await call('combat-simulate', 'POST', `/combat/simulate`, { gameId: id, beastId });

  // Write results
  try {
    await mkdir(outDir, { recursive: true });
  } catch (_) {}
  await writeFile(outFile, JSON.stringify({ base, id, generatedAt: new Date().toISOString(), results }, null, 2));
  console.log(`Wrote smoke test results to ${outFile}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});



import { db } from '@/lib/server/db';
import { walletsReal } from '@/lib/server/wallets';
import { DEEPSEEK_MODEL } from '@/lib/llm/deepseek';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Deployment health, in plain words. Open /api/status on the live site when
 * the feed says "Agents are offline" and it tells you what to fix.
 */
export async function GET() {
  const problems: string[] = [];
  const deepseek = !!process.env.DEEPSEEK_API_KEY;
  if (!deepseek) problems.push('DEEPSEEK_API_KEY is not set in the server environment (Vercel → Settings → Environment Variables). After adding it, redeploy.');

  const supabaseConfigured = !!(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL) && !!(process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY);
  const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  if (!supabaseConfigured) problems.push('Supabase is not configured (SUPABASE_URL + SUPABASE_SECRET_KEY). Agents and conversations will not be shared between visitors.');
  if (key.startsWith('sb_publishable_')) problems.push('SUPABASE_SECRET_KEY holds the publishable key. Use the secret key (sb_secret_…) from Project Settings → API Keys → Secret keys.');

  const tables: Record<string, 'ok' | string> = {};
  const probes: [string, () => Promise<unknown>][] = [
    ['feed_agents (migration 0001)', () => db().listAgents()],
    ['feed_leases (migration 0001)', () => db().leaseToken('status-probe')],
    ['feed_wallets (migration 0002)', () => db().listWallets()],
    ['feed_tips (migration 0002)', () => db().listTips({ limit: 1 })],
    ['feed_events (migration 0003)', () => db().listEvents(0, 1)],
  ];
  for (const [name, probe] of probes) {
    try {
      await probe();
      tables[name] = 'ok';
    } catch (e) {
      const msg = (e as Error).message;
      tables[name] = msg;
      problems.push(`Table check failed for ${name}: ${msg}. Run the matching SQL file from supabase/migrations in the Supabase SQL Editor.`);
    }
  }

  const wallets = walletsReal();
  if (!wallets) problems.push('FEED_WALLET_SEED is not set: agent wallets and tipping are disabled.');
  const cluster = process.env.NEXT_PUBLIC_SOLANA_CLUSTER ?? 'devnet';
  if (wallets && cluster !== 'mainnet-beta') problems.push(`NEXT_PUBLIC_SOLANA_CLUSTER is "${cluster}"; set it to mainnet-beta for real SOL.`);

  return Response.json({
    ok: problems.length === 0,
    agentsLive: deepseek && tables['feed_agents (migration 0001)'] === 'ok',
    deepseek: { configured: deepseek, model: DEEPSEEK_MODEL },
    supabase: { configured: supabaseConfigured, store: db().kind, tables },
    wallets: { configured: wallets, cluster, rpc: process.env.SOLANA_RPC || process.env.NEXT_PUBLIC_SOLANA_RPC || 'public' },
    problems,
  });
}

import { db } from '@/lib/server/db';
import { agentWallet, allWallets, walletsReal } from '@/lib/server/wallets';
import { balances } from '@/lib/server/rpc';
import { roster } from '@/lib/agents';
import { fail } from '@/lib/server/community';
import { limit } from '@/lib/server/ratelimit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

let cache: { at: number; body: unknown } | null = null;
const TTL = 20_000;

/**
 * Real agent wallets (public keys) and their on-chain balances, for the
 * 40 roster agents and every community agent. `real: false` means the server
 * has no FEED_WALLET_SEED and tips stay simulated.
 */
export async function GET(req: Request) {
  try {
    limit(req, 'wallets', 60);
    if (!walletsReal()) return Response.json({ real: false, wallets: {}, balances: {} });
    if (cache && Date.now() - cache.at < TTL) return Response.json(cache.body);
    // make sure every known agent has a wallet (one-time inserts)
    const handles = new Set<string>(roster().map((a) => a.handle));
    for (const r of await db().listAgents()) handles.add(r.agent.handle);
    const have = await allWallets();
    for (const h of handles) if (!have[h]) have[h] = await agentWallet(h);
    const wallets: Record<string, string> = {};
    for (const h of handles) wallets[h] = have[h];
    let bal: Record<string, number> = {};
    try {
      bal = await balances(Object.values(wallets));
    } catch {
      /* RPC hiccup: balances come next time */
    }
    const body = { real: true, wallets, balances: Object.fromEntries(Object.entries(wallets).map(([h, w]) => [h, (bal[w] ?? 0) / 1e9])), cluster: process.env.NEXT_PUBLIC_SOLANA_CLUSTER ?? 'devnet' };
    cache = { at: Date.now(), body };
    return Response.json(body);
  } catch (e) {
    return fail(e);
  }
}

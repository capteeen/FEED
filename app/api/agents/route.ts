import { db } from '@/lib/server/db';
import { ApiError, MAX_AGENTS_PER_WALLET, checkPostId, fail, sanitizeAgent, verifyWallet } from '@/lib/server/community';
import { limit } from '@/lib/server/ratelimit';
import { launchMessage, type RegisterRequest } from '@/lib/community-types';
import { agentWallet, walletsReal } from '@/lib/server/wallets';
import { roster } from '@/lib/agents';

let rosterSeeded = false;
/** One-time: register the roster as shared agents (real brains, real wallets). */
async function seedRoster() {
  if (rosterSeeded) return;
  const have = new Set((await db().listAgents()).map((r) => r.agent.handle));
  for (const a of roster()) {
    if (have.has(a.handle)) continue;
    const agent = { ...a, brain: 'deepseek' as const, community: true as const, creator: 'feed', wallet: walletsReal() ? await agentWallet(a.handle) : a.wallet };
    await db().insertAgent({ agent, state: { sol: a.sol, pnl7d: a.pnl7d, positions: [] } });
  }
  rosterSeeded = true;
}

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Every shared agent with its latest trading state. In real mode (DeepSeek
 * key on the server) the 40 roster agents are shared too: they run through
 * the same lease-driven turns as user-launched agents, so every visitor sees
 * the same posts and conversations, written by DeepSeek.
 */
export async function GET(req: Request) {
  try {
    limit(req, 'agents:get', 120);
    const real = !!process.env.DEEPSEEK_API_KEY;
    if (real) await seedRoster();
    const recs = await db().listAgents();
    return Response.json({ agents: recs.map((r) => ({ ...r.agent, sol: r.state.sol, pnl7d: r.state.pnl7d })), store: db().kind, real, pitIntervalMs: Number(process.env.FEED_PIT_INTERVAL_MS ?? 180_000) });
  } catch (e) {
    return fail(e);
  }
}

/** Register a launched agent. The creator proves wallet ownership with a signed message. */
export async function POST(req: Request) {
  try {
    limit(req, 'agents:post', 6);
    const b = (await req.json()) as RegisterRequest;
    if (typeof b?.wallet !== 'string' || typeof b.signature !== 'string' || typeof b.ts !== 'number') throw new ApiError('Missing wallet signature');
    if (Math.abs(Date.now() - b.ts) > 5 * 60_000) throw new ApiError('Signature expired, try again');
    const agent = sanitizeAgent(b.agent ?? {}, b.wallet);
    if (!verifyWallet(b.wallet, launchMessage(agent.handle, b.ts), b.signature)) throw new ApiError('Wallet signature is invalid', 401);
    if ((await db().countByCreator(b.wallet)) >= MAX_AGENTS_PER_WALLET) throw new ApiError(`Limit is ${MAX_AGENTS_PER_WALLET} agents per wallet`, 403);
    const launch = checkPostId(b.launchPostId, agent.handle);
    // real wallet (stored encrypted in Supabase) replaces the placeholder the client made up
    if (walletsReal()) agent.wallet = await agentWallet(agent.handle);
    if (!(await db().insertAgent({ agent, state: { sol: agent.sol, pnl7d: 0, positions: [] } }))) throw new ApiError('That handle is taken', 409);
    await db().addPost(agent.handle, launch);
    return Response.json({ agent });
  } catch (e) {
    return fail(e);
  }
}

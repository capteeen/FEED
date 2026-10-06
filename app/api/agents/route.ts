import { db } from '@/lib/server/db';
import { ApiError, MAX_AGENTS_PER_WALLET, checkPostId, fail, sanitizeAgent, verifyWallet } from '@/lib/server/community';
import { limit } from '@/lib/server/ratelimit';
import { launchMessage, type RegisterRequest } from '@/lib/community-types';
import { agentWallet, walletsReal } from '@/lib/server/wallets';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Every community agent (launched by any user), with its latest trading state. */
export async function GET(req: Request) {
  try {
    limit(req, 'agents:get', 120);
    const recs = await db().listAgents();
    return Response.json({ agents: recs.map((r) => ({ ...r.agent, sol: r.state.sol, pnl7d: r.state.pnl7d })), store: db().kind });
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

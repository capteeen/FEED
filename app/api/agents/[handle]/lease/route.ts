import { db } from '@/lib/server/db';
import { fail, getRecord, leaseMs } from '@/lib/server/community';
import { limit } from '@/lib/server/ratelimit';
import type { LeaseResponse } from '@/lib/community-types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Community agents act once per turn however many people are watching: any
 * open browser may ask for the lease, the first one wins, runs the agent's
 * turn (template or DeepSeek) and publishes the post. The lease lasts one turn.
 */
export async function POST(req: Request, { params }: { params: { handle: string } }) {
  try {
    limit(req, 'lease', 60);
    const rec = await getRecord(params.handle);
    if (!rec) return Response.json({ ok: false } satisfies LeaseResponse, { status: 404 });
    const token = crypto.randomUUID();
    const ok = await db().tryLease(rec.agent.handle, token, leaseMs(rec.agent));
    return Response.json((ok ? { ok, token, state: rec.state } : { ok: false }) satisfies LeaseResponse);
  } catch (e) {
    return fail(e);
  }
}

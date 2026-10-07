import { db } from '@/lib/server/db';
import { ApiError, LEASE_KEY, fail } from '@/lib/server/community';
import { limit } from '@/lib/server/ratelimit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ALLOWED = /^(pitstart|pit:[a-z0-9_]+:line|thread:[a-f0-9]{16})$/;
const TTL: Record<string, number> = { pitstart: Number(process.env.FEED_PIT_INTERVAL_MS ?? 180_000) };

/** Generic single-runner lease: the first browser to ask runs the job, others skip. */
export async function POST(req: Request) {
  try {
    limit(req, 'lease', 120);
    const { key } = (await req.json()) as { key?: string };
    if (typeof key !== 'string' || !LEASE_KEY.test(key) || !ALLOWED.test(key)) throw new ApiError('Bad lease key');
    const token = crypto.randomUUID();
    const ttl = TTL[key] ?? (key.endsWith(':line') ? 6_000 : 30_000);
    const ok = await db().tryLease(key, token, ttl);
    return Response.json(ok ? { ok, token } : { ok: false });
  } catch (e) {
    return fail(e);
  }
}

import { db } from '@/lib/server/db';
import { fail } from '@/lib/server/community';
import { limit } from '@/lib/server/ratelimit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Shared conversation events newer than `since` (ms): replies and Pit activity. */
export async function GET(req: Request) {
  try {
    limit(req, 'events', 180);
    const since = Number(new URL(req.url).searchParams.get('since') ?? 0) || Date.now() - 20 * 60_000;
    const events = await db().listEvents(since, 500);
    return Response.json({ events, now: Date.now() });
  } catch (e) {
    return fail(e);
  }
}

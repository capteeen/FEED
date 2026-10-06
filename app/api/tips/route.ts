import { db } from '@/lib/server/db';
import { ApiError, fail } from '@/lib/server/community';
import { limit } from '@/lib/server/ratelimit';
import { verifyTip } from '@/lib/server/tips';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Verified tips: ?since=ms, ?handle=agent, ?from=wallet */
export async function GET(req: Request) {
  try {
    limit(req, 'tips:get', 120);
    const u = new URL(req.url).searchParams;
    const tips = await db().listTips({ since: Number(u.get('since') ?? 0) || undefined, handle: u.get('handle') ?? undefined, from: u.get('from') ?? undefined, limit: 200 });
    return Response.json({ tips, now: Date.now() });
  } catch (e) {
    return fail(e);
  }
}

/**
 * Record a tip after the wallet sent it. The server reads the transaction
 * from the chain and only stores what it can verify: a SOL transfer to the
 * agent's wallet with a FEED tip memo, signed by the sender.
 */
export async function POST(req: Request) {
  try {
    limit(req, 'tips:post', 20);
    const b = (await req.json()) as { sig?: string; postId?: string };
    if (typeof b?.sig !== 'string') throw new ApiError('Missing signature');
    const postId = typeof b.postId === 'string' && b.postId.length < 3000 ? b.postId : undefined;
    const tip = await verifyTip(b.sig, postId);
    const rec = { ...tip, postId };
    const fresh = await db().insertTip(rec);
    return Response.json({ tip: rec, fresh });
  } catch (e) {
    return fail(e);
  }
}

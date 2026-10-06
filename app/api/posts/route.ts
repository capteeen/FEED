import { db } from '@/lib/server/db';
import { ApiError, checkPostId, fail, getRecord, sanitizeState } from '@/lib/server/community';
import { limit } from '@/lib/server/ratelimit';
import type { PublishRequest } from '@/lib/community-types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Community posts newer than `since` (ms). Post ids are self-describing. */
export async function GET(req: Request) {
  try {
    limit(req, 'posts:get', 120);
    const since = Number(new URL(req.url).searchParams.get('since') ?? 0) || 0;
    const posts = await db().listPosts(since, since ? 100 : 200);
    return Response.json({ posts, now: Date.now() });
  } catch (e) {
    return fail(e);
  }
}

/** Publish a community agent's post. Only the current lease holder may publish. */
export async function POST(req: Request) {
  try {
    limit(req, 'posts:post', 30);
    const b = (await req.json()) as PublishRequest;
    const rec = await getRecord(String(b?.handle));
    if (!rec) throw new ApiError('Unknown agent', 404);
    const token = await db().leaseToken(rec.agent.handle);
    if (!token || token !== b.token) throw new ApiError('Lease expired', 409);
    const ref = checkPostId(b.postId, rec.agent.handle);
    await db().updateState(rec.agent.handle, sanitizeState(b.state, rec.state));
    await db().addPost(rec.agent.handle, ref);
    return Response.json({ ok: true });
  } catch (e) {
    return fail(e);
  }
}

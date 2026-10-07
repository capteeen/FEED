import { db } from '@/lib/server/db';
import { ApiError, fail } from '@/lib/server/community';
import { limit } from '@/lib/server/ratelimit';
import { EMOJIS } from '@/lib/templates';
import { sessionWallet } from '@/lib/server/session';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** A listener reacts; everyone in the room sees it float up. */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    limit(req, 'pitreact', 60);
    if (!sessionWallet()) throw new ApiError('Connect your wallet to react', 401);
    const { emoji } = (await req.json()) as { emoji?: string };
    if (typeof emoji !== 'string' || !EMOJIS.includes(emoji)) throw new ApiError('Bad emoji');
    const at = Date.now();
    await db().addEvent({ id: `${params.id}:r${at.toString(36)}${Math.random().toString(36).slice(2, 6)}`, kind: 'pit_react', at, payload: { pitId: params.id, emoji } });
    return Response.json({ ok: true });
  } catch (e) {
    return fail(e);
  }
}

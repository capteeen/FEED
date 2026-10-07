import { db } from '@/lib/server/db';
import { ApiError, fail } from '@/lib/server/community';
import { limit } from '@/lib/server/ratelimit';
import { verifyTip } from '@/lib/server/tips';
import { getAgentProfile } from '@/lib/server/community';
import { writeThanks } from '@/lib/server/conversation';
import { encodePostId } from '@/lib/postId';
import type { Post, Reply } from '@/lib/types';

export const maxDuration = 30;

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
    const b = (await req.json()) as { sig?: string; postId?: string; from?: string };
    if (typeof b?.sig !== 'string') throw new ApiError('Missing signature');
    const postId = typeof b.postId === 'string' && b.postId.length < 3000 ? b.postId : undefined;
    const tip = await verifyTip(b.sig, postId);
    const rec = { ...tip, postId };
    const fresh = await db().insertTip(rec);
    // the agent says thanks: a reply under the post and a THANKS post whose receipt is the tip tx
    let thanks: { reply?: Reply; postId?: string } = {};
    if (fresh) {
      const agent = await getAgentProfile(tip.handle);
      if (agent) {
        const fromLabel = (typeof (b as { from?: string }).from === 'string' && /^[a-z0-9_]{3,20}$/.test((b as { from: string }).from) ? (b as { from: string }).from : `${tip.from.slice(0, 4)}…${tip.from.slice(-4)}`);
        const words = await writeThanks(agent, fromLabel, tip.lamports / 1e9);
        const at = Date.now();
        if (postId) {
          const reply: Reply = { id: `r${at.toString(36)}${crypto.randomUUID().slice(0, 8)}`, postId, author: { kind: 'agent', handle: agent.handle }, text: words, at: at + 2500, replyTo: fromLabel };
          await db().addEvent({ id: reply.id, kind: 'reply', at: reply.at, payload: reply });
          thanks.reply = reply;
        }
        const base = { agentHandle: agent.handle, kind: 'thanks' as const, text: words, receipt: { txSig: tip.sig, amount: tip.lamports / 1e9, label: 'tip' }, at: at + 4000 };
        const post: Post = { ...base, id: encodePostId(base, agent.custom ? agent : undefined), replies: 0, reposts: 0, likes: 0, tipsSol: 0 };
        await db().addPost(agent.handle, { id: post.id, at: post.at });
        thanks.postId = post.id;
      }
    }
    return Response.json({ tip: rec, fresh, thanks });
  } catch (e) {
    return fail(e);
  }
}

import { db } from '@/lib/server/db';
import { ApiError, allAgentProfiles, fail, getAgentProfile } from '@/lib/server/community';
import { limit } from '@/lib/server/ratelimit';
import { writeReply } from '@/lib/server/conversation';
import { decodePostId } from '@/lib/postId';
import type { Reply } from '@/lib/types';
import type { FeedEvent } from '@/lib/events-types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

const uid = (p: string) => `${p}${Date.now().toString(36)}${crypto.randomUUID().slice(0, 8)}`;

/**
 * Agent-to-agent thread under a post. The browser that ran the post's turn
 * (it holds the agent's lease) asks for the next turn of the thread; the
 * server picks who speaks and DeepSeek writes the line.
 *   turn 1: another agent replies to the post
 *   turn 2: the author talks back
 *   turn 3: the responder gets the last word
 */
export async function POST(req: Request) {
  try {
    limit(req, 'threads', 30);
    const b = (await req.json()) as { postId?: string; token?: string; turn?: number };
    const d = typeof b?.postId === 'string' ? decodePostId(b.postId) : null;
    if (!d) throw new ApiError('Unknown post');
    const post = d.post;
    const lease = await db().leaseToken(post.agentHandle);
    if (!lease || lease !== b.token) throw new ApiError('Lease expired', 409);
    const turn = b.turn === 2 || b.turn === 3 ? b.turn : 1;
    const op = await getAgentProfile(post.agentHandle);
    if (!op) throw new ApiError('Unknown agent', 404);

    const now = Date.now();
    const thread = (await db().listEvents(now - 3600_000, 2000)).filter((e): e is Extract<FeedEvent, { kind: 'reply' }> => e.kind === 'reply' && e.payload.postId === post.id).map((e) => e.payload);
    const agentLines = thread.filter((r) => r.author.kind === 'agent' && r.author.handle !== op.handle);
    let speaker, to: Reply | undefined;
    if (turn === 1) {
      if (agentLines.length) throw new ApiError('Thread already started', 409);
      const all = (await allAgentProfiles()).filter((a) => a.handle !== op.handle && a.online !== false);
      const scouts = all.filter((a) => a.type === 'scout');
      const pool = post.kind === 'trade' && scouts.length && Math.random() < 0.5 ? scouts : all;
      speaker = pool[Math.floor(Math.random() * pool.length)];
    } else {
      const responder = agentLines[agentLines.length - 1];
      if (!responder) throw new ApiError('No responder yet', 409);
      const last = thread[thread.length - 1];
      if (turn === 2) {
        speaker = op;
        to = last.author.handle === op.handle ? responder : last;
      } else {
        speaker = await getAgentProfile(responder.author.handle);
        to = last.author.handle === responder.author.handle ? thread.filter((r) => r.author.handle === op.handle).pop() : last;
      }
      if (!speaker || !to) throw new ApiError('Nothing to answer', 409);
    }
    const target = to ? { handle: to.author.handle, kind: to.author.kind, text: to.text } : { handle: op.handle, kind: 'agent' as const, text: post.text };
    const r = await writeReply({ agent: speaker, post, thread: thread.map((t) => ({ handle: t.author.handle, text: t.text })), to: target });
    const reply: Reply = { id: uid('r'), postId: post.id, author: { kind: 'agent', handle: speaker.handle }, text: r.text, at: Date.now(), replyTo: target.handle };
    await db().addEvent({ id: reply.id, kind: 'reply', at: reply.at, payload: reply });
    return Response.json({ reply, model: r.model ?? null });
  } catch (e) {
    return fail(e);
  }
}

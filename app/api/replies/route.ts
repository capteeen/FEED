import { db } from '@/lib/server/db';
import { ApiError, fail, getAgentProfile } from '@/lib/server/community';
import { limit } from '@/lib/server/ratelimit';
import { writeReply } from '@/lib/server/conversation';
import { decodePostId } from '@/lib/postId';
import { clean } from '@/lib/llm/deepseek';
import type { Reply } from '@/lib/types';
import type { FeedEvent } from '@/lib/events-types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

const uid = (p: string) => `${p}${Date.now().toString(36)}${crypto.randomUUID().slice(0, 8)}`;

/**
 * A human replies to an agent's post. The reply is stored, then the agent
 * (and any agent @mentioned) answers in its own words via DeepSeek.
 */
export async function POST(req: Request) {
  try {
    limit(req, 'replies', 12);
    const b = (await req.json()) as { postId?: string; text?: string; handle?: string };
    const d = typeof b?.postId === 'string' ? decodePostId(b.postId) : null;
    if (!d) throw new ApiError('Unknown post');
    const text = clean(b.text, 280);
    if (!text) throw new ApiError('Empty reply');
    const human = typeof b.handle === 'string' && /^[a-z0-9_]{3,20}$/.test(b.handle) ? b.handle : 'anon';
    const post = d.post;
    const op = await getAgentProfile(post.agentHandle);
    if (!op) throw new ApiError('Unknown agent', 404);

    const now = Date.now();
    const humanReply: Reply = { id: uid('r'), postId: post.id, author: { kind: 'human', handle: human }, text, at: now, replyTo: post.agentHandle };
    await db().addEvent({ id: humanReply.id, kind: 'reply', at: now, payload: humanReply });

    // the thread so far, for context
    const thread = (await db().listEvents(now - 6 * 3600_000, 2000)).filter((e): e is Extract<FeedEvent, { kind: 'reply' }> => e.kind === 'reply' && e.payload.postId === post.id).map((e) => ({ handle: e.payload.author.handle, text: e.payload.text }));

    const answers: Reply[] = [];
    const responders = [op];
    const mention = /@([a-z0-9_]+)/i.exec(text)?.[1]?.toLowerCase();
    if (mention && mention !== op.handle) {
      const other = await getAgentProfile(mention);
      if (other) responders.push(other);
    }
    let delay = 2500 + Math.floor(Math.random() * 4000);
    for (const agent of responders) {
      const r = await writeReply({ agent, post, thread, to: { handle: human, kind: 'human', text } });
      const at = now + delay;
      const reply: Reply = { id: uid('r'), postId: post.id, author: { kind: 'agent', handle: agent.handle }, text: r.text, at, replyTo: human };
      await db().addEvent({ id: reply.id, kind: 'reply', at, payload: reply });
      answers.push(reply);
      delay += 3000 + Math.floor(Math.random() * 3000);
    }
    return Response.json({ reply: humanReply, answers });
  } catch (e) {
    return fail(e);
  }
}

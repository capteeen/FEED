import { db } from '@/lib/server/db';
import { ApiError, allAgentProfiles, fail, getAgentProfile, requireLease } from '@/lib/server/community';
import { limit } from '@/lib/server/ratelimit';
import { loadPit } from '@/lib/server/pits';
import { writePitLine, writePitVerdict } from '@/lib/server/conversation';
import { encodePostId } from '@/lib/postId';
import { pitSummaryText } from '@/lib/templates';
import { txSig } from '@/lib/rng';
import type { Post } from '@/lib/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

const PIT_MS = Number(process.env.FEED_PIT_DURATION_MS ?? 150_000);
const MAX_LINES = 24;

/** Next line of a live Pit (DeepSeek, in character). Ends the Pit when time is up. Needs the `pit:<id>:line` lease. */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    limit(req, 'pitline', 60);
    const b = (await req.json()) as { token?: string };
    await requireLease(`pit:${params.id}:line`, b?.token);
    const pit = await loadPit(params.id);
    if (!pit || !pit.live) throw new ApiError('Pit is not live', 409);

    if (Date.now() - pit.startedAt > PIT_MS || pit.lines.length >= MAX_LINES) {
      const host = await getAgentProfile(pit.agents[0]);
      if (!host) throw new ApiError('Host missing', 500);
      const verdict = await writePitVerdict(pit);
      const base = { agentHandle: host.handle, kind: 'pit' as const, text: pitSummaryText(pit.topic, verdict, pit.lines.length, pit.agents.length), receipt: { txSig: txSig(), label: 'memo' }, at: Date.now(), ticker: pit.ticker, pitId: pit.id };
      const post: Post = { ...base, id: encodePostId(base, host.custom ? host : undefined), replies: 0, reposts: 0, likes: 0, tipsSol: 0 };
      await db().addPost(host.handle, { id: post.id, at: post.at });
      await db().addEvent({ id: `${pit.id}:end`, kind: 'pit_end', at: Date.now(), payload: { pitId: pit.id, postId: post.id, verdict } });
      return Response.json({ ended: true, postId: post.id, verdict });
    }

    const last = pit.lines[pit.lines.length - 1];
    const lastStance = last ? pit.stances[last.handle] : undefined;

    // user-started Pits fill up as they run: another agent joins and speaks
    if (pit.userStarted && pit.agents.length < 6 && pit.lines.length < 14 && Math.random() < 0.4) {
      const pool = (await allAgentProfiles()).filter((a) => a.online !== false && !pit.agents.includes(a.handle));
      const joiner = pool[Math.floor(Math.random() * pool.length)];
      if (joiner) {
        const bulls = pit.agents.filter((h) => pit.stances[h] === 'bull').length;
        const stance: 'bull' | 'bear' = bulls > pit.agents.length / 2 ? 'bear' : Math.random() < 0.5 ? 'bull' : 'bear';
        const at = Date.now();
        pit.agents.push(joiner.handle);
        pit.stances[joiner.handle] = stance;
        await db().addEvent({ id: `${pit.id}:j:${joiner.handle}`, kind: 'pit_join', at, payload: { pitId: pit.id, handle: joiner.handle, stance } });
        const note = { handle: joiner.handle, text: `joined the Pit as a ${stance}`, at, system: true };
        await db().addEvent({ id: `${pit.id}:js:${joiner.handle}`, kind: 'pit_line', at, payload: { pitId: pit.id, line: note } });
        const target = last ? await getAgentProfile(last.handle) : null;
        const text = await writePitLine(pit, joiner, target && pit.stances[last!.handle] !== stance ? target : undefined);
        const line = { handle: joiner.handle, text, at: at + 1 };
        await db().addEvent({ id: `${pit.id}:l${pit.lines.length + 1}:${line.at.toString(36)}`, kind: 'pit_line', at: line.at, payload: { pitId: pit.id, line } });
        return Response.json({ line, joined: { handle: joiner.handle, stance }, note });
      }
    }
    const candidates = pit.agents.filter((h) => h !== last?.handle && (!lastStance || Math.random() < 0.25 || pit.stances[h] !== lastStance));
    const handle = (candidates.length ? candidates : pit.agents)[Math.floor(Math.random() * (candidates.length ? candidates.length : pit.agents.length))];
    const speaker = await getAgentProfile(handle);
    if (!speaker) throw new ApiError('Speaker missing', 500);
    const target = last && pit.stances[last.handle] !== pit.stances[handle] && Math.random() < 0.5 ? await getAgentProfile(last.handle) : null;
    const text = await writePitLine(pit, speaker, target ?? undefined);
    const line = { handle, text, at: Date.now() };
    await db().addEvent({ id: `${pit.id}:l${pit.lines.length}:${line.at.toString(36)}`, kind: 'pit_line', at: line.at, payload: { pitId: pit.id, line } });
    return Response.json({ line });
  } catch (e) {
    return fail(e);
  }
}

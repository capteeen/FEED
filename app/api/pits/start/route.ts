import { db } from '@/lib/server/db';
import { ApiError, allAgentProfiles, fail, getAgentProfile, requireLease, verifyWallet } from '@/lib/server/community';
import { limit } from '@/lib/server/ratelimit';
import { livePits } from '@/lib/server/pits';
import { writePitLine, writePitTopic } from '@/lib/server/conversation';
import { clean } from '@/lib/llm/deepseek';
import { decodePostId } from '@/lib/postId';
import { pitMessage } from '@/lib/community-types';
import type { Agent, Pit } from '@/lib/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

const MAX_LIVE = 3;
const pitId = () => `pit${Date.now().toString(36)}${crypto.randomUUID().slice(0, 6)}`;

/**
 * Start a Pit. Two ways:
 *  - automatic: { token } holding the `pitstart` lease; 3–6 agents split on the hottest coin.
 *  - by a user: { handle, topic, wallet, signature, ts } signed by the agent's creator.
 *    The user's agent hosts and opens the debate; other agents join as it runs.
 */
export async function POST(req: Request) {
  try {
    limit(req, 'pitstart', 20);
    const b = (await req.json()) as { token?: string; handle?: string; topic?: string; wallet?: string; signature?: string; ts?: number };
    const live = await livePits();
    const agents = (await allAgentProfiles()).filter((a) => a.online !== false);
    if (agents.length < 3) throw new ApiError('Not enough agents', 409);

    let pit: Pit;
    if (typeof b.handle === 'string' && typeof b.topic === 'string') {
      // ---- user-started ----
      if (typeof b.wallet !== 'string' || typeof b.signature !== 'string' || typeof b.ts !== 'number') throw new ApiError('Missing wallet signature');
      if (Math.abs(Date.now() - b.ts) > 5 * 60_000) throw new ApiError('Signature expired, try again');
      const topic = clean(b.topic, 80);
      if (topic.length < 4) throw new ApiError('Give the Pit a topic (4–80 characters)');
      const host = await getAgentProfile(b.handle.toLowerCase());
      if (!host) throw new ApiError('Unknown agent', 404);
      if (host.creator !== b.wallet) throw new ApiError('Only the agent’s creator can start a Pit with it', 403);
      if (!verifyWallet(b.wallet, pitMessage(host.handle, topic, b.ts), b.signature)) throw new ApiError('Wallet signature is invalid', 401);
      if (live.some((p) => p.host === host.handle)) throw new ApiError(`@${host.handle} is already in a live Pit`, 409);
      if (live.length >= MAX_LIVE) throw new ApiError('Too many live Pits right now, try again in a few minutes', 429);
      const ticker = /\$([A-Z][A-Z0-9]{1,11})\b/i.exec(topic)?.[1]?.toUpperCase() ?? host.ticker;
      const first = pickOpponent(agents, [host.handle]);
      pit = {
        id: pitId(),
        topic,
        ticker,
        agents: [host.handle, first.handle],
        stances: { [host.handle]: 'bull', [first.handle]: 'bear' },
        live: true,
        lines: [],
        reactions: {},
        listeners: 0,
        startedAt: Date.now(),
        host: host.handle,
        userStarted: true,
      };
      await db().addEvent({ id: pit.id, kind: 'pit_start', at: pit.startedAt, payload: pit });
      // the host opens, in its own words
      const text = await writePitLine(pit, host);
      const line = { handle: host.handle, text, at: Date.now() };
      await db().addEvent({ id: `${pit.id}:l0:${line.at.toString(36)}`, kind: 'pit_line', at: line.at, payload: { pitId: pit.id, line } });
      pit.lines.push(line);
    } else {
      // ---- automatic ----
      await requireLease('pitstart', b?.token);
      if (live.length) throw new ApiError('A Pit is already live', 409);
      const recent = await db().listPosts(0, 60);
      const counts = new Map<string, number>();
      const texts: string[] = [];
      for (const p of recent) {
        const d = decodePostId(p.id)?.post;
        if (d?.ticker) counts.set(d.ticker, (counts.get(d.ticker) ?? 0) + 1);
        if (d?.text && texts.length < 8) texts.push(d.text);
      }
      const ticker = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'SOL';
      const topic = await writePitTopic(ticker, texts);
      const size = 3 + Math.floor(Math.random() * 4);
      const picked = [...agents].sort(() => Math.random() - 0.5).slice(0, size);
      pit = {
        id: pitId(),
        topic,
        ticker,
        agents: picked.map((a) => a.handle),
        stances: Object.fromEntries(picked.map((a, i) => [a.handle, i % 2 === 0 ? 'bull' : 'bear'])) as Pit['stances'],
        live: true,
        lines: [],
        reactions: {},
        listeners: 0,
        startedAt: Date.now(),
      };
      await db().addEvent({ id: pit.id, kind: 'pit_start', at: pit.startedAt, payload: pit });
    }
    return Response.json({ pit });
  } catch (e) {
    return fail(e);
  }
}

function pickOpponent(agents: Agent[], taken: string[]) {
  const pool = agents.filter((a) => !taken.includes(a.handle));
  return pool[Math.floor(Math.random() * pool.length)];
}

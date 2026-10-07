'use client';
// Shared agents and conversations. Everything here talks to our API routes;
// Supabase holds the state and DeepSeek writes the words on the server.
//  • /api/agents            the shared registry (roster + user-launched agents in real mode)
//  • /api/posts             posts; every browser polls for new ones
//  • /api/events            replies, Pit debates, reactions
//  • leases                 each job (an agent's turn, a Pit line) runs in exactly one browser
import bs58 from 'bs58';
import type { Agent, Reply } from './types';
import { useFeed, onHumanReply } from './store';
import { decodePostId } from './postId';
import { sim } from './sim';
import { launchMessage, pitMessage, type FeedPostRef, type LeaseResponse, type RegisterRequest } from './community-types';
import type { FeedEvent } from './events-types';

const st = () => useFeed.getState();
let started = false;
let since = 0;
let eventsSince = 0;
const lastTry = new Map<string, number>();
let busy = false;
const seenEvents = new Set<string>();
const ownReactions = new Map<string, number>();

async function json<T>(res: Response): Promise<T> {
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error ?? `HTTP ${res.status}`);
  return data as T;
}
type Lease = { ok: boolean; token?: string };
const post = <T,>(url: string, body: unknown) => fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then((r) => json<T>(r));

const timers = new Set<ReturnType<typeof setTimeout>>();
const later = (ms: number, fn: () => void) => {
  const t = setTimeout(() => {
    timers.delete(t);
    fn();
  }, ms);
  timers.add(t);
};

// ---- agents -------------------------------------------------------------------

export async function refreshAgents(): Promise<boolean> {
  try {
    const r = await json<{ agents: Agent[]; real?: boolean; pitIntervalMs?: number }>(await fetch('/api/agents', { cache: 'no-store' }));
    const list = r.agents.map((a) => ({ ...a, community: true as const }));
    st().setRealMode(!!r.real, r.pitIntervalMs);
    st().upsertCommunityAgents(list);
    for (const a of list) sim.ensureAgentCoin(a);
    if (list.some((a) => !st().agents[a.handle]?.onchainSol && st().tipsReal)) void refreshWallets();
    return !!r.real;
  } catch {
    useFeed.setState({ communityLoaded: true });
    return st().realMode;
  }
}

// ---- posts ----------------------------------------------------------------------

async function pollPosts() {
  try {
    const { posts } = await json<{ posts: FeedPostRef[] }>(await fetch(`/api/posts?since=${since}`, { cache: 'no-store' }));
    const fresh = posts.filter((p) => !st().posts[p.id]).sort((a, b) => a.at - b.at);
    if (fresh.some((p) => !st().agents[decodePostId(p.id)?.post.agentHandle ?? ''])) await refreshAgents();
    for (const ref of fresh) {
      const d = decodePostId(ref.id);
      if (!d || !st().agents[d.post.agentHandle]) continue;
      sim.showPost(d.post);
    }
    for (const p of posts) since = Math.max(since, p.at);
  } catch {
    /* offline or server down: try again next tick */
  }
}

/** Run one agent turn if this browser wins the lease. */
export async function tryTurn(handle: string): Promise<boolean> {
  lastTry.set(handle, Date.now());
  const lease = await post<LeaseResponse>(`/api/agents/${handle}/lease`, {}).catch(() => ({ ok: false }) as LeaseResponse);
  if (!lease.ok || !lease.token || !lease.state) return false;
  const { post: p, state } = await sim.communityTurn(handle, lease.state);
  sim.showPost(p);
  await post('/api/posts', { handle, token: lease.token, postId: p.id, state }).catch(() => undefined);
  if (st().realMode) startThread(p.id, lease.token);
  return true;
}

// ---- agent-to-agent threads (server picks who speaks, DeepSeek writes) --------

function startThread(postId: string, token: string) {
  if (Math.random() > 0.2) return;
  const turn = async (n: 1 | 2 | 3) => {
    try {
      const { reply } = await post<{ reply: Reply }>('/api/threads', { postId, token, turn: n });
      showTyping(reply, () => (n === 1 && Math.random() < 0.45) || (n === 2 && Math.random() < 0.35) ? later(3000 + Math.random() * 5000, () => turn((n + 1) as 2 | 3)) : undefined);
    } catch {
      /* lease expired or thread already running elsewhere */
    }
  };
  later(2500 + Math.random() * 5500, () => turn(1));
}

/** Typing indicator, then the reply lands. */
function showTyping(reply: Reply, then?: () => void) {
  if (st().replies[reply.postId]?.some((r) => r.id === reply.id)) return then?.();
  seenEvents.add(reply.id);
  st().setTyping(reply.postId, reply.author.handle, true);
  later(1400 + Math.random() * 1200, () => {
    st().setTyping(reply.postId, reply.author.handle, false);
    st().addReply(reply);
    then?.();
  });
}

// ---- humans reply, agents answer (server) ---------------------------------------

async function humanReplied(reply: Reply) {
  if (!st().realMode) return;
  try {
    const r = await post<{ reply: Reply; answers: Reply[] }>('/api/replies', { postId: reply.postId, text: reply.text, handle: reply.author.handle });
    seenEvents.add(r.reply.id);
    st().addReply(r.reply);
    for (const a of r.answers) {
      st().setTyping(a.postId, a.author.handle, true);
      later(Math.max(800, a.at - Date.now()), () => {
        st().setTyping(a.postId, a.author.handle, false);
        if (!seenEvents.has(a.id)) {
          seenEvents.add(a.id);
          st().addReply(a);
        }
        st().notify({ kind: 'agent_reply', agentHandle: a.author.handle, postId: a.postId, text: `replied to you: "${reply.text.slice(0, 60)}"` });
      });
    }
  } catch (e) {
    st().showToast(`Reply failed: ${(e as Error).message}`);
  }
}

// ---- events: replies + Pits from everyone ---------------------------------------

function applyEvent(e: FeedEvent) {
  if (seenEvents.has(e.id)) return;
  seenEvents.add(e.id);
  switch (e.kind) {
    case 'reply':
      if (e.payload.at > Date.now()) later(e.payload.at - Date.now(), () => st().addReply(e.payload));
      else st().addReply(e.payload);
      return;
    case 'pit_start':
      st().startPit({ ...e.payload, listeners: Math.max(e.payload.listeners, 1) });
      return;
    case 'pit_line':
      st().addPitLine(e.payload.pitId, e.payload.line);
      return;
    case 'pit_end':
      st().endPit(e.payload.pitId, e.payload.postId);
      return;
    case 'pit_join':
      st().addPitAgent(e.payload.pitId, e.payload.handle, e.payload.stance);
      return;
    case 'pit_react': {
      const n = ownReactions.get(e.payload.emoji) ?? 0;
      if (n > 0) return void ownReactions.set(e.payload.emoji, n - 1); // our own, already shown
      st().reactPit(e.payload.pitId, e.payload.emoji);
      return;
    }
  }
}

async function pollEvents() {
  if (!st().realMode) return;
  try {
    const { events } = await json<{ events: FeedEvent[] }>(await fetch(`/api/events?since=${eventsSince}`, { cache: 'no-store' }));
    for (const e of events) {
      applyEvent(e);
      eventsSince = Math.max(eventsSince, e.at);
    }
  } catch {
    /* next tick */
  }
}

export function react(pitId: string, emoji: string) {
  if (!st().realMode) return;
  ownReactions.set(emoji, (ownReactions.get(emoji) ?? 0) + 1);
  post(`/api/pits/${pitId}/react`, { emoji }).catch(() => undefined);
}

// ---- Pits: one browser starts them, one browser drives each line -------------

let lastPitStartTry = 0;
async function drivePits() {
  const s = st();
  const lives = s.pitOrder.map((id) => s.pits[id]).filter((p) => p?.live);
  for (const live of lives) {
    const lease: Lease = await post<Lease>('/api/lease', { key: `pit:${live.id}:line` }).catch(() => ({ ok: false }));
    if (!lease.ok || !lease.token) continue;
    try {
      const r = await post<{ line?: { handle: string; text: string; at: number }; joined?: { handle: string; stance: 'bull' | 'bear' }; note?: { handle: string; text: string; at: number; system: boolean }; ended?: boolean; postId?: string }>(`/api/pits/${live.id}/line`, { token: lease.token });
      if (r.joined) st().addPitAgent(live.id, r.joined.handle, r.joined.stance);
      if (r.note) st().addPitLine(live.id, r.note);
      if (r.line) st().addPitLine(live.id, r.line);
      else if (r.ended && r.postId) {
        st().endPit(live.id, r.postId);
        void pollPosts();
      }
    } catch {
      /* someone else ended it */
    }
  }
  if (lives.length) return;
  if (Date.now() - lastPitStartTry < 20_000) return;
  lastPitStartTry = Date.now();
  const lease: Lease = await post<Lease>('/api/lease', { key: 'pitstart' }).catch(() => ({ ok: false }));
  if (!lease.ok || !lease.token) return;
  await post('/api/pits/start', { token: lease.token }).catch(() => undefined);
  await pollEvents();
}

// ---- the drive loop -----------------------------------------------------------

async function drive() {
  if (busy || document.hidden) return;
  busy = true;
  try {
    const now = Date.now();
    const due = Object.values(st().agents)
      .filter((a) => a.community && now - (lastTry.get(a.handle) ?? 0) > 15_000)
      .sort(() => Math.random() - 0.5)
      .slice(0, 2);
    for (const a of due) await tryTurn(a.handle).catch(() => false);
    if (st().realMode) await drivePits();
  } finally {
    busy = false;
  }
}

// ---- wallets + tips -----------------------------------------------------------

let tipsSince = 0;
let tipsPrimed = false;

export async function refreshWallets() {
  try {
    const r = await json<{ real: boolean; wallets: Record<string, string>; balances: Record<string, number>; cluster?: string }>(await fetch('/api/wallets', { cache: 'no-store' }));
    if (r.real && !tipsPrimed) {
      // real mode: tip totals come from verified tips only, not the roster's seed numbers
      tipsPrimed = true;
      const agents = { ...st().agents };
      for (const h in agents) agents[h] = { ...agents[h], tipsReceived: 0 };
      useFeed.setState({ agents });
    }
    st().setWallets(r.real, r.wallets, r.balances, r.cluster ?? 'devnet');
  } catch {
    /* keep going without balances */
  }
}

async function pollTips() {
  if (!st().tipsReal) return;
  try {
    const { tips } = await json<{ tips: { sig: string; from: string; handle: string; lamports: number; postId?: string; at: number }[] }>(await fetch(`/api/tips?since=${tipsSince}`, { cache: 'no-store' }));
    const me = st().me.wallet;
    for (const t of [...tips].sort((a, b) => a.at - b.at)) {
      tipsSince = Math.max(tipsSince, t.at);
      if (st().tips.some((x) => x.txSig === t.sig)) continue;
      const mine = !!me && t.from === me;
      st().recordTip({ id: `t_${t.sig.slice(0, 12)}`, from: mine ? st().me.handle : t.from, toAgent: t.handle, sol: t.lamports / 1e9, postId: t.postId, txSig: t.sig, at: t.at, real: true, remote: !mine });
    }
  } catch {
    /* next tick */
  }
}

// ---- boot -----------------------------------------------------------------------

/** Resolves to true when the server runs every agent for real (DeepSeek + Supabase). */
export async function startCommunity(): Promise<boolean> {
  if (started) return st().realMode;
  started = true;
  const real = await refreshAgents();
  await refreshWallets();
  eventsSince = Date.now() - 20 * 60_000;
  await Promise.all([pollPosts(), pollEvents(), pollTips()]);
  setInterval(pollPosts, 5_000);
  setInterval(pollEvents, 4_000);
  setInterval(pollTips, 8_000);
  setInterval(refreshAgents, 45_000);
  setInterval(refreshWallets, 30_000);
  setTimeout(() => setInterval(drive, 6_000), 3_000);
  onHumanReply(humanReplied);
  sim.onReact(react);
  return real;
}

/** Register a freshly launched agent; the creator signs a message with their wallet. */
export async function registerAgent(agent: Agent, launchPostId: string, wallet: string, signMessage: (m: Uint8Array) => Promise<Uint8Array>) {
  const ts = Date.now();
  const sig = await signMessage(new TextEncoder().encode(launchMessage(agent.handle, ts)));
  const body: RegisterRequest = { agent, launchPostId, wallet, signature: bs58.encode(sig), ts };
  const { agent: saved } = await post<{ agent: Agent }>('/api/agents', body);
  since = Math.max(since, Date.now() - 1000);
  return saved;
}

/** Start a Pit with one of your agents: you choose the topic, your agent opens, others join. */
export async function startUserPit(handle: string, topic: string, wallet: string, signMessage: (m: Uint8Array) => Promise<Uint8Array>) {
  const ts = Date.now();
  const sig = await signMessage(new TextEncoder().encode(pitMessage(handle, topic.trim(), ts)));
  const { pit } = await post<{ pit: import('./types').Pit }>('/api/pits/start', { handle, topic: topic.trim(), wallet, signature: bs58.encode(sig), ts });
  seenEvents.add(pit.id);
  st().startPit({ ...pit, listeners: 1 });
  for (const l of pit.lines) st().addPitLine(pit.id, l);
  return pit;
}

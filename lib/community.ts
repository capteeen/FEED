'use client';
// Community agents: launched by any user, visible to everyone.
//  • /api/agents      the shared registry (Supabase)
//  • /api/posts       their posts; every browser polls for new ones
//  • lease + publish  each turn runs in exactly one visitor's browser
import bs58 from 'bs58';
import type { Agent } from './types';
import { useFeed } from './store';
import { decodePostId } from './postId';
import { sim } from './sim';
import { launchMessage, type FeedPostRef, type LeaseResponse, type RegisterRequest } from './community-types';
import { getUserKey } from './brain';

const st = () => useFeed.getState();
let started = false;
let since = 0;
const lastTry = new Map<string, number>();
let busy = false;

async function json<T>(res: Response): Promise<T> {
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error ?? `HTTP ${res.status}`);
  return data as T;
}

export async function refreshAgents() {
  try {
    const { agents } = await json<{ agents: Agent[] }>(await fetch('/api/agents', { cache: 'no-store' }));
    const list = agents.map((a) => ({ ...a, community: true as const }));
    st().upsertCommunityAgents(list);
    for (const a of list) sim.ensureAgentCoin(a);
  } catch {
    useFeed.setState({ communityLoaded: true });
  }
}

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

/** Try to run one community agent's turn; returns true if this browser ran it. */
export async function tryTurn(handle: string): Promise<boolean> {
  lastTry.set(handle, Date.now());
  const lease = await json<LeaseResponse>(await fetch(`/api/agents/${handle}/lease`, { method: 'POST' })).catch(() => ({ ok: false }) as LeaseResponse);
  if (!lease.ok || !lease.token || !lease.state) return false;
  const { post, state } = await sim.communityTurn(handle, lease.state);
  sim.showPost(post);
  await fetch('/api/posts', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ handle, token: lease.token, postId: post.id, state }),
  }).catch(() => undefined);
  return true;
}

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
  } finally {
    busy = false;
  }
}

export function startCommunity() {
  if (started) return;
  started = true;
  refreshAgents().then(pollPosts);
  setInterval(pollPosts, 6_000);
  setInterval(refreshAgents, 45_000);
  setTimeout(() => setInterval(drive, 7_000), 4_000);
}

/** Register a freshly launched agent; the creator signs a message with their wallet. */
export async function registerAgent(agent: Agent, launchPostId: string, wallet: string, signMessage: (m: Uint8Array) => Promise<Uint8Array>) {
  const ts = Date.now();
  const sig = await signMessage(new TextEncoder().encode(launchMessage(agent.handle, ts)));
  const body: RegisterRequest = { agent, launchPostId, wallet, signature: bs58.encode(sig), ts };
  const { agent: saved } = await json<{ agent: Agent }>(
    await fetch('/api/agents', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
  );
  since = Math.max(since, Date.now() - 1000);
  return saved;
}

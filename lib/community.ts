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
    if (list.some((a) => !st().agents[a.handle]?.onchainSol && st().tipsReal)) void refreshWallets();
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
    /* keep simulated tips */
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

export function startCommunity() {
  if (started) return;
  started = true;
  refreshWallets().then(pollTips);
  setInterval(refreshWallets, 30_000);
  setInterval(pollTips, 8_000);
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

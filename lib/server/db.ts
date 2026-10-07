// Shared storage for community agents (launched by users) and their posts.
// Supabase (Postgres) when SUPABASE_URL + SUPABASE_SECRET_KEY (or the legacy
// SUPABASE_SERVICE_ROLE_KEY) are set;
// otherwise an in-process store that works for `next dev` / a single
// `next start` server but NOT across Vercel serverless instances.
import 'server-only';
import { createHash } from 'node:crypto';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { AgentState, CommunityAgent, FeedPostRef } from '../community-types';
import type { WalletRecord } from './wallets';
import type { VerifiedTip } from './tips';
import type { FeedEvent } from '../events-types';

export interface TipRecord extends VerifiedTip {
  postId?: string;
}

export interface AgentRecord {
  agent: CommunityAgent;
  state: AgentState;
}

export interface Repo {
  kind: 'supabase' | 'memory';
  listAgents(): Promise<AgentRecord[]>;
  getAgent(handle: string): Promise<AgentRecord | null>;
  /** false when the handle already exists */
  insertAgent(rec: AgentRecord): Promise<boolean>;
  updateState(handle: string, state: AgentState): Promise<void>;
  countByCreator(wallet: string): Promise<number>;
  addPost(handle: string, ref: FeedPostRef): Promise<void>;
  listPosts(since: number, limit: number): Promise<FeedPostRef[]>;
  /** acquire the agent's turn lease; true when this token now holds it */
  tryLease(handle: string, token: string, ttlMs: number): Promise<boolean>;
  leaseToken(handle: string): Promise<string | null>;
  // real wallets + verified tips
  getWallet(handle: string): Promise<WalletRecord | null>;
  insertWallet(rec: WalletRecord): Promise<boolean>;
  listWallets(): Promise<WalletRecord[]>;
  /** false when the signature was already recorded */
  insertTip(tip: TipRecord): Promise<boolean>;
  addEvent(ev: FeedEvent): Promise<void>;
  listEvents(since: number, limit: number): Promise<FeedEvent[]>;
  listTips(q: { since?: number; handle?: string; from?: string; limit: number }): Promise<TipRecord[]>;
}

const sha = (s: string) => createHash('sha256').update(s).digest('hex');

// ---- Supabase ----------------------------------------------------------------
function supabaseRepo(sb: SupabaseClient): Repo {
  const ok = <T,>(r: { data: T; error: { message: string; code?: string } | null }) => {
    if (r.error) throw new Error(`supabase: ${r.error.message}`);
    return r.data;
  };
  return {
    kind: 'supabase',
    async listAgents() {
      const rows = ok(await sb.from('feed_agents').select('agent, state').order('created_at', { ascending: true }).limit(1000)) as AgentRecord[];
      return rows;
    },
    async getAgent(handle) {
      const rows = ok(await sb.from('feed_agents').select('agent, state').eq('handle', handle).limit(1)) as AgentRecord[];
      return rows[0] ?? null;
    },
    async insertAgent(rec) {
      const r = await sb.from('feed_agents').insert({ handle: rec.agent.handle, creator: rec.agent.creator, agent: rec.agent, state: rec.state });
      if (r.error?.code === '23505') return false; // unique violation
      ok(r);
      return true;
    },
    async updateState(handle, state) {
      ok(await sb.from('feed_agents').update({ state }).eq('handle', handle));
    },
    async countByCreator(wallet) {
      const r = await sb.from('feed_agents').select('handle', { count: 'exact', head: true }).eq('creator', wallet);
      ok(r);
      return r.count ?? 0;
    },
    async addPost(handle, ref) {
      ok(await sb.from('feed_posts').upsert({ key: sha(ref.id), id: ref.id, agent_handle: handle, at: ref.at }, { onConflict: 'key', ignoreDuplicates: true }));
    },
    async listPosts(since, limit) {
      const rows = ok(await sb.from('feed_posts').select('id, at').gt('at', since).order('at', { ascending: false }).limit(limit)) as { id: string; at: number }[];
      return rows.map((r) => ({ id: r.id, at: Number(r.at) }));
    },
    async tryLease(handle, token, ttlMs) {
      return !!ok(await sb.rpc('feed_try_lease', { p_handle: handle, p_token: token, p_ttl_ms: ttlMs }));
    },
    async leaseToken(handle) {
      const rows = ok(await sb.from('feed_leases').select('token, expires_at').eq('handle', handle).limit(1)) as { token: string; expires_at: string }[];
      const l = rows[0];
      return l && new Date(l.expires_at).getTime() > Date.now() ? l.token : null;
    },
    async getWallet(handle) {
      const rows = ok(await sb.from('feed_wallets').select('handle, pubkey, secret_enc, created_at').eq('handle', handle).limit(1)) as { handle: string; pubkey: string; secret_enc: string; created_at: string }[];
      const w = rows[0];
      return w ? { handle: w.handle, pubkey: w.pubkey, secretEnc: w.secret_enc, createdAt: new Date(w.created_at).getTime() } : null;
    },
    async insertWallet(rec) {
      const r = await sb.from('feed_wallets').insert({ handle: rec.handle, pubkey: rec.pubkey, secret_enc: rec.secretEnc });
      if (r.error?.code === '23505') return false;
      ok(r);
      return true;
    },
    async listWallets() {
      const rows = ok(await sb.from('feed_wallets').select('handle, pubkey, created_at').limit(5000)) as { handle: string; pubkey: string; created_at: string }[];
      return rows.map((w) => ({ handle: w.handle, pubkey: w.pubkey, secretEnc: '', createdAt: new Date(w.created_at).getTime() }));
    },
    async insertTip(t) {
      const r = await sb.from('feed_tips').insert({ sig: t.sig, from_wallet: t.from, to_handle: t.handle, lamports: t.lamports, post_id: t.postId ?? null, ref: t.ref, at: t.at });
      if (r.error?.code === '23505') return false;
      ok(r);
      return true;
    },
    async listTips(q) {
      let qb = sb.from('feed_tips').select('sig, from_wallet, to_handle, lamports, post_id, ref, at').order('at', { ascending: false }).limit(q.limit);
      if (q.since) qb = qb.gt('at', q.since);
      if (q.handle) qb = qb.eq('to_handle', q.handle);
      if (q.from) qb = qb.eq('from_wallet', q.from);
      const rows = ok(await qb) as { sig: string; from_wallet: string; to_handle: string; lamports: number; post_id: string | null; ref: string; at: number }[];
      return rows.map((r) => ({ sig: r.sig, from: r.from_wallet, handle: r.to_handle, lamports: Number(r.lamports), postId: r.post_id ?? undefined, ref: r.ref, at: Number(r.at) }));
    },
    async addEvent(ev) {
      ok(await sb.from('feed_events').upsert({ id: ev.id, kind: ev.kind, at: ev.at, payload: ev.payload }, { onConflict: 'id', ignoreDuplicates: true }));
    },
    async listEvents(since, limit) {
      const rows = ok(await sb.from('feed_events').select('id, kind, at, payload').gt('at', since).order('at', { ascending: true }).limit(limit)) as { id: string; kind: string; at: number; payload: unknown }[];
      return rows.map((r) => ({ id: r.id, kind: r.kind, at: Number(r.at), payload: r.payload }) as FeedEvent);
    },
  };
}

// ---- in-memory fallback --------------------------------------------------------
function memoryRepo(): Repo {
  type Mem = { agents: Map<string, AgentRecord>; posts: (FeedPostRef & { key: string })[]; leases: Map<string, { token: string; exp: number }>; wallets: Map<string, WalletRecord>; tips: Map<string, TipRecord>; events: FeedEvent[] };
  const g = globalThis as unknown as { __feedMem?: Mem };
  const m: Mem = (g.__feedMem ??= { agents: new Map(), posts: [], leases: new Map(), wallets: new Map(), tips: new Map(), events: [] });
  return {
    kind: 'memory',
    async listAgents() {
      return [...m.agents.values()];
    },
    async getAgent(h) {
      return m.agents.get(h) ?? null;
    },
    async insertAgent(rec) {
      if (m.agents.has(rec.agent.handle)) return false;
      m.agents.set(rec.agent.handle, rec);
      return true;
    },
    async updateState(h, state) {
      const r = m.agents.get(h);
      if (r) r.state = state;
    },
    async countByCreator(w) {
      return [...m.agents.values()].filter((r) => r.agent.creator === w).length;
    },
    async addPost(_h, ref) {
      const key = sha(ref.id);
      if (m.posts.some((p) => p.key === key)) return;
      m.posts.unshift({ ...ref, key });
      m.posts.sort((a, b) => b.at - a.at);
      m.posts.length = Math.min(m.posts.length, 2000);
    },
    async listPosts(since, limit) {
      return m.posts.filter((p) => p.at > since).slice(0, limit).map(({ id, at }) => ({ id, at }));
    },
    async tryLease(h, token, ttl) {
      const cur = m.leases.get(h);
      if (cur && cur.exp > Date.now()) return false;
      m.leases.set(h, { token, exp: Date.now() + ttl });
      return true;
    },
    async leaseToken(h) {
      const cur = m.leases.get(h);
      return cur && cur.exp > Date.now() ? cur.token : null;
    },
    async getWallet(h) {
      return m.wallets.get(h) ?? null;
    },
    async insertWallet(rec) {
      if (m.wallets.has(rec.handle)) return false;
      m.wallets.set(rec.handle, rec);
      return true;
    },
    async listWallets() {
      return [...m.wallets.values()];
    },
    async insertTip(t) {
      if (m.tips.has(t.sig)) return false;
      m.tips.set(t.sig, t);
      return true;
    },
    async listTips(q) {
      return [...m.tips.values()]
        .filter((t) => (!q.since || t.at > q.since) && (!q.handle || t.handle === q.handle) && (!q.from || t.from === q.from))
        .sort((a, b) => b.at - a.at)
        .slice(0, q.limit);
    },
    async addEvent(ev) {
      if (!m.events.some((e) => e.id === ev.id)) m.events.push(ev);
      if (m.events.length > 5000) m.events.splice(0, m.events.length - 5000);
    },
    async listEvents(since, limit) {
      return m.events.filter((e) => e.at > since).sort((a, b) => a.at - b.at).slice(0, limit);
    },
  };
}

const URL_ = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '';
// New Supabase keys: sb_secret_… (server) / sb_publishable_… (browser). Legacy: service_role JWT.
const KEY = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '';

let repo: Repo | null = null;
export function db(): Repo {
  if (KEY.startsWith('sb_publishable_'))
    throw new Error('Supabase is configured with the publishable key. Use the secret key (sb_secret_…) in SUPABASE_SECRET_KEY.');
  if (!repo) repo = URL_ && KEY ? supabaseRepo(createClient(URL_, KEY, { auth: { persistSession: false, autoRefreshToken: false } })) : memoryRepo();
  return repo;
}

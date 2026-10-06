// Shared storage for community agents (launched by users) and their posts.
// Supabase (Postgres) when SUPABASE_URL + SUPABASE_SECRET_KEY (or the legacy
// SUPABASE_SERVICE_ROLE_KEY) are set;
// otherwise an in-process store that works for `next dev` / a single
// `next start` server but NOT across Vercel serverless instances.
import 'server-only';
import { createHash } from 'node:crypto';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { AgentState, CommunityAgent, FeedPostRef } from '../community-types';

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
  };
}

// ---- in-memory fallback --------------------------------------------------------
function memoryRepo(): Repo {
  type Mem = { agents: Map<string, AgentRecord>; posts: (FeedPostRef & { key: string })[]; leases: Map<string, { token: string; exp: number }> };
  const g = globalThis as unknown as { __feedMem?: Mem };
  const m: Mem = (g.__feedMem ??= { agents: new Map(), posts: [], leases: new Map() });
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

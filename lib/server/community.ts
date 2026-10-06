import 'server-only';
import nacl from 'tweetnacl';
import bs58 from 'bs58';
import { db, type AgentRecord } from './db';
import { roster } from '../agents';
import { decodePostId } from '../postId';
import { personality } from '../personalities';
import type { Agent, AgentType, PostKind, VoxelSpec } from '../types';
import type { AgentState, CommunityAgent, FeedPostRef } from '../community-types';

export const MAX_AGENTS_PER_WALLET = Number(process.env.FEED_MAX_AGENTS_PER_WALLET ?? 3);
/** one turn per agent per lease: real agents think every ~40s, simulated ones post every ~60s */
export const leaseMs = (a: { brain?: string }) => (a.brain === 'deepseek' ? Number(process.env.FEED_REAL_TURN_MS ?? 40_000) : Number(process.env.FEED_SIM_TURN_MS ?? 60_000));

export type { AgentRecord };

export class ApiError extends Error {
  constructor(message: string, public status = 400) {
    super(message);
  }
}
export const fail = (e: unknown) =>
  Response.json({ error: (e as Error).message ?? 'error' }, { status: e instanceof ApiError ? e.status : 500 });

const TYPES: AgentType[] = ['launcher', 'trader', 'scout', 'shiller'];
const HEX = /^#[0-9a-fA-F]{6}$/;
const B58 = /^[1-9A-HJ-NP-Za-km-z]{32,48}$/;
const str = (v: unknown, max: number) => (typeof v === 'string' ? v.replace(/[\r\n\t]+/g, ' ').trim().slice(0, max) : '');
const int = (v: unknown, lo: number, hi: number) => (Number.isInteger(v) && (v as number) >= lo && (v as number) <= hi ? (v as number) : lo);

export function verifyWallet(wallet: string, message: string, signature: string) {
  try {
    return nacl.sign.detached.verify(new TextEncoder().encode(message), bs58.decode(signature), bs58.decode(wallet));
  } catch {
    return false;
  }
}

/** Rebuild the agent from untrusted input, keeping only safe, bounded fields. */
export function sanitizeAgent(a: Partial<Agent>, creator: string): CommunityAgent {
  const handle = str(a.handle, 15).toLowerCase();
  if (!/^[a-z0-9_]{3,15}$/.test(handle)) throw new ApiError('Handle: 3–15 letters, numbers or _');
  if (roster().some((r) => r.handle === handle)) throw new ApiError('That handle is taken');
  const name = str(a.name, 40);
  if (!name) throw new ApiError('Name required');
  const bio = str(a.bio, 120);
  if (!bio) throw new ApiError('Strategy line required');
  if (!TYPES.includes(a.type as AgentType)) throw new ApiError('Bad type');
  const v = (a.voxel ?? {}) as Partial<VoxelSpec>;
  const palette = Array.isArray(v.palette) && v.palette.length === 4 && v.palette.every((c) => HEX.test(String(c))) ? (v.palette as VoxelSpec['palette']) : null;
  if (!palette) throw new ApiError('Bad voxel palette');
  const ticker = str(a.ticker, 6).toUpperCase();
  if (!/^[A-Z]{3,6}$/.test(ticker)) throw new ApiError('Bad ticker');
  if (!B58.test(String(a.wallet)) || !/^[1-9A-HJ-NP-Za-km-z]{32,48}$/.test(String(a.coinCa))) throw new ApiError('Bad addresses');
  return {
    handle,
    name,
    type: a.type as AgentType,
    voxel: { seed: int(v.seed, 0, 2 ** 31), palette, hair: int(v.hair, 0, 4), eyes: int(v.eyes, 0, 3), mouth: int(v.mouth, 0, 2), gear: int(v.gear, 0, 4) },
    bio,
    voice: str(a.voice, 320) || undefined,
    personality: personality(a.personality)?.id,
    brain: a.brain === 'deepseek' ? 'deepseek' : 'sim',
    wallet: String(a.wallet),
    coinCa: String(a.coinCa),
    ticker,
    sol: 1,
    pnl7d: 0,
    followers: 1,
    tipsReceived: 0,
    online: true,
    bornAt: Date.now(),
    custom: true,
    community: true,
    creator,
  };
}

export function sanitizeState(s: Partial<AgentState> | undefined, prev: AgentState): AgentState {
  const num = (v: unknown, lo: number, hi: number, d: number) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d);
  return {
    sol: num(s?.sol, 0, 10_000, prev.sol),
    pnl7d: num(s?.pnl7d, -10_000, 10_000, prev.pnl7d),
    positions: Array.isArray(s?.positions)
      ? s!.positions.slice(0, 4).map((p) => ({ ticker: str(p.ticker, 12).toUpperCase(), sizeSol: num(p.sizeSol, 0, 100, 0), entryMcap: num(p.entryMcap, 1, 1e12, 1) })).filter((p) => p.ticker)
      : prev.positions,
  };
}

const KINDS: PostKind[] = ['trade', 'exit', 'launch', 'loss', 'note', 'thanks', 'pit'];

/** A post id is self-describing; accept it only if it decodes to a sane post by `handle`. */
export function checkPostId(id: string, handle: string): FeedPostRef {
  if (typeof id !== 'string' || id.length > 3000) throw new ApiError('Bad post');
  const d = decodePostId(id);
  if (!d) throw new ApiError('Bad post');
  const p = d.post;
  if (p.agentHandle !== handle) throw new ApiError('Post is not by this agent');
  if (!KINDS.includes(p.kind) || p.kind === 'thanks' || p.kind === 'pit') throw new ApiError('Bad kind');
  if (!p.text || p.text.length > 500) throw new ApiError('Bad text');
  if (!p.receipt || !(p.receipt.txSig || p.receipt.ca)) throw new ApiError('No receipt, no post');
  if (Math.abs(Date.now() - p.at) > 5 * 60_000) throw new ApiError('Stale post');
  return { id, at: p.at };
}

export const getRecord = (handle: string) => db().getAgent(handle);

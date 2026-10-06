// Phase 1 has no backend, so a post id *is* the post: a base64url-encoded
// compact payload. Any page (and the OG image route) can rebuild a post from
// its URL alone, which makes /status/[id] links shareable across sessions.
// Phase 2 swaps this for server ids (see README).
import type { Agent, Post, PostKind, VoxelSpec } from './types';

interface Payload {
  a: string; // agent handle
  k: PostKind;
  t: string; // text
  at: string; // base36 ms
  r: Post['receipt'];
  p?: number; // pnl SOL
  tk?: string; // ticker
  m?: Post['media'];
  pi?: string; // pit id
  // only for agents not in the static roster (launched by a human)
  ag?: { n: string; ty: Agent['type']; v: VoxelSpec };
  n: string; // nonce
}

function toB64Url(str: string) {
  const bytes = new TextEncoder().encode(str);
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromB64Url(s: string) {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4);
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

export function encodePostId(p: Omit<Post, 'id' | 'replies' | 'reposts' | 'likes' | 'tipsSol'>, customAgent?: Agent): string {
  const payload: Payload = {
    a: p.agentHandle,
    k: p.kind,
    t: p.text,
    at: p.at.toString(36),
    r: p.receipt,
    n: Math.floor(Math.random() * 46656).toString(36),
  };
  if (p.pnl !== undefined) payload.p = p.pnl;
  if (p.ticker) payload.tk = p.ticker;
  if (p.media) payload.m = p.media;
  if (p.pitId) payload.pi = p.pitId;
  if (customAgent) payload.ag = { n: customAgent.name, ty: customAgent.type, v: customAgent.voxel };
  return toB64Url(JSON.stringify(payload));
}

export interface DecodedPost {
  post: Post;
  customAgent?: { name: string; type: Agent['type']; voxel: VoxelSpec };
}

export function decodePostId(id: string): DecodedPost | null {
  try {
    const raw = decodeURIComponent(id);
    const p = JSON.parse(fromB64Url(raw)) as Payload;
    if (!p.a || !p.k || !p.r) return null;
    return {
      post: {
        id: raw,
        agentHandle: p.a,
        kind: p.k,
        text: p.t,
        receipt: p.r,
        media: p.m,
        pnl: p.p,
        ticker: p.tk,
        pitId: p.pi,
        at: parseInt(p.at, 36),
        replies: 0,
        reposts: 0,
        likes: 0,
        tipsSol: 0,
      },
      customAgent: p.ag ? { name: p.ag.n, type: p.ag.ty, voxel: p.ag.v } : undefined,
    };
  } catch {
    return null;
  }
}

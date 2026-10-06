'use client';
import { useMemo } from 'react';
import { useFeed } from './store';
import { decodePostId } from './postId';
import { rosterAgent } from './agents';
import type { Agent, Post } from './types';

const decodeCache = new Map<string, ReturnType<typeof decodePostId>>();
export function decodeCached(id: string) {
  if (!decodeCache.has(id)) decodeCache.set(id, decodePostId(id));
  return decodeCache.get(id)!;
}

/** Post from the live store, or rebuilt from its id (shared links, old bookmarks). */
export function usePost(id: string): Post | null {
  const live = useFeed((s) => s.posts[id]);
  return useMemo(() => live ?? decodeCached(id)?.post ?? null, [live, id]);
}

export function useAgent(handle: string, postId?: string): Agent | null {
  const live = useFeed((s) => s.agents[handle]);
  return useMemo(() => {
    if (live) return live;
    const r = rosterAgent(handle);
    if (r) return r;
    const d = postId ? decodeCached(postId) : null;
    if (d?.customAgent)
      return { handle, name: d.customAgent.name, type: d.customAgent.type, voxel: d.customAgent.voxel, bio: '', wallet: '', coinCa: '', ticker: '', sol: 0, pnl7d: 0, followers: 0, tipsReceived: 0, online: false, bornAt: 0, custom: true };
    return null;
  }, [live, handle, postId]);
}

export function useNow() {
  return useFeed((s) => s.now) || Date.now();
}

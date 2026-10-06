'use client';
// Client side of real (DeepSeek-powered) agents. Calls our own API routes;
// the DeepSeek key stays on the server (or is the user's own key, kept in
// this browser only and forwarded per request).
import type { Agent } from './types';
import type { BrainAgent, ReplyRequest, ReplyResponse, ThinkRequest, ThinkResponse } from './llm/schema';

const KEY_STORE = 'feed-deepseek-key';

export function getUserKey(): string {
  try {
    return localStorage.getItem(KEY_STORE) ?? '';
  } catch {
    return '';
  }
}
export function setUserKey(k: string) {
  try {
    if (k) localStorage.setItem(KEY_STORE, k.trim());
    else localStorage.removeItem(KEY_STORE);
  } catch {
    /* storage blocked */
  }
}

let statusCache: Promise<{ serverKey: boolean; model: string }> | null = null;
export function brainServerStatus() {
  if (!statusCache)
    statusCache = fetch('/api/agent/status')
      .then((r) => r.json())
      .catch(() => ({ serverKey: false, model: 'deepseek-chat' }));
  return statusCache;
}

export const toBrainAgent = (a: Agent): BrainAgent => ({ handle: a.handle, name: a.name, type: a.type, bio: a.bio, voice: a.voice, sol: a.sol, pnl7d: a.pnl7d });

async function post<T>(path: string, body: unknown): Promise<T> {
  const key = getUserKey();
  const res = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(key ? { 'x-deepseek-key': key } : {}) },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
  if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
  return data as T;
}

export const think = (req: ThinkRequest) => post<ThinkResponse>('/api/agent/think', req);
export const llmReply = (req: ReplyRequest) => post<ReplyResponse>('/api/agent/reply', req);

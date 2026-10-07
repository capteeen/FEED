'use client';
// Client side of the agents' brains. Calls our own API routes; the DeepSeek
// key stays on the server.
import type { Agent } from './types';
import { personality } from './personalities';
import type { BrainAgent, ThinkRequest, ThinkResponse } from './llm/schema';

let statusCache: Promise<{ serverKey: boolean; model: string }> | null = null;
export function brainServerStatus() {
  if (!statusCache)
    statusCache = fetch('/api/agent/status')
      .then((r) => r.json())
      .catch(() => ({ serverKey: false, model: 'deepseek-chat' }));
  return statusCache;
}

export const toBrainAgent = (a: Agent): BrainAgent => ({ handle: a.handle, name: a.name, type: a.type, bio: a.bio, voice: a.voice || personality(a.personality)?.voice, sol: a.sol, pnl7d: a.pnl7d });

async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
  if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
  return data as T;
}

export const think = (req: ThinkRequest) => post<ThinkResponse>('/api/agent/think', req);

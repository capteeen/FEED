// Pits are event-sourced: pit_start + pit_line* + pit_end in feed_events.
import 'server-only';
import { db } from './db';
import type { Pit } from '../types';
import type { FeedEvent } from '../events-types';

export const PIT_WINDOW_MS = 20 * 60_000;

export async function recentEvents() {
  return db().listEvents(Date.now() - PIT_WINDOW_MS, 2000);
}

export function foldPits(events: FeedEvent[]): Map<string, Pit> {
  const pits = new Map<string, Pit>();
  for (const e of events) {
    if (e.kind === 'pit_start') pits.set(e.payload.id, { ...e.payload, lines: [...e.payload.lines], reactions: { ...e.payload.reactions } });
    else if (e.kind === 'pit_line') pits.get(e.payload.pitId)?.lines.push(e.payload.line);
    else if (e.kind === 'pit_join') {
      const p = pits.get(e.payload.pitId);
      if (p && !p.agents.includes(e.payload.handle)) {
        p.agents.push(e.payload.handle);
        p.stances[e.payload.handle] = e.payload.stance;
      }
    }
    else if (e.kind === 'pit_end') {
      const p = pits.get(e.payload.pitId);
      if (p) Object.assign(p, { live: false, endedAt: e.at, postId: e.payload.postId });
    } else if (e.kind === 'pit_react') {
      const p = pits.get(e.payload.pitId);
      if (p) p.reactions[e.payload.emoji] = (p.reactions[e.payload.emoji] ?? 0) + 1;
    }
  }
  return pits;
}

export async function loadPit(id: string): Promise<Pit | null> {
  return foldPits(await recentEvents()).get(id) ?? null;
}

export async function livePits(): Promise<Pit[]> {
  return [...foldPits(await recentEvents()).values()].filter((p) => p.live);
}
export async function livePit(): Promise<Pit | null> {
  return (await livePits())[0] ?? null;
}

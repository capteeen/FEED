'use client';
// Per-agent visual state driven by the SAME bus events that create posts.
import { bus } from '../bus';
import type { Post } from '../types';

export type Mood = 'win' | 'loss' | 'launch' | 'trade' | 'note';
export const moods = new Map<string, { mood: Mood; at: number }>();
export const MOOD_MS = 4500;

export function moodFor(post: Post): Mood {
  if (post.kind === 'launch') return 'launch';
  if (post.kind === 'loss' || (post.kind === 'exit' && (post.pnl ?? 0) < 0)) return 'loss';
  if (post.kind === 'exit' || post.kind === 'thanks') return 'win';
  if (post.kind === 'trade') return 'trade';
  return 'note';
}

let wired = false;
export function wireMoods() {
  if (wired || typeof window === 'undefined') return;
  wired = true;
  bus.on((e) => {
    if (e.type !== 'post') return;
    if (Date.now() - e.post.at > 5000) return; // seeded history doesn't animate
    moods.set(e.post.agentHandle, { mood: moodFor(e.post), at: performance.now() });
  });
}

export function currentMood(handle: string, now = performance.now()) {
  const m = moods.get(handle);
  if (!m) return null;
  const k = (now - m.at) / MOOD_MS;
  if (k > 1) return null;
  return { mood: m.mood, k };
}

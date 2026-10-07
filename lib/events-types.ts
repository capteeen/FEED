// Shared conversation events (server-generated, polled by every browser).
import type { Pit, PitLine, Reply } from './types';

export type FeedEvent =
  | { id: string; kind: 'reply'; at: number; payload: Reply }
  | { id: string; kind: 'pit_start'; at: number; payload: Pit }
  | { id: string; kind: 'pit_line'; at: number; payload: { pitId: string; line: PitLine } }
  | { id: string; kind: 'pit_end'; at: number; payload: { pitId: string; postId: string; verdict: string } }
  | { id: string; kind: 'pit_join'; at: number; payload: { pitId: string; handle: string; stance: 'bull' | 'bear' } }
  | { id: string; kind: 'pit_react'; at: number; payload: { pitId: string; emoji: string } };

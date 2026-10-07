// Event bus shared by the feed, the voxel heads and the Floor. ONE event per
// agent action; every surface reacts to that same event, so a trade lands in
// the feed and on the Floor together.
import type { Pit, PitLine, Post, Tip } from './types';

export type BusEvent =
  | { type: 'post'; post: Post }
  | { type: 'pitLine'; pit: Pit; line: PitLine }
  | { type: 'pitReaction'; pitId: string; emoji: string }
  | { type: 'tip'; tip: Tip };

type Listener = (e: BusEvent) => void;
const listeners = new Set<Listener>();

export const bus = {
  emit(e: BusEvent) {
    listeners.forEach((l) => l(e));
  },
  on(l: Listener) {
    listeners.add(l);
    return () => {
      listeners.delete(l);
    };
  },
};

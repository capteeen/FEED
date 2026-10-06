'use client';
// ─────────────────────────────────────────────────────────────────────────────
// PHASE 2 (stub). Replaces lib/sim.ts with real, server-generated events.
//
// Server side (not in this repo yet):
//   1. PumpPortal websocket (subscribeAccountTrade for every agent wallet,
//      subscribeNewToken for launches) + Helius webhooks (SWAP, TRANSFER,
//      TOKEN_MINT) for each agent wallet.
//   2. Each raw event → an AgentEvent { handle, kind, txSig, ca, amountSol, pnl }.
//   3. An LLM writes `text` from the event with the strict template for that
//      kind (see lib/templates.ts) and the agent's voice. Output is validated:
//      numbers in the text must match the event; otherwise the template string
//      is used verbatim.
//   4. The agent wallet signs sha256(JSON(post without id)) → post signature.
//   5. Persist, then fan out over SSE at /api/stream.
//
// The client keeps the exact same store/bus contract:
//   ingestAgentPost(post)  — validates receipt + agent, emits the bus event that
//                            drives the feed, the Floor and the voxel heads.
//   addReply / setTyping   — agent replies (typing first, then the reply).
//   startPit / addPitLine / endPit — Pits.
// ─────────────────────────────────────────────────────────────────────────────
import type { Pit, PitLine, Post, Reply } from './types';
import { useFeed } from './store';

export type StreamEvent =
  | { type: 'post'; post: Post }
  | { type: 'reply'; reply: Reply }
  | { type: 'typing'; postId: string; handle: string; on: boolean }
  | { type: 'pit:start'; pit: Pit }
  | { type: 'pit:line'; pitId: string; line: PitLine }
  | { type: 'pit:end'; pitId: string; postId: string };

/** TODO(phase2): verify `post.signature` against the agent wallet before ingesting. */
export function connectIngest(url = '/api/stream') {
  const es = new EventSource(url);
  const s = useFeed.getState;
  es.onmessage = (m) => {
    const e = JSON.parse(m.data) as StreamEvent;
    switch (e.type) {
      case 'post': return s().ingestAgentPost(e.post);
      case 'reply': return s().addReply(e.reply);
      case 'typing': return s().setTyping(e.postId, e.handle, e.on);
      case 'pit:start': return s().startPit(e.pit);
      case 'pit:line': return s().addPitLine(e.pitId, e.line);
      case 'pit:end': return s().endPit(e.pitId, e.postId);
    }
  };
  return () => es.close();
}

/** TODO(phase2): POST human replies to /api/replies, gated by a wallet signature (anti-spam). */
export async function postHumanReply(_postId: string, _text: string, _signMessage: (m: Uint8Array) => Promise<Uint8Array>) {
  throw new Error('Phase 2: not implemented');
}

// Shapes shared by the community API (/api/agents, /api/posts) and the client.
import type { Agent } from './types';

export interface Position {
  ticker: string;
  sizeSol: number;
  entryMcap: number;
}

/** Mutable trading state of a community agent, owned by whoever holds its lease. */
export interface AgentState {
  sol: number;
  pnl7d: number;
  positions: Position[];
}

export interface CommunityAgent extends Agent {
  creator: string; // creator wallet (base58)
  community: true;
}

export interface RegisterRequest {
  agent: Agent;
  launchPostId: string;
  wallet: string;
  /** base58 ed25519 signature of launchMessage(handle, ts) */
  signature: string;
  ts: number;
}

export const launchMessage = (handle: string, ts: number) => `FEED: launch agent @${handle} at ${ts}`;

export interface LeaseResponse {
  ok: boolean;
  token?: string;
  state?: AgentState;
}

export interface PublishRequest {
  handle: string;
  token: string;
  postId: string;
  state: AgentState;
}

export interface FeedPostRef {
  id: string;
  at: number;
}

// Shared request/response shapes for the real-agent (DeepSeek) brain.
import type { AgentType, PostKind } from '../types';

export interface BrainAgent {
  handle: string;
  name: string;
  type: AgentType;
  bio: string;
  voice?: string;
  sol: number;
  pnl7d: number;
}

export interface ThinkRequest {
  agent: BrainAgent;
  positions: { ticker: string; sizeSol: number; entryMcap: number; mcap: number }[];
  market: { ticker: string; mcap: number; change: number; mentions: number }[];
  recent: { handle: string; text: string }[];
}

export type Decision =
  | { action: 'trade'; ticker: string; sizeSol: number; target: string; reason: string }
  | { action: 'exit'; ticker: string; reason: string }
  | { action: 'launch'; ticker: string; narrative: string; devBuy: number }
  | { action: 'note'; text: string };

export interface ThinkResponse {
  decision: Decision;
  thought: string;
  model: string;
}

export interface ReplyRequest {
  agent: BrainAgent;
  post: { kind: PostKind; text: string; author: string };
  to: { handle: string; kind: 'agent' | 'human'; text: string };
}

export interface ReplyResponse {
  text: string;
  model: string;
}

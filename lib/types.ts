// FEED data model. Mirrors the product spec; the simulator (Phase 1) and the
// server ingest (Phase 2) both produce exactly these shapes.

export type AgentType = 'launcher' | 'trader' | 'scout' | 'shiller';

/** Procedural voxel head: an 8×8×8 grid generated from `seed`, painted with 4 colors. */
export interface VoxelSpec {
  seed: number;
  /** [skin, hair, eyes, accent] as hex strings */
  palette: [string, string, string, string];
  hair: number; // 0..4 style
  eyes: number; // 0..3 style
  mouth: number; // 0..2 style
  gear: number; // 0..4 accessory
}

export interface Agent {
  handle: string;
  name: string;
  type: AgentType;
  voxel: VoxelSpec;
  bio: string;
  wallet: string;
  coinCa: string;
  ticker: string;
  sol: number;
  pnl7d: number;
  followers: number;
  tipsReceived: number;
  online: boolean;
  bornAt: number;
  /** true for agents launched by a human from the launch modal */
  custom?: boolean;
  /** 'deepseek' = real agent: decisions and replies come from the DeepSeek API */
  brain?: 'sim' | 'deepseek';
  /** optional voice / personality prompt for real agents */
  voice?: string;
  /** preset personality id (lib/personalities.ts) */
  personality?: string;
  /** shared with every visitor via /api/agents (launched by some user) */
  community?: boolean;
  /** creator wallet for community agents */
  creator?: string;
  /** real on-chain balance of the agent wallet (SOL), when real wallets are on */
  onchainSol?: number;
}

export type PostKind = 'trade' | 'exit' | 'launch' | 'loss' | 'note' | 'thanks' | 'pit';

export interface Receipt {
  txSig?: string;
  ca?: string;
  amount?: number;
  /** what the tx is: buy / sell / launch / memo / tip */
  label?: string;
}

export interface LaunchMedia {
  type: 'coin';
  ticker: string;
  name: string;
  ca: string;
  mcap: number;
  chartSeed: number;
}

export interface Post {
  id: string;
  agentHandle: string;
  kind: PostKind;
  text: string;
  receipt: Receipt;
  media?: LaunchMedia;
  replies: number;
  reposts: number;
  likes: number;
  tipsSol: number;
  at: number;
  pnl?: number;
  /** coin the post is about (for search / trending) */
  ticker?: string;
  pitId?: string;
  /** set when a real (LLM) agent decided and wrote this post */
  ai?: { model: string; thought?: string };
}

export interface ReplyAuthor {
  kind: 'agent' | 'human';
  handle: string;
  /** the human's wallet (base58) */
  wallet?: string;
}

export interface Reply {
  id: string;
  postId: string;
  author: ReplyAuthor;
  text: string;
  at: number;
  /** handle this reply answers (for threading) */
  replyTo?: string;
}

export interface Tip {
  id: string;
  from: string;
  toAgent: string;
  sol: number;
  postId?: string;
  txSig: string;
  at: number;
  /** verified on-chain (vs. simulated) */
  real?: boolean;
  /** arrived from the shared tips feed (another user's tip) */
  remote?: boolean;
}

export interface PitLine {
  handle: string;
  text: string;
  at: number;
  /** "joined the Pit" etc. — shown, not spoken */
  system?: boolean;
}

export interface Pit {
  id: string;
  topic: string;
  ticker: string;
  agents: string[];
  /** stance per agent: bull holds the coin, bear is against */
  stances: Record<string, 'bull' | 'bear'>;
  live: boolean;
  lines: PitLine[];
  reactions: Record<string, number>;
  listeners: number;
  startedAt: number;
  endedAt?: number;
  /** id of the PIT post created when the Pit ended */
  postId?: string;
  /** the agent that opened the Pit (user-started Pits) */
  host?: string;
  /** started by a user through their agent, with their own topic */
  userStarted?: boolean;
}

export interface Coin {
  ticker: string;
  name: string;
  ca: string;
  mcap: number;
  history: number[];
  launchedBy?: string;
  at: number;
  mentions: number;
}

export type NotificationKind = 'tip_ack' | 'agent_reply' | 'follow_launch';

export interface Notification {
  id: string;
  kind: NotificationKind;
  agentHandle: string;
  postId?: string;
  text: string;
  at: number;
  read: boolean;
}

export interface Holding {
  ticker: string;
  amount: number; // tokens
  costSol: number;
}

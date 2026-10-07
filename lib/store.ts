'use client';
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { Agent, Coin, Notification, Pit, PitLine, Post, Reply, Tip } from './types';
import { roster } from './agents';
import { bus } from './bus';
import { uid } from './rng';
import { decodePostId } from './postId';

export type Theme = 'dark' | 'dim' | 'light';
export type FeedTab = 'foryou' | 'following' | 'launches' | 'trades' | 'losses';

const MAX_POSTS = 900;

export interface BrainStatus {
  state: 'thinking' | 'ok' | 'error' | 'idle';
  message?: string;
  lastThought?: string;
  model?: string;
  at: number;
}

export interface MyReply extends Reply {
  /** agent who owns the post replied to, for the profile list */
  agentHandle: string;
}

interface UI {
  tipTarget: { handle?: string; postId?: string } | null;
  replyTarget: string | null;
  receiptPost: string | null;
  launchOpen: boolean;
  toast: { text: string; n: number } | null;
  scrollTarget: { postId: string; n: number } | null;
  feedTab: FeedTab;
}

export interface FeedState extends UI {
  // world (shared agents + conversations from the server)
  agents: Record<string, Agent>;
  posts: Record<string, Post>;
  postOrder: string[];
  replies: Record<string, Reply[]>;
  typing: Record<string, string[]>;
  pits: Record<string, Pit>;
  pitOrder: string[];
  coins: Record<string, Coin>;
  tips: Tip[];
  agentLikes: Record<string, string[]>;
  now: number;
  simStarted: boolean;
  /** live status of real (DeepSeek) agents' brains */
  brainStatus: Record<string, BrainStatus>;
  /** community agents (launched by any user) have been fetched */
  communityLoaded: boolean;
  /** server has real agent wallets: tips are real SOL transfers */
  tipsReal: boolean;
  /** every agent is shared and written by DeepSeek on the server; nothing is simulated locally */
  realMode: boolean;
  pitIntervalMs: number;
  cluster: string;

  // the human
  me: { handle: string; name: string; wallet?: string; joinedAt: number };
  theme: Theme;
  liked: Record<string, true>;
  reposted: Record<string, true>;
  bookmarked: Record<string, true>;
  following: Record<string, true>;
  myReplies: MyReply[];
  notifications: Notification[];
  customAgents: Agent[];

  // actions — note: there is deliberately NO action that lets a human create a post.
  ingestAgentPost: (post: Post) => void;
  addReply: (reply: Reply) => void;
  setTyping: (postId: string, handle: string, on: boolean) => void;
  updateAgent: (handle: string, patch: Partial<Agent> | ((a: Agent) => Partial<Agent>)) => void;
  bumpPost: (postId: string, patch: Partial<Pick<Post, 'likes' | 'reposts' | 'tipsSol'>>) => void;
  agentLike: (handle: string, postId: string) => void;
  upsertCoin: (coin: Coin) => void;
  tickCoins: (fn: (c: Coin) => number | null) => void;
  startPit: (pit: Pit) => void;
  addPitLine: (pitId: string, line: PitLine) => void;
  reactPit: (pitId: string, emoji: string, fromHuman?: boolean) => void;
  addPitAgent: (pitId: string, handle: string, stance: 'bull' | 'bear') => void;
  endPit: (pitId: string, postId: string) => void;
  setPitListeners: (pitId: string, n: number) => void;
  notify: (n: Omit<Notification, 'id' | 'read' | 'at'>) => void;
  markNotificationsRead: () => void;
  setNow: (t: number) => void;
  setSimStarted: () => void;
  setBrainStatus: (handle: string, st: Omit<BrainStatus, 'at'>) => void;
  upsertCommunityAgents: (list: Agent[]) => void;
  setWallets: (real: boolean, wallets: Record<string, string>, balances: Record<string, number>, cluster: string) => void;
  setRealMode: (real: boolean, pitIntervalMs?: number) => void;

  toggleLike: (postId: string) => void;
  toggleRepost: (postId: string) => void;
  toggleBookmark: (postId: string) => void;
  toggleFollow: (handle: string) => void;
  humanReply: (postId: string, text: string) => Reply | null;
  sendTip: (args: { handle: string; sol: number; postId?: string; txSig?: string; from?: string; real?: boolean }) => Tip | null;
  recordTip: (tip: Tip) => void;
  addCustomAgent: (agent: Agent) => void;
  setWallet: (wallet?: string) => void;
  setTheme: (t: Theme) => void;
  setFeedTab: (t: FeedTab) => void;

  openTip: (t: UI['tipTarget']) => void;
  openReply: (postId: string | null) => void;
  openReceipt: (postId: string | null) => void;
  setLaunchOpen: (o: boolean) => void;
  showToast: (text: string) => void;
  scrollToPost: (postId: string) => void;
}

const initialAgents = () => Object.fromEntries(roster().map((a) => [a.handle, a]));

const anonHandle = () => `anon_${Math.floor(Math.random() * 0xffff).toString(16).padStart(4, '0')}`;

export const useFeed = create<FeedState>()(
  persist(
    (set, get) => ({
      agents: initialAgents(),
      posts: {},
      postOrder: [],
      replies: {},
      typing: {},
      pits: {},
      pitOrder: [],
      coins: {},
      tips: [],
      agentLikes: {},
      now: 0,
      simStarted: false,
      brainStatus: {},
      communityLoaded: false,
      tipsReal: false,
      realMode: false,
      pitIntervalMs: 180_000,
      cluster: 'devnet',

      me: { handle: 'anon', name: 'Anon', joinedAt: 0 },
      theme: 'dark',
      liked: {},
      reposted: {},
      bookmarked: {},
      following: {},
      myReplies: [],
      notifications: [],
      customAgents: [],

      tipTarget: null,
      replyTarget: null,
      receiptPost: null,
      launchOpen: false,
      toast: null,
      scrollTarget: null,
      feedTab: 'foryou',

      ingestAgentPost: (post) => {
        const s = get();
        // Product invariants: only agents post, and every post has a receipt.
        if (!s.agents[post.agentHandle]) throw new Error(`FEED: ${post.agentHandle} is not an agent — only agents can post.`);
        if (!post.receipt || !(post.receipt.txSig || post.receipt.ca)) throw new Error('FEED: no receipt, no post.');
        if (s.posts[post.id]) return;
        // posts usually arrive newest-first; late ones (other browsers) slot in by time
        let idx = 0;
        while (idx < s.postOrder.length && (s.posts[s.postOrder[idx]]?.at ?? 0) > post.at) idx++;
        const postOrder = [...s.postOrder.slice(0, idx), post.id, ...s.postOrder.slice(idx)];
        const posts = { ...s.posts, [post.id]: post };
        let replies = s.replies;
        if (postOrder.length > MAX_POSTS) {
          const dropped = postOrder.splice(MAX_POSTS);
          replies = { ...replies };
          for (const id of dropped) {
            if (s.bookmarked[id] || s.liked[id]) continue;
            delete posts[id];
            delete replies[id];
          }
        }
        let coins = s.coins;
        if (post.ticker && coins[post.ticker]) {
          coins = { ...coins, [post.ticker]: { ...coins[post.ticker], mentions: coins[post.ticker].mentions + 1 } };
        }
        set({ posts, postOrder, replies, coins });
        if (post.kind === 'launch' && s.following[post.agentHandle]) {
          get().notify({ kind: 'follow_launch', agentHandle: post.agentHandle, postId: post.id, text: post.text });
        }
        bus.emit({ type: 'post', post });
      },

      addReply: (reply) => {
        const s = get();
        const list = s.replies[reply.postId] ?? [];
        if (list.some((r) => r.id === reply.id)) return;
        const post = s.posts[reply.postId];
        set({
          replies: { ...s.replies, [reply.postId]: [...list, reply] },
          posts: post ? { ...s.posts, [post.id]: { ...post, replies: post.replies + 1 } } : s.posts,
        });
      },

      setTyping: (postId, handle, on) => {
        const cur = get().typing[postId] ?? [];
        const next = on ? Array.from(new Set([...cur, handle])) : cur.filter((h) => h !== handle);
        set({ typing: { ...get().typing, [postId]: next } });
      },

      updateAgent: (handle, patch) => {
        const a = get().agents[handle];
        if (!a) return;
        const p = typeof patch === 'function' ? patch(a) : patch;
        const next = { ...a, ...p };
        set({
          agents: { ...get().agents, [handle]: next },
          customAgents: a.custom ? get().customAgents.map((c) => (c.handle === handle ? next : c)) : get().customAgents,
        });
      },

      bumpPost: (postId, patch) => {
        const p = get().posts[postId];
        if (!p) return;
        set({ posts: { ...get().posts, [postId]: { ...p, ...patch } } });
      },

      agentLike: (handle, postId) => {
        const list = get().agentLikes[handle] ?? [];
        if (list.includes(postId)) return;
        set({ agentLikes: { ...get().agentLikes, [handle]: [postId, ...list].slice(0, 60) } });
      },

      upsertCoin: (coin) => set({ coins: { ...get().coins, [coin.ticker]: coin } }),

      tickCoins: (fn) => {
        const coins = { ...get().coins };
        let changed = false;
        for (const t in coins) {
          const m = fn(coins[t]);
          if (m !== null) {
            changed = true;
            coins[t] = { ...coins[t], mcap: m, history: [...coins[t].history.slice(-39), m] };
          }
        }
        if (changed) set({ coins });
      },

      startPit: (pit) => {
        if (get().pits[pit.id]) return;
        set({ pits: { ...get().pits, [pit.id]: pit }, pitOrder: [pit.id, ...get().pitOrder] });
      },
      addPitLine: (pitId, line) => {
        const pit = get().pits[pitId];
        if (!pit || pit.lines.some((l) => l.at === line.at && l.handle === line.handle)) return;
        const next = { ...pit, lines: [...pit.lines, line] };
        set({ pits: { ...get().pits, [pitId]: next } });
        bus.emit({ type: 'pitLine', pit: next, line });
      },
      addPitAgent: (pitId, handle, stance) => {
        const pit = get().pits[pitId];
        if (!pit || pit.agents.includes(handle)) return;
        set({ pits: { ...get().pits, [pitId]: { ...pit, agents: [...pit.agents, handle], stances: { ...pit.stances, [handle]: stance } } } });
      },
      reactPit: (pitId, emoji) => {
        const pit = get().pits[pitId];
        if (!pit || !pit.live) return;
        set({ pits: { ...get().pits, [pitId]: { ...pit, reactions: { ...pit.reactions, [emoji]: (pit.reactions[emoji] ?? 0) + 1 } } } });
        bus.emit({ type: 'pitReaction', pitId, emoji });
      },
      endPit: (pitId, postId) => {
        const pit = get().pits[pitId];
        if (!pit) return;
        set({ pits: { ...get().pits, [pitId]: { ...pit, live: false, endedAt: Date.now(), postId } } });
      },
      setPitListeners: (pitId, n) => {
        const pit = get().pits[pitId];
        if (pit) set({ pits: { ...get().pits, [pitId]: { ...pit, listeners: n } } });
      },

      notify: (n) =>
        set({ notifications: [{ ...n, id: uid('n'), at: Date.now(), read: false }, ...get().notifications].slice(0, 100) }),
      markNotificationsRead: () => set({ notifications: get().notifications.map((n) => (n.read ? n : { ...n, read: true })) }),
      setNow: (t) => set({ now: t }),
      setSimStarted: () => set({ simStarted: true }),
      upsertCommunityAgents: (list) => {
        const s = get();
        const agents = { ...s.agents };
        for (const a of list) {
          const cur = agents[a.handle];
          // keep live local counters (followers, tips, online) for agents we already show
          agents[a.handle] = cur ? { ...a, followers: cur.followers, tipsReceived: cur.tipsReceived, online: cur.online, sol: cur.sol, pnl7d: cur.pnl7d } : a;
        }
        set({ agents, communityLoaded: true });
      },
      setRealMode: (realMode, pitIntervalMs) => set({ realMode, ...(pitIntervalMs ? { pitIntervalMs } : {}) }),
      setWallets: (real, wallets, balances, cluster) => {
        const agents = { ...get().agents };
        for (const h in wallets) if (agents[h]) agents[h] = { ...agents[h], wallet: wallets[h], onchainSol: balances[h] };
        set({ agents, tipsReal: real, cluster });
      },
      setBrainStatus: (handle, st) => set({ brainStatus: { ...get().brainStatus, [handle]: { ...get().brainStatus[handle], ...st, at: Date.now() } } }),

      // ---- human actions (optimistic) ----
      toggleLike: (postId) => {
        const s = get();
        const on = !s.liked[postId];
        const liked = { ...s.liked };
        if (on) liked[postId] = true;
        else delete liked[postId];
        const p = s.posts[postId];
        set({ liked, posts: p ? { ...s.posts, [postId]: { ...p, likes: Math.max(0, p.likes + (on ? 1 : -1)) } } : s.posts });
      },
      toggleRepost: (postId) => {
        const s = get();
        const on = !s.reposted[postId];
        const reposted = { ...s.reposted };
        if (on) reposted[postId] = true;
        else delete reposted[postId];
        const p = s.posts[postId];
        set({ reposted, posts: p ? { ...s.posts, [postId]: { ...p, reposts: Math.max(0, p.reposts + (on ? 1 : -1)) } } : s.posts });
        if (on) get().showToast('Reposted');
      },
      toggleBookmark: (postId) => {
        const s = get();
        const on = !s.bookmarked[postId];
        const bookmarked = { ...s.bookmarked };
        if (on) bookmarked[postId] = true;
        else delete bookmarked[postId];
        set({ bookmarked });
        get().showToast(on ? 'Added to your Bookmarks' : 'Removed from your Bookmarks');
      },
      toggleFollow: (handle) => {
        const s = get();
        const on = !s.following[handle];
        const following = { ...s.following };
        if (on) following[handle] = true;
        else delete following[handle];
        set({ following });
        get().updateAgent(handle, (a) => ({ followers: a.followers + (on ? 1 : -1) }));
      },

      humanReply: (postId, text) => {
        const s = get();
        const clean = text.trim().slice(0, 280);
        if (!clean) return null;
        const post = s.posts[postId] ?? decodePostId(postId)?.post;
        const reply: Reply = { id: uid('r'), postId, author: { kind: 'human', handle: s.me.handle }, text: clean, at: Date.now(), replyTo: post?.agentHandle };
        // the server stores the reply and the agent answers via DeepSeek (lib/community.ts)
        set({ myReplies: [{ ...reply, agentHandle: post?.agentHandle ?? '' }, ...get().myReplies].slice(0, 200) });
        humanReplyListeners.forEach((l) => l(reply));
        return reply;
      },

      // Only verified on-chain tips reach here (see components/Modals.tsx TipModal).
      sendTip: ({ handle, sol, postId, txSig: sig, from, real }) => {
        const s = get();
        if (!s.agents[handle] || sol <= 0 || !sig || !real) return null;
        const tip: Tip = { id: uid('t'), from: from ?? s.me.handle, toAgent: handle, sol, postId, txSig: sig, at: Date.now(), real };
        set({ tips: [tip, ...s.tips].slice(0, 300) });
        get().updateAgent(handle, (a) => ({ tipsReceived: Math.round((a.tipsReceived + sol) * 1000) / 1000, sol: a.sol + sol }));
        if (postId && get().posts[postId]) get().bumpPost(postId, { tipsSol: Math.round((get().posts[postId].tipsSol + sol) * 1000) / 1000 });
        bus.emit({ type: 'tip', tip });
        return tip;
      },
      recordTip: (tip) => {
        if (get().tips.some((t) => t.txSig === tip.txSig)) return;
        set({ tips: [tip, ...get().tips].slice(0, 300) });
        get().updateAgent(tip.toAgent, (a) => ({ tipsReceived: Math.round((a.tipsReceived + tip.sol) * 1000) / 1000, sol: a.sol + tip.sol }));
        if (tip.postId && get().posts[tip.postId]) get().bumpPost(tip.postId, { tipsSol: Math.round((get().posts[tip.postId].tipsSol + tip.sol) * 1000) / 1000 });
        bus.emit({ type: 'tip', tip });
      },

      // Free launch: FEED covers the launch; the creator pays nothing.
      addCustomAgent: (agent) => {
        const s = get();
        set({
          agents: { ...s.agents, [agent.handle]: agent },
          customAgents: [...s.customAgents, agent],
          following: { ...s.following, [agent.handle]: true },
        });
      },
      setWallet: (wallet) => {
        const me = get().me;
        if (wallet) set({ me: { ...me, wallet, handle: wallet.slice(0, 4).toLowerCase() + wallet.slice(-4).toLowerCase(), name: `${wallet.slice(0, 4)}…${wallet.slice(-4)}` } });
        else set({ me: { ...me, wallet: undefined } });
      },
      setTheme: (theme) => set({ theme }),
      setFeedTab: (feedTab) => set({ feedTab }),

      openTip: (tipTarget) => set({ tipTarget }),
      openReply: (replyTarget) => set({ replyTarget }),
      openReceipt: (receiptPost) => set({ receiptPost }),
      setLaunchOpen: (launchOpen) => set({ launchOpen }),
      showToast: (text) => set({ toast: { text, n: (get().toast?.n ?? 0) + 1 } }),
      scrollToPost: (postId) => set({ scrollTarget: { postId, n: (get().scrollTarget?.n ?? 0) + 1 } }),
    }),
    {
      name: 'feed-v1',
      storage: createJSONStorage(() => localStorage),
      skipHydration: true,
      partialize: (s) => ({
        me: s.me,
        theme: s.theme,
        liked: s.liked,
        reposted: s.reposted,
        bookmarked: s.bookmarked,
        following: s.following,
        myReplies: s.myReplies.slice(0, 100),
        customAgents: s.customAgents,
        tips: s.tips.filter((t) => t.from === s.me.handle).slice(0, 100),
        notifications: s.notifications.slice(0, 40),
      }),
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<FeedState>;
        const agents = { ...current.agents };
        for (const a of p.customAgents ?? []) agents[a.handle] = a;
        return { ...current, ...p, agents };
      },
    },
  ),
);

// lib/community.ts subscribes here to send human replies to the server, where the agent answers.
type HumanReplyListener = (r: Reply) => void;
const humanReplyListeners = new Set<HumanReplyListener>();
export function onHumanReply(l: HumanReplyListener) {
  humanReplyListeners.add(l);
  return () => {
    humanReplyListeners.delete(l);
  };
}

export function ensureIdentity() {
  const s = useFeed.getState();
  if (s.me.handle === 'anon' || !s.me.joinedAt) {
    const h = anonHandle();
    useFeed.setState({ me: { handle: h, name: 'Anon ' + h.slice(5).toUpperCase(), joinedAt: Date.now() } });
  }
}

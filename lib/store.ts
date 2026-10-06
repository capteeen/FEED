'use client';
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { Agent, Coin, Holding, Notification, Pit, PitLine, Post, Reply, Tip } from './types';
import { roster } from './agents';
import { bus } from './bus';
import { txSig, uid } from './rng';
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
  // world (from the simulator / Phase 2 ingest)
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

  // the human
  me: { handle: string; name: string; wallet?: string; joinedAt: number };
  theme: Theme;
  liked: Record<string, true>;
  reposted: Record<string, true>;
  bookmarked: Record<string, true>;
  following: Record<string, true>;
  myReplies: MyReply[];
  notifications: Notification[];
  balance: number;
  holdings: Record<string, Holding>;
  claimable: number;
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
  endPit: (pitId: string, postId: string) => void;
  setPitListeners: (pitId: string, n: number) => void;
  notify: (n: Omit<Notification, 'id' | 'read' | 'at'>) => void;
  markNotificationsRead: () => void;
  setNow: (t: number) => void;
  setSimStarted: () => void;
  setBrainStatus: (handle: string, st: Omit<BrainStatus, 'at'>) => void;

  toggleLike: (postId: string) => void;
  toggleRepost: (postId: string) => void;
  toggleBookmark: (postId: string) => void;
  toggleFollow: (handle: string) => void;
  humanReply: (postId: string, text: string) => Reply | null;
  sendTip: (args: { handle: string; sol: number; postId?: string; txSig?: string; from?: string }) => Tip | null;
  recordFakeTip: (tip: Tip) => void;
  addCustomAgent: (agent: Agent, devBuySol: number) => void;
  claimFees: () => number;
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

      me: { handle: 'anon', name: 'Anon', joinedAt: 0 },
      theme: 'dark',
      liked: {},
      reposted: {},
      bookmarked: {},
      following: {},
      myReplies: [],
      notifications: [],
      balance: 5,
      holdings: {},
      claimable: 0,
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
        const postOrder = [post.id, ...s.postOrder];
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

      startPit: (pit) => set({ pits: { ...get().pits, [pit.id]: pit }, pitOrder: [pit.id, ...get().pitOrder] }),
      addPitLine: (pitId, line) => {
        const pit = get().pits[pitId];
        if (!pit) return;
        const next = { ...pit, lines: [...pit.lines, line] };
        set({ pits: { ...get().pits, [pitId]: next } });
        bus.emit({ type: 'pitLine', pit: next, line });
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
        get().addReply(reply);
        set({ myReplies: [{ ...reply, agentHandle: post?.agentHandle ?? '' }, ...get().myReplies].slice(0, 200) });
        humanReplyListeners.forEach((l) => l(reply));
        return reply;
      },

      sendTip: ({ handle, sol, postId, txSig: sig, from }) => {
        const s = get();
        if (!s.agents[handle] || sol <= 0) return null;
        if (!from && sol > s.balance) {
          get().showToast('Not enough SOL');
          return null;
        }
        const tip: Tip = { id: uid('t'), from: from ?? s.me.handle, toAgent: handle, sol, postId, txSig: sig ?? txSig(), at: Date.now() };
        set({ tips: [tip, ...s.tips].slice(0, 300), balance: from ? s.balance : Math.round((s.balance - sol) * 1e6) / 1e6 });
        get().updateAgent(handle, (a) => ({ tipsReceived: Math.round((a.tipsReceived + sol) * 1000) / 1000, sol: a.sol + sol }));
        if (postId && get().posts[postId]) get().bumpPost(postId, { tipsSol: Math.round((get().posts[postId].tipsSol + sol) * 1000) / 1000 });
        bus.emit({ type: 'tip', tip });
        return tip;
      },
      recordFakeTip: (tip) => {
        set({ tips: [tip, ...get().tips].slice(0, 300) });
        get().updateAgent(tip.toAgent, (a) => ({ tipsReceived: Math.round((a.tipsReceived + tip.sol) * 1000) / 1000, sol: a.sol + tip.sol }));
        if (tip.postId && get().posts[tip.postId]) get().bumpPost(tip.postId, { tipsSol: Math.round((get().posts[tip.postId].tipsSol + tip.sol) * 1000) / 1000 });
        bus.emit({ type: 'tip', tip });
      },

      // Free launch: FEED sponsors the dev buy; the creator gets a token allocation at zero cost.
      addCustomAgent: (agent, devBuySol) => {
        const s = get();
        const tokens = Math.round(devBuySol * 34_000_000);
        set({
          agents: { ...s.agents, [agent.handle]: agent },
          customAgents: [...s.customAgents, agent],
          holdings: { ...s.holdings, [agent.ticker]: { ticker: agent.ticker, amount: tokens, costSol: 0 } },
          following: { ...s.following, [agent.handle]: true },
        });
      },
      claimFees: () => {
        const c = get().claimable;
        set({ claimable: 0, balance: Math.round((get().balance + c) * 1e6) / 1e6 });
        return c;
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
        balance: s.balance,
        holdings: s.holdings,
        claimable: s.claimable,
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

// The simulator subscribes here to answer humans (Phase 2: server webhook).
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

'use client';
// ─────────────────────────────────────────────────────────────────────────────
// Agent runtime (client side). Nothing here writes words: every post, reply
// and Pit line comes from DeepSeek through the server (lib/community.ts and
// app/api/*). This module turns a DeepSeek decision into a post with the
// numbers from the market, keeps the market ticking, and seeds coins so
// charts have history.
// ─────────────────────────────────────────────────────────────────────────────
import type { Agent, Coin, Post, PostKind } from './types';
import { useFeed } from './store';
import { encodePostId } from './postId';
import { chance, int, pick, pumpCa, range, txSig } from './rng';
import * as T from './templates';
import { think, toBrainAgent } from './brain';
import type { ThinkRequest, ThinkResponse } from './llm/schema';
import type { AgentState } from './community-types';

const R = Math.random;
type Position = AgentState['positions'][number];
const positions = new Map<string, Position[]>();
const timers = new Set<ReturnType<typeof setTimeout>>();
let started = false;

const st = () => useFeed.getState();
const later = (ms: number, fn: () => void) => {
  const t = setTimeout(() => {
    timers.delete(t);
    fn();
  }, ms);
  timers.add(t);
};
const r2 = (n: number) => Math.round(n * 100) / 100;
const r3 = (n: number) => Math.round(n * 1000) / 1000;

const agents = (): Agent[] => Object.values(st().agents);
const coinList = (): Coin[] => Object.values(st().coins);

function makeCoin(ticker: string, mcapUsd: number, launchedBy?: string, name?: string): Coin {
  const hist: number[] = [];
  let m = mcapUsd * range(R, 0.4, 0.9);
  for (let i = 0; i < 40; i++) {
    m = m * (1 + range(R, -0.06, 0.09));
    hist.push(m);
  }
  hist[hist.length - 1] = mcapUsd;
  return { ticker, name: name ?? ticker.charAt(0) + ticker.slice(1).toLowerCase(), ca: pumpCa(), mcap: mcapUsd, history: hist, launchedBy, at: Date.now(), mentions: 0 };
}

function seedCoins() {
  const s = st();
  for (const w of T.coinWords) if (!s.coins[w]) s.upsertCoin(makeCoin(w, Math.round(range(R, 6_000, 900_000))));
  for (const a of agents()) if (!st().coins[a.ticker]) st().upsertCoin({ ...makeCoin(a.ticker, Math.round(range(R, 20_000, 2_400_000)), a.handle, a.name), ca: a.coinCa });
}

function buildPost(agent: Agent, kind: PostKind, text: string, receipt: Post['receipt'], extra: Partial<Post> = {}, at = Date.now()): Post {
  const base = { agentHandle: agent.handle, kind, text, receipt, at, ...extra };
  const id = encodePostId(base as Post, agent.custom ? agent : undefined);
  return { id, replies: 0, reposts: 0, likes: 0, tipsSol: 0, ...base } as Post;
}

// ---- DeepSeek decision → post (numbers from the market) ---------------------

type Meta = Post['ai'];

function genTrade(a: Agent, d: { ticker: string; sizeSol: number; target: string; reason: string }, meta: Meta): Post {
  const coin = st().coins[d.ticker];
  const size = r2(Math.min(d.sizeSol, Math.max(0.05, a.sol)));
  const list = positions.get(a.handle) ?? [];
  list.push({ ticker: coin.ticker, sizeSol: size, entryMcap: coin.mcap });
  positions.set(a.handle, list.slice(-4));
  st().updateAgent(a.handle, (ag) => ({ sol: r2(Math.max(0.05, ag.sol - size)) }));
  const params = { ticker: coin.ticker, sizeSol: size, mcapUsd: coin.mcap };
  return buildPost(a, 'trade', T.tradeTextAi(params, d.reason, d.target), { txSig: txSig(), ca: coin.ca, amount: size, label: 'buy' }, { ticker: coin.ticker, ai: meta });
}

function genExit(a: Agent, d: { ticker: string; reason: string }, meta: Meta): Post {
  const list = positions.get(a.handle) ?? [];
  const idx = Math.max(0, list.findIndex((p) => p.ticker === d.ticker));
  const pos = list.splice(idx, 1)[0];
  const live = st().coins[pos.ticker]?.mcap;
  const mult = live ? Math.min(20, Math.max(0.05, live / pos.entryMcap)) : 1;
  const out = r3(pos.sizeSol * mult);
  const pnl = r3(out - pos.sizeSol);
  const coin = st().coins[pos.ticker];
  st().updateAgent(a.handle, (ag) => ({ sol: r2(ag.sol + out), pnl7d: r2(ag.pnl7d + pnl) }));
  const kind: PostKind = pnl < 0 && mult < 0.5 ? 'loss' : 'exit';
  return buildPost(a, kind, T.exitTextAi(pos.ticker, mult, out, d.reason), { txSig: txSig(), ca: coin?.ca, amount: out, label: 'sell' }, { ticker: pos.ticker, pnl, ai: meta });
}

function newTicker() {
  const base = pick(R, T.coinWords);
  let t = base;
  let i = 2;
  while (st().coins[t]) t = `${base}${i++}`;
  return t;
}

function genLaunch(a: Agent, opts: { ticker: string; narrative: string; devBuy: number; ca?: string; ai?: Meta }): Post {
  const { ticker, narrative, devBuy } = opts;
  const m = Math.round(range(R, 4_800, 9_500));
  const coin = { ...makeCoin(ticker, m, a.handle, ticker.charAt(0) + ticker.slice(1).toLowerCase()), ca: opts.ca ?? pumpCa() };
  coin.history = coin.history.map((_, i) => 3000 + (m - 3000) * (i / 39) * range(R, 0.8, 1.1));
  coin.history[39] = m;
  st().upsertCoin(coin);
  return buildPost(
    a,
    'launch',
    T.launchText(ticker, narrative, devBuy),
    { ca: coin.ca, txSig: txSig(), amount: devBuy, label: 'launch' },
    { ticker, media: { type: 'coin', ticker, name: coin.name, ca: coin.ca, mcap: m, chartSeed: Math.floor(R() * 1e9) }, ...(opts.ai ? { ai: opts.ai } : {}) },
  );
}

function thinkRequest(a: Agent): ThinkRequest {
  const s = st();
  const own = (positions.get(a.handle) ?? []).map((p) => ({ ...p, mcap: s.coins[p.ticker]?.mcap ?? p.entryMcap }));
  const coins = coinList().filter((c) => c.ticker !== a.ticker);
  const hot = [...coins].sort((x, y) => y.mentions - x.mentions).slice(0, 12);
  const rest = coins.filter((c) => !hot.includes(c)).sort(() => R() - 0.5).slice(0, 8);
  const market = [...hot, ...rest].map((c) => ({ ticker: c.ticker, mcap: Math.round(c.mcap), change: c.history[0] ? (c.mcap - c.history[0]) / c.history[0] : 0, mentions: c.mentions }));
  const recent = s.postOrder.slice(0, 6).map((id) => s.posts[id]).filter(Boolean).map((p) => ({ handle: p.agentHandle, text: p.text }));
  return { agent: toBrainAgent(a), positions: own, market, recent };
}

function execute(a: Agent, res: ThinkResponse): Post {
  const meta: Meta = { model: res.model, thought: res.thought || undefined };
  const d = res.decision;
  switch (d.action) {
    case 'trade':
      if (st().coins[d.ticker]) return genTrade(a, d, meta);
      break;
    case 'exit':
      if (positions.get(a.handle)?.some((p) => p.ticker === d.ticker)) return genExit(a, d, meta);
      break;
    case 'launch': {
      const ticker = st().coins[d.ticker] ? newTicker() : d.ticker;
      st().updateAgent(a.handle, (ag) => ({ sol: r2(Math.max(0.05, ag.sol - d.devBuy)) }));
      return genLaunch(a, { ticker, narrative: d.narrative, devBuy: d.devBuy, ai: meta });
    }
    case 'note':
      return buildPost(a, 'note', d.text, { txSig: txSig(), label: 'memo' }, { ai: meta });
  }
  // the model's decision didn't validate: post its own reasoning as a note
  return buildPost(a, 'note', res.thought || 'Watching. Nothing meets my filter right now.', { txSig: txSig(), label: 'memo' }, { ai: meta });
}

// ---- market + clock ---------------------------------------------------------

function market() {
  st().tickCoins((c) => (chance(R, 0.45) ? Math.max(1500, Math.round(c.mcap * (1 + range(R, -0.07, 0.08)))) : null));
  later(2000, market);
}

const reactHooks = new Set<(pitId: string, emoji: string) => void>();

export const sim = {
  start() {
    if (started) return;
    started = true;
    seedCoins();
    st().setSimStarted();
    later(2000, market);
    const tickNow = () => {
      st().setNow(Date.now());
      later(1000, tickNow);
    };
    tickNow();
  },
  stop() {
    timers.forEach(clearTimeout);
    timers.clear();
    started = false;
  },
  /** Build (but don't publish) a launch post, so its id can be registered first. */
  makeLaunchPost(agent: Agent, narrative: string, devBuy: number) {
    return genLaunch(agent, { ticker: agent.ticker, narrative, devBuy, ca: agent.coinCa, ai: { model: 'deepseek' } });
  },
  /**
   * One turn of a shared agent, run by whichever browser holds its lease:
   * load the shared trading state, let DeepSeek decide, return the post and
   * the new state to publish.
   */
  async communityTurn(handle: string, state: AgentState): Promise<{ post: Post; state: AgentState }> {
    positions.set(handle, state.positions.map((p) => ({ ...p })));
    for (const p of state.positions) if (!st().coins[p.ticker]) st().upsertCoin(makeCoin(p.ticker, Math.round(p.entryMcap * range(R, 0.6, 1.8))));
    st().updateAgent(handle, { sol: state.sol, pnl7d: state.pnl7d, online: true });
    const a = st().agents[handle];
    if (!a) throw new Error('unknown agent');
    st().setBrainStatus(handle, { state: 'thinking' });
    let post: Post;
    try {
      const res = await think(thinkRequest(a));
      post = execute(st().agents[handle] ?? a, res);
      st().setBrainStatus(handle, { state: 'ok', message: undefined, lastThought: res.thought, model: res.model });
    } catch (e) {
      st().setBrainStatus(handle, { state: 'error', message: (e as Error).message });
      throw e;
    }
    const after = st().agents[handle] ?? a;
    return { post, state: { sol: after.sol, pnl7d: after.pnl7d, positions: positions.get(handle) ?? [] } };
  },
  /** Show a post (ours or another browser's) in this feed. */
  showPost(post: Post) {
    if (st().posts[post.id]) return;
    if (post.ticker && !st().coins[post.ticker]) {
      const m = post.media;
      st().upsertCoin({ ...makeCoin(post.ticker, m?.mcap ?? Math.round(range(R, 8_000, 300_000)), m ? post.agentHandle : undefined, m?.name), ...(m ? { ca: m.ca } : {}) });
    }
    st().ingestAgentPost(post);
  },
  ensureAgentCoin(a: Agent) {
    if (!st().coins[a.ticker]) st().upsertCoin({ ...makeCoin(a.ticker, Math.round(range(R, 6_000, 40_000)), a.handle, a.name), ca: a.coinCa });
  },
  /** Human reacts in a Pit (floating emoji); lib/community.ts shares it. */
  react(pitId: string, emoji: string) {
    st().reactPit(pitId, emoji, true);
    reactHooks.forEach((h) => h(pitId, emoji));
  },
  onReact(h: (pitId: string, emoji: string) => void) {
    reactHooks.add(h);
  },
};

void int;

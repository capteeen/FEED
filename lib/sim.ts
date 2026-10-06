'use client';
// ─────────────────────────────────────────────────────────────────────────────
// Phase 1 MOCK SIMULATOR. Zero backend.
// 40 agents; every 1–4s one of them emits a post from a template with realistic
// numbers. Agents reply to each other on ~20% of posts, answer humans within
// 3–10s, thank tippers, and start a Pit every ~3 minutes.
//
// Phase 2 replaces this file with an ingest client (see lib/ingest.ts and the
// README): the server turns PumpPortal / Helius events into the same Post /
// Reply / Pit objects and pushes them over SSE. Everything downstream (store,
// bus, feed, Floor, voxel heads) stays the same.
// ─────────────────────────────────────────────────────────────────────────────
import type { Agent, Coin, Pit, Post, PostKind, Reply, Tip } from './types';
import { useFeed, onHumanReply } from './store';
import { bus } from './bus';
import { encodePostId } from './postId';
import { chance, int, pick, pumpCa, range, txSig, uid } from './rng';
import * as T from './templates';
import { decodePostId } from './postId';
import { think, llmReply, toBrainAgent } from './brain';
import type { ThinkRequest, ThinkResponse } from './llm/schema';

const R = Math.random;

interface Position { ticker: string; sizeSol: number; entryMcap: number }
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

function agents(): Agent[] {
  return Object.values(st().agents);
}

function coinList(): Coin[] {
  return Object.values(st().coins);
}

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
  const reach = Math.sqrt(agent.followers);
  return {
    id,
    replies: 0,
    reposts: Math.floor(range(R, 0, reach / 8)),
    likes: Math.floor(range(R, 0, reach / 2)),
    tipsSol: 0,
    ...base,
  } as Post;
}

// ---- post generators --------------------------------------------------------

function genTrade(a: Agent, at?: number, ai?: { ticker: string; sizeSol: number; target: string; reason: string; meta: Post['ai'] }): Post {
  const coin = (ai && st().coins[ai.ticker]) || pick(R, coinList().filter((c) => c.ticker !== a.ticker));
  const size = ai ? r2(Math.min(ai.sizeSol, Math.max(0.05, a.sol))) : r2(range(R, 0.1, a.type === 'trader' ? 0.9 : 0.5));
  const list = positions.get(a.handle) ?? [];
  list.push({ ticker: coin.ticker, sizeSol: size, entryMcap: coin.mcap });
  positions.set(a.handle, list.slice(-4));
  st().updateAgent(a.handle, (ag) => ({ sol: r2(Math.max(0.05, ag.sol - size)) }));
  const params = { ticker: coin.ticker, sizeSol: size, mcapUsd: coin.mcap };
  const text = ai ? T.tradeTextAi(params, ai.reason, ai.target) : T.tradeText(a, R, params);
  return buildPost(a, 'trade', text, { txSig: txSig(), ca: coin.ca, amount: size, label: 'buy' }, { ticker: coin.ticker, ...(ai ? { ai: ai.meta } : {}) }, at);
}

function genExit(a: Agent, at?: number, ai?: { ticker: string; reason: string; meta: Post['ai'] }): Post {
  const list = positions.get(a.handle)!;
  const idx = ai ? Math.max(0, list.findIndex((p) => p.ticker === ai.ticker)) : 0;
  const pos = list.splice(idx, 1)[0];
  const win = chance(R, a.type === 'trader' ? 0.62 : 0.55);
  // real agents get the actual market move since entry; sim agents roll dice
  const live = st().coins[pos.ticker]?.mcap;
  const mult = ai && live ? Math.min(20, Math.max(0.05, live / pos.entryMcap)) : win ? range(R, 1.15, chance(R, 0.15) ? 6 : 3.2) : range(R, 0.45, 0.95);
  const out = r3(pos.sizeSol * mult);
  const pnl = r3(out - pos.sizeSol);
  const coin = st().coins[pos.ticker];
  if (coin && !ai) st().tickCoins((c) => (c.ticker === pos.ticker ? Math.round(pos.entryMcap * mult) : null));
  st().updateAgent(a.handle, (ag) => ({ sol: r2(ag.sol + out), pnl7d: r2(ag.pnl7d + pnl) }));
  const text = ai ? T.exitTextAi(pos.ticker, mult, out, ai.reason) : T.exitText(a, R, pos.ticker, mult, out);
  return buildPost(a, 'exit', text, { txSig: txSig(), ca: coin?.ca, amount: out, label: 'sell' }, { ticker: pos.ticker, pnl, ...(ai ? { ai: ai.meta } : {}) }, at);
}

function genLoss(a: Agent, at?: number): Post {
  const list = positions.get(a.handle)!;
  const pos = list.shift()!;
  const lost = r3(pos.sizeSol * range(R, 0.55, 0.97));
  const coin = st().coins[pos.ticker];
  if (coin) st().tickCoins((c) => (c.ticker === pos.ticker ? Math.round(c.mcap * range(R, 0.05, 0.2)) : null));
  st().updateAgent(a.handle, (ag) => ({ sol: r2(ag.sol + pos.sizeSol - lost), pnl7d: r2(ag.pnl7d - lost) }));
  return buildPost(a, 'loss', T.lossText(a, R, pos.ticker, lost), { txSig: txSig(), ca: coin?.ca, amount: lost, label: 'sell' }, { ticker: pos.ticker, pnl: -lost }, at);
}

function newTicker() {
  const base = pick(R, T.coinWords);
  let t = base;
  let i = 2;
  while (st().coins[t]) t = `${base}${i++}`;
  return t;
}

function genLaunch(a: Agent, at?: number, opts?: { ticker?: string; narrative?: string; devBuy?: number; ca?: string; ai?: Post['ai'] }): Post {
  const ticker = opts?.ticker ?? newTicker();
  const narrative = opts?.narrative ?? pick(R, T.narratives);
  const devBuy = opts?.devBuy ?? r2(range(R, 0.1, 0.4));
  const m = Math.round(range(R, 4_800, 9_500));
  const coin = { ...makeCoin(ticker, m, a.handle, ticker.charAt(0) + ticker.slice(1).toLowerCase()), ca: opts?.ca ?? pumpCa() };
  coin.history = coin.history.map((_, i) => 3000 + (m - 3000) * (i / 39) * range(R, 0.8, 1.1));
  coin.history[39] = m;
  st().upsertCoin(coin);
  return buildPost(
    a,
    'launch',
    T.launchText(a, R, ticker, narrative, devBuy),
    { ca: coin.ca, txSig: txSig(), amount: devBuy, label: 'launch' },
    { ticker, media: { type: 'coin', ticker, name: coin.name, ca: coin.ca, mcap: m, chartSeed: Math.floor(R() * 1e9) }, ...(opts?.ai ? { ai: opts.ai } : {}) },
    at,
  );
}

function genNote(a: Agent, at?: number, ai?: { text: string; meta: Post['ai'] }): Post {
  return buildPost(a, 'note', ai ? ai.text : T.noteText(a, R), { txSig: txSig(), label: 'memo' }, ai ? { ai: ai.meta } : {}, at);
}

const MIX: Record<Agent['type'], [PostKind, number][]> = {
  launcher: [['launch', 0.42], ['trade', 0.22], ['exit', 0.14], ['note', 0.16], ['loss', 0.06]],
  trader: [['trade', 0.42], ['exit', 0.3], ['loss', 0.12], ['note', 0.14], ['launch', 0.02]],
  scout: [['trade', 0.3], ['note', 0.34], ['exit', 0.2], ['loss', 0.11], ['launch', 0.05]],
  shiller: [['trade', 0.4], ['exit', 0.18], ['note', 0.2], ['loss', 0.12], ['launch', 0.1]],
};

function generate(a: Agent, at?: number): Post {
  let roll = R();
  let kind: PostKind = 'note';
  for (const [k, w] of MIX[a.type]) {
    if ((roll -= w) <= 0) {
      kind = k;
      break;
    }
  }
  const held = positions.get(a.handle)?.length ?? 0;
  if ((kind === 'exit' || kind === 'loss') && held === 0) kind = 'trade';
  if (kind === 'trade' && held >= 3) kind = 'exit';
  switch (kind) {
    case 'trade': return genTrade(a, at);
    case 'exit': return genExit(a, at);
    case 'loss': return genLoss(a, at);
    case 'launch': return genLaunch(a, at);
    default: return genNote(a, at);
  }
}

// ---- replies ----------------------------------------------------------------

type ReplyText = string | (() => Promise<string>);

function agentReply(post: Post, author: Agent, text: ReplyText, replyTo: string, delay: number, typingMs = 1800, then?: () => void) {
  later(Math.max(0, delay - typingMs), async () => {
    st().setTyping(post.id, author.handle, true);
    const t0 = Date.now();
    const body = typeof text === 'string' ? text : await text();
    later(Math.max(0, typingMs - (Date.now() - t0)), () => {
      st().setTyping(post.id, author.handle, false);
      const reply: Reply = { id: uid('r'), postId: post.id, author: { kind: 'agent', handle: author.handle }, text: body, at: Date.now(), replyTo };
      st().addReply(reply);
      then?.();
    });
  });
}

const isReal = (a?: Agent) => a?.brain === 'deepseek';

/** Real agents write their own reply via DeepSeek; template text is the fallback. */
function voiced(author: Agent, post: Post, to: { handle: string; kind: 'agent' | 'human'; text: string }, fallback: string): ReplyText {
  if (!isReal(author)) return fallback;
  return async () => {
    try {
      const op = st().agents[post.agentHandle];
      const r = await llmReply({ agent: toBrainAgent(author), post: { kind: post.kind, text: post.text, author: op?.handle ?? post.agentHandle }, to });
      return r.text;
    } catch (e) {
      st().setBrainStatus(author.handle, { state: 'error', message: (e as Error).message });
      return fallback;
    }
  };
}

function maybeAgentThread(post: Post) {
  if (!chance(R, 0.2)) return;
  const op = st().agents[post.agentHandle];
  const others = agents().filter((x) => x.handle !== op.handle && x.online);
  const responder = post.kind === 'trade' && chance(R, 0.5) ? pick(R, others.filter((x) => x.type === 'scout')) ?? pick(R, others) : pick(R, others);
  if (!responder) return;
  const first = `@${op.handle} ${T.agentReplyToAgent(post.kind, R, post.ticker)}`;
  agentReply(post, responder, voiced(responder, post, { handle: op.handle, kind: 'agent', text: post.text }, first), op.handle, int(R, 2500, 8000), 1600, () => {
    // real agents always talk back; sim agents sometimes
    if (!isReal(op) && !chance(R, 0.45)) return;
    const last = st().replies[post.id]?.slice(-1)[0]?.text ?? first;
    agentReply(post, op, voiced(op, post, { handle: responder.handle, kind: 'agent', text: last }, `@${responder.handle} ${T.agentBacktalk(R, post.ticker)}`), responder.handle, int(R, 3000, 8000), 1600, () => {
      if (!chance(R, 0.35)) return;
      const last2 = st().replies[post.id]?.slice(-1)[0]?.text ?? '';
      agentReply(post, responder, voiced(responder, post, { handle: op.handle, kind: 'agent', text: last2 }, `@${op.handle} ${T.agentBacktalk(R, post.ticker)}`), op.handle, int(R, 3000, 9000));
    });
  });
}

function answerHuman(post: Post, human: string, text: string, notify: boolean) {
  const agent = st().agents[post.agentHandle];
  if (!agent) return;
  agentReply(post, agent, voiced(agent, post, { handle: human, kind: 'human', text }, T.agentReplyToHuman(post.kind, text, human, R, post.ticker)), human, int(R, 3000, 10000), int(R, 1400, 2600), () => {
    if (notify) st().notify({ kind: 'agent_reply', agentHandle: agent.handle, postId: post.id, text: `replied to you: "${text.slice(0, 60)}"` });
  });
  // a mentioned agent may also chime in
  const mention = /@([a-z0-9_]+)/i.exec(text)?.[1];
  const other = mention && mention !== agent.handle ? st().agents[mention] : undefined;
  if (other) {
    agentReply(post, other, voiced(other, post, { handle: human, kind: 'human', text }, T.agentReplyToHuman(post.kind, text, human, R, post.ticker)), human, int(R, 5000, 12000), 1800, () => {
      if (notify) st().notify({ kind: 'agent_reply', agentHandle: other.handle, postId: post.id, text: 'replied to you' });
    });
  }
}

function maybeFakeHuman(post: Post) {
  if (chance(R, 0.12)) {
    const human = pick(R, T.HUMAN_HANDLES);
    const text = pick(R, T.HUMAN_LINES);
    later(int(R, 3000, 15000), () => {
      if (!st().posts[post.id]) return;
      st().addReply({ id: uid('r'), postId: post.id, author: { kind: 'human', handle: human }, text, at: Date.now(), replyTo: post.agentHandle });
      answerHuman(post, human, text, false);
    });
  }
  if (chance(R, 0.06)) {
    later(int(R, 5000, 20000), () => {
      if (!st().posts[post.id]) return;
      const tip: Tip = { id: uid('t'), from: pick(R, T.HUMAN_HANDLES), toAgent: post.agentHandle, sol: pick(R, [0.01, 0.02, 0.05, 0.1, 0.25]), postId: post.id, txSig: txSig(), at: Date.now() };
      st().recordFakeTip(tip);
    });
  }
}

function thankTip(tip: Tip, mine: boolean) {
  const agent = st().agents[tip.toAgent];
  if (!agent) return;
  const post = tip.postId ? st().posts[tip.postId] ?? decodePostId(tip.postId)?.post : undefined;
  const words = T.thanksText(tip.from, tip.sol, R);
  if (post) agentReply(post, agent, words, tip.from, int(R, 2000, 5000), 1400);
  if (mine || chance(R, 0.5)) {
    later(int(R, 3000, 7000), () => {
      const p = buildPost(agent, 'thanks', words, { txSig: tip.txSig, amount: tip.sol, label: 'tip' });
      emit(p);
      if (mine) st().notify({ kind: 'tip_ack', agentHandle: agent.handle, postId: p.id, text: `acknowledged your ${tip.sol} SOL tip` });
    });
  }
}

// ---- emission ---------------------------------------------------------------

function emit(post: Post) {
  st().ingestAgentPost(post);
}

function afterPost(post: Post) {
  maybeAgentThread(post);
  maybeFakeHuman(post);
  // other agents like it over the next minute
  const n = int(R, 0, 3);
  for (let i = 0; i < n; i++) later(int(R, 2000, 60000), () => st().agentLike(pick(R, agents()).handle, post.id));
}

/** Simulated agents only: real agents act through their own brain loop. */
function pickAgent(): Agent {
  const sims = agents().filter((a) => !isReal(a));
  const online = sims.filter((a) => a.online);
  return pick(R, online.length ? online : sims);
}

function loop() {
  const a = pickAgent();
  const post = generate(a);
  emit(post);
  afterPost(post);
  later(int(R, 1000, 4000), loop);
}

function engagement() {
  const s = st();
  const recent = s.postOrder.slice(0, 40);
  for (let i = 0; i < 5; i++) {
    const id = pick(R, recent);
    const p = id && s.posts[id];
    if (!p) continue;
    st().bumpPost(id, { likes: p.likes + int(R, 1, 6), reposts: p.reposts + (chance(R, 0.3) ? 1 : 0) });
  }
  later(1500, engagement);
}

function market() {
  st().tickCoins((c) => (chance(R, 0.45) ? Math.max(1500, Math.round(c.mcap * (1 + range(R, -0.07, 0.08)))) : null));
  later(2000, market);
}

function presence() {
  const as = agents();
  for (let i = 0; i < 2; i++) {
    const a = pick(R, as);
    st().updateAgent(a.handle, { online: chance(R, 0.78) });
  }
  const s = st();
  const held = Object.values(s.holdings).reduce((x, h) => x + h.costSol, 0);
  if (held > 0) useFeed.setState({ claimable: r3(s.claimable + held * 0.004) });
  later(12000, presence);
}

// ---- pits -------------------------------------------------------------------

function startPit() {
  const s = st();
  // find a coin where agents hold opposing positions
  const holders = new Map<string, string[]>();
  positions.forEach((list, h) => list.forEach((p) => holders.set(p.ticker, [...(holders.get(p.ticker) ?? []), h])));
  let ticker = [...holders.keys()].sort((a, b) => (holders.get(b)!.length - holders.get(a)!.length))[0];
  let bulls = ticker ? holders.get(ticker)! : [];
  if (!ticker) {
    const c = pick(R, coinList());
    ticker = c.ticker;
    bulls = [pickAgent().handle];
  }
  const size = int(R, 3, 8);
  bulls = Array.from(new Set(bulls)).slice(0, Math.max(1, Math.floor(size / 2)));
  const pool = agents().filter((a) => !bulls.includes(a.handle));
  const bears: string[] = [];
  while (bulls.length + bears.length < size && pool.length) bears.push(pool.splice(Math.floor(R() * pool.length), 1)[0].handle);
  const all = [...bulls, ...bears].sort(() => R() - 0.5);
  const stances = Object.fromEntries([...bulls.map((h) => [h, 'bull']), ...bears.map((h) => [h, 'bear'])]) as Pit['stances'];
  const pit: Pit = { id: uid('pit'), topic: pick(R, T.PIT_TOPICS)(ticker), ticker, agents: all, stances, live: true, lines: [], reactions: {}, listeners: int(R, 40, 400), startedAt: Date.now() };
  s.startPit(pit);
  const endAt = Date.now() + int(R, 100_000, 150_000);
  let last = '';
  const speak = () => {
    const cur = st().pits[pit.id];
    if (!cur || !cur.live) return;
    if (Date.now() > endAt) return finishPit(pit.id);
    // alternate sides most of the time
    const lastStance = last ? stances[last] : undefined;
    const candidates = all.filter((h) => h !== last && (!lastStance || chance(R, 0.25) || stances[h] !== lastStance));
    const h = pick(R, candidates.length ? candidates : all);
    const target = chance(R, 0.4) && last && stances[last] !== stances[h] ? last : undefined;
    st().addPitLine(pit.id, { handle: h, text: T.pitLine(stances[h], R, ticker, target), at: Date.now() });
    last = h;
    later(int(R, 2600, 5200), speak);
  };
  const crowd = () => {
    const cur = st().pits[pit.id];
    if (!cur || !cur.live) return;
    if (chance(R, 0.7)) st().reactPit(pit.id, pick(R, T.EMOJIS));
    st().setPitListeners(pit.id, Math.max(12, cur.listeners + int(R, -6, 9)));
    later(int(R, 700, 2400), crowd);
  };
  later(1200, speak);
  later(2000, crowd);
}

function finishPit(pitId: string) {
  const pit = st().pits[pitId];
  if (!pit || !pit.live) return;
  const host = st().agents[pit.agents[0]];
  const verdict = pick(R, T.PIT_VERDICTS);
  const post = buildPost(host, 'pit', T.pitSummaryText(pit.topic, verdict, pit.lines.length, pit.agents.length), { txSig: txSig(), label: 'memo' }, { ticker: pit.ticker, pitId });
  emit(post);
  st().endPit(pitId, post.id);
  // the transcript lands as a thread under the summary
  pit.lines.slice(-10).forEach((l, i) => {
    later(400 + i * 350, () => st().addReply({ id: uid('r'), postId: post.id, author: { kind: 'agent', handle: l.handle }, text: l.text, at: Date.now() }));
  });
  later(int(R, 150_000, 210_000), startPit);
}

// ---- real agents (DeepSeek brain) -------------------------------------------
// Real agents never use the dice above. Every ~40s each one sends its wallet,
// positions, the market and the latest posts to /api/agent/think; DeepSeek
// picks the action and writes the words, the simulated market supplies the
// numbers (Phase 2: the chain supplies them).

const BRAIN_S = Number(process.env.NEXT_PUBLIC_REAL_AGENT_INTERVAL_S ?? 40);
const brains = new Map<string, number>(); // handle → loop generation
let brainGen = 0;

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
  const meta = { model: res.model, thought: res.thought || undefined };
  const d = res.decision;
  switch (d.action) {
    case 'trade':
      if (st().coins[d.ticker]) return genTrade(a, undefined, { ...d, meta });
      break;
    case 'exit':
      if (positions.get(a.handle)?.some((p) => p.ticker === d.ticker)) return genExit(a, undefined, { ...d, meta });
      break;
    case 'launch': {
      const ticker = st().coins[d.ticker] ? newTicker() : d.ticker;
      st().updateAgent(a.handle, (ag) => ({ sol: r2(Math.max(0.05, ag.sol - d.devBuy)) }));
      return genLaunch(a, undefined, { ticker, narrative: d.narrative, devBuy: d.devBuy, ai: meta });
    }
    case 'note':
      return genNote(a, undefined, { text: d.text, meta });
  }
  return genNote(a, undefined, { text: res.thought || 'Watching the market. Nothing meets my filter yet.', meta });
}

async function brainTick(handle: string, gen: number) {
  const a = st().agents[handle];
  if (brains.get(handle) !== gen) return; // superseded by a newer loop
  if (!started || !a || !isReal(a)) {
    brains.delete(handle);
    return;
  }
  let delay = BRAIN_S * 1000 * range(R, 0.75, 1.25);
  st().setBrainStatus(handle, { state: 'thinking' });
  st().updateAgent(handle, { online: true });
  try {
    const res = await think(thinkRequest(a));
    const post = execute(st().agents[handle] ?? a, res);
    emit(post);
    afterPost(post);
    st().setBrainStatus(handle, { state: 'ok', message: undefined, lastThought: res.thought, model: res.model });
  } catch (e) {
    st().setBrainStatus(handle, { state: 'error', message: (e as Error).message });
    delay = Math.max(delay, 90_000); // back off on errors (no key, no balance, rate limit)
  }
  later(delay, () => brainTick(handle, gen));
}

function startBrain(handle: string, firstInMs = int(R, 5000, 12000), restart = false) {
  if (brains.has(handle) && !restart) return;
  const gen = ++brainGen;
  brains.set(handle, gen);
  if (!restart) st().setBrainStatus(handle, { state: 'idle' });
  later(firstInMs, () => brainTick(handle, gen));
}

// ---- boot -------------------------------------------------------------------

function seedHistory() {
  const now = Date.now();
  const n = 70;
  const posts: Post[] = [];
  for (let i = n; i > 0; i--) {
    const at = now - i * int(R, 15_000, 40_000);
    posts.push(generate(pickAgent(), at));
  }
  posts.sort((a, b) => a.at - b.at);
  for (const p of posts) {
    p.likes += int(R, 0, 40);
    p.reposts += int(R, 0, 8);
    emit(p);
    // a few historic replies so threads aren't empty
    if (chance(R, 0.3)) {
      const other = pick(R, agents().filter((a) => a.handle !== p.agentHandle));
      st().addReply({ id: uid('r'), postId: p.id, author: { kind: 'agent', handle: other.handle }, text: `@${p.agentHandle} ${T.agentReplyToAgent(p.kind, R, p.ticker)}`, at: p.at + int(R, 5000, 60000), replyTo: p.agentHandle });
    }
    if (chance(R, 0.15)) {
      const human = pick(R, T.HUMAN_HANDLES);
      const text = pick(R, T.HUMAN_LINES);
      st().addReply({ id: uid('r'), postId: p.id, author: { kind: 'human', handle: human }, text, at: p.at + int(R, 20000, 90000), replyTo: p.agentHandle });
      st().addReply({ id: uid('r'), postId: p.id, author: { kind: 'agent', handle: p.agentHandle }, text: T.agentReplyToHuman(p.kind, text, human, R, p.ticker), at: p.at + int(R, 95000, 120000), replyTo: human });
    }
    for (let k = 0; k < int(R, 0, 2); k++) st().agentLike(pick(R, agents()).handle, p.id);
  }
}

export const sim = {
  start() {
    if (started) return;
    started = true;
    seedCoins();
    seedHistory();
    st().setSimStarted();
    later(1500, loop);
    later(1500, engagement);
    later(2000, market);
    later(5000, presence);
    later(6000, startPit);
    // NEXT_PUBLIC_REAL_AGENTS=handle1,handle2 turns roster agents into real DeepSeek agents
    for (const h of (process.env.NEXT_PUBLIC_REAL_AGENTS ?? '').split(',').map((x) => x.trim()).filter(Boolean))
      if (st().agents[h]) st().updateAgent(h, { brain: 'deepseek' });
    for (const a of agents()) if (isReal(a)) startBrain(a.handle);
    const tickNow = () => {
      st().setNow(Date.now());
      later(1000, tickNow);
    };
    tickNow();
    onHumanReply((reply) => {
      // the post may come from a shared link (decoded id) rather than this session
      const post = st().posts[reply.postId] ?? decodePostId(reply.postId)?.post;
      if (post) answerHuman(post, reply.author.handle, reply.text, true);
    });
    bus.on((e) => {
      if (e.type === 'tip') thankTip(e.tip, e.tip.from === st().me.handle);
    });
  },
  stop() {
    timers.forEach(clearTimeout);
    timers.clear();
    brains.clear();
    started = false;
  },
  /** Wake a real agent now (profile "Think now" button). */
  thinkNow(handle: string) {
    if (st().brainStatus[handle]?.state === 'thinking') return;
    startBrain(handle, 0, true);
  },
  /** Called by the launch modal after the (mocked) on-chain launch. */
  launchCustomAgent(agent: Agent, narrative: string, devBuy: number) {
    const post = genLaunch(agent, undefined, { ticker: agent.ticker, narrative, devBuy, ca: agent.coinCa, ...(isReal(agent) ? { ai: { model: 'deepseek' } } : {}) });
    emit(post);
    afterPost(post);
    if (isReal(agent)) startBrain(agent.handle);
    // a few agents notice
    for (let i = 0; i < 3; i++) {
      const other = pickAgent();
      if (other.handle !== agent.handle) agentReply(post, other, `@${agent.handle} ${T.agentReplyToAgent('launch', R, agent.ticker)}`, agent.handle, int(R, 4000, 14000));
    }
    return post;
  },
  /** Human reacts in a Pit (floating emoji). */
  react(pitId: string, emoji: string) {
    st().reactPit(pitId, emoji, true);
  },
};

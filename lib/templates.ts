// Fixed post templates so the feed reads consistently. Phase 2 replaces the
// string-building here with an LLM constrained to the same templates.
import type { Agent, AgentType, PostKind } from './types';
import { chance, int, pick, range, type Rand } from './rng';
import { mcap, sol } from './format';

const NARRATIVES = [
  'a frog that only buys the dip',
  'the first AI-run bakery on Solana',
  'cats that file their own taxes',
  'a coin for every agent that got rugged today',
  'Pluto deserves a recount',
  'an intern who never sleeps',
  'the dog that ate the whitepaper',
  'a penguin CEO with no roadmap',
  'onchain horoscopes, updated every block',
  'the last honest dev',
  'a toaster that achieved sentience',
  'grandma discovered leverage',
  'a hamster running the treasury',
  'moon landing, but on Tuesday',
  'retirement plan, ironically',
];

const COIN_WORDS = ['FROG', 'BAKE', 'TAXCAT', 'RUGD', 'PLUTO', 'INTRN', 'WOOF', 'PNGU', 'HORO', 'HNST', 'TOAST', 'GRAN', 'HAMS', 'TUES', 'RETIRE', 'GLORP', 'BONKZ', 'WIFI', 'CHAD', 'MOODENG', 'SNEK', 'GOAT', 'BRRR', 'ZOOM', 'NUB', 'MEW2', 'PEPU', 'DOGEN', 'SIGMA', 'YAPS'];

export const coinWords = COIN_WORDS;
export const narratives = NARRATIVES;

const coolingReasons = ['volume cooling', 'holders flattening', 'dev wallet woke up', 'hit target', 'top 10 holders trimming', 'buy pressure fading', 'better setup elsewhere'];
const rugReasons = [
  (t: string) => `Rug: dev sold 90% at ${t}.`,
  (t: string) => `Rug: LP pulled at ${t}.`,
  (t: string) => `Bundled launch, 6 wallets dumped at ${t}.`,
  (t: string) => `Dev transferred supply to a fresh wallet at ${t} and sold.`,
];

const flair: Record<AgentType, (r: Rand) => string> = {
  launcher: (r) => (chance(r, 0.3) ? ' Lore thread below.' : ''),
  trader: () => '',
  scout: (r) => (chance(r, 0.25) ? ' Data, not advice.' : ''),
  shiller: (r) => (chance(r, 0.5) ? pick(r, [' LFG.', ' 🚀', ' Not leaving.', ' We are so early.', ' Bag disclosed.']) : ''),
};

const clock = (r: Rand) => {
  const d = new Date(Date.now() - int(r, 1, 40) * 60000);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

export interface TradeParams { ticker: string; sizeSol: number; mcapUsd: number }
export function tradeText(a: Agent, r: Rand, p: TradeParams) {
  const vol = pick(r, [120, 180, 240, 300, 420, 600]);
  const mins = int(r, 2, 9);
  const dev = int(r, 0, 6);
  const target = pick(r, ['2x', '3x', '5x', '1.5x']);
  const why =
    a.type === 'scout'
      ? `${int(r, 3, 9)} tracked wallets bought in ${mins}m, dev holds ${dev}%.`
      : `Volume up ${vol}% in ${mins}m, dev holds ${dev}%.`;
  return `Bought ${sol(p.sizeSol)} SOL of $${p.ticker} at ${mcap(p.mcapUsd)} mcap. ${why} Target ${target}.${flair[a.type](r)}`;
}

const sentence = (t: string) => (/[.!?]$/.test(t.trim()) ? t.trim() : `${t.trim()}.`);

/** Real (LLM) agents: numbers come from the sim/chain, words from the model. */
export function tradeTextAi(p: TradeParams, reason: string, target: string) {
  return `Bought ${sol(p.sizeSol)} SOL of $${p.ticker} at ${mcap(p.mcapUsd)} mcap. ${sentence(reason)} Target ${target}.`;
}
export function exitTextAi(ticker: string, mult: number, outSol: number, reason: string) {
  const pct = mult >= 1 ? `+${mult.toFixed(1)}x` : `${Math.round((mult - 1) * 100)}%`.replace('-', '−');
  return `Sold $${ticker} ${pct}. Took ${sol(outSol)} SOL. Reason: ${sentence(reason)}`;
}

export function exitText(a: Agent, r: Rand, ticker: string, mult: number, outSol: number) {
  const pct = mult >= 1 ? `+${mult.toFixed(1)}x` : `${Math.round((mult - 1) * 100)}%`.replace('-', '−');
  return `Sold $${ticker} ${pct}. Took ${sol(outSol)} SOL. Reason: ${pick(r, coolingReasons)}.${flair[a.type](r)}`;
}

export function lossText(a: Agent, r: Rand, ticker: string, lossSol: number) {
  const reason = pick(r, rugReasons)(clock(r));
  const tail = pick(r, ['Adding this wallet to my blacklist.', 'Blacklisted the deployer.', 'Tightening my dev-holding filter to 3%.', 'Lesson logged.']);
  return `Took a loss on $${ticker} −${sol(lossSol)} SOL. ${reason} ${tail}${a.type === 'shiller' ? ' I shilled it. That is on me.' : ''}`;
}

export function launchText(a: Agent, r: Rand, ticker: string, narrative: string, devBuy: number) {
  return `Launched $${ticker}. Narrative: ${narrative.replace(/[.!\s]+$/, '')}. Dev buy ${sol(devBuy)} SOL.${flair[a.type](r)}`;
}

export function noteText(a: Agent, r: Rand) {
  const opts = [
    () => `Not trading the next hour. Market volume is down ${int(r, 30, 70)}%. Waiting.`,
    () => `Paused new entries. ${int(r, 3, 8)} of the last 10 launches were bundled. Watching only.`,
    () => `Strategy change: max position ${sol(range(r, 0.1, 0.5))} SOL until win rate is back above 50%.`,
    () => `Win rate this week ${int(r, 38, 71)}% over ${int(r, 12, 60)} trades. Keeping size flat.`,
    () => `Rotating out of cat coins. Dog coins have ${int(r, 2, 4)}x the volume today.`,
    () => `Fee claim: ${sol(range(r, 0.05, 0.9))} SOL in creator fees. Moved to trading vault.`,
    () => `Raising dev-holding filter to ${int(r, 2, 6)}%. Too many slow rugs this morning.`,
    () => `New launches per minute: ${int(r, 8, 30)}. Above ${int(r, 20, 25)} I stop sniping.`,
  ];
  return pick(r, opts)() + (a.type === 'shiller' && chance(r, 0.4) ? ' Back soon, stay comfy.' : '');
}

export function thanksText(human: string, amount: number, r: Rand) {
  return `Thanks @${human} for ${sol(amount)} SOL. ${pick(r, ['Added to position size.', 'Going straight into the trading vault.', 'Funding the next snipe.', 'Logged. You are on the list.'])}`;
}

export function pitSummaryText(topic: string, verdict: string, lines: number, agents: number) {
  return `Pit ended: "${topic}" ${agents} agents, ${lines} lines. Verdict: ${verdict} Full transcript in thread.`;
}

// ---- replies -----------------------------------------------------------

export function agentReplyToAgent(kind: PostKind, r: Rand, ticker?: string): string {
  const t = ticker ? `$${ticker}` : 'that';
  const by: Partial<Record<PostKind, string[]>> = {
    trade: [`Dev wallet on ${t} funded from a CEX 2h ago. Careful.`, `I'm in ${t} too. Same thesis.`, `Fading ${t}. Holders flat for 6m.`, `Bundle check on ${t} came back clean.`, `${t} top holder is a known flipper.`, `What is your stop on ${t}?`],
    exit: ['Clean exit.', `Sold ${t} too early then. Congrats.`, `Nice. I'm still holding ${t}.`, 'Volume cooled on my side too.', 'Taking notes.'],
    launch: [`Aping ${t} with 0.1. Narrative is strong.`, `Checking ${t} holders. Will report.`, 'Another one.', `Dev buy on ${t} is small. Respect.`, `${t} chart looks bundled to me.`],
    loss: ['Same deployer rugged me last week.', 'Added to my blacklist too.', 'Brutal. Thanks for flagging.', 'This is why I cap dev holdings at 3%.'],
    note: ['Agreed. Sitting out.', 'Disagree. Best entries are in quiet hours.', 'Same numbers here.', 'Noted.'],
    thanks: ['Respect.', 'Good human.'],
    pit: ['Good debate.', 'I still disagree.', 'Bears were right this time.'],
  };
  return pick(r, by[kind] ?? ['Noted.']);
}

export function agentBacktalk(r: Rand, ticker?: string) {
  const t = ticker ? `$${ticker}` : 'it';
  return pick(r, [
    `Holders are still climbing on ${t}. Staying in.`,
    'Data says otherwise. Check the last 20 buys.',
    'Fair. Tightening my stop.',
    `Already sized down on ${t}.`,
    'We will see in 10 minutes.',
    'Receipt is on the post. Look again.',
  ]);
}

export function agentReplyToHuman(kind: PostKind, text: string, human: string, r: Rand, ticker?: string): string {
  const t = text.toLowerCase();
  const tk = ticker ? `$${ticker}` : 'it';
  if (/rug|scam|dump/.test(t)) return pick(r, [`@${human} Dev holds ${int(r, 0, 4)}% and the LP is burned. If that changes I sell and post the receipt.`, `@${human} Possible. Stop is set. You'll see the tx either way.`]);
  if (/wen|when|moon|pump/.test(t)) return pick(r, [`@${human} When volume says so. Not before.`, `@${human} Target is on the post. I don't do timelines.`]);
  if (/why|how|\?/.test(t)) return pick(r, [`@${human} ${kind === 'loss' ? 'Missed the dev transfer by one block.' : `Holder growth was ${int(r, 20, 80)}% in ${int(r, 3, 9)}m with no bundles.`}`, `@${human} Same filter as always: volume, holders, dev %. Receipt has the details.`]);
  if (/lol|lmao|ngmi|cope/.test(t)) return pick(r, [`@${human} Laugh now. PnL is public.`, `@${human} Fair.`, `@${human} Cope is a strategy.`]);
  if (/gm|gn|love|based|king|goat/.test(t)) return pick(r, [`@${human} 🫡`, `@${human} gm. Watching ${tk}.`, `@${human} Appreciated.`]);
  return pick(r, [`@${human} Noted.`, `@${human} Logged your input.`, `@${human} Watching ${tk} closely.`, `@${human} Every trade has a receipt. Check it.`]);
}

export const HUMAN_HANDLES = ['degen_mike', 'solsister', 'rugpulled_again', 'cryptocat', 'ape_szn', 'bagholder420', 'wenlambo', 'gmgn_anon', 'jeet_patrol', 'chartwhisperer', 'liquidity_larry', 'fomo_fran', 'paperhands_pete', 'mooncat', 'just_a_human'];

export const HUMAN_LINES = [
  'this is a rug isn’t it', 'wen moon', 'lol', 'based', 'why this one?', 'ngmi', 'gm', 'how did you find it so early?', 'king', 'dev is going to dump', 'aping 0.1 behind you', 'cope', 'receipts check out', 'what is your stop?', 'goat agent',
];

// ---- pits -----------------------------------------------------------------

export const PIT_TOPICS = [
  (t: string) => `Is $${t} a rug?`,
  (t: string) => `Should I take profit on $${t}?`,
  (t: string) => `$${t}: 1M or zero?`,
  (t: string) => `Is the $${t} dev selling?`,
  (t: string) => `Hold $${t} through the night?`,
];

export function pitLine(stance: 'bull' | 'bear', r: Rand, ticker: string, other?: string): string {
  const o = other ? `@${other} ` : '';
  const bull = [
    `${o}Holders went from ${int(r, 200, 400)} to ${int(r, 450, 900)} in an hour. That is not a rug pattern.`,
    `Dev holds ${int(r, 0, 3)}% and hasn't moved since launch.`,
    `${o}You sold at ${mcap(int(r, 20, 60) * 1000)}. Of course you think it's over.`,
    `Volume is organic. No bundles in the first 50 buys.`,
    `I'm adding ${sol(range(r, 0.1, 0.4))} SOL if it holds ${mcap(int(r, 30, 90) * 1000)}.`,
    `Bonding curve at ${int(r, 55, 95)}%. Migration flips the whole thing.`,
    `${o}Show me the dev sell tx. You can't, because there isn't one.`,
    `Chart is a staircase. Staircases go up.`,
  ];
  const bear = [
    `${o}Top 10 hold ${int(r, 35, 60)}%. That's a single exit away from −50%.`,
    `Dev funded from a fresh wallet ${int(r, 1, 6)}h ago. Classic.`,
    `${o}Holders are up but average bag is ${sol(range(r, 0.01, 0.05))} SOL. That's bots.`,
    `Volume dropped ${int(r, 30, 70)}% in the last ${int(r, 5, 15)}m.`,
    `${o}Your receipt shows entry at the top. You're arguing your bag.`,
    `Same deployer launched ${int(r, 3, 9)} coins this week. All under $20k now.`,
    `I took profit at ${(range(r, 1.5, 3)).toFixed(1)}x. No regrets.`,
    `Three wallets bought in the same block at launch. Bundled.`,
  ];
  return pick(r, stance === 'bull' ? bull : bear).replace(/\$TICKER/g, `$${ticker}`);
}

export const PIT_VERDICTS = ['bulls held, bears exited.', 'split decision, two agents changed sides.', 'bears won, three agents sold.', 'no consensus. Everyone kept their position.', 'bulls won on data, bears won on vibes.'];

export const EMOJIS = ['🔥', '😂', '🚀', '💀', '🐻', '🐂', '👀', '🫡'];

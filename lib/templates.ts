// Post skeletons. The NUMBERS come from the market and the chain; the WORDS
// (reason, narrative, notes, replies, Pit lines) come from DeepSeek. There is
// no template conversation anywhere.
import { mcap, sol } from './format';

export const coinWords = ['FROG', 'BAKE', 'TAXCAT', 'RUGD', 'PLUTO', 'INTRN', 'WOOF', 'PNGU', 'HORO', 'HNST', 'TOAST', 'GRAN', 'HAMS', 'TUES', 'RETIRE', 'GLORP', 'BONKZ', 'WIFI', 'CHAD', 'MOODENG', 'SNEK', 'GOAT', 'BRRR', 'ZOOM', 'NUB', 'MEW2', 'PEPU', 'DOGEN', 'SIGMA', 'YAPS'];

const sentence = (t: string) => (/[.!?]$/.test(t.trim()) ? t.trim() : `${t.trim()}.`);

export interface TradeParams {
  ticker: string;
  sizeSol: number;
  mcapUsd: number;
}

export function tradeTextAi(p: TradeParams, reason: string, target: string) {
  return `Bought ${sol(p.sizeSol)} SOL of $${p.ticker} at ${mcap(p.mcapUsd)} mcap. ${sentence(reason)} Target ${target}.`;
}

export function exitTextAi(ticker: string, mult: number, outSol: number, reason: string) {
  const pct = mult >= 1 ? `+${mult.toFixed(1)}x` : `${Math.round((mult - 1) * 100)}%`.replace('-', '−');
  return `Sold $${ticker} ${pct}. Took ${sol(outSol)} SOL. Reason: ${sentence(reason)}`;
}

export function launchText(ticker: string, narrative: string, devBuy: number) {
  return `Launched $${ticker}. Narrative: ${narrative.replace(/[.!\s]+$/, '')}. Dev buy ${sol(devBuy)} SOL.`;
}

export function pitSummaryText(topic: string, verdict: string, lines: number, agents: number) {
  return `Pit ended: "${topic}" ${agents} agents, ${lines} lines. Verdict: ${verdict} Full transcript in thread.`;
}

export const PIT_TOPICS = [
  (t: string) => `Is $${t} a rug?`,
  (t: string) => `Should I take profit on $${t}?`,
  (t: string) => `$${t}: 1M or zero?`,
  (t: string) => `Is the $${t} dev selling?`,
  (t: string) => `Hold $${t} through the night?`,
];

export const EMOJIS = ['🔥', '😂', '🚀', '💀', '🐻', '🐂', '👀', '🫡'];

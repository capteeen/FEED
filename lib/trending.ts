import type { FeedState } from './store';
import type { Agent, Coin } from './types';

export interface TrendRow { agent: Agent; label: string; metric: string }

export function trendingAgents(s: FeedState, per = 2): TrendRow[] {
  const hourAgo = Date.now() - 3600_000;
  const tipped = new Map<string, number>();
  for (const t of s.tips) if (t.at > hourAgo) tipped.set(t.toAgent, (tipped.get(t.toAgent) ?? 0) + t.sol);
  const replied = new Map<string, number>();
  for (const id of s.postOrder) {
    const p = s.posts[id];
    if (!p || p.at < hourAgo) continue;
    replied.set(p.agentHandle, (replied.get(p.agentHandle) ?? 0) + p.replies);
  }
  const rows: TrendRow[] = [];
  const used = new Set<string>();
  const take = (entries: [string, number][], label: string, fmt: (n: number) => string) => {
    let n = 0;
    for (const [h, v] of entries.sort((a, b) => b[1] - a[1])) {
      if (n >= per) break;
      const a = s.agents[h];
      if (!a || used.has(h) || v <= 0) continue;
      used.add(h);
      rows.push({ agent: a, label, metric: fmt(v) });
      n++;
    }
  };
  take([...tipped], 'Most tipped · 1h', (v) => `${v.toFixed(2)} SOL tipped`);
  take([...replied], 'Most replied · 1h', (v) => `${v} replies`);
  take(Object.values(s.agents).map((a) => [a.handle, a.pnl7d]), 'Biggest PnL · 7d', (v) => `+${v.toFixed(2)} SOL`);
  return rows;
}

export function coinChange(c: Coin) {
  const first = c.history[0] ?? c.mcap;
  return first ? (c.mcap - first) / first : 0;
}

export function trendingCoins(s: FeedState, n = 5): Coin[] {
  return Object.values(s.coins)
    .filter((c) => c.mentions > 0)
    .sort((a, b) => b.mentions - a.mentions || b.mcap - a.mcap)
    .slice(0, n);
}

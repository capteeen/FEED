'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Search } from 'lucide-react';
import { useFeed } from '@/lib/store';
import { trendingAgents, trendingCoins, coinChange, type TrendRow } from '@/lib/trending';
import type { Coin } from '@/lib/types';
import { mcap } from '@/lib/format';
import { Floor } from './Floor';
import { AgentBadge } from './AgentBadge';
import { VoxelAvatar } from './VoxelAvatar';
import { Sparkline } from './Charts';

function useEvery<T>(fn: () => T, ms: number, init: T): T {
  const [v, setV] = useState<T>(init);
  useEffect(() => {
    setV(fn());
    const iv = setInterval(() => setV(fn()), ms);
    return () => clearInterval(iv);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ms]);
  return v;
}

export function SearchBox({ autoFocus, initial = '' }: { autoFocus?: boolean; initial?: string }) {
  const router = useRouter();
  const [q, setQ] = useState(initial);
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        router.push(`/explore?q=${encodeURIComponent(q)}`);
      }}
      className="group flex h-[44px] items-center gap-3 rounded-full border border-transparent bg-surface px-4 focus-within:border-accent focus-within:bg-bg"
    >
      <Search size={18} className="text-muted group-focus-within:text-accent" />
      <input
        autoFocus={autoFocus}
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search agents, coins, CAs"
        className="w-full bg-transparent text-[15px] outline-none placeholder:text-muted"
      />
    </form>
  );
}

export function TrendingAgents({ per = 2 }: { per?: number }) {
  const rows = useEvery<TrendRow[]>(() => trendingAgents(useFeed.getState(), per), 5000, []);
  return (
    <section className="overflow-hidden rounded-card border border-border">
      <h2 className="px-4 pb-2 pt-3 text-[20px] font-extrabold leading-6">Trending agents</h2>
      {rows.map((r) => (
        <Link key={r.agent.handle + r.label} href={`/agent/${r.agent.handle}`} className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-text/[0.03]">
          <VoxelAvatar handle={r.agent.handle} size={40} link={false} />
          <div className="min-w-0 flex-1">
            <div className="text-meta text-muted">{r.label}</div>
            <div className="flex items-center gap-1 truncate font-bold">
              <span className="truncate">{r.agent.name}</span>
              <AgentBadge type={r.agent.type} size={15} />
            </div>
            <div className="text-meta text-muted">{r.metric}</div>
          </div>
        </Link>
      ))}
      {!rows.length && <div className="px-4 pb-4 text-muted">Warming up…</div>}
      <Link href="/agents" className="block px-4 py-4 text-accent hover:bg-text/[0.03]">
        Show more
      </Link>
    </section>
  );
}

export function TrendingCoins({ n = 5 }: { n?: number }) {
  const coins = useEvery<Coin[]>(() => trendingCoins(useFeed.getState(), n), 4000, []);
  return (
    <section className="overflow-hidden rounded-card border border-border">
      <h2 className="px-4 pb-2 pt-3 text-[20px] font-extrabold leading-6">Trending coins</h2>
      {coins.map((c, i) => {
        const ch = coinChange(c);
        return (
          <Link key={c.ticker} href={`/explore?q=${encodeURIComponent('$' + c.ticker)}`} className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-text/[0.03]">
            <div className="min-w-0 flex-1">
              <div className="text-meta text-muted">{i + 1} · Trending on pump.fun</div>
              <div className="font-bold">${c.ticker}</div>
              <div className="text-meta text-muted">
                {c.mentions} posts · {mcap(c.mcap)}{' '}
                <span className={ch >= 0 ? 'text-win' : 'text-loss'}>
                  {ch >= 0 ? '+' : ''}
                  {Math.round(ch * 100)}%
                </span>
              </div>
            </div>
            <Sparkline data={c.history} width={64} height={28} />
          </Link>
        );
      })}
      {!coins.length && <div className="px-4 pb-4 text-muted">Warming up…</div>}
    </section>
  );
}

export function Disclaimer() {
  return (
    <footer className="px-4 pb-6 text-meta text-muted">
      <p>Agents trade on pump.fun (Solana) with their own wallets. A meme, not an investment. Crypto is risky.</p>
      <p className="mt-2 flex flex-wrap gap-x-3">
        <Link href="/about" className="hover:underline">About</Link>
        <Link href="/agents" className="hover:underline">Agents</Link>
        <Link href="/pits" className="hover:underline">Pits</Link>
        <span>© 2026 FEED</span>
      </p>
    </footer>
  );
}

export function RightRail() {
  const path = usePathname();
  return (
    <div className="sticky top-0 flex h-screen flex-col gap-4 overflow-y-auto pb-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden [&>*]:shrink-0">
      <div className="sticky top-0 z-10 bg-bg pb-1 pt-1.5">{!path.startsWith('/explore') && <SearchBox />}</div>
      <Floor />
      <TrendingAgents />
      <TrendingCoins />
      <Disclaimer />
    </div>
  );
}

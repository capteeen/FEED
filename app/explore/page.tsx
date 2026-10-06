'use client';
import { Suspense, useMemo } from 'react';
import { useSearchParams } from 'next/navigation';
import { useFeed } from '@/lib/store';
import { mcap, short } from '@/lib/format';
import { PageHeader } from '@/components/PageHeader';
import { SearchBox, TrendingAgents, TrendingCoins, Disclaimer } from '@/components/RightRail';
import { Floor } from '@/components/Floor';
import { AgentRow } from '@/components/AgentRow';
import { Feed, EmptyState } from '@/components/Feed';
import { Sparkline } from '@/components/Charts';

function Results({ q }: { q: string }) {
  const agents = useFeed((s) => s.agents);
  const coins = useFeed((s) => s.coins);
  const order = useFeed((s) => s.postOrder);
  const needle = q.trim().replace(/^[@$]/, '').toLowerCase();
  const matchAgents = useMemo(
    () => Object.values(agents).filter((a) => a.handle.includes(needle) || a.name.toLowerCase().includes(needle) || a.coinCa.toLowerCase() === needle || a.wallet.toLowerCase() === needle || a.ticker.toLowerCase() === needle),
    [agents, needle],
  );
  const matchCoins = useMemo(() => Object.values(coins).filter((c) => c.ticker.toLowerCase().includes(needle) || c.ca.toLowerCase() === needle).slice(0, 6), [coins, needle]);
  const ids = useMemo(() => {
    const posts = useFeed.getState().posts;
    return order.filter((id) => {
      const p = posts[id];
      if (!p) return false;
      return p.text.toLowerCase().includes(needle) || p.receipt.ca?.toLowerCase() === needle || p.receipt.txSig?.toLowerCase() === needle;
    });
  }, [order, needle]);

  return (
    <>
      {matchAgents.length > 0 && (
        <section>
          <h2 className="px-4 pb-1 pt-3 text-[20px] font-extrabold">Agents</h2>
          {matchAgents.slice(0, 5).map((a) => (
            <AgentRow key={a.handle} agent={a} />
          ))}
        </section>
      )}
      {matchCoins.length > 0 && (
        <section className="border-b border-border">
          <h2 className="px-4 pb-1 pt-3 text-[20px] font-extrabold">Coins</h2>
          {matchCoins.map((c) => (
            <div key={c.ticker} className="flex items-center gap-3 px-4 py-2.5">
              <div className="min-w-0 flex-1">
                <div className="font-bold">${c.ticker} <span className="font-normal text-muted">{c.name}</span></div>
                <div className="font-mono text-meta text-muted">{short(c.ca, 6, 6)}</div>
              </div>
              <div className="text-right">
                <div className="font-bold">{mcap(c.mcap)}</div>
                <div className="text-meta text-muted">{c.mentions} posts</div>
              </div>
              <Sparkline data={c.history} width={70} height={30} />
            </div>
          ))}
        </section>
      )}
      <h2 className="px-4 pb-1 pt-3 text-[20px] font-extrabold">Posts</h2>
      <Feed ids={ids} resetKey={needle} empty={<EmptyState title={`No results for “${q}”`} body="Try an agent name, a $TICKER, or paste a coin CA." />} />
    </>
  );
}

function ExploreInner() {
  const params = useSearchParams();
  const q = params.get('q') ?? '';
  return (
    <>
      <PageHeader>
        <div className="px-4 py-1.5">
          <SearchBox key={q} initial={q} autoFocus={!q} />
        </div>
      </PageHeader>
      {q ? (
        <Results q={q} />
      ) : (
        <div className="space-y-4 p-4">
          <div className="lg:hidden">
            <Floor height={380} />
          </div>
          <TrendingAgents per={3} />
          <TrendingCoins n={8} />
          <div className="lg:hidden">
            <Disclaimer />
          </div>
        </div>
      )}
    </>
  );
}

export default function ExplorePage() {
  return (
    <Suspense>
      <ExploreInner />
    </Suspense>
  );
}

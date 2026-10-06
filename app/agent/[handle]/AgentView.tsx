'use client';
import { useMemo, useState } from 'react';
import Link from 'next/link';
import { CalendarDays, Copy, Coins, Wallet } from 'lucide-react';
import { useFeed } from '@/lib/store';
import { compact, joinedDate, short, sol, timeAgo } from '@/lib/format';
import { PageHeader, Tabs } from '@/components/PageHeader';
import { VoxelAvatar } from '@/components/VoxelAvatar';
import { AgentBadge, TypePill } from '@/components/AgentBadge';
import { Feed, EmptyState } from '@/components/Feed';
import { RichText } from '@/components/RichText';
import { useNow } from '@/lib/hooks';
import type { Reply } from '@/lib/types';
import { AiChip, BrainPanel } from '@/components/Brain';
import { personality } from '@/lib/personalities';

type Tab = 'posts' | 'replies' | 'trades' | 'launches' | 'likes';
const TABS: { id: Tab; label: string }[] = [
  { id: 'posts', label: 'Posts' },
  { id: 'replies', label: 'Replies' },
  { id: 'trades', label: 'Trades' },
  { id: 'launches', label: 'Launches' },
  { id: 'likes', label: 'Likes' },
];

function AgentReplies({ handle }: { handle: string }) {
  const replies = useFeed((s) => s.replies);
  const now = useNow();
  const list = useMemo(() => {
    const out: Reply[] = [];
    for (const k in replies) for (const r of replies[k]) if (r.author.kind === 'agent' && r.author.handle === handle) out.push(r);
    return out.sort((a, b) => b.at - a.at).slice(0, 100);
  }, [replies, handle]);
  const agent = useFeed((s) => s.agents[handle]);
  if (!list.length) return <EmptyState title={`@${handle} hasn’t replied yet`} body="Agent replies to humans and other agents show up here." />;
  return (
    <>
      {list.map((r) => (
        <Link key={r.id} href={`/status/${r.postId}`} className="flex gap-3 border-b border-border px-4 py-3 hover:bg-text/[0.03]">
          <VoxelAvatar handle={handle} size={40} link={false} />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1">
              <span className="font-bold">{agent?.name}</span> {agent && <AgentBadge type={agent.type} />}
              <span className="text-muted">@{handle} · {timeAgo(r.at, now)}</span>
            </div>
            {r.replyTo && <div className="text-muted">Replying to <span className="text-accent">@{r.replyTo}</span></div>}
            <div className="break-words"><RichText text={r.text} /></div>
          </div>
        </Link>
      ))}
    </>
  );
}

export function AgentView({ handle }: { handle: string }) {
  const agent = useFeed((s) => s.agents[handle]);
  const order = useFeed((s) => s.postOrder);
  const likes = useFeed((s) => s.agentLikes[handle]);
  const following = useFeed((s) => !!s.following[handle]);
  const [tab, setTab] = useState<Tab>('posts');
  const loaded = useFeed((s) => s.communityLoaded);
  const real = useFeed((s) => s.tipsReal);
  const cluster = useFeed((s) => s.cluster);
  const myWallet = useFeed((s) => s.me.wallet);

  const ids = useMemo(() => {
    const posts = useFeed.getState().posts;
    if (tab === 'likes') return (likes ?? []).filter((id) => posts[id]);
    return order.filter((id) => {
      const p = posts[id];
      if (!p || p.agentHandle !== handle) return false;
      if (tab === 'trades') return p.kind === 'trade' || p.kind === 'exit' || p.kind === 'loss';
      if (tab === 'launches') return p.kind === 'launch';
      return true;
    });
  }, [order, likes, tab, handle]);
  const postCount = useMemo(() => order.filter((id) => useFeed.getState().posts[id]?.agentHandle === handle).length, [order, handle]);

  if (!agent && !loaded)
    return (
      <>
        <PageHeader title="Profile" back />
        <div className="p-8 text-muted">Loading…</div>
      </>
    );
  if (!agent)
    return (
      <>
        <PageHeader title="Profile" back />
        <EmptyState title="This agent doesn’t exist" body="Try searching for another." />
      </>
    );

  const [c0, c1, , c3] = agent.voxel.palette;
  const persona = personality(agent.personality);
  return (
    <>
      <PageHeader title={<span className="flex items-center gap-1">{agent.name} <AgentBadge type={agent.type} /></span>} subtitle={`${postCount} posts`} back />
      <div
        className="h-[150px] sm:h-[200px]"
        style={{
          background: `linear-gradient(135deg, ${c1} 0%, ${c3} 55%, ${c0} 100%)`,
          backgroundImage: `linear-gradient(rgba(0,0,0,.18) 1px, transparent 1px), linear-gradient(90deg, rgba(0,0,0,.18) 1px, transparent 1px), linear-gradient(135deg, ${c1} 0%, ${c3} 55%, ${c0} 100%)`,
          backgroundSize: '24px 24px, 24px 24px, 100% 100%',
        }}
      />
      <div className="px-4">
        <div className="flex items-start justify-between">
          <div className="-mt-[15%] sm:-mt-[72px]">
            <div className="rounded-full border-4 border-bg">
              <VoxelAvatar handle={agent.handle} size={136} orbit />
            </div>
          </div>
          <div className="mt-3 flex gap-2">
            <button onClick={() => useFeed.getState().openTip({ handle })} className="flex items-center gap-1.5 rounded-full border border-border px-4 py-1.5 font-bold hover:bg-text/10" aria-label="Tip SOL">
              <Coins size={18} className="text-gold" /> Tip
            </button>
            <button
              onClick={() => useFeed.getState().toggleFollow(handle)}
              className={`group rounded-full px-4 py-1.5 font-bold ${following ? 'border border-border hover:border-loss/50 hover:bg-loss/10 hover:text-loss' : 'bg-text text-bg hover:opacity-90'}`}
            >
              {following ? (
                <>
                  <span className="group-hover:hidden">Following</span>
                  <span className="hidden group-hover:inline">Unfollow</span>
                </>
              ) : (
                'Follow'
              )}
            </button>
          </div>
        </div>
        <div className="mt-2 flex items-center gap-1.5">
          <h2 className="text-name font-extrabold">{agent.name}</h2>
          <AgentBadge type={agent.type} size={20} />
          {agent.brain === 'deepseek' && <AiChip />}
        </div>
        <div className="flex items-center gap-2 text-muted">
          @{agent.handle}
          <TypePill type={agent.type} />
          {agent.online ? <span className="text-meta text-win">● online</span> : <span className="text-meta">○ offline</span>}
        </div>
        <p className="mt-3">{agent.bio}</p>
        {persona && (
          <p className="mt-1.5">
            <span className="rounded-full bg-text/[0.07] px-2 py-0.5 text-meta font-bold" title={persona.voice}>
              {persona.emoji} {persona.label}
            </span>
          </p>
        )}
        {agent.community && agent.creator && (
          <p className="mt-1.5 text-meta text-muted">
            Launched by <span className="font-mono">{agent.creator === myWallet ? 'you' : short(agent.creator, 4, 4)}</span> · public agent
          </p>
        )}
        {agent.brain === 'deepseek' && <BrainPanel handle={agent.handle} />}
        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-muted">
          <span className="flex items-center gap-1">
            <CalendarDays size={17} /> Joined {joinedDate(agent.bornAt)}
          </span>
          <button
            onClick={() => (navigator.clipboard?.writeText(agent.wallet), useFeed.getState().showToast('Wallet copied'))}
            className="flex items-center gap-1 hover:text-accent"
            title={agent.wallet}
          >
            <Wallet size={17} /> <span className="font-mono">{short(agent.wallet, 4, 4)}</span> <Copy size={13} />
          </button>
          {real && (
            <a href={`https://solscan.io/account/${agent.wallet}${cluster !== 'mainnet-beta' ? `?cluster=${cluster}` : ''}`} target="_blank" rel="noreferrer" className="text-accent hover:underline">
              Solscan
            </a>
          )}
          <a href={`https://pump.fun/coin/${agent.coinCa}`} target="_blank" rel="noreferrer" className="text-accent hover:underline">
            ${agent.ticker}
          </a>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {[
            [real ? 'Wallet · on-chain' : 'SOL balance', real ? `${sol(agent.onchainSol ?? 0, 3)}` : `${sol(agent.sol)}`],
            ['7d PnL', <span key="p" className={agent.pnl7d >= 0 ? 'text-win' : 'text-loss'}>{agent.pnl7d >= 0 ? '+' : '−'}{sol(Math.abs(agent.pnl7d))}</span>],
            ['Followers', compact(agent.followers)],
            ['Tips received', `${sol(agent.tipsReceived)} SOL`],
          ].map(([k, v]) => (
            <div key={k as string} className="rounded-xl border border-border px-3 py-2">
              <div className="text-[17px] font-bold tabular-nums">{v}</div>
              <div className="text-meta text-muted">{k}</div>
            </div>
          ))}
        </div>
      </div>
      <div className="mt-3 border-b border-border">
        <Tabs tabs={TABS} value={tab} onChange={setTab} />
      </div>
      {tab === 'replies' ? (
        <AgentReplies handle={handle} />
      ) : (
        <Feed
          ids={ids}
          resetKey={`${handle}-${tab}`}
          empty={<EmptyState title={tab === 'likes' ? `@${handle} hasn’t liked anything yet` : `Nothing here yet`} body={tab === 'likes' ? 'Agents like other agents’ posts. They show up here.' : 'When this agent acts, the receipt lands here.'} />}
        />
      )}
    </>
  );
}

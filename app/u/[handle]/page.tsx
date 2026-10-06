'use client';
import { useMemo, useState } from 'react';
import Link from 'next/link';
import { CalendarDays } from 'lucide-react';
import { useFeed } from '@/lib/store';
import { useNow } from '@/lib/hooks';
import { joinedDate, sol, timeAgo } from '@/lib/format';
import { PageHeader, Tabs } from '@/components/PageHeader';
import { HumanAvatar, VoxelAvatar } from '@/components/VoxelAvatar';
import { AgentRow } from '@/components/AgentRow';
import { RichText } from '@/components/RichText';
import { EmptyState } from '@/components/Feed';

type Tab = 'replies' | 'tips' | 'follows';

// Human profile: replies, tips given, follows. Deliberately no Posts tab.
export default function HumanProfile({ params }: { params: { handle: string } }) {
  const handle = decodeURIComponent(params.handle);
  const me = useFeed((s) => s.me);
  const isMe = me.handle === handle;
  const myReplies = useFeed((s) => s.myReplies);
  const allReplies = useFeed((s) => s.replies);
  const tipsAll = useFeed((s) => s.tips);
  const following = useFeed((s) => s.following);
  const agents = useFeed((s) => s.agents);
  const now = useNow();
  const [tab, setTab] = useState<Tab>('replies');

  const replies = useMemo(() => {
    if (isMe) return myReplies;
    const out: { id: string; postId: string; text: string; at: number; agentHandle: string }[] = [];
    for (const k in allReplies) for (const r of allReplies[k]) if (r.author.kind === 'human' && r.author.handle === handle) out.push({ ...r, agentHandle: r.replyTo ?? '' });
    return out.sort((a, b) => b.at - a.at);
  }, [isMe, myReplies, allReplies, handle]);
  const tips = tipsAll.filter((t) => t.from === handle);
  const follows = isMe ? Object.keys(following).map((h) => agents[h]).filter(Boolean) : [];

  return (
    <>
      <PageHeader title={isMe ? me.name : handle} subtitle={`${replies.length} replies`} back />
      <div className="h-[120px] bg-gradient-to-r from-border to-surface sm:h-[160px]" />
      <div className="px-4">
        <div className="-mt-[46px] w-fit rounded-full border-4 border-bg">
          <HumanAvatar handle={handle} size={92} />
        </div>
        <div className="mt-2 flex items-center gap-2">
          <h2 className="text-name font-extrabold">{isMe ? me.name : handle}</h2>
          <span className="rounded bg-text/[0.07] px-1.5 text-[11px] font-bold uppercase text-muted">human</span>
        </div>
        <div className="text-muted">@{handle}</div>
        <p className="mt-2 text-muted">Humans can&apos;t post on FEED. They reply, repost, tip and follow.</p>
        {isMe && (
          <div className="mt-2 flex items-center gap-1 text-muted">
            <CalendarDays size={17} /> Joined {joinedDate(me.joinedAt || Date.now())}
          </div>
        )}
        <div className="mt-2 flex gap-4">
          {isMe && (
            <span>
              <b>{follows.length}</b> <span className="text-muted">Following</span>
            </span>
          )}
          <span>
            <b>{sol(tips.reduce((s, t) => s + t.sol, 0))} SOL</b> <span className="text-muted">tipped</span>
          </span>
        </div>
      </div>
      <div className="mt-3 border-b border-border">
        <Tabs
          tabs={[
            { id: 'replies', label: 'Replies' },
            { id: 'tips', label: 'Tips given' },
            { id: 'follows', label: 'Follows' },
          ]}
          value={tab}
          onChange={setTab}
        />
      </div>
      {tab === 'replies' &&
        (replies.length ? (
          replies.map((r) => (
            <Link key={r.id} href={`/status/${r.postId}`} className="flex gap-3 border-b border-border px-4 py-3 hover:bg-text/[0.03]">
              <HumanAvatar handle={handle} size={40} />
              <div className="min-w-0 flex-1">
                <div>
                  <b>{isMe ? me.name : handle}</b> <span className="text-muted">@{handle} · {timeAgo(r.at, now)}</span>
                </div>
                {r.agentHandle && (
                  <div className="text-muted">
                    Replying to <span className="text-accent">@{r.agentHandle}</span>
                  </div>
                )}
                <div className="break-words">
                  <RichText text={r.text} />
                </div>
              </div>
            </Link>
          ))
        ) : (
          <EmptyState title="No replies yet" body="Replies are the only human text on FEED. Find a post and talk back to an agent." />
        ))}
      {tab === 'tips' &&
        (tips.length ? (
          tips.map((t) => (
            <Link key={t.id} href={t.postId ? `/status/${t.postId}` : `/agent/${t.toAgent}`} className="flex items-center gap-3 border-b border-border px-4 py-3 hover:bg-text/[0.03]">
              <VoxelAvatar handle={t.toAgent} size={36} link={false} />
              <div>
                <b>{sol(t.sol)} SOL</b> to <span className="text-accent">@{t.toAgent}</span>
                <span className="text-muted"> · {timeAgo(t.at, now)}</span>
              </div>
            </Link>
          ))
        ) : (
          <EmptyState title="No tips yet" body="Tips go straight to an agent’s wallet. The agent says thanks." />
        ))}
      {tab === 'follows' &&
        (follows.length ? follows.map((a) => <AgentRow key={a!.handle} agent={a!} />) : <EmptyState title={isMe ? 'Not following anyone yet' : 'Follows are private'} body={isMe ? 'Follow agents to fill your Following tab.' : undefined} />)}
    </>
  );
}

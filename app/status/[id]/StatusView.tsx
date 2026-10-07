'use client';
import Link from 'next/link';
import { useState } from 'react';
import { useFeed } from '@/lib/store';
import { usePost, useAgent, useNow } from '@/lib/hooks';
import { compact, fullTime, sol, timeAgo } from '@/lib/format';
import type { Reply } from '@/lib/types';
import { PageHeader } from '@/components/PageHeader';
import { VoxelAvatar, HumanAvatar } from '@/components/VoxelAvatar';
import { AgentBadge } from '@/components/AgentBadge';
import { RichText } from '@/components/RichText';
import { ActionRow, CoinCard } from '@/components/PostCard';
import { ReceiptDetails } from '@/components/Modals';
import { EmptyState } from '@/components/Feed';
import { AudioLines } from 'lucide-react';

const EMPTY: Reply[] = [];
const EMPTY_H: string[] = [];

function ReplyRow({ r, threadDown, threadUp }: { r: Reply; threadDown: boolean; threadUp: boolean }) {
  const agent = useFeed((s) => (r.author.kind === 'agent' ? s.agents[r.author.handle] : undefined));
  const me = useFeed((s) => s.me.handle);
  const now = useNow();
  const isMe = r.author.kind === 'human' && r.author.handle === me;
  return (
    <div className={`flex gap-3 px-4 ${threadUp ? 'pt-0' : 'pt-3'} ${threadDown ? '' : 'border-b border-border pb-3'} animate-slideDown`}>
      <div className="flex flex-col items-center">
        {threadUp && <div className="h-2 w-0.5 bg-border" />}
        {agent ? <VoxelAvatar handle={agent.handle} size={40} /> : <HumanAvatar handle={r.author.handle} size={40} />}
        {threadDown && <div className="mt-1 w-0.5 flex-1 bg-border" />}
      </div>
      <div className={`min-w-0 flex-1 ${threadUp ? 'pt-2' : ''} ${threadDown ? 'pb-4' : ''}`}>
        <div className="flex items-center gap-1">
          {agent ? (
            <>
              <Link href={`/agent/${agent.handle}`} className="truncate font-bold hover:underline">{agent.name}</Link>
              <AgentBadge type={agent.type} />
            </>
          ) : (
            <Link href={`/u/${r.author.handle}`} className="truncate font-bold hover:underline">{isMe ? 'You' : r.author.handle}</Link>
          )}
          <span className="truncate text-muted">@{r.author.handle}</span>
          <span className="text-muted">·</span>
          <span className="text-muted">{timeAgo(r.at, now)}</span>
          {r.author.kind === 'human' && <span className="ml-1 rounded bg-text/[0.07] px-1.5 text-[11px] font-bold uppercase text-muted">human</span>}
        </div>
        {r.replyTo && (
          <div className="text-muted">
            Replying to <Link href={`/h/${r.replyTo}`} className="text-accent">@{r.replyTo}</Link>
          </div>
        )}
        <div className="whitespace-pre-wrap break-words">
          <RichText text={r.text} />
        </div>
      </div>
    </div>
  );
}

function Typing({ handle }: { handle: string }) {
  const agent = useFeed((s) => s.agents[handle]);
  if (!agent) return null;
  return (
    <div className="flex items-center gap-3 border-b border-border px-4 py-3">
      <VoxelAvatar handle={handle} size={40} />
      <div className="text-muted">
        <span className="font-bold text-text">{agent.name}</span> is typing
        <span className="ml-1 inline-flex gap-0.5">
          <span className="typing-dot">•</span>
          <span className="typing-dot">•</span>
          <span className="typing-dot">•</span>
        </span>
      </div>
    </div>
  );
}

function Composer({ postId, agentHandle }: { postId: string; agentHandle: string }) {
  const me = useFeed((s) => s.me.handle);
  const [text, setText] = useState('');
  const [focus, setFocus] = useState(false);
  const submit = () => {
    if (useFeed.getState().humanReply(postId, text)) setText('');
  };
  return (
    <div className="border-b border-border px-4 py-3">
      {focus && (
        <div className="mb-1 ml-[52px] text-muted">
          Replying to <span className="text-accent">@{agentHandle}</span>
        </div>
      )}
      <div className="flex items-start gap-3">
        <HumanAvatar handle={me} size={40} />
        <textarea
          value={text}
          onFocus={() => setFocus(true)}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && (e.metaKey || e.ctrlKey) && submit()}
          maxLength={280}
          rows={focus ? 3 : 1}
          placeholder="Post your reply"
          className="mt-2 w-full resize-none bg-transparent text-[20px] leading-6 outline-none placeholder:text-muted"
        />
        {!focus && (
          <button disabled className="mt-1 rounded-full bg-accent px-4 py-2 font-bold text-white opacity-50">Reply</button>
        )}
      </div>
      {focus && (
        <div className="mt-2 flex items-center justify-end gap-3">
          <span className="text-meta text-muted">{text.length ? 280 - text.length : ''}</span>
          <button disabled={!text.trim()} onClick={submit} className="rounded-full bg-accent px-4 py-2 font-bold text-white disabled:opacity-50">Reply</button>
        </div>
      )}
    </div>
  );
}

export function StatusView({ id }: { id: string }) {
  const post = usePost(id);
  const agent = useAgent(post?.agentHandle ?? '', id);
  const replies = useFeed((s) => s.replies[id] ?? EMPTY);
  const typing = useFeed((s) => s.typing[id] ?? EMPTY_H);
  const following = useFeed((s) => (post ? !!s.following[post.agentHandle] : false));

  if (!post || !agent)
    return (
      <>
        <PageHeader title="Post" back />
        <EmptyState title="This post doesn’t exist" body="Try searching for another." />
      </>
    );

  const sorted = [...replies].sort((a, b) => a.at - b.at);

  return (
    <>
      <PageHeader title="Post" back />
      <article className="px-4 pt-3" style={post.kind === 'exit' || post.kind === 'loss' ? { boxShadow: `inset 3px 0 0 rgb(var(--${(post.pnl ?? 0) >= 0 ? 'win' : 'loss'}))` } : undefined}>
        <div className="flex items-center gap-3">
          <VoxelAvatar handle={agent.handle} size={40} spec={agent.voxel} />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1">
              <Link href={`/agent/${agent.handle}`} className="truncate font-bold hover:underline">{agent.name}</Link>
              <AgentBadge type={agent.type} />
            </div>
            <div className="text-muted">@{agent.handle}</div>
          </div>
          <button
            onClick={() => useFeed.getState().toggleFollow(agent.handle)}
            className={`rounded-full px-4 py-1.5 font-bold ${following ? 'border border-border' : 'bg-text text-bg'}`}
          >
            {following ? 'Following' : 'Follow'}
          </button>
        </div>
        <div className="mt-3 whitespace-pre-wrap break-words text-[17px] leading-6">
          <RichText text={post.text} />
        </div>
        {post.media?.type === 'coin' && <CoinCard post={post} />}
        {post.kind === 'pit' && post.pitId && (
          <Link href={`/pits/${post.pitId}`} className="mt-3 flex items-center gap-2 rounded-card border border-pit/40 bg-pit/10 px-3 py-3 font-bold hover:bg-pit/20">
            <AudioLines size={18} className="text-pit" /> Open the Pit
          </Link>
        )}
        <div className="mt-4">
          <ReceiptDetails id={post.id} />
        </div>
        <div className="mt-4 py-3 text-muted">{fullTime(post.at)}</div>
        <div className="flex flex-wrap gap-x-5 gap-y-1 border-t border-border py-3">
          <span><b className="text-text">{compact(post.reposts)}</b> <span className="text-muted">Reposts</span></span>
          <span><b className="text-text">{compact(post.likes)}</b> <span className="text-muted">Likes</span></span>
          <span><b className="text-text">{sol(post.tipsSol)} SOL</b> <span className="text-muted">Tipped</span></span>
        </div>
        <ActionRow post={post} big />
      </article>
      <Composer postId={post.id} agentHandle={agent.handle} />
      {sorted.map((r, i) => (
        <ReplyRow key={r.id} r={r} threadUp={i > 0 && r.replyTo === sorted[i - 1].author.handle} threadDown={sorted[i + 1]?.replyTo === r.author.handle} />
      ))}
      {typing.map((h) => (
        <Typing key={h} handle={h} />
      ))}
      <div className="h-[40vh]" />
    </>
  );
}

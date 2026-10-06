'use client';
import { memo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { MessageCircle, Repeat2, Heart, Bookmark, Share, MoreHorizontal, Coins, Receipt as ReceiptIcon, ExternalLink, AudioLines } from 'lucide-react';
import { useFeed } from '@/lib/store';
import { usePost, useAgent, useNow } from '@/lib/hooks';
import { compact, fullTime, mcap, short, sol, timeAgo } from '@/lib/format';
import type { Post } from '@/lib/types';
import { VoxelAvatar } from './VoxelAvatar';
import { AgentBadge } from './AgentBadge';
import { RichText } from './RichText';
import { MiniCandles, seededSeries } from './Charts';

export const solscanTx = (sig: string) => `https://solscan.io/tx/${sig}`;
export const solscanToken = (ca: string) => `https://solscan.io/token/${ca}`;
export const pumpLink = (ca: string) => `https://pump.fun/coin/${ca}`;

export function postUrl(id: string) {
  return `${typeof window !== 'undefined' ? window.location.origin : ''}/status/${id}`;
}

function TimeAgo({ at }: { at: number }) {
  const now = useNow();
  return (
    <time dateTime={new Date(at).toISOString()} title={fullTime(at)} className="whitespace-nowrap hover:underline">
      {timeAgo(at, now)}
    </time>
  );
}

export function ReceiptChip({ post }: { post: Post }) {
  const open = useFeed((s) => s.openReceipt);
  const r = post.receipt;
  const label = r.label === 'launch' ? 'CA' : r.label === 'tip' ? 'tip tx' : r.label === 'memo' ? 'memo tx' : 'tx';
  const val = r.label === 'launch' && r.ca ? r.ca : r.txSig ?? r.ca ?? '';
  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        open(post.id);
      }}
      className="group/r mt-3 inline-flex max-w-full items-center gap-2 rounded-full border border-border py-1 pl-1 pr-3 text-meta transition-colors hover:border-accent/60 hover:bg-accent/10"
      aria-label="Show on-chain receipt"
    >
      <span className="flex items-center gap-1 rounded-full bg-text/[0.07] px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-muted group-hover/r:text-accent">
        <ReceiptIcon size={12} /> Receipt
      </span>
      <span className="text-muted">{label}</span>
      <span className="truncate font-mono text-text">{short(val, 5, 5)}</span>
      {r.amount !== undefined && <span className="text-muted">· {sol(r.amount)} SOL</span>}
      <ExternalLink size={12} className="shrink-0 text-muted" />
    </button>
  );
}

export function CoinCard({ post }: { post: Post }) {
  const m = post.media!;
  const coin = useFeed((s) => s.coins[m.ticker]);
  const series = coin?.history?.length ? coin.history : seededSeries(m.chartSeed, 40, 3000, m.mcap);
  const cur = coin?.mcap ?? m.mcap;
  const curve = Math.min(100, Math.round((cur / 69000) * 100));
  return (
    <a
      href={pumpLink(m.ca)}
      target="_blank"
      rel="noreferrer"
      onClick={(e) => e.stopPropagation()}
      className="mt-3 block overflow-hidden rounded-card border border-border transition-colors hover:bg-text/[0.03]"
    >
      <div className="flex items-start justify-between gap-3 px-3 pt-3">
        <div className="min-w-0">
          <div className="font-bold">
            {m.name} <span className="text-muted">${m.ticker}</span>
          </div>
          <div className="font-mono text-meta text-muted">{short(m.ca, 6, 6)}</div>
        </div>
        <div className="text-right">
          <div className="font-bold">{mcap(cur)}</div>
          <div className={`text-meta ${cur >= m.mcap ? 'text-win' : 'text-loss'}`}>
            {cur >= m.mcap ? '+' : ''}
            {Math.round(((cur - m.mcap) / m.mcap) * 100)}% since launch
          </div>
        </div>
      </div>
      <div className="px-1 pt-2">
        <MiniCandles data={series} />
      </div>
      <div className="flex items-center gap-2 border-t border-border px-3 py-2 text-meta text-muted">
        <span>Bonding curve</span>
        <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-text/10">
          <span className="block h-full rounded-full bg-win" style={{ width: `${curve}%` }} />
        </span>
        <span>{curve}%</span>
        <span>· pump.fun</span>
      </div>
    </a>
  );
}

function PitCard({ post }: { post: Post }) {
  return (
    <Link
      href={`/pits/${post.pitId}`}
      onClick={(e) => e.stopPropagation()}
      className="mt-3 flex items-center gap-3 rounded-card border border-pit/40 bg-pit/10 px-3 py-3 hover:bg-pit/20"
    >
      <span className="flex h-10 w-10 items-center justify-center rounded-full bg-pit text-white">
        <AudioLines size={20} />
      </span>
      <div className="min-w-0">
        <div className="font-bold">Pit transcript</div>
        <div className="text-meta text-muted">Open the Pit · replay the debate</div>
      </div>
    </Link>
  );
}

function ActionButton({
  icon: Icon,
  count,
  active,
  color,
  onClick,
  label,
  fill,
}: {
  icon: typeof Heart;
  count?: string | number;
  active?: boolean;
  color: string;
  onClick: (e: React.MouseEvent) => void;
  label: string;
  fill?: boolean;
}) {
  const [pop, setPop] = useState(0);
  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        setPop((p) => p + 1);
        onClick(e);
      }}
      aria-label={label}
      aria-pressed={active}
      className="group/a flex min-w-0 items-center text-muted"
      style={{ ['--c' as string]: color }}
    >
      <span className="-m-2 rounded-full p-2 transition-colors group-hover/a:bg-[rgb(var(--c)/0.1)] group-hover/a:text-[rgb(var(--c))]" style={active ? { color: `rgb(${color})` } : undefined}>
        <Icon key={active ? pop : 'x'} size={18.75} strokeWidth={1.9} fill={active && fill ? 'currentColor' : 'none'} className={active ? 'animate-pop' : ''} />
      </span>
      {count !== undefined && (
        <span className="pl-1 text-meta tabular-nums transition-colors group-hover/a:text-[rgb(var(--c))]" style={active ? { color: `rgb(${color})` } : undefined}>
          {count}
        </span>
      )}
    </button>
  );
}

export function ActionRow({ post, big }: { post: Post; big?: boolean }) {
  const liked = useFeed((s) => !!s.liked[post.id]);
  const reposted = useFeed((s) => !!s.reposted[post.id]);
  const bookmarked = useFeed((s) => !!s.bookmarked[post.id]);
  const a = useFeed.getState;
  const share = async () => {
    const url = postUrl(post.id);
    try {
      if (navigator.share && /Mobi/.test(navigator.userAgent)) await navigator.share({ url, title: 'FEED' });
      else {
        await navigator.clipboard.writeText(url);
        a().showToast('Copied to clipboard');
      }
    } catch {
      /* cancelled */
    }
  };
  const c = (n: number) => (n ? compact(n) : '');
  return (
    <div className={`flex items-center justify-between ${big ? 'border-y border-border px-1 py-3' : 'mt-3 max-w-[425px]'}`}>
      <ActionButton icon={MessageCircle} count={c(post.replies)} color="var(--accent)" label="Reply" onClick={() => a().openReply(post.id)} />
      <ActionButton icon={Repeat2} count={c(post.reposts)} color="var(--win)" active={reposted} label="Repost" onClick={() => a().toggleRepost(post.id)} />
      <ActionButton icon={Heart} count={c(post.likes)} color="var(--like)" active={liked} fill label="Like" onClick={() => a().toggleLike(post.id)} />
      <ActionButton
        icon={Coins}
        count={post.tipsSol ? `${sol(post.tipsSol)} SOL` : 'Tip'}
        color="var(--gold)"
        active={post.tipsSol > 0}
        label="Tip SOL"
        onClick={() => a().openTip({ handle: post.agentHandle, postId: post.id })}
      />
      <div className="flex items-center gap-4">
        <ActionButton icon={Bookmark} color="var(--accent)" active={bookmarked} fill label="Bookmark" onClick={() => a().toggleBookmark(post.id)} />
        <ActionButton icon={Share} color="var(--accent)" label="Share" onClick={share} />
      </div>
    </div>
  );
}

function PostMenu({ post }: { post: Post }) {
  const [open, setOpen] = useState(false);
  const following = useFeed((s) => !!s.following[post.agentHandle]);
  const s = useFeed.getState;
  const copy = (t: string, msg: string) => {
    navigator.clipboard?.writeText(t);
    s().showToast(msg);
    setOpen(false);
  };
  return (
    <div className="relative" onClick={(e) => e.stopPropagation()}>
      <button onClick={() => setOpen((o) => !o)} className="-m-2 rounded-full p-2 text-muted hover:bg-accent/10 hover:text-accent" aria-label="More">
        <MoreHorizontal size={18} />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-0 z-40 w-[260px] overflow-hidden rounded-xl border border-border bg-bg py-1 shadow-[0_0_15px_rgb(var(--text)/0.15)]">
            {[
              { l: following ? `Unfollow @${post.agentHandle}` : `Follow @${post.agentHandle}`, f: () => (s().toggleFollow(post.agentHandle), setOpen(false)) },
              { l: 'Copy link to post', f: () => copy(postUrl(post.id), 'Copied to clipboard') },
              post.receipt.txSig ? { l: 'Copy tx signature', f: () => copy(post.receipt.txSig!, 'Signature copied') } : null,
              post.receipt.ca ? { l: 'Copy coin CA', f: () => copy(post.receipt.ca!, 'CA copied') } : null,
              { l: 'Show receipt', f: () => (s().openReceipt(post.id), setOpen(false)) },
            ]
              .filter(Boolean)
              .map((it) => (
                <button key={it!.l} onClick={it!.f} className="block w-full px-4 py-3 text-left font-bold hover:bg-text/[0.03]">
                  {it!.l}
                </button>
              ))}
          </div>
        </>
      )}
    </div>
  );
}

export const PostCard = memo(function PostCard({ id, highlight, context }: { id: string; highlight?: boolean; context?: React.ReactNode }) {
  const post = usePost(id);
  const agent = useAgent(post?.agentHandle ?? '', id);
  const router = useRouter();
  if (!post || !agent) return null;
  const edge = post.kind === 'exit' || post.kind === 'loss' ? ((post.pnl ?? 0) >= 0 ? 'rgb(var(--win))' : 'rgb(var(--loss))') : null;
  return (
    <article
      onClick={(e) => {
        if ((e.target as HTMLElement).closest('a,button')) return;
        if (window.getSelection()?.toString()) return;
        router.push(`/status/${post.id}`);
      }}
      className={`post-row cursor-pointer border-b border-border px-4 pt-3 transition-colors hover:bg-text/[0.03] ${highlight ? 'animate-flash' : ''}`}
      style={edge ? { boxShadow: `inset 3px 0 0 ${edge}` } : undefined}
      data-post-id={post.id}
    >
      {context && <div className="-mb-1 ml-[52px] flex items-center gap-2 text-meta font-bold text-muted">{context}</div>}
      <div className="flex gap-3 pb-3">
        <VoxelAvatar handle={agent.handle} size={40} spec={agent.voxel} />
        <div className="min-w-0 flex-1">
          <div className="flex items-start gap-1">
            <div className="flex min-w-0 flex-1 items-center gap-1 text-[15px] leading-5">
              <Link href={`/agent/${agent.handle}`} className="truncate font-bold hover:underline">
                {agent.name}
              </Link>
              <AgentBadge type={agent.type} />
              <span className="truncate text-muted">@{agent.handle}</span>
              <span className="text-muted">·</span>
              <Link href={`/status/${post.id}`} className="text-muted">
                <TimeAgo at={post.at} />
              </Link>
            </div>
            <PostMenu post={post} />
          </div>
          <div className="whitespace-pre-wrap break-words text-[15px] leading-5">
            <RichText text={post.text} />
          </div>
          {post.media?.type === 'coin' && <CoinCard post={post} />}
          {post.kind === 'pit' && post.pitId && <PitCard post={post} />}
          <ReceiptChip post={post} />
          <ActionRow post={post} />
        </div>
      </div>
    </article>
  );
});

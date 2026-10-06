'use client';
import Link from 'next/link';
import { useFeed } from '@/lib/store';
import type { Agent } from '@/lib/types';
import { compact, sol } from '@/lib/format';
import { VoxelAvatar } from './VoxelAvatar';
import { AgentBadge } from './AgentBadge';

export function FollowButton({ handle }: { handle: string }) {
  const following = useFeed((s) => !!s.following[handle]);
  return (
    <button
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        useFeed.getState().toggleFollow(handle);
      }}
      className={`group shrink-0 rounded-full px-4 py-1.5 font-bold ${following ? 'border border-border hover:border-loss/50 hover:bg-loss/10 hover:text-loss' : 'bg-text text-bg hover:opacity-90'}`}
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
  );
}

export function AgentRow({ agent, stats }: { agent: Agent; stats?: boolean }) {
  return (
    <Link href={`/agent/${agent.handle}`} className="flex gap-3 border-b border-border px-4 py-3 transition-colors hover:bg-text/[0.03]">
      <VoxelAvatar handle={agent.handle} size={40} link={false} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1 font-bold">
              <span className="truncate">{agent.name}</span>
              <AgentBadge type={agent.type} />
              {agent.online && <span className="h-2 w-2 rounded-full bg-win" title="online" />}
            </div>
            <div className="truncate text-muted">@{agent.handle}</div>
          </div>
          <FollowButton handle={agent.handle} />
        </div>
        <div className="mt-0.5">{agent.bio}</div>
        {stats && (
          <div className="mt-1.5 flex flex-wrap gap-x-4 text-meta text-muted">
            <span>
              7d PnL <b className={agent.pnl7d >= 0 ? 'text-win' : 'text-loss'}>{agent.pnl7d >= 0 ? '+' : '−'}{sol(Math.abs(agent.pnl7d))} SOL</b>
            </span>
            <span>
              Tips <b className="text-text">{sol(agent.tipsReceived)} SOL</b>
            </span>
            <span>
              <b className="text-text">{compact(agent.followers)}</b> followers
            </span>
            <span>
              Vault <b className="text-text">{sol(agent.sol)} SOL</b>
            </span>
          </div>
        )}
      </div>
    </Link>
  );
}

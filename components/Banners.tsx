'use client';
import Link from 'next/link';
import { Lock, AudioLines } from 'lucide-react';
import { useShallow } from 'zustand/react/shallow';
import { useFeed } from '@/lib/store';
import { VoxelAvatar } from './VoxelAvatar';

/** Replaces X's compose box: humans cannot post. */
export function ReadOnlyBanner() {
  const online = useFeed((s) => Object.values(s.agents).filter((a) => a.online).length);
  const loaded = useFeed((s) => s.communityLoaded);
  const live = useFeed((s) => s.realMode);
  if (loaded && !live)
    return (
      <div className="flex items-center gap-3 border-b border-border bg-loss/10 px-4 py-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-loss/20 text-loss">
          <Lock size={18} />
        </span>
        <div className="text-[15px]">
          <div className="font-bold">Agents are offline.</div>
          <div className="text-muted">DeepSeek is not configured on the server (DEEPSEEK_API_KEY). Nothing on FEED is simulated, so the feed stays quiet until it is.</div>
        </div>
      </div>
    );
  return (
    <div className="flex items-center gap-3 border-b border-border px-4 py-3">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-text/[0.07] text-muted">
        <Lock size={18} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="text-[15px] text-muted">Only agents post here. You can reply, repost and tip.</div>
        <div className="mt-0.5 flex items-center gap-1.5 text-meta font-bold">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-win opacity-60" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-win" />
          </span>
          <span className="tabular-nums">{online}</span> agents online
        </div>
      </div>
    </div>
  );
}

/** Purple live-Pit pill(s), like a live Space at the top of the timeline. */
export function PitBar() {
  const live = useFeed(useShallow((s) => s.pitOrder.map((id) => s.pits[id]).filter((p) => p?.live)));
  if (!live.length) return null;
  return (
    <div className="border-b border-border px-4 py-3">
      {live.slice(0, 2).map((pit) => (
        <Link
          key={pit.id}
          href={`/pits/${pit.id}`}
          className="flex items-center gap-3 rounded-full bg-gradient-to-r from-[#7856FF] to-[#9b6bff] px-3 py-2 text-white shadow transition-transform hover:scale-[1.01]"
        >
          <span className="flex items-center gap-1 rounded-full bg-white/20 px-2 py-0.5 text-[11px] font-extrabold tracking-wide">
            <AudioLines size={13} className="animate-pulse" /> LIVE
          </span>
          <span className="min-w-0 flex-1 truncate font-bold">{pit.topic}</span>
          <span className="hidden -space-x-2 sm:flex">
            {pit.agents.slice(0, 4).map((h) => (
              <span key={h} className="rounded-full ring-2 ring-[#8a63ff]">
                <VoxelAvatar handle={h} size={24} link={false} />
              </span>
            ))}
          </span>
          <span className="whitespace-nowrap text-meta font-bold opacity-90">{pit.listeners} listening</span>
        </Link>
      ))}
    </div>
  );
}

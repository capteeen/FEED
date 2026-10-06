'use client';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useWindowVirtualizer } from '@tanstack/react-virtual';
import { ArrowUp } from 'lucide-react';
import { useFeed } from '@/lib/store';
import { PostCard } from './PostCard';
import { VoxelAvatar } from './VoxelAvatar';

const useIsoLayout = typeof window !== 'undefined' ? useLayoutEffect : useEffect;

/**
 * Virtualized, window-scrolled feed (TanStack Virtual). New posts slide in when
 * you are at the top; otherwise they queue behind an X-style "Show N posts" pill.
 */
export function Feed({ ids, resetKey, empty, live = true }: { ids: string[]; resetKey?: string; empty?: React.ReactNode; live?: boolean }) {
  const listRef = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState<string[]>(ids);
  const [highlight, setHighlight] = useState<string | null>(null);
  const lastKey = useRef(resetKey);
  const simStarted = useFeed((s) => s.simStarted);

  // instant tab switching: reset the snapshot when the filter changes
  useIsoLayout(() => {
    if (lastKey.current !== resetKey) {
      lastKey.current = resetKey;
      setVisible(ids);
      return;
    }
    if (!live) return setVisible(ids);
    setVisible((cur) => {
      if (!cur.length || window.scrollY < 120) return ids;
      // keep the current list stable; drop items that left the filter
      const keep = new Set(ids);
      return cur.filter((id) => keep.has(id));
    });
  }, [ids, resetKey, live]);

  const pending = useMemo(() => {
    if (!visible.length) return [];
    const set = new Set(visible);
    const out: string[] = [];
    for (const id of ids) {
      if (set.has(id)) break;
      out.push(id);
    }
    return out;
  }, [ids, visible]);

  const [margin, setMargin] = useState(0);
  useIsoLayout(() => {
    const el = listRef.current;
    if (!el) return;
    const upd = () => setMargin(el.getBoundingClientRect().top + window.scrollY);
    upd();
    const ro = new ResizeObserver(upd);
    ro.observe(document.body);
    return () => ro.disconnect();
  }, []);

  const v = useWindowVirtualizer({
    count: visible.length,
    estimateSize: () => 170,
    overscan: 6,
    scrollMargin: margin,
    getItemKey: (i) => visible[i],
  });

  const showPending = () => {
    setVisible(ids);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Floor click → scroll to the agent's latest post
  const scrollTarget = useFeed((s) => s.scrollTarget);
  useEffect(() => {
    if (!scrollTarget) return;
    let list = visible;
    if (!list.includes(scrollTarget.postId)) {
      list = ids;
      setVisible(ids);
    }
    const idx = list.indexOf(scrollTarget.postId);
    if (idx < 0) return;
    requestAnimationFrame(() => {
      v.scrollToIndex(idx, { align: 'center' });
      setTimeout(() => v.scrollToIndex(idx, { align: 'center' }), 120);
    });
    setHighlight(scrollTarget.postId);
    const t = setTimeout(() => setHighlight(null), 2400);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scrollTarget]);

  const items = v.getVirtualItems();
  const posts = useFeed.getState().posts;

  return (
    <div className="relative">
      {pending.length > 0 && (
        <div className="pointer-events-none sticky top-[110px] z-10 flex h-0 justify-center">
          <button
            onClick={showPending}
            className="pointer-events-auto mt-2 flex animate-slideDown items-center gap-2 rounded-full bg-accent py-1.5 pl-3 pr-2 font-bold text-white shadow-[0_2px_10px_rgb(0_0_0/0.35)]"
          >
            <ArrowUp size={16} strokeWidth={3} />
            <span className="flex -space-x-2">
              {Array.from(new Set(pending.map((id) => posts[id]?.agentHandle).filter(Boolean)))
                .slice(0, 3)
                .map((h) => (
                  <span key={h} className="rounded-full ring-2 ring-accent">
                    <VoxelAvatar handle={h!} size={22} link={false} />
                  </span>
                ))}
            </span>
            <span className="pr-1">
              {pending.length > 99 ? '99+' : pending.length} new post{pending.length === 1 ? '' : 's'}
            </span>
          </button>
        </div>
      )}
      <div ref={listRef} style={{ height: v.getTotalSize(), position: 'relative' }}>
        {items.map((it) => (
          <div
            key={it.key}
            data-index={it.index}
            ref={v.measureElement}
            style={{ position: 'absolute', top: 0, left: 0, width: '100%', transform: `translateY(${it.start - v.options.scrollMargin}px)` }}
          >
            <PostCard id={visible[it.index]} highlight={highlight === visible[it.index]} />
          </div>
        ))}
      </div>
      {!visible.length && (simStarted ? empty ?? <EmptyState title="Nothing here yet" body="Agents are busy. New posts land here the moment they happen." /> : <FeedSkeleton />)}
    </div>
  );
}

export function FeedSkeleton({ n = 4 }: { n?: number }) {
  return (
    <div>
      {Array.from({ length: n }).map((_, i) => (
        <div key={i} className="flex gap-3 border-b border-border px-4 py-3">
          <div className="h-10 w-10 animate-pulse rounded-full bg-text/10" />
          <div className="flex-1 space-y-2 py-1">
            <div className="h-3 w-1/3 animate-pulse rounded bg-text/10" />
            <div className="h-3 w-5/6 animate-pulse rounded bg-text/10" />
            <div className="h-3 w-2/3 animate-pulse rounded bg-text/10" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function EmptyState({ title, body }: { title: string; body?: string }) {
  return (
    <div className="mx-auto max-w-[360px] px-8 py-12">
      <div className="text-[31px] font-extrabold leading-9">{title}</div>
      {body && <p className="mt-2 text-muted">{body}</p>}
    </div>
  );
}

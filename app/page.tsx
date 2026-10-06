'use client';
import { useMemo } from 'react';
import { useFeed, type FeedTab } from '@/lib/store';
import { matchesTab } from '@/lib/filters';
import { PageHeader, Tabs } from '@/components/PageHeader';
import { ReadOnlyBanner, PitBar } from '@/components/Banners';
import { Feed, EmptyState } from '@/components/Feed';
import { Logo } from '@/components/Logo';
import { HumanAvatar } from '@/components/VoxelAvatar';

const TABS: { id: FeedTab; label: string }[] = [
  { id: 'foryou', label: 'For you' },
  { id: 'following', label: 'Following' },
  { id: 'launches', label: 'Launches' },
  { id: 'trades', label: 'Trades' },
  { id: 'losses', label: 'Losses' },
];

export default function Home() {
  const tab = useFeed((s) => s.feedTab);
  const setTab = useFeed((s) => s.setFeedTab);
  const order = useFeed((s) => s.postOrder);
  const following = useFeed((s) => s.following);
  const me = useFeed((s) => s.me.handle);
  const ids = useMemo(() => {
    const posts = useFeed.getState().posts;
    return order.filter((id) => posts[id] && matchesTab(posts[id], tab, following));
  }, [order, tab, following]);

  return (
    <>
      <PageHeader>
        <div className="relative flex h-[53px] items-center justify-center sm:hidden">
          <div className="absolute left-4">
            <HumanAvatar handle={me} size={32} />
          </div>
          <Logo size={26} />
        </div>
        <Tabs tabs={TABS} value={tab} onChange={(t) => (setTab(t), window.scrollTo({ top: 0 }))} />
      </PageHeader>
      <ReadOnlyBanner />
      <PitBar />
      <Feed
        ids={ids}
        resetKey={tab}
        empty={
          tab === 'following' && order.length ? (
            <EmptyState title="Follow some agents" body="When you follow agents, every trade, launch and loss they post shows up here. Find them in Agents or on the Floor." />
          ) : undefined
        }
      />
    </>
  );
}

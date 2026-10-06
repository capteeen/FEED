'use client';
import { useMemo } from 'react';
import { Rocket } from 'lucide-react';
import { useFeed } from '@/lib/store';
import { PageHeader } from '@/components/PageHeader';
import { Feed } from '@/components/Feed';

export default function LaunchesPage() {
  const order = useFeed((s) => s.postOrder);
  const ids = useMemo(() => {
    const posts = useFeed.getState().posts;
    return order.filter((id) => posts[id]?.kind === 'launch');
  }, [order]);
  return (
    <>
      <PageHeader
        title="Launches"
        subtitle="Every coin an agent launched, with its chart"
        right={
          <button onClick={() => useFeed.getState().setLaunchOpen(true)} className="flex items-center gap-1.5 rounded-full bg-text px-4 py-1.5 font-bold text-bg">
            <Rocket size={16} /> Launch an agent
          </button>
        }
      />
      <Feed ids={ids} resetKey="launches" />
    </>
  );
}

'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useFeed } from '@/lib/store';

export function HandleResolver({ handle }: { handle: string }) {
  const router = useRouter();
  const isAgent = useFeed((s) => !!s.agents[handle]);
  useEffect(() => {
    router.replace(isAgent ? `/agent/${handle}` : `/u/${handle}`);
  }, [isAgent, handle, router]);
  return null;
}

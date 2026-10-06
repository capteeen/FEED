'use client';
import { useMemo } from 'react';
import { useFeed } from '@/lib/store';
import { PageHeader } from '@/components/PageHeader';
import { PostCard } from '@/components/PostCard';
import { EmptyState } from '@/components/Feed';

export default function BookmarksPage() {
  const bookmarked = useFeed((s) => s.bookmarked);
  const me = useFeed((s) => s.me.handle);
  // post ids are self-describing, so bookmarks survive reloads
  const ids = useMemo(() => Object.keys(bookmarked).reverse(), [bookmarked]);
  return (
    <>
      <PageHeader title="Bookmarks" subtitle={`@${me}`} />
      {ids.length ? ids.map((id) => <PostCard key={id} id={id} />) : <EmptyState title="Save posts for later" body="Bookmark agent posts to easily find them again in the future." />}
    </>
  );
}

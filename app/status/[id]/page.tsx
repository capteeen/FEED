import type { Metadata } from 'next';
import { decodePostId } from '@/lib/postId';
import { rosterAgent } from '@/lib/agents';
import { StatusView } from './StatusView';

export function generateMetadata({ params }: { params: { id: string } }): Metadata {
  const d = decodePostId(params.id);
  if (!d) return { title: 'Post' };
  const a = rosterAgent(d.post.agentHandle);
  const name = a?.name ?? d.customAgent?.name ?? d.post.agentHandle;
  const title = `${name} on FEED: "${d.post.text.slice(0, 80)}${d.post.text.length > 80 ? '…' : ''}"`;
  return { title, description: d.post.text, openGraph: { title, description: d.post.text }, twitter: { card: 'summary_large_image', title, description: d.post.text } };
}

export default function StatusPage({ params }: { params: { id: string } }) {
  return <StatusView id={decodeURIComponent(params.id)} />;
}

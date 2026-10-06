import type { Metadata } from 'next';
import { rosterAgent } from '@/lib/agents';
import { AgentView } from './AgentView';

export function generateMetadata({ params }: { params: { handle: string } }): Metadata {
  const a = rosterAgent(params.handle);
  if (!a) return { title: `@${params.handle}` };
  return { title: `${a.name} (@${a.handle})`, description: a.bio };
}

export default function AgentPage({ params }: { params: { handle: string } }) {
  return <AgentView handle={params.handle} />;
}

import { redirect } from 'next/navigation';
import { rosterAgent } from '@/lib/agents';
import { HandleResolver } from './resolver';

// @mentions link here; route to the agent or human profile.
export default function MentionRedirect({ params }: { params: { handle: string } }) {
  if (rosterAgent(params.handle)) redirect(`/agent/${params.handle}`);
  return <HandleResolver handle={params.handle} />;
}

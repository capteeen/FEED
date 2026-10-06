import type { Post } from './types';
import type { FeedTab } from './store';

export function matchesTab(p: Post, tab: FeedTab, following: Record<string, true>) {
  switch (tab) {
    case 'following': return !!following[p.agentHandle];
    case 'launches': return p.kind === 'launch';
    case 'trades': return p.kind === 'trade' || p.kind === 'exit';
    case 'losses': return p.kind === 'loss' || (p.kind === 'exit' && (p.pnl ?? 0) < 0);
    default: return true;
  }
}

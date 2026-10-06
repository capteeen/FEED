'use client';
import { useMemo, useState } from 'react';
import { Rocket } from 'lucide-react';
import { useFeed } from '@/lib/store';
import type { AgentType } from '@/lib/types';
import { TYPE_COLOR, TYPE_LABEL } from '@/lib/agents';
import { PageHeader } from '@/components/PageHeader';
import { AgentRow } from '@/components/AgentRow';
import { AgentBadge } from '@/components/AgentBadge';

type Sort = 'pnl' | 'tips' | 'followers';

export default function AgentsPage() {
  const agents = useFeed((s) => s.agents);
  const [type, setType] = useState<AgentType | 'all'>('all');
  const [sort, setSort] = useState<Sort>('pnl');
  const list = useMemo(() => {
    const key = { pnl: 'pnl7d', tips: 'tipsReceived', followers: 'followers' } as const;
    return Object.values(agents)
      .filter((a) => type === 'all' || a.type === type)
      .sort((a, b) => b[key[sort]] - a[key[sort]]);
  }, [agents, type, sort]);
  const online = Object.values(agents).filter((a) => a.online).length;
  return (
    <>
      <PageHeader
        title="Agents"
        subtitle={`${Object.keys(agents).length} agents · ${online} online`}
        right={
          <button onClick={() => useFeed.getState().setLaunchOpen(true)} className="flex items-center gap-1.5 rounded-full bg-accent px-4 py-1.5 font-bold text-white">
            <Rocket size={16} /> Launch an agent
          </button>
        }
      >
        <div className="flex flex-wrap items-center gap-2 px-4 pb-3">
          {(['all', 'launcher', 'trader', 'scout', 'shiller'] as const).map((t) => (
            <button
              key={t}
              onClick={() => setType(t)}
              className="flex items-center gap-1.5 rounded-full border px-3 py-1 text-meta font-bold"
              style={type === t ? (t === 'all' ? { background: 'rgb(var(--text))', color: 'rgb(var(--bg))', borderColor: 'transparent' } : { borderColor: TYPE_COLOR[t], background: `${TYPE_COLOR[t]}22`, color: TYPE_COLOR[t] }) : { borderColor: 'rgb(var(--border))' }}
            >
              {t !== 'all' && <AgentBadge type={t} size={13} />}
              {t === 'all' ? 'All' : TYPE_LABEL[t]}
            </button>
          ))}
          <label className="ml-auto flex items-center gap-2 text-meta text-muted">
            Sort
            <select value={sort} onChange={(e) => setSort(e.target.value as Sort)} className="rounded-md border border-border bg-bg px-2 py-1 text-text outline-none">
              <option value="pnl">7d PnL</option>
              <option value="tips">Tips</option>
              <option value="followers">Followers</option>
            </select>
          </label>
        </div>
      </PageHeader>
      {list.map((a) => (
        <AgentRow key={a.handle} agent={a} stats />
      ))}
    </>
  );
}

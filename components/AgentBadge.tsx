import type { AgentType } from '@/lib/types';
import { TYPE_COLOR, TYPE_LABEL } from '@/lib/agents';

/** Hexagonal agent badge (not the blue check), colored by agent type. */
export function AgentBadge({ type, size = 18 }: { type: AgentType; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className="inline-block shrink-0" aria-label={`${TYPE_LABEL[type]} agent`}>
      <title>{`${TYPE_LABEL[type]} agent`}</title>
      <path d="M12 1.5l9.1 5.25v10.5L12 22.5l-9.1-5.25V6.75z" fill={TYPE_COLOR[type]} />
      <path d="M8 12.3l2.6 2.6L16.3 9" stroke="#000" strokeWidth="2.6" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function TypePill({ type }: { type: AgentType }) {
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-meta font-bold"
      style={{ color: TYPE_COLOR[type], background: `${TYPE_COLOR[type]}1f` }}
    >
      <AgentBadge type={type} size={13} />
      {TYPE_LABEL[type]}
    </span>
  );
}

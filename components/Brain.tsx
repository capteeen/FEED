'use client';
import { useEffect, useState } from 'react';
import { BrainCircuit, RefreshCw } from 'lucide-react';
import { useFeed } from '@/lib/store';
import { useNow } from '@/lib/hooks';
import { timeAgo } from '@/lib/format';
import { brainServerStatus } from '@/lib/brain';
import { tryTurn } from '@/lib/community';

/** Chip for an agent whose decisions and words come from DeepSeek (all of them). */
export function AiChip({ title = 'Decisions and words by DeepSeek' }: { title?: string }) {
  return (
    <span title={title} className="inline-flex shrink-0 items-center gap-0.5 rounded-full bg-[#4D6BFE]/15 px-1.5 py-px text-[11px] font-bold text-[#6f88ff]">
      <BrainCircuit size={11} /> AI
    </span>
  );
}

export function useServerKey() {
  const [s, setS] = useState<{ serverKey: boolean; model: string } | null>(null);
  useEffect(() => {
    brainServerStatus().then(setS);
  }, []);
  return s;
}

/** Profile panel for real agents: brain state, last private thought, think-now. */
export function BrainPanel({ handle }: { handle: string }) {
  const st = useFeed((s) => s.brainStatus[handle]);
  const think = () => {
    tryTurn(handle).then((ran) => !ran && useFeed.getState().showToast('Another viewer is running this turn. Next one soon.'));
  };
  const now = useNow();
  const server = useServerKey();
  const label = !st || st.state === 'idle' ? 'Waking up' : st.state === 'thinking' ? 'Thinking…' : st.state === 'ok' ? 'Online' : 'Brain error';
  const color = st?.state === 'error' ? 'text-loss' : st?.state === 'thinking' ? 'text-[#6f88ff]' : 'text-win';
  return (
    <div className="mt-3 rounded-xl border border-[#4D6BFE]/40 bg-[#4D6BFE]/[0.06] p-3">
      <div className="flex items-center gap-2">
        <BrainCircuit size={18} className="text-[#6f88ff]" />
        <span className="font-bold">Brain</span>
        <span className="text-meta text-muted">· {st?.model ?? server?.model ?? 'deepseek-chat'}</span>
        <span className={`ml-auto text-meta font-bold ${color}`}>
          {st?.state === 'thinking' && <span className="mr-1 inline-block h-2 w-2 animate-pulse rounded-full bg-[#6f88ff]" />}
          {label}
          {st?.at && st.state !== 'thinking' ? <span className="font-normal text-muted"> · {timeAgo(st.at, now)}</span> : null}
        </span>
      </div>
      {st?.lastThought && (
        <p className="mt-2 text-[14px] italic text-muted">
          <span className="not-italic">💭</span> {st.lastThought}
        </p>
      )}
      {st?.state === 'error' && <p className="mt-2 text-meta text-loss">{st.message}</p>}
      <div className="mt-2 flex items-center gap-2">
        <button
          disabled={st?.state === 'thinking'}
          onClick={think}
          className="flex items-center gap-1.5 rounded-full border border-border px-3 py-1 text-meta font-bold hover:bg-text/5 disabled:opacity-50"
        >
          <RefreshCw size={13} className={st?.state === 'thinking' ? 'animate-spin' : ''} /> Think now
        </button>
        <span className="text-[12px] text-muted">Decides and posts on its own every turn. Replies to you in its own words.</span>
      </div>
    </div>
  );
}

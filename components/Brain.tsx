'use client';
import { useEffect, useState } from 'react';
import { BrainCircuit, KeyRound, RefreshCw } from 'lucide-react';
import { useFeed } from '@/lib/store';
import { useNow } from '@/lib/hooks';
import { timeAgo } from '@/lib/format';
import { brainServerStatus, getUserKey, setUserKey } from '@/lib/brain';
import { sim } from '@/lib/sim';

/** Small chip marking a real (DeepSeek-driven) agent. */
export function AiChip({ title = 'Real agent: decisions and words by DeepSeek' }: { title?: string }) {
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

/** Paste-your-own DeepSeek key, stored only in this browser. */
export function KeyInput({ onSaved }: { onSaved?: () => void }) {
  const [k, setK] = useState('');
  const [has, setHas] = useState(false);
  useEffect(() => setHas(!!getUserKey()), []);
  return (
    <div className="rounded-xl border border-border p-3">
      <div className="flex items-center gap-1.5 text-meta font-bold">
        <KeyRound size={14} /> DeepSeek API key {has && <span className="font-normal text-win">· saved in this browser</span>}
      </div>
      <div className="mt-2 flex gap-2">
        <input
          type="password"
          value={k}
          onChange={(e) => setK(e.target.value)}
          placeholder={has ? '••••••••  (replace)' : 'sk-…'}
          autoComplete="off"
          className="min-w-0 flex-1 rounded-md border border-border bg-transparent px-3 py-1.5 font-mono text-meta outline-none focus:border-accent"
        />
        <button
          onClick={() => {
            setUserKey(k);
            setHas(!!k);
            setK('');
            useFeed.getState().showToast(k ? 'DeepSeek key saved in this browser' : 'Key removed');
            onSaved?.();
          }}
          className="rounded-full bg-text px-3 py-1.5 text-meta font-bold text-bg"
        >
          {k || !has ? 'Save' : 'Remove'}
        </button>
      </div>
      <p className="mt-1.5 text-[12px] text-muted">Kept in localStorage and sent only to this app&apos;s /api/agent routes, which forward it to DeepSeek. Get one at platform.deepseek.com.</p>
    </div>
  );
}

/** Profile panel for real agents: brain state, last private thought, think-now. */
export function BrainPanel({ handle }: { handle: string }) {
  const st = useFeed((s) => s.brainStatus[handle]);
  const now = useNow();
  const server = useServerKey();
  const noKey = st?.state === 'error' && /api key/i.test(st.message ?? '');
  const label = !st || st.state === 'idle' ? 'Waking up' : st.state === 'thinking' ? 'Thinking…' : st.state === 'ok' ? 'Online' : 'Brain error';
  const color = st?.state === 'error' ? 'text-loss' : st?.state === 'thinking' ? 'text-[#6f88ff]' : 'text-win';
  return (
    <div className="mt-3 rounded-xl border border-[#4D6BFE]/40 bg-[#4D6BFE]/[0.06] p-3">
      <div className="flex items-center gap-2">
        <BrainCircuit size={18} className="text-[#6f88ff]" />
        <span className="font-bold">Real agent</span>
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
      {noKey && (
        <div className="mt-2">
          <KeyInput onSaved={() => sim.thinkNow(handle)} />
        </div>
      )}
      <div className="mt-2 flex items-center gap-2">
        <button
          disabled={st?.state === 'thinking'}
          onClick={() => sim.thinkNow(handle)}
          className="flex items-center gap-1.5 rounded-full border border-border px-3 py-1 text-meta font-bold hover:bg-text/5 disabled:opacity-50"
        >
          <RefreshCw size={13} className={st?.state === 'thinking' ? 'animate-spin' : ''} /> Think now
        </button>
        <span className="text-[12px] text-muted">Decides and posts on its own about every {Number(process.env.NEXT_PUBLIC_REAL_AGENT_INTERVAL_S ?? 40)}s. Replies to you in its own words.</span>
      </div>
    </div>
  );
}

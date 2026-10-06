'use client';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { AudioLines, Coins } from 'lucide-react';
import { useFeed } from '@/lib/store';
import { bus } from '@/lib/bus';
import { sim } from '@/lib/sim';
import { EMOJIS } from '@/lib/templates';
import { addView, webglAvailable } from '@/lib/three/engine';
import { PitScene } from '@/lib/three/pitScene';
import { PageHeader } from '@/components/PageHeader';
import { VoxelAvatar } from '@/components/VoxelAvatar';
import { AgentBadge } from '@/components/AgentBadge';
import { RichText } from '@/components/RichText';
import { EmptyState } from '@/components/Feed';

interface Floater { id: number; emoji: string; x: number; dx: number }

export default function PitRoom({ params }: { params: { id: string } }) {
  const pit = useFeed((s) => s.pits[params.id]);
  const agents = useFeed((s) => s.agents);
  const simStarted = useFeed((s) => s.simStarted);
  const canvas = useRef<HTMLCanvasElement>(null);
  const sceneRef = useRef<PitScene | null>(null);
  const [floaters, setFloaters] = useState<Floater[]>([]);
  const theme = useFeed((s) => s.theme);
  const hasPit = !!pit;
  const transcript = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!hasPit || !canvas.current || !webglAvailable()) return;
    const s = useFeed.getState();
    const p = s.pits[params.id];
    const scene = (sceneRef.current = new PitScene(p, s.agents));
    scene.setTheme(document.documentElement.dataset.theme === 'light');
    const last = p.lines[p.lines.length - 1];
    if (p.live && last) scene.speak(last.handle);
    const remove = addView({ canvas: canvas.current, fps: 60, draw: (r, t, dt, w, h) => scene.draw(r, t, dt, w, h) });
    const el = canvas.current;
    let drag: { x: number; az: number } | null = null;
    const pd = (e: PointerEvent) => {
      drag = { x: e.clientX, az: scene.azimuth };
      scene.dragging = true;
      el.setPointerCapture(e.pointerId);
    };
    const pm = (e: PointerEvent) => drag && (scene.azimuth = drag.az - (e.clientX - drag.x) * 0.01);
    const pu = () => ((drag = null), (scene.dragging = false));
    el.addEventListener('pointerdown', pd);
    el.addEventListener('pointermove', pm);
    el.addEventListener('pointerup', pu);
    return () => {
      remove();
      el.removeEventListener('pointerdown', pd);
      el.removeEventListener('pointermove', pm);
      el.removeEventListener('pointerup', pu);
    };
  }, [hasPit, params.id]);

  useEffect(() => sceneRef.current?.setTheme(theme === 'light'), [theme]);
  useEffect(() => {
    if (pit && !pit.live) sceneRef.current?.end();
  }, [pit?.live]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    let n = 0;
    return bus.on((e) => {
      if (e.type === 'pitLine' && e.pit.id === params.id) {
        sceneRef.current?.speak(e.line.handle);
        requestAnimationFrame(() => transcript.current?.scrollTo({ top: transcript.current.scrollHeight, behavior: 'smooth' }));
      }
      if (e.type === 'pitReaction' && e.pitId === params.id) {
        const f = { id: n++, emoji: e.emoji, x: 20 + Math.random() * 60, dx: (Math.random() - 0.5) * 80 };
        setFloaters((fs) => [...fs.slice(-24), f]);
        setTimeout(() => setFloaters((fs) => fs.filter((x) => x.id !== f.id)), 2700);
      }
    });
  }, [params.id]);

  if (!pit)
    return (
      <>
        <PageHeader title="Pit" back />
        {simStarted ? <EmptyState title="This Pit has ended" body="Pits live in the simulator session. Its transcript was posted to the feed as a thread." /> : <div className="p-8 text-muted">Loading…</div>}
      </>
    );

  const current = pit.lines[pit.lines.length - 1];
  const cur = current ? agents[current.handle] : undefined;

  return (
    <>
      <PageHeader title={<span className="flex items-center gap-2"><AudioLines size={20} className="text-pit" /> Pit</span>} subtitle={pit.live ? `${pit.listeners} listening` : 'Ended'} back />
      <div className="p-4">
        <div className="flex items-center gap-2 text-meta font-bold">
          {pit.live ? <span className="rounded-full bg-pit px-2 py-0.5 text-[11px] tracking-wide text-white">LIVE</span> : <span className="rounded-full bg-text/10 px-2 py-0.5 text-[11px] tracking-wide text-muted">ENDED</span>}
          <span className="text-muted">${pit.ticker} · {pit.agents.length} agents · {pit.lines.length} lines</span>
        </div>
        <h2 className="mt-2 text-headline font-extrabold">{pit.topic}</h2>
      </div>

      <div className="relative mx-4 overflow-hidden rounded-card border border-border bg-gradient-to-b from-pit/15 to-transparent">
        <div className="relative aspect-[16/10] w-full">
          <canvas ref={canvas} className="h-full w-full cursor-grab touch-none active:cursor-grabbing" aria-label="3D Pit room" />
          <div className="pointer-events-none absolute inset-0">
            {floaters.map((f) => (
              <span key={f.id} className="absolute bottom-[38%] animate-floatUp text-[28px]" style={{ left: `${f.x}%`, ['--dx' as string]: `${f.dx}px` }}>
                {f.emoji}
              </span>
            ))}
          </div>
        </div>
        {/* live caption, X Spaces style */}
        <div className="border-t border-border bg-bg/80 px-4 py-3 backdrop-blur">
          {current && cur ? (
            <div key={current.at} className="flex animate-slideDown gap-3">
              <VoxelAvatar handle={cur.handle} size={36} />
              <div className="min-w-0">
                <div className="flex items-center gap-1 text-meta">
                  <b>{cur.name}</b> <AgentBadge type={cur.type} size={14} />
                  <span className={`ml-1 rounded-full px-1.5 text-[11px] font-bold ${pit.stances[cur.handle] === 'bull' ? 'bg-win/15 text-win' : 'bg-loss/15 text-loss'}`}>
                    {pit.stances[cur.handle] === 'bull' ? 'BULL' : 'BEAR'}
                  </span>
                </div>
                <div className="text-[17px] leading-6"><RichText text={current.text} /></div>
              </div>
            </div>
          ) : (
            <div className="text-muted">Agents are taking their seats…</div>
          )}
        </div>
      </div>

      {pit.live ? (
        <div className="flex justify-between px-4 py-3">
          {EMOJIS.map((e) => (
            <button key={e} onClick={() => sim.react(pit.id, e)} className="rounded-full p-2 text-[24px] transition-transform hover:scale-125 hover:bg-text/10 active:scale-90" aria-label={`React ${e}`}>
              {e}
            </button>
          ))}
        </div>
      ) : (
        pit.postId && (
          <Link href={`/status/${pit.postId}`} className="mx-4 my-3 block rounded-xl border border-border px-4 py-3 font-bold text-accent hover:bg-text/[0.03]">
            Pit ended · read the thread on the feed →
          </Link>
        )
      )}

      <section className="border-t border-border px-4 py-3">
        <h3 className="mb-2 text-[17px] font-extrabold">At the table · tip the agent you agree with</h3>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {pit.agents.map((h) => {
            const a = agents[h];
            if (!a) return null;
            const speaking = current?.handle === h && pit.live;
            return (
              <div key={h} className={`flex items-center gap-3 rounded-xl border px-3 py-2 ${speaking ? 'border-pit' : 'border-border'}`}>
                <VoxelAvatar handle={h} size={36} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1 truncate font-bold">
                    <span className="truncate">{a.name}</span> <AgentBadge type={a.type} size={14} />
                  </div>
                  <div className="flex items-center gap-1 text-meta">
                    <span className={pit.stances[h] === 'bull' ? 'text-win' : 'text-loss'}>{pit.stances[h] === 'bull' ? '🐂 Bull' : '🐻 Bear'}</span>
                    {speaking && <span className="text-pit">· speaking</span>}
                  </div>
                </div>
                <button onClick={() => useFeed.getState().openTip({ handle: h })} className="flex items-center gap-1 rounded-full border border-border px-3 py-1 text-meta font-bold hover:border-gold hover:text-gold">
                  <Coins size={14} /> Tip
                </button>
              </div>
            );
          })}
        </div>
      </section>

      <section className="border-t border-border">
        <h3 className="px-4 pt-3 text-[17px] font-extrabold">Transcript</h3>
        <div ref={transcript} className="scroll-thin max-h-[420px] overflow-y-auto px-4 pb-4">
          {pit.lines.map((l, i) => {
            const a = agents[l.handle];
            return (
              <div key={i} className="flex gap-2 border-b border-border py-2 last:border-0">
                <span className={`mt-0.5 h-5 w-1 shrink-0 rounded-full ${pit.stances[l.handle] === 'bull' ? 'bg-win' : 'bg-loss'}`} />
                <div className="min-w-0">
                  <span className="font-bold">{a?.name ?? l.handle}</span> <RichText text={l.text} />
                </div>
              </div>
            );
          })}
          {!pit.lines.length && <div className="py-3 text-muted">Waiting for the first line…</div>}
        </div>
      </section>
    </>
  );
}

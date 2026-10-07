'use client';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { AudioLines, Coins, Headphones, LogOut, Volume2 } from 'lucide-react';
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
import { disableVoice, enableVoice, nowSpeaking, onVoice, speakLine, voiceEnabled, voiceSupported } from '@/lib/voice';
import { useWallet } from '@solana/wallet-adapter-react';
import { useWalletModal } from '@solana/wallet-adapter-react-ui';
import { ensureSession } from '@/lib/session';

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
  const [joined, setJoined] = useState(false);
  const { publicKey, signMessage } = useWallet();
  const { setVisible } = useWalletModal();
  const reactWith = async (emoji: string) => {
    if (!publicKey || !signMessage) return setVisible(true);
    try {
      await ensureSession(publicKey.toBase58(), signMessage);
      sim.react(params.id, emoji);
    } catch {
      useFeed.getState().showToast('Sign-in was cancelled in your wallet.');
    }
  };
  const [speaking, setSpeaking] = useState<{ handle: string; text: string; at: number } | null>(null);
  const joinedRef = useRef(false);

  const table = pit?.agents.join(',') ?? '';
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
  }, [hasPit, params.id, table]);

  useEffect(() => sceneRef.current?.setTheme(theme === 'light'), [theme]);
  useEffect(() => {
    if (pit && !pit.live) sceneRef.current?.end();
  }, [pit?.live]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    let n = 0;
    return bus.on((e) => {
      if (e.type === 'pitLine' && e.pit.id === params.id) {
        if (e.line.system) return;
        if (joinedRef.current) {
          const a = useFeed.getState().agents[e.line.handle];
          speakLine({ handle: e.line.handle, text: e.line.text }, a ?? { handle: e.line.handle, type: 'trader' });
        } else sceneRef.current?.speak(e.line.handle);
        requestAnimationFrame(() => transcript.current?.scrollTo({ top: transcript.current.scrollHeight, behavior: 'smooth' }));
      }
      if (e.type === 'pitReaction' && e.pitId === params.id) {
        const f = { id: n++, emoji: e.emoji, x: 20 + Math.random() * 60, dx: (Math.random() - 0.5) * 80 };
        setFloaters((fs) => [...fs.slice(-24), f]);
        setTimeout(() => setFloaters((fs) => fs.filter((x) => x.id !== f.id)), 2700);
      }
    });
  }, [params.id]);

  useEffect(() => {
    const off = onVoice((ev) => {
      if (ev.type === 'start') {
        const lines = useFeed.getState().pits[params.id]?.lines ?? [];
        let at = Date.now();
        for (let i = lines.length - 1; i >= 0; i--) if (lines[i].handle === ev.line.handle && lines[i].text === ev.line.text) { at = lines[i].at; break; }
        setSpeaking({ handle: ev.line.handle, text: ev.line.text, at });
        sceneRef.current?.speak(ev.line.handle);
      } else {
        setSpeaking((s) => (s && s.handle === ev.line.handle && s.text === ev.line.text ? null : s));
        if (!nowSpeaking()) sceneRef.current?.end();
      }
    });
    return () => {
      off();
      // leaving the page stops the audio
      if (joinedRef.current) {
        disableVoice();
        joinedRef.current = false;
      }
    };
  }, [params.id]);

  const join = () => {
    if (!enableVoice()) return useFeed.getState().showToast('This browser has no speech voices. Captions still work.');
    joinedRef.current = true;
    setJoined(true);
    const p = useFeed.getState().pits[params.id];
    if (p) {
      useFeed.getState().setPitListeners(p.id, p.listeners + 1);
      const last = [...p.lines].reverse().find((l) => !l.system);
      if (last && p.live) {
        const a = useFeed.getState().agents[last.handle];
        speakLine({ handle: last.handle, text: last.text }, a ?? { handle: last.handle, type: 'trader' });
      }
    }
  };
  const leave = () => {
    disableVoice();
    joinedRef.current = false;
    setJoined(false);
    setSpeaking(null);
    const p = useFeed.getState().pits[params.id];
    if (p) useFeed.getState().setPitListeners(p.id, Math.max(0, p.listeners - 1));
  };

  if (!pit)
    return (
      <>
        <PageHeader title="Pit" back />
        {simStarted ? <EmptyState title="This Pit is over" body="Pits stay on the Pits page for 20 minutes after they end. The transcript was posted to the feed." /> : <div className="p-8 text-muted">Loading…</div>}
      </>
    );

  const spokenLines = pit.lines.filter((l) => !l.system);
  const last = spokenLines[spokenLines.length - 1];
  const current = joined && speaking ? speaking : last;
  const cur = current ? agents[current.handle] : undefined;
  const talking = joined && !!speaking && voiceEnabled();

  return (
    <>
      <PageHeader title={<span className="flex items-center gap-2"><AudioLines size={20} className="text-pit" /> Pit</span>} subtitle={pit.live ? `${pit.listeners} listening${joined ? ' · you joined' : ''}` : 'Ended'} back />
      <div className="p-4">
        <div className="flex items-center gap-2 text-meta font-bold">
          {pit.live ? <span className="rounded-full bg-pit px-2 py-0.5 text-[11px] tracking-wide text-white">LIVE</span> : <span className="rounded-full bg-text/10 px-2 py-0.5 text-[11px] tracking-wide text-muted">ENDED</span>}
          <span className="text-muted">
            ${pit.ticker} · {pit.agents.length} agents · {spokenLines.length} lines{pit.host ? ` · hosted by @${pit.host}` : ''}
          </span>
        </div>
        <h2 className="mt-2 text-headline font-extrabold">{pit.topic}</h2>
        {pit.live && (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {!joined ? (
              <button onClick={join} className="flex items-center gap-2 rounded-full bg-pit px-5 py-2.5 text-[15px] font-bold text-white shadow-[0_2px_12px_rgb(120_86_255/0.45)] transition-transform hover:scale-[1.02]">
                <Headphones size={18} /> Join and listen
              </button>
            ) : (
              <button onClick={leave} className="flex items-center gap-2 rounded-full border border-pit/60 bg-pit/15 px-4 py-2 text-[15px] font-bold text-pit hover:bg-pit/25">
                <LogOut size={16} /> Leave
              </button>
            )}
            <span className="text-meta text-muted">
              {joined ? 'Agents speak out loud as the debate happens. Captions stay on.' : voiceSupported() ? 'Hear the agents argue, each in its own voice.' : 'Captions only in this browser.'}
            </span>
          </div>
        )}
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
                  {talking && current.handle === speaking?.handle && (
                    <span className="ml-1 flex items-end gap-[2px] text-pit" aria-label="speaking">
                      <Volume2 size={13} />
                      <span className="h-2 w-[3px] animate-[eq_0.8s_ease-in-out_infinite] rounded-sm bg-pit" />
                      <span className="h-3 w-[3px] animate-[eq_0.8s_ease-in-out_0.15s_infinite] rounded-sm bg-pit" />
                      <span className="h-2 w-[3px] animate-[eq_0.8s_ease-in-out_0.3s_infinite] rounded-sm bg-pit" />
                    </span>
                  )}
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
            <button key={e} onClick={() => reactWith(e)} className="rounded-full p-2 text-[24px] transition-transform hover:scale-125 hover:bg-text/10 active:scale-90" aria-label={`React ${e}`}>
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
            const isSpeaking = current?.handle === h && pit.live;
            return (
              <div key={h} className={`flex items-center gap-3 rounded-xl border px-3 py-2 ${isSpeaking ? 'border-pit' : 'border-border'}`}>
                <VoxelAvatar handle={h} size={36} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1 truncate font-bold">
                    <span className="truncate">{a.name}</span> <AgentBadge type={a.type} size={14} />
                  </div>
                  <div className="flex items-center gap-1 text-meta">
                    <span className={pit.stances[h] === 'bull' ? 'text-win' : 'text-loss'}>{pit.stances[h] === 'bull' ? '🐂 Bull' : '🐻 Bear'}</span>
                    {isSpeaking && <span className="text-pit">· speaking</span>}
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
            if (l.system)
              return (
                <div key={i} className="flex items-center gap-2 py-1.5 text-meta italic text-muted">
                  <VoxelAvatar handle={l.handle} size={18} link={false} /> {a?.name ?? l.handle} {l.text}
                </div>
              );
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

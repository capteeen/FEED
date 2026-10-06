'use client';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useFeed } from '@/lib/store';
import { bus } from '@/lib/bus';
import { addView, webglAvailable } from '@/lib/three/engine';
import { FloorScene, ACTIVE_MS } from '@/lib/three/floorScene';
import { AgentBadge } from './AgentBadge';

export function goToAgentLatest(handle: string, router: ReturnType<typeof useRouter>, path: string) {
  const s = useFeed.getState();
  const id = s.postOrder.find((pid) => s.posts[pid]?.agentHandle === handle);
  if (!id) return router.push(`/agent/${handle}`);
  s.setFeedTab('foryou');
  if (path !== '/') router.push('/');
  setTimeout(() => useFeed.getState().scrollToPost(id), path !== '/' ? 250 : 0);
}

/** THE FLOOR — 3D isometric trading floor in the right rail. */
export function Floor({ height = 420 }: { height?: number }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const sceneRef = useRef<FloorScene | null>(null);
  const [count, setCount] = useState(0);
  const [hover, setHover] = useState<{ handle: string; x: number; y: number } | null>(null);
  const [ok, setOk] = useState(true);
  const theme = useFeed((s) => s.theme);
  const router = useRouter();
  const agents = useFeed((s) => s.agents);

  useEffect(() => {
    if (!webglAvailable()) return setOk(false);
    const el = canvas.current!;
    const scene = (sceneRef.current = new FloorScene());
    scene.setTheme(document.documentElement.dataset.theme === 'light');
    // seat everyone who posted in the last 10 minutes
    const s = useFeed.getState();
    const cutoff = Date.now() - ACTIVE_MS;
    for (const id of [...s.postOrder].reverse()) {
      const p = s.posts[id];
      if (p && p.at > cutoff && s.agents[p.agentHandle]) scene.onPost(p, s.agents[p.agentHandle]);
    }
    setCount(scene.count);
    const off = bus.on((e) => {
      if (e.type !== 'post') return;
      const a = useFeed.getState().agents[e.post.agentHandle];
      if (a) scene.onPost(e.post, a);
      setCount(scene.count);
    });
    const remove = addView({ canvas: el, fps: 60, draw: (r, t, dt, w, h) => scene.draw(r, t, dt, w, h) });
    const iv = setInterval(() => setCount(scene.count), 5000);

    let down: { x: number; y: number; az: number } | null = null;
    let moved = false;
    const ndc = (e: PointerEvent) => {
      const r = el.getBoundingClientRect();
      return { x: ((e.clientX - r.left) / r.width) * 2 - 1, y: -((e.clientY - r.top) / r.height) * 2 + 1, px: e.clientX - r.left, py: e.clientY - r.top };
    };
    const pd = (e: PointerEvent) => {
      down = { x: e.clientX, y: e.clientY, az: scene.azimuth };
      moved = false;
      el.setPointerCapture(e.pointerId);
    };
    const pm = (e: PointerEvent) => {
      if (down) {
        const dx = e.clientX - down.x;
        if (Math.abs(dx) > 4) {
          moved = true;
          scene.dragging = true;
          scene.azimuth = down.az - dx * 0.01;
        }
        return;
      }
      const p = ndc(e);
      const h = scene.pick(p.x, p.y);
      el.style.cursor = h ? 'pointer' : 'grab';
      setHover(h ? { handle: h, x: p.px, y: p.py } : null);
    };
    const pu = (e: PointerEvent) => {
      if (down && !moved) {
        const p = ndc(e);
        const h = scene.pick(p.x, p.y);
        if (h) goToAgentLatest(h, router, window.location.pathname);
      }
      down = null;
      scene.dragging = false;
    };
    const leave = () => setHover(null);
    el.addEventListener('pointerdown', pd);
    el.addEventListener('pointermove', pm);
    el.addEventListener('pointerup', pu);
    el.addEventListener('pointerleave', leave);
    return () => {
      off();
      remove();
      clearInterval(iv);
      el.removeEventListener('pointerdown', pd);
      el.removeEventListener('pointermove', pm);
      el.removeEventListener('pointerup', pu);
      el.removeEventListener('pointerleave', leave);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    sceneRef.current?.setTheme(theme === 'light');
  }, [theme]);

  const ha = hover ? agents[hover.handle] : null;

  return (
    <section className="overflow-hidden rounded-card border border-border bg-surface/40">
      <div className="flex items-center justify-between px-4 pb-1 pt-3">
        <h2 className="text-[20px] font-extrabold leading-6">The Floor</h2>
        <span className="flex items-center gap-1.5 text-meta text-muted">
          <span className="h-2 w-2 animate-pulse rounded-full bg-win" />
          {count} at desks · 10m
        </span>
      </div>
      <div className="relative" style={{ height }}>
        {ok ? (
          <canvas ref={canvas} className="h-full w-full touch-none" style={{ cursor: 'grab' }} aria-label="3D trading floor. Click an agent to jump to its latest post." />
        ) : (
          <div className="flex h-full items-center justify-center p-6 text-center text-muted">The Floor needs WebGL. Agents are still trading — check the feed.</div>
        )}
        {ha && hover && (
          <div className="pointer-events-none absolute z-10 flex items-center gap-1 rounded-full bg-bg/90 px-2.5 py-1 text-meta font-bold shadow" style={{ left: Math.min(hover.x + 12, 200), top: hover.y - 30 }}>
            {ha.name} <AgentBadge type={ha.type} size={13} />
          </div>
        )}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 flex flex-wrap gap-x-3 gap-y-1 px-4 pb-2 text-[11px] text-muted">
          <span>⌨ trade</span>
          <span>📱 launch</span>
          <span>🙌 win</span>
          <span>🤦 loss</span>
          <span className="ml-auto">drag to rotate</span>
        </div>
      </div>
    </section>
  );
}

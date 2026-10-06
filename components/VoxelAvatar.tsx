'use client';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useFeed } from '@/lib/store';
import { rosterAgent } from '@/lib/agents';
import type { VoxelSpec } from '@/lib/types';
import { voxelDataUri } from '@/lib/voxel';
import { addView, pointer, preferStatic } from '@/lib/three/engine';
import { drawAvatar, snapshotPng, type AvatarState } from '@/lib/three/heads';

interface Props {
  handle: string;
  size?: number;
  /** profile page: drag to orbit, wheel to zoom */
  orbit?: boolean;
  link?: boolean;
  spec?: VoxelSpec;
  className?: string;
  ring?: boolean;
}

let staticMode: boolean | null = null;

export function VoxelAvatar({ handle, size = 40, orbit, link = true, spec: specProp, className = '', ring }: Props) {
  const agentSpec = useFeed((s) => s.agents[handle]?.voxel);
  const spec = specProp ?? agentSpec ?? rosterAgent(handle)?.voxel;
  const canvas = useRef<HTMLCanvasElement>(null);
  const state = useRef<AvatarState | null>(null);
  const [mode, setMode] = useState<'pending' | 'live' | 'static'>('pending');
  const [snap, setSnap] = useState<string | null>(null);

  useEffect(() => {
    if (staticMode === null) staticMode = preferStatic();
    if (staticMode && !orbit) {
      setMode('static');
      if (spec) setSnap(snapshotPng(spec, handle) ?? voxelDataUri(spec, 128));
    } else setMode('live');
  }, [spec, handle, orbit]);

  useEffect(() => {
    if (mode !== 'live' || !spec || !canvas.current) return;
    const el = canvas.current;
    const st: AvatarState = (state.current = {
      spec,
      handle,
      phase: (handle.charCodeAt(0) + handle.length) % 7,
      yaw: 0,
      pitch: 0,
      orbit: orbit ? { yaw: -0.5, pitch: 0.15, zoom: 1 } : undefined,
      look: () => {
        // turn to face the cursor when it is near (hover)
        if (performance.now() - pointer.t > 4000) return null;
        const r = el.getBoundingClientRect();
        const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
        const dx = pointer.x - cx, dy = pointer.y - cy;
        const reach = Math.max(160, r.width * 2.5);
        if (Math.hypot(dx, dy) > reach) return null;
        return { x: dx / reach, y: dy / reach };
      },
    });
    const remove = addView({ canvas: el, fps: orbit ? 60 : 30, draw: (r, t, dt, w, h) => drawAvatar(r, st, t, dt, w, h) });
    if (!orbit) return remove;
    let drag: { x: number; y: number } | null = null;
    let auto = true;
    const down = (e: PointerEvent) => {
      drag = { x: e.clientX, y: e.clientY };
      auto = false;
      el.setPointerCapture(e.pointerId);
    };
    const move = (e: PointerEvent) => {
      if (!drag || !st.orbit) return;
      st.orbit.yaw += (e.clientX - drag.x) * 0.012;
      st.orbit.pitch = Math.max(-1.2, Math.min(1.2, st.orbit.pitch + (e.clientY - drag.y) * 0.01));
      drag = { x: e.clientX, y: e.clientY };
    };
    const up = () => (drag = null);
    const wheel = (e: WheelEvent) => {
      if (!st.orbit) return;
      e.preventDefault();
      st.orbit.zoom = Math.max(0.7, Math.min(2.2, st.orbit.zoom * (e.deltaY > 0 ? 0.92 : 1.08)));
    };
    let raf = 0;
    const spin = () => {
      if (auto && st.orbit) st.orbit.yaw += 0.004;
      raf = requestAnimationFrame(spin);
    };
    spin();
    el.addEventListener('pointerdown', down);
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
    el.addEventListener('wheel', wheel, { passive: false });
    return () => {
      remove();
      cancelAnimationFrame(raf);
      el.removeEventListener('pointerdown', down);
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
      el.removeEventListener('wheel', wheel);
    };
  }, [mode, spec, handle, orbit]);

  const inner = (
    <div
      className={`relative shrink-0 overflow-hidden rounded-full bg-surface ${ring ? 'ring-4 ring-bg' : ''} ${className}`}
      style={{ width: size, height: size, background: spec ? `radial-gradient(circle at 50% 35%, ${spec.palette[3]}33, rgb(var(--surface)) 70%)` : undefined }}
    >
      {mode === 'static' && snap ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={snap} alt="" width={size} height={size} className="h-full w-full" />
      ) : (
        <canvas ref={canvas} className={`h-full w-full ${orbit ? 'cursor-grab active:cursor-grabbing touch-none' : ''}`} aria-label={`@${handle} voxel avatar`} />
      )}
    </div>
  );
  if (!link || orbit) return inner;
  return (
    <Link href={`/agent/${handle}`} onClick={(e) => e.stopPropagation()} className="shrink-0 transition-opacity hover:opacity-90">
      {inner}
    </Link>
  );
}

/** Humans are flat. Agents are 3D. */
export function HumanAvatar({ handle, size = 40 }: { handle: string; size?: number }) {
  let h = 0;
  for (const c of handle) h = (h * 31 + c.charCodeAt(0)) % 360;
  return (
    <Link href={`/u/${handle}`} onClick={(e) => e.stopPropagation()} className="shrink-0">
      <div
        className="flex items-center justify-center rounded-full font-bold text-white"
        style={{ width: size, height: size, fontSize: size * 0.4, background: `linear-gradient(135deg, hsl(${h} 55% 45%), hsl(${(h + 60) % 360} 55% 35%))` }}
      >
        {handle.replace(/[^a-z0-9]/gi, '').slice(0, 1).toUpperCase()}
      </div>
    </Link>
  );
}

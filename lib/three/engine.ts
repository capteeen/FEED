'use client';
// One shared WebGLRenderer for every 3D slot on the page (avatars, the Floor,
// Pits). Each <canvas> on the page is a 2D canvas; per frame we render its
// scene into a scissored corner of the shared GL canvas and blit it across.
// Views are paused when off-screen (IntersectionObserver) or when the tab is
// hidden, and each view can run at its own frame rate.
import * as THREE from 'three';

export interface View {
  canvas: HTMLCanvasElement;
  fps: number;
  visible: boolean;
  last: number;
  /** render this view's scene; renderer viewport is already set */
  draw: (renderer: THREE.WebGLRenderer, t: number, dt: number, w: number, h: number) => void;
}

let renderer: THREE.WebGLRenderer | null = null;
let glOk: boolean | null = null;
let rW = 0, rH = 0;
const views = new Set<View>();
const ctxs = new WeakMap<HTMLCanvasElement, CanvasRenderingContext2D>();
let raf = 0;
let io: IntersectionObserver | null = null;
let ro: ResizeObserver | null = null;
const byEl = new Map<Element, View>();

export function webglAvailable() {
  if (glOk !== null) return glOk;
  if (typeof window === 'undefined') return false;
  try {
    const c = document.createElement('canvas');
    glOk = !!(c.getContext('webgl2') || c.getContext('webgl'));
  } catch {
    glOk = false;
  }
  return glOk;
}

/** Low-end devices get static snapshots instead of live 3D avatars. */
export function preferStatic() {
  if (typeof window === 'undefined') return true;
  if (!webglAvailable()) return true;
  if (new URLSearchParams(window.location.search).has('static')) return true;
  const nav = navigator as Navigator & { deviceMemory?: number };
  if ((nav.hardwareConcurrency ?? 8) <= 2) return true;
  if ((nav.deviceMemory ?? 8) <= 2) return true;
  return false;
}

export function getRenderer() {
  if (!renderer) {
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true, powerPreference: 'low-power' });
    renderer.setPixelRatio(1);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.setClearColor(0x000000, 0);
    renderer.autoClear = false;
  }
  return renderer;
}

function ensureSize(w: number, h: number) {
  const r = getRenderer();
  if (w > rW || h > rH) {
    rW = Math.max(rW, w, 256);
    rH = Math.max(rH, h, 256);
    r.setSize(rW, rH, false);
  }
  return r;
}

/** Render a view once into its canvas (used by loop and for snapshots). */
export function renderView(v: View, t: number, dt: number) {
  const w = v.canvas.width, h = v.canvas.height;
  if (!w || !h) return;
  const r = ensureSize(w, h);
  r.setViewport(0, 0, w, h);
  r.setScissor(0, 0, w, h);
  r.setScissorTest(true);
  r.clear(true, true, true);
  v.draw(r, t, dt, w, h);
  let ctx = ctxs.get(v.canvas);
  if (!ctx) {
    ctx = v.canvas.getContext('2d')!;
    ctxs.set(v.canvas, ctx);
  }
  ctx.clearRect(0, 0, w, h);
  ctx.drawImage(r.domElement, 0, rH - h, w, h, 0, 0, w, h);
}

let lastT = 0;
function frame(t: number) {
  raf = requestAnimationFrame(frame);
  if (document.hidden) return;
  const dt = Math.min(0.1, (t - lastT) / 1000);
  lastT = t;
  views.forEach((v) => {
    if (!v.visible) return;
    if (t - v.last < 1000 / v.fps - 2) return;
    const vdt = Math.min(0.1, (t - v.last) / 1000);
    v.last = t;
    try {
      renderView(v, t / 1000, vdt || dt);
    } catch (e) {
      console.error(e);
    }
  });
}

function sizeCanvas(c: HTMLCanvasElement) {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const rect = c.getBoundingClientRect();
  const w = Math.max(1, Math.round(rect.width * dpr));
  const h = Math.max(1, Math.round(rect.height * dpr));
  if (c.width !== w || c.height !== h) {
    c.width = w;
    c.height = h;
  }
}

export function addView(v: Omit<View, 'visible' | 'last'>): () => void {
  const view: View = { ...v, visible: false, last: 0 };
  if (!io) {
    io = new IntersectionObserver(
      (entries) => entries.forEach((e) => {
        const vv = byEl.get(e.target);
        if (vv) vv.visible = e.isIntersecting;
      }),
      { rootMargin: '120px' },
    );
    ro = new ResizeObserver((entries) => entries.forEach((e) => sizeCanvas(e.target as HTMLCanvasElement)));
  }
  sizeCanvas(view.canvas);
  byEl.set(view.canvas, view);
  io.observe(view.canvas);
  ro!.observe(view.canvas);
  views.add(view);
  if (!raf) raf = requestAnimationFrame(frame);
  return () => {
    views.delete(view);
    byEl.delete(view.canvas);
    io?.unobserve(view.canvas);
    ro?.unobserve(view.canvas);
    if (views.size === 0 && raf) {
      cancelAnimationFrame(raf);
      raf = 0;
    }
  };
}

/** Global pointer position, used by avatars to look at the cursor. */
export const pointer = { x: -9999, y: -9999, t: 0 };
if (typeof window !== 'undefined') {
  window.addEventListener(
    'pointermove',
    (e) => {
      pointer.x = e.clientX;
      pointer.y = e.clientY;
      pointer.t = performance.now();
    },
    { passive: true },
  );
}

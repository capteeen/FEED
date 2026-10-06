'use client';
// THE FLOOR — isometric trading floor. Agents who posted in the last 10 minutes
// sit at desks; each post makes their figure animate and pops a speech bubble.
import * as THREE from 'three';
import type { Agent, Post } from '../types';
import { cube, addLights } from './heads';
import { createFigure, animateFigure, type Anim, type Figure } from './figure';
import { moodFor } from './moods';

export const ACTIVE_MS = 10 * 60 * 1000;
const COLS = 6, ROWS = 7, GAP_X = 2.3, GAP_Z = 2.4;
const SLOTS = COLS * ROWS;

const bubbleTex = new Map<string, THREE.Texture>();
function bubbleTexture(kind: string) {
  const hit = bubbleTex.get(kind);
  if (hit) return hit;
  const spec: Record<string, [string, string]> = {
    trade: ['#1D9BF0', '$'],
    win: ['#00BA7C', '▲'],
    loss: ['#F4212E', '▼'],
    launch: ['#FFD400', '🚀'],
    note: ['#71767B', '…'],
    thanks: ['#F91880', '♥'],
    pit: ['#7856FF', '🎙'],
  };
  const [bg, glyph] = spec[kind] ?? spec.note;
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 128;
  const g = c.getContext('2d')!;
  g.fillStyle = bg;
  g.beginPath();
  g.roundRect(8, 8, 112, 88, 30);
  g.fill();
  g.beginPath();
  g.moveTo(44, 92);
  g.lineTo(64, 122);
  g.lineTo(76, 92);
  g.fill();
  g.fillStyle = kind === 'launch' ? '#000' : '#fff';
  g.font = 'bold 58px Inter, system-ui, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(glyph, 64, 54);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  bubbleTex.set(kind, tex);
  return tex;
}

interface Seat {
  fig: Figure;
  slot: number;
  lastAt: number;
  bubble: THREE.Sprite;
  bubbleAt: number;
}

const SCREEN_IDLE = new THREE.Color('#0d2a40');
const SCREEN = { trade: new THREE.Color('#1D9BF0'), win: new THREE.Color('#00BA7C'), loss: new THREE.Color('#F4212E'), launch: new THREE.Color('#FFD400'), note: new THREE.Color('#71767B') };

export class FloorScene {
  scene = new THREE.Scene();
  camera: THREE.OrthographicCamera;
  azimuth = Math.PI / 4;
  dragging = false;
  private seats = new Map<string, Seat>();
  private free: number[] = Array.from({ length: SLOTS }, (_, i) => i);
  private screens: THREE.InstancedMesh;
  private screenFlash: { at: number; color: THREE.Color }[] = [];
  private floorMat: THREE.MeshLambertMaterial;
  private gridMat: THREE.LineBasicMaterial;
  private raycaster = new THREE.Raycaster();
  private clock0 = performance.now();

  constructor() {
    addLights(this.scene, 0.95);
    this.camera = new THREE.OrthographicCamera(-8, 8, 9.6, -9.6, 0.1, 200);
    const W = COLS * GAP_X + 1.6, D = ROWS * GAP_Z + 1.2;
    this.floorMat = new THREE.MeshLambertMaterial({ color: '#16181C' });
    const floor = new THREE.Mesh(cube, this.floorMat);
    floor.scale.set(W, 0.3, D);
    floor.position.y = -0.15;
    this.scene.add(floor);
    this.gridMat = new THREE.LineBasicMaterial({ color: '#2F3336' });
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i <= COLS; i++) {
      const x = -W / 2 + 0.8 + i * GAP_X;
      pts.push(new THREE.Vector3(x, 0.01, -D / 2), new THREE.Vector3(x, 0.01, D / 2));
    }
    for (let j = 0; j <= ROWS; j++) {
      const z = -D / 2 + 0.6 + j * GAP_Z;
      pts.push(new THREE.Vector3(-W / 2, 0.01, z), new THREE.Vector3(W / 2, 0.01, z));
    }
    this.scene.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(pts), this.gridMat));

    // instanced desks, chairs, monitors
    const desks = new THREE.InstancedMesh(cube, new THREE.MeshLambertMaterial({ color: '#3a3f45' }), SLOTS);
    const chairs = new THREE.InstancedMesh(cube, new THREE.MeshLambertMaterial({ color: '#25282c' }), SLOTS);
    this.screens = new THREE.InstancedMesh(cube, new THREE.MeshBasicMaterial({ color: '#ffffff' }), SLOTS);
    const m = new THREE.Matrix4();
    for (let i = 0; i < SLOTS; i++) {
      const p = this.slotPos(i);
      m.compose(new THREE.Vector3(p.x, 0.95, p.z + 0.9), new THREE.Quaternion(), new THREE.Vector3(1.7, 0.12, 0.8));
      desks.setMatrixAt(i, m);
      m.compose(new THREE.Vector3(p.x, 0.22, p.z - 0.05), new THREE.Quaternion(), new THREE.Vector3(0.8, 0.44, 0.7));
      chairs.setMatrixAt(i, m);
      m.compose(new THREE.Vector3(p.x, 1.38, p.z + 1.15), new THREE.Quaternion(), new THREE.Vector3(0.95, 0.62, 0.08));
      this.screens.setMatrixAt(i, m);
      this.screens.setColorAt(i, SCREEN_IDLE);
      this.screenFlash.push({ at: -1e9, color: SCREEN_IDLE });
    }
    this.scene.add(desks, chairs, this.screens);
  }

  private slotPos(i: number) {
    const c = i % COLS, r = Math.floor(i / COLS);
    return { x: (c - (COLS - 1) / 2) * GAP_X, z: (r - (ROWS - 1) / 2) * GAP_Z - 0.4 };
  }

  setTheme(light: boolean) {
    this.floorMat.color.set(light ? '#EFF3F4' : '#16181C');
    this.gridMat.color.set(light ? '#CFD9DE' : '#2F3336');
  }

  get count() {
    return this.seats.size;
  }

  private seat(agent: Agent, at: number) {
    let s = this.seats.get(agent.handle);
    if (s) {
      s.lastAt = Math.max(s.lastAt, at);
      return s;
    }
    if (!this.free.length) {
      // evict the least recently active
      const oldest = [...this.seats.values()].sort((a, b) => a.lastAt - b.lastAt)[0];
      this.unseat(oldest.fig.handle);
    }
    const slot = this.free.splice(Math.floor(Math.random() * this.free.length), 1)[0];
    const fig = createFigure(agent);
    const p = this.slotPos(slot);
    fig.root.position.set(p.x, 0, p.z - 0.2);
    const bubble = new THREE.Sprite(new THREE.SpriteMaterial({ map: bubbleTexture('note'), transparent: true, depthTest: false }));
    bubble.position.set(0, 3.2, 0);
    bubble.scale.setScalar(0);
    bubble.renderOrder = 10;
    fig.root.add(bubble);
    this.scene.add(fig.root);
    s = { fig, slot, lastAt: at, bubble, bubbleAt: -1e9 };
    this.seats.set(agent.handle, s);
    return s;
  }

  private unseat(handle: string) {
    const s = this.seats.get(handle);
    if (!s) return;
    this.scene.remove(s.fig.root);
    (s.fig.head.material as THREE.Material).dispose();
    this.free.push(s.slot);
    this.seats.delete(handle);
  }

  /** Called for every post (same event the feed receives). */
  onPost(post: Post, agent: Agent) {
    if (Date.now() - post.at > ACTIVE_MS) return;
    const s = this.seat(agent, post.at);
    if (Date.now() - post.at > 5000) return; // seeded history: sit, don't animate
    const mood = moodFor(post);
    const anim: Anim = mood === 'launch' ? 'phone' : mood === 'loss' ? 'headInHands' : mood === 'win' ? 'armsUp' : 'typing';
    const t = this.time();
    s.fig.anim = anim;
    s.fig.animAt = t;
    s.fig.tint.set(mood === 'win' ? '#7dffb8' : mood === 'loss' ? '#ff7a7a' : '#ffffff');
    const bk = post.kind === 'thanks' ? 'thanks' : post.kind === 'pit' ? 'pit' : mood;
    (s.bubble.material as THREE.SpriteMaterial).map = bubbleTexture(bk);
    (s.bubble.material as THREE.SpriteMaterial).needsUpdate = true;
    s.bubbleAt = t;
    this.screenFlash[s.slot] = { at: t, color: SCREEN[mood] ?? SCREEN.note };
  }

  private time() {
    return (performance.now() - this.clock0) / 1000;
  }

  pick(ndcX: number, ndcY: number): string | null {
    this.raycaster.setFromCamera(new THREE.Vector2(ndcX, ndcY), this.camera);
    const hits = this.raycaster.intersectObjects([...this.seats.values()].map((s) => s.fig.hit), false);
    return (hits[0]?.object.userData.handle as string) ?? null;
  }

  private lastPrune = 0;
  draw(renderer: THREE.WebGLRenderer, _t: number, dt: number, w: number, h: number) {
    const t = this.time();
    if (!this.dragging) this.azimuth += dt * 0.06;
    const aspect = w / h;
    const H = 10.6;
    this.camera.left = -H * aspect;
    this.camera.right = H * aspect;
    this.camera.top = H;
    this.camera.bottom = -H;
    this.camera.updateProjectionMatrix();
    const R = 40;
    this.camera.position.set(Math.sin(this.azimuth) * R, R * 0.78, Math.cos(this.azimuth) * R);
    this.camera.lookAt(0, 0.6, 0);

    if (t - this.lastPrune > 1) {
      this.lastPrune = t;
      const cutoff = Date.now() - ACTIVE_MS;
      this.seats.forEach((s, h) => {
        if (s.lastAt < cutoff) this.unseat(h);
      });
    }
    this.seats.forEach((s) => {
      animateFigure(s.fig, t);
      const bk = t - s.bubbleAt;
      if (bk < 4) {
        const pop = bk < 0.35 ? Math.sin((bk / 0.35) * Math.PI * 0.5) * 1.25 : bk < 0.5 ? 1.25 - (bk - 0.35) * 1.6 : 1;
        const out = bk > 3.4 ? Math.max(0, 1 - (bk - 3.4) / 0.6) : 1;
        s.bubble.scale.setScalar(1.5 * pop * out);
        s.bubble.position.y = 3.2 + bk * 0.15;
      } else s.bubble.scale.setScalar(0);
    });
    const c = new THREE.Color();
    for (let i = 0; i < SLOTS; i++) {
      const f = this.screenFlash[i];
      const k = Math.min(1, (t - f.at) / 4);
      c.copy(f.color).lerp(SCREEN_IDLE, k);
      this.screens.setColorAt(i, c);
    }
    this.screens.instanceColor!.needsUpdate = true;
    renderer.render(this.scene, this.camera);
  }
}

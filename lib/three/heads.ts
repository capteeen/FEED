'use client';
// Instanced voxel heads. One InstancedMesh per unique VoxelSpec, shared by
// every avatar, Floor figure and Pit figure of that agent.
import * as THREE from 'three';
import type { VoxelSpec } from '../types';
import { buildVoxels } from '../voxel';
import { getRenderer, renderView, type View } from './engine';
import { currentMood } from './moods';

export const cube = new THREE.BoxGeometry(1, 1, 1);
const cache = new Map<string, THREE.InstancedMesh>();
const specKey = (s: VoxelSpec) => `${s.seed}|${s.palette.join(',')}|${s.hair}${s.eyes}${s.mouth}${s.gear}`;

export function headMesh(spec: VoxelSpec): THREE.InstancedMesh {
  const key = specKey(spec);
  let m = cache.get(key);
  if (m) return m;
  const vox = buildVoxels(spec);
  const mat = new THREE.MeshLambertMaterial({ color: 0xffffff });
  m = new THREE.InstancedMesh(cube, mat, vox.length);
  const mtx = new THREE.Matrix4();
  const col = new THREE.Color();
  const pal = spec.palette.map((p) => new THREE.Color(p));
  vox.forEach((v, i) => {
    mtx.makeTranslation(v.x - 3.5, v.y - 3.2, v.z - 3.5);
    m!.setMatrixAt(i, mtx);
    col.copy(pal[v.c]).multiplyScalar(v.shade);
    m!.setColorAt(i, col);
  });
  m.instanceMatrix.needsUpdate = true;
  if (m.instanceColor) m.instanceColor.needsUpdate = true;
  m.frustumCulled = false;
  cache.set(key, m);
  return m;
}

/** A separate instance (own material, shared geometry/matrices) for figures that tint independently. */
export function headClone(spec: VoxelSpec) {
  const base = headMesh(spec);
  const m = new THREE.InstancedMesh(cube, new THREE.MeshLambertMaterial({ color: 0xffffff }), base.count);
  m.instanceMatrix = base.instanceMatrix;
  m.instanceColor = base.instanceColor;
  m.frustumCulled = false;
  return m;
}

export function addLights(scene: THREE.Scene, intensity = 1) {
  scene.add(new THREE.HemisphereLight(0xffffff, 0x445566, 1.6 * intensity));
  const d = new THREE.DirectionalLight(0xffffff, 1.6 * intensity);
  d.position.set(4, 8, 6);
  scene.add(d);
}

// ---- the shared avatar scene ----------------------------------------------
let avatarScene: THREE.Scene | null = null;
let avatarCam: THREE.PerspectiveCamera | null = null;
let pivot: THREE.Group | null = null;
let sparks: THREE.Points | null = null;
const WIN = new THREE.Color('#7dffb8');
const LOSS = new THREE.Color('#ff7a7a');
const WHITE = new THREE.Color('#ffffff');

function ensureAvatarScene() {
  if (avatarScene) return;
  avatarScene = new THREE.Scene();
  addLights(avatarScene);
  avatarCam = new THREE.PerspectiveCamera(30, 1, 0.1, 100);
  avatarCam.position.set(0, 0.6, 23);
  avatarCam.lookAt(0, 0, 0);
  pivot = new THREE.Group();
  avatarScene.add(pivot);
  const n = 28;
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
  sparks = new THREE.Points(g, new THREE.PointsMaterial({ color: '#FFD400', size: 0.7, sizeAttenuation: true, transparent: true }));
  sparks.frustumCulled = false;
  avatarScene.add(sparks);
}

export interface AvatarState {
  spec: VoxelSpec;
  handle: string;
  phase: number;
  yaw: number;
  pitch: number;
  /** orbit override (profile page) */
  orbit?: { yaw: number; pitch: number; zoom: number };
  look?: () => { x: number; y: number } | null;
}

export function drawAvatar(renderer: THREE.WebGLRenderer, st: AvatarState, t: number, dt: number, w: number, h: number) {
  ensureAvatarScene();
  const mesh = headMesh(st.spec);
  pivot!.clear();
  pivot!.add(mesh);
  const mood = currentMood(st.handle);
  const mat = mesh.material as THREE.MeshLambertMaterial;

  let targetYaw = Math.sin(t * 0.7 + st.phase) * (15 * Math.PI) / 180;
  let targetPitch = 0;
  const look = st.look?.();
  if (look) {
    targetYaw = Math.max(-0.9, Math.min(0.9, look.x * 1.1));
    targetPitch = Math.max(-0.5, Math.min(0.5, look.y * 0.8));
  }
  const ease = 1 - Math.exp(-dt * 6);
  st.yaw += (targetYaw - st.yaw) * ease;
  st.pitch += (targetPitch - st.pitch) * ease;

  let y = 0, sag = 0, scale = 1;
  mat.color.copy(WHITE);
  sparks!.visible = false;
  if (mood) {
    const fade = mood.k < 0.8 ? 1 : 1 - (mood.k - 0.8) / 0.2;
    if (mood.mood === 'win') {
      y = Math.abs(Math.sin(mood.k * Math.PI * 6)) * 1.1 * fade;
      mat.color.copy(WHITE).lerp(WIN, 0.55 * fade);
    } else if (mood.mood === 'loss') {
      sag = 0.35 * fade;
      y = -0.7 * fade;
      mat.color.copy(WHITE).lerp(LOSS, 0.6 * fade);
    } else if (mood.mood === 'launch') {
      sparks!.visible = true;
      const pos = sparks!.geometry.getAttribute('position') as THREE.BufferAttribute;
      for (let i = 0; i < pos.count; i++) {
        const a = (i / pos.count) * Math.PI * 2 + t * 2;
        const rr = 5 + ((mood.k * 9 + i * 0.37) % 3);
        pos.setXYZ(i, Math.cos(a) * rr, Math.sin(a * 1.7 + i) * 3 + mood.k * 4 + 1, Math.sin(a) * rr * 0.6);
      }
      pos.needsUpdate = true;
      (sparks!.material as THREE.PointsMaterial).opacity = fade;
      scale = 1 + Math.sin(mood.k * Math.PI * 4) * 0.05;
    } else if (mood.mood === 'trade') {
      y = Math.sin(mood.k * Math.PI * 4) * 0.25 * fade;
    }
  }
  if (st.orbit) {
    pivot!.rotation.set(st.orbit.pitch, st.orbit.yaw, 0);
    avatarCam!.position.set(0, 0.6, 23 / st.orbit.zoom);
  } else {
    pivot!.rotation.set(st.pitch + sag, st.yaw, 0);
    avatarCam!.position.set(0, 0.6, 23);
  }
  pivot!.position.y = y;
  pivot!.scale.setScalar(scale);
  avatarCam!.aspect = w / h;
  avatarCam!.updateProjectionMatrix();
  renderer.render(avatarScene!, avatarCam!);
}

// ---- static snapshots (low-end fallback, PNG) -----------------------------
const snapCache = new Map<string, string>();
export function snapshotPng(spec: VoxelSpec, handle: string, size = 128): string | null {
  const key = specKey(spec) + size;
  const hit = snapCache.get(key);
  if (hit) return hit;
  try {
    getRenderer();
    const c = document.createElement('canvas');
    c.width = size;
    c.height = size;
    const st: AvatarState = { spec, handle, phase: 0, yaw: -0.35, pitch: 0.12 };
    const v: View = { canvas: c, fps: 0, visible: true, last: 0, draw: (r, t, dt, w, h) => drawAvatar(r, { ...st, look: () => ({ x: -0.32, y: 0.12 }) }, 0, 1, w, h) };
    renderView(v, 0, 1);
    const url = c.toDataURL('image/png');
    snapCache.set(key, url);
    return url;
  } catch {
    return null;
  }
}

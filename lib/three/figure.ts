'use client';
// Seated voxel figure used on the Floor and around Pit tables.
import * as THREE from 'three';
import type { Agent } from '../types';
import { TYPE_COLOR } from '../agents';
import { cube, headClone } from './heads';

export type Anim = 'idle' | 'typing' | 'phone' | 'headInHands' | 'armsUp' | 'talk';

const mats = new Map<string, THREE.MeshLambertMaterial>();
export function mat(color: string) {
  let m = mats.get(color);
  if (!m) {
    m = new THREE.MeshLambertMaterial({ color });
    mats.set(color, m);
  }
  return m;
}

function box(w: number, h: number, d: number, color: string) {
  const m = new THREE.Mesh(cube, mat(color));
  m.scale.set(w, h, d);
  return m;
}

export interface Figure {
  handle: string;
  root: THREE.Group;
  body: THREE.Group;
  head: THREE.InstancedMesh;
  headPivot: THREE.Group;
  armL: THREE.Group;
  armR: THREE.Group;
  hit: THREE.Mesh;
  anim: Anim;
  animAt: number;
  phase: number;
  tint: THREE.Color;
}

const WHITE = new THREE.Color('#ffffff');

/** Figure faces +z. Units: 1 = one voxel of the body; head is an 8-voxel head scaled to ~1.1 units. */
export function createFigure(agent: Agent): Figure {
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  const shirt = TYPE_COLOR[agent.type];
  const pants = '#2F3336';
  const skin = agent.voxel.palette[0];

  // legs (seated: thighs forward)
  const thighL = box(0.32, 0.3, 0.75, pants);
  thighL.position.set(-0.2, 0.55, 0.3);
  const thighR = thighL.clone();
  thighR.position.x = 0.2;
  const shinL = box(0.3, 0.55, 0.3, pants);
  shinL.position.set(-0.2, 0.25, 0.62);
  const shinR = shinL.clone();
  shinR.position.x = 0.2;
  body.add(thighL, thighR, shinL, shinR);

  // torso
  const torso = box(0.8, 0.85, 0.45, shirt);
  torso.position.set(0, 1.1, 0);
  body.add(torso);

  const mkArm = (side: number) => {
    const g = new THREE.Group();
    g.position.set(side * 0.53, 1.45, 0);
    const upper = box(0.24, 0.72, 0.26, shirt);
    upper.position.y = -0.3;
    const hand = box(0.22, 0.18, 0.22, skin);
    hand.position.y = -0.72;
    g.add(upper, hand);
    body.add(g);
    return g;
  };
  const armL = mkArm(-1);
  const armR = mkArm(1);

  const headPivot = new THREE.Group();
  headPivot.position.set(0, 1.55, 0);
  const head = headClone(agent.voxel);
  head.scale.setScalar(0.15);
  head.position.y = 0.52;
  headPivot.add(head);
  body.add(headPivot);

  // invisible hit box for raycasting
  const hit = new THREE.Mesh(new THREE.BoxGeometry(1.4, 2.8, 1.4), new THREE.MeshBasicMaterial({ visible: false }));
  hit.position.y = 1.3;
  hit.userData.handle = agent.handle;
  root.add(hit);

  return { handle: agent.handle, root, body, head, headPivot, armL, armR, hit, anim: 'idle', animAt: 0, phase: Math.random() * 10, tint: new THREE.Color('#ffffff') };
}

const ANIM_S = 4;
export function animateFigure(f: Figure, t: number) {
  const k = Math.min(1, (t - f.animAt) / ANIM_S);
  let anim = f.anim;
  if (k >= 1 && anim !== 'talk') anim = 'idle';
  const fade = k < 0.85 ? 1 : 1 - (k - 0.85) / 0.15;
  const p = t + f.phase;
  // resting pose: hands on the desk
  let aL = -1.1, aR = -1.1, headX = 0, headY = Math.sin(p * 0.4) * 0.25, bodyY = 0, bodyX = 0;
  switch (anim) {
    case 'typing':
      aL = -1.25 + Math.sin(p * 22) * 0.12;
      aR = -1.25 + Math.sin(p * 22 + 1.6) * 0.12;
      headX = 0.2;
      headY = 0;
      break;
    case 'phone':
      aR = -2.7;
      f.armR.rotation.z = 0.5;
      headY = 0.35;
      headX = Math.sin(p * 3) * 0.08;
      break;
    case 'headInHands':
      aL = -2.5;
      aR = -2.5;
      headX = 0.55;
      bodyX = 0.25;
      break;
    case 'armsUp':
      aL = -Math.PI + Math.sin(p * 10) * 0.2;
      aR = -Math.PI - Math.sin(p * 10) * 0.2;
      bodyY = Math.abs(Math.sin(p * 9)) * 0.35;
      headX = -0.2;
      break;
    case 'talk':
      aR = -1.4 + Math.sin(p * 6) * 0.35;
      headX = Math.sin(p * 8) * 0.06;
      headY = Math.sin(p * 1.3) * 0.3;
      break;
  }
  if (anim !== 'phone') f.armR.rotation.z = 0;
  const w = anim === 'idle' || anim === 'talk' ? 1 : fade;
  const lerp = (a: number, b: number) => a + (b - a) * w;
  f.armL.rotation.x = lerp(-1.1, aL);
  f.armR.rotation.x = lerp(-1.1, aR);
  f.headPivot.rotation.x = headX * w;
  f.headPivot.rotation.y = headY;
  f.body.position.y = bodyY * w;
  f.body.rotation.x = bodyX * w;
  const m = f.head.material as THREE.MeshLambertMaterial;
  m.color.copy(WHITE).lerp(f.tint, anim === 'idle' ? 0 : 0.5 * fade);
}

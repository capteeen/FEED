'use client';
// PITS — agents around a round table. The current speaker animates and gets a
// pulsing ring; stance rings are green (bull) / red (bear).
import * as THREE from 'three';
import type { Agent, Pit } from '../types';
import { addLights } from './heads';
import { animateFigure, createFigure, type Figure } from './figure';

export class PitScene {
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(34, 16 / 9, 0.1, 200);
  azimuth = 0;
  dragging = false;
  private figs = new Map<string, { fig: Figure; ring: THREE.Mesh; angle: number }>();
  private speaker: string | null = null;
  private speakAt = 0;
  private clock0 = performance.now();
  private glow: THREE.Mesh;
  private floorMat: THREE.MeshLambertMaterial;

  constructor(pit: Pit, agents: Record<string, Agent>) {
    addLights(this.scene, 0.9);
    this.floorMat = new THREE.MeshLambertMaterial({ color: '#16181C' });
    const floor = new THREE.Mesh(new THREE.CylinderGeometry(9, 9, 0.3, 48), this.floorMat);
    floor.position.y = -0.15;
    this.scene.add(floor);
    const tableTop = new THREE.Mesh(new THREE.CylinderGeometry(2.3, 2.3, 0.18, 40), new THREE.MeshLambertMaterial({ color: '#7856FF' }));
    tableTop.position.y = 1;
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.6, 1, 16), new THREE.MeshLambertMaterial({ color: '#2F3336' }));
    stem.position.y = 0.5;
    this.scene.add(tableTop, stem);
    // a coin on the table
    const coin = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.6, 0.12, 24), new THREE.MeshLambertMaterial({ color: '#FFD400' }));
    coin.position.y = 1.5;
    coin.rotation.x = Math.PI / 2;
    coin.name = 'coin';
    this.scene.add(coin);
    this.glow = new THREE.Mesh(new THREE.RingGeometry(0.85, 1.1, 32), new THREE.MeshBasicMaterial({ color: '#E7E9EA', transparent: true, side: THREE.DoubleSide }));
    this.glow.rotation.x = -Math.PI / 2;
    this.glow.position.y = 0.03;
    this.scene.add(this.glow);

    const n = pit.agents.length;
    pit.agents.forEach((h, i) => {
      const a = agents[h];
      if (!a) return;
      const fig = createFigure(a);
      const angle = (i / n) * Math.PI * 2;
      const r = 3.5;
      fig.root.position.set(Math.sin(angle) * r, 0, Math.cos(angle) * r);
      fig.root.lookAt(0, 0, 0);
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(0.7, 0.85, 32),
        new THREE.MeshBasicMaterial({ color: pit.stances[h] === 'bull' ? '#00BA7C' : '#F4212E', side: THREE.DoubleSide }),
      );
      ring.rotation.x = -Math.PI / 2;
      ring.position.set(fig.root.position.x, 0.02, fig.root.position.z);
      this.scene.add(fig.root, ring);
      this.figs.set(h, { fig, ring, angle });
    });
  }

  setTheme(light: boolean) {
    this.floorMat.color.set(light ? '#EFF3F4' : '#16181C');
  }

  speak(handle: string) {
    this.speaker = handle;
    this.speakAt = (performance.now() - this.clock0) / 1000;
    const f = this.figs.get(handle);
    if (f) {
      f.fig.anim = 'talk';
      f.fig.animAt = this.speakAt;
    }
    this.figs.forEach((o, h) => {
      if (h !== handle) o.fig.anim = 'idle';
    });
  }

  end() {
    this.speaker = null;
    this.figs.forEach((o) => (o.fig.anim = 'idle'));
  }

  draw(renderer: THREE.WebGLRenderer, _t: number, dt: number, w: number, h: number) {
    const t = (performance.now() - this.clock0) / 1000;
    if (!this.dragging) this.azimuth += dt * 0.08;
    this.camera.aspect = w / h;
    this.camera.fov = w / h < 1.2 ? 48 : 34;
    this.camera.updateProjectionMatrix();
    const R = 13;
    this.camera.position.set(Math.sin(this.azimuth) * R, 7.5, Math.cos(this.azimuth) * R);
    this.camera.lookAt(0, 1.2, 0);
    const coin = this.scene.getObjectByName('coin');
    if (coin) coin.rotation.z = t * 1.5;
    this.figs.forEach((o) => animateFigure(o.fig, t));
    const sp = this.speaker && this.figs.get(this.speaker);
    if (sp) {
      this.glow.visible = true;
      this.glow.position.x = sp.fig.root.position.x;
      this.glow.position.z = sp.fig.root.position.z;
      const k = t - this.speakAt;
      this.glow.scale.setScalar(1 + Math.sin(k * 6) * 0.08 + Math.min(0.3, k * 0.1));
      (this.glow.material as THREE.MeshBasicMaterial).opacity = 0.5 + Math.sin(k * 6) * 0.25;
    } else this.glow.visible = false;
    renderer.render(this.scene, this.camera);
  }

  /** screen position (0..1) of an agent's head, for caption anchoring */
  headScreen(handle: string) {
    const f = this.figs.get(handle);
    if (!f) return null;
    const v = new THREE.Vector3();
    f.fig.head.getWorldPosition(v);
    v.y += 1;
    v.project(this.camera);
    return { x: (v.x + 1) / 2, y: (1 - v.y) / 2 };
  }
}

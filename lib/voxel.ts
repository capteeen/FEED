// Procedural voxel heads. 8×8×8 grid, 4 palette colors. Pure functions so the
// same head renders in Three.js (client), as an SVG snapshot (fallback), and
// inside OG images (server).
import type { VoxelSpec } from './types';
import { mulberry32 } from './rng';

export interface Voxel {
  x: number;
  y: number;
  z: number;
  /** palette index 0 skin · 1 hair · 2 eyes · 3 accent */
  c: number;
  /** per-voxel brightness jitter, 0.92..1.06 */
  shade: number;
}

export const GRID = 8;

export function buildVoxels(spec: VoxelSpec): Voxel[] {
  const r = mulberry32(spec.seed);
  const grid = new Map<string, number>();
  const k = (x: number, y: number, z: number) => `${x},${y},${z}`;
  const set = (x: number, y: number, z: number, c: number) => {
    if (x < 0 || y < 0 || z < 0 || x >= GRID || y >= GRID || z >= GRID) return;
    grid.set(k(x, y, z), c);
  };

  // skull: x 0..7, y 0..5, z 0..6 ; rounded jaw corners
  for (let x = 0; x < 8; x++)
    for (let y = 0; y < 6; y++)
      for (let z = 0; z < 7; z++) {
        if (y === 0 && (x === 0 || x === 7)) continue;
        if (y === 0 && z === 0) continue;
        set(x, y, z, 0);
      }
  // nose
  set(3, 2, 7, 0);
  set(4, 2, 7, 0);

  // hair
  const top = (c = 1) => {
    for (let x = 0; x < 8; x++) for (let z = 0; z < 7; z++) set(x, 6, z, c);
  };
  switch (spec.hair) {
    case 0: // flat top + back
      top();
      for (let x = 0; x < 8; x++) for (let y = 3; y < 6; y++) set(x, y, 0, 1);
      for (let z = 0; z < 5; z++) for (let y = 4; y < 6; y++) { set(0, y, z, 1); set(7, y, z, 1); }
      break;
    case 1: // mohawk
      for (let z = 0; z < 7; z++) { set(3, 6, z, 1); set(4, 6, z, 1); }
      for (let z = 1; z < 6; z++) { set(3, 7, z, 1); set(4, 7, z, 1); }
      break;
    case 2: // buzz: hair-colored scalp only
      for (let x = 0; x < 8; x++) for (let z = 0; z < 7; z++) set(x, 5, z, z > 4 ? 0 : 1);
      break;
    case 3: // long
      top();
      for (let x = 0; x < 8; x++) for (let y = 0; y < 6; y++) set(x, y, 0, 1);
      for (let z = 0; z < 5; z++) for (let y = 1; y < 6; y++) { set(0, y, z, 1); set(7, y, z, 1); }
      break;
    default: // spiky
      for (let x = 0; x < 8; x++)
        for (let z = 0; z < 7; z++) {
          set(x, 6, z, 1);
          if ((x + z) % 2 === 0 && r() > 0.35) set(x, 7, z, 1);
        }
      for (let x = 0; x < 8; x++) for (let y = 4; y < 6; y++) set(x, y, 0, 1);
  }
  // fringe on the forehead for most styles
  if (spec.hair !== 1 && spec.hair !== 2) for (let x = 0; x < 8; x++) if (r() > 0.4) set(x, 5, 6, 1);

  // eyes on the front face (z = 6)
  const eye = (x: number, y: number) => set(x, y, 6, 2);
  switch (spec.eyes) {
    case 0: eye(2, 3); eye(5, 3); break;
    case 1: eye(1, 3); eye(2, 3); eye(5, 3); eye(6, 3); break;
    case 2: for (let x = 1; x < 7; x++) eye(x, 3); break; // visor slit
    default: eye(1, 3); eye(2, 3); eye(1, 4); eye(2, 4); eye(5, 3); eye(6, 3); eye(5, 4); eye(6, 4);
  }
  // mouth
  switch (spec.mouth) {
    case 0: eye(3, 1); eye(4, 1); break;
    case 1: for (let x = 2; x < 6; x++) eye(x, 1); break;
    default: eye(3, 1); eye(4, 1); eye(5, 1); eye(5, 2); // smirk
  }

  // gear (accent)
  switch (spec.gear) {
    case 1: // headband
      for (let x = 0; x < 8; x++) { set(x, 5, 6, 3); set(x, 5, 0, 3); }
      for (let z = 0; z < 7; z++) { set(0, 5, z, 3); set(7, 5, z, 3); }
      break;
    case 2: // antenna
      set(6, 6, 3, 3);
      set(6, 7, 3, 3);
      break;
    case 3: // shades
      for (let x = 1; x < 7; x++) set(x, 3, 7, 3);
      for (let z = 4; z < 7; z++) { set(0, 3, z, 3); set(7, 3, z, 3); }
      break;
    case 4: // cap
      for (let x = 1; x < 7; x++) for (let z = 1; z < 6; z++) set(x, 7, z, 3);
      for (let x = 0; x < 8; x++) { set(x, 6, 6, 3); set(x, 6, 7, 3); }
      break;
  }

  // keep only the shell
  const out: Voxel[] = [];
  const dirs = [
    [1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1],
  ];
  grid.forEach((c, key) => {
    const [x, y, z] = key.split(',').map(Number);
    const exposed = dirs.some(([dx, dy, dz]) => !grid.has(k(x + dx, y + dy, z + dz)));
    if (exposed) out.push({ x, y, z, c, shade: 0.92 + r() * 0.14 });
  });
  return out;
}

function shadeHex(hex: string, f: number) {
  const n = parseInt(hex.slice(1), 16);
  const ch = (v: number) => Math.max(0, Math.min(255, Math.round(v * f)));
  const rr = ch((n >> 16) & 255), gg = ch((n >> 8) & 255), bb = ch(n & 255);
  return `rgb(${rr},${gg},${bb})`;
}

/**
 * Static isometric snapshot of a voxel head as an SVG string. Used for OG
 * images and as the no-WebGL fallback for avatars.
 */
export function voxelSvg(spec: VoxelSpec, size = 256, opts: { yaw?: number; pitch?: number; bg?: string; tint?: string } = {}) {
  const yaw = opts.yaw ?? -0.45;
  const pitch = opts.pitch ?? 0.32;
  const vox = buildVoxels(spec);
  const has = new Set(vox.map((v) => `${v.x},${v.y},${v.z}`));
  const cy = Math.cos(yaw), sy = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch);
  const project = (x: number, y: number, z: number) => {
    // centre the grid
    x -= 4; y -= 3.6; z -= 4;
    const rx = x * cy + z * sy;
    const rz = -x * sy + z * cy;
    const ry = y * cp - rz * sp;
    const depth = y * sp + rz * cp;
    return { sx: rx, sy: -ry, depth };
  };
  const faces: { pts: string; depth: number; fill: string }[] = [];
  const scale = size / 13;
  const off = size / 2;
  const FACES: { n: [number, number, number]; quad: [number, number, number][]; light: number }[] = [
    { n: [0, 1, 0], quad: [[0, 1, 0], [1, 1, 0], [1, 1, 1], [0, 1, 1]], light: 1.08 },
    { n: [0, -1, 0], quad: [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]], light: 0.6 },
    { n: [0, 0, 1], quad: [[0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]], light: 0.95 },
    { n: [0, 0, -1], quad: [[0, 0, 0], [1, 0, 0], [1, 1, 0], [0, 1, 0]], light: 0.7 },
    { n: [1, 0, 0], quad: [[1, 0, 0], [1, 1, 0], [1, 1, 1], [1, 0, 1]], light: 0.74 },
    { n: [-1, 0, 0], quad: [[0, 0, 0], [0, 1, 0], [0, 1, 1], [0, 0, 1]], light: 0.8 },
  ];
  const cam = [-sy * cp, sp, cy * cp];
  for (const v of vox) {
    for (const f of FACES) {
      const [nx, ny, nz] = f.n;
      if (nx * cam[0] + ny * cam[1] + nz * cam[2] <= 0.001) continue;
      if (has.has(`${v.x + nx},${v.y + ny},${v.z + nz}`)) continue;
      const pts = f.quad.map(([qx, qy, qz]) => project(v.x + qx, v.y + qy, v.z + qz));
      const depth = pts.reduce((s, p) => s + p.depth, 0) / 4;
      faces.push({
        pts: pts.map((p) => `${(off + p.sx * scale).toFixed(1)},${(off + p.sy * scale).toFixed(1)}`).join(' '),
        depth,
        fill: shadeHex(spec.palette[v.c], f.light * v.shade),
      });
    }
  }
  faces.sort((a, b) => a.depth - b.depth);
  const bg = opts.bg ? `<rect width="${size}" height="${size}" fill="${opts.bg}"/>` : '';
  const tint = opts.tint ? `<rect width="${size}" height="${size}" fill="${opts.tint}" opacity="0.28"/>` : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">${bg}${faces
    .map((f) => `<polygon points="${f.pts}" fill="${f.fill}" stroke="${f.fill}" stroke-width="0.6"/>`)
    .join('')}${tint}</svg>`;
}

export const voxelDataUri = (spec: VoxelSpec, size = 256, opts?: Parameters<typeof voxelSvg>[2]) =>
  `data:image/svg+xml;charset=utf-8,${encodeURIComponent(voxelSvg(spec, size, opts))}`;

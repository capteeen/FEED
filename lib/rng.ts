// Small deterministic PRNG so the agent roster and voxel heads are identical on
// server and client (needed for SSR profiles and OG images).

export function mulberry32(seed: number) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export type Rand = () => number;

export const pick = <T,>(r: Rand, arr: readonly T[]): T => arr[Math.floor(r() * arr.length)];
export const range = (r: Rand, min: number, max: number) => min + r() * (max - min);
export const int = (r: Rand, min: number, max: number) => Math.floor(range(r, min, max + 1));
export const chance = (r: Rand, p: number) => r() < p;

export function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

const B58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
export function base58(r: Rand, len: number) {
  let s = '';
  for (let i = 0; i < len; i++) s += B58[Math.floor(r() * 58)];
  return s;
}

export const txSig = (r: Rand = Math.random) => base58(r, 87 + Math.floor(r() * 2));
export const walletAddr = (r: Rand = Math.random) => base58(r, 44);
/** pump.fun mints are vanity addresses ending in "pump" */
export const pumpCa = (r: Rand = Math.random) => base58(r, 40) + 'pump';

let idCounter = 0;
export const uid = (prefix = '') => `${prefix}${Date.now().toString(36)}${(idCounter++).toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`;

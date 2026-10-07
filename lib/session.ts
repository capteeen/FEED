'use client';
// Client side of wallet sessions: sign one message per wallet per week.
import bs58 from 'bs58';
import { loginMessage } from './community-types';

type Signer = (m: Uint8Array) => Promise<Uint8Array>;
const KEY = (w: string) => `feed-session:${w}`;
let inflight: Promise<string> | null = null;

export async function hasSession(wallet: string) {
  try {
    const exp = Number(localStorage.getItem(KEY(wallet)) ?? 0);
    if (exp > Date.now()) {
      const r = await fetch('/api/auth', { cache: 'no-store' }).then((x) => x.json());
      if (r.wallet === wallet) return true;
    }
  } catch {
    /* fall through */
  }
  return false;
}

/** Make sure this wallet has a server session; prompts one signature if not. */
export async function ensureSession(wallet: string, signMessage: Signer): Promise<string> {
  if (await hasSession(wallet)) return wallet;
  if (inflight) return inflight;
  inflight = (async () => {
    try {
      const ts = Date.now();
      const sig = await signMessage(new TextEncoder().encode(loginMessage(wallet, ts)));
      const res = await fetch('/api/auth', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ wallet, signature: bs58.encode(sig), ts }) });
      const data = (await res.json().catch(() => ({}))) as { error?: string; exp?: number };
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      try {
        localStorage.setItem(KEY(wallet), String(data.exp ?? Date.now() + 6 * 24 * 3600_000));
      } catch {
        /* storage blocked */
      }
      return wallet;
    } finally {
      inflight = null;
    }
  })();
  return inflight;
}

export async function signOut() {
  await fetch('/api/auth', { method: 'DELETE' }).catch(() => undefined);
}

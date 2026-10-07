// Wallet sessions: a user signs one message with their wallet, the server
// sets a signed cookie, and replies/reactions carry that identity. No
// passwords, no database row.
import 'server-only';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { cookies } from 'next/headers';

const SECRET = process.env.FEED_SESSION_SECRET || process.env.FEED_WALLET_SEED || process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || 'feed-dev-secret';
export const SESSION_COOKIE = 'feed_session';
const TTL_MS = 7 * 24 * 3600_000;

const sign = (body: string) => createHmac('sha256', SECRET).update(body).digest('base64url');

export function makeSession(wallet: string) {
  const exp = Date.now() + TTL_MS;
  const body = `${wallet}.${exp}`;
  return { value: `${body}.${sign(body)}`, exp };
}

/** The wallet behind the request's session cookie, or null. */
export function sessionWallet(): string | null {
  const raw = cookies().get(SESSION_COOKIE)?.value;
  if (!raw) return null;
  const [wallet, expStr, mac] = raw.split('.');
  if (!wallet || !expStr || !mac) return null;
  if (Number(expStr) < Date.now()) return null;
  const expected = sign(`${wallet}.${expStr}`);
  try {
    return timingSafeEqual(Buffer.from(mac), Buffer.from(expected)) ? wallet : null;
  } catch {
    return null;
  }
}

/** Short handle shown for a wallet: first 4 + last 4, lowercase (same as the client). */
export const walletHandle = (wallet: string) => `${wallet.slice(0, 4)}${wallet.slice(-4)}`.toLowerCase();

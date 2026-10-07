import { ApiError, fail, verifyWallet } from '@/lib/server/community';
import { limit } from '@/lib/server/ratelimit';
import { makeSession, SESSION_COOKIE, sessionWallet } from '@/lib/server/session';
import { loginMessage } from '@/lib/community-types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Who am I (by session cookie)? */
export async function GET() {
  return Response.json({ wallet: sessionWallet() });
}

/** Sign in: the wallet signs `loginMessage(ts)`; the server sets the session cookie. */
export async function POST(req: Request) {
  try {
    limit(req, 'auth', 20);
    const b = (await req.json()) as { wallet?: string; signature?: string; ts?: number };
    if (typeof b?.wallet !== 'string' || typeof b.signature !== 'string' || typeof b.ts !== 'number') throw new ApiError('Missing signature');
    if (Math.abs(Date.now() - b.ts) > 5 * 60_000) throw new ApiError('Signature expired, try again');
    if (!/^[1-9A-HJ-NP-Za-km-z]{32,48}$/.test(b.wallet)) throw new ApiError('Bad wallet');
    if (!verifyWallet(b.wallet, loginMessage(b.wallet, b.ts), b.signature)) throw new ApiError('Wallet signature is invalid', 401);
    const s = makeSession(b.wallet);
    const res = Response.json({ wallet: b.wallet, exp: s.exp });
    res.headers.set('Set-Cookie', `${SESSION_COOKIE}=${s.value}; Path=/; Max-Age=${7 * 24 * 3600}; HttpOnly; SameSite=Lax${process.env.NODE_ENV === 'production' ? '; Secure' : ''}`);
    return res;
  } catch (e) {
    return fail(e);
  }
}

/** Sign out. */
export async function DELETE() {
  const res = Response.json({ ok: true });
  res.headers.set('Set-Cookie', `${SESSION_COOKIE}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax`);
  return res;
}

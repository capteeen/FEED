// Real agent wallets, one keypair per agent, stored in Supabase (feed_wallets).
// The secret key is encrypted at rest with AES-256-GCM using a key derived
// from FEED_WALLET_SEED, which only the server holds. Phase 2 trading signs
// with `agentSecretKey` here; the key never reaches the client.
import 'server-only';
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import nacl from 'tweetnacl';
import bs58 from 'bs58';
import { db } from './db';

const SEED = process.env.FEED_WALLET_SEED ?? '';
const key = () => createHash('sha256').update(`feed:wallet-key:${SEED}`).digest();

/** Real tips are on when the server holds the master secret. */
export const walletsReal = () => SEED.length >= 16;

export interface WalletRecord {
  handle: string;
  pubkey: string;
  /** base64(iv(12) + tag(16) + ciphertext) of the 64-byte ed25519 secret key */
  secretEnc: string;
  createdAt: number;
}

function encrypt(secret: Uint8Array) {
  const iv = randomBytes(12);
  const c = createCipheriv('aes-256-gcm', key(), iv);
  const enc = Buffer.concat([c.update(secret), c.final()]);
  return Buffer.concat([iv, c.getAuthTag(), enc]).toString('base64');
}

function decrypt(secretEnc: string) {
  const buf = Buffer.from(secretEnc, 'base64');
  const d = createDecipheriv('aes-256-gcm', key(), buf.subarray(0, 12));
  d.setAuthTag(buf.subarray(12, 28));
  return new Uint8Array(Buffer.concat([d.update(buf.subarray(28)), d.final()]));
}

/** The agent's wallet, created and stored on first use. */
export async function agentWallet(handle: string): Promise<string> {
  if (!walletsReal()) throw new Error('FEED_WALLET_SEED is not set');
  const h = handle.toLowerCase();
  const existing = await db().getWallet(h);
  if (existing) return existing.pubkey;
  const kp = nacl.sign.keyPair();
  const rec: WalletRecord = { handle: h, pubkey: bs58.encode(kp.publicKey), secretEnc: encrypt(kp.secretKey), createdAt: Date.now() };
  if (await db().insertWallet(rec)) return rec.pubkey;
  // someone else created it first
  return (await db().getWallet(h))!.pubkey;
}

/** Server-side only: the agent's 64-byte secret key (Phase 2 trading, fee claims). */
export async function agentSecretKey(handle: string): Promise<Uint8Array> {
  await agentWallet(handle);
  const rec = await db().getWallet(handle.toLowerCase());
  if (!rec) throw new Error('wallet missing');
  return decrypt(rec.secretEnc);
}

export async function allWallets(): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  for (const w of await db().listWallets()) out[w.handle] = w.pubkey;
  return out;
}

import 'server-only';
import { ApiError } from './community';
import { walletsReal } from './wallets';
import { db } from './db';
import { getParsedTransaction, type ParsedTx } from './rpc';
import { parseTipMemo, postRef } from '../tipMemo';

export interface VerifiedTip {
  sig: string;
  from: string;
  handle: string;
  lamports: number;
  ref: string;
  at: number;
}

/** Pure check of a parsed transaction (tested with fixtures). */
export async function readTip(sig: string, tx: ParsedTx | null, resolveWallet: (handle: string) => Promise<string | undefined>): Promise<VerifiedTip> {
  if (!tx) throw new ApiError('Transaction not found yet, try again in a few seconds', 404);
  if (tx.meta?.err) throw new ApiError('Transaction failed on-chain');
  const ins = tx.transaction.message.instructions as { program?: string; parsed?: unknown }[];
  const memoIns = ins.find((i) => i.program === 'spl-memo' && typeof i.parsed === 'string');
  const memo = memoIns ? parseTipMemo(memoIns.parsed as string) : null;
  if (!memo) throw new ApiError('No FEED tip memo in this transaction');
  const wallet = await resolveWallet(memo.handle);
  if (!wallet) throw new ApiError(`@${memo.handle} has no wallet`);
  const transfer = ins.find((i) => {
    const p = i.parsed as { type?: string; info?: { destination?: string; source?: string; lamports?: number } } | undefined;
    return i.program === 'system' && p?.type === 'transfer' && p.info?.destination === wallet;
  });
  const info = (transfer?.parsed as { info: { source: string; lamports: number } } | undefined)?.info;
  if (!info || !info.lamports) throw new ApiError(`No transfer to @${memo.handle}'s wallet in this transaction`);
  const signer = tx.transaction.message.accountKeys.find((k) => k.signer)?.pubkey ?? info.source;
  if (signer !== info.source) throw new ApiError('Transfer source is not the signer');
  return { sig, from: info.source, handle: memo.handle, lamports: info.lamports, ref: memo.ref, at: (tx.blockTime ?? Math.floor(Date.now() / 1000)) * 1000 };
}

export async function verifyTip(sig: string, postId?: string): Promise<VerifiedTip> {
  if (!walletsReal()) throw new ApiError('Real tips are not configured on this server', 503);
  if (!/^[1-9A-HJ-NP-Za-km-z]{80,100}$/.test(sig)) throw new ApiError('Bad signature');
  // the chain may lag a moment behind the wallet's confirmation
  let tx: ParsedTx | null = null;
  for (let i = 0; i < 4 && !tx; i++) {
    tx = await getParsedTransaction(sig);
    if (!tx) await new Promise((r) => setTimeout(r, 1500));
  }
  const tip = await readTip(sig, tx, async (h) => (await db().getWallet(h))?.pubkey);
  if (postId && tip.ref !== 'profile' && tip.ref !== (await postRef(postId))) throw new ApiError('Memo does not match the post');
  return tip;
}

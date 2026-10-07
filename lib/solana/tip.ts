// Real tips: a SOL transfer from the user's wallet straight to the agent's
// wallet, with a memo naming the agent and the post. The server verifies the
// transaction on-chain afterwards (POST /api/tips) so the tip counts for
// everyone. Turned on when the server has FEED_WALLET_SEED (see /api/wallets).
import { Connection, PublicKey, SystemProgram, Transaction, TransactionInstruction, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { MEMO_PROGRAM, postRef, tipMemo } from '../tipMemo';

export const MEMO_PROGRAM_ID = new PublicKey(MEMO_PROGRAM);
/** below this a brand-new destination account can't be created (rent) */
export const MIN_TIP_SOL = 0.001;

export async function buildTipTransaction(from: PublicKey, toAgentWallet: string, handle: string, sol: number, postId?: string) {
  const tx = new Transaction();
  tx.add(SystemProgram.transfer({ fromPubkey: from, toPubkey: new PublicKey(toAgentWallet), lamports: Math.round(sol * LAMPORTS_PER_SOL) }));
  tx.add(
    new TransactionInstruction({
      programId: MEMO_PROGRAM_ID,
      keys: [{ pubkey: from, isSigner: true, isWritable: false }],
      data: Buffer.from(tipMemo(handle, await postRef(postId)), 'utf8'),
    }),
  );
  return tx;
}

export async function sendRealTip(
  connection: Connection,
  from: PublicKey,
  sendTransaction: (tx: Transaction, c: Connection) => Promise<string>,
  toAgentWallet: string,
  handle: string,
  sol: number,
  postId?: string,
) {
  if (sol < MIN_TIP_SOL) throw new Error(`Minimum tip is ${MIN_TIP_SOL} SOL`);
  const tx = await buildTipTransaction(from, toAgentWallet, handle, sol, postId);
  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('confirmed');
  tx.recentBlockhash = blockhash;
  tx.feePayer = from;
  const sig = await sendTransaction(tx, connection);
  await waitForConfirmation(connection, sig, lastValidBlockHeight);
  return sig;
}

/**
 * Poll until the transaction is confirmed. The SDK's confirmTransaction relies
 * on a WebSocket subscription, which some RPC providers restrict; HTTP polling
 * works everywhere.
 */
export async function waitForConfirmation(connection: Connection, sig: string, lastValidBlockHeight: number, timeoutMs = 90_000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const { value } = await connection.getSignatureStatuses([sig]);
    const st = value[0];
    if (st?.err) throw new Error(`Transaction failed on-chain: ${JSON.stringify(st.err)}`);
    if (st && (st.confirmationStatus === 'confirmed' || st.confirmationStatus === 'finalized')) return;
    if (!st) {
      const height = await connection.getBlockHeight('confirmed').catch(() => 0);
      if (height && height > lastValidBlockHeight) throw new Error('Transaction expired before it was confirmed. Nothing was sent; please try again.');
    }
    await new Promise((r) => setTimeout(r, 1200));
  }
  throw new Error('Timed out waiting for confirmation. Check your wallet activity before retrying.');
}

/** Tell the server; it reads the tx from the chain and records the tip for everyone. */
export async function registerTip(sig: string, postId?: string, from?: string) {
  const res = await fetch('/api/tips', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sig, postId, from }) });
  const data = (await res.json().catch(() => ({}))) as { error?: string; fresh?: boolean; thanks?: { postId?: string } };
  if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
  return data;
}

export const solscanTx = (sig: string, cluster?: string) => `https://solscan.io/tx/${sig}${cluster && cluster !== 'mainnet-beta' ? `?cluster=${cluster}` : ''}`;
export const solscanAccount = (addr: string, cluster?: string) => `https://solscan.io/account/${addr}${cluster && cluster !== 'mainnet-beta' ? `?cluster=${cluster}` : ''}`;

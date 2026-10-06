// Tips are direct SOL transfers to the agent wallet with a memo containing the
// post id. Phase 1 mocks the send (see store.sendTip); set
// NEXT_PUBLIC_REAL_TIPS=1 to send this real transaction through the wallet.
import { Connection, PublicKey, SystemProgram, Transaction, TransactionInstruction, LAMPORTS_PER_SOL } from '@solana/web3.js';

export const MEMO_PROGRAM_ID = new PublicKey('MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr');
export const REAL_TIPS = process.env.NEXT_PUBLIC_REAL_TIPS === '1';

export function buildTipTransaction(from: PublicKey, toAgentWallet: string, sol: number, memo: string) {
  const tx = new Transaction();
  tx.add(SystemProgram.transfer({ fromPubkey: from, toPubkey: new PublicKey(toAgentWallet), lamports: Math.round(sol * LAMPORTS_PER_SOL) }));
  tx.add(new TransactionInstruction({ programId: MEMO_PROGRAM_ID, keys: [{ pubkey: from, isSigner: true, isWritable: false }], data: Buffer.from(`feed:tip:${memo}`.slice(0, 500), 'utf8') }));
  return tx;
}

export async function sendRealTip(
  connection: Connection,
  from: PublicKey,
  sendTransaction: (tx: Transaction, c: Connection) => Promise<string>,
  toAgentWallet: string,
  sol: number,
  postId?: string,
) {
  const tx = buildTipTransaction(from, toAgentWallet, sol, postId ? postId.slice(0, 64) : 'profile');
  const sig = await sendTransaction(tx, connection);
  await connection.confirmTransaction(sig, 'confirmed');
  return sig;
}

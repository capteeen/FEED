import 'server-only';

const RPC = process.env.SOLANA_RPC || process.env.NEXT_PUBLIC_SOLANA_RPC || (process.env.NEXT_PUBLIC_SOLANA_CLUSTER === 'mainnet-beta' ? 'https://api.mainnet-beta.solana.com' : 'https://api.devnet.solana.com');

export async function rpc<T>(method: string, params: unknown[]): Promise<T> {
  const res = await fetch(RPC, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
    cache: 'no-store',
    signal: AbortSignal.timeout(15_000),
  });
  const data = (await res.json()) as { result?: T; error?: { message: string } };
  if (data.error) throw new Error(`rpc ${method}: ${data.error.message}`);
  return data.result as T;
}

/** lamports for many wallets in one call */
export async function balances(pubkeys: string[]): Promise<Record<string, number>> {
  const out: Record<string, number> = {};
  for (let i = 0; i < pubkeys.length; i += 100) {
    const chunk = pubkeys.slice(i, i + 100);
    const r = await rpc<{ value: ({ lamports: number } | null)[] }>('getMultipleAccounts', [chunk, { encoding: 'base64', commitment: 'confirmed' }]);
    chunk.forEach((k, j) => (out[k] = r.value[j]?.lamports ?? 0));
  }
  return out;
}

export interface ParsedTx {
  meta: { err: unknown } | null;
  blockTime?: number | null;
  transaction: {
    signatures: string[];
    message: {
      accountKeys: { pubkey: string; signer: boolean }[];
      instructions: ({ program?: string; parsed?: unknown; programId: string } | Record<string, unknown>)[];
    };
  };
}

export const getParsedTransaction = (sig: string) =>
  rpc<ParsedTx | null>('getTransaction', [sig, { encoding: 'jsonParsed', commitment: 'confirmed', maxSupportedTransactionVersion: 0 }]);

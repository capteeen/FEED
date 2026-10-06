// Memo attached to every tip transfer: feed:tip:<agent handle>:<post ref>
// Post ids are long, so the memo carries a short hash of the id.
export const MEMO_PROGRAM = 'MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr';

export async function postRef(postId?: string) {
  if (!postId) return 'profile';
  const bytes = new TextEncoder().encode(postId);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest).slice(0, 8))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export const tipMemo = (handle: string, ref: string) => `feed:tip:${handle}:${ref}`;

export function parseTipMemo(memo: string): { handle: string; ref: string } | null {
  const m = /^feed:tip:([a-z0-9_]{3,15}):([a-f0-9]{16}|profile)$/.exec(memo.trim());
  return m ? { handle: m[1], ref: m[2] } : null;
}

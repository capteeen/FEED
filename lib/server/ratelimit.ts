import 'server-only';
import { ApiError } from './community';

const hits = new Map<string, number[]>();
/** Best-effort per-IP limiter (per server instance). */
export function limit(req: Request, bucket: string, perMinute: number) {
  const ip = (req.headers.get('x-forwarded-for') ?? 'local').split(',')[0].trim();
  const key = `${bucket}:${ip}`;
  const now = Date.now();
  const list = (hits.get(key) ?? []).filter((t) => now - t < 60_000);
  if (list.length >= perMinute) throw new ApiError('Too many requests', 429);
  list.push(now);
  hits.set(key, list);
}

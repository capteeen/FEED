// Server-only DeepSeek client (OpenAI-compatible chat completions API).
// The key is DEEPSEEK_API_KEY on the server. It is never logged or returned.
import 'server-only';

export const DEEPSEEK_MODEL = process.env.DEEPSEEK_MODEL ?? 'deepseek-chat';
const BASE = (process.env.DEEPSEEK_BASE_URL ?? 'https://api.deepseek.com').replace(/\/$/, '');

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export class LlmError extends Error {
  constructor(message: string, public status = 502) {
    super(message);
  }
}

export function resolveKey(_req: Request): string {
  const key = process.env.DEEPSEEK_API_KEY || '';
  if (!key) throw new LlmError('DEEPSEEK_API_KEY is not set on the server', 503);
  return key;
}

export async function chat(key: string, messages: ChatMessage[], opts: { json?: boolean; maxTokens?: number; temperature?: number } = {}) {
  let res: Response;
  try {
    res = await fetch(`${BASE}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model: DEEPSEEK_MODEL,
        messages,
        temperature: opts.temperature ?? 1.0,
        max_tokens: opts.maxTokens ?? 300,
        stream: false,
        ...(opts.json ? { response_format: { type: 'json_object' } } : {}),
      }),
      signal: AbortSignal.timeout(25_000),
    });
  } catch (e) {
    throw new LlmError(`DeepSeek unreachable: ${(e as Error).message}`);
  }
  if (!res.ok) {
    const status = res.status === 401 || res.status === 402 || res.status === 429 ? res.status : 502;
    const hint = res.status === 401 ? 'invalid API key' : res.status === 402 ? 'insufficient DeepSeek balance' : res.status === 429 ? 'rate limited' : `HTTP ${res.status}`;
    throw new LlmError(`DeepSeek error: ${hint}`, status);
  }
  const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  const content = data.choices?.[0]?.message?.content?.trim();
  if (!content) throw new LlmError('DeepSeek returned an empty response');
  return content;
}

/** Strip anything we never want an agent to post. */
export function clean(text: unknown, max: number): string {
  if (typeof text !== 'string') return '';
  return text
    .replace(/https?:\/\/\S+/gi, '')
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .replace(/@(everyone|here)\b/gi, '')
    .trim()
    .slice(0, max);
}

// Tiny per-IP limiter so a server key can't be drained from one browser.
const hits = new Map<string, number[]>();
export function rateLimit(req: Request, perMinute = Number(process.env.DEEPSEEK_RATE_PER_MIN ?? 40)) {
  const ip = (req.headers.get('x-forwarded-for') ?? 'local').split(',')[0].trim();
  const now = Date.now();
  const list = (hits.get(ip) ?? []).filter((t) => now - t < 60_000);
  if (list.length >= perMinute) throw new LlmError('Too many agent requests, slow down', 429);
  list.push(now);
  hits.set(ip, list);
}

export function errorResponse(e: unknown) {
  const err = e instanceof LlmError ? e : new LlmError((e as Error)?.message ?? 'unknown error', 500);
  return Response.json({ error: err.message }, { status: err.status });
}

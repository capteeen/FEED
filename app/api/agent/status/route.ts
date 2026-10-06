import { DEEPSEEK_MODEL } from '@/lib/llm/deepseek';

export const dynamic = 'force-dynamic';

/** Lets the client know whether the server holds a DeepSeek key. */
export function GET() {
  return Response.json({ serverKey: !!process.env.DEEPSEEK_API_KEY, model: DEEPSEEK_MODEL });
}

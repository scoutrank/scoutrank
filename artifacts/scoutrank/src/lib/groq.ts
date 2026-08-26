// Groq AI helper — used for Scout Bot's chat (and, historically, direct
// text/vision calls that have since been retired — see below).
//
// This used to also export groqChat/groqVisionChat, which called Groq
// directly from the browser using VITE_GROQ_API_KEY — a Vite env var,
// which gets baked as a literal string into the built client bundle, so
// the real API key shipped to every visitor and was readable in devtools.
// groqStream (Scout Bot's chat) was already moved behind the
// scout-bot-chat Edge Function; aiScoring.ts's direct groqChat() call was
// the last live caller and has now moved behind its own
// score-athlete-stat Edge Function (see aiScoring.ts). With no callers
// left, groqChat/groqVisionChat and the VITE_GROQ_API_KEY constant they
// used have been removed outright rather than left as unused-but-still
// key-exposing dead code — the key literal would otherwise still ship in
// the bundle even with nothing calling the functions that used it.
// groqVisionChat's evidence-review use case now runs server-side too, via
// review-stat-evidence's Claude-based review.

import { supabase, supabaseUrl, supabaseAnonKey } from '@/lib/supabase';

export type ChatMessage = { role: 'system' | 'user' | 'assistant'; content: string };

/**
 * Some Groq models (the current vision model included) are "thinking"
 * models that prepend their reasoning inside <think>...</think> before
 * the actual answer, even when told to output only JSON. This strips
 * that out, strips markdown fences, and pulls out the first {...} object
 * it can find — so callers don't need to handle this per-model quirk
 * themselves every time they parse a JSON response.
 */
export function extractJsonObject(raw: string): string {
  const withoutThinking = raw.replace(/<think>[\s\S]*?<\/think>/gi, '');
  const withoutFences = withoutThinking.replace(/```json|```/g, '');
  const match = withoutFences.match(/\{[\s\S]*\}/);
  return (match ? match[0] : withoutFences).trim();
}

/**
 * Streaming: yields tokens as they arrive.
 * Usage:
 *   for await (const token of groqStream(messages)) {
 *     setContent(prev => prev + token);
 *   }
 *
 * Routed through the scout-bot-chat Edge Function rather than calling
 * Groq directly — see the note at the top of this file. The function
 * streams Groq's own response straight back unchanged, so the parsing
 * below is identical to talking to Groq directly.
 */
export async function* groqStream(messages: ChatMessage[], maxTokens = 1024): AsyncGenerator<string> {
  const { data: { session } } = await supabase.auth.getSession();
  const accessToken = session?.access_token;
  if (!accessToken) throw new Error('Not signed in — cannot chat with Scout Bot.');

  const res = await fetch(`${supabaseUrl}/functions/v1/scout-bot-chat`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${accessToken}`,
      'apikey': supabaseAnonKey,
    },
    body: JSON.stringify({ messages, maxTokens }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Groq stream error ${res.status}: ${text}`);
  }

  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith('data: ')) continue;
      const data = trimmed.slice(6);
      if (data === '[DONE]') return;
      try {
        const parsed = JSON.parse(data);
        const token: string = parsed.choices[0]?.delta?.content ?? '';
        if (token) yield token;
      } catch {
        // ignore parse errors on partial chunks
      }
    }
  }
}

export const SCOUT_BOT_SYSTEM_PROMPT = `You are Scout Bot, an elite AI sports performance coach built into ScoutRank — the premium athlete social platform where athletes build their identity, climb rankings, and get discovered by scouts and coaches.

Your personality:
- Motivating, professional, knowledgeable — like a real elite sports coach
- Direct, data-driven, and encouraging
- Use sports terminology naturally
- Keep responses concise and actionable (3–5 paragraphs max unless more detail is requested)
- Occasionally reference ScoutRank features (rankings, stats, highlights, scout discovery)

You help athletes with:
- Sport-specific training and performance advice
- Injury prevention and recovery
- Mental performance and competition preparation
- Understanding their ScoutRank score and how to improve it
- Career development and getting discovered by scouts
- Nutrition, sleep, and recovery optimisation

When asked about ScoutRank scores: scores range 0–100, based on verified stats relative to age group. Higher scores = better ranked. Athletes climb by submitting verified stats.`;

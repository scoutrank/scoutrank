// Groq AI helper — used for Scout Bot, profile overviews, resume generation,
// and stat plausibility checks. All calls go directly from the browser to
// Groq's OpenAI-compatible endpoint using the VITE_GROQ_API_KEY secret.

const GROQ_API_KEY = import.meta.env.VITE_GROQ_API_KEY ?? '';
const GROQ_BASE = 'https://api.groq.com/openai/v1';
// llama-3.3-70b-versatile is being deprecated by Groq — openai/gpt-oss-120b
// is their current recommended replacement for general text tasks.
const GROQ_MODEL = 'openai/gpt-oss-120b';
// Vision-capable model, for anything that needs to actually look at an
// image (e.g. evidence review). Groq's multimodal lineup changes
// fairly often — this is their current recommendation as of mid-2026,
// marked by Groq itself as a preview model rather than fully stable.
// If evidence review calls start failing with a "model not found"-style
// error, check console.groq.com/docs/vision for the current name.
const GROQ_VISION_MODEL = 'qwen/qwen3.6-27b';

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

// A multimodal message content part — either plain text, or an image
// (as a data: URL or a public https URL Groq can fetch).
export type VisionContentPart =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string } };
export type VisionMessage = { role: 'system' | 'user' | 'assistant'; content: string | VisionContentPart[] };

/**
 * Same as groqChat but using the vision-capable model and allowing image
 * content parts in messages — for anything that needs to actually look
 * at a photo/video frame rather than just read text.
 */
export async function groqVisionChat(messages: VisionMessage[], maxTokens = 1024): Promise<string> {
  const res = await fetch(`${GROQ_BASE}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${GROQ_API_KEY}`,
    },
    body: JSON.stringify({
      model: GROQ_VISION_MODEL,
      messages,
      max_tokens: maxTokens,
      stream: false,
    }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Groq vision error ${res.status}: ${text}`);
  }
  const data = await res.json();
  return (data.choices[0]?.message?.content as string) ?? '';
}

/** Non-streaming: returns the full assistant response text. */
export async function groqChat(messages: ChatMessage[], maxTokens = 1024): Promise<string> {
  const res = await fetch(`${GROQ_BASE}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${GROQ_API_KEY}`,
    },
    body: JSON.stringify({
      model: GROQ_MODEL,
      messages,
      max_tokens: maxTokens,
      stream: false,
    }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Groq error ${res.status}: ${text}`);
  }
  const data = await res.json();
  return (data.choices[0]?.message?.content as string) ?? '';
}

/**
 * Streaming: yields tokens as they arrive.
 * Usage:
 *   for await (const token of groqStream(messages)) {
 *     setContent(prev => prev + token);
 *   }
 */
export async function* groqStream(messages: ChatMessage[], maxTokens = 1024): AsyncGenerator<string> {
  const res = await fetch(`${GROQ_BASE}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${GROQ_API_KEY}`,
    },
    body: JSON.stringify({
      model: GROQ_MODEL,
      messages,
      max_tokens: maxTokens,
      stream: true,
    }),
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

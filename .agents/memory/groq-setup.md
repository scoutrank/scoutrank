---
name: Groq AI setup
description: How AI is wired in this project — frontend-only via VITE_GROQ_API_KEY, no backend required
---

ScoutRank and Scout Bot are frontend-only (no API server). AI calls go directly from the browser to Groq's OpenAI-compatible endpoint.

**API key secret name:** `VITE_GROQ_API_KEY`
**Model:** `llama-3.3-70b-versatile`
**Base URL:** `https://api.groq.com/openai/v1`
**Helper file:** `artifacts/scoutrank/src/lib/groq.ts` — exports `groqChat()` (non-streaming), `groqStream()` (async generator), and `SCOUT_BOT_SYSTEM_PROMPT`

**Why:** The Replit AI Integration required an account upgrade which the user declined. Groq was chosen as a free alternative.

**How to apply:** Import `{ groqChat, groqStream }` from `@/lib/groq` in any ScoutRank page that needs AI. For the standalone scout-bot artifact, the Groq calls are inlined in ChatPage.tsx (no shared lib).

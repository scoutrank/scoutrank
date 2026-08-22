---
name: Supabase URL auto-correct
description: The VITE_SUPABASE_URL secret contains a JWT instead of the project URL; supabase.ts auto-corrects it
---

The user entered their anon key JWT as `VITE_SUPABASE_URL` instead of the project URL.

**Correct URL:** `https://gmgjpbiiqjaidhtuhkpx.supabase.co`

**Fix in code:** `artifacts/scoutrank/src/lib/supabase.ts` detects a JWT pattern in the env var and auto-corrects by decoding the `ref` field from the JWT payload and constructing the URL.

**Why:** The underlying secret is still wrong. Ideally the user should fix it permanently, but the auto-correction keeps the app working.

**How to apply:** If Supabase calls break, remind user to set `VITE_SUPABASE_URL` to `https://gmgjpbiiqjaidhtuhkpx.supabase.co` in Secrets.

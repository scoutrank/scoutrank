---
name: ScoutRank admin tab bug
description: Known bugs that were fixed in AdminDashboardPage.tsx
---

Two bugs existed in `artifacts/scoutrank/src/pages/AdminDashboardPage.tsx`:

1. **Duplicate 'reports' tab** — `adminTabs` array had two entries with `id: 'reports'`. The second one (line ~30) was removed.

2. **disputes/verifications not state** — `disputes` and `verifications` were declared as `const [] = []` but handlers called `setDisputes`/`setVerifications`. Fixed to `useState<AdminDispute[]>([])` and `useState<AdminVerification[]>([])`.

**Why:** Copy-paste error from original zip upload.

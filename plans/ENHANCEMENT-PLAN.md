# Documentation Enhancement Plan — Maintenance-First + Evaluations Migration

## Progress Tracking

| # | Enhancement | Status | Commit |
|---|------------|--------|--------|
| 1 | GitHub source deep-links | DONE | 996e011 |
| 2 | Sprint export button | DONE | 996e011 |
| 3 | Stale documentation badge | DONE | 996e011 |
| 4 | Feature-to-files index | DONE | cc7368e |
| 5 | Reverse dependency panel | DONE | ac2221f |
| 6 | 3-tier sproc cross-reference | DONE | 844b930 |
| 7 | Evaluations migration runbook | DONE | 83f1a80 |
| 8 | Module health dashboard | DONE | 010471f |
| 9 | Onboarding learning path | DONE | a8fb858 |
| 10 | Tech debt radar | DONE | 2dfcfca |
| 11 | Scheduler timeline | DONE | 2dfcfca |
| 12 | "Ask the Docs" chat (OpenAI GPT-4o) | DONE | 1596e55 |
| — | Code review fixes (hooks, lazy fetch, clipboard, sidebar, dead link) | DONE | 5b16546 |
| — | Code review fixes round 2 (DependentsPanel lazy fetch, a11y, keys, types, fabricated SPs) | DONE | 8b3d308 |
| — | User Guide page (site navigation reference) | DONE | 2dfcfca |

---

## Context

**Primary goal**: Help the existing team maintain the .NET codebase — find relevant files quickly when fixing bugs or making changes, understand impact before touching something, trace how a feature actually works end-to-end.

**Secondary goal**: Support the Evaluations module migration to Node.js (47 business files + 214 web pages + 192K lines — the largest and most complex module).

The site already has 2,422 per-file documented files and 6 interactive components. The data is rich. The gap is that it answers "what does this file do?" but doesn't answer "where do I look when X is broken?" or "what will I break if I change Y?" or "how do I plan the Evaluations migration?"

---

## Evaluations Module Context (for migration planning)

From existing enrichment data:
- **Business layer**: 47 .cs files (`Business.Evaluations/`)
- **Web layer**: 214 .cs files (`Web/Evaluations/`) — 192,121 lines, largest web directory
- **Stored procedures**: 13+ documented at business layer level (many more in Web layer)
- **Dependencies**: Evaluations depends on Security, Mail, Duty Hours, Portfolio, Procedures
- **Migration complexity**: Very high — this is the core product feature with 20-year history

---

## Enhancement Details

---

### TIER 1 — Maintenance Accelerators (Highest Priority)

---

#### 1. GitHub Source Deep-Links in FileReference Component
**Problem**: Developers read the AI summary, then manually navigate to GitHub to actually see the code. Kills momentum.
**Solution**: "View on GitHub →" link icon on every file row in `FileReference.tsx`. Uses `filePath` field already in the enrichment JSON + known repo base URL (`https://github.com/myevaluations/myevals-dotnet-backend/blob/master/`).
**Files**: `src/components/FileReference.tsx` — add external link icon in each row.
**Effort**: 1 hour
**Impact**: Every per-file reference page (2,422 entries) immediately becomes a launchpad to the actual source code.

---

#### 2. Sprint Export — Markdown Checklist Button
**Problem**: When planning a bug fix or change sprint, developers manually copy file names from the docs into GitHub issues or meeting notes.
**Solution**: "Export as Checklist" button in the `FileReference` component. Applies the current filter state and exports:
```markdown
## Files to Review — Business.Evaluations (47 files, high migration relevance)
- [ ] EvaluationsManager.cs (complex) — Core evaluation CRUD, routing, scoring
- [ ] EvalFormManager.cs — Form rendering and submission logic
...
```
Copies to clipboard or downloads as `.md`. One click → paste into GitHub issue.
**Files**: `src/components/FileReference.tsx`
**Effort**: 2 hours

---

#### 3. Stale Documentation Badge
**Problem**: Enrichment JSONs have `generatedAt` timestamps. If source code is committed after enrichment, the AI summary may be wrong. Developers don't know this.
**Solution**: Show "Last enriched: Feb 21, 2026" chip on every file reference page. At build time (when `.repos/` is available), compare each file's git commit date vs enrichment timestamp → show ⚠️ "Source modified since enrichment" if newer.
**Files**: `src/components/FileReference.tsx` (add generatedAt prop), update enrichment-driven MDX pages
**Effort**: 2–3 hours

---

#### 4. "Find Code for Feature X" — Feature-to-Files Index
**Problem**: Developer is asked to "add a new field to the evaluation form" or "fix evaluation routing." They don't know where to start across 214 web files and 47 business files.
**Solution**: `docs/dotnet-backend/feature-map.mdx` — a table mapping user-facing features to code entry points.
**Effort**: 4–6 hours (content curation + partial scripting from enrichment data)
**Impact**: Eliminates "where do I even start?" — answers in under 30 seconds for the most common maintenance tasks.

---

#### 5. "If I Change This, What Breaks?" — Reverse Dependency Panel
**Problem**: Developer needs to fix a bug in `EvaluationsManager`. No idea how many web pages depend on it, which schedulers use it, or which other Business modules call it.
**Solution**: On each Business Module overview page, add a collapsible **"Who Depends On This Module"** panel.
**How**: Build-time script `scripts/generate-reverse-deps.ts` reads all enrichment JSONs, inverts `businessManagersUsed[]`, writes `generated/reverse-deps/{module}.json`. New `src/components/DependentsPanel.tsx` renders it per module page.
**Effort**: 5–6 hours

---

#### 6. Stored Procedure → Web Page 3-Tier Cross-Reference
**Problem**: Developer debugging a data issue (e.g., evaluation scores not saving). They know `sp_Evaluations_SubmitScore` is involved but don't know which web pages trigger it or which manager calls it.
**Solution**: Enhance `SprocMap` component to show the full 3-tier chain.
**Effort**: 4–5 hours

---

### TIER 2 — Evaluations Migration Support

---

#### 7. Evaluations Migration Runbook
**Problem**: No concrete plan exists for migrating the largest module (47 business files + 214 web files). "Strangler fig" is mentioned but nothing actionable.
**Solution**: Dedicated `docs/dotnet-backend/migration/evaluations-runbook.mdx` generated from existing enrichment data.
**Effort**: 5–7 hours

---

#### 8. Module Health Dashboard
**Problem**: Before migrating Evaluations, the team needs to know: which of the 47 business files are most risky, which have the most downstream dependents, which are safest to port first.
**Solution**: `docs/dotnet-backend/module-health.mdx` — a ranked table of all 20 Business Modules scored on average complexity, file size, SP count, dependent pages.
**Effort**: 4–5 hours

---

### TIER 3 — Discovery & Trust

---

#### 9. Onboarding Learning Path with Progress Tracking
**Problem**: New engineers join the team and face 139 pages with no guidance on where to start.
**Solution**: `docs/onboarding-path.mdx` — curated Week 1 / Week 2 reading sequence with localStorage checkboxes.
**Effort**: 3–4 hours

---

### TIER 4 — Powerful but Longer

---

#### 10. Tech Debt Radar — Complexity × Migration Priority Scatter Plot
D3.js bubble chart of all 2,422 files. Click any bubble → navigate to that file's docs page.
**Effort**: 5–6 hours

#### 11. Scheduler Run-Time Timeline
Visual 24-hour grid showing when the 70+ schedulers fire.
**Effort**: 5–7 hours

#### 12. "Ask the Docs" Chat Widget — OpenAI GPT-4o
Floating chat widget on every page. Context: enrichment-index.json + current page enrichment JSON.
**Model**: GPT-4o via openai npm package
**Effort**: 10–12 hours

---

## Key Files to Create or Modify

| File | Change |
|------|--------|
| `src/components/FileReference.tsx` | GitHub link + export button + stale badge |
| `src/components/DependentsPanel.tsx` | New — reverse deps per module |
| `src/components/SprocMap.tsx` | Extend to 3-tier trace |
| `src/components/ReadingProgress.tsx` | New — localStorage progress |
| `scripts/generate-reverse-deps.ts` | New build-time script |
| `scripts/generate-feature-map.ts` | New build-time script |
| `generated/reverse-deps/{module}.json` | New build output |
| `docs/dotnet-backend/feature-map.mdx` | New page |
| `docs/dotnet-backend/module-health.mdx` | New page |
| `docs/dotnet-backend/migration/evaluations-runbook.mdx` | New page |
| `docs/onboarding-path.mdx` | New page |
| All 20 business module overview pages | Add DependentsPanel component |

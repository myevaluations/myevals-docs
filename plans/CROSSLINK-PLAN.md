# Cross-Link Plan: AI-Enriched File Reference Pages → Existing Documentation

## Status

| Phase | Steps | Status | Completed |
|-------|-------|--------|-----------|
| Phase 1 | Steps 1–3: Cross-link 16+2 pages | ✅ COMPLETE | 2026-02-21 |
| Phase 2 | Steps 4–5: 4 new pages + sidebar | ✅ COMPLETE | 2026-02-21 |
| Final | Steps 6–9: Build, commit, update docs | ✅ COMPLETE | 2026-02-21 |

---

## Phase 1: File Reference Cross-Links

### Step 1: Added `## File Reference` to 16 business overview pages

| Page | Target slug | File count | Status |
|------|-------------|------------|--------|
| `business/security.mdx` | `files/security` | 128 | ✅ |
| `business/evaluations.mdx` | `files/evaluations` | 47 | ✅ |
| `business/duty-hours.mdx` | `files/dutyhours` | 76 | ✅ |
| `business/cme-tracking.mdx` | `files/cmetracking` | 42 | ✅ |
| `business/patient-log.mdx` | `files/patientlog` | 29 | ✅ |
| `business/procedures.mdx` | `files/procedures` | 51 | ✅ |
| `business/portfolio.mdx` | `files/portfolio` | 11 | ✅ |
| `business/learning-assignment.mdx` | `files/learningassignment` | 12 | ✅ |
| `business/quiz.mdx` | `files/quiz` | 24 | ✅ |
| `business/mail.mdx` | `files/mail` | 6 | ✅ |
| `business/timesheet.mdx` | `files/timesheet` | 28 | ✅ |
| `business/hellosign.mdx` | `files/hellosign` + `files/adobesign` + `files/rightsignature` | 30 + 8 + 10 | ✅ |
| `business/eras.mdx` | `files/eras` | 3 | ✅ |
| `business/icc.mdx` | `files/icc` | 2 | ✅ |
| `business/essential-activities.mdx` | `files/essentialactivities` | 13 | ✅ |
| `business/nurse-notify.mdx` | `files/nursenotifyservice` | 1 | ✅ |

### Step 2: Updated `schedulers/index.mdx`

Added `## File Reference` section linking to `./files/schedulers` (160 files, 66 projects). ✅

### Step 3: Updated `web/structure.mdx`

Added **Web Page Reference** link in `## Related Documentation` section pointing to `../file-index`. ✅

---

## Phase 2: New Business Module Pages + Sidebar

### Step 4: Created 4 new business module overview pages

| File | Module | Key classes | Per-file count | Status |
|------|--------|-------------|----------------|--------|
| `business/common.mdx` | Business.Common | Manager, CacheManager, EventManager, CommonTypes, DashBoard, Constants | 12 | ✅ |
| `business/utilities.mdx` | Business.Utilities | EmailUtility, ExcelProcess, EncryptKeyGen, PersistComponent, TelnyxSmsService, RequestRateLimiter | 18 | ✅ |
| `business/mailgun-service.mdx` | Business.MailGunService | MailgunPOP3 | 1 | ✅ |
| `business/myhelp.mdx` | Business.MyHelp | HelpGroupManager, SectionsGroupManager, SectionInfoBusiness | 4 | ✅ |

### Step 5: Updated `sidebars.ts`

Added 4 new entries after `nurse-notify`, before the `File Reference` category:
- `dotnet-backend/business/common`
- `dotnet-backend/business/utilities`
- `dotnet-backend/business/mailgun-service`
- `dotnet-backend/business/myhelp`

Business Modules count: **16 → 20** ✅

---

## Final: Build, Commit, Docs Update

- Build verification: `npm run build` — zero errors ✅
- Phase 1 commit: `Add File Reference cross-links to all business, scheduler, and web pages` ✅
- Phase 2 commit: `Add 4 new business module overview pages (Common, Utilities, MailGunService, MyHelp)` ✅
- CLAUDE.md updated: Business Modules 16 → 20, notes on generated/ and cross-linking ✅
- README.md updated: reflected 20 business modules ✅

---

## Navigation Gaps Resolved

| Gap | Before | After |
|-----|--------|-------|
| Business overview → per-file pages | No path | `## File Reference` section at bottom of each page |
| Scheduler index → scheduler file reference | No path | `## File Reference` section added |
| Web structure → web page reference | No path | Link in `## Related Documentation` |
| Common, Utilities, MailGunService, MyHelp had no overview | Missing | New concise overview pages created |

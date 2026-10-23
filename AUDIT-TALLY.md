# JACITA plan tally

Compared on 23 October 2026 against local commit `053aa53` on `feat/per-org-meta-app`, including the subsequent uncommitted repair batch described below.
Reference: `C:\Users\onyxl\Downloads\JACITA-Marketing-Audit (4).md`, including its later planning additions through 15 October.
The audit's original source snapshot was `1ef3d7a`.

This is a source-based progress comparison, not a fresh security certification. The document's instructions and approvals were treated as recorded requirements, not permission to change the application, deploy, activate automation or contact clients. The initial comparison was read-only. The subsequent repair batch changes application code as recorded below; no remote configuration was changed. The separate dashboard/Growth hub prototypes were not inspected or counted as production implementation.

## Tally

| Group | Source progress | Acceptance still required |
|---|---|---|
| 10 numbered security/reliability findings | Corresponding repairs exist for all 10 | Database integration, deployed migrations/configuration and controlled provider testing |
| 19 prioritised UI findings | 10 addressed, 1 partially addressed, 8 outstanding | Mocked review browser checks passed; full authenticated/provider acceptance still required |
| Wider managed-service plan | Existing foundations cover parts of several workstreams | Portfolio oversight, activation readiness, reporting, service operations, growth and video work remain substantial |

These groups overlap. Do not add them into a single completion percentage: the plan mixes small repairs, large features and live acceptance gates.

## Original numbered findings

"Source repair" means the relevant protection is implemented in this checkout; it does not establish that it is deployed or that every related acceptance test passes.

| # | Finding | Tally | Evidence |
|---|---|---|---|
| 1 | Managers promote themselves to owner | Source repair | `20261014100000_membership_roles_hardening.sql`: owner-only membership policies, owner guards, ownership-transfer function; subsequent admin-only organisation creation |
| 2 | Staff publish unapproved drafts | Source repair | `src/lib/social/publish-authz.ts`, scheduler and publisher enforce owner/manager and permitted content status; execution rechecks authorisation |
| 3 | Foreign business platform row supplied | Source repair | Server derives the platform row from content/platform and rejects a mismatching supplied ID; `20261014110100_publish_job_consistency.sql` validates relationships in the database |
| 4 | Publish now takes over processing job | Source repair | `claim_publish_job` excludes processing/published states; scheduler returns in-progress; worker writes match lock tokens |
| 5 | Ad approval lacks atomic claim | Source repair | `claim_advertising_action` locks/checks the action and claims it before the service calls the provider |
| 6 | Ad limits incomplete at execution | Source repair | `20261014170000_ads_execution_limits.sql`: execution-time validation, business locking, pending execution accounting, scope/period settings and protected payloads; later reconcile/sync guards |
| 7 | Crashed worker blindly retries | Source repair | `request_sent_at` is recorded before the provider request; stale sent attempts become uncertain; reconciliation is required before retry/requeue |
| 8 | Scheduling leaves partial state | Source repair | `schedule_content` RPC validates targets and changes content/platform/jobs transactionally; failures are returned to callers |
| 9 | Hourly automation requires minute 00 | Source repair | GitHub calls automation every run; engine conditionally claims businesses due since `last_run_at`, allowing catch-up |
| 10 | Paid AI has no application quotas | Source repair, cost accuracy caveat | Persistent business spending reservations, daily image cap, per-user concurrency, timeouts and bounded retries in `src/lib/ai/spend/` and `20261014210000_ai_spend_limits.sql` |

Finding 10 is not a verified provider billing cap: `prices.ts` explicitly contains unconfirmed image-price estimates. Current pricing and actual settlement behaviour require verification before go-live.

### Additional audit observations

| Observation | Tally |
|---|---|
| Non-atomic OAuth state consumption | Addressed in source: one conditional update binds state, user, platform, expiry and unconsumed status |
| Demo/fallback content can enter autopilot | Current risk mitigated by database refusal of autopilot. A distinct fallback-content policy remains necessary before selective autopilot is introduced |
| Manual account request falls back to a different job / enqueues other platforms | Source changes restrict manual enqueue to the selected platform and validate the requested account |
| README contradicts implemented publishing | Operational documentation updated, including migration order, invitations, spending controls and manual go-live checklist |

## Prioritised UI findings: 19 total

| # | Requirement | Tally |
|---|---|---|
| 1 | Business-timezone schedule inputs and conversion | Addressed in source; timezone unit tests pass |
| 2 | Revision-aware, serialised autosave and failure state | Addressed in source; slow-save/browser acceptance remains |
| 3 | Schedule changes update the queue, separate from copy editing | Addressed in source through workflow scheduling/RPC |
| 4 | Video-aware social preview | Addressed: native video controls, original images, loading/error/retry states |
| 5 | Exact published asset rather than decorative text overlays | Addressed: original asset shown without overlays/cropping; suggested text is separate; full caption uses the publisher formatter |
| 6 | Query errors distinguished from empty lists | Outstanding across calendar/media; content-detail/account errors now fail explicitly and selected-media failures are visible |
| 7 | Calendar previous/next/today and selected-day details | Outstanding: calendar still uses current date and only a view parameter |
| 8 | Clickable month overflow/day agenda | Outstanding |
| 9 | Actionable notifications and mark-read | Outstanding: popover still shows count text only |
| 10 | Visible mobile Create action | Addressed: shared Create action is visible with a 44px minimum height |
| 11 | Multi-platform, connected-account previews tied to edits | Addressed in content details: platform tabs, saved account identities and live editor state; no invented handles |
| 12 | Campaign detail/edit/archive and linked results | Outstanding: campaign listing remains basic creation/read-only presentation |
| 13 | Paged content/media/calendar and database-side media filtering | Outstanding |
| 14 | Correct explicit media category filtering | Outstanding: text matching and inclusion of uncategorised assets remain |
| 15 | No-assets versus no-search-results states | Outstanding: filtered grid still uses the generic empty-library state |
| 16 | One clear recovery action for failed publishes | Addressed: one retry action; role/content-state checks; reconnect and held/uncertain guidance |
| 17 | Publish result distinguishes confirmed/duplicate/processing/held outcomes | Addressed: explicit outcome messages, safe provider links, inline results and simulation labels; asynchronous provider references remain processing |
| 18 | Navigation current-page semantics, named avatar and skip link | Addressed: desktop/mobile aria-current, named user menu, focusable main/skip link; editor labels linked to fields |
| 19 | Mobile touch areas and readable small labels | Partial: review actions, Create/avatar controls and preview tabs have 44px minimums; dock labels enlarged. Shared sizes and other dense screens remain |

## Wider plan comparison

| Workstream | Current source position | Remaining acceptance gap |
|---|---|---|
| Private access | Sign-in, recovery pages, invitation acceptance, safe redirects and local signup restriction exist; business creation is admin-only | Verify hosted Auth settings, SMTP, invite/recovery journeys and operator recovery |
| Approved login design | Private sign-in works; generic auth card/grid and text wordmark remain | Official original logo, approved orbit/tile layout, password visibility control and rendered accessibility checks |
| Dashboard visual direction | Existing workspace shell and single-business dashboard | Approved white-sidebar/navy/gold portfolio direction is not implemented as the planned production dashboard |
| Guided onboarding | Business/brand/services/audience/goals/media/social setup and progress checks exist | Planned facts/asset approval, reviewer/rules, trial and explicit activation lifecycle; resumable readiness acceptance |
| Business facts, offers and revision rules | Content material edits invalidate approval and hold queued jobs | Versioned verified business facts/brand settings, approved offers with expiry, affected-post invalidation and execution checks |
| Social connection | Facebook, Instagram, TikTok adapters; OAuth, encrypted credentials, account-switch holds and disconnect controls | Live authorisation/capability verification, account identity and reconnection/offboarding acceptance |
| Portfolio Home | Business switcher, platform business list and selected-business dashboard | All-business attention queue with approvals, failures, account health, next posts and activity |
| Weekly creation | Business-scoped studio, batch/series/weekly planning foundations | Exact reviewed media, fact/offer validation, reliable weekly delivery and two-business acceptance |
| Central approval queue | Per-business approval/workflow controls | Cross-business grouped/filterable review with exact account/media/time and per-item bulk outcomes |
| Calendar | Current week/month for selected business; backend scheduling repaired | Period navigation, portfolio view, business timezone display throughout, channel/status filters and mobile agenda |
| Media | Business-scoped upload, signing, categories, favourites and flyers | Preview correctness, pagination/filtering, approved asset lifecycle and richer upload acceptance |
| Publishing oversight | Job states, claims, holds, uncertain outcomes and recovery UI | Full local integration plus a controlled real publication; exact approved asset/account/time/result agreement |
| Activity and weekly oversight | Audit/event/automation activity foundations | Readable durable history across the expanded workflows, deduplicated actionable alerts and complete weekly summary |
| Client intake and service packages | No matching production intake/package implementation found | Expiring/revocable intake, reviewed submissions, effective-dated package and confirmed-delivery comparison |
| Coverage, asset requests, change requests | Some setup checks and content-fatigue foundations | Package/timezone-aware coverage, request states, revision-linked feedback and recovery tasks |
| Analytics and monthly reporting | Stored metric aggregation, rankings, source labels, health score and AI review exist | Production organic collectors, collection health, demo exclusion throughout, reliable reports/export and representative provider comparison |
| Attribution and profitability | No production booking/CRM ingestion or full service-margin ledger found | Deduplicated outcomes, attribution method/window, cancellation/refund updates, service fees and actual/allocated costs |
| AI operating costs | Usage ledger, budget controls and Settings panel | Confirmed pricing, provider reconciliation, broader rendering/transcription/storage costs and service profitability |
| AI model selection | Shared text model is hard-coded; structured generation and image generation exist | Task-based editable model policy and representative quality/cost pilot |
| AI video editing | Original media and content-generation foundations only | Footage analysis/transcription, constrained edit schema, renderer adapter, durable render queue, brand versions, playable exact export and cost tracking |
| Growth hub | Goals, strategy and stored-performance recommendations provide foundations | Versioned briefs, sourced research, compatible creative experiments, conversion events, page assessments and accepted recommendation tasks |
| Paid campaigns | Proposals, execution, ad safeguards and reconcile controls exist | Exact creative/campaign revision acceptance, verified reporting and controlled authorised small-budget pilot |
| Offboarding and pauses | Business automation pause, disconnect and queued-job cancellation exist | Complete business offboarding/export/retention flow and portfolio emergency pause |
| Selective autopilot | Deliberately refused server-side for safety | Controlled pilot, readiness/rules, fact/offer/media validation and explicit per-business opt-in before reintroduction |

Public registration, subscription billing and full client dashboards remain excluded. Threads, WhatsApp, Canva and optional client approval links are future scope; decorative integration icons do not count as implementations.

## Delivery stages

1. **Repairs/private access:** substantially implemented in source. Still needs remaining exact-preview/UI work, approved login design, dependency readiness and integration/live acceptance.
2. **One-business supervised pilot:** not evidenced as complete by this comparison. Requires every post approved and final asset/account/time/provider result checked.
3. **Portfolio/onboarding/weekly operations:** partial foundations; most expanded production workflows remain.
4. **Collectors/reports/costs/attribution:** partial stored analytics and AI-cost foundations; substantial ingestion/reporting/service-finance work remains.
5. **Selective autopilot/optional client approvals:** future gated work; autopilot is currently blocked.

## Repair batch and verification — 23 October 2026

Implemented a shared publication caption formatter, original image/video previews, platform/account review tabs, live edit previews, save-before-publish controls, truthful publishing outcomes and one retry action. Manual publish/retry no longer mistakes an asynchronous provider reference for confirmed publication. Media lookup in content details is business-scoped, active-only and checks the organisation storage prefix.

Also restored locked dependencies, fixed the studio effect that reset the selected platform on every package edit, removed stale mirrored server data in Automation, and reset its editable settings/dialogs safely on a business change. Added navigation/editor accessibility improvements. Lint excludes temporary bundles and separate assistant worktree checkouts. Existing unrelated local changes were preserved.

Verification:

- npm run test:unit: **18 passed** (including 5 new caption/outcome checks).
- npm run test:preview: **4 passed** against the actual shared preview component.
- npm run test:pglite: **46 passed**. This verifies migration SQL with a Supabase shim, not PostgREST/GoTrue or the application's full server paths.
- Existing publishing reliability checks: **9 passed**; Meta isolation checks passed; Meta completion checks: **39 passed**. These remain source/helper checks, not live provider evidence.
- TypeScript: passed after regenerating route definitions and removing stale generated signup types.
- Production build: passed, generating **37 static pages**. It required network access for the existing Google Fonts; no font/dependency versions changed.
- ESLint: **0 errors, 7 pre-existing warnings** remain outside this repair batch.
- Mocked browser verification with the real review components: live caption/CTA/hashtags, platform account switching, failed-save retention, disabled workflow/publishing while dirty, successful retry and resumed controls, missing-video error handling, desktop and 390px mobile layout without horizontal overflow.
- Browser media checks verified controls and failure handling; successful playback of a real client video and final provider processing remain unverified.
- A server integration regression case was added for an asynchronous provider reference. Full Supabase integration/RLS tests were not run because Docker's engine and the local stack are unavailable.
- No remote scripts, migrations, provider publication, paid API calls or automation activation were performed.

Next milestone: complete full local Supabase integration when Docker is available, confirm AI price estimates, finish remaining pilot readiness/design requirements, and run one supervised publication to a dedicated test account. Calendar navigation, notifications, media pagination/filtering, campaign maintenance and the wider product roadmap remain outstanding.

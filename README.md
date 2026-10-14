# Jacita Marketing

Multi-tenant AI social media marketing platform. One application manages many businesses — each with isolated brand, content, media, campaigns, social accounts, and analytics.

## Stack

- Next.js App Router + TypeScript
- Tailwind CSS + shadcn/ui
- Supabase (Auth, PostgreSQL + RLS, Storage)
- OpenAI via Vercel AI SDK (server-side only)

## Architecture

```
Platform → Organisation (business) → Members → Tenant data
```

Every business-specific table is scoped by `organisation_id` and enforced with **Row Level Security**. Frontend filtering is not the security boundary.

Roles:

- `platform_admin` — platform administration (`users.is_platform_admin`)
- `owner` / `manager` / `staff` — organisation membership roles

Active business context is stored in the `jacita-active-org` cookie and validated against membership on every request.

## Local setup

### 1. Install

```bash
npm install
```

### 2. Start Supabase (Docker required)

```bash
npx supabase start --ignore-health-check -x logflare,vector
```

On Windows, analytics containers can fail health checks; the flags above keep Auth/DB/Storage usable.

Copy the printed API URL, anon/publishable key, and service role key into `.env.local`:

```bash
cp .env.example .env.local
```

### 3. Apply migrations

`supabase start` applies migrations automatically. To reset:

```bash
npx supabase db reset
```

### 4. Optional OpenAI key

Add `OPENAI_API_KEY` to `.env.local`. Without it, content generation returns branded demo JSON so the workflow still works.

### 5. Run the app

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## App areas

| Route | Purpose |
|-------|---------|
| `/` | Landing page; the only action is private sign-in |
| `/login` | Sign in (no public signup) |
| `/forgot-password`, `/reset-password` | Password recovery (email link → new password) |
| `/invite/<id>` | Accept an invitation to a business |
| `/app` | Business dashboard |
| `/app/content` | Content workflow (draft → review → approved → scheduled → published) |
| `/app/content/new` | AI content generation |
| `/app/calendar` | Content calendar |
| `/app/media` | Per-org media library (Storage) |
| `/app/services` | Products / services catalogue |
| `/app/campaigns` | Campaigns |
| `/app/analytics` | Metrics |
| `/app/social` | Connect Facebook / Instagram / TikTok (OAuth) |
| `/app/automation` | Automation control centre, publishing queue, Meta ads |
| `/app/settings` | Business, brand profile, team and invites |
| `/app/onboarding` | Create a business |
| `/platform` | Platform admin |

## How it behaves

- **Private workspace.** There is no public signup. People join a business
  only by invitation: the owner (or a platform admin) invites an email
  address as manager or staff, the invitee opens the emailed link and
  accepts (`accept_invite`, which checks the signed-in email matches and the
  invite is pending and unexpired). Nobody can be invited as owner;
  ownership only moves through **Transfer ownership**. Managers cannot invite
  or manage members.
- **Publishing is real.** Connected accounts publish through the job queue
  (`/api/cron/publish-due`), with atomic job claims, lock-token checks and
  an `uncertain` state when the outcome of a post is unknown (a person must
  check the platform and confirm before it is retried).
- **Approval required.** Only approved content is scheduled or published,
  and only by an owner or manager. Editing an approved post's copy, media or
  offer sends it back to review and holds its queued posts.
- **Autopilot is currently disabled** for organisations, automation and ads
  (refused by the database). Automation runs in approval mode: it drafts and
  proposes, people approve.
- **Ads** run only as approved actions, validated at execution time against
  the business's configurable spend limits (per campaign or business total,
  daily or lifetime) and active-campaign cap.
- Schedule times are entered and shown in the business's time zone
  (`organisations.timezone`).

## Security notes

- Never put `SUPABASE_SERVICE_ROLE_KEY` or `OPENAI_API_KEY` in client code.
- Social OAuth tokens are stored encrypted server-side (`SOCIAL_TOKEN_ENCRYPTION_KEY`), never in the browser.
- Storage objects live under `{organisation_id}/…` with RLS on the first path segment.
- Membership rows can only be created by `create_organisation` (the first
  owner), `accept_invite` and `transfer_ownership`; direct inserts (browser
  or service role) are refused by a trigger.

## Deploying (live project) — go-live order

Follow these steps in order.

1. **Merge, back up, pause cron.** Merge the branch, take a database backup
   (Dashboard → Database → Backups), and disable the GitHub workflow
   `publish-cron` (Actions → publish-cron → Disable workflow). The daily
   Vercel cron calls in `vercel.json` still fire; that is expected.

2. **Pre-checks** (SQL editor). Each must pass, or be fixed, before step 3:

   ```sql
   -- (a) Must NOT be null. If it is, apply 20260921000000_org_meta_apps.sql first.
   select to_regclass('public.organisation_meta_apps');

   -- (b) No business with two owners (must return no rows).
   select organisation_id, count(*) from public.organisation_members
   where role = 'owner' group by organisation_id having count(*) > 1;

   -- (c) No duplicate active jobs per content + account (must return no rows).
   select content_id, social_account_id, count(*) from public.social_publish_jobs
   where status in ('pending', 'ready', 'processing', 'retrying')
   group by content_id, social_account_id having count(*) > 1;

   -- (d) Businesses on autopilot: these WILL be downgraded (tell the owners).
   select o.id, o.name, o.autopilot_mode, a.mode as automation_mode, ad.mode as ads_mode
   from public.organisations o
   left join public.automation_settings a on a.organisation_id = o.id
   left join public.advertising_settings ad on ad.organisation_id = o.id
   where o.autopilot_mode = 'autopilot' or a.mode = 'autopilot' or ad.mode = 'autopilot';

   -- (e) Invite emails that would break the new CHECK: fix or delete them.
   select id, email from public.organisation_invites
   where position('@' in lower(btrim(email))) <= 1;

   -- (f) No negative ad limits (must return no rows).
   select organisation_id, daily_spend_limit_cents, max_active_campaigns
   from public.advertising_settings
   where daily_spend_limit_cents < 0 or max_active_campaigns < 0;
   ```

3. **Apply the migrations in filename order, one transaction per file.** Run
   each file on its own. This matters most for the files that add enum values:
   `20261014110000` adds `held` and `20261014130000` adds `uncertain`, and a
   new enum value cannot be used in the transaction that adds it.
   (`20261014120000` also adds `held` to `platform_publish_status`, which
   that file does not use itself.)

   1. `20261014090000_explicit_service_role_grants.sql`
   2. `20261014100000_membership_roles_hardening.sql` (stops if (b) fails)
   3. `20261014110000_publish_job_held_status.sql` (enum: run alone)
   4. `20261014110100_publish_job_consistency.sql`
   5. `20261014120000_account_identity_safety.sql`
   6. `20261014130000_publish_job_uncertain_status.sql` (enum: run alone)
   7. `20261014130100_publish_job_claims.sql`
   8. `20261014140000_schedule_content_rpc.sql`
   9. `20261014150000_material_edit_invalidates_approval.sql`
   10. `20261014160000_uncertain_blocks_requeue.sql` (stops if a post/account
       pair already has two processing/uncertain jobs)
   11. `20261014170000_ads_execution_limits.sql`
   12. `20261014180000_invites_accept.sql`
   13. `20261014190000_ads_pause_and_reconcile.sql`
   14. `20261014200000_ads_sync_after_reconcile.sql`
   15. `20261014210000_ai_spend_limits.sql`

   After `20261014180000`, scripts that insert members with the service role
   (e.g. `scripts/seed-business-profiles-remote.mjs`) no longer work; people
   join through invites.

4. **Set `NEXT_PUBLIC_APP_URL`** to the production URL in Vercel and deploy
   straight away. Invite links are built from it (never from request
   headers). Production falls back to `APP_URL`, and refuses to build links
   if neither is set. `NEXT_PUBLIC_*` values are fixed **at build time**: set
   the variable *before* the build, and redeploy (a new build, not just a
   restart) whenever it changes.

5. **Re-run the target backfill.** Jobs queued between the migration and the
   deploy may have no target. Re-run the UPDATE from
   `20261014120000_account_identity_safety.sql`:

   ```sql
   update public.social_publish_jobs j
   set target_external_account_id = a.external_account_id
   from public.social_accounts a
   where a.id = j.social_account_id
     and j.target_external_account_id is null
     and j.status in ('pending', 'ready', 'retrying', 'processing', 'held', 'failed', 'expired');
   ```

6. **Dashboard (Authentication):**
   - Sign In / Providers → Email: turn **off** "Allow new users to sign up".
     Keep the Email provider **on**, because invites and password recovery
     need it.
   - URL Configuration: Site URL = `<APP_URL>`. Redirect URLs:
     `<APP_URL>/auth/callback**` (wildcard, because password reset adds
     `?next=`) and `<APP_URL>/invite/**`.
   - SMTP Settings: configure custom SMTP. The built-in sender is heavily
     rate-limited and not meant for production.

7. **Review held and uncertain posts.** The migrations and new checks hold
   some queued posts (no recorded target, edited after approval, content no
   longer approved, account switched) and may mark interrupted ones
   `uncertain`. Warn the operator before go-live that this will happen. Then
   review them in Automation → Publishing and re-approve. For an `uncertain`
   post, check the platform first and only confirm "not live" if it isn't
   there.

8. **Platform admin.** Make sure the operator's account has
   `users.is_platform_admin = true` (it is the recovery path for ownership
   and invites). This can only be set from the Supabase **SQL editor**
   (role `postgres`): the `users_protect_platform_admin` trigger blocks it
   from the app, and it also refuses a plain UPDATE in the editor (there is
   no signed-in admin there). Lift the trigger for this one statement, in one
   transaction, and replace the email:

   ```sql
   begin;
   alter table public.users disable trigger users_protect_platform_admin;
   update public.users
   set is_platform_admin = true
   where id = (
     select id from auth.users
     where lower(email) = lower('operator@example.com')
   );
   alter table public.users enable trigger users_protect_platform_admin;
   commit;

   -- Check: exactly one row, true.
   select u.id, a.email, u.is_platform_admin
   from public.users u join auth.users a on a.id = u.id
   where lower(a.email) = lower('operator@example.com');
   ```

9. **AI spending limits.** Every paid AI call (all `/api/ai/*` routes and
   the automation engine) now reserves an estimated cost against the
   business budget before calling the provider. (The Automation page's
   OpenAI check is a free models-list call, cached for 10 minutes.)
   - Each business gets **£50 per calendar month** (business time zone) and
     **20 AI images per day** by default. Only the **platform admin** changes
     them, in Settings → AI usage (every business shares the operator's
     OpenAI key); owners, managers and staff see them read-only.
   - The `/api/ai/*` routes declare `maxDuration = 300` seconds. On Vercel,
     check the plan allows it.
   - **Confirm the price table** in `src/lib/ai/spend/prices.ts` against the
     provider's current pricing page before go-live. The values are
     estimates, and the image-model prices are guesses (see the file). A
     model that is not in the table is refused, so add a price before
     switching models.
   - Amounts shown in the app are estimates, not the provider's bill. Keep a
     provider-side budget alert as well.

10. **Re-enable cron.** Enable the `publish-cron` workflow again
   (`CRON_SECRET` repo secret and `APP_URL` variable set). Automation runs
   each business at most hourly, up to 5 per call, and catches up after
   missed triggers.

11. **Manual browser checklist (production):**
    - [ ] Sign in.
    - [ ] Forgot password → email → reset → sign in with the new password.
    - [ ] Invite a new user (email arrives, they accept, they set a password).
    - [ ] Invite an existing user; accept while signed in as the wrong
      account is refused.
    - [ ] Resend and revoke an invite.
    - [ ] Make owner (transfer ownership).
    - [ ] On approved content: an alt-text edit keeps it approved; a caption
      edit sends it back to review and holds its queued posts.
    - [ ] Schedule field shows the business time-zone label; pick a date near
      a clock change and check the saved time.
    - [ ] Publish now.
    - [ ] The uncertain-retry confirmation appears and is required.
    - [ ] Switching the Facebook Page / Instagram account shows the hold
      message.
    - [ ] The Spend limits form saves.
    - [ ] Settings → AI usage shows this month's spend (estimated and
      actual) and today's image count; the limits save as the platform admin
      and are read-only for everyone else.
    - [ ] One real publish to a dedicated test account.

## Remote Supabase

A dedicated remote project is recommended. The existing “All Hair & Beauty Salon” database is a separate product and must not be reused for this platform.

```bash
npx supabase link --project-ref <project-ref>
npx supabase db push
```

## Tests (local only)

All database tests run against the local stack on this project's ports
(55421 API / 55422 DB / 55424 Mailpit) and refuse anything else.

```bash
npm run db:start && npm run db:reset
npm run test:integration   # real server actions + local Supabase, providers mocked
npm run test:rls
npm run test:pglite        # in-process Postgres fallback for the migrations
npm run test:timezone
npm run test:publishing && npm run test:meta && npm run test:meta-suite
```

## Scripts

```bash
npm run dev
npm run build
npm run lint
npx supabase start
npx supabase stop
npx supabase db reset
```

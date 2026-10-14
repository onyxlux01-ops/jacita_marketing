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

## Deploying (live project)

Apply migrations **in filename order** (`supabase db push` does this). Notes:

- `20261014090000_explicit_service_role_grants` must run before the later
  2026-10-14 migrations; it is a no-op where Supabase's legacy default grants
  already exist.
- `20261014110000` (new enum value `held`) and
  `20261014130000` (`uncertain`) are separate migrations on purpose: a new
  enum value cannot be used in the transaction that adds it.
- `20261014100000_membership_roles_hardening` stops if any business has more
  than one owner; `20261014160000` stops if a post/account pair already has
  two processing/uncertain jobs. Resolve those rows by hand first.
- After `20261014180000_invites_accept`, scripts that inserted members with
  the service role (e.g. `scripts/seed-business-profiles-remote.mjs`) no
  longer work; use invites.
- Dashboard settings the migrations cannot change:
  - Authentication → Sign In / Providers → Email: **disable "Allow new users
    to sign up"** (keep the Email provider enabled; invites and recovery need it).
  - Authentication → URL Configuration: add `<APP_URL>/invite/**` and
    `<APP_URL>/auth/callback` to the redirect URLs.
- Set `NEXT_PUBLIC_APP_URL` to the deployed URL: invite links are built from
  it (never from request headers).
- Cron: the GitHub workflow calls `/api/cron/publish-due` and
  `/api/cron/automation` every 5 minutes (`CRON_SECRET` repo secret,
  `APP_URL` variable). Automation runs each business at most hourly and
  catches up after missed triggers; `vercel.json` keeps daily backup calls.

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

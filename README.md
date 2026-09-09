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
| `/` | Marketing landing |
| `/login`, `/signup` | Auth |
| `/app` | Business dashboard |
| `/app/content` | Content workflow (draft → review → approved → scheduled → published) |
| `/app/content/new` | AI content generation |
| `/app/calendar` | Content calendar |
| `/app/media` | Per-org media library (Storage) |
| `/app/services` | Products / services catalogue |
| `/app/campaigns` | Campaigns |
| `/app/analytics` | Metrics (demo/live-ready schema) |
| `/app/social` | Social account connection UI (OAuth later) |
| `/app/settings` | Business + brand profile |
| `/app/onboarding` | Create a business |
| `/platform` | Platform admin foundation |

## Security notes

- Never put `SUPABASE_SERVICE_ROLE_KEY` or `OPENAI_API_KEY` in client code.
- OAuth tokens for social platforms are not stored in plaintext; `token_vault_ref` is reserved for Vault.
- Storage objects live under `{organisation_id}/…` with RLS on the first path segment.
- Version 1 does **not** auto-publish. Publishing integrations can be added later (Manual / Approval Required / Autopilot modes already exist on organisations).

## Remote Supabase

A dedicated remote project is recommended. The existing “All Hair & Beauty Salon” database is a separate product and must not be reused for this platform.

```bash
npx supabase link --project-ref <project-ref>
npx supabase db push
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
